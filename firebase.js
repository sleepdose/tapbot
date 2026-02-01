// firebase.js - Firebase инициализация и управление данными (версия 8)

class FirebaseManager {
  constructor() {
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.isOnline = true;
    this.localSaveKey = 'aiko_tapbot_local_save';
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

      // Настраиваем настройки Firestore для оффлайн-работы
      try {
        await this.db.enablePersistence();
      } catch (err) {
        console.warn('Оффлайн режим недоступен:', err);
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
          this.syncLocalData(); // Синхронизируем локальные данные
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

  // Сохранение данных игры
  async saveGameData(gameState) {
    try {
      if (!this.currentUser || !this.isOnline) {
        // Сохраняем локально, если нет соединения
        this.saveLocal(gameState);
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

      // Также сохраняем локально для резервной копии
      this.saveLocal(dataToSave);

      return true;
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      this.saveLocal(gameState); // Сохраняем локально при ошибке
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

          // Сохраняем локально как кэш
          this.saveLocal(data);

          return {
            success: true,
            data: data,
            source: 'firebase'
          };
        }
      }

      // Если нет данных в Firebase, пробуем локальные
      const localData = this.loadLocal();
      if (localData) {
        console.log('Данные загружены из локального хранилища');
        return {
          success: true,
          data: localData,
          source: 'local'
        };
      }

      // Если данных нет вообще
      console.log('Нет сохраненных данных, используется новый профиль');
      return {
        success: false,
        data: null,
        source: 'new'
      };
    } catch (error) {
      console.error('Ошибка загрузки:', error);

      // Пробуем локальные данные при ошибке
      const localData = this.loadLocal();
      if (localData) {
        return {
          success: true,
          data: localData,
          source: 'local'
        };
      }

      return {
        success: false,
        data: null,
        source: 'error'
      };
    }
  }

  // Локальное сохранение (LocalStorage)
  saveLocal(data) {
    try {
      const saveData = {
        ...data,
        savedAt: Date.now(),
        offline: true
      };

      localStorage.setItem(this.localSaveKey, JSON.stringify(saveData));
    } catch (error) {
      console.error('Ошибка локального сохранения:', error);
    }
  }

  // Локальная загрузка
  loadLocal() {
    try {
      const saved = localStorage.getItem(this.localSaveKey);
      if (saved) {
        const data = JSON.parse(saved);
        // Удаляем временные поля
        delete data.savedAt;
        delete data.offline;
        return data;
      }
      return null;
    } catch (error) {
      console.error('Ошибка загрузки из локального хранилища:', error);
      return null;
    }
  }

  // Синхронизация локальных данных с Firebase
  async syncLocalData() {
    try {
      const localData = this.loadLocal();
      if (localData && this.currentUser) {
        // Загружаем данные из Firebase
        const remoteDoc = await this.db.collection('users').doc(this.currentUser.uid).get();

        if (remoteDoc.exists) {
          const remoteData = remoteDoc.data();
          const localTimestamp = localData.savedAt || 0;
          const remoteTimestamp = remoteData.lastSaved?.toMillis?.() || 0;

          // Используем более свежие данные
          if (remoteTimestamp > localTimestamp) {
            console.log('Используем данные из Firebase (более свежие)');
            return remoteData;
          } else {
            console.log('Используем локальные данные (более свежие)');
            await this.saveGameData(localData); // Обновляем Firebase
            return localData;
          }
        } else {
          // Если в Firebase нет данных, сохраняем локальные
          await this.saveGameData(localData);
          return localData;
        }
      }
    } catch (error) {
      console.error('Ошибка синхронизации:', error);
    }

    return null;
  }

  // Удаление данных
  async deleteData() {
    try {
      if (this.currentUser) {
        await this.db.collection('users').doc(this.currentUser.uid).delete();
      }
      localStorage.removeItem(this.localSaveKey);
      return true;
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
