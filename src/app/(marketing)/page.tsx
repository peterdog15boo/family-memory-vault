import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/marketing/LandingPage";
import { APP_HOME_PATH } from "@/lib/routes";

/**
 * Marketing homepage. Authenticated users go straight into the app —
 * legal gates (beta NDA / terms) run in the app layout after this redirect.
 */
export default async function Home() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect(APP_HOME_PATH);
  }
  return <LandingPage />;
}
