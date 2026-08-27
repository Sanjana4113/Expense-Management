import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { bankIntegrationConfigured, buildAuthorizationUrl, createBankState } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!bankIntegrationConfigured()) return NextResponse.json({ error: "Bank connection has not been configured yet." }, { status: 503 });
  if (!(await getDatabase())) return NextResponse.json({ error: "MongoDB is required to securely store bank connections." }, { status: 503 });
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI || `${new URL(request.url).origin}/api/banking/callback`;
  return NextResponse.redirect(buildAuthorizationUrl(redirectUri, createBankState(session.user.id)));
}
