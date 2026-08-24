import { execFileSync } from "node:child_process";
import { runProcess } from "./process.js";

async function main() {
  execFileSync("pnpm", ["--filter", "@rakazo/desktop", "build"], {
    stdio: "inherit",
    env: process.env,
  });
  await runProcess(
    "pnpm",
    ["test:e2e", "--", "--spec=apps/web/e2e/desktop-product.spec.ts"],
    process.env,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
