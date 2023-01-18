import * as StellarSdk from "stellar-sdk";
import { NetworkPassphrase, PaymentArgs, PaymentDTO, TransactionData } from "./types";
import { getAxiosClient } from "./utils";

export default class PiNetwork {
  private API_KEY: string;
  private myKeypair: StellarSdk.Keypair;
  private NETWORK_PASSPHRASE: NetworkPassphrase;
  private currentPayment: PaymentDTO | null;

  constructor(apiKey: string, walletPrivateSeed: string) {
    this.validateSeedFormat(walletPrivateSeed);
    this.API_KEY = apiKey;
    this.myKeypair = StellarSdk.Keypair.fromSecret(walletPrivateSeed);
  }

  public createPayment = async (paymentData: PaymentArgs): Promise<PaymentDTO> => {
    this.validatePaymentData(paymentData);

    const axiosClient = getAxiosClient(this.API_KEY);
    const body = { payment: paymentData };
    const response = await axiosClient.post(`/v2/payments`, body);
    const paymentIdentifier = response.data.identifier;

    const piHorizon = this.getHorizonClient(response.data.network);

    const transactionData = {
      amount: paymentData.amount,
      paymentIdentifier,
      fromAddress: response.data.from_address,
      toAddress: response.data.to_address,
    };

    const transaction = await this.buildA2UTransaction(piHorizon, transactionData);
    const txid = await this.submitTransaction(piHorizon, transaction);

    const completedPayment = await this.completePayment(paymentIdentifier, txid);
    return completedPayment;
  };

  public submitPayment = async (paymentId: string) => {
    if (!this.currentPayment) {
      this.currentPayment = await this.getPayment(paymentId);
    }
  }

  public completePayment = async (paymentIdentifier: string, txid: string): Promise<PaymentDTO> => {
    const axiosClient = getAxiosClient(this.API_KEY);
    const response = await axiosClient.post(`/v2/payments/${paymentIdentifier}/complete`, { txid });
    return response.data;
  };

  public getPayment = async (paymentId: string): Promise<PaymentDTO> => {
    const axiosClient = getAxiosClient(this.API_KEY);
    const response = await axiosClient.get(`/v2/payments/${paymentId}`);
    return response.data;
  }

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
