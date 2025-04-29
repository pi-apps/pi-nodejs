import axios from "axios";
import { config } from "./config";
import { NetworkPassphrase } from "./types";

export const createPlatformApiClient = (apiKey: string) => {
  const axiosClient = axios.create({
    baseURL: config.PI_BACKEND_PLATFORM_BASE_URL + "/v2",
    timeout: config.PI_BACKEND_HORIZON_TIMEOUT_MS,
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
  });

  return axiosClient;
};

export const isMainnet = (passphrase: NetworkPassphrase) => {
  return passphrase === config.PI_BACKEND_HORIZON_MAINNET_PASSPHRASE;
};

export type TransactionResultCode =
  | "tx_failed"
  | "tx_too_early"
  | "tx_too_late"
  | "tx_missing_operation"
  | "tx_bad_seq"
  | "tx_bad_auth"
  | "tx_insufficient_balance"
  | "tx_no_source_accout"
  | "tx_insufficient_fee"
  | "tx_bad_auth_extra"
  | "tx_internal_error";

export type OperationResultCode =
  | "op_bad_auth"
  | "op_no_source_account"
  | "op_not_supported"
  | "op_too_many_subentries"
  | "op_exceeded_work_limit";

export interface SubmitTransactionErrorResponse {
  detail: string;
  extras?: {
    envelope_xdr?: string;
    result_codes?: { transaction?: TransactionResultCode; operations?: OperationResultCode[] };
    result_xdr?: string;
  };
  status: number;
  title: string;
  type: string;
}

export const isSubmitTransactionErrorResponse = (response: any): response is SubmitTransactionErrorResponse => {
  if (typeof response !== "object" || response === null) return false;
  const { title, status } = response as SubmitTransactionErrorResponse;
  return typeof title === "string" && typeof status === "number";
};
