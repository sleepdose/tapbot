require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ===== НАСТРОЙКИ =====
const TOKEN = process.env.TOKEN;
const WEB_APP_URL = 'https://sleepdose.github.io/tapbot';

if (!TOKEN) {
  console.error('Ошибка: Токен не найден! Убедись, что переменная TOKEN задана.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== HTTP СЕРВЕР =====
const app = express();
const PORT = process.env.PORT || 3000;

// Парсинг JSON-тела (ОБЯЗАТЕЛЬНО для POST-запросов!)
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-telegram-init-data');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== ЭНДПОИНТЫ =====

// Проверка подписки на канал
app.get('/api/check-membership', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'Missing user_id' });

  try {
    const member = await bot.getChatMember('@sol_hiko', userId);
    const isMember = ['creator', 'administrator', 'member'].includes(member.status);
    res.json({ isMember });
  } catch (error) {
    console.error('Ошибка проверки подписки:', error.message);
    res.status(500).json({ error: 'Failed to check membership', details: error.message });
  }
});

// Уведомление о начале битвы всем участникам гильдии
app.post('/api/notify-battle-start', async (req, res) => {
  const { guildName, bossName, memberTelegramIds } = req.body;

  if (!memberTelegramIds || !Array.isArray(memberTelegramIds)) {
    return res.status(400).json({ error: 'Missing memberTelegramIds' });
  }

  const text = `⚔️ *Битва началась!*\n\nГильдия *${guildName}* вступила в бой с боссом *${bossName}*!\n\nЗаходи скорее и помоги своей команде!`;

  let sent = 0;
  for (const telegramId of memberTelegramIds) {
    try {
      await bot.sendMessage(telegramId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '⚔️ В битву!', web_app: { url: WEB_APP_URL } }]]
        }
      });
      sent++;
    } catch (err) {
      console.warn(`Не удалось отправить уведомление ${telegramId}:`, err.message);
    }
  }

  console.log(`notify-battle-start: отправлено ${sent}/${memberTelegramIds.length}`);
  res.json({ success: true, sent });
});

// Уведомление о запросе в друзья
app.post('/api/notify-friend-request', async (req, res) => {
  const { targetTelegramId, fromName } = req.body;

  if (!targetTelegramId || !fromName) {
    return res.status(400).json({ error: 'Missing targetTelegramId or fromName' });
  }

  const text = `👥 *${fromName}* хочет добавить тебя в друзья!\n\nОткрой игру, чтобы принять или отклонить заявку.`;

  try {
    await bot.sendMessage(targetTelegramId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '👀 Посмотреть заявку', web_app: { url: WEB_APP_URL } }]]
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка уведомления о заявке:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Создание счёта для оплаты через Telegram Stars
app.post('/api/create-stars-invoice', async (req, res) => {
  const { userId, stars } = req.body;

  if (!userId || !stars) {
    return res.status(400).json({ success: false, error: 'Missing userId or stars' });
  }

  try {
    const link = await bot.createInvoiceLink(
      '⭐ Кристаллы удачи',
      `Покупка кручения колеса фортуны за ${stars} Stars`,
      `stars_spin_${userId}_${Date.now()}`,
      '',        // provider_token — пустой для Telegram Stars
      'XTR',     // валюта Stars
      [{ label: 'Stars', amount: stars }]
    );
    res.json({ success: true, link });
  } catch (error) {
    console.error('Ошибка создания Stars invoice:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`HTTP сервер запущен на порту ${PORT}`);
});

// ===== КОМАНДА /start =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Игрок';

  const welcomeText = `
Привет, ${firstName}! 👋

👋 Добро пожаловать в «Hiko: Battle Time»!

Ты попал в игру, где можно:
— ⚔️ сражаться с боссами вместе с гильдией;
— 🎩 менять экипировку и питомцев;
— ✨ прокачивать таланты и крафтить новые способности;
— 🏰 создавать свою гильдию или вступать в другие.

Нажми кнопку «Открыть игру» ниже, чтобы начать приключение!
  `;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 Открыть игру', web_app: { url: WEB_APP_URL } }]]
    }
  });
});

console.log('Бот запущен и слушает команды...');
