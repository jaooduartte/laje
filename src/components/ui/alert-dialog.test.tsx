import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ControlledAlertDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir confirmação</button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ação</AlertDialogTitle>
            <AlertDialogDescription>Confirme para continuar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

describe("AlertDialogContent", () => {
  it("moves focus into the confirmation and restores it after closing", async () => {
    render(<ControlledAlertDialog />);

    const trigger = screen.getByRole("button", { name: "Abrir confirmação" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancelButton = screen.getByRole("button", { name: "Cancelar" });
    expect(document.activeElement).toBe(cancelButton);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
