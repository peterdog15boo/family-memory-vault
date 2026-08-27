import { IdleSessionResumeGate } from "@/components/session/IdleSessionResumeGate";

/**
 * Legal agree is post-auth and outside the vault shell. Expire dead sessions
 * before the form; keepalive on the form keeps a fresh login's clock alive.
 */
export default function LegalAgreeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <IdleSessionResumeGate>{children}</IdleSessionResumeGate>;
}
