import { PaymentDTO } from "types";

export type PiPaymentApiNotFoundErrorCode = "payment_not_found";

export type PiPaymentApiValidationErrorCode =
  | PiPaymentApiNotFoundErrorCode
  | "invalid_arguments"
  | "invalid_amount"
  | "invalid_metadata"
  | "unknown_error";

export type PiPaymentApiCreateErrorCode =
  | PiPaymentApiNotFoundErrorCode
  | "altered_amount"
  | "user_not_found"
  | "missing_scope"
  | "invalid_address"
  | "missing_wallet"
  | "ongoing_payment_found"
  | "too_many_cancelled_payments"
  | "too_many_payments";

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
  | "missing_param"
  | "already_completed"
  | "cancelled_payment"
  | "not_verified"
  | "missing_txid"
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
  | "forbidden"
  | "payment_tx_present"
  | "already_completed"
  | "cancelled_payment";

export type PiPaymentApiCancelError<ErrorCode extends PiPaymentApiCancelErrorCode = PiPaymentApiCancelErrorCode> =
  | {
      error: Exclude<ErrorCode, "forbidden" | "already_completed" | "cancelled_payment">;
      error_message: string;
    }
  | {
      error: "forbidden" | "already_completed" | "cancelled_payment";
      error_message: string;
      payment: PaymentDTO;
    };
