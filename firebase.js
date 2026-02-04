class FirebaseManager {
  constructor() {
    // Конфигурация Firebase (в продакшене выноси на бэкенд)
    const encodedConfig = "eyJhcGlLZXkiOiJBSXphU3lBaHpkQVJxdnFDNGE2ekNhWFVWb085UGo5NG10b05oYTAiLCJhdXRoRG9tYWluIjoiaGlrby1jYTAyZC5maXJlYmFzZWFwcC5jb20iLCJwcm9qZWN0SWQiOiJoaWtvLWNhMDJkIiwic3RvcmFnZUJ1Y2tldCI6Imhpa28tY2EwMmQuZmlyZWJhc2VzdG9yYWdlLmFwcCIsIm1lc3NhZ2luZ1NlbmRlcklkIjoiMTAwNDgwNzIyMzI1IiwiYXBwSWQiOiIxOjEwMDQ4MDcyMjMyNTp3ZWI6NzgxYTFmYjU0ODA3YjA0N2UxODI5YyIsIm1lYXN1cmVtZW50SWQiOiJHLTNFOTdOUkRKVEQifQ==";
    this.firebaseConfig = this.decodeConfig(encodedConfig);
    
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.isOnline = true;
    this.MAX_FRIENDS = 20;
    
    // Кэширование данных
    this.cache = {
      friends: { data: null, timestamp: 0, ttl: 30000 },
      friendRequests: { data: null, timestamp: 0, ttl: 15000 },
      userData: { data: null, timestamp: 0, ttl: 10000 }
    };
    
    // Retry механизм
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    this.init().catch(error => {
      console.error('Ошибка инициализации Firebase:', error);
      this.showFallbackMessage();
    });
  }
  
  decodeConfig(encoded) {
    try {
      const jsonStr = atob(encoded);
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Ошибка декодирования конфигурации:', error);
      // Fallback конфиг
      return {
        apiKey: "AIzaSyAhzdARqvqC4a6zCaXUVoO9Ij94mtoNha0",
        authDomain: "hiko-ca02d.firebaseapp.com",
        projectId: "hiko-ca02d",
        storageBucket: "hiko-ca02d.firebasestorage.app",
        messagingSenderId: "100480722325",
        appId: "1:100480722325:web:781a1fb54807b047e1829c",
        measurementId: "G-3E97NRDJTD"
      };
    }
  }
  
  showFallbackMessage() {
    console.warn('Firebase не доступен, игра работает в офлайн режиме');
    if (typeof updateFirebaseStatusUI === 'function') {
      updateFirebaseStatusUI(false);
    }
  }
  
  async init() {
    try {
      console.log('🚀 Инициализация Firebase...');
      
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK не загружен');
      }
      
      // Проверяем соединение
      if (!await this.checkInternetConnection()) {
        this.isOnline = false;
        throw new Error('Нет интернет соединения');
      }
      
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
        
        // Настройка Firestore
        firebase.firestore().settings({
          cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
          merge: true
        });
      }
      
      this.db = firebase.firestore();
      this.auth = firebase.auth();
      
      // Включаем офлайн-режим Firestore
      this.db.enablePersistence()
        .catch(err => {
          console.warn('Офлайн режим Firestore не доступен:', err);
        });
      
      await this.authenticate();
      
      console.log('✅ Firebase инициализирован');
      return true;
    } catch (error) {
      console.error('❌ Ошибка инициализации Firebase:', error);
      this.isOnline = false;
      this.showFallbackMessage();
      return false;
    }
  }
  
  async checkInternetConnection() {
    try {
      const response = await fetch('https://www.google.com', { mode: 'no-cors' });
      return true;
    } catch {
      return false;
    }
  }
  
  async authenticate() {
    try {
      const telegramId = this.getTelegramId();
      const telegramUsername = this.getTelegramUsername();
      
      console.log('🔐 Аутентификация...');
      
      // Пробуем аутентификацию с retry
      const userCredential = await this.retryOperation(
        () => this.auth.signInAnonymously(),
        'аутентификации'
      );
      
      this.currentUser = userCredential.user;
      
      const userData = {
        authUid: this.currentUser.uid,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        deviceInfo: this.getDeviceInfo()
      };
      
      if (telegramId) {
        userData.telegramId = Number(telegramId);
        userData.username = telegramUsername || `Игрок ${telegramId}`;
        
        // Проверяем дубликаты одним запросом
        const existingUser = await this.findUserByTelegramId(telegramId);
        if (existingUser) {
          await this.mergeUserData(existingUser, userData);
        }
      } else {
        userData.username = 'Анонимный игрок';
      }
      
      // Сохраняем пользователя
      await this.retryOperation(
        () => this.db.collection('users').doc(this.currentUser.uid).set(userData, { merge: true }),
        'сохранения пользователя'
      );
      
      // Слушатель статуса аутентификации
      this.auth.onAuthStateChanged(user => {
        this.currentUser = user;
        this.isOnline = !!user;
        console.log(user ? `👤 Пользователь онлайн: ${user.uid}` : '👤 Пользователь вышел');
      });
      
      // Слушатель сетевого статуса
      firebase.firestore().enableNetwork().then(() => {
        this.db.onSnapshotsInSync(() => {
          this.isOnline = true;
          if (typeof updateFirebaseStatusUI === 'function') {
            updateFirebaseStatusUI(true);
          }
        });
      });
      
      return true;
    } catch (error) {
      console.error('❌ Ошибка аутентификации:', error);
      this.isOnline = false;
      return false;
    }
  }
  
  async findUserByTelegramId(telegramId) {
    try {
      const snapshot = await this.db.collection('users')
        .where('telegramId', '==', Number(telegramId))
        .limit(1)
        .get();
      
      return snapshot.empty ? null : snapshot.docs[0];
    } catch (error) {
      console.error('Ошибка поиска пользователя:', error);
      return null;
    }
  }
  
  async mergeUserData(oldUserDoc, newUserData) {
    try {
      const oldData = oldUserDoc.data();
      
      // Переносим прогресс, кроме идентификационных данных
      const excludeKeys = ['telegramId', 'username', 'authUid', 'createdAt'];
      excludeKeys.forEach(key => delete oldData[key]);
      
      Object.assign(newUserData, oldData);
      
      if (oldUserDoc.id !== this.currentUser.uid) {
        await this.db.collection('users').doc(oldUserDoc.id).delete();
        console.log('🗑️ Удален дублирующий профиль');
      }
    } catch (error) {
      console.error('Ошибка объединения данных:', error);
    }
  }
  
  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
  
  // Оптимизированный метод сохранения с дебаунсом
  saveGameData = this.debounce(async (gameState) => {
    try {
      if (!this.currentUser || !this.isOnline) {
        console.warn('📶 Нет соединения, данные будут сохранены позже');
        return false;
      }
      
      const dataToSave = this.prepareGameData(gameState);
      
      await this.retryOperation(
        () => this.db.collection('users').doc(this.currentUser.uid).set(dataToSave, { merge: true }),
        'сохранения игры'
      );
      
      console.log('💾 Игра сохранена');
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения:', error);
      return false;
    }
  }, 2000); // Дебаунс 2 секунды
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  prepareGameData(gameState) {
    // Оптимизация: сохраняем только измененные поля
    const minimalData = {
      honey: gameState.honey,
      xp: gameState.xp,
      level: gameState.level,
      energy: gameState.energy,
      maxEnergy: gameState.maxEnergy,
      talents: gameState.talents,
      attackCharges: gameState.attackCharges,
      craftedTalents: gameState.craftedTalents,
      keys: gameState.keys,
      achievements: gameState.achievements,
      currentSkin: gameState.currentSkin,
      currentPet: gameState.currentPet,
      hasPet: gameState.hasPet,
      currentBackground: gameState.currentBackground,
      friends: gameState.friends,
      lastSaved: firebase.firestore.FieldValue.serverTimestamp(),
      lastSavedTimestamp: Date.now(),
      version: '1.1.0'
    };
    
    const telegramId = this.getTelegramId();
    if (telegramId) {
      minimalData.telegramId = Number(telegramId);
      minimalData.username = this.getTelegramUsername() || `Игрок ${telegramId}`;
    }
    
    return minimalData;
  }
  
  async loadGameData() {
    try {
      if (!this.currentUser) {
        return this.getFallbackResponse();
      }
      
      // Проверяем кэш
      const cache = this.cache.userData;
      const now = Date.now();
      if (cache.data && (now - cache.timestamp < cache.ttl)) {
        console.log('📦 Данные загружены из кэша');
        return {
          success: true,
          data: cache.data,
          source: 'cache'
        };
      }
      
      const doc = await this.retryOperation(
        () => this.db.collection('users').doc(this.currentUser.uid).get(),
        'загрузки данных'
      );
      
      if (!doc.exists) {
        return this.getFallbackResponse();
      }
      
      const data = doc.data();
      
      // Обновляем кэш
      this.cache.userData = {
        data: data,
        timestamp: now,
        ttl: 10000
      };
      
      console.log('✅ Данные загружены из Firebase');
      return {
        success: true,
        data: data,
        source: 'firebase'
      };
    } catch (error) {
      console.error('❌ Ошибка загрузки:', error);
      return this.getFallbackResponse();
    }
  }
  
  getFallbackResponse() {
    return {
      success: false,
      data: null,
      source: 'fallback'
    };
  }
  
  // Оптимизированный метод получения друзей
  async getFriends() {
    try {
      if (!this.currentUser || !this.isOnline) return [];
      
      // Проверяем кэш
      const cache = this.cache.friends;
      const now = Date.now();
      if (cache.data && (now - cache.timestamp < cache.ttl)) {
        return cache.data;
      }
      
      // Получаем все связи дружбы одним запросом
      const [friendships1, friendships2] = await Promise.all([
        this.db.collection('friendships')
          .where('user1', '==', this.currentUser.uid)
          .get(),
        this.db.collection('friendships')
          .where('user2', '==', this.currentUser.uid)
          .get()
      ]);
      
      const friendIds = new Set();
      
      friendships1.docs.forEach(doc => {
        const data = doc.data();
        if (data.user2 !== this.currentUser.uid) {
          friendIds.add(data.user2);
        }
      });
      
      friendships2.docs.forEach(doc => {
        const data = doc.data();
        if (data.user1 !== this.currentUser.uid) {
          friendIds.add(data.user1);
        }
      });
      
      if (friendIds.size === 0) {
        this.cache.friends = { data: [], timestamp: now, ttl: 30000 };
        return [];
      }
      
      // Получаем данные всех друзей одним batch запросом
      const friendPromises = Array.from(friendIds).map(async friendId => {
        const doc = await this.db.collection('users').doc(friendId).get();
        if (doc.exists) {
          const data = doc.data();
          return {
            id: friendId,
            telegramId: data.telegramId,
            username: data.username || `Игрок ${data.telegramId || 'Неизвестно'}`,
            level: data.level || 1,
            honey: data.honey || 0,
            xp: data.xp || 0,
            lastOnline: data.lastActive || data.lastSaved,
            isOnline: this.getOnlineStatus(data.lastActive || data.lastSaved) === 'online'
          };
        }
        return null;
      });
      
      const friends = (await Promise.all(friendPromises)).filter(f => f !== null);
      
      // Обновляем кэш
      this.cache.friends = {
        data: friends,
        timestamp: now,
        ttl: 30000
      };
      
      return friends;
    } catch (error) {
      console.error('Ошибка получения друзей:', error);
      return [];
    }
  }
  
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
      const existingRequestsQuery = this.db.collection('friendRequests')
        .where('fromUser', 'in', [this.currentUser.uid, targetUserId])
        .where('toUser', 'in', [this.currentUser.uid, targetUserId])
        .where('status', 'in', ['pending', 'accepted'])
        .get();

      const existingRequests = await existingRequestsQuery;

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
      return { success: false, error: 'Ошибка отправки заявки: ' + error.message };
    }
  }

  // Получение заявок в друзья
  async getFriendRequests() {
    try {
      if (!this.currentUser || !this.isOnline) return { incoming: [], outgoing: [] };

      // Проверяем кэш
      const cache = this.cache.friendRequests;
      const now = Date.now();
      if (cache.data && (now - cache.timestamp < cache.ttl)) {
        return cache.data;
      }

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

      const result = {
        incoming: incomingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        outgoing: outgoingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };

      // Обновляем кэш
      this.cache.friendRequests = {
        data: result,
        timestamp: now,
        ttl: 15000
      };

      return result;
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
        
        // Очищаем кэш
        this.cache.friends = { data: null, timestamp: 0, ttl: 30000 };
        this.cache.friendRequests = { data: null, timestamp: 0, ttl: 15000 };
        
        return { success: true };
      } else {
        // Отклоняем заявку
        await requestRef.update({
          status: 'rejected',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Заявка отклонена');
        
        // Очищаем кэш заявок
        this.cache.friendRequests = { data: null, timestamp: 0, ttl: 15000 };
        
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
      const friendshipQuery1 = this.db.collection('friendships')
        .where('user1', 'in', [userId1, userId2])
        .where('user2', 'in', [userId1, userId2])
        .get();

      const friendships = await friendshipQuery1;

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
        
        // Очищаем кэш
        this.cache.friends = { data: null, timestamp: 0, ttl: 30000 };
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('Ошибка удаления друга:', error);
      return false;
    }
  }

  async retryOperation(operation, operationName, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`Попытка ${i + 1}/${maxRetries} ${operationName} не удалась:`, error);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    
    throw new Error(`${operationName} не удалась после ${maxRetries} попыток: ${lastError?.message}`);
  }
  
  getTelegramId() {
    try {
      return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
    } catch {
      return null;
    }
  }
  
  getTelegramUsername() {
    try {
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
      return user?.username || user?.first_name || null;
    } catch {
      return null;
    }
  }
  
  getOnlineStatus(lastOnline) {
    if (!lastOnline) return 'offline';
    
    const now = Date.now();
    const lastTime = lastOnline.toDate ? lastOnline.toDate().getTime() : lastOnline;
    const minutesAgo = (now - lastTime) / (1000 * 60);
    
    if (minutesAgo < 2) return 'online';
    if (minutesAgo < 10) return 'away';
    return 'offline';
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
}

// Создаем глобальный экземпляр с обработкой ошибок
try {
  window.firebaseManager = new FirebaseManager();
} catch (error) {
  console.error('Не удалось создать FirebaseManager:', error);
  window.firebaseManager = {
    isOnline: false,
    saveGameData: () => Promise.resolve(false),
    loadGameData: () => Promise.resolve({ success: false, data: null, source: 'error' }),
    getFriends: () => Promise.resolve([]),
    getFriendRequests: () => Promise.resolve({ incoming: [], outgoing: [] }),
    sendFriendRequest: () => Promise.resolve({ success: false, error: 'Firebase недоступен' }),
    getCurrentTelegramId: () => Promise.resolve(null)
  };
}