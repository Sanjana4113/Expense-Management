import { NextResponse } from "next/server";
import { BOOTSTRAP_ADMIN_EMAILS, getAdminSession, isBootstrapAdmin, normalizeEmail } from "@/lib/admin";
import { getDatabase } from "@/lib/mongodb";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authorizedDatabase() {
  const admin = await getAdminSession();
  if (!admin) return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  const database = await getDatabase();
  if (!database) return { error: NextResponse.json({ error: "The admin portal requires MongoDB." }, { status: 503 }) };
  return { admin, database };
}

export async function GET() {
  const context = await authorizedDatabase();
  if (context.error) return context.error;
  const { database } = context;

  const [users, userCount, expenseSummary, storedAdmins] = await Promise.all([
    database.collection("users").find({}, { projection: { name: 1, username: 1, email: 1, image: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray(),
    database.collection("users").countDocuments(),
    database.collection("expenses").aggregate<{ expenseCount: number; totalTracked: number }>([
      { $group: { _id: null, expenseCount: { $sum: 1 }, totalTracked: { $sum: "$amount" } } },
    ]).next(),
    database.collection("admins").find({}).sort({ createdAt: 1 }).toArray(),
  ]);

  const admins = [
    ...BOOTSTRAP_ADMIN_EMAILS.map((email) => ({ email, isBootstrap: true })),
    ...storedAdmins
      .filter((admin) => typeof admin.email === "string" && !isBootstrapAdmin(admin.email))
      .map((admin) => ({ email: admin.email as string, isBootstrap: false })),
  ];

  return NextResponse.json({
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name || user.username || "Unnamed user",
      email: user.email || "No email",
      createdAt: user.createdAt || null,
    })),
    admins,
    stats: {
      userCount,
      expenseCount: expenseSummary?.expenseCount || 0,
      totalTracked: expenseSummary?.totalTracked || 0,
      adminCount: admins.length,
    },
  });
}

export async function POST(request: Request) {
  const context = await authorizedDatabase();
  if (context.error) return context.error;
  const input = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof input?.email === "string" ? normalizeEmail(input.email) : "";
  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  if (!isBootstrapAdmin(email)) {
    await context.database.collection("admins").updateOne(
      { email },
      { $setOnInsert: { email, createdAt: new Date(), createdBy: context.admin.email } },
      { upsert: true },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await authorizedDatabase();
  if (context.error) return context.error;
  const input = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof input?.email === "string" ? normalizeEmail(input.email) : "";
  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (isBootstrapAdmin(email)) return NextResponse.json({ error: "Primary administrators cannot be removed." }, { status: 400 });

  await context.database.collection("admins").deleteOne({ email });
  return NextResponse.json({ ok: true });
}
