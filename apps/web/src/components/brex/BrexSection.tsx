import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@rakazo/ui-web";
import type { ReactNode } from "react";
import { ErrorNotice } from "../finance/ui";
import { StillLoading } from "../ShellSkeleton";

export type BrexSectionQuery<T> = {
  data: T | null;
  error: string;
  retry: () => void;
};

/**
 * Loading, error and ready chrome for one Brex section's RPC. `children` renders only
 * once `data` is here, so sections never handle the empty answer themselves.
 */
export function BrexSection<T>({
  query,
  children,
}: {
  query: BrexSectionQuery<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.error) return <ErrorNotice message={query.error} onRetry={query.retry} />;
  if (!query.data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <span className="text-xs text-muted-foreground">
          <Trans>Loading…</Trans>
        </span>
        <Skeleton className="h-40 w-full" />
        <StillLoading onRetry={query.retry} />
      </div>
    );
  }
  return <>{children(query.data)}</>;
}
