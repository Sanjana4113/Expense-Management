import { NextResponse } from "next/server";
import { exchangeCode, getLinkedAccounts, encryptSecret, verifyBankState } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const ownerId = verifyBankState(url.searchParams.get("state") || "");
  const dashboard = new URL("/", url.origin);
  if (!code || !ownerId || url.searchParams.get("error")) {
    dashboard.searchParams.set("bank", "cancelled");
    return NextResponse.redirect(dashboard);
  }

  try {
    const database = await getDatabase();
    if (!database) throw new Error("MongoDB is required");
    const redirectUri = process.env.TRUELAYER_REDIRECT_URI || `${url.origin}/api/banking/callback`;
    const token = await exchangeCode(code, redirectUri);
    const accounts = await getLinkedAccounts(token.access_token);
    const now = new Date();
    await database.collection("bankConnections").updateOne(
      { ownerId, provider: "truelayer" },
      { $set: { accessToken: encryptSecret(token.access_token), ...(token.refresh_token ? { refreshToken: encryptSecret(token.refresh_token) } : {}), expiresAt: new Date(Date.now() + token.expires_in * 1000), accounts, status: "active", updatedAt: now }, $setOnInsert: { ownerId, provider: "truelayer", createdAt: now } },
      { upsert: true },
    );
    await database.collection("expenses").createIndex({ ownerId: 1, externalProvider: 1, externalTransactionId: 1 }, { unique: true, sparse: true });
    dashboard.searchParams.set("bank", "connected");
  } catch (error) {
    console.error("Bank connection callback failed", error);
    dashboard.searchParams.set("bank", "error");
  }
  return NextResponse.redirect(dashboard);
}
