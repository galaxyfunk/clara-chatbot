export type QASource = 'manual' | 'csv_import' | 'transcript_extraction';

export interface QAPair {
  id: string;
  workspaceId: string;
  question: string;
  answer: string;
  category: string;
  source: QASource;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QAPairFormData {
  question: string;
  answer: string;
  category: string;
}

export interface QAImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: string[];
}

export interface ExtractedQAPair {
  question: string;
  answer: string;
  category: string;
  confidence: number;
  existingMatchId?: string;
  existingMatchScore?: number;
  isNew: boolean;
}

export interface TranscriptExtractionResult {
  pairs: ExtractedQAPair[];
  totalFound: number;
  newCount: number;
  overlapCount: number;
}

export const DEFAULT_CATEGORIES = [
  'pricing',
  'process',
  'developers',
  'retention',
  'case_studies',
  'comparisons',
  'general',
] as const;

export type DefaultCategory = typeof DEFAULT_CATEGORIES[number];
