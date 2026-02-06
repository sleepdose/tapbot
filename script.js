// =================== ИНИЦИАЛИЗАЦИЯ И КОНСТАНТЫ ===================
'use strict';

// Структурированный логгер
const logger = {
  info: (msg, data) => console.log(`ℹ️ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`⚠️ ${msg}`, data || ''),
  error: (msg, error, data) => console.error(`❌ ${msg}`, error, data || '')
};

// Предзагрузка ресурсов
const ImagePreloader = {
  images: new Set(),

  preload(url) {
    return new Promise((resolve) => {
      if (this.images.has(url)) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.images.add(url);
        resolve();
      };
      img.onerror = () => {
        console.warn(`Не удалось загрузить: ${url}`);
        resolve();
      };
      img.src = url;
    });
  },

  async preloadAll() {
    const imageUrls = [
      'img/wasp.jpg', 'img/bear.jpg', 'img/dragon.jpg',
      'img/hydra.jpg', 'img/kraken.jpg',
      'img/human_male.png', 'img/skin2.png', 'img/skin3.png',
      'img/pet1.png', 'img/pet2.png', 'img/pet3.png',
      'img/background1.png', 'img/background2.png', 'img/background3.png'
    ];

    await Promise.all(imageUrls.map(url => this.preload(url)));
    logger.info('Все изображения предзагружены');
  }
};

// Оптимизированный менеджер состояний
class GameStateManager {
  constructor() {
    this.state = null;
    this.listeners = new Set();
  }

  setState(newState) {
    const oldState = this.state;
    this.state = { ...oldState, ...newState };
    this.notifyListeners(oldState, this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(oldState, newState) {
    this.listeners.forEach(listener => listener(oldState, newState));
  }
}

// =================== ОПТИМИЗИРОВАННЫЙ КЛАСС ИГРЫ ===================
class OptimizedGameState {
  constructor() {
    this.manager = new GameStateManager();
    this.initDefaultState();
    this.battleEffects = new Set();
    this.saveDebounceTimer = null;

    // Оптимизация производительности
    this.rafCallbacks = new Map();
    this.rafId = null;
    this.battleTimer = null;
    this.energyRecoveryInterval = null;
    this.battleResult = null;
  }

  initDefaultState() {
    this.manager.setState({
      honey: 0,
      xp: 0,
      level: 1,
      energy: 100,
      maxEnergy: 100,
      xpToNextLevel: this.calculateXPRequired(1),

      talents: {
        basic: { level: 1, damage: 10 },
        critical: { level: 1, chance: 0.2 },
        poison: { level: 1, damage: 3 }
      },

      attackCharges: {
        basic: { charges: 15, basePrice: 50 },
        critical: { charges: 15, basePrice: 75 },
        poison: { charges: 15, basePrice: 100 }
      },

      craftedTalents: {
        sonic: { level: 0, damage: 50, charges: 0 },
        fire: { level: 0, damage: 75, charges: 0 },
        ice: { level: 0, damage: 60, charges: 0 }
      },

      keys: { bear: 0, dragon: 0, hydra: 0, kraken: 0 },

      achievements: {
        waspKills: 0,
        bearKills: 0,
        completed: { level1: false, level2: false, level3: false },
        claimed: { level1: false, level2: false, level3: false },
        bearCompleted: { level1: false, level2: false, level3: false },
        bearClaimed: { level1: false, level2: false, level3: false }
      },

      purchasedBackgrounds: ['default'],
      currentBackground: 'default',
      currentSkin: 'img/human_male.png',
      currentPet: 'img/pet1.png',
      hasPet: false,
      isUsingSkin: false,

      activeHive: 'basic',
      purchasedHives: ['basic'],

      boosts: {
        battleBonus: 1.0,
        attackSpeed: 1.0,
        shield: false,
        multiclick: false
      },

      friends: [],
      friendRequests: { incoming: [], outgoing: [] },

      selectedTalent: null,
      selectedForCraft: [],

      activeBattle: null,
      battleStartTime: null,
      battleTimeLimit: null,
      currentBoss: null,
      inBattle: false,

      battleStats: {
        basicDamage: 0,
        criticalDamage: 0,
        poisonDamage: 0,
        sonicDamage: 0,
        fireDamage: 0,
        iceDamage: 0,
        totalDamage: 0
      },

      isMusicMuted: localStorage.getItem('musicMuted') === 'true',
      saveCount: 0,
      lastSaveTime: Date.now(),
      totalPlayTime: 0,
      lastAttackTime: 0
    });
  }

  get state() {
    return this.manager.state;
  }

  subscribe(listener) {
    return this.manager.subscribe(listener);
  }

  // Оптимизированное обновление UI через requestAnimationFrame
  scheduleUIUpdate(key, value) {
    if (!this.rafCallbacks.has(key)) {
      this.rafCallbacks.set(key, value);

      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          const updates = {};
          this.rafCallbacks.forEach((value, key) => {
            updates[key] = value;
          });
          this.manager.setState(updates);
          this.rafCallbacks.clear();
          this.rafId = null;
        });
      }
    } else {
      this.rafCallbacks.set(key, value);
    }
  }

  calculateXPRequired(level) {
    return Math.floor(100 * Math.pow(1.2, level - 1));
  }

  // Оптимизированное сохранение
  async save(force = false) {
    const now = Date.now();
    const timeSinceLastSave = now - this.state.lastSaveTime;

    // Не сохраняем чаще чем раз в 2 секунды (кроме force)
    if (!force && timeSinceLastSave < 2000) {
      return;
    }

    // Очищаем предыдущий таймер
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Используем debounce для автосохранения
    return new Promise((resolve) => {
      this.saveDebounceTimer = setTimeout(async () => {
        try {
          if (window.firebaseManager) {
            // Увеличиваем общее время игры
            const newState = {
              ...this.state,
              totalPlayTime: this.state.totalPlayTime + (Date.now() - this.state.lastSaveTime),
              lastSaveTime: Date.now(),
              saveCount: this.state.saveCount + 1
            };

            this.manager.setState(newState);

            const success = await window.firebaseManager.saveGameData(newState);
            if (success) {
              logger.info('💾 Игра сохранена');
              if (typeof updateFirebaseStatusUI === 'function') {
                updateFirebaseStatusUI(true);
              }
            }
          }
          resolve(true);
        } catch (error) {
          logger.error('Ошибка сохранения', error);
          resolve(false);
        }
      }, force ? 0 : 100);
    });
  }

  // Оптимизированная загрузка
  async load() {
    try {
      if (window.firebaseManager) {
        const result = await window.firebaseManager.loadGameData();

        if (result.success && result.data) {
          await this.applyLoadedData(result.data);

          // Восстанавливаем энергию в оффлайне
          this.restoreOfflineEnergy(result.data);

          logger.info(`✅ Данные загружены из: ${result.source}`);
          if (typeof updateFirebaseStatusUI === 'function') {
            updateFirebaseStatusUI(result.source === 'firebase');
          }

          // Восстанавливаем бой если он был активен
          if (result.data.activeBattle) {
            this.restoreBattle(result.data);
          }

          return true;
        }
      }
    } catch (error) {
      logger.error('Ошибка загрузки данных', error);
    }

    return false;
  }

  restoreOfflineEnergy(savedData) {
    if (savedData.lastSavedTimestamp && savedData.energy !== undefined) {
      const now = Date.now();
      const timePassed = now - savedData.lastSavedTimestamp;
      const minutesPassed = Math.floor(timePassed / (1000 * 60));

      // Восстанавливаем энергию: 1 единица в минуту до максимума
      const maxEnergy = savedData.maxEnergy || 100;
      const currentEnergy = savedData.energy || 0;
      const maxRecoveryMinutes = maxEnergy - currentEnergy;
      const effectiveMinutes = Math.min(minutesPassed, maxRecoveryMinutes);
      const energyToRestore = Math.max(0, Math.floor(effectiveMinutes));

      if (energyToRestore > 0) {
        const newEnergy = Math.min(
          maxEnergy,
          currentEnergy + energyToRestore
        );

        this.manager.setState({ energy: newEnergy });

        // Показываем уведомление
        setTimeout(() => {
          showMessage(`⚡ Восстановлено ${energyToRestore} энергии за оффлайн время`);
        }, 1000);
      }
    }
  }

  restoreBattle(savedData) {
    if (!savedData.activeBattle || !savedData.battleStartTime) {
      console.log('Нет данных для восстановления боя');
      return;
    }

    const now = Date.now();
    const battleStart = savedData.battleStartTime;
    const timeLimit = savedData.battleTimeLimit * 1000;
    const timePassed = now - battleStart;

    // Восстанавливаем здоровье босса из сохраненных данных
    const bossHealth = savedData.currentBoss?.currentHealth ||
                      savedData.activeBattle.health;

    if (!bossHealth || bossHealth <= 0) {
      console.log('Босс уже побежден');
      this.showOfflineBattleResult(savedData.activeBattle, true);
      return;
    }

    // Проверяем, не истекло ли время боя
    if (timePassed >= timeLimit) {
      console.log('Время боя истекло - поражение');
      this.showOfflineBattleResult(savedData.activeBattle, false);
      return;
    }

    const bossConfig = gameConfig.bosses[savedData.activeBattle.type];
    if (!bossConfig) {
      console.error('Конфигурация босса не найдена:', savedData.activeBattle.type);
      return;
    }

    // Восстанавливаем состояние боя с актуальным здоровьем
    this.manager.setState({
      inBattle: true,
      activeBattle: {
        type: savedData.activeBattle.type,
        health: bossHealth,
        timeLimit: savedData.activeBattle.timeLimit
      },
      battleStartTime: battleStart,
      battleTimeLimit: savedData.battleTimeLimit,
      currentBoss: {
        type: savedData.activeBattle.type,
        currentHealth: bossHealth,
        maxHealth: savedData.currentBoss?.maxHealth || bossConfig.health,
        image: bossConfig.image
      }
    });

    console.log(`⚔️ Восстановлен бой с ${savedData.activeBattle.type}, здоровье: ${bossHealth}`);

    // Запускаем таймер с оставшимся временем
    const timeLeft = Math.ceil((timeLimit - timePassed) / 1000);
    this.startBattleTimer(timeLeft);

    // Восстанавливаем UI боя
    setTimeout(() => {
      const bossSelection = document.getElementById('bossSelection');
      const combatScreen = document.getElementById('combatScreen');

      if (bossSelection && combatScreen) {
        bossSelection.style.display = 'none';
        combatScreen.style.display = 'block';

        const bossCombatImage = document.getElementById('bossCombatImage');
        if (bossCombatImage) bossCombatImage.src = bossConfig.image;

        updateCombatUI();
        createTalentButtons();
      }
    }, 100);
  }

  showOfflineBattleResult(battleData, victory) {
    const bossConfig = gameConfig.bosses[battleData.type];
    this.battleResult = {
      victory: victory,
      boss: { ...battleData, ...bossConfig },
      reward: victory ? this.calculateReward(battleData) : null
    };

    setTimeout(() => {
      updateResultPopup();
      showBattleResultPopup();
      showMessage(`⚔️ Офлайн бой завершен: ${victory ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}`);
    }, 1500);
  }

  async applyLoadedData(data) {
    try {
      console.log('Применение загруженных данных:', data);

      // Глубокая функция для слияния объектов
      const deepMerge = (target, source) => {
        for (const key in source) {
          if (source[key] && typeof source[key] === 'object' &&
              !Array.isArray(source[key]) &&
              key !== 'lastSaved' && key !== 'lastActive' &&
              key !== 'createdAt' && key !== 'updatedAt') {
            // Если это объект и не массив, и не специальное поле Firebase
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
        return target;
      };

      // Создаем новый объект состояния, начиная с текущего состояния
      const newState = deepMerge({ ...this.manager.state }, data);

      // Убедимся, что важные поля не перезаписаны undefined
      const safeMerge = {
        // Основные данные
        honey: data.honey !== undefined ? data.honey : this.manager.state.honey,
        xp: data.xp !== undefined ? data.xp : this.manager.state.xp,
        level: data.level !== undefined ? data.level : this.manager.state.level,
        energy: data.energy !== undefined ? data.energy : this.manager.state.energy,
        maxEnergy: data.maxEnergy !== undefined ? data.maxEnergy : this.manager.state.maxEnergy,
        xpToNextLevel: data.xpToNextLevel !== undefined ? data.xpToNextLevel : this.manager.state.xpToNextLevel,

        // Коллекции с глубоким слиянием
        talents: data.talents ? {
          ...this.manager.state.talents,
          ...data.talents
        } : this.manager.state.talents,

        attackCharges: data.attackCharges ? {
          ...this.manager.state.attackCharges,
          ...data.attackCharges
        } : this.manager.state.attackCharges,

        craftedTalents: data.craftedTalents ? {
          ...this.manager.state.craftedTalents,
          ...data.craftedTalents
        } : this.manager.state.craftedTalents,

        keys: data.keys ? {
          ...this.manager.state.keys,
          ...data.keys
        } : this.manager.state.keys,

        achievements: data.achievements ? {
          ...this.manager.state.achievements,
          ...data.achievements
        } : this.manager.state.achievements,

        // Друзья и заявки
        friends: data.friends || this.manager.state.friends,
        friendRequests: data.friendRequests || this.manager.state.friendRequests,

        // Настройки
        currentSkin: data.currentSkin || this.manager.state.currentSkin,
        currentPet: data.currentPet || this.manager.state.currentPet,
        hasPet: data.hasPet !== undefined ? data.hasPet : this.manager.state.hasPet,
        isUsingSkin: data.isUsingSkin !== undefined ? data.isUsingSkin : this.manager.state.isUsingSkin,
        currentBackground: data.currentBackground || this.manager.state.currentBackground,
        purchasedBackgrounds: data.purchasedBackgrounds || this.manager.state.purchasedBackgrounds,

        // Боевые данные
        activeBattle: data.activeBattle || null,
        battleStartTime: data.battleStartTime || null,
        battleTimeLimit: data.battleTimeLimit || null,
        currentBoss: data.currentBoss || null,
        inBattle: data.inBattle !== undefined ? data.inBattle : false,

        // Боевая статистика
        battleStats: data.battleStats ? {
          ...this.manager.state.battleStats,
          ...data.battleStats
        } : this.manager.state.battleStats,

        // Аудио настройки
        isMusicMuted: data.isMusicMuted !== undefined ? data.isMusicMuted : this.manager.state.isMusicMuted
      };

      // Применяем обновленное состояние
      this.manager.setState(safeMerge);

      // Применяем визуальные эффекты
      this.applyVisualEffects();

      console.log('Данные успешно применены');
      return true;
    } catch (error) {
      console.error('Ошибка применения загруженных данных:', error);
      return false;
    }
  }

  applyVisualEffects() {
    // Применяем скин
    const hiveImg = document.querySelector('.hive-img');
    if (hiveImg && this.state.currentSkin) {
      hiveImg.style.backgroundImage = `url('${this.state.currentSkin}')`;
    }

    // Применяем питомца
    const petImg = document.querySelector('#pet-img');
    if (petImg) {
      if (this.state.hasPet && this.state.currentPet) {
        petImg.src = this.state.currentPet;
        petImg.style.display = 'block';
      } else {
        petImg.style.display = 'none';
      }
    }

    // Применяем фон
    if (this.state.currentBackground) {
      const currentBg = backgrounds.find(bg => bg.name === this.state.currentBackground);
      if (currentBg) {
        document.body.style.backgroundImage = currentBg.image;
      }
    }

    // Обновляем ключи
    this.updateKeysDisplay();

    // Обновляем отображение талантов
    updateTalentPrices();
  }

  updateKeysDisplay() {
    document.querySelectorAll('.current-keys').forEach(el => {
      const bossType = el.dataset.boss;
      if (this.state.keys[bossType] !== undefined) {
        el.textContent = this.state.keys[bossType];
      }
    });
  }

  cleanupBattleEffects() {
    this.battleEffects.forEach(effect => {
      if (effect.interval) clearInterval(effect.interval);
      if (effect.timeout) clearTimeout(effect.timeout);
    });
    this.battleEffects.clear();
  }

  startBattleTimer(seconds) {
    if (this.battleTimer) clearInterval(this.battleTimer);
    let timeLeft = seconds;

    const timerElement = document.getElementById('combatTimer');
    if (timerElement) timerElement.textContent = timeLeft;

    this.battleTimer = setInterval(() => {
      if (!this.state.inBattle || !this.state.currentBoss || this.state.currentBoss.currentHealth <= 0) {
        clearInterval(this.battleTimer);
        return;
      }

      timeLeft--;
      if (timerElement) {
        timerElement.textContent = timeLeft;
        timerElement.style.color = timeLeft <= 10 ? 'red' : 'white';
      }

      if (timeLeft <= 0) {
        this.endBattle(false);
        if (document.getElementById('bossCombatImage')) {
          document.getElementById('bossCombatImage').classList.add('grayscale');
        }
      }
    }, 1000);
  }

  endBattle(victory) {
    if (!this.state.inBattle || !this.state.currentBoss) return;

    console.log('Завершение битвы:', {
      victory,
      boss: this.state.currentBoss.type,
      health: this.state.currentBoss.currentHealth
    });

    // Очищаем данные офлайн боя
    this.manager.setState({
      activeBattle: null,
      battleStartTime: null,
      battleTimeLimit: null,
      inBattle: false
    });

    // Очистка ядовитых эффектов
    this.cleanupBattleEffects();

    const bossCombatImage = document.getElementById('bossCombatImage');
    if (bossCombatImage) bossCombatImage.classList.remove('grayscale');

    let reward = null;
    if (victory) {
      const bossConfig = gameConfig.bosses[this.state.currentBoss.type];
      reward = {
        honey: bossConfig.honeyReward,
        xp: bossConfig.xpReward,
        keys: bossConfig.keyReward ? { [bossConfig.keyReward.type]: bossConfig.keyReward.amount } : {}
      };

      console.log('Награда за победу:', reward);
    }

    this.battleResult = {
      victory: victory,
      boss: { ...this.state.currentBoss },
      reward: reward
    };

    console.log('Battle result установлен:', this.battleResult);

    this.manager.setState({
      currentBoss: null,
      selectedTalent: null
    });

    if (this.battleTimer) {
      clearInterval(this.battleTimer);
      this.battleTimer = null;
    }

    // Обновляем UI и показываем попап результатов
    updateResultPopup();
    showBattleResultPopup();

    // Обновляем достижения
    updateAchievementsUI();

    // Сохраняем прогресс после боя
    setTimeout(() => this.save(true), 500);
  }

  calculateReward(battleData) {
    const bossConfig = gameConfig.bosses[battleData.type];
    if (!bossConfig) return null;

    return {
      honey: bossConfig.honeyReward,
      xp: bossConfig.xpReward,
      keys: bossConfig.keyReward ? { [bossConfig.keyReward.type]: bossConfig.keyReward.amount } : {}
    };
  }
}

// =================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===================
let gameState;
let tg = null;
let isGameInitialized = false;
let defeatShown = false;

const elements = {
  honey: document.getElementById('honey'),
  energy: document.getElementById('energy'),
  maxEnergy: document.getElementById('maxEnergy'),
  level: document.getElementById('level'),
  xp: document.getElementById('xp'),
  xpToNextLevel: document.getElementById('xpToNextLevel'),
  levelProgress: document.querySelector('.level-progress-bar'),
  combatTimer: document.getElementById('combatTimer'),
  bossHealth: document.getElementById('bossHealth'),
  currentHealth: document.getElementById('currentHealth'),
  maxHealth: document.getElementById('maxHealth'),
  combatTalents: document.getElementById('combatTalents'),
  combatScreen: document.getElementById('combatScreen'),
  bossCombatImage: document.getElementById('bossCombatImage'),
  backgroundMusic: document.getElementById('backgroundMusic'),
  musicToggle: document.getElementById('musicToggle')
};

const gameConfig = {
  bosses: {
    wasp: {
      health: 500,
      time: 60,
      honeyReward: 1000,
      xpReward: 200,
      keyReward: { type: 'bear', amount: 1 },
      image: 'img/wasp.jpg',
      defeatImage: 'img/wasp_kill.jpg'
    },
    bear: {
      health: 1000,
      time: 90,
      honeyReward: 2000,
      requiredKeys: 3,
      keyReward: { type: 'dragon', amount: 1 },
      xpReward: 500,
      image: 'img/bear.jpg',
      defeatImage: 'img/bear_kill.jpg'
    },
    dragon: {
      health: 2500,
      time: 120,
      honeyReward: 5000,
      requiredKeys: 3,
      keyReward: { type: 'hydra', amount: 1 },
      xpReward: 1500,
      image: 'img/dragon.jpg',
      defeatImage: 'img/dragon_kill.jpg'
    },
    hydra: {
      health: 4000,
      time: 150,
      honeyReward: 7500,
      requiredKeys: 3,
      keyReward: { type: 'kraken', amount: 1 },
      xpReward: 2500,
      image: 'img/hydra.jpg',
      defeatImage: 'img/hydra_kill.jpg'
    },
    kraken: {
      health: 6000,
      time: 180,
      honeyReward: 10000,
      requiredKeys: 3,
      xpReward: 4000,
      image: 'img/kraken.jpg',
      defeatImage: 'img/kraken_kill.jpg'
    }
  },
  hivePrices: { golden: 1500, crystal: 3000, inferno: 4500 },
  boostPrices: { energy: 1000, shield: 1200, multiclick: 800 }
};

const talentsConfig = {
  basic: {
    maxLevel: 10,
    getDamage: level => 10 + (level * 2),
    getCost: level => Math.floor(75 * Math.pow(1.3, level - 1))
  },
  critical: {
    maxLevel: 10,
    getChance: level => 0.15 + (level * 0.05),
    getCost: level => Math.floor(150 * Math.pow(1.3, level - 1))
  },
  poison: {
    maxLevel: 10,
    getDamage: level => 2 + level,
    getDuration: level => 5 + level,
    getCost: level => Math.floor(200 * Math.pow(1.3, level - 1))
  }
};

const backgrounds = [
  {
    name: 'default',
    cost: 0,
    image: 'url("img/background1.png")',
    preview: 'img/background1.png'
  },
  {
    name: 'forest',
    cost: 1000,
    image: 'url("img/background2.png")',
    preview: 'img/background2.png'
  },
  {
    name: 'city',
    cost: 2500,
    image: 'url("img/background3.png")',
    preview: 'img/background3.png'
  },
  {
    name: 'space',
    cost: 5000,
    image: 'url("img/bg_space.jpg")',
    preview: 'img/bg_space_preview.jpg'
  }
];

// =================== ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ===================
async function initGame() {
  if (isGameInitialized) {
    logger.warn('Игра уже инициализирована');
    return;
  }

  showPreloader('Инициализация игры...');
  updatePreloaderProgress(10);

  try {
    // 1. Инициализация Telegram WebApp
    updatePreloaderProgress(20);
    initTelegramWebApp();

    // 2. Предзагрузка ресурсов
    updatePreloaderProgress(30);
    await ImagePreloader.preloadAll();

    // 3. Инициализация Firebase с улучшенной обработкой ошибок
    updatePreloaderProgress(40);
    if (window.firebaseManager) {
      try {
        const firebaseReady = await window.firebaseManager.init();
        if (!firebaseReady) {
          logger.warn('Firebase не доступен, игра в офлайн режиме');
        }
      } catch (firebaseError) {
        logger.warn('Ошибка Firebase, игра в офлайн режиме:', firebaseError);
      }
    }

    // 4. Создание состояния игры
    updatePreloaderProgress(50);
    gameState = new OptimizedGameState();

    // 5. Загрузка сохраненных данных с повторными попытками
    updatePreloaderProgress(60);
    let loadAttempts = 0;
    let loadSuccess = false;

    while (loadAttempts < 3 && !loadSuccess) {
      try {
        loadSuccess = await gameState.load();
        if (loadSuccess) {
          console.log('✅ Данные успешно загружены');
        }
      } catch (loadError) {
        console.warn(`Попытка ${loadAttempts + 1} загрузки не удалась:`, loadError);
        loadAttempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 6. Инициализация UI
    updatePreloaderProgress(70);
    initUI();

    // 7. Инициализация систем
    updatePreloaderProgress(80);
    initGameSystems();

    // 8. Запуск игровых циклов
    updatePreloaderProgress(90);
    startGameLoops();

    // 9. Финальная настройка
    updatePreloaderProgress(100);

    setTimeout(() => {
      hidePreloader();
      isGameInitialized = true;

      document.getElementById('gameScreen').style.display = 'block';
      showMessage('🎮 Добро пожаловать в AIKO TAPBOT!');

      logger.info('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');

      // Проверяем и восстанавливаем активный бой если нужно
      if (gameState.state.inBattle && gameState.state.currentBoss) {
        console.log('Обнаружен активный бой, восстанавливаем...');
        const bossSelection = document.getElementById('bossSelection');
        const combatScreen = document.getElementById('combatScreen');

        if (bossSelection && combatScreen) {
          bossSelection.style.display = 'none';
          combatScreen.style.display = 'block';
          createTalentButtons();
          updateCombatUI();
        }
      }
    }, 500);

  } catch (error) {
    logger.error('Критическая ошибка инициализации', error);

    // Fallback: запускаем игру в офлайн режиме
    gameState = new OptimizedGameState();
    initUI();
    initGameSystems();

    hidePreloader();
    document.getElementById('gameScreen').style.display = 'block';
    showMessage('⚠️ Игра запущена в автономном режиме');

    isGameInitialized = true;
  }
}

function initTelegramWebApp() {
  try {
    if (window.Telegram?.WebApp) {
      tg = window.Telegram.WebApp;
      tg.expand();

      // Настройка Telegram интерфейса
      tg.setHeaderColor('#8B4513');
      tg.setBackgroundColor('#8B4513');
      tg.enableClosingConfirmation();

      // Кнопка "Назад"
      tg.BackButton.onClick(() => {
        const activePopup = document.querySelector('.popup.active');
        if (activePopup) {
          hideAllPopups();
        } else {
          tg.BackButton.hide();
        }
      });

      tg.onEvent('viewportChanged', handleViewportChange);

      logger.info('Telegram WebApp инициализирован');
    } catch (error) {
      logger.warn('Telegram WebApp не доступен', error);
    }
  }
}

function handleViewportChange() {
  updateHiveDisplay();
  updateCombatUI();
}

function initUI() {
  // Подписка на изменения состояния
  gameState.subscribe((oldState, newState) => {
    updateGameUI(oldState, newState);
  });

  // Инициализация элементов
  updateHiveDisplay();
  updateUI();
  updateBossAvailability();
  updateAchievementsUI();

  // Обработчики событий
  initEventHandlers();
}

function updateGameUI(oldState, newState) {
  // Оптимизация: обновляем только изменившиеся поля
  const changes = {};

  if (oldState.honey !== newState.honey) {
    changes.honey = newState.honey;
  }

  if (oldState.energy !== newState.energy || oldState.maxEnergy !== newState.maxEnergy) {
    changes.energy = newState.energy;
    changes.maxEnergy = newState.maxEnergy;
  }

  if (oldState.level !== newState.level || oldState.xp !== newState.xp || oldState.xpToNextLevel !== newState.xpToNextLevel) {
    changes.level = newState.level;
    changes.xp = newState.xp;
    changes.xpToNextLevel = newState.xpToNextLevel;
    updateLevelProgress();
  }

  if (oldState.keys !== newState.keys) {
    gameState.updateKeysDisplay();
  }

  // Применяем изменения
  Object.keys(changes).forEach(key => {
    const element = elements[key];
    if (element && changes[key] !== undefined) {
      element.textContent = Math.floor(changes[key]);
    }
  });
}

function initGameSystems() {
  // Аудио система
  initAudio();

  // Система друзей
  initFriendsSystem();

  // Система фонов
  initBackgroundSystem();

  // Система крафтинга
  initCrafting();

  // Магазин талантов
  initTalentShop();

  // Обработчики результатов битвы
  document.getElementById('claimRewardButton')?.addEventListener('click', claimBattleReward);
  document.getElementById('closeResultButton')?.addEventListener('click', closeBattleResult);

  // Сетевые слушатели
  initNetworkListeners();
}

function startGameLoops() {
  // Восстановление энергии
  gameState.energyRecoveryInterval = setInterval(() => {
    if (gameState.state.energy < gameState.state.maxEnergy) {
      gameState.scheduleUIUpdate('energy', Math.min(
        gameState.state.energy + 1,
        gameState.state.maxEnergy
      ));
    }
  }, 3000);

  // Автосохранение
  setInterval(() => gameState.save(), 30000);

  // Проверка онлайна друзей
  setInterval(() => {
    if (window.firebaseManager?.isOnline) {
      updateFriendsOnlineStatus();
    }
  }, 60000);
}

// =================== СЕТЕВЫЕ СЛУШАТЕЛИ ===================
function initNetworkListeners() {
  window.addEventListener('online', () => {
    console.log('Сетевое соединение восстановлено');
    showMessage('🌐 Подключение к интернету восстановлено');

    // Пытаемся сохранить данные если менеджер доступен
    if (window.firebaseManager) {
      window.firebaseManager.isOnline = true;
      setTimeout(() => gameState.save(), 1000);
    }
  });

  window.addEventListener('offline', () => {
    console.log('Сетевое соединение потеряно');
    showMessage('⚠️ Потеряно соединение с интернетом');

    if (window.firebaseManager) {
      window.firebaseManager.isOnline = false;
    }
  });
}

// =================== ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ UI ===================
function updateUI(keys = ['all']) {
  const state = gameState.state;

  if (keys.includes('all') || keys.includes('honey')) {
    if (elements.honey) elements.honey.textContent = Math.floor(state.honey);
  }

  if (keys.includes('all') || keys.includes('energy')) {
    if (elements.energy) elements.energy.textContent = Math.floor(state.energy);
    if (elements.maxEnergy) elements.maxEnergy.textContent = state.maxEnergy;
  }

  if (keys.includes('all') || keys.includes('level')) {
    if (elements.level) elements.level.textContent = state.level;
    if (elements.xp) elements.xp.textContent = Math.floor(state.xp);
    if (elements.xpToNextLevel) elements.xpToNextLevel.textContent = Math.floor(state.xpToNextLevel);
    updateLevelProgress();
  }
}

function updateLevelProgress() {
  const state = gameState.state;
  const progress = (state.xp / state.xpToNextLevel) * 100;
  if (elements.levelProgress) {
    elements.levelProgress.style.width = `${Math.min(progress, 100)}%`;
  }
}

function updateHiveDisplay() {
  const hiveImg = document.querySelector('.hive-img');
  if (hiveImg && gameState.state.currentSkin) {
    hiveImg.style.backgroundImage = `url('${gameState.state.currentSkin}')`;
  }
}

function updateBossAvailability() {
  document.querySelectorAll('.boss-card').forEach(card => {
    const bossType = card.dataset.boss;
    let isLocked = false;

    if (bossType === 'bear' || bossType === 'dragon' || bossType === 'hydra' || bossType === 'kraken') {
      isLocked = gameState.state.keys[bossType] < 3;
    }

    card.classList.toggle('locked', isLocked);
  });
}

function updateAchievementsUI() {
  const state = gameState.state;

  // Достижение ос
  const waspKills = state.achievements.waspKills;
  const waspCard = document.getElementById('waspAchievement');
  const waspLevelElement = document.getElementById('waspLevel');
  const waspProgress = document.getElementById('waspKillProgress');
  const waspKillCount = document.getElementById('waspKillCount');
  const claimWasp1 = document.getElementById('claimWasp1');
  const claimWasp2 = document.getElementById('claimWasp2');
  const claimWasp3 = document.getElementById('claimWasp3');

  if (waspKills < 10) {
    waspLevelElement.textContent = 'Уровень 1';
    waspKillCount.textContent = `${waspKills}/10`;
    waspProgress.style.width = `${(waspKills / 10) * 100}%`;
    claimWasp1.style.display = state.achievements.completed.level1 && !state.achievements.claimed.level1 ? 'block' : 'none';
    claimWasp2.style.display = 'none';
    claimWasp3.style.display = 'none';
  } else if (waspKills < 20) {
    waspLevelElement.textContent = 'Уровень 2';
    waspKillCount.textContent = `${waspKills - 10}/10`;
    waspProgress.style.width = `${((waspKills - 10) / 10) * 100}%`;
    claimWasp1.style.display = 'none';
    claimWasp2.style.display = state.achievements.completed.level2 && !state.achievements.claimed.level2 ? 'block' : 'none';
    claimWasp3.style.display = 'none';
  } else if (waspKills < 30) {
    waspLevelElement.textContent = 'Уровень 3';
    waspKillCount.textContent = `${waspKills - 20}/10`;
    waspProgress.style.width = `${((waspKills - 20) / 10) * 100}%`;
    claimWasp1.style.display = 'none';
    claimWasp2.style.display = 'none';
    claimWasp3.style.display = state.achievements.completed.level3 && !state.achievements.claimed.level3 ? 'block' : 'none';
  } else {
    waspLevelElement.textContent = 'Максимум';
    waspKillCount.textContent = '30/30';
    waspProgress.style.width = '100%';
    claimWasp1.style.display = 'none';
    claimWasp2.style.display = 'none';
    claimWasp3.style.display = 'none';
  }

  // Достижение медведей
  const bearKills = state.achievements.bearKills;
  const bearCard = document.getElementById('bearAchievement');
  const bearLevelElement = document.getElementById('bearLevel');
  const bearProgress = document.getElementById('bearKillProgress');
  const bearKillCount = document.getElementById('bearKillCount');
  const claimBear1 = document.getElementById('claimBear1');
  const claimBear2 = document.getElementById('claimBear2');
  const claimBear3 = document.getElementById('claimBear3');

  if (bearKills < 10) {
    bearLevelElement.textContent = 'Уровень 1';
    bearKillCount.textContent = `${bearKills}/10`;
    bearProgress.style.width = `${(bearKills / 10) * 100}%`;
    claimBear1.style.display = state.achievements.bearCompleted.level1 && !state.achievements.bearClaimed.level1 ? 'block' : 'none';
    claimBear2.style.display = 'none';
    claimBear3.style.display = 'none';
  } else if (bearKills < 20) {
    bearLevelElement.textContent = 'Уровень 2';
    bearKillCount.textContent = `${bearKills - 10}/10`;
    bearProgress.style.width = `${((bearKills - 10) / 10) * 100}%`;
    claimBear1.style.display = 'none';
    claimBear2.style.display = state.achievements.bearCompleted.level2 && !state.achievements.bearClaimed.level2 ? 'block' : 'none';
    claimBear3.style.display = 'none';
  } else if (bearKills < 30) {
    bearLevelElement.textContent = 'Уровень 3';
    bearKillCount.textContent = `${bearKills - 20}/10`;
    bearProgress.style.width = `${((bearKills - 20) / 10) * 100}%`;
    claimBear1.style.display = 'none';
    claimBear2.style.display = 'none';
    claimBear3.style.display = state.achievements.bearCompleted.level3 && !state.achievements.bearClaimed.level3 ? 'block' : 'none';
  } else {
    bearLevelElement.textContent = 'Максимум';
    bearKillCount.textContent = '30/30';
    bearProgress.style.width = '100%';
    claimBear1.style.display = 'none';
    claimBear2.style.display = 'none';
    claimBear3.style.display = 'none';
  }
}

// =================== СИСТЕМА АУДИО ===================
function initAudio() {
  if (!elements.backgroundMusic) return;

  elements.backgroundMusic.muted = gameState.state.isMusicMuted;
  elements.backgroundMusic.volume = 0.5;

  if (elements.musicToggle) {
    elements.musicToggle.classList.toggle('muted', gameState.state.isMusicMuted);
    elements.musicToggle.addEventListener('click', toggleMusic);
  }

  // Попытка автовоспроизведения
  document.addEventListener('click', function initialPlay() {
    if (elements.backgroundMusic.paused) {
      elements.backgroundMusic.play().catch(error => {
        console.error('Ошибка воспроизведения музыки:', error);
      });
    }
    document.removeEventListener('click', initialPlay);
  }, { once: true });
}

function toggleMusic() {
  if (!elements.backgroundMusic) return;

  const newMuted = !gameState.state.isMusicMuted;
  gameState.manager.setState({ isMusicMuted: newMuted });
  elements.backgroundMusic.muted = newMuted;

  if (elements.musicToggle) {
    elements.musicToggle.classList.toggle('muted', newMuted);
  }

  localStorage.setItem('musicMuted', newMuted);
}

// =================== СИСТЕМА ДРУЗЕЙ ===================
function initFriendsSystem() {
  // Инициализация вкладок
  document.querySelectorAll('.friends-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.friends-tabs .tab-btn, .friends-tab').forEach(el => {
        el.classList.remove('active');
      });
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'friendsList') {
        loadFriendsList();
      } else if (tabId === 'friendRequests') {
        loadFriendRequests();
      }
    });
  });

  // Кнопка отправки заявки
  document.getElementById('sendFriendRequestBtn')?.addEventListener('click', sendFriendRequest);

  // Кнопка копирования своего ID
  document.getElementById('copyMyIdBtn')?.addEventListener('click', copyMyTelegramId);

  // Поиск по друзьям
  document.getElementById('searchFriend')?.addEventListener('input', filterFriendsList);

  // Показываем свой Telegram ID
  updateMyTelegramId();
}

async function updateMyTelegramId() {
  try {
    const myIdElement = document.getElementById('myTelegramId');
    const copyBtn = document.getElementById('copyMyIdBtn');

    // Получаем Telegram ID из WebApp
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

    if (telegramId) {
      myIdElement.textContent = telegramId;
      if (copyBtn) copyBtn.style.display = 'inline-block';

      // Проверяем, сохранен ли Telegram ID в Firebase
      if (window.firebaseManager) {
        setTimeout(async () => {
          try {
            const telegramIdFromFirebase = await window.firebaseManager.getCurrentTelegramId();

            if (!telegramIdFromFirebase) {
              console.warn('Telegram ID не найден в Firebase. Сохраняем игру...');
              if (gameState) {
                await gameState.save(true);
              }
            }

            // Получаем количество друзей для отображения
            const friendsCount = await window.firebaseManager.getFriendsCount(window.firebaseManager.currentUser?.uid);

            // Обновляем счетчик друзей
            let counter = myIdElement.parentElement.querySelector('.friends-counter');
            if (!counter) {
              counter = document.createElement('div');
              counter.className = 'friends-counter';
              myIdElement.parentElement.appendChild(counter);
            }
            counter.innerHTML = `<span style="font-size: 0.9em; color: rgba(255,255,255,0.7);">Друзей: ${friendsCount}/20</span>`;

          } catch (error) {
            console.error('Ошибка получения данных друзей:', error);
          }
        }, 2000);
      }
    } else {
      myIdElement.textContent = 'Откройте игру через Telegram';
      if (copyBtn) copyBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('Ошибка получения Telegram ID:', error);
    document.getElementById('myTelegramId').textContent = 'Ошибка загрузки';
  }
}

function copyMyTelegramId() {
  const myId = document.getElementById('myTelegramId').textContent;
  if (myId && myId !== 'Откройте игру через Telegram') {
    navigator.clipboard.writeText(myId).then(() => {
      showMessage('✅ ID скопирован в буфер обмена!');
    }).catch(() => {
      // Fallback для старых браузеров
      const textArea = document.createElement('textarea');
      textArea.value = myId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showMessage('✅ ID скопирован в буфер обмена!');
    });
  } else {
    showMessage('❌ Нет Telegram ID для копирования');
  }
}

async function loadFriendsList() {
  try {
    if (!window.firebaseManager) {
      showMessage('❌ Firebase не инициализирован');
      return;
    }

    const friendsContainer = document.getElementById('friendsContainer');
    friendsContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const friends = await window.firebaseManager.getFriends();
    gameState.manager.setState({ friends: friends });

    console.log('Загружено друзей:', friends.length);
    displayFriendsList(friends);
  } catch (error) {
    console.error('Ошибка загрузки друзей:', error);
    document.getElementById('friendsContainer').innerHTML =
      '<div class="empty-state">❌ Ошибка загрузки друзей</div>';
  }
}

function displayFriendsList(friends, searchQuery = '') {
  const friendsContainer = document.getElementById('friendsContainer');
  friendsContainer.innerHTML = '';

  if (friends.length === 0) {
    if (searchQuery) {
      friendsContainer.innerHTML = `
        <div class="empty-state">
          🔍 Друзья с ID "${searchQuery}" не найдены
        </div>
      `;
    } else {
      friendsContainer.innerHTML = '<div class="empty-state">👥 У вас пока нет друзей</div>';
    }
    return;
  }

  // Показываем счетчик друзей
  const friendsCounter = document.createElement('div');
  friendsCounter.className = 'friends-counter';
  friendsCounter.innerHTML = `<span>Друзей: ${friends.length}/20</span>`;
  if (friends.length >= 20) {
    friendsCounter.innerHTML += '<span style="color: #ff6b6b; margin-left: 10px;">Лимит достигнут!</span>';
  }
  friendsContainer.appendChild(friendsCounter);

  friends.forEach(friend => {
    const friendCard = createFriendCard(friend);
    friendsContainer.appendChild(friendCard);
  });
}

function createFriendCard(friend) {
  const card = document.createElement('div');
  card.className = 'friend-card';

  const status = window.firebaseManager.getOnlineStatus(friend.lastOnline);
  const statusText = {
    online: '🟢 В сети',
    away: '🟡 Был недавно',
    offline: '🔴 Не в сети'
  }[status];

  const statusColor = {
    online: '#4CAF50',
    away: '#ff9800',
    offline: '#f44336'
  }[status];

  card.innerHTML = `
    <div class="friend-header">
      <div class="friend-info">
        <h4>${friend.username}</h4>
        <div class="friend-status">
          <span class="status-dot" style="background: ${statusColor};"></span>
          <span>${statusText}</span>
          <span style="margin-left: auto; font-family: monospace; font-size: 0.9em;">ID: ${friend.telegramId}</span>
        </div>
      </div>
      <div class="friend-level" style="background: rgba(139, 69, 19, 0.3); padding: 5px 10px; border-radius: 10px;">
        Ур. ${friend.level}
      </div>
    </div>

    <div class="friend-stats">
      <div class="stat-item-small">🍯 ${formatNumber(friend.honey || 0)}</div>
      <div class="stat-item-small">⭐ ${formatNumber(friend.xp || 0)} XP</div>
      <div class="stat-item-small">🕐 ${friend.lastOnline ? formatLastSeen(friend.lastOnline) : 'Неизвестно'}</div>
      <div class="stat-item-small">📅 ${friend.lastOnline ? formatDate(friend.lastOnline) : 'Нет данных'}</div>
    </div>

    <div class="friend-actions">
      <button class="remove-friend-btn" data-friend-id="${friend.id}">
        🗑️ Удалить из друзей
      </button>
    </div>
  `;

  // Обработчик удаления друга
  card.querySelector('.remove-friend-btn').addEventListener('click', async (e) => {
    const friendId = e.target.dataset.friendId;
    if (confirm('Вы уверены, что хотите удалить этого друга?')) {
      const success = await window.firebaseManager.removeFriend(friendId);
      if (success) {
        showMessage('✅ Друг удален');
        loadFriendsList();
      } else {
        showMessage('❌ Ошибка удаления друга');
      }
    }
  });

  return card;
}

function filterFriendsList() {
  const searchText = document.getElementById('searchFriend').value.trim();
  const friends = gameState.state.friends;

  if (!searchText) {
    // Показываем всех друзей
    displayFriendsList(friends);
    return;
  }

  // Ищем только по Telegram ID
  const filteredFriends = friends.filter(friend =>
    friend.telegramId && friend.telegramId.toString().includes(searchText)
  );

  displayFriendsList(filteredFriends, searchText);
}

async function sendFriendRequest() {
  try {
    const telegramIdInput = document.getElementById('friendTelegramId');
    const messageInput = document.getElementById('friendMessage');

    const telegramId = telegramIdInput.value.trim();
    const message = messageInput.value.trim();

    if (!telegramId) {
      showMessage('❌ Введите Telegram ID');
      telegramIdInput.focus();
      return;
    }

    // Проверяем, что введен только цифры
    if (!/^\d+$/.test(telegramId)) {
      showMessage('❌ Telegram ID должен содержать только цифры');
      telegramIdInput.focus();
      return;
    }

    if (!window.firebaseManager) {
      showMessage('❌ Ошибка соединения с сервером');
      return;
    }

    // Показываем индикатор загрузки
    const sendBtn = document.getElementById('sendFriendRequestBtn');
    const originalText = sendBtn.textContent;
    sendBtn.textContent = 'Отправка...';
    sendBtn.disabled = true;

    const result = await window.firebaseManager.sendFriendRequest(telegramId, message);

    sendBtn.textContent = originalText;
    sendBtn.disabled = false;

    if (result.success) {
      showMessage('✅ Заявка отправлена!');
      telegramIdInput.value = '';
      messageInput.value = '';

      // Переключаемся на вкладку заявок
      document.querySelectorAll('.friends-tabs .tab-btn, .friends-tab').forEach(el => {
        el.classList.remove('active');
      });
      document.querySelector('.friends-tabs .tab-btn[data-tab="friendRequests"]').classList.add('active');
      document.getElementById('friendRequests').classList.add('active');

      // Загружаем заявки
      loadFriendRequests();
    } else {
      showMessage('❌ ' + result.error);
    }
  } catch (error) {
    console.error('Ошибка отправки заявки:', error);
    showMessage('❌ Ошибка отправки заявки');

    const sendBtn = document.getElementById('sendFriendRequestBtn');
    sendBtn.textContent = 'Отправить заявку';
    sendBtn.disabled = false;
  }
}

async function loadFriendRequests() {
  try {
    if (!window.firebaseManager) {
      showMessage('❌ Firebase не инициализирован');
      return;
    }

    const requestsContainer = document.getElementById('requestsContainer');
    requestsContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const requests = await window.firebaseManager.getFriendRequests();
    gameState.manager.setState({ friendRequests: requests });

    console.log('Загружено заявок:', {
      incoming: requests.incoming.length,
      outgoing: requests.outgoing.length
    });

    // Обновляем счетчик заявок
    const badge = document.getElementById('requestsCount');
    if (badge) {
      badge.textContent = requests.incoming.length;
      badge.style.display = requests.incoming.length > 0 ? 'inline-flex' : 'none';
    }

    if (requests.incoming.length === 0 && requests.outgoing.length === 0) {
      requestsContainer.innerHTML = '<div class="empty-state">📭 У вас нет заявок в друзья</div>';
      return;
    }

    requestsContainer.innerHTML = '';

    // Входящие заявки
    if (requests.incoming.length > 0) {
      const incomingHeader = document.createElement('h4');
      incomingHeader.textContent = `Входящие заявки (${requests.incoming.length}):`;
      incomingHeader.style.marginBottom = '10px';
      incomingHeader.style.color = 'var(--accent)';
      requestsContainer.appendChild(incomingHeader);

      requests.incoming.forEach(request => {
        const requestCard = createRequestCard(request, 'incoming');
        requestsContainer.appendChild(requestCard);
      });
    }

    // Исходящие заявки
    if (requests.outgoing.length > 0) {
      const outgoingHeader = document.createElement('h4');
      outgoingHeader.textContent = `Исходящие заявки (${requests.outgoing.length}):`;
      outgoingHeader.style.marginTop = '20px';
      outgoingHeader.style.marginBottom = '10px';
      outgoingHeader.style.color = 'var(--accent)';
      requestsContainer.appendChild(outgoingHeader);

      requests.outgoing.forEach(request => {
        const requestCard = createRequestCard(request, 'outgoing');
        requestsContainer.appendChild(requestCard);
      });
    }
  } catch (error) {
    console.error('Ошибка загрузки заявок:', error);
    document.getElementById('requestsContainer').innerHTML =
      '<div class="empty-state">❌ Ошибка загрузки заявок</div>';
  }
}

function createRequestCard(request, type) {
  const card = document.createElement('div');
  card.className = 'request-card';

  if (type === 'incoming') {
    card.innerHTML = `
      <div class="request-info">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${request.fromName}</strong>
          <span style="font-family: monospace; font-size: 0.9em; color: rgba(255,255,255,0.7);">ID: ${request.fromTelegramId}</span>
        </div>
        ${request.message ? `<div style="margin-top: 5px; font-size: 0.9em; color: rgba(255,255,255,0.8);">💬 "${request.message}"</div>` : ''}
        <div style="font-size: 0.8em; color: rgba(255,255,255,0.6); margin-top: 5px;">
          📅 ${formatDate(request.createdAt)}
        </div>
      </div>
      <div class="request-actions">
        <button class="accept-btn" data-request-id="${request.id}">✓ Принять</button>
        <button class="reject-btn" data-request-id="${request.id}">✗ Отклонить</button>
      </div>
    `;

    // Обработчики для кнопок принятия/отклонения
    card.querySelector('.accept-btn').addEventListener('click', async (e) => {
      const requestId = e.target.dataset.requestId;
      const result = await window.firebaseManager.respondToFriendRequest(requestId, true);
      if (result.success) {
        showMessage('✅ Заявка принята! Теперь вы друзья!');
        loadFriendRequests();
        loadFriendsList();
      } else {
        showMessage('❌ ' + result.error);
      }
    });

    card.querySelector('.reject-btn').addEventListener('click', async (e) => {
      const requestId = e.target.dataset.requestId;
      const result = await window.firebaseManager.respondToFriendRequest(requestId, false);
      if (result.success) {
        showMessage('Заявка отклонена');
        loadFriendRequests();
      } else {
        showMessage('❌ ' + result.error);
      }
    });
  } else {
    card.innerHTML = `
      <div class="request-info">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${request.toName}</strong>
          <span style="font-family: monospace; font-size: 0.9em; color: rgba(255,255,255,0.7);">ID: ${request.toTelegramId}</span>
        </div>
        ${request.message ? `<div style="margin-top: 5px; font-size: 0.9em; color: rgba(255,255,255,0.8);">💬 "${request.message}"</div>` : ''}
        <div style="font-size: 0.8em; color: rgba(255,255,255,0.6); margin-top: 5px;">
          📅 ${formatDate(request.createdAt)}
        </div>
        <div style="font-size: 0.8em; color: rgba(255,255,255,0.6); margin-top: 5px;">
          Ожидание ответа...
        </div>
      </div>
    `;
  }

  return card;
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return Math.floor(num).toLocaleString('ru-RU');
}

function formatLastSeen(timestamp) {
  if (!timestamp) return 'давно';

  const now = Date.now();
  const time = timestamp.toDate ? timestamp.toDate().getTime() : timestamp;
  const diff = now - time;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  return `${days} дн. назад`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ru-RU');
}

function updateFriendsOnlineStatus() {
  // Эта функция может обновлять статус друзей в реальном времени
  loadFriendsList();
}

// =================== СИСТЕМА КРАФТИНГА ===================
function initCrafting() {
  const talentCards = document.querySelectorAll('.talent-card');
  const craftSlots = document.querySelectorAll('.craft-slot');

  talentCards.forEach(card => {
    card.addEventListener('click', () => {
      const emptySlot = Array.from(craftSlots).find(slot => !slot.dataset.talent);
      if (emptySlot) {
        emptySlot.innerHTML = card.innerHTML;
        emptySlot.dataset.talent = card.dataset.talent;
        emptySlot.classList.add('filled');
        checkRecipe();
      }
    });
  });

  craftSlots.forEach(slot => {
    slot.addEventListener('click', () => {
      if (slot.classList.contains('filled')) {
        slot.innerHTML = '';
        slot.dataset.talent = '';
        slot.classList.remove('filled');
        checkRecipe();
      }
    });
  });

  const sonicButton = document.getElementById('sonicButton');
  const fireButton = document.getElementById('fireButton');
  const iceButton = document.getElementById('iceButton');

  if (sonicButton) {
    sonicButton.addEventListener('click', (e) => {
      e.stopPropagation();
      craftTalent('sonic', ['basic', 'critical']);
    });
  }

  if (fireButton) {
    fireButton.addEventListener('click', (e) => {
      e.stopPropagation();
      craftTalent('fire', ['critical', 'poison']);
    });
  }

  if (iceButton) {
    iceButton.addEventListener('click', (e) => {
      e.stopPropagation();
      craftTalent('ice', ['poison', 'basic']);
    });
  }

  // Скрываем кнопки крафта по умолчанию
  if (sonicButton) sonicButton.style.display = 'none';
  if (fireButton) fireButton.style.display = 'none';
  if (iceButton) iceButton.style.display = 'none';
}

function craftTalent(talentType, requiredTypes) {
  const state = gameState.state;

  // Проверяем достаточно ли зарядов
  const hasEnoughCharges = requiredTypes.every(type =>
    state.attackCharges[type].charges >= 1
  );

  if (!hasEnoughCharges) {
    showMessage('Недостаточно зарядов!');
    return;
  }

  // Создаем новые объекты для иммутабельности
  const newAttackCharges = { ...state.attackCharges };
  const newCraftedTalents = { ...state.craftedTalents };

  // Вычитаем заряды
  requiredTypes.forEach(type => {
    newAttackCharges[type].charges -= 1;
  });

  // Добавляем крафтовый талант
  newCraftedTalents[talentType].charges += 1;
  newCraftedTalents[talentType].level = Math.max(
    newCraftedTalents[talentType].level,
    Math.max(...requiredTypes.map(type => state.talents[type].level))
  );

  // Обновляем состояние
  gameState.manager.setState({
    attackCharges: newAttackCharges,
    craftedTalents: newCraftedTalents
  });

  showMessage(`✨ Создан новый талант: ${getTalentName(talentType)}!`);
  resetCrafting();
  updateTalentBuyTab();

  if (state.inBattle) {
    setTimeout(() => createTalentButtons(), 100);
  }

  // Сохраняем после крафта
  setTimeout(() => gameState.save(), 100);
}

function getTalentName(type) {
  const names = {
    sonic: 'Звуковой удар',
    fire: 'Огненный удар',
    ice: 'Ледяной удар'
  };
  return names[type] || type;
}

function checkRecipe() {
  const slots = document.querySelectorAll('.craft-slot');
  const talents = Array.from(slots).map(slot => slot.dataset.talent).filter(Boolean);

  const isSonicRecipe = talents.length === 2 &&
    talents.includes('basic') &&
    talents.includes('critical');

  const isFireRecipe = talents.length === 2 &&
    talents.includes('critical') &&
    talents.includes('poison');

  const isIceRecipe = talents.length === 2 &&
    talents.includes('poison') &&
    talents.includes('basic');

  const sonicButton = document.getElementById('sonicButton');
  const fireButton = document.getElementById('fireButton');
  const iceButton = document.getElementById('iceButton');

  if (sonicButton) {
    sonicButton.style.display = isSonicRecipe ? 'block' : 'none';
    if (isSonicRecipe) {
      const state = gameState.state;
      sonicButton.disabled = state.attackCharges.basic.charges < 1 ||
        state.attackCharges.critical.charges < 1;
    }
  }

  if (fireButton) {
    fireButton.style.display = isFireRecipe ? 'block' : 'none';
    if (isFireRecipe) {
      const state = gameState.state;
      fireButton.disabled = state.attackCharges.critical.charges < 1 ||
        state.attackCharges.poison.charges < 1;
    }
  }

  if (iceButton) {
    iceButton.style.display = isIceRecipe ? 'block' : 'none';
    if (isIceRecipe) {
      const state = gameState.state;
      iceButton.disabled = state.attackCharges.basic.charges < 1 ||
        state.attackCharges.poison.charges < 1;
    }
  }

  return isSonicRecipe || isFireRecipe || isIceRecipe;
}

function resetCrafting() {
  gameState.manager.setState({ selectedForCraft: [] });
  document.querySelectorAll('.talent-card').forEach(card => {
    card.classList.remove('selected');
  });
  document.querySelectorAll('.craft-slot').forEach(slot => {
    slot.innerHTML = '';
    slot.dataset.talent = '';
    slot.classList.remove('filled');
  });
  const sonicButton = document.getElementById('sonicButton');
  const fireButton = document.getElementById('fireButton');
  const iceButton = document.getElementById('iceButton');
  if (sonicButton) sonicButton.style.display = 'none';
  if (fireButton) fireButton.style.display = 'none';
  if (iceButton) iceButton.style.display = 'none';
}

// =================== СИСТЕМА ФОНОВ ===================
let currentBgIndex = 0;
let previousBg = '';

function initBackgroundSystem() {
  const bgMenuBtn = document.getElementById('bgMenuBtn');
  if (bgMenuBtn) {
    bgMenuBtn.addEventListener('click', () => {
      previousBg = gameState.state.currentBackground;
      const selector = document.getElementById('backgroundSelector');
      if (selector) selector.classList.add('active');
      currentBgIndex = backgrounds.findIndex(bg => bg.name === gameState.state.currentBackground);
      updateBackgroundUI();
    });
  }

  const bgPrevBtn = document.getElementById('bgPrevBtn');
  if (bgPrevBtn) {
    bgPrevBtn.addEventListener('click', () => {
      currentBgIndex = (currentBgIndex - 1 + backgrounds.length) % backgrounds.length;
      updateBackgroundUI();
    });
  }

  const bgNextBtn = document.getElementById('bgNextBtn');
  if (bgNextBtn) {
    bgNextBtn.addEventListener('click', () => {
      currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
      updateBackgroundUI();
    });
  }

  const bgActionBtn = document.getElementById('bgActionBtn');
  if (bgActionBtn) {
    bgActionBtn.addEventListener('click', () => {
      const currentBg = backgrounds[currentBgIndex];

      if (!gameState.state.purchasedBackgrounds.includes(currentBg.name)) {
        if (gameState.state.honey >= currentBg.cost) {
          gameState.scheduleUIUpdate('honey', gameState.state.honey - currentBg.cost);

          const newPurchasedBackgrounds = [...gameState.state.purchasedBackgrounds, currentBg.name];
          gameState.manager.setState({ purchasedBackgrounds: newPurchasedBackgrounds });
        } else {
          showMessage('Недостаточно мёда!');
          return;
        }
      }

      gameState.manager.setState({ currentBackground: currentBg.name });
      showMessage(`Фон "${currentBg.name}" выбран!`);
      updateBackgroundUI();

      // Сохраняем после выбора фона
      setTimeout(() => gameState.save(), 100);
    });
  }

  // Кнопка закрытия меню фона
  const bgCloseBtn = document.getElementById('bgCloseBtn');
  if (bgCloseBtn) {
    bgCloseBtn.addEventListener('click', () => {
      const selector = document.getElementById('backgroundSelector');
      if (selector) selector.classList.remove('active');
    });
  }

  // Закрытие при клике вне меню
  const selector = document.getElementById('backgroundSelector');
  if (selector) {
    selector.addEventListener('click', (e) => {
      if (e.target.id === 'backgroundSelector') {
        selector.classList.remove('active');
      }
    });
  }
}

function updateBackgroundUI() {
  const currentBg = backgrounds[currentBgIndex];

  document.body.style.backgroundImage = currentBg.image;

  const actionBtn = document.getElementById('bgActionBtn');
  const isPurchased = gameState.state.purchasedBackgrounds.includes(currentBg.name);
  const isSelected = gameState.state.currentBackground === currentBg.name;

  if (actionBtn) {
    actionBtn.textContent = isPurchased ? (isSelected ? 'Выбран' : 'Выбрать') : `Купить за ${currentBg.cost}`;
    actionBtn.disabled = isSelected || (!isPurchased && gameState.state.honey < currentBg.cost);
  }
}

// =================== МАГАЗИН ТАЛЕНТОВ ===================
function initTalentShop() {
  // Инициализация вкладок магазина талантов
  document.querySelectorAll('.talent-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.talent-tabs .tab-btn, .shop-tab').forEach(el => {
        el.classList.remove('active');
      });
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Обработчики для кнопок покупки зарядов
  document.querySelectorAll('#buyCharges .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      buyCharges(type);
    });
  });

  // Обработчики для кнопок улучшения талантов
  document.querySelectorAll('#upgradeTalents .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const talentType = e.target.closest('.talent').dataset.talent;
      upgradeTalent(talentType);
    });
  });

  // Инициализация табов магазина
  initTalentBuyTab();
}

function initTalentBuyTab() {
  const container = document.getElementById('buyCharges');
  if (!container) return;

  container.innerHTML = '';

  Object.entries(gameState.state.attackCharges).forEach(([type, data]) => {
    const item = document.createElement('div');
    item.className = 'attack-charge-item';
    item.innerHTML = `
      <div>
        <h3>${getAttackName(type)}</h3>
        <span class="charge-counter">${data.charges} шт</span>
      </div>
      <button class="btn" data-type="${type}">${data.basePrice}</button>
    `;

    item.querySelector('button').addEventListener('click', () => {
      buyCharges(type);
    });

    container.appendChild(item);
  });
}

function buyCharges(type) {
  const state = gameState.state;
  const charges = state.attackCharges[type];

  if (state.honey >= charges.basePrice) {
    gameState.scheduleUIUpdate('honey', state.honey - charges.basePrice);

    const newCharges = { ...state.attackCharges };
    newCharges[type].charges += 5;

    gameState.manager.setState({ attackCharges: newCharges });

    // Обновляем UI
    updateUI(['honey']);
    updateChargeDisplay(type);

    if (state.inBattle) {
      createTalentButtons();
    }

    // Сохраняем после покупки
    setTimeout(() => gameState.save(), 100);
  } else {
    showMessage('Недостаточно мёда!');
  }
}

function upgradeTalent(talentType) {
  const state = gameState.state;
  const talent = talentsConfig[talentType];
  const currentLevel = state.talents[talentType].level;

  if (currentLevel >= talent.maxLevel) {
    showMessage('Талант максимального уровня!');
    return;
  }

  const cost = Math.floor(talent.getCost(currentLevel));

  if (state.honey < cost) {
    showMessage('Недостаточно меда!');
    return;
  }

  gameState.scheduleUIUpdate('honey', state.honey - cost);

  const newTalents = { ...state.talents };
  newTalents[talentType].level++;

  // Обновляем характеристики таланта
  switch (talentType) {
    case 'basic':
      newTalents.basic.damage = talent.getDamage(newTalents.basic.level);
      break;
    case 'critical':
      newTalents.critical.chance = talent.getChance(newTalents.critical.level);
      break;
    case 'poison':
      newTalents.poison.damage = talent.getDamage(newTalents.poison.level);
      break;
  }

  gameState.manager.setState({ talents: newTalents });

  // Обновляем UI
  updateUI(['honey', 'talents']);
  updateTalentPrices();
  showMessage('Талант улучшен!');

  // Сохраняем после улучшения
  setTimeout(() => gameState.save(), 100);
}

function updateTalentPrices() {
  const state = gameState.state;

  Object.keys(talentsConfig).forEach(talentType => {
    const talent = talentsConfig[talentType];
    const currentLevel = state.talents[talentType].level;
    const button = document.querySelector(`.talent[data-talent="${talentType}"] button`);
    const levelElement = document.getElementById(`${talentType}Level`);

    if (levelElement) {
      levelElement.textContent = currentLevel;
    }

    if (button) {
      if (currentLevel >= talent.maxLevel) {
        button.textContent = 'MAX';
        button.disabled = true;
      } else {
        const cost = Math.floor(talent.getCost(currentLevel));
        button.textContent = `${cost}`;
        button.disabled = state.honey < cost;
      }
    }
  });

  // Также обновляем значения характеристик
  const basicDmgElement = document.getElementById('basicDmg');
  const critChanceElement = document.getElementById('critChanceUpgrade');
  const poisonDmgElement = document.getElementById('poisonDmgUpgrade');

  if (basicDmgElement) basicDmgElement.textContent = state.talents.basic.damage;
  if (critChanceElement) critChanceElement.textContent = Math.floor(state.talents.critical.chance * 100);
  if (poisonDmgElement) poisonDmgElement.textContent = state.talents.poison.damage;
}

function updateChargeDisplay(type) {
  const state = gameState.state;

  // Обновляем отображение в магазине
  const chargeCounter = document.querySelector(`.attack-charge-item[data-type="${type}"] .charge-counter`);
  if (chargeCounter) {
    chargeCounter.textContent = `${state.attackCharges[type].charges} шт`;
  }

  // Обновляем отображение в бою
  if (state.inBattle) {
    const combatButton = document.querySelector(`.attack-btn[data-attack="${type}"] .charge-counter`);
    if (combatButton) {
      combatButton.textContent = `Зарядов: ${state.attackCharges[type].charges}`;
    }
  }
}

function updateTalentBuyTab() {
  const container = document.getElementById('buyCharges');
  if (!container) return;

  container.querySelectorAll('.attack-charge-item').forEach(item => {
    const type = item.querySelector('button').dataset.type;
    const charges = gameState.state.attackCharges[type].charges;
    item.querySelector('.charge-counter').textContent = `${charges} шт`;
  });
}

function getAttackName(type) {
  const names = {
    basic: 'Базовый удар',
    critical: 'Критический удар',
    poison: 'Ядовитый удар'
  };
  return names[type] || type;
}

// =================== БОЕВАЯ СИСТЕМА ===================
function startBattle(bossType) {
  const bossConfig = gameConfig.bosses[bossType];
  if (!bossConfig) return;

  if (bossType !== 'wasp' && gameState.state.keys[bossType] < 3) {
    showMessage(`Нужно 3 ключа! У вас: ${gameState.state.keys[bossType]}`);
    return;
  }

  if (gameState.state.inBattle) {
    showMessage('Вы уже в бою!');
    return;
  }

  // Вычитаем ключи если нужно
  if (bossType !== 'wasp') {
    const newKeys = { ...gameState.state.keys };
    newKeys[bossType] -= 3;
    gameState.manager.setState({ keys: newKeys });
    gameState.updateKeysDisplay();
  }

  // Сохраняем данные боя для офлайн режима
  gameState.manager.setState({
    activeBattle: {
      type: bossType,
      health: bossConfig.health,
      timeLimit: bossConfig.time
    },
    battleStartTime: Date.now(),
    battleTimeLimit: bossConfig.time,
    inBattle: true,
    currentBoss: {
      ...bossConfig,
      currentHealth: bossConfig.health,
      maxHealth: bossConfig.health,
      type: bossType
    },
    battleStats: {
      basicDamage: 0,
      criticalDamage: 0,
      poisonDamage: 0,
      sonicDamage: 0,
      fireDamage: 0,
      iceDamage: 0,
      totalDamage: 0
    }
  });

  const bossSelection = document.getElementById('bossSelection');
  if (bossSelection) bossSelection.style.display = 'none';

  const combatScreen = document.getElementById('combatScreen');
  if (combatScreen) combatScreen.style.display = 'block';

  const bossCombatImage = document.getElementById('bossCombatImage');
  if (bossCombatImage) bossCombatImage.src = bossConfig.image;

  const battleReward = document.getElementById('battleReward');
  if (battleReward) battleReward.style.display = 'none';

  // Скрываем кнопку "Назад к выбору боссов"
  const backToBossSelection = document.getElementById('backToBossSelection');
  if (backToBossSelection) backToBossSelection.style.display = 'none';

  const bossHealth = document.getElementById('bossHealth');
  if (bossHealth) {
    bossHealth.style.transition = 'none';
    bossHealth.style.width = '100%';
  }

  const currentHealth = document.getElementById('currentHealth');
  if (currentHealth) currentHealth.textContent = bossConfig.health;

  const maxHealth = document.getElementById('maxHealth');
  if (maxHealth) maxHealth.textContent = bossConfig.health;

  const combatTimer = document.getElementById('combatTimer');
  if (combatTimer) combatTimer.textContent = bossConfig.time;

  setTimeout(() => {
    if (bossHealth) bossHealth.style.transition = 'width 0.3s';
    updateCombatUI();
  }, 50);

  createTalentButtons();
  gameState.startBattleTimer(bossConfig.time);

  // Сохраняем сразу после начала боя
  setTimeout(() => gameState.save(true), 500);
}

function createTalentButtons() {
  if (!elements.combatTalents) return;

  elements.combatTalents.innerHTML = '';

  const state = gameState.state;

  // Добавляем обычные таланты
  Object.entries(state.talents).forEach(([type, talent]) => {
    if (talent.level > 0) {
      const charges = state.attackCharges[type].charges;
      if (charges <= 0) return; // Пропускаем таланты без зарядов

      const isSelected = state.selectedTalent === type;
      const isDisabled = !state.inBattle;

      const button = document.createElement('button');
      button.className = `attack-btn ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`;
      button.dataset.attack = type;
      button.disabled = isDisabled;
      button.innerHTML = `
        <div class="talent-icon">${getTalentIcon(type)}</div>
        <div class="talent-info">
          <div>${getTalentButtonText(type)}</div>
          <div class="charge-counter">Зарядов: ${charges}</div>
        </div>
      `;

      button.onclick = () => {
        if (state.selectedTalent === type) {
          gameState.manager.setState({ selectedTalent: null });
        } else {
          gameState.manager.setState({ selectedTalent: type });
        }
        createTalentButtons();
      };

      elements.combatTalents.appendChild(button);
    }
  });

  // Добавляем скрафченные таланты
  const craftedTalents = [
    { type: 'sonic', icon: '🔊', name: 'Звуковой' },
    { type: 'fire', icon: '🔥', name: 'Огненный' },
    { type: 'ice', icon: '❄️', name: 'Ледяной' }
  ];

  craftedTalents.forEach(talent => {
    if (state.craftedTalents[talent.type].charges > 0) {
      const button = document.createElement('button');
      button.className = `attack-btn ${state.selectedTalent === talent.type ? 'selected' : ''}`;
      button.dataset.attack = talent.type;
      button.innerHTML = `
        <div class="talent-icon">${talent.icon}</div>
        <div class="talent-info">
          <div>${talent.name}</div>
          <div class="charge-counter">Зарядов: ${state.craftedTalents[talent.type].charges}</div>
        </div>
      `;
      button.onclick = () => {
        const newSelected = state.selectedTalent === talent.type ? null : talent.type;
        gameState.manager.setState({ selectedTalent: newSelected });
        createTalentButtons();
      };
      elements.combatTalents.appendChild(button);
    }
  });
}

function attack(type) {
  const state = gameState.state;

  // ВАЖНОЕ ИСПРАВЛЕНИЕ: проверка на активный бой
  if (!state.inBattle) {
    console.warn('Попытка атаки вне боя');

    // Если талант выбран, но бой не активен - сбрасываем выбор
    if (state.selectedTalent) {
      gameState.manager.setState({ selectedTalent: null });
      createTalentButtons();
    }

    return;
  }

  // Проверяем кулдаун (увеличен до 500мс)
  const now = Date.now();
  if (now - state.lastAttackTime < 500) {
    return;
  }
  gameState.manager.setState({ lastAttackTime: now });

  // Проверяем выбран ли талант
  if (!state.selectedTalent) {
    console.warn('Талант не выбран');
    return;
  }

  // Получаем тип атаки из выбранного таланта
  const attackType = state.selectedTalent;

  // Обработка крафтовых талантов
  if (attackType === 'sonic' || attackType === 'fire' || attackType === 'ice') {
    const talent = state.craftedTalents[attackType];
    if (talent.charges <= 0) {
      showMessage(`Нет зарядов ${getTalentName(attackType)} удара!`);
      gameState.manager.setState({ selectedTalent: null });
      createTalentButtons();
      return;
    }
    handleCraftedTalentAttack(attackType);
    return;
  }

  // Проверяем заряды для обычных талантов
  if (state.attackCharges[attackType].charges <= 0) {
    showMessage('Заряды кончились! Купите новые в магазине талантов.');
    gameState.manager.setState({ selectedTalent: null });
    createTalentButtons();
    return;
  }

  // Уменьшаем заряды
  const newCharges = { ...state.attackCharges };
  if (newCharges[attackType].charges > 0) {
    newCharges[attackType].charges--;
    gameState.manager.setState({ attackCharges: newCharges });
    // Мгновенное обновление отображения зарядов
    updateChargeDisplay(attackType);
  } else {
    showMessage('Заряды кончились!');
    gameState.manager.setState({ selectedTalent: null });
    createTalentButtons();
    return;
  }

  // Наносим урон
  let damage = 0;
  switch (attackType) {
    case 'basic':
      damage = calculateBasicDamage();
      updateBattleStats('basicDamage', damage);
      showBasicEffect(damage);
      break;
    case 'critical':
      damage = calculateBasicDamage();
      if (Math.random() < state.talents.critical.chance) {
        damage *= 2;
        showCriticalEffect(damage);
      } else {
        showBasicEffect(damage);
      }
      updateBattleStats('criticalDamage', damage);
      break;
    case 'poison':
      startPoisonEffect();
      return; // Яд не наносит мгновенного урона
  }

  // Применяем урон к боссу
  applyDamageToBoss(damage);

  // Обновляем UI
  updateCombatUI();
  updateTalentBuyTab();

  // Сохраняем состояние после атаки
  setTimeout(() => gameState.save(true), 100);
}

function handleCraftedTalentAttack(type) {
  const state = gameState.state;

  if (!state.inBattle) {
    console.warn('Попытка использовать крафтовый талант вне боя');
    return;
  }

  const talent = state.craftedTalents[type];

  if (talent.charges <= 0) {
    showMessage(`Нет зарядов ${getTalentName(type)} удара!`);
    return;
  }

  // Уменьшаем заряды
  const newCraftedTalents = { ...state.craftedTalents };
  if (newCraftedTalents[type].charges > 0) {
    newCraftedTalents[type].charges--;
    gameState.manager.setState({ craftedTalents: newCraftedTalents });
  } else {
    showMessage(`Нет зарядов ${getTalentName(type)} удара!`);
    gameState.manager.setState({ selectedTalent: null });
    createTalentButtons();
    return;
  }

  // Наносим урон
  const damage = talent.damage * (talent.level || 1);

  // Обновляем статистику
  const statName = `${type}Damage`;
  const newStats = { ...state.battleStats };
  newStats[statName] += damage;
  newStats.totalDamage += damage;
  gameState.manager.setState({ battleStats: newStats });

  // Показываем эффект
  if (type === 'sonic') {
    showSonicEffect(damage);
  } else if (type === 'fire') {
    showFireEffect(damage);
  } else {
    showIceEffect(damage);
  }

  // Применяем урон к боссу
  applyDamageToBoss(damage);

  // Обновляем UI
  updateCombatUI();

  // Сохраняем состояние после атаки
  setTimeout(() => gameState.save(true), 100);
}

function startPoisonEffect() {
  const state = gameState.state;
  const poisonDamage = state.talents.poison.damage;
  const duration = talentsConfig.poison.getDuration(state.talents.poison.level);

  showPoisonAttackEffect(poisonDamage);

  const effect = {
    damage: poisonDamage,
    duration: duration,
    interval: null,
    timer: null
  };

  // Первый тик сразу
  applyPoisonTick(effect);

  // Последующие тики
  effect.interval = setInterval(() => applyPoisonTick(effect), 1000);

  // Остановка через duration секунд
  effect.timer = setTimeout(() => {
    if (effect.interval) clearInterval(effect.interval);
    gameState.battleEffects.delete(effect);
  }, duration * 1000);

  gameState.battleEffects.add(effect);
  updatePoisonTimersDisplay();
}

function applyPoisonTick(effect) {
  const state = gameState.state;
  if (!state.inBattle || !state.currentBoss) {
    clearInterval(effect.interval);
    return;
  }

  const damage = effect.damage;
  const newHealth = Math.max(0, state.currentBoss.currentHealth - damage);
  const newBoss = { ...state.currentBoss, currentHealth: newHealth };

  const newStats = { ...state.battleStats };
  newStats.poisonDamage += damage;
  newStats.totalDamage += damage;

  gameState.manager.setState({
    currentBoss: newBoss,
    battleStats: newStats
  });

  showPoisonDamageEffect(damage);
  updateCombatUI();

  // Сохраняем после каждого тика яда
  setTimeout(() => gameState.save(true), 100);

  if (newHealth <= 0) {
    gameState.endBattle(true);
    clearInterval(effect.interval);
  }
}

function applyDamageToBoss(damage) {
  const state = gameState.state;
  if (!state.currentBoss || !state.inBattle) return;

  const newHealth = Math.max(0, state.currentBoss.currentHealth - damage);
  const newBoss = { ...state.currentBoss, currentHealth: newHealth };

  // Обновляем активный бой с текущим здоровьем
  const newActiveBattle = state.activeBattle ? {
    ...state.activeBattle,
    health: newHealth
  } : {
    type: state.currentBoss.type,
    health: newHealth,
    timeLimit: state.battleTimeLimit
  };

  gameState.manager.setState({
    currentBoss: newBoss,
    activeBattle: newActiveBattle
  });

  if (newHealth <= 0) {
    gameState.endBattle(true);
  }
}

function updateBattleStats(stat, damage) {
  const state = gameState.state;
  const newStats = { ...state.battleStats };
  newStats[stat] += damage;
  newStats.totalDamage += damage;
  gameState.manager.setState({ battleStats: newStats });
}

function updateCombatUI() {
  const state = gameState.state;
  if (!state.currentBoss) return;

  if (state.currentBoss.currentHealth < 0) {
    state.currentBoss.currentHealth = 0;
  }

  const healthPercent = (state.currentBoss.currentHealth / state.currentBoss.maxHealth) * 100;
  if (elements.bossHealth) elements.bossHealth.style.width = `${healthPercent}%`;
  if (elements.currentHealth) elements.currentHealth.textContent = state.currentBoss.currentHealth;

  const bossCombatImage = document.getElementById('bossCombatImage');
  if (bossCombatImage) {
    if (healthPercent <= 25) {
      bossCombatImage.src = `img/${state.currentBoss.type}_critical.jpg`;
    } else if (healthPercent <= 50) {
      bossCombatImage.src = `img/${state.currentBoss.type}_wounded.jpg`;
    } else {
      bossCombatImage.src = gameConfig.bosses[state.currentBoss.type].image;
    }
  }
}

function updatePoisonTimersDisplay() {
  const container = document.getElementById('poisonTimersContainer');
  if (!container) return;

  container.innerHTML = '';

  gameState.battleEffects.forEach((effect, index) => {
    if (effect.duration > 0) {
      const timer = document.createElement('div');
      timer.className = 'poison-timer';
      timer.innerHTML = `☠️ ${effect.duration}s`;
      container.appendChild(timer);

      // Уменьшаем оставшееся время для отображения
      effect.duration -= 1;
    }
  });
}

function calculateDamage(type) {
  const state = gameState.state;

  switch (type) {
    case 'basic':
      return calculateBasicDamage(); // Используем унифицированный расчет
    case 'critical':
      return Math.random() < state.talents.critical.chance ?
        calculateBasicDamage() * 2 :
        calculateBasicDamage();
    case 'poison':
      return state.talents.poison.damage;
    case 'sonic':
      return state.craftedTalents.sonic.damage; // Урон уже учитывает уровень при крафте/улучшении
    case 'fire':
      return state.craftedTalents.fire.damage;
    case 'ice':
      return state.craftedTalents.ice.damage;
    default:
      return 0;
  }
}

function calculateBasicDamage() {
  const state = gameState.state;
  let damage = state.talents.basic.damage;
  damage *= state.boosts.attackSpeed;
  if (state.boosts.shield) damage *= 0.7;
  return Math.round(damage);
}

// =================== ОБРАБОТЧИКИ КЛИКОВ ===================
let lastClickTime = 0;
const CLICK_COOLDOWN = 50;

function handleHiveClick(e) {
  const now = Date.now();
  if (now - lastClickTime < CLICK_COOLDOWN) return;
  lastClickTime = now;

  const state = gameState.state;

  // Если в бою и выбран талант
  if (state.inBattle && state.selectedTalent) {
    handleBattleClick(e);
    return;
  }

  // Проверка энергии
  if (state.energy <= 0) {
    showEnergyWarning();
    return;
  }

  // Обычный клик
  const multiplier = state.boosts.multiclick ? 2 : 1;

  gameState.scheduleUIUpdate('honey', state.honey + 1 * multiplier);
  gameState.scheduleUIUpdate('energy', Math.max(0, state.energy - 1));

  // Анимация
  const hive = e.currentTarget;
  hive.style.transform = 'scale(0.95)';
  setTimeout(() => hive.style.transform = 'scale(1)', 100);

  // Создаем эффект
  createClickEffect(e);

  // Автосохранение
  gameState.save();
}

function handleBattleClick(e) {
  const state = gameState.state;
  if (!state.inBattle || !state.selectedTalent) return;

  const clickArea = document.querySelector('.click-area');
  const rect = clickArea.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Эффект урона
  const damageEffect = document.createElement('div');
  damageEffect.className = 'damage-effect';
  damageEffect.style.left = x + 'px';
  damageEffect.style.top = y + 'px';

  const damage = calculateDamage(state.selectedTalent);
  damageEffect.textContent = `-${damage}`;

  clickArea.appendChild(damageEffect);
  setTimeout(() => damageEffect.remove(), 800);

  // Атака
  attack(state.selectedTalent);

  // Вибрация (если поддерживается)
  if (navigator.vibrate) navigator.vibrate(30);
}

function createClickEffect(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const heart = document.createElement('div');
  heart.className = 'heart-effect';
  heart.innerHTML = '❤️';

  const x = Math.random() * rect.width;
  const y = Math.random() * rect.height;

  heart.style.left = x + 'px';
  heart.style.top = y + 'px';

  e.currentTarget.appendChild(heart);
  setTimeout(() => heart.remove(), 1000);
}

// =================== УПРАВЛЕНИЕ ПОПАПАМИ ===================
function showPopup(popupType) {
  if (popupType === 'battleResult') {
    // Результаты боя показываются отдельно через showBattleResultPopup
    return;
  }

  hideAllPopups();
  const popup = document.getElementById(`${popupType}Popup`);
  if (popup) {
    popup.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Особые действия при открытии определенных попапов
    if (popupType === 'friends') {
      loadFriendsList();
    }

    // Для попапа битвы: проверяем поражение и показываем попап, если нужно
    if (popupType === 'battle') {
      // Сбрасываем флаг при открытии попапа битвы
      defeatShown = false;

      // Проверяем и показываем попап поражения, если нужно
      setTimeout(() => {
        if (showDefeatPopupIfNeeded()) {
          // Если показали попап поражения, скрываем выбор боссов
          const bossSelection = document.getElementById('bossSelection');
          if (bossSelection) bossSelection.style.display = 'none';
        }
      }, 100);
    }

    // Восстановление активного боя
    if (popupType === 'battle' && gameState?.state.inBattle) {
      const bossSelection = document.getElementById('bossSelection');
      const combatScreen = document.getElementById('combatScreen');

      if (bossSelection && combatScreen) {
        bossSelection.style.display = 'none';
        combatScreen.style.display = 'block';
        createTalentButtons();
      }
    }

    // Показываем кнопку "Назад" в Telegram
    if (tg && tg.BackButton) {
      tg.BackButton.show();
    }
  }
}

function showBattleResultPopup() {
  hideAllPopups();
  const resultPopup = document.getElementById('battleResultPopup');
  if (resultPopup) {
    resultPopup.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Показываем кнопку "Назад" в Telegram
    if (tg && tg.BackButton) {
      tg.BackButton.show();
    }
  }
}

function hidePopup(type) {
  if (type === 'battleResult') {
    const resultPopup = document.getElementById('battleResultPopup');
    if (resultPopup) {
      resultPopup.classList.remove('active');
    }
    return;
  }

  const popup = document.getElementById(`${type}Popup`);
  if (popup) {
    popup.classList.remove('active');
    document.body.style.overflow = '';

    if (type === 'battle') {
      gameState.manager.setState({ selectedTalent: null });
      if (!gameState.state.inBattle) {
        const combatScreen = document.getElementById('combatScreen');
        if (combatScreen) combatScreen.style.display = 'none';
      }
      createTalentButtons();
    }

    // Скрываем кнопку "Назад" в Telegram если нет открытых попапов
    if (tg && tg.BackButton && !document.querySelector('.popup.active')) {
      tg.BackButton.hide();
    }
  }
}

function hideAllPopups() {
  document.querySelectorAll('.popup').forEach(p => {
    p.classList.remove('active');
  });
  document.body.style.overflow = '';

  // Скрываем кнопку "Назад" в Telegram
  if (tg && tg.BackButton) {
    tg.BackButton.hide();
  }
}

// =================== ПОПАП РЕЗУЛЬТАТОВ БИТВЫ ===================
function updateResultPopup() {
  if (!gameState.battleResult) return;

  const resultTitle = document.getElementById('resultTitle');
  const resultBossImage = document.getElementById('resultBossImage');
  const rewardHoney = document.getElementById('rewardHoney');
  const rewardXP = document.getElementById('rewardXP');
  const rewardKeys = document.getElementById('rewardKeys');
  const claimBtn = document.getElementById('claimRewardButton');
  const closeBtn = document.getElementById('closeResultButton');

  const battleResult = gameState.battleResult;
  const bossConfig = gameConfig.bosses[battleResult.boss.type];

  if (resultTitle) {
    if (battleResult.victory) {
      resultTitle.textContent = "ПОБЕДА!";
      resultTitle.style.color = "#4CAF50";
      if (claimBtn) claimBtn.style.display = 'block';
      if (closeBtn) closeBtn.style.display = 'none';
    } else {
      resultTitle.textContent = "ПОРАЖЕНИЕ";
      resultTitle.style.color = "#f44336";
      if (claimBtn) claimBtn.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'block';
    }
  }

  if (resultBossImage && bossConfig) {
    resultBossImage.src = battleResult.victory ? bossConfig.defeatImage || bossConfig.image : bossConfig.image;
    resultBossImage.classList.toggle('defeat-image', !battleResult.victory);
    resultBossImage.classList.toggle('victory-image', battleResult.victory);
  }

  if (battleResult.reward) {
    if (rewardHoney) rewardHoney.textContent = battleResult.reward.honey || 0;
    if (rewardXP) rewardXP.textContent = battleResult.reward.xp || 0;

    const keys = Object.entries(battleResult.reward.keys || {})
      .map(([type, amount]) => amount)
      .reduce((a, b) => a + b, 0);

    if (rewardKeys) rewardKeys.textContent = keys > 0 ? keys : '0';
  } else {
    if (rewardHoney) rewardHoney.textContent = '0';
    if (rewardXP) rewardXP.textContent = '0';
    if (rewardKeys) rewardKeys.textContent = '0';
  }

  // ДОБАВИТЬ: Отображение статистики урона
  const damageStats = document.getElementById('damageStats');
  if (!damageStats) {
    // Создаем контейнер для статистики, если его нет
    const resultBody = document.querySelector('.result-body');
    if (resultBody) {
      const statsDiv = document.createElement('div');
      statsDiv.id = 'damageStats';
      statsDiv.className = 'damage-stats';
      statsDiv.innerHTML = `
        <h3>Статистика урона:</h3>
        <div class="damage-stats-grid">
          <div class="damage-stat">🗡️ Базовый: <span id="basicDamageStat">0</span></div>
          <div class="damage-stat">💥 Критический: <span id="criticalDamageStat">0</span></div>
          <div class="damage-stat">☠️ Ядовитый: <span id="poisonDamageStat">0</span></div>
          <div class="damage-stat">🔊 Звуковой: <span id="sonicDamageStat">0</span></div>
          <div class="damage-stat">🔥 Огненный: <span id="fireDamageStat">0</span></div>
          <div class="damage-stat">❄️ Ледяной: <span id="iceDamageStat">0</span></div>
          <div class="damage-stat total">📊 Общий урон: <span id="totalDamageStat">0</span></div>
        </div>
      `;

      // Вставляем перед кнопками действий
      const actionsDiv = resultBody.querySelector('.result-actions');
      if (actionsDiv) {
        resultBody.insertBefore(statsDiv, actionsDiv);
      }
    }
  }

  // Обновляем значения статистики
  const state = gameState.state;
  if (state.battleStats) {
    document.getElementById('basicDamageStat').textContent = state.battleStats.basicDamage || 0;
    document.getElementById('criticalDamageStat').textContent = state.battleStats.criticalDamage || 0;
    document.getElementById('poisonDamageStat').textContent = state.battleStats.poisonDamage || 0;
    document.getElementById('sonicDamageStat').textContent = state.battleStats.sonicDamage || 0;
    document.getElementById('fireDamageStat').textContent = state.battleStats.fireDamage || 0;
    document.getElementById('iceDamageStat').textContent = state.battleStats.iceDamage || 0;
    document.getElementById('totalDamageStat').textContent = state.battleStats.totalDamage || 0;
  }
}

function showDefeatPopupIfNeeded() {
  // Проверяем, есть ли активное поражение и не показывали ли мы его уже
  if (gameState.battleResult &&
      !gameState.battleResult.victory &&
      !defeatShown) {

    // Обновляем попап результатов
    updateResultPopup();

    // Показываем попап поражения
    showBattleResultPopup();

    // Помечаем, что попап был показан
    defeatShown = true;

    return true;
  }
  return false;
}

function claimBattleReward() {
  const battleResult = gameState.battleResult;
  const reward = battleResult?.reward;
  const bossType = battleResult?.boss?.type;

  if (reward) {
    // Добавляем награды
    const currentHoney = gameState.state.honey;
    const currentXP = gameState.state.xp;

    gameState.manager.setState({
      honey: currentHoney + reward.honey,
      xp: currentXP + reward.xp
    });

    // Добавляем ключи
    if (reward.keys) {
      const newKeys = { ...gameState.state.keys };
      Object.entries(reward.keys).forEach(([type, amount]) => {
        newKeys[type] = (newKeys[type] || 0) + amount;
      });
      gameState.manager.setState({ keys: newKeys });
    }

    console.log('Награда получена:', {
      honey: reward.honey,
      xp: reward.xp,
      newHoney: currentHoney + reward.honey,
      newXP: currentXP + reward.xp
    });

    // Проверяем повышение уровня
    checkLevelUp();

    // Обновляем UI
    updateUI();
    gameState.updateKeysDisplay();

    // Закрываем попап результатов
    hidePopup('battleResult');

    // Сбрасываем флаг поражения
    defeatShown = false;

    // Скрываем боевой экран
    const combatScreen = document.getElementById('combatScreen');
    if (combatScreen) combatScreen.style.display = 'none';

    // Показываем выбор боссов
    const bossSelection = document.getElementById('bossSelection');
    if (bossSelection) bossSelection.style.display = 'block';

    // Сбрасываем результат битвы
    gameState.battleResult = null;

    // Сохраняем после получения награды
    setTimeout(() => gameState.save(true), 100);

    showMessage('🎉 Награда получена!');
  }
}

function closeBattleResult() {
  // Закрываем попап результатов
  hidePopup('battleResult');

  // Сбрасываем флаг поражения
  defeatShown = false;

  // Скрываем боевой экран
  const combatScreen = document.getElementById('combatScreen');
  if (combatScreen) combatScreen.style.display = 'none';

  // Показываем выбор боссов
  const bossSelection = document.getElementById('bossSelection');
  if (bossSelection) bossSelection.style.display = 'block';

  gameState.battleResult = null;
}

function checkLevelUp() {
  const state = gameState.state;
  let levelsGained = 0;
  let currentXP = state.xp;
  let currentLevel = state.level;

  console.log('Проверка уровня:', {
    currentXP,
    currentLevel,
    xpToNextLevel: state.xpToNextLevel
  });

  while (currentXP >= state.xpToNextLevel) {
    currentXP -= state.xpToNextLevel;
    currentLevel += 1;
    levelsGained++;

    // Пересчитываем XP для следующего уровня
    const newXPToNextLevel = gameState.calculateXPRequired(currentLevel);

    // Обновляем состояние
    gameState.manager.setState({
      xp: currentXP,
      level: currentLevel,
      xpToNextLevel: newXPToNextLevel
    });

    console.log(`Повышение уровня! Новый уровень: ${currentLevel}, XP до следующего: ${newXPToNextLevel}`);
  }

  if (levelsGained > 0) {
    // Применяем бонусы за уровни
    applyLevelBonuses(levelsGained);

    // Показываем эффект
    showLevelUpEffect(levelsGained);

    // Обновляем UI
    updateLevelProgress();
    updateUI(['level', 'xp', 'xpToNextLevel']);
    updateAchievementsUI();

    // Сохраняем при повышении уровня
    setTimeout(() => gameState.save(true), 100);
  }
}

function applyLevelBonuses(levels) {
  const newTalents = { ...gameState.state.talents };
  newTalents.basic.damage += 2 * levels;
  gameState.manager.setState({ talents: newTalents });

  const newBoosts = { ...gameState.state.boosts };
  newBoosts.attackSpeed += 0.03 * levels;
  gameState.manager.setState({ boosts: newBoosts });

  console.log(`Получено ${levels} уровень(ей). Базовый урон: ${newTalents.basic.damage}`);
}

// =================== КАСТОМИЗАЦИЯ ===================
function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const tabElement = document.getElementById(tabName);
  const button = document.querySelector(`button[onclick="showTab('${tabName}')"]`);

  if (tabElement) tabElement.classList.add('active');
  if (button) button.classList.add('active');
}

async function selectSkin() {
  try {
    const selectedSkin = document.getElementById('selected-skin').src;
    const hiveImg = document.querySelector('.hive-img');
    if (hiveImg) {
      hiveImg.style.backgroundImage = `url('${selectedSkin}')`;
      gameState.manager.setState({
        currentSkin: selectedSkin,
        isUsingSkin: true
      });
      updateSkinButton();

      await gameState.save(true);
      console.log('✅ Скин сохранен в Firebase:', selectedSkin);

      showMessage('✅ Скин сохранен и применен!');
    }
  } catch (error) {
    console.error('❌ Ошибка сохранения скина:', error);
    showMessage('❌ Ошибка сохранения скина');
  }
  hidePopup('customization');
}

function previewSkin(skin, name) {
  const selectedSkin = document.getElementById('selected-skin');
  const skinName = document.getElementById('skin-name');

  if (selectedSkin) selectedSkin.src = skin;
  if (skinName) skinName.textContent = name;

  updateSkinButton();
}

function updateSkinButton() {
  const selectButton = document.getElementById('select-skin');
  const currentSkin = document.getElementById('selected-skin').src;
  if (selectButton) {
    if (currentSkin === gameState.state.currentSkin) {
      selectButton.disabled = true;
      selectButton.textContent = 'Выбрано';
    } else {
      selectButton.disabled = false;
      selectButton.textContent = 'Выбрать';
    }
  }
}

async function selectPet() {
  try {
    const selectedPet = document.getElementById('selected-pet').src;
    const petImg = document.querySelector('#pet-img');
    if (petImg) {
      petImg.src = selectedPet;
      gameState.manager.setState({
        currentPet: selectedPet,
        hasPet: true
      });
      petImg.style.display = 'block';
      updatePetButton();

      await gameState.save(true);
      console.log('✅ Питомец сохранен в Firebase:', selectedPet);

      showMessage('✅ Питомец сохранен!');
    }
  } catch (error) {
    console.error('❌ Ошибка сохранения питомца:', error);
    showMessage('❌ Ошибка сохранения питомца');
  }
  hidePopup('customization');
}

function previewPet(pet, name) {
  const selectedPet = document.getElementById('selected-pet');
  const petName = document.getElementById('pet-name');

  if (selectedPet) selectedPet.src = pet;
  if (petName) petName.textContent = name;

  updatePetButton();
}

function updatePetButton() {
  const selectButton = document.getElementById('select-pet');
  const currentPet = document.getElementById('selected-pet').src;
  if (selectButton) {
    if (currentPet === gameState.state.currentPet) {
      selectButton.disabled = true;
      selectButton.textContent = 'Выбрано';
    } else {
      selectButton.disabled = false;
      selectButton.textContent = 'Выбрать';
    }
  }
}

// =================== НАГРАДЫ ЗА ДОСТИЖЕНИЯ ===================
async function claimAchievementReward(type, level) {
  try {
    const state = gameState.state;
    const newAchievements = { ...state.achievements };

    // Определяем награду
    let reward = { honey: 0, xp: 0 };

    if (type === 'wasp') {
      if (level === 1 && !newAchievements.claimed.level1) {
        reward = { honey: 1000, xp: 500 };
        newAchievements.claimed.level1 = true;
      } else if (level === 2 && !newAchievements.claimed.level2) {
        reward = { honey: 2000, xp: 1000 };
        newAchievements.claimed.level2 = true;
      } else if (level === 3 && !newAchievements.claimed.level3) {
        reward = { honey: 3000, xp: 1500 };
        newAchievements.claimed.level3 = true;
      }
    } else if (type === 'bear') {
      if (level === 1 && !newAchievements.bearClaimed.level1) {
        reward = { honey: 2000, xp: 1000 };
        newAchievements.bearClaimed.level1 = true;
      } else if (level === 2 && !newAchievements.bearClaimed.level2) {
        reward = { honey: 4000, xp: 2000 };
        newAchievements.bearClaimed.level2 = true;
      } else if (level === 3 && !newAchievements.bearClaimed.level3) {
        reward = { honey: 6000, xp: 3000 };
        newAchievements.bearClaimed.level3 = true;
      }
    }

    // Выдаем награду
    gameState.scheduleUIUpdate('honey', state.honey + reward.honey);
    gameState.scheduleUIUpdate('xp', state.xp + reward.xp);

    // Обновляем состояние
    gameState.manager.setState({ achievements: newAchievements });

    // Обновляем UI
    updateUI(['honey', 'xp']);
    updateAchievementsUI();

    // Сохраняем
    await gameState.save(true);

    showMessage(`🎉 Получено: ${reward.honey}🍯 + ${reward.xp}⭐`);

    return true;
  } catch (error) {
    console.error('Ошибка получения награды:', error);
    return false;
  }
}

// =================== ВИЗУАЛЬНЫЕ ЭФФЕКТЫ ===================
function showMessage(text) {
  // Проверяем, есть ли уже сообщение
  const existingMessage = document.querySelector('.game-message');
  if (existingMessage) {
    existingMessage.remove();
  }

  const msg = document.createElement('div');
  msg.className = 'game-message';
  msg.textContent = text;
  document.body.appendChild(msg);
  setTimeout(() => {
    if (msg.parentNode) {
      msg.remove();
    }
  }, 2000);
}

function showLevelUpEffect(levels) {
  const div = document.createElement('div');
  div.className = 'level-up';
  div.textContent = `Уровень +${levels}!`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2000);
}

function showCriticalEffect(damage) {
  if (!elements.combatScreen) return;

  const div = document.createElement('div');
  div.className = 'critical-effect';
  div.textContent = `CRIT! ${damage}`;
  elements.combatScreen.appendChild(div);
  setTimeout(() => div.remove(), 1000);
}

function showEnergyWarning() {
  const div = document.createElement('div');
  div.className = 'energy-warning';
  div.textContent = 'Недостаточно энергии!';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1500);
}

function showSonicEffect(damage) {
  if (!elements.combatScreen) return;

  const effect = document.createElement('div');
  effect.className = 'sonic-effect';
  effect.textContent = `🔊 ${damage}`;
  elements.combatScreen.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

function showFireEffect(damage) {
  if (!elements.combatScreen) return;

  const effect = document.createElement('div');
  effect.className = 'fire-effect';
  effect.textContent = `🔥 ${damage}`;
  effect.style.color = '#ff4400';
  elements.combatScreen.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

function showIceEffect(damage) {
  if (!elements.combatScreen) return;

  const effect = document.createElement('div');
  effect.className = 'ice-effect';
  effect.textContent = `❄️ ${damage}`;
  effect.style.color = '#00cccc';
  elements.combatScreen.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

function showBasicEffect(damage) {
  if (!elements.combatScreen) return;

  const effect = document.createElement('div');
  effect.className = 'basic-effect';
  effect.textContent = `🗡️ ${damage}`;
  effect.style.color = '#ffd700';
  elements.combatScreen.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

function showPoisonAttackEffect(damage) {
  if (!elements.combatScreen) return;

  const effect = document.createElement('div');
  effect.className = 'poison-attack-effect';
  effect.textContent = `☠️ ${damage}`;
  effect.style.color = '#32CD32';
  elements.combatScreen.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

function showPoisonDamageEffect(damage) {
  if (!elements.combatScreen) return;

  const effect = document.createElement('div');
  effect.className = 'poison-damage-effect';
  effect.textContent = `☠️ ${damage}`;
  effect.style.color = '#32CD32';
  effect.style.position = 'absolute';
  effect.style.left = '50%';
  effect.style.top = '60%';
  effect.style.transform = 'translate(-50%, -50%)';
  effect.style.fontSize = '1.5em';
  effect.style.fontWeight = 'bold';
  effect.style.textShadow = '0 0 5px #000';
  effect.style.zIndex = '1002';
  effect.style.animation = 'damageEffect 1s ease-out forwards';

  elements.combatScreen.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

// =================== УТИЛИТЫ ===================
function getTalentButtonText(type) {
  const names = {
    basic: 'Базовый',
    critical: 'Критический',
    poison: 'Ядовитый'
  };
  return names[type] || '';
}

function getTalentIcon(type) {
  const icons = {
    basic: '🗡️',
    critical: '💥',
    poison: '☠️',
    sonic: '🔊',
    fire: '🔥',
    ice: '❄️'
  };
  return icons[type] || '';
}

// =================== ПРЕЛОАДЕР ===================
function showPreloader(text = 'Загрузка AIKO TAPBOT...') {
  const preloader = document.getElementById('preloader');
  const statusText = document.getElementById('preloaderStatus');

  if (preloader) {
    preloader.style.display = 'flex';
    preloader.classList.remove('hidden');
    if (statusText) statusText.textContent = text;
  }
}

function updatePreloaderProgress(percent) {
  const progressBar = document.getElementById('preloaderProgress');
  if (progressBar) {
    progressBar.style.width = `${Math.min(percent, 100)}%`;
  }
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  const gameScreen = document.getElementById('gameScreen');

  if (preloader) {
    setTimeout(() => {
      preloader.classList.add('hidden');

      if (gameScreen) {
        gameScreen.style.display = 'block';
      }

      setTimeout(() => {
        if (preloader.parentNode) {
          preloader.style.display = 'none';
        }
      }, 500);
    }, 500);
  }
}

// =================== СТАТУС FIREBASE ===================
function updateFirebaseStatusUI(isOnline) {
  const statusElement = document.getElementById('firebaseStatus');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  if (statusElement && statusDot && statusText) {
    if (isOnline) {
      statusElement.style.display = 'block';
      statusDot.className = 'status-dot online';
      statusText.textContent = 'Сохранено в облаке';

      setTimeout(() => {
        statusElement.style.opacity = '0';
        setTimeout(() => {
          statusElement.style.display = 'none';
          statusElement.style.opacity = '1';
        }, 500);
      }, 3000);
    } else {
      statusElement.style.display = 'block';
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'Нет интернета - данные не сохраняются';
    }
  }
}

// =================== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ СОБЫТИЙ ===================
function initEventHandlers() {
  // Клик по улью
  document.getElementById('hive')?.addEventListener('click', handleHiveClick);

  // Навигационные кнопки
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showPopup(btn.dataset.popup));
  });

  // Закрытие попапов
  document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
      const popup = btn.closest('.popup');
      if (popup.id === 'talentsPopup') {
        resetCrafting();
      }
      if (popup.id === 'battleResultPopup') {
        if (gameState.battleResult?.victory) {
          claimBattleReward();
        } else {
          closeBattleResult();
        }
      } else {
        const popupType = popup.id.replace('Popup', '');
        hidePopup(popupType);
      }
    });
  });

  // Клик по боссу в бою
  document.getElementById('bossCombatImage')?.addEventListener('click', handleBattleClick);

  // Выбор босса
  document.getElementById('battlePopup')?.addEventListener('click', (e) => {
    const bossCard = e.target.closest('.boss-card');
    if (bossCard && !bossCard.classList.contains('locked')) {
      startBattle(bossCard.dataset.boss);
    }
  });

  // Глобальный клик для закрытия попапов
  document.addEventListener('click', (e) => {
    const isPopup = e.target.closest('.popup');
    const isNav = e.target.closest('.nav-btn');
    const isCombat = e.target.closest('#combatScreen') || e.target.closest('.attack-btn');
    const isBackgroundSelector = e.target.closest('#backgroundSelector');
    const isBgMenuBtn = e.target.closest('#bgMenuBtn');

    if (!isPopup && !isNav && !isCombat && !isBackgroundSelector && !isBgMenuBtn) {
      hideAllPopups();
    }
  });

  // Обработка изменения размера окна
  window.addEventListener('resize', () => {
    updateHiveDisplay();
    updateCombatUI();
  });

  // Автосохранение при скрытии вкладки
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      gameState.save(true);
    }
  });

  // Сохранение при закрытии
  window.addEventListener('beforeunload', () => {
    gameState.save(true);
  });
}

// =================== ЗАПУСК ИГРЫ ===================
document.addEventListener('DOMContentLoaded', () => {
  // Инициализация при полной загрузке страницы
  if (document.readyState === 'complete') {
    initGame();
  } else {
    window.addEventListener('load', initGame);
  }

  // Глобальная обработка ошибок
  window.addEventListener('error', (e) => {
    logger.error('Глобальная ошибка', e.error);
    showMessage('⚠️ Произошла ошибка');
  });

  // Обработка необработанных промисов
  window.addEventListener('unhandledrejection', (e) => {
    logger.error('Необработанный Promise', e.reason);
  });
});
