import type { BrexCardsOverview, BrexSpendSankey } from "@rakazo/contracts";

const merchant = (name: string, cents: number) => ({
  merchant: name,
  cents,
  count: Math.max(1, Math.round(cents / 25_000)),
  partial: false,
});

export const sankeyFixture: BrexSpendSankey = {
  partial: false,
  totalCents: 1_526_000,
  categories: [
    {
      bucket: "software",
      cents: 498_000,
      count: 14,
      partial: false,
      merchants: [merchant("Acme Software", 320_000), merchant("Linear", 178_000)],
    },
    {
      bucket: "cloud",
      cents: 342_000,
      count: 9,
      partial: false,
      merchants: [merchant("AWS", 210_000), merchant("Vercel", 132_000)],
    },
    {
      bucket: "travel",
      cents: 286_000,
      count: 6,
      partial: false,
      merchants: [merchant("United Airlines", 180_000), merchant("Harbor Hotel", 106_000)],
    },
    {
      bucket: "meals",
      cents: 198_000,
      count: 18,
      partial: false,
      merchants: [merchant("Blue Bottle", 98_000), merchant("Sweetgreen", 100_000)],
    },
    {
      bucket: "marketing",
      cents: 164_000,
      count: 4,
      partial: false,
      merchants: [merchant("LinkedIn Ads", 164_000)],
    },
    {
      bucket: "other",
      cents: 38_000,
      count: 3,
      partial: false,
      merchants: [merchant("Courier Co", 38_000)],
    },
  ],
};

export const oneCategorySankeyFixture: BrexSpendSankey = {
  partial: false,
  totalCents: 320_000,
  categories: [
    {
      bucket: "software",
      cents: 320_000,
      count: 8,
      partial: false,
      merchants: [merchant("Acme Software", 320_000)],
    },
  ],
};

export const emptySankeyFixture: BrexSpendSankey = {
  partial: false,
  totalCents: 0,
  categories: [],
};

export const overviewFixture: BrexCardsOverview = {
  serverId: "server_brex",
  agentBotId: "bot_brex",
  writesEnabled: true,
  partial: false,
  cash: { totalCents: 28_395_000, availableCents: 24_100_000, accountCount: 2 },
  cardSpend: {
    partial: false,
    monthToDateCents: 412_000,
    previousMonthToDateCents: 375_000,
    changePercent: 9.9,
    sparkline: [
      { day: "2026-10-01", cents: 28_000 },
      { day: "2026-10-08", cents: 41_000 },
      { day: "2026-10-15", cents: 36_000 },
      { day: "2026-10-22", cents: 52_000 },
      { day: "2026-10-29", cents: 47_000 },
      { day: "2026-11-05", cents: 61_000 },
    ],
  },
  cards: { active: 8, locked: 1, terminated: 2 },
  nearLimit: {
    partial: false,
    count: 2,
    items: [
      {
        kind: "card",
        id: "card_ops",
        name: "Ops card ••4821",
        usedCents: 84_000,
        limitCents: 100_000,
        percent: 84,
      },
      {
        kind: "spend_limit",
        id: "limit_cloud",
        name: "Cloud budget",
        usedCents: 171_000,
        limitCents: 200_000,
        percent: 85.5,
      },
    ],
  },
  sankey: sankeyFixture,
  topVendors: [
    merchant("Acme Software", 320_000),
    merchant("AWS", 210_000),
    merchant("United Airlines", 180_000),
    merchant("LinkedIn Ads", 164_000),
    merchant("Blue Bottle", 98_000),
  ],
};
