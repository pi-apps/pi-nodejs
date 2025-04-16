import axios from "axios";
import { config } from "./config";
import { NetworkPassphrase } from "./types";

export const createPlatformApiClient = (apiKey: string) => {
  const axiosClient = axios.create({
    baseURL: config.PI_BACKEND_PLATFORM_BASE_URL + "/v2",
    timeout: 20000,
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
  });

  return axiosClient;
};

export const isMainnet = (passphrase: NetworkPassphrase) => {
  return passphrase === config.PI_BACKEND_HORIZON_MAINNET_PASSPHRASE;
};
