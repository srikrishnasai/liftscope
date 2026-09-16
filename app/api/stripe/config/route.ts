import { stripePublicConfig } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(stripePublicConfig());
}
