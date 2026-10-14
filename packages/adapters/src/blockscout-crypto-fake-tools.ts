import type { FakeCalls } from "./finance-fake-tools.js";
import type { FinanceCallTool } from "./finance-sync.js";

/** Canned Blockscout tools for tests. Shapes follow the MCP server's models; every address and amount is made up. */

export const WALLET_A = "0x1111111111111111111111111111111111111111";
export const WALLET_B = "0x2222222222222222222222222222222222222222";
export const SAFE_WALLET = "0x3333333333333333333333333333333333333333";
export const TOKEN_USDC = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const TOKEN_SPAM = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const TOKEN_DAI = "0xcccccccccccccccccccccccccccccccccccccccc";
export const OWNER_1 = "0x4444444444444444444444444444444444444444";
/** Real tool error texts seen from the hosted server. */
export const ERR_PLAN =
  "Tool failed: Error executing tool get_address_info: Blockscout PRO API credits exhausted (HTTP 402): the API key's credit allowance is depleted. Top up credits or wait for the daily reset; retrying will not succeed";
export const ERR_KEYLESS =
  "Tool failed: This session's `session_id` can no longer be used to access Blockscout data. Relay to the user: to continue, obtain a Blockscout PRO API key at https://mcp.blockscout.com";
export const ERR_REJECTED = "Tool failed: 401 Unauthorized - Details: invalid api key";
export const OWNER_2 = "0x5555555555555555555555555555555555555555";

export const holding = (address: string, balance: string, over: Record<string, unknown> = {}) => ({
  address,
  name: "Fake Token",
  symbol: "FAKE",
  decimals: "6",
  total_supply: "1000000000",
  circulating_market_cap: null,
  exchange_rate: "1.00",
  holders_count: "10",
  balance,
  ...over,
});

export interface FakeChainAddress {
  coinBalance?: string;
  exchangeRate?: string | null;
  isContract?: boolean;
  name?: string | null;
  implementations?: Array<{ name: string }>;
  /** One array per page; page n+1 is reached with the cursor "p<n+1>". */
  tokenPages?: unknown[][];
}

export interface FakeBlockscoutOptions {
  /** chainId -> lowercase address -> data. Missing chain or address is an empty account. */
  chains?: Record<number, Record<string, FakeChainAddress>>;
  /** Chains whose calls throw (a rate limit). */
  failChains?: number[];
  /** Chains whose calls throw this exact message instead, e.g. a real vendor error text. */
  chainErrors?: Record<number, string>;
  /** Throws this message on every call (a key problem). */
  allError?: string;
  /** Throws a rate-limit error for the first N calls on these chains, then answers. */
  rateLimitFirst?: number;
  /** Throws if more than this many calls are in flight at once. */
  maxConcurrent?: number;
  ens?: Record<string, string | null>;
  safe?: { owners: string[]; threshold: number };
}

export function fakeBlockscout(options: FakeBlockscoutOptions = {}): {
  callTool: FinanceCallTool;
} & FakeCalls {
  const calls: FakeCalls["calls"] = [];
  let inFlight = 0;
  let limited = 0;
  const callTool: FinanceCallTool = async (name, args) => {
    calls.push({ name, args });
    inFlight++;
    try {
      if (options.maxConcurrent !== undefined && inFlight > options.maxConcurrent)
        throw new Error("Tool failed: 429 Too Many Requests");
      await Promise.resolve();
      return await answer(name, args);
    } finally {
      inFlight--;
    }
  };
  const answer = async (name: string, args: Record<string, unknown>) => {
    const chainId = Number(args.chain_id);
    if (options.allError) throw new Error(options.allError);
    const chainError = options.chainErrors?.[chainId];
    if (chainError) throw new Error(chainError);
    if (options.rateLimitFirst && limited < options.rateLimitFirst) {
      limited++;
      throw new Error("Tool failed: 429 Too Many Requests - Details: slow down");
    }
    if (options.failChains?.includes(chainId)) throw new Error("Tool failed: rate limited");
    const account = options.chains?.[chainId]?.[String(args.address)];
    switch (name) {
      case "get_address_info":
        return {
          data: {
            basic_info: {
              coin_balance: account?.coinBalance ?? "0",
              exchange_rate: account?.exchangeRate ?? null,
              is_contract: account?.isContract ?? false,
              name: account?.name ?? null,
              implementations: account?.implementations ?? [],
            },
            first_transaction_details: null,
            metadata: null,
          },
        };
      case "get_tokens_by_address": {
        const pages = account?.tokenPages ?? [[]];
        const index = args.cursor ? Number(String(args.cursor).slice(1)) : 0;
        const next = index + 1 < pages.length ? `p${index + 1}` : null;
        return {
          data: pages[index] ?? [],
          pagination: next
            ? { next_call: { tool_name: name, params: { ...args, cursor: next } } }
            : null,
        };
      }
      case "get_address_by_ens_name":
        return { data: { resolved_address: options.ens?.[String(args.name)] ?? null } };
      case "read_contract":
        if (!options.safe) throw new Error("Tool failed: execution reverted");
        return {
          data: {
            result:
              args.function_name === "getOwners" ? options.safe.owners : options.safe.threshold,
          },
        };
      default:
        throw new Error(`unexpected tool ${name}`);
    }
  };
  return { callTool, calls };
}
