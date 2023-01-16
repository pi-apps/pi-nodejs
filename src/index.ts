import axios from 'axios';

export type CreatePaymentArgs = {
  recipientUid: string,
};

export default class PiNetwork {
  private API_KEY: string;
  private WALLET_PRIVATE_SEED: string;
  
  constructor(apiKey: string, walletPrivateSeed: string) {
    this.API_KEY = apiKey;
    this.WALLET_PRIVATE_SEED = walletPrivateSeed;
  }

  public hello = function() {
    console.log("hello world!");
  }

  public createPayment = async function(args: CreatePaymentArgs): Promise<void> {
    const axiosClient = axios.create({baseURL: 'https://api.minepi.com', timeout: 20000});
    const config = {headers: {'Authorization': `Key ${this.API_KEY}`, 'Content-Type': 'application/json'}};
    
    // This is the user UID of this payment's recipient
    const userUid = args.recipientUid; // this is just an example uid!
    
    const body =  {
      payment: {
        uid: userUid,
        amount: 1, // TODO args
        memo: "Memo for user", // TODO args
        metadata: {test: "your metadata"}, // TODO args
      }
    };
    
    const response = await axiosClient.post(`/v2/payments`, body, config);
    const paymentIdentifier = response.data.identifier;
    const recipientAddress = response.data.to_address;

    console.log(paymentIdentifier, recipientAddress);
  }
}
