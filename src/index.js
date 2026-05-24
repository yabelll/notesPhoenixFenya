require('dotenv').config();

const VkBot = require('node-vk-bot-api');
const Markup = require('node-vk-bot-api/lib/markup');
const Session = require('node-vk-bot-api/lib/session');
const Stage = require('node-vk-bot-api/lib/stage');
const theoryScene = require('./scene/theory');
const questionScene = require('./scene/question');
const situationScene = require('./scene/situation');
const testScene = require('./scene/test');

const bot = new VkBot(process.env.TOKEN);
const session = new Session();
const stage = new Stage(theoryScene, questionScene, situationScene, testScene);
const startedAt = Math.floor(Date.now() / 1000);
const handledMessages = new Set();
const RETRYABLE_NETWORK_ERRORS = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EAI_AGAIN',
  'ENOTFOUND',
]);
const IGNORED_REPLY_API_ERRORS = new Set([901]);

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableNetworkError(error) {
  return RETRYABLE_NETWORK_ERRORS.has(error?.code);
}

function isIgnoredReplyError(error) {
  return IGNORED_REPLY_API_ERRORS.has(error?.response?.error_code);
}

function logReplyError(error) {
  const apiErrorCode = error?.response?.error_code;
  const apiErrorMessage = error?.response?.error_msg;

  if (apiErrorCode) {
    console.warn(`VK reply failed: ${apiErrorCode} ${apiErrorMessage}`);
    return;
  }

  console.warn(`VK reply failed: ${error?.code || error?.message || error}`);
}

function logUnhandledError(error) {
  console.error('Unhandled bot error:', error);
}

process.on('unhandledRejection', logUnhandledError);
process.on('uncaughtException', logUnhandledError);

async function retryReply(reply, args, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await reply(...args);
    } catch (error) {
      if (isIgnoredReplyError(error)) {
        logReplyError(error);
        return null;
      }

      if (!isRetryableNetworkError(error)) {
        logReplyError(error);
        return null;
      }

      if (attempt === retries) {
        logReplyError(error);
        return null;
      }

      await delay(500 * (attempt + 1));
    }
  }
}

function getMessageKey(ctx) {
  return [
    ctx.eventId,
    ctx.message.peer_id,
    ctx.message.from_id,
    ctx.message.id,
    ctx.message.conversation_message_id,
    ctx.message.date,
    ctx.message.text || ctx.message.body,
  ]
    .filter(Boolean)
    .join(':');
}

bot.use((ctx, next) => {
  if (
    ctx.message.out ||
    ctx.message.from_id < 0 ||
    ctx.message.date <= startedAt
  ) {
    return;
  }

  const messageKey = getMessageKey(ctx);

  if (handledMessages.has(messageKey)) {
    return;
  }

  handledMessages.add(messageKey);

  if (handledMessages.size > 1000) {
    handledMessages.clear();
  }

  next();
});

bot.use((ctx, next) => {
  const originalReply = ctx.reply.bind(ctx);

  ctx.reply = (...args) => retryReply(originalReply, args);

  next();
});

bot.use(session.middleware());
bot.use(stage.middleware());

bot.command('Начать', (ctx) => {
  ctx.reply(
    `Привет! Я — Феня. Феникс, который знает об огне всё.

📓 Этот чат-бот — мои личные заметки с самыми важными правилами и опасными ситуациями, которые я сам прошёл (пару раз даже выгорал, но это другая история...)
Делюсь заметками, чтобы ты знал, как дружить с огнём и не пострадать.

Что лежит в моих заметках?
📖 Теория — мои записи: чётко и без воды
🧪 Тесты — проверь, хорошо ли ты усвоил мою информацию 
🎭 Ситуации — реальные случаи из моей практики, которые ты можешь прожить сам 
❓ Задать вопрос — если хочешь заглянуть в ещё не открытую заметку`,
    null,
    Markup.keyboard(['Теория', 'Тест', 'Ситуации', 'Задать вопрос']).oneTime()
  );
});

bot.command('Теория', (ctx) => {
  ctx.scene.enter('theory');
});

bot.command('Задать вопрос', (ctx) => {
  ctx.scene.enter('question');
});

bot.command('Ситуации', (ctx) => {
  ctx.scene.enter('situation');
});

bot.command('Тест', (ctx) => {
  ctx.scene.enter('test');
});

bot.startPolling();
