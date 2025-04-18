import * as StellarSdk from "@stellar/stellar-sdk";
import { NetworkPassphrase, PaymentArgs, PaymentDTO, TransactionData } from "./types";
import { createPlatformApiClient, isMainnet } from "./utils";
import { config } from "./config";
import { AxiosInstance, isAxiosError } from "axios";
import { PiPaymentError } from "PiPaymentError";

export default class PiNetwork {
  private api: AxiosInstance;
  private myKeypair: StellarSdk.Keypair;
  private currentPayment: PaymentDTO | null = null;

  constructor(apiKey: string, walletPrivateSeed: string) {
    this.validateSeedFormat(walletPrivateSeed);
    this.validateApiKey(apiKey);

    this.myKeypair = StellarSdk.Keypair.fromSecret(walletPrivateSeed);
    this.api = createPlatformApiClient(apiKey);
  }

  public createPayment = async (payment: PaymentArgs): Promise<string> => {
    this.validatePaymentData(payment);

    try {
      const response = await this.api.post<PaymentDTO>(`/payments`, { payment });
      this.currentPayment = response.data;

      return response.data.identifier;
    } catch (err) {
      if (isAxiosError(err)) {
        throw new PiPaymentError(err.response?.data.code, { paymentId: payment.uid });
      }

      throw err;
    }
  };

  public submitPayment = async (paymentId: string): Promise<string> => {
    try {
      if (!this.currentPayment || this.currentPayment.identifier != paymentId) {
        this.currentPayment = await this.getPayment(paymentId);
        const txid = this.currentPayment.transaction?.txid;

        if (txid) {
          throw new PiPaymentError("payment_already_has_linked_txid", { paymentId, txid });
        }
      }

      const {
        amount,
        identifier: paymentIdentifier,
        from_address: fromAddress,
        to_address: toAddress,
      } = this.currentPayment;

      const piHorizon = this.getHorizonClient(this.currentPayment.network);
      const transactionData = {
        amount,
        paymentIdentifier,
        fromAddress,
        toAddress,
      };

      const transaction = await this.buildA2UTransaction(piHorizon, transactionData, this.currentPayment.network);
      const txid = await this.submitTransaction(piHorizon, transaction);
      return txid;
    } finally {
      this.currentPayment = null;
    }
  };

  public completePayment = async (paymentId: string, txid: string): Promise<PaymentDTO> => {
    try {
      const response = await this.api.post<PaymentDTO>(`/payments/${paymentId}/complete`, { txid });
      return response.data;
    } finally {
      this.currentPayment = null;
    }
  };

  public getPayment = async (paymentId: string): Promise<PaymentDTO> => {
    const response = await this.api.get<PaymentDTO>(`/payments/${paymentId}`);
    return response.data;
  };

  public cancelPayment = async (paymentId: string): Promise<PaymentDTO> => {
    try {
      const response = await this.api.post<PaymentDTO>(`/payments/${paymentId}/cancel`);
      return response.data;
    } finally {
      this.currentPayment = null;
    }
  };

  public getIncompleteServerPayments = async (): Promise<Array<PaymentDTO>> => {
    const response = await this.api.get<{ incomplete_server_payments: Array<PaymentDTO> }>(
      "/payments/incomplete_server_payments"
    );
    return response.data.incomplete_server_payments;
  };

  private validateApiKey = (apiKey: unknown) => {
    if (!apiKey) throw new PiPaymentError("missing_api_key");
    if (typeof apiKey !== "string") throw new PiPaymentError("api_key_not_string");
  };

  private validateSeedFormat = (seed: unknown) => {
    if (!seed) throw new PiPaymentError("missing_wallet_private_seed");
    if (typeof seed !== "string") throw new PiPaymentError("wallet_private_seed_not_string");
    if (!seed.startsWith("S")) throw new PiPaymentError("wallet_private_seed_not_starts_with_S");
    if (seed.length !== 56) throw new PiPaymentError("wallet_private_seed_not_56_chars_long");
    if (!StellarSdk.StrKey.isValidEd25519SecretSeed(seed)) throw new Error("Invalid wallet private seed");
  };

  private validatePaymentData = (paymentData: unknown) => {
    if (typeof paymentData !== "object" || paymentData === null) throw new PiPaymentError("payment_data_not_object");
    if (!("amount" in paymentData)) throw new PiPaymentError("missing_amount");
    if (typeof paymentData.amount !== "number") throw new PiPaymentError("amount_not_number");
    if (!("memo" in paymentData)) throw new PiPaymentError("missing_memo");
    if (typeof paymentData.memo !== "string") throw new PiPaymentError("memo_not_string");
    if (!("metadata" in paymentData)) throw new PiPaymentError("missing_metadata");
    if (typeof paymentData.metadata !== "object" || paymentData.metadata === null)
      throw new PiPaymentError("metadata_not_object");
    if (!("uid" in paymentData)) throw new PiPaymentError("missing_uid");
    if (typeof paymentData.uid !== "string") throw new PiPaymentError("uid_not_string");
  };

  private getHorizonClient = (network: NetworkPassphrase) => {
    const serverUrl = isMainnet(network)
      ? config.PI_BACKEND_HORIZON_MAINNET_URL
      : config.PI_BACKEND_HORIZON_TESTNET_URL;
    return new StellarSdk.Horizon.Server(serverUrl);
  };

  private buildA2UTransaction = async (
    piHorizon: StellarSdk.Horizon.Server,
    transactionData: TransactionData,
    network: NetworkPassphrase
  ): Promise<StellarSdk.Transaction> => {
    if (transactionData.fromAddress !== this.myKeypair.publicKey()) {
      throw new PiPaymentError("private_seed_mismatch");
    }

    const myAccount = await piHorizon.loadAccount(this.myKeypair.publicKey());
    const baseFee = await piHorizon.fetchBaseFee();

    const paymentOperation = StellarSdk.Operation.payment({
      destination: transactionData.toAddress,
      asset: StellarSdk.Asset.native(),
      amount: transactionData.amount.toString(),
    });

    const transaction = new StellarSdk.TransactionBuilder(myAccount, {
      fee: baseFee.toString(),
      networkPassphrase: network,
      timebounds: await piHorizon.fetchTimebounds(config.PI_BACKEND_HORIZON_DEFAULT_TIMEBOUNDS),
    })
      .addOperation(paymentOperation)
      .addMemo(StellarSdk.Memo.text(transactionData.paymentIdentifier))
      .build();

    transaction.sign(this.myKeypair);
    return transaction;
  };

  private submitTransaction = async (
    piHorizon: StellarSdk.Horizon.Server,
    transaction: StellarSdk.Transaction
  ): Promise<string> => {
    const txResponse = await piHorizon.submitTransaction(transaction);
    // @ts-expect-error StellarSdk.Horizon.HorizonApi.TransactionResponse.id is misstyped
    return txResponse.id;
  };
}
