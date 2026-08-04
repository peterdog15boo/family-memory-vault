import { AssistantPageClient } from "@/components/assistant/AssistantPageClient";

type AssistantPageProps = {
  searchParams?: Promise<{ c?: string; prompt?: string }>;
};

/**
 * Ask AI — deep links with ?c= resume a conversation on the page;
 * otherwise the floating panel is the primary experience.
 */
export default async function AssistantPage({ searchParams }: AssistantPageProps) {
  const params = searchParams ? await searchParams : {};
  const conversationId = params.c?.trim() || null;
  const prompt = params.prompt?.trim() || null;

  return (
    <AssistantPageClient conversationId={conversationId} prompt={prompt} />
  );
}
