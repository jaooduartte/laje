import { useMemo } from "react";
import { CalendarIcon, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder: string;
  showTime?: boolean;
  className?: string;
  defaultTime?: string;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => (index * 5).toString().padStart(2, "0"));

function resolveDefaultTimeParts(defaultTime?: string): { hour: number; minute: number } | null {
  if (!defaultTime) {
    return null;
  }

  const [hourPart, minutePart] = defaultTime.split(":").map(Number);

  if (Number.isNaN(hourPart) || Number.isNaN(minutePart) || hourPart < 0 || hourPart > 23 || minutePart < 0 || minutePart > 59) {
    return null;
  }

  return {
    hour: hourPart,
    minute: minutePart,
  };
}

function getBaseDate(value: Date | null, defaultTimeParts: { hour: number; minute: number } | null): Date {
  if (value) {
    return new Date(value);
  }

  const currentDate = new Date();

  if (defaultTimeParts) {
    currentDate.setHours(defaultTimeParts.hour, defaultTimeParts.minute, 0, 0);
    return currentDate;
  }

  currentDate.setSeconds(0, 0);
  return currentDate;
}

export function DateTimePicker({ value, onChange, placeholder, showTime = true, className, defaultTime }: DateTimePickerProps) {
  const selectedDate = value ? new Date(value) : undefined;
  const defaultTimeParts = useMemo(() => resolveDefaultTimeParts(defaultTime), [defaultTime]);

  const selectedHour = useMemo(() => {
    if (!value && defaultTimeParts) {
      return defaultTimeParts.hour.toString().padStart(2, "0");
    }

    return value ? value.getHours().toString().padStart(2, "0") : HOUR_OPTIONS[12];
  }, [defaultTimeParts, value]);

  const selectedMinute = useMemo(() => {
    if (!value && defaultTimeParts) {
      const roundedMinute = Math.floor(defaultTimeParts.minute / 5) * 5;
      return roundedMinute.toString().padStart(2, "0");
    }

    if (value) {
      const roundedMinute = Math.floor(value.getMinutes() / 5) * 5;
      return roundedMinute.toString().padStart(2, "0");
    }

    return MINUTE_OPTIONS[0];
  }, [defaultTimeParts, value]);

  const handleDateSelect = (nextDate: Date | undefined) => {
    if (!nextDate) {
      return;
    }

    if (!showTime) {
      const normalizedDate = new Date(nextDate);
      normalizedDate.setHours(12, 0, 0, 0);
      onChange(normalizedDate);
      return;
    }

    const baseDate = getBaseDate(value, defaultTimeParts);
    const mergedDate = new Date(nextDate);
    mergedDate.setHours(baseDate.getHours(), baseDate.getMinutes(), 0, 0);
    onChange(mergedDate);
  };

  const handleHourChange = (nextHour: string) => {
    const baseDate = getBaseDate(value, defaultTimeParts);
    baseDate.setHours(Number(nextHour), Number(selectedMinute), 0, 0);
    onChange(baseDate);
  };

  const handleMinuteChange = (nextMinute: string) => {
    const baseDate = getBaseDate(value, defaultTimeParts);
    baseDate.setHours(Number(selectedHour), Number(nextMinute), 0, 0);
    onChange(baseDate);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "app-input-field w-full justify-start overflow-hidden text-left font-normal hover:bg-background/70",
            !value ? "text-muted-foreground" : "text-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {value ? format(value, showTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: ptBR }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto space-y-3 border-border/70 bg-background/90 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.22)] dark:shadow-none backdrop-blur-lg"
        align="start"
      >
        <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} locale={ptBR} initialFocus />
        {showTime ? (
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />

            <Select value={selectedHour} onValueChange={handleHourChange}>
              <SelectTrigger className="app-input-field w-[86px]">
                <SelectValue placeholder="Hora" />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((hourOption) => (
                  <SelectItem key={hourOption} value={hourOption}>
                    {hourOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground">:</span>

            <Select value={selectedMinute} onValueChange={handleMinuteChange}>
              <SelectTrigger className="app-input-field w-[86px]">
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent>
                {MINUTE_OPTIONS.map((minuteOption) => (
                  <SelectItem key={minuteOption} value={minuteOption}>
                    {minuteOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
