import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Contact, ContactDetail } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ContactDialog, contactKindNames, contactStageNames } from "../components/ContactDialog";
import { InboxMessageDialog } from "../components/inbox/InboxMessageDialog";
import { PAGE_GUTTER_X, PageHeader } from "../components/PageHeader";
import { RowsSkeleton } from "../components/RowsSkeleton";
import { usdFigure } from "../lib/finance-format";
import { formatMailTime } from "../lib/mail-time";
import { rpc } from "../lib/rpc";
import { CONTACT_RESTORED_EVENT, useContactNotices } from "../lib/use-contact-notices";
import { errorText } from "../lib/user-error";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(i18n.locale || "en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const safeStatusNames = (): Record<string, string> => ({
  draft: t`Draft`,
  sent: t`Sent`,
  signed: t`Signed`,
  funded: t`Funded`,
  expired: t`Expired`,
  canceled: t`Canceled`,
});

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

const rowClass = "flex items-baseline justify-between gap-3 py-2 text-sm";

/** One contact: its details and whatever is stored against it. A list with nothing in it is hidden. */
export function ContactDetailPage({ id, spaceName }: { id: string; spaceName?: string }) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [openMail, setOpenMail] = useState<ContactDetail["mail"][number] | null>(null);
  const navigate = useNavigate();
  // The list's search and filter ride in this URL's query, so Back restores them.
  const { search } = useLocation();
  const back = () => navigate(`/app/contacts${search}`);
  const container = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    rpc.contacts
      .detail({ id })
      .then((loaded) => {
        setDetail(loaded);
        setError("");
      })
      .catch((cause) => setError(errorText(cause, t`Could not load contact`)));
  }, [id]);
  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);
  // The list reloads when it opens; an Undo clicked after returning to it tells it to reload.
  const { deleted } = useContactNotices(
    (restoredId) =>
      restoredId &&
      window.dispatchEvent(new CustomEvent(CONTACT_RESTORED_EVENT, { detail: restoredId })),
    container,
    null,
  );
  // The user's other contacts, so the dialog can offer the one that already has an email.
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => {
    rpc.contacts.list({}).then(setContacts, () => {});
  }, []);

  const kinds = contactKindNames();
  const contact = detail?.contact;
  const facts: [string, string | null | undefined][] = contact
    ? [
        [t`Email`, contact.email],
        [t`Organization`, contact.organization],
        [t`Kind`, kinds[contact.kind]],
        [t`Stage`, contact.stage ? contactStageNames()[contact.stage] : null],
        [
          t`Check size`,
          contact.checkSizeCents == null
            ? null
            : usdFigure(contact.checkSizeCents / 100, 0, i18n.locale || "en"),
        ],
        [t`Next step`, contact.nextStep],
        [t`Added by`, contact.addedBy?.name],
        [t`Notes`, contact.notes],
      ]
    : [];

  return (
    <div className="@container/bd flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={`${PAGE_GUTTER_X} pt-2`}>
        <PageHeader
          className="max-sm:[&_[data-page-header-meta]]:hidden"
          // A flex row so the shared Avatar can sit before the name.
          title={<span className="flex min-w-0 items-center gap-3">{contact?.name ?? ""}</span>}
          spaceName={spaceName}
          onBack={back}
          actions={
            contact ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                <Trans>Edit</Trans>
              </Button>
            ) : null
          }
        />
      </div>
      <div ref={container} className={`rk-scroll flex-1 overflow-y-auto ${PAGE_GUTTER_X} pb-6`}>
        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-sm">
            <span className="text-destructive">{error}</span>
            <Button variant="outline" size="sm" onClick={load}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : detail === null ? (
          <RowsSkeleton className="pt-2" />
        ) : (
          <>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
              {facts.map(([label, value]) =>
                value ? (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            {detail.mail.length > 0 ? (
              <Section title={<Trans>Emails</Trans>}>
                {detail.mail.map((mail) => (
                  <li key={mail.id}>
                    <button
                      type="button"
                      onClick={() => setOpenMail(mail)}
                      className={`${rowClass} w-full text-start hover:bg-accent`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{mail.subject}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {mail.from} · {mail.snippet}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatMailTime(mail.receivedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </Section>
            ) : null}
            {detail.meetings.length > 0 ? (
              <Section title={<Trans>Meetings</Trans>}>
                {detail.meetings.map((meeting) => (
                  <li key={meeting.id} className={rowClass}>
                    <span className="truncate">{meeting.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {date(meeting.startedAt)}
                    </span>
                  </li>
                ))}
              </Section>
            ) : null}
            {detail.documents.length > 0 ? (
              <Section title={<Trans>Documents</Trans>}>
                {detail.documents.map((document) => (
                  <li key={document.id} className={rowClass}>
                    <span className="truncate">{document.name}</span>
                  </li>
                ))}
              </Section>
            ) : null}
            {detail.safes.length > 0 ? (
              <Section title={<Trans>SAFEs</Trans>}>
                {detail.safes.map((safe) => (
                  <li key={safe.id} className={rowClass}>
                    <span>{usdFigure(safe.amountCents / 100, 0, i18n.locale || "en")}</span>
                    <span className="text-xs text-muted-foreground">
                      {safeStatusNames()[safe.status] ?? safe.status}
                    </span>
                  </li>
                ))}
              </Section>
            ) : null}
          </>
        )}
        <InboxMessageDialog
          messageId={openMail?.id ?? null}
          subject={openMail?.subject}
          preview={
            openMail
              ? { from: openMail.from, receivedAt: openMail.receivedAt, snippet: openMail.snippet }
              : undefined
          }
          onClose={() => setOpenMail(null)}
        />
        {editing && contact ? (
          <ContactDialog
            contact={contact}
            contacts={contacts}
            onOpenContact={(other) => {
              setEditing(false);
              navigate(`/app/contacts/${other.id}${search}`);
            }}
            onClose={() => setEditing(false)}
            onSaved={load}
            onDeleted={(gone, undoable) => {
              deleted(gone, undoable);
              back();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
