import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import AdminPortal from "./portal";

export default async function AdminPage() {
  if (!(await getAdminSession())) redirect("/");
  return <AdminPortal />;
}
