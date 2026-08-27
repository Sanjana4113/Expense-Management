import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {};

if (!uri) {
  console.warn("MONGODB_URI is not set; the app will use its local development fallback.");
}

let client: MongoClient | undefined;
export let clientPromise: Promise<MongoClient> | undefined;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (uri) {
  client = new MongoClient(uri, options);
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) global._mongoClientPromise = client.connect();
    clientPromise = global._mongoClientPromise;
  } else {
    clientPromise = client.connect();
  }
}

export async function getDatabase() {
  if (!clientPromise) return null;
  const connectedClient = await clientPromise;
  return connectedClient.db(process.env.MONGODB_DB || "ledgerly");
}