import {
  MEMORY_BOX_ORDER_STATUSES,
  MEMORY_BOX_PAYMENT_STATUSES,
  type MemoryBoxOrderStatus,
  type MemoryBoxPaymentStatus,
} from "@/lib/db/schema";

export {
  MEMORY_BOX_ORDER_STATUSES,
  MEMORY_BOX_PAYMENT_STATUSES,
  MEMORY_BOX_PRICE_CENTS,
} from "@/lib/db/schema";
export type {
  MemoryBoxOrderStatus,
  MemoryBoxPaymentStatus,
} from "@/lib/db/schema";

export const MEMORY_BOX_STATUS_LABELS: Record<MemoryBoxOrderStatus, string> = {
  requested: "Requested",
  box_shipped: "Box shipped",
  box_received: "Box received",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const MEMORY_BOX_PAYMENT_LABELS: Record<
  MemoryBoxPaymentStatus,
  string
> = {
  unpaid: "Unpaid",
  checkout_pending: "Checkout pending",
  paid: "Paid",
  manual_follow_up: "Payment follow-up",
};

export function formatMemoryBoxPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}`;
}

export function isMemoryBoxOrderStatus(
  value: string,
): value is MemoryBoxOrderStatus {
  return (MEMORY_BOX_ORDER_STATUSES as readonly string[]).includes(value);
}

export function isMemoryBoxPaymentStatus(
  value: string,
): value is MemoryBoxPaymentStatus {
  return (MEMORY_BOX_PAYMENT_STATUSES as readonly string[]).includes(value);
}
