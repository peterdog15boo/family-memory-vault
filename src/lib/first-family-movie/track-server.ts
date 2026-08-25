/**
 * Server-side First Family Movie funnel logging.
 */

import type {
  FirstMovieFunnelEvent,
  FirstMovieFunnelProps,
} from "@/lib/first-family-movie/funnel";
import { LogEvents } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";

export function logFirstMovieFunnelEvent(
  event: FirstMovieFunnelEvent,
  fields?: FirstMovieFunnelProps & { userId?: string },
): void {
  logger.info(LogEvents.firstMovieFunnel, {
    funnelEvent: event,
    ...fields,
  });
}
