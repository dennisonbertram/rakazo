import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { InboxPersonContext } from "@rakazo/contracts";
import { cn, Skeleton } from "@rakazo/ui-web";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatMailTime } from "../../lib/mail-time";
import { rpc } from "../../lib/rpc";
import { Shimmer } from "../ai/primitives";
import { contactKindNames } from "../ContactDialog";

export interface ContextPerson {
  email: string;
  name?: string;
}

const hasFacts = (facts: InboxPersonContext) =>
  Boolean(
    facts.name ||
      facts.kind ||
      facts.threadCount ||
      facts.documents.length ||
      facts.todos.length ||
      facts.lastMeeting ||
      facts.nextMeeting,
  );

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

const linkClass = "block truncate underline-offset-2 hover:underline focus-visible:underline";

function Meeting({ meeting }: { meeting: NonNullable<InboxPersonContext["lastMeeting"]> }) {
  const label = `${meeting.title} · ${formatMailTime(meeting.start)}`;
  return meeting.href ? (
    <a
      href={meeting.href}
      target="_blank"
      rel="noopener noreferrer"
      dir="auto"
      className={linkClass}
    >
      {label}
    </a>
  ) : (
    <span dir="auto" className="block truncate">
      {label}
    </span>
  );
}

/**
 * What the user already has about one address. The facts come first and carry no model; the
 * summary is asked for once they are in, and stays out when there is no model or consent.
 */
function PersonFacts({ email }: { email: string }) {
  const [facts, setFacts] = useState<InboxPersonContext | null | undefined>(undefined);
  const [summary, setSummary] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setFacts(undefined);
    setSummary(undefined);
    (async () => {
      const loaded: InboxPersonContext | null = await Promise.resolve()
        .then(() => rpc.inbox.personContext({ email }))
        .catch(() => null);
      if (!current) return;
      setFacts(loaded);
      if (!loaded || !hasFacts(loaded)) return setSummary(null);
      const result = await Promise.resolve()
        .then(() => rpc.inbox.personSummary({ email }))
        .catch(() => null);
      if (current) setSummary(result?.status === "ok" ? result.summary : null);
    })();
    return () => {
      current = false;
    };
  }, [email]);

  if (facts === undefined)
    return (
      <div role="status" aria-busy="true" aria-label={t`Loading`} className="flex flex-col gap-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    );
  if (!facts || !hasFacts(facts))
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>No context yet</Trans>
      </p>
    );
  const identity = [
    facts.organization,
    facts.kind && ((contactKindNames() as Record<string, string>)[facts.kind] ?? facts.kind),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-3">
      {summary === undefined ? (
        <p className="text-sm" role="status">
          <Shimmer>
            <Trans>Summarizing</Trans>
          </Shimmer>
        </p>
      ) : summary ? (
        <p dir="auto" className="text-sm">
          {summary}
        </p>
      ) : null}
      <dl className="flex flex-col gap-1.5">
        {identity ? (
          <Row label={t`Contact`}>
            {facts.contactId ? (
              <Link to={`/app/contacts/${facts.contactId}`} dir="auto" className={linkClass}>
                {identity}
              </Link>
            ) : (
              <span dir="auto">{identity}</span>
            )}
          </Row>
        ) : null}
        {facts.lastEmailedAt ? (
          <Row label={t`Last emailed`}>{formatMailTime(facts.lastEmailedAt)}</Row>
        ) : null}
        {facts.threads.length ? (
          <Row label={t`Threads`}>
            {facts.threads.map((thread) => (
              <Link
                key={thread.id}
                to={`/app/inbox?mail=${encodeURIComponent(thread.id)}`}
                dir="auto"
                className={linkClass}
              >
                {thread.subject}
              </Link>
            ))}
          </Row>
        ) : null}
        {facts.lastMeeting ? (
          <Row label={t`Last meeting`}>
            <Meeting meeting={facts.lastMeeting} />
          </Row>
        ) : null}
        {facts.nextMeeting ? (
          <Row label={t`Next meeting`}>
            <Meeting meeting={facts.nextMeeting} />
          </Row>
        ) : null}
        {facts.documents.length ? (
          <Row label={t`Documents`}>
            {facts.documents.map((doc) => (
              <Link
                key={doc.id}
                to={`/app/data-room?item=${encodeURIComponent(doc.id)}`}
                dir="auto"
                className={linkClass}
              >
                {doc.name}
              </Link>
            ))}
          </Row>
        ) : null}
        {facts.todos.length ? (
          <Row label={t`To-dos`}>
            {facts.todos.map((todo) => (
              <span key={todo.id} dir="auto" className="block truncate">
                {todo.text}
              </span>
            ))}
          </Row>
        ) : null}
      </dl>
    </div>
  );
}

/** One section per person, the first one open; each loads only when it is open. */
export function ContextPanel({ people }: { people: ContextPerson[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!people.length)
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        <Trans>No context yet</Trans>
      </p>
    );
  return (
    <div className="flex flex-col divide-y divide-border">
      {people.map((person, index) => {
        const expanded = open[person.email] ?? index === 0;
        return (
          <section key={person.email} className="px-4 py-3">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen({ ...open, [person.email]: !expanded })}
              className="flex w-full items-center gap-2 rounded-md text-start text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {person.name || person.email}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn("size-4 shrink-0 text-muted-foreground", expanded && "rotate-180")}
              />
            </button>
            {expanded ? (
              <div className="mt-2">
                <PersonFacts email={person.email} />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
