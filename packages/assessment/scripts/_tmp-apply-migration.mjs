import { readFileSync } from "node:fs";
import { Pool } from "pg";
process.loadEnvFile(".env");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const sql = readFileSync("supabase/migrations/20260905100000_intake_questions_placeholder.sql", "utf8");
const client = await pool.connect();
try {
  await client.query(sql);
  console.log("Migration applied successfully.");
  const cols = await client.query(`
    select column_name from information_schema.columns
    where table_schema='assessment' and table_name='intake_questions' and column_name='placeholder_text'
  `);
  console.log("placeholder_text column present:", cols.rowCount === 1);
} finally {
  client.release();
  await pool.end();
}
