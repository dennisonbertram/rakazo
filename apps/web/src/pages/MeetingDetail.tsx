import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { StoredMeetingDetail } from "@rakazo/contracts";
import { Button, Checkbox } from "@rakazo/ui-web";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { dueLabel } from "../components/inbox/TodoCard";
import { ConfirmDialog } from "../components/integrations/AppDetail";
import { PAGE_GUTTER_X, PageHeader } from "../components/PageHeader";
import { RowsSkeleton } from "../components/RowsSkeleton";
import { meetingMinutes, meetingSourceName } from "../lib/meeting-source";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { formatMeetingDate } from "./Meetings";

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 max-w-3xl">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {children}
      </ul>
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => (
  <li className="px-3.5 py-2.5">{children}</li>
);

/** One stored meeting: what was decided, who owes what, and the transcript when asked for. */
export function MeetingDetailPage({
  meetingId,
  spaceName,
}: {
  meetingId: string;
  spaceName?: string;
}) {
  const [meeting, setMeeting] = useState<StoredMeetingDetail | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  // The list's search and filter ride in this URL's query, so Back restores them.
  const { search } = useLocation();
  const back = () => navigate(`/app/meetings${search}`);

  // A reply for a meeting the page has since left is ignored.
  const current = useRef(meetingId);
  current.current = meetingId;
  const load = useCallback(() => {
    rpc.meetings
      .get({ meetingId })
      .then((loaded) => {
        if (current.current !== meetingId) return;
        setMeeting(loaded);
        setError("");
      })
      .catch((cause) => {
        if (current.current === meetingId) setError(errorText(cause, t`Could not load meeting`));
      });
  }, [meetingId]);
  useEffect(() => {
    setMeeting(null);
    setError("");
    load();
  }, [load]);

  const setDone = (todoId: string, done: boolean) =>
    rpc.inbox.todos
      .setDone({ id: todoId, done })
      .then((todo) =>
        setMeeting(
          (m) =>
            m && {
              ...m,
              todos: m.todos.map((x) => (x.id === todoId ? { ...x, doneAt: todo.doneAt } : x)),
            },
        ),
      )
      .catch((cause) => setError(errorText(cause)));

  async function remove() {
    setBusy(true);
    try {
      await rpc.meetings.delete({ meetingId });
      back();
    } catch (cause) {
      setDeleting(false);
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  const minutes = meeting ? meetingMinutes(meeting) : null;
  const now = new Date();
  return (
    <div className="@container/bd flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={`${PAGE_GUTTER_X} pt-2`}>
        <PageHeader
          className="max-sm:[&_[data-page-header-meta]]:hidden"
          title={<span className="truncate">{meeting?.title ?? ""}</span>}
          spaceName={spaceName}
          onBack={back}
          meta={
            meeting ? (
              <span className="text-xs text-muted-foreground">
                {[
                  formatMeetingDate(meeting.startedAt),
                  minutes ? t`${minutes} min` : null,
                  meetingSourceName(meeting.provider),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null
          }
          actions={
            meeting ? (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trans>Delete</Trans>
              </Button>
            ) : null
          }
        />
      </div>
      <div className={`rk-scroll flex-1 overflow-y-auto ${PAGE_GUTTER_X} pb-6`}>
        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-sm">
            <span className="text-destructive">{error}</span>
            <Button variant="outline" size="sm" onClick={load}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {meeting === null ? (
          error ? null : (
            <RowsSkeleton className="pt-2" />
          )
        ) : (
          <>
            {meeting.summary ? <p className="mt-2 max-w-3xl text-sm">{meeting.summary}</p> : null}
            {meeting.decisions.length > 0 ? (
              <Section title={<Trans>Decisions</Trans>}>
                {meeting.decisions.map((text) => (
                  <Row key={text}>{text}</Row>
                ))}
              </Section>
            ) : null}
            {meeting.followUps.length > 0 ? (
              <Section title={<Trans>Follow-ups</Trans>}>
                {meeting.followUps.map((text) => (
                  <Row key={text}>{text}</Row>
                ))}
              </Section>
            ) : null}
            {meeting.todos.length > 0 ? (
              <Section title={<Trans>Your to-dos</Trans>}>
                {meeting.todos.map((todo) => (
                  <li key={todo.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Checkbox
                      checked={todo.doneAt !== null}
                      aria-label={todo.text}
                      onCheckedChange={(done) => void setDone(todo.id, done === true)}
                    />
                    <span
                      className={`min-w-0 flex-1 ${todo.doneAt ? "text-muted-foreground line-through" : ""}`}
                    >
                      {todo.text}
                    </span>
                    {todo.dueOn ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {dueLabel(todo.dueOn, now)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </Section>
            ) : null}
            {meeting.transcript ? (
              <details className="group mt-6 max-w-3xl">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronRight
                    className="size-4 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                  <Trans>Transcript</Trans>
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{meeting.transcript}</p>
              </details>
            ) : null}
          </>
        )}
      </div>
      <ConfirmDialog
        open={deleting}
        busy={busy}
        title={t`Delete "${meeting?.title ?? ""}"?`}
        confirm={t`Delete`}
        onCancel={() => setDeleting(false)}
        onConfirm={() => void remove()}
      >
        <li>
          {meeting?.provider === "granola" ? (
            <Trans>
              Removes this meeting and its to-dos from Praci. Your note in Granola is not changed.
            </Trans>
          ) : (
            <Trans>Removes this meeting and its to-dos from Praci.</Trans>
          )}
        </li>
      </ConfirmDialog>
    </div>
  );
}
