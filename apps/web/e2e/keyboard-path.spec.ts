import { expect, type Page, test } from "@playwright/test";
import { completeOnboarding, signup } from "./helpers";

// VIS-03: the keyboard path through the app. Measures tab-stop counts, skip-link target, roving
// tabindex, focus ring strength, focus return after dialogs, and focus after a failed sign-in.

type Ring = { ok: boolean; why: string; name: string };

/** Contrast of the focus indicator on the focused element against what it sits on. */
async function focusRing(page: Page): Promise<Ring> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: false, why: "no focus", name: "body" };
    const name = `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.id ?? el.textContent?.trim().slice(0, 20) ?? ""}]`;
    const parse = (value: string) => {
      const m = value.match(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/);
      if (!m) return null;
      const raw = (m[1] ?? m[2])
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      const scale = m[2] ? 255 : 1;
      return { r: raw[0] * scale, g: raw[1] * scale, b: raw[2] * scale, a: raw[3] ?? 1 };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a: ReturnType<typeof parse>, b: ReturnType<typeof parse>) => {
      if (!a || !b) return 0;
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    let bg: ReturnType<typeof parse> = null;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a === 1) {
        bg = c;
        break;
      }
    }
    bg ??= parse(getComputedStyle(document.body).backgroundColor);
    const backdrop = (node: HTMLElement) => {
      for (let n: HTMLElement | null = node.parentElement; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a === 1) return c;
      }
      return parse(getComputedStyle(document.body).backgroundColor);
    };
    /** The indicator drawn on one node: a 2px outline, or a 2px box-shadow ring. */
    const indicator = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      const against = node === el ? bg : backdrop(node);
      if (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2) {
        return contrast(parse(style.outlineColor), against);
      }
      for (const part of style.boxShadow.split(/,(?![^(]*\))/)) {
        const m = part
          .trim()
          .match(
            /^(rgba?\([^)]+\)|color\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/,
          );
        if (m && Number(m[4]) === 0 && Number(m[5]) >= 2) return contrast(parse(m[1]), against);
      }
      return null;
    };
    // The focused node, or the field/composer frame around it (input groups draw the ring there).
    let node: HTMLElement | null = el;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const c = indicator(node);
      if (c === null) continue;
      return c >= 3
        ? { ok: true, why: "", name }
        : { ok: false, why: `indicator contrast ${c.toFixed(2)}`, name };
    }
    const style = getComputedStyle(el);
    return {
      ok: false,
      why: `no 2px indicator (outline ${style.outline}; shadow ${style.boxShadow})`,
      name,
    };
  });
}

/** Presses Tab `count` times and returns the ring check for every stop. */
async function sweep(page: Page, count: number): Promise<Ring[]> {
  const stops: Ring[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(260); // let focus transitions (opacity, ring) settle
    const ring = await focusRing(page);
    // Tabbing past the last stop leaves the page; that is not a stop.
    if (ring.name !== "body") stops.push(ring);
  }
  return stops;
}

const reset = (page: Page) =>
  page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });

test("skip link, roving sidebar, one tab stop per transcript, rings and dialog focus return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Auth: a failed sign-in puts focus on the error alert, not <body>.
  await page.goto("/sign-in");
  await page.getByPlaceholder("Your email address").fill("nobody@rakazo.test");
  await page.getByPlaceholder("Password").fill("wrong-password1");
  await page.locator('button[type="submit"]').click();
  const alert = page.getByRole("alert").first();
  await expect(alert).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("role")))
    .toBe("alert");

  const rings: Ring[] = [];
  await page.reload();
  rings.push(...(await sweep(page, 4)));

  await signup(page, `keys-${Date.now()}@rakazo.test`, "password12", "Keys User");
  await completeOnboarding(page);
  await expect(page.getByPlaceholder(/^Message /)).toBeVisible();

  // 1. Skip link: first Tab stop, Enter lands on the composer.
  await reset(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByPlaceholder(/^Message /)).toBeFocused();

  // 2. Tab stops before the first control in <main> (without the skip link) and the sidebar's
  // tabbable count.
  await reset(page);
  let before = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const inMain = await page.evaluate(() => !!document.activeElement?.closest("main"));
    if (inMain) break;
    before++;
  }
  expect(before - 1, "tab stops before main, excluding the skip link").toBeLessThanOrEqual(12);
  const sidebarStops = await page.evaluate(
    () => document.querySelectorAll("[data-roving][tabindex='0']:not(main *)").length,
  );
  expect(sidebarStops, "sidebar roving list has one tab stop").toBe(1);
  expect(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("[data-roving]")].filter(
          (e) => !e.closest("main") && (e as HTMLElement).tabIndex >= 0,
        ).length,
    ),
  ).toBe(1);

  // 3. Sidebar arrows. Inbox and the other page links are items in the same list.
  await page.getByTestId("sidebar-inbox").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("sidebar-finance")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("sidebar-inbox")).toBeFocused();
  await page.keyboard.press("End");
  const last = await page.evaluate(() => {
    const items = [...document.querySelectorAll("[data-roving]")].filter((e) => !e.closest("main"));
    return items.at(-1) === document.activeElement;
  });
  expect(last).toBe(true);
  await page.keyboard.press("Home");
  await expect(page.getByTestId("sidebar-inbox")).toBeFocused();
  // A chat row: ArrowRight reaches its visible Actions button, Escape comes back.
  const row = page.locator("[data-roster-bot-id]").first();
  await row.focus();
  await page.keyboard.press("ArrowRight");
  const actions = page.getByTestId("roster-row-actions").first();
  await expect(actions).toBeFocused();
  await expect(actions).toHaveCSS("opacity", "1");
  await page.keyboard.press("ArrowLeft");
  await expect(row).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();

  // 4. The transcript is one tab stop; ArrowRight reaches Reply.
  const transcriptStops = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          "[data-testid=transcript] [data-testid=message-hover-actions] button",
        ),
      ].filter((b) => (b as HTMLElement).tabIndex >= 0).length,
  );
  expect(transcriptStops).toBeLessThanOrEqual(1);
  const roving = page.locator("[data-testid=transcript] [data-message-id] [data-roving]").last();
  if (await roving.count()) {
    expect(transcriptStops).toBe(1);
    await roving.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-testid=transcript] [data-roving-action]:focus")).toHaveCount(
      1,
    );
  }

  // 5. Focus ring sweep across chat, Finance, Legal, Cap table and Integrations.
  await reset(page);
  rings.push(...(await sweep(page, 10)));
  for (const [id, path] of [
    ["sidebar-finance", /finance$/],
    ["sidebar-legal", /legal$/],
    ["sidebar-cap-table", /cap-table$/],
    ["sidebar-integrations", /integrations$/],
  ] as const) {
    await page.getByTestId(id).click();
    await expect(page).toHaveURL(path);
    await page.getByRole("main").focus();
    rings.push(...(await sweep(page, 6)));
  }
  // Dark theme, same sweep on the current page.
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  rings.push(...(await sweep(page, 6)));
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  expect(rings.length).toBeGreaterThanOrEqual(25);
  expect(rings.filter((r) => !r.ok)).toEqual([]);

  // 7. Dialogs return focus to the control that opened them.
  async function returns(opener: ReturnType<Page["getByRole"]>, close: "Escape" | "Close") {
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (close === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  await page.getByTestId("sidebar-cap-table").click();
  await expect(page).toHaveURL(/cap-table$/);
  await returns(page.getByRole("main").getByRole("button", { name: "Add contact" }), "Escape");
  await returns(page.getByRole("main").getByRole("button", { name: "Add contact" }), "Close");
  await page.getByTestId("sidebar-finance").click();
  await expect(page).toHaveURL(/finance$/);
  await returns(
    page.getByRole("main").getByRole("button", { name: "Add account" }).first(),
    "Escape",
  );
});
