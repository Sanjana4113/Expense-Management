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
    if (!database) return NextResponse.json({ expenses: localExpenses.filter((expense) => expense.ownerId === ownerId), pendingExpenses: [] });
    const [expenses, pendingExpenses] = await Promise.all([
      database.collection("expenses").find({ ownerId }).sort({ date: -1 }).toArray(),
      database.collection("pendingBankTransactions").find({ ownerId }).sort({ date: -1 }).toArray(),
    ]);
    return NextResponse.json({ expenses, pendingExpenses });
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
  
  // Check for bulk delete (JSON body with ids array)
  let ids: string[] = [];
  try {
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const body = (await request.json()) as { ids?: string[] };
      ids = body.ids || [];
    }
  } catch {
    // Not JSON, continue with query param
  }

  // Fall back to query parameter for single delete
  if (ids.length === 0) {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id or ids" }, { status: 400 });
    ids = [id];
  }

  try {
    const database = await getDatabase();
    if (!database) {
      // Local fallback
      for (const id of ids) {
        const index = localExpenses.findIndex((expense) => expense._id === id && expense.ownerId === ownerId);
        if (index >= 0) localExpenses.splice(index, 1);
      }
      return NextResponse.json({ deleted: ids.length });
    }

    const { ObjectId } = await import("mongodb");
    const objectIds = ids
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((id) => id !== null);

    if (objectIds.length === 0) return NextResponse.json({ deleted: 0 });

    const result = await database.collection("expenses").deleteMany({ _id: { $in: objectIds }, ownerId });
    return NextResponse.json({ deleted: result.deletedCount });
  } catch (error) {
    console.error("Failed to delete expenses", error);
    return NextResponse.json({ error: "Could not delete expenses." }, { status: 503 });
  }
}
