const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
// const admin = require('firebase-admin'); // Закомментируй, если не используешь

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

// Разрешаем CORS (фронтенд на GitHub Pages будет обращаться к бэкенду на Render)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Эндпоинт для проверки подписки на канал @sol_hiko
app.get('/api/check-membership', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    // ID канала: можно использовать @sol_hiko или числовой ID (лучше числовой)
    const chatId = '@sol_hiko';
    const member = await bot.getChatMember(chatId, userId);
    // Статусы, при которых пользователь считается подписчиком:
    // 'creator', 'administrator', 'member'
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);
    res.json({ isMember });
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    res.status(500).json({ error: 'Failed to check membership', details: error.message });
  }
});

// Запускаем HTTP сервер
app.listen(PORT, () => {
  console.log(`HTTP сервер запущен на порту ${PORT}`);
});

// ===== Обработчик команды /start (без изменений) =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'Игрок';

  const welcomeText = `
Привет, ${firstName}! 👋

👋 Добро пожаловать в «Hiko Adventure»!

Ты попал в игру, где можно:
— ⚔️ сражаться с боссами вместе с гильдией;
— 🎩 менять экипировку и питомцев;
— ✨ прокачивать таланты и крафтить новые способности;
— 🏰 создавать свою гильдию или вступать в другие.

Нажми кнопку «Открыть игру» ниже, чтобы начать приключение!
  `;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '🚀 Открыть игру',
          web_app: { url: WEB_APP_URL }
        }
      ]
    ]
  };

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

console.log('Бот запущен и слушает команды...');
