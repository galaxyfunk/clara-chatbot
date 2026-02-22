import OpenAI from 'openai';

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({ model: 'text-embedding-3-small', input: text });
  return response.data[0].embedding;
}
