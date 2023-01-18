# Pi Network - Node.JS server-side package

This is an official Pi Network Node.js npm package you can use to integrate the Pi Network apps platform with a node.js backend application.

## Install

1. Install directly with npm:
```javascript
npm install pi-nodejs-node
```


## Example

1. Initialize the SDK
```javascript
import PiNetwork from 'pi-network-node';

// DO NOT expose these values to public
const apiKey = "YOUR_PI_API_KEY"
const walletPrivateSeed = "S_YOUR_WALLET_PRIVATE_SEED" // starts with S
const pi = new PiNetwork(apiKey, walletPrivateSeed);
```

2. Create an A2U payment
```javascript
const userUid = "user_uid_of_your_app"
const paymentData = {
  amount: 1,
  memo: "From app to user test",
  metadata: {test: "your metadata"},
  uid: userUid
}
const paymentId = await pi.createPayment(paymentData);
```

3. Submit the payment to the Pi Blockchain
```javascript
const txid = await pi.submitPayment(paymentId);
```

4. Complete the payment
```javascript
const completedPayment = await pi.completePayment(paymentId, txid);
```

## Overall flow for A2U (App-to-User) payment

To create an A2U payment using the Pi Node.js SDK, here's an overall flow you need to follow:

1. Initialize the SDK
> You'll be initializing the SDK with the Pi API Key of your app and the Private Seed of your app wallet.

2. Create an A2U payment
> You can create an A2U payment using `createPayment` method. This method returns a payment identifier (payment id).

3. Store the payment id in your database
> It is critical that you store the payment id, returned by `createPayment` method, in your database so that you don't double-pay the same user, by keeping track of the payment.

4. Submit the payment to the Pi Blockchain
> You can submit the payment to the Pi Blockchain using `submitPayment` method. This method builds a payment transaction and submits it to the Pi Blockchain for you. Once submitted, the method returns a transaction identifier (txid).

5. Store the txid in your database
> It is strongly recommended that you store the txid along with the payment id you stored earlier for your reference.

6. Complete the payment
> After checking the transaction with the txid you obtained, you must complete the payment, which you can do with `completePayment` method. Upon completing, the method returns the payment object. Check the `status` field to make sure everything looks correct.

## SDK Reference

This section shows you a list of available methods.
### `createPayment`

This method creates an A2U payment.

- Required parameter: `PaymentArgs`

You need to provide 4 different data and pass them as a single object to this method.
```typescript
type PaymentArgs = {
  amount: number // the amount of Pi you're paying to your user
  memo: string // a short memo that describes what the payment is about
  metadata: object // an arbitrary object that you can attach to this payment. This is for your own use. You should use this object as a way to link this payment with your internal business logic.
  uid: string // a user uid of your app. You should have access to this value if a user has authenticated on your app.
}
```

- Response value: `a payment identifier (paymentId)`







The method will return a payment object that looks like the following:

```typescript
payment: PaymentDTO = {
  // Payment data:
  identifier: string, // payment identifier
  user_uid: string, // user's app-specific ID
  amount: number, // payment amount
  memo: string, // a string provided by the developer, shown to the user
  metadata: object, // an object provided by the developer for their own usage
  from_address: string, // sender address of the blockchain transaction
  to_address: string, // recipient address of the blockchain transaction
  direction: Direction, // direction of the payment ("user_to_app" | "app_to_user")
  created_at: string, // payment's creation timestamp
  network: string, // a network of the payment ("Pi Network" | "Pi Testnet")
  // Status flags representing the current state of this payment
  status: {
    developer_approved: boolean, // Server-Side Approval (automatically approved for A2U payment)
    transaction_verified: boolean, // blockchain transaction verified
    developer_completed: boolean, // Server-Side Completion (handled by the create_payment! method)
    cancelled: boolean, // cancelled by the developer or by Pi Network
    user_cancelled: boolean, // cancelled by the user
  },
  // Blockchain transaction data:
  transaction: null | { // This is nil if no transaction has been made yet
    txid: string, // id of the blockchain transaction
    verified: boolean, // true if the transaction matches the payment, false otherwise
    _link: string, // a link to the operation on the Pi Blockchain API
  }
}
```