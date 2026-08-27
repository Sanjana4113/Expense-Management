import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth";
import { bankIntegrationConfigured } from "@/lib/banking";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const database = await getDatabase();
  if (!database) return NextResponse.json({ configured: bankIntegrationConfigured(), connections: [] });
  const connections = await database.collection("bankConnections").find({ ownerId: session.user.id }).project({ accessToken: 0, refreshToken: 0 }).toArray();
  return NextResponse.json({ configured: bankIntegrationConfigured(), connections });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const database = await getDatabase();
  if (database) await database.collection("bankConnections").deleteMany({ ownerId: session.user.id });
  return NextResponse.json({ ok: true });
}
