import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createAdapter } from '../src/adapter.mjs';
import { harness, project, forgeRoot, forgeRequire, packageFile } from '../scripts/harness.mjs';

test('artifact is an external self-contained panel and matches the recorded hash', () => {
  const bytes = fs.readFileSync(packageFile), bundle = JSON.parse(bytes);
  assert.equal(bundle.schemaVersion, 1); const entries = new Map(bundle.files.map(f => [f.path, Buffer.from(f.content, 'base64')]));
  const manifest = JSON.parse(entries.get('plugin.json')); assert.equal(manifest.id, 'homeftw.nexus'); assert.equal(manifest.contributes.panels[0].builtinPage, undefined);
  assert(entries.has(manifest.contributes.panels[0].entry)); assert(!manifest.permissions.includes('network'));
  assert(!manifest.permissions.includes('toolbar')); assert(!manifest.contributes.toolbar?.length);
  assert.equal(manifest.contributes.sidebar[0].icon.viewBox, '0 0 24 24'); assert.equal(manifest.contributes.sidebar[0].icon.paths.length, 3);
  assert(entries.has('nexus.svg')); assert(entries.has('docs/DATAVIEWJS.md'));
  const html = entries.get('panel.html').toString(); assert(!/<script\b[^>]*\bsrc\s*=/i.test(html)); assert(!/<link\b[^>]*\bhref\s*=/i.test(html));
  assert(!html.includes('fastCanvasRequest')); assert(html.includes('CodexForge'));
  assert(entries.has('THIRD-PARTY-NOTICES.txt'));
  assert.equal(entries.get('LICENSE').toString(), fs.readFileSync(path.join(project, 'LICENSE'), 'utf8'));
  assert(fs.readFileSync(path.join(project, 'dist/SHA256SUMS.txt'), 'utf8').startsWith(crypto.createHash('sha256').update(bytes).digest('hex')));
});

test('release installs and enables on supported client baselines while rejecting unsupported hosts', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-compatibility-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { ForgeRegistry } = forgeRequire('runtime/forge-registry.cjs');
  const targets = [
    { codex: '26.1027.6604.0', forge: '0.4.2', apiVersion: 3, supported: true },
    { codex: '26.1029.7803.0', forge: '0.4.3', apiVersion: 3, supported: true },
    { codex: '26.1029.7803.0', forge: '0.4.4', apiVersion: 3, supported: true },
    { codex: '26.1103.4239.0', forge: '0.5.0', apiVersion: 3, supported: true },
    { codex: '26.1103.4239.0', forge: '0.5.1', apiVersion: 3, supported: true },
    { codex: '26.1103.7773.0', forge: '0.5.2', apiVersion: 3, supported: true },
    { codex: '26.1029.7804.0', forge: '0.4.3', apiVersion: 3, supported: false },
    { codex: '26.1027.6604.0', forge: '0.4.1', apiVersion: 3, supported: false },
    { codex: '26.1103.4240.0', forge: '0.5.0', apiVersion: 3, supported: false },
    { codex: '26.1103.7774.0', forge: '0.5.2', apiVersion: 3, supported: false },
    { codex: '26.1103.4239.0', forge: '0.6.0', apiVersion: 3, supported: false },
    { codex: '26.1103.4239.0', forge: '0.5.0', apiVersion: 4, supported: false },
    { codex: '26.1029.7803.0', forge: '0.4.3', apiVersion: 2, supported: false },
  ];
  for (const [index, { supported, ...versions }] of targets.entries()) {
    const registry = new ForgeRegistry({ root: path.join(directory, String(index)), bundledRoot: path.join(directory, 'no-bundled-plugins'), versions });
    if (!supported) {
      assert.throws(() => registry.install(packageFile), /兼容范围|Forge API/, JSON.stringify(versions));
      assert.equal(registry.entries.size, 0); continue;
    }
    assert.equal(registry.install(packageFile).enabled, false);
    registry.setEnabled('homeftw.nexus', true);
    assert.equal(registry.get('homeftw.nexus').builtin, false);
    assert.deepEqual(registry.status('homeftw.nexus'), { enabled: true, requestedEnabled: true, reasons: [] });
    registry.setEnabled('homeftw.nexus', false);
    assert.throws(() => registry.get('homeftw.nexus'), { code: 'PLUGIN_DISABLED' });
    registry.uninstall('homeftw.nexus');
  }
});

for (const scenario of [
  { version: '0.2.1', compatibility: { codex: ['26.1027.6604.0', '26.1029.7803.0'], forge: ['>=0.4.2 <0.5.0'] }, previous: { codex: '26.1029.7803.0', forge: '0.4.3', apiVersion: 3 }, next: { codex: '26.1103.4239.0', forge: '0.5.0', apiVersion: 3 } },
  { version: '0.2.2', compatibility: { codex: ['26.1027.6604.0', '26.1029.7803.0', '26.1103.4239.0'], forge: ['>=0.4.2 <0.6.0'] }, previous: { codex: '26.1103.4239.0', forge: '0.5.1', apiVersion: 3 }, next: { codex: '26.1103.7773.0', forge: '0.5.2', apiVersion: 3 } },
]) test(`a reviewed ${scenario.version} install upgrades on Forge ${scenario.next.forge} at restart and preserves vault data`, t => {
  const h = harness({ install: false }); t.after(() => h.dispose());
  const { ForgeRegistry } = forgeRequire('runtime/forge-registry.cjs');
  const { applyPending, pendingUpdates } = forgeRequire('runtime/forge-plugin-updates.cjs');
  const bundle = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const manifestFile = bundle.files.find(file => file.path === 'plugin.json');
  const current = JSON.parse(Buffer.from(manifestFile.content, 'base64'));
  // Reproduce the published old version's compatibility contract without a network fixture.
  const old = { ...current, version: scenario.version, compatibility: scenario.compatibility };
  manifestFile.content = Buffer.from(JSON.stringify(old)).toString('base64');
  const oldPackage = path.join(h.directory, 'old.forge-plugin.json');
  fs.writeFileSync(oldPackage, JSON.stringify(bundle));
  const options = { root: h.home, bundledRoot: path.join(h.directory, 'no-bundled-plugins') };
  const previous = new ForgeRegistry({ ...options, versions: scenario.previous });
  previous.install(oldPackage); previous.setEnabled(current.id, true);
  const vaultId = h.service.connect(h.vault).vault.id;
  const vaults = h.service.dispatch('vaults'), note = fs.readFileSync(path.join(h.vault, '首页.md'));
  const storage = path.join(h.home, 'storage', current.id + '.json');
  fs.writeFileSync(storage, JSON.stringify({ fixture: 'preserved' }));
  const upgraded = new ForgeRegistry({ ...options, versions: scenario.next });
  assert.equal(upgraded.status(current.id).enabled, false);
  assert.equal(upgraded.status(current.id).requestedEnabled, true);
  const staged = upgraded.install(packageFile);
  assert.equal(staged.restartRequired, true);
  assert.equal(staged.permissionsChanged, false);
  assert.equal(upgraded.get(current.id, false).manifest.version, scenario.version);
  assert.throws(() => upgraded.setEnabled(current.id, true), { code: 'PLUGIN_UPDATE_PENDING' });
  const restarted = new ForgeRegistry({ ...options, versions: upgraded.versions });
  assert.equal(applyPending(restarted)[0].status, 'installed');
  assert.equal(restarted.get(current.id).manifest.version, current.version);
  assert.deepEqual(pendingUpdates(restarted), {});
  assert.deepEqual(JSON.parse(fs.readFileSync(storage)), { fixture: 'preserved' });
  assert.deepEqual(h.service.dispatch('vaults'), vaults);
  assert.equal(h.service.dispatch('read', { vaultId, path: '首页.md' }).content, note.toString());
  assert.deepEqual(fs.readFileSync(path.join(h.vault, '首页.md')), note);
});

test('external plugin installs disabled, calls public SDK host methods, and can be uninstalled', async t => {
  const h = harness({ install: false }); t.after(() => h.dispose());
  const result = h.host.registry.install(h.packageFile); assert.equal(result.enabled, false);
  assert.equal(h.host.registry.get('homeftw.nexus', false).builtin, false);
  assert.equal((await h.api('nexus.request', { method: 'vaults' })).ok, false);
  h.host.registry.setEnabled('homeftw.nexus', true);
  const unwrap = async (method, args) => { const reply = await h.api(method, args); if (!reply.ok) throw Object.assign(Error(reply.error.message), { code: reply.error.code }); return reply.result; };
  const sdk = { nexus: { connect: () => unwrap('nexus.connect', {}), disconnect: vaultId => unwrap('nexus.disconnect', { vaultId }), request: (method, args) => unwrap('nexus.request', { method, args }) }, browser: { open: url => unwrap('browser.open', { url }) } };
  const api = createAdapter(sdk); const connected = await api.request('nexus', { method: 'connect' });
  const vaultId = connected.vault.id;
  const doc = await api.request('nexus', { method: 'read', args: { vaultId, path: '首页.md' } });
  await api.request('nexus', { method: 'write', args: { vaultId, path: doc.path, expectedRevision: doc.revision, content: '# External plugin write' } });
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External plugin write');
  await assert.rejects(api.request('nexus', { method: 'write', args: { vaultId, path: doc.path, expectedRevision: doc.revision, content: 'stale' } }), { code: 'REVISION_CONFLICT' });
  assert.equal((await h.api('nexus.connect', { root: h.vault })).ok, false);
  await api.request('nexus', { method: 'openExternal', args: { url: 'https://example.com/' } }); assert.equal(h.nativeCalls.at(-1).url, 'https://example.com/');
  const response = h.response(); assert.equal(response.status, 200); const csp = response.headers.get('content-security-policy'); assert.match(csp, /media-src data:/); assert.match(csp, /frame-src 'none'/); assert.match(csp, /worker-src blob:/); assert.match(csp, /connect-src 'none'/); assert(!csp.includes('unsafe-eval'));
  await api.request('nexus', { method: 'disconnect', args: { vaultId } });
  assert.equal((await api.request('nexus', { method: 'vaults' })).vaults.length, 0);
  h.host.registry.setEnabled('homeftw.nexus', false); assert.equal((await h.api('nexus.request', { method: 'vaults' })).ok, false);
  assert.equal(h.host.registry.uninstall('homeftw.nexus').removed, 'homeftw.nexus');
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External plugin write');
});

test('real MCP follows external package install, enable, disable and uninstall', async t => {
  const h = harness({ install: false }); t.after(() => h.dispose());
  const vaultId = h.service.connect(h.vault).vault.id;
  const child = spawn(process.execPath, [path.join(forgeRoot, 'runtime/mcp.cjs')], { env: { ...process.env, CODEX_FORGE_HOME: h.home, CODEX_FAST_CANVAS_DIR: h.store }, windowsHide: true });
  t.after(() => child.kill()); let id = 0, stderr = ''; const pending = new Map(); child.stderr.on('data', b => { stderr += b; });
  readline.createInterface({ input: child.stdout }).on('line', line => { const reply = JSON.parse(line); pending.get(reply.id)?.(reply); pending.delete(reply.id); });
  const request = (method, params) => new Promise((resolve, reject) => { const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error(stderr || 'MCP timeout')); }, 15000); pending.set(n, value => { clearTimeout(timer); resolve(value); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  const names = async () => (await request('tools/list')).result.tools.filter(t => t.name.startsWith('nexus_')).map(t => t.name);
  const call = async (name, args) => (await request('tools/call', { name, arguments: args })).result;
  await request('initialize', { protocolVersion: '2025-03-26' }); assert.deepEqual(await names(), []);
  h.host.registry.install(h.packageFile); assert.deepEqual(await names(), []);
  h.host.registry.setEnabled('homeftw.nexus', true); assert((await names()).includes('nexus_write'));
  const doc = JSON.parse((await call('nexus_read', { vaultId, path: '首页.md' })).content[0].text);
  assert(!(await call('nexus_write', { vaultId, path: doc.path, expectedRevision: doc.revision, content: '# External MCP' })).isError);
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External MCP');
  h.host.registry.setEnabled('homeftw.nexus', false); assert.deepEqual(await names(), []); assert((await call('nexus_read', { vaultId, path: doc.path })).isError);
  h.host.registry.setEnabled('homeftw.nexus', true); assert((await names()).includes('nexus_read'));
  h.host.registry.uninstall('homeftw.nexus'); assert.deepEqual(await names(), []); assert((await call('nexus_read', { vaultId, path: doc.path })).isError);
  const exited = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await exited;
});
