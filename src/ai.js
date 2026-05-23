const OpenAI = require('openai');

const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_BASE_URL || undefined;
const model = process.env.AI_MODEL || process.env.OLLAMA_MODEL || 'gpt-5.2';

const client = new OpenAI({
  apiKey: apiKey || 'local-api-key',
  baseURL,
});

const defaultRequirements = 'Ты специалист по пожарной безопасности. Отвечай кратко, понятно и по делу на русском языке.';

async function askAi(question, requirements = defaultRequirements) {
  if (!baseURL && !apiKey) {
    throw new Error('Добавь AI_API_KEY в .env');
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: requirements,
      },
      {
        role: 'user',
        content: question,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
}

function askAiByRequirements(requirements) {
  return askAi('Сгенерируй ответ строго по требованиям.', requirements);
}

module.exports = {
  askAi,
  askAiByRequirements,
};
