const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ===== НАСТРОЙКИ =====
const TOKEN = process.env.TOKEN;
const WEB_APP_URL = 'https://sleepdose.github.io/tapbot';

if (!TOKEN) {
  console.error('Ошибка: Токен не найден! Убедись, что переменная TOKEN задана.');
  process.exit(1);
}

// Создаём экземпляр бота (polling)
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== HTTP сервер для обработки запросов из WebApp =====
const app = express();
const PORT = process.env.PORT || 3000;

// Парсинг JSON тела запросов
app.use(express.json());

// Разрешаем CORS (фронтенд на GitHub Pages будет обращаться к бэкенду на Render)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== Эндпоинт для проверки подписки на канал @sol_hiko =====
app.get('/api/check-membership', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const chatId = '@sol_hiko';
    const member = await bot.getChatMember(chatId, userId);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);
    res.json({ isMember });
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    res.status(500).json({ error: 'Failed to check membership', details: error.message });
  }
});

// ===== Эндпоинт: уведомление о начале битвы с боссом =====
// Принимает: { guildName, bossName, memberTelegramIds: string[] }
app.post('/api/notify-battle-start', async (req, res) => {
  const { guildName, bossName, memberTelegramIds } = req.body;

  if (!memberTelegramIds || !Array.isArray(memberTelegramIds) || memberTelegramIds.length === 0) {
    return res.status(400).json({ error: 'Missing memberTelegramIds' });
  }

  const text =
    `⚔️ *БИТВА НАЧАЛАСЬ!*\n\n` +
    `🏰 Гильдия: *${guildName || 'Гильдия'}*\n` +
    `👹 Противник: *${bossName || 'Босс'}*\n\n` +
    `Скорее заходи в игру — у тебя есть 2 минуты, чтобы нанести урон!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '⚔️ Участвовать в битве', web_app: { url: WEB_APP_URL } }]
    ]
  };

  let sent = 0;
  let failed = 0;

  for (const telegramId of memberTelegramIds) {
    try {
      await bot.sendMessage(telegramId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      sent++;
      console.log(`Уведомление отправлено пользователю ${telegramId}`);
    } catch (err) {
      failed++;
      console.error(`Не удалось отправить уведомление пользователю ${telegramId}:`, err.message);
    }
  }

  console.log(`Уведомления о битве: отправлено ${sent}, ошибок ${failed}`);
  res.json({ ok: true, sent, failed });
});

// Запускаем HTTP сервер
app.listen(PORT, () => {
  console.log(`HTTP сервер запущен на порту ${PORT}`);
});

// ===== Обработчик команды /start =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Игрок';

  const welcomeText =
    `Привет, ${firstName}! 👋\n\n` +
    `👋 Добро пожаловать в «Hiko Adventure»!\n\n` +
    `Ты попал в игру, где можно:\n` +
    `— ⚔️ сражаться с боссами вместе с гильдией;\n` +
    `— 🎩 менять экипировку и питомцев;\n` +
    `— ✨ прокачивать таланты и крафтить новые способности;\n` +
    `— 🏰 создавать свою гильдию или вступать в другие.\n\n` +
    `Нажми кнопку «Открыть игру» ниже, чтобы начать приключение!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Открыть игру', web_app: { url: WEB_APP_URL } }]
    ]
  };

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

console.log('Бот запущен и слушает команды...');
