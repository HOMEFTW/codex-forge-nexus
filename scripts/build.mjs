import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'dist'), stage = path.join(out, 'homeftw.nexus');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
fs.mkdirSync(stage, { recursive: true });
const result = await build({ absWorkingDir: root, entryPoints: ['src/main.jsx'], bundle: true, write: false, metafile: true, outfile: 'panel.js', minify: true, format: 'iife', platform: 'browser', target: ['chrome132'], legalComments: 'external', loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
const output = suffix => result.outputFiles.filter(f => f.path.endsWith(suffix)).map(f => f.text).join('\n');
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>星枢 Nexus</title><style>:root{color-scheme:light dark}html,body,#root{height:100%;margin:0}body{overflow:hidden}' + output('.css').replace(/<\/style/gi, '<\\/style') + '</style></head><body><div id="root"></div><script>' + output('.js').replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
fs.writeFileSync(path.join(stage, 'panel.html'), html);
fs.writeFileSync(path.join(stage, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync(path.join(root, 'README.md'), path.join(stage, 'README.md'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
fs.mkdirSync(path.join(stage, 'docs'), { recursive: true });
for (const name of ['NEXUS.md', 'NEXUS-API.md', 'DATAVIEWJS.md']) fs.copyFileSync(path.join(root, 'docs', name), path.join(stage, 'docs', name));
const icon = JSON.parse(fs.readFileSync(path.join(root, 'src/nexus-icon.json'), 'utf8'));
fs.writeFileSync(path.join(stage, 'nexus.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + icon.viewBox + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icon.paths.map(d => '<path d="' + d + '"/>').join('') + '</svg>');
const licenses = [output('.LEGAL.txt')], seen = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  let directory = path.dirname(path.resolve(root, input));
  while (directory.startsWith(root + path.sep) && directory !== root) {
    if (fs.existsSync(path.join(directory, 'package.json'))) {
      if (!seen.has(directory)) {
        seen.add(directory); const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const files = fs.readdirSync(directory).filter(f => /^(?:licen[sc]e|copying|notice)(?:\.|$)/i.test(f) && fs.statSync(path.join(directory, f)).isFile());
        licenses.push('\n\n=== ' + pkg.name + ' ' + pkg.version + ' (' + (pkg.license || 'see license') + ') ===\n' + files.map(f => fs.readFileSync(path.join(directory, f), 'utf8')).join('\n'));
      }
      break;
    }
    directory = path.dirname(directory);
  }
}
fs.writeFileSync(path.join(stage, 'THIRD-PARTY-NOTICES.txt'), licenses.join('\n'));
const files = ['plugin.json', 'panel.html', 'nexus.svg', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.txt', 'docs/NEXUS.md', 'docs/NEXUS-API.md', 'docs/DATAVIEWJS.md'].map(file => ({ path: file, encoding: 'base64', content: fs.readFileSync(path.join(stage, file)).toString('base64') }));
const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, files })), name = 'Nexus-' + manifest.version + '.forge-plugin.json';
if (files.reduce((total, f) => total + Buffer.from(f.content, 'base64').length, 0) > 20 * 1024 * 1024) throw Error('插件超过 Forge 20 MiB 大小限制');
fs.writeFileSync(path.join(out, name), bytes);
let checksums = crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + name + '\n';
if (process.platform === 'win32') {
  const zipName = 'Nexus-' + manifest.version + '.zip', zip = path.join(out, zipName);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = "Stop"; Compress-Archive -LiteralPath $env:NEXUS_PACKAGE_DIR -DestinationPath $env:NEXUS_ZIP_DEST -Force'], { env: { ...process.env, NEXUS_PACKAGE_DIR: stage, NEXUS_ZIP_DEST: zip }, windowsHide: true });
  checksums += crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex') + '  ' + zipName + '\n';
}
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), checksums);
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify({ id: manifest.id, version: manifest.version, apiVersion: manifest.apiVersion, package: name, bytes: bytes.length, htmlBytes: Buffer.byteLength(html), files: files.map(f => f.path), modules: seen.size }, null, 2));
console.log(JSON.stringify({ package: path.join(out, name), directory: stage, bytes: bytes.length, htmlBytes: Buffer.byteLength(html) }, null, 2));
