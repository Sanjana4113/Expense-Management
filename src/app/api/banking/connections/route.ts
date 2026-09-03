import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { bankIntegrationConfigured, closeBankSession } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const database = await getDatabase();
  if (!database) return NextResponse.json({ configured: bankIntegrationConfigured(), connections: [] });
  const connections = await database.collection("bankConnections").find({ ownerId: session.user.id, provider: "enablebanking" }).toArray();
  return NextResponse.json({ configured: bankIntegrationConfigured(), connections: connections.map((connection) => ({ _id: connection._id, bankName: connection.bankName, bankCountry: connection.bankCountry, accounts: Array.isArray(connection.accounts) ? connection.accounts.map((account: { accountId: string; name: string; currency?: string }) => ({ accountId: account.accountId, name: account.name, currency: account.currency })) : [], status: connection.status, lastSyncedAt: connection.lastSyncedAt, validUntil: connection.validUntil })) });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing connection id." }, { status: 400 });
  const database = await getDatabase();
  if (database) {
    const { ObjectId } = await import("mongodb");
    let objectId;
    try { objectId = new ObjectId(id); } catch { return NextResponse.json({ error: "Invalid connection id." }, { status: 400 }); }
    const connection = await database.collection("bankConnections").findOne({ _id: objectId, ownerId: session.user.id, provider: "enablebanking" });
    if (!connection) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    try { await closeBankSession(String(connection.sessionId)); } catch (error) { console.error("Could not close remote bank session", error); }
    const accountIds = Array.isArray(connection.accounts) ? connection.accounts.map((account: { accountId: string }) => account.accountId) : [];
    if (accountIds.length) await database.collection("pendingBankTransactions").deleteMany({ ownerId: session.user.id, bankAccountId: { $in: accountIds } });
    await database.collection("bankConnections").deleteOne({ _id: objectId, ownerId: session.user.id });
  }
  return NextResponse.json({ ok: true });
}
