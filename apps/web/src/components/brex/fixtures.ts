import type {
  BrexCardsOverview,
  BrexCardsView,
  BrexCardView,
  BrexSpendPoint,
  BrexSpendSankey,
} from "@rakazo/contracts";

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

// 90 daily spend points ending 2026-11-06, deterministic so stories and tests are stable.
const spendSeries = (baseCents: number, drift: number): BrexSpendPoint[] => {
  const start = Date.parse("2026-08-09T00:00:00Z");
  return Array.from({ length: 90 }, (_, index) => {
    const day = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    const wave = Math.sin(index / 3) * baseCents * 0.25;
    const cents = Math.round(baseCents * (1 + drift * (index / 89)) + wave);
    return { day, cents: Math.max(0, cents) };
  });
};

const cardView = (
  over: Partial<BrexCardView> & Pick<BrexCardView, "cardId" | "name" | "lastFour">,
): BrexCardView => ({
  ownerUserId: "u_ada",
  ownerName: "Ada Example",
  status: "ACTIVE",
  limitCents: 200_000,
  currency: "USD",
  duration: "MONTHLY",
  cardType: "VIRTUAL",
  lockAfterDate: null,
  allowedMerchants: [],
  blockedMerchants: [],
  period: { start: "2026-11-01", end: "2026-11-30" },
  periodSpendCents: 132_000,
  series: spendSeries(1_400, 0.3),
  usage: { usedCents: 132_000, limitCents: 200_000, percent: 66 },
  partial: false,
  ...over,
});

export const cardsViewFixture: BrexCardsView = {
  serverId: "server_brex",
  agentBotId: "bot_brex",
  writesEnabled: true,
  partial: false,
  cards: [
    cardView({
      cardId: "card_figma",
      name: "Figma",
      lastFour: "4821",
      allowedMerchants: ["Figma"],
      periodSpendCents: 132_000,
    }),
    cardView({
      cardId: "card_ads",
      name: "Ad spend",
      lastFour: "5555",
      duration: "ONE_TIME",
      limitCents: 500_000,
      lockAfterDate: "2026-12-31",
      allowedMerchants: ["Meta", "Google Ads"],
      period: { start: "2026-08-09", end: "2026-11-06" },
      periodSpendCents: 310_000,
      series: spendSeries(3_400, -0.2),
      usage: null,
    }),
    cardView({
      cardId: "card_team",
      name: "Ada team card",
      lastFour: "1111",
      cardType: "PHYSICAL",
      limitCents: 50_000,
      periodSpendCents: 41_200,
      usage: { usedCents: 41_200, limitCents: 50_000, percent: 82.4 },
    }),
    cardView({
      cardId: "card_berlin",
      name: "Berlin tools",
      lastFour: "2222",
      currency: "EUR",
      limitCents: 300_000,
      periodSpendCents: 88_000,
      usage: { usedCents: 88_000, limitCents: 300_000, percent: 29.3 },
      allowedMerchants: ["Figma", "Notion", "Miro"],
    }),
    cardView({
      cardId: "card_locked",
      name: "Locked travel",
      lastFour: "3333",
      status: "LOCKED",
      duration: "QUARTERLY",
      limitCents: 300_000,
      period: { start: "2026-10-01", end: "2026-12-31" },
      periodSpendCents: 96_000,
      usage: { usedCents: 96_000, limitCents: 300_000, percent: 32 },
      series: spendSeries(1_100, 0.1),
    }),
    cardView({
      cardId: "card_ended",
      name: "Old ads",
      lastFour: "4444",
      status: "TERMINATED",
      periodSpendCents: 0,
      series: spendSeries(0, 0),
      usage: null,
    }),
    cardView({
      cardId: "card_yearly",
      name: "Yearly cloud",
      lastFour: "6666",
      duration: "YEARLY",
      limitCents: 1_200_000,
      period: { start: "2026-01-01", end: "2026-12-31" },
      periodSpendCents: 402_000,
      usage: { usedCents: 402_000, limitCents: 1_200_000, percent: 33.5 },
      series: spendSeries(4_400, 0.05),
    }),
    cardView({
      cardId: "card_launch",
      name: "Launch",
      lastFour: "7777",
      duration: "ONE_TIME",
      limitCents: 100_000,
      ownerUserId: "u_cy",
      ownerName: "Cy Example",
      period: { start: "2026-08-09", end: "2026-11-06" },
      periodSpendCents: 12_500,
      series: spendSeries(140, 0.4),
      usage: null,
    }),
  ],
};
