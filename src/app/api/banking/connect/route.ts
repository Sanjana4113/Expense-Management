import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { bankIntegrationConfigured, listInstitutions, startBankAuthorization } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!bankIntegrationConfigured()) return NextResponse.json({ error: "Bank connection has not been configured yet." }, { status: 503 });
  if (!(await getDatabase())) return NextResponse.json({ error: "MongoDB is required to securely store bank connections." }, { status: 503 });
  const input = (await request.json().catch(() => null)) as { bankName?: unknown; country?: unknown; psuType?: unknown } | null;
  const bankName = typeof input?.bankName === "string" ? input.bankName.trim() : "";
  const country = typeof input?.country === "string" ? input.country.trim().toUpperCase() : "";
  const psuType = input?.psuType === "business" ? "business" : "personal";
  if (!bankName || !/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "Choose a valid bank and country." }, { status: 400 });
  try {
    const institutions = await listInstitutions(country, psuType);
    const bank = institutions.find((institution) => institution.name === bankName);
    if (!bank) return NextResponse.json({ error: "That bank is not available for the selected country and account type." }, { status: 400 });
    const redirectUri = process.env.ENABLE_BANKING_REDIRECT_URI || `${new URL(request.url).origin}/api/banking/enablebanking/callback`;
    const authorization = await startBankAuthorization({ ownerId: session.user.id, bankName, bankCountry: country, psuType, redirectUri, maximumConsentValidity: bank.maximumConsentValidity });
    return NextResponse.json({ url: authorization.url });
  } catch (error) {
    console.error("Could not start Enable Banking authorization", error);
    return NextResponse.json({ error: "Could not start the bank connection." }, { status: 502 });
  }
}
