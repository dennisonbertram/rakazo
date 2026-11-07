import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ScannerService } from "./scanner.js";
import { createScanner } from "./scanner.js";

const fixtureBin = fileURLToPath(new URL("./fixtures/bin/", import.meta.url));
const scope = { userId: "user-one", spaceId: "space-one" };
const origin = "https://server.example.test";

interface Harness {
  root: string;
  userDataDir: string;
  outboxDir: string;
  scenarioPath: string;
  callsFile: string;
  optionsCallsFile: string;
  startedFile: string;
  service: ScannerService;
  setScenario: (scenario: Record<string, unknown>) => Promise<void>;
  scanCalls: () => Promise<number>;
}

const harnesses: Harness[] = [];

async function makeHarness(
  scenario: Record<string, unknown> = {},
  options: {
    now?: () => number;
    scanTimeoutMs?: number;
    pollTimeoutMs?: number;
    missing?: boolean;
  } = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "rakazo-scanner-test-"));
  const userDataDir = join(root, "user-data");
  const scenarioPath = join(root, "scenario.json");
  const callsFile = join(root, "scan-calls.txt");
  const optionsCallsFile = join(root, "options-calls.txt");
  const startedFile = join(root, "scan-started.txt");
  const completeScenario = (value: Record<string, unknown>) => ({
    ...value,
    callsFile: value.callsFile ?? callsFile,
    optionsCallsFile: value.optionsCallsFile ?? optionsCallsFile,
  });
  await writeFile(scenarioPath, JSON.stringify(completeScenario(scenario)), { mode: 0o600 });
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: options.missing ? "" : `${fixtureBin}${delimiter}${process.env.PATH ?? ""}`,
    RAKAZO_FAKE_SCANIMAGE_SCENARIO: scenarioPath,
  };
  const service = createScanner({
    userDataDir,
    env: environment,
    systemSearchDirectories: options.missing ? [] : undefined,
    pollIntervalMs: 60_000,
    pollTimeoutMs: options.pollTimeoutMs ?? 2_000,
    scanTimeoutMs: options.scanTimeoutMs ?? 5_000,
    now: options.now,
  });
  const result: Harness = {
    root,
    userDataDir,
    outboxDir: join(userDataDir, "scan-outbox"),
    scenarioPath,
    callsFile,
    optionsCallsFile,
    startedFile,
    service,
    setScenario: async (value) =>
      writeFile(scenarioPath, JSON.stringify(completeScenario(value)), { mode: 0o600 }),
    scanCalls: async () => {
      try {
        return (await readFile(callsFile, "utf8")).trim().split("\n").filter(Boolean).length;
      } catch {
        return 0;
      }
    },
  };
  harnesses.push(result);
  return result;
}

async function useScope(service: ScannerService, userScope = scope, serverOrigin = origin) {
  await service.setScope(userScope, serverOrigin);
}

async function waitForFile(file: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await access(file);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("Fake scanimage did not start.");
}

async function countLines(file: string) {
  try {
    return (await readFile(file, "utf8")).trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

afterEach(async () => {
  await Promise.all(
    harnesses.splice(0).map(async ({ service, root }) => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe("offline SANE scanner service", () => {
  it("drives the fake scanimage, writes a two-page PDF, and persists its digest privately", async () => {
    const harness = await makeHarness();
    const delivered: unknown[] = [];
    harness.service.onDocument((document) => delivered.push(document));
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.setFolder(["folder_one"]);
    expect(harness.service.state().kind).toBe("ready");

    await harness.service.scan();
    const [document] = await harness.service.pending();
    expect(document).toBeDefined();
    expect(delivered).toHaveLength(1);
    expect(document?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(document?.name).toBe(`scan-${document?.id}.pdf`);
    expect(document?.pages).toBe(2);
    expect(document?.folder).toEqual(["folder_one"]);
    expect(Object.keys(harness.service.state())).not.toContain("documents");
    expect(document?.sha256).toBe(
      createHash("sha256")
        .update(document?.bytes ?? new Uint8Array())
        .digest("hex"),
    );
    const pdf = Buffer.from(document?.bytes ?? []);
    const pdfText = pdf.toString("latin1");
    expect(pdfText).toContain("/Filter /DCTDecode");
    expect(pdfText.match(/\/Subtype \/Image/g)).toHaveLength(2);
    expect(pdfText).toContain("/MediaBox [0 0 2.88 1.92]");
    expect(pdfText).toContain("/MediaBox [0 0 1.68 2.64]");
    const xrefOffset = Number(pdfText.match(/startxref\n(\d+)\n/)?.[1]);
    expect(pdf.subarray(xrefOffset, xrefOffset + 4).toString("ascii")).toBe("xref");
    expect(await harness.scanCalls()).toBe(1);

    const pdfPath = join(harness.outboxDir, `${document?.id}.pdf`);
    const metadataPath = join(harness.outboxDir, `${document?.id}.json`);
    expect((await stat(harness.userDataDir)).mode & 0o777).toBe(0o700);
    expect((await stat(harness.outboxDir)).mode & 0o777).toBe(0o700);
    expect((await stat(pdfPath)).mode & 0o777).toBe(0o600);
    expect((await stat(metadataPath)).mode & 0o777).toBe(0o600);
  });

  it("does not scan or auto-scan until a signed-in scope is selected", async () => {
    let now = 0;
    const harness = await makeHarness({ pageLoaded: "on" }, { now: () => now });
    await harness.service.start();
    now = 2_000;
    await harness.service.pollNow();
    expect(await harness.scanCalls()).toBe(0);
    await harness.service.scan();
    expect(await harness.scanCalls()).toBe(0);
    expect(harness.service.state().error).toContain("Sign in");
  });

  it("waits for a stable loaded sensor and resets the auto-scan latch after the feeder clears", async () => {
    let now = 0;
    const harness = await makeHarness({ pageLoaded: "on" }, { now: () => now });
    await harness.service.start();
    await useScope(harness.service);

    now = 1_999;
    await harness.service.pollNow();
    expect(await harness.scanCalls()).toBe(0);
    now = 2_000;
    await harness.service.pollNow();
    expect(await harness.scanCalls()).toBe(1);
    now = 3_000;
    await harness.service.pollNow();
    expect(await harness.scanCalls()).toBe(1);

    await harness.setScenario({ pageLoaded: "off" });
    now = 4_000;
    await harness.service.pollNow();
    await harness.setScenario({ pageLoaded: "on" });
    now = 5_000;
    await harness.service.pollNow();
    now = 7_000;
    await harness.service.pollNow();
    expect(await harness.scanCalls()).toBe(2);
  });

  it("reports an empty feeder without creating an outbox document", async () => {
    const harness = await makeHarness({ pages: [] });
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();

    expect(harness.service.state().kind).toBe("error");
    expect(harness.service.state().error).toContain("No pages");
    expect(await harness.service.pending()).toEqual([]);
  });

  it("rejects a partial batch after a jam and does not expose device diagnostics", async () => {
    const harness = await makeHarness({
      pages: ["page-one.jpg.b64"],
      scan: { exitCode: 1, stderr: "Paper jam; confidential scanned text" },
    });
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();

    expect(harness.service.state().kind).toBe("error");
    expect(harness.service.state().error).toContain("Clear the feeder");
    expect(harness.service.state().error).not.toContain("confidential");
    expect(await harness.service.pending()).toEqual([]);
    expect(
      (await readdir(harness.userDataDir)).filter((name) => name.startsWith(".scan-pages-")),
    ).toEqual([]);
  });

  it("limits discovery to Fujitsu devices and represents a busy scanner safely", async () => {
    const missingVendor = await makeHarness({ device: null });
    await missingVendor.service.start();
    expect(missingVendor.service.state().kind).toBe("not-found");

    const busy = await makeHarness({ busy: true });
    await busy.service.start();
    await useScope(busy.service);
    expect(busy.service.state().kind).toBe("busy");
    await busy.service.scan();
    expect(await busy.scanCalls()).toBe(0);
  });

  it("reports a missing SANE executable", async () => {
    const harness = await makeHarness({}, { missing: true });
    await harness.service.start();
    expect(harness.service.state().kind).toBe("sane-missing");
  });

  it("cancels a child scan and removes its temporary JPEG pages", async () => {
    const harness = await makeHarness(
      { startedFile: join(tmpdir(), "unused"), scan: { hold: true } },
      { scanTimeoutMs: 10_000 },
    );
    await harness.setScenario({ startedFile: harness.startedFile, scan: { hold: true } });
    await harness.service.start();
    await useScope(harness.service);
    const scanning = harness.service.scan();
    await waitForFile(harness.startedFile);
    await harness.service.cancel();
    await scanning;

    expect(harness.service.state().kind).toBe("ready");
    expect(await harness.service.pending()).toEqual([]);
    expect(
      (await readdir(harness.userDataDir)).filter((name) => name.startsWith(".scan-pages-")),
    ).toEqual([]);
  });

  it("times out a stalled scan and removes its temporary pages", async () => {
    const harness = await makeHarness(
      { startedFile: join(tmpdir(), "unused"), scan: { hold: true } },
      { scanTimeoutMs: 80 },
    );
    await harness.setScenario({ startedFile: harness.startedFile, scan: { hold: true } });
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();

    expect(harness.service.state().kind).toBe("error");
    expect(harness.service.state().error).toContain("did not respond");
    expect(await harness.service.pending()).toEqual([]);
    expect(
      (await readdir(harness.userDataDir)).filter((name) => name.startsWith(".scan-pages-")),
    ).toEqual([]);
  });

  it("cancels and retains no new document when the selected scope changes mid-scan", async () => {
    const harness = await makeHarness({}, { scanTimeoutMs: 10_000 });
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();
    const [retained] = await harness.service.pending();
    expect(retained).toBeDefined();
    await harness.setScenario({ startedFile: harness.startedFile, scan: { hold: true } });
    const scanning = harness.service.scan();
    await waitForFile(harness.startedFile);
    await useScope(harness.service, { userId: "user-two", spaceId: "space-two" });
    await scanning;

    expect(harness.service.state().kind).toBe("ready");
    expect(await harness.service.pending()).toEqual([]);
    expect((await readdir(harness.outboxDir)).filter((name) => name.endsWith(".pdf"))).toEqual([
      `${retained!.id}.pdf`,
    ]);
    await useScope(harness.service);
    expect(await harness.service.pending()).toMatchObject([{ id: retained!.id }]);
  });

  it("captures the selected folder when a scan begins", async () => {
    const harness = await makeHarness({}, { scanTimeoutMs: 5_000 });
    await harness.setScenario({ startedFile: harness.startedFile, scan: { delayMs: 100 } });
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.setFolder(["folder-before"]);
    const scanning = harness.service.scan();
    await waitForFile(harness.startedFile);
    await harness.service.setFolder(["folder-after"]);
    await scanning;

    const [document] = await harness.service.pending();
    expect(document?.folder).toEqual(["folder-before"]);
    expect(harness.service.state().folder).toEqual(["folder-after"]);
  });

  it("replays verified pending documents after service restart", async () => {
    const harness = await makeHarness();
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();
    const original = await harness.service.pending();
    expect(original).toHaveLength(1);
    await harness.service.close();

    const replay = createScanner({
      userDataDir: harness.userDataDir,
      env: {
        ...process.env,
        PATH: `${fixtureBin}${delimiter}${process.env.PATH ?? ""}`,
        RAKAZO_FAKE_SCANIMAGE_SCENARIO: harness.scenarioPath,
      },
      systemSearchDirectories: [],
      pollIntervalMs: 60_000,
    });
    const emitted: unknown[] = [];
    replay.onDocument((document) => emitted.push(document));
    await replay.setScope(scope, origin);
    expect(await replay.pending()).toHaveLength(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ id: original[0]?.id, sha256: original[0]?.sha256 });
    await replay.close();
  });

  it("blocks pending and confirmation across users, spaces, and server origins", async () => {
    const harness = await makeHarness();
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();
    const [document] = await harness.service.pending();
    expect(document).toBeDefined();

    for (const [nextScope, nextOrigin] of [
      [{ userId: "user-two", spaceId: "space-one" }, origin],
      [{ userId: "user-one", spaceId: "space-two" }, origin],
      [scope, "https://other.example.test"],
    ] as const) {
      await useScope(harness.service, nextScope, nextOrigin);
      expect(await harness.service.pending()).toEqual([]);
      expect(await harness.service.confirm(document!.id, document!.sha256)).toEqual({ ok: false });
    }

    await useScope(harness.service);
    expect(await harness.service.confirm("../outside", document!.sha256)).toEqual({ ok: false });
    expect(await harness.service.confirm(document!.id, "not-a-hash")).toEqual({ ok: false });
    expect(await harness.service.confirm(document!.id, "0".repeat(64))).toEqual({ ok: false });
    await expect(access(join(harness.outboxDir, `${document!.id}.pdf`))).resolves.toBeUndefined();
    expect(await harness.service.confirm(document!.id, document!.sha256)).toEqual({ ok: true });
    expect(await harness.service.pending()).toEqual([]);
    await expect(access(join(harness.outboxDir, `${document!.id}.pdf`))).rejects.toThrow();
  });

  it("does not follow a symlink substituted for an outbox PDF", async () => {
    const harness = await makeHarness();
    await harness.service.start();
    await useScope(harness.service);
    await harness.service.scan();
    const [document] = await harness.service.pending();
    const victim = join(harness.root, "outside.pdf");
    const pdfPath = join(harness.outboxDir, `${document!.id}.pdf`);
    await writeFile(victim, "keep this file", { mode: 0o600 });
    await unlink(pdfPath);
    await symlink(victim, pdfPath);

    expect(await harness.service.confirm(document!.id, document!.sha256)).toEqual({ ok: false });
    expect(await readFile(victim, "utf8")).toBe("keep this file");
  });

  it("does not create or write through a symlinked outbox directory", async () => {
    const harness = await makeHarness();
    await harness.service.start();
    await useScope(harness.service);
    const outsideParent = join(harness.root, "outside-parent");
    const outsideTarget = join(outsideParent, "outbox");
    await mkdir(outsideParent);
    await rm(harness.outboxDir, { recursive: true, force: true });
    await symlink(outsideTarget, harness.outboxDir, "dir");
    await harness.service.scan();

    expect(harness.service.state().kind).toBe("error");
    await expect(access(outsideTarget)).rejects.toThrow();
  });

  it("persists auto-scan and folder settings separately from the outbox", async () => {
    const harness = await makeHarness();
    await harness.service.start();
    await harness.service.setAutoScan(false);
    await harness.service.setFolder(["folder_one", "folder-two"]);
    await harness.service.close();

    const restarted = createScanner({
      userDataDir: harness.userDataDir,
      env: {
        ...process.env,
        PATH: `${fixtureBin}${delimiter}${process.env.PATH ?? ""}`,
        RAKAZO_FAKE_SCANIMAGE_SCENARIO: harness.scenarioPath,
      },
      systemSearchDirectories: [],
      pollIntervalMs: 60_000,
    });
    harnesses.push({ ...harness, service: restarted });
    await restarted.start();
    expect(restarted.state().autoScan).toBe(false);
    expect(restarted.state().folder).toEqual(["folder_one", "folder-two"]);
    const settings = await stat(join(harness.userDataDir, "scanner-settings.json"));
    expect(settings.mode & 0o777).toBe(0o600);
    await restarted.close();
  });

  it("times out polling commands and never overlaps poll cycles", async () => {
    const timeout = await makeHarness({ optionsHang: true }, { pollTimeoutMs: 80 });
    await timeout.service.start();
    expect(timeout.service.state().kind).toBe("error");
    expect(timeout.service.state().error).not.toContain("scanimage:");

    const harness = await makeHarness({ optionsCallsFile: join(tmpdir(), "unused") });
    await harness.setScenario({ optionsCallsFile: harness.optionsCallsFile });
    await harness.service.start();
    const before = await countLines(harness.optionsCallsFile);
    await harness.setScenario({ optionsCallsFile: harness.optionsCallsFile, optionsDelayMs: 100 });
    await Promise.all([harness.service.pollNow(), harness.service.pollNow()]);
    expect(await countLines(harness.optionsCallsFile)).toBe(before + 1);
  });

  it("stops an active poll command when the scanner service closes", async () => {
    const harness = await makeHarness({ optionsHang: true }, { pollTimeoutMs: 10_000 });
    const starting = harness.service.start();
    await waitForFile(harness.optionsCallsFile);
    await harness.service.close();
    await starting;
    expect(await countLines(harness.optionsCallsFile)).toBe(1);
  });

  it("rejects unsafe folder and scope values", async () => {
    const harness = await makeHarness();
    await expect(harness.service.setFolder(["../escape"])).rejects.toThrow();
    await expect(
      harness.service.setScope({ userId: "../user", spaceId: "space" }, origin),
    ).rejects.toThrow();
    await expect(harness.service.setScope(scope, "file:///tmp")).rejects.toThrow();
  });
});
