# Wansan Studio 更新日志 (v0.5.0) The Structure Update  --  从 WASM 到 Native

#### 换“心”手术：迁移至 Native DuckDB 驱动

之前的版本基于 WASM，这次全面转向了 Native DuckDB (@duckdb/node-api)，并将其运行在独立的 Utility Process 中：

- **性能炸裂**：支持百万行级数据流式导入，利用本地多核算力，复杂查询响应提速。
- **零内存瓶颈**：彻底解决了 WASM 环境下的大文件崩溃问题。
- **展望：**Native DuckDB 具备支持 **VSS (Vector Similarity Search)** 扩展的能力，为本地 AI 语义搜索铺路。

####  多项目包架构：Git 友好的资产文件

我们摒弃了不稳定的浏览器 LocalStorage 存储方案，引入了 **`.wansan` 项目包 (Project Bundle)**：

- **物理持久化**：每个项目都是硬盘上的一个独立文件夹，包含物理数据库、指标定义和 AI 记忆。
- **项目隔离**：不同项目之间的数据和 AI 背景完全隔离，拒绝上下文污染。

#### Schema 强校验：解决 Excel/CSV 的类型推断陷阱

全新的 **Data Ingestion Wizard** ：

- **强制类型定义 (Type Enforcement)**：预览时即可指定列类型，确保 ID 永远是 Text，日期永远是 Timestamp。
- **数据追加（Smart Append）**：支持复合主键（Composite PK）冲突预检，提供 Ignore/Replace 等冲突解决策略，保证本地数据库的一致性。
- **高性能流式解析**：通过 `ExcelJS` Stream 解析模式，百万行级文件在预览与类型指定阶段几乎零延迟，配合 Native DuckDB 的零拷贝磁盘读取，构建了一条稳健的解析链路。
