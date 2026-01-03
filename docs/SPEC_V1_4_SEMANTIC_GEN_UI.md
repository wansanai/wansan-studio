# 🧬 SPEC_V1_4_SEMANTIC_GEN_UI.md - Semantic-Driven Generative UI

> **Version**: 1.0 (Post-Spike)
> **Status**: **Approved / Ready for Dev**
> **Scope**: Insight Protocol, Component Spec, GenUI Rendering.
> **Reference**:

---

## 1. Vision & Philosophy (核心理念)

我们正在重新定义 BI 的交互方式：从 **"Configuration-Based" (基于配置)** 转向 **"Semantic-Driven" (基于语义)**。

* **Old Way**: 用户选择 "柱状图" -> 配置 X/Y 轴 -> 调整颜色。
* **New Way**: 用户询问 "分析合规性风险" -> AI 识别 "Critical" 情感 -> 自动生成 "红色预警卡片"。

核心目标是实现类似《职行力》报告中的**“叙事性可视化”**：图表不仅展示数据，更直接表达观点（情感、趋势、异常）。

---

## 2. Architecture: The "Brain-Hand" Model (脑手分离架构)

为了确保生成的准确性和风格的统一性，我们强制将生成过程拆分为两个解耦的阶段。

### 2.1 Phase 1: The Analyst (脑 - 洞察分析)

* **Actor**: `Analyst Agent` (LLM).
* **Input**: Aggregated Data (JSON) + User Query + Domain Rules.
* **Output**: **`InsightPayload`** (Protocol A).
* **Responsibility**: 纯逻辑推理。计算增长率、判定情感色彩 (Sentiment)、提取摘要。不涉及任何 HTML/CSS 代码。

### 2.2 Phase 2: The Designer (手 - 视觉构建)

* **Actor**: `Designer Agent` (LLM).
* **Input**: `InsightPayload` + **`NaturalComponentSpec`** (UI Blueprint).
* **Output**: **`GenUIPayload`** (HTML/JS Code).
* **Responsibility**: 将“情感”翻译为“视觉”。例如：`sentiment: critical` -> `bg-red-50` + `icon-warning`。

---

## 3. The Protocol (核心协议定义)

### 3.1 Protocol A: `InsightPayload` (运行时中间态)

这是“脑”产出的结构化结论，用于驱动 UI 的生成。

```typescript
// src/shared/schemas/insight.ts

export interface InsightPayload {
  // 1. 情感判定：决定 UI 的主色调 (Theme)
  sentiment: 'critical' (Red) | 'warning' (Orange) | 'positive' (Green) | 'neutral' (Blue/Gray);
  
  // 2. 核心指标：用于渲染卡片头部的“大数”或“徽章”
  primary_metric: {
    label: string;          // e.g. "Compliance Issues"
    value: string | number; // e.g. "103"
    trend?: {
      direction: 'up' | 'down' | 'flat';
      value: string;        // e.g. "+550%"
      is_good: boolean;     // e.g. false (for issues, up is bad)
    };
  };

  // 3. 叙事摘要：用于生成卡片内的文本段落
  summary: string;          // e.g. "合规性需求呈现爆发式增长..."
  suggestion?: string;      // e.g. "建议作为 P0 级风险处理"
  
  // 4. 图表建议：指导图表类型的选择
  viz_suggestion: {
    type: 'line' | 'bar' | 'area' | 'scatter' | 'radar';
    reason: string;         // "To show the sharp spike in Q4"
  };
}

```

### 3.2 Protocol B: `NaturalComponentSpec` (可复用资产)

这是我们将存储在数据库中的“组件规格”。它不是代码，而是自然语言描述的**“视觉蓝图”**。

```typescript
// src/shared/schemas/component-spec.ts

export interface NaturalComponentSpec {
  id: string;
  name: string;        // e.g. "Sentiment Alert Card"
  description: string; // "A card that changes color based on sentiment."
  
  // 核心：视觉蓝图 (用于 Prompt Injection)
  // 这是用户通过“多轮对话”打磨出来的 Prompt 精华
  visual_blueprint: string; 
  /* Example:
     "Use a container with semantic background color (Red for critical, Blue for neutral).
      Header should contain a bold title and a trend badge.
      Body should contain a concise summary text.
      Bottom area should render a smooth area chart (mini-mode).
      Use Swiss Style typography (Inter font, tight tracking)."
  */
  
  // 数据槽位 (用于复用映射)
  data_slots: {
    dimensions: string[]; // ["date"]
    measures: string[];   // ["value", "category"]
  };
}

```

### 3.3 Protocol C: `GenUIPayload` (渲染层契约)

这是 Spike 验证通过的最终交付物。

```typescript
// src/shared/schemas/gen-ui.ts

export interface GenUIPayload {
  html: string;        // Structural markup (Tailwind classes)
  js: string;          // Function body: (root, data, env) => void
  data_signature: any; // The actual data slice used for rendering
}

```

---

## 4. Runtime: The Sandbox Viewer (运行时沙箱)

基于 Spike 验证结果，我们将采用 **Global Context + Shadow DOM** 方案。

### 4.1 `ShadowWidget` Component

* **Isolation**: 使用 `element.attachShadow({ mode: 'open' })` 隔离 CSS。
* **Dependency Injection**:
* **Style**: 注入全局构建的 CSS 字符串 (Tailwind Prod Build)。
* **Logic**: 通过 `new Function` 执行 JS，禁止 `eval`。
* **Libs**: 暴露 `window.echarts` 和 `window.TailwindConfig` 给沙箱环境。



### 4.2 Security Constraints

* **DOM Access**: 限制在 `shadowRoot` 范围内，禁止 `document.body` 操作。
* **Network**: 禁止组件内部发起 `fetch/XHR` 请求（数据必须由外部注入）。

---

## 5. Workflow: The Creation Loop (生产闭环)

1. **Trigger**: 用户点击 "Insight Analysis" (针对某图表或数据集)。
2. **Phase 1 (Analyst)**:
   * System: DuckDB Aggregation -> JSON.
   * AI Action: Analyze trends -> Generate `InsightPayload`.
3. **Phase 2 (Designer)**:
   * System: Select default `NaturalComponentSpec` (or user defined).
   * AI Action: `InsightPayload` + `Blueprint` -> Generate `GenUIPayload` (HTML/JS).
4. **Render**: `ShadowWidget` 渲染预览。
5. **Refine (Optional)**:
   * User: "把红色改成更柔和的粉色"。
   * System: Update `NaturalComponentSpec.visual_blueprint` -> Re-run Phase 2.
6. **Persist**: 保存 `GenUIPayload` 到 Dashboard Store，保存 `NaturalComponentSpec` 到 Component Library。

---

## 6. Implementation Plan (落地计划)

### Step 1: Core Schemas

* 创建 `src/shared/schemas/gen-ui.ts`。
* 定义 TypeScript 接口并导出。

### Step 2: Insight Engine (The Brain)

* 实现 `AnalysisService.generateInsight(data)`。
* 编写 `PROMPT_ANALYST`：专注于数值分析和情感打标。

### Step 3: Generation Engine (The Hand)

* 实现 `UIService.generateComponent(insight, blueprint)`。
* 编写 `PROMPT_DESIGNER`：专注于 Tailwind 布局和 ECharts 配置。
* **关键**: 必须包含 "Error Resilience" 指令（检查数据非空）。

### Step 4: Integration

* 将 Spike 中的 `ShadowWidget` 移植到 `src/renderer/src/components/widgets/`。
* 在 Dashboard Grid 中注册新的 Widget 类型 `type: 'gen-ui'`。
