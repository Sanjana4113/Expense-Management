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
  source?: "bank";
};

type BankConnection = {
  _id: string;
  status: "active" | "reauthorization_required";
  bankName: string;
  bankCountry: string;
  accounts: { accountId: string; name: string; currency?: string }[];
  lastSyncedAt?: string;
};

type PendingExpense = Omit<Expense, "source"> & { currency?: string };

type BankingInstitution = { name: string; country: string; logo?: string };

const categories = ["Food", "Transport", "Home", "Work", "Health", "Other"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
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
  const [entryMode, setEntryMode] = useState<"add" | "schedule">("add");
  const [selectedMonth, setSelectedMonth] = useState(() => dateKey(new Date()).slice(0, 7));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerView, setMonthPickerView] = useState<"months" | "years">("months");
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [bankConfigured, setBankConfigured] = useState(false);
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([]);
  const [bankStatus, setBankStatus] = useState("");
  const [bankSyncing, setBankSyncing] = useState(false);
  const [bankConnectOpen, setBankConnectOpen] = useState(false);
  const [bankCountry, setBankCountry] = useState("DE");
  const [bankPsuType, setBankPsuType] = useState<"personal" | "business">("personal");
  const [bankInstitutions, setBankInstitutions] = useState<BankingInstitution[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [banksLoading, setBanksLoading] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const loadExpenses = () => fetch("/api/expenses")
      .then((response) => response.json())
      .then((data: { expenses?: Expense[]; pendingExpenses?: PendingExpense[] }) => {
        setExpenses(data.expenses || []);
        setPendingExpenses(data.pendingExpenses || []);
      });
    loadExpenses().catch(() => undefined);
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
    fetch("/api/banking/connections")
      .then((response) => response.json())
      .then((data: { configured?: boolean; connections?: BankConnection[] }) => {
        setBankConfigured(Boolean(data.configured));
        setBankConnections(data.connections || []);
      })
      .catch(() => undefined);
    const bankResult = new URLSearchParams(window.location.search).get("bank");
    if (bankResult) {
      queueMicrotask(() => setBankStatus(bankResult === "connected" ? "Account connected. Your purchases are ready to sync." : bankResult === "cancelled" ? "Bank connection was cancelled." : "The bank account could not be connected."));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [sessionStatus]);

  const selectedMonthExpenses = useMemo(
    () => expenses.filter((expense) => expense.date.startsWith(selectedMonth)),
    [expenses, selectedMonth],
  );
  const selectedMonthPending = useMemo(
    () => pendingExpenses.filter((expense) => expense.date.startsWith(selectedMonth)),
    [pendingExpenses, selectedMonth],
  );
  const filteredExpenses = useMemo(
    () => filter === "All" ? selectedMonthExpenses : selectedMonthExpenses.filter((expense) => expense.category === filter),
    [selectedMonthExpenses, filter],
  );
  const visibleExpenses = showAll ? filteredExpenses : filteredExpenses.slice(0, 5);
  const now = new Date();
  const todayKey = dateKey(now);
  const selectedMonthDate = new Date(`${selectedMonth}-01T12:00:00`);
  const selectedMonthLabel = selectedMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const currentYear = now.getFullYear();
  const availableYears = Array.from(new Set([
    ...Array.from({ length: 11 }, (_, index) => currentYear - index),
    currentYear + 1,
    ...expenses.map((expense) => Number(expense.date.slice(0, 4))).filter(Number.isFinite),
  ])).sort((a, b) => b - a);
  const thisMonth = selectedMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const pendingThisMonth = selectedMonthPending.reduce((sum, expense) => sum + expense.amount, 0);
  const monthlySavings = monthlyIncome === null ? null : monthlyIncome - thisMonth;
  const monthCategoryTotals = categories
    .map((name) => ({ name, amount: selectedMonthExpenses.filter((expense) => expense.category === name).reduce((sum, expense) => sum + expense.amount, 0) }))
    .sort((a, b) => b.amount - a.amount);
  const flowCategories = monthCategoryTotals.slice(0, 4);
  const futureExpenses = selectedMonthExpenses.filter((expense) => new Date(`${expense.date}T23:59:59`) > now).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const currentMonthKey = todayKey.slice(0, 7);
  const monthProgress = selectedMonth < currentMonthKey ? 100 : selectedMonth > currentMonthKey ? 0 : Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100);
  const monthTiming = selectedMonth < currentMonthKey ? "Completed month" : selectedMonth > currentMonthKey ? "Future month" : `${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()} days left`;
  const incomeForFlow = monthlyIncome || 0;
  const spentPercent = incomeForFlow > 0 ? Math.min((thisMonth / incomeForFlow) * 100, 100) : thisMonth > 0 ? 100 : 0;
  const remainingPercent = Math.max(100 - spentPercent, 0);
  const isOverBudget = incomeForFlow > 0 && thisMonth > incomeForFlow;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateKey(tomorrow);
  const calendarData = (() => {
    const daily = new Map<string, { amount: number; count: number }>();
    selectedMonthExpenses.forEach((expense) => {
      const current = daily.get(expense.date) || { amount: 0, count: 0 };
      daily.set(expense.date, { amount: current.amount + expense.amount, count: current.count + 1 });
    });

    const amounts = [...daily.values()].map((day) => day.amount).sort((a, b) => a - b);
    const quartile = (position: number) => amounts[Math.floor((amounts.length - 1) * position)] || 0;
    const thresholds = [quartile(.25), quartile(.5), quartile(.75)];
    const firstDay = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1);
    const lastDay = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0);
    const cells: ({ key: string; date: Date; amount: number; count: number; level: number } | null)[] = Array(firstDay.getDay()).fill(null);
    for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
      const key = dateKey(day);
      const value = daily.get(key) || { amount: 0, count: 0 };
      const level = value.amount === 0 ? 0 : value.amount <= thresholds[0] ? 1 : value.amount <= thresholds[1] ? 2 : value.amount <= thresholds[2] ? 3 : 4;
      cells.push({ key, date: new Date(day), ...value, level });
    }
    while (cells.length % 7) cells.push(null);

    const months = [{ label: selectedMonthDate.toLocaleDateString("en-US", { month: "short" }), week: 1 }];
    const weekdayCounts = Array(7).fill(0) as number[];
    daily.forEach((value, key) => { weekdayCounts[new Date(`${key}T12:00:00`).getDay()] += value.count; });
    const mostActiveIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const highest = [...daily.values()].reduce((maximum, day) => Math.max(maximum, day.amount), 0);
    const streakEnd = selectedMonth === currentMonthKey ? new Date(`${todayKey}T12:00:00`) : lastDay;
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
    if (entryMode === "schedule" && date < tomorrowKey) {
      setStatus("Choose a future date for a scheduled expense.");
      return;
    }
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
      setStatus(entryMode === "schedule" ? "Expense scheduled" : "Expense added");
      setShowQuickEntry(false);
      setTimeout(() => setStatus(""), 2000);
    } else {
      setStatus(data.error || "Could not add expense");
    }
  }

  function openExpenseEntry(mode: "add" | "schedule") {
    setEntryMode(mode);
    setStatus("");
    if (mode === "schedule") setDate(tomorrowKey);
    setShowQuickEntry(true);
  }

  async function removeExpense(id: string) {
    const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    if (response.ok) setExpenses((current) => current.filter((expense) => expense._id !== id));
  }

  function toggleExpenseSelection(id: string) {
    setSelectedExpenses((current) => {
      const updated = new Set(current);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  }

  function toggleSelectAll() {
    if (selectedExpenses.size === visibleExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(visibleExpenses.map((expense) => expense._id)));
    }
  }

  async function deleteSelectedExpenses() {
    if (selectedExpenses.size === 0) return;
    if (!window.confirm(`Delete ${selectedExpenses.size} expense${selectedExpenses.size === 1 ? "" : "s"}?`)) return;
    
    const ids = Array.from(selectedExpenses);
    const response = await fetch("/api/expenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await response.json();
    
    if (response.ok && data.deleted > 0) {
      setExpenses((current) => current.filter((expense) => !selectedExpenses.has(expense._id)));
      setSelectedExpenses(new Set());
      setStatus(`${data.deleted} expense${data.deleted === 1 ? "" : "s"} deleted`);
      setTimeout(() => setStatus(""), 2000);
    } else {
      setStatus(data.error || "Could not delete expenses");
    }
  }

  async function syncBank() {
    setBankSyncing(true);
    setBankStatus("");
    const response = await fetch("/api/banking/sync", { method: "POST" });
    const data = await response.json();
    if (!response.ok) setBankStatus(data.error || "Could not sync your bank account.");
    else {
      const syncResults = Array.isArray(data.synced) ? data.synced as { bankName: string; skipped?: boolean }[] : [];
      const allSkipped = syncResults.length > 0 && syncResults.every((item) => item.skipped);
      const failureMessage = Array.isArray(data.failures) && data.failures.length
        ? ` ${data.failures.map((failure: { bankName: string; reason: string }) => `${failure.bankName}: ${failure.reason}`).join(" ")}`
        : "";
      const successMessage = allSkipped
        ? "Your banks were synced recently. Wait 15 minutes before syncing again."
        : data.imported
          ? `${data.imported} new purchase${data.imported === 1 ? "" : "s"} imported.`
          : "Everything available is up to date.";
      setBankStatus(`${successMessage}${failureMessage}`);
      const expensesResponse = await fetch("/api/expenses");
      const expensesData = await expensesResponse.json();
      setExpenses(expensesData.expenses || []);
      setPendingExpenses(expensesData.pendingExpenses || []);
      const syncedBanks = new Set<string>(syncResults.filter((item) => !item.skipped).map((item) => item.bankName));
      setBankConnections((current) => current.map((connection) => syncedBanks.has(connection.bankName) ? { ...connection, lastSyncedAt: data.syncedAt } : connection));
    }
    setBankSyncing(false);
  }

  async function loadInstitutions(country = bankCountry, psuType = bankPsuType) {
    setBanksLoading(true);
    setBankStatus("");
    const response = await fetch(`/api/banking/institutions?country=${encodeURIComponent(country)}&psuType=${psuType}`);
    const data = await response.json();
    if (!response.ok) setBankStatus(data.error || "Could not load banks.");
    else {
      setBankInstitutions(data.institutions || []);
      setSelectedBank(data.institutions?.[0]?.name || "");
    }
    setBanksLoading(false);
  }

  async function openBankConnect() {
    setBankConnectOpen(true);
    if (!bankInstitutions.length) await loadInstitutions();
  }

  async function connectBank() {
    if (!selectedBank) return;
    setBanksLoading(true);
    const response = await fetch("/api/banking/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bankName: selectedBank, country: bankCountry, psuType: bankPsuType }) });
    const data = await response.json();
    if (response.ok && data.url) window.location.assign(data.url);
    else {
      setBankStatus(data.error || "Could not start the bank connection.");
      setBanksLoading(false);
    }
  }

  async function disconnectBank(id: string) {
    if (!window.confirm("Disconnect this bank? Imported expenses will stay in your ledger.")) return;
    const response = await fetch(`/api/banking/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setBankConnections((current) => current.filter((connection) => connection._id !== id));
      setBankStatus("Bank disconnected. Previously imported expenses were kept.");
    }
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
    <main className={`flow-shell theme-${theme}`}>
      <nav className="flow-nav">
        <div className="flow-logo">ledgerly<span /></div>
        <div className="flow-links"><button className="active">Overview</button><button onClick={() => document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" })}>Activity</button><button onClick={() => document.getElementById("connected-accounts")?.scrollIntoView({ behavior: "smooth" })}>Accounts</button><button onClick={() => setEditingIncome(true)}>Planning</button>{hasAdminAccess && <button onClick={() => router.push("/admin")}>Admin</button>}</div>
        <div className="flow-actions">
          <div className="month-picker">
            <button className="flow-month month-trigger" type="button" aria-haspopup="dialog" aria-expanded={monthPickerOpen} onClick={() => { setPickerYear(Number(selectedMonth.slice(0, 4))); setMonthPickerView("months"); setMonthPickerOpen((open) => !open); }}>
              <span>{selectedMonthLabel}</span><b>▾</b>
            </button>
            {monthPickerOpen && <div className="month-popover" role="dialog" aria-label="Choose month and year">
              <div className="month-picker-header">
                {monthPickerView === "months" && <button type="button" aria-label="Previous year" onClick={() => setPickerYear((year) => year - 1)}>‹</button>}
                <button className="year-switch" type="button" onClick={() => setMonthPickerView((view) => view === "months" ? "years" : "months")}>{pickerYear}</button>
                {monthPickerView === "months" && <button type="button" aria-label="Next year" onClick={() => setPickerYear((year) => year + 1)}>›</button>}
              </div>
              {monthPickerView === "months" ? <div className="month-grid">{monthNames.map((name, index) => {
                const month = String(index + 1).padStart(2, "0");
                const value = `${pickerYear}-${month}`;
                return <button type="button" className={selectedMonth === value ? "active" : ""} key={name} onClick={() => { setSelectedMonth(value); setShowAll(false); setSelectedExpenses(new Set()); setMonthPickerOpen(false); }}>{name.slice(0, 3)}</button>;
              })}</div> : <div className="year-grid">{availableYears.map((year) => <button type="button" className={pickerYear === year ? "active" : ""} key={year} onClick={() => { setPickerYear(year); setMonthPickerView("months"); }}>{year}</button>)}</div>}
            </div>}
          </div>
          <button className="theme-toggle" type="button" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}><span>{theme === "light" ? "☾" : "☀"}</span></button>
          <button className="flow-avatar" aria-label="Account menu" title={session.user.email || "Account"}>{session.user.name?.slice(0, 2).toUpperCase() || "ME"}</button>
          <button className="flow-add" onClick={() => openExpenseEntry("add")}>Add expense <b>+</b></button>
          <button className="flow-signout" onClick={() => signOut({ callbackUrl: "/" })}>↗</button>
        </div>
      </nav>

      {hasAdminAccess && !adminChoiceDismissed && <section className="flow-admin-choice"><span>You have administrator access.</span><button onClick={() => setAdminChoiceDismissed(true)}>Stay here</button><button onClick={() => router.push("/admin")}>Open admin portal ↗</button></section>}

      <section className="flow-dashboard">
        <aside className="month-rail">
          <div><span>{selectedMonthLabel}</span><small>{monthTiming}</small></div>
          <div className="progress-ring" style={{ "--progress": `${monthProgress * 3.6}deg` } as React.CSSProperties}><strong>{monthProgress}%</strong><span>of month</span></div>
          <div className="rail-metric"><span>Income</span><strong>{monthlyIncome === null ? "Not set" : money.format(monthlyIncome)}</strong><i style={{ width: monthlyIncome === null ? "0%" : "100%" }} /></div>
          <div className="rail-metric spent"><span>Spent</span><strong>{money.format(thisMonth)}</strong><i style={{ width: `${monthlyIncome ? Math.min((thisMonth / monthlyIncome) * 100, 100) : 0}%` }} /></div>
          <div className="rail-metric saved"><span>Saved</span><strong>{monthlySavings === null ? "—" : money.format(monthlySavings)}</strong><i style={{ width: `${monthlyIncome && monthlySavings ? Math.max(Math.min((monthlySavings / monthlyIncome) * 100, 100), 0) : 0}%` }} /></div>
          <button className="rail-button" onClick={() => setEditingIncome(true)}>{monthlyIncome === null ? "Set monthly income" : "Update income"} <span>›</span></button>
        </aside>

        <section className="money-flow-card">
          <div className="flow-card-title"><div><h1>Money flow</h1><p>See exactly where this month&apos;s income is going.</p></div><span className="flow-period">{selectedMonthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span></div>
          <div className="balance-overview">
            <div className="balance-source"><span>Monthly income</span><strong>{monthlyIncome === null ? "Not set" : money.format(monthlyIncome)}</strong><button onClick={() => setEditingIncome(true)}>{monthlyIncome === null ? "Add income" : "Edit"}</button></div>
            <div className="balance-journey">
              <div className="journey-labels"><span>0</span><span>{monthlyIncome === null ? "Set income to compare" : money.format(monthlyIncome)}</span></div>
              <div className="journey-track" role="img" aria-label={`${spentPercent.toFixed(0)} percent spent and ${remainingPercent.toFixed(0)} percent remaining`}><i className="journey-spent" style={{ width: `${spentPercent}%` }} /><i className="journey-remaining" style={{ width: `${remainingPercent}%` }} /></div>
              <div className="journey-legend"><span><i />Spent {Math.round(spentPercent)}%</span><span><i />Remaining {Math.round(remainingPercent)}%</span></div>
              {isOverBudget && <p className="budget-warning">You are {money.format(thisMonth - incomeForFlow)} over this month&apos;s income.</p>}
            </div>
            <div className="balance-results"><div className="result-spent"><span>Spent</span><strong>{money.format(thisMonth)}</strong></div><div className="result-pending"><span>Pending</span><strong>{money.format(pendingThisMonth)}</strong></div><div className={isOverBudget ? "result-saved negative" : "result-saved"}><span>{isOverBudget ? "Over budget" : "Remaining"}</span><strong>{monthlySavings === null ? "—" : money.format(Math.abs(monthlySavings))}</strong></div></div>
          </div>
          <div className="category-flow-heading"><div><span>Expense breakdown</span><strong>{flowCategories[0]?.amount ? `${flowCategories[0].name} is highest` : "No spending yet"}</strong></div><span>{selectedMonthExpenses.length} transactions</span></div>
          <div className="flow-category-grid">{flowCategories.map((item, index) => <article className={`flow-category-card ${item.name.toLowerCase()}`} key={item.name}><div><span>{String(index + 1).padStart(2, "0")}</span><i>{item.name.slice(0, 1)}</i></div><strong>{item.name}</strong><b>{money.format(item.amount)}</b><div className="category-meter"><i style={{ width: `${thisMonth ? (item.amount / thisMonth) * 100 : 0}%` }} /></div><small>{thisMonth ? Math.round((item.amount / thisMonth) * 100) : 0}% of monthly spend</small></article>)}</div>
        </section>

        <aside className="upcoming-rail"><div className="upcoming-title"><h2>Upcoming</h2><span>Next entries</span></div>{futureExpenses.length ? futureExpenses.map((expense) => <div className="upcoming-item" key={expense._id}><span className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</span><div><strong>{expense.title}</strong><small>{new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><b>{money.format(expense.amount)}</b></div>) : <div className="upcoming-empty"><span>✓</span><strong>Nothing scheduled</strong><small>Future-dated expenses appear here.</small></div>}<button className="rail-button" onClick={() => openExpenseEntry("schedule")}>Schedule expense <span>›</span></button></aside>
      </section>

      <section className="bank-panel" id="connected-accounts">
        <div className="bank-panel-copy"><span>Connected accounts</span><h2>Bring card purchases into your ledger.</h2><p>Connect through secure Open Banking consent. Ledgerly never receives your card number, PIN, or bank password.</p></div>
        {bankConnections.map((connection) => <div className="bank-connection" key={connection._id}>
          <div className="bank-mark">↗</div>
          <div><strong>{connection.bankName}</strong><span>{connection.accounts.length} account{connection.accounts.length === 1 ? "" : "s"} · {connection.bankCountry} · {connection.status === "active" ? "Connected" : "Reconnect required"}</span>{connection.lastSyncedAt && <small>Last synced {new Date(connection.lastSyncedAt).toLocaleString()}</small>}</div>
          <button className="bank-disconnect" type="button" onClick={() => disconnectBank(connection._id)}>Disconnect</button>
        </div>)}
        <div className="bank-connect-state"><div><strong>{bankConfigured ? (bankConnections.length ? "Connect another account" : "Connect your bank or card") : "Open Banking setup required"}</strong><span>{bankConfigured ? "Choose a country and bank, then approve read-only access through Enable Banking." : "Add your Enable Banking application ID and private key to enable connections."}</span></div>{bankConfigured ? <button className="bank-connect" type="button" onClick={openBankConnect}>Connect account <b>↗</b></button> : <span className="bank-disabled">Not configured</span>}{bankConnections.length > 0 && <button className="bank-sync" type="button" onClick={syncBank} disabled={bankSyncing}>{bankSyncing ? "Syncing…" : "Sync all"}</button>}</div>
        {bankConnectOpen && <div className="bank-picker"><div className="bank-picker-fields"><label>Country<select value={bankCountry} onChange={async (event) => { const value = event.target.value; setBankCountry(value); await loadInstitutions(value, bankPsuType); }}><option value="DE">Germany</option><option value="LT">Lithuania</option><option value="IE">Ireland</option><option value="AT">Austria</option><option value="NL">Netherlands</option><option value="FR">France</option><option value="ES">Spain</option><option value="IT">Italy</option><option value="GB">United Kingdom</option></select></label><label>Account type<select value={bankPsuType} onChange={async (event) => { const value = event.target.value as "personal" | "business"; setBankPsuType(value); await loadInstitutions(bankCountry, value); }}><option value="personal">Personal</option><option value="business">Business</option></select></label><label>Bank<select value={selectedBank} onChange={(event) => setSelectedBank(event.target.value)} disabled={banksLoading}>{banksLoading ? <option>Loading banks…</option> : bankInstitutions.map((institution) => <option key={`${institution.country}-${institution.name}`} value={institution.name}>{institution.name}</option>)}</select></label></div><div className="bank-picker-actions"><button type="button" className="bank-disconnect" onClick={() => setBankConnectOpen(false)}>Cancel</button><button type="button" className="bank-connect" onClick={connectBank} disabled={banksLoading || !selectedBank}>{banksLoading ? "Please wait…" : "Continue securely"}</button></div></div>}
        {bankStatus && <p className="bank-status" role="status">{bankStatus}</p>}
        <div className="bank-trust"><span>Read-only access</span><span>Encrypted connection</span><span>Duplicate protected</span><span>Automatic categories</span></div>
      </section>

      <section className="expense-activity-panel">
        <header className="heatmap-header"><div><h2>Expense activity</h2><p>Your spending in {selectedMonthLabel}, day by day</p></div><div><span>{calendarData.activeDays} active days · {money.format(calendarData.total)} tracked</span></div></header>
        <div className="heatmap-scroll">
          <div className="heatmap-canvas">
            <div className="heatmap-months">{calendarData.months.map((month) => <span key={month.label} style={{ gridColumnStart: month.week }}>{month.label}</span>)}</div>
            <div className="heatmap-body"><div className="heatmap-weekdays"><span>Mon</span><span>Wed</span><span>Fri</span></div><div className="heatmap-grid">{calendarData.cells.map((cell, index) => cell ? <button key={cell.key} className={`heat-cell level-${cell.level}`} tabIndex={cell.count ? 0 : -1} aria-label={`${cell.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}: ${money.format(cell.amount)}, ${cell.count} expenses`} data-tooltip={`${cell.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${money.format(cell.amount)} · ${cell.count} expense${cell.count === 1 ? "" : "s"}`} /> : <span className="heat-cell spacer" key={`spacer-${index}`} />)}</div></div>
          </div>
        </div>
        <div className="heatmap-meta"><div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i className={`level-${level}`} key={level} />)}<span>More</span><small>Color intensity represents total spent that day</small></div></div>
        <div className="heatmap-insights"><div><i>☆</i><span>Most active: <strong>{calendarData.mostActive}</strong></span></div><div><i>↗</i><span>Highest day: <strong>{money.format(calendarData.highest)}</strong></span></div><div><i>♨</i><span>Current streak: <strong>{calendarData.streak} day{calendarData.streak === 1 ? "" : "s"}</strong></span></div></div>
      </section>

      <section className="activity-board" id="activity">
        <div className="activity-side"><span>{selectedMonthLabel} activity</span><h2>{selectedMonthExpenses.length} entries</h2><div className="filters">{["All", ...categories].map((item) => <button key={item} className={filter === item ? "filter active" : "filter"} onClick={() => { setFilter(item); setShowAll(false); }}>{item}</button>)}</div>{visibleExpenses.length > 0 && <div className="bulk-actions"><label className="select-all-checkbox"><input type="checkbox" checked={selectedExpenses.size === visibleExpenses.length && visibleExpenses.length > 0} onChange={toggleSelectAll} /><span>Select all</span></label>{selectedExpenses.size > 0 && <button className="delete-selected" onClick={deleteSelectedExpenses}>Delete {selectedExpenses.size}</button>}</div>}</div>
        <div className="activity-list">{visibleExpenses.length ? visibleExpenses.map((expense) => <article className={`activity-tile ${selectedExpenses.has(expense._id) ? "selected" : ""}`} key={expense._id}><input type="checkbox" className="expense-checkbox" checked={selectedExpenses.has(expense._id)} onChange={() => toggleExpenseSelection(expense._id)} /><div className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</div><div><strong>{expense.title}{expense.source === "bank" && <span className="bank-source">Synced</span>}</strong><small>{expense.category} · {new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><b>{money.format(expense.amount)}</b><button aria-label={`Delete ${expense.title}`} onClick={() => removeExpense(expense._id)}>×</button></article>) : <p className="empty-state">No expenses in this category yet.</p>}{filteredExpenses.length > 5 && <button className="view-more" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show fewer" : "View all expenses"} ↗</button>}</div>
        <aside className="pending-panel"><span>Pending</span><h2>{money.format(pendingThisMonth)}</h2><p>Not included in confirmed spending</p>{selectedMonthPending.length ? <div>{selectedMonthPending.map((expense) => <article className="pending-tile" key={expense._id}><div><strong>{expense.title}</strong><small>{new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><b>{money.format(expense.amount)}</b><span>Pending</span></article>)}</div> : <p className="pending-empty">No pending card payments.</p>}</aside>
      </section>

      {editingIncome && <div className="entry-backdrop income-backdrop" role="presentation" onMouseDown={() => setEditingIncome(false)}><section className="income-modal" role="dialog" aria-modal="true" aria-labelledby="income-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setEditingIncome(false)}>×</button><span>Monthly planning</span><h2 id="income-modal-title">{monthlyIncome === null ? "Add monthly income" : "Update monthly income"}</h2><p>This lets Ledgerly calculate what remains after your monthly expenses.</p><form onSubmit={saveIncome}><label>Monthly income<div className="amount-input"><span>$</span><input autoFocus type="number" min="0" step="0.01" value={incomeInput} onChange={(event) => setIncomeInput(event.target.value)} placeholder="0.00" required /></div></label><button className="flow-add">Save income</button>{incomeStatus && <p className="form-status">{incomeStatus}</p>}</form></section></div>}
      {showQuickEntry && <div className="entry-backdrop" role="presentation" onMouseDown={() => setShowQuickEntry(false)}><aside className="entry-drawer" role="dialog" aria-modal="true" aria-label={entryMode === "schedule" ? "Schedule expense" : "Add expense"} onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setShowQuickEntry(false)}>×</button><span>{entryMode === "schedule" ? "Upcoming payment" : "Quick entry"}</span><h2>{entryMode === "schedule" ? "Schedule expense" : "Add expense"}</h2><form onSubmit={addExpense}><label>Description<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What will you spend on?" required /></label><div className="form-split"><label>Amount<div className="amount-input"><span>$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div></label><label>Date<input type="date" min={entryMode === "schedule" ? tomorrowKey : undefined} value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><button className="flow-add" type="submit">{entryMode === "schedule" ? "Schedule expense" : "Add to ledger"} <b>+</b></button>{status && <p className="form-status">{status}</p>}</form></aside></div>}
    </main>
  );
}
