import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { type BankConnection, syncBankConnection } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const database = await getDatabase();
  if (!database) return NextResponse.json({ error: "MongoDB is required for bank syncing." }, { status: 503 });
  const connection = await database.collection<BankConnection>("bankConnections").findOne({ ownerId: session.user.id, provider: "truelayer" });
  if (!connection) return NextResponse.json({ error: "Connect a bank account first." }, { status: 404 });
  try {
    const imported = await syncBankConnection(database, connection);
    return NextResponse.json({ imported, syncedAt: new Date() });
  } catch (error) {
    console.error("Bank sync failed", error);
    await database.collection("bankConnections").updateOne({ ownerId: session.user.id, provider: "truelayer" }, { $set: { status: "reauthorization_required", updatedAt: new Date() } });
    return NextResponse.json({ error: "The bank connection needs to be authorized again." }, { status: 502 });
  }
}
