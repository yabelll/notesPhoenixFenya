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
  return Markup.keyboard([
    'Теория',
    'Тест',
    'Ситуации',
    'Задать вопрос',
  ]).oneTime();
}

function trueFalseKeyboard() {
  return Markup.keyboard(['Да', 'Нет']).oneTime();
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logPhotoWarning(error) {
  const apiCode = error?.response?.error_code;
  const apiMessage = error?.response?.error_msg;
  const status = error?.response?.status;

  if (apiCode) {
    console.warn(`VK photo skipped: ${apiCode} ${apiMessage}`);
    return;
  }

  if (status) {
    console.warn(`VK photo skipped: HTTP ${status}`);
    return;
  }

  console.warn(`VK photo skipped: ${error?.message || error}`);
}

async function postPhotoToUploadServer(uploadUrl, createForm) {
  const delays = [0, 2000, 5000, 10000];
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

      const isTimeout = error.code === 'ECONNABORTED';
      const isVkServerError =
        error.response && [500, 502, 503, 504].includes(error.response.status);

      if (!isTimeout && !isVkServerError) {
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
  const { response: uploadServer } = await ctx.bot.api(
    'photos.getMessagesUploadServer',
    {
      peer_id: peerId,
      access_token: ctx.bot.settings.token,
    }
  );
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

  const { data: uploadResult } = await postPhotoToUploadServer(
    uploadUrl,
    createForm
  );

  if (!uploadResult.photo) {
    return null;
  }

  if (!uploadResult.photo) {
    throw new Error(`VK не принял фото: ${JSON.stringify(uploadResult)}`);
  }

  const { response: savedPhotos } = await ctx.bot.api(
    'photos.saveMessagesPhoto',
    {
      photo: uploadResult.photo,
      server: uploadResult.server,
      hash: uploadResult.hash,
      access_token: ctx.bot.settings.token,
    }
  );
  const photo = savedPhotos[0];

  if (!photo) {
    return null;
  }

  const photoAttachment = `photo${photo.owner_id}_${photo.id}${photo.access_key ? `_${photo.access_key}` : ''}`;

  photoAttachments.set(resolvedImagePath, photoAttachment);

  return photoAttachment;
}

async function replyWithOptionalPhoto(ctx, message, imagePath) {
  try {
    const photoAttachment = await uploadPhotoForMessage(ctx, imagePath);

    if (photoAttachment) {
      await ctx.reply(message, photoAttachment);
      return;
    }
  } catch (error) {
    logPhotoWarning(error);
  }

  await ctx.reply(message);
}

async function sendTheoryBlock(ctx, requirements, imagePath, question) {
  const answer = await askAiByRequirements(requirements);

  await replyWithOptionalPhoto(ctx, answer, imagePath);
  await ctx.reply(question, null, trueFalseKeyboard());
  ctx.scene.next();
}

async function replyToTrueFalseAnswer(
  ctx,
  correctAnswer,
  correctMessage,
  incorrectMessage
) {
  const userAnswer = (ctx.message.text || ctx.message.body || '')
    .trim()
    .toLowerCase();

  if (userAnswer === correctAnswer.toLowerCase()) {
    await ctx.reply(correctMessage);
    return true;
  }

  if (userAnswer === 'да' || userAnswer === 'нет') {
    await ctx.reply(incorrectMessage);
    return true;
  }

  await ctx.reply(
    'Выбери один из вариантов: Да или Нет.',
    null,
    trueFalseKeyboard()
  );
  return false;
}

const theoryPrompt1 = `
Ты — эксперт по технике пожарной безопасности и методист по обучению детей и взрослых.
Задача: Выдай теорию по теме «Техника пожарной безопасности» строго по шаблону без лишних фраз, который я приведу ниже.
Требования к ответу:
1. Используй мой шаблон: каждый пункт начинается со смайлика (в каждом пункте разные смайлики) с названием правила и краткого объяснения (как в моём примере). Каждый пункт с нового абзаца. Больше ничего: только пункты и краткое объяснение!
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
1. Используй мой шаблон: каждый пункт начинается со смайлика (в каждом пункте разные смайлики) с названием правила (в каждом пункте разные смайлики) и краткого объяснения (как в моём примере). Каждый пункт с нового абзаца. Больше ничего: только пункты и краткое объяснение!
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
1. Используй мой шаблон: каждый пункт начинается со смайлика (в каждом пункте разные смайлики) с названием правила и краткого объяснения (как в моём примере). Каждый пункт с нового абзаца. Больше ничего: только пункты и краткое объяснение!
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

const theoryScene = new Scene(
  'theory',
  async (ctx) => {
    try {
      await ctx.reply('Секунду, сейчас достану заметку...');
      await sendTheoryBlock(
        ctx,
        theoryPrompt1,
        THEORY_IMAGE_PATH1,
        'Можно ли оставить зарядку в розетке, когда уходишь из дома?'
      );
    } catch (error) {
      console.error(error);

      ctx.scene.leave();
      await ctx.reply(
        'Феня задумалась и допустила ошибку. Запусти раздел с теорией заново!',
        null,
        menuKeyboard()
      );
    }
  },
  async (ctx) => {
    try {
      const shouldContinue = await replyToTrueFalseAnswer(
        ctx,
        'Нет',
        '✅ Правильно! Зарядку лучше отключать от розетки, когда уходишь из дома.',
        '❌ Неверно. Оставлять зарядку в розетке без присмотра небезопасно: её лучше отключать.'
      );

      if (!shouldContinue) {
        return;
      }
      await ctx.reply('Достаю следующую заметку...');
      await sendTheoryBlock(
        ctx,
        theoryPrompt2,
        THEORY_IMAGE_PATH2,
        'Можно ли позвонить сначала в 112, а потом сказать взрослым?'
      );
    } catch (error) {
      console.error(error);

      ctx.scene.leave();
      await ctx.reply(
        'Феня задумалась и допустила ошибку. Запусти раздел с теорией заново!',
        null,
        menuKeyboard()
      );
    }
  },
  async (ctx) => {
    try {
      const shouldContinue = await replyToTrueFalseAnswer(
        ctx,
        'Да',
        '✅ Правильно! Если есть пожар или угроза людям, нужно сразу звонить 112 или 101, а затем сообщить взрослым.',
        '❌ Неверно. При пожаре важно сразу вызвать 112 или 101, а потом сообщить взрослым.'
      );

      if (!shouldContinue) {
        return;
      }
      await ctx.reply('Достаю последнюю заметку...');
      await sendTheoryBlock(
        ctx,
        theoryPrompt3,
        THEORY_IMAGE_PATH3,
        'Если ты на 4 этаже, можно ли использовать лифт для спуска?'
      );
    } catch (error) {
      console.error(error);

      ctx.scene.leave();
      await ctx.reply(
        'Феня задумалась и допустила ошибку. Запусти раздел с теорией заново!',
        null,
        menuKeyboard()
      );
    }
  },
  async (ctx) => {
    try {
      const shouldContinue = await replyToTrueFalseAnswer(
        ctx,
        'Нет',
        '✅ Правильно! При пожаре лифтом пользоваться нельзя даже с 1 этажа: безопаснее выходить по маршруту эвакуации.',
        '❌ Неверно. При пожаре лифтом пользоваться нельзя: он может остановиться или заполниться дымом.'
      );

      if (!shouldContinue) {
        return;
      }

      await replyWithOptionalPhoto(
        ctx,
        'Ты полностью изучил теорию! Держи из заметок Фени памятку «Пожарная безопасность». Прочитайте её один раз сейчас — чтобы в экстренной ситуации действовать на автомате, без паники и ошибок.',
        THEORY_IMAGE_PATH
      );

      ctx.scene.leave();
      await ctx.reply(
        '🔥 Продолжим изучение пожарной безопасности? Выбирай категорию и действуй!',
        null,
        menuKeyboard()
      );
    } catch (error) {
      console.error(error);

      ctx.scene.leave();
      await ctx.reply(
        'Феня задумалась и допустила ошибку. Запусти раздел с теорией заново!',
        null,
        menuKeyboard()
      );
    }
  },
  async (ctx) => {
    ctx.scene.leave();
    await ctx.reply(
      'Феня задумалась и допустила ошибку. Запусти раздел заново!',
      null,
      menuKeyboard()
    );
  }
);
module.exports = theoryScene;
