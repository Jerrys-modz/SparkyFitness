/**
 * Startup runs each migration file and its schema_migrations record in one
 * transaction (utils/dbMigrations.ts). A file's own COMMIT would end that
 * transaction early, so the record could be lost again; a file must not
 * control transactions itself. To commit steps separately, write two files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

// Whole statements only: CASE ... END inside a query is not transaction control.
const TRANSACTION_CONTROL =
  /^\s*(?:(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT)(?:\s+(?:WORK|TRANSACTION|AND\s+(?:NO\s+)?CHAIN))*|SAVEPOINT\s+\w+|RELEASE(?:\s+SAVEPOINT)?\s+\w+)\s*;/im;

/** Blanks dollar-quoted bodies, where PL/pgSQL's own BEGIN and END belong. */
function outsideDollarQuotes(sql: string): string {
  return sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
}

describe('migration files', () => {
  it.each(fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')))(
    '%s leaves transaction control to the migration runner',
    (file) => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      expect(outsideDollarQuotes(sql)).not.toMatch(TRANSACTION_CONTROL);
    }
  );
});
