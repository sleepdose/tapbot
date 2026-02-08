class FirebaseManager {
  constructor() {
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.isOnline = true;
    this.saveQueue = [];
    this.isSaving = false;
    this.MAX_FRIENDS = 20;

    // Конфигурация Firebase (⚠️ ВНИМАНИЕ: Замените на переменные окружения в продакшене!)
    // Для безопасности рекомендуется использовать переменные окружения или серверную часть
    this.firebaseConfig = {
      apiKey: "AIzaSyAhzdARqvqC4a6zCaXUVoO9Ij94mtoNha0",
      authDomain: "hiko-ca02d.firebaseapp.com",
      projectId: "hiko-ca02d",
      storageBucket: "hiko-ca02d.firebasestorage.app",
      messagingSenderId: "100480722325",
      appId: "1:100480722325:web:781a1fb54807b047e1829c",
      measurementId: "G-3E97NRDJTD"
    };

    // Инициализация Firebase
    this.init().catch(console.error);
  }

  async init() {
    try {
      console.log('Инициализация Firebase...');

      // Проверяем, подключены ли скрипты Firebase
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase не загружен. Проверьте подключение скриптов.');
      }

      // Инициализируем Firebase
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }

      this.db = firebase.firestore();
      this.auth = firebase.auth();

      // Отключаем оффлайн-режим
      console.log('Работа только в онлайн режиме');

      // Авторизуемся анонимно
      await this.authenticate();

      console.log('Firebase инициализирован');
      return true;
    } catch (error) {
      console.error('Ошибка инициализации Firebase:', error);
      this.isOnline = false;
      return false;
    }
  }

  // Аутентификация пользователя с сохранением Telegram ID
  async authenticate() {
    try {
      const telegramId = this.getTelegramId();
      const telegramUsername = this.getTelegramUsername();

      console.log('=== АУТЕНТИФИКАЦИЯ ===');
      console.log('Telegram ID:', telegramId);
      console.log('Telegram Username:', telegramUsername);

      // Анонимная аутентификация
      const userCredential = await this.auth.signInAnonymously();
      this.currentUser = userCredential.user;

      console.log('Firebase UID:', this.currentUser.uid);

      // Подготавливаем данные пользователя
      const userData = {
        authUid: this.currentUser.uid,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      // Добавляем Telegram данные если они есть
      if (telegramId) {
        userData.telegramId = Number(telegramId);
        userData.username = telegramUsername || `Игрок ${telegramId}`;

        // Проверяем, есть ли уже пользователь с таким Telegram ID
        const usersSnapshot = await this.db.collection('users')
          .where('telegramId', '==', Number(telegramId))
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          console.log('Найден существующий пользователь:', userDoc.id);

          // Проверяем, что это не тот же самый пользователь
          if (userDoc.id !== this.currentUser.uid) {
            // Переносим данные из старого документа (кроме telegramId и username)
            const oldData = userDoc.data();
            delete oldData.telegramId;
            delete oldData.username;
            delete oldData.authUid;
            delete oldData.createdAt;

            Object.assign(userData, oldData);

            // Удаляем старый документ если UID отличается
            await this.db.collection('users').doc(userDoc.id).delete();
            console.log('Удален дублирующий документ');
          }
        }
      } else {
        userData.username = 'Анонимный игрок';
        console.log('Используется анонимная аутентификация');
      }

      // Сохраняем/обновляем пользователя
      await this.db.collection('users').doc(this.currentUser.uid).set(userData, { merge: true });

      console.log('Пользователь сохранен в Firebase');

      // Слушаем изменения статуса аутентификации
      this.auth.onAuthStateChanged(user => {
        this.currentUser = user;
        if (user) {
          console.log('Пользователь онлайн:', user.uid);
          this.isOnline = true;
        } else {
          this.isOnline = false;
        }
      });

      return true;
    } catch (error) {
      console.error('Ошибка аутентификации:', error);
      this.isOnline = false;
      return false;
    }
  }

  // Получение Telegram ID из WebApp
  getTelegramId() {
    try {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
        const telegramData = window.Telegram.WebApp.initDataUnsafe;
        if (telegramData.user && telegramData.user.id) {
          return telegramData.user.id;
        }
      }
      return null;
    } catch (error) {
      console.error('Ошибка получения Telegram ID:', error);
      return null;
    }
  }

  // Получение имени пользователя Telegram
  getTelegramUsername() {
    try {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
        const telegramData = window.Telegram.WebApp.initDataUnsafe;
        if (telegramData.user) {
          return telegramData.user.username ||
                 telegramData.user.first_name ||
                 `Игрок ${telegramData.user.id}`;
        }
      }
      return null;
    } catch (error) {
      console.error('Ошибка получения имени пользователя:', error);
      return null;
    }
  }

  // Валидация игровых данных
  validateGameData(gameState) {
    if (!gameState) return false;

    // Проверка основных числовых значений
    if (typeof gameState.honey !== 'number' || gameState.honey < 0) return false;
    if (typeof gameState.level !== 'number' || gameState.level < 1 || gameState.level > 100) return false;
    if (typeof gameState.energy !== 'number' || gameState.energy < 0) return false;

    // Проверка талантов
    if (gameState.talents) {
      const talents = gameState.talents;
      if (talents.basic && (talents.basic.level < 1 || talents.basic.level > 10)) return false;
      if (talents.critical && (talents.critical.level < 1 || talents.critical.level > 10)) return false;
      if (talents.poison && (talents.poison.level < 1 || talents.poison.level > 10)) return false;
    }

    return true;
  }

  // Сохранение данных игры
  async saveGameData(gameState) {
    try {
      if (!this.currentUser || !this.isOnline || !this.db) {
        console.warn('Нет подключения к интернету. Данные не сохранены.');
        return false;
      }

      // Валидация данных перед сохранением
      if (!this.validateGameData(gameState)) {
        console.error('❌ Невалидные игровые данные');
        return false;
      }

      const telegramId = this.getTelegramId();
      const telegramUsername = this.getTelegramUsername();

      const dataToSave = {
        // ========= ОСНОВНЫЕ ДАННЫЕ =========
        honey: Math.max(0, gameState.honey || 0),
        xp: Math.max(0, gameState.xp || 0),
        level: Math.max(1, Math.min(gameState.level || 1, 100)),
        energy: Math.max(0, gameState.energy || 100),
        maxEnergy: Math.max(100, gameState.maxEnergy || 100),
        xpToNextLevel: Math.max(100, gameState.xpToNextLevel || 100),

        // ========= ТАЛЕНТЫ =========
        talents: gameState.talents || {
          basic: { level: 1, damage: 10 },
          critical: { level: 1, chance: 0.2 },
          poison: { level: 1, damage: 3 }
        },
        attackCharges: gameState.attackCharges || {
          basic: { charges: 15, basePrice: 50 },
          critical: { charges: 15, basePrice: 75 },
          poison: { charges: 15, basePrice: 100 }
        },
        craftedTalents: gameState.craftedTalents || {
          sonic: { level: 0, damage: 50, charges: 0 },
          fire: { level: 0, damage: 75, charges: 0 },
          ice: { level: 0, damage: 60, charges: 0 }
        },

        // ========= ПРОГРЕСС =========
        keys: gameState.keys || { bear: 0, dragon: 0, hydra: 0, kraken: 0 },
        achievements: gameState.achievements || {
          waspKills: 0,
          bearKills: 0,
          completed: { level1: false, level2: false, level3: false },
          claimed: { level1: false, level2: false, level3: false },
          bearCompleted: { level1: false, level2: false, level3: false },
          bearClaimed: { level1: false, level2: false, level3: false }
        },

        // ========= КАСТОМИЗАЦИЯ =========
        purchasedBackgrounds: gameState.purchasedBackgrounds || ['default'],
        currentBackground: gameState.currentBackground || 'default',
        currentSkin: gameState.currentSkin || 'img/human_male.png',
        currentPet: gameState.currentPet || 'img/pet1.png',
        hasPet: gameState.hasPet || false,
        isUsingSkin: gameState.isUsingSkin || false,

        // ========= ГИЛЬДИЯ =========
        guildId: gameState.guildId || null,
        guildName: gameState.guildName || null,
        guildRole: gameState.guildRole || null,

        // ========= УЛЬИ =========
        activeHive: gameState.activeHive || 'basic',
        purchasedHives: gameState.purchasedHives || ['basic'],

        // ========= БУСТЫ =========
        boosts: gameState.boosts || {
          battleBonus: 1.0,
          attackSpeed: 1.0,
          shield: false,
          multiclick: false
        },

        // ========= СИСТЕМА ДРУЗЕЙ =========
        friends: gameState.friends || [],
        friendRequests: gameState.friendRequests || { incoming: [], outgoing: [] },

        // ========= БОЕВАЯ СИСТЕМА =========
        selectedTalent: gameState.selectedTalent || null,
        selectedForCraft: gameState.selectedForCraft || [],

        // ========= ОФЛАЙН БОИ =========
        activeBattle: gameState.activeBattle ? {
          type: gameState.activeBattle.type,
          health: gameState.activeBattle.health || gameState.currentBoss?.currentHealth,
          timeLimit: gameState.activeBattle.timeLimit
        } : null,
        battleStartTime: gameState.battleStartTime || null,
        battleTimeLimit: gameState.battleTimeLimit || null,

        // Текущее состояние боя:
        currentBoss: gameState.currentBoss ? {
          type: gameState.currentBoss.type,
          currentHealth: Math.max(0, gameState.currentBoss.currentHealth || 0),
          maxHealth: Math.max(1, gameState.currentBoss.maxHealth || 0),
          image: gameState.currentBoss.image
        } : null,

        inBattle: gameState.inBattle || false,
        battleStats: gameState.battleStats || {
          basicDamage: 0,
          criticalDamage: 0,
          poisonDamage: 0,
          sonicDamage: 0,
          fireDamage: 0,
          iceDamage: 0,
          totalDamage: 0
        },

        // ========= НЕЗАКРЫТЫЕ РЕЗУЛЬТАТЫ БОЯ =========
        pendingBattleResult: gameState.pendingBattleResult || null,
        pendingBattleResultType: gameState.pendingBattleResultType || null,

        // ========= АУДИО И НАСТРОЙКИ =========
        isMusicMuted: gameState.isMusicMuted || false,

        // ========= МЕТА-ДАННЫЕ =========
        lastSaved: firebase.firestore.FieldValue.serverTimestamp(),
        lastSavedTimestamp: Date.now(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        version: '1.0.0',
        saveCount: (gameState.saveCount || 0) + 1,
        totalPlayTime: (gameState.totalPlayTime || 0) +
          (Date.now() - (gameState.lastSaveTime || Date.now()))
      };

      // Добавляем Telegram данные только если они есть
      if (telegramId) {
        dataToSave.telegramId = Number(telegramId);
        dataToSave.username = telegramUsername || `Игрок ${telegramId}`;
      }

      // Сохраняем в Firebase с обработкой ошибок записи
      await this.db.collection('users').doc(this.currentUser.uid).set(dataToSave, { merge: true });

      console.log('✅ Все данные сохранены в Firebase');
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения в Firebase:', error);

      // Логируем ошибку для отладки
      if (error.code === 'permission-denied') {
        console.error('Нет прав доступа. Проверьте правила безопасности Firebase.');
      } else if (error.code === 'unavailable') {
        console.error('Firebase недоступен. Проверьте интернет-соединение.');
      }

      return false;
    }
  }

  // Загрузка данных игры
  async loadGameData() {
    try {
      // Пробуем загрузить из Firebase
      if (this.currentUser && this.isOnline) {
        const doc = await this.db.collection('users').doc(this.currentUser.uid).get();

        if (doc.exists) {
          const data = doc.data();
          console.log('✅ Данные загружены из Firebase');
          console.log('Telegram ID в загруженных данных:', data.telegramId);

          return {
            success: true,
            data: data,
            source: 'firebase'
          };
        }
      }

      // Если нет данных в Firebase или нет интернета
      console.log('Нет сохраненных данных в облаке, используется новый профиль');
      return {
        success: false,
        data: null,
        source: 'new'
      };
    } catch (error) {
      console.error('Ошибка загрузки из Firebase:', error);
      return {
        success: false,
        data: null,
        source: 'error'
      };
    }
  }

  // Получение текущего Telegram ID
  async getCurrentTelegramId() {
    try {
      if (!this.currentUser || !this.isOnline) return null;

      const doc = await this.db.collection('users').doc(this.currentUser.uid).get();
      if (doc.exists) {
        const data = doc.data();
        return data.telegramId || null;
      }
      return null;
    } catch (error) {
      console.error('Ошибка получения Telegram ID:', error);
      return null;
    }
  }

  // Удаление данных
  async deleteData() {
    try {
      if (this.currentUser && this.isOnline) {
        await this.db.collection('users').doc(this.currentUser.uid).delete();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Ошибка удаления данных:', error);
      return false;
    }
  }

  // Проверка соединения
  checkConnection() {
    return this.isOnline;
  }

  // =================== МЕТОДЫ ДЛЯ СИСТЕМЫ ДРУЗЕЙ ===================

  // Отправка заявки в друзья - ФИНАЛЬНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ
  async sendFriendRequest(targetTelegramId, message = '') {
    try {
      if (!this.currentUser || !this.isOnline) {
        console.warn('Нет подключения к интернету');
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные текущего пользователя
      const currentUserDoc = await this.db.collection('users').doc(this.currentUser.uid).get();

      if (!currentUserDoc.exists) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const currentUserData = currentUserDoc.data();
      const currentTelegramId = currentUserData.telegramId;

      console.log('=== ОТПРАВКА ЗАЯВКИ В ДРУЗЬЯ ===');
      console.log('Текущий пользователь Telegram ID:', currentTelegramId);
      console.log('Целевой Telegram ID:', targetTelegramId);

      if (!currentTelegramId) {
        return {
          success: false,
          error: 'У вас не сохранен Telegram ID. Перезапустите игру через Telegram'
        };
      }

      // Преобразуем ID в числа для сравнения
      const currentId = Number(currentTelegramId);
      const targetId = Number(targetTelegramId);

      // Проверяем, не пытаемся ли добавить самого себя
      if (currentId === targetId) {
        return { success: false, error: 'Нельзя добавить себя в друзья' };
      }

      // Проверяем лимит друзей у текущего пользователя
      const currentUserFriendsCount = await this.getFriendsCount(this.currentUser.uid);
      if (currentUserFriendsCount >= this.MAX_FRIENDS) {
        return { success: false, error: 'У вас максимальное количество друзей (20)' };
      }

      // Ищем пользователя по telegramId
      const usersSnapshot = await this.db.collection('users')
        .where('telegramId', '==', targetId)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        return {
          success: false,
          error: 'Пользователь с таким Telegram ID не найден. Попросите его зайти в игру хотя бы один раз'
        };
      }

      const targetUserDoc = usersSnapshot.docs[0];
      const targetUserId = targetUserDoc.id;
      const targetUserData = targetUserDoc.data();

      console.log('Найден целевой пользователь:', targetUserData);

      // Проверяем лимит друзей у целевого пользователя
      const targetUserFriendsCount = await this.getFriendsCount(targetUserId);
      if (targetUserFriendsCount >= this.MAX_FRIENDS) {
        return { success: false, error: 'У этого пользователя максимальное количество друзей' };
      }

      // Проверяем существующие заявки и дружбу
      const existingRequests = await this.db.collection('friendRequests')
        .where('fromUser', 'in', [this.currentUser.uid, targetUserId])
        .where('toUser', 'in', [this.currentUser.uid, targetUserId])
        .where('status', 'in', ['pending', 'accepted'])
        .get();

      if (!existingRequests.empty) {
        for (const doc of existingRequests.docs) {
          const data = doc.data();

          if (data.status === 'accepted') {
            return { success: false, error: 'Вы уже друзья с этим пользователем' };
          }

          if (data.status === 'pending') {
            if (data.fromUser === this.currentUser.uid && data.toUser === targetUserId) {
              return { success: false, error: 'Вы уже отправили заявку этому пользователю' };
            } else if (data.fromUser === targetUserId && data.toUser === this.currentUser.uid) {
              return { success: false, error: 'Этот пользователь уже отправил вам заявку' };
            }
          }
        }
      }

      // Создаем заявку
      await this.db.collection('friendRequests').add({
        fromUser: this.currentUser.uid,
        fromTelegramId: currentId,
        fromName: currentUserData.username || `Игрок ${currentId}`,
        fromLevel: currentUserData.level || 1,
        toUser: targetUserId,
        toTelegramId: targetId,
        toName: targetUserData.username || `Игрок ${targetId}`,
        message: message,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('Заявка в друзья отправлена успешно');
      return { success: true };
    } catch (error) {
      console.error('Ошибка отправки заявки:', error);
      return {
        success: false,
        error: 'Ошибка отправки заявки: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Получение заявок в друзья
  async getFriendRequests() {
    try {
      if (!this.currentUser || !this.isOnline) return { incoming: [], outgoing: [] };

      // Входящие заявки
      const incomingRequestsQuery = this.db.collection('friendRequests')
        .where('toUser', '==', this.currentUser.uid)
        .where('status', '==', 'pending');

      const incomingRequests = await incomingRequestsQuery.get();

      // Исходящие заявки
      const outgoingRequestsQuery = this.db.collection('friendRequests')
        .where('fromUser', '==', this.currentUser.uid)
        .where('status', '==', 'pending');

      const outgoingRequests = await outgoingRequestsQuery.get();

      return {
        incoming: incomingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        outgoing: outgoingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };
    } catch (error) {
      console.error('Ошибка получения заявок:', error);
      return { incoming: [], outgoing: [] };
    }
  }

  // Обработка заявки в друзья
  async respondToFriendRequest(requestId, accept = true) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      const requestRef = this.db.collection('friendRequests').doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        return { success: false, error: 'Заявка не найдена' };
      }

      const requestData = requestDoc.data();

      if (requestData.toUser !== this.currentUser.uid) {
        return { success: false, error: 'Недостаточно прав' };
      }

      if (accept) {
        // Проверяем лимит друзей у текущего пользователя
        const currentUserFriendsCount = await this.getFriendsCount(this.currentUser.uid);
        if (currentUserFriendsCount >= this.MAX_FRIENDS) {
          return { success: false, error: 'У вас максимальное количество друзей (20)' };
        }

        // Проверяем лимит друзей у отправителя
        const senderFriendsCount = await this.getFriendsCount(requestData.fromUser);
        if (senderFriendsCount >= this.MAX_FRIENDS) {
          return { success: false, error: 'У отправителя максимальное количество друзей' };
        }

        // Принимаем заявку
        await requestRef.update({
          status: 'accepted',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Добавляем друг друга в друзья
        await this.addFriend(requestData.fromUser, this.currentUser.uid);
        console.log('Заявка принята');
        return { success: true };
      } else {
        // Отклоняем заявку
        await requestRef.update({
          status: 'rejected',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Заявка отклонена');
        return { success: true };
      }
    } catch (error) {
      console.error('Ошибка обработки заявки:', error);
      return { success: false, error: 'Ошибка обработки заявки: ' + error.message };
    }
  }

  // Добавление друзей в коллекцию дружбы
  async addFriend(userId1, userId2) {
    try {
      // Проверяем, не существует ли уже дружба
      const friendshipQuery = this.db.collection('friendships')
        .where('user1', 'in', [userId1, userId2])
        .where('user2', 'in', [userId1, userId2])
        .get();

      const friendships = await friendshipQuery;

      if (!friendships.empty) {
        console.log('Дружба уже существует');
        return true;
      }

      // Создаем связь дружбы
      await this.db.collection('friendships').add({
        user1: userId1,
        user2: userId2,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('Друзья добавлены');
      return true;
    } catch (error) {
      console.error('Ошибка добавления друзей:', error);
      return false;
    }
  }

  // Получение списка друзей
  async getFriends() {
    try {
      if (!this.currentUser || !this.isOnline) return [];

      // Получаем все дружеские связи пользователя
      const friendshipsSnapshot = await this.db.collection('friendships')
        .where('user1', '==', this.currentUser.uid)
        .get();

      const friendshipsSnapshot2 = await this.db.collection('friendships')
        .where('user2', '==', this.currentUser.uid)
        .get();

      const friendIds = new Set();

      friendshipsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.user2 !== this.currentUser.uid) {
          friendIds.add(data.user2);
        }
      });

      friendshipsSnapshot2.docs.forEach(doc => {
        const data = doc.data();
        if (data.user1 !== this.currentUser.uid) {
          friendIds.add(data.user1);
        }
      });

      // Получаем данные друзей
      const friends = [];
      const friendPromises = Array.from(friendIds).map(async (friendId) => {
        try {
          const friendDoc = await this.db.collection('users').doc(friendId).get();
          if (friendDoc.exists) {
            const friendData = friendDoc.data();
            friends.push({
              id: friendId,
              telegramId: friendData.telegramId,
              username: friendData.username || `Игрок ${friendData.telegramId || 'Неизвестно'}`,
              level: friendData.level || 1,
              honey: friendData.honey || 0,
              xp: friendData.xp || 0,
              lastOnline: friendData.lastActive || friendData.lastSaved,
              lastActive: friendData.lastActive || friendData.lastSaved
            });
          }
        } catch (error) {
          console.error(`Ошибка загрузки данных друга ${friendId}:`, error);
        }
      });

      await Promise.all(friendPromises);

      return friends;
    } catch (error) {
      console.error('Ошибка получения друзей:', error);
      return [];
    }
  }

  // Подсчет количества друзей
  async getFriendsCount(userId) {
    try {
      if (!this.isOnline) return 0;

      // Получаем все дружеские связи пользователя
      const friendshipsSnapshot = await this.db.collection('friendships')
        .where('user1', '==', userId)
        .get();

      const friendshipsSnapshot2 = await this.db.collection('friendships')
        .where('user2', '==', userId)
        .get();

      return friendshipsSnapshot.size + friendshipsSnapshot2.size;
    } catch (error) {
      console.error('Ошибка подсчета друзей:', error);
      return 0;
    }
  }

  // Удаление друга
  async removeFriend(friendId) {
    try {
      if (!this.currentUser || !this.isOnline) return false;

      // Ищем дружбу в обоих направлениях
      const friendshipQuery = this.db.collection('friendships')
        .where('user1', 'in', [this.currentUser.uid, friendId])
        .where('user2', 'in', [this.currentUser.uid, friendId])
        .get();

      const friendships = await friendshipQuery;

      if (!friendships.empty) {
        // Удаляем все найденные связи (должна быть только одна)
        const batch = this.db.batch();
        friendships.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();

        console.log('Друг удален');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Ошибка удаления друга:', error);
      return false;
    }
  }

  // Получение статуса онлайн
  getOnlineStatus(lastOnline) {
    if (!lastOnline) return 'offline';

    const now = Date.now();
    const lastOnlineTime = lastOnline.toDate ? lastOnline.toDate().getTime() : lastOnline;
    const minutesAgo = (now - lastOnlineTime) / (1000 * 60);

    if (minutesAgo < 5) return 'online';
    if (minutesAgo < 15) return 'away';
    return 'offline';
  }

  // ДОБАВЛЕНО: Метод для мгновенного обновления отображения ключей
  updateBossAvailabilityImmediately(keys) {
    if (!keys) return;

    // Обновляем отображение ключей на всех карточках боссов
    document.querySelectorAll('.current-keys').forEach(el => {
      const bossType = el.dataset.boss;
      if (keys[bossType] !== undefined) {
        el.textContent = keys[bossType];

        // Обновляем состояние блокировки
        const bossCard = el.closest('.boss-card');
        if (bossCard) {
          const isLocked = keys[bossType] < 3;
          bossCard.classList.toggle('locked', isLocked);
        }
      }
    });
  }

  // =================== МЕТОДЫ ДЛЯ СИСТЕМЫ ГИЛЬДИЙ ===================

  // Создание гильдии
  async createGuild(guildName) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные текущего пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      if (!userDoc.exists) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const userData = userDoc.data();

      // Проверяем требования для создания гильдии
      if (userData.level < 20) {
        return { success: false, error: 'Для создания гильдии нужен 20 уровень' };
      }

      if (userData.honey < 10000) {
        return { success: false, error: 'Для создания гильдии нужно 10,000 меда' };
      }

      if (!guildName || guildName.trim().length < 3) {
        return { success: false, error: 'Название гильдии должно содержать минимум 3 символа' };
      }

      // Проверяем, не состоит ли уже в гильдии
      if (userData.guildId) {
        return { success: false, error: 'Вы уже состоите в гильдии' };
      }

      // Проверяем уникальность названия гильдии
      const existingGuild = await this.db.collection('guilds')
        .where('name', '==', guildName.trim())
        .limit(1)
        .get();

      if (!existingGuild.empty) {
        return { success: false, error: 'Гильдия с таким названием уже существует' };
      }

      // Создаем гильдию
      const guildRef = this.db.collection('guilds').doc();
      const guildData = {
        id: guildRef.id,
        name: guildName.trim(),
        level: 1,
        rating: 0,
        creatorId: this.currentUser.uid,
        creatorName: userData.username || `Игрок ${userData.telegramId}`,
        members: [{
          userId: this.currentUser.uid,
          username: userData.username || `Игрок ${userData.telegramId}`,
          level: userData.level || 1,
          honey: userData.honey || 0,
          joinDate: firebase.firestore.FieldValue.serverTimestamp(),
          role: 'creator'
        }],
        membersCount: 1,
        maxMembers: 50,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await guildRef.set(guildData);

      // Обновляем данные пользователя
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildId: guildRef.id,
        guildName: guildName.trim(),
        guildRole: 'creator',
        honey: firebase.firestore.FieldValue.increment(-10000) // Вычитаем 10k меда
      });

      console.log('Гильдия создана:', guildRef.id);
      return {
        success: true,
        guildId: guildRef.id,
        guildName: guildName.trim()
      };
    } catch (error) {
      console.error('Ошибка создания гильдии:', error);
      return {
        success: false,
        error: 'Ошибка создания гильдии: ' + error.message
      };
    }
  }

  // Получение списка гильдий
  async getGuilds(limit = 20) {
    try {
      if (!this.isOnline) return [];

      const guildsSnapshot = await this.db.collection('guilds')
        .orderBy('rating', 'desc')
        .limit(limit)
        .get();

      return guildsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          level: data.level || 1,
          rating: data.rating || 0,
          membersCount: data.membersCount || 0,
          maxMembers: data.maxMembers || 50,
          creatorName: data.creatorName,
          description: data.description || ''
        };
      });
    } catch (error) {
      console.error('Ошибка получения списка гильдий:', error);
      return [];
    }
  }

  // Получение информации о гильдии
  async getGuildInfo(guildId) {
    try {
      if (!this.isOnline) return null;

      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) return null;

      const data = guildDoc.data();

      // Сортируем участников: сначала создатель, затем по уровню
      const sortedMembers = [...(data.members || [])].sort((a, b) => {
        if (a.role === 'creator') return -1;
        if (b.role === 'creator') return 1;
        return (b.level || 1) - (a.level || 1);
      });

      return {
        id: guildDoc.id,
        name: data.name,
        level: data.level || 1,
        rating: data.rating || 0,
        members: sortedMembers,
        membersCount: data.membersCount || 0,
        maxMembers: data.maxMembers || 50,
        creatorId: data.creatorId,
        creatorName: data.creatorName,
        description: data.description || '',
        createdAt: data.createdAt
      };
    } catch (error) {
      console.error('Ошибка получения информации о гильдии:', error);
      return null;
    }
  }

  // Вступление в гильдию
  async joinGuild(guildId) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      if (!userDoc.exists) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const userData = userDoc.data();

      // Проверяем, не состоит ли уже в гильдии
      if (userData.guildId) {
        return { success: false, error: 'Вы уже состоите в гильдии' };
      }

      // Получаем информацию о гильдии
      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();

      // Проверяем, есть ли место в гильдии
      if (guildData.membersCount >= guildData.maxMembers) {
        return { success: false, error: 'В гильдии нет свободных мест' };
      }

      // Добавляем пользователя в гильдию
      await this.db.collection('guilds').doc(guildId).update({
        members: firebase.firestore.FieldValue.arrayUnion({
          userId: this.currentUser.uid,
          username: userData.username || `Игрок ${userData.telegramId}`,
          level: userData.level || 1,
          honey: userData.honey || 0,
          joinDate: firebase.firestore.FieldValue.serverTimestamp(),
          role: 'member'
        }),
        membersCount: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Обновляем данные пользователя
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildId: guildId,
        guildName: guildData.name,
        guildRole: 'member'
      });

      console.log('Пользователь вступил в гильдию:', guildId);
      return {
        success: true,
        guildId: guildId,
        guildName: guildData.name
      };
    } catch (error) {
      console.error('Ошибка вступления в гильдию:', error);
      return {
        success: false,
        error: 'Ошибка вступления в гильдию: ' + error.message
      };
    }
  }

  // Выход из гильдии
  async leaveGuild() {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      if (!userDoc.exists) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const userData = userDoc.data();

      // Проверяем, состоит ли в гильдии
      if (!userData.guildId) {
        return { success: false, error: 'Вы не состоите в гильдии' };
      }

      // Получаем информацию о гильдии
      const guildDoc = await this.db.collection('guilds').doc(userData.guildId).get();
      if (!guildDoc.exists) {
        // Если гильдия не найдена, просто очищаем данные пользователя
        await this.db.collection('users').doc(this.currentUser.uid).update({
          guildId: null,
          guildName: null,
          guildRole: null
        });
        return { success: true };
      }

      const guildData = guildDoc.data();

      // Удаляем пользователя из списка участников
      const memberToRemove = guildData.members.find(m => m.userId === this.currentUser.uid);
      if (memberToRemove) {
        await this.db.collection('guilds').doc(userData.guildId).update({
          members: firebase.firestore.FieldValue.arrayRemove(memberToRemove),
          membersCount: firebase.firestore.FieldValue.increment(-1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      // Обновляем данные пользователя
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildId: null,
        guildName: null,
        guildRole: null
      });

      console.log('Пользователь покинул гильдию:', userData.guildId);
      return { success: true };
    } catch (error) {
      console.error('Ошибка выхода из гильдии:', error);
      return {
        success: false,
        error: 'Ошибка выхода из гильдии: ' + error.message
      };
    }
  }

  // Удаление участника из гильдии (только для создателя)
  async removeGuildMember(memberId) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные текущего пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      if (!userDoc.exists) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const userData = userDoc.data();

      // Проверяем, является ли создателем гильдии
      if (userData.guildRole !== 'creator') {
        return { success: false, error: 'Только создатель гильдии может удалять участников' };
      }

      if (!userData.guildId) {
        return { success: false, error: 'Вы не состоите в гильдии' };
      }

      // Получаем информацию о гильдии
      const guildDoc = await this.db.collection('guilds').doc(userData.guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();

      // Проверяем, что удаляемый участник не является создателем
      if (memberId === guildData.creatorId) {
        return { success: false, error: 'Нельзя удалить создателя гильдии' };
      }

      // Находим участника для удаления
      const memberToRemove = guildData.members.find(m => m.userId === memberId);
      if (!memberToRemove) {
        return { success: false, error: 'Участник не найден' };
      }

      // Удаляем участника из гильдии
      await this.db.collection('guilds').doc(userData.guildId).update({
        members: firebase.firestore.FieldValue.arrayRemove(memberToRemove),
        membersCount: firebase.firestore.FieldValue.increment(-1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Обновляем данные удаленного участника
      await this.db.collection('users').doc(memberId).update({
        guildId: null,
        guildName: null,
        guildRole: null
      });

      console.log('Участник удален из гильдии:', memberId);
      return { success: true };
    } catch (error) {
      console.error('Ошибка удаления участника:', error);
      return {
        success: false,
        error: 'Ошибка удаления участника: ' + error.message
      };
    }
  }
}

// Создаем глобальный экземпляр
window.firebaseManager = new FirebaseManager();
