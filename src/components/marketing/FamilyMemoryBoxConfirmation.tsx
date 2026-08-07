import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";
import {
  formatMemoryBoxPrice,
  MEMORY_BOX_PAYMENT_LABELS,
} from "@/lib/memory-box/constants";
import type { MemoryBoxOrder } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type FamilyMemoryBoxConfirmationProps = {
  order: MemoryBoxOrder;
  /** Extra note when payment is still confirming after Checkout. */
  paymentPendingNote?: string | null;
};

function formatAddress(order: MemoryBoxOrder): string {
  return [
    order.addressLine1,
    order.addressLine2,
    `${order.city}, ${order.state} ${order.postalCode}`,
    order.country,
  ]
    .filter((part) => Boolean(part?.trim()))
    .join(", ");
}

function formatEstimates(order: MemoryBoxOrder): string {
  const parts = [
    `${order.estimatedPhotos} photo${order.estimatedPhotos === 1 ? "" : "s"}`,
    `${order.estimatedVideoTapes} tape${order.estimatedVideoTapes === 1 ? "" : "s"}`,
    `${order.estimatedFilmReels} reel${order.estimatedFilmReels === 1 ? "" : "s"}`,
  ];
  if (order.otherItemsNotes?.trim()) {
    parts.push(order.otherItemsNotes.trim());
  }
  return parts.join(" · ");
}

/**
 * Full-page confirmation after Memory Box submit / Checkout.
 */
export function FamilyMemoryBoxConfirmation({
  order,
  paymentPendingNote = null,
}: FamilyMemoryBoxConfirmationProps) {
  const paid = order.paymentStatus === "paid";
  const manual = order.paymentStatus === "manual_follow_up";

  const title = paid
    ? "Your Family Memory Box order is confirmed"
    : paymentPendingNote
      ? "Thanks — we’re confirming your payment"
      : "Your Family Memory Box order is confirmed";

  const lead = paid
    ? `You’re all set${order.priceCents ? ` — ${formatMemoryBoxPrice(order.priceCents)} received` : ""}. We’ll email shipping details soon, and take good care of what’s in the box.`
    : paymentPendingNote
      ? paymentPendingNote
      : manual
        ? "Thank you. We’ve saved your request. Payment was not taken online — we’ll email you to collect the $199 fee before we ship your box."
        : "Thank you. We’ve received your order details and will be in touch by email.";

  return (
    <div className="memory-box-confirm">
      <div className="memory-box-confirm-card">
        <div className="memory-box-confirm-hero">
          {paymentPendingNote && !paid ? (
            <Clock3 className="memory-box-confirm-icon" aria-hidden />
          ) : (
            <CheckCircle2
              className="memory-box-confirm-icon"
              aria-hidden
            />
          )}
          <p className="memory-box-confirm-brand">Family Memory Vault</p>
          <h1 className="memory-box-confirm-title">{title}</h1>
          <p className="memory-box-confirm-lead">{lead}</p>
          <p
            className={cn(
              "memory-box-confirm-payment-pill",
              paid && "memory-box-confirm-payment-pill--paid",
              manual && "memory-box-confirm-payment-pill--manual",
            )}
          >
            {MEMORY_BOX_PAYMENT_LABELS[order.paymentStatus]}
            {paid ? ` · ${formatMemoryBoxPrice(order.priceCents)}` : null}
          </p>
        </div>

        <section
          className="memory-box-confirm-section"
          aria-labelledby="memory-box-next-title"
        >
          <h2 id="memory-box-next-title" className="memory-box-confirm-heading">
            What happens next
          </h2>
          <ol className="memory-box-confirm-steps">
            <li>
              Expect your Family Memory Box within about{" "}
              <strong>2 weeks</strong>
              {manual ? " after payment is confirmed" : ""}.
            </li>
            <li>
              After you return it filled, allow about{" "}
              <strong>5–8 weeks</strong> for processing.
            </li>
            <li>
              Digitized items will appear in <strong>Photos</strong> when
              ready — automatically, no upload needed.
            </li>
          </ol>
        </section>

        <section
          className="memory-box-confirm-section"
          aria-labelledby="memory-box-details-title"
        >
          <h2
            id="memory-box-details-title"
            className="memory-box-confirm-heading"
          >
            Your order details
          </h2>
          <dl className="memory-box-confirm-details">
            <div>
              <dt>Name</dt>
              <dd>{order.fullName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{order.email}</dd>
            </div>
            <div>
              <dt>Ship to</dt>
              <dd>{formatAddress(order)}</dd>
            </div>
            <div>
              <dt>Estimated items</dt>
              <dd>{formatEstimates(order)}</dd>
            </div>
            {order.customerNotes?.trim() ? (
              <div>
                <dt>Notes</dt>
                <dd>{order.customerNotes.trim()}</dd>
              </div>
            ) : null}
          </dl>
          <p className="memory-box-confirm-order-id">Order {order.id}</p>
        </section>

        <div className="memory-box-confirm-actions">
          <Link href="/dashboard" className="ui-btn ui-btn-primary ui-btn-lg">
            Back to Dashboard
          </Link>
          <Link href="/media" className="memory-box-confirm-secondary">
            View Photos
          </Link>
        </div>
      </div>
    </div>
  );
}
