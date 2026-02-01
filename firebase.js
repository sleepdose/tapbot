// firebase.js - Firebase инициализация и управление данными (версия 8)

class FirebaseManager {
  constructor() {
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.isOnline = true;
    // Убрано локальное сохранение
    this.saveQueue = [];
    this.isSaving = false;

    // Конфигурация Firebase (ваши данные)
    this.firebaseConfig = {
      apiKey: "AIzaSyAhzdARqvqC4a6zCaXUVoO9Ij94mtoNha0",
      authDomain: "hiko-ca02d.firebaseapp.com",
      projectId: "hiko-ca02d",
      storageBucket: "hiko-ca02d.firebasestorage.app",
      messagingSenderId: "100480722325",
      appId: "1:100480722325:web:781a1fb54807b047e1829c",
      measurementId: "G-3E97NRDJTD"
    };

    // Инициализация Firebase (версия 8)
    this.init().catch(console.error);
  }

  async init() {
    try {
      console.log('Инициализация Firebase...');

      // Проверяем, подключены ли скрипты Firebase
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase не загружен. Проверьте подключение скриптов.');
      }

      // Инициализируем Firebase (версия 8)
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }

      this.db = firebase.firestore();
      this.auth = firebase.auth();

      // Отключаем оффлайн-режим (только онлайн работа)
      try {
        // Не включаем персистентность для оффлайн режима
        console.log('Работа только в онлайн режиме');
      } catch (err) {
        console.warn('Firestore инициализация:', err);
      }

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

  // Аутентификация пользователя
  async authenticate() {
    try {
      // Пробуем анонимную аутентификацию
      const userCredential = await this.auth.signInAnonymously();
      this.currentUser = userCredential.user;

      console.log('Пользователь авторизован:', this.currentUser.uid);

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

  // Сохранение данных игры (ТОЛЬКО ПРИ НАЛИЧИИ ИНТЕРНЕТА)
  async saveGameData(gameState) {
    try {
      if (!this.currentUser || !this.isOnline) {
        console.warn('Нет подключения к интернету. Данные не сохранены.');
        return false;
      }

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
        version: '1.0.0',
        telegramId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null
      };

      // Сохраняем в Firebase
      await this.db.collection('users').doc(this.currentUser.uid).set(dataToSave, { merge: true });

      console.log('Данные сохранены в Firebase');
      return true;
    } catch (error) {
      console.error('Ошибка сохранения в Firebase:', error);
      return false;
    }
  }

  // Загрузка данных игры (ТОЛЬКО ИЗ FIREBASE)
  async loadGameData() {
    try {
      // Пробуем загрузить из Firebase
      if (this.currentUser && this.isOnline) {
        const doc = await this.db.collection('users').doc(this.currentUser.uid).get();

        if (doc.exists) {
          const data = doc.data();
          console.log('Данные загружены из Firebase');
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

      // При ошибке загрузки возвращаем новый профиль
      return {
        success: false,
        data: null,
        source: 'error'
      };
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

// Создаем глобальный экземпляр
window.firebaseManager = new FirebaseManager();
