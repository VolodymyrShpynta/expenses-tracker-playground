/**
 * Expo Router native-intent rewriter.
 *
 * Catches deep links **before** Expo Router resolves them to a screen.
 * Returning a different path here changes the route that the user will
 * see; returning the original `path` lets Expo Router route normally.
 *
 * The deep links we currently need to special-case are the cloud-drive
 * OAuth redirects:
 *
 *     expensestracker://redirect/?code=...&state=...           (Microsoft)
 *     com.vshpynta.expensestracker:/oauth2redirect?code=...&… (Google)
 *
 * Google's Android OAuth client requires the redirect URI scheme to be
 * the reverse-DNS of the package name (see
 * `src/sync/googleDriveAdapter.ts`), so it cannot share the
 * `expensestracker://` scheme. The corresponding intent-filter lives in
 * `android/app/src/main/AndroidManifest.xml`.
 *
 * The OS routes either URL to `MainActivity`, at which point two
 * listeners race for it:
 *
 *   1. `expo-web-browser`'s in-flight auth-session listener. It matches
 *      the URL and resolves the pending `AuthRequest.promptAsync()`
 *      Promise — this is what we want.
 *   2. **Expo Router**'s deep-link listener. It sees the path
 *      (`/redirect`, `/oauth2redirect`), finds no matching route, and
 *      renders the `+not-found` screen — this is what the user
 *      complained about.
 *
 * Both listeners fire on the same React Native `Linking` event, so we
 * can't suppress (2) directly. Instead we intercept it here and route
 * the user back to `/settings`, where the Cloud Sync dialog lives. By
 * the time the user re-opens that dialog, the auth listener has
 * resolved, tokens are stored, and `isSignedIn` is `true`.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    // `path` may be a full URL (e.g. `expensestracker://redirect/?…`)
    // or a bare path. `new URL(path, base)` handles both: absolute URLs
    // ignore the base, relative paths are resolved against it.
    const url = new URL(path, 'expensestracker://app');
    // Expo Router normalizes incoming deep-link URLs to the app's
    // primary scheme from `app.json` (`expensestracker:`), even when
    // the OS dispatched a different scheme. So an inbound
    // `com.vshpynta.expensestracker:/oauth2redirect?…` from Google can
    // arrive here as either:
    //   - the raw URI (protocol `com.vshpynta.expensestracker:`,
    //     pathname `/oauth2redirect`), or
    //   - the normalized form `expensestracker://oauth2redirect?…`
    //     (protocol `expensestracker:`, hostname `oauth2redirect`).
    // Match both. The OAuth-specific path names (`redirect`,
    // `oauth2redirect`) are reserved for callbacks and never used as
    // real routes, so a structural check is safe.
    const isMicrosoftCallback =
      url.protocol === 'expensestracker:' && url.hostname === 'redirect';
    const isGoogleCallback =
      (url.protocol === 'com.vshpynta.expensestracker:' &&
        url.pathname === '/oauth2redirect') ||
      (url.protocol === 'expensestracker:' &&
        url.hostname === 'oauth2redirect');
    if (isMicrosoftCallback || isGoogleCallback) {
      // OAuth callback — let `expo-web-browser` consume it; just send
      // the user to the screen they came from.
      return '/settings';
    }
  } catch {
    // Malformed path — fall through to default routing.
  }
  return path;
}
