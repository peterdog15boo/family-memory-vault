/**
 * SQL migration: add needs_human_review to moderation_status enum.
 * Run via: npm run db:migrate  (or apply manually on Neon)
 */
ALTER TYPE "public"."moderation_status" ADD VALUE IF NOT EXISTS 'needs_human_review';
