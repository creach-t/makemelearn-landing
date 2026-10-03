'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/check-safe.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('scripts/check-safe.mjs', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-safe-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const write = (name, src) => { fs.writeFileSync(path.join(dir, name), src); };

  test('échoue sur une route async non enveloppée (handler inline)', () => {
    write('bad.js', "router.get('/a', async (req, res) => { await x(); });\n");
    const r = run(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/bad\.js:1/);
  });

  test('échoue sur un handler async nommé passé tel quel, et sur function async', () => {
    write('bad2.js', [
      'async function h(req, res) {}',
      'const g = async (req, res) => {};',
      "router.post('/b', h);",
      "router.put('/c', auth, g);",
      "router.delete('/d', async function (req, res) {});",
      ''
    ].join('\n'));
    const r = run(dir);
    expect(r.status).toBe(1);
    expect((r.stderr.match(/bad2\.js:\d+/g) || []).length).toBe(3);
  });

  test('accepte safe(async ...), les handlers synchrones et les chaînes/commentaires piégeux', () => {
    write('good.js', [
      "router.get('/a', safe(async (req, res) => {}));",
      "router.get('/b', requireUser, safe(async function (req, res) {}));",
      "router.get('/c', (req, res) => res.json({}));",
      "// router.get('/d', async () => {})",
      'const s = "router.get(\'/e\', async () => {})";',
      "map.get('cle');",
      ''
    ].join('\n'));
    const r = run(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK/);
  });

  test('le code réel de api/src est conforme', () => {
    const r = run(path.resolve(__dirname, '../src'));
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
