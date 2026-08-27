"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type AdminData = {
  users: { id: string; name: string; email: string; createdAt: string | null }[];
  admins: { email: string; isBootstrap: boolean }[];
  stats: { userCount: number; expenseCount: number; totalTracked: number; adminCount: number };
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function AdminPortal() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function loadData() {
    const response = await fetch("/api/admin", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load the admin portal.");
    setData(result);
  }

  useEffect(() => {
    fetch("/api/admin", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the admin portal.");
        return result;
      })
      .then(setData)
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  async function addAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "");
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Could not add administrator.");
    else { form.reset(); await loadData(); }
    setPending(false);
  }

  async function removeAdmin(email: string) {
    setPending(true);
    setError("");
    const response = await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Could not remove administrator.");
    else await loadData();
    setPending(false);
  }

  return <main className="admin-shell">
    <nav className="topbar"><div className="brand"><span className="brand-mark">+</span><span>ledgerly / admin</span></div><div className="admin-nav"><Link href="/">Normal dashboard</Link><button className="signout-button" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button></div></nav>
    <header className="admin-header"><div><p className="eyebrow">ADMIN PORTAL</p><h1>Control room.</h1></div><p>Manage access and review activity across Ledgerly.</p></header>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {!data ? <p className="auth-loading">Loading portal data...</p> : <>
      <section className="admin-stats">
        <article><span>Users</span><strong>{data.stats.userCount}</strong></article><article><span>Expenses</span><strong>{data.stats.expenseCount}</strong></article><article><span>Total tracked</span><strong>{money.format(data.stats.totalTracked)}</strong></article><article><span>Admins</span><strong>{data.stats.adminCount}</strong></article>
      </section>
      <section className="admin-grid">
        <div className="admin-panel"><div className="section-heading"><div><p className="eyebrow">Directory</p><h2>Users</h2></div><span className="admin-count">Latest {data.users.length}</span></div><div className="admin-list">{data.users.map((user) => <div className="admin-row" key={user.id}><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div><time>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</time></div>)}</div></div>
        <aside className="admin-panel admin-access"><p className="eyebrow">Permissions</p><h2>Administrators</h2><form onSubmit={addAdmin}><label>Email address<input type="email" name="email" placeholder="admin@example.com" required /></label><button className="submit-button" disabled={pending}>Add administrator <span>+</span></button></form><div className="admin-list">{data.admins.map((admin) => <div className="admin-row" key={admin.email}><div><strong>{admin.email}</strong><small>{admin.isBootstrap ? "Primary admin" : "Granted access"}</small></div>{!admin.isBootstrap && <button className="remove-admin" disabled={pending} onClick={() => removeAdmin(admin.email)}>Remove</button>}</div>)}</div></aside>
      </section>
    </>}
  </main>;
}
