import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type Keycloak from 'keycloak-js';
import keycloak from '../config/keycloak';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { PostErasureScreen } from '../components/privacy/PostErasureScreen';
import type { ErasureResultDto } from '../types/privacy';

interface AuthContextValue {
  keycloak: Keycloak;
  userId: string;
  username: string;
  token: string;
  /**
   * Realm roles exposed via the JWT's `realm_access.roles` claim.
   * Empty when the token has no `realm_access` block — never `undefined`,
   * so callers can iterate without null checks.
   */
  roles: string[];
  /** Convenience predicate for role-gated UI (sidebar items, route guards). */
  hasRole: (role: string) => boolean;
  logout: () => void;
  /**
   * Signal that the current user has just erased their own account.
   * Replaces the entire app subtree with [PostErasureScreen] so no
   * further routes render and no further API calls can be made — the
   * JWT is still cryptographically valid until it expires, so without
   * this lockout the user could keep writing to the database under
   * the now-orphan user id by simply navigating away from the
   * privacy page.
   */
  signalErasureComplete: (result: ErasureResultDto) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erasureResult, setErasureResult] = useState<ErasureResultDto | null>(null);
  const initCalled = useRef(false);

  const signalErasureComplete = useCallback((result: ErasureResultDto) => {
    setErasureResult(result);
  }, []);

  useEffect(() => {
    // Prevent double-init in React StrictMode (keycloak-js 26.x rejects a second init() call)
    if (initCalled.current) return;
    initCalled.current = true;

    keycloak
      .init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
      .then((authenticated) => {
        if (!authenticated) {
          keycloak.login();
          return;
        }
        setReady(true);
      })
      .catch((err) => {
        console.error('Keycloak init failed', err);
        setError('Authentication service unavailable. Please try again later.');
      });

    // Auto-refresh token before expiry
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        console.warn('Token refresh failed, redirecting to login');
        keycloak.login();
      });
    };
  }, []);

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', gap: 2 }}>
        <Typography color="error" variant="h6">{error}</Typography>
      </Box>
    );
  }

  if (!ready) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const value: AuthContextValue = {
    keycloak,
    userId: keycloak.subject ?? '',
    username: keycloak.tokenParsed?.preferred_username ?? keycloak.subject ?? '',
    token: keycloak.token ?? '',
    roles: extractRealmRoles(keycloak.tokenParsed),
    hasRole: (role: string) => extractRealmRoles(keycloak.tokenParsed).includes(role),
    logout: () => keycloak.logout({ redirectUri: window.location.origin }),
    signalErasureComplete,
  };

  return (
    <AuthContext.Provider value={value}>
      {erasureResult ? (
        <PostErasureScreen
          result={erasureResult}
          username={value.username}
          onLogout={value.logout}
        />
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

/**
 * Read the `realm_access.roles` array from the parsed JWT payload.
 * Keycloak emits this as `{ realm_access: { roles: ["user", "gdpr-admin"] } }`
 * when at least one realm role is granted. Returns an empty array when the
 * claim is absent or malformed so callers can iterate safely.
 */
function extractRealmRoles(tokenParsed: Keycloak['tokenParsed']): string[] {
  const realmAccess = (tokenParsed as { realm_access?: { roles?: unknown } } | undefined)?.realm_access;
  const roles = realmAccess?.roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}
