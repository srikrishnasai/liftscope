import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account-settings";
import { SiteShell } from "@/components/site-shell";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { findAccountById, publicAccount } from "@/lib/accounts";

export const metadata = {
  title: "Account · LiftScope",
  description: "Manage your LiftScope profile, password, and paid unlocks.",
};

export default async function AccountPage() {
  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/login?next=/account");
  }
  const account = await findAccountById(session.id);
  if (!account) {
    redirect("/login?next=/account");
  }

  return (
    <SiteShell compact bare>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
          Account
        </p>
        <h1 className="font-heading mt-2 text-3xl tracking-tight">Profile</h1>
        <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">
          Settings for this login. Paid report unlocks stay on the account.
        </p>
        <AccountSettings initialUser={publicAccount(account)} />
      </main>
    </SiteShell>
  );
}
