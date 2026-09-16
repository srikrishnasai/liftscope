"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

export function AuthNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (response) => {
        const data = (await response.json()) as { user?: { email?: string } | null };
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setEmail(null);
    if (pathname === "/account") {
      router.push("/");
    }
    router.refresh();
  }

  const next = encodeURIComponent(pathname || "/");

  if (email === undefined) {
    return <span className="hidden w-20 sm:inline" />;
  }

  if (email) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Link
          href="/account"
          className="max-w-[10rem] truncate px-2 text-sm text-muted-foreground hover:text-foreground"
          title={email}
        >
          Account
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link
        href={`/login?next=${next}`}
        className="hidden px-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
      >
        Sign in
      </Link>
      <Link
        href={`/signup?next=${next}`}
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        Create account
      </Link>
    </div>
  );
}
