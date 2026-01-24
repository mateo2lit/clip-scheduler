// src/lib/db.ts
import { Pool } from "pg";

// Prefer DATABASE_URL, fallback to POSTGRES_URL (you have both)
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

if (!connectionString) {
  // Don't crash build; crash when used so dev server can boot and show a useful error
  console.warn(
    "[db] Missing DATABASE_URL / POSTGRES_URL. Set it in .env.local and Vercel env vars."
  );
}

let _pool: Pool | null = null;

function getPool() {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Neon requires SSL; this works for Neon
    max: 5,
  });

  return _pool;
}

// Tagged template helper: sql`SELECT ... WHERE id = ${id}`
export async function sql<T = any>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();

  // Build parameterized query: $1, $2...
  let text = "";
  const params: any[] = [];

  strings.forEach((str, i) => {
    text += str;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });

  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount };
}
