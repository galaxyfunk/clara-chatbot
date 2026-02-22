export type GapStatus = 'open' | 'resolved' | 'dismissed';

export interface QAGap {
  id: string;
  workspaceId: string;
  question: string;
  aiAnswer: string | null;
  bestMatchId: string | null;
  bestMatchQuestion?: string;
  similarityScore: number | null;
  sessionId: string | null;
  status: GapStatus;
  resolvedQaId: string | null;
  createdAt: string;
}

export interface GapResolveRequest {
  gapId: string;
  question: string;
  answer: string;
  category: string;
}
