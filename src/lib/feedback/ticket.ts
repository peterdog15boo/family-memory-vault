/**
 * Human-readable feedback ticket IDs (e.g. FMV-A7K2PQ).
 */

import { customAlphabet } from "nanoid";

/** Avoid ambiguous characters (0/O, 1/I/L). */
const ticketAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export function generateFeedbackTicketId(): string {
  return `FMV-${ticketAlphabet()}`;
}
