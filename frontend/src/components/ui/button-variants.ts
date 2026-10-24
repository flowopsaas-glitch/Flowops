import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40",
  {
    variants: {
      variant: {
        default:
          "bg-sky-500 text-white hover:bg-sky-400 shadow-[0_10px_30px_-12px_rgba(56,189,248,0.8)]",
        destructive:
          "bg-red-500 text-white hover:bg-red-400 shadow-[0_10px_30px_-12px_rgba(239,68,68,0.8)]",
        outline:
          "border border-white/15 bg-white/5 text-white hover:bg-white/10",
        secondary:
          "bg-white/10 text-white hover:bg-white/15",
        ghost:
          "text-white hover:bg-white/10",
        link:
          "text-sky-300 underline-offset-4 hover:underline",
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
  }
);
