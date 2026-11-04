// Mockup for docs/company-context/PLAN.md. Nothing in the app uses this yet: slice S1 moves the page
// into CompanyContext.tsx and S3 adds the proposal to AskCard. Everything around it is the real shell
// and the real Company page. Every name and fact is invented.
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Textarea,
} from "@rakazo/ui-web";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BookOpenText, ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PageEmptyState } from "../components/PageEmptyState";
import { mockRpc } from "../lib/__mocks__/rpc";
import { makeBot, mockBots, mockMe, mockSections } from "../stories/fixtures";
import { companyFixture } from "./company-fixtures";
import { ShellPage } from "./Shell";

function At({ path, children }: { path: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== path) navigate(path, { replace: true });
  }, [pathname, path, navigate]);
  return pathname === path ? children : null;
}

const at = (path: string) => (Story: () => ReactNode) => (
  <At path={path}>
    <Routes>
      <Route path="/app/company/*" element={<Story />} />
      <Route path="/app/:botId" element={<Story />} />
    </Routes>
  </At>
);

const quillfern = makeBot({ id: "bot_quillfern", name: "Quillfern" });

const message = (seq: number, role: "user" | "bot", blocks: unknown[]) => ({
  id: `msg_${seq}`,
  threadId: "thread_demo",
  seq,
  role,
  blocks,
  ...(role === "bot" ? { botId: quillfern.id, runId: "run_demo" } : {}),
  createdAt: `2026-01-01T10:0${seq}:00.000Z`,
});
const text = (value: string) => [{ kind: "text", text: value }];

function mocks(messages: ReturnType<typeof message>[]) {
  const waiting = messages.some((m) =>
    m.blocks.some((b) => (b as { kind: string }).kind === "ask"),
  );
  const current = {
    id: "space_demo",
    name: "Demo space",
    bots: [quillfern, ...mockBots],
    groups: [],
    externalConversations: [],
    botSections: mockSections,
  };
  return mockRpc({
    "spaces.list": {
      current,
      spaces: [{ ...current, isDefault: true, hasContent: true, bots: [], botSections: [] }],
    },
    me: mockMe,
    "threads.get": {
      threadId: "thread_demo",
      cursor: messages.length,
      messages,
      olderCursor: null,
      botId: quillfern.id,
      run: waiting
        ? {
            id: "run_demo",
            status: "waiting_input",
            threadId: "thread_demo",
            botId: quillfern.id,
            createdAt: "2026-01-01T10:02:00.000Z",
            updatedAt: "2026-01-01T10:02:00.000Z",
          }
        : null,
    },
    "threads.head": { threadId: "thread_demo", cursor: messages.length },
    "threads.messages": { threadId: "thread_demo", messages: [], olderCursor: null },
    "threads.remembered": { messageIds: [] },
    "routines.list": [],
    "skills.list": [],
    "connections.list": [],
    "connections.catalog": [],
    "connections.featured": [],
    "agentSkills.list": [],
    "threads.subscribe": () =>
      (async function* () {
        await new Promise(() => undefined);
      })(),
    usage: null,
    "company.page": companyFixture,
    "company.review": { items: [] },
    "finance.overview": null,
  });
}

type Section = { id: string; title: string; summary: string; updated: string; body?: string[] };

const SECTIONS: Section[] = [
  {
    id: "brand",
    title: "Brand voice",
    summary: "Plain and friendly. We write to clinic owners, not to software buyers.",
    updated: "Oct 28",
  },
  {
    id: "fernhollow",
    title: "Fernhollow Labs",
    summary: "The company: four people building tools for small clinics.",
    updated: "Oct 12",
  },
  {
    id: "loomstead",
    title: "Loomstead",
    summary: "Booking page for mobile pet groomers. In early testing, not for sale yet.",
    updated: "Oct 30",
  },
  {
    id: "quillfern",
    title: "Quillfern",
    summary: "Invoice reminders for small vet clinics.",
    updated: "Nov 2",
    body: [
      "Clinics connect their billing system. Quillfern sends the reminder and stops when the invoice is paid.",
      "Sold per clinic at a flat monthly price. Most customers have one to three vets.",
      "Ada leads the product. Ben runs the pilot.",
    ],
  },
];

function Rows({ open }: { open: string }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {SECTIONS.map((section) => {
        const expanded = section.id === open;
        return (
          <li key={section.id} className="py-3">
            <div className="flex items-start gap-2">
              <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-start">
                {expanded ? (
                  <ChevronDown aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight
                    aria-hidden
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-medium text-foreground">
                    {section.title}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] text-muted-foreground">
                    {section.summary}
                  </span>
                </span>
              </button>
              <span className="mt-0.5 hidden shrink-0 text-[12.5px] text-muted-foreground sm:block">
                {section.updated}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label="More" />}
                >
                  <Ellipsis aria-hidden className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>History</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {expanded && section.body ? (
              <div className="ms-6 mt-3 max-w-[68ch] space-y-2 text-[14px] leading-[1.55] text-foreground">
                {section.body.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <Button variant="outline" size="sm" className="mt-1">
                  Edit
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ContextTab({ state }: { state: "full" | "empty" | "writing" }) {
  if (state === "empty")
    return (
      <PageEmptyState
        icon={<BookOpenText className="size-8" strokeWidth={1.6} aria-hidden="true" />}
        title="What should every agent know?"
        description="Start with one product or topic."
      >
        <Button>Add the first section</Button>
      </PageEmptyState>
    );
  if (state === "writing")
    return (
      <form className="max-w-[68ch] space-y-3">
        <Input aria-label="Name" placeholder="Name" defaultValue="Quillfern" />
        <Textarea
          aria-label="What is it?"
          placeholder="What is it?"
          rows={7}
          defaultValue={
            "Invoice reminders for small vet clinics.\n\nClinics connect their billing system. Quillfern sends the reminder and stops when the invoice is paid."
          }
        />
        <div className="flex gap-2">
          <Button type="button">Save</Button>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      </form>
    );
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm">
          New section
        </Button>
      </div>
      <Rows open="quillfern" />
    </div>
  );
}

/**
 * Shows the planned tab inside the real Company page without changing it: adds the tab to the real
 * tab strip, hides the real tab's content and renders the mockup in its place.
 */
function ContextOverlay({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const list = document.querySelector<HTMLElement>('[role="tablist"]');
      const [overview, people] = list
        ? [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
        : [];
      const root = list?.parentElement;
      if (!list || !overview || !people || !root?.parentElement) return;
      if (!list.querySelector("[data-mock-context]")) {
        const context = overview.cloneNode(true) as HTMLElement;
        context.dataset.mockContext = "true";
        context.textContent = "Context";
        overview.after(context);
        const plain = people.cloneNode(true) as HTMLElement;
        plain.textContent = "Overview";
        overview.replaceWith(plain);
      }
      let target = root.parentElement.querySelector<HTMLElement>("[data-mock-host]");
      if (!target) {
        target = document.createElement("div");
        target.dataset.mockHost = "true";
        target.className = "mt-6";
        root.after(target);
        setHost(target);
      }
      for (const sibling of root.parentElement.children) {
        if (sibling !== root && sibling !== target && root.compareDocumentPosition(sibling) & 4)
          (sibling as HTMLElement).style.display = "none";
      }
    }, 60);
    return () => clearInterval(timer);
  }, []);
  return host ? createPortal(children, host) : null;
}

const meta = {
  title: "Company/Context (mockup)",
  component: ShellPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ShellPage>;
export default meta;
type Story = StoryObj<typeof meta>;

const page = (state: "full" | "empty" | "writing"): Story => ({
  decorators: [at("/app/company")],
  beforeEach: () => mocks([]),
  render: () => (
    <>
      <div className="h-dvh">
        <ShellPage />
      </div>
      <ContextOverlay>
        <ContextTab state={state} />
      </ContextOverlay>
    </>
  ),
});

export const Page = page("full");
/** The owner writes the first entry. */
export const Empty = page("empty");
export const Writing = page("writing");

const proposal = (flag?: string) => ({
  kind: "ask",
  text: "Add to Quillfern?",
  detail: "Reminders can also go out by text message. Clinics turn this on in their settings.",
  approvalEffectId: "effect_demo",
  status: "pending",
  ...(flag ? { approvalReason: flag } : {}),
  actions: [
    { id: "allow", label: "Approve" },
    { id: "edit", label: "Edit" },
    { id: "deny", label: "Reject" },
  ],
});

const thread = (blocks: unknown[], ask: string): Story => ({
  decorators: [at(`/app/${quillfern.id}`)],
  beforeEach: () => mocks([message(1, "user", text(ask)), message(2, "bot", blocks)]),
  render: () => (
    <div className="h-dvh">
      <ShellPage />
    </div>
  ),
});

export const Proposal = thread(
  [...text("Good to know. I'd like to keep this where every agent can find it."), proposal()],
  "Quillfern can send reminders by text message now.",
);

/** The run read a customer email first, so the card says so. */
export const ProposalFlagged = thread(
  [
    ...text("The customer's email mentions this. I'd like to add it."),
    proposal("This agent read outside content first."),
  ],
  "Go through the clinic's email and tell me what they asked for.",
);

export const FoundInContext = thread(
  text(
    "Quillfern is our invoice reminder product for small vet clinics, sold per clinic at a flat monthly price. I'll write the launch note for clinic owners and keep it plain and friendly.\n\nFrom [Company context: Quillfern](/app/company?view=context&section=quillfern)",
  ),
  "You're Quillfern. Write the launch note.",
);

export const FoundInAgentPage = thread(
  text(
    "Ben's launch plan says three clinics are in the pilot and Ben runs it. You haven't confirmed this, so tell me if it's out of date.\n\nFrom [Ben: Launch plan](/app/pages/bot_ben/page_launch)",
  ),
  "Who's in the Quillfern pilot?",
);
