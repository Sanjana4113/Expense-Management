import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getDatabase } from "@/lib/mongodb";

export const BOOTSTRAP_ADMIN_EMAILS = [
  "sanjanabh2003@gmail.com",
  "indudhara2020@gmail.com",
] as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isBootstrapAdmin(email: string) {
  return BOOTSTRAP_ADMIN_EMAILS.includes(normalizeEmail(email) as (typeof BOOTSTRAP_ADMIN_EMAILS)[number]);
}

export async function getAdminSession() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ? normalizeEmail(session.user.email) : "";
  if (!email) return null;
  if (isBootstrapAdmin(email)) return { session, email, isBootstrap: true };

  const database = await getDatabase();
  if (!database) return null;
  const admin = await database.collection("admins").findOne({ email });
  return admin ? { session, email, isBootstrap: false } : null;
}
