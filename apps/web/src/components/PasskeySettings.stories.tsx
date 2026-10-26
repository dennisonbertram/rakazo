import type { Meta, StoryObj } from "@storybook/react-vite";
import { PasskeySettings } from "./PasskeySettings";

/** Answers the capability lookup and the passkey list, which the component reads with fetch. */
function answer(passkeys: unknown[]) {
  const original = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/auth/capabilities")) {
      return Promise.resolve(
        Response.json({
          sso: null,
          passwordAuth: true,
          passwordReset: false,
          resetUrl: null,
          passkey: true,
        }),
      );
    }
    if (url.includes("/passkey/list-user-passkeys"))
      return Promise.resolve(Response.json(passkeys));
    return original(input, init);
  }) as typeof window.fetch;
  return () => {
    window.fetch = original;
  };
}

const meta = {
  title: "Settings/Passkeys",
  component: PasskeySettings,
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PasskeySettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoPasskeys: Story = { beforeEach: () => answer([]) };

export const WithPasskeys: Story = {
  beforeEach: () =>
    answer([
      {
        id: "pk1",
        name: "MacBook Touch ID",
        deviceType: "multiDevice",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "pk2",
        name: "Security key",
        deviceType: "singleDevice",
        createdAt: "2026-10-12T12:00:00.000Z",
      },
    ]),
};
