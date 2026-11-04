import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataview } from '../src/dataview-runtime.mjs';
import { readDataset, workerSource } from '../src/dataview-worker.mjs';

const notes = [
  { path: '知识库/01_系统/主机.md', properties: { 状态: '待确认', 功率: 1200 }, tags: ['设备/轮机'], aliases: ['引擎'], tasks: [{ line: 4, text: '校核', completed: false }], mtime: 1793750400000, ctime: 1793750400000 },
  { path: '知识库/02_设备/辅机.md', properties: { 状态: '已确认', 功率: 300 }, tags: ['设备'], tasks: [] },
  { path: '知识库/90_模板/设备.md', properties: {}, tasks: [] },
];
test('DataviewJS sources, DataArray chaining, aliases, tasks and current page use snapshot data', () => {
  const { dv } = createDataview({ notes, source: notes[0].path });
  assert.equal(dv.pages('"知识库" and -"知识库/90_模板"').length, 2);
  assert.equal(dv.pages('#设备 and -#设备/轮机').length, 1);
  assert.equal(dv.pages().where(p => p.状态 === '待确认').flatMap(p => p.file.tasks).where(t => !t.completed).length, 1);
  assert.equal(dv.current().功率, 1200); assert.equal(dv.page('引擎').file.path, notes[0].path);
  assert.equal(dv.pages().file.tasks.length, 1);
  assert.deepEqual(dv.pages('#设备').sort(p => p.功率, 'desc').map(p => p.功率).array(), [1200, 300]);
  assert.equal(dv.pages('#设备').groupBy(p => p.状态).length, 2);
  assert.equal(dv.current().file.mtime.toFormat('yyyy-MM-dd'), '2026-11-04');
  assert.throws(() => dv.pages('"知识库" ignored'), /不支持|多余/);
});
test('dashboard virtual DOM and renderChart produce data without exposing a page DOM', () => {
  const runtime = createDataview({ notes, source: notes[0].path }), { document, container, window, dv } = runtime;
  const grid = document.createElement('div'); grid.className = 'kb-metric-grid';
  const card = document.createElement('div'); card.className = 'kb-metric-card'; card.innerHTML = '<div class="kb-metric-value">' + dv.pages('#设备').length + '</div>'; grid.appendChild(card); container.appendChild(grid);
  window.renderChart({ type: 'bar', data: { labels: ['主机', '辅机'], datasets: [{ data: [1200, 300] }] } }, container);
  dv.table(['笔记', '功率'], dv.pages('#设备').map(p => [p.file.link, p.功率]));
  const result = runtime.result(); assert.match(result.html, /kb-metric-value">2/); assert.match(result.html, /data-dv-chart="0"/); assert.match(result.html, /data-note="知识库\/01_系统\/主机.md"/);
  assert.equal(result.charts[0].data.datasets[0].data[0], 1200);
  assert.equal(document.querySelector, undefined); assert.equal(window.CodexForge, undefined);
  assert.throws(() => dv.view('other.js'), /暂不支持/);
  assert.throws(() => dv.io.load('private.md'), /暂不支持/);
  assert.throws(() => { card.innerHTML = 'x'.repeat(1_000_001); }, /超过限制/);
});
test('snapshot read follows all pages and rejects loops or aborted runs', async () => {
  const requested = []; const request = async (method, args) => { requested.push([method, args.offset]); return { notes: [notes[args.offset]], nextOffset: args.offset < 2 ? args.offset + 1 : null }; };
  assert.equal((await readDataset(request)).length, 3); assert.deepEqual(requested.map(x => x[1]), [0, 1, 2]);
  await assert.rejects(readDataset(async () => ({ notes: [], nextOffset: 0 })), /未前进/);
  const controller = new AbortController(); controller.abort(); await assert.rejects(readDataset(request, controller.signal), { name: 'AbortError' });
  assert.throws(() => workerSource('x'.repeat(64001)), /64000/);
});
