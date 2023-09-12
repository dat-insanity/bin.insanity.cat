import { Database } from "bun:sqlite";

const db = new Database("pastes.sqlite", { create: true });
const createTable = db.query(
  `CREATE TABLE IF NOT EXISTS pastes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT);`
);
createTable.run();

/**
 * inserts text into db.
 *
 * @param text the paste text to insert.
 * @returns the id of the entry that was just inserted.
 */
export function writeText(text: string): number {
  const insertPaste = db.query(`INSERT INTO pastes (text) VALUES ($text);`);
  insertPaste.run({ $text: text });

  const lastID = db.query(`SELECT last_insert_rowid() AS id;`);
  const result = lastID.get() as { id: number; text: string };

  if (result && typeof result.id === "number") {
    return result.id;
  } else {
    throw new Error("Failed to retrieve last inserted ID.");
  }
}

/**
 * retrieves text from db.
 *
 * @param id the id of the paste text to retrieve.
 * @returns the text from the db.
 */
export function getText(id: number | string): string {
  const query = db.query(`SELECT text FROM pastes WHERE id = $id;`);
  const paste = (query.get({ $id: id }) as { text: string }).text;
  return paste;
}
