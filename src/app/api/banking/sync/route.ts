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
  const connections = await database.collection<BankConnection>("bankConnections").find({ ownerId: session.user.id, provider: "enablebanking" }).toArray();
  if (!connections.length) return NextResponse.json({ error: "Connect a bank account first." }, { status: 404 });
  try {
    let imported = 0;
    for (const connection of connections) imported += await syncBankConnection(database, connection);
    return NextResponse.json({ imported, syncedAt: new Date() });
  } catch (error) {
    console.error("Bank sync failed", error);
    return NextResponse.json({ error: "Could not synchronize one or more bank accounts. Reconnect any expired account." }, { status: 502 });
  }
}
