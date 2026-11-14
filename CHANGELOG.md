# Changelog

## 1.0.0 (unreleased)

A new major version. Projects on 0.1.x are not affected: their `^0.1.3` range never resolves to 1.x, and 0.1.3 stays published. See "Upgrading from 0.1.x to 1.x" in the README.

Published under the npm `next` tag (`npm install pi-backend@next`). The default `latest` tag stays on 0.1.3 until 1.x is announced as the new default.

### Added

- `SmartContract.Subscription.process(merchantSecret, serviceId, offset, limit, options?)`: runs the Pi Subscription contract's `process` from your server. It signs with the merchant wallet's secret seed and sends the call straight to the Pi Soroban RPC server, so renewals can be collected by a scheduled job instead of through the Pi Browser. Same path and argument order as the client SDK's `Pi.SmartContract.Subscription.process`.
- `PiSubscriptionError`, with a `code` for each failure and the contract error's name when the contract refuses a call.
- A CommonJS build (`dist/index.cjs`) next to the ES module build (`dist/index.js`), so both `import` and `require()` work.

### Breaking changes

- **Node.js 20 or later** is required (`@stellar/stellar-sdk` 14).
- The `PiNetwork` constructor no longer takes a third `options` argument (`{ baseUrl }`); the Platform API URL is always `https://api.minepi.com`.
- Payment methods throw `PiPaymentError` (with a `code`) instead of plain `Error`s or raw axios errors, and validate their arguments up front (e.g. `missing_api_key`, `invalid_wallet_private_seed`).

### Fixed

- The package's config file is found when the package is loaded as an ES module.
- Dependencies are no longer bundled into the build, so the Stellar SDK's own `require()` calls keep working.

## 0.1.3

The version current users run. Node.js versions older than 20 are supported. A2U payments only.
