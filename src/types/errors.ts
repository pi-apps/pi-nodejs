import { PaymentDTO } from "types";

type PiPaymentCreateApiErrorCode =
  | "altered_amount"
  | "user_not_found"
  | "missing_scope"
  | "invalid_address"
  | "missing_wallet"
  | "ongoing_payment_found"
  | "too_many_cancelled_payments"
  | "too_many_payments";

export type PiPaymentCreateApiError<ErrorCode extends PiPaymentCreateApiErrorCode> = {
  error: ErrorCode;
  error_message: string;
  payment: ErrorCode extends "ongoing_payment_found" ? PaymentDTO : never;
};
