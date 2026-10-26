import { Trans, useLingui } from "@lingui/react/macro";
import type { ActionApprovalRule, ApprovalChoice } from "@rakazo/contracts";
import { actionTypeForTool, toolRuleAllowsAllow } from "@rakazo/core";
import { Button, NativeSelect, NativeSelectOption } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { ApprovalActionsTable, useActionTypeLabels } from "./ApprovalActionsTable";

const EFFECT_TO_CHOICE: Record<ActionApprovalRule["effect"], ApprovalChoice> = {
  always_allow: "allow",
  require_approval: "ask",
  block: "block",
};
const CHOICE_TO_EFFECT: Record<ApprovalChoice, ActionApprovalRule["effect"]> = {
  allow: "always_allow",
  ask: "require_approval",
  block: "block",
};

export function ApprovalRulesSettings() {
  const { t } = useLingui();
  const labels = useActionTypeLabels();
  const [rules, setRules] = useState<ActionApprovalRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc.approvalRules
      .list()
      .then(setRules)
      .catch((err) => setError(errorText(err, t`Could not load approval rules`)));
  }, [t]);

  async function changeRule(rule: ActionApprovalRule, choice: ApprovalChoice) {
    setError(null);
    try {
      const saved = await rpc.approvalRules.set({
        effect: CHOICE_TO_EFFECT[choice],
        matchKind: rule.matchKind,
        matchValue: rule.matchValue,
      });
      setRules((current) => current.map((item) => (item.id === rule.id ? saved : item)));
    } catch (err) {
      setError(errorText(err, t`Could not save rule`));
    }
  }

  async function removeRule(id: string) {
    setError(null);
    try {
      await rpc.approvalRules.remove({ id });
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch (err) {
      setError(errorText(err, t`Could not remove rule`));
    }
  }

  // The table owns category rules and bot overrides; the list holds the per-tool and per-connector rules.
  const listedRules = rules.filter((rule) => rule.matchKind !== "category" && !rule.botId);

  return (
    <div data-testid="action-confirmation-settings">
      <h3 className="text-[15px] font-medium text-foreground">
        <Trans>Approvals</Trans>
      </h3>
      <div className="mt-3">
        <ApprovalActionsTable />
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">
        <Trans>Background runs always ask before they send, change or run anything.</Trans>
      </p>
      {error ? <p className="mt-3 text-[13px] text-destructive">{error}</p> : null}
      {listedRules.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {listedRules.map((rule) => {
            const type =
              rule.matchKind === "tool" ? actionTypeForTool({ toolName: rule.matchValue }) : null;
            return (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2"
              >
                <span className="min-w-0 break-words text-[13.5px] text-foreground/75">
                  {rule.matchValue}
                  {type ? (
                    <span className="block text-[12px] text-muted-foreground">{labels[type]}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <NativeSelect
                    size="sm"
                    aria-label={rule.matchValue}
                    value={EFFECT_TO_CHOICE[rule.effect]}
                    onChange={(event) =>
                      void changeRule(rule, event.target.value as ApprovalChoice)
                    }
                  >
                    <NativeSelectOption
                      value="allow"
                      disabled={rule.matchKind === "tool" && !toolRuleAllowsAllow(rule.matchValue)}
                    >
                      {t`Allow`}
                    </NativeSelectOption>
                    <NativeSelectOption value="ask">{t`Ask`}</NativeSelectOption>
                    <NativeSelectOption value="block">{t`Block`}</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => void removeRule(rule.id)}
                  >
                    <Trans>Remove</Trans>
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
