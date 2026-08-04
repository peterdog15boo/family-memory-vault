-- Add vintage + bright movie themes (keep birthday for existing rows).
ALTER TYPE "public"."movie_style" ADD VALUE IF NOT EXISTS 'vintage';
ALTER TYPE "public"."movie_style" ADD VALUE IF NOT EXISTS 'bright';
