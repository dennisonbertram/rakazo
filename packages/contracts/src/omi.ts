import { z } from "zod";
import { Id } from "./ids.js";

/** Connection.connectorId for an Omi pendant; the connection's provider is "omi" too. */
export const OMI_CONNECTOR_ID = "omi";

/** A pendant upload is one request of at most this many bytes (about two minutes of audio). */
export const OMI_UPLOAD_MAX_BYTES = 1024 * 1024;

const Short = z.string().trim().min(1).max(100);

export const OmiConnectInputSchema = z.object({
  model: Short,
  firmware: Short,
  hardware: Short,
  /** An origin-scoped random id of the browser that paired the pendant, not a hardware address. */
  deviceId: Short,
});
export type OmiConnectInput = z.infer<typeof OmiConnectInputSchema>;

export const OmiStatusSchema = z
  .object({
    connectionId: Id,
    /** Uploads received and not yet turned into recordings. */
    pendingUploads: z.number().int(),
    recordings: z.number().int(),
    /** The Omi agent, once provisioned. */
    agentBotId: Id.nullable(),
  })
  .nullable();
export type OmiStatus = z.infer<typeof OmiStatusSchema>;

export const OmiDisconnectInputSchema = z.object({ deleteRecordings: z.boolean() });

const OmiKind = z.enum(["meeting", "note", "trash"]);

export const OmiSegmentSchema = z.object({
  id: Id,
  audioItemId: Id,
  kind: OmiKind,
  title: z.string(),
  /** Wall-clock times of the stretch. */
  startedAt: z.string(),
  endedAt: z.string(),
  sortedBy: z.enum(["agent", "user"]),
  meetingId: Id.nullable(),
  noteItemId: Id.nullable(),
});
export type OmiSegmentDto = z.infer<typeof OmiSegmentSchema>;

export const OmiSegmentsListInputSchema = z.object({
  /** A UTC day, YYYY-MM-DD. Omit for the newest stretches. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const OmiSegmentMoveInputSchema = z.object({ segmentId: Id, kind: OmiKind });
