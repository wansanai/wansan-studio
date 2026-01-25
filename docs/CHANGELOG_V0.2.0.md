# Wansan Studio 更新日志 (v0.2.0) The Workbench Update

### 🚀 核心更新

**1. 多会话工作台 (Multi-Session)**
侧边栏重构支持多 Session，现在更像一个 AI 应用了。

**2. 白盒化 SQL 编辑器 (White-Box SQL)**
拒绝 AI 黑盒，AI 生成的每一行 DuckDB SQL 语句，你都可以直接查看、编辑、优化。

**3. 数据热替换 (Hot Reload) —— 周期性报表自动化**
如果你有一个固定的分析模板（比如“周销售分析”），现在只需替换源文件（ **“Replace”**）、刷新（**“Refresh”**）。


**4. AI 网页导出 (Web Export) —— 赛博朋克风 🤖**
除了 PDF，现在支持导出为 **独立的 .html 文件**。

*   AI 负责写前端代码 (HTML/CSS/ECharts)，本地引擎负责注入数据。
*   依然是 Schema-Only，Row Data 绝不发给 AI。
*   内置了 **Cyberpunk** 主题，做出来的报表发给老板绝对炸裂（也可能被打）。
