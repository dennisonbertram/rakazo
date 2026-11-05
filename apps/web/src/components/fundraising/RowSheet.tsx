import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Contact, PipelineStatus } from "@rakazo/contracts";
import {
  Button,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetTitle,
} from "@rakazo/ui-web";
import { Phone } from "lucide-react";
import { useState } from "react";
import { usdFigure } from "../../lib/finance-format";
import type { PipelineRow, RowEdits } from "../../lib/pipeline-rows";
import { callDay } from "../../lib/pipeline-rows";
import { LogCallBody } from "./LogCall";
import { InterestChoice, ReferredByPicker, statusNames } from "./PipelineControls";

/** The phone's row sheet: every edit a row has, with Log call as its primary action. */
export function RowSheet({
  row,
  contacts,
  edits,
  logging: startLogging = false,
  onClose,
  onEditContact,
  safe = {},
}: {
  row: PipelineRow;
  contacts: readonly Contact[];
  edits: RowEdits;
  logging?: boolean;
  onClose: () => void;
  onEditContact: () => void;
  /** The SAFE actions the row has: Send SAFE on Committed, Open Mercury and Not sent while waiting. */
  safe?: { send?: () => void; openMercury?: () => void; notSent?: () => void };
}) {
  const [logging, setLogging] = useState(startLogging);
  const names = statusNames();
  const day = callDay(row) ?? "";
  const time =
    row.nextCallHasTime && row.nextCallAt
      ? new Date(row.nextCallAt).toTimeString().slice(0, 5)
      : "";
  const [step, setStep] = useState(row.nextStep ?? "");
  const [amount, setAmount] = useState(
    row.amountCents == null ? "" : String(row.amountCents / 100),
  );
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetTitle>{logging ? t`Log call: ${row.name}` : row.name}</SheetTitle>
        {logging ? (
          <SheetBody>
            <LogCallBody
              row={row}
              onSave={(result) => {
                edits.log(row, result);
                onClose();
              }}
              onCancel={() => setLogging(false)}
            />
          </SheetBody>
        ) : (
          <>
            <SheetBody className="grid gap-3">
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">
                  <Trans>Interest</Trans>
                </span>
                <InterestChoice row={row} onChange={(value) => edits.interest(row, value)} wide />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sheet-status">
                  <Trans>Status</Trans>
                </Label>
                <NativeSelect
                  id="sheet-status"
                  value={row.status}
                  className="w-full pointer-coarse:h-11"
                  onChange={(event) => edits.status(row, event.target.value as PipelineStatus)}
                >
                  {(Object.keys(names) as PipelineStatus[]).map((id) => (
                    <NativeSelectOption key={id} value={id}>
                      {names[id]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sheet-step">
                  <Trans>Next step</Trans>
                </Label>
                <Input
                  id="sheet-step"
                  className="pointer-coarse:h-11"
                  value={step}
                  onChange={(event) => setStep(event.target.value)}
                  onBlur={() => step.trim() !== (row.nextStep ?? "") && edits.nextStep(row, step)}
                />
              </div>
              <div className="grid grid-cols-[1fr_8.5rem] gap-2">
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="sheet-date">
                    <Trans>Next call</Trans>
                  </Label>
                  <Input
                    id="sheet-date"
                    className="pointer-coarse:h-11"
                    type="date"
                    value={day}
                    onChange={(event) =>
                      edits.nextCall(
                        row,
                        event.target.value ? { day: event.target.value, time: time || null } : null,
                      )
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sheet-time">
                    <Trans>Time</Trans>
                  </Label>
                  <Input
                    id="sheet-time"
                    className="pointer-coarse:h-11"
                    type="time"
                    value={time}
                    disabled={!day}
                    onChange={(event) =>
                      day && edits.nextCall(row, { day, time: event.target.value || null })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sheet-amount">
                  <Trans>Possible amount</Trans>
                </Label>
                <Input
                  id="sheet-amount"
                  className="pointer-coarse:h-11"
                  inputMode="decimal"
                  placeholder={usdFigure(null, 0, i18n.locale || "en")}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  onBlur={() =>
                    amount !== (row.amountCents == null ? "" : String(row.amountCents / 100)) &&
                    edits.amount(row, amount)
                  }
                />
              </div>
              <div className="flex min-h-11 items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  <Trans>Referred by</Trans>
                </span>
                <ReferredByPicker
                  row={row}
                  contacts={contacts}
                  trigger={
                    row.referredBy?.name ?? (
                      <span className="underline">
                        <Trans>Add</Trans>
                      </span>
                    )
                  }
                  onPick={(id) => edits.referrer(row, id)}
                  onCreate={(name) => edits.createReferrer(row, name)}
                />
              </div>
              <div className="flex flex-wrap gap-x-4">
                <Button variant="ghost" className="px-0" onClick={onEditContact}>
                  <Trans>Edit prospect</Trans>
                </Button>
                {safe.openMercury ? (
                  <Button variant="ghost" className="px-0" onClick={safe.openMercury}>
                    <Trans>Open Mercury</Trans>
                  </Button>
                ) : null}
                {safe.notSent ? (
                  <Button variant="ghost" className="px-0" onClick={safe.notSent}>
                    <Trans>Not sent</Trans>
                  </Button>
                ) : null}
              </div>
            </SheetBody>
            <SheetFooter className="flex-row gap-2">
              {safe.send ? (
                <Button variant="outline" size="lg" className="flex-1" onClick={safe.send}>
                  <Trans>Send SAFE</Trans>
                </Button>
              ) : null}
              <Button size="lg" className="flex-1" onClick={() => setLogging(true)}>
                <Phone aria-hidden="true" />
                <Trans>Log call</Trans>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
