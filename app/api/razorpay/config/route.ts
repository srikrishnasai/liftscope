import { razorpayPublicConfig } from "@/lib/razorpay";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(razorpayPublicConfig());
}
