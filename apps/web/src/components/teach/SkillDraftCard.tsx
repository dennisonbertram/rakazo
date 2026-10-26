import { Trans, useLingui } from "@lingui/react/macro";
import type { SkillPlaybook, TaughtSkill } from "@rakazo/contracts";
import { Button, Input, Label, Textarea } from "@rakazo/ui-web";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

type SkillDraftBlock = {
  kind: "skill_draft";
  skillId: string;
  name: string;
  goal: string;
  playbook: SkillPlaybook;
  status: "draft" | "saved";
};

function fieldLabel(id: string, title: React.ReactNode) {
  return (
    <Label htmlFor={id} className="mt-3 mb-1 text-[13px] font-normal text-muted-foreground">
      {title}
    </Label>
  );
}

const TEST_POLL_MS = 2000;
const TEST_POLL_LIMIT_MS = 120_000;

/** A login name must start with a letter and use lower-case letters, digits, "_" and "-". */
export function loginNameFromSite(site: string): string {
  let host = site.trim();
  try {
    host = new URL(/^[a-z]+:\/\//i.test(host) ? host : `https://${host}`).hostname;
  } catch {
    // Keep what was typed.
  }
  const name = host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return /^[a-z]/.test(name) ? name : name ? `login_${name}`.slice(0, 64) : "";
}

function LoginPromptRow({
  skillId,
  stepIndex,
  field,
  step,
  onUpdated,
}: {
  skillId: string;
  stepIndex: number;
  field: string;
  step: string | undefined;
  onUpdated: (skill: TaughtSkill) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [site, setSite] = useState("");
  const [username, setUsername] = useState("");
  const [needsUsername, setNeedsUsername] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<TaughtSkill>) {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await action());
    } catch (err) {
      const message = errorText(err, t`Could not save login`);
      if (message.includes("username")) setNeedsUsername(true);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="skill-login-prompt"
      className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
    >
      <div className="text-[13px] text-foreground">
        <Trans>
          Step {stepIndex + 1}: {step || field}
        </Trans>
      </div>
      {open ? (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              rpc.taughtSkills.saveLogin({
                skillId,
                stepIndex,
                name,
                site: site.trim(),
                ...(username.trim() ? { username: username.trim() } : {}),
              }),
            );
          }}
        >
          <Input
            aria-label={t`Site`}
            placeholder="https://"
            value={site}
            onChange={(event) => {
              setSite(event.target.value);
              if (!nameEdited) setName(loginNameFromSite(event.target.value));
            }}
          />
          <Input
            aria-label={t`Name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
            }}
          />
          {needsUsername ? (
            <Input
              aria-label={t`Username`}
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          ) : null}
          {error ? (
            <div role="alert" className="text-[13px] text-destructive">
              {error}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !name || !site.trim()}>
              <Trans>Save login</Trans>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Trans>Save as login</Trans>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => rpc.taughtSkills.skipLogin({ skillId, stepIndex }))}
          >
            <Trans>Skip</Trans>
          </Button>
          {error ? (
            <div role="alert" className="w-full text-[13px] text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SkillDraftCard({
  block,
  onRefresh,
  onAddRoutine,
}: {
  block: SkillDraftBlock;
  onRefresh: () => Promise<void>;
  onAddRoutine?: (skill: { id: string; name: string }) => void;
}) {
  const { t } = useLingui();
  const [name, setName] = useState(block.name);
  const [playbook, setPlaybook] = useState(block.playbook);
  const [saved, setSaved] = useState(block.status === "saved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<TaughtSkill | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setName(block.name);
    setPlaybook(block.playbook);
    setSaved(block.status === "saved");
    setLive(null);
    setTesting(false);
    let cancelled = false;
    void rpc.skills
      .get({ skillId: block.skillId })
      .then((skill: TaughtSkill | null) => {
        if (!cancelled) setLive(skill);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [block.skillId, block.status]);

  // The Test outcome settles on the server when the skill is read, so keep reading until it does.
  useEffect(() => {
    if (!testing) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      void rpc.skills
        .get({ skillId: block.skillId })
        .then((skill: TaughtSkill | null) => {
          if (skill?.lastTestOutcome) {
            setLive(skill);
            setTesting(false);
          } else if (Date.now() - started > TEST_POLL_LIMIT_MS) {
            setTesting(false);
          }
        })
        .catch(() => undefined);
    }, TEST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [testing, block.skillId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, t`Could not save skill`));
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = () =>
    run(async () => {
      await rpc.skills.updateDraft({ skillId: block.skillId, name, playbook });
      await rpc.skills.save({ skillId: block.skillId, name });
      setSaved(true);
      await onRefresh();
    });

  const testDraft = () =>
    run(async () => {
      await rpc.skills.updateDraft({ skillId: block.skillId, name, playbook });
      await rpc.skills.testRun({ skillId: block.skillId });
      setLive((current) => (current ? { ...current, lastTestOutcome: null } : current));
      setTesting(true);
      await onRefresh();
    });

  function applyLogin(skill: TaughtSkill) {
    setLive(skill);
    setPlaybook(skill.playbook);
  }

  const skillName = name || block.name || block.goal.slice(0, 80);
  const outcome = testing ? null : live?.lastTestOutcome;

  return (
    <div
      data-testid="skill-draft-card"
      className="w-160 max-w-full rounded-2xl border border-border bg-card px-5 py-4"
    >
      <div className="text-[15px] font-medium text-foreground">
        <Trans>Draft skill</Trans>
      </div>
      <div className="mt-1 text-[13.5px] text-muted-foreground">{block.goal}</div>
      {fieldLabel("skill-draft-name", <Trans>Name</Trans>)}
      <Input id="skill-draft-name" value={name} onChange={(event) => setName(event.target.value)} />
      {fieldLabel("skill-draft-steps", <Trans>Steps</Trans>)}
      <Textarea
        id="skill-draft-steps"
        value={playbook.steps.join("\n")}
        onChange={(event) =>
          setPlaybook({
            ...playbook,
            steps: event.target.value.split("\n"),
          })
        }
        rows={5}
      />
      {live?.loginPrompts?.map((prompt) => (
        <LoginPromptRow
          key={prompt.stepIndex}
          skillId={block.skillId}
          stepIndex={prompt.stepIndex}
          field={prompt.field}
          step={playbook.steps[prompt.stepIndex]}
          onUpdated={applyLogin}
        />
      ))}
      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] text-muted-foreground">
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 transition-transform group-open:rotate-90 rtl:-scale-x-100"
          />
          <Trans>More</Trans>
        </summary>
        {fieldLabel("skill-draft-when", <Trans>When to use</Trans>)}
        <Textarea
          id="skill-draft-when"
          value={playbook.whenToUse}
          onChange={(event) => setPlaybook({ ...playbook, whenToUse: event.target.value })}
          rows={2}
        />
        {fieldLabel("skill-draft-inputs", <Trans>Inputs</Trans>)}
        <Textarea
          id="skill-draft-inputs"
          value={playbook.inputs.join("\n")}
          onChange={(event) =>
            setPlaybook({
              ...playbook,
              inputs: event.target.value.split("\n"),
            })
          }
          rows={2}
        />
        {fieldLabel("skill-draft-check", <Trans>How to check</Trans>)}
        <Textarea
          id="skill-draft-check"
          value={playbook.howToCheck}
          onChange={(event) => setPlaybook({ ...playbook, howToCheck: event.target.value })}
          rows={2}
        />
        {fieldLabel("skill-draft-return", <Trans>What to return</Trans>)}
        <Textarea
          id="skill-draft-return"
          value={playbook.whatToReturn}
          onChange={(event) => setPlaybook({ ...playbook, whatToReturn: event.target.value })}
          rows={2}
        />
        {fieldLabel("skill-draft-approval", <Trans>Approval boundaries</Trans>)}
        <Textarea
          id="skill-draft-approval"
          value={playbook.approvalBoundaries}
          onChange={(event) => setPlaybook({ ...playbook, approvalBoundaries: event.target.value })}
          rows={2}
        />
        {fieldLabel("skill-draft-failure", <Trans>Failure handling</Trans>)}
        <Textarea
          id="skill-draft-failure"
          value={playbook.failureHandling}
          onChange={(event) => setPlaybook({ ...playbook, failureHandling: event.target.value })}
          rows={2}
        />
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => void saveDraft()}>
          {saved ? <Trans>Saved</Trans> : busy ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
        </Button>
        <Button variant="outline" disabled={busy || testing} onClick={() => void testDraft()}>
          <Trans>Test</Trans>
        </Button>
        {onAddRoutine ? (
          <Button
            variant="outline"
            disabled={busy || !saved}
            onClick={() => onAddRoutine({ id: block.skillId, name: skillName })}
          >
            <Trans>Add to routine</Trans>
          </Button>
        ) : null}
        {testing ? (
          <span role="status" className="text-[13px] text-muted-foreground">
            <Trans>Testing…</Trans>
          </span>
        ) : outcome === "worked" ? (
          <span role="status" className="text-[13px] text-success" data-testid="skill-test-result">
            <Trans>Worked</Trans>
          </span>
        ) : outcome === "stopped" ? (
          <span
            role="status"
            className="min-w-0 text-[13px] text-destructive"
            data-testid="skill-test-result"
          >
            {live?.lastTestNote ? (
              <Trans>Stopped: {live.lastTestNote}</Trans>
            ) : (
              <Trans>Stopped</Trans>
            )}
          </span>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="mt-2 text-[13px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
