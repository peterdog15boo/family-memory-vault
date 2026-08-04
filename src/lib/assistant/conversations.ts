/**
 * Persistence helpers for NL assistant conversations, messages, and actions.
 *
 * All reads/writes are user-scoped where applicable to prevent cross-user access.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  assistantActions,
  assistantConversations,
  assistantMessages,
  type AssistantActionRow,
  type AssistantConversationRow,
  type AssistantMessageRow,
} from "@/lib/db/schema";
import type {
  AssistantActionResult,
  AssistantActionStatus,
  AssistantActionType,
  AssistantIntent,
  AssistantMessageMetadata,
  AssistantMessageRole,
} from "@/lib/assistant/types";

/* -------------------------------------------------------------------------- */
/* Conversations                                                               */
/* -------------------------------------------------------------------------- */

export type CreateConversationInput = {
  userId: string;
  title?: string | null;
};

export async function createConversation(
  input: CreateConversationInput,
): Promise<AssistantConversationRow> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(assistantConversations)
    .values({
      id: nanoid(),
      userId: input.userId,
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create assistant conversation.");
  }
  return row;
}

export async function getConversationForUser(
  conversationId: string,
  userId: string,
): Promise<AssistantConversationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listConversationsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<AssistantConversationRow[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  return db
    .select()
    .from(assistantConversations)
    .where(eq(assistantConversations.userId, userId))
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(limit);
}

export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string | null,
): Promise<AssistantConversationRow | null> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(assistantConversations)
    .set({ title, updatedAt: now })
    .where(
      and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.userId, userId),
      ),
    )
    .returning();
  return row ?? null;
}

async function touchConversation(conversationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(assistantConversations)
    .set({ updatedAt: new Date() })
    .where(eq(assistantConversations.id, conversationId));
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

export type AddMessageInput = {
  conversationId: string;
  /** Required for ownership check when provided. */
  userId: string;
  role: AssistantMessageRole;
  content: string;
  metadata?: AssistantMessageMetadata;
};

export async function addMessage(
  input: AddMessageInput,
): Promise<AssistantMessageRow> {
  const conversation = await getConversationForUser(
    input.conversationId,
    input.userId,
  );
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(assistantMessages)
    .values({
      id: nanoid(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create assistant message.");
  }

  await touchConversation(input.conversationId);
  return row;
}

export async function listMessages(
  conversationId: string,
  userId: string,
  options?: { limit?: number },
): Promise<AssistantMessageRow[]> {
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  return db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(asc(assistantMessages.createdAt))
    .limit(limit);
}

/**
 * Shallow-merge metadata onto a message owned by the user's conversation.
 */
export async function mergeMessageMetadata(
  messageId: string,
  userId: string,
  patch: AssistantMessageMetadata,
): Promise<AssistantMessageRow | null> {
  const db = getDb();
  const [existing] = await db
    .select({
      message: assistantMessages,
      conversationUserId: assistantConversations.userId,
    })
    .from(assistantMessages)
    .innerJoin(
      assistantConversations,
      eq(assistantMessages.conversationId, assistantConversations.id),
    )
    .where(eq(assistantMessages.id, messageId))
    .limit(1);

  if (!existing || existing.conversationUserId !== userId) {
    return null;
  }

  const metadata: AssistantMessageMetadata = {
    ...(existing.message.metadata ?? {}),
    ...patch,
  };

  // Merge actionIds arrays when both sides provide them.
  if (patch.actionIds || existing.message.metadata?.actionIds) {
    const merged = [
      ...(existing.message.metadata?.actionIds ?? []),
      ...(patch.actionIds ?? []),
    ];
    metadata.actionIds = [...new Set(merged)];
  }

  const [row] = await db
    .update(assistantMessages)
    .set({ metadata })
    .where(eq(assistantMessages.id, messageId))
    .returning();

  await touchConversation(existing.message.conversationId);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

export type LogAssistantActionInput = {
  conversationId: string;
  userId: string;
  actionType: AssistantActionType;
  messageId?: string | null;
  status?: AssistantActionStatus;
  intent?: AssistantIntent | null;
  result?: AssistantActionResult | null;
  error?: string | null;
};

export async function logAssistantAction(
  input: LogAssistantActionInput,
): Promise<AssistantActionRow> {
  const conversation = await getConversationForUser(
    input.conversationId,
    input.userId,
  );
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const db = getDb();
  const [row] = await db
    .insert(assistantActions)
    .values({
      id: nanoid(),
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      userId: input.userId,
      actionType: input.actionType,
      status: input.status ?? "pending",
      intent: input.intent ?? null,
      result: input.result ?? null,
      error: input.error ?? null,
      createdAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("Failed to log assistant action.");
  }

  await touchConversation(input.conversationId);
  return row;
}

export type UpdateAssistantActionInput = {
  actionId: string;
  userId: string;
  status?: AssistantActionStatus;
  result?: AssistantActionResult | null;
  error?: string | null;
};

export async function updateAssistantAction(
  input: UpdateAssistantActionInput,
): Promise<AssistantActionRow | null> {
  const db = getDb();
  const patch: Partial<AssistantActionRow> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.result !== undefined) patch.result = input.result;
  if (input.error !== undefined) patch.error = input.error;

  if (Object.keys(patch).length === 0) {
    const [existing] = await db
      .select()
      .from(assistantActions)
      .where(
        and(
          eq(assistantActions.id, input.actionId),
          eq(assistantActions.userId, input.userId),
        ),
      )
      .limit(1);
    return existing ?? null;
  }

  const [row] = await db
    .update(assistantActions)
    .set(patch)
    .where(
      and(
        eq(assistantActions.id, input.actionId),
        eq(assistantActions.userId, input.userId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listActionsForConversation(
  conversationId: string,
  userId: string,
): Promise<AssistantActionRow[]> {
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const db = getDb();
  return db
    .select()
    .from(assistantActions)
    .where(eq(assistantActions.conversationId, conversationId))
    .orderBy(asc(assistantActions.createdAt));
}
