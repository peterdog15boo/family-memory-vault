/**
 * Weekly retention email HTML/text (English-first).
 */

import type { EmailContent } from "@/lib/email/templates";
import type { RetentionTipCard } from "@/lib/retention/types";

const BRAND = "Family Memory Vault";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function greetingName(firstName?: string | null): string {
  return firstName?.trim() || "there";
}

export function retentionWeeklyEmail(data: {
  firstName?: string | null;
  tip: RetentionTipCard;
  subject: string;
  ctaUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
  mediaCount: number;
  peopleCount: number;
  memoryCount: number;
}): EmailContent {
  const name = greetingName(data.firstName);
  const counts = [
    data.mediaCount > 0 ? `${data.mediaCount} photo${data.mediaCount === 1 ? "" : "s"}` : null,
    data.memoryCount > 0
      ? `${data.memoryCount} memor${data.memoryCount === 1 ? "y" : "ies"}`
      : null,
    data.peopleCount > 0
      ? `${data.peopleCount} named people`
      : null,
  ].filter(Boolean);

  const vaultLine =
    counts.length > 0
      ? `In your vault today: ${counts.join(", ")}.`
      : `Your vault is ready whenever you are.`;

  const upgradeLine = data.tip.upgradeNote?.trim()
    ? data.tip.upgradeNote
    : null;

  const text = [
    `Hi ${name},`,
    ``,
    data.tip.description,
    ``,
    vaultLine,
    upgradeLine ? `` : null,
    upgradeLine,
    ``,
    `${data.tip.ctaLabel}:`,
    data.ctaUrl,
    ``,
    `Manage email: ${data.manageUrl}`,
    `Unsubscribe from weekly ideas: ${data.unsubscribeUrl}`,
    ``,
    `— ${BRAND}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const bodyParts = [
    `Hi ${escapeHtml(name)},`,
    escapeHtml(data.tip.description),
    escapeHtml(vaultLine),
  ];
  if (upgradeLine) {
    bodyParts.push(escapeHtml(upgradeLine));
  }

  const bodyHtml = bodyParts
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3d342c;">${p}</p>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f0ea;font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(data.tip.description)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0ea;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#fffaf6;border-radius:12px;padding:28px 24px;border:1px solid #e8dfd2;">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#9a7b68;">${BRAND}</p>
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#2a2420;">${escapeHtml(data.tip.title)}</h1>
          ${bodyHtml}
          <p style="margin:24px 0 8px;">
            <a href="${escapeHtml(data.ctaUrl)}"
               style="display:inline-block;background:#4a7c6f;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">
              ${escapeHtml(data.tip.ctaLabel)}
            </a>
          </p>
          <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a7a6c;">
            <a href="${escapeHtml(data.manageUrl)}" style="color:#4a7c6f;">Manage email</a>
            &nbsp;·&nbsp;
            <a href="${escapeHtml(data.unsubscribeUrl)}" style="color:#4a7c6f;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: data.subject,
    text,
    html,
  };
}
