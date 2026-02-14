const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// ===== НАСТРОЙКИ =====
const TOKEN = '7799543047:AAEk20l98SXIDJkfyJo6fJRpjA8ynthSv8g';               // замените на реальный токен
const WEB_APP_URL = 'https://sleepdose.github.io/tapbot';    // URL, где размещена игра (обязательно HTTPS)

// ===== FIREBASE (опционально) =====
// Если вы хотите сразу создавать пользователя в Firebase при первом /start,
// раскомментируйте и настройте сервисный аккаунт.
/*
const serviceAccount = require('./path/to/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
*/

// Создаём экземпляр бота (используем long polling)
const bot = new TelegramBot(TOKEN, { polling: true });

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'Игрок';

  // Приветственное сообщение
  const welcomeText = `
Привет, ${firstName}! 👋

Добро пожаловать в игру **«Рик и Морти»**!
Твоя гильдия ждёт тебя. Нажми кнопку ниже, чтобы открыть игру.
  `;

  // Создаём inline-клавиатуру с кнопкой Web App
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

  // Опционально: создаём/обновляем пользователя в Firestore
  // if (db) {
  //   const userRef = db.collection('users').doc(String(userId));
  //   await userRef.set({
  //     telegramId: String(userId),
  //     name: firstName,
  //     lastSeen: admin.firestore.FieldValue.serverTimestamp()
  //   }, { merge: true });
  // }

  // Отправляем сообщение с клавиатурой
  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

console.log('Бот запущен и слушает команды...');
