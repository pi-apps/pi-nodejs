type PiPaymentErrorCode =
  | "payment_already_has_linked_txid"
  | "missing_api_key"
  | "api_key_not_string"
  | "missing_wallet_private_seed"
  | "wallet_private_seed_not_string"
  | "wallet_private_seed_not_starts_with_S"
  | "wallet_private_seed_not_56_chars_long"
  | "payment_data_not_object"
  | "missing_amount"
  | "amount_not_number"
  | "missing_memo"
  | "memo_not_string"
  | "missing_metadata"
  | "metadata_not_object"
  | "missing_uid"
  | "uid_not_string"
  | "private_seed_mismatch";

type PiPaymentErrorAdditionalData = {
  paymentId?: string;
  txid?: string;
};

const errorMessages: Record<PiPaymentErrorCode, string> = {
  payment_already_has_linked_txid: "This payment already has a linked txid",
  missing_api_key: "Missing API key",
  api_key_not_string: "API key must be a string",
  missing_wallet_private_seed: "Missing wallet private seed",
  wallet_private_seed_not_string: "Wallet private seed must be a string",
  wallet_private_seed_not_starts_with_S: "Wallet private seed must starts with 'S'",
  wallet_private_seed_not_56_chars_long: "Wallet private seed must be 56-character long",
  payment_data_not_object: "Payment data must be an object",
  missing_amount: "Missing amount",
  amount_not_number: "Amount must be a number",
  missing_memo: "Missing memo",
  memo_not_string: "Memo must be a string",
  missing_metadata: "Missing metadata",
  metadata_not_object: "Metadata must be an object",
  missing_uid: "Missing uid",
  uid_not_string: "Uid must be a string",
  private_seed_mismatch: "You should use a private seed of your app wallet!",
};

export class PiPaymentError extends Error {
  public code: string;
  public paymentId?: string;
  public txid?: string;

  constructor(code: PiPaymentErrorCode, data?: PiPaymentErrorAdditionalData) {
    super(errorMessages[code]);
    this.code = code;
    this.paymentId = data?.paymentId;
    this.txid = data?.txid;
  }
}
