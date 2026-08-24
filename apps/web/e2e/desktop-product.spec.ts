import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { completeOnboarding, signup } from "./helpers";

test("Electron loads the real app and opens the new-bot flow", async ({ baseURL }) => {
  const app = await electron.launch({
    args: ["."],
    cwd: path.resolve(import.meta.dirname, "../../desktop"),
    env: {
      ...process.env,
      RAKAZO_WEB_URL: baseURL,
      RAKAZO_DISABLE_WARM_WINDOW: "1",
    },
  });

  try {
    const page = await app.firstWindow();
    const stamp = Date.now();
    await signup(page, `desktop-proof-${stamp}@rakazo.test`, "password12", "Desktop Proof");
    await completeOnboarding(page, ["A bit of everything", "Clear and tight"]);

    await page.getByTitle("Create").click();
    await expect(page.getByRole("button", { name: "New bot", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New bot", exact: true }).click();
    await expect(page.getByText("New bot", { exact: true })).toBeVisible();

    await page.locator("label:has-text('Name') input").fill("Desktop researcher");
    await page.locator("label:has-text('Title') input").fill("Desktop proof bot");
    await page.locator("label:has-text('Description') textarea").fill("Created through Electron.");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByPlaceholder("Message Desktop researcher")).toBeVisible();
  } finally {
    await app.close();
  }
});
