import * as StellarSdk from "@stellar/stellar-sdk";
import { IntegerInput, ProcessOptions, ProcessResult, ProcessSubmitResult } from "./types/subscription";
import { parseContractError, PiSubscriptionError, PiSubscriptionErrorCode } from "./PiSubscriptionError";

// Inclusion fee in stroops (0.01 Pi), the same as the client SDK's smart-contract calls.
const INCLUSION_FEE = "100000";
// Headroom on the simulated resource fee. process() extends the TTL of every entry it touches, and the rent
// for that can grow between simulation and inclusion; a too-tight fee fails with insufficient_refundable_fee.
// The unused refundable part is returned to the merchant.
const RESOURCE_FEE_MARGIN_PERCENT = BigInt(150);
// Defaults for Pi Testnet, the only network the Subscription contract is on. Each can be overridden in options.
const DEFAULT_RPC_URL = "https://rpc.testnet.minepi.com";
const DEFAULT_NETWORK_PASSPHRASE = "Pi Testnet";
const DEFAULT_CONTRACT_ADDRESS = "CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV";
const DEFAULT_TIMEOUT_SECS = 180;
const U32_MAX_BIGINT = BigInt(0xffffffff);
const U64_MAX = BigInt("18446744073709551615");
// The account sequence is an int64, and the transaction uses the next one.
const SEQUENCE_MAX = BigInt("9223372036854775806");
const TIMEOUT_MAX = 0xffffffff;
const POLL_INTERVAL_MS = 1000;
// Per RPC request, so one request that never answers can't hold process() forever. (rpc.Server accepts a timeout
// option but doesn't apply it, so it's enforced here.)
const REQUEST_TIMEOUT_MS = 30_000;

// Integer arguments may be a number, a bigint or a string of digits (IDs read from a database or a request).
const toBigInt = (value: unknown): bigint | null => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
};

const toU64 = (value: unknown, code: PiSubscriptionErrorCode): bigint => {
  const parsed = toBigInt(value);
  if (parsed === null || parsed < BigInt(0) || parsed > U64_MAX) throw new PiSubscriptionError(code);
  return parsed;
};

const toU32 = (value: unknown, code: PiSubscriptionErrorCode): number => {
  const parsed = toBigInt(value);
  if (parsed === null || parsed < BigInt(0) || parsed > U32_MAX_BIGINT) throw new PiSubscriptionError(code);
  return Number(parsed);
};

// An http(s) URL, normalized (e.g. the scheme lowercased, which the Stellar SDK requires), or null.
const toHttpUrl = (value: unknown): URL | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The Stellar SDK throws a JSON-RPC error as the plain { code, message } object, not as an Error.
const errorText = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (isObject(err) && typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
};

// txid is set once the transaction has been sent, so an unreadable result still says which transaction it was.
const toProcessResult = (value: StellarSdk.xdr.ScVal, txid?: string): ProcessResult => {
  let native: Record<string, unknown> | null;
  try {
    native = StellarSdk.scValToNative(value) as Record<string, unknown> | null;
  } catch (err) {
    throw new PiSubscriptionError("unexpected_response", { data: { txid, detail: errorText(err) } });
  }
  const keys = ["charged", "failed", "skipped", "total"];
  if (!native || typeof native !== "object" || !keys.every((key) => typeof native[key] === "number")) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { txid, detail: "The contract did not return a ProcessResult." },
    });
  }
  return {
    charged: native.charged as number,
    failed: native.failed as number,
    skipped: native.skipped as number,
    total: native.total as number,
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Rejects when the request hasn't answered within ms. The request itself can't be aborted, but it's no longer waited for.
const withTimeout = <T>(request: Promise<T>, ms: number, method: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method}: no answer within ${Math.ceil(ms / 1000)} s`)), ms);
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

// The RPC methods below are called through the Stellar SDK's raw variants (_getLedgerEntries, _simulateTransaction,
// _sendTransaction, _getTransaction) and their answers are checked here, so that a failing RPC server is reported
// as such (not as a missing account or an unknown outcome), and nothing out of range is ever signed.

const loadAccount = async (server: StellarSdk.rpc.Server, publicKey: string): Promise<StellarSdk.Account> => {
  const key = StellarSdk.xdr.LedgerKey.account(
    new StellarSdk.xdr.LedgerKeyAccount({ accountId: StellarSdk.Keypair.fromPublicKey(publicKey).xdrPublicKey() })
  );
  let raw: unknown;
  try {
    raw = await withTimeout(server._getLedgerEntries(key), REQUEST_TIMEOUT_MS, "getLedgerEntries");
  } catch (err) {
    throw new PiSubscriptionError("rpc_error", { data: { detail: `getLedgerEntries: ${errorText(err)}` } });
  }
  if (!isObject(raw) || typeof raw.latestLedger !== "number") {
    throw new PiSubscriptionError("rpc_error", { data: { detail: "getLedgerEntries: no result" } });
  }
  const entries = raw.entries ?? [];
  if (!Array.isArray(entries)) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { detail: "getLedgerEntries: entries is not a list" },
    });
  }
  if (entries.length === 0) throw new PiSubscriptionError("account_not_found");
  let sequence: bigint;
  try {
    const data = StellarSdk.xdr.LedgerEntryData.fromXDR((entries[0] as { xdr: string }).xdr, "base64");
    sequence = BigInt(data.account().seqNum().toString());
  } catch (err) {
    throw new PiSubscriptionError("unexpected_response", { data: { detail: `Account entry: ${errorText(err)}` } });
  }
  if (sequence < BigInt(0) || sequence > SEQUENCE_MAX) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { detail: `Account sequence out of range: ${sequence}` },
    });
  }
  return new StellarSdk.Account(publicKey, sequence.toString());
};

const simulate = async (
  server: StellarSdk.rpc.Server,
  transaction: StellarSdk.Transaction
): Promise<StellarSdk.rpc.Api.SimulateTransactionResponse> => {
  let raw: unknown;
  try {
    raw = await withTimeout(server._simulateTransaction(transaction), REQUEST_TIMEOUT_MS, "simulateTransaction");
  } catch (err) {
    throw new PiSubscriptionError("rpc_error", { data: { detail: `simulateTransaction: ${errorText(err)}` } });
  }
  if (!isObject(raw)) {
    throw new PiSubscriptionError("rpc_error", { data: { detail: "simulateTransaction: no result" } });
  }
  try {
    return StellarSdk.rpc.parseRawSimulation(raw as unknown as StellarSdk.rpc.Api.RawSimulateTransactionResponse);
  } catch (err) {
    throw new PiSubscriptionError("unexpected_response", { data: { detail: `Simulation: ${errorText(err)}` } });
  }
};

// The result code of a TransactionResult (e.g. "txBadSeq"), or undefined when it can't be read.
const resultCode = (resultXdr: unknown): string | undefined => {
  if (typeof resultXdr !== "string") return undefined;
  try {
    return StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, "base64").result().switch().name;
  } catch {
    return undefined;
  }
};

const send = async (server: StellarSdk.rpc.Server, transaction: StellarSdk.Transaction, txid: string) => {
  let raw: unknown;
  try {
    raw = await withTimeout(server._sendTransaction(transaction), REQUEST_TIMEOUT_MS, "sendTransaction");
  } catch (err) {
    // The request may have reached the server: the transaction can still land under this hash.
    throw new PiSubscriptionError("transaction_not_confirmed", { data: { txid, detail: errorText(err) } });
  }
  if (!isObject(raw)) {
    throw new PiSubscriptionError("transaction_not_confirmed", {
      data: { txid, detail: "sendTransaction: no result" },
    });
  }
  // Only these two mean the transaction was not accepted. Anything else (PENDING, DUPLICATE, or a status this
  // SDK doesn't know) may still land, so it's polled for.
  if (raw.status === "ERROR" || raw.status === "TRY_AGAIN_LATER") {
    throw new PiSubscriptionError("transaction_rejected", {
      data: { txid, detail: resultCode(raw.errorResultXdr) ?? String(raw.status) },
    });
  }
};

// The ProcessResult a successful transaction returned. The transaction succeeded, so anything missing or
// unreadable here is unexpected_response, with the txid.
const successResult = (raw: Record<string, unknown>, txid: string): ProcessSubmitResult => {
  const ledger = raw.ledger;
  if (typeof ledger !== "number" || !Number.isSafeInteger(ledger) || ledger < 0) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { txid, detail: `Transaction ledger: ${JSON.stringify(ledger)}` },
    });
  }
  let returnValue: StellarSdk.xdr.ScVal | null | undefined;
  try {
    const meta = StellarSdk.xdr.TransactionMeta.fromXDR(raw.resultMetaXdr as string, "base64");
    const sorobanMeta =
      meta.switch() === 3 ? meta.v3().sorobanMeta() : meta.switch() === 4 ? meta.v4().sorobanMeta() : null;
    returnValue = sorobanMeta?.returnValue();
  } catch (err) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { txid, detail: `Transaction result: ${errorText(err)}` },
    });
  }
  if (!returnValue) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { txid, detail: "The transaction succeeded but returned no value." },
    });
  }
  return { txid, ledger, result: toProcessResult(returnValue, txid) };
};

// Polls getTransaction until the deadline. A failed request or an answer without a result is retried, so one
// network blip doesn't end the wait early.
const waitForTransaction = async (
  server: StellarSdk.rpc.Server,
  txid: string,
  deadlineMs: number
): Promise<ProcessSubmitResult> => {
  let lastDetail: string | undefined;
  for (;;) {
    let raw: unknown;
    try {
      // Never past the deadline (but at least 1 s, so a late poll still gets an answer).
      const ms = Math.min(REQUEST_TIMEOUT_MS, Math.max(deadlineMs - Date.now(), 1000));
      raw = await withTimeout(server._getTransaction(txid), ms, "getTransaction");
    } catch (err) {
      lastDetail = errorText(err);
    }
    if (isObject(raw)) {
      if (raw.status === "SUCCESS") return successResult(raw, txid);
      if (raw.status === "FAILED") {
        throw new PiSubscriptionError("transaction_failed", { data: { txid, detail: resultCode(raw.resultXdr) } });
      }
      lastDetail = String(raw.status);
    } else if (raw !== undefined || lastDetail === undefined) {
      lastDetail = "getTransaction: no result";
    }
    if (Date.now() > deadlineMs) {
      throw new PiSubscriptionError("transaction_not_confirmed", { data: { txid, detail: lastDetail } });
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

/**
 * Runs the subscription contract's process() for a service, signed with the merchant's own secret on the
 * server, and sends it straight to the Soroban RPC server: no Pi Browser, no wallet passphrase screen.
 *
 * process() charges every due, auto-renewing subscription in [offset, offset + limit) of the service's
 * subscription list. Read the merchant secret from your server's environment; never send it to a client.
 *
 * - mode "submit" (default): signs, sends, waits for the result and resolves with the txid, ledger and
 *   ProcessResult.
 * - mode "simulate": resolves with the ProcessResult the call would produce, without signing or sending.
 *
 * The call uses the merchant account's next sequence number. If the same wallet also sends other transactions
 * (for example A2U payments with PiNetwork created from the same seed), don't run them at the same time as
 * process(): two transactions built on the same sequence number can't both land. When process() loses, it fails
 * with transaction_rejected (detail "txBadSeq") if the other transaction had already landed when it was sent, or
 * the RPC server drops it after accepting it and it ends in transaction_not_confirmed (detail "NOT_FOUND") once
 * its validity window has passed. Either way that batch did not run and can be run again. Run them one after the
 * other, or use separate wallets.
 */
function processSubscriptions(
  merchantSecret: string,
  serviceId: IntegerInput,
  offset: IntegerInput,
  limit: IntegerInput,
  options: ProcessOptions & { mode: "simulate" }
): Promise<ProcessResult>;
function processSubscriptions(
  merchantSecret: string,
  serviceId: IntegerInput,
  offset: IntegerInput,
  limit: IntegerInput,
  options?: ProcessOptions & { mode?: "submit" }
): Promise<ProcessSubmitResult>;
// For a mode held in a variable typed ProcessMode.
function processSubscriptions(
  merchantSecret: string,
  serviceId: IntegerInput,
  offset: IntegerInput,
  limit: IntegerInput,
  options?: ProcessOptions
): Promise<ProcessResult | ProcessSubmitResult>;
async function processSubscriptions(
  merchantSecret: string,
  serviceId: IntegerInput,
  offset: IntegerInput,
  limit: IntegerInput,
  options: ProcessOptions = {}
): Promise<ProcessResult | ProcessSubmitResult> {
  if (typeof merchantSecret !== "string" || !StellarSdk.StrKey.isValidEd25519SecretSeed(merchantSecret)) {
    throw new PiSubscriptionError("invalid_merchant_secret");
  }
  const serviceIdValue = toU64(serviceId, "invalid_service_id");
  const offsetValue = toU32(offset, "invalid_offset");
  const limitValue = toU32(limit, "invalid_limit");
  // From JavaScript, a mode passed as the 5th argument ("simulate") would otherwise be ignored and submit.
  if (options === null) options = {};
  if (typeof options !== "object" || Array.isArray(options)) throw new PiSubscriptionError("invalid_options");
  const mode = options.mode ?? "submit";
  if (mode !== "simulate" && mode !== "submit") throw new PiSubscriptionError("invalid_mode");
  const timeoutSecs = options.timeoutSecs ?? DEFAULT_TIMEOUT_SECS;
  // Bounded so the transaction's time bounds (u64) can't wrap around.
  if (!Number.isInteger(timeoutSecs) || timeoutSecs <= 0 || timeoutSecs > TIMEOUT_MAX) {
    throw new PiSubscriptionError("invalid_timeout");
  }

  const rpcUrl = toHttpUrl(options.rpcUrl ?? DEFAULT_RPC_URL);
  if (!rpcUrl) throw new PiSubscriptionError("invalid_rpc_url");
  const networkPassphrase = options.networkPassphrase ?? DEFAULT_NETWORK_PASSPHRASE;
  if (typeof networkPassphrase !== "string" || networkPassphrase === "") {
    throw new PiSubscriptionError("invalid_network_passphrase");
  }
  const contractAddress = options.contractAddress ?? DEFAULT_CONTRACT_ADDRESS;
  if (typeof contractAddress !== "string" || !StellarSdk.StrKey.isValidContract(contractAddress)) {
    throw new PiSubscriptionError("invalid_contract_address");
  }

  const keypair = StellarSdk.Keypair.fromSecret(merchantSecret);
  const server = new StellarSdk.rpc.Server(rpcUrl.href, { allowHttp: rpcUrl.protocol === "http:" });
  const account = await loadAccount(server, keypair.publicKey());

  const operation = new StellarSdk.Contract(contractAddress).call(
    "process",
    new StellarSdk.Address(keypair.publicKey()).toScVal(),
    StellarSdk.nativeToScVal(serviceIdValue, { type: "u64" }),
    StellarSdk.nativeToScVal(offsetValue, { type: "u32" }),
    StellarSdk.nativeToScVal(limitValue, { type: "u32" })
  );
  const transaction = new StellarSdk.TransactionBuilder(account, { fee: INCLUSION_FEE, networkPassphrase })
    .addOperation(operation)
    .setTimeout(timeoutSecs)
    .build();

  const simulation = await simulate(server, transaction);
  if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
    throw new PiSubscriptionError("simulation_failed", {
      data: {
        detail: simulation.error,
        ...parseContractError(simulation.error),
      },
    });
  }
  if (StellarSdk.rpc.Api.isSimulationRestore(simulation)) {
    throw new PiSubscriptionError("state_archived");
  }
  if (!simulation.result) {
    throw new PiSubscriptionError("simulation_failed", { data: { detail: "The simulation returned no result." } });
  }

  if (mode === "simulate") {
    return toProcessResult(simulation.result.retval);
  }

  // A negative or non-integer fee must never be signed.
  if (typeof simulation.minResourceFee !== "string" || !/^\d+$/.test(simulation.minResourceFee)) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { detail: `minResourceFee is not a non-negative integer: ${String(simulation.minResourceFee)}` },
    });
  }
  const resourceFee = (BigInt(simulation.minResourceFee) * RESOURCE_FEE_MARGIN_PERCENT) / BigInt(100);
  const fee = BigInt(INCLUSION_FEE) + resourceFee;
  if (fee > U32_MAX_BIGINT) throw new PiSubscriptionError("fee_too_high", { data: { detail: `${fee} stroops` } });
  simulation.transactionData.setResourceFee(resourceFee);
  const prepared = StellarSdk.rpc.assembleTransaction(transaction, simulation).build();
  prepared.sign(keypair);
  const txid = prepared.hash().toString("hex");

  await send(server, prepared, txid);
  // Poll past the transaction's validity window: once it has passed, a transaction that is still not
  // found can no longer be included.
  const deadlineMs = (Number(prepared.timeBounds?.maxTime) + 10) * 1000;
  return waitForTransaction(server, txid, deadlineMs);
}

const Subscription = { process: processSubscriptions };
export const SmartContract = { Subscription };
