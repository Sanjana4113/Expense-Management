import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { bankIntegrationConfigured, listInstitutions } from "@/lib/banking";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!bankIntegrationConfigured()) return NextResponse.json({ error: "Bank connection has not been configured yet." }, { status: 503 });
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") || "DE").toUpperCase();
  const psuType = url.searchParams.get("psuType") === "business" ? "business" : "personal";
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "Invalid country." }, { status: 400 });
  try {
    return NextResponse.json({ institutions: await listInstitutions(country, psuType) });
  } catch (error) {
    console.error("Could not list Enable Banking institutions", error);
    return NextResponse.json({ error: "Could not load banks for this country." }, { status: 502 });
  }
}
