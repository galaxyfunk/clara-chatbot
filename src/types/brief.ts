/**
 * The Ask Clara hiring brief — the CONTRACT with Cloud Employee's /ask page.
 *
 * This is a hand-maintained mirror of `site/src/lib/ask/brief.ts` in the
 * galaxyfunk/mygratr repo. Keep the two in sync field-for-field; CE validates
 * incoming briefs against its own copy and ignores fields it does not know, so
 * additions are safe but renames are not.
 *
 * Every field except `intent`, `version` and `strength` is optional BY DESIGN.
 * CE draws an absent field as a dashed "Clara will ask next" prompt, which is
 * what makes a half-finished brief look deliberate instead of broken. A guessed
 * value is worse than a missing one, because a human reads this brief before a
 * sales call.
 */

export type BriefIntent = 'unknown' | 'single_hire' | 'team_hire' | 'product_build';

export type BriefRegion = 'PH' | 'EE' | 'LATAM' | 'mixed';

export type BriefEngagementType = 'full_time' | 'part_time' | 'contract';

export interface BriefRole {
  title: string;
  seniority?: string;
  count: number;
  stacks?: string[];
}

export interface BriefEngagement {
  type: BriefEngagementType;
  durationMonths?: number;
}

export interface BriefMustHave {
  label: string;
  confirmed: boolean;
}

export interface BriefPodSlot {
  role: string;
  count: number;
  note?: string;
}

export interface Brief {
  /** Increments only when the brief's content actually changed. */
  version: number;
  intent: BriefIntent;
  headcount?: number;
  roles?: BriefRole[];
  techStacks?: string[];
  regions?: BriefRegion[];
  engagement?: BriefEngagement;
  timeline?: string;
  teamContext?: string;
  companyContext?: string;
  goals?: string;
  mustHaves?: BriefMustHave[];
  complianceFlags?: string[];
  suggestedPod?: BriefPodSlot[];
  /** 0-100. Drives CE's strength meter and its "brief ready" threshold (70). */
  strength: number;
}

/** A Brief minus its version — the part that decides whether anything changed. */
export type BriefContent = Omit<Brief, 'version'>;

/**
 * The SSE event Clara sends after the token loop and before `done`.
 * The complete brief goes over the wire every time, never a patch: merging
 * partials across a network is where drift lives, and a brief is a few hundred
 * bytes. CE replaces wholesale when `version` increases and ignores the rest.
 */
export interface BriefUpdateEvent {
  type: 'brief_update';
  version: number;
  brief: Brief;
}
