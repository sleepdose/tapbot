// firebase.js - Firebase инициализация и управление данными (версия 8)

class FirebaseManager {
  constructor() {
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.isOnline = true;
    this.saveQueue = [];
    this.isSaving = false;
    this.MAX_FRIENDS = 20;

    // Конфигурация Firebase
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

          // Переносим данные из старого документа (кроме telegramId и username)
          const oldData = userDoc.data();
          delete oldData.telegramId;
          delete oldData.username;
          delete oldData.authUid;
          delete oldData.createdAt;

          Object.assign(userData, oldData);

          // Удаляем старый документ если UID отличается
          if (userDoc.id !== this.currentUser.uid) {
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

  // Сохранение данных игры
  async saveGameData(gameState) {
    try {
      if (!this.currentUser || !this.isOnline || !this.db) {
        console.warn('Нет подключения к интернету. Данные не сохранены.');
        return false;
      }

      const telegramId = this.getTelegramId();
      const telegramUsername = this.getTelegramUsername();

      const dataToSave = {
        // Основные данные
        honey: gameState.honey,
        xp: gameState.xp,
        level: gameState.level,
        energy: gameState.energy,
        maxEnergy: gameState.maxEnergy,
        xpToNextLevel: gameState.xpToNextLevel,

        // Таланты
        talents: gameState.talents,
        attackCharges: gameState.attackCharges,
        craftedTalents: gameState.craftedTalents,

        // Прогресс
        keys: gameState.keys,
        achievements: gameState.achievements,

        // Кастомизация
        purchasedBackgrounds: gameState.purchasedBackgrounds,
        currentBackground: gameState.currentBackground,
        currentSkin: gameState.currentSkin,
        currentPet: gameState.currentPet,
        hasPet: gameState.hasPet,

        // Боевые данные
        activeHive: gameState.activeHive,
        purchasedHives: gameState.purchasedHives,

        // Мета-данные
        lastSaved: firebase.firestore.FieldValue.serverTimestamp(),
        lastSavedTimestamp: Date.now(), // ДОБАВЛЕНО для восстановления энергии
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        version: '1.0.0',
      };

      // Добавляем Telegram данные только если они есть
      if (telegramId) {
        dataToSave.telegramId = Number(telegramId);
        dataToSave.username = telegramUsername || `Игрок ${telegramId}`;
      }

      // Сохраняем в Firebase с обработкой ошибок записи
      await this.db.collection('users').doc(this.currentUser.uid).set(dataToSave, { merge: true });

      console.log('Данные сохранены в Firebase');
      return true;
    } catch (error) {
      console.error('Ошибка сохранения в Firebase:', error);
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
          console.log('Данные загружены из Firebase');
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

  // Отправка заявки в друзья - ИСПРАВЛЕННАЯ ВЕРСИЯ
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

      // ИСПРАВЛЕННЫЙ КОД: Разделяем на два отдельных запроса

      // Запрос 1: Проверяем, отправил ли текущий пользователь заявку целевому
      const outgoingRequest = await this.db.collection('friendRequests')
        .where('fromUser', '==', this.currentUser.uid)
        .where('toUser', '==', targetUserId)
        .where('status', 'in', ['pending', 'accepted'])
        .limit(1)
        .get();

      // Запрос 2: Проверяем, отправил ли целевой пользователь заявку текущему
      const incomingRequest = await this.db.collection('friendRequests')
        .where('fromUser', '==', targetUserId)
        .where('toUser', '==', this.currentUser.uid)
        .where('status', 'in', ['pending', 'accepted'])
        .limit(1)
        .get();

      // Объединяем результаты
      let existingRequest = null;
      if (!outgoingRequest.empty) {
        existingRequest = outgoingRequest.docs[0];
      } else if (!incomingRequest.empty) {
        existingRequest = incomingRequest.docs[0];
      }

      if (existingRequest) {
        const existingData = existingRequest.data();
        if (existingData.status === 'accepted') {
          return { success: false, error: 'Вы уже друзья с этим пользователем' };
        } else if (existingData.status === 'pending') {
          if (existingData.fromUser === this.currentUser.uid) {
            return { success: false, error: 'Вы уже отправили заявку этому пользователю' };
          } else {
            return { success: false, error: 'Этот пользователь уже отправил вам заявку' };
          }
        }
      }

      // Создаем заявку
      await this.db.collection('friendRequests').add({
        fromUser: this.currentUser.uid,
        fromTelegramId: currentTelegramId,
        fromName: currentUserData.username || `Игрок ${currentTelegramId}`,
        fromLevel: currentUserData.level || 1,
        toUser: targetUserId,
        toTelegramId: targetUserData.telegramId,
        toName: targetUserData.username || `Игрок ${targetUserData.telegramId}`,
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
        incoming: incomingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        outgoing: outgoingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };
    } catch (error) {
      console.error('Ошибка получения заявок:', error);

      // Если ошибка из-за порядка сортировки, пробуем без сортировки
      try {
        const incomingRequests = await this.db.collection('friendRequests')
          .where('toUser', '==', this.currentUser.uid)
          .where('status', '==', 'pending')
          .get();

        const outgoingRequests = await this.db.collection('friendRequests')
          .where('fromUser', '==', this.currentUser.uid)
          .where('status', '==', 'pending')
          .get();

        return {
          incoming: incomingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() })),
          outgoing: outgoingRequests.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        };
      } catch (retryError) {
        console.error('Ошибка при повторной попытке:', retryError);
        return { incoming: [], outgoing: [] };
      }
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
      // ИСПРАВЛЕННЫЙ КОД: Разделяем на два отдельных запроса

      // Запрос 1: Проверяем, где userId1 - user1, userId2 - user2
      const friendshipQuery1 = await this.db.collection('friendships')
        .where('user1', '==', userId1)
        .where('user2', '==', userId2)
        .limit(1)
        .get();

      // Запрос 2: Проверяем, где userId1 - user2, userId2 - user1
      const friendshipQuery2 = await this.db.collection('friendships')
        .where('user1', '==', userId2)
        .where('user2', '==', userId1)
        .limit(1)
        .get();

      // Объединяем результаты
      if (!friendshipQuery1.empty || !friendshipQuery2.empty) {
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
      for (const friendId of friendIds) {
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
      }

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

      // ИСПРАВЛЕННЫЙ КОД: Разделяем на два отдельных запроса

      // Запрос 1: Проверяем, где currentUser - user1
      const friendshipQuery1 = await this.db.collection('friendships')
        .where('user1', '==', this.currentUser.uid)
        .where('user2', '==', friendId)
        .limit(1)
        .get();

      // Запрос 2: Проверяем, где currentUser - user2
      const friendshipQuery2 = await this.db.collection('friendships')
        .where('user1', '==', friendId)
        .where('user2', '==', this.currentUser.uid)
        .limit(1)
        .get();

      // Объединяем результаты
      let friendshipDoc = null;
      if (!friendshipQuery1.empty) {
        friendshipDoc = friendshipQuery1.docs[0];
      } else if (!friendshipQuery2.empty) {
        friendshipDoc = friendshipQuery2.docs[0];
      }

      if (friendshipDoc) {
        await friendshipDoc.ref.delete();
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
}

// Создаем глобальный экземпляр
window.firebaseManager = new FirebaseManager();
