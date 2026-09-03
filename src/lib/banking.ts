import { createHash, createHmac, createSign, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "mongodb";

const apiBase = "https://api.enablebanking.com";

export type BankAccount = { accountId: string; name: string; currency?: string };
export type PendingBankTransaction = {
  ownerId: string;
  externalProvider: "enablebanking";
  externalTransactionId: string;
  bankAccountId: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  currency: string;
  lastSeenAt: Date;
};
export type BankConnection = {
  ownerId: string;
  provider: "enablebanking";
  sessionId: string;
  bankName: string;
  bankCountry: string;
  accounts: BankAccount[];
  status: "active" | "reauthorization_required";
  validUntil?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};
export type BankingInstitution = { name: string; country: string; logo?: string; maximumConsentValidity?: number };

type EnableAccount = { uid: string; name?: string; currency?: string; identification_hash?: string };
type EnableTransaction = {
  entry_reference?: string;
  credit_debit_indicator?: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  transaction_amount?: { amount?: string; currency?: string };
  creditor?: { name?: string };
  remittance_information?: string[];
  bank_transaction_code?: { description?: string };
};

export function bankIntegrationConfigured() {
  return Boolean(process.env.ENABLE_BANKING_APPLICATION_ID && process.env.ENABLE_BANKING_PRIVATE_KEY_BASE64 && (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET));
}

function required(name: "ENABLE_BANKING_APPLICATION_ID" | "ENABLE_BANKING_PRIVATE_KEY_BASE64") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function apiJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = encoded({ typ: "JWT", alg: "RS256", kid: required("ENABLE_BANKING_APPLICATION_ID") });
  const payload = encoded({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 300 });
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const privateKey = Buffer.from(required("ENABLE_BANKING_PRIVATE_KEY_BASE64"), "base64").toString("utf8");
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

async function enableRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${apiJwt()}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Enable Banking request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

function stateSecret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required");
  return value;
}

export function createBankState(ownerId: string) {
  const payload = encoded({ ownerId, expiresAt: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString("hex") });
  return `${payload}.${createHmac("sha256", stateSecret()).update(payload).digest("base64url")}`;
}

export function verifyBankState(state: string) {
  try {
    const [payload, signature] = state.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", stateSecret()).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { ownerId?: string; expiresAt?: number };
    return parsed.ownerId && parsed.expiresAt && parsed.expiresAt > Date.now() ? parsed.ownerId : null;
  } catch { return null; }
}

export async function listInstitutions(country: string, psuType: "personal" | "business" = "personal") {
  const query = new URLSearchParams({ country: country.toUpperCase(), psu_type: psuType, service: "AIS" });
  const data = await enableRequest<{ aspsps?: Array<{ name: string; country: string; logo?: string; maximum_consent_validity?: number }> }>(`/aspsps?${query}`);
  return (data.aspsps || []).map((bank) => ({ name: bank.name, country: bank.country, logo: bank.logo, maximumConsentValidity: bank.maximum_consent_validity } satisfies BankingInstitution));
}

export async function startBankAuthorization(input: { ownerId: string; bankName: string; bankCountry: string; psuType: "personal" | "business"; redirectUri: string; maximumConsentValidity?: number }) {
  const requestedSeconds = Math.min(input.maximumConsentValidity || 89 * 86_400, 179 * 86_400);
  return enableRequest<{ url: string; authorization_id: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { balances: true, transactions: true, valid_until: new Date(Date.now() + requestedSeconds * 1000).toISOString() },
      aspsp: { name: input.bankName, country: input.bankCountry.toUpperCase() },
      state: createBankState(input.ownerId),
      redirect_url: input.redirectUri,
      psu_type: input.psuType,
      psu_id: createHash("sha256").update(input.ownerId).digest("hex"),
      language: "en",
    }),
  });
}

export async function authorizeBankSession(code: string) {
  return enableRequest<{ session_id: string; accounts: EnableAccount[]; aspsp: { name: string; country: string }; access?: { valid_until?: string } }>("/sessions", { method: "POST", body: JSON.stringify({ code }) });
}

export async function closeBankSession(sessionId: string) {
  return enableRequest<{ message?: string }>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

function categoryFor(transaction: EnableTransaction) {
  const value = [transaction.creditor?.name, transaction.bank_transaction_code?.description, ...(transaction.remittance_information || [])].filter(Boolean).join(" ").toLowerCase();
  if (/restaurant|food|grocer|supermarket|takeaway|cafe|bakery/.test(value)) return "Food";
  if (/transport|train|taxi|uber|fuel|parking|airline|bahn|transit/.test(value)) return "Transport";
  if (/medical|health|pharmacy|doctor|fitness|apotheke/.test(value)) return "Health";
  if (/rent|mortgage|utility|household|home|strom|energie/.test(value)) return "Home";
  if (/business|office|software|professional/.test(value)) return "Work";
  return "Other";
}

function transactionReference(transaction: EnableTransaction, accountId: string) {
  if (transaction.entry_reference) return `${accountId}:${transaction.entry_reference}`;
  return createHash("sha256").update(JSON.stringify({ accountId, amount: transaction.transaction_amount, date: transaction.booking_date || transaction.value_date || transaction.transaction_date, remittance: transaction.remittance_information, creditor: transaction.creditor?.name })).digest("hex");
}

export async function syncBankConnection(database: Db, connection: BankConnection) {
  await database.collection("pendingBankTransactions").createIndex(
    { ownerId: 1, externalProvider: 1, externalTransactionId: 1 },
    { unique: true },
  );
  const syncStartedAt = new Date();
  const from = new Date(connection.lastSyncedAt || Date.now() - 90 * 86_400_000);
  from.setDate(from.getDate() - 3);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = new Date().toISOString().slice(0, 10);
  let imported = 0;
  for (const account of connection.accounts) {
    let continuationKey: string | undefined;
    let page = 0;
    do {
      const query = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (continuationKey) query.set("continuation_key", continuationKey);
      const data = await enableRequest<{ transactions?: EnableTransaction[]; continuation_key?: string | null }>(`/accounts/${encodeURIComponent(account.accountId)}/transactions?${query}`);
      for (const transaction of data.transactions || []) {
        const rawAmount = Number(transaction.transaction_amount?.amount);
        const isDebit = transaction.credit_debit_indicator === "DBIT" || rawAmount < 0;
        const date = transaction.booking_date || transaction.value_date || transaction.transaction_date;
        if (!isDebit || !date || !Number.isFinite(rawAmount) || rawAmount === 0) continue;
        const reference = transactionReference(transaction, account.accountId);
        const title = (transaction.creditor?.name || transaction.remittance_information?.find(Boolean) || transaction.bank_transaction_code?.description || "Bank purchase").trim().slice(0, 120);
        const amount = Math.abs(rawAmount);
        const currency = transaction.transaction_amount?.currency || account.currency || "EUR";

        if (transaction.status === "PDNG") {
          await database.collection<PendingBankTransaction>("pendingBankTransactions").updateOne(
            { ownerId: connection.ownerId, externalProvider: "enablebanking", externalTransactionId: reference },
            { $set: { ownerId: connection.ownerId, externalProvider: "enablebanking", externalTransactionId: reference, bankAccountId: account.accountId, title, amount, category: categoryFor(transaction), date: date.slice(0, 10), currency, lastSeenAt: syncStartedAt } },
            { upsert: true },
          );
          continue;
        }
        if (transaction.status && transaction.status !== "BOOK") continue;

        const result = await database.collection("expenses").updateOne(
          { ownerId: connection.ownerId, externalProvider: "enablebanking", externalTransactionId: reference },
          { $setOnInsert: { ownerId: connection.ownerId, title, amount, category: categoryFor(transaction), date: date.slice(0, 10), currency, source: "bank", externalProvider: "enablebanking", externalTransactionId: reference, bankAccountId: account.accountId, importedAt: new Date() } },
          { upsert: true },
        );
        imported += result.upsertedCount;
        const bookedDate = new Date(`${date.slice(0, 10)}T12:00:00Z`);
        const earliest = new Date(bookedDate);
        const latest = new Date(bookedDate);
        earliest.setUTCDate(earliest.getUTCDate() - 3);
        latest.setUTCDate(latest.getUTCDate() + 3);
        await database.collection<PendingBankTransaction>("pendingBankTransactions").deleteMany({
          ownerId: connection.ownerId,
          bankAccountId: account.accountId,
          $or: [
            { externalTransactionId: reference },
            { title, amount, currency, date: { $gte: earliest.toISOString().slice(0, 10), $lte: latest.toISOString().slice(0, 10) } },
          ],
        });
      }
      continuationKey = data.continuation_key || undefined;
      page += 1;
    } while (continuationKey && page < 50);
    const staleCutoff = new Date(syncStartedAt.getTime() - 14 * 86_400_000);
    await database.collection<PendingBankTransaction>("pendingBankTransactions").deleteMany({
      ownerId: connection.ownerId,
      bankAccountId: account.accountId,
      $or: [
        { date: { $gte: dateFrom, $lte: dateTo }, lastSeenAt: { $lt: syncStartedAt } },
        { lastSeenAt: { $lt: staleCutoff } },
      ],
    });
  }
  await database.collection<BankConnection>("bankConnections").updateOne({ ownerId: connection.ownerId, provider: "enablebanking", sessionId: connection.sessionId }, { $set: { lastSyncedAt: new Date(), updatedAt: new Date(), status: "active" } });
  return imported;
}
