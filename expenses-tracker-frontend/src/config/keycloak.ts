import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: `${window.location.origin}/auth`,
  realm: 'expenses-tracker',
  clientId: 'expenses-frontend',
});

export default keycloak;
