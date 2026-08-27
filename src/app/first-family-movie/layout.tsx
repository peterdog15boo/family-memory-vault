import { IdleSessionResumeGate } from "@/components/session/IdleSessionResumeGate";

/**
 * Ritual sits outside the vault shell but is still an authenticated visit.
 * Gate expired continuous sessions before the welcome UI paints.
 */
export default function FirstFamilyMovieLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <IdleSessionResumeGate>{children}</IdleSessionResumeGate>;
}
