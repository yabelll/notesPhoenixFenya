const Scene = require('node-vk-bot-api/lib/scene');
const Markup = require('node-vk-bot-api/lib/markup');
const { askAi } = require('../ai');

function menuKeyboard() {
  return Markup
    .keyboard([
      'Теория',
      'Тест',
      'Ситуации',
      'Задай вопрос',
    ])
    .oneTime();
}

const questionScene = new Scene('question',
  (ctx) => {
    ctx.scene.next();
    ctx.reply('Напиши свой вопрос по пожарной безопасности.');
  },
  async (ctx) => {
    const question = ctx.message.text || ctx.message.body;

    try {
      const answer = await askAi(question);

      ctx.scene.leave();
      ctx.reply(answer, null, menuKeyboard());
    } catch (error) {
      console.error(error);

      ctx.scene.leave();
      ctx.reply('Не получилось получить ответ от нейросети. Проверь AI_API_KEY и AI_BASE_URL в .env.', null, menuKeyboard());
    }
  });

module.exports = questionScene;
