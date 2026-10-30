import type {LLMMessage} from '@/lib/llm/provider';

/** Old assistant geography is not evidence of the prospect's location or the
 * current sales policy. Keep user facts/questions and non-regional context;
 * remove regional assistant sentences from the model replay only. Stored/UI
 * transcripts are unchanged, and the current system policy supplies the pitch. */
export function reconcileRegionHistory(messages: LLMMessage[]): LLMMessage[] {
  return messages.map(message=>message.role!=='assistant'?message:{...message,
    content:message.content.replace(/[^.!?\n]*(?:Philippines|Philippine-based|Latin America|LATAM|Eastern Europe)[^.!?\n]*[.!?]?/gi,
      '[Previous assistant regional advice omitted; follow the current system policy and visitor location.]'),
  });
}
