// Mockup for docs/bulk-replies/PLAN.md. Nothing in the app uses this yet: slice S3 turns it into a
// real component. An open row is the real MailApprovalCard; every name and address is invented.
import type { MailApproval } from "@rakazo/contracts";
import { Badge, Button, Checkbox, cn } from "@rakazo/ui-web";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Mail } from "lucide-react";
import { useState } from "react";
import { MailApprovalCard } from "./MailApprovalCard";

type RowState = "sent" | "failed" | "unknown" | "skipped";
type Row = {
  id: string;
  to: string;
  subject: string;
  body: string;
  flag?: string;
  state?: RowState;
};

const ACCOUNT = "support@example.test";
const CAP = 8;

const reply = (id: string, name: string, flag?: string, state?: RowState): Row => ({
  id,
  to: `${name} <${name.split(" ")[0]?.toLowerCase()}@customer.example.test>`,
  subject: "Re: Export stops at 90%",
  body: `Hi ${name.split(" ")[0]},\n\nThe export stopped because of a fault on our side. It is fixed now, so running it again will finish.\n\nThanks for your patience.`,
  ...(flag ? { flag } : {}),
  ...(state ? { state } : {}),
});

const rows: Row[] = [
  {
    ...reply("r1", "Sam Rivera"),
    to: "Sam Rivera <sam@customer.example.test>, billing@other.example.test",
    flag: "Not on this thread",
  },
  reply("r2", "Lee Okafor", "New message"),
  reply("r3", "Pat Lindqvist"),
  reply("r4", "Robin Tanaka"),
  reply("r5", "Alex Moreau"),
  reply("r6", "Jo Haddad"),
];

const NAMES = ["Casey", "Drew", "Emery", "Finley", "Harper", "Jules", "Kai", "Logan"];
const many: Row[] = [
  reply("m1", "Remy Stone", "Important sender"),
  ...Array.from({ length: 17 }, (_, i) =>
    reply(`m${i + 2}`, `${NAMES[i % NAMES.length]} ${"Testperson"}${i + 1}`),
  ),
];

const STATE_TEXT: Record<RowState, string> = {
  sent: "Sent",
  failed: "Not sent",
  unknown: "Unknown",
  skipped: "Skipped",
};

function approval(row: Row): MailApproval {
  return {
    tool: "mail_send",
    account: ACCOUNT,
    to: row.to.split(", "),
    cc: [],
    bcc: [],
    subject: row.subject,
    body: row.body,
    reply: true,
  };
}

function ReplyRow({
  row,
  ticked,
  open,
  editing,
  onTick,
  onOpen,
  settled,
}: {
  row: Row;
  ticked: boolean;
  open: boolean;
  editing: boolean;
  onTick: (value: boolean) => void;
  onOpen: () => void;
  settled: boolean;
}) {
  // Real addresses, never display names: a name can say anything.
  const addresses = row.to.split(", ").map((entry) => entry.replace(/^.*<|>$/g, ""));
  const [first = "", ...others] = addresses;
  return (
    <li className="border-t border-border">
      <div className="flex items-start gap-3 px-5 py-2.5">
        {settled ? null : (
          <Checkbox
            className="mt-0.5"
            checked={ticked}
            aria-label={`Include reply to ${first}`}
            onCheckedChange={(value) => onTick(Boolean(value))}
          />
        )}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-foreground">
            {/* Wraps, never truncates: a cut-off address would hide the recipient being flagged. */}
            <span className="min-w-0 break-words">
              {first}
              {others.length ? (
                <span className="text-warning"> and {others.join(", ")}</span>
              ) : null}
            </span>
            {row.flag ? (
              <Badge variant="secondary" className="shrink-0 bg-warning/15 text-warning">
                {row.flag}
              </Badge>
            ) : null}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {row.subject} · {row.body.split("\n")[2]}
          </span>
        </button>
        {row.state ? (
          <span
            className={cn(
              "shrink-0 text-[13px]",
              row.state === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {STATE_TEXT[row.state]}
          </span>
        ) : null}
      </div>
      {open ? (
        <div className="px-3 pb-3">
          <MailApprovalCard
            mail={approval(row)}
            status="pending"
            canAnswer
            initialEditing={editing}
            allowLabel="Done"
            onAnswer={async () => undefined}
          />
        </div>
      ) : null}
    </li>
  );
}

function ReplyBatchCard({
  rows: all,
  openRow,
  editing = false,
  settled = false,
}: {
  rows: Row[];
  openRow?: string;
  editing?: boolean;
  settled?: boolean;
}) {
  // Flagged rows come first and start unticked.
  const ordered = [...all].sort((a, b) => Number(Boolean(b.flag)) - Number(Boolean(a.flag)));
  const [ticks, setTicks] = useState(() => new Set(all.filter((r) => !r.flag).map((r) => r.id)));
  const [open, setOpen] = useState(openRow);
  const [expanded, setExpanded] = useState(false);
  const capped = ordered.length > CAP && !expanded;
  const shown = capped ? ordered.slice(0, CAP) : ordered;
  const failed = all.filter((r) => r.state === "failed").length;
  const sent = all.filter((r) => r.state === "sent").length;
  const unknown = all.filter((r) => r.state === "unknown").length;
  // A ticked row must have been on screen before Send can go out.
  const hiddenTicked = ordered.slice(shown.length).some((r) => ticks.has(r.id));

  return (
    <div
      data-testid="mail-reply-batch-card"
      className="@container w-160 max-w-full overflow-hidden rounded-3xl bg-muted ring-1 ring-inset ring-border"
    >
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className="hidden size-[30px] shrink-0 items-center justify-center rounded-lg bg-card text-foreground @sm:flex">
          <Mail aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-[15px]">
          <span className="font-medium text-foreground">{all.length} replies</span>{" "}
          <span className="text-muted-foreground">
            {settled
              ? `${sent} sent${failed ? ` · ${failed} not sent` : ""}${unknown ? ` · ${unknown} unknown` : ""}`
              : "Needs approval"}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{ACCOUNT}</span>
        </span>
      </div>
      <ul>
        {shown.map((row) => (
          <ReplyRow
            key={row.id}
            row={row}
            settled={settled}
            ticked={ticks.has(row.id)}
            open={open === row.id}
            editing={editing}
            onOpen={() => setOpen(open === row.id ? undefined : row.id)}
            onTick={(value) =>
              setTicks((current) => {
                const next = new Set(current);
                if (value) next.add(row.id);
                else next.delete(row.id);
                return next;
              })
            }
          />
        ))}
      </ul>
      {ordered.length > CAP && !hiddenTicked ? (
        <div className="border-t border-border px-5 py-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : `See all (${ordered.length})`}
          </button>
        </div>
      ) : null}
      <div className="border-t border-border px-5 py-3.5">
        {settled ? null : <p className="pb-3 text-[13px] text-muted-foreground">Firewall</p>}
        <div className="flex flex-wrap items-center gap-2">
          {settled ? (
            failed > 0 ? (
              <Button className="rounded-full">Retry failed</Button>
            ) : null
          ) : (
            <>
              {hiddenTicked ? (
                <Button className="rounded-full" onClick={() => setExpanded(true)}>
                  Review all ({ordered.length})
                </Button>
              ) : (
                <Button className="rounded-full" disabled={ticks.size === 0}>
                  Send selected ({ticks.size})
                </Button>
              )}
              <Button variant="secondary" className="rounded-full">
                Discard
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Chat/MailReplyBatchCard (mockup)",
  component: ReplyBatchCard,
  args: { rows },
} satisfies Meta<typeof ReplyBatchCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Rows a check flagged come first and start unticked. */
export const Review: Story = {};
/** Opening a row shows the whole reply in the real mail card. */
export const RowOpen: Story = { args: { openRow: "r3" } };
export const RowEditing: Story = { args: { openRow: "r3", editing: true } };
/** Send cannot go out while ticked rows are hidden: the button opens the list first. */
export const LargeBatch: Story = { args: { rows: many } };
/** One failure does not stop the rest, and only failed rows retry. */
export const PartlySent: Story = {
  args: {
    settled: true,
    rows: [
      reply("r3", "Pat Lindqvist", undefined, "sent"),
      reply("r4", "Robin Tanaka", undefined, "sent"),
      reply("r5", "Alex Moreau", undefined, "failed"),
      reply("r6", "Jo Haddad", undefined, "unknown"),
      reply("r1", "Sam Rivera", undefined, "skipped"),
    ],
  },
};
/** Phone width, the same card. */
export const Phone: Story = {
  decorators: [
    (Story) => (
      <div className="w-[390px]">
        <Story />
      </div>
    ),
  ],
};
