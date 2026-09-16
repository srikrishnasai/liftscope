import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";
import {
  decodeSession,
  signValue,
  verifySignedValue,
  type SessionUser,
} from "./auth.ts";

/**
 * Free-tier entitlement: every visitor gets one report unlocked in full.
 *
 * The old gate hid the plan, the memo, and most of the risk register — which
 * is precisely the evidence that the output is any good. A stranger will not
 * pay to find out whether the risk register is boilerplate. So the first
 * report is free and complete; the charge starts at the second.
 *
 * A claim is keyed by whichever subjects are available, and **all** of them
 * are checked:
 *   - `visitor:<id>` from a signed first-party cookie (works before signup)
 *   - `user:<id>` when signed in
 *
 * Checking both means signing up after claiming anonymously does not hand out
 * a second free report, and clearing cookies while signed in does not either.
 * Someone determined can still clear a cookie in a private window to get
 * another — that is acceptable leakage on a top-of-funnel giveaway, and far
 * better than the gate it replaces.
 */

export const VISITOR_COOKIE = "liftscope_visitor";
const VISITOR_DAYS = 365;
export const VISITOR_MAX_AGE = VISITOR_DAYS * 24 * 60 * 60;

export interface FreeClaim {
  reportId: string;
  at: string;
}

const claimKey = (subject: string) => `freeclaim:${subject}`;

export function createVisitorId(): string {
  return `vis_${randomBytes(9).toString("hex")}`;
}

export function encodeVisitor(id: string): string {
  return `${id}.${signValue(id)}`;
}

export function decodeVisitor(token: string | undefined): string | null {
  if (!token || !token.includes(".")) return null;
  const index = token.lastIndexOf(".");
  const id = token.slice(0, index);
  const signature = token.slice(index + 1);
  if (!id.startsWith("vis_")) return null;
  return verifySignedValue(id, signature) ? id : null;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
}

export function readVisitorCookie(request: Request): string | null {
  return decodeVisitor(readCookie(request, VISITOR_COOKIE));
}

export function visitorCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VISITOR_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${VISITOR_MAX_AGE}${secure}`;
}

export interface Subjects {
  visitorId: string | null;
  user: SessionUser | null;
  /** Every identity key this caller presents. */
  keys: string[];
}

export function readSubjects(request: Request): Subjects {
  const visitorId = readVisitorCookie(request);
  const user = decodeSession(readCookie(request, "liftscope_session"));
  const keys: string[] = [];
  if (visitorId) keys.push(`visitor:${visitorId}`);
  if (user) keys.push(`user:${user.id}`);
  return { visitorId, user, keys };
}

/** The free claim for this caller, from whichever identity holds one. */
export async function findFreeClaim(
  subjects: Subjects,
): Promise<FreeClaim | null> {
  for (const key of subjects.keys) {
    const claim = await kv().get<FreeClaim>(claimKey(key));
    if (claim) return claim;
  }
  return null;
}

export type FreeClaimState =
  /** Never claimed — this report can be unlocked free. */
  | { status: "available" }
  /** Already claimed, and it was this report. */
  | { status: "claimed-here" }
  /** Already spent on a different report. */
  | { status: "spent"; reportId: string };

export async function freeClaimState(
  subjects: Subjects,
  reportId: string,
): Promise<FreeClaimState> {
  const claim = await findFreeClaim(subjects);
  if (!claim) return { status: "available" };
  if (claim.reportId === reportId) return { status: "claimed-here" };
  return { status: "spent", reportId: claim.reportId };
}

/**
 * Record the free unlock against every identity the caller presents, so it
 * cannot be re-claimed by switching between anonymous and signed-in.
 */
export async function claimFreeReport(
  subjects: Subjects,
  reportId: string,
): Promise<FreeClaim> {
  const claim: FreeClaim = { reportId, at: new Date().toISOString() };
  for (const key of subjects.keys) {
    await kv().set(claimKey(key), claim);
  }
  return claim;
}
