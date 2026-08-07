import Link from "next/link";
import { FamilyMemoryBoxConfirmation } from "@/components/marketing/FamilyMemoryBoxConfirmation";
import { confirmMemoryBoxCheckoutSession } from "@/lib/memory-box/checkout";
import { getMemoryBoxOrderById } from "@/lib/memory-box/orders";
import { isStripeConfigured } from "@/lib/stripe";

export const metadata = {
  title: "Order confirmed — Family Memory Box",
  description:
    "Your Family Memory Box order confirmation and what happens next.",
};

type PageProps = {
  searchParams?: Promise<{
    order_id?: string;
    session_id?: string;
  }>;
};

/**
 * Dedicated confirmation after form submit or Stripe Checkout return.
 */
export default async function FamilyMemoryBoxSuccessPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const orderId = params.order_id?.trim() || "";
  const sessionId = params.session_id?.trim() || "";

  if (!orderId) {
    return (
      <div className="memory-box-confirm">
        <div className="memory-box-confirm-card memory-box-confirm-card--simple">
          <h1 className="memory-box-confirm-title">Order not found</h1>
          <p className="memory-box-confirm-lead">
            We couldn’t find that confirmation link. If you just ordered, check
            your email or return to the Memory Box page.
          </p>
          <div className="memory-box-confirm-actions">
            <Link href="/dashboard" className="ui-btn ui-btn-primary ui-btn-lg">
              Back to Dashboard
            </Link>
            <Link
              href="/family-memory-box"
              className="memory-box-confirm-secondary"
            >
              Family Memory Box
            </Link>
          </div>
        </div>
      </div>
    );
  }

  let paymentPendingNote: string | null = null;

  if (sessionId && isStripeConfigured()) {
    try {
      await confirmMemoryBoxCheckoutSession({ orderId, sessionId });
    } catch (err) {
      console.error("[memory-box.success] confirm failed", err);
      paymentPendingNote =
        "If you completed Checkout, your payment may still be confirming. Your order details are saved — you can refresh this page in a moment.";
    }
  }

  const order = await getMemoryBoxOrderById(orderId);
  if (!order) {
    return (
      <div className="memory-box-confirm">
        <div className="memory-box-confirm-card memory-box-confirm-card--simple">
          <h1 className="memory-box-confirm-title">Order not found</h1>
          <p className="memory-box-confirm-lead">
            We couldn’t load that order. If you just submitted a request, try
            again from your confirmation email or contact us.
          </p>
          <div className="memory-box-confirm-actions">
            <Link href="/dashboard" className="ui-btn ui-btn-primary ui-btn-lg">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FamilyMemoryBoxConfirmation
      order={order}
      paymentPendingNote={
        order.paymentStatus === "paid" ? null : paymentPendingNote
      }
    />
  );
}
