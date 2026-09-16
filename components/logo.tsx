import { cn } from "@/lib/utils";

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        className={cn("size-6 text-primary", markClassName)}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="8.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle
          cx="12"
          cy="12"
          r="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="square"
        />
      </svg>
      <span className="font-heading text-lg tracking-tight">LiftScope</span>
    </span>
  );
}
