import { Database } from "bun:sqlite";

const db = new Database("pastes.sqlite", { create: true });
const createTable = db.query(
  `CREATE TABLE IF NOT EXISTS pastes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, title TINYTEXT);`
);
createTable.run();

/**
 * inserts text into db.
 *
 * @param {string} text the paste text to insert.
 * @param {string} title the paste title to insert.
 * @returns {number} the id of the entry that was just inserted.
 * @throws {Error} throws an error if it fails to retrieve the last inserted ID.
 */
export function writeText(text: string, title: string): number {
  const insertPaste = db.query(
    `INSERT INTO pastes (title, text) VALUES ($title, $text);`
  );
  insertPaste.run({ $text: text, $title: title });

  const lastID = db.query(`SELECT last_insert_rowid() AS id;`);
  const result = lastID.get() as { id: number };

  if (result && typeof result.id === "number") {
    return result.id;
  } else {
    throw new Error("Failed to retrieve last inserted ID.");
  }
}

/**
 * retrieves text from db.
 *
 * @param {(number|string)} id the id of the paste text to retrieve.
 * @returns {string} the text from the db.
 */
export function getText(id: number | string): string {
  const query = db.query(`SELECT text FROM pastes WHERE id = $id;`);
  const paste = (query.get({ $id: id }) as { text: string }).text;
  return paste;
}

/**
 * retrieves title from db.
 *
 * @param {(number|string)} id the id of the paste title to retrieve.
 * @returns {string} the title from the db.
 */
export function getTitle(id: number | string): string {
  const query = db.query(`SELECT title FROM pastes WHERE id = $id;`);
  const title = (query.get({ $id: id }) as { title: string }).title;
  return title;
}
