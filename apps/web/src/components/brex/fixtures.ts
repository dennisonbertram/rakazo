import type {
  BrexAccounts,
  BrexActivity,
  BrexCardsOverview,
  BrexExpenses,
  BrexSpendSankey,
  BrexTrips,
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

const expense = (
  expenseId: string,
  over: Partial<BrexExpenses["expenses"][number]> = {},
): BrexExpenses["expenses"][number] => ({
  expenseId,
  purchasedAt: "2026-11-03T14:22:00.000Z",
  day: "2026-11-03",
  userId: "user_1",
  userName: "Ada Lovelace",
  merchant: "Acme Software",
  memo: null,
  status: "SUBMITTED",
  paymentStatus: "SETTLED",
  expenseType: "CARD",
  category: "Software",
  bucket: "software",
  amountCents: 12_400,
  currency: "USD",
  receipts: [],
  missingReceipt: true,
  missingMemo: true,
  complianceStatus: null,
  cardId: "card_ops",
  ...over,
});

export const expensesFixture: BrexExpenses = {
  serverId: "server_brex",
  agentBotId: "bot_brex",
  writesEnabled: true,
  partial: false,
  expenses: [
    expense("exp_missing_both", {
      merchant: "Blue Bottle",
      userName: "Grace Hopper",
      day: "2026-11-05",
      purchasedAt: "2026-11-05T09:12:00.000Z",
      amountCents: 8_400,
      bucket: "meals",
      category: "Meals",
    }),
    expense("exp_memo_only", {
      merchant: "LinkedIn Ads",
      userName: "Ada Lovelace",
      day: "2026-11-04",
      purchasedAt: "2026-11-04T16:40:00.000Z",
      amountCents: 45_000,
      bucket: "marketing",
      category: "Advertising",
      receipts: [{ id: "rcpt_1" }],
      missingReceipt: false,
      missingMemo: true,
    }),
    expense("exp_receipt_only", {
      merchant: "United Airlines",
      userName: "Alan Turing",
      day: "2026-11-02",
      purchasedAt: "2026-11-02T07:55:00.000Z",
      amountCents: 38_000,
      bucket: "travel",
      category: "Travel",
      memo: "Flight to Austin",
      missingReceipt: true,
      missingMemo: false,
    }),
    expense("exp_complete", {
      merchant: "AWS",
      userName: "Ada Lovelace",
      day: "2026-11-01",
      purchasedAt: "2026-11-01T11:03:00.000Z",
      amountCents: 21_000,
      bucket: "cloud",
      category: "Cloud",
      memo: "November hosting",
      receipts: [{ id: "rcpt_2" }],
      missingReceipt: false,
      missingMemo: false,
    }),
  ],
  reimbursements: [
    expense("exp_reimb_waiting", {
      expenseType: "REIMBURSEMENT",
      merchant: "Harbor Hotel",
      memo: "Hotel for the Austin offsite",
      day: "2026-10-28",
      purchasedAt: "2026-10-28T18:30:00.000Z",
      amountCents: 21_300,
      bucket: "travel",
      category: "Travel",
      receipts: [{ id: "rcpt_3" }],
      missingReceipt: false,
      missingMemo: false,
    }),
    expense("exp_reimb_paid", {
      expenseType: "REIMBURSEMENT",
      status: "APPROVED",
      merchant: "Sweetgreen",
      memo: "Team lunch",
      day: "2026-10-21",
      purchasedAt: "2026-10-21T12:15:00.000Z",
      amountCents: 4_600,
      bucket: "meals",
      category: "Meals",
      receipts: [{ id: "rcpt_4" }],
      missingReceipt: false,
      missingMemo: false,
    }),
  ],
};

export const accountsFixture: BrexAccounts = {
  serverId: "server_brex",
  agentBotId: "bot_brex",
  writesEnabled: true,
  accounts: [
    {
      cashAccountId: "ca_operating",
      name: "Operating",
      status: "ACTIVE",
      currentBalanceCents: 1_234_500,
      availableBalanceCents: 1_100_000,
      currency: "USD",
      primary: true,
    },
    {
      cashAccountId: "ca_payroll",
      name: "Payroll",
      status: "ACTIVE",
      currentBalanceCents: 96_000,
      availableBalanceCents: 96_000,
      currency: "USD",
      primary: false,
    },
  ],
  statements: [
    {
      statementId: "st_cash_1",
      accountKind: "cash",
      cashAccountId: "ca_operating",
      accountName: "Operating",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      startBalanceCents: 1_100_000,
      endBalanceCents: 1_234_500,
    },
    {
      statementId: "st_card_1",
      accountKind: "card",
      cashAccountId: null,
      accountName: "Card account",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      startBalanceCents: 0,
      endBalanceCents: 31_000,
    },
    {
      statementId: "st_cash_2",
      accountKind: "cash",
      cashAccountId: "ca_payroll",
      accountName: "Payroll",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      startBalanceCents: 120_000,
      endBalanceCents: 96_000,
    },
  ],
};

export const tripsFixture: BrexTrips = {
  serverId: "server_brex",
  agentBotId: "bot_brex",
  writesEnabled: true,
  trips: [
    {
      tripId: "trip_customer_visit",
      name: "Customer visit, Denver",
      status: "UPCOMING",
      bookerUserId: "user_1",
      bookerName: "Ada Lovelace",
      startsAt: "2026-11-18T08:00:00.000Z",
      endsAt: "2026-11-21T18:00:00.000Z",
    },
    {
      tripId: "trip_offsite",
      name: "Team offsite, Austin",
      status: "APPROVED",
      bookerUserId: "user_2",
      bookerName: "Grace Hopper",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-04T17:00:00.000Z",
    },
    {
      tripId: "trip_cancelled",
      name: "Conference, Las Vegas",
      status: "CANCELLED",
      bookerUserId: "user_3",
      bookerName: "Alan Turing",
      startsAt: "2026-09-14T08:00:00.000Z",
      endsAt: "2026-09-17T18:00:00.000Z",
    },
  ],
};

export const activityFixture: BrexActivity = {
  serverId: "server_brex",
  agentBotId: "bot_brex",
  writesEnabled: true,
  activities: [
    {
      effectId: "eff_memo",
      at: new Date().toISOString(),
      action: "update_expense_memo",
      target: "Blue Bottle",
      status: "succeeded",
    },
    {
      effectId: "eff_lock",
      at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      action: "lock_card",
      target: "Ops card",
      status: "succeeded",
    },
    {
      effectId: "eff_limit",
      at: new Date(Date.now() - 26 * 3600_000).toISOString(),
      action: "update_spend_limit",
      target: "Cloud budget",
      status: "denied",
    },
    {
      effectId: "eff_card",
      at: new Date(Date.now() - 3 * 86400_000).toISOString(),
      action: "create_vendor_card",
      target: "Harbor Hotel",
      status: "failed",
    },
  ],
};

export const emptyExpensesFixture: BrexExpenses = {
  ...expensesFixture,
  partial: false,
  expenses: [
    expense("exp_complete", {
      merchant: "AWS",
      memo: "November hosting",
      receipts: [{ id: "rcpt_2" }],
      missingReceipt: false,
      missingMemo: false,
    }),
  ],
  reimbursements: [
    expense("exp_reimb_paid", {
      expenseType: "REIMBURSEMENT",
      status: "APPROVED",
      merchant: "Sweetgreen",
      memo: "Team lunch",
      receipts: [{ id: "rcpt_4" }],
      missingReceipt: false,
      missingMemo: false,
    }),
  ],
};

export const emptyAccountsFixture: BrexAccounts = {
  ...accountsFixture,
  accounts: [],
  statements: [],
};

export const emptyTripsFixture: BrexTrips = { ...tripsFixture, trips: [] };

export const emptyActivityFixture: BrexActivity = {
  ...activityFixture,
  activities: [],
};
