import Link from "next/link";
import type { Metadata } from "next";
import { FamilyMemoryBoxConfirmation } from "@/components/marketing/FamilyMemoryBoxConfirmation";
import { confirmMemoryBoxCheckoutSession } from "@/lib/memory-box/checkout";
import { getMemoryBoxOrderById } from "@/lib/memory-box/orders";
import { isStripeConfigured } from "@/lib/stripe";
import { getTranslations } from "@/lib/i18n/server";

type PageProps = {
  searchParams?: Promise<{
    order_id?: string;
    session_id?: string;
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("memoryBox.successMetaTitle"),
    description: t("memoryBox.successMetaDescription"),
  };
}

/**
 * Dedicated confirmation after form submit or Stripe Checkout return.
 */
export default async function FamilyMemoryBoxSuccessPage({
  searchParams,
}: PageProps) {
  const t = await getTranslations();
  const params = (await searchParams) ?? {};
  const orderId = params.order_id?.trim() || "";
  const sessionId = params.session_id?.trim() || "";

  if (!orderId) {
    return (
      <div className="memory-box-confirm">
        <div className="memory-box-confirm-card memory-box-confirm-card--simple">
          <h1 className="memory-box-confirm-title">
            {t("memoryBox.orderNotFound")}
          </h1>
          <p className="memory-box-confirm-lead">
            {t("memoryBox.orderNotFoundLead")}
          </p>
          <div className="memory-box-confirm-actions">
            <Link href="/dashboard" className="ui-btn ui-btn-primary ui-btn-lg">
              {t("memoryBox.backToDashboard")}
            </Link>
            <Link
              href="/family-memory-box"
              className="memory-box-confirm-secondary"
            >
              {t("memoryBox.heroTitle")}
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
      paymentPendingNote = t("memoryBox.paymentPendingNote");
    }
  }

  const order = await getMemoryBoxOrderById(orderId);
  if (!order) {
    return (
      <div className="memory-box-confirm">
        <div className="memory-box-confirm-card memory-box-confirm-card--simple">
          <h1 className="memory-box-confirm-title">
            {t("memoryBox.orderNotFound")}
          </h1>
          <p className="memory-box-confirm-lead">
            {t("memoryBox.orderNotFoundLeadLoad")}
          </p>
          <div className="memory-box-confirm-actions">
            <Link href="/dashboard" className="ui-btn ui-btn-primary ui-btn-lg">
              {t("memoryBox.backToDashboard")}
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
