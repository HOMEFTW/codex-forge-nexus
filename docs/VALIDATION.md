# 0.2.0 验证范围

日期：2026-11-04。插件 `homeftw.nexus` 0.2.0，宿主 Forge 0.4.2 / API 3，Windows、Node.js 24.14.1。

## 自动化与交付

- `npm run build`：生成自包含插件目录、JSON 包、Windows ZIP 和校验文件。
- `npm test`：6 项通过，0 失败、0 跳过。覆盖 Dataview 来源与 DataArray、元数据、虚拟 DOM 与图表结果、分页/取消/限额、插件内容和摘要、真实 Forge registry/SDK 生命周期、真实 stdio MCP 生命周期。
- 核验 ZIP、JSON 与安装目录逐文件一致；Release 附带 `SHA256SUMS.txt`，最终下载结果按其校验。
- 界面和渲染依赖随插件交付。源码构建不依赖 Forge UI；集成测试使用宿主源码。

## 浏览器验收

使用实际导出的插件包、Forge SDK/API 与插件 CSP，运行在 `sandbox="allow-scripts"` iframe。预览仅将 CSP frame-ancestors 调整为本机父页面来源，目录选择器返回隔离样例库。

- 核心阅读、编辑保存、搜索、标签、Base、图表、公式、Mermaid、嵌入及 QuickAdd 已完成浏览器联调。
- DataviewJS 打开时不运行；点击后生成统计、表格和图表。三段首页统计脚本在虚构笔记数据上生成 6 张卡片、2 张图表。
- 网络与外部脚本导入被 CSP 拒绝；Worker 中无 Node、插件 SDK 或真实 DOM。输出 script/img 被清理。
- 无限循环约 4.5 秒后显示超时；输出超限有错误提示；切换笔记可取消运行。
- 正常流程控制台 0 errors、0 warnings。主动触发 CSP 的边界测试会产生预期拒绝日志。
- 桌面及 420×900 暗色窄屏已看图核验，窄屏无整个面板横向溢出。README 截图仅含虚构样例数据。

## 与宿主联合验收

Forge 0.4.2 维护方提供的本地验收结果：313 项回归通过，0 失败/跳过；真实 ForgePanel 导入插件 ZIP 后默认停用。启用仅增加左侧入口，包含 3 条 SVG 路径；折叠保留图标和 aria-label；停用后移除入口，顶部工具栏无星枢按钮，点击正确打开插件面板。

宿主本地安装包中的 ForgeRegistry 和内置解压器也验证了 ZIP/7z 导入。客户端安装包与本插件分别交付，插件没有加入宿主发行包。

## 未覆盖的范围

没有安装或重启用户正在运行的客户端，也未对真实知识库写入。隔离浏览器中的父侧栏/目录选择器不等同于当前原生桌面点击验收；音视频设备、非 NTFS/网络文件系统尚未实机验证。第三方插件兼容子集见 [NEXUS.md](NEXUS.md) 和 [DATAVIEWJS.md](DATAVIEWJS.md)，不把这些结果表述为完整 Obsidian 运行环境兼容。
