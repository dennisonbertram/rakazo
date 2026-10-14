// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AppLogo } from "./AppLogo";

async function render(logo: string | null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<AppLogo name="gmail" logo={logo} />));
  return { container, root };
}

it("shows the catalog logo", async () => {
  const { container } = await render("https://logos.example.test/gmail.svg");
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://logos.example.test/gmail.svg",
  );
});

it("falls back to a letter tile when there is no logo", async () => {
  const { container } = await render(null);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("G");
});

it("falls back to a letter tile when the image fails to load", async () => {
  const { container } = await render("https://logos.example.test/broken.svg");
  const img = container.querySelector("img");
  await act(async () => {
    img?.dispatchEvent(new Event("error"));
  });
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("G");
  expect(container.querySelector("[data-fallback]")).not.toBeNull();
});
