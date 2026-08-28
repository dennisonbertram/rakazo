import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const proofLayers = ["api", "worker", "web", "desktop", "local"] as const;
export type ProofLayer = (typeof proofLayers)[number];

type ProofCommand = { command: string; args: string[]; proves: string };

export function commandForLayer(layer: Exclude<ProofLayer, "local">): ProofCommand {
  switch (layer) {
    case "api":
      return {
        command: "pnpm",
        args: ["test:integration", "--", "--suite=api"],
        proves: "migrations, authenticated RPC contracts, persistence, and job enqueueing",
      };
    case "worker":
      return {
        command: "pnpm",
        args: ["test:integration", "--", "--suite=worker"],
        proves: "scripted model execution, tool runs, retries, and persisted run transitions",
      };
    case "web":
      return {
        command: "pnpm",
        args: ["test:e2e", "--", "--spec=apps/web/e2e/bot-crud.spec.ts"],
        proves: "the browser create/edit/delete flow against an isolated API and database",
      };
    case "desktop":
      return {
        command: "pnpm",
        args: ["tsx", "packages/testkit/src/cli/desktop-product.ts"],
        proves:
          "the Electron shell loads the real web app and can create a bot through the title-bar control",
      };
  }
}

export function redact(value: string) {
  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]");
}

function parseLayer(argv: string[]): ProofLayer {
  const value = argv.find((arg) => arg.startsWith("--layer="))?.slice("--layer=".length);
  if (!value || !proofLayers.includes(value as ProofLayer)) {
    throw new Error(`Pass --layer=${proofLayers.join("|")}`);
  }
  return value as ProofLayer;
}

async function run(command: ProofCommand, logPath: string, evidencePath: string) {
  const stream = createWriteStream(logPath, { flags: "a" });
  const startedAt = new Date().toISOString();
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(command.command, command.args, {
        env: { ...process.env, RAKAZO_PROOF_EVIDENCE_PATH: evidencePath },
        shell: false,
      });
      child.stdout.on("data", (chunk) => stream.write(redact(String(chunk))));
      child.stderr.on("data", (chunk) => stream.write(redact(String(chunk))));
      child.on("error", reject);
      child.on("exit", (code) => resolve(code ?? 1));
    });
    return { startedAt, finishedAt: new Date().toISOString(), exitCode };
  } finally {
    await new Promise<void>((resolve) => stream.end(resolve));
  }
}

async function main() {
  const layer = parseLayer(process.argv.slice(2));
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${layer}`;
  const reportDir = path.resolve("test-report", "proofs", id);
  await mkdir(reportDir, { recursive: true });
  const logPath = path.join(reportDir, "proof.log");
  const layers: Exclude<ProofLayer, "local">[] =
    layer === "local" ? ["api", "worker", "web", "desktop"] : [layer];
  const phases: Array<Record<string, unknown>> = [];

  for (const proofLayer of layers) {
    const command = commandForLayer(proofLayer);
    const evidence = `evidence-${proofLayer}.json`;
    const result = await run(command, logPath, path.join(reportDir, evidence));
    phases.push({ layer: proofLayer, ...command, ...result, evidence });
    if (result.exitCode !== 0) break;
  }

  const ok = phases.length === layers.length && phases.every((phase) => phase.exitCode === 0);
  const summary = {
    id,
    layer,
    ok,
    startedAt: phases[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    artifacts: { log: "proof.log", evidence: phases.map((phase) => phase.evidence) },
    phases,
  };
  await writeFile(path.join(reportDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Proof ${ok ? "passed" : "failed"}: ${reportDir}`);
  if (!ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
