# Pi Network - Node.JS server-side package

This is an official Pi Network Node.js npm package you can use to integrate the Pi Network apps platform with a node.js backend application.

## Install

This README is for **version 1.x**, which needs **Node.js 20 or later**. While 1.x is new, it is published under npm's `next` tag, so install it by that tag:

```shell
# With npm:
npm install --save pi-backend@next

# With yarn:
yarn add pi-backend@next
```

npm and yarn save this as `"pi-backend": "^1.0.0"`, so later updates stay on 1.x. Installing without a tag (`npm install pi-backend`) still gives 0.1.x, the version most apps run today (see [Versions](#versions)).

## Versions

| Version | npm tag | Node.js | What it includes | Install | Docs |
| --- | --- | --- | --- | --- | --- |
| **1.x** | `next` | 20 or later | A2U payments, server-side subscription processing | `npm install pi-backend@next` | this README |
| **0.1.x** | `latest` (the default) | older versions supported | A2U payments | `npm install pi-backend` | [0.1.3 README](https://github.com/pi-apps/pi-nodejs/tree/0.1.3) |

**Already using 0.1.x? Nothing changes for you.** npm saved your dependency as `"pi-backend": "^0.1.3"`, and that range never resolves to 1.x, so `npm install`, `npm ci` and `npm update` keep you on 0.1.3. Version 0.1.3 stays published, and stays the default for `npm install pi-backend` until 1.x is announced as the new default. Even then, a `^0.1.3` range keeps you on 0.1.x. Upgrade only when you want the new features.

## Upgrading from 0.1.x to 1.x

1. **Use Node.js 20 or later.** 1.x depends on `@stellar/stellar-sdk` 14, which needs it.
2. **Install 1.x:** `npm install pi-backend@next` (or `yarn add pi-backend@next`). This replaces `"^0.1.3"` with `"^1.0.0"` in your `package.json`.
3. **Loading the package is unchanged.** Both styles still work:
   ```javascript
   import PiNetwork from "pi-backend";                // ES modules / TypeScript
   const PiNetwork = require("pi-backend").default;  // CommonJS
   ```
4. **The constructor no longer takes a third `options` argument.** In 0.1.x, `new PiNetwork(apiKey, walletPrivateSeed, { baseUrl })` could point the SDK at another Platform API host. 1.x always uses `https://api.minepi.com`, so drop the third argument:
   ```javascript
   const pi = new PiNetwork(apiKey, walletPrivateSeed);
   ```
5. **Errors are now `PiPaymentError`s with a `code`.** In 0.1.x, methods threw plain `Error`s or raw axios errors. In 1.x, every payment method throws a `PiPaymentError`, with `code` plus `payment`, `paymentId`, `txid` or `verificationError` where they apply. For example, creating a payment while another one is ongoing:
   ```javascript
   // 0.1.x
   try { await pi.createPayment(paymentData); }
   catch (err) { const ongoing = err.response?.data?.payment; }

   // 1.x
   import PiNetwork, { PiPaymentError } from "pi-backend";
   try { await pi.createPayment(paymentData); }
   catch (err) {
     if (err instanceof PiPaymentError && err.code === "ongoing_payment_found") {
       const ongoing = err.payment;
     }
   }
   ```
   Invalid arguments are reported the same way, e.g. `missing_api_key`, `invalid_wallet_private_seed`, `amount_not_number`.

The payment methods themselves (`createPayment`, `submitPayment`, `completePayment`, `getPayment`, `cancelPayment`, `getIncompleteServerPayments`), their arguments and their return values are unchanged.

## SDK structure

```
pi-backend
├── default export: PiNetwork                  A2U payments
│     new PiNetwork(apiKey, walletPrivateSeed)
│     .createPayment(paymentArgs)
│     .submitPayment(paymentId)
│     .completePayment(paymentId, txid)
│     .getPayment(paymentId)
│     .cancelPayment(paymentId)
│     .getIncompleteServerPayments()
├── SmartContract                               same path as the client SDK's Pi.SmartContract
│     └── Subscription
│           └── process(merchantSecret, serviceId, offset, limit, options?)
├── PiPaymentError
└── PiSubscriptionError
```

Smart-contract methods take their arguments in the same order as the client SDK: who signs first, then IDs, then values or paging, then `options` last. The only difference is the first argument: the client SDK takes the merchant's address and asks the Pi Wallet to sign, while this package takes the merchant's secret seed and signs on the server.

## Example

1. Initialize the SDK
```javascript
import PiNetwork from 'pi-backend';

// DO NOT expose these values to public
const apiKey = "YOUR_PI_API_KEY"
const walletPrivateSeed = "S_YOUR_WALLET_PRIVATE_SEED" // starts with S
const pi = new PiNetwork(apiKey, walletPrivateSeed);
```

2. Create an A2U payment

Make sure to store your payment data in your database. Here's an example of how you could keep track of the data.
Consider this a database table example.

| uid | product_id | amount | memo | payment_id | txid |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `userUid` | apple-pie-1 | 3.14 | Refund for apple pie | NULL | NULL |

```javascript
const userUid = "user_uid_of_your_app"
const paymentData = {
  amount: 1,
  memo: "Refund for apple pie", // this is just an example
  metadata: {productId: "apple-pie-1"},
  uid: userUid
}
// It is critical that you store paymentId in your database
// so that you don't double-pay the same user, by keeping track of the payment.
const paymentId = await pi.createPayment(paymentData);
```

3. Store the `paymentId` in your database

After creating the payment, you'll get `paymentId`, which you should be storing in your database.

| uid | product_id | amount | memo | payment_id | txid |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `userUid` | apple-pie-1 | 3.14 | Refund for apple pie | `paymentId` | NULL |

4. Submit the payment to the Pi Blockchain
```javascript
// It is strongly recommended that you store the txid along with the paymentId you stored earlier for your reference.
const txid = await pi.submitPayment(paymentId);
```

5. Store the txid in your database

Similarly as you did in step 3, keep the txid along with other data.

| uid | product_id | amount | memo | payment_id | txid |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `userUid` | apple-pie-1 | 3.14 | Refund for apple pie | `paymentId` | `txid` |

6. Complete the payment
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

- Return value: `a payment identifier (paymentId: string)`

### `submitPayment`

This method creates a payment transaction and submits it to the Pi Blockchain.

- Required parameter: `paymentId`
- Return value: `a transaction identifier (txid: string)`

### `completePayment`

This method completes the payment in the Pi server.

- Required parameter: `paymentId, txid`
- Return value: `a payment object (payment: PaymentDTO)`

The method return a payment object with the following fields:

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
  transaction: null | { // This is null if no transaction has been made yet
    txid: string, // id of the blockchain transaction
    verified: boolean, // true if the transaction matches the payment, false otherwise
    _link: string, // a link to the operation on the Pi Blockchain API
  }
}
```

### `getPayment`

This method returns a payment object if it exists.

- Required parameter: `paymentId`
- Return value: `a payment object (payment: PaymentDTO)`

### `cancelPayment`

This method cancels the payment in the Pi server.

- Required parameter: `paymentId`
- Return value: `a payment object (payment: PaymentDTO)`

### `getIncompleteServerPayments`

This method returns the latest incomplete payment which your app has created, if present. Use this method to troubleshoot the following error: "You need to complete the ongoing payment first to create a new one."

- Required parameter: `none`
- Return value: `an array which contains 0 or 1 payment object (payments: Array<PaymentDTO>)`

If a payment is returned by this method, you must follow one of the following 3 options:

1. cancel the payment, if it is not linked with a blockchain transaction and you don't want to submit the transaction anymore

2. submit the transaction and complete the payment

3. if a blockchain transaction has been made, complete the payment

If you do not know what this payment maps to in your business logic, you may use its `metadata` property to retrieve which business logic item it relates to. Remember that `metadata` is a required argument when creating a payment, and should be used as a way to link this payment to an item of your business logic.

## Subscription processing (server-side)

Subscriptions run on Pi's on-chain Subscription contract. Renewals don't happen on their own: the merchant (the wallet that owns the subscription service) calls the contract's `process` to collect every payment that is due.

In the Pi Browser, the client SDK's `Pi.SmartContract.Subscription.process` makes the merchant sign in the Pi Wallet and enter the passphrase each time. `SmartContract.Subscription.process` in this package does the same from your server instead: it builds the call, signs it with the merchant wallet's secret seed and sends it straight to the Pi Soroban RPC server. Nothing goes through the Pi Browser, so it can run from a scheduled job.

> Subscriptions are available only on Pi Testnet for now, and need Node.js 20 or later (see [Versions](#versions)).

### Example

```javascript
import { SmartContract, PiSubscriptionError } from "pi-backend";
// CommonJS: const { SmartContract, PiSubscriptionError } = require("pi-backend");

// The merchant wallet's secret seed (starts with S). Keep it on your server only, e.g. in an environment variable.
const merchantSecret = process.env.PI_MERCHANT_SECRET;
const serviceId = "0"; // your service_id on the Subscription contract
const BATCH = 20;

// 1. Preview the first batch without signing or sending. `total` is how many subscriptions to page through.
const preview = await SmartContract.Subscription.process(merchantSecret, serviceId, 0, BATCH, { mode: "simulate" });

// 2. Collect renewals, one batch per transaction.
for (let offset = 0; offset < preview.total; offset += BATCH) {
  try {
    const { txid, result } = await SmartContract.Subscription.process(merchantSecret, serviceId, offset, BATCH);
    console.log(txid, result); // { charged, failed, skipped, total }
  } catch (err) {
    if (err instanceof PiSubscriptionError && err.code === "transaction_not_confirmed") {
      // Sent, but the outcome is unknown: look up err.txid before running this batch again.
    }
    throw err;
  }
}
```

### `SmartContract.Subscription.process`

```typescript
SmartContract.Subscription.process(
  merchantSecret: string,              // the merchant wallet's secret seed (S...)
  serviceId: string | number | bigint, // the service to process (u64)
  offset: string | number,             // where to start in the service's subscription list (u32)
  limit: string | number,              // how many subscriptions to handle in this call (u32)
  options?: {
    mode?: "simulate" | "submit";      // default "submit"
    rpcUrl?: string;                   // default: Pi Testnet RPC (https://rpc.testnet.minepi.com)
    networkPassphrase?: string;        // default: "Pi Testnet"
    contractAddress?: string;          // default: the Pi Testnet Subscription contract
    timeoutSecs?: number;              // how long the transaction stays valid, default 180
  }
): Promise<ProcessResult | { txid: string; ledger: number; result: ProcessResult }>

type ProcessResult = {
  charged: number; // subscriptions charged in this batch
  failed: number;  // charges that failed; the contract turned those subscriptions' auto-renew off
  skipped: number; // not due yet, not auto-renewing, or missing
  total: number;   // all subscriptions of the service
};
```

What it does, in order:

1. Checks the arguments. Nothing is sent if one is invalid.
2. Loads the merchant account and builds `process(merchant, serviceId, offset, limit)`, with the merchant's public key derived from the secret.
3. Simulates the call. With `mode: "simulate"` it stops here and resolves with the `ProcessResult` the call would produce.
4. With `mode: "submit"` (the default) it signs the call, sends it and waits for the result (up to `timeoutSecs` plus a few seconds), then resolves with `{ txid, ledger, result }`.

The contract charges every auto-renewing subscription in `[offset, offset + limit)` whose renewal is due. A failed charge (low balance, used-up allowance, or more than one period late) doesn't stop the batch: it's counted in `failed` and that subscription's auto-renew is turned off. Run `process` at least once per billing period.

Errors are thrown as `PiSubscriptionError` with a `code`:

| Code | Meaning |
| --- | --- |
| `invalid_merchant_secret`, `invalid_service_id`, `invalid_offset`, `invalid_limit`, `invalid_mode`, `invalid_timeout`, `invalid_contract_address` | An argument is invalid. Nothing was sent. |
| `account_not_found` | The merchant account doesn't exist on the network. |
| `simulation_failed` | The contract refused the call; `contractErrorName` says why (e.g. `NotServiceOwner`, `ServiceShutdown`). Nothing was sent. |
| `state_archived` | Contract state the call needs is archived and must be restored first. |
| `fee_too_high` | The fee is larger than a transaction can carry. Use a smaller `limit`. |
| `transaction_rejected` | The RPC server didn't accept the transaction (e.g. `txInsufficientBalance`); `detail` has the result code. |
| `transaction_failed` | The transaction was included but failed; `txid` identifies it. |
| `transaction_not_confirmed` | Sent, but the outcome is unknown. Look up `txid` before sending again. |
| `unexpected_response`, `rpc_error` | The RPC server answered with something the SDK couldn't read, or a request to it failed. |

The merchant account pays the fee. The contract extends the lifetime of every entry it touches, so most of the fee is rent: expect several Pi per call. The SDK adds 50% headroom to the simulated resource fee (the unused part is refunded), so keep that much available in the merchant account.

## Troubleshooting

### Error when creating a payment: "You need to complete the ongoing payment first to create a new one."

See documentation for the `getIncompleteServerPayments` above.

