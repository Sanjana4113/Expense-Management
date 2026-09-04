import { NextResponse } from "next/server";
import { type BankConnection, syncBankConnection } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = await getDatabase();
  if (!database) return NextResponse.json({ error: "MongoDB is required for bank syncing." }, { status: 503 });

  const connections = await database.collection<BankConnection>("bankConnections")
    .find({ provider: "enablebanking", status: "active" })
    .toArray();
  const startedAt = new Date();
  const results: { bankName: string; status: "synced" | "skipped" | "failed"; imported?: number }[] = [];

  for (const connection of connections) {
    const lastSyncedAt = connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : null;
    if (lastSyncedAt && startedAt.getTime() - lastSyncedAt.getTime() < 6 * 60 * 60_000) {
      results.push({ bankName: connection.bankName, status: "skipped" });
      continue;
    }

    try {
      const imported = await syncBankConnection(database, connection);
      results.push({ bankName: connection.bankName, status: "synced", imported });
    } catch (error) {
      console.error(`Scheduled bank sync failed for ${connection.bankName}`, error);
      results.push({ bankName: connection.bankName, status: "failed" });
    }
  }

  return NextResponse.json({
    checked: connections.length,
    synced: results.filter((result) => result.status === "synced").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    imported: results.reduce((total, result) => total + (result.imported || 0), 0),
    completedAt: new Date(),
  });
}
