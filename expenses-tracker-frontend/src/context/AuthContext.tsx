import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type Keycloak from 'keycloak-js';
import keycloak from '../config/keycloak';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

interface AuthContextValue {
  keycloak: Keycloak;
  userId: string;
  username: string;
  token: string;
  logout: () => void;
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
  const initCalled = useRef(false);

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
    logout: () => keycloak.logout({ redirectUri: window.location.origin }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
