const Scene = require('node-vk-bot-api/lib/scene');
const Markup = require('node-vk-bot-api/lib/markup');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { askAiByRequirements } = require('../ai');

const THEORY_IMAGE_PATH = path.resolve(__dirname, '../../img/PB.jpg');
const THEORY_IMAGE_PATH1 = path.resolve(__dirname, '../../img/PB1.jpg');
const THEORY_IMAGE_PATH2 = path.resolve(__dirname, '../../img/PB2.jpg');
const THEORY_IMAGE_PATH3 = path.resolve(__dirname, '../../img/PB3.jpg');
const photoAttachments = new Map();

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

function getImageContentType(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postPhotoToUploadServer(uploadUrl, createForm) {
  const delays = [0, 1000, 2500];
  let lastError;

  for (const delay of delays) {
    if (delay) {
      await wait(delay);
    }

    try {
      const form = createForm();

      return await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000,
      });
    } catch (error) {
      lastError = error;

      if (!error.response || ![500, 502, 503, 504].includes(error.response.status)) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function uploadPhotoForMessage(ctx, imagePath) {
  const resolvedImagePath = path.resolve(imagePath);

  if (photoAttachments.has(resolvedImagePath)) {
    return photoAttachments.get(resolvedImagePath);
  }

  if (!fs.existsSync(resolvedImagePath)) {
    throw new Error(`Файл с фото не найден: ${resolvedImagePath}`);
  }

  const peerId = ctx.message.peer_id || ctx.message.user_id;
  const { response: uploadServer } = await ctx.bot.api('photos.getMessagesUploadServer', {
    peer_id: peerId,
    access_token: ctx.bot.settings.token,
  });
  const uploadUrl = uploadServer.upload_url;

  if (!uploadUrl) {
    throw new Error('VK не вернул upload_url для загрузки фото');
  }

  const createForm = () => {
    const form = new FormData();

    form.append('file1', fs.createReadStream(resolvedImagePath), {
      filename: path.basename(resolvedImagePath),
      contentType: getImageContentType(resolvedImagePath),
    });

    return form;
  };

  const { data: uploadResult } = await postPhotoToUploadServer(uploadUrl, createForm);

  if (!uploadResult.photo) {
    throw new Error(`VK не принял фото: ${JSON.stringify(uploadResult)}`);
  }

  const { response: savedPhotos } = await ctx.bot.api('photos.saveMessagesPhoto', {
    photo: uploadResult.photo,
    server: uploadResult.server,
    hash: uploadResult.hash,
    access_token: ctx.bot.settings.token,
  });
  const photo = savedPhotos[0];

  const photoAttachment = `photo${photo.owner_id}_${photo.id}${photo.access_key ? `_${photo.access_key}` : ''}`;

  photoAttachments.set(resolvedImagePath, photoAttachment);

  return photoAttachment;
}

async function sendAnswerWithPhoto(ctx, answer, imagePath) {
  try {
    const photoAttachment = await uploadPhotoForMessage(ctx, imagePath);

    await ctx.reply(answer, photoAttachment);
  } catch (error) {
    console.error(error);
    await ctx.reply(answer);
  }
}

const theoryPrompt1 = `
Ты — эксперт по технике пожарной безопасности и методист по обучению детей и взрослых.
Задача: Выдай теорию по теме «Техника пожарной безопасности» строго по шаблону без лишних фраз, который я приведу ниже.
Требования к ответу:
1. Используй мой шаблон: каждый пункт начинается с названия правила и краткого объяснения (как в моём примере). Больше ничего: только пункты и краткое объяснение!
2. Количество правил: ровно 3
3. Тон: чёткий, понятный, без воды, с примерами действий. Запрещено использовать * (звездочки).
4. Не выдавай опасные, экстремистские и медицинские инструкции.
5. Охвати такие подтемы: причины пожара, действия при обнаружении дыма/огня, эвакуация, использование огнетушителя, правила поведения в задымлённом помещении, вызов служб, ошибки при пожаре.
Пример (то, как должен выглядеть ответ):

Не играй с огнём:
…Теория… (1-2 предложения)
Знай пути эвакуации: 
…Теория… (1-2 предложения)
(дальше продолжай в таком же духе)

Подзаголовки возьми те, которые я тебе сейчас напишу: Не играй с огнём; Сухие руки — сухая безопасность; Не перегружай сеть 
Теперь сгенерируй свои 3 правила по пожарной безопасности, используя этот стиль и структуру.
`;

const theoryPrompt2 = `
Ты — эксперт по технике пожарной безопасности и методист по обучению детей и взрослых.
Задача: Выдай теорию по теме «Техника пожарной безопасности» строго по шаблону без лишних фраз, который я приведу ниже.
Требования к ответу:
1. Используй мой шаблон: каждый пункт начинается с названия правила и краткого объяснения (как в моём примере). Больше ничего: только пункты и краткое объяснение!
2. Количество правил: ровно 3 
3. Тон: чёткий, понятный, без воды, с примерами действий. Запрещено использовать * (звездочки).
4. Не выдавай опасные, экстремистские и медицинские инструкции.
5. Охвати такие подтемы: причины пожара, действия при обнаружении дыма/огня, эвакуация, использование огнетушителя, правила поведения в задымлённом помещении, вызов служб, ошибки при пожаре.
Пример (то, как должен выглядеть ответ):

Не играй с огнём:
…Теория… (1-2 предложения)
Знай пути эвакуации: 
…Теория… (1-2 предложения)
(дальше продолжай в таком же духе)

Подзаголовки возьми те, которые я тебе сейчас напишу: Повреждённый кабель = опасность; Знай пути эвакуации; Вызов 101/112 
Теперь сгенерируй свои 3 правила по пожарной безопасности, используя этот стиль и структуру.
`;

const theoryPrompt3 = `
Ты — эксперт по технике пожарной безопасности и методист по обучению детей и взрослых.
Задача: Выдай теорию по теме «Техника пожарной безопасности» строго по шаблону без лишних фраз, который я приведу ниже.
Требования к ответу:
1. Используй мой шаблон: каждый пункт начинается с названия правила и краткого объяснения (как в моём примере). Больше ничего: только пункты и краткое объяснение!
2. Количество правил: ровно 3 
3. Тон: чёткий, понятный, без воды, с примерами действий. Запрещено использовать * (звездочки).
4. Не выдавай опасные, экстремистские и медицинские инструкции.
5. Охвати такие подтемы: причины пожара, действия при обнаружении дыма/огня, эвакуация, использование огнетушителя, правила поведения в задымлённом помещении, вызов служб, ошибки при пожаре.
Пример (то, как должен выглядеть ответ):

Не играй с огнём:
…Теория… (1-2 предложения)
Знай пути эвакуации: 
…Теория… (1-2 предложения)
(дальше продолжай в таком же духе)

Подзаголовки возьми те, которые я тебе сейчас напишу: Дым? Пригнись и закрой лицо;  Не прячься, не возвращайся;  Остановись-упади-катись
Теперь сгенерируй свои 3 правила по пожарной безопасности, используя этот стиль и структуру.
`;

const theoryScene = new Scene('theory',
  async (ctx) => {
    try {
        await ctx.reply('Секунду, сейчас достану заметку...')

      const answer1 = await askAiByRequirements(theoryPrompt1);

      await sendAnswerWithPhoto(ctx, answer1, THEORY_IMAGE_PATH1);

      const answer2 = await askAiByRequirements(theoryPrompt2);

      await sendAnswerWithPhoto(ctx, answer2, THEORY_IMAGE_PATH2);

      const answer3 = await askAiByRequirements(theoryPrompt3);

      await sendAnswerWithPhoto(ctx, answer3, THEORY_IMAGE_PATH3);

      ctx.scene.leave();
      await ctx.reply('Продолжим изучение пожарной безопасности? Выбирай категорию и действуй!', null, menuKeyboard());
    } catch (error) {
      console.error(error);

      ctx.scene.leave();
      await ctx.reply('Не получилось получить теорию от нейросети. Проверь AI_API_KEY и AI_BASE_URL в .env.', null, menuKeyboard());
    }
  });
module.exports = theoryScene;
