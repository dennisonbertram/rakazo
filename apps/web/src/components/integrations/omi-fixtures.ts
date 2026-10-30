import type { OmiSegmentDto } from "@rakazo/contracts";

const day = new Date().toISOString().slice(0, 10);
const at = (time: string) => `${day}T${time}:00.000Z`;

const segment = (
  id: string,
  kind: OmiSegmentDto["kind"],
  title: string,
  from: string,
  to: string,
): OmiSegmentDto => ({
  id,
  audioItemId: "item_1",
  kind,
  title,
  startedAt: at(from),
  endedAt: at(to),
  sortedBy: "agent",
  meetingId: null,
  noteItemId: null,
});

/** Invented stretches for stories. */
export const mockSegments = [
  segment("seg_1", "meeting", "Pricing review", "09:14", "09:32"),
  segment("seg_2", "note", "Idea for onboarding email", "10:05", "10:11"),
  segment("seg_3", "trash", "Background noise", "11:40", "12:30"),
  segment("seg_4", "trash", "Street and traffic", "13:02", "13:20"),
];
