/**
 * Edge-compatible Auth.js config — NO database/Node.js imports here.
 * Used by middleware which runs on the Edge runtime.
 * The full config (with DrizzleAdapter) lives in auth.ts.
 */
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  providers: [
    // Google provider defined here so middleware can recognise the provider
    // Credentials/secrets are resolved at runtime (not needed for Edge)
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/sign-in",
    error:  "/sign-in",
  },
  callbacks: {
    // Used by middleware's auth() to decide if request is authenticated
    authorized({ auth }) {
      return !!auth?.user;
    },
    // Keep user.id in the session so middleware can read it
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
