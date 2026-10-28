import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Contact, ContactKind } from "@rakazo/contracts";
import { ContactKindSchema } from "@rakazo/contracts";
import {
  Badge,
  Button,
  ContactAvatar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadRow,
  TableRow,
} from "@rakazo/ui-web";
import { Plus, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBotButton } from "../components/AskBotButton";
import { ContactDialog, contactKindNames } from "../components/ContactDialog";
import { PickFilter, SearchField, SortControl } from "../components/ListControls";
import { PageEmptyState } from "../components/PageEmptyState";
import { PAGE_GUTTER_X, PageHeader } from "../components/PageHeader";
import { RowsSkeleton } from "../components/RowsSkeleton";
import { sortBy, useListParams } from "../lib/list-params";
import { rpc } from "../lib/rpc";
import {
  CONTACT_RESTORED_EVENT,
  SAVED_ROW_CLASS,
  useContactNotices,
} from "../lib/use-contact-notices";
import { errorText } from "../lib/user-error";

const CONTACT_SORTS = ["default", "name", "email", "organization", "kind"] as const;

const matches = (contact: Contact, needle: string, kindName: string) =>
  [contact.name, contact.email, contact.organization, contact.notes, kindName].some((field) =>
    field?.toLowerCase().includes(needle),
  );

/** The people and companies the business works with, saved by the user or by their agents. */
export function ContactsPage({
  spaceName,
  onAskAgent,
}: {
  spaceName?: string;
  onAskAgent?: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");
  // Search, kind and sort live in the URL: ?q=, kind, sort, dir. "default" is the server's order.
  const list = useListParams(CONTACT_SORTS, { field: "default", dir: "asc" });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = list.param("q") ?? "";
  const parsedKind = ContactKindSchema.safeParse(list.param("kind"));
  const kind = parsedKind.success ? parsedKind.data : undefined;
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const names = contactKindNames();

  const latestLoad = useRef(0);
  const load = useCallback(() => {
    const request = ++latestLoad.current;
    rpc.contacts
      .list({})
      .then((list) => {
        if (request !== latestLoad.current) return;
        setContacts(list);
        setError("");
      })
      .catch((cause) => {
        if (request === latestLoad.current) setError(errorText(cause, t`Could not load contacts`));
      });
  }, []);
  useEffect(load, [load]);
  const container = useRef<HTMLDivElement>(null);
  const { notify, savedId, setSavedId, setFocusId, deleted } = useContactNotices(
    load,
    container,
    contacts,
  );
  // An Undo clicked here for a contact deleted on its page restores it from that page's hook.
  useEffect(() => {
    const onRestored = (event: Event) => {
      load();
      const id = (event as CustomEvent<string | undefined>).detail;
      if (id) {
        setSavedId(id);
        setFocusId(id);
      }
    };
    window.addEventListener(CONTACT_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(CONTACT_RESTORED_EVENT, onRestored);
  }, [load, setSavedId, setFocusId]);

  const needle = query.trim().toLowerCase();
  const found = (contacts ?? []).filter(
    (contact) =>
      (!kind || contact.kind === kind) &&
      (!needle || matches(contact, needle, names[contact.kind])),
  );
  const { field, dir } = list.sort;
  const shown =
    field === "default"
      ? found
      : sortBy(found, (c) => (field === "kind" ? names[c.kind] : c[field]) || null, dir);
  const sortFields: [Exclude<typeof field, "default">, string][] = [
    ["name", t`Name`],
    ["email", t`Email`],
    ["organization", t`Organization`],
    ["kind", t`Kind`],
  ];
  const sortHead = (target: (typeof CONTACT_SORTS)[number]) => ({
    sortDirection: field === target ? dir : null,
    onSort: () => list.toggleSort(target),
  });

  return (
    <div className="@container/bd flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={`${PAGE_GUTTER_X} pt-2`}>
        <PageHeader
          // The space name is in the sidebar; on a phone it only adds a row under the title.
          className="max-sm:[&_[data-page-header-meta]]:hidden"
          title={<Trans>Contacts</Trans>}
          spaceName={spaceName}
          actions={
            <>
              {contacts?.length === 0 ? null : (
                <Button onClick={() => setEditing("new")}>
                  <Plus aria-hidden="true" />
                  <Trans>Add contact</Trans>
                </Button>
              )}
              {onAskAgent ? <AskBotButton botName="Chief" onClick={onAskAgent} /> : null}
            </>
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
        ) : contacts === null ? (
          <RowsSkeleton className="pt-2" />
        ) : contacts.length === 0 ? (
          <PageEmptyState
            icon={<Users className="size-8" strokeWidth={1.6} aria-hidden="true" />}
            title={<Trans>No contacts yet</Trans>}
            description={
              <Trans>
                Investors, advisors and customers you add or your bots find appear here.
              </Trans>
            }
          >
            <Button variant="outline" onClick={() => setEditing("new")}>
              <Plus aria-hidden="true" />
              <Trans>Add contact</Trans>
            </Button>
          </PageEmptyState>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <SearchField
                className="w-full @md:w-72"
                value={query}
                onChange={(next) => list.setParam("q", next)}
                placeholder={t`Search`}
                label={t`Search`}
                name="contacts-search"
              />
              <PickFilter
                label={t`Kind`}
                value={kind}
                options={(Object.keys(names) as ContactKind[]).map((value) => [
                  value,
                  names[value],
                ])}
                onChange={(next) => list.setParam("kind", next)}
              />
              {/* Wide, the column headers sort; on a phone the Filters sheet does. */}
              <span className="sm:hidden">
                <SortControl
                  fields={sortFields}
                  field={field as Exclude<typeof field, "default">}
                  fieldLabel={sortFields.find(([name]) => name === field)?.[1] ?? t`Default`}
                  direction={field === "default" ? undefined : dir}
                  onField={(next) => list.setSort({ field: next, dir: "asc" })}
                  onDirection={(next) => list.setSort({ field, dir: next })}
                />
              </span>
            </div>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  <Trans>No matches</Trans>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    list.clear("q", "kind");
                    container.current
                      ?.querySelector<HTMLInputElement>("input[name=contacts-search]")
                      ?.focus();
                  }}
                >
                  <Trans>Clear filters</Trans>
                </Button>
              </div>
            ) : (
              <div>
                <Table compact className="table-fixed">
                  <TableHeader className="max-sm:hidden">
                    <TableHeadRow>
                      <TableHead className="ps-2" {...sortHead("name")}>
                        <Trans>Name</Trans>
                      </TableHead>
                      <TableHead className="hidden w-[34%] @md:table-cell" {...sortHead("email")}>
                        <Trans>Email</Trans>
                      </TableHead>
                      <TableHead
                        className="hidden w-[26%] @lg:table-cell"
                        {...sortHead("organization")}
                      >
                        <Trans>Organization</Trans>
                      </TableHead>
                      <TableHead className="w-24 @md:w-28" {...sortHead("kind")}>
                        <Trans>Kind</Trans>
                      </TableHead>
                    </TableHeadRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((contact) => (
                      <TableRow
                        key={contact.id}
                        data-contact-id={contact.id}
                        className={contact.id === savedId ? SAVED_ROW_CLASS : ""}
                        onOpen={() =>
                          // The search and filter ride along, so Back restores them.
                          navigate(`/app/contacts/${contact.id}${params.size ? `?${params}` : ""}`)
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ContactAvatar name={contact.name} src={contact.photoUrl} size="sm" />
                            <div className="min-w-0">
                              <button
                                type="button"
                                title={contact.name}
                                data-row-open
                                className="block max-w-full truncate rounded-sm text-start font-medium outline-none hover:underline"
                              >
                                {contact.name}
                              </button>
                              {/* Without room for the Email column, organization and email show here; the email is the identifier, so the organization gives way first. */}
                              <div className="flex gap-1 text-xs text-muted-foreground @md:hidden">
                                {contact.organization ? (
                                  <span
                                    className="max-w-[40%] min-w-12 truncate"
                                    title={contact.organization}
                                  >
                                    {contact.organization}
                                  </span>
                                ) : null}
                                {contact.organization && contact.email ? (
                                  <span aria-hidden="true">·</span>
                                ) : null}
                                {contact.email ? (
                                  <span className="min-w-0 truncate" title={contact.email}>
                                    {contact.email}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell
                          className="hidden truncate @md:table-cell"
                          title={contact.email ?? undefined}
                        >
                          {contact.email}
                        </TableCell>
                        <TableCell
                          className="hidden truncate @lg:table-cell"
                          title={contact.organization ?? undefined}
                        >
                          {contact.organization}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{names[contact.kind]}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
        {editing ? (
          <ContactDialog
            key={editing === "new" ? "new" : editing.id}
            contact={editing === "new" ? null : editing}
            prefill={
              editing === "new"
                ? { name: "", email: null, organization: null, kind: kind ?? "other" }
                : undefined
            }
            contacts={contacts ?? []}
            finalFocus={() =>
              editing === "new"
                ? null
                : container.current?.querySelector<HTMLElement>(
                    `[data-contact-id="${editing.id}"] [data-row-open]`,
                  )
            }
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              load();
              if (editing === "new") {
                // A search or kind filter would hide the new contact.
                list.clear("q", "kind");
                notify(t`Added ${saved.name}`);
              }
              setSavedId(saved.id);
            }}
            onDeleted={deleted}
            onOpenContact={setEditing}
          />
        ) : null}
      </div>
    </div>
  );
}
