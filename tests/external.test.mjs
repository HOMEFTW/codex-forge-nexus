import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import os from 'node:os';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createAdapter } from '../src/adapter.mjs';
import { harness, project, forgeRoot, forgeRequire, packageFile } from '../scripts/harness.mjs';

test('artifact is an external self-contained panel and matches the recorded hash', () => {
  const bytes = fs.readFileSync(packageFile), bundle = JSON.parse(bytes);
  assert.equal(bundle.schemaVersion, 1); const entries = new Map(bundle.files.map(f => [f.path, Buffer.from(f.content, 'base64')]));
  const manifest = JSON.parse(entries.get('plugin.json')); assert.equal(manifest.id, 'homeftw.nexus'); assert.equal(manifest.contributes.panels[0].builtinPage, undefined);
  assert.equal(Object.hasOwn(manifest.compatibility, 'codex'), false);
  assert.deepEqual(manifest, JSON.parse(fs.readFileSync(path.join(project, 'plugin.json'))));
  assert.deepEqual(manifest, JSON.parse(fs.readFileSync(path.join(project, 'dist/homeftw.nexus/plugin.json'))));
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

test('release installs without a Codex version constraint while rejecting unsupported Forge hosts', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-compatibility-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { ForgeRegistry } = forgeRequire('runtime/forge-registry.cjs');
  const targets = [
    { codex: '26.1106.6628.0', forge: '0.6.1', apiVersion: 4, supported: true },
    { codex: '26.1103.7773.0', forge: '0.6.1', apiVersion: 4, supported: true },
    { codex: '99.1.0.0', forge: '0.6.1', apiVersion: 4, supported: true },
    { forge: '0.6.1', apiVersion: 4, supported: true },
    { codex: '26.1103.7773.0', forge: '0.5.2', apiVersion: 3, supported: false },
    { codex: '26.1103.7773.0', forge: '0.5.2', apiVersion: 4, supported: false },
    { codex: '26.1103.7773.0', forge: '0.7.0', apiVersion: 4, supported: false },
    { codex: '26.1103.7773.0', forge: '0.6.0', apiVersion: 4, supported: false },
    { codex: '26.1106.6628.0', forge: '0.6.1', apiVersion: 3, supported: false },
    { codex: '26.1106.6628.0', forge: '0.6.1', apiVersion: 5, supported: false },
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

test('legacy API 3 is rejected by Forge 0.6.0 but supported from 0.6.1 when its Forge range allows it', () => {
  const { compatibility } = forgeRequire('runtime/forge-versions.cjs');
  const legacy = { apiVersion: 3, compatibility: { codex: ['26.1103.7773.0'], forge: ['>=0.6.0 <0.7.0'] } };
  const versions = { codex: '26.1103.7773.0', forge: '0.6.0', apiVersion: 4 };
  assert.deepEqual(compatibility(legacy, versions), { compatible: false, reasons: ['需要 Forge API 3，当前 4'] });
  assert.deepEqual(compatibility(legacy, { ...versions, forge: '0.6.1' }), { compatible: true, reasons: [] });
  assert.equal(compatibility({ ...legacy, compatibility: { ...legacy.compatibility, forge: ['>=0.4.2 <0.6.0'] } }, { ...versions, forge: '0.6.1' }).compatible, false);
});

for (const oldVersion of ['0.2.3', '0.3.0']) for (const enabled of [true, false]) test(`${oldVersion} upgrade preserves requested enablement (${enabled}), settings, storage and vault data`, t => {
  const h = harness({ install: false }); t.after(() => h.dispose());
  const { ForgeRegistry } = forgeRequire('runtime/forge-registry.cjs');
  const { applyPending, pendingUpdates } = forgeRequire('runtime/forge-plugin-updates.cjs');
  const bundle = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const manifestFile = bundle.files.find(file => file.path === 'plugin.json');
  const current = JSON.parse(Buffer.from(manifestFile.content, 'base64'));
  // Reproduce the published old version's compatibility contract without a network fixture.
  const legacy = oldVersion === '0.2.3';
  const old = { ...current, version: oldVersion, apiVersion: legacy ? 3 : 4, compatibility: { codex: legacy ? ['26.1027.6604.0', '26.1029.7803.0', '26.1103.4239.0', '26.1103.7773.0'] : ['26.1103.7773.0'], forge: [legacy ? '>=0.4.2 <0.6.0' : '>=0.6.0 <0.7.0'] } };
  manifestFile.content = Buffer.from(JSON.stringify(old)).toString('base64');
  const oldPackage = path.join(h.directory, 'old.forge-plugin.json');
  fs.writeFileSync(oldPackage, JSON.stringify(bundle));
  const options = { root: h.home, bundledRoot: path.join(h.directory, 'no-bundled-plugins') };
  const previous = new ForgeRegistry({ ...options, versions: { codex: '26.1103.7773.0', forge: legacy ? '0.5.2' : '0.6.0', apiVersion: old.apiVersion } });
  previous.install(oldPackage); previous.setEnabled(current.id, true);
  if (!enabled) previous.setEnabled(current.id, false);
  const vaultId = h.service.connect(h.vault).vault.id;
  const defaults = h.service.dispatch('settings', { vaultId });
  const settings = h.service.dispatch('settings_write', { vaultId, expectedRevision: defaults.revision, values: { dailyFolder: '升级保留日记' } });
  const vaults = h.service.dispatch('vaults'), note = fs.readFileSync(path.join(h.vault, '首页.md'));
  const storage = path.join(h.home, 'storage', current.id + '.json');
  fs.writeFileSync(storage, JSON.stringify({ fixture: 'preserved' }));
  const upgraded = new ForgeRegistry({ ...options, versions: { codex: '26.1106.6628.0', forge: '0.6.1', apiVersion: 4 } });
  assert.equal(upgraded.status(current.id).enabled, false);
  assert.equal(upgraded.status(current.id).requestedEnabled, enabled);
  assert(upgraded.status(current.id).reasons.some(reason => reason.includes('codex 26.1106.6628.0 不在声明兼容范围内')));
  assert(!upgraded.status(current.id).reasons.some(reason => reason.includes('需要 Forge API')));
  assert.throws(() => upgraded.setEnabled(current.id, true), /不在声明兼容范围内/);
  const staged = upgraded.install(packageFile);
  assert.equal(staged.restartRequired, true);
  assert.equal(staged.permissionsChanged, false);
  assert.equal(upgraded.get(current.id, false).manifest.version, oldVersion);
  assert.throws(() => upgraded.setEnabled(current.id, true), { code: 'PLUGIN_UPDATE_PENDING' });
  const restarted = new ForgeRegistry({ ...options, versions: upgraded.versions });
  assert.equal(applyPending(restarted)[0].status, 'installed');
  assert.equal(restarted.get(current.id, false).manifest.version, current.version);
  assert.equal(restarted.status(current.id).enabled, enabled);
  assert.equal(restarted.status(current.id).requestedEnabled, enabled);
  assert.deepEqual(pendingUpdates(restarted), {});
  assert.deepEqual(JSON.parse(fs.readFileSync(storage)), { fixture: 'preserved' });
  assert.deepEqual(h.service.dispatch('vaults'), vaults);
  assert.deepEqual(h.service.dispatch('settings', { vaultId }), settings);
  assert.equal(h.service.dispatch('read', { vaultId, path: '首页.md' }).content, note.toString());
  assert.deepEqual(fs.readFileSync(path.join(h.vault, '首页.md')), note);
});

test('external plugin installs disabled, calls public SDK host methods, and can be uninstalled', async t => {
  const h = harness({ install: false }); t.after(() => h.dispose());
  const result = h.host.registry.install(h.packageFile); assert.equal(result.enabled, false);
  assert.equal(h.host.registry.get('homeftw.nexus', false).builtin, false);
  assert.equal((await h.api('nexus.request', { method: 'vaults' })).ok, false);
  h.host.registry.setEnabled('homeftw.nexus', true);
  const listeners = [], sdkErrors = [];
  const parent = { postMessage({ forgePluginRequest: request }) {
    if (!request) return;
    h.api(request.method, request.args).then(reply => {
      for (const listener of listeners) listener({ source: parent, data: { forgePluginReply: { id: request.id, ...(reply.ok ? { result: reply.result } : { error: reply.error }) } } });
    });
  } };
  const sandbox = { window: { addEventListener: (_name, listener) => listeners.push(listener) }, parent, setTimeout, clearTimeout, console: { error: error => sdkErrors.push(error) } };
  vm.runInNewContext(fs.readFileSync(path.join(forgeRoot, 'runtime/forge-sdk.js'), 'utf8'), sandbox);
  const sdk = sandbox.window.CodexForge;
  t.after(() => { for (const listener of listeners) listener({ source: parent, data: { forgePluginEvent: { name: 'dispose' } } }); });
  const context = await new Promise(resolve => sdk.events.on('ready', resolve));
  assert.equal(sdk.apiVersion, 4); assert.equal(context.apiVersion, 4);
  const capabilities = await sdk.capabilities.get();
  assert(capabilities.negotiated.some(item => item.name === 'nexus' && item.version === 1 && item.granted));
  assert(!capabilities.permissions.includes('conversation.predict'));
  assert(!capabilities.negotiated.some(item => item.name === 'prompt-prediction'));
  assert.throws(() => createAdapter({ ...sdk, apiVersion: 3 }), /Forge 0\.6\.1.*API 4/);
  const api = createAdapter(sdk); const connected = await api.request('nexus', { method: 'connect' });
  const vaultId = connected.vault.id;
  const doc = await api.request('nexus', { method: 'read', args: { vaultId, path: '首页.md' } });
  await api.request('nexus', { method: 'write', args: { vaultId, path: doc.path, expectedRevision: doc.revision, content: '# External plugin write' } });
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External plugin write');
  await assert.rejects(api.request('nexus', { method: 'write', args: { vaultId, path: doc.path, expectedRevision: doc.revision, content: 'stale' } }), { code: 'REVISION_CONFLICT' });
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External plugin write');
  const settings = await api.request('nexus', { method: 'settings', args: { vaultId } });
  await api.request('nexus', { method: 'settings_write', args: { vaultId, expectedRevision: settings.revision, values: { dailyFolder: 'API4日记' } } });
  await assert.rejects(api.request('nexus', { method: 'settings_write', args: { vaultId, expectedRevision: settings.revision, values: { dailyFolder: 'stale' } } }), { code: 'REVISION_CONFLICT' });
  assert.equal((await api.request('nexus', { method: 'settings', args: { vaultId } })).dailyFolder, 'API4日记');
  assert.equal((await h.api('nexus.connect', { root: h.vault })).ok, false);
  await api.request('nexus', { method: 'openExternal', args: { url: 'https://example.com/' } }); assert.equal(h.nativeCalls.at(-1).url, 'https://example.com/');
  const response = h.response(); assert.equal(response.status, 200); const csp = response.headers.get('content-security-policy'); assert.match(csp, /media-src data:/); assert.match(csp, /frame-src 'none'/); assert.match(csp, /worker-src blob:/); assert.match(csp, /connect-src 'none'/); assert(!csp.includes('unsafe-eval'));
  await api.request('nexus', { method: 'disconnect', args: { vaultId } });
  assert.equal((await api.request('nexus', { method: 'vaults' })).vaults.length, 0);
  h.host.registry.setEnabled('homeftw.nexus', false); assert.equal((await h.api('nexus.request', { method: 'vaults' })).ok, false);
  assert.equal(h.host.registry.uninstall('homeftw.nexus').removed, 'homeftw.nexus');
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External plugin write');
  assert.deepEqual(sdkErrors, []);
});

test('omitting Codex compatibility does not grant undeclared write permissions', async t => {
  const h = harness({ install: false }); t.after(() => h.dispose());
  const bundle = JSON.parse(fs.readFileSync(packageFile));
  const file = bundle.files.find(item => item.path === 'plugin.json');
  const manifest = JSON.parse(Buffer.from(file.content, 'base64'));
  manifest.permissions = manifest.permissions.filter(permission => permission !== 'nexus.write');
  file.content = Buffer.from(JSON.stringify(manifest)).toString('base64');
  const readOnly = path.join(h.directory, 'read-only.forge-plugin.json');
  fs.writeFileSync(readOnly, JSON.stringify(bundle));
  h.host.registry.install(readOnly); h.host.registry.setEnabled(manifest.id, true);
  const vaultId = h.service.connect(h.vault).vault.id;
  const read = await h.api('nexus.request', { method: 'read', args: { vaultId, path: '首页.md' } });
  assert.equal(read.ok, true);
  const denied = await h.api('nexus.request', { method: 'write', args: { vaultId, path: '首页.md', expectedRevision: read.result.revision, content: 'unauthorized' } });
  assert.equal(denied.ok, false); assert.equal(denied.error.code, 'PERMISSION_DENIED');
  assert.equal(fs.readFileSync(path.join(h.vault, '首页.md'), 'utf8'), read.result.content);
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
  assert((await call('nexus_write', { vaultId, path: doc.path, expectedRevision: doc.revision, content: 'stale MCP' })).isError);
  assert.equal(fs.readFileSync(path.join(h.vault, doc.path), 'utf8'), '# External MCP');
  h.host.registry.setEnabled('homeftw.nexus', false); assert.deepEqual(await names(), []); assert((await call('nexus_read', { vaultId, path: doc.path })).isError);
  h.host.registry.setEnabled('homeftw.nexus', true); assert((await names()).includes('nexus_read'));
  h.host.registry.uninstall('homeftw.nexus'); assert.deepEqual(await names(), []); assert((await call('nexus_read', { vaultId, path: doc.path })).isError);
  const exited = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await exited;
});
