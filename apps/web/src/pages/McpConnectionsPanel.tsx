import { Trans, useLingui } from "@lingui/react/macro";
import type { McpConnectionList, McpPendingAction } from "@rakazo/contracts";
import {
  Button,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadRow,
  TableRow,
} from "@rakazo/ui-web";
import { Fragment, useCallback, useEffect, useState } from "react";
import { rpc } from "../lib/rpc";
import { McpActionCard } from "./McpActionCard";
import { McpConnectionActivity } from "./McpConnectionActivity";
import { McpTokenDialog } from "./McpTokenDialog";

export function McpConnectionsPanel() {
  const { t, i18n } = useLingui();
  const [list, setList] = useState<McpConnectionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [pending, setPending] = useState<McpPendingAction[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [connections, actions] = await Promise.all([
        rpc.mcpConnections.list(),
        rpc.mcpConnections.pendingActions(),
      ]);
      setList(connections);
      setPending(actions ?? []);
    } catch {
      setError(t`Could not load connections`);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  async function change(run: () => Promise<unknown>) {
    setError(null);
    try {
      await run();
    } catch {
      setError(t`Could not save the change`);
    }
    await load();
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.locale || "en", { dateStyle: "medium" });

  return (
    <div data-testid="mcp-connections" className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" disabled={!list} onClick={() => setCreating(true)}>
          <Trans>Create token</Trans>
        </Button>
      </div>
      {pending.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            <Trans>Waiting for approval</Trans>
          </h3>
          {pending.map((action) => (
            <McpActionCard
              key={action.id}
              action={action}
              busy={deciding === action.id}
              onDecide={(decision, alwaysAllow) => {
                setDeciding(action.id);
                void change(() =>
                  rpc.mcpConnections.decideAction({ id: action.id, decision, alwaysAllow }),
                ).finally(() => setDeciding(null));
              }}
            />
          ))}
        </section>
      ) : null}
      {!list && !error ? <Skeleton className="h-24 w-full" /> : null}
      {list?.connections.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Trans>No connections</Trans>
        </p>
      ) : null}
      {list && list.connections.length > 0 ? (
        <div className="overflow-x-auto">
          <Table compact>
            <TableHeader>
              <TableHeadRow>
                <TableHead>
                  <Trans>Name</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Type</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Space</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Created</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Last used</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Read-only</Trans>
                </TableHead>
                <TableHead>
                  <span className="sr-only">
                    <Trans>Revoke</Trans>
                  </span>
                </TableHead>
              </TableHeadRow>
            </TableHeader>
            <TableBody>
              {list.connections.map((connection) => (
                <Fragment key={connection.id}>
                  <TableRow>
                    <TableCell>
                      <span className="font-medium">{connection.label}</span>
                      {connection.tokenPrefix ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {connection.tokenPrefix}…
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{connection.kind === "pat" ? t`Token` : t`OAuth`}</TableCell>
                    <TableCell>{connection.spaceName}</TableCell>
                    <TableCell>{date(connection.createdAt)}</TableCell>
                    <TableCell>
                      {connection.lastUsedAt ? date(connection.lastUsedAt) : t`Never`}
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="sm"
                        aria-label={t`Read-only ${connection.label}`}
                        checked={connection.readOnly}
                        onCheckedChange={(readOnly) =>
                          void change(() =>
                            rpc.mcpConnections.update({ id: connection.id, readOnly }),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={activityId === connection.id}
                        aria-label={t`Activity ${connection.label}`}
                        onClick={() =>
                          setActivityId(activityId === connection.id ? null : connection.id)
                        }
                      >
                        <Trans>Activity</Trans>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t`Revoke ${connection.label}`}
                        onClick={() =>
                          void change(() => rpc.mcpConnections.revoke({ id: connection.id }))
                        }
                      >
                        <Trans>Revoke</Trans>
                      </Button>
                    </TableCell>
                  </TableRow>
                  {activityId === connection.id ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <McpConnectionActivity connectionId={connection.id} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {creating && list ? (
        <McpTokenDialog
          spaces={list.spaces}
          mcpUrl={list.mcpUrl}
          onCreated={() => void load()}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
