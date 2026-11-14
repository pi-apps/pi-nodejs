import * as StellarSdk from "@stellar/stellar-sdk";
import { ProcessOptions, ProcessResult, ProcessSubmitResult } from "./types/subscription";
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
const U32_MAX = 0xffffffff;
const U32_MAX_BIGINT = BigInt(U32_MAX);
const U64_MAX = BigInt("18446744073709551615");

const toU64 = (value: unknown, code: PiSubscriptionErrorCode): bigint => {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === "string" && /^\d+$/.test(value)) parsed = BigInt(value);
  else throw new PiSubscriptionError(code);
  if (parsed < BigInt(0) || parsed > U64_MAX) throw new PiSubscriptionError(code);
  return parsed;
};

const toU32 = (value: unknown, code: PiSubscriptionErrorCode): number => {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 0 || parsed > U32_MAX) {
    throw new PiSubscriptionError(code);
  }
  return parsed;
};

const toProcessResult = (value: StellarSdk.xdr.ScVal): ProcessResult => {
  const native = StellarSdk.scValToNative(value) as Record<string, unknown> | null;
  const keys = ["charged", "failed", "skipped", "total"];
  if (!native || typeof native !== "object" || !keys.every((key) => typeof native[key] === "number")) {
    throw new PiSubscriptionError("unexpected_response", {
      data: { detail: "The contract did not return a ProcessResult." },
    });
  }
  return {
    charged: Number(native.charged),
    failed: Number(native.failed),
    skipped: Number(native.skipped),
    total: Number(native.total),
  };
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs the subscription contract's process() for a service, signed with the merchant's own secret on the
 * server, and sends it straight to the Soroban RPC server: no Pi Browser, no wallet passphrase screen.
 *
 * process() charges every due, auto-renewing subscription in [offset, offset + limit) of the service's
 * subscription list. Read the merchant secret from your server's environment; never send it to a client.
 *
 * - mode "submit" (default): signs, sends, waits for the result and resolves with the hash, ledger and
 *   ProcessResult.
 * - mode "simulate": resolves with the ProcessResult the call would produce, without signing or sending.
 */
const processSubscriptions = async (
  merchantSecret: string,
  serviceId: string | number | bigint,
  offset: string | number,
  limit: string | number,
  options: ProcessOptions = {}
): Promise<ProcessResult | ProcessSubmitResult> => {
  if (typeof merchantSecret !== "string" || !StellarSdk.StrKey.isValidEd25519SecretSeed(merchantSecret)) {
    throw new PiSubscriptionError("invalid_merchant_secret");
  }
  const serviceIdValue = toU64(serviceId, "invalid_service_id");
  const offsetValue = toU32(offset, "invalid_offset");
  const limitValue = toU32(limit, "invalid_limit");
  const mode = options.mode ?? "submit";
  if (mode !== "simulate" && mode !== "submit") throw new PiSubscriptionError("invalid_mode");
  const timeoutSecs = options.timeoutSecs ?? DEFAULT_TIMEOUT_SECS;
  if (!Number.isInteger(timeoutSecs) || timeoutSecs <= 0) throw new PiSubscriptionError("invalid_timeout");

  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URL;
  const networkPassphrase = options.networkPassphrase ?? DEFAULT_NETWORK_PASSPHRASE;
  const contractAddress = options.contractAddress ?? DEFAULT_CONTRACT_ADDRESS;
  if (typeof contractAddress !== "string" || !StellarSdk.StrKey.isValidContract(contractAddress)) {
    throw new PiSubscriptionError("invalid_contract_address");
  }

  const keypair = StellarSdk.Keypair.fromSecret(merchantSecret);
  const server = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });

  let account: StellarSdk.Account;
  try {
    account = await server.getAccount(keypair.publicKey());
  } catch (err) {
    const detail = errorText(err);
    throw new PiSubscriptionError(/not found/i.test(detail) ? "account_not_found" : "rpc_error", { data: { detail } });
  }

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

  let simulation: StellarSdk.rpc.Api.SimulateTransactionResponse;
  try {
    simulation = await server.simulateTransaction(transaction);
  } catch (err) {
    throw new PiSubscriptionError("rpc_error", { data: { detail: errorText(err) } });
  }
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

  const resourceFee = (BigInt(simulation.minResourceFee) * RESOURCE_FEE_MARGIN_PERCENT) / BigInt(100);
  const fee = BigInt(INCLUSION_FEE) + resourceFee;
  if (fee > U32_MAX_BIGINT) throw new PiSubscriptionError("fee_too_high", { data: { detail: `${fee} stroops` } });
  simulation.transactionData.setResourceFee(resourceFee);
  const prepared = StellarSdk.rpc
    .assembleTransaction(transaction, { ...simulation, minResourceFee: resourceFee.toString() })
    .build();
  prepared.sign(keypair);
  const txid = prepared.hash().toString("hex");

  let sent: StellarSdk.rpc.Api.SendTransactionResponse;
  try {
    sent = await server.sendTransaction(prepared);
  } catch (err) {
    // The request may have reached the server: the transaction can still land under this hash.
    throw new PiSubscriptionError("transaction_not_confirmed", { data: { txid, detail: errorText(err) } });
  }
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    const resultCode = sent.errorResult?.result().switch().name;
    throw new PiSubscriptionError("transaction_rejected", { data: { txid, detail: resultCode ?? sent.status } });
  }

  // Poll past the transaction's validity window: once it has passed, a transaction that is still not
  // found can no longer be included.
  let outcome: StellarSdk.rpc.Api.GetTransactionResponse;
  try {
    outcome = await server.pollTransaction(txid, {
      attempts: timeoutSecs + 10,
      sleepStrategy: StellarSdk.rpc.BasicSleepStrategy,
    });
  } catch (err) {
    throw new PiSubscriptionError("transaction_not_confirmed", { data: { txid, detail: errorText(err) } });
  }

  if (outcome.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
    if (!outcome.returnValue) {
      throw new PiSubscriptionError("transaction_not_confirmed", {
        data: {
          txid,
          detail: "The transaction succeeded but returned no value.",
        },
      });
    }
    return { txid, ledger: outcome.ledger, result: toProcessResult(outcome.returnValue) };
  }
  if (outcome.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
    throw new PiSubscriptionError("transaction_failed", {
      data: {
        txid,
        detail: outcome.resultXdr.result().switch().name,
      },
    });
  }
  throw new PiSubscriptionError("transaction_not_confirmed", { data: { txid, detail: outcome.status } });
};

const Subscription = { process: processSubscriptions };
export const SmartContract = { Subscription };
