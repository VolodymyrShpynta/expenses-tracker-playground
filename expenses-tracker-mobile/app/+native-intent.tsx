/**
 * Expo Router native-intent rewriter.
 *
 * Catches deep links **before** Expo Router resolves them to a screen.
 * Returning a different path here changes the route that the user will
 * see; returning the original `path` lets Expo Router route normally.
 *
 * The only deep link we currently need to special-case is the
 * cloud-drive OAuth redirect:
 *
 *     expensestracker://redirect/?code=...&state=...
 *
 * The OS routes this URL to `MainActivity` (intent-filter on
 * `android:scheme="expensestracker"`), at which point two listeners
 * race for it:
 *
 *   1. `expo-web-browser`'s in-flight auth-session listener. It matches
 *      the URL and resolves the pending `AuthRequest.promptAsync()`
 *      Promise — this is what we want.
 *   2. **Expo Router**'s deep-link listener. It sees path `/redirect`,
 *      finds no `app/redirect.tsx` route, and renders the `+not-found`
 *      screen — this is what the user complained about.
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
    if (
      url.protocol === 'expensestracker:' &&
      url.hostname === 'redirect'
    ) {
      // OAuth callback — let `expo-web-browser` consume it; just send
      // the user to the screen they came from.
      return '/settings';
    }
  } catch {
    // Malformed path — fall through to default routing.
  }
  return path;
}
