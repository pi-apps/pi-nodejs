import { PaymentDTO } from "./types/index";
import {
  PiPaymentApiValidationErrorCode,
  PiPaymentApiCreateErrorCode,
  PiPaymentApiCompleteErrorCode,
  PiPaymentApiCancelErrorCode,
} from "./types/errors";

export type PiPaymentSdkErrorCode =
  | "payment_already_has_linked_txid"
  | "missing_api_key"
  | "api_key_not_string"
  | "missing_wallet_private_seed"
  | "wallet_private_seed_not_string"
  | "wallet_private_seed_not_starts_with_S"
  | "wallet_private_seed_not_56_chars_long"
  | "payment_data_not_object"
  | "invalid_wallet_private_seed"
  | "missing_amount"
  | "amount_not_number"
  | "missing_memo"
  | "memo_not_string"
  | "missing_metadata"
  | "metadata_not_object"
  | "missing_uid"
  | "uid_not_string"
  | "private_seed_mismatch";

export type PiPaymentApiErrorCode =
  | PiPaymentApiValidationErrorCode
  | PiPaymentApiCreateErrorCode
  | PiPaymentApiCompleteErrorCode
  | PiPaymentApiCancelErrorCode;

export type PiPaymentErrorCode = PiPaymentSdkErrorCode | PiPaymentApiErrorCode;

const errorMessages: Record<PiPaymentSdkErrorCode, string> = {
  payment_already_has_linked_txid: "This payment already has a linked txid",
  missing_api_key: "Missing API key",
  api_key_not_string: "API key must be a string",
  missing_wallet_private_seed: "Missing wallet private seed",
  wallet_private_seed_not_string: "Wallet private seed must be a string",
  wallet_private_seed_not_starts_with_S: "Wallet private seed must starts with 'S'",
  wallet_private_seed_not_56_chars_long: "Wallet private seed must be 56-character long",
  payment_data_not_object: "Payment data must be an object",
  invalid_wallet_private_seed: "Invalid wallet private seed",
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

export type PiPaymentErrorAdditionalData = {
  data?: {
    payment?: PaymentDTO;
    paymentId?: string;
    txid?: string;
    verificationError?: string;
  };
  messageOverride?: string;
};

export type IPiPaymentError = {
  code: string;
  payment?: PaymentDTO;
  paymentId?: string;
  txid?: string;
  verificationError?: string;
};

export class PiPaymentError extends Error implements IPiPaymentError {
  public code: string;
  public payment?: PaymentDTO;
  public paymentId?: string;
  public txid?: string;
  public verificationError?: string;

  constructor(code: PiPaymentErrorCode, data?: PiPaymentErrorAdditionalData) {
    super(
      data?.messageOverride || (code in errorMessages ? errorMessages[code as PiPaymentSdkErrorCode] : "Unknown error")
    );
    this.code = code;
    this.payment = data?.data?.payment;
    this.paymentId = data?.data?.paymentId;
    this.txid = data?.data?.txid;
    this.verificationError = data?.data?.verificationError;
  }
}
