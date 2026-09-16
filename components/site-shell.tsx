import type { ReactNode } from "react";
import { AdSlot } from "@/components/ad-slot";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function SiteShell({
  children,
  compact = false,
  bare = false,
}: {
  children: ReactNode;
  compact?: boolean;
  bare?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader compact={compact} />
      {!bare && (
        <div className="no-print border-b border-border/80 px-4 py-3 xl:hidden">
          <AdSlot placement="mobile" />
        </div>
      )}
      <div className="flex flex-1 justify-center gap-3 px-2 sm:px-4 xl:px-4">
        {!bare && (
          <div className="no-print hidden xl:block">
            <AdSlot placement="left" />
          </div>
        )}
        <div className="flex min-w-0 w-full max-w-6xl flex-1 flex-col">
          {children}
        </div>
        {!bare && (
          <div className="no-print hidden xl:block">
            <AdSlot placement="right" />
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
