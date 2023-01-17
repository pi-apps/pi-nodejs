# Pi Network - Node.JS server-side package

This is an official Pi Network Node.js npm package you can use to integrate the Pi Network apps platform with a node.js backend application.

## Overall flow for A2U (App-to-User) payment

To create an A2U payment using the Pi Node.js SDK, here's an overall flow you need to follow:

1. Initialize the SDK
> You'll be initializing the SDK with the Pi API Key of your app and the Private Seed of your app wallet.

2. Create an A2U payment
> `createPayment` method will handle everything from the beginning to the end of the process.
> **WARNING** Since this single method takes care of the entire process, *i.e. requesting a payment to the Pi server, submitting the transaction to the Pi blockchain and completing the payment,* it can take a few seconds, roughly less than 10 seconds, to complete the call.

3. Check the payment status
> When `createPayment` is completed successfully, it returns the payment object you created on the Pi server. Check the `status` field to make sure everything looks correct.