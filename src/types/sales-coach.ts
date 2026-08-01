export type CallType = 'sales' | 'internal' | 'recruitment' | 'other';

export interface ClassifyResult {
  call_type: CallType;
  reason: string;
}

export interface SalesCoachPromptVariables {
  company: string;
  attendees: string;
  duration: string;
  talk_ratios: string;
  longest_monologue: string;
  questions_asked: string;
  transcript: string;
}

export interface SalesCallAnalysis {
  id: string;
  workspaceId: string;
  firefliesMeetingId: string;
  repEmail: string;
  repName: string;
  callTitle: string | null;
  callDate: string | null;
  durationSeconds: number | null;
  prospectDomain: string | null;
  attendees: { email: string; name: string | null }[];
  firefliesUrl: string | null;
  promptSlug: string;
  claudeOutput: string | null;
  slackChannelId: string | null;
  slackParentTs: string | null;
  slackThreadTs: string | null;
  status: 'analyzed' | 'failed' | 'skipped';
  callType: CallType | null;
  errorMessage: string | null;
  analyzedAt: string;
  createdAt: string;
}

export interface SalesCoachRunResult {
  fetched: number;
  skipped_already_analyzed: number;
  skipped_filter: number;
  analyzed: number;
  failed: number;
}
