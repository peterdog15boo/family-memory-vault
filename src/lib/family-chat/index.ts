/**
 * Family Chat — multiple threads per family vault.
 * Access = active membership + family-level eligibility + thread participation.
 */

import { and, asc, count, desc, eq, gt, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  families,
  familyChatEligibility,
  familyChatMessages,
  familyChatParticipants,
  familyChatThreads,
  familyMembers,
  users,
  type FamilyChatEligibility,
  type FamilyChatParticipant,
  type FamilyChatThread,
} from "@/lib/db/schema";
import { sanitizeUserText } from "@/lib/security/sanitize";

export const FAMILY_CHAT_MAX_BODY_LENGTH = 2000;
export const FAMILY_CHAT_DEFAULT_PAGE_SIZE = 50;
export const FAMILY_CHAT_MAX_PAGE_SIZE = 100;

/** Deep-link prefix used by notification click handlers. */
export const FAMILY_CHAT_LINK_PREFIX = "/#family-chat=";

export class FamilyChatError extends Error {
  readonly code?: "forbidden" | "not_found" | "validation" | "excluded";

  constructor(
    message: string,
    options?: { code?: FamilyChatError["code"] },
  ) {
    super(message);
    this.name = "FamilyChatError";
    this.code = options?.code;
  }
}

export type FamilyChatMessageView = {
  id: string;
  threadId: string;
  body: string;
  createdAt: string;
  sender: {
    userId: string;
    displayName: string | null;
    imageUrl: string | null;
  };
};

export type FamilyChatEligibleMember = {
  userId: string;
  memberId: string;
  displayName: string | null;
  imageUrl: string | null;
  invitedEmail: string | null;
  role: string;
};

/** Owner settings row (eligibility). */
export type FamilyChatParticipantView = {
  userId: string;
  included: boolean;
  displayName: string | null;
  imageUrl: string | null;
  invitedEmail: string | null;
  role: string;
  memberId: string;
};

export type FamilyChatAccess = {
  familyId: string;
  familyName: string;
  eligible: boolean;
  isOwner: boolean;
  unreadCount: number;
};

export type FamilyChatFamilyOption = {
  familyId: string;
  familyName: string;
  isOwner: boolean;
  unreadCount: number;
};

export type FamilyChatBootstrap = {
  /** Families where the user may use chat (active + eligible). */
  families: FamilyChatFamilyOption[];
  /** Access for the currently selected family (null if none eligible). */
  access: FamilyChatAccess | null;
  /** Unread across all eligible families (header badge). */
  totalUnread: number;
};

export type FamilyChatThreadSummary = {
  id: string;
  familyId: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage: {
    body: string;
    createdAt: string;
    senderUserId: string;
    senderName: string | null;
  } | null;
  participants: Array<{
    userId: string;
    displayName: string | null;
    imageUrl: string | null;
  }>;
  title: string;
};

function assertBody(raw: string): string {
  const body = sanitizeUserText(raw, FAMILY_CHAT_MAX_BODY_LENGTH);
  if (!body) {
    throw new FamilyChatError("Message cannot be empty.", {
      code: "validation",
    });
  }
  return body;
}

function familyChatLink(threadId: string, familyId: string): string {
  return `${FAMILY_CHAT_LINK_PREFIX}${encodeURIComponent(threadId)}&family=${encodeURIComponent(familyId)}`;
}

async function requireActiveMembership(familyId: string, userId: string) {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new FamilyChatError("You are not a member of this family.", {
      code: "forbidden",
    });
  }
  return membership;
}

/**
 * Ensure a family-level eligibility row exists (default eligible=true).
 */
export async function upsertChatEligibility(input: {
  familyId: string;
  userId: string;
  eligible?: boolean;
}): Promise<FamilyChatEligibility> {
  const db = getDb();
  const now = new Date();
  const eligible = input.eligible !== false;

  const [existing] = await db
    .select()
    .from(familyChatEligibility)
    .where(
      and(
        eq(familyChatEligibility.familyId, input.familyId),
        eq(familyChatEligibility.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.eligible === eligible) return existing;
    const [updated] = await db
      .update(familyChatEligibility)
      .set({ eligible, updatedAt: now })
      .where(eq(familyChatEligibility.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(familyChatEligibility)
    .values({
      id: nanoid(),
      familyId: input.familyId,
      userId: input.userId,
      eligible,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new FamilyChatError("Failed to set chat eligibility.");
  }
  return created;
}

/** @deprecated Use upsertChatEligibility — kept for family lifecycle call sites. */
export async function upsertChatParticipant(input: {
  familyId: string;
  userId: string;
  include?: boolean;
}): Promise<FamilyChatEligibility> {
  return upsertChatEligibility({
    familyId: input.familyId,
    userId: input.userId,
    eligible: input.include !== false,
  });
}

export async function excludeChatParticipant(input: {
  familyId: string;
  userId: string;
}): Promise<void> {
  await upsertChatEligibility({
    familyId: input.familyId,
    userId: input.userId,
    eligible: false,
  });
}

export async function setChatParticipantIncluded(input: {
  familyId: string;
  actorUserId: string;
  targetUserId: string;
  included: boolean;
}): Promise<{ userId: string; included: boolean }> {
  const db = getDb();
  const [actor] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.userId, input.actorUserId),
        eq(familyMembers.status, "active"),
        eq(familyMembers.role, "owner"),
      ),
    )
    .limit(1);

  if (!actor) {
    throw new FamilyChatError("Only the family owner can change chat access.", {
      code: "forbidden",
    });
  }

  const [target] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.userId, input.targetUserId),
        eq(familyMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!target) {
    throw new FamilyChatError("Family member not found.", { code: "not_found" });
  }

  const row = await upsertChatEligibility({
    familyId: input.familyId,
    userId: input.targetUserId,
    eligible: input.included,
  });

  return { userId: row.userId, included: row.eligible };
}

async function requireEligible(
  familyId: string,
  userId: string,
): Promise<void> {
  await requireActiveMembership(familyId, userId);
  const db = getDb();
  let [row] = await db
    .select()
    .from(familyChatEligibility)
    .where(
      and(
        eq(familyChatEligibility.familyId, familyId),
        eq(familyChatEligibility.userId, userId),
      ),
    )
    .limit(1);

  if (!row) {
    row = await upsertChatEligibility({ familyId, userId, eligible: true });
  }

  if (!row.eligible) {
    throw new FamilyChatError("You do not have access to family chat.", {
      code: "excluded",
    });
  }
}

async function requireThreadParticipant(
  threadId: string,
  userId: string,
): Promise<{ thread: FamilyChatThread; participant: FamilyChatParticipant }> {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(familyChatThreads)
    .where(eq(familyChatThreads.id, threadId))
    .limit(1);

  if (!thread) {
    throw new FamilyChatError("Chat not found.", { code: "not_found" });
  }

  await requireEligible(thread.familyId, userId);

  const [participant] = await db
    .select()
    .from(familyChatParticipants)
    .where(
      and(
        eq(familyChatParticipants.threadId, threadId),
        eq(familyChatParticipants.userId, userId),
      ),
    )
    .limit(1);

  if (!participant) {
    throw new FamilyChatError("You do not have access to this chat.", {
      code: "forbidden",
    });
  }

  return { thread, participant };
}

async function countUnreadForParticipant(
  threadId: string,
  lastReadAt: Date | null,
): Promise<number> {
  const db = getDb();
  const where = lastReadAt
    ? and(
        eq(familyChatMessages.threadId, threadId),
        gt(familyChatMessages.createdAt, lastReadAt),
      )
    : eq(familyChatMessages.threadId, threadId);

  const [row] = await db
    .select({ value: count() })
    .from(familyChatMessages)
    .where(where);
  return Number(row?.value ?? 0);
}

async function unreadCountForFamilyUser(
  familyId: string,
  userId: string,
): Promise<number> {
  const db = getDb();
  const parts = await db
    .select({
      threadId: familyChatParticipants.threadId,
      lastReadAt: familyChatParticipants.lastReadAt,
    })
    .from(familyChatParticipants)
    .innerJoin(
      familyChatThreads,
      eq(familyChatThreads.id, familyChatParticipants.threadId),
    )
    .where(
      and(
        eq(familyChatParticipants.userId, userId),
        eq(familyChatThreads.familyId, familyId),
      ),
    );

  let unreadCount = 0;
  for (const part of parts) {
    unreadCount += await countUnreadForParticipant(
      part.threadId,
      part.lastReadAt,
    );
  }
  return unreadCount;
}

/**
 * List every family vault where the user is active and chat-eligible.
 */
export async function listChatFamiliesForUser(
  userId: string,
): Promise<FamilyChatFamilyOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      familyId: families.id,
      familyName: families.name,
      role: familyMembers.role,
      eligible: familyChatEligibility.eligible,
    })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .leftJoin(
      familyChatEligibility,
      and(
        eq(familyChatEligibility.familyId, familyMembers.familyId),
        eq(familyChatEligibility.userId, userId),
      ),
    )
    .where(
      and(
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .orderBy(desc(familyMembers.acceptedAt), desc(familyMembers.createdAt));

  const options: FamilyChatFamilyOption[] = [];
  for (const row of rows) {
    // Missing eligibility row → treat as eligible (first-open backfill).
    if (row.eligible === false) continue;

    if (row.eligible == null) {
      await upsertChatEligibility({
        familyId: row.familyId,
        userId,
        eligible: true,
      });
    }

    options.push({
      familyId: row.familyId,
      familyName: row.familyName,
      isOwner: row.role === "owner",
      unreadCount: await unreadCountForFamilyUser(row.familyId, userId),
    });
  }
  return options;
}

/**
 * Bootstrap for the chat panel: family list + selected-family access.
 * `preferredFamilyId` is honored when the user is eligible for that family.
 */
export async function getChatBootstrapForUser(
  userId: string,
  preferredFamilyId?: string | null,
): Promise<FamilyChatBootstrap> {
  const familiesList = await listChatFamiliesForUser(userId);
  const totalUnread = familiesList.reduce((sum, f) => sum + f.unreadCount, 0);

  if (familiesList.length === 0) {
    return { families: [], access: null, totalUnread: 0 };
  }

  const preferred = preferredFamilyId?.trim() || null;
  const selected =
    (preferred
      ? familiesList.find((f) => f.familyId === preferred)
      : null) ?? familiesList[0]!;

  const access = await getChatAccessForUser(userId, selected.familyId);
  return {
    families: familiesList,
    access,
    totalUnread,
  };
}

/**
 * Resolve a thread the user can open (notification deep-link).
 * Returns null when unauthorized / not found.
 */
export async function resolveChatThreadForUser(
  threadId: string,
  userId: string,
): Promise<{ threadId: string; familyId: string; familyName: string } | null> {
  try {
    const { thread } = await requireThreadParticipant(threadId, userId);
    const db = getDb();
    const [family] = await db
      .select({ name: families.name })
      .from(families)
      .where(eq(families.id, thread.familyId))
      .limit(1);
    return {
      threadId: thread.id,
      familyId: thread.familyId,
      familyName: family?.name ?? "",
    };
  } catch {
    return null;
  }
}

export async function getChatAccessForUser(
  userId: string,
  familyId?: string | null,
): Promise<FamilyChatAccess | null> {
  const db = getDb();
  let resolvedFamilyId = familyId?.trim() || null;
  let familyName = "";
  let membershipRole: string | null = null;

  if (!resolvedFamilyId) {
    const [primary] = await db
      .select({
        id: families.id,
        name: families.name,
        role: familyMembers.role,
      })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .where(
        and(
          eq(familyMembers.userId, userId),
          eq(familyMembers.status, "active"),
        ),
      )
      .orderBy(desc(familyMembers.acceptedAt), desc(familyMembers.createdAt))
      .limit(1);
    if (!primary) return null;
    resolvedFamilyId = primary.id;
    familyName = primary.name;
    membershipRole = primary.role;
  } else {
    const [row] = await db
      .select({
        id: families.id,
        name: families.name,
        role: familyMembers.role,
      })
      .from(families)
      .innerJoin(
        familyMembers,
        and(
          eq(familyMembers.familyId, families.id),
          eq(familyMembers.userId, userId),
          eq(familyMembers.status, "active"),
        ),
      )
      .where(eq(families.id, resolvedFamilyId))
      .limit(1);
    if (!row) return null;
    familyName = row.name;
    membershipRole = row.role;
  }

  if (!membershipRole) return null;

  let [eligibility] = await db
    .select()
    .from(familyChatEligibility)
    .where(
      and(
        eq(familyChatEligibility.familyId, resolvedFamilyId),
        eq(familyChatEligibility.userId, userId),
      ),
    )
    .limit(1);

  if (!eligibility) {
    eligibility = await upsertChatEligibility({
      familyId: resolvedFamilyId,
      userId,
      eligible: true,
    });
  }

  let unreadCount = 0;
  if (eligibility.eligible) {
    unreadCount = await unreadCountForFamilyUser(
      resolvedFamilyId,
      userId,
    );
  }

  return {
    familyId: resolvedFamilyId,
    familyName,
    eligible: eligibility.eligible,
    isOwner: membershipRole === "owner",
    unreadCount,
  };
}

export async function listEligibleChatMembers(input: {
  familyId: string;
  userId: string;
}): Promise<FamilyChatEligibleMember[]> {
  await requireEligible(input.familyId, input.userId);
  const db = getDb();

  const members = await db
    .select({
      memberId: familyMembers.id,
      userId: familyMembers.userId,
      role: familyMembers.role,
      invitedEmail: familyMembers.invitedEmail,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      eligible: familyChatEligibility.eligible,
    })
    .from(familyMembers)
    .leftJoin(users, eq(users.id, familyMembers.userId))
    .leftJoin(
      familyChatEligibility,
      and(
        eq(familyChatEligibility.familyId, familyMembers.familyId),
        eq(familyChatEligibility.userId, familyMembers.userId),
      ),
    )
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.status, "active"),
      ),
    )
    .orderBy(asc(familyMembers.acceptedAt));

  return members
    .filter(
      (m): m is typeof m & { userId: string } =>
        Boolean(m.userId) &&
        m.userId !== input.userId &&
        m.eligible !== false,
    )
    .map((m) => ({
      userId: m.userId,
      memberId: m.memberId,
      displayName: m.displayName,
      imageUrl: m.imageUrl,
      invitedEmail: m.invitedEmail,
      role: m.role,
    }));
}

function threadTitle(
  participants: Array<{ userId: string; displayName: string | null }>,
  selfUserId: string,
  fallback: string,
): string {
  const others = participants.filter((p) => p.userId !== selfUserId);
  if (others.length === 0) return fallback;
  const names = others.map(
    (p) => p.displayName?.trim() || fallback,
  );
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export async function listChatThreads(input: {
  familyId: string;
  userId: string;
}): Promise<FamilyChatThreadSummary[]> {
  await requireEligible(input.familyId, input.userId);
  const db = getDb();

  const myThreads = await db
    .select({
      thread: familyChatThreads,
      lastReadAt: familyChatParticipants.lastReadAt,
    })
    .from(familyChatParticipants)
    .innerJoin(
      familyChatThreads,
      eq(familyChatThreads.id, familyChatParticipants.threadId),
    )
    .where(
      and(
        eq(familyChatParticipants.userId, input.userId),
        eq(familyChatThreads.familyId, input.familyId),
      ),
    )
    .orderBy(desc(familyChatThreads.updatedAt));

  const summaries: FamilyChatThreadSummary[] = [];

  for (const row of myThreads) {
    const thread = row.thread;
    const participantRows = await db
      .select({
        userId: familyChatParticipants.userId,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
      })
      .from(familyChatParticipants)
      .leftJoin(users, eq(users.id, familyChatParticipants.userId))
      .where(eq(familyChatParticipants.threadId, thread.id));

    const [last] = await db
      .select({
        body: familyChatMessages.body,
        createdAt: familyChatMessages.createdAt,
        senderUserId: familyChatMessages.senderUserId,
        senderName: users.displayName,
      })
      .from(familyChatMessages)
      .leftJoin(users, eq(users.id, familyChatMessages.senderUserId))
      .where(eq(familyChatMessages.threadId, thread.id))
      .orderBy(desc(familyChatMessages.createdAt))
      .limit(1);

    const unreadCount = await countUnreadForParticipant(
      thread.id,
      row.lastReadAt,
    );

    const participants = participantRows.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      imageUrl: p.imageUrl,
    }));

    summaries.push({
      id: thread.id,
      familyId: thread.familyId,
      updatedAt: thread.updatedAt.toISOString(),
      unreadCount,
      lastMessage: last
        ? {
            body: last.body,
            createdAt: last.createdAt.toISOString(),
            senderUserId: last.senderUserId,
            senderName: last.senderName,
          }
        : null,
      participants,
      title: threadTitle(participants, input.userId, "Family member"),
    });
  }

  return summaries;
}

/**
 * Create a thread among the creator and selected eligible recipients.
 * Reuses an existing thread with the exact same participant set when found.
 */
export async function createChatThread(input: {
  familyId: string;
  creatorUserId: string;
  participantUserIds: string[];
}): Promise<FamilyChatThreadSummary> {
  await requireEligible(input.familyId, input.creatorUserId);

  const uniqueRecipients = [
    ...new Set(
      input.participantUserIds
        .map((id) => id.trim())
        .filter((id) => id && id !== input.creatorUserId),
    ),
  ];

  if (uniqueRecipients.length === 0) {
    throw new FamilyChatError("Select at least one recipient.", {
      code: "validation",
    });
  }

  const db = getDb();

  // Validate every recipient is active + eligible.
  for (const recipientId of uniqueRecipients) {
    const [membership] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, input.familyId),
          eq(familyMembers.userId, recipientId),
          eq(familyMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new FamilyChatError("One or more recipients are not family members.", {
        code: "validation",
      });
    }

    let [elig] = await db
      .select()
      .from(familyChatEligibility)
      .where(
        and(
          eq(familyChatEligibility.familyId, input.familyId),
          eq(familyChatEligibility.userId, recipientId),
        ),
      )
      .limit(1);
    if (!elig) {
      elig = await upsertChatEligibility({
        familyId: input.familyId,
        userId: recipientId,
        eligible: true,
      });
    }
    if (!elig.eligible) {
      throw new FamilyChatError(
        "One or more recipients are not available for chat.",
        { code: "validation" },
      );
    }
  }

  const allUserIds = [input.creatorUserId, ...uniqueRecipients].sort();

  // Reuse exact participant-set match when possible.
  const existingThreads = await db
    .select({ id: familyChatThreads.id })
    .from(familyChatThreads)
    .where(eq(familyChatThreads.familyId, input.familyId));

  for (const existing of existingThreads) {
    const parts = await db
      .select({ userId: familyChatParticipants.userId })
      .from(familyChatParticipants)
      .where(eq(familyChatParticipants.threadId, existing.id));
    const ids = parts.map((p) => p.userId).sort();
    if (
      ids.length === allUserIds.length &&
      ids.every((id, i) => id === allUserIds[i])
    ) {
      const list = await listChatThreads({
        familyId: input.familyId,
        userId: input.creatorUserId,
      });
      const match = list.find((t) => t.id === existing.id);
      if (match) return match;
    }
  }

  const now = new Date();
  const threadId = nanoid();

  const [created] = await db
    .insert(familyChatThreads)
    .values({
      id: threadId,
      familyId: input.familyId,
      createdByUserId: input.creatorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new FamilyChatError("Failed to create chat.");
  }

  for (const uid of allUserIds) {
    await db.insert(familyChatParticipants).values({
      id: nanoid(),
      threadId,
      userId: uid,
      included: true,
      addedAt: now,
      updatedAt: now,
      lastReadAt: uid === input.creatorUserId ? now : null,
    });
  }

  // Notify recipients about the new chat (no message yet).
  try {
    const { notifyFamilyChat } = await import("@/lib/notifications");
    const [creator] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, input.creatorUserId))
      .limit(1);
    const creatorName = creator?.displayName?.trim() || "A family member";

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        notifyFamilyChat(recipientId, {
          familyId: input.familyId,
          threadId,
          kind: "thread_created",
          senderName: creatorName,
          link: familyChatLink(threadId, input.familyId),
        }),
      ),
    );
  } catch (error) {
    console.error("[family-chat] notify new thread failed", error);
  }

  const list = await listChatThreads({
    familyId: input.familyId,
    userId: input.creatorUserId,
  });
  const summary = list.find((t) => t.id === threadId);
  if (!summary) {
    throw new FamilyChatError("Chat created but could not be loaded.");
  }
  return summary;
}

export async function listChatMessages(input: {
  threadId: string;
  userId: string;
  before?: string | null;
  limit?: number;
}): Promise<FamilyChatMessageView[]> {
  await requireThreadParticipant(input.threadId, input.userId);
  const limit = Math.min(
    Math.max(1, input.limit ?? FAMILY_CHAT_DEFAULT_PAGE_SIZE),
    FAMILY_CHAT_MAX_PAGE_SIZE,
  );

  const db = getDb();
  const conditions = [eq(familyChatMessages.threadId, input.threadId)];
  if (input.before) {
    const beforeDate = new Date(input.before);
    if (!Number.isNaN(beforeDate.getTime())) {
      conditions.push(lt(familyChatMessages.createdAt, beforeDate));
    }
  }

  const rows = await db
    .select({
      id: familyChatMessages.id,
      threadId: familyChatMessages.threadId,
      body: familyChatMessages.body,
      createdAt: familyChatMessages.createdAt,
      senderUserId: familyChatMessages.senderUserId,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
    })
    .from(familyChatMessages)
    .innerJoin(users, eq(users.id, familyChatMessages.senderUserId))
    .where(and(...conditions))
    .orderBy(desc(familyChatMessages.createdAt))
    .limit(limit);

  return rows
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      threadId: row.threadId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      sender: {
        userId: row.senderUserId,
        displayName: row.displayName,
        imageUrl: row.imageUrl,
      },
    }));
}

export async function sendChatMessage(input: {
  threadId: string;
  userId: string;
  body: string;
}): Promise<FamilyChatMessageView> {
  const body = assertBody(input.body);
  const { thread } = await requireThreadParticipant(
    input.threadId,
    input.userId,
  );
  const db = getDb();
  const now = new Date();

  const [created] = await db
    .insert(familyChatMessages)
    .values({
      id: nanoid(),
      threadId: thread.id,
      senderUserId: input.userId,
      body,
      createdAt: now,
    })
    .returning();

  if (!created) {
    throw new FamilyChatError("Failed to send message.");
  }

  await db
    .update(familyChatThreads)
    .set({ updatedAt: now })
    .where(eq(familyChatThreads.id, thread.id));

  await db
    .update(familyChatParticipants)
    .set({ lastReadAt: now, updatedAt: now })
    .where(
      and(
        eq(familyChatParticipants.threadId, thread.id),
        eq(familyChatParticipants.userId, input.userId),
      ),
    );

  const [sender] = await db
    .select({
      displayName: users.displayName,
      imageUrl: users.imageUrl,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const senderName = sender?.displayName?.trim() || "A family member";

  // Notify other eligible participants.
  try {
    const others = await db
      .select({ userId: familyChatParticipants.userId })
      .from(familyChatParticipants)
      .where(
        and(
          eq(familyChatParticipants.threadId, thread.id),
          sql`${familyChatParticipants.userId} <> ${input.userId}`,
        ),
      );

    const { notifyFamilyChat } = await import("@/lib/notifications");
    const preview =
      body.length > 120 ? `${body.slice(0, 117)}…` : body;

    await Promise.all(
      others.map(async (other) => {
        const [elig] = await db
          .select({ eligible: familyChatEligibility.eligible })
          .from(familyChatEligibility)
          .where(
            and(
              eq(familyChatEligibility.familyId, thread.familyId),
              eq(familyChatEligibility.userId, other.userId),
            ),
          )
          .limit(1);
        if (elig && !elig.eligible) return;

        await notifyFamilyChat(other.userId, {
          familyId: thread.familyId,
          threadId: thread.id,
          kind: "message",
          senderName,
          preview,
          link: familyChatLink(thread.id, thread.familyId),
        });
      }),
    );
  } catch (error) {
    console.error("[family-chat] notify message failed", error);
  }

  return {
    id: created.id,
    threadId: created.threadId,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    sender: {
      userId: input.userId,
      displayName: sender?.displayName ?? null,
      imageUrl: sender?.imageUrl ?? null,
    },
  };
}

export async function markChatRead(input: {
  threadId: string;
  userId: string;
}): Promise<void> {
  await requireThreadParticipant(input.threadId, input.userId);
  const db = getDb();
  const now = new Date();
  await db
    .update(familyChatParticipants)
    .set({ lastReadAt: now, updatedAt: now })
    .where(
      and(
        eq(familyChatParticipants.threadId, input.threadId),
        eq(familyChatParticipants.userId, input.userId),
      ),
    );
}

export async function listChatParticipantsForOwner(input: {
  familyId: string;
  actorUserId: string;
}): Promise<FamilyChatParticipantView[]> {
  const db = getDb();
  const [actor] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.userId, input.actorUserId),
        eq(familyMembers.status, "active"),
        eq(familyMembers.role, "owner"),
      ),
    )
    .limit(1);

  if (!actor) {
    throw new FamilyChatError("Only the family owner can manage chat access.", {
      code: "forbidden",
    });
  }

  const members = await db
    .select({
      memberId: familyMembers.id,
      userId: familyMembers.userId,
      role: familyMembers.role,
      invitedEmail: familyMembers.invitedEmail,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      eligible: familyChatEligibility.eligible,
    })
    .from(familyMembers)
    .leftJoin(users, eq(users.id, familyMembers.userId))
    .leftJoin(
      familyChatEligibility,
      and(
        eq(familyChatEligibility.familyId, familyMembers.familyId),
        eq(familyChatEligibility.userId, familyMembers.userId),
      ),
    )
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.status, "active"),
      ),
    )
    .orderBy(asc(familyMembers.acceptedAt));

  return members
    .filter((m): m is typeof m & { userId: string } => Boolean(m.userId))
    .map((m) => ({
      userId: m.userId,
      memberId: m.memberId,
      included: m.eligible !== false,
      displayName: m.displayName,
      imageUrl: m.imageUrl,
      invitedEmail: m.invitedEmail,
      role: m.role,
    }));
}

/** No-op compatibility — eligibility is per-member, not a single thread seed. */
export async function ensureFamilyChatThread(
  _familyId: string,
): Promise<FamilyChatThread | null> {
  return null;
}

export async function syncFamilyChatParticipants(
  familyId: string,
): Promise<void> {
  const db = getDb();
  const active = await db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.status, "active"),
      ),
    );

  for (const row of active) {
    if (!row.userId) continue;
    await upsertChatEligibility({
      familyId,
      userId: row.userId,
      eligible: true,
    });
  }
}
