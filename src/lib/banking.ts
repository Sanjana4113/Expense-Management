import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "mongodb";

export type BankAccount = {
  accountId: string;
  type: "account" | "card";
  name: string;
  providerName: string;
};

export type BankConnection = {
  ownerId: string;
  provider: "truelayer";
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  accounts: BankAccount[];
  status: "active" | "reauthorization_required";
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type TrueLayerToken = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type TrueLayerAccount = {
  account_id: string;
  display_name?: string;
  account_type?: string;
  provider?: { display_name?: string };
};

type TrueLayerTransaction = {
  transaction_id?: string;
  timestamp?: string;
  description?: string;
  merchant_name?: string;
  amount?: number;
  currency?: string;
  transaction_type?: string;
  transaction_category?: string;
  transaction_classification?: string[];
};

const isSandbox = process.env.TRUELAYER_ENVIRONMENT !== "production";
const authBase = isSandbox ? "https://auth.truelayer-sandbox.com" : "https://auth.truelayer.com";
const apiBase = isSandbox ? "https://api.truelayer-sandbox.com" : "https://api.truelayer.com";

export function bankIntegrationConfigured() {
  return Boolean(process.env.TRUELAYER_CLIENT_ID && process.env.TRUELAYER_CLIENT_SECRET && process.env.AUTH_SECRET);
}

function secretKey() {
  const secret = process.env.BANK_TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET or BANK_TOKEN_ENCRYPTION_KEY is required");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function createBankState(ownerId: string) {
  const payload = Buffer.from(JSON.stringify({ ownerId, expiresAt: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", secretKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyBankState(state: string) {
  try {
    const [payload, signature] = state.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", secretKey()).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { ownerId?: string; expiresAt?: number };
    return parsed.ownerId && parsed.expiresAt && parsed.expiresAt > Date.now() ? parsed.ownerId : null;
  } catch {
    return null;
  }
}

export function buildAuthorizationUrl(redirectUri: string, state: string) {
  const url = new URL("/", authBase);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.TRUELAYER_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "info accounts cards transactions offline_access");
  const providers = process.env.TRUELAYER_PROVIDERS || (isSandbox ? "mock" : "");
  if (providers) url.searchParams.set("providers", providers);
  url.searchParams.set("state", state);
  return url.toString();
}

async function trueLayerRequest<T>(path: string, accessToken: string) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Client-Correlation-Id": crypto.randomUUID() },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`TrueLayer request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const response = await fetch(`${authBase}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.TRUELAYER_CLIENT_ID || "",
      client_secret: process.env.TRUELAYER_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      code,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`TrueLayer token exchange failed (${response.status})`);
  return response.json() as Promise<TrueLayerToken>;
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(`${authBase}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.TRUELAYER_CLIENT_ID || "",
      client_secret: process.env.TRUELAYER_CLIENT_SECRET || "",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`TrueLayer refresh failed (${response.status})`);
  return response.json() as Promise<TrueLayerToken>;
}

export async function getLinkedAccounts(accessToken: string) {
  const [accounts, cards] = await Promise.all([
    trueLayerRequest<{ results?: TrueLayerAccount[] }>("/data/v1/accounts", accessToken).catch(() => ({ results: [] })),
    trueLayerRequest<{ results?: TrueLayerAccount[] }>("/data/v1/cards", accessToken).catch(() => ({ results: [] })),
  ]);
  return [
    ...(accounts.results || []).map((account) => ({ accountId: account.account_id, type: "account" as const, name: account.display_name || "Bank account", providerName: account.provider?.display_name || "Connected bank" })),
    ...(cards.results || []).map((card) => ({ accountId: card.account_id, type: "card" as const, name: card.display_name || "Payment card", providerName: card.provider?.display_name || "Connected bank" })),
  ];
}

function categoryFor(transaction: TrueLayerTransaction) {
  const value = [...(transaction.transaction_classification || []), transaction.transaction_category || "", transaction.description || ""].join(" ").toLowerCase();
  if (/restaurant|food|grocer|supermarket|takeaway/.test(value)) return "Food";
  if (/transport|train|taxi|uber|fuel|parking|airline/.test(value)) return "Transport";
  if (/medical|health|pharmacy|doctor|fitness/.test(value)) return "Health";
  if (/rent|mortgage|utility|household|home/.test(value)) return "Home";
  if (/business|office|software|professional/.test(value)) return "Work";
  return "Other";
}

export async function syncBankConnection(database: Db, connection: BankConnection) {
  let accessToken = decryptSecret(connection.accessToken);
  let refreshToken = connection.refreshToken ? decryptSecret(connection.refreshToken) : undefined;
  let expiresAt = new Date(connection.expiresAt);

  if (expiresAt.getTime() < Date.now() + 60_000) {
    if (!refreshToken) throw new Error("Bank authorization expired");
    const refreshed = await refreshAccessToken(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token || refreshToken;
    expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  }

  const from = new Date(connection.lastSyncedAt || Date.now() - 90 * 86_400_000);
  from.setDate(from.getDate() - 3);
  const to = new Date();
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const transactionGroups = await Promise.all(connection.accounts.map(async (account) => {
    const resource = account.type === "card" ? "cards" : "accounts";
    const data = await trueLayerRequest<{ results?: TrueLayerTransaction[] }>(`/data/v1/${resource}/${encodeURIComponent(account.accountId)}/transactions?${query}`, accessToken);
    return (data.results || []).map((transaction) => ({ transaction, account }));
  }));

  let imported = 0;
  for (const { transaction, account } of transactionGroups.flat()) {
    const amount = Math.abs(Number(transaction.amount));
    const isDebit = transaction.transaction_type?.toUpperCase() === "DEBIT" || Number(transaction.amount) < 0;
    if (!transaction.transaction_id || !transaction.timestamp || !isDebit || !Number.isFinite(amount) || amount <= 0) continue;
    const title = (transaction.merchant_name || transaction.description || "Card purchase").trim().slice(0, 120);
    const result = await database.collection("expenses").updateOne(
      { ownerId: connection.ownerId, externalProvider: "truelayer", externalTransactionId: transaction.transaction_id },
      { $setOnInsert: { ownerId: connection.ownerId, title, amount, category: categoryFor(transaction), date: transaction.timestamp.slice(0, 10), currency: transaction.currency || "USD", source: "bank", externalProvider: "truelayer", externalTransactionId: transaction.transaction_id, bankAccountId: account.accountId, importedAt: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount) imported += 1;
  }

  await database.collection<BankConnection>("bankConnections").updateOne(
    { ownerId: connection.ownerId, provider: "truelayer" },
    { $set: { accessToken: encryptSecret(accessToken), ...(refreshToken ? { refreshToken: encryptSecret(refreshToken) } : {}), expiresAt, lastSyncedAt: new Date(), updatedAt: new Date(), status: "active" } },
  );
  return imported;
}
