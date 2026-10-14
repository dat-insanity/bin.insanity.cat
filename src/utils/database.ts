import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { generateSlug } from "./slug";

const db = new Database(Bun.env.DATABASE_PATH || "pastes.sqlite", { create: true });
function changedRow(): boolean {
  return (db.query("SELECT changes() AS changes;").get() as { changes: number }).changes === 1;
}

const migrate = db.transaction(() => {
  db.query(
    `CREATE TABLE IF NOT EXISTS pastes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT,
      title TINYTEXT,
      edit_key_hash TEXT,
      created_at TEXT,
      slug TEXT,
      legacy_url INTEGER NOT NULL DEFAULT 0
    );`
  ).run();

  // Older posts have no edit key and remain read-only after migration.
  const columns = db.query("PRAGMA table_info(pastes);").all() as { name: string }[];
  if (!columns.some((column) => column.name === "edit_key_hash")) {
    db.query("ALTER TABLE pastes ADD COLUMN edit_key_hash TEXT;").run();
  }
  // The original publication time of existing posts is unknown.
  if (!columns.some((column) => column.name === "created_at")) {
    db.query("ALTER TABLE pastes ADD COLUMN created_at TEXT;").run();
  }
  if (!columns.some((column) => column.name === "slug")) {
    db.query("ALTER TABLE pastes ADD COLUMN slug TEXT;").run();
  }
  if (!columns.some((column) => column.name === "legacy_url")) {
    db.query("ALTER TABLE pastes ADD COLUMN legacy_url INTEGER NOT NULL DEFAULT 0;").run();
  }
  db.query("CREATE UNIQUE INDEX IF NOT EXISTS pastes_slug_unique ON pastes (slug);").run();

  const legacyPosts = db.query("SELECT id FROM pastes WHERE slug IS NULL;").all() as { id: number }[];
  for (const { id } of legacyPosts) {
    let assigned = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      db.query("UPDATE OR IGNORE pastes SET slug = $slug, legacy_url = 1 WHERE id = $id;")
        .run({ $slug: generateSlug(), $id: id });
      if (changedRow()) {
        assigned = true;
        break;
      }
    }
    if (!assigned) throw new Error("Failed to assign a unique post slug.");
  }
});
migrate.immediate();

export type Paste = {
  id: number;
  slug: string;
  text: string;
  title: string | null;
  created_at: string | null;
};

function hashKey(editKey: string): string {
  return createHash("sha256").update(editKey).digest("hex");
}

export function writeText(text: string, title: string): { id: number; slug: string; editKey: string } {
  const editKey = randomBytes(32).toString("hex");
  const createdAt = new Date().toISOString();
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = generateSlug();
    db.query(
      `INSERT INTO pastes (slug, title, text, edit_key_hash, created_at)
       VALUES ($slug, $title, $text, $key, $createdAt)
       ON CONFLICT(slug) DO NOTHING;`
    ).run({ $slug: slug, $text: text, $title: title, $key: hashKey(editKey), $createdAt: createdAt });
    if (changedRow()) {
      const result = db.query("SELECT last_insert_rowid() AS id;").get() as { id: number };
      return { id: result.id, slug, editKey };
    }
  }
  throw new Error("Failed to generate a unique post slug.");
}

export function getPaste(slug: string): Paste | null {
  return db.query("SELECT id, slug, text, title, created_at FROM pastes WHERE slug = $slug;")
    .get({ $slug: slug }) as Paste | null;
}

export function getLegacyPaste(id: number | string): Paste | null {
  return db.query("SELECT id, slug, text, title, created_at FROM pastes WHERE id = $id AND legacy_url = 1;")
    .get({ $id: id }) as Paste | null;
}

export function getText(slug: string): string | null {
  return getPaste(slug)?.text ?? null;
}

export function getTitle(slug: string): string | null {
  const paste = getPaste(slug);
  return paste ? paste.title ?? "" : null;
}

export function canEdit(slug: string, editKey: string | null): boolean {
  if (!editKey) return false;
  return db.query("SELECT id FROM pastes WHERE slug = $slug AND edit_key_hash = $key;")
    .get({ $slug: slug, $key: hashKey(editKey) }) !== null;
}

export function updateText(slug: string, editKey: string, text: string, title: string): boolean {
  db.query(
    `UPDATE pastes SET text = $text, title = $title
     WHERE slug = $slug AND edit_key_hash = $key;`
  ).run({ $slug: slug, $key: hashKey(editKey), $text: text, $title: title });
  return changedRow();
}

export function deletePaste(slug: string, editKey: string): boolean {
  db.query("DELETE FROM pastes WHERE slug = $slug AND edit_key_hash = $key;")
    .run({ $slug: slug, $key: hashKey(editKey) });
  return changedRow();
}
