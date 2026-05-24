const OpenAI = require('openai');

const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_BASE_URL || undefined;
const model = process.env.AI_MODEL || process.env.OLLAMA_MODEL || 'gpt-5.2';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60000;
const AI_RETRIES = Number(process.env.AI_RETRIES) || 2;

const client = new OpenAI({
  apiKey: apiKey || 'local-api-key',
  baseURL,
  timeout: AI_TIMEOUT_MS,
});

const defaultRequirements =
  'Ты специалист по пожарной безопасности. Отвечай кратко, понятно и по делу на русском языке. Тебе запрещено использовать звёздочки (*)';

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableAiError(error) {
  return (
    error?.name === 'APIConnectionTimeoutError' ||
    error?.name === 'APIConnectionError' ||
    error?.code === 'ECONNRESET' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'EAI_AGAIN' ||
    error?.status === 408 ||
    error?.status === 409 ||
    error?.status === 429 ||
    error?.status >= 500
  );
}

async function createCompletionWithRetry(payload) {
  for (let attempt = 0; attempt <= AI_RETRIES; attempt += 1) {
    try {
      return await client.chat.completions.create(payload);
    } catch (error) {
      if (!isRetryableAiError(error) || attempt === AI_RETRIES) {
        throw error;
      }

      console.warn(
        `AI request failed, retrying: ${error.name || error.code || error.message}`
      );
      await delay(1000 * (attempt + 1));
    }
  }
}

async function askAi(question, requirements = defaultRequirements) {
  if (!baseURL && !apiKey) {
    throw new Error('Добавь AI_API_KEY в .env');
  }

  const completion = await createCompletionWithRetry({
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
