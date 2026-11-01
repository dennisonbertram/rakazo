import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { StoredMeeting } from "@rakazo/contracts";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadRow,
  TableRow,
} from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PickFilter, SearchField } from "../components/ListControls";
import { PAGE_GUTTER_X, PageHeader } from "../components/PageHeader";
import { RowsSkeleton } from "../components/RowsSkeleton";
import { sortBy, useListParams } from "../lib/list-params";
import { meetingMinutes, meetingSourceName } from "../lib/meeting-source";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

const MEETING_SORTS = ["title", "date", "duration", "source"] as const;

export const formatMeetingDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Every meeting the user has stored, from every source, newest first. */
export function MeetingsPage({ spaceName }: { spaceName?: string }) {
  const [rows, setRows] = useState<StoredMeeting[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Search, source and sort live in the URL: ?q=, source, sort, dir.
  const list = useListParams(MEETING_SORTS, { field: "date", dir: "desc" });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = list.param("q") ?? "";
  const source = list.param("source");

  const load = useCallback(async (cursor?: string) => {
    try {
      const page = await rpc.meetings.list(cursor ? { cursor } : {});
      setRows((prev) => (cursor ? [...(prev ?? []), ...page.items] : page.items));
      setNext(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(errorText(cause, t`Could not load meetings`));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const found = (rows ?? []).filter(
    (meeting) =>
      (!source || meeting.provider === source) &&
      (!needle || meeting.title.toLowerCase().includes(needle)),
  );
  const { field, dir } = list.sort;
  const shown = sortBy(
    found,
    (m) =>
      field === "title"
        ? m.title
        : field === "source"
          ? meetingSourceName(m.provider)
          : field === "duration"
            ? meetingMinutes(m)
            : m.startedAt,
    dir,
  );
  const sources = [...new Set((rows ?? []).map((m) => m.provider))].map((p): [string, string] => [
    p,
    meetingSourceName(p),
  ]);
  const sortHead = (target: (typeof MEETING_SORTS)[number]) => ({
    sortDirection: field === target ? dir : null,
    onSort: () => list.toggleSort(target),
  });

  return (
    <div className="@container/bd flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={`${PAGE_GUTTER_X} pt-2`}>
        <PageHeader
          className="max-sm:[&_[data-page-header-meta]]:hidden"
          title={<Trans>Meetings</Trans>}
          spaceName={spaceName}
        />
      </div>
      <div className={`rk-scroll flex-1 overflow-y-auto ${PAGE_GUTTER_X} pb-6`}>
        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-sm">
            <span className="text-destructive">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : rows === null ? (
          <RowsSkeleton className="pt-2" />
        ) : rows.length === 0 ? (
          <p className="pt-2 text-sm text-muted-foreground">
            <Trans>No meetings</Trans>
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <SearchField
                className="w-full @md:w-72"
                value={query}
                onChange={(value) => list.setParam("q", value)}
                placeholder={t`Search`}
                label={t`Search`}
                name="meetings-search"
              />
              <PickFilter
                label={t`Source`}
                value={source}
                options={sources}
                onChange={(value) => list.setParam("source", value)}
              />
            </div>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  <Trans>No matches</Trans>
                </p>
                <Button variant="outline" size="sm" onClick={() => list.clear("q", "source")}>
                  <Trans>Clear filters</Trans>
                </Button>
              </div>
            ) : (
              <Table compact className="@md:table-fixed">
                <TableHeader className="max-sm:hidden">
                  <TableHeadRow>
                    <TableHead className="ps-2" {...sortHead("title")}>
                      <Trans>Title</Trans>
                    </TableHead>
                    <TableHead className="hidden w-[24%] @md:table-cell" {...sortHead("date")}>
                      <Trans>Date</Trans>
                    </TableHead>
                    <TableHead className="hidden w-[14%] @lg:table-cell" {...sortHead("duration")}>
                      <Trans>Duration</Trans>
                    </TableHead>
                    <TableHead className="w-px whitespace-nowrap @md:w-28" {...sortHead("source")}>
                      <Trans>Source</Trans>
                    </TableHead>
                  </TableHeadRow>
                </TableHeader>
                <TableBody>
                  {shown.map((meeting) => {
                    const minutes = meetingMinutes(meeting);
                    return (
                      <TableRow
                        key={meeting.id}
                        onOpen={() =>
                          // The search and filter ride along, so Back restores them.
                          navigate(`/app/meetings/${meeting.id}${params.size ? `?${params}` : ""}`)
                        }
                      >
                        <TableCell>
                          <button
                            type="button"
                            title={meeting.title}
                            data-row-open
                            className="line-clamp-2 max-w-full rounded-sm text-start font-medium break-words outline-none hover:underline @md:block @md:truncate"
                          >
                            {meeting.title}
                          </button>
                          <div className="text-xs text-muted-foreground @md:hidden">
                            {formatMeetingDate(meeting.startedAt)}
                            {minutes ? ` · ${t`${minutes} min`}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="hidden @md:table-cell">
                          {formatMeetingDate(meeting.startedAt)}
                        </TableCell>
                        <TableCell className="hidden @lg:table-cell">
                          {minutes ? t`${minutes} min` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{meetingSourceName(meeting.provider)}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {next ? (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => void load(next)}>
                  <Trans>Show more</Trans>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
