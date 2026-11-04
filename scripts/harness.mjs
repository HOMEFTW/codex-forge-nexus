// Development only: real Forge host/SDK/service with a fixture-only native picker.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Module, { createRequire } from 'node:module';
import { populate } from './fixtures.mjs';
export const project = path.resolve(import.meta.dirname, '..');
export const forgeRoot = path.resolve(process.env.FORGE_SOURCE || path.join(project, '../codex-forge'));
export const packageFile = path.join(project, 'dist/Nexus-' + JSON.parse(fs.readFileSync(path.join(project, 'plugin.json'), 'utf8')).version + '.forge-plugin.json');
const require = createRequire(path.join(forgeRoot, 'package.json'));
export const forgeRequire = relative => require(path.join(forgeRoot, relative));
export function harness({ directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-external-')), keep = false, install = true } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const vault = path.join(directory, '演示知识库'), home = path.join(directory, 'forge'), store = path.join(directory, 'store');
  fs.mkdirSync(vault, { recursive: true }); populate(vault);
  const previousHome = process.env.CODEX_FORGE_HOME; process.env.CODEX_FORGE_HOME = home;
  const { NexusService } = forgeRequire('runtime/nexus.cjs');
  const service = new NexusService({ root: path.join(store, 'nexus') }), handlers = new Map(), nativeCalls = [];
  const state = { win: { isDestroyed: () => false, webContents: { send() {} } } };
  const savedLoad = Module._load; Module._load = function(id, ...args) { return id === 'electron' ? {} : savedLoad.call(this, id, ...args); };
  let host;
  try {
    host = forgeRequire('runtime/forge-host.cjs').installForge({
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [vault] }) },
      host: () => state, threadContext: () => ({ threadId: 'fixture-thread' }),
      nativeCall: async (...args) => nativeCalls.push(args), nativeMessage: async (_state, args) => nativeCalls.push(args),
      open() {}, notify() {}, states: new Map(), collaboration: null, nexus: service,
    });
  } finally { Module._load = savedLoad; }
  if (install) {
    host.registry.install(packageFile);
    host.registry.setEnabled('homeftw.nexus', true);
  }
  return {
    directory, vault, home, store, service, host, nativeCalls, packageFile,
    async api(method, args = {}) { return handlers.get('forge:api')({}, { id: 'homeftw.nexus', method, args, threadId: 'fixture-thread' }); },
    response() { return forgeRequire('runtime/forge-content.cjs').pluginResponse(host.registry, 'codex-forge://plugin/homeftw.nexus/main'); },
    dispose() { if (previousHome === undefined) delete process.env.CODEX_FORGE_HOME; else process.env.CODEX_FORGE_HOME = previousHome; if (!keep) fs.rmSync(directory, { recursive: true, force: true }); },
  };
}
