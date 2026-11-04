import { createDataview } from './dataview-runtime.mjs';

// The script is compiled by the worker loader, never by eval/Function or Node.
export function workerSource(code) {
  if (typeof code !== 'string' || code.length > 64000) throw Error('DataviewJS 脚本最多 64000 字符');
  return `'use strict';\nconst send = self.postMessage.bind(self);\nself.onmessage = async event => {\nself.onmessage = null;\ntry {\nconst runtime = (${createDataview.toString()})(event.data);\nawait (async function(dv,dataview,document,window) {\n${code}\n}).call({container:runtime.container},runtime.dv,runtime.dv,runtime.document,runtime.window);\nsend({result:runtime.result()});\n} catch(error) { send({error:String(error?.message||error)}); }\n};`;
}

export async function readDataset(request, signal) {
  const notes = [], seen = new Set(); let offset = 0;
  do {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const page = await request('snapshot', { offset, limit: 1000 });
    for (const note of page.notes) if (!seen.has(note.path)) { seen.add(note.path); notes.push(note); }
    const next = page.nextOffset; if (next != null && next <= offset) throw Error('知识库分页未前进，请刷新重试'); offset = next;
  } while (offset != null);
  return notes;
}

export function runDataview(code, data, { signal, timeout = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    let worker, url, timer, settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker?.terminate(); if (url) URL.revokeObjectURL(url); error ? reject(error) : resolve(result); };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    try {
      if (signal?.aborted) return abort();
      url = URL.createObjectURL(new Blob([workerSource(code)], { type: 'text/javascript' })); worker = new Worker(url);
      timer = setTimeout(() => finish(Error('DataviewJS 运行超过 4 秒，已终止。请缩小查询范围或检查循环。')), timeout);
      signal?.addEventListener('abort', abort, { once: true });
      worker.onerror = e => { e.preventDefault(); finish(Error(e.message || 'DataviewJS 执行失败')); };
      worker.onmessage = event => {
        try {
          const value = event.data;
          if (value?.error) finish(Error(String(value.error).slice(0, 2000)));
          else if (value?.result && typeof value.result.html === 'string' && Array.isArray(value.result.charts) && value.result.charts.length <= 20 && value.result.html.length <= 1_000_000 && JSON.stringify(value.result).length <= 2_000_000) finish(null, value.result);
          else finish(Error('DataviewJS 返回了无效结果'));
        } catch { finish(Error('DataviewJS 返回了无效结果')); }
      };
      worker.postMessage(data);
    } catch (error) { finish(error); }
  });
}
