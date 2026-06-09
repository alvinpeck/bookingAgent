/**
 * Stripe webhook handler.
 * Handles subscription lifecycle events and syncs plan/status to the DB.
 *
 * Configure in Stripe Dashboard → Webhooks → Add endpoint:
 *   URL:    https://<your-domain>/api/webhooks/stripe
 *   Events: customer.subscription.created
 *           customer.subscription.updated
 *           customer.subscription.deleted
 *           invoice.payment_failed
 *           invoice.payment_succeeded
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, tenants } from "@booking-agent/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Lazily initialised — env vars are not available at build time
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY env var is required but not set.");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

/** Map Stripe subscription status → our tenant status */
function stripeStatusToTenantStatus(
  stripeStatus: Stripe.Subscription["status"]
): "active" | "delinquent" | "suspended" | "cancelled" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "delinquent";
    case "canceled":
    case "unpaid":
      return "cancelled";
    default:
      return "active";
  }
}

/** Map price ID → plan name */
function priceIdToPlan(priceId: string): "starter" | "growth" | "enterprise" {
  if (priceId === process.env.STRIPE_PRICE_GROWTH)     return "growth";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  return "starter";
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) {
    console.warn("[stripe/webhook] subscription missing tenantId metadata", subscription.id);
    return;
  }

  // Cross-check: the customer on the subscription must match our own record.
  // This prevents metadata-tampering attacks where an attacker sets a different
  // tenant's ID in the subscription metadata.
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : (subscription.customer as Stripe.Customer | Stripe.DeletedCustomer)?.id;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, stripeCustomerId: true },
  });
  if (!tenant) {
    console.warn("[stripe/webhook] tenant not found", tenantId);
    return;
  }
  if (tenant.stripeCustomerId && tenant.stripeCustomerId !== customerId) {
    console.error(
      "[stripe/webhook] customer ID mismatch — possible metadata tampering",
      { tenantId, expected: tenant.stripeCustomerId, got: customerId }
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const plan    = priceId ? priceIdToPlan(priceId) : "starter";
  const status  = stripeStatusToTenantStatus(subscription.status);
  const periodEnd = new Date((subscription as any).current_period_end * 1000);

  await db
    .update(tenants)
    .set({
      plan,
      status,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd:     periodEnd,
      updatedAt:            new Date(),
    } as any)
    .where(eq(tenants.id, tenantId));

  console.log(`[stripe/webhook] synced tenant ${tenantId}: plan=${plan} status=${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata?.tenantId;
  if (!tenantId) return;

  // Same customer-ID cross-check as syncSubscription — prevents an attacker
  // with their own Stripe account from putting a victim's tenantId in metadata
  // and cancelling to trigger a plan downgrade.
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : (subscription.customer as Stripe.Customer | Stripe.DeletedCustomer)?.id;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, stripeCustomerId: true },
  });
  if (!tenant) {
    console.warn("[stripe/webhook] tenant not found on deletion", tenantId);
    return;
  }
  if (tenant.stripeCustomerId && tenant.stripeCustomerId !== customerId) {
    console.error(
      "[stripe/webhook] customer ID mismatch on deletion — possible metadata tampering",
      { tenantId, expected: tenant.stripeCustomerId, got: customerId }
    );
    return;
  }

  await db
    .update(tenants)
    .set({
      plan:                 "starter",
      status:               "active",
      stripeSubscriptionId: null,
      currentPeriodEnd:     null,
      updatedAt:            new Date(),
    } as any)
    .where(eq(tenants.id, tenantId));

  console.log(`[stripe/webhook] subscription cancelled — tenant ${tenantId} downgraded to starter`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  await db
    .update(tenants)
    .set({ status: "delinquent", updatedAt: new Date() } as any)
    .where(eq(tenants.stripeCustomerId, customerId));

  console.warn(`[stripe/webhook] invoice payment failed for customer ${customerId}`);
}

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_succeeded": {
        // Re-activate tenant if it was delinquent
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db
            .update(tenants)
            .set({ status: "active", updatedAt: new Date() } as any)
            .where(eq(tenants.stripeCustomerId, customerId));
        }
        break;
      }

      default:
        // Unhandled event — return 200 so Stripe stops retrying
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
