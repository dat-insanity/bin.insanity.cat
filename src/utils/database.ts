import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";

const db = new Database(Bun.env.DATABASE_PATH || "pastes.sqlite", { create: true });
db.query(
  `CREATE TABLE IF NOT EXISTS pastes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    title TINYTEXT,
    edit_key_hash TEXT
  );`
).run();

// Older posts have no edit key and remain read-only after migration.
const columns = db.query("PRAGMA table_info(pastes);").all() as { name: string }[];
if (!columns.some((column) => column.name === "edit_key_hash")) {
  db.query("ALTER TABLE pastes ADD COLUMN edit_key_hash TEXT;").run();
}

export type Paste = { id: number; text: string; title: string | null };

function hashKey(editKey: string): string {
  return createHash("sha256").update(editKey).digest("hex");
}

export function writeText(text: string, title: string): { id: number; editKey: string } {
  const editKey = randomBytes(32).toString("hex");
  db.query(
    `INSERT INTO pastes (title, text, edit_key_hash) VALUES ($title, $text, $key);`
  ).run({ $text: text, $title: title, $key: hashKey(editKey) });

  const result = db.query("SELECT last_insert_rowid() AS id;").get() as { id: number };
  return { id: result.id, editKey };
}

export function getPaste(id: number | string): Paste | null {
  return db.query("SELECT id, text, title FROM pastes WHERE id = $id;")
    .get({ $id: id }) as Paste | null;
}

export function getText(id: number | string): string | null {
  return getPaste(id)?.text ?? null;
}

export function getTitle(id: number | string): string | null {
  const paste = getPaste(id);
  return paste ? paste.title ?? "" : null;
}

export function canEdit(id: number | string, editKey: string | null): boolean {
  if (!editKey) return false;
  return db.query("SELECT id FROM pastes WHERE id = $id AND edit_key_hash = $key;")
    .get({ $id: id, $key: hashKey(editKey) }) !== null;
}

export function updateText(id: number | string, editKey: string, text: string, title: string): boolean {
  db.query(
    `UPDATE pastes SET text = $text, title = $title
     WHERE id = $id AND edit_key_hash = $key;`
  ).run({ $id: id, $key: hashKey(editKey), $text: text, $title: title });
  return (db.query("SELECT changes() AS changes;").get() as { changes: number }).changes === 1;
}

export function deletePaste(id: number | string, editKey: string): boolean {
  db.query("DELETE FROM pastes WHERE id = $id AND edit_key_hash = $key;")
    .run({ $id: id, $key: hashKey(editKey) });
  return (db.query("SELECT changes() AS changes;").get() as { changes: number }).changes === 1;
}
