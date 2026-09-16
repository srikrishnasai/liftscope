import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-border/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo className="text-foreground" markClassName="size-5" />
        <p className="max-w-xl leading-relaxed">
          Planning bands from a published rubric — not a bid. Paid unlocks
          require an account, then Razorpay when keys are set.
        </p>
        <Link href="/estimate" className="hover:text-foreground">
          New estimate
        </Link>
      </div>
    </footer>
  );
}
