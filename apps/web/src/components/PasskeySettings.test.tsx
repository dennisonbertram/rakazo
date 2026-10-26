// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "../lib/auth";
import { fetchAuthCapabilities } from "../lib/auth-capabilities";
import { PasskeySettings } from "./PasskeySettings";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((out, part, i) => out + part + (values[i] ?? ""), ""),
  }),
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: (props: React.ComponentProps<"button">) => <button type="button" {...props} />,
}));
vi.mock("../lib/auth-capabilities", () => ({ fetchAuthCapabilities: vi.fn() }));
vi.mock("../lib/auth", () => ({
  authClient: {
    useListPasskeys: vi.fn(() => ({
      data: [{ id: "pk1", name: "Laptop", deviceType: "multiDevice", createdAt: "2026-10-01" }],
    })),
    passkey: {
      addPasskey: vi.fn(async () => ({ error: null })),
      deletePasskey: vi.fn(async () => ({ error: null })),
    },
  },
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, { PublicKeyCredential: class {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(window, "PublicKeyCredential");
});
const render = () => act(async () => root.render(<PasskeySettings />));
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === name)!;

it("renders nothing when the server has no passkeys", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({
    sso: null,
    passwordAuth: true,
    passwordReset: false,
    resetUrl: null,
  });
  await render();
  expect(host.textContent).toBe("");
});

it("lists passkeys, adds one and removes one", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({
    sso: null,
    passwordAuth: true,
    passwordReset: false,
    resetUrl: null,
    passkey: true,
  });
  await render();
  expect(host.textContent).toContain("Laptop");
  await act(async () => button("Add passkey").click());
  expect(authClient.passkey.addPasskey).toHaveBeenCalled();
  await act(async () => button("Remove").click());
  expect(authClient.passkey.deletePasskey).toHaveBeenCalledWith({ id: "pk1" });
});
