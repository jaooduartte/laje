import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "glass-input flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm shadow-[0_4px_10px_rgba(15,23,42,0.06)] ring-offset-background transition-[color,box-shadow,border-color,background-color] placeholder:text-muted-foreground focus-visible:shadow-[0_6px_14px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
