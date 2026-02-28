require('dotenv').config();

// Required modules
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Middleware for CORS
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'https://hiko-bot-backend.onrender.com')
    .split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (e.g. mobile apps, curl) or matching whitelist
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    }
}));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware to parse JSON in requests
app.use(express.json());

// Function to validate input
function validateInput(data) {
  // Implement your validation logic here
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid input');
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Telegram Bot Token
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

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
const crypto = require('crypto');

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

// Create a Telegram Stars invoice link
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

// Telegram webhook — handles pre_checkout_query and successful_payment
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        console.log('Webhook update:', JSON.stringify(update));

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
