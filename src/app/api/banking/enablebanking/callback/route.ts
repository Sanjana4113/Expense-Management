import { NextResponse } from "next/server";
import { authorizeBankSession, verifyBankState } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dashboard = new URL("/", url.origin);
  const ownerId = verifyBankState(url.searchParams.get("state") || "");
  const code = url.searchParams.get("code");
  if (!code || !ownerId || url.searchParams.get("error")) {
    dashboard.searchParams.set("bank", url.searchParams.get("error") ? "cancelled" : "error");
    return NextResponse.redirect(dashboard);
  }
  try {
    const database = await getDatabase();
    if (!database) throw new Error("MongoDB is required");
    const session = await authorizeBankSession(code);
    const now = new Date();
    await database.collection("bankConnections").updateOne(
      { ownerId, provider: "enablebanking", sessionId: session.session_id },
      { $set: { ownerId, provider: "enablebanking", sessionId: session.session_id, bankName: session.aspsp.name, bankCountry: session.aspsp.country, accounts: session.accounts.map((account) => ({ accountId: account.uid, name: account.name || `${session.aspsp.name} account`, currency: account.currency })), status: "active", validUntil: session.access?.valid_until ? new Date(session.access.valid_until) : undefined, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    await database.collection("expenses").createIndex({ ownerId: 1, externalProvider: 1, externalTransactionId: 1 }, { unique: true, sparse: true });
    dashboard.searchParams.set("bank", "connected");
  } catch (error) {
    console.error("Enable Banking callback failed", error);
    dashboard.searchParams.set("bank", "error");
  }
  return NextResponse.redirect(dashboard);
}
