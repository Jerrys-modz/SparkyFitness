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

const TRANSACTION_CONTROL =
  /^(?:(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT)(?:\s+(?:WORK|TRANSACTION|AND\s+(?:NO\s+)?CHAIN))*|SAVEPOINT\s+\w+|RELEASE(?:\s+SAVEPOINT)?\s+\w+)$/i;

/**
 * The transaction-control statements in a file. Comments, quoted text and
 * dollar-quoted bodies (where PL/pgSQL's own BEGIN and END belong) are removed
 * first, then each statement is checked whole, so `CASE ... END` is not one.
 */
function transactionControl(sql: string): string[] {
  return sql
    .replace(
      /--.*$|\/\*[\s\S]*?\*\/|\$(\w*)\$[\s\S]*?\$\1\$|'(?:[^']|'')*'|"(?:[^"]|"")*"/gm,
      ' '
    )
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/g, ' '))
    .filter((statement) => TRANSACTION_CONTROL.test(statement));
}

describe('migration files', () => {
  it('finds transaction control by statement', () => {
    expect(transactionControl('SELECT 1; COMMIT;')).toEqual(['COMMIT']);
    expect(
      transactionControl(
        "-- don't\nSELECT CASE WHEN true THEN 'a;b' END;\n/* COMMIT; */"
      )
    ).toEqual([]);
  });

  it.each(fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')))(
    '%s leaves transaction control to the migration runner',
    (file) => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      expect(transactionControl(sql)).toEqual([]);
    }
  );
});
