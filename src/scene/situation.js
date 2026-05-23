const Scene = require('node-vk-bot-api/lib/scene');
const Markup = require('node-vk-bot-api/lib/markup');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { askAi } = require('../ai');

const ST_IMAGE_PATH1 = path.resolve(__dirname, '../../img/ST1.jpg');
const ST_IMAGE_PATH2 = path.resolve(__dirname, '../../img/ST2.jpg');
const ST_IMAGE_PATH3 = path.resolve(__dirname, '../../img/ST3.jpg');
const photoAttachments = new Map();

function menuKeyboard() {
  return Markup
    .keyboard([
      'Теория',
      'Тест',
      'Ситуации',
      'Задать вопрос',
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
      const isVkServerError = error.response && [500, 502, 503, 504].includes(error.response.status);

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

async function replyWithOptionalPhoto(ctx, message, imagePath) {
  try {
    const photoAttachment = await uploadPhotoForMessage(ctx, imagePath);

    await ctx.reply(message, photoAttachment);
  } catch (error) {
    console.error(error);
    await ctx.reply(message);
  }
}

const questionRequirements1 = `Ты — эксперт по пожарной безопасности и методист по обучению. Твоя задача — давать обратную связь на ответы к интерактивным тренировкам - ситуативным задачам.
Описание ЧРЕЗВЫЧАЙНОЙ СИТУАЦИИ №1 (пожар, задымление, возгорание одежды и т.д.): Ты и твои одноклассники остались после уроков заниматься проектом. Заняв кабинет 314, вы сели за компьютеры, чтобы подготовиться к защите. Из-за перегрузки сети загорелся удлинитель. Огонь перекинулся на шторы. В помещении лёгкое задымление, 3 человека (ты + двое других). Задача: Позвонить в 112/101 и передать информацию так, чтобы спасатели приехали как можно быстрее.
Ты должен:
    - Не быть очень строгим, так как люди впервые слышат про эту тему.
    - Категорически запрещено использовать * (звездочки) в тексте!
   - Дать краткую оценку: ✅ правильно / ❌ неправильно / ⚠️ частично верно.
   - Объяснить, какие ошибки допущены (если есть).
   - Ты не можешь повторно запрашивать ответ. Если пользователь дал плохой ответ, то выдай ему эталонный ответ. Не говори, что это дано по инструкции.
   - Не запрашивай у пользователя точный адрес, то есть подойдет просто сказать: назову свой адрес. В ответе нужно упомянуть, что данные нужны, но должна быть возможность их не называть.
   - Выдать эталонный правильный ответ — чёткий алгоритм действий на 3 пункта, основанный на реальных правилах пожарной безопасности (причины, эвакуация, использование огнетушителя, поведение в дыму, вызов служб, ошибки при пожаре), при первой ситуации ИИ должна выводить **эталонный правильный ответ** только по части звонка в 112/101, т.е что они должны говорить. Добавить в эталонный ответ пункт про то, что нужно дождаться ответа с рекомендациями от МЧСника
Тон: чёткий, без воды, инструктивный. Запрещено использовать * (звездочки).`

const questionRequirements2 = `Ты — эксперт по пожарной безопасности и методист по обучению. Твоя задача — давать обратную связь на ответы к интерактивным тренировкам - ситуативным задачам.
Описание ЧРЕЗВЫЧАЙНОЙ СИТУАЦИИ №2 (пожар, задымление, возгорание одежды и т.д.): Звучит пожарная тревога. Ты в кабинете на 3-м этаже. В коридоре — лёгкое задымление. Основной выход виден, но в дыму. Запасная лестница чистая, но дальше. Ты вспомнил, что оставил рюкзак с телефоном и домашкой у парты. Одноклассник шепчет: «Давай вернёмся, это быстро!». Сформулируй свои дальнейшие действия во время эвакуации.
Ты должен:
    - Ты не можешь повторно запрашивать ответ. Если пользователь дал плохой ответ, то выдай ему эталонный ответ. Не говори, что это дано по инструкции.
    - Категорически запрещено использовать * (звездочки) в тексте!
    - Не быть очень строгим, так как люди впервые слышат про эту тему. Например, человек может бежать, но он должен это делать без паники.
   - Дать краткую оценку: ✅ правильно / ❌ неправильно / ⚠️ частично верно.
   - Объяснить, какие ошибки допущены (если есть).
   - Выдать **эталонный правильный ответ** — чёткий алгоритм действий на 3–5 пунктов, основанный на реальных правилах пожарной безопасности (причины, эвакуация, использование огнетушителя, поведение в дыму, вызов служб, ошибки при пожаре)
Тон: чёткий, без воды, инструктивный. Запрещено использовать * (звездочки).`

const questionRequirements3 = `Ты — эксперт по пожарной безопасности и методист по обучению. Твоя задача — давать обратную связь на ответы к интерактивным тренировкам - ситуативным задачам.
Описание ЧРЕЗВЫЧАЙНОЙ СИТУАЦИИ №3 (пожар, задымление, возгорание одежды и т.д.): На уроке химии при демонстрации опыта искра от оборудования попала на синтетический рукав твоей куртки. Ткань начала тлеть, затем появилось маленькое пламя на рукаве. Ты чувствуешь жар, но не боль. Сформулируй свои дальнейшие действия в первые пять секунд.
Ты должен:   
    - Ты не можешь повторно запрашивать ответ. Если пользователь дал плохой ответ, то выдай ему эталонный ответ. Не говори, что это дано по инструкции.
    - Категорически запрещено использовать * (звездочки) в тексте!
    - Не быть очень строгим, так как люди впервые слышат про эту тему.
   - Следи за формулировками в теории. Например, одежда просто горит, на ней есть огонь, но не факел.
    - Дать краткую оценку: ✅ правильно / ❌ неправильно / ⚠️ частично верно.
   - Объяснить, какие ошибки допущены (если есть).
   - Выдать **эталонный правильный ответ** — чёткий алгоритм действий на 3–5 пунктов, основанный на реальных правилах пожарной безопасности (причины, эвакуация, использование огнетушителя, поведение в дыму, вызов служб, ошибки при пожаре), при первой ситуации ИИ должна выводить **эталонный правильный ответ** только по части звонка в 112/101, т.е что они должны говорить
Тон: чёткий, без воды, инструктивный. Запрещено использовать * (звездочки).`

const situation1 = `Сейчас тебе предстоит решить 3 ситуационные задачи.

Ситуация 1:
Ты и твои одноклассники остались после уроков заниматься проектом. Заняв кабинет 314, вы сели за компьютеры, чтобы подготовиться к защите. Из-за перегрузки сети загорелся удлинитель. Огонь перекинулся на шторы. В помещении лёгкое задымление, 3 человека (ты + двое других).

Задача: напиши, что ты скажешь диспетчеру при звонке в 112/101, чтобы спасатели приехали как можно быстрее.`;

const situation2 = `Ситуация 2:
Звучит пожарная тревога. Ты в кабинете на 3-м этаже. В коридоре — лёгкое задымление. Основной выход виден, но в дыму. Запасная лестница чистая, но дальше. Ты вспомнил, что оставил рюкзак с телефоном и домашкой у парты. Одноклассник шепчет: «Давай вернёмся, это быстро!».

Задача: сформулируй свои дальнейшие действия во время эвакуации.`;

const situation3 = `Ситуация 3:
На уроке химии при демонстрации опыта искра от оборудования попала на синтетический рукав твоей куртки. Ткань начала тлеть, затем появилось маленькое пламя на рукаве. Ты чувствуешь жар, но не боль.

Задача: сформулируй свои дальнейшие действия в первые пять секунд.`;

const situationScene = new Scene('situation',
  async (ctx) => {
    ctx.scene.next();
    await replyWithOptionalPhoto(ctx, situation1, ST_IMAGE_PATH1)
  },
  async (ctx) => {
    try {
      const answerUser = ctx.message.text || ctx.message.body;
      const answer = await askAi(answerUser, questionRequirements1);

      ctx.scene.next();
      await ctx.reply(answer);
      await replyWithOptionalPhoto(ctx, situation2, ST_IMAGE_PATH2)
    } catch (error) {
      console.error(error);
      ctx.scene.leave();
      await ctx.reply('Не получилось проверить ответ. Попробуй ещё раз позже.', null, menuKeyboard());
    }
  },
  async (ctx) => {
    try {
      const answerUser = ctx.message.text || ctx.message.body;
      const answer = await askAi(answerUser, questionRequirements2);

      ctx.scene.next();
      await ctx.reply(answer);
      await replyWithOptionalPhoto(ctx, situation3, ST_IMAGE_PATH3)
    } catch (error) {
      console.error(error);
      ctx.scene.leave();
      await ctx.reply('Не получилось проверить ответ. Попробуй ещё раз позже.', null, menuKeyboard());
    }
  },
  async (ctx) => {
    try {
      const answerUser = ctx.message.text || ctx.message.body;
      const answer = await askAi(answerUser, questionRequirements3);

      ctx.scene.leave();
      await ctx.reply(answer);
      await ctx.reply('Продолжим изучение пожарной безопасности? Выбирай категорию и действуй!', null, menuKeyboard());
    } catch (error) {
      console.error(error);
      ctx.scene.leave();
      await ctx.reply('Не получилось проверить ответ. Попробуй ещё раз позже.', null, menuKeyboard());
    }
  });
module.exports = situationScene;
