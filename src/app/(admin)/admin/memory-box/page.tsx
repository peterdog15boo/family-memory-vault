import Link from "next/link";
import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { MemoryBoxStatusSelect } from "@/components/admin/MemoryBoxStatusSelect";
import { requireAdmin } from "@/lib/auth/admin";
import {
  MEMORY_BOX_ORDER_STATUSES,
  type MemoryBoxOrderStatus,
} from "@/lib/db/schema";
import {
  formatMemoryBoxPrice,
  MEMORY_BOX_PAYMENT_LABELS,
  MEMORY_BOX_STATUS_LABELS,
} from "@/lib/memory-box/constants";
import { listMemoryBoxOrders } from "@/lib/memory-box/orders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatWhen(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAddress(order: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): string {
  return [
    order.addressLine1,
    order.addressLine2,
    `${order.city}, ${order.state} ${order.postalCode}`,
    order.country,
  ]
    .filter(Boolean)
    .join(" · ");
}

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function AdminMemoryBoxPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const statusFilter =
    params.status &&
    MEMORY_BOX_ORDER_STATUSES.includes(params.status as MemoryBoxOrderStatus)
      ? (params.status as MemoryBoxOrderStatus)
      : "all";

  const orders = await listMemoryBoxOrders({
    status: statusFilter,
    limit: 100,
  });

  const requestedCount = orders.filter((o) => o.status === "requested").length;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            Memory Box
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Digitizing requests and payment status. Fulfillment tracking only —
            not a full shipping console yet.
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          {orders.length} shown
          {statusFilter === "all" && requestedCount > 0
            ? ` · ${requestedCount} requested`
            : null}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip href="/admin/memory-box" active={statusFilter === "all"}>
          All
        </FilterChip>
        {MEMORY_BOX_ORDER_STATUSES.map((status) => (
          <FilterChip
            key={status}
            href={`/admin/memory-box?status=${status}`}
            active={statusFilter === status}
          >
            {MEMORY_BOX_STATUS_LABELS[status]}
          </FilterChip>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="mt-10">
          <AdminEmptyState
            icon={Package}
            title="No Memory Box orders yet"
            description="When someone submits the Family Memory Box form, their request will appear here."
          />
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-ink/10 rounded-xl border border-ink/10 bg-canvas">
          {orders.map((order) => (
            <li key={order.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="font-medium text-ink">{order.fullName}</p>
                    <p className="text-xs text-ink-muted">
                      {formatMemoryBoxPrice(order.priceCents)}
                    </p>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        order.paymentStatus === "paid"
                          ? "bg-accent/15 text-accent-deep"
                          : order.paymentStatus === "manual_follow_up"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-ink/8 text-ink-muted",
                      )}
                    >
                      {MEMORY_BOX_PAYMENT_LABELS[order.paymentStatus]}
                    </span>
                    <p className="text-xs text-ink-muted">
                      {formatWhen(order.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm text-ink-muted">
                    <a
                      href={`mailto:${order.email}`}
                      className="text-accent-deep hover:underline"
                    >
                      {order.email}
                    </a>
                    {" · "}
                    <a
                      href={`tel:${order.phone}`}
                      className="hover:underline"
                    >
                      {order.phone}
                    </a>
                  </p>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {formatAddress(order)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Est. {order.estimatedPhotos} photos ·{" "}
                    {order.estimatedVideoTapes} tapes ·{" "}
                    {order.estimatedFilmReels} reels
                    {order.otherItemsNotes
                      ? ` · Other: ${order.otherItemsNotes}`
                      : null}
                  </p>
                  {order.customerNotes ? (
                    <p className="text-xs leading-relaxed text-ink">
                      <span className="text-ink-muted">Notes: </span>
                      {order.customerNotes}
                    </p>
                  ) : null}
                  <p className="font-mono text-[10px] text-ink-muted">
                    {order.id}
                    {order.userId ? ` · user ${order.userId}` : " · guest"}
                  </p>
                </div>
                <MemoryBoxStatusSelect
                  orderId={order.id}
                  status={order.status}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-accent/15 text-accent-deep"
          : "bg-ink/5 text-ink-muted hover:bg-ink/10 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
