import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "../../data/lyrilearn.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
  }
  return db;
}
