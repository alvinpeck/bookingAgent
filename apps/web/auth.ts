/**
 * Full Auth.js config — runs in Node.js only (never imported by middleware).
 * Includes DrizzleAdapter for persisting users/accounts/sessions.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, users, accounts, verificationTokens } from "@booking-agent/db";
import { eq } from "drizzle-orm";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { authConfig } from "./auth.config";

const scryptAsync = promisify(scrypt);

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(":");
    const hashBuf = (await scryptAsync(password, salt!, 64)) as Buffer;
    return timingSafeEqual(hashBuf, Buffer.from(hash!, "hex"));
  } catch {
    return false;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    // Spread Google from authConfig, then add Credentials
    ...authConfig.providers,
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email    = credentials?.email    as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase().trim()))
          .limit(1);

        if (!user || !user.password) return null; // no account or Google-only user

        const valid = await verifyPassword(password, user.password);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable:              users,
    accountsTable:           accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id; // ensure sub = user UUID
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  trustHost: true,
});
