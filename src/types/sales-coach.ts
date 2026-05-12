export interface SalesCoachFilterInput {
  attendees: { email: string; name: string | null }[];
  teamDomains: string[];
}

export interface SalesCoachFilterResult {
  ok: boolean;
  reason?: 'no_external_attendee' | 'no_attendees';
  externalAttendees?: { email: string; name: string | null }[];
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
