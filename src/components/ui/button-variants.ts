import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium shadow-[0_4px_10px_rgba(15,23,42,0.06)] dark:shadow-none ring-offset-background transition-[color,box-shadow,background-color,border-color] hover:shadow-[0_6px_14px_rgba(15,23,42,0.08)] dark:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "app-button-primary",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-[hsl(0_62%_36%)] dark:hover:bg-[hsl(0_62%_32%)]",
        outline: "app-button-secondary",
        secondary: "app-button-secondary",
        ghost: "shadow-none hover:shadow-none hover:bg-accent hover:text-accent-foreground",
        link: "shadow-none hover:shadow-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
