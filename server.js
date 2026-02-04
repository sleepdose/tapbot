const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Инициализация Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
});

// Получение кастомного токена
app.post('/get-token', async (req, res) => {
    try {
        const { telegramId } = req.body;

        // Создаем кастомный токен
        const token = await admin.auth().createCustomToken(`telegram_${telegramId}`);

        res.json({ token });
    } catch (error) {
        console.error('Token error:', error);
        res.status(500).json({ error: 'Token generation failed' });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));
