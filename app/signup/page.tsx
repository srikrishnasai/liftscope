import { AuthForm } from "@/components/auth-form";
import { SiteShell } from "@/components/site-shell";

export const metadata = {
  title: "Create account · LiftScope",
  description: "Create a LiftScope account before paying to unlock a report.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next &&
    params.next.startsWith("/") &&
    !params.next.startsWith("//")
      ? params.next
      : "/estimate";

  return (
    <SiteShell compact bare>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
          Account
        </p>
        <h1 className="font-heading mt-2 text-3xl tracking-tight">
          Create account
        </h1>
        <p className="mt-3 mb-8 text-sm text-muted-foreground">
          Sign in is required before a paid unlock so the purchase stays on
          your account, not just this browser.
        </p>
        <AuthForm mode="signup" nextPath={nextPath} />
      </main>
    </SiteShell>
  );
}
