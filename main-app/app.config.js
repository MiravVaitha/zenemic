const path = require('path');
const dotenv = require('dotenv');

// The whole repo shares ONE env file at the repository root (one level up from
// main-app/), so the Expo app reads the same file as the backend services.
// Only the EXPO_PUBLIC_* values are exposed to the app (via `extra`); the backend
// secrets in the same file are NOT bundled.
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
