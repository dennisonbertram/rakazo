import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { BotPage, PageChart } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { Markdown } from "@tiptap/markdown";
import type { NodeViewProps } from "@tiptap/react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveRemotePage } from "../../lib/page-sync";
import { rpc } from "../../lib/rpc";
import { ChartCanvas } from "./message-cards";
import { PageChartNode, usePageChartRows } from "./page-chart-extension";

const SAVE_DELAY_MS = 800;

function ChartView({ node, deleteNode, editor }: NodeViewProps) {
  const chart = node.attrs.chart as PageChart;
  const rows = usePageChartRows(chart);
  return (
    <NodeViewWrapper className="group relative my-3 rounded-lg border border-border p-3">
      <ChartCanvas spec={chart.spec} data={rows} width={520} />
      {editor.isEditable ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Delete chart`}
          className="absolute end-1 top-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={deleteNode}
        >
          <X size={14} />
        </Button>
      ) : null}
    </NodeViewWrapper>
  );
}

const PageChartView = PageChartNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ChartView);
  },
});

export type PageRemoteUpdate = { revision: number; updatedBy: "bot" | "user"; seq: number };

export function BotPagePanel({
  botId,
  remote,
}: {
  botId: string;
  /** The latest `page.updated` event for this bot. */
  remote: PageRemoteUpdate | null;
}) {
  const revision = useRef(0);
  const baseline = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saving = useRef(false);
  const stale = useRef(false);
  const [loaded, setLoaded] = useState<BotPage | null>(null);
  const [offerReload, setOfferReload] = useState(false);
  const [error, setError] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Markdown, PageChartView],
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": t`Page`,
        dir: "auto",
        class:
          "min-h-40 text-sm outline-none [&_a]:text-link [&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:ps-5",
      },
    },
  });

  const show = useCallback(
    (page: BotPage) => {
      if (!editor) return;
      editor.commands.setContent(page.content, { contentType: "markdown", emitUpdate: false });
      baseline.current = editor.getMarkdown();
      revision.current = page.revision;
      stale.current = false;
      setOfferReload(false);
      setError("");
    },
    [editor],
  );

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (!editor || editor.isDestroyed || saving.current || stale.current) return;
    const content = editor.getMarkdown();
    if (content === baseline.current) return;
    saving.current = true;
    try {
      const result = await rpc.pages.save({ botId, content, baseRevision: revision.current });
      if (result.ok) {
        revision.current = result.page.revision;
        baseline.current = content;
        setError("");
      } else {
        stale.current = true;
        setOfferReload(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`Could not save the page.`);
    } finally {
      saving.current = false;
    }
    // Typing during the request left newer edits to save.
    if (!editor.isDestroyed && !stale.current && editor.getMarkdown() !== baseline.current) {
      timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
    }
  }, [editor, botId]);

  useEffect(() => {
    if (!editor) return;
    let live = true;
    void rpc.pages
      .get({ botId })
      .then((page) => {
        if (!live || !page) return;
        setLoaded(page);
        show(page);
      })
      .catch((cause) => live && setError(cause instanceof Error ? cause.message : String(cause)));
    const onUpdate = () => {
      clearTimeout(timer.current);
      if (editor.getMarkdown() !== baseline.current && !stale.current) {
        timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
      }
    };
    editor.on("update", onUpdate);
    return () => {
      live = false;
      editor.off("update", onUpdate);
      void save();
    };
  }, [editor, botId, show, save]);

  useEffect(() => {
    if (!remote || !editor || remote.revision <= revision.current) return;
    // Our own save already advanced the revision; its event must not reload the editor.
    if (saving.current && remote.updatedBy === "user") return;
    const dirty = editor.getMarkdown() !== baseline.current;
    if (resolveRemotePage({ dirty }) === "offer") {
      stale.current = true;
      setOfferReload(true);
      return;
    }
    void rpc.pages.get({ botId }).then((page) => page && show(page));
  }, [remote, editor, botId, show]);

  if (!loaded)
    return error ? (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    ) : null;
  return (
    <div>
      {offerReload ? (
        <Button
          variant="secondary"
          size="sm"
          className="mb-3"
          onClick={() => void rpc.pages.get({ botId }).then((page) => page && show(page))}
        >
          <Trans>Page changed. Reload</Trans>
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
