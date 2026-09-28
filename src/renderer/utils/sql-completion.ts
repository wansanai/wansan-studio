import type { Monaco } from '@monaco-editor/react'
import type { languages } from 'monaco-editor'
import { FileNode } from '@shared/types'
import { getJoinedColumnName } from '@shared/naming-utils'

/**
 * Common DuckDB Keywords
 */
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'WITH', 'UNION', 'ALL', 'DISTINCT', 'OVER', 'PARTITION BY', 'ROWS', 'UNBOUNDED', 'PRECEDING'
]

/**
 * Common DuckDB Functions
 */
const SQL_FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'QUANTILE', 'STDDEV', 'VAR_POP', 'LIST', 'ARRAY_AGG',
  'DATE_TRUNC', 'DATE_PART', 'STRFTIME', 'STRPTIME', 'TODAY', 'NOW', 'AGE',
  'COALESCE', 'IFNULL', 'NULLIF',
  'CAST', 'TRY_CAST',
  'CONCAT', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'UPPER', 'LOWER', 'TRIM'
]

/**
 * Simple alias generator (e.g. "sales_data" -> "sd")
 */
function generateAlias(tableName: string): string {
  if (!tableName) return 't'
  const parts = tableName.split('_').filter(Boolean)
  if (parts.length > 1) {
    return parts.map(p => p[0]).join('').toLowerCase()
  }
  return tableName.slice(0, 2).toLowerCase()
}

/**
 * Registers Wansan-specific SQL completion items (Tables, Columns, Metrics)
 */
export function registerSqlCompletion(monaco: Monaco, files: FileNode[]) {
  // Dispose previous provider if any? 
  // Monaco usually manages this by language ID, but for dynamic schemas, 
  // we might need to dispose and re-register or use a shared reference.
  
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const suggestions: languages.CompletionItem[] = []

      // 1. Keywords & Snippets
      SQL_KEYWORDS.forEach(kw => {
        if (kw === 'SELECT') {
          suggestions.push({
            label: 'SELECT',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'SELECT ${1:*} FROM "${2:table}" AS ${3:t}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: 'SELECT * FROM table AS alias'
          })
        } else if (kw === 'FROM') {
          suggestions.push({
            label: 'FROM',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'FROM "${1:table}" AS ${2:t}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: 'FROM table AS alias'
          })
        } else {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `${kw} `, // Auto-append space
            range,
          })
        }
      })

      // 2. Functions
      SQL_FUNCTIONS.forEach(fn => {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })
      })

      // 3. Tables (Files)
      files.forEach(file => {
        const tableAlias = generateAlias(file.tableName)
        
        suggestions.push({
          label: file.tableName,
          detail: `Table: ${file.name}`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: `"${file.tableName}" AS \${1:${tableAlias}}`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })

        // 4. Columns for this table
        file.columns.forEach(col => {
          if (col.name === '_ws_row_id') return
          suggestions.push({
            label: col.name,
            detail: `Column (${col.type}) in ${file.tableName}`,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: `"${col.name}"`,
            range,
          })
        })

        // 5. Smart Metrics
        if (file.smartMetrics) {
          file.smartMetrics.forEach(metric => {
            suggestions.push({
              label: metric.name,
              detail: `Metric in ${file.tableName}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `"${metric.name}"`,
              range,
            })
          })
        }

        // 6. Relations (JOIN Snippets)
        if (file.relations) {
          file.relations.forEach(rel => {
            const targetFile = files.find(f => f.id === rel.targetFileId)
            if (targetFile) {
              const joinType = rel.joinType || 'LEFT'
              const label = `${joinType} JOIN ${targetFile.tableName}`
              
              const sourceAlias = generateAlias(file.tableName)
              const targetAlias = generateAlias(targetFile.tableName)
              
              // Use snippets for aliases: ${1:targetAlias} and ${2:sourceAlias}
              const insertText = `${joinType} JOIN "${targetFile.tableName}" AS \${1:${targetAlias}} ON "\${2:${sourceAlias}}"."${rel.sourceColumn}" = "\${1:${targetAlias}}"."${rel.targetColumn}"`
              
              suggestions.push({
                label: label,
                detail: `Relation: ${file.tableName} -> ${targetFile.tableName}`,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: insertText,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
                documentation: {
                  value: `Auto-generated JOIN based on relationship:\n${file.tableName}.${rel.sourceColumn} = ${targetFile.tableName}.${rel.targetColumn}`
                }
              })
            }
          })
        }

        // 7. Wide Views (v_*) & their columns
        if (file.smartMetrics && file.smartMetrics.length > 0) {
          const viewName = `v_${file.tableName}`
          const viewAlias = `v${tableAlias}`
          
          suggestions.push({
            label: viewName,
            detail: `Wide View for ${file.name}`,
            kind: monaco.languages.CompletionItemKind.Interface,
            insertText: `"${viewName}" AS \${1:${viewAlias}}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            documentation: {
              value: `View containing native columns, joined columns, and smart metrics.`
            }
          })

          // View Columns: Native
          file.columns.forEach(col => {
            if (col.name === '_ws_row_id') return
            suggestions.push({
              label: col.name,
              detail: `Column in ${viewName}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `"${col.name}"`,
              range
            })
          })

          // View Columns: Smart Metrics
          file.smartMetrics.forEach(metric => {
            suggestions.push({
              label: metric.name,
              detail: `Metric in ${viewName}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `"${metric.name}"`,
              range
            })
          })

          // View Columns: Joined
          if (file.relations) {
            file.relations.forEach(rel => {
              const targetFile = files.find(f => f.id === rel.targetFileId)
              if (targetFile) {
                targetFile.columns.forEach(targetCol => {
                  if (targetCol.name === '_ws_row_id') return
                  const joinedName = getJoinedColumnName(rel.sourceColumn, targetCol.name)
                  suggestions.push({
                    label: joinedName,
                    detail: `Joined Column (${targetFile.tableName}) in ${viewName}`,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: `"${joinedName}"`,
                    range
                  })
                })
              }
            })
          }
        }
      })

      return { suggestions }
    },
  })
}
