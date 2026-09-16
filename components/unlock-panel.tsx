"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isUnlockedLocal } from "@/lib/client-store";

interface StripeConfig {
  configured: boolean;
  amount: number;
  currency: string;
  formatted: string;
  testMode: boolean;
}

type Gate = "open" | "login" | "pay";

export function UnlockPanel({
  reportId,
  demo,
  onUnlocked,
}: {
  reportId: string;
  demo?: boolean;
  onUnlocked: () => void;
}) {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/config")
      .then(async (response) => (await response.json()) as StripeConfig)
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) {
          setConfig({
            configured: false,
            amount: 4900,
            currency: "usd",
            formatted: "$49",
            testMode: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "canceled") {
      setCanceled(true);
    }
    const sessionId = params.get("session_id");
    if (!sessionId) {
      fetch(`/api/reports/${encodeURIComponent(reportId)}/unlock`)
        .then(async (response) => {
          if (!response.ok) return { unlocked: false, gate: "open" as Gate };
          return (await response.json()) as {
            unlocked?: boolean;
            gate?: Gate;
          };
        })
        .then((data) => {
          const nextGate = data.gate ?? "open";
          setGate(nextGate);
          if (data.unlocked) {
            onUnlocked();
            return;
          }
          if (nextGate === "open" && isUnlockedLocal(reportId)) {
            onUnlocked();
          }
        })
        .catch(() => setGate("open"));
      return;
    }

    setVerifying(true);
    fetch(
      `/api/stripe/session?session_id=${encodeURIComponent(sessionId)}&reportId=${encodeURIComponent(reportId)}`,
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          paid?: boolean;
          error?: string;
        };
        if (response.status === 401) {
          setGate("login");
          throw new Error(data.error || "Sign in to confirm this payment.");
        }
        if (!response.ok || !data.paid) {
          throw new Error(data.error || "Payment was not completed");
        }
      })
      .then(() => {
        onUnlocked();
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("checkout");
        window.history.replaceState({}, "", url.pathname);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not confirm payment");
      })
      .finally(() => setVerifying(false));
  }, [reportId, onUnlocked]);

  async function startCheckout() {
    setError(null);
    setCanceled(false);
    setPending(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const data = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (response.status === 401) {
        setGate("login");
        throw new Error(data.error || "Sign in before starting Checkout.");
      }
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start Stripe Checkout");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Stripe Checkout");
      setPending(false);
    }
  }

  const stripeReady = Boolean(config?.configured);
  const loginHref = `/login?next=${encodeURIComponent(`/report/${reportId}`)}`;
  const signupHref = `/signup?next=${encodeURIComponent(`/report/${reportId}`)}`;
  const showLogin = stripeReady && !demo && gate === "login";
  const showPay = stripeReady && !demo && gate === "pay";
  const showDemo = demo || !stripeReady;

  return (
    <Card className="no-print border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" />
          Unlock the full report
        </CardTitle>
        <CardDescription>
          Reveals the remaining risks, phased plan, client memo, and the
          checklist of what would move this estimate. Paid unlocks require an
          account so the purchase stays with you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canceled && (
          <Alert>
            <AlertCircle />
            <AlertTitle>Checkout canceled</AlertTitle>
            <AlertDescription>
              No charge was made. Start Checkout again when you want the full
              working papers.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Unlock failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {verifying && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Confirming payment with Stripe…
          </p>
        )}
        {stripeReady && !demo && gate === null && !verifying && (
          <p className="text-sm text-muted-foreground">Checking account…</p>
        )}

        {showLogin && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in first. Checkout and the paid report attach to your
              account, not just this browser.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={loginHref}
                className={buttonVariants({ size: "lg" })}
              >
                Sign in to unlock
              </Link>
              <Link
                href={signupHref}
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Create account
              </Link>
            </div>
          </div>
        )}

        {showPay && (
          <div className="space-y-3">
            <Button
              type="button"
              size="lg"
              disabled={pending || verifying || !config}
              onClick={startCheckout}
            >
              {(pending || verifying) && <Loader2 className="animate-spin" />}
              {pending
                ? "Redirecting to Stripe…"
                : `Unlock with Stripe — ${config?.formatted ?? "$49"}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              One-time payment for this report, stored on your account.{" "}
              {config?.testMode
                ? "Stripe is in test mode — use card 4242 4242 4242 4242."
                : "You will be charged on Stripe-hosted Checkout."}
            </p>
          </div>
        )}

        {showDemo && (
          <div className="space-y-3">
            {demo && stripeReady && (
              <p className="text-sm text-muted-foreground">
                Sample fixture — no charge and no account required. Live
                estimates require sign-in, then Stripe Checkout.
              </p>
            )}
            {!stripeReady && (
              <p className="text-xs text-muted-foreground">
                Stripe is not configured on this instance. Set{" "}
                <code className="rounded bg-muted px-1">STRIPE_SECRET_KEY</code>{" "}
                to take real payments. Until then, unlock is free for review.
              </p>
            )}
            <Button
              type="button"
              size="lg"
              variant={stripeReady && demo ? "outline" : "default"}
              disabled={verifying}
              onClick={onUnlocked}
            >
              Unlock full report
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
