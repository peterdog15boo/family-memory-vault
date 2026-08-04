import Stripe from "stripe";
import { requireStripeSecretKey } from "@/lib/stripe/config";

let _stripe: Stripe | null = null;

/**
 * Shared Stripe SDK client (lazy). Throws when STRIPE_SECRET_KEY is missing.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireStripeSecretKey(), {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}
