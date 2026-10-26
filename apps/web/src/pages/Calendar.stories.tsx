import type { CalendarAgenda, CalendarItem } from "@rakazo/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { mockRpc } from "../lib/__mocks__/rpc";
import { mockBots } from "../stories/fixtures";
import { CalendarPage } from "./Calendar";

/** A time `days` from today at `hour` o'clock local. Dates move with the clock so Today and the window always line up. */
const at = (days: number, hour: number, minute = 0) => {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + days,
    hour,
    minute,
  ).toISOString();
};
/** An all-day item sits at midnight UTC of its date. */
const allDayAt = (days: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days)).toISOString();
};

const base = { end: null, botId: null, botName: null, account: null, href: null } as const;
const item = (i: Partial<CalendarItem> & Pick<CalendarItem, "id" | "kind" | "title" | "start">) =>
  ({ allDay: false, ...base, ...i }) satisfies CalendarItem;

const items: CalendarItem[] = [
  item({
    id: "e1",
    kind: "event",
    title: "Team standup",
    start: at(0, 9),
    end: at(0, 10),
    account: "Work",
    href: "https://calendar.example.test/e1",
  }),
  item({
    id: "t1",
    kind: "todo",
    title: "Send the investor update",
    start: at(0, 9, 30),
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
    id: "e3",
    kind: "event",
    title: "Customer call",
    start: at(0, 9, 15),
    end: at(0, 9, 45),
    account: "Work",
    href: "https://calendar.example.test/e3",
  }),
  item({
    id: "e2",
    kind: "event",
    title: "Offsite",
    start: allDayAt(2),
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
  item({ id: "i1", kind: "todo", title: "Sign the lease", start: allDayAt(3), allDay: true }),
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
  // The shell gives the page a bounded height; the time grid scrolls inside it.
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarPage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Answers the way the API does: the bots' items for "local", the events for "google". */
const split = (data: CalendarAgenda) => (input: { sources?: "local" | "google" }) =>
  Promise.resolve({
    ...data,
    items: data.items.filter((entry) => (input.sources === "local") === (entry.kind !== "event")),
    errors: input.sources === "local" ? [] : data.errors,
  });
const withAgenda = (data: CalendarAgenda) => () => mockRpc({ "calendar.agenda": split(data) });
const view = (name: string) => ({ initialEntries: [`/app/calendar?view=${name}`] });

export const Week: Story = { beforeEach: withAgenda(agenda()) };

export const Day: Story = { parameters: view("day"), beforeEach: withAgenda(agenda()) };

export const MonthView: Story = { parameters: view("month"), beforeEach: withAgenda(agenda()) };

export const Schedule: Story = { parameters: view("schedule"), beforeEach: withAgenda(agenda()) };

/** Bot items show at once; the Google request is still pending, so only the small spinner marks it. */
export const GoogleLoading: Story = {
  beforeEach: () =>
    mockRpc({
      "calendar.agenda": (input: { sources?: "local" | "google" }) =>
        input.sources === "google" ? new Promise(() => {}) : split(agenda())(input),
    }),
};

export const GoogleError: Story = {
  beforeEach: withAgenda(
    agenda({
      items: items.filter((entry) => entry.account !== "Work"),
      errors: [{ account: "Work", message: "Couldn't load Work" }],
    }),
  ),
};

export const EmptyWeek: Story = { beforeEach: withAgenda(agenda({ items: [] })) };

export const FilteredToCheckBacks: Story = {
  parameters: view("week&kind=check_back"),
  beforeEach: withAgenda(agenda()),
};

export const Searched: Story = {
  beforeEach: withAgenda(agenda()),
  play: async ({ canvasElement }) => {
    await userEvent.type(await within(canvasElement).findByRole("searchbox"), "zzz");
  },
};

/** Bot items still show, with one quiet link to connect Google Calendar. */
export const NoGoogleCalendar: Story = {
  beforeEach: withAgenda(
    agenda({ items: items.filter((entry) => entry.kind !== "event"), googleConnected: false }),
  ),
};

export const LoadError: Story = {
  beforeEach: () =>
    mockRpc({
      "calendar.agenda": () => {
        throw new Error("Could not load the calendar");
      },
    }),
};
