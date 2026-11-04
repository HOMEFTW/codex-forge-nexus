// Runs inside a disposable worker. This is a compatibility model, not the page DOM.
export function createDataview({ notes, source }) {
  const MAX_ITEMS = 5000, MAX_HTML = 1_000_000;
  const unsupported = name => { throw Error('DataviewJS 暂不支持 ' + name); };
  const compare = (a, b) => a == null ? b == null ? 0 : -1 : b == null ? 1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a?.path ?? a).localeCompare(String(b?.path ?? b), 'zh-CN', { numeric: true });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const link = (path, embed = false, display) => ({ path: String(path), display, embed, type: 'file' });
  const valueHTML = value => value?.path ? '<a href="#" data-note="' + esc(value.path) + '">' + esc(value.display || value.path.replace(/\.md$/, '').split('/').at(-1)) + '</a>' : Array.isArray(value) || value?.array ? Array.from(value).map(valueHTML).join(', ') : esc(value instanceof Date ? value.toISOString() : value);
  function array(values = []) {
    const data = Array.from(values), methods = {
      array: () => [...data], where: predicate => array(data.filter(predicate)), filter: predicate => array(data.filter(predicate)),
      map: fn => array(data.map(fn)), flatMap: fn => array(data.flatMap((x, i) => { const v = fn(x, i); return v?.array ? v.array() : v; })),
      sort: (key = x => x, direction = 'asc', comparator = compare) => array([...data].sort((a, b) => (direction === 'desc' ? -1 : 1) * comparator(key(a), key(b)))),
      limit: n => array(data.slice(0, n)), slice: (a, b) => array(data.slice(a, b)), concat: other => array([...data, ...other]),
      groupBy: (key, comparator = compare) => { const groups = []; for (const value of data) { const k = key(value); let g = groups.find(g => comparator(g.key, k) === 0); if (!g) groups.push(g = { key: k, rows: [] }); g.rows.push(value); } return array(groups.map(g => ({ key: g.key, rows: array(g.rows) }))); },
      distinct: (key = x => x) => { const seen = new Set(); return array(data.filter(x => { const k = JSON.stringify(key(x)); if (seen.has(k)) return false; seen.add(k); return true; })); },
      first: () => data[0], last: () => data.at(-1), sum: () => data.reduce((a, b) => a + Number(b), 0), avg: () => data.length ? methods.sum() / data.length : 0,
    };
    return new Proxy(data, { get(target, prop) { if (Object.hasOwn(methods, prop)) return methods[prop]; if (prop in target || typeof prop === 'symbol') { const v = Reflect.get(target, prop); return typeof v === 'function' ? v.bind(target) : v; } return array(target.flatMap(x => { const v = x?.[prop]; return v == null ? [] : Array.isArray(v) || v?.array ? Array.from(v) : [v]; })); } });
  }
  function date(value) {
    if (value == null) return null;
    const d = new Date(value); if (Number.isNaN(+d)) throw Error('DataviewJS 日期无效：' + value);
    d.toFormat = format => { const pad = x => String(x).padStart(2, '0'), p = { yyyy: d.getFullYear(), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) }; return String(format).replace(/yyyy|MM|dd|HH|mm|ss/g, x => p[x]); };
    d.toISO = () => d.toISOString(); d.toISODate = () => d.toFormat('yyyy-MM-dd'); d.toMillis = () => +d;
    return d;
  }
  const pages = notes.map(n => ({ ...n.properties, file: {
    name: n.name || n.path.split('/').at(-1).replace(/\.md$/, ''), path: n.path, folder: n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : '', ext: 'md',
    link: link(n.path), size: n.size, ctime: date(n.ctime), mtime: date(n.mtime), cday: date(n.ctime), mday: date(n.mtime),
    tags: array((n.tags || []).flatMap(tag => tag.split('/').map((_x, i, a) => '#' + a.slice(0, i + 1).join('/')))).distinct(), etags: array((n.tags || []).map(t => '#' + t)), aliases: array(n.aliases || []),
    tasks: array((n.tasks || []).map(t => ({ ...t, path: n.path, link: link(n.path), status: t.completed ? 'x' : ' ', checked: t.completed, fullyCompleted: t.completed }))),
    inlinks: array((n.backlinks || []).map(l => link(l.path))), outlinks: array((n.links || []).map(l => link(l.path || l.target))),
  } }));
  function select(selector) {
    if (selector == null || !String(selector).trim()) return pages;
    const text = String(selector), tokens = []; let at = 0;
    while (at < text.length) {
      const match = text.slice(at).match(/^\s+|^("(?:\\.|[^"\\])*"|#[^\s()]+|\b(?:and|or)\b|[()!\-])/i);
      if (!match) throw Error('DataviewJS 来源选择器暂不支持：' + text.slice(at)); at += match[0].length; if (match[1]) tokens.push(match[1]);
    }
    let i = 0;
    function term() { const token = tokens[i++]; if (token === '!' || token === '-') { const fn = term(); return p => !fn(p); } if (token === '(') { const fn = or(); if (tokens[i++] !== ')') throw Error('DataviewJS 来源括号不匹配'); return fn; } if (token?.startsWith('"')) { const folder = JSON.parse(token).replace(/\/$/, ''); return p => p.file.folder === folder || p.file.folder.startsWith(folder + '/'); } if (token?.startsWith('#')) return p => p.file.tags.includes(token); throw Error('DataviewJS 来源选择器无效'); }
    function and() { let fn = term(); while (tokens[i]?.toLowerCase() === 'and') { i++; const left = fn, right = term(); fn = p => left(p) && right(p); } return fn; }
    function or() { let fn = and(); while (tokens[i]?.toLowerCase() === 'or') { i++; const left = fn, right = and(); fn = p => left(p) || right(p); } return fn; }
    const predicate = or(); if (i !== tokens.length) throw Error('DataviewJS 来源选择器有多余内容'); return pages.filter(predicate);
  }
  class Element {
    constructor(tag) { if (!/^[a-z][a-z0-9-]*$/i.test(tag)) throw Error('无效元素'); this.tag = tag; this.children = []; this.attributes = {}; this._html = ''; }
    set className(v) { this.attributes.class = String(v); } get className() { return this.attributes.class || ''; }
    set textContent(v) { this.children = []; this._html = esc(v); }
    set innerText(v) { this.textContent = v; }
    set innerHTML(v) { if (String(v).length > MAX_HTML) throw Error('DataviewJS 输出超过限制'); this.children = []; this._html = String(v); }
    get innerHTML() { return this._html + this.children.map(c => c.toHTML()).join(''); }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    appendChild(node) { if (!(node instanceof Element) || node === this) throw Error('DataviewJS 只能追加兼容元素'); if (this.children.length >= MAX_ITEMS) throw Error('DataviewJS 元素过多'); this.children.push(node); return node; }
    append(...items) { for (const item of items) { if (item instanceof Element) this.appendChild(item); else { const el = new Element('span'); el.textContent = item; this.appendChild(el); } } }
    createEl(tag, options = {}) { const el = new Element(tag); if (typeof options === 'string') el.textContent = options; else { if (options.text != null) el.textContent = options.text; if (options.cls) el.className = options.cls; } return this.appendChild(el); }
    createDiv(options) { return this.createEl('div', options); } createSpan(options) { return this.createEl('span', options); }
    toHTML() { const inner = this.innerHTML; if (inner.length > MAX_HTML) throw Error('DataviewJS 输出超过限制'); return '<' + this.tag + Object.entries(this.attributes).map(([k, v]) => /^[\w-]+$/.test(k) ? ' ' + k + '="' + esc(v) + '"' : '').join('') + '>' + inner + '</' + this.tag + '>'; }
  }
  const container = new Element('div'), charts = [], document = { createElement: tag => new Element(tag), createTextNode: text => { const el = new Element('span'); el.textContent = text; return el; } };
  function output(tag, content, options = {}) { const el = new Element(tag); el.innerHTML = valueHTML(content); if (options.cls) el.className = options.cls; for (const [k, v] of Object.entries(options.attr || {})) el.setAttribute(k, v); (options.container || container).appendChild(el); return el; }
  const dv = {
    pages: selector => array(select(selector)), pagePaths: selector => array(select(selector).map(p => p.file.path)),
    page: (target, origin = source) => { const name = String(target?.path || target), relative = origin.includes('/') ? origin.slice(0, origin.lastIndexOf('/') + 1) + name : name; const exact = pages.find(p => p.file.path === name || p.file.path === name + '.md' || p.file.path === relative || p.file.path === relative + '.md'); if (exact) return exact; const matches = pages.filter(p => p.file.name === name.replace(/\.md$/, '') || p.file.aliases.includes(name)); if (matches.length > 1) throw Error('DataviewJS 笔记名称不唯一：' + name); return matches[0]; },
    current: () => pages.find(p => p.file.path === source), array, isArray: value => Array.isArray(value), fileLink: link, date, compare, equal: (a, b) => compare(a, b) === 0,
    container, el: output, paragraph: content => output('p', content), span: content => output('span', content), header: (level, content) => output('h' + Math.max(1, Math.min(6, Number(level))), content),
    table(headers, rows) { const list = Array.from(rows); if (list.length > MAX_ITEMS) throw Error('DataviewJS 表格最多 5000 行'); const el = new Element('table'); el.innerHTML = '<thead><tr>' + Array.from(headers).map(h => '<th>' + valueHTML(h) + '</th>').join('') + '</tr></thead><tbody>' + list.map(row => '<tr>' + Array.from(row).map(v => '<td>' + valueHTML(v) + '</td>').join('') + '</tr>').join('') + '</tbody>'; container.appendChild(el); },
    list(values) { const list = Array.from(values); if (list.length > MAX_ITEMS) throw Error('DataviewJS 列表最多 5000 条'); const el = new Element('ul'); el.innerHTML = list.map(v => '<li>' + valueHTML(v) + '</li>').join(''); container.appendChild(el); },
    taskList(tasks) { dv.list(Array.from(tasks).map(t => (t.completed ? '☑ ' : '☐ ') + t.text)); },
    io: { load: () => unsupported('dv.io.load'), csv: () => unsupported('dv.io.csv') },
    view: () => unsupported('dv.view'), execute: () => unsupported('dv.execute'), executeJs: () => unsupported('dv.executeJs'), query: () => unsupported('dv.query'),
  };
  const window = { renderChart(config, target = container) { if (charts.length >= 20) throw Error('DataviewJS 图表最多 20 个'); const el = new Element('div'); el.setAttribute('data-dv-chart', charts.length); target.appendChild(el); charts.push(config); } };
  return { dv, document, window, container, result() { const html = container.innerHTML, json = JSON.stringify({ html, charts }); if (json.length > 2_000_000) throw Error('DataviewJS 结果过大'); return JSON.parse(json); } };
}
