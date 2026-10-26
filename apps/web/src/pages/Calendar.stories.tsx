import type { CalendarAgenda, CalendarItem } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { mockRpc } from "../lib/__mocks__/rpc";
import { mockBots } from "../stories/fixtures";
import { CalendarPage } from "./Calendar";

/** A time `days` from today at `hour` o'clock UTC. Dates move with the clock so Today and the window always line up. */
const at = (days: number, hour: number) => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days, hour),
  ).toISOString();
};

const base = { end: null, botId: null, botName: null, account: null, href: null } as const;
const item = (i: Partial<CalendarItem> & Pick<CalendarItem, "id" | "kind" | "title" | "start">) =>
  ({ allDay: false, ...base, ...i }) satisfies CalendarItem;

const items: CalendarItem[] = [
  item({
    id: "e1",
    kind: "event",
    title: "Team standup",
    start: at(0, 17),
    account: "Work",
    href: "https://calendar.example.test/e1",
  }),
  item({
    id: "t1",
    kind: "todo",
    title: "Send the investor update",
    start: at(0, 22),
    botId: "bot_ada",
    botName: "Ada",
  }),
  item({
    id: "c1",
    kind: "check_back",
    title: "Check the pricing page",
    start: at(1, 15),
    botId: "bot_ben",
    botName: "Ben",
  }),
  item({
    id: "e2",
    kind: "event",
    title: "Offsite",
    start: at(2, 0),
    allDay: true,
    account: "Personal",
    href: "https://calendar.example.test/e2",
  }),
  item({
    id: "r1",
    kind: "routine",
    title: "Weekly metrics digest",
    start: at(3, 14),
    botId: "bot_cy",
    botName: "Cy",
  }),
  item({ id: "i1", kind: "todo", title: "Sign the lease", start: at(3, 0), allDay: true }),
];

const agenda = (over: Partial<CalendarAgenda> = {}): CalendarAgenda => ({
  items,
  errors: [],
  googleConnected: true,
  ...over,
});

const meta = {
  title: "Pages/Calendar",
  component: CalendarPage,
  args: { bots: mockBots, onOpenBot: () => {} },
} satisfies Meta<typeof CalendarPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Agenda: Story = { beforeEach: () => mockRpc({ "calendar.agenda": agenda() }) };

export const MonthView: Story = {
  parameters: { initialEntries: ["/app/calendar?view=month"] },
  beforeEach: () => mockRpc({ "calendar.agenda": agenda() }),
};

export const FilteredToCheckBacks: Story = {
  parameters: { initialEntries: ["/app/calendar?kind=check_back"] },
  beforeEach: () => mockRpc({ "calendar.agenda": agenda() }),
};

export const Searched: Story = {
  beforeEach: () => mockRpc({ "calendar.agenda": agenda() }),
  play: async ({ canvasElement }) => {
    await userEvent.type(await within(canvasElement).findByRole("searchbox"), "zzz");
  },
};

export const Empty: Story = {
  beforeEach: () => mockRpc({ "calendar.agenda": agenda({ items: [] }) }),
};

/** Bot items still show, with one quiet link to connect Google Calendar. */
export const NoGoogleCalendar: Story = {
  beforeEach: () =>
    mockRpc({
      "calendar.agenda": agenda({
        items: items.filter((entry) => entry.kind !== "event"),
        googleConnected: false,
      }),
    }),
};

export const AccountFailed: Story = {
  beforeEach: () =>
    mockRpc({
      "calendar.agenda": agenda({
        items: items.filter((entry) => entry.account !== "Work"),
        errors: [{ account: "Work", message: "Google Calendar access expired" }],
      }),
    }),
};

export const Loading: Story = {
  beforeEach: () => mockRpc({ "calendar.agenda": () => new Promise(() => {}) }),
};

export const LoadError: Story = {
  beforeEach: () =>
    mockRpc({
      "calendar.agenda": () => {
        throw new Error("Could not load the calendar");
      },
    }),
};
