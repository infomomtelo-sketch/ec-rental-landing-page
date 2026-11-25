/**
 * D1 guard (Phase 2, 504 fix). Wraps a D1Database so every query executed
 * during a request is timed: slow queries (>500 ms) and errors are logged
 * as single-line JSON. Bound values are never logged.
 *
 * Applied once per request at the top of fetch() and once per cron run in
 * scheduled() — handlers keep using env.DB exactly as before, so no call
 * site changes. prepare() returns a wrapped statement that keeps the real
 * one under a symbol, so env.DB.batch() still receives real statements.
 */
import { logJson } from "./outbound";

export const DB_SLOW_MS = 500;
const MAX_SQL_LEN = 200;

function shortSql(sql: string): string {
  return String(sql).replace(/\s+/g, " ").trim().slice(0, MAX_SQL_LEN);
}

// Minimal structural shape of a D1 prepared statement (kept local so this
// file does not depend on the Workers type package).
interface StmtLike {
  bind(...args: unknown[]): StmtLike;
  first(...args: unknown[]): Promise<unknown>;
  run(...args: unknown[]): Promise<unknown>;
  all(...args: unknown[]): Promise<unknown>;
  raw(...args: unknown[]): Promise<unknown>;
}

interface DbLike {
  prepare(sql: string): StmtLike;
  batch(statements: StmtLike[]): Promise<unknown>;
}

const REAL_STATEMENT = Symbol("realStatement");
const STATEMENT_SQL = Symbol("statementSql");

function timedCall<T>(kind: string, sql: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  return fn().then(
    (out) => {
      const ms = Date.now() - started;
      if (ms > DB_SLOW_MS) logJson("d1_slow_query", { ms, kind, sql: shortSql(sql) });
      return out;
    },
    (err) => {
      logJson("d1_error", { ms: Date.now() - started, kind, sql: shortSql(sql), error: err instanceof Error ? err.message : String(err) });
      throw err;
    },
  );
}

function wrapStatement(real: StmtLike, sql: string): StmtLike {
  const wrapped: StmtLike & { [REAL_STATEMENT]?: StmtLike; [STATEMENT_SQL]?: string } = {
    [REAL_STATEMENT]: real,
    [STATEMENT_SQL]: sql,
    bind(...args: unknown[]) {
      return wrapStatement(real.bind(...args), sql);
    },
    first: (...args: unknown[]) => timedCall("first", sql, () => real.first(...args)),
    run: (...args: unknown[]) => timedCall("run", sql, () => real.run(...args)),
    all: (...args: unknown[]) => timedCall("all", sql, () => real.all(...args)),
    raw: (...args: unknown[]) => timedCall("raw", sql, () => real.raw(...args)),
  };
  return wrapped;
}

function unwrap(stmt: unknown): unknown {
  const s = stmt as { [REAL_STATEMENT]?: unknown } | null;
  return (s && s[REAL_STATEMENT]) ?? stmt;
}

function batchSql(statements: unknown[]): string {
  return statements
    .map((s) => {
      const sql = (s as { [STATEMENT_SQL]?: unknown } | null)?.[STATEMENT_SQL];
      return typeof sql === "string" ? shortSql(sql) : "?";
    })
    .join(" ; ");
}

export function guardedDB<T extends object>(db: T): T {
  const target = db as unknown as DbLike & Record<string | symbol, unknown>;
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "prepare") {
        return (sql: string) => wrapStatement(t.prepare(sql), sql);
      }
      if (prop === "batch") {
        return async (statements: StmtLike[]) => {
          const real = statements.map((s) => unwrap(s) as StmtLike);
          const sql = batchSql(statements);
          const started = Date.now();
          try {
            const out = await t.batch(real);
            const ms = Date.now() - started;
            if (ms > DB_SLOW_MS) logJson("d1_slow_query", { ms, kind: "batch", sql });
            return out;
          } catch (err) {
            logJson("d1_error", { ms: Date.now() - started, kind: "batch", sql, error: err instanceof Error ? err.message : String(err) });
            throw err;
          }
        };
      }
      const value = t[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(t) : value;
    },
  }) as unknown as T;
}
