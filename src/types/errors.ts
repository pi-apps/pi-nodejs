import { PaymentDTO } from "types";

export type PiPaymentApiNotFoundErrorCode = "payment_not_found";

export type PiPaymentApiValidationErrorCode =
  | PiPaymentApiNotFoundErrorCode
  | "invalid_amount"
  | "invalid_arguments"
  | "invalid_metadata"
  | "unknown_error";

export type PiPaymentApiCreateErrorCode =
  | PiPaymentApiNotFoundErrorCode
  | "altered_amount"
  | "invalid_address"
  | "missing_scope"
  | "missing_wallet"
  | "ongoing_payment_found"
  | "feature_not_available"
  | "too_many_cancelled_payments"
  | "too_many_payments"
  | "user_not_found";

export type PiPaymentApiCreateError<
  ErrorCode extends PiPaymentApiCreateErrorCode | PiPaymentApiValidationErrorCode =
    | PiPaymentApiCreateErrorCode
    | PiPaymentApiValidationErrorCode,
> =
  | {
      error: Exclude<ErrorCode, "ongoing_payment_found">;
      error_message: string;
    }
  | {
      error: "ongoing_payment_found";
      error_message: string;
      payment: PaymentDTO;
    };

export type PiPaymentApiCompleteErrorCode =
  | PiPaymentApiNotFoundErrorCode
  | "already_completed"
  | "cancelled_payment"
  | "missing_param"
  | "missing_txid"
  | "not_verified"
  | "txid_mismatch"
  | "verification_failed";

export type PiPaymentApiCompleteError =
  | {
      error: "verification_failed";
      error_message: string;
      verification_error: string;
    }
  | {
      error: Exclude<PiPaymentApiCompleteErrorCode, "verification_failed">;
      error_message: string;
    };

export type PiPaymentApiCancelErrorCode =
  | PiPaymentApiNotFoundErrorCode
  | "already_completed"
  | "cancelled_payment"
  | "forbidden"
  | "payment_tx_present";

export type PiPaymentApiCancelError<ErrorCode extends PiPaymentApiCancelErrorCode = PiPaymentApiCancelErrorCode> =
  | {
      error: Exclude<ErrorCode, "already_completed" | "cancelled_payment" | "forbidden">;
      error_message: string;
    }
  | {
      error: "already_completed" | "cancelled_payment" | "forbidden";
      error_message: string;
      payment: PaymentDTO;
    };
