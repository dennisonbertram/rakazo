import path from "node:path";
import { type ElectronApplication, _electron as electron, expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

/**
 * The desktop main process may open a hidden 1×1 probe window on the origin
 * root (legacy-storage detection) before the real shell window, so
 * `firstWindow()` can resolve to the probe. Wait for the window that carries
 * the requested route instead.
 */
async function windowWithRoute(app: ElectronApplication, route: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = app.windows().find((candidate) => {
      try {
        return !candidate.isClosed() && candidate.url().includes(route);
      } catch {
        return false;
      }
    });
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No Electron window reached ${route}`);
}

test("Electron loads the real app and opens the new-bot flow", async ({ baseURL }, testInfo) => {
  const app = await electron.launch({
    args: ["."],
    cwd: path.resolve(import.meta.dirname, "../../desktop"),
    env: {
      ...process.env,
      // Start on the product route instead of racing the desktop main process
      // by navigating the renderer while it is still loading its target URL.
      RAKAZO_WEB_URL: new URL("/sign-up", baseURL).toString(),
      RAKAZO_DISABLE_WARM_WINDOW: "1",
    },
  });

  try {
    const page = await windowWithRoute(app, "/sign-up");
    await expect(page).toHaveURL(/\/sign-up(?:$|[?#])/);
    const stamp = Date.now();
    await page.getByPlaceholder("Your name").fill("Desktop Proof");
    await page.getByPlaceholder("Your email address").fill(`desktop-proof-${stamp}@rakazo.test`);
    await page.getByPlaceholder("Password").fill("password12");
    await page.getByRole("button", { name: "Create account" }).click();
    await completeOnboarding(page);

    await page.getByTitle("Create").click();
    await expect(page.getByRole("button", { name: "New bot", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New bot", exact: true }).click();
    await expect(page.getByText("New bot", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("desktop-new-bot-form.png") });

    await page.locator("label:has-text('Name') input").fill("Desktop researcher");
    await page.locator("label:has-text('Title') input").fill("Desktop proof bot");
    await page.locator("label:has-text('Description') textarea").fill("Created through Electron.");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByPlaceholder("Message Desktop researcher")).toBeVisible();
  } finally {
    await app.close();
  }
});
