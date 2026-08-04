import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
    );
  }
  return url;
}

/**
 * Drizzle client for Neon (HTTP driver — suited to serverless / Next.js).
 * Lazy-initialized so importing modules does not fail at build time without env.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const sql = neon(requireDatabaseUrl());
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;
