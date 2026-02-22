/**
 * Initialize the database by applying schema.sql.
 * Run via: bun run db:init
 */
import { getDb } from "./index";
import { join } from "path";

const schemaPath = join(import.meta.dir, "schema.sql");
const schema = await Bun.file(schemaPath).text();

const db = getDb();
db.exec(schema);

console.log("Database initialized successfully at:", join(import.meta.dir, "../../data/lyrilearn.db"));
