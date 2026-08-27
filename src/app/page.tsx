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
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = expenses.filter((expense) => expense.date.startsWith(currentMonthKey)).reduce((sum, expense) => sum + expense.amount, 0);
  const categoryTotals = categories.map((name) => ({ name, amount: expenses.filter((expense) => expense.category === name).reduce((sum, expense) => sum + expense.amount, 0) }));
  const topCategory = categoryTotals.reduce((top, item) => item.amount > top.amount ? item : top, { name: "—", amount: 0 });
  const topCategoryPercent = total > 0 ? Math.round((topCategory.amount / total) * 100) : 0;
  const maxCategoryAmount = Math.max(...categoryTotals.map((item) => item.amount), 1);
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: month.toLocaleDateString("en-US", { month: "short" }), amount: expenses.filter((expense) => expense.date.startsWith(key)).reduce((sum, expense) => sum + expense.amount, 0) };
  });
  const maxMonthlyAmount = Math.max(...monthlyTrend.map((item) => item.amount), 1);
  const monthlySavings = monthlyIncome === null ? null : monthlyIncome - thisMonth;

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
    <main className="dashboard-shell">
      <nav className="topbar">
        <div className="brand"><span className="brand-mark">+</span><span>ledgerly</span></div>
        <div className="nav-meta"><span className="live-dot" /> Cloud synced {hasAdminAccess && <button className="admin-link" onClick={() => router.push("/admin")}>Admin portal</button>}<span className="avatar">{session.user.name?.slice(0, 2).toUpperCase() || "ME"}</span><button className="signout-button" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button></div>
      </nav>

      {hasAdminAccess && !adminChoiceDismissed && <section className="admin-choice"><div><p className="eyebrow">ADMIN ACCESS</p><strong>Choose where you want to work.</strong></div><div><button className="choice-secondary" type="button" onClick={() => setAdminChoiceDismissed(true)}>Continue normal flow</button><button className="choice-primary" type="button" onClick={() => router.push("/admin")}>Open admin portal <span>↗</span></button></div></section>}

      <section className="intro-row">
        <div><p className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h1>Know where<br /><em>it goes.</em></h1></div>
        <p className="intro-copy">A clear view of your spending,<br />so your money can do more.</p>
      </section>

      <section className="stats-grid">
        <article className="stat-card stat-dark"><span className="stat-label">Total tracked</span><strong>{money.format(total)}</strong><span className="stat-note">Across {expenses.length} expenses</span></article>
        <article className="stat-card"><span className="stat-label">This month</span><strong>{money.format(thisMonth)}</strong><span className="stat-note">{now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span></article>
        <article className="stat-card"><span className="stat-label">Top category</span><strong>{topCategory.name}</strong><span className="stat-note">{topCategoryPercent}% of total spend</span></article>
        <article className={`stat-card ${monthlySavings !== null && monthlySavings < 0 ? "savings-negative" : "savings-card"}`}><span className="stat-label">Monthly savings</span><strong>{monthlySavings === null ? "Set income" : money.format(monthlySavings)}</strong><button className="stat-action" onClick={() => setEditingIncome(true)}>{monthlyIncome === null ? "Tell us your monthly income" : "Update monthly income"} ↗</button></article>
      </section>

      {(monthlyIncome === null || editingIncome) && <section className="income-prompt"><div><p className="eyebrow">YOUR SAVINGS</p><h2>What is your monthly income?</h2><p>We’ll use it only to calculate your monthly savings. You can update it anytime.</p></div><form onSubmit={saveIncome}><label>Monthly income<div className="amount-input"><span>$</span><input type="number" min="0" step="0.01" value={incomeInput} onChange={(event) => setIncomeInput(event.target.value)} placeholder="0.00" required /></div></label><button className="submit-button">Save income <span>↗</span></button>{incomeStatus && <p className="form-status">{incomeStatus}</p>}</form></section>}

      <section className="charts-grid">
        <article className="chart-card"><div className="section-heading"><div><p className="eyebrow">Breakdown</p><h2>Spending by category</h2></div><span className="chart-total">{money.format(total)}</span></div><div className="category-chart">{categoryTotals.map((item) => <div className="category-bar-row" key={item.name}><span>{item.name}</span><div className="bar-track"><div className={`bar-fill ${item.name.toLowerCase()}`} style={{ width: `${(item.amount / maxCategoryAmount) * 100}%` }} /></div><strong>{money.format(item.amount)}</strong></div>)}</div></article>
        <article className="chart-card trend-card"><div className="section-heading"><div><p className="eyebrow">Trend</p><h2>Last six months</h2></div></div><div className="monthly-chart">{monthlyTrend.map((item) => <div className="month-column" key={item.key} title={`${item.label}: ${money.format(item.amount)}`}><span>{item.amount > 0 ? money.format(item.amount) : ""}</span><div className="month-bar" style={{ height: `${Math.max((item.amount / maxMonthlyAmount) * 100, item.amount > 0 ? 6 : 0)}%` }} /><small>{item.label}</small></div>)}</div></article>
      </section>

      <section className="content-grid">
        <div className="expenses-panel">
          <div className="section-heading"><div><p className="eyebrow">Your activity</p><h2>{showAll ? "All expenses" : "Recent expenses"}</h2></div>{filteredExpenses.length > 5 && <button className="text-button" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show less" : "View all"} <span>↗</span></button>}</div>
          <div className="filters">{["All", ...categories].map((item) => <button key={item} className={filter === item ? "filter active" : "filter"} onClick={() => { setFilter(item); setShowAll(false); }}>{item}</button>)}</div>
          <div className="expense-list">{visibleExpenses.length ? visibleExpenses.map((expense) => <div className="expense-row" key={expense._id}><div className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</div><div className="expense-info"><strong>{expense.title}</strong><span>{expense.category} · {new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div><strong className="expense-amount">{money.format(expense.amount)}</strong><button className="delete-button" aria-label={`Delete ${expense.title}`} onClick={() => removeExpense(expense._id)}>×</button></div>) : <p className="empty-state">No expenses in this category yet.</p>}</div>
        </div>
        <aside className="add-panel"><p className="eyebrow">Quick entry</p><h2>Add expense</h2><form onSubmit={addExpense}><label>Description<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What did you spend on?" required /></label><div className="form-split"><label>Amount<div className="amount-input"><span>$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><button className="submit-button" type="submit">Add to ledger <span>+</span></button>{status && <p className="form-status">{status}</p>}</form></aside>
      </section>
      <footer><span>LEDGERLY / PERSONAL FINANCE</span><span>Built for a clearer month.</span></footer>
    </main>
  );
}
