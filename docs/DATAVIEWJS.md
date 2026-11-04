# DataviewJS 兼容范围

星枢 0.2.0 在 Forge 0.4.2 中增加 DataviewJS。打开笔记后，点击查询块的「运行此查询」执行；切换笔记或刷新后需要再次运行。不会要求把现有代码块改成 dataview。

当前支持：

- `dv.pages(source)`、`dv.page(path)`、`dv.current()`、`dv.pagePaths(source)`；来源支持引号文件夹、`#tag`、and/or、括号和排除。
- Dataview DataArray：where/filter/map/flatMap/sort/limit/slice/concat/groupBy/distinct/first/last/sum/avg、遍历和属性展开。
- frontmatter 属性；file 的 name/path/folder/link/tags/etags/aliases/tasks/inlinks/outlinks/size/ctime/mtime。日期支持常用 `toFormat`、`toISO`、`toISODate`、`toMillis`。
- `dv.table/list/taskList/header/paragraph/span/el`、`dv.fileLink`、`dv.array`、`dv.date`；taskList 当前为只读状态列表。
- `document.createElement/createTextNode`、元素 className/textContent/innerHTML/appendChild/append、`this.container`/`dv.container`。这是生成输出的兼容对象，不是宿主 DOM；HTML 在主界面清理后展示。
- `window.renderChart(config, this.container)`：bar/line/pie/doughnut/radar/polarArea/scatter，labels、数值 datasets、颜色、基础图例与坐标设置。图表由星枢自带 Chart.js 绘制，无需启动 Charts 插件。

可直接使用 JavaScript 的 Map、Set、字符串处理、数组、条件和循环实现统计。首页的统计卡片与知识分布图可通过上述接口生成。

边界：不提供 Obsidian app/vault、任意文件读写、SDK、真实页面 DOM、外部脚本、importScripts/CDN、dv.view/dv.io/dv.execute/dv.query、完整 Luxon API、图表回调和插件私有 API。遇到不支持接口会显示错误；不会静默执行宿主命令。普通 `dataview` 查询仍使用原有查询引擎。

每块脚本在独立 Worker 中执行，输入只有已连接库的只读元数据快照，输出为清理后的 HTML 和图表数据。需要 `nexus.read` 与 `nexus.script` 权限，后者不可与 network 并用。宿主 CSP 拒绝网络和外部脚本；脚本不能调用主插件的写入 SDK。

限额：脚本 64000 字符、4 秒执行时间、HTML 100 万字符、序列化结果 200 万字符、最多 20 图表；每表/列表 5000 行，每图最多 50 系列且每系列 5000 点。超时或切换笔记后销毁 Worker。查询执行失败不会改写笔记。
