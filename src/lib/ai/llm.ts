/**
 * Minimal OpenAI-compatible chat client for structured JSON responses.
 *
 * Supports OpenAI, Neon AI Gateway, or any `/v1/chat/completions` endpoint.
 * No SDK dependency — keeps the assistant stack light and easy to mock in tests.
 */

export type ChatJsonMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonCompletionInput = {
  messages: ChatJsonMessage[];
  /** Override model; defaults to env AI_INTENT_MODEL / OPENAI_MODEL. */
  model?: string;
  temperature?: number;
  /** Abort / timeout signal. */
  signal?: AbortSignal;
};

export type ChatJsonCompletionResult = {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
};

export type ChatJsonCompleter = (
  input: ChatJsonCompletionInput,
) => Promise<ChatJsonCompletionResult>;

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Resolve credentials for an OpenAI-compatible JSON chat endpoint.
 * Returns null when no key is configured (callers should use fallback parsing).
 */
export function resolveLlmConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const apiKey =
    trim(process.env.OPENAI_API_KEY) ||
    trim(process.env.AI_GATEWAY_API_KEY) ||
    trim(process.env.NEON_AI_API_KEY);
  if (!apiKey) return null;

  const baseUrl = (
    trim(process.env.OPENAI_BASE_URL) ||
    trim(process.env.AI_GATEWAY_BASE_URL) ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");

  const model =
    trim(process.env.AI_INTENT_MODEL) ||
    trim(process.env.OPENAI_MODEL) ||
    "gpt-4o-mini";

  return { apiKey, baseUrl, model };
}

export function isLlmConfigured(): boolean {
  return resolveLlmConfig() !== null;
}

/**
 * Call chat.completions with `response_format: json_object`.
 * Throws on HTTP / empty content errors so callers can fall back.
 */
export async function completeChatJson(
  input: ChatJsonCompletionInput,
): Promise<ChatJsonCompletionResult> {
  const config = resolveLlmConfig();
  if (!config) {
    throw new Error("LLM is not configured (missing OPENAI_API_KEY / AI gateway key).");
  }

  const model = input.model ?? config.model;
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0,
      response_format: { type: "json_object" },
      messages: input.messages,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `LLM request failed (${response.status}): ${body.slice(0, 240)}`,
    );
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("LLM returned empty content.");
  }

  return {
    content,
    model: data.model ?? model,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
  };
}
