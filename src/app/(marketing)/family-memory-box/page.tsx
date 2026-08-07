import { auth, currentUser } from "@clerk/nextjs/server";
import { FamilyMemoryBoxPage } from "@/components/marketing/FamilyMemoryBoxPage";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

export const metadata = {
  title: "Family Memory Box — Digitize photos & tapes | Family Memory Vault",
  description:
    "Order a Family Memory Box for $199. Digitized photos and tapes appear automatically in your Photos page. Box arrives in about 2 weeks; processing takes about 5–8 weeks after we receive it.",
};

/**
 * Customer-facing digitizing offer — physical media → vault Photos.
 */
export default async function FamilyMemoryBoxRoute() {
  const { userId, isAuthenticated } = await auth();
  const isSignedIn = Boolean(isAuthenticated && userId);
  const stripeCheckoutEnabled = isStripeConfigured();

  let accountDefaults: {
    fullName?: string;
    email?: string;
  } | null = null;

  if (isSignedIn && userId) {
    try {
      await ensureAppUser(userId);
      const clerkUser = await currentUser();
      const email =
        clerkUser?.primaryEmailAddress?.emailAddress ||
        clerkUser?.emailAddresses[0]?.emailAddress ||
        undefined;
      const fullName =
        clerkUser?.fullName ||
        [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
        undefined;
      accountDefaults = {
        fullName: fullName || undefined,
        email: email || undefined,
      };
    } catch (error) {
      console.error("[family-memory-box] ensureAppUser failed", error);
    }
  }

  return (
    <FamilyMemoryBoxPage
      isSignedIn={isSignedIn}
      stripeCheckoutEnabled={stripeCheckoutEnabled}
      accountDefaults={accountDefaults}
    />
  );
}
