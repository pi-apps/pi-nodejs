// The contract's ProcessResult for one batch.
export interface ProcessResult {
  charged: number; // subscriptions charged in this batch
  failed: number; // subscriptions whose charge failed; the contract turned their auto-renew off
  skipped: number; // subscriptions not due yet, not auto-renewing, or missing
  total: number; // all subscriptions of the service; page through them with offset
}

export type ProcessMode = "simulate" | "submit";

export interface ProcessOptions {
  // "simulate" (default "submit") runs the call on the RPC server without signing or sending it.
  mode?: ProcessMode;
  // Overrides for the Pi Testnet defaults.
  rpcUrl?: string;
  networkPassphrase?: string;
  contractAddress?: string;
  // How long the signed transaction stays valid for inclusion, in seconds. Defaults to 180.
  timeoutSecs?: number;
}

export interface ProcessSubmitResult {
  txid: string;
  ledger: number;
  result: ProcessResult;
}
