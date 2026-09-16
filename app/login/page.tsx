import { AuthForm } from "@/components/auth-form";
import { SiteShell } from "@/components/site-shell";

export const metadata = {
  title: "Sign in · LiftScope",
  description: "Sign in to unlock paid LiftScope reports.",
};

export default async function LoginPage({
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
        <h1 className="font-heading mt-2 text-3xl tracking-tight">Sign in</h1>
        <p className="mt-3 mb-8 text-sm text-muted-foreground">
          Required before Stripe Checkout. Estimates and the free teaser stay
          open without an account.
        </p>
        <AuthForm mode="login" nextPath={nextPath} />
      </main>
    </SiteShell>
  );
}
