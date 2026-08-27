import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { clientPromise, getDatabase } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  adapter: clientPromise ? MongoDBAdapter(clientPromise) : undefined,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        identifier: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim().toLowerCase();
        const password = credentials?.password;
        if (!identifier || !password) return null;

        const database = await getDatabase();
        if (!database) return null;
        const user = await database.collection("users").findOne({
          $or: [{ email: identifier }, { usernameNormalized: identifier }],
        });
        if (!user?.passwordHash || typeof user.passwordHash !== "string") return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;

        return { id: user._id.toString(), name: user.name || user.username, email: user.email };
      },
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = (token.id || token.sub) as string;
      return session;
    },
  },
};
