// Error codes of the subscription contract (PiCoreTeam/pi-smartcontracts, contracts/subscription).
const contractErrorNames: Record<number, string> = {
  1: "InvalidPrice",
  2: "InvalidPeriod",
  3: "AlreadySubscribed",
  4: "SubscriptionNotFound",
  5: "ServiceNotFound",
  6: "Unauthorized",
  7: "AlreadyCancelled",
  8: "TimestampOverflow",
  9: "NotServiceOwner",
  10: "InvalidServiceName",
  11: "SubscriptionExpired",
  12: "ServiceNotActive",
  13: "NoAdminProposed",
  14: "NotProposedAdmin",
  15: "NoUpgradeProposed",
  16: "UpgradeTimelockNotElapsed",
  17: "UpgradeAlreadyPending",
  18: "ServiceShutdown",
};

export type PiSubscriptionErrorCode =
  | "account_not_found"
  | "fee_too_high"
  | "invalid_contract_address"
  | "invalid_limit"
  | "invalid_merchant_secret"
  | "invalid_mode"
  | "invalid_offset"
  | "invalid_service_id"
  | "invalid_timeout"
  | "rpc_error"
  | "simulation_failed"
  | "state_archived"
  | "transaction_failed"
  | "transaction_not_confirmed"
  | "transaction_rejected"
  | "unexpected_response";

const errorMessages: Record<PiSubscriptionErrorCode, string> = {
  account_not_found: "The merchant account does not exist on this network.",
  fee_too_high: "The fee is higher than a transaction can carry.",
  invalid_contract_address: "Contract address must be a contract address (C...).",
  invalid_limit: "Limit must be an integer in 0..4294967295.",
  invalid_merchant_secret: "Merchant secret must be a valid secret seed (S...).",
  invalid_mode: 'Mode must be "simulate" or "submit".',
  invalid_offset: "Offset must be an integer in 0..4294967295.",
  invalid_service_id: "Service ID must be a non-negative integer that fits in a u64.",
  invalid_timeout: "timeoutSecs must be a positive integer.",
  rpc_error: "The RPC server request failed.",
  simulation_failed: "The process call failed in simulation.",
  state_archived: "Contract state needed by this call is archived and must be restored first.",
  transaction_failed: "The transaction failed on chain.",
  transaction_not_confirmed: "The transaction was sent but its outcome is not known yet.",
  transaction_rejected: "The RPC server did not accept the transaction.",
  unexpected_response: "The RPC server returned something the SDK could not read.",
};

export interface PiSubscriptionErrorAdditionalData {
  data?: {
    // The sent transaction's id (hash), when there is one. With transaction_not_confirmed the transaction may
    // still land: look it up by this id before calling process again.
    txid?: string;
    // The contract error behind simulation_failed, when the contract raised one.
    contractErrorCode?: number;
    contractErrorName?: string;
    // The raw error text from the RPC server.
    detail?: string;
  };
}

export interface IPiSubscriptionError {
  code: string;
  txid?: string;
  contractErrorCode?: number;
  contractErrorName?: string;
  detail?: string;
}

export class PiSubscriptionError extends Error implements IPiSubscriptionError {
  public code: string;
  public txid?: string;
  public contractErrorCode?: number;
  public contractErrorName?: string;
  public detail?: string;

  constructor(code: PiSubscriptionErrorCode, data?: PiSubscriptionErrorAdditionalData) {
    const contractError = data?.data?.contractErrorName
      ? ` ${data.data.contractErrorName} (#${data.data.contractErrorCode})`
      : "";
    super((code in errorMessages ? errorMessages[code] : "Unknown error") + contractError);
    this.code = code;
    this.txid = data?.data?.txid;
    this.contractErrorCode = data?.data?.contractErrorCode;
    this.contractErrorName = data?.data?.contractErrorName;
    this.detail = data?.data?.detail;
  }
}

// Reads "Error(Contract, #N)" out of an RPC error text.
export const parseContractError = (text: string): { contractErrorCode: number; contractErrorName: string } | null => {
  const match = /Error\(Contract, #(\d+)\)/.exec(text);
  if (!match) return null;
  const code = Number(match[1]);
  return { contractErrorCode: code, contractErrorName: contractErrorNames[code] ?? "UnknownError" };
};
