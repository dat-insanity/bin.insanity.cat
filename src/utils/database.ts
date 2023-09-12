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
 * @returns the number which is the id.
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
 * @returns an array of pastes.
 */
export function getText(id: number): { id: number; text: string } {
  const query = db.query(`SELECT text FROM pastes WHERE id = $id;`);
  const paste = query.get({ $id: id }) as { id: number; text: string };
  return paste;
}
