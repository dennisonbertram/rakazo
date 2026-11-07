import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Stats } from "node:fs";
import { constants as fsConstants, unlinkSync } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { delimiter, join, resolve, sep } from "node:path";
import type { ScannerDocument, ScannerState } from "@rakazo/contracts";
import { scannedPdf } from "./scanner-pdf.js";
import { readPrivateFile, writePrivateFile } from "./setup-store.js";

const POLL_INTERVAL_MS = 1000;
const SENSOR_STABLE_MS = 2000;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const MAX_PAGE_BYTES = 50 * 1024 * 1024;
const MAX_PDF_BYTES = 250 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const PAGE_PATTERN = /^page(\d{3,})\.jpe?g$/i;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const COMMAND_DIRECTORIES = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

export interface ScannerScope {
  userId: string;
  spaceId: string;
  serverOrigin: string;
}

export interface ScannerUserScope {
  userId: string;
  spaceId: string;
}

interface ScannerSettings {
  autoScan: boolean;
  folder: string[];
}

interface OutboxMetadata {
  id: string;
  name: string;
  sha256: string;
  pages: number;
  folder: string[];
  userId: string;
  spaceId: string;
  serverOrigin: string;
  createdAt: number;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: boolean;
}

interface ScanControl {
  cancelled: boolean;
  child: ReturnType<typeof spawn> | null;
  scope: ScannerScope;
}

export interface ScannerServiceOptions {
  userDataDir: string;
  env?: NodeJS.ProcessEnv;
  platformSearchDirectories?: string[];
  systemSearchDirectories?: string[];
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  scanTimeoutMs?: number;
  now?: () => number;
}

export interface ScannerService {
  start(): Promise<void>;
  close(): Promise<void>;
  state(): ScannerState;
  onState(listener: (state: ScannerState) => void): () => void;
  onDocument(listener: (document: ScannerDocument) => void): () => void;
  scan(): Promise<ScannerState>;
  cancel(): Promise<ScannerState>;
  setAutoScan(value: boolean): Promise<void>;
  setFolder(folder: string[]): Promise<void>;
  setScope(scope: ScannerUserScope | null, serverOrigin?: string | null): Promise<void>;
  pending(): Promise<ScannerDocument[]>;
  confirm(id: string, storedSha256: string): Promise<{ ok: boolean }>;
  pollNow(): Promise<void>;
}

function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.origin !== value
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function validScope(scope: ScannerScope | null): scope is ScannerScope {
  return (
    scope !== null &&
    typeof scope.userId === "string" &&
    SAFE_SEGMENT_PATTERN.test(scope.userId) &&
    typeof scope.spaceId === "string" &&
    SAFE_SEGMENT_PATTERN.test(scope.spaceId) &&
    typeof scope.serverOrigin === "string" &&
    canonicalOrigin(scope.serverOrigin) !== null
  );
}

function sameScope(left: ScannerScope | null, right: ScannerScope | null) {
  return (
    left !== null &&
    right !== null &&
    left.userId === right.userId &&
    left.spaceId === right.spaceId &&
    left.serverOrigin === right.serverOrigin
  );
}

function validFolder(folder: unknown): folder is string[] {
  return (
    Array.isArray(folder) &&
    folder.length <= 32 &&
    folder.every(
      (part) =>
        typeof part === "string" &&
        part.length > 0 &&
        part.length <= 128 &&
        SAFE_SEGMENT_PATTERN.test(part),
    )
  );
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function deviceNames(output: string) {
  const devices: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*device\s+['"`]?([^'"`\r\n]+)['"`]?\s+is\b/i);
    const device = match?.[1]?.trim();
    if (device?.startsWith("fujitsu:") && device.length <= 256 && !/[\0\r\n]/.test(device)) {
      devices.push(device);
    }
  }
  return [...new Set(devices)];
}

function pageLoaded(output: string): boolean | null {
  for (const line of output.split(/\r?\n/)) {
    if (!/--page-loaded\b/i.test(line)) continue;
    const values = [...line.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]!.trim());
    const value = values.at(-1)?.toLowerCase();
    if (value === "on" || value === "yes" || value === "true") return true;
    if (value === "off" || value === "no" || value === "false") return false;
    const assignment = line.match(/--page-loaded\s*=\s*(on|off|yes|no|true|false)\b/i)?.[1];
    if (assignment) return /^(on|yes|true)$/i.test(assignment);
  }
  return null;
}

function safeError(stderr: string, timedOut: boolean, spawnError: boolean) {
  if (spawnError) return "The scanner command could not be started. Check that SANE is installed.";
  if (timedOut) return "The scanner did not respond. Check its connection and try again.";
  const message = stderr.slice(0, MAX_STDERR_BYTES).toLowerCase();
  if (message.includes("busy"))
    return "The scanner is busy. Close other scanning apps and try again.";
  if (/\b(jam|paper|feed|document)\b/.test(message)) {
    return "The scan did not finish. Clear the feeder or check the scanner, then try again.";
  }
  return "The scan failed. Check the feeder and scanner, then try again.";
}

function scopedMetadata(value: unknown, filename: string): OutboxMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const metadata = value as Partial<OutboxMetadata>;
  if (
    typeof metadata.id !== "string" ||
    !ID_PATTERN.test(metadata.id) ||
    filename !== `${metadata.id}.json` ||
    metadata.name !== `scan-${metadata.id}.pdf` ||
    typeof metadata.sha256 !== "string" ||
    !HASH_PATTERN.test(metadata.sha256) ||
    !Number.isInteger(metadata.pages) ||
    (metadata.pages ?? 0) < 1 ||
    (metadata.pages ?? 0) > 500 ||
    !validFolder(metadata.folder) ||
    typeof metadata.userId !== "string" ||
    !SAFE_SEGMENT_PATTERN.test(metadata.userId) ||
    typeof metadata.spaceId !== "string" ||
    !SAFE_SEGMENT_PATTERN.test(metadata.spaceId) ||
    typeof metadata.serverOrigin !== "string" ||
    canonicalOrigin(metadata.serverOrigin) === null ||
    typeof metadata.createdAt !== "number" ||
    !Number.isFinite(metadata.createdAt)
  ) {
    return null;
  }
  return metadata as OutboxMetadata;
}

async function ensurePrivateUserDataDirectory(directory: string) {
  let info: Stats;
  try {
    info = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    info = await lstat(directory);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe scanner directory.");
  await chmod(directory, 0o700);
}

async function ensurePrivateDirectory(directory: string) {
  let info: Stats;
  try {
    info = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(directory, { mode: 0o700 });
    info = await lstat(directory);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe scanner directory.");
  await chmod(directory, 0o700);
}

async function readPrivateBytes(file: string, maxBytes: number) {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Unsafe scanner file.");
  const handle = await open(
    file,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.dev !== before.dev ||
      info.ino !== before.ino ||
      info.size > maxBytes
    ) {
      throw new Error("Unsafe scanner file.");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function commandEnvironment(environment: NodeJS.ProcessEnv, pathValue: string): NodeJS.ProcessEnv {
  const keys = [
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "SANE_CONFIG_DIR",
    "LD_LIBRARY_PATH",
    "DYLD_LIBRARY_PATH",
    "DYLD_FALLBACK_LIBRARY_PATH",
    "RAKAZO_FAKE_SCANIMAGE_SCENARIO",
  ];
  const safeEnvironment: NodeJS.ProcessEnv = { PATH: pathValue };
  for (const key of keys) {
    const value = environment[key];
    if (value !== undefined) safeEnvironment[key] = value;
  }
  return safeEnvironment;
}

function findScanimage(
  environment: NodeJS.ProcessEnv,
  extraDirectories: string[],
  systemDirectories: string[],
) {
  const directories = [
    ...(environment.PATH ?? "").split(delimiter),
    ...extraDirectories,
    ...systemDirectories,
  ]
    .filter((directory) => directory.length > 0 && directory.startsWith(sep))
    .map((directory) => resolve(directory));
  return [...new Set(directories.map((directory) => join(directory, "scanimage")))];
}

async function firstExecutable(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) {
        const target = await lstat(await realpath(candidate));
        if (!target.isFile()) continue;
      } else if (!info.isFile()) {
        continue;
      }
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Keep looking through the fixed, trusted search locations.
    }
  }
  return null;
}

function runCommand(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onChild?: (child: ReturnType<typeof spawn>) => void,
): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    let timedOut = false;
    let spawnError = false;
    let settled = false;
    const child = spawn(executable, args, {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    onChild?.(child);
    const appendBounded = (current: Buffer, chunk: Buffer, max: number) => {
      if (current.byteLength >= max) return current;
      return Buffer.concat([current, chunk.subarray(0, max - current.byteLength)]);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk, MAX_COMMAND_OUTPUT_BYTES);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk, MAX_STDERR_BYTES);
    });
    child.on("error", () => {
      spawnError = true;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const forceTimer = setTimeout(() => child.kill("SIGKILL"), 500);
      forceTimer.unref();
    }, timeoutMs);
    timer.unref();
    const settle = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({
        code,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        spawnError,
      });
    };
    child.on("close", (code) => settle(code));
  });
}

export function createScanner(options: ScannerServiceOptions): ScannerService {
  const userDataDir = resolve(options.userDataDir);
  const outboxDir = join(userDataDir, "scan-outbox");
  const settingsPath = join(userDataDir, "scanner-settings.json");
  const environment = options.env ?? process.env;
  const commandDirectories = options.platformSearchDirectories ?? [];
  const candidates = findScanimage(
    environment,
    commandDirectories,
    options.systemSearchDirectories ?? COMMAND_DIRECTORIES,
  );
  const childEnvironment = commandEnvironment(environment, environment.PATH ?? "");
  const now = options.now ?? Date.now;
  const pollTimeoutMs = options.pollTimeoutMs ?? 5000;
  const scanTimeoutMs = options.scanTimeoutMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const stateListeners = new Set<(state: ScannerState) => void>();
  const documentListeners = new Set<(document: ScannerDocument) => void>();
  let settings: ScannerSettings = { autoScan: true, folder: [] };
  let currentDevice: string | null = null;
  let currentScope: ScannerScope | null = null;
  let currentState: ScannerState = { kind: "not-found", autoScan: true, folder: [] };
  let loadedSince: number | null = null;
  let autoLatch = false;
  let pollTimer: NodeJS.Timeout | null = null;
  let pollTask: Promise<void> | null = null;
  let activePollChild: ReturnType<typeof spawn> | null = null;
  let scanTask: Promise<ScannerState> | null = null;
  let manualScanQueued = false;
  let queuedScanCancelled = false;
  let activeScan: ScanControl | null = null;
  let started = false;
  let closed = false;

  const snapshot = (): ScannerState => ({
    ...currentState,
    autoScan: settings.autoScan,
    folder: [...settings.folder],
  });

  const publish = (state: Omit<ScannerState, "autoScan" | "folder">) => {
    currentState = { ...state, autoScan: settings.autoScan, folder: [...settings.folder] };
    const value = snapshot();
    for (const listener of stateListeners) {
      try {
        listener(value);
      } catch {
        // A renderer listener must not break scanner work.
      }
    }
  };

  const emitDocument = (document: ScannerDocument) => {
    for (const listener of documentListeners) {
      try {
        listener(document);
      } catch {
        // A renderer listener must not break scanner work.
      }
    }
  };

  const readSettings = async () => {
    const contents = await readPrivateFile(settingsPath, 16 * 1024);
    if (!contents) return;
    try {
      const parsed = JSON.parse(contents) as Partial<ScannerSettings>;
      settings = {
        autoScan: typeof parsed.autoScan === "boolean" ? parsed.autoScan : true,
        folder: validFolder(parsed.folder) ? parsed.folder : [],
      };
    } catch {
      settings = { autoScan: true, folder: [] };
    }
    currentState = { ...currentState, autoScan: settings.autoScan, folder: [...settings.folder] };
  };

  const persistSettings = async () => {
    try {
      await ensurePrivateUserDataDirectory(userDataDir);
      await writePrivateFile(settingsPath, JSON.stringify(settings));
    } catch {
      throw new Error("Scanner settings could not be saved.");
    }
  };

  const outboxReady = async () => {
    await ensurePrivateUserDataDirectory(userDataDir);
    await ensurePrivateDirectory(outboxDir);
  };

  const setSafeError = (message: string) => {
    publish({
      kind: "error",
      ...(currentDevice ? { device: "Fujitsu scanner" } : {}),
      error: message,
    });
  };

  const readDocument = async (
    metadata: OutboxMetadata,
    scope: ScannerScope,
  ): Promise<ScannerDocument | null> => {
    if (!sameScope(currentScope, scope)) return null;
    try {
      const bytes = await readPrivateBytes(join(outboxDir, `${metadata.id}.pdf`), MAX_PDF_BYTES);
      if (digest(bytes) !== metadata.sha256 || !sameScope(currentScope, scope)) return null;
      return {
        id: metadata.id,
        name: metadata.name,
        bytes: new Uint8Array(bytes),
        sha256: metadata.sha256,
        pages: metadata.pages,
        folder: [...metadata.folder],
        userId: metadata.userId,
        spaceId: metadata.spaceId,
      };
    } catch {
      return null;
    }
  };

  const pendingForScope = async (scope: ScannerScope): Promise<ScannerDocument[]> => {
    if (!validScope(scope) || !sameScope(currentScope, scope)) return [];
    try {
      await outboxReady();
      const names = await readdir(outboxDir);
      const metadataNames = names.filter((name) => name.endsWith(".json")).sort();
      const documents: ScannerDocument[] = [];
      for (const name of metadataNames) {
        if (!sameScope(currentScope, scope)) return [];
        const metadataContents = await readPrivateFile(join(outboxDir, name), MAX_METADATA_BYTES);
        if (!metadataContents) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(metadataContents);
        } catch {
          continue;
        }
        const metadata = scopedMetadata(parsed, name);
        if (
          !metadata ||
          metadata.userId !== scope.userId ||
          metadata.spaceId !== scope.spaceId ||
          metadata.serverOrigin !== scope.serverOrigin
        ) {
          continue;
        }
        const document = await readDocument(metadata, scope);
        if (document) documents.push(document);
      }
      return sameScope(currentScope, scope) ? documents : [];
    } catch {
      return [];
    }
  };

  const replayPending = async () => {
    const scope = currentScope;
    if (!validScope(scope)) return;
    const documents = await pendingForScope(scope);
    if (!sameScope(currentScope, scope)) return;
    for (const document of documents) emitDocument(document);
  };

  const findExecutable = () => firstExecutable(candidates);

  const runPollCommand = async (executable: string, args: string[]) => {
    let child: ReturnType<typeof spawn> | null = null;
    const result = await runCommand(executable, args, childEnvironment, pollTimeoutMs, (value) => {
      child = value;
      activePollChild = value;
    });
    if (activePollChild === child) activePollChild = null;
    return result;
  };

  const performScan = async (capturedScope: ScannerScope, capturedFolder: string[]) => {
    const control: ScanControl = {
      cancelled: false,
      child: null,
      scope: { ...capturedScope },
    };
    activeScan = control;
    autoLatch = true;
    publish({ kind: "scanning", device: "Fujitsu scanner" });
    let tempDir: string | null = null;
    try {
      const executable = await findExecutable();
      if (!executable) {
        setSafeError("SANE is missing. Install SANE and restart the app.");
        return snapshot();
      }
      if (control.cancelled || !sameScope(currentScope, control.scope)) return snapshot();
      await outboxReady();
      tempDir = await mkdtemp(join(userDataDir, ".scan-pages-"));
      await chmod(tempDir, 0o700);
      const batch = join(tempDir, "page%03d.jpg");
      const result = await runCommand(
        executable,
        [
          "-d",
          currentDevice!,
          "--source",
          "ADF Duplex",
          "--mode",
          "Color",
          "--resolution",
          "300",
          "--format=jpeg",
          `--batch=${batch}`,
          "--swskip=1",
        ],
        childEnvironment,
        scanTimeoutMs,
        (child) => {
          control.child = child;
        },
      );
      if (control.cancelled || !sameScope(currentScope, control.scope)) return snapshot();
      if (result.code !== 0) {
        setSafeError(safeError(result.stderr, result.timedOut, result.spawnError));
        return snapshot();
      }
      const entries = await readdir(tempDir, { withFileTypes: true });
      const pages = entries
        .map((entry) => ({ entry, match: entry.name.match(PAGE_PATTERN) }))
        .filter(({ entry, match }) => entry.isFile() && match !== null)
        .sort((left, right) => Number(left.match![1]) - Number(right.match![1]));
      if (pages.length === 0) {
        setSafeError("No pages were scanned. Place paper in the feeder and try again.");
        return snapshot();
      }
      if (pages.length > 500) {
        setSafeError("The scan contained too many pages. Scan a smaller batch.");
        return snapshot();
      }
      const pageBytes: Buffer[] = [];
      let totalBytes = 0;
      for (const { entry } of pages) {
        const bytes = await readPrivateBytes(join(tempDir, entry.name), MAX_PAGE_BYTES);
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_PDF_BYTES) throw new Error("Scan is too large.");
        pageBytes.push(bytes);
      }
      const pdf = scannedPdf(pageBytes, 300);
      if (pdf.byteLength > MAX_PDF_BYTES) throw new Error("Scan is too large.");
      if (control.cancelled || !sameScope(currentScope, control.scope)) return snapshot();

      const id = randomUUID();
      const name = `scan-${id}.pdf`;
      const sha256 = digest(pdf);
      const metadata: OutboxMetadata = {
        id,
        name,
        sha256,
        pages: pageBytes.length,
        folder: [...capturedFolder],
        userId: capturedScope.userId,
        spaceId: capturedScope.spaceId,
        serverOrigin: capturedScope.serverOrigin,
        createdAt: now(),
      };
      await outboxReady();
      if (control.cancelled || !sameScope(currentScope, control.scope)) return snapshot();
      const pdfPath = join(outboxDir, `${id}.pdf`);
      const tempPath = join(outboxDir, `.${id}.${randomUUID()}.tmp`);
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      try {
        handle = await open(tempPath, "wx", 0o600);
        await handle.writeFile(pdf);
        await handle.sync();
        await handle.close();
        handle = null;
        if (control.cancelled || !sameScope(currentScope, control.scope)) return snapshot();
        await rename(tempPath, pdfPath);
        await chmod(pdfPath, 0o600);
        if (control.cancelled || !sameScope(currentScope, control.scope)) {
          await unlink(pdfPath).catch(() => undefined);
          return snapshot();
        }
        const metadataPath = join(outboxDir, `${id}.json`);
        await writePrivateFile(metadataPath, JSON.stringify(metadata));
        if (control.cancelled || !sameScope(currentScope, control.scope)) {
          await unlink(metadataPath).catch(() => undefined);
          await unlink(pdfPath).catch(() => undefined);
          return snapshot();
        }
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        await unlink(tempPath).catch(() => undefined);
        await unlink(pdfPath).catch(() => undefined);
        throw error;
      }
      if (!sameScope(currentScope, control.scope)) return snapshot();
      publish({ kind: "ready", device: "Fujitsu scanner" });
      const document = await readDocument(metadata, control.scope);
      if (document && sameScope(currentScope, control.scope)) emitDocument(document);
      return snapshot();
    } catch {
      if (control.cancelled) {
        publish({
          kind: currentDevice ? "ready" : "not-found",
          ...(currentDevice ? { device: "Fujitsu scanner" } : {}),
        });
      } else {
        setSafeError(
          "The scan could not be saved securely. Check available disk space and try again.",
        );
      }
      return snapshot();
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      if (activeScan === control) activeScan = null;
    }
  };

  const beginScan = (fromPoll: boolean): Promise<ScannerState> => {
    if (closed) return Promise.resolve(snapshot());
    if (scanTask) return scanTask;
    const waitingPoll = fromPoll ? null : pollTask;
    if (waitingPoll) {
      manualScanQueued = true;
      queuedScanCancelled = false;
    }
    const task = (async () => {
      if (waitingPoll) await waitingPoll;
      if (waitingPoll) manualScanQueued = false;
      if (queuedScanCancelled) {
        queuedScanCancelled = false;
        return snapshot();
      }
      if (closed) return snapshot();
      if (!validScope(currentScope)) {
        setSafeError("Sign in and select a space before scanning.");
        return snapshot();
      }
      if (!currentDevice) {
        setSafeError("No Fujitsu scanner is ready. Check the scanner connection and try again.");
        return snapshot();
      }
      if (currentState.kind === "busy") return snapshot();
      return performScan({ ...currentScope }, [...settings.folder]);
    })().finally(() => {
      if (scanTask === task) scanTask = null;
    });
    scanTask = task;
    return task;
  };

  const service: ScannerService = {
    async start() {
      if (started || closed) return;
      started = true;
      await readSettings().catch(() => undefined);
      if (closed) return;
      pollTimer = setInterval(() => {
        void service.pollNow();
      }, pollIntervalMs);
      pollTimer.unref();
      await service.pollNow();
    },

    async close() {
      if (closed) return;
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      currentScope = null;
      if (activePollChild) {
        const child = activePollChild;
        child.kill("SIGTERM");
        const forceTimer = setTimeout(() => child.kill("SIGKILL"), 500);
        forceTimer.unref();
      }
      if (activeScan) {
        activeScan.cancelled = true;
        activeScan.child?.kill("SIGTERM");
        if (activeScan.child) {
          const child = activeScan.child;
          const forceTimer = setTimeout(() => child.kill("SIGKILL"), 500);
          forceTimer.unref();
        }
      }
      await pollTask?.catch(() => undefined);
      await scanTask?.catch(() => undefined);
      stateListeners.clear();
      documentListeners.clear();
    },

    state: snapshot,

    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },

    onDocument(listener) {
      documentListeners.add(listener);
      return () => documentListeners.delete(listener);
    },

    async scan() {
      return beginScan(false);
    },

    async cancel() {
      const control = activeScan;
      if (control) {
        control.cancelled = true;
        autoLatch = true;
        control.child?.kill("SIGTERM");
        if (control.child) {
          const child = control.child;
          const forceTimer = setTimeout(() => child.kill("SIGKILL"), 500);
          forceTimer.unref();
        }
      } else if (scanTask && manualScanQueued) queuedScanCancelled = true;
      await scanTask?.catch(() => undefined);
      if (!activeScan && currentState.kind === "scanning") {
        publish({
          kind: currentDevice ? "ready" : "not-found",
          ...(currentDevice ? { device: "Fujitsu scanner" } : {}),
        });
      }
      return snapshot();
    },

    async setAutoScan(value) {
      if (typeof value !== "boolean") throw new Error("Invalid auto-scan value.");
      settings = { ...settings, autoScan: value };
      currentState = { ...currentState, autoScan: value };
      await persistSettings();
      publish({
        kind: currentState.kind,
        ...(currentState.device ? { device: currentState.device } : {}),
        ...(currentState.error ? { error: currentState.error } : {}),
      });
    },

    async setFolder(folder) {
      if (!validFolder(folder)) throw new Error("Invalid scanner folder.");
      settings = { ...settings, folder: [...folder] };
      currentState = { ...currentState, folder: [...folder] };
      await persistSettings();
      publish({
        kind: currentState.kind,
        ...(currentState.device ? { device: currentState.device } : {}),
        ...(currentState.error ? { error: currentState.error } : {}),
      });
    },

    async setScope(scope, serverOrigin = null) {
      const next: ScannerScope | null =
        scope === null
          ? null
          : {
              userId: scope.userId,
              spaceId: scope.spaceId,
              serverOrigin: serverOrigin ?? "",
            };
      if (next !== null && !validScope(next)) throw new Error("Invalid scanner scope.");
      const normalized = next
        ? { ...next, serverOrigin: canonicalOrigin(next.serverOrigin)! }
        : null;
      const changed =
        !sameScope(currentScope, normalized) && !(currentScope === null && normalized === null);
      currentScope = normalized;
      if (changed) await service.cancel();
      if (currentScope) await replayPending();
    },

    async pending() {
      const scope = currentScope;
      if (!validScope(scope)) return [];
      return pendingForScope({ ...scope });
    },

    async confirm(id, storedSha256) {
      if (typeof id !== "string" || !ID_PATTERN.test(id) || typeof storedSha256 !== "string") {
        return { ok: false };
      }
      const suppliedHash = storedSha256.toLowerCase();
      if (!HASH_PATTERN.test(suppliedHash)) return { ok: false };
      const scope = currentScope;
      if (!validScope(scope)) return { ok: false };
      const metadataPath = join(outboxDir, `${id}.json`);
      const pdfPath = join(outboxDir, `${id}.pdf`);
      try {
        await outboxReady();
        const contents = await readPrivateFile(metadataPath, MAX_METADATA_BYTES);
        if (!contents) return { ok: false };
        const metadata = scopedMetadata(JSON.parse(contents), `${id}.json`);
        if (
          !metadata ||
          metadata.userId !== scope.userId ||
          metadata.spaceId !== scope.spaceId ||
          metadata.serverOrigin !== scope.serverOrigin
        ) {
          return { ok: false };
        }
        const bytes = await readPrivateBytes(pdfPath, MAX_PDF_BYTES);
        const localHash = digest(bytes);
        const metadataHash = metadata.sha256.toLowerCase();
        if (
          !timingSafeEqual(Buffer.from(localHash, "hex"), Buffer.from(metadataHash, "hex")) ||
          !timingSafeEqual(Buffer.from(localHash, "hex"), Buffer.from(suppliedHash, "hex")) ||
          !sameScope(currentScope, scope)
        ) {
          return { ok: false };
        }
        unlinkSync(pdfPath);
        unlinkSync(metadataPath);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },

    async pollNow() {
      if (closed) return;
      if (pollTask) return pollTask;
      const task = (async () => {
        if (closed || scanTask) return;
        const executable = await findExecutable();
        if (closed) return;
        if (!executable) {
          currentDevice = null;
          loadedSince = null;
          publish({
            kind: "sane-missing",
            error: "SANE is missing. Install SANE and restart the app.",
          });
          return;
        }
        const listed = await runPollCommand(executable, ["-L"]);
        if (closed) return;
        if (listed.code !== 0) {
          currentDevice = null;
          loadedSince = null;
          setSafeError(safeError(listed.stderr, listed.timedOut, listed.spawnError));
          return;
        }
        const devices = deviceNames(listed.stdout);
        if (devices.length === 0) {
          currentDevice = null;
          loadedSince = null;
          publish({ kind: "not-found" });
          return;
        }
        currentDevice = devices[0]!;
        const optionsResult = await runPollCommand(executable, ["-d", currentDevice, "-A"]);
        if (closed) return;
        if (optionsResult.code !== 0) {
          loadedSince = null;
          const error = safeError(
            optionsResult.stderr,
            optionsResult.timedOut,
            optionsResult.spawnError,
          );
          if (error.toLowerCase().includes("busy")) {
            publish({ kind: "busy", device: "Fujitsu scanner", error });
          } else {
            setSafeError(error);
          }
          return;
        }
        const loaded = pageLoaded(optionsResult.stdout);
        if (loaded === null) {
          loadedSince = null;
          setSafeError("The feeder status is unavailable. Check the scanner's SANE support.");
          return;
        }
        if (!loaded) {
          loadedSince = null;
          autoLatch = false;
          publish({ kind: "ready", device: "Fujitsu scanner" });
          return;
        }
        const timestamp = now();
        if (loadedSince === null) loadedSince = timestamp;
        publish({ kind: "ready", device: "Fujitsu scanner" });
        if (
          settings.autoScan &&
          validScope(currentScope) &&
          !autoLatch &&
          !manualScanQueued &&
          timestamp - loadedSince >= SENSOR_STABLE_MS
        ) {
          autoLatch = true;
          await beginScan(true);
        }
      })().finally(() => {
        if (pollTask === task) pollTask = null;
      });
      pollTask = task;
      return task;
    },
  };

  return service;
}
