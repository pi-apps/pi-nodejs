import * as StellarSdk from "stellar-sdk";
import { AxiosClientOptions, NetworkPassphrase, PaymentArgs, PaymentDTO, TransactionData } from "./types";
import { getAxiosClient } from "./utils";

export default class PiNetwork {
  private API_KEY: string;
  private myKeypair: StellarSdk.Keypair;
  private NETWORK_PASSPHRASE: NetworkPassphrase;
  private currentPayment: PaymentDTO | null;
  private axiosOptions: AxiosClientOptions | null;

  constructor(apiKey: string, walletPrivateSeed: string, options: AxiosClientOptions | null = null) {
    this.validateSeedFormat(walletPrivateSeed);
    this.API_KEY = apiKey;
    this.myKeypair = StellarSdk.Keypair.fromSecret(walletPrivateSeed);
    this.axiosOptions = options;
  }

  public createPayment = async (paymentData: PaymentArgs): Promise<string> => {
    this.validatePaymentData(paymentData);

    const axiosClient = getAxiosClient(this.API_KEY, this.axiosOptions);
    const body = { payment: paymentData };
    const response = await axiosClient.post(`/v2/payments`, body);
    this.currentPayment = response.data;

    return response.data.identifier;
  };

  public submitPayment = async (paymentId: string): Promise<string> => {
    try {
      if (!this.currentPayment || this.currentPayment.identifier != paymentId) {
        this.currentPayment = await this.getPayment(paymentId);
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
  
      const transaction = await this.buildA2UTransaction(piHorizon, transactionData);
      const txid = await this.submitTransaction(piHorizon, transaction);
      return txid;
    } finally {
      this.currentPayment = null;
    }
  };

  public completePayment = async (paymentId: string, txid: string): Promise<PaymentDTO> => {
    try {
      const axiosClient = getAxiosClient(this.API_KEY, this.axiosOptions);
      const response = await axiosClient.post(`/v2/payments/${paymentId}/complete`, { txid });
      return response.data;
    } finally {
      this.currentPayment = null;
    }
  };

  public getPayment = async (paymentId: string): Promise<PaymentDTO> => {
    const axiosClient = getAxiosClient(this.API_KEY, this.axiosOptions);
    const response = await axiosClient.get(`/v2/payments/${paymentId}`);
    return response.data;
  };

  public cancelPayment = async (paymentId: string): Promise<PaymentDTO> => {
    try {
      const axiosClient = getAxiosClient(this.API_KEY, this.axiosOptions);
      const response = await axiosClient.post(`/v2/payments/${paymentId}/cancel`);
      return response.data;
    } finally {
      this.currentPayment = null;
    }
  };

  public getIncompleteServerPayments = async (): Promise<Array<PaymentDTO>> => {
    const axiosClient = getAxiosClient(this.API_KEY, this.axiosOptions);
    const response = await axiosClient.get("/v2/payments/incomplete_server_payments");
    return response.data;
  };

  private validateSeedFormat = (seed: string): void => {
    if (!seed.startsWith("S")) throw new Error("Wallet private seed must starts with 'S'");
    if (seed.length !== 56) throw new Error("Wallet private seed must be 56-character long");
  };

  private validatePaymentData = (paymentData: PaymentArgs): void => {
    if (!paymentData.amount) throw new Error("Missing amount");
    if (!paymentData.memo) throw new Error("Missing memo");
    if (!paymentData.metadata) throw new Error("Missing metadata");
    if (!paymentData.uid) throw new Error("Missing uid");
  };

  private getHorizonClient = (network: NetworkPassphrase): StellarSdk.Server => {
    this.NETWORK_PASSPHRASE = network;
    const serverUrl = network === "Pi Network" ? "https://api.mainnet.minepi.com" : "https://api.testnet.minepi.com";
    return new StellarSdk.Server(serverUrl);
  };

  private buildA2UTransaction = async (
    piHorizon: StellarSdk.Server,
    transactionData: TransactionData
  ): Promise<StellarSdk.Transaction> => {
    if (transactionData.fromAddress !== this.myKeypair.publicKey()) {
      throw new Error("You should use a private seed of your app wallet!");
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
      networkPassphrase: this.NETWORK_PASSPHRASE,
      timebounds: await piHorizon.fetchTimebounds(180),
    })
      .addOperation(paymentOperation)
      .addMemo(StellarSdk.Memo.text(transactionData.paymentIdentifier))
      .build();

    transaction.sign(this.myKeypair);
    return transaction;
  };

  private submitTransaction = async (
    piHorizon: StellarSdk.Server,
    transaction: StellarSdk.Transaction
  ): Promise<string> => {
    const txResponse = await piHorizon.submitTransaction(transaction);
    // @ts-ignore
    return txResponse.id;
  };
}
