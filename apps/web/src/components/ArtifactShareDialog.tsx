import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@rakazo/ui-web";
import { useState } from "react";
import { CopyLinkDialog } from "./CopyLinkDialog";

/**
 * The share link of an artifact version. `url` is set only right after the link was made, since
 * only its hash is stored; reopening an existing share shows the note and Stop sharing alone.
 */
export function ArtifactShareDialog({
  name,
  url,
  busy,
  error,
  onStop,
  onClose,
}: {
  name: string;
  url: string | null;
  busy: boolean;
  error: string | null;
  onStop: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <CopyLinkDialog
        title={t`Share link`}
        links={url ? [{ contactId: "artifact", name, link: url }] : []}
        note={t`Anyone with this link can view this version until you stop sharing or for 30 days.`}
        onClose={onClose}
        actions={
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            <Trans>Stop sharing</Trans>
          </Button>
        }
      />
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !open && !busy && setConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Stop sharing this link?</Trans>
            </AlertDialogTitle>
          </AlertDialogHeader>
          {error ? <p className="text-[13.5px] text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={onStop}>
              <Trans>Stop sharing</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
