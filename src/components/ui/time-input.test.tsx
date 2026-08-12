import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { TimeInput } from "@/components/ui/time-input";

function ControlledTimeInput() {
  const [value, setValue] = useState("");

  return (
    <div>
      <TimeInput value={value} onChange={setValue} />
      <span data-testid="committed-value">{value}</span>
    </div>
  );
}

describe("TimeInput", () => {
  it("permite digitar o horário completo sem perder o foco", () => {
    render(<ControlledTimeInput />);

    const input = screen.getByPlaceholderText("HH:MM");
    const committedValue = screen.getByTestId("committed-value");

    input.focus();

    fireEvent.change(input, { target: { value: "1" } });
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("1");
    expect(committedValue).toHaveTextContent("");

    fireEvent.change(input, { target: { value: "14" } });
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("14");
    expect(committedValue).toHaveTextContent("");

    fireEvent.change(input, { target: { value: "140" } });
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("14:0");
    expect(committedValue).toHaveTextContent("");

    fireEvent.change(input, { target: { value: "1400" } });
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("14:00");
    expect(committedValue).toHaveTextContent("14:00");
  });

  it("restaura o último valor válido ao sair do campo com horário incompleto", () => {
    render(<ControlledTimeInput />);

    const input = screen.getByPlaceholderText("HH:MM");
    const committedValue = screen.getByTestId("committed-value");

    fireEvent.change(input, { target: { value: "1400" } });
    expect(committedValue).toHaveTextContent("14:00");

    fireEvent.change(input, { target: { value: "15" } });
    expect(input).toHaveValue("15");
    expect(committedValue).toHaveTextContent("14:00");

    fireEvent.blur(input);
    expect(input).toHaveValue("14:00");
    expect(committedValue).toHaveTextContent("14:00");
  });
});
