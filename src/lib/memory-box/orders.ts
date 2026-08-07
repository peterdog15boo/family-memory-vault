import { desc, eq, inArray, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getEnvAdminUserIds } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import {
  MEMORY_BOX_ORDER_STATUSES,
  MEMORY_BOX_PRICE_CENTS,
  memoryBoxOrders,
  users,
  type MemoryBoxOrder,
  type MemoryBoxOrderStatus,
  type MemoryBoxPaymentStatus,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { memoryBoxOrderAdminEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/env";
import { formatMemoryBoxPrice } from "@/lib/memory-box/constants";

export {
  formatMemoryBoxPrice,
  MEMORY_BOX_STATUS_LABELS,
} from "@/lib/memory-box/constants";

const optionalCount = z.coerce
  .number()
  .int()
  .min(0, "Must be zero or greater")
  .max(100_000, "That count looks too high")
  .default(0);

export const memoryBoxOrderInputSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  email: z.string().trim().email("Enter a valid email").max(320),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a phone number")
    .max(40, "Phone number is too long"),
  addressLine1: z.string().trim().min(1, "Address is required").max(200),
  addressLine2: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  city: z.string().trim().min(1, "City is required").max(120),
  state: z.string().trim().min(1, "State is required").max(80),
  postalCode: z.string().trim().min(2, "Postal code is required").max(20),
  country: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .default("US")
    .transform((v) => v || "US"),
  estimatedPhotos: optionalCount,
  estimatedVideoTapes: optionalCount,
  estimatedFilmReels: optionalCount,
  otherItemsNotes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  customerNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  estimatesAcknowledged: z.boolean().refine((v) => v === true, {
    message:
      "Please confirm approximate counts, the 5–8 week processing timeline after we receive your box, and that files appear in Photos when ready",
  }),
});

export type MemoryBoxOrderInput = z.infer<typeof memoryBoxOrderInputSchema>;

export const memoryBoxOrderStatusSchema = z.enum(MEMORY_BOX_ORDER_STATUSES);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve admin / ops inboxes for new Memory Box orders.
 * Prefers MEMORY_BOX_NOTIFY_EMAIL, then ADMIN_NOTIFY_EMAIL, then DB admins.
 */
export async function getMemoryBoxNotifyEmails(): Promise<string[]> {
  const configured =
    process.env.MEMORY_BOX_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_NOTIFY_EMAIL?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  const db = getDb();
  const envIds = getEnvAdminUserIds();
  const conditions =
    envIds.length > 0
      ? or(eq(users.isAdmin, true), inArray(users.id, envIds))
      : eq(users.isAdmin, true);

  const adminRows = await db
    .select({ email: users.email })
    .from(users)
    .where(conditions);

  return [
    ...new Set(
      adminRows
        .map((r) => r.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];
}

export async function createMemoryBoxOrder(options: {
  input: MemoryBoxOrderInput;
  userId?: string | null;
  /** How payment will be handled for this order. */
  paymentStatus?: MemoryBoxPaymentStatus;
}): Promise<MemoryBoxOrder> {
  const input = options.input;
  const db = getDb();
  const now = new Date();
  const id = nanoid();
  const paymentStatus = options.paymentStatus ?? "unpaid";

  const [row] = await db
    .insert(memoryBoxOrders)
    .values({
      id,
      userId: options.userId?.trim() || null,
      fullName: input.fullName,
      email: normalizeEmail(input.email),
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      estimatedPhotos: input.estimatedPhotos,
      estimatedVideoTapes: input.estimatedVideoTapes,
      estimatedFilmReels: input.estimatedFilmReels,
      otherItemsNotes: input.otherItemsNotes ?? null,
      customerNotes: input.customerNotes ?? null,
      estimatesAcknowledged: true,
      status: "requested",
      paymentStatus,
      priceCents: MEMORY_BOX_PRICE_CENTS,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to save Family Memory Box order.");
  }
  return row;
}

export async function getMemoryBoxOrderById(
  orderId: string,
): Promise<MemoryBoxOrder | null> {
  if (!orderId?.trim()) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(memoryBoxOrders)
    .where(eq(memoryBoxOrders.id, orderId.trim()))
    .limit(1);
  return row ?? null;
}

export async function listMemoryBoxOrders(options?: {
  status?: MemoryBoxOrderStatus | "all";
  limit?: number;
}): Promise<MemoryBoxOrder[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const status = options?.status && options.status !== "all" ? options.status : null;

  if (status) {
    return db
      .select()
      .from(memoryBoxOrders)
      .where(eq(memoryBoxOrders.status, status))
      .orderBy(desc(memoryBoxOrders.createdAt))
      .limit(limit);
  }

  return db
    .select()
    .from(memoryBoxOrders)
    .orderBy(desc(memoryBoxOrders.createdAt))
    .limit(limit);
}

export async function updateMemoryBoxOrderStatus(options: {
  orderId: string;
  status: MemoryBoxOrderStatus;
}): Promise<MemoryBoxOrder> {
  const db = getDb();
  const [row] = await db
    .update(memoryBoxOrders)
    .set({
      status: options.status,
      updatedAt: new Date(),
    })
    .where(eq(memoryBoxOrders.id, options.orderId))
    .returning();

  if (!row) {
    throw new Error("Memory Box order not found.");
  }
  return row;
}

export async function notifyAdminsOfMemoryBoxOrder(
  order: MemoryBoxOrder,
): Promise<{ emailed: boolean; logged?: boolean; error?: string }> {
  const recipients = await getMemoryBoxNotifyEmails();
  if (recipients.length === 0) {
    console.warn(
      "[memory-box] No admin notify emails configured; order saved without email",
      { orderId: order.id },
    );
    return { emailed: false, error: "No notify recipients" };
  }

  const content = memoryBoxOrderAdminEmail({
    orderId: order.id,
    fullName: order.fullName,
    email: order.email,
    phone: order.phone,
    addressLines: [
      order.addressLine1,
      order.addressLine2,
      `${order.city}, ${order.state} ${order.postalCode}`,
      order.country,
    ].filter((line): line is string => Boolean(line?.trim())),
    estimatedPhotos: order.estimatedPhotos,
    estimatedVideoTapes: order.estimatedVideoTapes,
    estimatedFilmReels: order.estimatedFilmReels,
    otherItemsNotes: order.otherItemsNotes,
    specialInstructions: order.customerNotes,
    priceLabel: formatMemoryBoxPrice(order.priceCents),
    paymentStatus: order.paymentStatus,
    adminUrl: `${getAppUrl()}/admin/memory-box`,
    linkedUserId: order.userId,
  });

  const result = await sendEmail({
    to: recipients,
    subject: content.subject,
    html: content.html,
    text: content.text,
    tags: [{ name: "template", value: "memory_box_order_admin" }],
  });

  if (!result.ok) {
    console.error("[memory-box] admin notify email failed", {
      orderId: order.id,
      error: result.error,
    });
    return { emailed: false, error: result.error };
  }

  if (result.logged) {
    console.info("[memory-box] admin notify logged (RESEND unset)", {
      orderId: order.id,
      to: recipients,
    });
    return { emailed: false, logged: true };
  }

  return { emailed: true };
}
