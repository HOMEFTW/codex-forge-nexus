import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';
import { readDataset, runDataview } from './dataview-worker.mjs';

export function cleanOutput(html) {
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, ALLOWED_TAGS: ['div', 'span', 'p', 'strong', 'b', 'em', 'i', 'small', 'a', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'code', 'pre'], ALLOWED_ATTR: ['class', 'href', 'data-note', 'data-dv-chart', 'colspan', 'rowspan', 'title'], ALLOW_DATA_ATTR: false });
  fragment.querySelectorAll('[class]').forEach(el => { el.className = [...el.classList].filter(c => /^(?:kb-metric-|dataview-)[a-z0-9_-]+$/i.test(c)).join(' '); });
  const holder = document.createElement('div'); holder.append(fragment); return holder.innerHTML;
}
export function chartConfig(spec) {
  if (!['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter'].includes(spec?.type)) throw Error('DataviewJS 图表类型不支持');
  const labels = spec.data?.labels, datasets = spec.data?.datasets;
  if (!Array.isArray(labels) || labels.length > 5000 || !Array.isArray(datasets) || datasets.length > 50) throw Error('DataviewJS 图表数据超出限制');
  const color = value => Array.isArray(value) ? value.slice(0, 5000).map(x => String(x).slice(0, 100)) : typeof value === 'string' ? value.slice(0, 100) : undefined;
  const data = { labels: labels.map(x => String(x).slice(0, 300)), datasets: datasets.map(s => {
    if (!Array.isArray(s.data) || s.data.length > 5000) throw Error('DataviewJS 图表系列超出限制');
    return { label: String(s.label || '').slice(0, 300), data: s.data.map(v => { if (Number.isFinite(v)) return v; if (spec.type === 'scatter' && Number.isFinite(v?.x) && Number.isFinite(v?.y)) return { x: v.x, y: v.y }; throw Error('DataviewJS 图表需要有限数值'); }), backgroundColor: color(s.backgroundColor), borderColor: color(s.borderColor), borderWidth: Math.min(10, Math.max(0, Number(s.borderWidth) || 1)), fill: !!s.fill, tension: Math.min(1, Math.max(0, Number(s.tension) || 0)) };
  }) };
  const legend = spec.options?.plugins?.legend;
  return { type: spec.type, data, options: { animation: false, responsive: true, maintainAspectRatio: false, indexAxis: spec.options?.indexAxis === 'y' ? 'y' : 'x', plugins: { legend: { display: legend?.display !== false, position: ['top', 'left', 'bottom', 'right'].includes(legend?.position) ? legend.position : 'top' } }, ...(['bar', 'line'].includes(spec.type) ? { scales: { y: { beginAtZero: spec.options?.scales?.y?.beginAtZero !== false, ticks: { precision: 0 } } } } : {}) } };
}
function ScriptChart({ spec }) {
  const canvas = useRef(), [error, setError] = useState('');
  useEffect(() => { let chart; try { chart = new Chart(canvas.current, chartConfig(spec)); } catch (e) { setError(String(e.message || e)); } return () => chart?.destroy(); }, [spec]);
  return <div className="ob-chart">{error && <p className="ob-error">{error}</p>}<canvas ref={canvas} role="img" aria-label="DataviewJS 图表" hidden={!!error}/></div>;
}
function ScriptResult({ result, onOpen }) {
  const ref = useRef(), [charts, setCharts] = useState([]);
  useEffect(() => { setCharts([...ref.current.querySelectorAll('[data-dv-chart]')].slice(0, 20).map(el => ({ el, spec: result.charts[Number(el.dataset.dvChart)] })).filter(c => c.spec)); }, [result]);
  const html = cleanOutput(result.html);
  return <><div className="ob-dataview-output" ref={ref} dangerouslySetInnerHTML={{ __html: html }} onClick={e => { const anchor = e.target.closest('a'); if (!anchor) return; e.preventDefault(); const target = anchor.dataset.note || anchor.getAttribute('href'); if (target && (!/^[a-z][\w+.-]*:/i.test(target) || /^https?:/i.test(target)) && !target.startsWith('//') && target !== '#') onOpen(target); }}/>{charts.map(({ el, spec }, i) => createPortal(<ScriptChart spec={spec}/>, el, String(i)))}</>;
}
export default function DataviewBlock({ code, request, source, onOpen, refresh }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), controller = useRef();
  useEffect(() => { controller.current?.abort(); setResult(null); setError(''); setBusy(false); return () => controller.current?.abort(); }, [code, source, request, refresh]);
  async function run() {
    controller.current?.abort(); const current = controller.current = new AbortController(); setBusy(true); setError('');
    try { const notes = await readDataset(request, current.signal); const value = await runDataview(code, { notes, source }, { signal: current.signal }); if (!current.signal.aborted) setResult(value); }
    catch (e) { if (!current.signal.aborted) setError(String(e.message || e)); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <section className="ob-dataview-script"><div className="ob-dataview-actions"><strong>DataviewJS</strong><button type="button" onClick={run} disabled={busy}>{busy ? '运行中…' : result ? '重新运行' : '运行此查询'}</button></div>{!result && !busy && <p className="ob-muted">点击运行本笔记中的 JavaScript 查询。仅读取知识库快照，不写入文件、不访问网络；4 秒后自动终止。</p>}{error && <p role="alert" className="ob-error">{error}</p>}{result && <ScriptResult result={result} onOpen={onOpen}/>}</section>;
}
