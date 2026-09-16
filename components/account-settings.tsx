"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";

interface ProfileUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface UnlockRow {
  reportId: string;
  source: "stripe" | "demo";
  at: string;
  available: boolean;
  target: string | null;
}

export function AccountSettings({ initialUser }: { initialUser: ProfileUser }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [name, setName] = useState(initialUser.name);
  const [email, setEmail] = useState(initialUser.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        const data = (await response.json()) as {
          user?: ProfileUser | null;
          unlocks?: UnlockRow[];
        };
        if (data.user) {
          setUser(data.user);
          setName(data.user.name);
          setEmail(data.user.email);
        }
        setUnlocks(data.unlocks ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function saveName() {
    setPending("name");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { user?: ProfileUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "Could not save name");
      setUser(data.user);
      setMessage("Display name saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save name");
    } finally {
      setPending(null);
    }
  }

  async function saveEmail() {
    setPending("email");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: emailPassword }),
      });
      const data = (await response.json()) as { user?: ProfileUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "Could not change email");
      setUser(data.user);
      setEmail(data.user.email);
      setEmailPassword("");
      setMessage("Email updated. Use it the next time you sign in.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change email");
    } finally {
      setPending(null);
    }
  }

  async function savePassword() {
    setPending("password");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not change password");
      setCurrentPassword("");
      setNextPassword("");
      setMessage("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setPending(null);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function removeAccount() {
    setPending("delete");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not delete account");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert>
          <Check />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not update account</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Member since {formatDate(user.createdAt)}. Account id {user.id}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={name}
              maxLength={80}
              placeholder="How you want to appear on this account"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() => void saveName()}
          >
            {pending === "name" && <Loader2 className="animate-spin" />}
            Save name
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            This is the address used to sign in and for Stripe Checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-password">Current password</Label>
            <Input
              id="email-password"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(event) => setEmailPassword(event.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() => void saveEmail()}
          >
            {pending === "email" && <Loader2 className="animate-spin" />}
            Update email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>At least 8 characters. Sessions stay signed in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() => void savePassword()}
          >
            {pending === "password" && <Loader2 className="animate-spin" />}
            Change password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unlocked reports</CardTitle>
          <CardDescription>
            Purchases stay on this account. A report link only works while this
            server still holds the estimate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paid unlocks yet. Run an estimate, sign in, then Checkout.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {unlocks.map((row) => (
                <li key={`${row.reportId}-${row.at}`} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">
                    {row.target ?? "LiftScope report"}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {row.source === "stripe" ? "Stripe" : "demo"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(row.at)} · {row.reportId}
                  </p>
                  {row.available ? (
                    <Link
                      href={`/report/${row.reportId}`}
                      className="mt-1 inline-block text-sm underline-offset-4 hover:underline"
                    >
                      Open report
                    </Link>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No longer in server memory — run the estimate again.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Sign out of this browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Removes this login and its unlock records. Estimates already in this
            browser stay in local storage until you clear them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-password">Confirm with current password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={pending !== null || deletePassword.length < 8}
            onClick={() => void removeAccount()}
          >
            {pending === "delete" && <Loader2 className="animate-spin" />}
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
