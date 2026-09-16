import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="no-print border-b border-border/80 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-foreground hover:opacity-80">
          <Logo />
          <span className="sr-only">LiftScope home</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          {!compact && (
            <Link
              href="/#how-it-works"
              className="hidden px-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              How it works
            </Link>
          )}
          <AuthNav />
          <Link
            href="/estimate"
            className={buttonVariants({ size: "sm" })}
          >
            Start estimate
          </Link>
        </nav>
      </div>
    </header>
  );
}
