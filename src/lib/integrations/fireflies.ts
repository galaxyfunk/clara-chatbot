import type {
  FirefliesTranscriptSummary,
  FirefliesTranscriptDetail,
} from '@/types/fireflies';

const FIREFLIES_GRAPHQL_URL = 'https://api.fireflies.ai/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function firefliesQuery<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`[Fireflies] HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`[Fireflies] GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) {
    throw new Error('[Fireflies] Empty response');
  }
  return json.data;
}

/**
 * List recent transcripts owned by the authenticated user.
 * `fromDate` is ISO 8601. Returns most recent first.
 */
export async function listRecentTranscripts(
  apiKey: string,
  options: { fromDate: string; limit: number }
): Promise<FirefliesTranscriptSummary[]> {
  const query = `
    query Transcripts($fromDate: DateTime, $limit: Int) {
      transcripts(fromDate: $fromDate, limit: $limit) {
        id
        title
        date
        duration
        transcript_url
        meeting_attendees {
          email
          name
          location
        }
      }
    }
  `;
  const data = await firefliesQuery<{ transcripts: FirefliesTranscriptSummary[] }>(
    apiKey,
    query,
    { fromDate: options.fromDate, limit: options.limit }
  );
  return data.transcripts ?? [];
}

/**
 * Fetch full transcript (sentences + analytics) for a single meeting ID.
 */
export async function getTranscriptDetail(
  apiKey: string,
  meetingId: string
): Promise<FirefliesTranscriptDetail | null> {
  const query = `
    query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        transcript_url
        meeting_attendees {
          email
          name
          location
        }
        sentences {
          speaker_name
          text
          start_time
          end_time
        }
        analytics {
          speakers {
            name
            duration
            duration_pct
            word_count
            longest_monologue
            questions
          }
        }
      }
    }
  `;
  const data = await firefliesQuery<{ transcript: FirefliesTranscriptDetail | null }>(
    apiKey,
    query,
    { id: meetingId }
  );
  return data.transcript;
}

/**
 * Normalize Fireflies' duration_pct, which can be 0-1 or 0-100 depending on field/version.
 * Returns a percentage 0-100 rounded to nearest integer.
 */
export function normalizeDurationPct(raw: number): number {
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.round(pct);
}
