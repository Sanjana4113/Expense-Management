import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";

type ExpenseInput = { title: string; category: string; amount: number; date: string };
const localExpenses: (ExpenseInput & { _id: string })[] = [
  { _id: "1", title: "Weekly groceries", category: "Food", amount: 84.32, date: "2026-08-26" },
  { _id: "2", title: "Metro pass", category: "Transport", amount: 42, date: "2026-08-24" },
  { _id: "3", title: "Desk lamp", category: "Home", amount: 38.5, date: "2026-08-21" },
  { _id: "4", title: "Client lunch", category: "Work", amount: 64.8, date: "2026-08-18" },
];

export async function GET() {
  try {
    const database = await getDatabase();
    if (!database) return NextResponse.json({ expenses: localExpenses });
    const expenses = await database.collection("expenses").find().sort({ date: -1 }).toArray();
    return NextResponse.json({ expenses });
  } catch (error) {
    console.error("Failed to load expenses", error);
    return NextResponse.json({ error: "Could not connect to MongoDB. Check your .env.local settings." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const input = (await request.json()) as ExpenseInput;
  if (!input.title || !input.category || !input.date || !Number.isFinite(input.amount) || input.amount <= 0) {
    return NextResponse.json({ error: "Invalid expense" }, { status: 400 });
  }
  try {
    const database = await getDatabase();
    if (!database) {
      const expense = { ...input, _id: crypto.randomUUID() };
      localExpenses.unshift(expense);
      return NextResponse.json({ expense }, { status: 201 });
    }
    const result = await database.collection("expenses").insertOne(input);
    return NextResponse.json({ expense: { ...input, _id: result.insertedId.toString() } }, { status: 201 });
  } catch (error) {
    console.error("Failed to add expense", error);
    return NextResponse.json({ error: "Could not save expense. Check your MongoDB connection." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const database = await getDatabase();
    if (!database) {
      const index = localExpenses.findIndex((expense) => expense._id === id);
      if (index >= 0) localExpenses.splice(index, 1);
      return NextResponse.json({ ok: true });
    }
    const { ObjectId } = await import("mongodb");
    await database.collection("expenses").deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete expense", error);
    return NextResponse.json({ error: "Could not delete expense." }, { status: 503 });
  }
}