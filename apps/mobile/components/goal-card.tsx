import type { MessageBlock } from "@rakazo/contracts";
import { Text, View } from "react-native";
import { mobileTokens } from "../lib/appearance";
import { t } from "../lib/i18n";

/** How a goal ended: the outcome, then the reason. */
export function GoalCard({ block }: { block: Extract<MessageBlock, { kind: "goal" }> }) {
  const tokens = mobileTokens();
  const title =
    block.outcome === "met"
      ? t("Goal met")
      : block.outcome === "blocked"
        ? t("Goal blocked")
        : t("Goal stopped");
  return (
    <View style={{ width: "100%", paddingVertical: 4, alignItems: "center" }}>
      <Text style={{ color: tokens.foreground, fontSize: 13.5, fontWeight: "600" }}>{title}</Text>
      {block.reason ? (
        <Text style={{ color: tokens.mutedForeground, fontSize: 13.5, textAlign: "center" }}>
          {block.reason}
        </Text>
      ) : null}
    </View>
  );
}
