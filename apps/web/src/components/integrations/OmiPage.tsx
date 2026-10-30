import { Trans, useLingui } from "@lingui/react/macro";
import type { OmiStatus } from "@rakazo/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rakazo/ui-web";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toggleAccess } from "../../lib/integrations";
import type { OmiSyncState } from "../../lib/omi/useOmiSync";
import { useOmiSync } from "../../lib/omi/useOmiSync";
import { formatRelativeTime } from "../../lib/relative-time";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";
import { Shimmer } from "../ai/primitives";
import { ConfirmDialog } from "./AppDetail";
import { AppLogo } from "./AppLogo";
import { IntegrationAgentSection } from "./IntegrationAgentSection";
import { OmiSegments } from "./OmiSegments";
import { AgentToggleList } from "./parts";
import type { IntegrationsData } from "./useIntegrations";

function StatusLine({ state }: { state: OmiSyncState }) {
  const { t } = useLingui();
  if (state.kind === "unsupported") return <Trans>Use Chrome, Edge or the desktop app</Trans>;
  if (state.kind === "old_firmware") return <Trans>Update the pendant in the Omi app</Trans>;
  if (state.kind === "failed") return <Trans>Could not reach the pendant</Trans>;
  if (state.kind === "connecting") {
    return (
      <Shimmer>
        <Trans>Connecting…</Trans>
      </Shimmer>
    );
  }
  if (state.kind === "downloading") {
    const { done, total } = state;
    return (
      <Shimmer>
        {done === null ? (
          <Trans>Downloading</Trans>
        ) : (
          <Trans>
            Downloading {done} of {total ?? done} min
          </Trans>
        )}
      </Shimmer>
    );
  }
  if (state.kind === "paused") {
    const { done, total } = state;
    return total === null ? (
      <Trans>Paused · {done} min saved</Trans>
    ) : (
      <Trans>
        Paused · {done} of {total} min saved
      </Trans>
    );
  }
  if (state.kind === "synced") {
    return <span>{t`Synced ${formatRelativeTime(new Date(state.at).toISOString())}`}</span>;
  }
  return null;
}

/** The Omi page without data loading: pendant state, actions and the lists below it. */
export function OmiView({
  status,
  sync,
  noKey = false,
  error,
  onSync,
  onDisconnect,
  onDeleteAll,
  onOpenVoiceSettings,
  children,
}: {
  /** Null before the first connect. */
  status: OmiStatus | undefined;
  sync: OmiSyncState;
  /** A recording could not be transcribed because no transcription provider is set up. */
  noKey?: boolean;
  error?: string | null;
  onSync: () => void;
  onDisconnect: () => void;
  onDeleteAll: () => void;
  onOpenVoiceSettings?: () => void;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const [deleting, setDeleting] = useState(false);
  const action = {
    idle: t`Connect pendant`,
    reconnect: t`Reconnect`,
    paused: t`Sync now`,
    failed: t`Sync now`,
    synced: t`Sync now`,
  }[sync.kind as "idle"];
  const primary = sync.kind === "idle" || sync.kind === "reconnect";
  return (
    <div className="rk-scroll h-full overflow-y-auto px-4 py-6 md:px-9 md:py-7">
      <div className="mx-auto max-w-[1040px]">
        <Link
          to="/app/integrations"
          className="rk-tap mb-3.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <Trans>Integrations</Trans>
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <AppLogo name="Omi" size="xl" />
          <h1 className="text-xl font-semibold">Omi</h1>
          <div className="ms-auto flex items-center gap-2">
            {action ? (
              <Button variant={primary ? "default" : "outline"} onClick={onSync}>
                {action}
              </Button>
            ) : null}
            {status ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t`More`}
                  render={<Button variant="ghost" size="icon" className="text-muted-foreground" />}
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onDisconnect}>
                    <Trans>Disconnect</Trans>
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                    <Trans>Delete all recordings</Trans>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        <p className="mt-4 min-h-5 text-sm" role="status">
          <StatusLine state={sync} />
        </p>
        {noKey ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onOpenVoiceSettings}
            disabled={!onOpenVoiceSettings}
          >
            <Trans>Add a transcription key</Trans>
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {children}
      </div>
      <ConfirmDialog
        open={deleting}
        busy={false}
        title={t`Delete all recordings?`}
        confirm={t`Delete`}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          onDeleteAll();
        }}
      >
        <li>
          <Trans>Removes the audio, transcripts and meetings from Praci.</Trans>
        </li>
      </ConfirmDialog>
    </div>
  );
}

/** Who can read recordings: the Omi agent, plus any agent the owner switches on. */
function OmiAgent({
  connectionId,
  agentBotId,
  data,
}: {
  connectionId: string;
  agentBotId: string;
  data: IntegrationsData;
}) {
  const { t } = useLingui();
  const [access, setAccess] = useState<{
    allAgents: boolean;
    botIds: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void rpc.connections
      .access({ connectionId })
      .then(setAccess)
      .catch(() => undefined);
  }, [connectionId]);
  const allBotIds = data.bots.map((bot) => bot.id);
  const isOn = (botId: string) =>
    botId === agentBotId || (access ? access.allAgents || access.botIds.includes(botId) : false);
  const shared = access
    ? !(!access.allAgents && access.botIds.every((id) => id === agentBotId))
    : false;
  async function save(next: { allAgents: boolean; botIds: string[] }) {
    setError(null);
    try {
      setAccess(await rpc.connections.setAccess({ connectionId, ...next }));
    } catch (err) {
      setError(errorText(err, t`Could not update bot access`));
    }
  }
  return (
    <div className="mt-6">
      <IntegrationAgentSection
        service="Omi"
        agentName={data.bots.find((bot) => bot.id === agentBotId)?.name ?? t`Omi agent`}
        agentHref={`/app/${agentBotId}`}
        writesEnabled={false}
        shared={shared}
        disabled={!access}
        idPrefix="omi"
        onShared={(on) =>
          void (async () => {
            setError(null);
            try {
              await rpc.connections.setExclusive({
                connectionId,
                exclusive: !on,
              });
              setAccess(await rpc.connections.access({ connectionId }));
            } catch (err) {
              setError(errorText(err, t`Could not update access`));
            }
          })()
        }
        usedBy={
          <AgentToggleList
            bots={data.bots}
            appName="Omi"
            isOn={isOn}
            onToggle={(botId, on) => {
              if (botId === agentBotId) return;
              void save(
                toggleAccess(access ?? { allAgents: false, botIds: [] }, allBotIds, botId, on),
              );
            }}
          />
        }
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The Omi page at /app/integrations/omi. */
export function OmiPage({
  data,
  onOpenVoiceSettings,
}: {
  data: IntegrationsData;
  onOpenVoiceSettings?: () => void;
}) {
  const [status, setStatus] = useState<OmiStatus | undefined>(undefined);
  const [noKey, setNoKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setStatus((await rpc.omi.status()) ?? null);
      const failed = await rpc.dataRoom.items.list({
        status: "failed",
        limit: 50,
      });
      setNoKey(
        (failed?.items ?? []).some(
          (item) => item.source === "omi" && item.error === "no_transcription_provider",
        ),
      );
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const { state, sync } = useOmiSync(status, reload);

  async function disconnect(deleteRecordings: boolean) {
    setError(null);
    try {
      await rpc.omi.disconnect({ deleteRecordings });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <OmiView
      status={status}
      sync={status === null && state.kind === "reconnect" ? { kind: "idle" } : state}
      noKey={noKey}
      error={error}
      onSync={sync}
      onDisconnect={() => void disconnect(false)}
      onDeleteAll={() => void disconnect(true)}
      onOpenVoiceSettings={onOpenVoiceSettings}
    >
      {status ? (
        <>
          <OmiSegments />
          {status.agentBotId ? (
            <OmiAgent
              connectionId={status.connectionId}
              agentBotId={status.agentBotId}
              data={data}
            />
          ) : null}
        </>
      ) : null}
    </OmiView>
  );
}
