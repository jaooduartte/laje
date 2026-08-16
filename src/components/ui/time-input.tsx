import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function TimeInput({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = "HH:MM",
  className,
  inputClassName,
}: TimeInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const resolveDigitsValue = (rawValue: string) =>
    rawValue.replace(/\D/g, "").slice(0, 4);

  const resolveFormattedValue = (rawValue: string) => {
    const digitsValue = resolveDigitsValue(rawValue);

    if (digitsValue.length <= 2) {
      return digitsValue;
    }

    return `${digitsValue.slice(0, 2)}:${digitsValue.slice(2)}`;
  };

  const resolveIsCompleteTimeValue = (rawValue: string) => {
    const digitsValue = resolveDigitsValue(rawValue);

    if (digitsValue.length != 4) {
      return false;
    }

    const hoursValue = Number(digitsValue.slice(0, 2));
    const minutesValue = Number(digitsValue.slice(2));

    return (
      Number.isInteger(hoursValue) &&
      Number.isInteger(minutesValue) &&
      hoursValue >= 0 &&
      hoursValue <= 23 &&
      minutesValue >= 0 &&
      minutesValue <= 59
    );
  };

  return (
    <div
      className={cn(
        "app-input-field flex h-10 w-full items-center justify-start overflow-hidden rounded-md border px-3 py-2 text-left font-normal shadow-[0_4px_10px_rgba(15,23,42,0.06)] ring-offset-background transition-[color,box-shadow,border-color,background-color] focus-within:shadow-[0_6px_14px_rgba(15,23,42,0.08)] focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 dark:shadow-none dark:focus-within:shadow-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <Clock className="mr-2 h-4 w-4 shrink-0 text-foreground/80 stroke-[2.25]" />
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={draftValue}
        disabled={disabled}
        onChange={(event) => {
          const nextDraftValue = resolveFormattedValue(event.target.value);

          setDraftValue(nextDraftValue);

          if (nextDraftValue == "") {
            onChange("");
            return;
          }

          if (resolveIsCompleteTimeValue(nextDraftValue)) {
            onChange(nextDraftValue);
          }
        }}
        onBlur={() => {
          if (draftValue == "") {
            onChange("");
            return;
          }

          if (resolveIsCompleteTimeValue(draftValue)) {
            const nextValue = resolveFormattedValue(draftValue);
            setDraftValue(nextValue);
            onChange(nextValue);
            return;
          }

          setDraftValue(value);
        }}
        maxLength={5}
        className={cn(
          "h-full w-full border-0 bg-transparent p-0 text-left text-sm text-foreground outline-none [appearance:textfield] disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden",
          inputClassName,
        )}
      />
    </div>
  );
}
