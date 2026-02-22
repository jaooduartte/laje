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
  className?: string;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => (index * 5).toString().padStart(2, "0"));

function getBaseDate(value: Date | null): Date {
  if (value) {
    return new Date(value);
  }

  const currentDate = new Date();
  currentDate.setSeconds(0, 0);
  return currentDate;
}

export function DateTimePicker({ value, onChange, placeholder, className }: DateTimePickerProps) {
  const selectedDate = value ? new Date(value) : undefined;

  const selectedHour = useMemo(() => {
    return value ? value.getHours().toString().padStart(2, "0") : HOUR_OPTIONS[12];
  }, [value]);

  const selectedMinute = useMemo(() => {
    if (value) {
      const roundedMinute = Math.floor(value.getMinutes() / 5) * 5;
      return roundedMinute.toString().padStart(2, "0");
    }

    return MINUTE_OPTIONS[0];
  }, [value]);

  const handleDateSelect = (nextDate: Date | undefined) => {
    if (!nextDate) {
      return;
    }

    const baseDate = getBaseDate(value);
    const mergedDate = new Date(nextDate);
    mergedDate.setHours(baseDate.getHours(), baseDate.getMinutes(), 0, 0);
    onChange(mergedDate);
  };

  const handleHourChange = (nextHour: string) => {
    const baseDate = getBaseDate(value);
    baseDate.setHours(Number(nextHour), Number(selectedMinute), 0, 0);
    onChange(baseDate);
  };

  const handleMinuteChange = (nextMinute: string) => {
    const baseDate = getBaseDate(value);
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
            "w-full justify-start bg-secondary border-border text-left font-normal hover:bg-secondary/90",
            !value ? "text-muted-foreground" : "text-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "dd/MM/yyyy HH:mm", { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3 p-3" align="start">
        <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} locale={ptBR} initialFocus />
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-muted-foreground" />

          <Select value={selectedHour} onValueChange={handleHourChange}>
            <SelectTrigger className="w-[86px] bg-secondary border-border">
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
            <SelectTrigger className="w-[86px] bg-secondary border-border">
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
      </PopoverContent>
    </Popover>
  );
}
