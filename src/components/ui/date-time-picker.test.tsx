import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateTimePicker } from "@/components/ui/date-time-picker";

function ControlledDateTimePicker() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 7, 10, 8, 0));

  return (
    <DateTimePicker
      value={value}
      onChange={setValue}
      placeholder="Selecione"
    />
  );
}

describe("DateTimePicker", () => {
  it("atualiza a hora digitada sem perder o foco do campo", () => {
    render(<ControlledDateTimePicker />);

    const triggerButton = screen.getByText("10/08/2026 08:00").closest("button");

    expect(triggerButton).not.toBeNull();

    act(() => {
      fireEvent.click(triggerButton!);
    });

    const timeInput = screen.getByPlaceholderText("HH:MM");

    timeInput.focus();
    fireEvent.change(timeInput, { target: { value: "1" } });
    expect(document.activeElement).toBe(timeInput);

    fireEvent.change(timeInput, { target: { value: "14" } });
    expect(document.activeElement).toBe(timeInput);

    fireEvent.change(timeInput, { target: { value: "143" } });
    expect(document.activeElement).toBe(timeInput);

    fireEvent.change(timeInput, { target: { value: "1430" } });
    expect(document.activeElement).toBe(timeInput);

    expect(triggerButton).toHaveTextContent("10/08/2026 14:30");
  });
});
