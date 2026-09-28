# 🗺️ Wansan Studio: Master Roadmap (v1.6 - v2.0)

> **Strategic Theme**: **Deep Data Intelligence (Local-First)**
> **Status**: Planning
> **Vision**: Empowering the desktop analyst with AI-augmented understanding (Semantics), processing (ETL), and insight (Causality), all running 100% locally.

---

## 🚀 v1.6: The "Semantic" Update (语义与连接)

**Goal**: Make the AI understand the *business meaning* of data and connect to more local sources.

### 1. Semantic Layer (语义层) [P0]
*   **AI Auto-Tagging**: Ingest time auto-aliasing (e.g., `amt` -> `业绩`, `revenue`).
*   **Business Types**: Recognition of Cities, Currency, IDs for smarter visualization choices.
*   **Metadata Injection**: Inject aliases into the System Prompt to fix "hallucinated column" errors.

### 2. Engine Expansion (引擎增强) [P1]
*   **Native Connectors**: Read-only connection to local **PostgreSQL** and **MySQL** instances (Snapshot mode).
*   **Format Support**: Native **Parquet** support with Hive-Partitioning write/read capability.
*   **Robust Type System**: Enforce `DECIMAL` for currency and `INT64` for timestamps.

---

## 🧠 v1.7: The "Augmentation" Foundation (增强基础)

**Goal**: Establish the core engine capabilities for data augmentation and basic cleaning.

### 1. AI Column Extractor (AI 字段提取) [Implemented]
*   **Feature**: Transform unstructured text into new structured columns (e.g. sentiment, tags) via local batch processing.
*   **Tech**: Uses the **Sidecar Table** architecture (`_ext_ai`) to store augmented data without modifying raw source files.

### 2. Smart Time Intelligence (智能时间增强) [Implemented]
*   **Native Logic**: Built-in MoM (Month-over-Month) and YoY (Year-over-Year) templates using Window Functions (`lag()`).
*   **Implementation**: Automatically injected via logical views (`v_`) in V1.7 architecture.

### 3. Heuristic Ingestion (启发式摄入增强)
*   **Feature**: Advanced CSV/Excel parsing to handle edge cases like unquoted thousands separators (`2,300`).
*   **Strategy**: Two-stage detection with AI semantic disambiguation.

---

## 🧹 v1.7.5: The "Interactive Wrangling" Update (交互式清洗)

**Goal**: Transform Wansan into a "Data App" for interactive cleaning, leveraging the Data Explorer UI.

### 1. Data Explorer (ERP/低代码式数据交互) [Core UI]
*   **Master-Detail View**: Display data as entities (e.g. Orders) with expandable sub-tables (e.g. Order Items).
*   **Virtual Grid**: High-performance rendering for million-row datasets with column profile histograms.
*   **Inline Editing**: Allow users to fix dirty data directly in the grid (write-back to DuckDB).

### 2. Rule-Based Cleaning (规则清洗)
*   **Transformation UI**: Point-and-click interface for Split, Concat, Pivot/Unpivot without SQL.
*   **Smart Deduplication**: Visual UI to identify and merge duplicate records based on fuzzy matching.
*   **Pattern Standardization**: Enforce formatting (e.g., Phone Numbers, IDs) using Regex/Masks.

### 3. AI Augmentation (AI 增强)
*   **Fuzzy Join**: Smart linking using DuckDB string similarity (`levenshtein`) assisted by AI.
*   **Auto-Cleaning Agent**: AI suggests cleaning rules during ingestion (e.g., "Standardize Date Formats").

---

## 📈 v1.8: The "Insight" Update (深度分析)

**Goal**: Provide "Why" and "What Next", moving beyond "What Happened".

### 1. Auto-Attribution (自动归因)
*   **Scenario**: "Why did Sales drop in Q3?"
*   **Analysis**: System automatically drills down into dimensions (Region, Product) to find the segment with the largest negative contribution.

### 2. Auto-Analyst (主动概览)
*   **Feature**: Upon import, AI proactive scans data to generate a "First Impression Report" (Key metrics, Trends, Outliers) without user prompting.

### 3. Wansan Connect Service (Postgres Proxy) [Integration]
*   **Feature**: Expose the internal DuckDB instance as a local **PostgreSQL Server** (via wire protocol).
*   **Value**: Allows Power BI, Tableau, and Excel to connect to Wansan Studio live (localhost:5432). Solves the file-lock issue and enables Wansan to act as the "AI Data Engine" for enterprise reporting tools.

---

## 🔬 v2.0: The "Sovereign" Update (主权与生态)

**Goal**: Total independence from the cloud.

### 1. Local LLM Integration (Ollama)
*   **Feature**: First-class support for **Ollama**.
*   **Value**: Run Llama 3 / Mistral locally. True offline AI analysis for sensitive data.

### 2. Visualization Plugin System
*   **Feature**: Allow developers to load custom chart types (D3.js / React) via plugins.

### 3. DuckDB VSS (Vector Search)
*   **Feature**: Semantic search within data rows using local vector embeddings.

---

## 🛑 Summary of Priorities

| Version | Theme | Key Value |
| :--- | :--- | :--- |
| **v1.6** | **Semantics** | AI understands "Business Speak" & connects to SQL DBs. |
| **v1.7** | **Foundation** | Smart Time Intelligence & Robust Ingestion. |
| **v1.7.5** | **Wrangling** | Interactive Data Explorer & Rule/AI Cleaning. |
| **v1.8** | **Insight** | AI explains "Why" things changed (Attribution). |
| **v2.0** | **Sovereignty** | Full offline AI (Ollama) & Plugin Ecosystem. |

---

## 🛠️ Standalone Optimizations & Backlog (待优化项)

