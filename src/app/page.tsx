"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Expense = {
  _id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
};

const categories = ["Food", "Transport", "Home", "Work", "Health", "Other"];

const seedExpenses: Expense[] = [
  { _id: "1", title: "Weekly groceries", category: "Food", amount: 84.32, date: "2026-08-26" },
  { _id: "2", title: "Metro pass", category: "Transport", amount: 42, date: "2026-08-24" },
  { _id: "3", title: "Desk lamp", category: "Home", amount: 38.5, date: "2026-08-21" },
  { _id: "4", title: "Client lunch", category: "Work", amount: 64.8, date: "2026-08-18" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState("All");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/expenses")
      .then((response) => response.json())
      .then((data: { expenses?: Expense[] }) => data.expenses?.length && setExpenses(data.expenses))
      .catch(() => undefined);
  }, []);

  const filteredExpenses = useMemo(
    () => filter === "All" ? expenses : expenses.filter((expense) => expense.category === filter),
    [expenses, filter],
  );
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const thisMonth = expenses.filter((expense) => expense.date.startsWith("2026-08")).reduce((sum, expense) => sum + expense.amount, 0);

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

  return (
    <main className="dashboard-shell">
      <nav className="topbar">
        <div className="brand"><span className="brand-mark">+</span><span>ledgerly</span></div>
        <div className="nav-meta"><span className="live-dot" /> Cloud synced <span className="avatar">AM</span></div>
      </nav>

      <section className="intro-row">
        <div><p className="eyebrow">Thursday, August 27, 2026</p><h1>Know where<br /><em>it goes.</em></h1></div>
        <p className="intro-copy">A clear view of your spending,<br />so your money can do more.</p>
      </section>

      <section className="stats-grid">
        <article className="stat-card stat-dark"><span className="stat-label">Total tracked</span><strong>{money.format(total)}</strong><span className="stat-note">Across {expenses.length} expenses</span></article>
        <article className="stat-card"><span className="stat-label">This month</span><strong>{money.format(thisMonth)}</strong><span className="stat-note positive">↓ 12.4% vs. last month</span></article>
        <article className="stat-card"><span className="stat-label">Top category</span><strong>{expenses.length ? "Food" : "—"}</strong><span className="stat-note">32% of total spend</span></article>
      </section>

      <section className="content-grid">
        <div className="expenses-panel">
          <div className="section-heading"><div><p className="eyebrow">Your activity</p><h2>Recent expenses</h2></div><button className="text-button" onClick={() => setFilter("All")}>View all <span>↗</span></button></div>
          <div className="filters">{["All", ...categories].map((item) => <button key={item} className={filter === item ? "filter active" : "filter"} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <div className="expense-list">{filteredExpenses.length ? filteredExpenses.map((expense) => <div className="expense-row" key={expense._id}><div className={`category-icon ${expense.category.toLowerCase()}`}>{expense.category.slice(0, 1)}</div><div className="expense-info"><strong>{expense.title}</strong><span>{expense.category} · {new Date(`${expense.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div><strong className="expense-amount">{money.format(expense.amount)}</strong><button className="delete-button" aria-label={`Delete ${expense.title}`} onClick={() => removeExpense(expense._id)}>×</button></div>) : <p className="empty-state">No expenses in this category yet.</p>}</div>
        </div>
        <aside className="add-panel"><p className="eyebrow">Quick entry</p><h2>Add expense</h2><form onSubmit={addExpense}><label>Description<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What did you spend on?" required /></label><div className="form-split"><label>Amount<div className="amount-input"><span>$</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><button className="submit-button" type="submit">Add to ledger <span>+</span></button>{status && <p className="form-status">{status}</p>}</form></aside>
      </section>
      <footer><span>LEDGERLY / PERSONAL FINANCE</span><span>Built for a clearer month.</span></footer>
    </main>
  );
}
