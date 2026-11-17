import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import * as StellarSdk from "@stellar/stellar-sdk";
import { SmartContract } from "../src/subscription";
import { PiSubscriptionError } from "../src/PiSubscriptionError";
import type { ProcessMode, ProcessResult, ProcessSubmitResult } from "../src/types/subscription";

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

const RESULT = { charged: 2, failed: 1, skipped: 3, total: 6 };
const { xdr } = StellarSdk;

// Raw RPC answers, in the shapes the Soroban RPC server sends them (what the _-prefixed Server methods return).
const accountEntries = (sequence = "41") => ({
  latestLedger: 100,
  entries: [
    {
      key: "",
      xdr: xdr.LedgerEntryData.account(
        new xdr.AccountEntry({
          accountId: merchant.xdrAccountId(),
          balance: xdr.Int64.fromString("1000000000"),
          seqNum: xdr.Int64.fromString(sequence),
          numSubEntries: 0,
          inflationDest: null,
          flags: 0,
          homeDomain: "",
          thresholds: Buffer.from([1, 0, 0, 0]),
          signers: [],
          ext: new xdr.AccountEntryExt(0),
        })
      ).toXDR("base64"),
    },
  ],
});

const rawSimulation = (
  retval: StellarSdk.xdr.ScVal = processResultScVal(RESULT),
  minResourceFee: unknown = "1000"
) => ({
  id: "sim",
  latestLedger: 100,
  minResourceFee,
  transactionData: new StellarSdk.SorobanDataBuilder().build().toXDR("base64"),
  results: [{ auth: [], xdr: retval.toXDR("base64") }],
});

const resultMetaXdr = (returnValue: StellarSdk.xdr.ScVal | null) =>
  new xdr.TransactionMeta(
    3,
    new xdr.TransactionMetaV3({
      ext: new xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta:
        returnValue === null
          ? null
          : new xdr.SorobanTransactionMeta({
              ext: new xdr.SorobanTransactionMetaExt(0),
              events: [],
              returnValue,
              diagnosticEvents: [],
            }),
    })
  ).toXDR("base64");

const rawSuccess = (returnValue: StellarSdk.xdr.ScVal | null = processResultScVal(RESULT), ledger: unknown = 101) => ({
  status: "SUCCESS",
  ledger,
  resultMetaXdr: resultMetaXdr(returnValue),
});

const transactionResultXdr = (result: StellarSdk.xdr.TransactionResultResult) =>
  new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString("100"),
    result,
    ext: new xdr.TransactionResultExt(0),
  }).toXDR("base64");

type Hook = (arg: never) => unknown;

// Stubs the RPC server's raw methods. Each call records what it was given so a test can inspect the transaction.
const stubServer = (overrides: Partial<Record<"ledgerEntries" | "simulate" | "send" | "transaction", Hook>> = {}) => {
  const calls = {
    ledgerEntries: 0,
    simulated: [] as StellarSdk.Transaction[],
    sent: [] as StellarSdk.Transaction[],
    polled: [] as string[],
  };
  const proto = rpc.Server.prototype;
  mock.method(proto, "_getLedgerEntries", async () => {
    calls.ledgerEntries += 1;
    return overrides.ledgerEntries ? overrides.ledgerEntries(undefined as never) : accountEntries();
  });
  mock.method(proto, "_simulateTransaction", async (tx: StellarSdk.Transaction) => {
    calls.simulated.push(tx);
    return overrides.simulate ? overrides.simulate(tx as never) : rawSimulation();
  });
  mock.method(proto, "_sendTransaction", async (tx: StellarSdk.Transaction) => {
    calls.sent.push(tx);
    return overrides.send
      ? overrides.send(tx as never)
      : { status: "PENDING", hash: tx.hash().toString("hex"), latestLedger: 100 };
  });
  mock.method(proto, "_getTransaction", async (hash: string) => {
    calls.polled.push(hash);
    return overrides.transaction ? overrides.transaction(hash as never) : rawSuccess();
  });
  return calls;
};

// Makes the polling deadline pass right after the first getTransaction, without waiting for it.
const expireAfterFirstPoll = () => {
  const realNow = Date.now;
  return () => {
    mock.method(Date, "now", () => realNow() + 10 * 365 * 24 * 3600 * 1000);
    return { status: "NOT_FOUND", latestLedger: 100 };
  };
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

  it("accepts offset and limit as bigints, like the service ID", async () => {
    const calls = stubServer();
    await Subscription.process(merchant.secret(), BigInt(7), BigInt(20), BigInt(10), { ...options, mode: "simulate" });
    assert.deepEqual(invokedArgs(calls.simulated[0]).args, [merchant.publicKey(), BigInt(7), 20, 10]);
  });

  it("types the result by mode, so mode-specific fields need no narrowing", async () => {
    stubServer();
    const preview: ProcessResult = await Subscription.process(merchant.secret(), 7, 0, 20, {
      ...options,
      mode: "simulate",
    });
    // @ts-expect-error a simulation has no txid
    assert.equal(preview.txid, undefined);
    const submitted: ProcessSubmitResult = await Subscription.process(merchant.secret(), 7, 0, 20, options);
    assert.equal(submitted.result.total, preview.total);
    const explicit: ProcessSubmitResult = await Subscription.process(merchant.secret(), 7, 0, 20, {
      ...options,
      mode: "submit",
    });
    assert.equal(explicit.ledger, 101);
    // A mode held in a ProcessMode variable resolves to either shape.
    const mode = "simulate" as ProcessMode;
    const either: ProcessResult | ProcessSubmitResult = await Subscription.process(merchant.secret(), 7, 0, 20, {
      ...options,
      mode,
    });
    assert.equal("total" in either && either.total, 6);
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
    [
      "a negative bigint offset",
      () => Subscription.process(merchant.secret(), 7, BigInt(-1), 20, options),
      "invalid_offset",
    ],
    ["a limit above u32", () => Subscription.process(merchant.secret(), 7, 0, 4294967296, options), "invalid_limit"],
    [
      "a bigint limit above u32",
      () => Subscription.process(merchant.secret(), 7, 0, BigInt("4294967296"), options),
      "invalid_limit",
    ],
    [
      "an unknown mode",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, mode: "sign" as never }),
      "invalid_mode",
    ],
    [
      "the mode as a 5th argument instead of in options",
      () => Subscription.process(merchant.secret(), 7, 0, 20, "simulate" as never),
      "invalid_options",
    ],
    [
      "a timeout too large for the time bounds",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, timeoutSecs: 2 ** 32 }),
      "invalid_timeout",
    ],
    [
      "an infinite timeout",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, timeoutSecs: Infinity }),
      "invalid_timeout",
    ],
    [
      "a zero timeout",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, timeoutSecs: 0 }),
      "invalid_timeout",
    ],
    [
      "an RPC URL that is not http(s)",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, rpcUrl: "rpc.example" }),
      "invalid_rpc_url",
    ],
    [
      "an RPC URL with another scheme",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, rpcUrl: "ftp://rpc.example" }),
      "invalid_rpc_url",
    ],
    [
      "an empty network passphrase",
      () => Subscription.process(merchant.secret(), 7, 0, 20, { ...options, networkPassphrase: "" }),
      "invalid_network_passphrase",
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
      assert.equal(calls.ledgerEntries, 0);
      assert.equal(calls.simulated.length, 0);
    });
  }

  it("accepts an RPC URL whose scheme is upper case", async () => {
    const calls = stubServer();
    await Subscription.process(merchant.secret(), 7, 0, 20, {
      ...options,
      rpcUrl: "HTTPS://RPC.example",
      mode: "simulate",
    });
    assert.equal(calls.simulated.length, 1);
  });

  it("treats options given as null like no options (submit with the defaults)", async () => {
    const calls = stubServer();
    const result = await Subscription.process(merchant.secret(), 7, 0, 20, null as unknown as undefined);
    assert.equal(result.txid, calls.sent[0].hash().toString("hex"));
  });

  describe("reading the merchant account", () => {
    it("reports an account the RPC server doesn't have as account_not_found", async () => {
      stubServer({ ledgerEntries: () => ({ latestLedger: 100, entries: [] }) });
      await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "account_not_found");
    });

    it("keeps the message of a JSON-RPC error, which the Stellar SDK throws as a plain object", async () => {
      stubServer({ ledgerEntries: () => Promise.reject({ code: -32601, message: "method not found" }) });
      const err = await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "rpc_error");
      assert.equal(err.detail, "getLedgerEntries: method not found");
    });

    it("doesn't wait forever for a request that never answers", async () => {
      mock.timers.enable({ apis: ["setTimeout"] });
      try {
        stubServer({ ledgerEntries: () => new Promise(() => {}) });
        const pending = Subscription.process(merchant.secret(), 7, 0, 20, options);
        for (let i = 0; i < 5; i++) await Promise.resolve(); // let process() reach the request
        mock.timers.tick(30_000);
        const err = await rejectsWith(pending, "rpc_error");
        assert.match(String(err.detail), /no answer within 30 s/);
      } finally {
        mock.timers.reset();
      }
    });

    it("reports a failing RPC server as rpc_error, not as a missing account", async () => {
      for (const ledgerEntries of [
        () => undefined,
        () => "<html>",
        () => Promise.reject(new Error("Method not found")),
      ]) {
        stubServer({ ledgerEntries });
        await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "rpc_error");
        mock.restoreAll();
      }
    });

    it("refuses a sequence number whose next one doesn't fit, before signing", async () => {
      const calls = stubServer({ ledgerEntries: () => accountEntries("9223372036854775807") });
      await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "unexpected_response");
      assert.equal(calls.sent.length, 0);
    });
  });

  describe("simulation", () => {
    it("names the contract error when the simulation fails", async () => {
      const calls = stubServer({
        simulate: () => ({ id: "sim", latestLedger: 100, error: "HostError: Error(Contract, #9)" }),
      });
      const err = await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "simulation_failed");
      assert.equal(err.contractErrorName, "NotServiceOwner");
      assert.equal(err.contractErrorCode, 9);
      assert.equal(calls.sent.length, 0);
    });

    it("reports archived contract state as state_archived", async () => {
      const sim = rawSimulation();
      stubServer({
        simulate: () => ({ ...sim, restorePreamble: { minResourceFee: "10", transactionData: sim.transactionData } }),
      });
      await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "state_archived");
    });

    it("reports an unreadable simulation as unexpected_response", async () => {
      stubServer({ simulate: () => ({ ...rawSimulation(), transactionData: "YWI=" }) });
      await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "unexpected_response");
    });

    it("never signs a minResourceFee that isn't a non-negative integer", async () => {
      for (const fee of ["-2000000", "abc", "1.5", undefined]) {
        const calls = stubServer({ simulate: () => ({ ...rawSimulation(), minResourceFee: fee }) });
        await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "unexpected_response");
        assert.equal(calls.sent.length, 0, `fee ${fee}`);
        mock.restoreAll();
      }
    });

    it("refuses a fee larger than a transaction can carry", async () => {
      const calls = stubServer({ simulate: () => rawSimulation(undefined, "99999999999") });
      await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "fee_too_high");
      assert.equal(calls.sent.length, 0);
    });
  });

  describe("sending", () => {
    it("reports a refused send as transaction_rejected, with the txid and the result code", async () => {
      for (const [answer, detail] of [
        [{ status: "TRY_AGAIN_LATER" }, "TRY_AGAIN_LATER"],
        [{ status: "ERROR", errorResultXdr: transactionResultXdr(xdr.TransactionResultResult.txBadSeq()) }, "txBadSeq"],
        [{ status: "ERROR", errorResultXdr: "!!! not base64" }, "ERROR"],
      ] as const) {
        const calls = stubServer({ send: () => answer });
        const err = await rejectsWith(
          Subscription.process(merchant.secret(), 7, 0, 20, options),
          "transaction_rejected"
        );
        assert.equal(err.detail, detail);
        assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
        assert.equal(calls.polled.length, 0);
        mock.restoreAll();
      }
    });

    it("polls for a send status it doesn't know, since the transaction may still land", async () => {
      const calls = stubServer({ send: () => ({ status: "SOMETHING_NEW" }) });
      const result = await Subscription.process(merchant.secret(), 7, 0, 20, options);
      assert.deepEqual(result.result, RESULT);
      assert.equal(calls.polled.length, 1);
    });

    it("keeps the txid when the send request fails or answers without a result", async () => {
      for (const send of [() => Promise.reject(new Error("socket hang up")), () => undefined]) {
        const calls = stubServer({ send });
        const err = await rejectsWith(
          Subscription.process(merchant.secret(), 7, 0, 20, options),
          "transaction_not_confirmed"
        );
        assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
        mock.restoreAll();
      }
    });
  });

  describe("waiting for the outcome", () => {
    it("keeps the txid when the outcome is unknown at the deadline, so the caller can look it up", async () => {
      const calls = stubServer({ transaction: expireAfterFirstPoll() });
      const err = await rejectsWith(
        Subscription.process(merchant.secret(), 7, 0, 20, options),
        "transaction_not_confirmed"
      );
      assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
      assert.equal(err.detail, "NOT_FOUND");
    });

    it("retries a failed getTransaction instead of giving up", async () => {
      let polls = 0;
      stubServer({ transaction: () => (++polls === 1 ? Promise.reject(new Error("blip")) : rawSuccess()) });
      const result = await Subscription.process(merchant.secret(), 7, 0, 20, options);
      assert.deepEqual(result.result, RESULT);
      assert.equal(polls, 2);
    });

    it("reports a failed transaction as transaction_failed with its result code", async () => {
      const calls = stubServer({
        transaction: () => ({
          status: "FAILED",
          resultXdr: transactionResultXdr(xdr.TransactionResultResult.txFailed([])),
        }),
      });
      const err = await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), "transaction_failed");
      assert.equal(err.detail, "txFailed");
      assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
    });

    it("keeps the txid when a successful transaction's result can't be read", async () => {
      for (const [answer, code] of [
        [rawSuccess(null), "unexpected_response"],
        [rawSuccess(StellarSdk.nativeToScVal("not a ProcessResult")), "unexpected_response"],
        [rawSuccess(undefined, "x"), "unexpected_response"],
        [{ status: "SUCCESS", ledger: 101, resultMetaXdr: "!!!" }, "unexpected_response"],
      ] as const) {
        const calls = stubServer({ transaction: () => answer });
        const err = await rejectsWith(Subscription.process(merchant.secret(), 7, 0, 20, options), code);
        assert.equal(err.txid, calls.sent[0].hash().toString("hex"));
        mock.restoreAll();
      }
    });
  });
});
