require('dotenv').config();

// Required modules
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const app = express();

// Middleware for CORS
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'https://hiko-bot-backend.onrender.com')
    .split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    }
}));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Middleware to parse JSON in requests
app.use(express.json());

// Function to validate input
function validateInput(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid input');
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Telegram Bot Token & Game URL
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GAME_URL = process.env.GAME_URL || process.env.FRONTEND_URL || 'https://your-game-url.com';

// Helper: call Telegram Bot API
async function callTelegramAPI(method, body) {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

// Validate Telegram initData HMAC signature
function validateTelegramInitData(initData) {
    if (!initData) return false;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return false;
        params.delete('hash');
        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(TELEGRAM_TOKEN)
            .digest();
        const expectedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        return expectedHash === hash;
    } catch (e) {
        console.error('initData validation error:', e);
        return false;
    }
}

function requireTelegramAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'] || req.body.initData;
    if (!initData || !validateTelegramInitData(initData)) {
        console.warn('Rejected request: invalid or missing initData');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// =======================================================
// /start COMMAND — Welcome message with game button
// =======================================================
async function handleStartCommand(message) {
    const chatId = message.chat.id;
    const user = message.from;
    const firstName = user.first_name || 'Игрок';
    const username = user.username ? `@${user.username}` : firstName;

    console.log(`/start from user ${user.id} (${username})`);

    await callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: `Привет, ${username}! 👋\n\nДобро пожаловать в игру «Hiko: Battle Time»!\nТвоя гильдия ждёт тебя. Нажми кнопку ниже, чтобы открыть игру.`,
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '⚔️ Войти в игру',
                    web_app: { url: GAME_URL }
                }
            ]]
        }
    });
}

// =======================================================
// BATTLE START — Notify all guild members
// POST /api/notify-battle
// Body: { memberChatIds: [123, 456, ...], guildName: "...", opponentName: "..." }
// =======================================================
app.post('/api/notify-battle', requireTelegramAuth, async (req, res) => {
    try {
        validateInput(req.body);
        const { memberChatIds, guildName, opponentName } = req.body;

        if (!Array.isArray(memberChatIds) || memberChatIds.length === 0) {
            return res.status(400).json({ success: false, error: 'memberChatIds is required' });
        }

        console.log(`Battle notification: guild "${guildName}" vs "${opponentName}", members: ${memberChatIds.length}`);

        const text = `⚔️ БИТВА НАЧАЛАСЬ!\n\n🏰 Гильдия: ${guildName || 'Ваша гильдия'}\n👹 Противник: ${opponentName || 'Неизвестный'}\n\nСкорее заходи в игру — наноси урон!`;

        const results = await Promise.allSettled(
            memberChatIds.map(chatId =>
                callTelegramAPI('sendMessage', {
                    chat_id: chatId,
                    text,
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: '⚔️ В бой!',
                                web_app: { url: GAME_URL }
                            }
                        ]]
                    }
                })
            )
        );

        const sent = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
        const failed = results.length - sent;
        console.log(`Battle notifications: ${sent} sent, ${failed} failed`);

        res.json({ success: true, sent, failed });
    } catch (e) {
        console.error('/api/notify-battle error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =======================================================
// FRIEND REQUEST — Notify user about incoming friend request
// POST /api/notify-friend-request
// Body: { recipientChatId: 123, senderName: "...", initData: "..." }
// =======================================================
app.post('/api/notify-friend-request', requireTelegramAuth, async (req, res) => {
    try {
        validateInput(req.body);
        const { recipientChatId, senderName } = req.body;

        if (!recipientChatId) {
            return res.status(400).json({ success: false, error: 'recipientChatId is required' });
        }

        console.log(`Friend request notification to ${recipientChatId} from "${senderName}"`);

        const result = await callTelegramAPI('sendMessage', {
            chat_id: recipientChatId,
            text: `🤝 У тебя новая заявка в друзья!\n\n👤 ${senderName || 'Игрок'} хочет добавить тебя в друзья.\n\nЗайди в игру, чтобы принять или отклонить заявку.`,
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '👥 Открыть игру',
                        web_app: { url: GAME_URL }
                    }
                ]]
            }
        });

        if (result.ok) {
            res.json({ success: true });
        } else {
            console.error('Telegram API error on friend request:', result);
            res.json({ success: false, error: result.description || 'Telegram API error' });
        }
    } catch (e) {
        console.error('/api/notify-friend-request error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =======================================================
// STARS INVOICE
// =======================================================
app.post('/api/create-stars-invoice', requireTelegramAuth, async (req, res) => {
    try {
        validateInput(req.body);
        const { userId, stars = 50 } = req.body;
        const amount = parseInt(stars, 10) || 50;
        const payload = `stars_spin_${userId || 'anon'}_${Date.now()}`;

        const result = await callTelegramAPI('createInvoiceLink', {
            title: 'Звёздный сундук',
            description: 'Прокрути звёздный сундук и получи эксклюзивный предмет!',
            payload,
            currency: 'XTR',
            prices: [{ label: 'Прокрут сундука', amount }]
        });

        console.log('createInvoiceLink result:', result);

        if (result.ok) {
            res.json({ success: true, link: result.result });
        } else {
            console.error('Telegram API error:', result);
            res.json({ success: false, error: result.description || 'Telegram API error' });
        }
    } catch (e) {
        console.error('/api/create-stars-invoice error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =======================================================
// WEBHOOK — handles all Telegram updates
// =======================================================
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        console.log('Webhook update:', JSON.stringify(update));

        // Handle /start command
        if (update.message?.text === '/start') {
            await handleStartCommand(update.message);
        }

        // REQUIRED: answer pre_checkout_query to confirm the payment
        if (update.pre_checkout_query) {
            const pq = update.pre_checkout_query;
            console.log('pre_checkout_query from user', pq.from.id, '| payload:', pq.invoice_payload);
            await callTelegramAPI('answerPreCheckoutQuery', {
                pre_checkout_query_id: pq.id,
                ok: true
            });
        }

        // Stars payment confirmed
        if (update.message?.successful_payment) {
            const payment = update.message.successful_payment;
            console.log('successful_payment:', payment.invoice_payload, '| amount:', payment.total_amount, 'XTR');
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(200).send('OK'); // always 200 to Telegram
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
