import * as Linking from 'expo-linking';

/**
 * Paths the auth emails redirect back to. They are deliberately distinct: the
 * credentials in a recovery link and a confirmation link look identical, so the
 * path is the only thing that tells the app which flow it is being asked to run.
 */
export const RECOVERY_PATH = 'reset-password';
export const CONFIRM_PATH = 'confirm-email';

/**
 * Where Supabase should send the user after they tap a link in an auth email.
 *
 * `createURL` yields `zenemic://<path>` in a dev/production build and
 * `exp://<host>/--/<path>` under Expo Go, so the same code works in both.
 * Whichever forms you use must be listed in Supabase → Authentication → URL
 * Configuration → Redirect URLs: GoTrue rejects any redirect that isn't on that
 * allowlist, which is what stops a link being aimed somewhere else. Without one
 * of these, GoTrue falls back to the project's Site URL instead.
 */
export const recoveryRedirectTo = () => Linking.createURL(RECOVERY_PATH);
export const confirmRedirectTo = () => Linking.createURL(CONFIRM_PATH);

export type AuthLinkIntent = 'recovery' | 'confirm';

export type AuthLink = { intent: AuthLinkIntent } & (
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
);

/**
 * Auth params reach us in one of two places depending on the project's flow:
 * the query string (PKCE — `?code=…`) or the fragment (implicit — `#access_token=…`).
 * GoTrue also reports failures this way (`#error=…&error_code=otp_expired`).
 * Read both so this works whichever flow the project is configured for.
 */
function readParams(url: string): { path: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const collect = (qs: string) => {
    for (const pair of qs.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      const value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      if (key) params[key] = value;
    }
  };

  const hash = url.indexOf('#');
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  if (hash >= 0) collect(url.slice(hash + 1));

  const query = beforeHash.indexOf('?');
  if (query >= 0) collect(beforeHash.slice(query + 1));

  return { path: query >= 0 ? beforeHash.slice(0, query) : beforeHash, params };
}

/**
 * Returns null for any link that isn't an auth redirect, so other deep links pass
 * through untouched. The flow is identified by the path rather than a `type` param,
 * because the PKCE redirect carries no type.
 */
export function parseAuthLink(url: string): AuthLink | null {
  const { path, params } = readParams(url);
  const byPath: AuthLinkIntent | null = path.includes(RECOVERY_PATH)
    ? 'recovery'
    : path.includes(CONFIRM_PATH)
      ? 'confirm'
      : null;
  // Not one of our redirect targets — leave other deep links alone.
  if (!byPath) return null;

  /**
   * GoTrue stamps `type` on the implicit redirect, and it is more trustworthy than
   * the path: if a redirect URL is missing from the project's allowlist, GoTrue
   * silently falls back to the Site URL, so the link arrives on the WRONG path. A
   * recovery link mistaken for a confirmation would establish a session and drop
   * the user into the app — signing them in instead of making them set a new
   * password. Fall back to the path only when there is no type (the PKCE `?code=`
   * redirect carries none).
   */
  const byType: AuthLinkIntent | null =
    params.type === 'recovery' ? 'recovery' : params.type === 'signup' ? 'confirm' : null;
  const intent = byType ?? byPath;

  const noun = intent === 'recovery' ? 'reset link' : 'confirmation link';

  if (params.error || params.error_code) {
    const expired = /expired/i.test(params.error_code ?? '') || /expired/i.test(params.error_description ?? '');
    return {
      intent,
      kind: 'error',
      message: expired
        ? `That ${noun} has expired. Request a new one and it should arrive within a minute.`
        : `That ${noun} is no longer valid. Request a new one.`,
    };
  }

  if (params.access_token && params.refresh_token) {
    return { intent, kind: 'tokens', accessToken: params.access_token, refreshToken: params.refresh_token };
  }
  if (params.code) return { intent, kind: 'code', code: params.code };

  return { intent, kind: 'error', message: `That ${noun} is incomplete. Request a new one.` };
}
