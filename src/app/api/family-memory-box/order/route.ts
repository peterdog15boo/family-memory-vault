import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createMemoryBoxCheckoutSession } from "@/lib/memory-box/checkout";
import {
  createMemoryBoxOrder,
  memoryBoxOrderInputSchema,
  notifyAdminsOfMemoryBoxOrder,
} from "@/lib/memory-box/orders";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

/**
 * POST /api/family-memory-box/order — intake + optional Stripe Checkout.
 * When Stripe is configured: save order, return checkoutUrl (payment not yet paid).
 * When not: save as manual_follow_up request (explicitly unpaid).
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  const rateKey = userId
    ? `memory-box-order:user:${userId}`
    : `memory-box-order:ip:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`;

  const limited = enforceRateLimit(
    rateKey,
    RATE_LIMITS.memoryBoxOrder.limit,
    RATE_LIMITS.memoryBoxOrder.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = memoryBoxOrderInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: userId
          ? "Please check the highlighted fields and try again."
          : "Please provide your full name, email, phone, and mailing address so we can match your order later.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const stripeReady = isStripeConfigured();

  try {
    if (userId) {
      await ensureAppUser(userId);
    }

    const order = await createMemoryBoxOrder({
      input: parsed.data,
      userId,
      paymentStatus: stripeReady ? "unpaid" : "manual_follow_up",
    });

    if (stripeReady) {
      try {
        const checkout = await createMemoryBoxCheckoutSession(order);
        // Notify after checkout session exists (still unpaid until paid).
        try {
          await notifyAdminsOfMemoryBoxOrder({
            ...order,
            paymentStatus: "checkout_pending",
            stripeCheckoutSessionId: checkout.sessionId,
          });
        } catch (notifyError) {
          console.error("[memory-box] admin notify threw", {
            orderId: order.id,
            error: notifyError,
          });
        }

        return NextResponse.json(
          {
            ok: true,
            orderId: order.id,
            linkedToAccount: Boolean(order.userId),
            paymentStatus: "checkout_pending",
            paymentRequired: true,
            paid: false,
            checkoutUrl: checkout.url,
          },
          { status: 201 },
        );
      } catch (checkoutError) {
        console.error("[memory-box] checkout session failed", {
          orderId: order.id,
          error: checkoutError,
        });
        // Fall back to manual follow-up — order exists, payment not taken.
        const { getDb } = await import("@/lib/db");
        const { memoryBoxOrders } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        await getDb()
          .update(memoryBoxOrders)
          .set({
            paymentStatus: "manual_follow_up",
            updatedAt: new Date(),
          })
          .where(eq(memoryBoxOrders.id, order.id));

        try {
          await notifyAdminsOfMemoryBoxOrder({
            ...order,
            paymentStatus: "manual_follow_up",
          });
        } catch (notifyError) {
          console.error("[memory-box] admin notify threw", notifyError);
        }

        return NextResponse.json(
          {
            ok: true,
            orderId: order.id,
            linkedToAccount: Boolean(order.userId),
            paymentStatus: "manual_follow_up",
            paymentRequired: false,
            paid: false,
            message:
              "Your request was saved. We’ll email you to complete payment — no charge was taken yet.",
          },
          { status: 201 },
        );
      }
    }

    try {
      await notifyAdminsOfMemoryBoxOrder(order);
    } catch (notifyError) {
      console.error("[memory-box] admin notify threw", {
        orderId: order.id,
        error: notifyError,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        linkedToAccount: Boolean(order.userId),
        paymentStatus: "manual_follow_up",
        paymentRequired: false,
        paid: false,
        message:
          "Request received. Payment was not processed online — we’ll follow up by email to collect $199.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[memory-box] create order failed", error);
    return NextResponse.json(
      { error: "Could not save your order. Please try again in a moment." },
      { status: 500 },
    );
  }
}
