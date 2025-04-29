import dotenv from "dotenv";
import path from "path";

export const dotenvConfig = dotenv.config({
  path: path.resolve(__dirname, `../.env.${process.env.PI_ENV}`),
}).parsed;

if (!dotenvConfig) {
  throw new Error(`Failed to load .env file`);
}

interface Config {
  PI_BACKEND_HORIZON_MAINNET_URL: string;
  PI_BACKEND_HORIZON_MAINNET_PASSPHRASE: string;
  PI_BACKEND_HORIZON_TESTNET_URL: string;
  PI_BACKEND_HORIZON_TESTNET_PASSPHRASE: string;
  PI_BACKEND_HORIZON_DEFAULT_TIMEBOUNDS: number;
  PI_BACKEND_HORIZON_TIMEOUT_MS: number;
  PI_BACKEND_PLATFORM_BASE_URL: string;
}

const config: Config = {
  PI_BACKEND_HORIZON_MAINNET_URL: dotenvConfig.PI_BACKEND_HORIZON_MAINNET_URL,
  PI_BACKEND_HORIZON_MAINNET_PASSPHRASE: dotenvConfig.PI_BACKEND_HORIZON_MAINNET_PASSPHRASE,
  PI_BACKEND_HORIZON_TESTNET_URL: dotenvConfig.PI_BACKEND_HORIZON_TESTNET_URL,
  PI_BACKEND_HORIZON_TESTNET_PASSPHRASE: dotenvConfig.PI_BACKEND_HORIZON_TESTNET_PASSPHRASE,
  PI_BACKEND_HORIZON_DEFAULT_TIMEBOUNDS: 180,
  PI_BACKEND_HORIZON_TIMEOUT_MS: 20000,
  PI_BACKEND_PLATFORM_BASE_URL: dotenvConfig.PI_BACKEND_PLATFORM_BASE_URL,
};

for (const key in config) {
  if (!config[key as keyof Config]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export { config };
