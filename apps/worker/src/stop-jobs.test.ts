import { describe, expect, it } from "vitest";
import { stopJobsAndRuns } from "./stop-jobs.js";

describe("stopJobsAndRuns", () => {
  it("aborts in-flight runs before waiting for them to drain", async () => {
    const shutdown = new AbortController();
    let abortedWhileDraining = false;
    const jobHost = {
      stop: async () => {
        await Promise.resolve();
        abortedWhileDraining = shutdown.signal.aborted;
      },
    };
    await stopJobsAndRuns(jobHost, shutdown);
    expect(abortedWhileDraining).toBe(true);
  });
});
