import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { clientPromise } from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  adapter: clientPromise ? MongoDBAdapter(clientPromise) : undefined,
  session: { strategy: clientPromise ? "database" : "jwt" },
  providers: [Google({
    clientId: process.env.AUTH_GOOGLE_ID || "",
    clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
  })],
  callbacks: {
    session({ session, user }) {
      if (session.user && user) session.user.id = user.id;
      return session;
    },
  },
};