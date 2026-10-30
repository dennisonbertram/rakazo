import type { BotPage, PageData } from "@rakazo/contracts";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../../lib/rpc";
import { SandboxedHtmlViewer } from "../SandboxedHtmlViewer";

/** The page's data for the frame: only the sources it declared. Blocks data never reaches an HTML page. */
const sourcesOf = (data: PageData | null) => (data && "sources" in data ? data.sources : undefined);

/**
 * An HTML page, shown read-only in the same sandbox as other bot HTML. The page script receives its
 * sources as "praci-data" message events: after it loads, and again whenever its data changes.
 * `changeTick` and `refreshTick` count page.updated/page.data events and "Refresh" clicks.
 */
export function HtmlPageView({
  botId,
  pageId,
  title,
  changeTick,
  dataTick,
  refreshTick,
  onSources,
}: {
  botId: string;
  pageId: string;
  title: string;
  changeTick: number;
  dataTick: number;
  refreshTick: number;
  onSources?: (hasSources: boolean) => void;
}) {
  const [page, setPage] = useState<BotPage | null>(null);
  const [data, setData] = useState<Record<string, unknown> | undefined>();
  const reportSources = useRef(onSources);
  reportSources.current = onSources;
  const handledRefresh = useRef(refreshTick);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const nextPage = await rpc.pages.get({ botId, pageId });
        if (!live) return;
        if (nextPage) setPage(nextPage);
        const [nextData, sources] = await Promise.all([
          handledRefresh.current === refreshTick
            ? rpc.pages.data({ botId, pageId })
            : rpc.pages.refresh({ botId, pageId }),
          rpc.pages.sources({ botId, pageId }),
        ]);
        handledRefresh.current = refreshTick;
        if (!live) return;
        setData(sourcesOf(nextData) ?? {});
        reportSources.current?.(sources.length > 0);
      } catch {
        // The page keeps what it last showed; a failed load never blocks it.
        if (live) setData((current) => current ?? {});
      }
    })();
    return () => {
      live = false;
    };
  }, [botId, pageId, changeTick, dataTick, refreshTick]);

  if (!page) return null;
  return (
    <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border border-border">
      <SandboxedHtmlViewer html={page.content} title={title} data={data} />
    </div>
  );
}
