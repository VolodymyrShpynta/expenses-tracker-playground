# Azure Deployment Guide

This guide walks you through deploying the **Expenses Tracker** application to **Azure** using:

- **Azure Container Apps** — for the backend API and frontend
- **Azure Database for PostgreSQL** — managed database
- **Azure Container Apps (Keycloak)** — identity provider

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Azure Container Apps Environment              │
│                                                                  │
│  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  expenses-       │  │  expenses-api   │  │  keycloak       │  │
│  │  frontend        │  │  (Spring Boot)  │  │  (Auth IdP)     │  │
│  │  (nginx + React) │  │  Port 8080      │  │  Port 8180      │  │
│  │  Port 80         │  │                 │  │                 │  │
│  │  External ingress│  │  Internal       │  │  External       │  │
│  └────────┬─────────┘  └───────┬─────────┘  └────────┬────────┘  │
│           │  /api/* proxy      │                     │           │
│           └────────────────────┘                     │           │
│           │  /auth/* proxy                           │           │
│           └──────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Azure Database    │
                    │  for PostgreSQL    │
                    │  (Flexible Server) │
                    └────────────────────┘
```

**Key design decisions:**

- The **frontend** (nginx) serves as the public entry point and reverse-proxies `/api/*` to the backend and `/auth/*` to
  Keycloak
- The **backend API** uses internal ingress (not exposed to internet) — only reachable via the frontend proxy
- **Keycloak** has external ingress for admin console access, but all user-facing authentication flows go through the
  frontend nginx proxy (`/auth/*`). Keycloak runs with context path `/auth` (`KC_HTTP_RELATIVE_PATH=/auth`) and a pinned
  `KC_HOSTNAME` pointing to the frontend proxy URL — this ensures consistent JWT issuer claims and prevents header
  spoofing.
- **PostgreSQL** is a managed Azure service, shared by the backend API and Keycloak

## Prerequisites

- **Azure Account**: [Create a free account](https://azure.microsoft.com/free/)
- **Azure CLI**: [Install Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli)
- **Docker**: Already installed for local development
- **Built artifacts**:
  ```powershell
  # Build backend JAR
  .\gradlew.bat :expenses-tracker-api:bootJar

  # Build frontend (Docker will do this, but verify it works)
  cd expenses-tracker-frontend; npm run build; cd ..
  ```

## Configuration Variables

**⚠️ IMPORTANT**: Set these variables once at the beginning. All commands in this guide use these variables.

Copy and execute this entire block in your PowerShell terminal:

```powershell
# ====================================
# Azure Configuration Variables
# ====================================
# Customize these values for your deployment

# Azure Resource Configuration
$resourceGroup = "expenses-tracker-rg"
$location = "northeurope"  # Options: eastus, westeurope, northeurope, westus2, etc.

# Azure Container Registry (must be globally unique, lowercase, alphanumeric only, 5-50 chars)
$acrName = "yourexpensestracker"  # ⚠️ Change this to YOUR unique name

# Azure Container Apps
$envName = "expenses-tracker-env"
$apiAppName = "expenses-api"
$frontendAppName = "expenses-frontend"
$keycloakAppName = "expenses-keycloak"

# Database Configuration
$dbServerName = "expenses-tracker-db"  # Must be globally unique
$dbName = "expenses_db"
$dbAdminUser = "expensesadmin"
$dbAdminPassword = "YourSecurePassword123!"  # ⚠️ Change this!

# Keycloak Admin
$kcAdminUser = "admin"
$kcAdminPassword = "KcAdminSecure456!"  # ⚠️ Change this!

Write-Host "✅ Variables configured successfully!" -ForegroundColor Green
Write-Host "ACR Name: $acrName" -ForegroundColor Yellow
Write-Host "Resource Group: $resourceGroup" -ForegroundColor Yellow
Write-Host "Location: $location" -ForegroundColor Yellow
Write-Host "DB Server: $dbServerName" -ForegroundColor Yellow
```

**After running this block, you can copy-paste any command from this guide without modification!**

## Table of Contents

- [Step 1: Install and Login to Azure CLI](#step-1-install-and-login-to-azure-cli)
- [Step 2: Create Azure Resources](#step-2-create-azure-resources)
- [Step 3: Create Azure Database for PostgreSQL](#step-3-create-azure-database-for-postgresql)
- [Step 4: Build and Push Docker Images](#step-4-build-and-push-docker-images)
- [Step 5: Deploy Keycloak](#step-5-deploy-keycloak)
- [Step 6: Configure Keycloak Realm](#step-6-configure-keycloak-realm)
- [Step 7: Deploy Backend API](#step-7-deploy-backend-api)
- [Step 8: Deploy Frontend](#step-8-deploy-frontend)
- [Step 9: Verify Deployment](#step-9-verify-deployment)
- [Update Existing Deployment](#update-existing-deployment)
- [Monitoring and Logs](#monitoring-and-logs)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)
- [Clean Up Resources](#clean-up-resources)

---

## Step 1: Install and Login to Azure CLI

### Install Azure CLI

**Windows (Winget)**:

```powershell
winget install -e --id Microsoft.AzureCLI
```

**macOS**:

```bash
brew install azure-cli
```

**Linux (Ubuntu/Debian)**:

```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

### Login to Azure

```powershell
# Standard login (opens browser)
az login

# If MFA required, use device code flow
az login --use-device-code
```

### Verify Subscription

```powershell
az account show
az account list --output table

# Set default subscription (if multiple)
az account set --subscription "Your Subscription Name"
```

---

## Step 2: Create Azure Resources

### Create Resource Group

```powershell
az group create --name $resourceGroup --location $location
```

### Create Azure Container Registry

```powershell
az acr create `
  --resource-group $resourceGroup `
  --name $acrName `
  --sku Basic `
  --admin-enabled true

az acr login --name $acrName
```

### Create Container Apps Environment

```powershell
az containerapp env create `
  --name $envName `
  --resource-group $resourceGroup `
  --location $location
```

This takes about 2–3 minutes.

---

## Step 3: Create Azure Database for PostgreSQL

### Create Flexible Server

```powershell
az postgres flexible-server create `
  --resource-group $resourceGroup `
  --name $dbServerName `
  --location $location `
  --admin-user $dbAdminUser `
  --admin-password $dbAdminPassword `
  --sku-name Standard_B1ms `
  --storage-size 32 `
  --version 17 `
  --yes
```

### Create Database

```powershell
az postgres flexible-server db create `
  --resource-group $resourceGroup `
  --server-name $dbServerName `
  --database-name $dbName
```

### Allow Azure Services to Connect

```powershell
# Allow Azure services (Container Apps) to reach the database
az postgres flexible-server firewall-rule create `
  --resource-group $resourceGroup `
  --name $dbServerName `
  --rule-name AllowAzureServices `
  --start-ip-address 0.0.0.0 `
  --end-ip-address 0.0.0.0
```

### Create Keycloak Schema

Keycloak stores its tables in a separate `keycloak` schema (`KC_DB_SCHEMA=keycloak`). This schema must exist before
Keycloak starts:

```powershell
az postgres flexible-server execute `
  --name $dbServerName `
  --admin-user $dbAdminUser `
  --admin-password $dbAdminPassword `
  --database-name $dbName `
  --querytext "CREATE SCHEMA IF NOT EXISTS keycloak;"
```

### Get Database Connection Details

```powershell
$dbHost = "$dbServerName.postgres.database.azure.com"
$dbJdbcUrl = "jdbc:postgresql://${dbHost}:5432/${dbName}?sslmode=require"
$dbR2dbcUrl = "r2dbc:postgresql://${dbHost}:5432/${dbName}?sslMode=require"

Write-Host "JDBC URL: $dbJdbcUrl" -ForegroundColor Yellow
Write-Host "R2DBC URL: $dbR2dbcUrl" -ForegroundColor Yellow
```

---

## Step 4: Build and Push Docker Images

### Build Backend

```powershell
# Build the Spring Boot JAR
.\gradlew.bat :expenses-tracker-api:bootJar

# Build Docker image
docker build -t expenses-api:latest ./expenses-tracker-api

# Tag and push to ACR
docker tag expenses-api:latest "$acrName.azurecr.io/expenses-api:latest"
docker push "$acrName.azurecr.io/expenses-api:latest"
```

### Build Frontend

The frontend nginx.conf references container names (`expenses-api`, `keycloak`) which won't work in Azure Container
Apps. We need a modified nginx.conf for Azure. Create it before building:

```powershell
# We'll update nginx.conf after we know the service URLs.
# For now, build and push the image — we'll handle nginx config in Step 8.
docker build -t expenses-frontend:latest ./expenses-tracker-frontend
docker tag expenses-frontend:latest "$acrName.azurecr.io/expenses-frontend:latest"
docker push "$acrName.azurecr.io/expenses-frontend:latest"
```

### Verify Images in ACR

```powershell
az acr repository list --name $acrName --output table
```

---

## Step 5: Deploy Keycloak

### Get ACR Credentials

```powershell
$acrPassword = az acr credential show --name $acrName --query "passwords[0].value" -o tsv
```

### Deploy Keycloak Container

```powershell
az containerapp create `
  --name $keycloakAppName `
  --resource-group $resourceGroup `
  --environment $envName `
  --image quay.io/keycloak/keycloak:26.2 `
  --target-port 8080 `
  --ingress external `
  --cpu 1.0 `
  --memory 2.0Gi `
  --min-replicas 1 `
  --max-replicas 1 `
  --args "start" `
  --env-vars `
    KC_DB=postgres `
    KC_DB_URL="$dbJdbcUrl" `
    KC_DB_USERNAME="$dbAdminUser" `
    KC_DB_PASSWORD="$dbAdminPassword" `
    KC_DB_SCHEMA=keycloak `
    KC_HTTP_RELATIVE_PATH=/auth `
    KC_HOSTNAME=PLACEHOLDER `
    KC_HTTP_ENABLED=true `
    KC_BOOTSTRAP_ADMIN_USERNAME="$kcAdminUser" `
    KC_BOOTSTRAP_ADMIN_PASSWORD="$kcAdminPassword"
```

> **Note:** In production, Keycloak uses `start` (not `start-dev`).
> `KC_HOSTNAME` is set to `PLACEHOLDER` for now — it will be updated to the frontend proxy URL
> (`https://$frontendFqdn/auth`) in Step 8 once the frontend URL is known. This pins all
> Keycloak-generated URLs (token issuer, discovery endpoints) to the frontend proxy origin,
> preventing header-spoofing attacks and issuer mismatches.
> `KC_HTTP_ENABLED=true` is needed because Azure Container Apps terminates TLS at the ingress level.
> `KC_HTTP_RELATIVE_PATH=/auth` sets the context path — all Keycloak endpoints are under `/auth/`.

### Get Keycloak URL

```powershell
$keycloakFqdn = az containerapp show `
  --name $keycloakAppName `
  --resource-group $resourceGroup `
  --query properties.configuration.ingress.fqdn -o tsv

$keycloakUrl = "https://$keycloakFqdn"
Write-Host "Keycloak URL: $keycloakUrl" -ForegroundColor Green
Write-Host "Admin Console: $keycloakUrl/auth/admin" -ForegroundColor Green
```

Wait for Keycloak to be ready (1–2 minutes), then open `$keycloakUrl/auth/admin` and log in with the admin credentials.

---

## Step 6: Configure Keycloak Realm

Since realm import doesn't work with `start` mode in production, configure the realm manually via the Keycloak Admin
Console.

### Open Admin Console

```powershell
Start-Process "$keycloakUrl/auth/admin"
```

Log in with `$kcAdminUser` / `$kcAdminPassword`.

### Create Realm

1. Click the realm dropdown (top-left, shows "master") → **Create realm**
2. **Realm name**: `expenses-tracker`
3. Click **Create**

### Create Frontend Client

1. Go to **Clients** → **Create client**
2. **Client ID**: `expenses-frontend`
3. **Client type**: OpenID Connect
4. Click **Next**
5. **Client authentication**: OFF (public client)
6. **Standard flow**: ✅ Enabled
7. **Direct access grants**: ❌ Disabled
8. Click **Next**
9. Set URLs (replace `YOUR_FRONTEND_URL` with the actual frontend URL from Step 8):
    - **Root URL**: (leave empty)
    - **Valid redirect URIs**: `https://YOUR_FRONTEND_URL/*`
    - **Web origins**: `https://YOUR_FRONTEND_URL`
10. Click **Save**
11. Go to **Advanced** tab → **Proof Key for Code Exchange**: `S256`
12. Click **Save**

> **Note:** You'll update the redirect URIs after Step 8 when you know the frontend URL.

### Create API Client

1. Go to **Clients** → **Create client**
2. **Client ID**: `expenses-api`
3. **Client type**: OpenID Connect
4. Click **Next**
5. **Client authentication**: ON (confidential, bearer-only)
6. **Standard flow**: ❌ Disabled
7. **Direct access grants**: ❌ Disabled
8. Click **Save**

### Enable Self-Registration

1. Go to **Realm settings** → **Login** tab
2. **User registration**: ✅ ON
3. Click **Save**

### Create Test User (Optional)

1. Go to **Users** → **Add user**
2. **Username**: `testuser`
3. **Email**: `testuser@example.com`
4. **Email verified**: ✅
5. Click **Create**
6. Go to **Credentials** tab → **Set password**: `password`, **Temporary**: OFF

---

## Step 7: Deploy Backend API

### Set Secrets

```powershell
az containerapp secret set `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --secrets `
    db-password="$dbAdminPassword"
```

> **Note:** We create the app in the next command. If the secret command fails because the app
> doesn't exist yet, skip it and use `--env-vars` with the password directly in the create command,
> then convert to secrets afterward.

### Deploy API Container

```powershell
$keycloakJwkSetUri = "$keycloakUrl/auth/realms/expenses-tracker/protocol/openid-connect/certs"

az containerapp create `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --environment $envName `
  --image "$acrName.azurecr.io/expenses-api:latest" `
  --target-port 8080 `
  --ingress internal `
  --registry-server "$acrName.azurecr.io" `
  --registry-username $acrName `
  --registry-password $acrPassword `
  --cpu 0.5 `
  --memory 1.0Gi `
  --min-replicas 1 `
  --max-replicas 3 `
  --env-vars `
    EXPENSES_TRACKER_R2DBC_URL="$dbR2dbcUrl" `
    EXPENSES_TRACKER_R2DBC_USERNAME="$dbAdminUser" `
    EXPENSES_TRACKER_R2DBC_PASSWORD="$dbAdminPassword" `
    EXPENSES_TRACKER_FLYWAY_JDBC_URL="$dbJdbcUrl" `
    EXPENSES_TRACKER_FLYWAY_USERNAME="$dbAdminUser" `
    EXPENSES_TRACKER_FLYWAY_PASSWORD="$dbAdminPassword" `
    KEYCLOAK_ISSUER_URI="PLACEHOLDER" `
    KEYCLOAK_JWK_SET_URI="$keycloakJwkSetUri" `
    SYNC_FILE_PATH="/app/sync-data/sync.json" `
    SYNC_FILE_COMPRESSION_ENABLED=true
```

> **Note:** The API uses **internal ingress** — it's only accessible from within the Container Apps
> environment (via the frontend proxy). Not exposed to the internet.
>
> `KEYCLOAK_ISSUER_URI` is set to `"PLACEHOLDER"` for now because it must match the `iss` claim in
> browser-issued JWTs. Since browsers authenticate through the frontend nginx proxy (`/auth/*`),
> the issuer will be `https://$frontendFqdn/auth/realms/expenses-tracker` — but we don't know
> the frontend URL until Step 8. We'll update this in Step 9.
>
> `KEYCLOAK_JWK_SET_URI` uses the Keycloak external URL directly (container-to-container call for
> fetching public keys) and can be set immediately.

### Get API Internal URL

```powershell
$apiFqdn = az containerapp show `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --query properties.configuration.ingress.fqdn -o tsv

Write-Host "API Internal FQDN: $apiFqdn" -ForegroundColor Yellow
```

---

## Step 8: Deploy Frontend

The frontend nginx needs to know the internal hostnames of the API and Keycloak. In Azure Container Apps, services
within the same environment can communicate using their internal FQDNs.

### Create Azure-Specific nginx.conf

Create a file `nginx-azure.conf` in the project root:

```powershell
$apiFqdn = az containerapp show --name $apiAppName --resource-group $resourceGroup --query properties.configuration.ingress.fqdn -o tsv
$keycloakFqdn = az containerapp show --name $keycloakAppName --resource-group $resourceGroup --query properties.configuration.ingress.fqdn -o tsv

@"
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # Proxy API requests to the backend (internal ingress)
    location /api/ {
        proxy_pass http://${apiFqdn};
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Proxy Keycloak auth requests (preserve /auth/ prefix — Keycloak context path)
    location /auth/ {
        proxy_pass https://${keycloakFqdn};
        proxy_set_header Host $keycloakFqdn;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_ssl_server_name on;
    }

    # Proxy actuator requests to the backend
    location /actuator/ {
        proxy_pass http://${apiFqdn};
        proxy_set_header Host `$host;
    }

    # Serve static files; fall back to index.html for client-side routing
    location / {
        try_files `$uri `$uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
"@ | Out-File -FilePath "expenses-tracker-frontend/nginx-azure.conf" -Encoding UTF8
```

### Build and Push Frontend with Azure Config

```powershell
# Create a Dockerfile variant for Azure that uses the Azure nginx config
@"
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-azure.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
"@ | Out-File -FilePath "expenses-tracker-frontend/Dockerfile.azure" -Encoding UTF8

# Build and push
docker build -f expenses-tracker-frontend/Dockerfile.azure -t expenses-frontend:azure ./expenses-tracker-frontend
docker tag expenses-frontend:azure "$acrName.azurecr.io/expenses-frontend:latest"
docker push "$acrName.azurecr.io/expenses-frontend:latest"
```

### Deploy Frontend Container

```powershell
az containerapp create `
  --name $frontendAppName `
  --resource-group $resourceGroup `
  --environment $envName `
  --image "$acrName.azurecr.io/expenses-frontend:latest" `
  --target-port 80 `
  --ingress external `
  --registry-server "$acrName.azurecr.io" `
  --registry-username $acrName `
  --registry-password $acrPassword `
  --cpu 0.25 `
  --memory 0.5Gi `
  --min-replicas 1 `
  --max-replicas 3
```

### Get Frontend URL

```powershell
$frontendFqdn = az containerapp show `
  --name $frontendAppName `
  --resource-group $resourceGroup `
  --query properties.configuration.ingress.fqdn -o tsv

$frontendUrl = "https://$frontendFqdn"
Write-Host "Frontend URL: $frontendUrl" -ForegroundColor Green
```

### Update Keycloak Client Redirect URIs

Now that you know the frontend URL, update the Keycloak client configuration:

1. Open Keycloak Admin Console: `Start-Process "$keycloakUrl/auth/admin"`
2. Select the **expenses-tracker** realm
3. Go to **Clients** → **expenses-frontend**
4. Update:
    - **Valid redirect URIs**: `https://YOUR_FRONTEND_FQDN/*`
    - **Web origins**: `https://YOUR_FRONTEND_FQDN`
5. Click **Save**

### Update Keycloak Hostname and API Issuer URI

Both Keycloak's `KC_HOSTNAME` and the API's `KEYCLOAK_ISSUER_URI` were set to placeholders in
Steps 5 and 7. Now that the frontend URL is known, update them:

```powershell
$keycloakIssuerUri = "https://$frontendFqdn/auth/realms/expenses-tracker"

# Pin Keycloak's public URL to the frontend proxy
az containerapp update `
  --name $keycloakAppName `
  --resource-group $resourceGroup `
  --set-env-vars KC_HOSTNAME="https://$frontendFqdn/auth"

# Set the API's issuer URI to match Keycloak's pinned hostname
az containerapp update `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --set-env-vars KEYCLOAK_ISSUER_URI="$keycloakIssuerUri"
```

> **Why pin `KC_HOSTNAME`?** With a pinned hostname, Keycloak ignores forwarded headers and always
> generates URLs with the frontend proxy origin. This prevents header-spoofing attacks and ensures
> JWT `iss` claims are consistent regardless of how Keycloak is accessed (via Nginx proxy or
> directly via its external ingress for admin). The API's `KEYCLOAK_ISSUER_URI` must match.

### Update Backend CORS (If Needed)

The current `SecurityConfig.kt` only allows `localhost` origins. For Azure, the frontend proxies
all requests through nginx (same origin), so CORS is not needed. If you later call the API directly
from a different origin, add it to `SecurityConfig`.

---

## Step 9: Verify Deployment

### Open the Application

```powershell
Start-Process $frontendUrl
```

You should be redirected to Keycloak for login (URL stays on the frontend domain, proxied through `/auth/*`). Use the
test user (`testuser` / `password`) or register a new account.

### Test Health Endpoint

```powershell
# Test API health (through frontend proxy)
curl "$frontendUrl/actuator/health"
```

### Test API (With Token)

```powershell
# Get a token via Keycloak (through frontend proxy)
$tokenResponse = curl -s -X POST "$frontendUrl/auth/realms/expenses-tracker/protocol/openid-connect/token" `
  -H "Content-Type: application/x-www-form-urlencoded" `
  -d "grant_type=password&client_id=expenses-frontend&username=testuser&password=password"

# Extract access token (requires jq or manual parsing)
# Then test:
curl "$frontendUrl/api/expenses" -H "Authorization: Bearer <TOKEN>"
```

---

## Update Existing Deployment

### Update Backend

```powershell
# 1. Rebuild JAR
.\gradlew.bat :expenses-tracker-api:bootJar

# 2. Rebuild and push Docker image
docker build -t expenses-api:latest ./expenses-tracker-api
docker tag expenses-api:latest "$acrName.azurecr.io/expenses-api:latest"
docker push "$acrName.azurecr.io/expenses-api:latest"

# 3. Update Container App (triggers zero-downtime rolling update)
az containerapp update `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --image "$acrName.azurecr.io/expenses-api:latest"
```

### Update Frontend

```powershell
# 1. Rebuild and push
docker build -f expenses-tracker-frontend/Dockerfile.azure -t expenses-frontend:azure ./expenses-tracker-frontend
docker tag expenses-frontend:azure "$acrName.azurecr.io/expenses-frontend:latest"
docker push "$acrName.azurecr.io/expenses-frontend:latest"

# 2. Update Container App
az containerapp update `
  --name $frontendAppName `
  --resource-group $resourceGroup `
  --image "$acrName.azurecr.io/expenses-frontend:latest"
```

### Update Environment Variables Only

```powershell
az containerapp update `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --set-env-vars KEY=VALUE
```

---

## Monitoring and Logs

### View Live Logs

```powershell
# Backend API logs
az containerapp logs show --name $apiAppName --resource-group $resourceGroup --follow

# Frontend logs
az containerapp logs show --name $frontendAppName --resource-group $resourceGroup --follow

# Keycloak logs
az containerapp logs show --name $keycloakAppName --resource-group $resourceGroup --follow

# Recent logs (last 50 lines)
az containerapp logs show --name $apiAppName --resource-group $resourceGroup --tail 50
```

### View Container Details

```powershell
# Show all services
az containerapp list --resource-group $resourceGroup --output table

# Show environment variables
az containerapp show --name $apiAppName --resource-group $resourceGroup `
  --query properties.template.containers[0].env

# Check revision history
az containerapp revision list --name $apiAppName --resource-group $resourceGroup --output table
```

### Scale Configuration

```powershell
# Adjust scaling
az containerapp update `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --min-replicas 0 `
  --max-replicas 5
```

### Rollback to Previous Revision

```powershell
# List revisions
az containerapp revision list --name $apiAppName --resource-group $resourceGroup --output table

# Activate a previous revision
az containerapp revision activate `
  --name $apiAppName `
  --resource-group $resourceGroup `
  --revision REVISION_NAME
```

---

## Troubleshooting

### Common Issues

| Issue                         | Solution                                                                                                             |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------|
| **Keycloak won't start**      | Check DB connectivity: `az containerapp logs show --name expenses-keycloak ...`                                      |
| **API returns 401**           | Verify `KEYCLOAK_ISSUER_URI` matches the frontend proxy URL (`$frontendUrl/auth/realms/...`); check JWT issuer claim |
| **Frontend shows blank page** | Check nginx-azure.conf proxy targets; verify API and Keycloak FQDNs                                                  |
| **DB connection refused**     | Ensure firewall rule allows Azure services (`0.0.0.0`); check SSL mode                                               |
| **Login redirects fail**      | Update Keycloak client redirect URIs to match the actual frontend URL                                                |
| **502 Bad Gateway on /api**   | API might still be starting; check API logs and health endpoint                                                      |
| **ACR name already taken**    | ACR names are globally unique; add your initials or a random suffix                                                  |
| **Keycloak split-DNS issue**  | Ensure `KC_HOSTNAME` is pinned to the frontend proxy URL (`https://$frontendFqdn/auth`)                              |

### Debug Commands

```powershell
# Check service status
az containerapp show --name $apiAppName --resource-group $resourceGroup `
  --query properties.runningStatus

# Check ingress configuration
az containerapp show --name $apiAppName --resource-group $resourceGroup `
  --query properties.configuration.ingress

# Test database connection
az postgres flexible-server connect `
  --name $dbServerName `
  --admin-user $dbAdminUser `
  --admin-password $dbAdminPassword `
  --database-name $dbName `
  --querytext "SELECT 1;"
```

---

## Cost Optimization

### Estimated Monthly Costs

| Resource                                    | SKU           | Estimated Cost    |
|---------------------------------------------|---------------|-------------------|
| PostgreSQL Flexible Server                  | Standard_B1ms | ~$13/month        |
| Container App: API (0.5 vCPU, 1 GB)         | Consumption   | ~$12–15/month     |
| Container App: Frontend (0.25 vCPU, 0.5 GB) | Consumption   | ~$6–8/month       |
| Container App: Keycloak (1 vCPU, 2 GB)      | Consumption   | ~$25–30/month     |
| Container Registry (Basic)                  | Basic         | ~$5/month         |
| **Total**                                   |               | **~$60–70/month** |

### Cost-Saving Tips

1. **Scale to zero** (non-production): `--min-replicas 0` for API and frontend
2. **Reduce Keycloak resources**: Use `--cpu 0.5 --memory 1.0Gi` for low-traffic deployments
3. **Use B1ms for PostgreSQL**: Smallest burstable tier, sufficient for small workloads
4. **Share the database**: Keycloak and the API already share one PostgreSQL instance (separate schemas)
5. **Stop when not needed**: `az containerapp update --name $appName ... --min-replicas 0 --max-replicas 0`
6. **Free tier**: Azure Container Apps includes 180,000 vCPU-seconds and 360,000 GiB-seconds free per month

### Development/Staging Savings

For a dev/staging environment, scale all services to minimum:

```powershell
# Scale API to zero when idle
az containerapp update --name $apiAppName --resource-group $resourceGroup `
  --min-replicas 0 --max-replicas 2 --cpu 0.25 --memory 0.5Gi

# Scale frontend to zero when idle
az containerapp update --name $frontendAppName --resource-group $resourceGroup `
  --min-replicas 0 --max-replicas 2 --cpu 0.25 --memory 0.5Gi

# Keycloak should stay running (handles login flows)
az containerapp update --name $keycloakAppName --resource-group $resourceGroup `
  --min-replicas 1 --max-replicas 1 --cpu 0.5 --memory 1.0Gi
```

---

## Clean Up Resources

### Delete Everything

```powershell
# Delete entire resource group (removes ALL resources)
az group delete --name $resourceGroup --yes --no-wait
```

### Delete Individual Resources

```powershell
# Delete Container Apps
az containerapp delete --name $frontendAppName --resource-group $resourceGroup --yes
az containerapp delete --name $apiAppName --resource-group $resourceGroup --yes
az containerapp delete --name $keycloakAppName --resource-group $resourceGroup --yes

# Delete Container Apps environment
az containerapp env delete --name $envName --resource-group $resourceGroup --yes

# Delete database
az postgres flexible-server delete --name $dbServerName --resource-group $resourceGroup --yes

# Delete Container Registry
az acr delete --name $acrName --resource-group $resourceGroup --yes

# Delete resource group (if empty)
az group delete --name $resourceGroup --yes
```

---

## Complete Deployment Script

Here's the full script for copy-paste deployment:

```powershell
# ====================================
# Expenses Tracker — Azure Deployment
# ====================================

# ----- CONFIGURE THESE -----
$resourceGroup = "expenses-tracker-rg"
$location = "northeurope"
$acrName = "yourexpensestracker"          # ⚠️ Must be globally unique
$envName = "expenses-tracker-env"
$apiAppName = "expenses-api"
$frontendAppName = "expenses-frontend"
$keycloakAppName = "expenses-keycloak"
$dbServerName = "expenses-tracker-db"     # ⚠️ Must be globally unique
$dbName = "expenses_db"
$dbAdminUser = "expensesadmin"
$dbAdminPassword = "YourSecurePassword123!"  # ⚠️ Change this!
$kcAdminUser = "admin"
$kcAdminPassword = "KcAdminSecure456!"       # ⚠️ Change this!
# ----------------------------

# 1. Login
az login

# 2. Resource group
az group create --name $resourceGroup --location $location

# 3. Container Registry
az acr create --resource-group $resourceGroup --name $acrName --sku Basic --admin-enabled true
az acr login --name $acrName
$acrPassword = az acr credential show --name $acrName --query "passwords[0].value" -o tsv

# 4. Database
az postgres flexible-server create --resource-group $resourceGroup --name $dbServerName --location $location --admin-user $dbAdminUser --admin-password $dbAdminPassword --sku-name Standard_B1ms --storage-size 32 --version 17 --yes
az postgres flexible-server db create --resource-group $resourceGroup --server-name $dbServerName --database-name $dbName
az postgres flexible-server firewall-rule create --resource-group $resourceGroup --name $dbServerName --rule-name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# Create keycloak schema (required before Keycloak starts)
az postgres flexible-server execute --name $dbServerName --admin-user $dbAdminUser --admin-password $dbAdminPassword --database-name $dbName --querytext "CREATE SCHEMA IF NOT EXISTS keycloak;"

$dbHost = "$dbServerName.postgres.database.azure.com"
$dbJdbcUrl = "jdbc:postgresql://${dbHost}:5432/${dbName}?sslmode=require"
$dbR2dbcUrl = "r2dbc:postgresql://${dbHost}:5432/${dbName}?sslMode=require"

# 5. Container Apps environment
az containerapp env create --name $envName --resource-group $resourceGroup --location $location

# 6. Build and push images
.\gradlew.bat :expenses-tracker-api:bootJar
docker build -t expenses-api:latest ./expenses-tracker-api
docker tag expenses-api:latest "$acrName.azurecr.io/expenses-api:latest"
docker push "$acrName.azurecr.io/expenses-api:latest"

# 7. Deploy Keycloak
az containerapp create --name $keycloakAppName --resource-group $resourceGroup --environment $envName --image quay.io/keycloak/keycloak:26.2 --target-port 8080 --ingress external --cpu 1.0 --memory 2.0Gi --min-replicas 1 --max-replicas 1 --args "start" --env-vars KC_DB=postgres KC_DB_URL="$dbJdbcUrl" KC_DB_USERNAME="$dbAdminUser" KC_DB_PASSWORD="$dbAdminPassword" KC_DB_SCHEMA=keycloak KC_HTTP_RELATIVE_PATH=/auth KC_HOSTNAME=PLACEHOLDER KC_HTTP_ENABLED=true KC_BOOTSTRAP_ADMIN_USERNAME="$kcAdminUser" KC_BOOTSTRAP_ADMIN_PASSWORD="$kcAdminPassword"

$keycloakFqdn = az containerapp show --name $keycloakAppName --resource-group $resourceGroup --query properties.configuration.ingress.fqdn -o tsv
$keycloakUrl = "https://$keycloakFqdn"
Write-Host "Keycloak URL: $keycloakUrl" -ForegroundColor Green

# 8. Deploy API (internal ingress) — issuer-uri is a placeholder until frontend URL is known
$keycloakJwkSetUri = "$keycloakUrl/auth/realms/expenses-tracker/protocol/openid-connect/certs"

az containerapp create --name $apiAppName --resource-group $resourceGroup --environment $envName --image "$acrName.azurecr.io/expenses-api:latest" --target-port 8080 --ingress internal --registry-server "$acrName.azurecr.io" --registry-username $acrName --registry-password $acrPassword --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 3 --env-vars EXPENSES_TRACKER_R2DBC_URL="$dbR2dbcUrl" EXPENSES_TRACKER_R2DBC_USERNAME="$dbAdminUser" EXPENSES_TRACKER_R2DBC_PASSWORD="$dbAdminPassword" EXPENSES_TRACKER_FLYWAY_JDBC_URL="$dbJdbcUrl" EXPENSES_TRACKER_FLYWAY_USERNAME="$dbAdminUser" EXPENSES_TRACKER_FLYWAY_PASSWORD="$dbAdminPassword" KEYCLOAK_ISSUER_URI="PLACEHOLDER" KEYCLOAK_JWK_SET_URI="$keycloakJwkSetUri" SYNC_FILE_PATH="/app/sync-data/sync.json" SYNC_FILE_COMPRESSION_ENABLED=true

$apiFqdn = az containerapp show --name $apiAppName --resource-group $resourceGroup --query properties.configuration.ingress.fqdn -o tsv

# 9. Build and deploy frontend with Azure nginx config
# (See Step 8 above for nginx-azure.conf generation and Dockerfile.azure creation)
Write-Host ""
Write-Host "⚠️ Before deploying the frontend:" -ForegroundColor Yellow
Write-Host "  1. Generate nginx-azure.conf (see Step 8 in AZURE-DEPLOYMENT.md)" -ForegroundColor Yellow
Write-Host "  2. Create Dockerfile.azure (see Step 8)" -ForegroundColor Yellow
Write-Host "  3. Then run the frontend build and deploy commands" -ForegroundColor Yellow
Write-Host ""
Write-Host "API Internal FQDN: $apiFqdn" -ForegroundColor Cyan
Write-Host "Keycloak FQDN: $keycloakFqdn" -ForegroundColor Cyan

# After creating nginx-azure.conf and Dockerfile.azure:
# docker build -f expenses-tracker-frontend/Dockerfile.azure -t expenses-frontend:azure ./expenses-tracker-frontend
# docker tag expenses-frontend:azure "$acrName.azurecr.io/expenses-frontend:latest"
# docker push "$acrName.azurecr.io/expenses-frontend:latest"
# az containerapp create --name $frontendAppName --resource-group $resourceGroup --environment $envName --image "$acrName.azurecr.io/expenses-frontend:latest" --target-port 80 --ingress external --registry-server "$acrName.azurecr.io" --registry-username $acrName --registry-password $acrPassword --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 3

# 10. Get frontend URL, pin Keycloak hostname, and update API issuer URI
# $frontendFqdn = az containerapp show --name $frontendAppName --resource-group $resourceGroup --query properties.configuration.ingress.fqdn -o tsv
# $keycloakIssuerUri = "https://$frontendFqdn/auth/realms/expenses-tracker"
# az containerapp update --name $keycloakAppName --resource-group $resourceGroup --set-env-vars KC_HOSTNAME="https://$frontendFqdn/auth"
# az containerapp update --name $apiAppName --resource-group $resourceGroup --set-env-vars KEYCLOAK_ISSUER_URI="$keycloakIssuerUri"
# Write-Host "Application URL: https://$frontendFqdn" -ForegroundColor Green

# 11. Configure Keycloak realm (manual step — see Step 6 in AZURE-DEPLOYMENT.md)
Write-Host ""
Write-Host "✅ Infrastructure deployed!" -ForegroundColor Green
Write-Host "Next: Configure Keycloak realm (see Step 6 in AZURE-DEPLOYMENT.md)" -ForegroundColor Yellow
```

---

## Additional Resources

- [Azure Container Apps Documentation](https://docs.microsoft.com/azure/container-apps/)
- [Azure Database for PostgreSQL](https://docs.microsoft.com/azure/postgresql/)
- [Azure Container Registry Documentation](https://docs.microsoft.com/azure/container-registry/)
- [Keycloak on Azure](https://www.keycloak.org/getting-started/getting-started-docker)
- [Azure CLI Reference](https://docs.microsoft.com/cli/azure/)
- [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)
