/**
 * Lightweight HTML email templates for Family Memory Vault.
 * Inline styles for broad client support — keep copy warm and clear.
 */

import { getAppUrl } from "@/lib/env";

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

const BRAND = "Family Memory Vault";

function appUrl(path = "/"): string {
  const base = getAppUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(options: {
  preview: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Shown under the CTA for clients that strip buttons */
  plainLinkHref?: string;
  footerNote?: string;
}): string {
  const cta =
    options.ctaLabel && options.ctaHref
      ? `
      <p style="margin:28px 0 8px;">
        <a href="${escapeHtml(options.ctaHref)}"
           style="display:inline-block;background:#4a7c6f;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">
          ${escapeHtml(options.ctaLabel)}
        </a>
      </p>`
      : "";

  const plainLink =
    options.plainLinkHref
      ? `
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6a6560;word-break:break-all;">
        Or paste this link into your browser:<br />
        <a href="${escapeHtml(options.plainLinkHref)}" style="color:#4a7c6f;">${escapeHtml(options.plainLinkHref)}</a>
      </p>`
      : "";

  const footer = escapeHtml(
    options.footerNote ??
      `You’re receiving this because you have an account with ${BRAND}.`,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffcf8;border:1px solid #e8e0d6;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;background:linear-gradient(180deg,#eef6f3 0%,#fffcf8 100%);">
              <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#4a7c6f;font-weight:600;">
                ${escapeHtml(BRAND)}
              </p>
              <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;color:#2a2825;font-weight:normal;">
                ${escapeHtml(options.heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#4a4641;">
              ${options.bodyHtml}
              ${cta}
              ${plainLink}
              <p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#8a847c;">
                ${footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function paragraphs(lines: string[]): string {
  return lines
    .map(
      (line) =>
        `<p style="margin:0 0 14px;">${escapeHtml(line)}</p>`,
    )
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

export function welcomeEmail(data: {
  firstName?: string | null;
}): EmailContent {
  const name = data.firstName?.trim() || "there";
  const href = appUrl("/dashboard");
  const subject = `Welcome to ${BRAND}`;
  const text = [
    `Hi ${name},`,
    ``,
    `Welcome to ${BRAND} — a private place to keep family photos, videos, and memory movies safe.`,
    ``,
    `Every upload is checked for safety before it can appear in Photos.`,
    ``,
    `Open your vault: ${href}`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: "Your private family vault is ready.",
      heading: `Welcome, ${name}`,
      bodyHtml: paragraphs([
        `Your vault is ready. Upload photos and videos, gather them into memories, and turn special moments into short movies — all with safety checks built in.`,
        `Start with a few photos from a recent gathering, or invite family when you’re ready to share.`,
      ]),
      ctaLabel: "Open your vault",
      ctaHref: href,
    }),
  };
}

export function familyInviteEmail(data: {
  inviteeName?: string | null;
  inviterName: string;
  familyName: string;
  role?: string | null;
  inviteUrl: string;
}): EmailContent {
  const who = data.inviteeName?.trim() || "there";
  const rolePart = data.role ? ` as a ${data.role}` : "";
  const subject = `${data.inviterName} invited you to ${data.familyName}`;
  const text = [
    `Hi ${who},`,
    ``,
    `${data.inviterName} invited you to join "${data.familyName}" on ${BRAND}${rolePart}.`,
    ``,
    `${BRAND} is a private place for your family to keep photos, videos, and shared memories together — safely, and only with people you invite.`,
    ``,
    `Accept the invitation:`,
    data.inviteUrl,
    ``,
    `If the button doesn’t work, paste the link above into your browser.`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: `${data.inviterName} invited you to share family memories.`,
      heading: "You're invited",
      bodyHtml: paragraphs([
        `${data.inviterName} invited you to join “${data.familyName}” on ${BRAND}${rolePart}.`,
        `${BRAND} is a private place for your family to keep photos, videos, and shared memories together — safely, and only with people you invite.`,
        `Join to see shared memories and help preserve your family’s photos together.`,
      ]),
      ctaLabel: "Accept invitation",
      ctaHref: data.inviteUrl,
      plainLinkHref: data.inviteUrl,
      footerNote: `This invitation was sent by ${data.inviterName} via ${BRAND}. If you weren’t expecting it, you can ignore this email.`,
    }),
  };
}

export function movieReadyEmail(data: {
  firstName?: string | null;
  movieTitle: string;
  movieUrl?: string;
}): EmailContent {
  const name = data.firstName?.trim() || "there";
  const href = data.movieUrl ?? appUrl("/movies");
  const subject = `Your movie “${data.movieTitle}” is ready`;
  const text = [
    `Hi ${name},`,
    ``,
    `Good news — “${data.movieTitle}” has finished rendering and is ready to watch.`,
    ``,
    `Watch it here: ${href}`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: `“${data.movieTitle}” is ready to watch.`,
      heading: "Your movie is ready",
      bodyHtml: paragraphs([
        `“${data.movieTitle}” finished rendering and is waiting in your vault.`,
        `Open it anytime to watch or download.`,
      ]),
      ctaLabel: "Watch movie",
      ctaHref: href,
    }),
  };
}

export function storageWarningEmail(data: {
  firstName?: string | null;
  percentUsed: number;
  planName?: string;
  usedLabel?: string;
}): EmailContent {
  const name = data.firstName?.trim() || "there";
  const pct = Math.round(data.percentUsed);
  const full = pct >= 100;
  const href = appUrl("/billing");
  const plan = data.planName ? ` on your ${data.planName} plan` : "";
  const used = data.usedLabel ? ` (${data.usedLabel})` : "";

  const subject = full
    ? "Your vault storage is full"
    : `Your vault is ${pct}% full`;

  const text = [
    `Hi ${name},`,
    ``,
    full
      ? `Your storage${plan} is full${used}. New uploads are paused until you free space or upgrade.`
      : `You've used ${pct}% of your storage${plan}${used}. Consider upgrading before you run out of room.`,
    ``,
    `Manage storage & plans: ${href}`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: full
        ? "Uploads are paused until you free space or upgrade."
        : `You've used ${pct}% of your storage.`,
      heading: full ? "Storage is full" : "Storage is getting full",
      bodyHtml: paragraphs([
        full
          ? `Your vault storage${plan} is full${used}. New uploads are paused — your existing memories are safe.`
          : `You've used ${pct}% of your storage${plan}${used}. Free up space or upgrade when you're ready so uploads keep flowing.`,
      ]),
      ctaLabel: "View usage & plans",
      ctaHref: href,
    }),
  };
}

export function paymentSuccessEmail(data: {
  firstName?: string | null;
  planName: string;
  amountLabel?: string;
  billingUrl?: string;
}): EmailContent {
  const name = data.firstName?.trim() || "there";
  const href = data.billingUrl ?? appUrl("/billing");
  const amount = data.amountLabel ? ` (${data.amountLabel})` : "";
  const subject = `You're on ${data.planName}`;
  const text = [
    `Hi ${name},`,
    ``,
    `Thanks — your payment for the ${data.planName} plan${amount} went through.`,
    ``,
    `View billing: ${href}`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: `Your ${data.planName} plan is active.`,
      heading: "Payment received",
      bodyHtml: paragraphs([
        `Thanks — your payment for the ${data.planName} plan${amount} went through. Enjoy the extra room for memories.`,
      ]),
      ctaLabel: "View billing",
      ctaHref: href,
    }),
  };
}

export function paymentFailedEmail(data: {
  firstName?: string | null;
  planName?: string;
  billingUrl?: string;
}): EmailContent {
  const name = data.firstName?.trim() || "there";
  const href = data.billingUrl ?? appUrl("/billing");
  const plan = data.planName ? ` for ${data.planName}` : "";
  const subject = "We couldn't process your payment";
  const text = [
    `Hi ${name},`,
    ``,
    `We couldn't process your latest payment${plan}. Please update your payment method so your plan stays active.`,
    ``,
    `Update billing: ${href}`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: "Please update your payment method.",
      heading: "Payment needs attention",
      bodyHtml: paragraphs([
        `We couldn’t process your latest payment${plan}. Update your payment method so your plan and storage stay uninterrupted.`,
      ]),
      ctaLabel: "Update billing",
      ctaHref: href,
    }),
  };
}

/** Internal ops alert when a Family Memory Box order is submitted. */
export function memoryBoxOrderAdminEmail(data: {
  orderId: string;
  fullName: string;
  email: string;
  phone: string;
  addressLines: string[];
  estimatedPhotos: number;
  estimatedVideoTapes: number;
  estimatedFilmReels: number;
  otherItemsNotes?: string | null;
  specialInstructions?: string | null;
  priceLabel?: string;
  paymentStatus?: string | null;
  adminUrl?: string;
  linkedUserId?: string | null;
}): EmailContent {
  const subject = `New Family Memory Box order — ${data.fullName}`;
  const address = data.addressLines.join("\n");
  const priceLine = data.priceLabel ? `Price: ${data.priceLabel}` : null;
  const paymentLine = data.paymentStatus
    ? `Payment: ${data.paymentStatus}`
    : null;
  const accountLine = data.linkedUserId
    ? `Linked account: ${data.linkedUserId}`
    : "Guest order (match via name/email/phone later)";
  const text = [
    `New Family Memory Box order`,
    ``,
    `Order ID: ${data.orderId}`,
    accountLine,
    `Name: ${data.fullName}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone}`,
    priceLine,
    paymentLine,
    ``,
    `Address:`,
    address,
    ``,
    `Estimates:`,
    `  Photos: ${data.estimatedPhotos}`,
    `  Video tapes: ${data.estimatedVideoTapes}`,
    `  Film reels: ${data.estimatedFilmReels}`,
    data.otherItemsNotes ? `  Other: ${data.otherItemsNotes}` : null,
    data.specialInstructions
      ? `\nCustomer notes:\n${data.specialInstructions}`
      : null,
    data.adminUrl ? `\nAdmin: ${data.adminUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const bodyLines = [
    `${data.fullName} ordered a Family Memory Box${data.priceLabel ? ` (${data.priceLabel})` : ""}.`,
    data.linkedUserId
      ? `Linked to account ${data.linkedUserId}.`
      : "Guest order — match later via contact details.",
    data.paymentStatus
      ? `Payment status: ${data.paymentStatus}.`
      : "Payment status unknown.",
    `Email: ${data.email} · Phone: ${data.phone}`,
    `Address: ${data.addressLines.join(", ")}`,
    `Estimates — photos: ${data.estimatedPhotos}, tapes: ${data.estimatedVideoTapes}, reels: ${data.estimatedFilmReels}.`,
  ];
  if (data.otherItemsNotes) {
    bodyLines.push(`Other items: ${data.otherItemsNotes}`);
  }
  if (data.specialInstructions) {
    bodyLines.push(`Notes: ${data.specialInstructions}`);
  }
  bodyLines.push(`Order ID: ${data.orderId}`);

  return {
    subject,
    text,
    html: layout({
      preview: `New Memory Box order from ${data.fullName}.`,
      heading: "New Memory Box order",
      bodyHtml: paragraphs(bodyLines),
      ctaLabel: data.adminUrl ? "View orders" : undefined,
      ctaHref: data.adminUrl,
      footerNote: `Internal notification from ${BRAND}.`,
    }),
  };
}

export { appUrl as emailAppUrl };
