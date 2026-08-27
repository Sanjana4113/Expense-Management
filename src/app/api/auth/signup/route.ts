import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";

type SignupInput = {
  username?: unknown;
  email?: unknown;
  password?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as SignupInput | null;
  const username = typeof input?.username === "string" ? input.username.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input?.password === "string" ? input.password : "";

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Username must be 3–24 characters using letters, numbers, or underscores." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "Password must be at least 8 characters and include a letter and number." }, { status: 400 });
  }

  const database = await getDatabase();
  if (!database) {
    return NextResponse.json({ error: "Email signup requires MongoDB. Add MONGODB_URI to your environment." }, { status: 503 });
  }

  const users = database.collection("users");
  const usernameNormalized = username.toLowerCase();
  const existingUser = await users.findOne({
    $or: [{ email }, { usernameNormalized }],
  });

  if (existingUser) {
    const field = existingUser.email === email ? "email" : "username";
    return NextResponse.json({ error: `An account with that ${field} already exists.` }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  await users.insertOne({
    name: username,
    username,
    usernameNormalized,
    email,
    emailVerified: null,
    image: null,
    passwordHash,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
