import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";

export async function GET() {
  return NextResponse.json({ isAdmin: Boolean(await getAdminSession()) });
}
