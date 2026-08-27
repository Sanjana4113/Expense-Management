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

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  const [activityYear, setActivityYear] = useState(new Date().getFullYear());

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
  const currentYear = now.getFullYear();
  const todayKey = dateKey(now);
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
  const incomeForFlow = monthlyIncome || 0;
  const spentPercent = incomeForFlow > 0 ? Math.min((thisMonth / incomeForFlow) * 100, 100) : thisMonth > 0 ? 100 : 0;
  const remainingPercent = Math.max(100 - spentPercent, 0);
  const isOverBudget = incomeForFlow > 0 && thisMonth > incomeForFlow;
  const activityYears = Array.from(new Set([currentYear, ...expenses.map((expense) => Number(expense.date.slice(0, 4))).filter(Number.isFinite)])).sort((a, b) => b - a);
  const calendarData = (() => {
    const daily = new Map<string, { amount: number; count: number }>();
    expenses.filter((expense) => expense.date.startsWith(`${activityYear}-`)).forEach((expense) => {
      const current = daily.get(expense.date) || { amount: 0, count: 0 };
      daily.set(expense.date, { amount: current.amount + expense.amount, count: current.count + 1 });
    });

    const amounts = [...daily.values()].map((day) => day.amount).sort((a, b) => a - b);
    const quartile = (position: number) => amounts[Math.floor((amounts.length - 1) * position)] || 0;
    const thresholds = [quartile(.25), quartile(.5), quartile(.75)];
    const firstDay = new Date(activityYear, 0, 1);
    const lastDay = new Date(activityYear, 11, 31);
    const cells: ({ key: string; date: Date; amount: number; count: number; level: number } | null)[] = Array(firstDay.getDay()).fill(null);
    for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
      const key = dateKey(day);
      const value = daily.get(key) || { amount: 0, count: 0 };
      const level = value.amount === 0 ? 0 : value.amount <= thresholds[0] ? 1 : value.amount <= thresholds[1] ? 2 : value.amount <= thresholds[2] ? 3 : 4;
      cells.push({ key, date: new Date(day), ...value, level });
    }
    while (cells.length % 7) cells.push(null);

    const months = Array.from({ length: 12 }, (_, month) => {
      const day = new Date(activityYear, month, 1);
      const dayOfYear = Math.floor((day.getTime() - firstDay.getTime()) / 86_400_000);
      return { label: day.toLocaleDateString("en-US", { month: "short" }), week: Math.floor((firstDay.getDay() + dayOfYear) / 7) + 1 };
    });
    const weekdayCounts = Array(7).fill(0) as number[];
    daily.forEach((value, key) => { weekdayCounts[new Date(`${key}T12:00:00`).getDay()] += value.count; });
    const mostActiveIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const highest = [...daily.values()].reduce((maximum, day) => Math.max(maximum, day.amount), 0);
    const streakEnd = activityYear === currentYear ? new Date(`${todayKey}T12:00:00`) : lastDay;
    let streak = 0;
    for (const day = new Date(streakEnd); daily.has(dateKey(day)); day.setDate(day.getDate() - 1)) streak += 1;

    return {
      cells,
      months,
      activeDays: daily.size,
      total: [...daily.values()].reduce((sum, day) => sum + day.amount, 0),
      mostActive: daily.size ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][mostActiveIndex] : "—",
      highest,
      streak,
    };
  })();

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
          <div className="flow-card-title"><div><h1>Money flow</h1><p>See exactly where this month&apos;s income is going.</p></div><span className="flow-period">{now.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span></div>
          <div className="balance-overview">
            <div className="balance-source"><span>Monthly income</span><strong>{monthlyIncome === null ? "Not set" : money.format(monthlyIncome)}</strong><button onClick={() => setEditingIncome(true)}>{monthlyIncome === null ? "Add income" : "Edit"}</button></div>
            <div className="balance-journey">
              <div className="journey-labels"><span>0</span><span>{monthlyIncome === null ? "Set income to compare" : money.format(monthlyIncome)}</span></div>
              <div className="journey-track" role="img" aria-label={`${spentPercent.toFixed(0)} percent spent and ${remainingPercent.toFixed(0)} percent remaining`}><i className="journey-spent" style={{ width: `${spentPercent}%` }} /><i className="journey-remaining" style={{ width: `${remainingPercent}%` }} /></div>
              <div className="journey-legend"><span><i />Spent {Math.round(spentPercent)}%</span><span><i />Remaining {Math.round(remainingPercent)}%</span></div>
              {isOverBudget && <p className="budget-warning">You are {money.format(thisMonth - incomeForFlow)} over this month&apos;s income.</p>}
            </div>
            <div className="balance-results"><div className="result-spent"><span>Spent</span><strong>{money.format(thisMonth)}</strong></div><div className={isOverBudget ? "result-saved negative" : "result-saved"}><span>{isOverBudget ? "Over budget" : "Remaining"}</span><strong>{monthlySavings === null ? "—" : money.format(Math.abs(monthlySavings))}</strong></div></div>
          </div>
          <div className="category-flow-heading"><div><span>Expense breakdown</span><strong>{flowCategories[0]?.amount ? `${flowCategories[0].name} is highest` : "No spending yet"}</strong></div><span>{expenses.filter((expense) => expense.date.startsWith(currentMonthKey)).length} transactions</span></div>
          <div className="flow-category-grid">{flowCategories.map((item, index) => <article className={`flow-category-card ${item.name.toLowerCase()}`} key={item.name}><div><span>{String(index + 1).padStart(2, "0")}</span><i>{item.name.slice(0, 1)}</i></div><strong>{item.name}</strong><b>{money.format(item.amount)}</b><div className="category-meter"><i style={{ width: `${thisMonth ? (item.amount / thisMonth) * 100 : 0}%` }} /></div><small>{thisMonth ? Math.round((item.amount / thisMonth) * 100) : 0}% of monthly spend</small></article>)}</div>
        </section>

        <aside className="upcoming-rail"><div className="upcoming-title"><h2>Upcoming</h2><span>Next entries</span></div>{futureExpenses.length ? futureExpenses.map((expense) => <div className="upcoming-item" key={expense._id}><span className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</span><div><strong>{expense.title}</strong><small>{new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><b>{money.format(expense.amount)}</b></div>) : <div className="upcoming-empty"><span>✓</span><strong>Nothing scheduled</strong><small>Future-dated expenses appear here.</small></div>}<button className="rail-button" onClick={() => setShowQuickEntry(true)}>Schedule expense <span>›</span></button></aside>
      </section>

      <section className="expense-activity-panel">
        <header className="heatmap-header"><div><h2>Expense activity</h2><p>Your spending, day by day</p></div><div><select aria-label="Activity year" value={activityYear} onChange={(event) => setActivityYear(Number(event.target.value))}>{activityYears.map((year) => <option key={year}>{year}</option>)}</select><span>{calendarData.activeDays} active days · {money.format(calendarData.total)} tracked</span></div></header>
        <div className="heatmap-scroll">
          <div className="heatmap-canvas">
            <div className="heatmap-months">{calendarData.months.map((month) => <span key={month.label} style={{ gridColumnStart: month.week }}>{month.label}</span>)}</div>
            <div className="heatmap-body"><div className="heatmap-weekdays"><span>Mon</span><span>Wed</span><span>Fri</span></div><div className="heatmap-grid">{calendarData.cells.map((cell, index) => cell ? <button key={cell.key} className={`heat-cell level-${cell.level}`} tabIndex={cell.count ? 0 : -1} aria-label={`${cell.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}: ${money.format(cell.amount)}, ${cell.count} expenses`} data-tooltip={`${cell.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${money.format(cell.amount)} · ${cell.count} expense${cell.count === 1 ? "" : "s"}`} /> : <span className="heat-cell spacer" key={`spacer-${index}`} />)}</div></div>
          </div>
        </div>
        <div className="heatmap-meta"><div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i className={`level-${level}`} key={level} />)}<span>More</span><small>Color intensity represents total spent that day</small></div></div>
        <div className="heatmap-insights"><div><i>☆</i><span>Most active: <strong>{calendarData.mostActive}</strong></span></div><div><i>↗</i><span>Highest day: <strong>{money.format(calendarData.highest)}</strong></span></div><div><i>♨</i><span>Current streak: <strong>{calendarData.streak} day{calendarData.streak === 1 ? "" : "s"}</strong></span></div></div>
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
