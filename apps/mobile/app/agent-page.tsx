import { ChatMarkdown } from "@rakazo/chat-ui/native";
import type { BotPage, BotPageSummary, PageData } from "@rakazo/contracts";
import { useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { MenuPicker } from "../components/menu-picker";
import { NativeSymbol } from "../components/native-symbol";
import type { LiveCell } from "../lib/agent-page";
import { pageBlocks } from "../lib/agent-page";
import { rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import {
  maskAmountsWhenHidden,
  maskSvgWhenHidden,
  setHideAmounts,
  useHideAmounts,
} from "../lib/hide-amounts";
import { useI18n } from "../lib/i18n";
import { native, useResolvedAppearance, useThemedStyles } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { errorText } from "../lib/user-error";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; page: BotPage | null };

export default function AgentPageScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const tokens = mobileTokens();
  const colorScheme = useResolvedAppearance();
  const [state, setState] = useState<State>({ status: "loading" });
  // A bot with several pages shows a menu to switch; without a choice, the first page opens.
  const [pages, setPages] = useState<BotPageSummary[]>([]);
  const [pageId, setPageId] = useState<string>();
  const [live, setLive] = useState<PageData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const hidden = useHideAmounts();

  useLayoutEffect(() => {
    const label = hidden ? t("Show amounts") : t("Hide amounts");
    const toggle = () => void setHideAmounts(!hidden);
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel={label}
          hitSlop={8}
          onPress={toggle}
          style={styles.headerButton}
        >
          <NativeSymbol
            ios={hidden ? "eye.slash" : "eye"}
            android={hidden ? "eye-off-outline" : "eye-outline"}
            size={19}
          />
        </Pressable>
      ),
      ...(iosAtLeast(26)
        ? {
            unstable_headerRightItems: () => [
              {
                type: "button" as const,
                label,
                icon: { type: "sfSymbol" as const, name: hidden ? "eye.slash" : "eye" },
                onPress: toggle,
              },
            ],
          }
        : {}),
    });
  }, [hidden, navigation, styles, t]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      rpc<BotPageSummary[]>("pages/list", { botId })
        .then((list) => !cancelled && setPages(list))
        .catch(() => undefined);
      rpc<BotPage | null>("pages/get", { botId, pageId, chartSvgs: true })
        .then((page) => !cancelled && setState({ status: "ready", page }))
        .catch((error: unknown) => {
          // Keep an already-loaded page on screen when a refresh fails.
          if (!cancelled)
            setState((prev) =>
              prev.status === "ready"
                ? prev
                : { status: "error", message: errorText(error, t("Could not load this page.")) },
            );
        });
      // Live data is optional: a failed request leaves the blocks on their last data.
      rpc<PageData | null>("pages/data", { botId, pageId })
        .then((data) => !cancelled && setLive(data))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [botId, pageId, t]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setLive(await rpc<PageData | null>("pages/refresh", { botId, pageId }));
    } catch {
      // The blocks keep their last data.
    } finally {
      setRefreshing(false);
    }
  }, [botId, pageId]);

  const page = state.status === "ready" ? state.page : null;
  // Data for another revision would pair with the wrong blocks, so it is ignored until refetched.
  const liveBlocks = page && live?.revision === page.revision ? live.blocks : undefined;
  const blocks = useMemo(
    () => (page ? pageBlocks(page.content, page.chartSvgs, liveBlocks) : []),
    [page, liveBlocks],
  );
  const placeholder = (status: string) =>
    status === "pending"
      ? t("Waiting for approval")
      : status === "denied"
        ? t("Not approved")
        : status === "missing"
          ? t("Source not found")
          : t("No data yet");
  const cellText = ({ text, usd }: LiveCell) => (usd ? maskAmountsWhenHidden(text) : text);
  const warning = (
    <View accessible accessibilityLabel={t("Source failed")}>
      <NativeSymbol
        ios="exclamationmark.triangle.fill"
        android="warning-outline"
        size={14}
        color={tokens.warning}
      />
    </View>
  );

  if (state.status !== "ready" || !page) {
    return (
      <View style={styles.centered}>
        {state.status === "loading" ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.message}>
            {state.status === "error" ? state.message : t("No page yet.")}
          </Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {pages.length > 1 ? (
        <MenuPicker
          label={t("Page")}
          choices={pages.map((entry) => ({ key: entry.id, label: entry.title }))}
          value={pageId ?? page.id}
          onChange={setPageId}
        />
      ) : null}
      {blocks.map((block, index) =>
        block.kind === "markdown" ? (
          <ChatMarkdown key={index} palette={tokens} colorScheme={colorScheme}>
            {block.text}
          </ChatMarkdown>
        ) : block.kind === "chart" ? (
          <View key={index} accessible accessibilityLabel={block.name} style={styles.chart}>
            <SvgXml xml={hidden ? maskSvgWhenHidden(block.svg) : block.svg} width="100%" />
          </View>
        ) : block.kind === "metric" ? (
          <View key={index}>
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{block.label}</Text>
              {block.status === "failed" ? warning : null}
              <Text style={styles.value}>
                {block.value ? cellText(block.value) : placeholder(block.status)}
              </Text>
            </View>
            {block.status === "failed" && block.error ? (
              <Text style={styles.error}>{block.error}</Text>
            ) : null}
          </View>
        ) : block.kind === "table" ? (
          <View key={index} style={styles.table}>
            <Text style={styles.caption}>{block.name}</Text>
            {block.hasRows ? (
              <View style={styles.group}>
                {block.rows.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.tableRow}>
                    <Text style={styles.rowTitle}>{cellText(row.title)}</Text>
                    {row.details.length > 0 ? (
                      <Text style={styles.detail}>
                        {row.details.map((detail) => cellText(detail)).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.detail}>{placeholder(block.status)}</Text>
            )}
            {block.status === "failed" ? (
              <View style={styles.failed}>
                {warning}
                {block.error ? <Text style={styles.error}>{block.error}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : (
          <Text key={index} style={styles.message}>
            {t("Chart could not be drawn.")}
          </Text>
        ),
      )}
    </ScrollView>
  );
}

function createStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: native.page },
    content: { padding: 20, gap: 12 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: native.page,
    },
    message: { color: native.secondaryLabel, fontSize: 14, textAlign: "center" },
    chart: { width: "100%" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: native.groupedCell,
    },
    rowTitle: { flex: 1, color: native.label, fontSize: 16 },
    value: { color: native.label, fontSize: 16, fontVariant: ["tabular-nums"] },
    detail: { color: native.secondaryLabel, fontSize: 14 },
    error: { color: native.secondaryLabel, fontSize: 13, paddingHorizontal: 16, paddingTop: 4 },
    failed: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16 },
    caption: { color: native.secondaryLabel, fontSize: 13, paddingHorizontal: 16 },
    table: { gap: 6 },
    group: { borderRadius: 12, overflow: "hidden", backgroundColor: native.groupedCell },
    tableRow: {
      gap: 2,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: native.separator,
    },
    headerButton: { padding: 8 },
  });
}
