import Anthropic from '@anthropic-ai/sdk';

export async function improveQAPair(question: string, answer: string): Promise<{ question: string; answer: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 1024, temperature: 0.5,
    system: `You improve Q&A pairs for a company knowledge base / chatbot. Your job:
1. Make the question clearer and more natural
2. Make the answer professional, concise (2-5 sentences), and self-contained
3. Remove any transcript artifacts, filler words, or rambling
4. Maintain the factual content — do not add information that wasn't there
5. The answer should sound like it belongs on a company FAQ page

Respond with JSON (no markdown fences):
{"question": "...", "answer": "..."}`,
    messages: [{ role: 'user', content: `Please improve this Q&A pair:\n\nQuestion: ${question}\n\nAnswer: ${answer}` }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  try {
    const cleaned = (textContent?.text ?? '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { question: parsed.question || question, answer: parsed.answer || answer };
  } catch { return { question, answer }; }
}
