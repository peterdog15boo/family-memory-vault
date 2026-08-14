/**
 * Lightweight HTML email templates for Family Memory Vault.
 * Inline styles for broad client support — keep copy warm and clear.
 */

import { getAppUrl } from "@/lib/env";
import {
  BETA_DISCORD_BLURB,
  BETA_DISCORD_CTA_LABEL,
  getBetaDiscordUrl,
} from "@/lib/beta-discord";
import { discordIconEmailHtml } from "@/components/icons/DiscordIcon";
import {
  createTranslator,
  DEFAULT_LOCALE,
  type AppLocale,
} from "@/lib/i18n";

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
  /** Optional second button (e.g. Discord) under the primary CTA. */
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  /** Optional decorative HTML (e.g. inline SVG) before the secondary label. */
  secondaryCtaLeadingHtml?: string;
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

  const secondaryLeading = options.secondaryCtaLeadingHtml ?? "";
  const secondaryCta =
    options.secondaryCtaLabel && options.secondaryCtaHref
      ? `
      <p style="margin:12px 0 8px;">
        <a href="${escapeHtml(options.secondaryCtaHref)}"
           style="display:inline-block;background:#ffffff;color:#4a7c6f;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px;border:1px solid #4a7c6f;line-height:1.2;">
          ${secondaryLeading}${escapeHtml(options.secondaryCtaLabel)}
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
              ${secondaryCta}
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
  const discordUrl = getBetaDiscordUrl();
  const subject = `Welcome to ${BRAND}`;
  const text = [
    `Hi ${name},`,
    ``,
    `Welcome to ${BRAND} — a private place to keep family photos, videos, and memory movies safe.`,
    ``,
    `Every upload is checked for safety before it can appear in Photos.`,
    ``,
    `Open your vault: ${href}`,
    ``,
    BETA_DISCORD_BLURB,
    `${BETA_DISCORD_CTA_LABEL}: ${discordUrl}`,
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
        BETA_DISCORD_BLURB,
      ]),
      ctaLabel: "Open your vault",
      ctaHref: href,
      secondaryCtaLabel: BETA_DISCORD_CTA_LABEL,
      secondaryCtaHref: discordUrl,
      secondaryCtaLeadingHtml: discordIconEmailHtml("#5865F2"),
    }),
  };
}

export function familyInviteEmail(data: {
  inviteeName?: string | null;
  inviterName: string;
  familyName: string;
  role?: string | null;
  inviteUrl: string;
  /** Recipient UI locale; defaults to English. */
  locale?: AppLocale;
}): EmailContent {
  const t = createTranslator(data.locale ?? DEFAULT_LOCALE);
  const who =
    data.inviteeName?.trim() || t("emails.invite.greetingFallback");
  const rolePart = data.role
    ? t("emails.invite.rolePart", { role: data.role })
    : "";
  const subject = t("emails.invite.subject", {
    inviter: data.inviterName,
    family: data.familyName,
  });
  const text = [
    t("emails.invite.greeting", { name: who }),
    ``,
    t("emails.invite.body1", {
      inviter: data.inviterName,
      family: data.familyName,
      rolePart,
    }),
    ``,
    t("emails.invite.body2"),
    ``,
    t("emails.invite.acceptLabel"),
    data.inviteUrl,
    ``,
    t("emails.invite.pasteHint"),
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: t("emails.invite.preview", { inviter: data.inviterName }),
      heading: t("emails.invite.heading"),
      bodyHtml: paragraphs([
        t("emails.invite.body1", {
          inviter: data.inviterName,
          family: data.familyName,
          rolePart,
        }),
        t("emails.invite.body2"),
        t("emails.invite.body3"),
      ]),
      ctaLabel: t("emails.invite.cta"),
      ctaHref: data.inviteUrl,
      plainLinkHref: data.inviteUrl,
      footerNote: t("emails.invite.footer", { inviter: data.inviterName }),
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

export function feedbackSubmissionAdminEmail(data: {
  ticketId: string;
  mode: "bug" | "feature";
  title: string;
  description: string;
  category: string;
  status: string;
  severity?: string | null;
  expectedBehavior?: string | null;
  problemStatement?: string | null;
  suggestedSolution?: string | null;
  email?: string | null;
  userId?: string | null;
  pageUrl: string;
  pathname: string;
  browser?: string | null;
  os?: string | null;
  viewport?: string | null;
  screenshotKey?: string | null;
  consoleErrors?: string[];
  clientTimestamp?: string | null;
  adminUrl?: string;
}): EmailContent {
  const kind = data.mode === "bug" ? "Bug report" : "Feature request";
  const subject = `${data.ticketId} — ${kind}: ${data.title}`;
  const consoleBlock =
    data.consoleErrors && data.consoleErrors.length > 0
      ? data.consoleErrors.map((line) => `  - ${line}`).join("\n")
      : "  (none)";

  const text = [
    `New beta feedback — ${kind}`,
    ``,
    `Ticket: ${data.ticketId}`,
    `Status: ${data.status}`,
    `Category: ${data.category}`,
    data.severity ? `Severity: ${data.severity}` : null,
    `Title: ${data.title}`,
    ``,
    `Description:`,
    data.description,
    data.expectedBehavior ? `\nExpected:\n${data.expectedBehavior}` : null,
    data.problemStatement ? `\nProblem:\n${data.problemStatement}` : null,
    data.suggestedSolution ? `\nSuggested:\n${data.suggestedSolution}` : null,
    ``,
    `Reporter: ${data.email ?? "(no email)"}`,
    `User ID: ${data.userId ?? "(unknown)"}`,
    `Page: ${data.pageUrl}`,
    `Path: ${data.pathname}`,
    `Browser: ${data.browser ?? "?"} · OS: ${data.os ?? "?"}`,
    data.viewport ? `Viewport: ${data.viewport}` : null,
    data.clientTimestamp ? `Client time: ${data.clientTimestamp}` : null,
    data.screenshotKey ? `Screenshot (R2): ${data.screenshotKey}` : "Screenshot: (none)",
    ``,
    `Console errors:`,
    consoleBlock,
    data.adminUrl ? `\nAdmin: ${data.adminUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const bodyLines = [
    `<strong>Ticket:</strong> ${escapeHtml(data.ticketId)}`,
    `<strong>Type:</strong> ${escapeHtml(kind)}`,
    `<strong>Status:</strong> ${escapeHtml(data.status)}`,
    `<strong>Category:</strong> ${escapeHtml(data.category)}`,
    data.severity
      ? `<strong>Severity:</strong> ${escapeHtml(data.severity)}`
      : null,
    `<strong>Title:</strong> ${escapeHtml(data.title)}`,
    `<strong>Description:</strong><br/>${escapeHtml(data.description).replace(/\n/g, "<br/>")}`,
    data.expectedBehavior
      ? `<strong>Expected:</strong><br/>${escapeHtml(data.expectedBehavior).replace(/\n/g, "<br/>")}`
      : null,
    data.problemStatement
      ? `<strong>Problem:</strong><br/>${escapeHtml(data.problemStatement).replace(/\n/g, "<br/>")}`
      : null,
    data.suggestedSolution
      ? `<strong>Suggested:</strong><br/>${escapeHtml(data.suggestedSolution).replace(/\n/g, "<br/>")}`
      : null,
    `<strong>Reporter:</strong> ${escapeHtml(data.email ?? "(no email)")}`,
    `<strong>User ID:</strong> ${escapeHtml(data.userId ?? "(unknown)")}`,
    `<strong>Page:</strong> ${escapeHtml(data.pageUrl)}`,
    `<strong>Browser / OS:</strong> ${escapeHtml(`${data.browser ?? "?"} · ${data.os ?? "?"}`)}`,
    data.viewport
      ? `<strong>Viewport:</strong> ${escapeHtml(data.viewport)}`
      : null,
    data.screenshotKey
      ? `<strong>Screenshot key:</strong> <code>${escapeHtml(data.screenshotKey)}</code>`
      : `<strong>Screenshot:</strong> none`,
  ].filter((line): line is string => Boolean(line));

  return {
    subject,
    text,
    html: layout({
      preview: `${data.ticketId} — ${kind}: ${data.title}`,
      heading: "New beta feedback",
      bodyHtml: paragraphs(bodyLines),
      ctaLabel: data.adminUrl ? "Open admin" : undefined,
      ctaHref: data.adminUrl,
      footerNote: `Internal notification from ${BRAND}.`,
    }),
  };
}

export function milestoneEmail(data: {
  firstName?: string | null;
  badgeTitle: string;
  badgeBody?: string | null;
  href?: string;
}): EmailContent {
  const name = data.firstName?.trim() || "there";
  const href = data.href ?? appUrl("/dashboard");
  const title = data.badgeTitle.trim() || "A new milestone";
  const subject = `${title} — Family Memory Vault`;
  const detail =
    data.badgeBody?.trim() ||
    "A quiet milestone in your family vault — worth a look when you have a moment.";

  const text = [
    `Hi ${name},`,
    ``,
    title,
    ``,
    detail,
    ``,
    `Open your vault: ${href}`,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      preview: title,
      heading: title,
      bodyHtml: paragraphs([
        `Hi ${name},`,
        detail,
        "There’s no rush — this note is just so the moment isn’t easy to miss.",
      ]),
      ctaLabel: "Open your vault",
      ctaHref: href,
    }),
  };
}

export { appUrl as emailAppUrl };
