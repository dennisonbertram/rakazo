import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

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
    const page = await app.firstWindow();
    await expect(page).toHaveURL(new RegExp(`/sign-up(?:$|[?#])`));
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
