import Constants from 'expo-constants';

/**
 * App configuration. The whole repo shares ONE env file at the repository root
 * (`../.env.local`); `main-app/app.config.js` loads it and exposes the
 * EXPO_PUBLIC_* values via Expo's `extra`. Restart with `npx expo start -c`
 * after changing the env file.
 */
type Extra = { apiUrl?: string; supabaseUrl?: string; supabaseAnonKey?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in the repo-root .env.local (copy from .env.example) and restart with \`npx expo start -c\`.`,
    );
  }
  return value;
}

export const config = {
  apiUrl: required('EXPO_PUBLIC_API_URL', extra.apiUrl),
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', extra.supabaseUrl),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', extra.supabaseAnonKey),
};
