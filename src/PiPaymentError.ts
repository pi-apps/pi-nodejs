import { PaymentDTO } from "./types/index";
import {
  PiPaymentApiValidationErrorCode,
  PiPaymentApiCreateErrorCode,
  PiPaymentApiCompleteErrorCode,
  PiPaymentApiCancelErrorCode,
} from "./types/errors";
import { OperationResultCode, TransactionResultCode } from "utils";

export type PiPaymentSdkErrorCode =
  | TransactionResultCode
  | OperationResultCode
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
  amount_not_number: "Amount must be a number.",
  api_key_not_string: "API key must be a string.",
  invalid_wallet_private_seed: "Invalid wallet private seed.",
  memo_not_string: "Memo must be a string.",
  metadata_not_object: "Metadata must be an object.",
  missing_amount: "Missing amount.",
  missing_api_key: "Missing API key.",
  missing_memo: "Missing memo.",
  missing_metadata: "Missing metadata.",
  missing_uid: "Missing uid.",
  missing_wallet_private_seed: "Missing wallet private seed.",
  payment_already_has_linked_txid: "This payment already has a linked txid.",
  payment_data_not_object: "Payment data must be an object.",
  private_seed_mismatch: "You should use a private seed of your app wallet.",
  uid_not_string: "Uid must be a string.",
  wallet_private_seed_not_56_chars_long: "Wallet private seed must be 56-character long.",
  wallet_private_seed_not_starts_with_S: "Wallet private seed must starts with 'S'.",
  wallet_private_seed_not_string: "Wallet private seed must be a string.",
  tx_failed: "Transaction failed.",
  tx_too_early: "Transaction submitted too early.",
  tx_too_late: "Transaction submitted too late.",
  tx_missing_operation: "Transaction is missing operation.",
  tx_bad_seq: "Transaction was submitted with invalid sequence number.",
  tx_bad_auth: "Transaction contains too few valid signatures.",
  tx_insufficient_balance: "Source account doesn't have enough balance for this transaction.",
  tx_no_source_accout: "Transaction has no source account.",
  tx_insufficient_fee: "Transaction was submitted with insufficient fee.",
  tx_bad_auth_extra: "Transaction contains unused signatures attached.",
  tx_internal_error: "Transaction internal error.",
  op_bad_auth: "Transaction contains too few valid signatures or was submitted to the wrong network.",
  op_no_source_account: "Operation is missing source account.",
  op_not_supported: "Operation is not supported.",
  op_too_many_subentries: "Account reached max number (1000) of subentries.",
  op_exceeded_work_limit: "Operation exceeded the work limit.",
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
