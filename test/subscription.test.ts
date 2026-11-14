import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import * as StellarSdk from "@stellar/stellar-sdk";
import { SmartContract } from "../src/subscription";
import { PiSubscriptionError } from "../src/PiSubscriptionError";

const { Subscription } = SmartContract;

const { rpc } = StellarSdk;
const merchant = StellarSdk.Keypair.random();
const CONTRACT = StellarSdk.StrKey.encodeContract(Buffer.alloc(32, 1));
const options = { rpcUrl: "https://rpc.example", networkPassphrase: "Pi Testnet", contractAddress: CONTRACT };

const processResultScVal = (result: { charged: number; failed: number; skipped: number; total: number }) =>
  StellarSdk.nativeToScVal(result, {
    type: {
      charged: ["symbol", "u32"],
      failed: ["symbol", "u32"],
      skipped: ["symbol", "u32"],
      total: ["symbol", "u32"],
    },
  });

const simulated = (retval: StellarSdk.xdr.ScVal, minResourceFee = "1000") =>
  ({
    _parsed: true,
    id: "sim",
    latestLedger: 100,
    events: [],
    minResourceFee,
    transactionData: new StellarSdk.SorobanDataBuilder(),
    result: { auth: [], retval },
  }) as unknown as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;

// Stubs the RPC server. Each call records what it was given so a test can inspect the transaction.
const stubServer = (
  overrides: Partial<Record<"getAccount" | "simulate" | "send" | "poll", (arg: never) => unknown>> = {}
) => {
  const calls = {
    simulated: [] as StellarSdk.Transaction[],
    sent: [] as StellarSdk.Transaction[],
    polled: [] as string[],
  };
  const proto = rpc.Server.prototype;
  mock.method(proto, "getAccount", async (publicKey: string) =>
    overrides.getAccount ? overrides.getAccount(publicKey as never) : new StellarSdk.Account(publicKey, "41")
  );
  mock.method(proto, "simulateTransaction", async (tx: StellarSdk.Transaction) => {
    calls.simulated.push(tx);
    return overrides.simulate
      ? overrides.simulate(tx as never)
      : simulated(processResultScVal({ charged: 2, failed: 1, skipped: 3, total: 6 }));
  });
  mock.method(proto, "sendTransaction", async (tx: StellarSdk.Transaction) => {
    calls.sent.push(tx);
    return overrides.send
      ? overrides.send(tx as never)
      : { status: "PENDING", hash: tx.hash().toString("hex"), latestLedger: 100 };
  });
  mock.method(proto, "pollTransaction", async (hash: string) => {
    calls.polled.push(hash);
    return overrides.poll
      ? overrides.poll(hash as never)
      : {
          status: rpc.Api.GetTransactionStatus.SUCCESS,
          ledger: 101,
          returnValue: processResultScVal({ charged: 2, failed: 1, skipped: 3, total: 6 }),
        };
  });
  return calls;
};

const invokedArgs = (tx: StellarSdk.Transaction) => {
  const op = tx.operations[0] as StellarSdk.Operation.InvokeHostFunction;
  const call = op.func.invokeContract();
  return {
    contract: StellarSdk.StrKey.encodeContract(call.contractAddress().contractId() as unknown as Buffer),
    fn: call.functionName().toString(),
    args: call.args().map((arg) => StellarSdk.scValToNative(arg)),
  };
};

const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  const err = await promise.then(
    () => assert.fail("expected a rejection"),
    (e: unknown) => e
  );
  assert.ok(err instanceof PiSubscriptionError, `expected PiSubscriptionError, got ${String(err)}`);
  assert.equal(err.code, code);
  return err;
};

afterEach(() => mock.restoreAll());

describe("Subscription.process", () => {
  it("simulate: calls process(merchant, serviceId, offset, limit) on the contract and returns the result without sending", async () => {
    const calls = stubServer();
    const result = await Subscription.process(merchant.secret(), "7", 20, 10, { ...options, mode: "simulate" });

    assert.deepEqual(result, { charged: 2, failed: 1, skipped: 3, total: 6 });
    assert.deepEqual(invokedArgs(calls.simulated[0]), {
      contract: CONTRACT,
      fn: "process",
      args: [merchant.publicKey(), BigInt(7), 20, 10],
    });
    assert.equal(calls.simulated[0].source, merchant.publicKey());
    assert.equal(calls.sent.length, 0);
  });

  it("submit: signs with the merchant key, adds headroom to the resource fee, waits and returns hash, ledger and result", async () => {
    const calls = stubServer();
    const result = await Subscription.process(merchant.secret(), BigInt(7), "0", "20", options);

    const sent = calls.sent[0];
    const txid = sent.hash().toString("hex");
    assert.deepEqual(result, { txid, ledger: 101, result: { charged: 2, failed: 1, skipped: 3, total: 6 } });
    assert.deepEqual(calls.polled, [txid]);
    assert.equal(sent.signatures.length, 1);
    assert.ok(merchant.verify(sent.hash(), sent.signatures[0].signature()));
    // 100000 inclusion + 1000 simulated resource fee * 150%
    assert.equal(sent.fee, "101500");
    assert.equal(sent.toEnvelope().v1().tx().ext().sorobanData().resourceFee().toString(), "1500");
  });

  it("defaults to the Pi Testnet RPC, passphrase and subscription contract", async () => {
    const calls = stubServer();
    await Subscription.process(merchant.secret(), 7, 0, 20, { mode: "simulate" });
    assert.equal(invokedArgs(calls.simulated[0]).contract, "CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV");
    assert.equal(calls.simulated[0].networkPassphrase, "Pi Testnet");
  });

  for (const [label, call, code] of [
    [
      "a public key instead of a secret",
      () => Subscription.process(merchant.publicKey(), 7, 0, 20, options),
      "invalid_merchant_secret",
    ],
    ["a malformed secret", () => Subscription.process("S123", 7, 0, 20, options), "invalid_merchant_secret"],
    ["a negative service ID", () => Subscription.process(merchant.secret(), -1, 0, 20, options), "invalid_service_id"],
    [
      "a service ID above u64",
      () => Subscription.process(merchant.secret(), "18446744073709551616", 0, 20, options),
      "invalid_service_id",
    ],
    ["a blank service ID", () => Subscription.process(merchant.secret(), "", 0, 20, options), "invalid_service_id"],
    ["a fractional offset", () => Subscription.process(merchant.secret(), 7, 1.5, 20, options), "invalid_offset"],
    ["a limit above u32", () => Subscription.process(merchant.secret(), 7, 0, 4294967296, options), "invalid_limit"],
    [
      "an unknown mode",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, mode: "sign" as never }),
      "invalid_mode",
    ],
    [
      "a zero timeout",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, timeoutSecs: 0 }),
      "invalid_timeout",
    ],
    [
      "an account address as the contract",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, contractAddress: merchant.publicKey() }),
      "invalid_contract_address",
    ],
  ] as const) {
    it(`rejects ${label} before calling the RPC server`, async () => {
      const calls = stubServer();
      await rejectsWith(call(), code);
      assert.equal(calls.simulated.length, 0);
    });
  }

  it("reports a missing merchant account as account_not_found", async () => {
    stubServer({ getAccount: () => Promise.reject(new Error("Account not found: G...")) });
    await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "account_not_found");
  });

  it("names the contract error when the simulation fails", async () => {
    const calls = stubServer({
      simulate: () => ({
        id: "sim",
        latestLedger: 100,
        events: [],
        _parsed: true,
        error: "HostError: Error(Contract, #9)",
      }),
    });
    const err = await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "simulation_failed");
    assert.equal(err.contractErrorName, "NotServiceOwner");
    assert.equal(err.contractErrorCode, 9);
    assert.equal(calls.sent.length, 0);
  });

  it("reports a send the RPC server refused as transaction_rejected", async () => {
    stubServer({ send: () => ({ status: "TRY_AGAIN_LATER", hash: "h", latestLedger: 100 }) });
    const err = await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "transaction_rejected");
    assert.equal(err.detail, "TRY_AGAIN_LATER");
  });

  it("keeps the hash when the outcome is unknown, so the caller can look it up instead of resending", async () => {
    const calls = stubServer({ poll: () => ({ status: rpc.Api.GetTransactionStatus.NOT_FOUND }) });
    const err = await rejectsWith(
      Subscription.process(merchant.secret(), 7, 0, 20, options),
      "transaction_not_confirmed"
    );
    assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
  });

  it("keeps the hash when the send request itself fails", async () => {
    const calls = stubServer({ send: () => Promise.reject(new Error("socket hang up")) });
    const err = await rejectsWith(
      Subscription.process(merchant.secret(), 7, 0, 20, options),
      "transaction_not_confirmed"
    );
    assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
  });
});
