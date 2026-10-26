import * as z from "zod";
import { Id } from "./ids.js";

/**
 * What a routine watches. Only a web page in this wave; connector (connected app)
 * watches come later as a second `kind`.
 */
export const WatchSpecSchema = z.object({
  kind: z.literal("page"),
  url: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    }, "Enter an http or https address"),
  intervalMinutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]),
});
export type WatchSpec = z.infer<typeof WatchSpecSchema>;

export const WatchPausedReasonSchema = z.enum(["errors", "noisy", "budget", "access"]);
export type WatchPausedReason = z.infer<typeof WatchPausedReasonSchema>;

/** The one managed routine kind: a bot's check-in. */
export const RoutineManagedKindSchema = z.literal("check_in");
export type RoutineManagedKind = z.infer<typeof RoutineManagedKindSchema>;

/** One muted status line for a routine list row. Watch fields are null for non-watches. */
export const RoutineStatusSchema = z.object({
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastChangedAt: z.string().nullable(),
  pausedReason: WatchPausedReasonSchema.nullable(),
});
export type RoutineStatus = z.infer<typeof RoutineStatusSchema>;

export const CheckInCadenceSchema = z.enum(["off", "daily", "every_4h"]);

/**
 * A bot's check-in setting is its managed routine (managedKind "check_in"): its crons
 * and active flag are the setting, so there is no Bot column.
 */
export const CheckInGetInput = z.object({ botId: Id });
export const CheckInSetInput = z.object({ botId: Id, cadence: CheckInCadenceSchema });
export const CheckInSchema = z.object({ cadence: CheckInCadenceSchema });
export type CheckIn = z.infer<typeof CheckInSchema>;
