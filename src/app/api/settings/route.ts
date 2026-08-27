import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getDatabase } from "@/lib/mongodb";

const localSettings = new Map<string, number>();

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const database = await getDatabase();
  if (!database) return NextResponse.json({ monthlyIncome: localSettings.get(session.user.id) ?? null });
  const settings = await database.collection("userSettings").findOne({ ownerId: session.user.id });
  return NextResponse.json({ monthlyIncome: typeof settings?.monthlyIncome === "number" ? settings.monthlyIncome : null });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const input = (await request.json().catch(() => null)) as { monthlyIncome?: unknown } | null;
  const monthlyIncome = input?.monthlyIncome;
  if (typeof monthlyIncome !== "number" || !Number.isFinite(monthlyIncome) || monthlyIncome < 0 || monthlyIncome > 1_000_000_000) {
    return NextResponse.json({ error: "Enter a valid monthly income." }, { status: 400 });
  }

  const database = await getDatabase();
  if (!database) localSettings.set(session.user.id, monthlyIncome);
  else await database.collection("userSettings").updateOne(
    { ownerId: session.user.id },
    { $set: { monthlyIncome, updatedAt: new Date() }, $setOnInsert: { ownerId: session.user.id } },
    { upsert: true },
  );
  return NextResponse.json({ monthlyIncome });
}
