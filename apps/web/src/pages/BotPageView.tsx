import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { PageDataUpdate, PageRemoteUpdate } from "./shell/bot-page-panel";
import { BotPagePanel } from "./shell/bot-page-panel";

/** One bot page, full width, opened from the sidebar. The page header holds the title and the options menu. */
export function BotPageView({
  botId,
  pageId,
  remote,
  dataRemote,
}: {
  botId: string;
  pageId: string;
  remote: PageRemoteUpdate | null;
  dataRemote: PageDataUpdate | null;
}) {
  const navigate = useNavigate();
  const review = useCallback(() => navigate(`/app/${botId}`), [navigate, botId]);
  const missing = useCallback(() => navigate("/app", { replace: true }), [navigate]);
  return (
    <div className="@container rk-scroll min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 md:px-7">
      <div className="mx-auto max-w-5xl">
        <BotPagePanel
          key={pageId}
          botId={botId}
          fixedPageId={pageId}
          remote={remote}
          dataRemote={dataRemote}
          onReview={review}
          onMissing={missing}
        />
      </div>
    </div>
  );
}
