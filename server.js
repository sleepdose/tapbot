const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// =================== БЕЗОПАСНОСТЬ И ПРОМЕЖУТОЧНОЕ ПО ===================

// Безопасность HTTP-заголовков
app.use(helmet({
  contentSecurityPolicy: false, // Отключаем для веб-приложений с внешними ресурсами
  crossOriginEmbedderPolicy: false
}));

// Логирование запросов
app.use(morgan('combined'));

// CORS настройка
app.use(cors({
  origin: [
    'https://hiko-ca02d.firebaseapp.com',
    'https://hiko-ca02d.web.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
}));

// Парсинг JSON с ограничением размера
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ограничение запросов
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // лимит: 100 запросов с одного IP
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// =================== ИНИЦИАЛИЗАЦИЯ FIREBASE ADMIN ===================

let firebaseInitialized = false;

try {
  // Проверяем наличие необходимых переменных окружения
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID не установлен');
  }
  if (!process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('FIREBASE_CLIENT_EMAIL не установлен');
  }
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('FIREBASE_PRIVATE_KEY не установлен');
  }

  // Инициализируем Firebase Admin
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });

  firebaseInitialized = true;
  console.log('✅ Firebase Admin успешно инициализирован');
} catch (error) {
  console.error('❌ Ошибка инициализации Firebase Admin:', error.message);
}

// =================== ПОПУТНЫЕ МАРШРУТЫ ===================

// Проверка работоспособности сервера
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'AIKO TAPBOT API сервер работает',
    timestamp: new Date().toISOString(),
    firebase: firebaseInitialized ? 'connected' : 'disconnected',
    version: '1.0.0'
  });
});

// Проверка здоровья сервера
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    firebase: firebaseInitialized,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// =================== API МАРШРУТЫ ===================

// Получение кастомного токена для Firebase Auth
app.post('/api/get-token', async (req, res) => {
  try {
    // Проверяем инициализацию Firebase
    if (!firebaseInitialized) {
      return res.status(503).json({
        error: 'Сервис временно недоступен',
        code: 'FIREBASE_NOT_INITIALIZED'
      });
    }

    const { telegramId } = req.body;

    // Валидация входных данных
    if (!telegramId) {
      return res.status(400).json({
        error: 'Требуется telegramId',
        code: 'MISSING_TELEGRAM_ID'
      });
    }

    if (typeof telegramId !== 'number' && isNaN(Number(telegramId))) {
      return res.status(400).json({
        error: 'telegramId должен быть числом',
        code: 'INVALID_TELEGRAM_ID'
      });
    }

    // Формируем уникальный идентификатор пользователя
    const uid = `telegram_${telegramId}`;

    console.log(`🔐 Создание токена для пользователя: ${uid}`);

    // Проверяем существование пользователя
    let userRecord;
    try {
      userRecord = await admin.auth().getUser(uid);
      console.log(`👤 Пользователь ${uid} уже существует`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Создаем нового пользователя
        userRecord = await admin.auth().createUser({
          uid: uid,
          displayName: `Telegram User ${telegramId}`,
          disabled: false
        });
        console.log(`👤 Создан новый пользователь: ${uid}`);
      } else {
        throw error;
      }
    }

    // Создаем кастомный токен
    const token = await admin.auth().createCustomToken(uid, {
      telegramId: telegramId,
      createdAt: new Date().toISOString()
    });

    console.log(`✅ Токен создан для пользователя: ${uid}`);

    res.json({
      token: token,
      uid: uid,
      expiresIn: 3600 // 1 час в секундах
    });
  } catch (error) {
    console.error('❌ Ошибка создания токена:', error);

    // Классификация ошибок
    if (error.code === 'auth/invalid-argument') {
      return res.status(400).json({
        error: 'Неверные параметры запроса',
        code: 'INVALID_ARGUMENT'
      });
    } else if (error.code === 'auth/network-request-failed') {
      return res.status(503).json({
        error: 'Ошибка сети Firebase',
        code: 'FIREBASE_NETWORK_ERROR'
      });
    } else if (error.code === 'auth/internal-error') {
      return res.status(500).json({
        error: 'Внутренняя ошибка Firebase',
        code: 'FIREBASE_INTERNAL_ERROR'
      });
    }

    res.status(500).json({
      error: 'Ошибка генерации токена',
      code: 'TOKEN_GENERATION_FAILED',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Получение статистики пользователя
app.get('/api/user/:telegramId/stats', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ error: 'Сервис временно недоступен' });
    }

    const { telegramId } = req.params;
    const db = admin.firestore();

    // Ищем пользователя по telegramId
    const usersSnapshot = await db.collection('users')
      .where('telegramId', '==', Number(telegramId))
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();

    // Формируем безопасный ответ (без чувствительных данных)
    const safeUserData = {
      telegramId: userData.telegramId,
      username: userData.username,
      level: userData.level || 1,
      honey: userData.honey || 0,
      xp: userData.xp || 0,
      lastOnline: userData.lastActive,
      createdAt: userData.createdAt
    };

    res.json(safeUserData);
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// Получение списка друзей пользователя
app.get('/api/user/:telegramId/friends', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ error: 'Сервис временно недоступен' });
    }

    const { telegramId } = req.params;
    const db = admin.firestore();

    // Сначала находим пользователя
    const usersSnapshot = await db.collection('users')
      .where('telegramId', '==', Number(telegramId))
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;

    // Получаем друзей пользователя (используем ту же логику что и в клиенте)
    const friendships1 = await db.collection('friendships')
      .where('user1', '==', userId)
      .get();

    const friendships2 = await db.collection('friendships')
      .where('user2', '==', userId)
      .get();

    const friendIds = new Set();

    friendships1.docs.forEach(doc => {
      const data = doc.data();
      if (data.user2 !== userId) friendIds.add(data.user2);
    });

    friendships2.docs.forEach(doc => {
      const data = doc.data();
      if (data.user1 !== userId) friendIds.add(data.user1);
    });

    // Получаем данные друзей
    const friends = [];
    const friendPromises = Array.from(friendIds).map(async (friendId) => {
      try {
        const friendDoc = await db.collection('users').doc(friendId).get();
        if (friendDoc.exists) {
          const friendData = friendDoc.data();
          friends.push({
            id: friendId,
            telegramId: friendData.telegramId,
            username: friendData.username || `Игрок ${friendData.telegramId}`,
            level: friendData.level || 1,
            honey: friendData.honey || 0,
            xp: friendData.xp || 0,
            lastOnline: friendData.lastActive
          });
        }
      } catch (error) {
        console.warn(`Не удалось загрузить данные друга ${friendId}:`, error);
      }
    });

    await Promise.all(friendPromises);

    res.json({
      count: friends.length,
      friends: friends
    });
  } catch (error) {
    console.error('❌ Ошибка получения друзей:', error);
    res.status(500).json({ error: 'Ошибка получения списка друзей' });
  }
});

// Экспорт данных пользователя
app.get('/api/user/:telegramId/export', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ error: 'Сервис временно недоступен' });
    }

    const { telegramId } = req.params;
    const db = admin.firestore();

    // Ищем пользователя
    const usersSnapshot = await db.collection('users')
      .where('telegramId', '==', Number(telegramId))
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();

    // Формируем полный экспорт данных
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        gameVersion: '1.0.0',
        userId: userDoc.id,
        telegramId: userData.telegramId
      },
      profile: {
        username: userData.username,
        level: userData.level,
        honey: userData.honey,
        xp: userData.xp,
        energy: userData.energy,
        maxEnergy: userData.maxEnergy
      },
      progress: {
        keys: userData.keys || {},
        achievements: userData.achievements || {},
        totalPlayTime: userData.totalPlayTime || 0,
        saveCount: userData.saveCount || 0
      },
      talents: {
        basic: userData.talents?.basic || { level: 1, damage: 10 },
        critical: userData.talents?.critical || { level: 1, chance: 0.2 },
        poison: userData.talents?.poison || { level: 1, damage: 3 },
        crafted: userData.craftedTalents || {}
      },
      inventory: {
        attackCharges: userData.attackCharges || {},
        purchasedBackgrounds: userData.purchasedBackgrounds || ['default'],
        currentBackground: userData.currentBackground || 'default'
      },
      customization: {
        currentSkin: userData.currentSkin,
        currentPet: userData.currentPet,
        hasPet: userData.hasPet || false,
        isUsingSkin: userData.isUsingSkin || false
      }
    };

    // Устанавливаем заголовки для скачивания файла
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="aiko_tapbot_backup_${telegramId}_${Date.now()}.json"`);

    res.json(exportData);
  } catch (error) {
    console.error('❌ Ошибка экспорта данных:', error);
    res.status(500).json({ error: 'Ошибка экспорта данных' });
  }
});

// Поиск пользователей по имени
app.get('/api/users/search', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(503).json({ error: 'Сервис временно недоступен' });
    }

    const { username, limit = 20 } = req.query;

    if (!username || username.length < 3) {
      return res.status(400).json({
        error: 'Требуется минимум 3 символа для поиска'
      });
    }

    const db = admin.firestore();

    // Поиск по частичному совпадению имени пользователя
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('username', '>=', username)
      .where('username', '<=', username + '\uf8ff')
      .limit(parseInt(limit))
      .get();

    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        telegramId: data.telegramId,
        username: data.username,
        level: data.level || 1,
        honey: data.honey || 0
      };
    });

    res.json({
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error('❌ Ошибка поиска пользователей:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// =================== АДМИНИСТРАТИВНЫЕ МАРШРУТЫ ===================

// Получение статистики сервера (требует авторизации)
app.get('/admin/stats', async (req, res) => {
  try {
    // Простая проверка API ключа
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Неавторизованный доступ' });
    }

    if (!firebaseInitialized) {
      return res.status(503).json({ error: 'Firebase не инициализирован' });
    }

    const db = admin.firestore();

    // Собираем статистику
    const [
      totalUsers,
      activeUsers,
      friendshipsCount,
      friendRequestsCount
    ] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('users').where('lastActive', '>', new Date(Date.now() - 24 * 60 * 60 * 1000)).count().get(),
      db.collection('friendships').count().get(),
      db.collection('friendRequests').where('status', '==', 'pending').count().get()
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      users: {
        total: totalUsers.data().count,
        activeLast24h: activeUsers.data().count
      },
      social: {
        friendships: friendshipsCount.data().count,
        pendingRequests: friendRequestsCount.data().count
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    });
  } catch (error) {
    console.error('❌ Ошибка получения админ статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// =================== ОБРАБОТКА ОШИБОК ===================

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Маршрут не найден',
    path: req.path,
    method: req.method
  });
});

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
  console.error('🔥 Глобальная ошибка:', error);

  res.status(error.status || 500).json({
    error: 'Внутренняя ошибка сервера',
    code: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9)
  });
});

// =================== ЗАПУСК СЕРВЕРА ===================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Проверяем необходимые переменные окружения
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Отсутствуют необходимые переменные окружения:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.log('⚠️  Сервер будет работать с ограниченной функциональностью');
}

// Функция graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} получен. Завершение работы...`);

  // Здесь можно добавить сохранение состояния, закрытие соединений с БД и т.д.

  setTimeout(() => {
    console.log('✅ Сервер завершил работу');
    process.exit(0);
  }, 1000);
};

// Обработка сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('🔥 Необработанное исключение:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Необработанный промис:', reason);
});

// Запуск сервера
if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Сервер запущен на http://${HOST}:${PORT}`);
    console.log(`📅 ${new Date().toLocaleString()}`);
    console.log(`🔧 Режим: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Firebase: ${firebaseInitialized ? '✅' : '❌'}`);
  });

  // Обработка ошибок сервера
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Порт ${PORT} уже используется`);
      process.exit(1);
    } else {
      console.error('❌ Ошибка сервера:', error);
    }
  });
}

module.exports = app;
