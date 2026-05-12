export interface FirefliesAttendee {
  email: string;
  name: string | null;
  location?: string | null;
}

export interface FirefliesSentence {
  speaker_name: string;
  text: string;
  start_time: number;
  end_time: number;
}

export interface FirefliesSpeakerAnalytics {
  name: string;
  duration: number;            // minutes (decimal) — Fireflies returns fractional minutes here
  duration_pct: number;        // 0-1 OR 0-100 — normalize in lib
  word_count: number;
  longest_monologue: number;   // seconds — confirmed via 0.8 introspection
  questions: number;
}

export interface FirefliesTranscriptSummary {
  id: string;
  title: string;
  date: number;                // unix ms
  duration: number;            // minutes (decimal) — Fireflies returns fractional minutes
  transcript_url: string;
  meeting_attendees: FirefliesAttendee[];
}

export interface FirefliesTranscriptDetail extends FirefliesTranscriptSummary {
  sentences: FirefliesSentence[];
  analytics: {
    speakers: FirefliesSpeakerAnalytics[];
  };
}
