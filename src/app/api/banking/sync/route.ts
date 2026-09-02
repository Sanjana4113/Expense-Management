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
  const syncedAt = new Date();
  let imported = 0;
  const synced: { bankName: string; imported: number; skipped?: boolean }[] = [];
  const failures: { bankName: string; reason: string }[] = [];

  for (const connection of connections) {
    const lastSyncedAt = connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : null;
    if (lastSyncedAt && syncedAt.getTime() - lastSyncedAt.getTime() < 15 * 60_000) {
      synced.push({ bankName: connection.bankName, imported: 0, skipped: true });
      continue;
    }

    try {
      const bankImported = await syncBankConnection(database, connection);
      imported += bankImported;
      synced.push({ bankName: connection.bankName, imported: bankImported });
    } catch (error) {
      console.error(`Bank sync failed for ${connection.bankName}`, error);
      const message = error instanceof Error ? error.message : "";
      const reason = message.includes("(429)")
        ? "Daily bank access limit reached. Try again tomorrow; reconnection is not required."
        : message.includes("(401)") || message.includes("(403)")
          ? "Authorization needs to be renewed."
          : "Could not retrieve transactions right now.";
      failures.push({ bankName: connection.bankName, reason });
    }
  }

  if (!synced.length && failures.length) return NextResponse.json({ error: failures.map((failure) => `${failure.bankName}: ${failure.reason}`).join(" "), failures }, { status: 502 });
  return NextResponse.json({ imported, syncedAt, synced, failures });
}
