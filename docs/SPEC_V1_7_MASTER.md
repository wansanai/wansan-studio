# 📦 Spec: v1.7 Augmentation (增强与清洗)

> **Version**: Draft 1.0
> **Theme**: "Turn Dirty Data into Analytical Assets"
> **Core Value**: 赋予用户通过 AI 将非结构化文本转化为结构化维度，并自动生成高阶时间分析指标的能力，同时建立稳健的成本控制体系。

---

## 1. 核心理念 (Philosophy)

### 1.1 Non-Destructive Augmentation (非破坏性增强)
在 V1.7 中，我们将引入“增强”概念。所有的清洗、提取和计算操作，**绝不修改原始物理数据文件**。
*   **物理层**：原始数据 (Raw) + 伴生数据 (Sidecar)。
*   **逻辑层**：通过 DuckDB `VIEW` 实时拼合呈现。

### 1.2 Cost-Aware Intelligence (成本感知智能)
从“对话式 AI”转向“批处理 AI”意味着 Token 消耗将呈指数级增长。V1.7 必须内置“Token 审计系统”，让用户对每一分钱的消耗拥有知情权和控制权。

---

## 2. 核心架构：Sidecar Persistence (伴生持久化)

为了支持对只读原始数据的“追加列”操作，我们采用 Sidecar 模式。

### 2.1 全局行 ID (Global Row Identity)
DuckDB 的隐式 `rowid` 不稳定，必须显式物化 ID。

*   **Sequence 机制**：
    *   每个主表 `T` 对应一个序列 `seq_T`。
    *   在 Ingestion (Stage 3) 阶段，自动生成 `_ws_row_id`。
    ```sql
    CREATE SEQUENCE seq_sales_data START 1;
    CREATE TABLE sales_data AS SELECT nextval('seq_sales_data') AS _ws_row_id, * FROM ...;
    ```

### 2.2 伴生表结构 (Sidecar Table)
*   **命名规范**：`{tableName}_ext_ai`
*   **用途**：存储 AI 生成的字段或用户标注的数据。
*   **结构**：
    ```sql
    CREATE TABLE sales_data_ext_ai (
        _ws_row_id BIGINT PRIMARY KEY, -- 锚点
        sentiment TEXT,                -- AI 列 1
        tags VARCHAR[],                -- AI 列 2
        cleaned_date TIMESTAMP         -- 清洗列
    );
    ```

### 2.3 动态视图 (Dynamic View)
用户交互的实体永远是 View，而非物理表。
```sql
CREATE OR REPLACE VIEW v_sales_data AS
SELECT 
    t1.*, 
    t2.sentiment,
    t2.tags
FROM sales_data t1
LEFT JOIN sales_data_ext_ai t2 ON t1._ws_row_id = t2._ws_row_id;
```

### 2.4 数据一致性协议 (Consistency Protocol)
| 操作 | 主表动作 | 伴生表动作 | 结果状态 |
| :--- | :--- | :--- | :--- |
| **Append** | Insert Rows (New IDs) | 无动作 | 新行 AI 字段为 `NULL` (待处理) |
| **Merge** | Update Rows | **Delete Matches** | 更新行 AI 字段重置为 `NULL` (防止过时) |
| **Delete** | Delete Rows | 无动作 (Lazy GC) | 视图自动过滤 |
| **Replace**| Drop Table | **Drop Table** | 全部重置 |

---

## 3. 功能特性：AI Column Extractor (AI 字段提取) [Implemented]

### 3.1 交互流程 (The Flow)
1.  **触发**：表结构编辑器 (Schema Editor) 字段右键 -> `✨ AI 智能提取`。
2.  **配置 (Modal)**:
    *   **Input**: 左侧展示源列样本。
    *   **Prompt**: 支持自然语言或预设 Chips (情感分析/关键词/分类)。
    *   **Preview**: **实时试运行** (使用 5 行数据)，AI 自动推断目标列名和类型。
    *   **Estimate**: 显示“预计消耗 Token / 费用”。
3.  **执行 (Execution)**:
    *   后端启动批处理任务 (Batch Job)。
    *   UI 发送 IPC 事件 `ai:batch-extract` 启动。
    *   数据分批写入 Sidecar 表 (`_ext_ai`)，视图自动刷新。

### 3.2 技术实现
*   **Batching**: 采用后端 `BatchProcessor` 分批处理（默认 20 行/批）。
*   **Progress**: 通过 IPC 事件 `ai:batch-progress` 实时回传进度到 UI。
*   **Persistence**: 结果持久化在 Sidecar 表中，通过主表的 `_ws_row_id` 进行关联。

---

## 4. 功能特性：Token Audit System (审计与预算)

采用 **Hybrid Model (混合模式)** 管理 Token 消耗，兼顾安全控制与数据隐私。

### 4.1 Global Layer (全局控制层)
> **Store**: `SettingsStore` (Persisted locally)
> **Scope**: Application-wide

*   **Configuration**:
    *   API Keys (OpenAI / DeepSeek / Ollama)
    *   Model Pricing Table (用户可自定义单价)
*   **Budget Control**:
    *   `Daily Hard Limit` (e.g. $5.00): 防止全局意外超支。
*   **Aggregated Stats**:
    *   仅存储每日总消耗金额（不含敏感 Prompt）。
    *   用于状态栏显示 "Today: $0.45"。

### 4.2 Project Layer (项目审计层)
> **Store**: `.wansan/audit.json` (Project Bundle)
> **Scope**: Per-project

*   **Transaction Logs**:
    *   详细记录每笔操作，作为项目资产的一部分。
    *   包含 Prompt 快照，支持追溯 AI 的决策依据。

```typescript
// .wansan/audit.json
interface TokenAuditLog {
  version: 1;
  transactions: {
    id: string;
    timestamp: number;
    action: 'chat' | 'batch_extract' | 'auto_clean';
    model: string;
    cost: {
      input_tokens: number;
      output_tokens: number;
      total_usd: number;
    };
    snapshot: {
      table?: string;
      column?: string;
      prompt_preview?: string; // 截取前 100 字符
    };
  }[];
}
```

### 4.3 三层防护体系 (Defense in Depth)
1.  **Pre-Flight (事前)**: 
    *   在执行大批量任务前，计算 `Row_Count * Avg_Token_Per_Row`。
    *   如果 > 用户设定的 `Soft Limit` (如 $1.0)，强制弹窗二次确认。
2.  **In-Flight (事中)**:
    *   实时监控批处理消耗。
    *   设置熔断器：如果实际消耗超过预估 150% 或触达全局 Hard Limit，自动暂停任务。
3.  **Post-Flight (事后)**:
    *   提供“成本仪表盘”，支持按项目和按全局维度查看花费曲线。

---

## 5. 功能特性：Smart Time Intelligence (智能时间增强)

将原定 V1.8 的时间计算提前，利用 DuckDB 强大的 Window Functions 增强时间维度。

### 5.1 自动计算列
当系统检测到通过 `Date` 字段聚合的 View 时，自动生成以下逻辑列（用户可选）：
*   **YoY (同比)**: `(Value - Lag(Value, 12)) / Lag(Value, 12)`
*   **MoM (环比)**: `(Value - Lag(Value, 1)) / Lag(Value, 1)`
*   **YTD (年初至今)**: `Sum(Value) OVER (PARTITION BY Year ORDER BY Date)`

### 5.2 实现方式
不生成物理数据，直接修改 View 的 SQL 定义。
```sql
-- 自动生成的 View 定义
CREATE VIEW v_sales_analysis AS
SELECT 
    date, 
    revenue,
    (revenue - lag(revenue) OVER (ORDER BY date)) / lag(revenue) OVER (ORDER BY date) as revenue_mom
FROM sales_agg;
```

---

## 6. 功能特性：Heuristic Ingestion (启发式摄入增强)

### 6.1 痛点
来自旧系统的 CSV 文件中，数值常包含千分位逗号且未加引号（如 `2,300`），导致 DuckDB 默认的 CSV 嗅探器（Sniffer）将其误判为两列或报错。

### 6.2 解决方案：两阶段探测 (Two-Stage Detection)
1.  **Stage 1: Strict Sniffing (标准探测)**
    *   尝试使用 DuckDB 默认设置读取前 100 行。
    *   如果列数一致且类型合理，直接通过。
2.  **Stage 2: Heuristic Fallback (启发式兜底)**
    *   如果 Stage 1 失败（列数不匹配或大量 NULL），启动 JS 层面的预解析。
    *   **Regex Pattern**: 识别 `\d{1,3}(,\d{3})+(\.\d+)?` 模式。
    *   **Action**: 自动将千分位逗号去除或用引号包裹，生成临时清洗后的 CSV，再喂给 DuckDB。

---

## 7. 开发计划 (Implementation Phases)

### Phase 1: Infrastructure (基础架构)
*   [Backend] 实现 DuckDB Sequence 管理与 `_ws_row_id` 生成逻辑。
*   [Backend] 实现 Sidecar 表的创建、关联与生命周期管理 (Cascade Drop)。
*   [Shared] 定义 `TokenUsage` 数据结构与 Store。

### Phase 2: AI Pipeline (AI 管道)
*   [Backend] 升级 `AIService` 支持 Batch Processing (分批并发)。
*   [Backend] 实现 Token 预估与熔断逻辑。
*   [UI] 开发 `TokenAudit` 设置面板与状态栏组件。

### Phase 3: Features (特性开发)
*   [UI] 开发“AI 智能提取”右键菜单与交互弹窗 (Modal)。
*   [UI] 开发“AI 清洗”建议流。
*   [Backend] 实现 Time Intelligence 的 SQL 生成器。

### Phase 4: Polish (打磨)
*   大量数据 (10w+ 行) 压力测试。
*   Token 计费准确性校准。

---

## 8. Migration Strategy (V1.6 -> V1.7)

由于 V1.7 强制依赖 `_ws_row_id`，打开旧版项目时必须执行一次性迁移。

### 8.1 自动检测与重构
在 `ProjectManager.openProject` 阶段，检测表结构。如果缺失 `_ws_row_id`，执行 **CTAS 重构**：

```sql
-- 1. Create Sequence
CREATE OR REPLACE SEQUENCE seq_{tableName} START 1;

-- 2. Rebuild Table with IDs (Deterministic Backfill)
CREATE TABLE {tableName}_v17 AS 
SELECT 
    CAST(row_number() OVER () AS BIGINT) AS _ws_row_id,
    * 
FROM {tableName};

-- 3. Sync Sequence High-Water Mark
SELECT setval('seq_{tableName}', (SELECT MAX(_ws_row_id) FROM {tableName}_v17));

-- 4. Hot Swap
DROP TABLE {tableName};
ALTER TABLE {tableName}_v17 RENAME TO {tableName};
```

### 8.2 视图兼容性
迁移后，原有的 DuckDB Views (Smart Metrics) 可能会因为 `SELECT *` 的语义变化而包含 `_ws_row_id`。
*   **策略**：系统应扫描所有 Views，如果它们是 `SELECT *` 构建的，无需修改（ID 列对用户不可见或无害）。如果是显式列名构建的，保持不变。

