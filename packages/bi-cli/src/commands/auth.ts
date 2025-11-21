import { Command } from 'commander';
import axios from 'axios';
import ora from 'ora';
import chalk from 'chalk';
import { setConfig, clearAuth, getConfig } from '../config';
import { success, error, info } from '../utils/output';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface UserInfo {
  id: string;
  email: string;
  role: 'merchant' | 'admin';
  merchant_id?: string;
}

export function createAuthCommand(): Command {
  const auth = new Command('auth').description('Authentication commands');

  // auth login
  auth
    .command('login')
    .description('Login with OAuth 2.0 Device Flow')
    .option('--env <environment>', 'Environment (production|stage|development)', 'production')
    .action(async (options) => {
      const { env } = options;

      // Set backend URL based on environment
      const backendUrls = {
        production: 'https://bi-api.optima.chat',
        stage: 'https://bi-api-stage.optima.chat',
        development: 'http://localhost:3001',
      };

      const backendUrl = backendUrls[env as keyof typeof backendUrls];
      if (!backendUrl) {
        error(`Invalid environment: ${env}`);
        process.exit(1);
      }

      setConfig('environment', env);
      setConfig('backendUrl', backendUrl);

      info(`Logging in to ${env} environment...`);

      try {
        // Step 1: Request device code
        const spinner = ora('Requesting device code...').start();
        const deviceCodeRes = await axios.post<DeviceCodeResponse>(
          `${backendUrl}/api/v1/auth/device/code`,
          { client_id: 'bi-cli' }
        );
        spinner.succeed('Device code received');

        const { device_code, user_code, verification_uri, expires_in, interval } =
          deviceCodeRes.data;

        // Step 2: Display authorization instructions
        console.log(chalk.bold('\n📋 Authorization Required:\n'));
        console.log(`  1. Visit: ${chalk.cyan(verification_uri)}`);
        console.log(`  2. Enter code: ${chalk.yellow.bold(user_code)}\n`);

        // Step 3: Open browser automatically
        const { default: open } = await import('open');
        await open(verification_uri);
        info('Browser opened automatically');

        // Step 4: Poll for token
        const pollSpinner = ora('Waiting for authorization...').start();
        const startTime = Date.now();
        const expiresAt = startTime + expires_in * 1000;

        let token: TokenResponse | null = null;

        while (Date.now() < expiresAt) {
          await new Promise((resolve) => setTimeout(resolve, interval * 1000));

          try {
            const tokenRes = await axios.post<TokenResponse>(
              `${backendUrl}/api/v1/auth/device/token`,
              {
                client_id: 'bi-cli',
                device_code,
              }
            );

            token = tokenRes.data;
            break;
          } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            if (error.response?.data?.error === 'authorization_pending') {
              // Continue polling
              continue;
            } else if (error.response?.data?.error === 'slow_down') {
              // Increase interval
              await new Promise((resolve) => setTimeout(resolve, 5000));
              continue;
            } else {
              throw err;
            }
          }
        }

        if (!token) {
          pollSpinner.fail('Authorization timeout');
          error('Please try again');
          process.exit(1);
        }

        pollSpinner.succeed('Authorization successful');

        // Step 5: Save tokens
        setConfig('accessToken', token.access_token);
        setConfig('refreshToken', token.refresh_token);

        // Step 6: Fetch user info
        const userInfo = await axios.get<UserInfo>(`${backendUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });

        success(`Logged in as ${chalk.bold(userInfo.data.email)} (${userInfo.data.role})`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        error(`Login failed: ${errorMsg}`);
        process.exit(1);
      }
    });

  // auth logout
  auth
    .command('logout')
    .description('Logout and clear stored credentials')
    .action(() => {
      clearAuth();
      success('Logged out successfully');
    });

  // auth whoami
  auth
    .command('whoami')
    .description('Show current user information')
    .action(async () => {
      const cfg = getConfig();

      if (!cfg.accessToken) {
        error('Not logged in. Run: bi-cli auth login');
        process.exit(1);
      }

      try {
        const userInfo = await axios.get<UserInfo>(`${cfg.backendUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${cfg.accessToken}` },
        });

        console.log(chalk.bold('\n👤 Current User:\n'));
        console.log(`  Email: ${chalk.cyan(userInfo.data.email)}`);
        console.log(`  Role: ${chalk.yellow(userInfo.data.role)}`);
        if (userInfo.data.merchant_id) {
          console.log(`  Merchant ID: ${chalk.gray(userInfo.data.merchant_id)}`);
        }
        console.log(`  Environment: ${chalk.green(cfg.environment)}\n`);
      } catch (err: unknown) {
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status === 401) {
          error('Token expired. Please login again: bi-cli auth login');
        } else {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          error(`Failed to fetch user info: ${errorMsg}`);
        }
        process.exit(1);
      }
    });

  // auth switch
  auth
    .command('switch')
    .description('Switch environment')
    .option('--env <environment>', 'Environment (production|stage|development)', 'production')
    .action((options) => {
      const { env } = options;

      const backendUrls = {
        production: 'https://bi-api.optima.chat',
        stage: 'https://bi-api-stage.optima.chat',
        development: 'http://localhost:3001',
      };

      const backendUrl = backendUrls[env as keyof typeof backendUrls];
      if (!backendUrl) {
        error(`Invalid environment: ${env}`);
        process.exit(1);
      }

      setConfig('environment', env);
      setConfig('backendUrl', backendUrl);
      clearAuth(); // Clear tokens when switching environment

      success(`Switched to ${env} environment`);
      info('Please login again: bi-cli auth login');
    });

  return auth;
}
