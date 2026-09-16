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

interface PaymentConfig {
  configured: boolean;
  amount: number;
  currency: string;
  formatted: string;
  testMode: boolean;
}

type Gate = "open" | "free" | "login" | "pay";

const FALLBACK_CONFIG: PaymentConfig = {
  configured: false,
  amount: 149900,
  currency: "INR",
  formatted: "₹1,499",
  testMode: false,
};

/** Parameters Razorpay appends to the callback URL on return. */
const CALLBACK_PARAMS = [
  "razorpay_payment_id",
  "razorpay_payment_link_id",
  "razorpay_payment_link_reference_id",
  "razorpay_payment_link_status",
  "razorpay_signature",
] as const;

export function UnlockPanel({
  reportId,
  demo,
  onUnlocked,
}: {
  reportId: string;
  demo?: boolean;
  onUnlocked: () => void;
}) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const [freeSpentOn, setFreeSpentOn] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/razorpay/config")
      .then(async (response) => (await response.json()) as PaymentConfig)
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfig(FALLBACK_CONFIG);
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

    const paymentId = params.get("razorpay_payment_id");
    if (!paymentId) {
      fetch(`/api/reports/${encodeURIComponent(reportId)}/unlock`)
        .then(async (response) => {
          if (!response.ok) return { unlocked: false, gate: "open" as Gate };
          return (await response.json()) as {
            unlocked?: boolean;
            gate?: Gate;
            freeSpentOn?: string;
          };
        })
        .then((data) => {
          const nextGate = data.gate ?? "open";
          setGate(nextGate);
          setFreeSpentOn(data.freeSpentOn ?? null);
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

    // Hand every signed parameter back to the server; it re-derives the
    // signature and then re-fetches the link from Razorpay before unlocking.
    const query = new URLSearchParams({ reportId });
    for (const key of CALLBACK_PARAMS) {
      const value = params.get(key);
      if (value) query.set(key, value);
    }

    setVerifying(true);
    fetch(`/api/razorpay/callback?${query.toString()}`)
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
        for (const key of CALLBACK_PARAMS) url.searchParams.delete(key);
        url.searchParams.delete("checkout");
        window.history.replaceState({}, "", url.pathname);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not confirm payment");
      })
      .finally(() => setVerifying(false));
  }, [reportId, onUnlocked]);

  async function claimFree() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(
        `/api/reports/${encodeURIComponent(reportId)}/claim-free`,
        { method: "POST" },
      );
      const data = (await response.json()) as {
        unlocked?: boolean;
        error?: string;
        freeSpentOn?: string;
      };
      if (!response.ok || !data.unlocked) {
        if (data.freeSpentOn) setFreeSpentOn(data.freeSpentOn);
        setGate("pay");
        throw new Error(data.error || "Could not unlock this report");
      }
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock this report");
    } finally {
      setPending(false);
    }
  }

  async function startCheckout() {
    setError(null);
    setCanceled(false);
    setPending(true);
    try {
      const response = await fetch("/api/razorpay/checkout", {
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
        throw new Error(data.error || "Sign in before paying.");
      }
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start the payment");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment");
      setPending(false);
    }
  }

  const paymentsReady = Boolean(config?.configured);
  const loginHref = `/login?next=${encodeURIComponent(`/report/${reportId}`)}`;
  const signupHref = `/signup?next=${encodeURIComponent(`/report/${reportId}`)}`;
  const showFree = paymentsReady && !demo && gate === "free";
  const showLogin = paymentsReady && !demo && gate === "login";
  const showPay = paymentsReady && !demo && gate === "pay";
  const showDemo = demo || !paymentsReady;

  return (
    <Card className="no-print border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" />
          Unlock the full report
        </CardTitle>
        <CardDescription>
          Reveals the remaining risks, phased plan, client memo, and the
          checklist of what would move this estimate. Your first report is
          free and complete — after that, unlocking one is a paid upgrade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canceled && (
          <Alert>
            <AlertCircle />
            <AlertTitle>Payment canceled</AlertTitle>
            <AlertDescription>
              No charge was made. Start again when you want the full working
              papers.
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
            Confirming payment with Razorpay…
          </p>
        )}
        {paymentsReady && !demo && gate === null && !verifying && (
          <p className="text-sm text-muted-foreground">Checking account…</p>
        )}

        {showFree && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your first report is on us — the whole thing, no card and no
              account. Read the full risk register and plan before you decide
              whether this is worth paying for.
            </p>
            <Button
              type="button"
              size="lg"
              disabled={pending || verifying}
              onClick={claimFree}
            >
              {pending && <Loader2 className="animate-spin" />}
              Unlock this report free
            </Button>
            <p className="text-xs text-muted-foreground">
              One free report per person. Later reports are{" "}
              {config?.formatted ?? FALLBACK_CONFIG.formatted} each.
            </p>
          </div>
        )}

        {showLogin && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {freeSpentOn
                ? "You have already used your free report. Sign in to unlock this one — the payment and the report attach to your account, not just this browser."
                : "Sign in first. The payment and the paid report attach to your account, not just this browser."}
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
                ? "Redirecting to Razorpay…"
                : `Unlock — ${config?.formatted ?? FALLBACK_CONFIG.formatted}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              {freeSpentOn ? "Free report already used. " : ""}One-time payment
              for this report, stored on your account. UPI,
              cards, net banking, and wallets on Razorpay&rsquo;s hosted page.{" "}
              {config?.testMode
                ? "Razorpay is in test mode — no real money moves."
                : ""}
            </p>
          </div>
        )}

        {showDemo && (
          <div className="space-y-3">
            {demo && paymentsReady && (
              <p className="text-sm text-muted-foreground">
                Sample fixture — no charge and no account required. Live
                estimates require sign-in, then payment.
              </p>
            )}
            {!paymentsReady && (
              <p className="text-xs text-muted-foreground">
                Razorpay is not configured on this instance. Set{" "}
                <code className="rounded bg-muted px-1">RAZORPAY_KEY_ID</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1">
                  RAZORPAY_KEY_SECRET
                </code>{" "}
                to take real payments. Until then, unlock is free for review.
              </p>
            )}
            <Button
              type="button"
              size="lg"
              variant={paymentsReady && demo ? "outline" : "default"}
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
