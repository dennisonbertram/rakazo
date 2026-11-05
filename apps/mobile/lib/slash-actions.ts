import type { SlashActionId } from "@rakazo/core";

/** Inserts `/goal ` into the draft; the server runs the command. Offered in bot chats only. */
export const GOAL_SLASH_ACTION = { id: "goal" as const, label: "Goal" };
export type MobileSlashActionId = SlashActionId | typeof GOAL_SLASH_ACTION.id;

/** Where a picker action navigates; null when it navigates nowhere (an unknown action does not open Account). */
export function slashActionRoute(
  action: MobileSlashActionId,
  chat: { inGroup: boolean; groupId?: string; botId?: string },
): { pathname: string; params?: Record<string, string> } | null {
  if (action === "chat-settings") {
    if (chat.inGroup && chat.groupId) {
      return { pathname: "/group-settings", params: { groupId: chat.groupId } };
    }
    return chat.botId ? { pathname: "/bot-settings", params: { botId: chat.botId } } : null;
  }
  return action === "settings-general" ? { pathname: "/account" } : null;
}
