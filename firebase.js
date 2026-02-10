class FirebaseManager {
  constructor() {
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.isOnline = true;
    this.saveQueue = [];
    this.isSaving = false;
    this.MAX_FRIENDS = 20;
    this.MAX_GUILD_MEMBERS = 20;

    // ⚠️ ВНИМАНИЕ: Для безопасности рекомендуется использовать переменные окружения в продакшене!
    // В идеале эти данные должны храниться на сервере и передаваться через API
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

      // Отключаем оффлайн-режим для надежности
      console.log('Работа только в онлайн режиме');

      // Авторизуемся анонимно
      await this.authenticate();

      console.log('Firebase успешно инициализирован');
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
        // Используем BigInt для больших ID
        const telegramIdNum = this.safeParseTelegramId(telegramId);
        userData.telegramId = telegramIdNum;
        userData.username = telegramUsername || `Игрок ${telegramIdNum}`;

        // Проверяем, есть ли уже пользователь с таким Telegram ID
        const usersSnapshot = await this.db.collection('users')
          .where('telegramId', '==', telegramIdNum)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          console.log('Найден существующий пользователь:', userDoc.id);

          // Проверяем, что это не тот же самый пользователь
          if (userDoc.id !== this.currentUser.uid) {
            // Переносим данные из старого документа (кроме системных полей)
            const oldData = userDoc.data();
            const fieldsToDelete = ['telegramId', 'username', 'authUid', 'createdAt', 'lastLogin'];
            fieldsToDelete.forEach(field => delete oldData[field]);

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
          console.log('Пользователь вышел из системы');
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

  // Безопасное преобразование Telegram ID
  safeParseTelegramId(id) {
    try {
      // Для больших чисел используем строку, Firestore поддерживает большие числа
      const idNum = Number(id);
      if (isNaN(idNum) || !isFinite(idNum)) {
        return String(id); // Возвращаем как строку если не число
      }

      // Проверяем, что число в безопасном диапазоне
      if (idNum > Number.MAX_SAFE_INTEGER) {
        return String(id); // Используем строку для очень больших чисел
      }

      return idNum;
    } catch (error) {
      console.warn('Ошибка преобразования Telegram ID, используем строку:', error);
      return String(id);
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

      // Проверяем localStorage как запасной вариант
      const storedId = localStorage.getItem('telegramId');
      if (storedId) {
        return storedId;
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

      // Запасной вариант из localStorage
      const storedUsername = localStorage.getItem('telegramUsername');
      if (storedUsername) {
        return storedUsername;
      }

      return null;
    } catch (error) {
      console.error('Ошибка получения имени пользователя:', error);
      return null;
    }
  }

  // Валидация игровых данных
  validateGameData(gameState) {
    if (!gameState || typeof gameState !== 'object') {
      console.error('❌ gameState не является объектом');
      return false;
    }

    // Проверка основных числовых значений
    const numericChecks = [
      { field: 'honey', min: 0, max: 1e9 },
      { field: 'level', min: 1, max: 100 },
      { field: 'energy', min: 0, max: 1000 },
      { field: 'xp', min: 0, max: 1e9 },
      { field: 'maxEnergy', min: 100, max: 1000 }
    ];

    for (const check of numericChecks) {
      if (typeof gameState[check.field] !== 'number' ||
          gameState[check.field] < check.min ||
          gameState[check.field] > check.max) {
        console.error(`❌ Невалидное поле ${check.field}:`, gameState[check.field]);
        return false;
      }
    }

    // Проверка талантов
    if (gameState.talents && typeof gameState.talents === 'object') {
      const talents = gameState.talents;
      const talentTypes = ['basic', 'critical', 'poison'];

      for (const type of talentTypes) {
        if (talents[type]) {
          if (talents[type].level < 1 || talents[type].level > 10) {
            console.error(`❌ Невалидный уровень таланта ${type}:`, talents[type].level);
            return false;
          }
        }
      }
    }

    return true;
  }

  // Сохранение данных игры
  async saveGameData(gameState) {
    try {
      if (!this.currentUser || !this.isOnline || !this.db) {
        console.warn('⚠️ Нет подключения к интернету. Данные не сохранены.');
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Валидация данных перед сохранением
      if (!this.validateGameData(gameState)) {
        console.error('❌ Невалидные игровые данные');
        return { success: false, error: 'Невалидные игровые данные' };
      }

      const telegramId = this.getTelegramId();
      const telegramUsername = this.getTelegramUsername();

      // Сохраняем Telegram данные в localStorage для автономного режима
      if (telegramId) {
        localStorage.setItem('telegramId', telegramId);
      }
      if (telegramUsername) {
        localStorage.setItem('telegramUsername', telegramUsername);
      }

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
        dataToSave.telegramId = this.safeParseTelegramId(telegramId);
        dataToSave.username = telegramUsername || `Игрок ${telegramId}`;
      }

      // Сохраняем в Firebase с обработкой ошибок записи
      await this.db.collection('users').doc(this.currentUser.uid).set(dataToSave, { merge: true });

      console.log('✅ Все данные сохранены в Firebase');
      return { success: true };
    } catch (error) {
      console.error('❌ Ошибка сохранения в Firebase:', error);

      // Логируем ошибку для отладки
      let errorMessage = 'Неизвестная ошибка';
      if (error.code === 'permission-denied') {
        errorMessage = 'Нет прав доступа. Проверьте правила безопасности Firebase.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Firebase недоступен. Проверьте интернет-соединение.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  // Загрузка данных игры
  async loadGameData() {
    try {
      // Пробуем загрузить из Firebase
      if (this.currentUser && this.isOnline && this.db) {
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
        source: 'error',
        error: error.message
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

  // Удаление данных пользователя
  async deleteData() {
    try {
      if (this.currentUser && this.isOnline) {
        await this.db.collection('users').doc(this.currentUser.uid).delete();
        console.log('✅ Данные пользователя удалены');
        return { success: true };
      }
      return { success: false, error: 'Нет подключения или пользователь не авторизован' };
    } catch (error) {
      console.error('Ошибка удаления данных:', error);
      return { success: false, error: error.message };
    }
  }

  // Проверка соединения
  checkConnection() {
    return this.isOnline;
  }

  // Мгновенное обновление отображения ключей
  updateBossAvailabilityImmediately(keys) {
    if (!keys || typeof keys !== 'object') return;

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

  // =================== МЕТОДЫ ДЛЯ СИСТЕМЫ ДРУЗЕЙ ===================

  // Отправка заявки в друзья
  async sendFriendRequest(targetTelegramId, message = '') {
    try {
      if (!this.currentUser || !this.isOnline) {
        console.warn('⚠️ Нет подключения к интернету');
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

      // Преобразуем ID с учетом больших чисел
      const currentId = this.safeParseTelegramId(currentTelegramId);
      const targetId = this.safeParseTelegramId(targetTelegramId);

      // Проверяем, не пытаемся ли добавить самого себя
      if (String(currentId) === String(targetId)) {
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

      console.log('✅ Заявка в друзья отправлена успешно');
      return { success: true };
    } catch (error) {
      console.error('❌ Ошибка отправки заявки:', error);
      return {
        success: false,
        error: 'Ошибка отправки заявки: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Получение заявок в друзья
  async getFriendRequests() {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { incoming: [], outgoing: [] };
      }

      // Входящие заявки
      const incomingRequestsQuery = this.db.collection('friendRequests')
        .where('toUser', '==', this.currentUser.uid)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc');

      const incomingRequests = await incomingRequestsQuery.get();

      // Исходящие заявки
      const outgoingRequestsQuery = this.db.collection('friendRequests')
        .where('fromUser', '==', this.currentUser.uid)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc');

      const outgoingRequests = await outgoingRequestsQuery.get();

      return {
        incoming: incomingRequests.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        })),
        outgoing: outgoingRequests.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        }))
      };
    } catch (error) {
      console.error('❌ Ошибка получения заявок:', error);
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
        console.log('✅ Заявка принята');
        return { success: true };
      } else {
        // Отклоняем заявку
        await requestRef.update({
          status: 'rejected',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Заявка отклонена');
        return { success: true };
      }
    } catch (error) {
      console.error('❌ Ошибка обработки заявки:', error);
      return {
        success: false,
        error: 'Ошибка обработки заявки: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Добавление друзей в коллекцию дружбы
  async addFriend(userId1, userId2) {
    try {
      // Проверяем, не существует ли уже дружба
      const friendshipQuery = this.db.collection('friendships')
        .where('user1', 'in', [userId1, userId2])
        .where('user2', 'in', [userId1, userId2])
        .limit(1)
        .get();

      const friendships = await friendshipQuery;

      if (!friendships.empty) {
        console.log('⚠️ Дружба уже существует');
        return true;
      }

      // Создаем связь дружбы
      await this.db.collection('friendships').add({
        user1: userId1,
        user2: userId2,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Друзья добавлены');
      return true;
    } catch (error) {
      console.error('❌ Ошибка добавления друзей:', error);
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

      // Получаем данные друзей (ограничиваем 20 друзьями)
      const friends = [];
      const friendArray = Array.from(friendIds).slice(0, 20);

      const friendPromises = friendArray.map(async (friendId) => {
        try {
          const friendDoc = await this.db.collection('users').doc(friendId).get();
          if (friendDoc.exists) {
            const friendData = friendDoc.data();
            const lastOnline = friendData.lastActive || friendData.lastSaved;

            friends.push({
              id: friendId,
              telegramId: friendData.telegramId,
              username: friendData.username || `Игрок ${friendData.telegramId || 'Неизвестно'}`,
              level: friendData.level || 1,
              honey: friendData.honey || 0,
              xp: friendData.xp || 0,
              lastOnline: lastOnline,
              onlineStatus: this.getOnlineStatus(lastOnline)
            });
          }
        } catch (error) {
          console.error(`❌ Ошибка загрузки данных друга ${friendId}:`, error);
        }
      });

      await Promise.all(friendPromises);

      // Сортируем по статусу (онлайн первые)
      return friends.sort((a, b) => {
        const statusOrder = { online: 0, away: 1, offline: 2 };
        return (statusOrder[a.onlineStatus] || 3) - (statusOrder[b.onlineStatus] || 3);
      });
    } catch (error) {
      console.error('❌ Ошибка получения друзей:', error);
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
      console.error('❌ Ошибка подсчета друзей:', error);
      return 0;
    }
  }

  // Удаление друга
  async removeFriend(friendId) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

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

        console.log('✅ Друг удален');
        return { success: true };
      }

      return { success: false, error: 'Дружба не найдена' };
    } catch (error) {
      console.error('❌ Ошибка удаления друга:', error);
      return { success: false, error: error.message };
    }
  }

  // Получение статуса онлайн
  getOnlineStatus(lastOnline) {
    if (!lastOnline) return 'offline';

    const now = Date.now();
    let lastOnlineTime;

    if (lastOnline.toDate) {
      lastOnlineTime = lastOnline.toDate().getTime();
    } else if (lastOnline instanceof Date) {
      lastOnlineTime = lastOnline.getTime();
    } else if (typeof lastOnline === 'number') {
      lastOnlineTime = lastOnline;
    } else {
      return 'offline';
    }

    const minutesAgo = (now - lastOnlineTime) / (1000 * 60);

    if (minutesAgo < 5) return 'online';
    if (minutesAgo < 15) return 'away';
    return 'offline';
  }

  // =================== МЕТОДЫ ДЛЯ СИСТЕМЫ ГИЛЬДИЙ ===================

  // Создание гильдии
  async createGuild(guildName, description = '') {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Валидация названия
      const trimmedName = guildName.trim();
      if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 30) {
        return { success: false, error: 'Название гильдии должно быть от 3 до 30 символов' };
      }

      // Проверяем, состоит ли уже пользователь в гильдии
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      const userData = userDoc.data();

      if (userData.guildId) {
        return { success: false, error: 'Вы уже состоите в гильдии' };
      }

      // Проверяем уникальность названия
      const guildsSnapshot = await this.db.collection('guilds')
        .where('name', '==', trimmedName)
        .limit(1)
        .get();

      if (!guildsSnapshot.empty) {
        return { success: false, error: 'Гильдия с таким названием уже существует' };
      }

      // Получаем Telegram ID пользователя для отображения
      const telegramId = userData.telegramId;
      const username = userData.username || `Игрок ${telegramId}`;
      const level = userData.level || 1;
      const honey = userData.honey || 0;
      const xp = userData.xp || 0;

      // Создаем гильдию
      const guildRef = await this.db.collection('guilds').add({
        name: trimmedName,
        description: description.trim(),
        level: 1,
        rating: 0,
        members: [this.currentUser.uid],
        memberCount: 1,
        leader: this.currentUser.uid,
        leaderName: username,
        leaderTelegramId: telegramId,
        leaderLevel: level,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        totalHoney: honey,
        totalXP: xp,
        averageLevel: level
      });

      // Обновляем данные пользователя
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildId: guildRef.id,
        guildName: trimmedName,
        guildJoinDate: firebase.firestore.FieldValue.serverTimestamp(),
        guildRole: 'leader'
      });

      // Добавляем запись в историю гильдии
      await this.db.collection('guildHistory').add({
        guildId: guildRef.id,
        userId: this.currentUser.uid,
        userName: username,
        action: 'create',
        details: `Создана гильдия "${trimmedName}"`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Гильдия создана:', guildRef.id);
      return { success: true, guildId: guildRef.id, guildName: trimmedName };
    } catch (error) {
      console.error('❌ Ошибка создания гильдии:', error);
      return {
        success: false,
        error: 'Ошибка создания гильдии: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Получение списка гильдий
  async getGuilds(sortBy = 'rating', limit = 50) {
    try {
      if (!this.isOnline) return [];

      let query = this.db.collection('guilds');

      // Сортируем по выбранному параметру
      switch (sortBy) {
        case 'rating':
          query = query.orderBy('rating', 'desc');
          break;
        case 'level':
          query = query.orderBy('averageLevel', 'desc');
          break;
        case 'members':
          query = query.orderBy('memberCount', 'desc');
          break;
        case 'honey':
          query = query.orderBy('totalHoney', 'desc');
          break;
        case 'created':
          query = query.orderBy('createdAt', 'desc');
          break;
        default:
          query = query.orderBy('rating', 'desc');
      }

      query = query.limit(Math.min(limit, 100));
      const snapshot = await query.get();

      const guilds = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        guilds.push({
          id: doc.id,
          name: data.name,
          description: data.description || '',
          level: data.level || 1,
          rating: data.rating || 0,
          memberCount: data.memberCount || 0,
          totalMembers: data.memberCount || 0,
          totalHoney: data.totalHoney || 0,
          totalXP: data.totalXP || 0,
          averageLevel: data.averageLevel || 1,
          leaderName: data.leaderName || 'Неизвестно',
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date()
        });
      });

      return guilds;
    } catch (error) {
      console.error('❌ Ошибка получения списка гильдий:', error);
      return [];
    }
  }

  // Поиск гильдий по названию
  async searchGuilds(searchText, limit = 20) {
    try {
      if (!this.isOnline || !searchText || searchText.trim().length < 2) {
        return await this.getGuilds('rating', limit);
      }

      // Получаем все гильдии и фильтруем на клиенте
      const allGuilds = await this.getGuilds('rating', 100);
      const searchLower = searchText.toLowerCase().trim();

      return allGuilds.filter(guild =>
        guild.name.toLowerCase().includes(searchLower) ||
        (guild.description && guild.description.toLowerCase().includes(searchLower)) ||
        (guild.leaderName && guild.leaderName.toLowerCase().includes(searchLower))
      ).slice(0, limit);
    } catch (error) {
      console.error('❌ Ошибка поиска гильдий:', error);
      return [];
    }
  }

  // Вступление в гильдию
  async joinGuild(guildId) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Проверяем, состоит ли уже пользователь в гильдии
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      const userData = userDoc.data();

      if (userData.guildId) {
        return { success: false, error: 'Вы уже состоите в гильдии' };
      }

      // Получаем данные гильдии
      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();

      // Проверяем, есть ли свободные места
      if (guildData.memberCount >= this.MAX_GUILD_MEMBERS) {
        return { success: false, error: 'В гильдии нет свободных мест (максимум 20 участников)' };
      }

      // Получаем данные пользователя
      const telegramId = userData.telegramId;
      const username = userData.username || `Игрок ${telegramId}`;
      const level = userData.level || 1;
      const honey = userData.honey || 0;
      const xp = userData.xp || 0;

      // Рассчитываем новое среднее значение уровня
      const currentTotalLevel = (guildData.averageLevel || 1) * (guildData.memberCount || 1);
      const newAverageLevel = (currentTotalLevel + level) / (guildData.memberCount + 1);

      // Обновляем гильдию
      await this.db.collection('guilds').doc(guildId).update({
        members: firebase.firestore.FieldValue.arrayUnion(this.currentUser.uid),
        memberCount: firebase.firestore.FieldValue.increment(1),
        totalHoney: firebase.firestore.FieldValue.increment(honey),
        totalXP: firebase.firestore.FieldValue.increment(xp),
        averageLevel: newAverageLevel,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Обновляем пользователя
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildId: guildId,
        guildName: guildData.name,
        guildJoinDate: firebase.firestore.FieldValue.serverTimestamp(),
        guildRole: 'member'
      });

      // Добавляем запись в историю гильдии
      await this.db.collection('guildHistory').add({
        guildId: guildId,
        userId: this.currentUser.uid,
        userName: username,
        action: 'join',
        details: `${username} вступил в гильдию`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Пользователь вступил в гильдию:', guildId);
      return { success: true, guildName: guildData.name };
    } catch (error) {
      console.error('❌ Ошибка вступления в гильдию:', error);
      return {
        success: false,
        error: 'Ошибка вступления в гильдию: ' + (error.message || 'Неизвестная ошибка')
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
      const userData = userDoc.data();

      if (!userData.guildId) {
        return { success: false, error: 'Вы не состоите в гильдии' };
      }

      const guildId = userData.guildId;
      const guildName = userData.guildName;

      // Получаем данные гильдии
      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();
      const userLevel = userData.level || 1;
      const userHoney = userData.honey || 0;
      const userXP = userData.xp || 0;
      const username = userData.username || `Игрок ${userData.telegramId}`;

      // Если пользователь - лидер, нужно передать лидерство или распустить гильдию
      if (guildData.leader === this.currentUser.uid) {
        // Если в гильдии больше одного участника, нужно передать лидерство
        if (guildData.memberCount > 1) {
          return {
            success: false,
            error: 'Вы лидер гильдии. Сначала передайте лидерство другому участнику.'
          };
        } else {
          // Если пользователь один в гильдии, можно распустить
          return await this.disbandGuild();
        }
      }

      // Рассчитываем новое среднее значение уровня
      const currentTotalLevel = (guildData.averageLevel || 1) * (guildData.memberCount || 1);
      const newMemberCount = guildData.memberCount - 1;
      const newAverageLevel = newMemberCount > 0
        ? (currentTotalLevel - userLevel) / newMemberCount
        : 0;

      // Удаляем пользователя из гильдии
      await this.db.collection('guilds').doc(guildId).update({
        members: firebase.firestore.FieldValue.arrayRemove(this.currentUser.uid),
        memberCount: firebase.firestore.FieldValue.increment(-1),
        totalHoney: firebase.firestore.FieldValue.increment(-userHoney),
        totalXP: firebase.firestore.FieldValue.increment(-userXP),
        averageLevel: newAverageLevel,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Обновляем пользователя
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildId: null,
        guildName: null,
        guildJoinDate: null,
        guildRole: null
      });

      // Добавляем запись в историю
      await this.db.collection('guildHistory').add({
        guildId: guildId,
        userId: this.currentUser.uid,
        userName: username,
        action: 'leave',
        details: `${username} покинул гильдию`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Пользователь вышел из гильдии:', guildId);
      return { success: true, guildName: guildName };
    } catch (error) {
      console.error('❌ Ошибка выхода из гильдии:', error);
      return {
        success: false,
        error: 'Ошибка выхода из гильдии: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Распускание гильдии (только для лидера)
  async disbandGuild() {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      const userData = userDoc.data();

      if (!userData.guildId) {
        return { success: false, error: 'Вы не состоите в гильдии' };
      }

      const guildId = userData.guildId;
      const guildName = userData.guildName;

      // Получаем данные гильдии
      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();

      // Проверяем, является ли пользователь лидером
      if (guildData.leader !== this.currentUser.uid) {
        return { success: false, error: 'Только лидер может распустить гильдию' };
      }

      // Получаем всех участников гильдии
      const members = guildData.members || [];
      const username = userData.username || `Игрок ${userData.telegramId}`;

      // Проверяем количество операций для batch
      if (members.length > 400) { // Оставляем запас для других операций
        return {
          success: false,
          error: 'Слишком много участников для удаления за одну операцию'
        };
      }

      // Создаем batch для массовых операций
      const batch = this.db.batch();

      // Обновляем всех участников (убираем гильдию)
      members.forEach(memberId => {
        const memberRef = this.db.collection('users').doc(memberId);
        batch.update(memberRef, {
          guildId: null,
          guildName: null,
          guildJoinDate: null,
          guildRole: null
        });
      });

      // Добавляем запись в историю
      const historyRef = this.db.collection('guildHistory').doc();
      batch.set(historyRef, {
        guildId: guildId,
        guildName: guildName,
        userId: this.currentUser.uid,
        userName: username,
        action: 'disband',
        details: `Гильдия "${guildName}" распущена лидером ${username}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Удаляем гильдию
      const guildRef = this.db.collection('guilds').doc(guildId);
      batch.delete(guildRef);

      // Выполняем все операции
      await batch.commit();

      console.log('✅ Гильдия распущена:', guildId);
      return { success: true, guildName: guildName };
    } catch (error) {
      console.error('❌ Ошибка роспуска гильдии:', error);
      return {
        success: false,
        error: 'Ошибка роспуска гильдии: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Получение информации о гильдии
  async getGuildInfo(guildId = null) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return null;
      }

      // Если guildId не указан, получаем гильдию пользователя
      if (!guildId) {
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        const userData = userDoc.data();
        guildId = userData.guildId;

        if (!guildId) {
          return null;
        }
      }

      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return null;
      }

      const guildData = guildDoc.data();

      // Получаем информацию об участниках (ограничиваем 20 участниками)
      const membersInfo = [];
      const members = guildData.members || [];
      const membersToFetch = members.slice(0, 20);

      // Используем Promise.all для параллельных запросов
      const memberPromises = membersToFetch.map(async (memberId) => {
        try {
          const memberDoc = await this.db.collection('users').doc(memberId).get();
          if (memberDoc.exists) {
            const memberData = memberDoc.data();
            const lastOnline = memberData.lastActive || memberData.lastSaved;

            return {
              id: memberId,
              telegramId: memberData.telegramId,
              username: memberData.username || `Игрок ${memberData.telegramId}`,
              level: memberData.level || 1,
              honey: memberData.honey || 0,
              xp: memberData.xp || 0,
              isLeader: guildData.leader === memberId,
              role: memberData.guildRole || (guildData.leader === memberId ? 'leader' : 'member'),
              lastOnline: lastOnline,
              onlineStatus: this.getOnlineStatus(lastOnline),
              joinDate: memberData.guildJoinDate ? memberData.guildJoinDate.toDate() : null
            };
          }
        } catch (error) {
          console.error('❌ Ошибка получения данных участника:', error);
        }
        return null;
      });

      const membersData = await Promise.all(memberPromises);
      membersData.forEach(member => {
        if (member) membersInfo.push(member);
      });

      // Сортируем: лидер первый, затем по статусу, затем по уровню
      membersInfo.sort((a, b) => {
        if (a.isLeader && !b.isLeader) return -1;
        if (!a.isLeader && b.isLeader) return 1;

        const statusOrder = { online: 0, away: 1, offline: 2 };
        const statusA = statusOrder[a.onlineStatus] || 3;
        const statusB = statusOrder[b.onlineStatus] || 3;

        if (statusA !== statusB) return statusA - statusB;

        return (b.level || 1) - (a.level || 1);
      });

      return {
        id: guildDoc.id,
        name: guildData.name,
        description: guildData.description || '',
        level: guildData.level || 1,
        rating: guildData.rating || 0,
        memberCount: guildData.memberCount || 0,
        totalMembers: guildData.memberCount || 0,
        totalHoney: guildData.totalHoney || 0,
        totalXP: guildData.totalXP || 0,
        averageLevel: guildData.averageLevel || 1,
        leaderId: guildData.leader,
        leaderName: guildData.leaderName || 'Неизвестно',
        leaderTelegramId: guildData.leaderTelegramId,
        membersInfo: membersInfo,
        createdAt: guildData.createdAt ? guildData.createdAt.toDate() : null,
        updatedAt: guildData.updatedAt ? guildData.updatedAt.toDate() : null,
        isLeader: guildData.leader === this.currentUser.uid
      };
    } catch (error) {
      console.error('❌ Ошибка получения информации о гильдии:', error);
      return null;
    }
  }

  // Передача лидерства в гильдии
  async transferGuildLeadership(newLeaderId) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Получаем данные гильдии пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      const userData = userDoc.data();

      if (!userData.guildId) {
        return { success: false, error: 'Вы не состоите в гильдии' };
      }

      const guildId = userData.guildId;

      // Получаем данные гильдии
      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();

      // Проверяем, является ли пользователь текущим лидером
      if (guildData.leader !== this.currentUser.uid) {
        return { success: false, error: 'Только текущий лидер может передать лидерство' };
      }

      // Проверяем, что новый лидер состоит в гильдии
      if (!guildData.members.includes(newLeaderId)) {
        return { success: false, error: 'Новый лидер должен состоять в гильдии' };
      }

      // Получаем данные нового лидера
      const newLeaderDoc = await this.db.collection('users').doc(newLeaderId).get();
      if (!newLeaderDoc.exists) {
        return { success: false, error: 'Новый лидер не найден' };
      }

      const newLeaderData = newLeaderDoc.data();
      const newLeaderName = newLeaderData.username || `Игрок ${newLeaderData.telegramId}`;

      // Обновляем гильдию
      await this.db.collection('guilds').doc(guildId).update({
        leader: newLeaderId,
        leaderName: newLeaderName,
        leaderTelegramId: newLeaderData.telegramId,
        leaderLevel: newLeaderData.level || 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Обновляем роли участников
      await this.db.collection('users').doc(this.currentUser.uid).update({
        guildRole: 'member'
      });

      await this.db.collection('users').doc(newLeaderId).update({
        guildRole: 'leader'
      });

      // Добавляем запись в историю
      await this.db.collection('guildHistory').add({
        guildId: guildId,
        guildName: guildData.name,
        userId: this.currentUser.uid,
        userName: userData.username || `Игрок ${userData.telegramId}`,
        targetUserId: newLeaderId,
        targetUserName: newLeaderName,
        action: 'transfer_leadership',
        details: `${userData.username} передал лидерство ${newLeaderName}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Лидерство передано пользователю:', newLeaderId);
      return { success: true, newLeaderName: newLeaderName };
    } catch (error) {
      console.error('❌ Ошибка передачи лидерства:', error);
      return {
        success: false,
        error: 'Ошибка передачи лидерства: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }

  // Получение истории гильдии
  async getGuildHistory(guildId = null, limit = 20) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return [];
      }

      // Если guildId не указан, получаем гильдию пользователя
      if (!guildId) {
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        const userData = userDoc.data();
        guildId = userData.guildId;

        if (!guildId) {
          return [];
        }
      }

      // Проверяем, состоит ли пользователь в этой гильдии
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      const userData = userDoc.data();

      if (userData.guildId !== guildId) {
        console.warn('⚠️ Пользователь не состоит в этой гильдии');
        return [];
      }

      const historyQuery = this.db.collection('guildHistory')
        .where('guildId', '==', guildId)
        .orderBy('timestamp', 'desc')
        .limit(limit);

      const historySnapshot = await historyQuery.get();

      const history = [];
      historySnapshot.docs.forEach(doc => {
        const data = doc.data();
        history.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
          readableTime: this.formatTimeAgo(data.timestamp ? data.timestamp.toDate() : new Date())
        });
      });

      return history;
    } catch (error) {
      console.error('❌ Ошибка получения истории гильдии:', error);
      return [];
    }
  }

  // Форматирование времени (сколько времени прошло)
  formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) {
      return `${diffDay} дн. назад`;
    } else if (diffHour > 0) {
      return `${diffHour} ч. назад`;
    } else if (diffMin > 0) {
      return `${diffMin} мин. назад`;
    } else {
      return 'Только что';
    }
  }

  // Кик участника из гильдии (только для лидера)
  async kickGuildMember(memberId) {
    try {
      if (!this.currentUser || !this.isOnline) {
        return { success: false, error: 'Нет подключения к интернету' };
      }

      // Нельзя кикнуть себя
      if (memberId === this.currentUser.uid) {
        return { success: false, error: 'Нельзя исключить самого себя' };
      }

      // Получаем данные гильдии пользователя
      const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
      const userData = userDoc.data();

      if (!userData.guildId) {
        return { success: false, error: 'Вы не состоите в гильдии' };
      }

      const guildId = userData.guildId;

      // Получаем данные гильдии
      const guildDoc = await this.db.collection('guilds').doc(guildId).get();
      if (!guildDoc.exists) {
        return { success: false, error: 'Гильдия не найдена' };
      }

      const guildData = guildDoc.data();

      // Проверяем, является ли пользователь лидером
      if (guildData.leader !== this.currentUser.uid) {
        return { success: false, error: 'Только лидер может исключать участников' };
      }

      // Проверяем, что участник состоит в гильдии
      if (!guildData.members.includes(memberId)) {
        return { success: false, error: 'Участник не состоит в гильдии' };
      }

      // Получаем данные исключаемого участника
      const memberDoc = await this.db.collection('users').doc(memberId).get();
      if (!memberDoc.exists) {
        return { success: false, error: 'Участник не найден' };
      }

      const memberData = memberDoc.data();
      const memberName = memberData.username || `Игрок ${memberData.telegramId}`;
      const memberLevel = memberData.level || 1;
      const memberHoney = memberData.honey || 0;
      const memberXP = memberData.xp || 0;

      // Рассчитываем новое среднее значение уровня
      const currentTotalLevel = (guildData.averageLevel || 1) * (guildData.memberCount || 1);
      const newMemberCount = guildData.memberCount - 1;
      const newAverageLevel = newMemberCount > 0
        ? (currentTotalLevel - memberLevel) / newMemberCount
        : 0;

      // Удаляем участника из гильдии
      await this.db.collection('guilds').doc(guildId).update({
        members: firebase.firestore.FieldValue.arrayRemove(memberId),
        memberCount: firebase.firestore.FieldValue.increment(-1),
        totalHoney: firebase.firestore.FieldValue.increment(-memberHoney),
        totalXP: firebase.firestore.FieldValue.increment(-memberXP),
        averageLevel: newAverageLevel,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Обновляем данные исключенного участника
      await this.db.collection('users').doc(memberId).update({
        guildId: null,
        guildName: null,
        guildJoinDate: null,
        guildRole: null
      });

      // Добавляем запись в историю
      await this.db.collection('guildHistory').add({
        guildId: guildId,
        guildName: guildData.name,
        userId: this.currentUser.uid,
        userName: userData.username || `Игрок ${userData.telegramId}`,
        targetUserId: memberId,
        targetUserName: memberName,
        action: 'kick',
        details: `${memberName} исключен из гильдии`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Участник исключен из гильдии:', memberId);
      return { success: true, memberName: memberName };
    } catch (error) {
      console.error('❌ Ошибка исключения участника:', error);
      return {
        success: false,
        error: 'Ошибка исключения участника: ' + (error.message || 'Неизвестная ошибка')
      };
    }
  }
}

// Создаем глобальный экземпляр
window.firebaseManager = new FirebaseManager();
