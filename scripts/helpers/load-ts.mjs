// Test-only loader: real TypeScript, explicitly mocked external effects, no live network.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export class FakeNextResponse extends Response {
  cookies = { values: [], set: (...args) => this.cookies.values.push(args) };
  static json(body, init) { return new FakeNextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }); }
  static redirect(url) { return new FakeNextResponse(null, { status: 307, headers: { Location: url } }); }
}
export function loadTs(relative, mocks = {}, extra = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: relative,
  }).outputText;
  const exports = {};
  const context = vm.createContext({ exports, URL, URLSearchParams, Request, Response, Headers, Promise, Buffer, JSON, Date, String, Map, Set,
    setTimeout, clearTimeout, ReadableStream, process: { env: {} }, console: { warn() {}, error() {}, log() {} },
    require(s) { if (Object.hasOwn(mocks, s)) return mocks[s]; throw new Error(`Unmocked import: ${s}`); },
    fetch() { throw new Error("Unmocked network blocked"); }, ...extra });
  new vm.Script(compiled, { filename: relative }).runInContext(context, { timeout: 3000 });
  return exports;
}

export function memoryDb(tables = {}) {
  const calls = [];
  const db = { calls, tables, rpcCalls: [],
    from(table) {
      const q = { table, filters: [], payload: null, method: "read", single: false, columns: "*", count: false };
      const chain = {
        select(columns = "*", opts = {}) { q.columns = columns; q.count = opts.count === "exact"; return chain; },
        eq(col, value) { q.filters.push(r => r[col] === value); return chain; },
        in(col, values) { q.filters.push(r => values.includes(r[col])); return chain; },
        gt(col, value) { q.filters.push(r => r[col] > value); return chain; },
        gte(col, value) { q.filters.push(r => r[col] >= value); return chain; },
        update(payload) { q.method = "update"; q.payload = payload; return chain; },
        insert(payload) { q.method = "insert"; q.payload = payload; return chain; },
        maybeSingle() { q.single = true; return chain; },
        then(resolve, reject) {
          calls.push(q);
          const rows = tables[table] ||= [];
          let matched = rows.filter(r => q.filters.every(f => f(r)));
          if (q.method === "insert") {
            const row = { status: "started", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(), ...q.payload };
            rows.push(row); matched = [row];
          }
          if (q.method === "update") matched.forEach(r => Object.assign(r, q.payload));
          const data = matched.map(r => q.columns === "*" ? structuredClone(r) : Object.fromEntries(q.columns.split(",").map(c => [c.trim(), structuredClone(r[c.trim()])])));
          return Promise.resolve({ data: q.single ? data[0] || null : data, error: null, count: q.count ? data.length : undefined }).then(resolve, reject);
        },
      };
      return chain;
    },
    async rpc(name, args) { db.rpcCalls.push({ name, args }); return { data: "saved-account", error: null }; },
  };
  return db;
}
