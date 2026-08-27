import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getDatabase } from "@/lib/mongodb";

type ExpenseInput = { title: string; category: string; amount: number; date: string };
const localExpenses: (ExpenseInput & { _id: string; ownerId: string })[] = [];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const ownerId = session.user.id;
  try {
    const database = await getDatabase();
    if (!database) return NextResponse.json({ expenses: localExpenses.filter((expense) => expense.ownerId === ownerId) });
    const expenses = await database.collection("expenses").find({ ownerId }).sort({ date: -1 }).toArray();
    return NextResponse.json({ expenses });
  } catch (error) {
    console.error("Failed to load expenses", error);
    return NextResponse.json({ error: "Could not connect to MongoDB. Check your .env.local settings." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const ownerId = session.user.id;
  const input = (await request.json()) as ExpenseInput;
  if (!input.title || !input.category || !input.date || !Number.isFinite(input.amount) || input.amount <= 0) {
    return NextResponse.json({ error: "Invalid expense" }, { status: 400 });
  }
  try {
    const database = await getDatabase();
    if (!database) {
      const expense = { ...input, _id: crypto.randomUUID(), ownerId };
      localExpenses.unshift(expense);
      return NextResponse.json({ expense }, { status: 201 });
    }
    const result = await database.collection("expenses").insertOne({ ...input, ownerId });
    return NextResponse.json({ expense: { ...input, _id: result.insertedId.toString() } }, { status: 201 });
  } catch (error) {
    console.error("Failed to add expense", error);
    return NextResponse.json({ error: "Could not save expense. Check your MongoDB connection." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const ownerId = session.user.id;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const database = await getDatabase();
    if (!database) {
      const index = localExpenses.findIndex((expense) => expense._id === id && expense.ownerId === ownerId);
      if (index >= 0) localExpenses.splice(index, 1);
      return NextResponse.json({ ok: true });
    }
    const { ObjectId } = await import("mongodb");
    await database.collection("expenses").deleteOne({ _id: new ObjectId(id), ownerId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete expense", error);
    return NextResponse.json({ error: "Could not delete expense." }, { status: 503 });
  }
}