/**
 * Stripe singleton — import this everywhere you need Stripe server-side.
 * Never instantiate `new Stripe(...)` directly outside this file.
 */
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — Stripe features will fail.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_missing", {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});

/**
 * Plan → Stripe Price ID mapping.
 * Set these in your environment variables or replace with real price IDs from your Stripe dashboard.
 */
export const PLAN_PRICE_IDS: Record<"starter" | "growth" | "enterprise", string | null> = {
  starter:    process.env.STRIPE_PRICE_STARTER    ?? null, // free tier — no Stripe price
  growth:     process.env.STRIPE_PRICE_GROWTH     ?? "price_placeholder_growth",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "price_placeholder_enterprise",
};
