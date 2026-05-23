require('dotenv').config();

const VkBot = require('node-vk-bot-api');
const Markup = require('node-vk-bot-api/lib/markup');
const Session = require('node-vk-bot-api/lib/session');
const Stage = require('node-vk-bot-api/lib/stage');
const theoryScene = require('./scene/theory');
const questionScene = require('./scene/question');

const bot = new VkBot(process.env.TOKEN);
const session = new Session();
const stage = new Stage(theoryScene, questionScene);
const startedAt = Math.floor(Date.now() / 1000);
const handledMessages = new Set();

function getMessageKey(ctx) {
  return [
    ctx.eventId,
    ctx.message.peer_id,
    ctx.message.from_id,
    ctx.message.id,
    ctx.message.conversation_message_id,
    ctx.message.date,
    ctx.message.text || ctx.message.body,
  ].filter(Boolean).join(':');
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

bot.use(session.middleware());
bot.use(stage.middleware());

bot.command('Начать', (ctx) => {
  ctx.reply('Какое то приветствие и выбор категории', null, Markup
    .keyboard([
      'Теория',
      'Тест',
      'Ситуации',
      'Задай вопрос'
    ])
    .oneTime());
});

bot.command('Теория', (ctx) => {
  ctx.scene.enter('theory');
});

bot.command('Задай вопрос', (ctx) => {
  ctx.scene.enter('question');
});

bot.startPolling();
