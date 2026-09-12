import { useState } from "react";
import { ClearButton } from "@/shared/ui/clear-button";
import { messages } from "@/shared/ui/messages";
import { Button } from "@/shared/ui/primitives/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";

/**
 * Quiet trash in the Today's UV card header. Confirm before dropping the
 * day's outdoor windows, sunscreen stamps, leftover load, and film.
 */
export function ClearDayControl() {
  const [open, setOpen] = useState(false);

  const confirm = () => {
    setOpen(false);
    void import("@/app/compose/simulation").then(({ clearLoggedDay }) => {
      clearLoggedDay();
    });
  };

  return (
    <>
      <ClearButton label={messages.clearDay.label} onClick={() => setOpen(true)} />
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>{messages.clearDay.title}</DialogTitle>
            <DialogDescription>{messages.clearDay.body}</DialogDescription>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setOpen(false)}>
                {messages.clearDay.cancel}
              </Button>
              <Button type="button" variant="outline" onClick={confirm}>
                {messages.clearDay.confirm}
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
