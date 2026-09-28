---
name: wansan-workflow
description: Enforces the "Wansan Workflow" (Dual-Mode Protocol: Planning vs. Execution) and provides project-specific context, architectural patterns, and safety mandates for Wansan Studio development. Use this skill for ALL tasks related to the Wansan Studio codebase.
---

# Wansan Studio Workflow & Standards

## 1. The "Wansan Workflow" (MANDATORY)

You MUST follow this strict **Dual-Mode Protocol**. Do not write code unless asked.

### 🔵 MODE A: Planning (Brainstorming)
*   **Trigger**: Open questions ("How should we...", "Review this...", "Next steps?").
*   **Action**: Discuss options, critique UX, propose solutions.
*   **Output**: Conversational text. **NO Code Instructions.**

### 🔴 MODE B: Execution (Implementation)
*   **Trigger**: Direct commands ("Implement...", "Fix this", "Go ahead").
*   **Action**:
    *   **Track 1: Blueprint (Complex)** -> **Current Window**. The main agent generates the `docs/SPEC_[FEATURE].md` and performs architectural analysis.
    *   **Track 2: Implementation (Coding/Fixes)** -> **Delegation Required**. You MUST use the `delegate_to_agent` tool (e.g., `codebase_investigator`) to execute the code changes or implement a previously written SPEC.

**Crucial Rule**: When delegating a Spec execution, do NOT paste the whole spec content. Instead, instruct the sub-agent: *"Context: Read `docs/SPEC_NAME.md` and implement..."*

## 2. Critical Mandates

### 2.1 Privacy Rules
1.  **NEVER** send row data (values) to the LLM. Only schema metadata.
2.  **NEVER** log raw SQL results to external services.
3.  **Local Execution**: All data processing happens in the embedded DuckDB instance.

### 2.2 Safety & Quality Protocols
1.  **Zero-Omission Policy**: NEVER use ellipses (`...`) or `// skip lines` placeholders in any file-writing tool calls. Provide the full, executable content.
2.  **Atomic Modification**: For files exceeding 100 lines, prioritize using multiple small `replace` calls instead of a single `write_file` to minimize the risk of accidental code deletion.
3.  **Destructive Guardrails**: Any operation that performs physical deletion (`fs.remove`, `DROP TABLE`, etc.) MUST include path validation (e.g., ensuring paths are within `os.tmpdir()`) to prevent user data loss.
4.  **Immediate Verification**: Execute `npm run type-check` immediately after modifying `.tsx` or `.ts` files to catch syntax or logic regressions early.

## 3. Project Context

### 3.1 Vision
**Wansan Studio** is a **Local-First**, privacy-focused Business Intelligence (BI) desktop application.
*   **Stack**: Electron (Main/Renderer/Utility), TypeScript, React 18, Vite, Tailwind v4, Shadcn UI.
*   **Database**: **DuckDB Native** (Utility Process).
*   **State**: Zustand + TanStack Query.

### 3.2 Key Patterns
*   **Sidecar Pattern**: Database runs in a Utility Process.
*   **Schema-Only AI**: AI sees only metadata, never rows.
*   **Project Bundles**: `.wansan` folders with `source.duckdb` and `wansan.json`.

## 4. Documentation Index

Refer to these documents for deep dives:

- `docs/00_ARCHITECTURE.md`: System Overview
- `docs/01_DATA_ENGINE.md`: Data Ingestion & Sync
- `docs/02_AI_KERNEL.md`: AI Protocols
- `docs/03_WORKBENCH_UI.md`: Design System
- `docs/04_ENGINEERING.md`: Build & Release
