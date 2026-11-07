import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Contact, PipelineInterest, PipelineStatus } from "@rakazo/contracts";
import {
  Badge,
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  ContactAvatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
} from "@rakazo/ui-web";
import { Check, ChevronDown, Minus, Plus, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { todayDay } from "../../lib/day-input";
import { shortDay } from "../../lib/finance-format";
import type { PipelineRow } from "../../lib/pipeline-rows";
import { callDay, daysFrom } from "../../lib/pipeline-rows";

export const statusNames = (): Record<PipelineStatus, string> => ({
  not_reached: t`Not reached`,
  intro_requested: t`Intro requested`,
  intro_made: t`Intro made`,
  meeting_booked: t`Meeting booked`,
  met: t`Met`,
  diligence: t`Diligence`,
  committed: t`Committed`,
  passed: t`Passed`,
});

export const interestNames = (): Record<PipelineInterest, string> => ({
  in: t`In`,
  maybe: t`Maybe`,
  out: t`Out`,
});

const locale = () => i18n.locale || "en";

/** A short day such as "Nov 4", from a YYYY-MM-DD day. */
export const dayLabel = (day: string) => shortDay(day, new Date(), locale());

/** "Today, 3:30 PM", "Nov 6", from a row's next call. */
export function callLabel(row: PipelineRow): string | null {
  const day = callDay(row);
  if (!day || !row.nextCallAt) return null;
  const date = daysFrom(day, todayDay()) === 0 ? t`Today` : dayLabel(day);
  if (!row.nextCallHasTime) return date;
  const time = new Date(row.nextCallAt).toLocaleTimeString(locale(), {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}

export const isOverdue = (row: PipelineRow) => {
  const day = callDay(row);
  return Boolean(day && daysFrom(day, todayDay()) < 0);
};

/** One blank-cell rule: an unset value is a muted dash. */
export const Dash = () => <span className="text-muted-foreground">—</span>;

/** The dash that turns into its action word on row hover, focus and touch. */
export const BlankAction = ({ children }: { children: ReactNode }) => (
  <>
    <span className="group-focus-within/row:hidden group-hover/row:hidden pointer-coarse:hidden">
      <Dash />
    </span>
    <span className="hidden text-muted-foreground group-focus-within/row:inline group-hover/row:inline pointer-coarse:inline">
      {children}
    </span>
  </>
);

export function StatusPick({
  row,
  onChange,
}: {
  row: PipelineRow;
  onChange: (status: PipelineStatus) => void;
}) {
  const names = statusNames();
  const name = names[row.status];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t`Status of ${row.name}: ${name}`}
            className="inline-flex max-w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 pointer-coarse:items-center"
          />
        }
      >
        <Badge variant={row.status === "not_reached" ? "outline" : "secondary"}>
          {name}
          <ChevronDown aria-hidden="true" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-max min-w-40">
        <DropdownMenuRadioGroup
          value={row.status}
          onValueChange={(next) => onChange(String(next) as PipelineStatus)}
        >
          {(Object.keys(names) as PipelineStatus[]).map((id) => (
            <DropdownMenuRadioItem key={id} value={id} closeOnClick>
              {names[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const INTEREST_ICON = { in: Check, maybe: Minus, out: X } as const;
const INTEREST_IDS = ["in", "maybe", "out"] as const;
/** No solid fill: a mark and a border. In and Out differ by colour and glyph, not only the word. */
const INTEREST_ON: Record<PipelineInterest, string> = {
  in: "z-10 border-success font-semibold text-success",
  maybe: "z-10 border-foreground font-semibold",
  out: "z-10 border-muted-foreground bg-muted font-medium text-muted-foreground",
};

/** In, Maybe and Out as three toggles, each a tab stop. Pressing the one that is on clears it. */
export function InterestChoice({
  row,
  onChange,
  wide = false,
}: {
  row: PipelineRow;
  onChange: (value: PipelineInterest | null) => void;
  wide?: boolean;
}) {
  const names = interestNames();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add a legend and a border for three toggles.
    <div
      role="group"
      aria-label={t`Interest: ${row.name}`}
      className={wide ? "flex" : "inline-flex"}
    >
      {INTEREST_IDS.map((id) => {
        const on = row.interest === id;
        const Icon = INTEREST_ICON[id];
        return (
          <Toggle
            key={id}
            size="sm"
            variant="outline"
            pressed={on}
            onPressedChange={(pressed) => onChange(pressed ? id : null)}
            style={wide ? undefined : { minWidth: 30 + names[id].length * 7 }}
            className={`relative gap-0.5 rounded-none text-xs not-first:-ms-px first:rounded-s-md last:rounded-e-md focus-visible:z-20 aria-pressed:bg-transparent ${wide ? "h-11 flex-1" : "h-6 px-1"} ${on ? INTEREST_ON[id] : ""}`}
          >
            {on ? <Icon aria-hidden="true" className="size-3" /> : null}
            {names[id]}
          </Toggle>
        );
      })}
    </div>
  );
}

/** The same choice as a pill where a phone row has no room for three toggles. */
export function InterestPick({
  row,
  onChange,
}: {
  row: PipelineRow;
  onChange: (value: PipelineInterest | null) => void;
}) {
  const names = interestNames();
  const name = row.interest ? names[row.interest] : t`Not set`;
  const Icon = row.interest ? INTEREST_ICON[row.interest] : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t`Interest of ${row.name}: ${name}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <Badge variant={row.interest ? "secondary" : "outline"}>
          {Icon ? <Icon aria-hidden="true" /> : null}
          {row.interest ? names[row.interest] : t`Set interest`}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-32">
        <DropdownMenuRadioGroup
          value={row.interest ?? ""}
          onValueChange={(next) => onChange((String(next) || null) as PipelineInterest | null)}
        >
          {INTEREST_IDS.map((id) => (
            <DropdownMenuRadioItem key={id} value={id} closeOnClick>
              {names[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Matches first; Create only when no contact matches, so Enter cannot make a duplicate. */
export function ReferredByPicker({
  row,
  contacts,
  trigger,
  onPick,
  onCreate,
}: {
  row: PipelineRow;
  contacts: readonly Contact[];
  trigger: ReactNode;
  onPick: (contactId: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const typed = query.trim().toLowerCase();
  const matches = contacts
    .filter((contact) => contact.name.toLowerCase().includes(typed))
    .slice(0, 8);
  const done = (act: () => void) => {
    act();
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton
        render={
          <button
            type="button"
            aria-label={t`Add who referred ${row.name}`}
            className="block max-w-full truncate rounded-sm text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t`Search contacts`}
            value={query}
            onValueChange={setQuery}
            aria-label={t`Search contacts`}
          />
          <CommandList>
            <CommandGroup>
              {matches.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={contact.id}
                  onSelect={() => done(() => onPick(contact.id))}
                >
                  <ContactAvatar name={contact.name} size="sm" />
                  {contact.name}
                </CommandItem>
              ))}
              {typed && matches.length === 0 ? (
                <CommandItem value={query} onSelect={() => done(() => onCreate(query.trim()))}>
                  <Plus aria-hidden="true" />
                  {t`Create “${query.trim()}”`}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Date and optional time of the next call. A change saves at once; Clear removes it. */
export function NextCallEditor({
  row,
  onSave,
  children,
}: {
  row: PipelineRow;
  onSave: (next: { day: string; time: string | null } | null) => void;
  children: ReactNode;
}) {
  const day = callDay(row) ?? "";
  const time =
    row.nextCallHasTime && row.nextCallAt
      ? new Date(row.nextCallAt).toTimeString().slice(0, 5)
      : "";
  return (
    <Popover>
      <PopoverTrigger
        nativeButton
        render={
          <button
            type="button"
            aria-label={t`Next call with ${row.name}`}
            className={`block max-w-full truncate rounded-sm text-start outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring ${isOverdue(row) ? "text-destructive" : ""}`}
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`date-${row.id}`}>
              <Trans>Next call</Trans>
            </Label>
            <Input
              id={`date-${row.id}`}
              type="date"
              value={day}
              onChange={(event) =>
                event.target.value
                  ? onSave({ day: event.target.value, time: time || null })
                  : onSave(null)
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`time-${row.id}`}>
              <Trans>Time</Trans>
            </Label>
            <Input
              id={`time-${row.id}`}
              type="time"
              value={time}
              disabled={!day}
              onChange={(event) => day && onSave({ day, time: event.target.value || null })}
            />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-start">
          <Button variant="ghost" size="sm" disabled={!day} onClick={() => onSave(null)}>
            <Trans>Clear</Trans>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A one-line value edited in a small popover: Enter or Save writes it, an empty value clears it. */
export function ValueEditor({
  label,
  value,
  inputMode,
  onSave,
  children,
}: {
  label: string;
  value: string;
  inputMode?: "text" | "decimal";
  onSave: (text: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(text);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setText(value);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        nativeButton
        render={
          <button
            type="button"
            aria-label={label}
            className="block max-w-full truncate rounded-sm text-start outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form className="flex gap-2" onSubmit={submit}>
          <Input
            aria-label={label}
            inputMode={inputMode}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" size="sm">
            <Trans>Save</Trans>
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
