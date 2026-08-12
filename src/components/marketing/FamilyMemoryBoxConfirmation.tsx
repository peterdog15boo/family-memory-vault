import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import {
  formatMemoryBoxPrice,
  type MemoryBoxPaymentStatus,
} from "@/lib/memory-box/constants";
import type { MemoryBoxOrder } from "@/lib/db/schema";
import { getTranslations } from "@/lib/i18n/server";
import type { TranslateFn } from "@/lib/i18n";
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

function formatEstimates(order: MemoryBoxOrder, t: TranslateFn): string {
  const parts = [
    t(
      order.estimatedPhotos === 1
        ? "memoryBox.estimatePhoto"
        : "memoryBox.estimatePhotos",
      { count: order.estimatedPhotos },
    ),
    t(
      order.estimatedVideoTapes === 1
        ? "memoryBox.estimateTape"
        : "memoryBox.estimateTapes",
      { count: order.estimatedVideoTapes },
    ),
    t(
      order.estimatedFilmReels === 1
        ? "memoryBox.estimateReel"
        : "memoryBox.estimateReels",
      { count: order.estimatedFilmReels },
    ),
  ];
  if (order.otherItemsNotes?.trim()) {
    parts.push(order.otherItemsNotes.trim());
  }
  return parts.join(" · ");
}

function paymentLabel(
  status: MemoryBoxPaymentStatus,
  t: TranslateFn,
): string {
  switch (status) {
    case "unpaid":
      return t("memoryBox.paymentUnpaid");
    case "checkout_pending":
      return t("memoryBox.paymentCheckoutPending");
    case "paid":
      return t("memoryBox.paymentPaid");
    case "manual_follow_up":
      return t("memoryBox.paymentManualFollowUp");
    default:
      return status;
  }
}

function HighlightPlaceholder({
  template,
  placeholder,
  highlight,
}: {
  template: string;
  placeholder: string;
  highlight: ReactNode;
}) {
  const parts = template.split(placeholder);
  return (
    <>
      {parts[0]}
      {highlight}
      {parts.slice(1).join(placeholder)}
    </>
  );
}

/**
 * Full-page confirmation after Memory Box submit / Checkout.
 */
export async function FamilyMemoryBoxConfirmation({
  order,
  paymentPendingNote = null,
}: FamilyMemoryBoxConfirmationProps) {
  const t = await getTranslations();
  const paid = order.paymentStatus === "paid";
  const manual = order.paymentStatus === "manual_follow_up";

  const title =
    paymentPendingNote && !paid
      ? t("memoryBox.confirmTitlePending")
      : t("memoryBox.confirmTitle");

  const lead =
    paid
      ? order.priceCents
        ? t("memoryBox.leadPaidWithPrice", {
            price: formatMemoryBoxPrice(order.priceCents),
          })
        : t("memoryBox.leadPaid")
      : paymentPendingNote
        ? paymentPendingNote
        : manual
          ? t("memoryBox.leadManual")
          : t("memoryBox.leadDefault");

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
          <p className="memory-box-confirm-brand">{t("memoryBox.brand")}</p>
          <h1 className="memory-box-confirm-title">{title}</h1>
          <p className="memory-box-confirm-lead">{lead}</p>
          <p
            className={cn(
              "memory-box-confirm-payment-pill",
              paid && "memory-box-confirm-payment-pill--paid",
              manual && "memory-box-confirm-payment-pill--manual",
            )}
          >
            {paymentLabel(order.paymentStatus, t)}
            {paid ? ` · ${formatMemoryBoxPrice(order.priceCents)}` : null}
          </p>
        </div>

        <section
          className="memory-box-confirm-section"
          aria-labelledby="memory-box-next-title"
        >
          <h2 id="memory-box-next-title" className="memory-box-confirm-heading">
            {t("memoryBox.whatHappensNext")}
          </h2>
          <ol className="memory-box-confirm-steps">
            <li>
              <HighlightPlaceholder
                template={t(
                  manual
                    ? "memoryBox.nextStep1AfterPayment"
                    : "memoryBox.nextStep1",
                )}
                placeholder="{weeks}"
                highlight={
                  <strong>{t("memoryBox.nextStep1Weeks")}</strong>
                }
              />
            </li>
            <li>
              <HighlightPlaceholder
                template={t("memoryBox.nextStep2")}
                placeholder="{weeks}"
                highlight={
                  <strong>{t("memoryBox.nextStep2Weeks")}</strong>
                }
              />
            </li>
            <li>
              <HighlightPlaceholder
                template={t("memoryBox.nextStep3")}
                placeholder="{photos}"
                highlight={
                  <strong>{t("memoryBox.nextStep3Photos")}</strong>
                }
              />
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
            {t("memoryBox.orderDetails")}
          </h2>
          <dl className="memory-box-confirm-details">
            <div>
              <dt>{t("memoryBox.detailName")}</dt>
              <dd>{order.fullName}</dd>
            </div>
            <div>
              <dt>{t("memoryBox.detailEmail")}</dt>
              <dd>{order.email}</dd>
            </div>
            <div>
              <dt>{t("memoryBox.detailShipTo")}</dt>
              <dd>{formatAddress(order)}</dd>
            </div>
            <div>
              <dt>{t("memoryBox.detailEstimatedItems")}</dt>
              <dd>{formatEstimates(order, t)}</dd>
            </div>
            {order.customerNotes?.trim() ? (
              <div>
                <dt>{t("memoryBox.detailNotes")}</dt>
                <dd>{order.customerNotes.trim()}</dd>
              </div>
            ) : null}
          </dl>
          <p className="memory-box-confirm-order-id">
            {t("memoryBox.orderId", { id: order.id })}
          </p>
        </section>

        <div className="memory-box-confirm-actions">
          <Link href="/dashboard" className="ui-btn ui-btn-primary ui-btn-lg">
            {t("memoryBox.backToDashboard")}
          </Link>
          <Link href="/media" className="memory-box-confirm-secondary">
            {t("memoryBox.viewPhotos")}
          </Link>
        </div>
      </div>
    </div>
  );
}
