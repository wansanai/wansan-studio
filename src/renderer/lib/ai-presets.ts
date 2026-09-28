export interface ExtractTemplate {
  id: string
  label: string
  prompt: string
  createdAt?: number
  lastUsedAt?: number
}

export const SYSTEM_PRESETS_EN: Omit<ExtractTemplate, 'id' | 'createdAt' | 'lastUsedAt'>[] = [
  { label: 'Sentiment Analysis', prompt: 'Analyze the sentiment of this text (Positive/Negative/Neutral).' },
  { label: 'Extract Keywords', prompt: 'Extract top 3 key entities or topics from the text, separated by commas.' },
  { label: 'Categorize', prompt: 'Classify this into one of these categories: [Tech, Health, Finance, Other].' },
  { label: 'Translate to English', prompt: 'Translate this text into English.' },
  { label: 'Clean Date', prompt: 'Standardize this date to YYYY-MM-DD format.' },
]

export const SYSTEM_PRESETS_ZH: Omit<ExtractTemplate, 'id' | 'createdAt' | 'lastUsedAt'>[] = [
  { label: '情感分析', prompt: '分析这段文本的情感（积极/消极/中性）。' },
  { label: '关键词提取', prompt: '从文本中提取前 3 个关键实体或话题，用逗号分隔。' },
  { label: '自动分类', prompt: '将其归入以下类别之一：[技术, 健康, 金融, 其他]。' },
  { label: '翻译为英文', prompt: '将这段文本翻译成英文。' },
  { label: '日期标准化', prompt: '将此日期标准化为 YYYY-MM-DD格式。' },
]
