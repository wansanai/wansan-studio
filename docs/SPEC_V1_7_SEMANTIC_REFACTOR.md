# 📦 Spec: v1.7 Semantic Layer Refactor & Intelligence

> **Version**: 1.0 (Design)
> **Theme**: "Decoupling Physics from Logic"
> **Core Value**: Architecture purity, reusable business logic, and proactive AI intelligence.

---

## 1. Data Structure Evolution

### 1.1 Physical Layer (`wansan.json` / `AssetManifest`)
We remove all business-related metadata from the physical manifest to keep it strictly focused on data location and raw structure.

```typescript
// src/shared/types/project-manifest.ts

export interface AssetManifest {
  id: string;
  name: string;
  tableName: string;
  source?: DataSourceConfig;
  status?: string;
  rowCount?: number;
  lastModified?: number;
  createdAt?: number;
  columns: Array<{
    name: string;
    type: string;
    safeName: string;
    sampleValues?: any[];
    nullable?: boolean;
    isPrimaryKey?: boolean;
    // DEPRECATED: semantic field is moved to SemanticLayer
  }>;
}
```

### 1.2 Logical Layer (`semantic.json` / `SemanticLayer`)
The `SemanticLayer` becomes the central repository for all business knowledge.

```typescript
// src/shared/types/project-manifest.ts

export interface TableSemantic {
  description?: string;
  /** Column-level business metadata, keyed by original column name */
  columns: Record<string, ColumnSemantic>;
  /** Metrics defined or suggested for this table */
  smartMetrics: SmartMetric[];
  /** Relationships where this table is the source */
  relations: TableRelation[];
}

export interface SemanticLayer {
  /** Keyed by File ID */
  tables: Record<string, TableSemantic>;
  /** Global business rules/context (Domain Memory) */
  domainRules?: string[];
}
```

### 1.3 Enhanced `ColumnSemantic`
We expand the column metadata to support proactive AI suggestions.

```typescript
// src/shared/types.ts

export interface ExtractionHint {
  targetColumnName: string;
  prompt: string;
  reason: string;
}

export interface ColumnSemantic {
  aliases?: string[];
  businessType?: string;
  description?: string;
  isVisibleToAI?: boolean;
  
  // [NEW] v1.7
  usageType?: 'Dimension' | 'Measure' | 'Attribute';
  defaultAggregation?: 'SUM' | 'AVG' | 'COUNT' | 'MAX' | 'NONE';
  
  // [NEW] v1.7 AI Suggestions
  extractionHints?: ExtractionHint[];
}
```

---

## 2. Intelligence Upgrades

### 2.1 Proactive `analyzeSemantics`
The `analyzeSemantics` API will be expanded to return not just metadata, but suggested actions.

**Output Schema:**
```typescript
export interface SemanticAnalysisResult {
  columns: Record<string, ColumnSemantic>;
  metrics: Array<{
    name: string;
    sqlExpression: string;
    description: string;
    reason: string;
  }>;
}
```

### 2.2 Migration of Metrics
All metric suggestion logic previously in `analyzeContext` (which focuses on multi-table relationships) will be moved to `analyzeSemantics` (single table focus) for better discovery and accuracy.

---

## 3. Persistence & Hydration Flow

To maintain UI simplicity, we use a **Hydration Pattern** in the `ProjectManager`.

### 3.1 Loading Flow (Hydration)
1. Read `wansan.json` (Physical Assets).
2. Read `semantic.json` (Logical Layers).
3. **Merge**: For each asset, find its corresponding `TableSemantic` in `SemanticLayer` and attach the data to the `FileNode` used by the Store.
4. UI components see a "Complete Node".

### 3.2 Saving Flow (Dehydration)
1. Collect all `FileNode` objects from the Store.
2. **Strip**: Separate `columns.semantic`, `smartMetrics`, and `relations` into a temporary `SemanticLayer` object.
3. **Write Physical**: Save the cleaned assets to `wansan.json`.
4. **Write Logical**: Save the `SemanticLayer` to `semantic.json`.

---

## 4. UI/UX Refinement

### 4.1 The "Knowledge Dashboard"
The **Schema Editor** (now renamed to **Business Logic Editor**) will feature three tabs:
1. **Fields**: Manage aliases, types, and view AI Extraction Hints.
2. **Metrics**: Manage Smart Metrics (including AI suggestions).
3. **Relationships**: Manage Joins.

### 4.2 Proactive Extraction Label
Columns with `extractionHints` will display a small ✨ icon in the data tree and column list, inviting the user to "Unlock hidden data dimensions".

---

## 5. Implementation Roadmap

1. **Core Types**: Update `shared/types` and `project-manifest.ts`.
2. **ProjectManager**: Implement the Split/Merge logic in `openProject` and `saveProject`.
3. **Engine**: Refactor `semantic-analyzer.ts` and `prompts.ts` to include Metrics/Hints.
4. **Store**: Update `useProjectStore` to handle the new split state (if necessary) or ensure it handles hydrated nodes.
5. **UI**: Update `SemanticEditorModal` and `ColumnsView`.
