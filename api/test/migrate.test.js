'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestDb, transformForPgMem, MIGRATE_OPTS: opts, REAL } = require('./helpers/testdb');
const { migrate, listMigrations, splitSql } = require('../src/lib/migrate');


describe('migrations', () => {
  test('001 et 002 sont présentes, ordonnées', () => {
    expect(listMigrations().map((m) => m.name)).toEqual(['001_legacy.sql', '002_game_core.sql']);
  });

  test('base vide : crée le schéma ; 2e exécution = rien à appliquer', async () => {
    const t = await createTestDb({ migrateSchema: false });
    try {
      expect(await migrate(t.db, opts)).toEqual(['001_legacy.sql', '002_game_core.sql']);
      expect(await migrate(t.db, opts)).toEqual([]);
      const tables = (await t.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map((r) => r.table_name);
      for (const name of ['registrations', 'stats', 'users', 'items', 'srs_state', 'schema_migrations']) expect(tables).toContain(name);
    } finally { await t.close(); }
  });

  // pg-mem ne sait pas rejouer CREATE TABLE IF NOT EXISTS sur une table existante : vrai Postgres uniquement.
  (REAL ? test : test.skip)('base de prod existante : la table registrations et ses données sont conservées', async () => {
    const t = await createTestDb({ migrateSchema: false });
    try {
      // Schéma historique déjà en place (créé par database/init.sql) + une inscription
      const legacy = fs.readFileSync(path.resolve(__dirname, '../../database/init.sql'), 'utf8').replace(/\r/g, '');
      if (REAL) await t.db.query(legacy);
      else for (const stmt of splitSql(transformForPgMem('', '001_pgmem'))) await t.db.query(stmt);
      await t.db.query("INSERT INTO registrations (email, source) VALUES ('prod@example.org', 'landing_page')");
      await migrate(t.db, opts);
      const rows = (await t.db.query('SELECT email FROM registrations')).rows;
      expect(rows).toEqual([{ email: 'prod@example.org' }]);
    } finally { await t.close(); }
  });

  test('une migration modifiée après application est refusée (checksum)', async () => {
    const t = await createTestDb({ migrateSchema: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    try {
      fs.writeFileSync(path.join(dir, '001_a.sql'), 'CREATE TABLE IF NOT EXISTS a (id integer);');
      await migrate(t.db, { dir, lock: false, split: true });
      fs.writeFileSync(path.join(dir, '001_a.sql'), 'CREATE TABLE IF NOT EXISTS a (id integer, b integer);');
      await expect(migrate(t.db, { dir, lock: false, split: true })).rejects.toThrow(/modifiée/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); await t.close(); }
  });

  test('une migration en échec est annulée (transaction) et non enregistrée', async () => {
    const t = await createTestDb({ migrateSchema: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    try {
      fs.writeFileSync(path.join(dir, '001_bad.sql'), 'CREATE TABLE ok_t (id integer); SELECT * FROM table_inexistante;');
      await expect(migrate(t.db, { dir, lock: false, split: true })).rejects.toThrow();
      const done = await t.db.query('SELECT name FROM schema_migrations');
      expect(done.rows).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); await t.close(); }
  });
});

(REAL ? describe : describe.skip)('migrations (vrai Postgres uniquement)', () => {
  test('002 est rejouable telle quelle (idempotente), trigger updated_at et contraintes actifs', async () => {
    const t = await createTestDb(); // 001 + 002 appliquées
    try {
      const sql002 = listMigrations().find((m) => m.name === '002_game_core.sql').sql;
      await t.db.query(sql002); // 2e exécution : aucune erreur
      await t.db.query("INSERT INTO users (id) VALUES ('11111111-1111-1111-1111-111111111111')");
      await t.db.query("UPDATE users SET updated_at = now() - interval '1 day' WHERE id = '11111111-1111-1111-1111-111111111111'");
      const before = (await t.db.query("SELECT updated_at FROM users")).rows[0].updated_at;
      await t.db.query("UPDATE users SET display_name = 'x' WHERE id = '11111111-1111-1111-1111-111111111111'");
      const after = (await t.db.query("SELECT updated_at FROM users")).rows[0].updated_at;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
      await expect(t.db.query("UPDATE users SET handle = 'BAD HANDLE' WHERE id = '11111111-1111-1111-1111-111111111111'")).rejects.toThrow(/users_handle_fmt/);
      await expect(t.db.query("UPDATE users SET daily_goal_xp = 5 WHERE id = '11111111-1111-1111-1111-111111111111'")).rejects.toThrow();
    } finally { await t.close(); }
  });

  test('srs_state porte les colonnes FSRS', async () => {
    const t = await createTestDb();
    try {
      const cols = (await t.db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'srs_state'")).rows.map((r) => r.column_name);
      for (const c of ['stability', 'difficulty', 'due', 'state', 'reps', 'lapses', 'last_review']) expect(cols).toContain(c);
      expect(cols).not.toContain('ease');
    } finally { await t.close(); }
  });
});
