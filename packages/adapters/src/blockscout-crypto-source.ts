import { CRYPTO_CHAINS } from "@rakazo/contracts";
import { z } from "zod";
import { FinanceShapeError, parseToolResponse } from "./finance-source-util.js";
import type { FinanceCallTool } from "./finance-sync.js";

/** One balance of one wallet on one chain. `tokenAddress` is "" for the chain's native coin. */
export interface CryptoSourceHolding {
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  rawBalance: string;
  usdPrice: string | null;
}

export interface ChainSnapshot {
  holdings: CryptoSourceHolding[];
  /** Set when the address looks like a Safe; owners/threshold are then read separately. */
  maybeSafe: boolean;
}

export interface SafeDetails {
  owners: string[];
  threshold: number;
}

/** Native coin per chain. Every tracked chain uses 18 decimals. */
const NATIVE: Record<number, { symbol: string; name: string }> = {
  137: { symbol: "POL", name: "Polygon" },
};
const ETHER = { symbol: "ETH", name: "Ether" };

/** ponytail: 10 pages (~500+ tokens) per wallet and chain; a wallet with more is truncated. Raise or filter spam if real users hit it. */
const MAX_TOKEN_PAGES = 10;

const ADDRESS = /^0x[0-9a-f]{40}$/;
const DIGITS = /^\d+$/;
/** Blockscout sends tiny prices in scientific notation ("5.88079E-10"); core accepts that. */
const DECIMAL = /^\d+(\.\d+)?([eE][-+]?\d+)?$/;

/** The server wraps payloads as { data, pagination }; accept a bare payload too. */
const unwrap = (raw: unknown): unknown =>
  raw && typeof raw === "object" && "data" in raw ? (raw as { data: unknown }).data : raw;

const price = z
  .string()
  .nullish()
  .transform((p) => (p && DECIMAL.test(p) && Number(p) > 0 ? p : null));

const infoSchema = z.object({
  basic_info: z.object({
    coin_balance: z.string().regex(DIGITS).nullish(),
    exchange_rate: price,
    is_contract: z.boolean().nullish(),
    name: z.string().nullish(),
    implementations: z.array(z.object({ name: z.string().nullish() })).nullish(),
  }),
});

const tokenSchema = z.object({
  address: z.string(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  decimals: z.union([z.string(), z.number()]).nullish(),
  exchange_rate: price,
  balance: z.string().regex(DIGITS),
});

const SAFE_NAME = /safe/i;

export async function fetchChainSnapshot(
  callTool: FinanceCallTool,
  chainId: number,
  address: string,
): Promise<ChainSnapshot> {
  const chain_id = String(chainId);
  const info = parseToolResponse(
    infoSchema,
    "get_address_info",
    unwrap(await callTool("get_address_info", { chain_id, address })),
  ).basic_info;
  const native = NATIVE[chainId] ?? ETHER;
  const holdings: CryptoSourceHolding[] = [];
  if (info.coin_balance && info.coin_balance !== "0")
    holdings.push({
      tokenAddress: "",
      ...native,
      decimals: 18,
      rawBalance: info.coin_balance,
      usdPrice: info.exchange_rate,
    });

  let cursor: string | undefined;
  for (let page = 0; page < MAX_TOKEN_PAGES; page++) {
    const raw = await callTool("get_tokens_by_address", {
      chain_id,
      address,
      ...(cursor ? { cursor } : {}),
    });
    const list = parseToolResponse(z.array(z.unknown()), "get_tokens_by_address", unwrap(raw));
    for (const item of list) {
      const t = tokenSchema.safeParse(item);
      const tokenAddress = t.success ? t.data.address.toLowerCase() : "";
      const decimals = t.success ? Number(t.data.decimals) : Number.NaN;
      // A token that is not a plain ERC-20 address, has no usable decimals or has a zero balance is skipped.
      if (
        !t.success ||
        !ADDRESS.test(tokenAddress) ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        /^0+$/.test(t.data.balance)
      )
        continue;
      holdings.push({
        tokenAddress,
        symbol: (t.data.symbol ?? "").slice(0, 32),
        name: (t.data.name ?? "").slice(0, 100),
        decimals,
        rawBalance: t.data.balance,
        usdPrice: t.data.exchange_rate,
      });
    }
    const next = (raw as { pagination?: { next_call?: { params?: { cursor?: unknown } } } })
      ?.pagination?.next_call?.params?.cursor;
    if (typeof next !== "string" || !next) break;
    cursor = next;
  }

  const maybeSafe =
    info.is_contract === true &&
    [info.name, ...(info.implementations ?? []).map((i) => i.name)].some(
      (n) => n && SAFE_NAME.test(n),
    );
  return { holdings, maybeSafe };
}

const fn = (name: string, outputs: string) => ({
  constant: true,
  inputs: [],
  name,
  outputs: [{ name: "", type: outputs }],
  stateMutability: "view",
  type: "function",
});

/** A Safe's owners and threshold via two eth_call views; null when the contract does not answer like a Safe. */
export async function fetchSafeDetails(
  callTool: FinanceCallTool,
  chainId: number,
  address: string,
): Promise<SafeDetails | null> {
  const read = async (function_name: string, type: string) =>
    (
      unwrap(
        await callTool("read_contract", {
          chain_id: String(chainId),
          address,
          abi: fn(function_name, type),
          function_name,
          args: "[]",
        }),
      ) as { result?: unknown } | null
    )?.result;
  try {
    const owners = await read("getOwners", "address[]");
    const threshold = Number(await read("getThreshold", "uint256"));
    if (!Array.isArray(owners) || !Number.isInteger(threshold) || threshold < 1) return null;
    const lower = owners.map((o) => String(o).toLowerCase());
    return lower.every((o) => ADDRESS.test(o)) ? { owners: lower, threshold } : null;
  } catch {
    return null;
  }
}

/** Lowercase address for an ENS name, or null when it does not resolve. */
export async function resolveEnsName(
  callTool: FinanceCallTool,
  name: string,
): Promise<string | null> {
  const data = unwrap(await callTool("get_address_by_ens_name", { name }));
  const parsed = z.object({ resolved_address: z.string().nullish() }).safeParse(data);
  if (!parsed.success) throw new FinanceShapeError("get_address_by_ens_name", "");
  const address = parsed.data.resolved_address?.toLowerCase();
  return address && ADDRESS.test(address) ? address : null;
}

export const CRYPTO_CHAIN_IDS: number[] = CRYPTO_CHAINS.map((c) => c.id);
