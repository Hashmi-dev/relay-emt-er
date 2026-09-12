import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One encounter per demo session. Its review, reservations and assignments live
// in one bounded document so a version-checked D1 update commits them atomically.
export const sessions = sqliteTable("relay_sessions", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
});
export const telemetry = sqliteTable("relay_telemetry", {
  sessionId: text("session_id").primaryKey().references(() => sessions.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
});
export const quota = sqliteTable("relay_quota", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
});
