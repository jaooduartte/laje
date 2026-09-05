import { CalendarPlus, Download } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  type CalendarSubscriptionOption,
  resolveCalendarSubscriptionUrls,
} from "@/domain/calendar-subscription/calendarSubscription";

interface CalendarSubscriptionButtonProps {
  title: string;
  options: CalendarSubscriptionOption[];
  triggerLabel: string;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function CalendarSubscriptionButton({
  title,
  options,
  triggerLabel,
  onOpenChange,
  children,
}: CalendarSubscriptionButtonProps) {
  if (options.length == 0) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {children ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={triggerLabel}
          >
            <CalendarPlus className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="text-center">Adicionar ao calendário</DialogTitle>
          <DialogDescription className="text-center">
            Escolha o que deseja acompanhar para {title}. As atualizações de
            horário e local dependem da próxima sincronização do seu calendário.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {options.map((option) => {
            const urls = resolveCalendarSubscriptionUrls(option);

            if (!urls) {
              return null;
            }

            return (
              <div
                key={option.id}
                className="px-1 py-2 text-center"
              >
                <p className="mb-3 text-sm font-medium">{option.label}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild size="sm">
                    <a href={urls.subscriptionUrl}>Assinar atualizações</a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={urls.downloadUrl}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Baixar .ics
                    </a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
