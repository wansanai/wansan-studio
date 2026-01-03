### # 🧬 SPEC_V1_4_GEN_UI.md - Generative UI Engine (Spike)

> **Version**: 1.4.0-Alpha (Spike)
> **Status**: **Draft / Experimental**
> **Scope**: Shadow DOM Sandbox, Natural Language Spec, AI Code Execution.
> **Related**: `00_ARCHITECTURE.md`, `03_WORKBENCH_UI.md`.

---

## 1. Vision: The "Analyst Narrative" Engine

我们正在从“预定义图表组件”转向 **“生成式 UI (Generative UI)”**。
系统不再存储“柱状图配置”，而是存储“组件规格（Natural Language Spec）”和“渲染代码”。这允许 Wansan 以 pixel-perfect 的精度复刻类似《职行力》报告中的复杂商业图表。

### 1.1 Core Concept

* **Natural Language Spec**: "一个带有进度条和同比增长徽章的 KPI 卡片，风格为 Swiss Minimalist。"
* **Generative Rendering**: AI 将上述规格 + 数据 实时编译为 HTML/JS 片段。
* **Shadow Isolation**: 渲染结果被封装在 Shadow DOM 中，确保样式不污染全局，同时复用全局资源。

---

## 2. Architecture: Global Sandbox & Local Shadow

为了解决 Iframe 的内存开销问题，我们采用 **Shared Context + Shadow Boundary** 架构。

### 2.1 Resource Loading (Global)

* **Strategy**: 在主文档 (`index.html` 或 Layout) 中加载通用库。
* **Libs**:
* `ECharts` (CDN/Local): 全局 `window.echarts`。
* `Tailwind CSS` (CDN for Spike): 全局 `<script src="cdn..."></script>`。
* `FontAwesome`: 图标库。



### 2.2 The Isolation Container (`ShadowWidget`)

每个 AI 生成的卡片是一个 React 组件，维护一个 `ShadowRoot`。

* **Structure**:
```html
<div id="widget-container">
  #shadow-root (open)
    <style>/* Tailwind Reset & Imports */</style>
    <div id="ai-root">
       </div>
</div>

```


* **CSS Penetration**:
* 由于 Shadow DOM 默认屏蔽外部 CSS，我们需要在每个 ShadowRoot 头部注入 `Constructable Stylesheets` 或 `<link rel="stylesheet">` 指向 Tailwind。



---

## 3. Data Protocol (Payload Definition)

为了实现“生成 -> 渲染 -> 复用”闭环，我们定义以下数据接口。

### 3.1 `GenComponent` (Storage Schema)

存储在 `Widget.content` 或新的 `Widget.genSpec` 字段中。

```typescript
interface GenComponent {
  // 1. The "Source Code"
  spec: string;          // Natural Language: "A KPI card with trend..."
  
  // 2. The "Compiled Code" (AI Generated)
  html: string;          // Structural markup (Tailwind classes)
  js: string;            // Layout & Logic (ECharts init, DOM manipulation)
  
  // 3. The "Runtime Data" (Injected by Main Process)
  // distinct from the code to allow reusing the component with new data
  dataSignature: string[]; // Expected fields: ["date", "value", "category"]
}

```

### 3.2 `RenderContext` (Runtime Injection)

AI 生成的 JS 代码**不包含** `<script>` 标签，而是一个**函数体**。我们在运行时通过 `new Function` 注入上下文：

```javascript
/**
 * @param root - The ShadowRoot element (scope limit)
 * @param data - The aggregated DuckDB result rows
 * @param env - Global tools ({ echarts, themeColors, formatters })
 */
function render(root, data, env) {
   // AI writes code here...
   const chart = env.echarts.init(root.querySelector('#chart'));
   // ...
}

```

---

## 4. Security & Safety (The Sandbox)

在本地执行 AI 生成的代码存在风险，我们需要多层防御。

### 4.1 Scope Restriction

* **DOM Access**: AI 代码仅接收 `ShadowRoot` 作为其 `document`。虽然无法完全阻止其访问 `window`，但能有效防止意外修改主 UI（如 `document.body.innerHTML = ''`）。
* **No Eval**: 严禁使用 `eval()`。仅使用 `new Function()`，并在严格模式下运行。

### 4.2 Error Boundaries

* **Render Guard**: `ShadowWidget` 必须被 React `ErrorBoundary` 包裹。
* **Execution Guard**: `new Function` 的执行必须包裹在 `try-catch` 块中。如果报错，显示红色的“代码解析失败”占位符，并允许用户查看原始代码进行修复。

---

## 5. Workflow: The Creation Loop

1. **Insight Trigger**: 用户点击“AI 洞察”。
2. **Data Prep**: Backend (DuckDB) 聚合数据 -> JSON。
3. **Prompt Assembly**:
* System: "你是 Wansan UI 专家。生成 HTML/JS 代码。使用 Tailwind。不要包含 Markdown 标记。"
* Context: `Data Preview` + `User Instruction`。


4. **Generation**: LLM 返回 JSON `{ html, js, spec }`。
5. **Live Preview**: 前端 `ShadowWidget` 立即渲染。
6. **Refinement**: 用户：“换成红色”。-> 携带旧代码 + 修改指令 -> AI 返回新代码。
7. **Finalize**: 保存到 Project Store。

---

## 6. Implementation Plan (Spike)

### Step 1: Foundation

* 在 `index.html` 引入 Tailwind CDN (仅用于 Spike 阶段验证样式隔离)。
* 创建 `src/renderer/src/components/gen-ui/ShadowWidget.tsx`。

### Step 2: Logic Bridge

* 实现 `useGenUIRenderer` Hook，封装 `new Function` 的逻辑。
* Mock 一段静态的 AI 响应数据（模拟《职行力》风格的卡片）进行渲染测试。

### Step 3: AI Integration

* 在 `src/main/engine/prompts` 新增 `GEN_UI_PROMPT`。
* 联调：Chat Input -> AI -> ShadowWidget 渲染链路。
