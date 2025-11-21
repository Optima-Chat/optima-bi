import Conf from 'conf';

export interface CliConfig {
  environment: 'production' | 'stage' | 'development';
  authUrl: string;
  backendUrl: string;
  accessToken?: string;
  refreshToken?: string;
}

export const config = new Conf<CliConfig>({
  projectName: 'optima-bi-cli',
  defaults: {
    environment: 'production',
    authUrl: 'https://auth.optima.chat',
    backendUrl: 'https://bi-api.optima.chat',
  },
  encryptionKey: 'optima-bi-cli-secret-key-change-in-production',
});

export function getConfig(): CliConfig {
  return {
    environment: config.get('environment'),
    authUrl: config.get('authUrl'),
    backendUrl: config.get('backendUrl'),
    accessToken: config.get('accessToken'),
    refreshToken: config.get('refreshToken'),
  };
}

export function setConfig(key: keyof CliConfig, value: any): void {
  // Clear the key first if it exists and value is an object
  if (config.has(key) && typeof value === 'object' && value !== null) {
    config.delete(key);
  }
  config.set(key, value);
}

export function clearAuth(): void {
  config.delete('accessToken');
  config.delete('refreshToken');
}
