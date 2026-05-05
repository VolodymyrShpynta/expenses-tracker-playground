/**
 * Stable per-device user identity.
 *
 * Mobile is offline-first and has no Keycloak. Until the user signs into
 * Google Drive / OneDrive (which provides a real `sub` claim we can adopt),
 * every device generates a UUID on first launch and persists it in
 * `expo-secure-store` (Keychain / Keystore). All commands and queries are
 * scoped to this id, so reinstalling the app starts a fresh local store
 * — same behavior the backend provides per Keycloak user.
 *
 * The id is intentionally **not** kept in `AsyncStorage` to match the
 * mobile-module security rule ("never AsyncStorage for identity-bearing
 * material" — see `.github/instructions/expenses-tracker-mobile.instructions.md`).
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const USER_ID_KEY = 'expenses-tracker-user-id';

/**
 * Returns the stored user id, generating and persisting a new one on
 * first call. Safe to call concurrently — the underlying SecureStore
 * APIs serialize writes per key.
 */
export async function getOrCreateUserId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(USER_ID_KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(USER_ID_KEY, fresh);
  return fresh;
}
