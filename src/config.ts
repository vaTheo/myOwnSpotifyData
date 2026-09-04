export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env
): SpotifyConfig {
  return {
    clientId: requireEnv(env, 'SPOTIFY_CLIENT_ID'),
    clientSecret: requireEnv(env, 'SPOTIFY_CLIENT_SECRET'),
    redirectUri: requireEnv(env, 'SPOTIFY_REDIRECT_URI'),
  };
}
