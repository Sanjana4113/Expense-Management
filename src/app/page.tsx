"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Expense = {
  _id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
};

const categories = ["Food", "Transport", "Home", "Work", "Health", "Other"];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState("All");
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [adminChoiceDismissed, setAdminChoiceDismissed] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null);
  const [incomeInput, setIncomeInput] = useState("");
  const [incomeStatus, setIncomeStatus] = useState("");
  const [editingIncome, setEditingIncome] = useState(false);
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/expenses")
      .then((response) => response.json())
      .then((data: { expenses?: Expense[] }) => setExpenses(data.expenses || []))
      .catch(() => undefined);
    fetch("/api/admin/access")
      .then((response) => response.json())
      .then((data: { isAdmin?: boolean }) => setHasAdminAccess(Boolean(data.isAdmin)))
      .catch(() => undefined);
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { monthlyIncome?: number | null }) => {
        if (typeof data.monthlyIncome === "number") {
          setMonthlyIncome(data.monthlyIncome);
          setIncomeInput(String(data.monthlyIncome));
        }
      })
      .catch(() => undefined);
  }, [sessionStatus]);

  const filteredExpenses = useMemo(
    () => filter === "All" ? expenses : expenses.filter((expense) => expense.category === filter),
    [expenses, filter],
  );
  const visibleExpenses = showAll ? filteredExpenses : filteredExpenses.slice(0, 5);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = expenses.filter((expense) => expense.date.startsWith(currentMonthKey)).reduce((sum, expense) => sum + expense.amount, 0);
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: month.toLocaleDateString("en-US", { month: "short" }), amount: expenses.filter((expense) => expense.date.startsWith(key)).reduce((sum, expense) => sum + expense.amount, 0) };
  });
  const maxMonthlyAmount = Math.max(...monthlyTrend.map((item) => item.amount), 1);
  const monthlySavings = monthlyIncome === null ? null : monthlyIncome - thisMonth;
  const monthCategoryTotals = categories
    .map((name) => ({ name, amount: expenses.filter((expense) => expense.category === name && expense.date.startsWith(currentMonthKey)).reduce((sum, expense) => sum + expense.amount, 0) }))
    .sort((a, b) => b.amount - a.amount);
  const flowCategories = monthCategoryTotals.slice(0, 4);
  const futureExpenses = expenses.filter((expense) => new Date(`${expense.date}T23:59:59`) > now).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const monthProgress = Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100);

  async function saveIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(incomeInput);
    if (!Number.isFinite(value) || value < 0) return setIncomeStatus("Enter a valid income.");
    const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthlyIncome: value }) });
    const data = await response.json();
    if (!response.ok) return setIncomeStatus(data.error || "Could not save income.");
    setMonthlyIncome(data.monthlyIncome);
    setEditingIncome(false);
    setIncomeStatus("Income updated");
    setTimeout(() => setIncomeStatus(""), 2000);
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !amount || Number(amount) <= 0) return;
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), amount: Number(amount), category, date }),
    });
    const data = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (response.ok) {
      setExpenses((current) => [data.expense, ...current]);
      setTitle("");
      setAmount("");
      setStatus("Expense added");
      setShowQuickEntry(false);
      setTimeout(() => setStatus(""), 2000);
    } else {
      setStatus(data.error || "Could not add expense");
    }
  }

  async function removeExpense(id: string) {
    const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    if (response.ok) setExpenses((current) => current.filter((expense) => expense._id !== id));
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthPending(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");

    try {
      if (authMode === "signup") {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.get("username"),
            email: form.get("email"),
            password,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setAuthError(data.error || "Could not create your account.");
          return;
        }
      }

      const identifier = authMode === "signup" ? String(form.get("email") || "") : String(form.get("identifier") || "");
      const result = await signIn("credentials", { identifier, password, redirect: false });
      if (result?.error) {
        setAuthError("The email, username, or password is incorrect.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setAuthError("Something went wrong. Please try again.");
    } finally {
      setAuthPending(false);
    }
  }

  if (sessionStatus === "loading") return <main className="auth-shell"><p className="eyebrow">LEDGERLY</p><p className="auth-loading">Loading your ledger...</p></main>;
  if (!session) return (
    <main className="auth-shell">
      <div className="auth-brand"><span className="brand-mark">+</span><span>ledgerly</span></div>
      <div className="auth-card">
        <p className="eyebrow">PERSONAL FINANCE</p>
        <h1>Know where<br /><em>it goes.</em></h1>
        <p className="auth-copy">{authMode === "login" ? "Sign in to keep your expenses private and available wherever you are." : "Create an account and start building a clearer view of your spending."}</p>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button className={authMode === "login" ? "auth-tab active" : "auth-tab"} type="button" onClick={() => { setAuthMode("login"); setAuthError(""); }}>Log in</button>
          <button className={authMode === "signup" ? "auth-tab active" : "auth-tab"} type="button" onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Sign up</button>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {authMode === "signup" && <label>Username<input name="username" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" placeholder="your_username" required /></label>}
          {authMode === "login" ? <label>Email or username<input name="identifier" autoComplete="username" placeholder="you@example.com" required /></label> : <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>}
          <label>Password<input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} placeholder="At least 8 characters" required /></label>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <button className="auth-submit" type="submit" disabled={authPending}>{authPending ? "Please wait…" : authMode === "login" ? "Log in" : "Create account"}<span>↗</span></button>
        </form>
        <div className="auth-divider"><span>or</span></div>
        <button className="google-button" type="button" onClick={() => signIn("google", { callbackUrl: "/" })}><span className="google-g">G</span>Continue with Google <span>↗</span></button>
        <p className="auth-legal">By continuing, you agree to use Ledgerly for personal budgeting.</p>
      </div>
    </main>
  );

  return (
    <main className="flow-shell">
      <nav className="flow-nav">
        <div className="flow-logo">ledgerly<span /></div>
        <div className="flow-links"><button className="active">Overview</button><button onClick={() => document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" })}>Activity</button><button onClick={() => setEditingIncome(true)}>Planning</button>{hasAdminAccess && <button onClick={() => router.push("/admin")}>Admin</button>}</div>
        <div className="flow-actions"><span className="flow-month">▣ {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span><button className="flow-avatar" aria-label="Account menu" title={session.user.email || "Account"}>{session.user.name?.slice(0, 2).toUpperCase() || "ME"}</button><button className="flow-add" onClick={() => setShowQuickEntry(true)}>Add expense <b>+</b></button><button className="flow-signout" onClick={() => signOut({ callbackUrl: "/" })}>↗</button></div>
      </nav>

      {hasAdminAccess && !adminChoiceDismissed && <section className="flow-admin-choice"><span>You have administrator access.</span><button onClick={() => setAdminChoiceDismissed(true)}>Stay here</button><button onClick={() => router.push("/admin")}>Open admin portal ↗</button></section>}

      <section className="flow-dashboard">
        <aside className="month-rail">
          <div><span>{now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span><small>{new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()} days left</small></div>
          <div className="progress-ring" style={{ "--progress": `${monthProgress * 3.6}deg` } as React.CSSProperties}><strong>{monthProgress}%</strong><span>of month</span></div>
          <div className="rail-metric"><span>Income</span><strong>{monthlyIncome === null ? "Not set" : money.format(monthlyIncome)}</strong><i style={{ width: monthlyIncome === null ? "0%" : "100%" }} /></div>
          <div className="rail-metric spent"><span>Spent</span><strong>{money.format(thisMonth)}</strong><i style={{ width: `${monthlyIncome ? Math.min((thisMonth / monthlyIncome) * 100, 100) : 0}%` }} /></div>
          <div className="rail-metric saved"><span>Saved</span><strong>{monthlySavings === null ? "—" : money.format(monthlySavings)}</strong><i style={{ width: `${monthlyIncome && monthlySavings ? Math.max(Math.min((monthlySavings / monthlyIncome) * 100, 100), 0) : 0}%` }} /></div>
          <button className="rail-button" onClick={() => setEditingIncome(true)}>{monthlyIncome === null ? "Set monthly income" : "Update income"} <span>›</span></button>
        </aside>

        <section className="money-flow-card">
          <div className="flow-card-title"><h1>Money flow</h1><span title="Income compared with this month's expenses">i</span></div>
          <div className="flow-visual">
            <div className="income-node"><strong>{monthlyIncome === null ? "Set income" : money.format(monthlyIncome)}</strong><span>Monthly income</span></div>
            <svg className="flow-lines" viewBox="0 0 760 390" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="spentFlow"><stop stopColor="#fff" stopOpacity=".8"/><stop offset="1" stopColor="#ff7168"/></linearGradient><linearGradient id="savedFlow"><stop stopColor="#fff" stopOpacity=".6"/><stop offset="1" stopColor="#356cff"/></linearGradient></defs>
              <path className="flow-path spent-path" d="M120 195 C310 195 350 75 650 75"/><path className="flow-path saved-path" d="M120 195 C330 195 390 185 650 190"/>
              <path className="branch-path" d="M245 195 C285 225 230 285 190 320"/><path className="branch-path" d="M265 195 C335 225 335 275 330 320"/><path className="branch-path" d="M290 195 C385 220 430 270 470 320"/><path className="branch-path" d="M315 195 C430 215 545 260 610 320"/>
            </svg>
            <div className="flow-output spent-output"><strong>{money.format(thisMonth)}</strong><span>Spent</span><small>{monthlyIncome ? Math.round((thisMonth / monthlyIncome) * 100) : 0}%</small></div>
            <div className="flow-output saved-output"><strong>{monthlySavings === null ? "—" : money.format(monthlySavings)}</strong><span>{monthlySavings !== null && monthlySavings < 0 ? "Over budget" : "Saved"}</span><small>{monthlyIncome && monthlySavings ? Math.round((monthlySavings / monthlyIncome) * 100) : 0}%</small></div>
            <div className="flow-category-row">{flowCategories.map((item) => <div className={`flow-category ${item.name.toLowerCase()}`} key={item.name}><span>{item.name.slice(0, 1)}</span><strong>{item.name}</strong><small>{money.format(item.amount)}</small><i style={{ width: `${thisMonth ? (item.amount / thisMonth) * 100 : 0}%` }} /></div>)}</div>
          </div>
        </section>

        <aside className="upcoming-rail"><div className="upcoming-title"><h2>Upcoming</h2><span>Next entries</span></div>{futureExpenses.length ? futureExpenses.map((expense) => <div className="upcoming-item" key={expense._id}><span className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</span><div><strong>{expense.title}</strong><small>{new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><b>{money.format(expense.amount)}</b></div>) : <div className="upcoming-empty"><span>✓</span><strong>Nothing scheduled</strong><small>Future-dated expenses appear here.</small></div>}<button className="rail-button" onClick={() => setShowQuickEntry(true)}>Schedule expense <span>›</span></button></aside>
      </section>

      {(monthlyIncome === null || editingIncome) && <section className="flow-income-prompt"><div><span>Monthly planning</span><h2>What is your monthly income?</h2><p>This lets Ledgerly calculate what remains after your expenses.</p></div><form onSubmit={saveIncome}><label>Monthly income<div className="amount-input"><span>$</span><input type="number" min="0" step="0.01" value={incomeInput} onChange={(event) => setIncomeInput(event.target.value)} placeholder="0.00" required /></div></label><button className="flow-add">Save income</button>{editingIncome && monthlyIncome !== null && <button type="button" className="prompt-cancel" onClick={() => setEditingIncome(false)}>Cancel</button>}{incomeStatus && <p>{incomeStatus}</p>}</form></section>}

      <section className="activity-board" id="activity">
        <div className="activity-side"><span>Recent activity</span><h2>{expenses.length} entries</h2><div className="filters">{["All", ...categories].map((item) => <button key={item} className={filter === item ? "filter active" : "filter"} onClick={() => { setFilter(item); setShowAll(false); }}>{item}</button>)}</div></div>
        <div className="activity-list">{visibleExpenses.length ? visibleExpenses.map((expense) => <article className="activity-tile" key={expense._id}><div className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</div><div><strong>{expense.title}</strong><small>{expense.category} · {new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><b>{money.format(expense.amount)}</b><button aria-label={`Delete ${expense.title}`} onClick={() => removeExpense(expense._id)}>×</button></article>) : <p className="empty-state">No expenses in this category yet.</p>}{filteredExpenses.length > 5 && <button className="view-more" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show fewer" : "View all expenses"} ↗</button>}</div>
        <div className="mini-trend"><span>6-month overview</span><div>{monthlyTrend.map((item) => <div className="mini-column" key={item.key}><strong>{item.amount ? money.format(item.amount) : "—"}</strong><i style={{ height: `${Math.max((item.amount / maxMonthlyAmount) * 100, item.amount ? 8 : 2)}%` }} /><small>{item.label}</small></div>)}</div></div>
      </section>

      {showQuickEntry && <div className="entry-backdrop" role="presentation" onMouseDown={() => setShowQuickEntry(false)}><aside className="entry-drawer" role="dialog" aria-modal="true" aria-label="Add expense" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setShowQuickEntry(false)}>×</button><span>Quick entry</span><h2>Add expense</h2><form onSubmit={addExpense}><label>Description<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What did you spend on?" required /></label><div className="form-split"><label>Amount<div className="amount-input"><span>$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><button className="flow-add" type="submit">Add to ledger <b>+</b></button>{status && <p className="form-status">{status}</p>}</form></aside></div>}
    </main>
  );
}
