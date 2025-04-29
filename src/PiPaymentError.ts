import { PaymentDTO } from "./types/index";
import {
  PiPaymentApiValidationErrorCode,
  PiPaymentApiCreateErrorCode,
  PiPaymentApiCompleteErrorCode,
  PiPaymentApiCancelErrorCode,
} from "./types/errors";

export type PiPaymentSdkErrorCode =
  | "amount_not_number"
  | "api_key_not_string"
  | "invalid_wallet_private_seed"
  | "memo_not_string"
  | "metadata_not_object"
  | "missing_amount"
  | "missing_api_key"
  | "missing_memo"
  | "missing_metadata"
  | "missing_uid"
  | "missing_wallet_private_seed"
  | "payment_already_has_linked_txid"
  | "payment_data_not_object"
  | "private_seed_mismatch"
  | "uid_not_string"
  | "wallet_private_seed_not_56_chars_long"
  | "wallet_private_seed_not_starts_with_S"
  | "wallet_private_seed_not_string";

export type PiPaymentApiErrorCode =
  | PiPaymentApiCancelErrorCode
  | PiPaymentApiCompleteErrorCode
  | PiPaymentApiCreateErrorCode
  | PiPaymentApiValidationErrorCode;

export type PiPaymentErrorCode = PiPaymentSdkErrorCode | PiPaymentApiErrorCode;

const errorMessages: Record<PiPaymentSdkErrorCode, string> = {
  amount_not_number: "Amount must be a number",
  api_key_not_string: "API key must be a string",
  invalid_wallet_private_seed: "Invalid wallet private seed",
  memo_not_string: "Memo must be a string",
  metadata_not_object: "Metadata must be an object",
  missing_amount: "Missing amount",
  missing_api_key: "Missing API key",
  missing_memo: "Missing memo",
  missing_metadata: "Missing metadata",
  missing_uid: "Missing uid",
  missing_wallet_private_seed: "Missing wallet private seed",
  payment_already_has_linked_txid: "This payment already has a linked txid",
  payment_data_not_object: "Payment data must be an object",
  private_seed_mismatch: "You should use a private seed of your app wallet!",
  uid_not_string: "Uid must be a string",
  wallet_private_seed_not_56_chars_long: "Wallet private seed must be 56-character long",
  wallet_private_seed_not_starts_with_S: "Wallet private seed must starts with 'S'",
  wallet_private_seed_not_string: "Wallet private seed must be a string",
};

export interface PiPaymentErrorAdditionalData {
  data?: {
    payment?: PaymentDTO;
    paymentId?: string;
    txid?: string;
    verificationError?: string;
  };
  messageOverride?: string;
}

export interface IPiPaymentError {
  code: string;
  payment?: PaymentDTO;
  paymentId?: string;
  txid?: string;
  verificationError?: string;
}

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
