import { expect, type Page, test } from "@playwright/test";
import {
  connectedOverview,
  emptyOverview,
  receiptPng,
  transactionOf,
  vendor,
  withoutReceipt,
  withReceipt,
} from "./fixtures/finance";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

/** Answers the Finance RPCs with synthetic data; everything else (sign-up, bots) is the real stack. */
async function mockFinance(page: Page, overview = connectedOverview) {
  const calls: string[] = [];
  await page.route("https://files.example.test/**", (route) =>
    route.fulfill({ contentType: "image/png", body: receiptPng }),
  );
  await page.route("**/rpc/finance/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/rpc/finance/")[1] ?? "";
    calls.push(name);
    const input = (route.request().postDataJSON() as { json?: Record<string, unknown> } | null)
      ?.json;
    const answers: Record<string, unknown> = {
      overview,
      refresh: { ok: true },
      vendor,
      transaction: transactionOf(String(input?.id)),
      receiptUrl: { url: "https://files.example.test/receipt.png", mimeType: "image/png" },
      connect: { status: "already_connected", serverId: "11111111-1111-4111-8111-111111111111" },
    };
    if (!(name in answers)) return route.fulfill({ status: 404, body: "not mocked" });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ json: answers[name], meta: [] }),
    });
  });
  return calls;
}

test("Finance shows the dashboard and drills down to a vendor, a charge and its receipt", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  const calls = await mockFinance(page);
  await signup(page, `finance-${Date.now()}@rakazo.test`, "password12", "Finance User");
  await completeOnboarding(page);

  await page.getByTestId("sidebar-finance").click();
  await expect(page).toHaveURL(/\/app\/finance$/);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Finance", level: 1 })).toBeVisible();
  await expect(main.getByText("$250,020")).toBeVisible();
  await expect(main.getByText("11.9 mo")).toBeVisible();
  await expect(main.getByText("Until October 2027")).toBeVisible();
  // Opening the page syncs once, then reads the stored data again.
  await expect.poll(() => calls.filter((c) => c === "refresh").length).toBe(1);

  // The agent panel starts closed; the header button opens it and hides while it is open.
  const ask = main.getByRole("button", { name: "Ask agent", exact: true });
  await expect(page.getByTestId("finance-agent-panel")).toHaveCount(0);
  await captureScreenshot(page, testInfo, "finance-dashboard");

  // The period chips change the number.
  const strip = main.getByRole("tablist", { name: "Period" });
  await strip.getByRole("tab", { name: "Week" }).click();
  await expect(main.getByRole("link", { name: "$3,050" })).toBeVisible();
  await strip.getByRole("tab", { name: "Year" }).click();
  await expect(main.getByRole("link", { name: "$264,000" })).toBeVisible();

  // Breakdown toggles between categories and vendors.
  await expect(main.locator('a[href="/app/finance/category/payroll"]')).toBeVisible();
  await main.getByRole("button", { name: "Vendor", exact: true }).click();
  await expect(main.locator('a[href="/app/finance/vendor/globex-compute"]').first()).toBeVisible();
  await expect(main.locator('a[href="/app/finance/category/payroll"]')).toHaveCount(0);

  // Subscription rows show what paid them on hover and on keyboard focus.
  const row = main.locator("tbody tr").filter({ hasText: "Umbrella AI" });
  const pill = row.getByRole("tooltip");
  await expect(pill).toBeHidden();
  await row.hover();
  await expect(pill).toHaveText("Brex ••4321 + Mercury Checking ••1234");
  await main.getByRole("heading", { name: "Subscriptions" }).hover();
  await expect(pill).toBeHidden();
  await row.getByRole("link").focus();
  await expect(pill).toBeVisible();

  // Ask agent opens the panel and is hidden while it is open.
  await ask.click();
  const panel = page.getByTestId("finance-agent-panel");
  await expect(panel).toBeVisible();
  await expect(ask).toHaveCount(0);
  // The panel narrows the page; the charts redraw at the new width.
  await expect
    .poll(() =>
      main
        .locator("svg[role=img]")
        .first()
        .evaluate((svg) => Number(svg.getAttribute("width")) === svg.parentElement?.clientWidth),
    )
    .toBe(true);
  await captureScreenshot(page, testInfo, "finance-agent-panel");
  await panel.getByRole("button", { name: "Collapse Finance agent" }).click();
  await expect(page.getByTestId("finance-agent-panel")).toHaveCount(0);
  await expect(ask).toBeVisible();

  // Vendor page, with a breadcrumb and Back.
  await main.getByRole("link", { name: "Acme Hosting" }).first().click();
  await expect(page).toHaveURL(/\/app\/finance\/vendor\/acme-hosting$/);
  await expect(main.getByRole("heading", { name: "Acme Hosting", level: 1 })).toBeVisible();
  await expect(main.getByText("↑ 40%")).toBeVisible();
  await expect(main.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Subscriptions");
  await captureScreenshot(page, testInfo, "finance-vendor");

  // A charge without a receipt says so and offers no upload.
  await main.locator("tbody tr").filter({ hasText: "Pro plan" }).first().getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/app/finance/transaction/${withoutReceipt.id}$`));
  await expect(main.getByText("No receipt")).toBeVisible();
  await expect(main.getByRole("button", { name: /Upload/ })).toHaveCount(0);
  await main
    .getByRole("link", { name: /Subscriptions/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/finance$/);

  // A charge with a receipt opens it.
  await page.goto(`/app/finance/transaction/${withReceipt.id}`);
  await expect(main.getByRole("heading", { level: 1 })).toContainText("Oct 1, 2026");
  await captureScreenshot(page, testInfo, "finance-transaction");
  await main.getByRole("link", { name: "Open receipt" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/finance/receipt/${withReceipt.id}$`));
  await expect(main.getByRole("img", { name: "Receipt" })).toBeVisible();
  // The back button names the previous crumb (the charge); its arrow is decoration.
  await main.getByRole("link", { name: "Oct 1, 2026" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/finance/transaction/${withReceipt.id}$`));

  // Refresh runs another sync.
  await page.goto("/app/finance");
  await main.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => calls.filter((c) => c === "refresh").length).toBeGreaterThan(1);
});

test("Finance with nothing connected offers Connect Mercury and Connect Brex", async ({
  page,
}, testInfo) => {
  const calls = await mockFinance(page, emptyOverview);
  await signup(page, `finance-empty-${Date.now()}@rakazo.test`, "password12", "Finance Empty");
  await completeOnboarding(page);
  await page.getByTestId("sidebar-finance").click();
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Connect Mercury" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Connect Brex" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Ask agent" })).toHaveCount(0);
  await captureScreenshot(page, testInfo, "finance-empty");
  await main.getByRole("button", { name: "Connect Mercury" }).click();
  await expect.poll(() => calls.includes("connect")).toBe(true);
});

test("Finance fits a phone and works in dark mode", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await mockFinance(page);
  await signup(page, `finance-phone-${Date.now()}@rakazo.test`, "password12", "Finance Phone");
  await completeOnboarding(page);
  await page.goto("/app/finance");
  const main = page.getByRole("main");
  await expect(main.getByText("$250,020")).toBeVisible();
  // The charts are drawn at the container's width, so nothing may force a sideways scroll.
  const overflow = () =>
    page.evaluate(() => {
      const scroller = document.querySelector("main .rk-scroll");
      return scroller ? scroller.scrollWidth - scroller.clientWidth : -1;
    });
  expect(await overflow()).toBeLessThanOrEqual(0);
  await captureScreenshot(page, testInfo, "finance-phone-dark");
  await page.goto(`/app/finance/vendor/acme-hosting`);
  await expect(main.getByRole("heading", { name: "Acme Hosting", level: 1 })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
