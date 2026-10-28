import { Trans, useLingui } from "@lingui/react/macro";
import type { ApprovalActionType, ApprovalChoice, ApprovalTableRow } from "@rakazo/contracts";
import {
  NativeSelect,
  NativeSelectOption,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@rakazo/ui-web";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

/** The person-facing name of each action type. */
export function useActionTypeLabels(): Record<ApprovalActionType, string> {
  const { t } = useLingui();
  return {
    send_email: t`Send email`,
    spend_money: t`Spend money`,
    connected_apps_write: t`Connected apps (write)`,
    calendar_changes: t`Calendar changes`,
    files_and_commands: t`Edit files and run commands`,
    use_computer: t`Use the computer`,
    delete_data: t`Delete data`,
    message_outside: t`Message people outside Praci`,
    use_credentials: t`Use saved credentials`,
  };
}

const SAME = "same";

/**
 * The approvals table: one Allow / Ask / Block select per action type. Without `botId` it edits
 * the space-wide rows; with one, each select starts with "Same as all bots" and edits that bot's
 * override. Every change saves at once.
 */
export function ApprovalActionsTable({ botId }: { botId?: string }) {
  const { t } = useLingui();
  const labels = useActionTypeLabels();
  const [rows, setRows] = useState<ApprovalTableRow[] | null>(null);
  const [saving, setSaving] = useState<ApprovalActionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows((await rpc.approvalRules.table({ botId })).rows);
    } catch (err) {
      setError(errorText(err, t`Could not load approvals`));
    }
  }
  useEffect(() => {
    setRows(null);
    void load();
  }, [botId]);

  async function choose(actionType: ApprovalActionType, value: string) {
    if (saving) return;
    const effect = value === SAME ? null : (value as ApprovalChoice);
    setSaving(actionType);
    setError(null);
    try {
      await rpc.approvalRules.setActionType({ actionType, botId, effect });
      await load();
    } catch (err) {
      setError(errorText(err, t`Could not save approvals`));
    } finally {
      setSaving(null);
    }
  }

  const renderRow = (row: ApprovalTableRow) => (
    <TableRow key={row.actionType}>
      <TableCell className="whitespace-normal py-1.5 pl-0 text-[14px] text-foreground/75">
        {labels[row.actionType]}
      </TableCell>
      <TableCell className="py-1.5 pr-0 text-right">
        <NativeSelect
          size="sm"
          className="ml-auto pointer-coarse:min-w-44"
          aria-label={labels[row.actionType]}
          data-testid={`approval-row-${row.actionType}`}
          disabled={saving !== null}
          value={botId ? (row.botEffect ?? SAME) : row.spaceEffect}
          onChange={(event) => void choose(row.actionType, event.target.value)}
        >
          {botId ? (
            <NativeSelectOption value={SAME}>
              <Trans>Same as all bots</Trans>
            </NativeSelectOption>
          ) : null}
          <NativeSelectOption value="allow">
            <Trans>Allow</Trans>
          </NativeSelectOption>
          <NativeSelectOption value="ask">
            <Trans>Ask</Trans>
          </NativeSelectOption>
          <NativeSelectOption value="block">
            <Trans>Block</Trans>
          </NativeSelectOption>
        </NativeSelect>
      </TableCell>
    </TableRow>
  );

  if (!rows) {
    return error ? (
      <p className="text-[13px] text-destructive">{error}</p>
    ) : (
      <Skeleton className="h-40 w-full" data-testid="approvals-skeleton" />
    );
  }
  const more = rows.filter((row) => !row.primary);
  return (
    <div data-testid="approval-actions-table">
      <Table compact>
        <TableBody>{rows.filter((row) => row.primary).map(renderRow)}</TableBody>
      </Table>
      {more.length > 0 ? (
        <details className="group mt-1">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 text-[13px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-90"
            />
            <Trans>More actions</Trans>
          </summary>
          <Table compact>
            <TableBody>{more.map(renderRow)}</TableBody>
          </Table>
        </details>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
    </div>
  );
}
