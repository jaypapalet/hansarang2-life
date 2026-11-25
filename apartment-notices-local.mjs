import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migrations = new URL('./drizzle/', import.meta.url);

export function openLocalNoticeDatabase(pathname) {
  const database = new DatabaseSync(pathname);
  database.exec('PRAGMA busy_timeout = 5000');
  try {
    const { entries } = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8'));
    database.exec('BEGIN IMMEDIATE');
    const { user_version: version } = database.prepare('PRAGMA user_version').get();
    for (const { tag } of entries.slice(version)) {
      database.exec(readFileSync(new URL(`${tag}.sql`, migrations), 'utf8'));
    }
    if (version < entries.length) database.exec(`PRAGMA user_version = ${entries.length}`);
    database.exec('COMMIT');
  } catch (error) {
    database.close();
    throw error;
  }

  return {
    close: () => database.close(),
    batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            all: () => ({ results: statement.all(...values) }),
            first: () => statement.get(...values) ?? null,
            run: () => {
              const { changes, lastInsertRowid } = statement.run(...values);
              return { meta: { changes, last_row_id: lastInsertRowid } };
            },
          };
        },
      };
    },
  };
}

export function openLocalNoticeBucket(directory) {
  function file(key) {
    return new URL(encodeURIComponent(key), directory);
  }
  return {
    async put(key, bytes) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(file(key), new Uint8Array(bytes), { flag: 'wx', mode: 0o600 });
    },
    async get(key) {
      try {
        return { body: await readFile(file(key)) };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    delete: key => rm(file(key), { force: true }),
  };
}
