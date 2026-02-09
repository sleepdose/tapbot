// =================== ИНИЦИАЛИЗАЦИЯ И КОНСТАНТЫ ===================
'use strict';

// Структурированный логгер
const logger = {
  info: function(msg, data) { console.log('ℹ️ ' + msg, data || ''); },
  warn: function(msg, data) { console.warn('⚠️ ' + msg, data || ''); },
  error: function(msg, error, data) { console.error('❌ ' + msg, error, data || ''); }
};

// ДОБАВЛЕНО: Флаг для отслеживания показа результатов боя
let battleResultShown = false;

// ДОБАВЛЕНО: Конфигурация достижений
const achievementsConfig = {
  wasp: {
    levels: [
      { kills: 10, honey: 1000, xp: 500 },
      { kills: 20, honey: 2000, xp: 1000 },
      { kills: 30, honey: 3000, xp: 1500 }
    ]
  },
  bear: {
    levels: [
      { kills: 10, honey: 2000, xp: 1000 },
      { kills: 20, honey: 4000, xp: 2000 },
      { kills: 30, honey: 6000, xp: 3000 }
    ]
  }
};

// Предзагрузка ресурсов
const ImagePreloader = {
  images: new Set(),

  preload: function(url) {
    return new Promise(function(resolve) {
      if (this.images.has(url)) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = function() {
        this.images.add(url);
        resolve();
      }.bind(this);
      img.onerror = function() {
        console.warn('Не удалось загрузить: ' + url);
        resolve();
      };
      img.src = url;
    }.bind(this));
  },

  preloadAll: async function() {
    const imageUrls = [
      'img/wasp.jpg', 'img/bear.jpg', 'img/dragon.jpg',
      'img/hydra.jpg', 'img/kraken.jpg',
      'img/human_male.png', 'img/skin2.png', 'img/skin3.png',
      'img/pet1.png', 'img/pet2.png', 'img/pet3.png',
      'img/background1.png', 'img/background2.png', 'img/background3.png'
    ];

    await Promise.all(imageUrls.map(function(url) {
      return this.preload(url);
    }.bind(this)));
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
    this.state = Object.assign({}, oldState, newState);
    this.notifyListeners(oldState, this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return function() {
      this.listeners.delete(listener);
    }.bind(this);
  }

  notifyListeners(oldState, newState) {
    this.listeners.forEach(function(listener) {
      listener(oldState, newState);
    });
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
      lastAttackTime: 0,

      // Новые поля для сохранения незакрытых результатов боя
      pendingBattleResult: null,
      pendingBattleResultType: null
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
        this.rafId = requestAnimationFrame(function() {
          const updates = {};
          this.rafCallbacks.forEach(function(value, key) {
            updates[key] = value;
          }.bind(this));
          this.manager.setState(updates);
          this.rafCallbacks.clear();
          this.rafId = null;
        }.bind(this));
      }
    } else {
      this.rafCallbacks.set(key, value);
    }
  }

  calculateXPRequired(level) {
    return Math.floor(100 * Math.pow(1.2, level - 1));
  }

  // Оптимизированное сохранение
  async save(force) {
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
    return new Promise(function(resolve) {
      this.saveDebounceTimer = setTimeout(async function() {
        try {
          if (window.firebaseManager) {
            // Увеличиваем общее время игры
            const newState = Object.assign({}, this.state, {
              totalPlayTime: this.state.totalPlayTime + (Date.now() - this.state.lastSaveTime),
              lastSaveTime: Date.now(),
              saveCount: this.state.saveCount + 1
            });

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
      }.bind(this), force ? 0 : 100);
    }.bind(this));
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

          logger.info('✅ Данные загружены из: ' + result.source);
          if (typeof updateFirebaseStatusUI === 'function') {
            updateFirebaseStatusUI(result.source === 'firebase');
          }

          // Восстанавливаем бой если он был активен
          if (result.data.activeBattle) {
            this.restoreBattle(result.data);
          }

          // Восстанавливаем незакрытый результат боя если он есть
          if (result.data.pendingBattleResult) {
            console.log('Восстанавливаем незакрытый результат боя:', result.data.pendingBattleResultType);
            this.battleResult = result.data.pendingBattleResult;

            // Откладываем показ попапа, чтобы UI успел загрузиться
            setTimeout(() => {
              updateResultPopup();
              showBattleResultPopup();
            }, 2000);
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
      const effectiveMinutes = Math.min(minutesPassed, 24 * 60); // Максимум 24 часа
      const energyToRestore = Math.min(maxRecoveryMinutes, Math.floor(effectiveMinutes));

      if (energyToRestore > 0) {
        const newEnergy = Math.min(
          maxEnergy,
          currentEnergy + energyToRestore
        );

        this.manager.setState({ energy: newEnergy });

        // Показываем уведомление
        setTimeout(function() {
          if (energyToRestore > 0) {
            showMessage('⚡ Восстановлено ' + energyToRestore + ' энергии за оффлайн время');
          }
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
    const bossHealth = (savedData.currentBoss && savedData.currentBoss.currentHealth) ||
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

      // Сохраняем поражение
      const newAchievements = Object.assign({}, savedData.achievements);
      this.manager.setState({
        inBattle: false,
        activeBattle: null,
        battleStartTime: null,
        battleTimeLimit: null,
        currentBoss: null,
        achievements: newAchievements
      });

      setTimeout(() => {
        this.save(true);
      }, 500);

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
        maxHealth: (savedData.currentBoss && savedData.currentBoss.maxHealth) || bossConfig.health,
        image: bossConfig.image
      }
    });

    console.log('⚔️ Восстановлен бой с ' + savedData.activeBattle.type + ', здоровье: ' + bossHealth);

    // Запускаем таймер с оставшимся временем
    const timeLeft = Math.ceil((timeLimit - timePassed) / 1000);
    this.startBattleTimer(timeLeft);

    // Восстанавливаем UI боя
    setTimeout(function() {
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
      boss: Object.assign({}, battleData, bossConfig),
      reward: victory ? this.calculateReward(battleData) : null
    };

    setTimeout(function() {
      updateResultPopup();
      showBattleResultPopup();
      showMessage('⚔️ Офлайн бой завершен: ' + (victory ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'));
    }, 1500);
  }

  async applyLoadedData(data) {
    try {
      console.log('Применение загруженных данных:', data);

      // Глубокая функция для слияния объектов
      const deepMerge = function(target, source) {
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
      const newState = deepMerge(Object.assign({}, this.manager.state), data);

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
        talents: data.talents ? Object.assign(
          {},
          this.manager.state.talents,
          data.talents
        ) : this.manager.state.talents,

        attackCharges: data.attackCharges ? Object.assign(
          {},
          this.manager.state.attackCharges,
          data.attackCharges
        ) : this.manager.state.attackCharges,

        craftedTalents: data.craftedTalents ? Object.assign(
          {},
          this.manager.state.craftedTalents,
          data.craftedTalents
        ) : this.manager.state.craftedTalents,

        keys: data.keys ? Object.assign(
          {},
          this.manager.state.keys,
          data.keys
        ) : this.manager.state.keys,

        achievements: data.achievements ? Object.assign(
          {},
          this.manager.state.achievements,
          data.achievements
        ) : this.manager.state.achievements,

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
        battleStats: data.battleStats ? Object.assign(
          {},
          this.manager.state.battleStats,
          data.battleStats
        ) : this.manager.state.battleStats,

        // Незакрытые результаты боя
        pendingBattleResult: data.pendingBattleResult || null,
        pendingBattleResultType: data.pendingBattleResultType || null,

        // Аудио настройки
        isMusicMuted: data.isMusicMuted !== undefined ? data.isMusicMuted : this.manager.state.isMusicMuted
      };

      // Применяем обновленное состояние
      this.manager.setState(safeMerge);

      // Применяем визуальные эффекты
      this.applyVisualEffects();

      // ДОБАВЛЕНО: Мгновенное обновление ключей после загрузки
      setTimeout(() => {
        if (data.keys) {
          this.updateKeysDisplay();
          updateKeysImmediately(); // Немедленное обновление
        }
      }, 100);

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
      hiveImg.style.backgroundImage = 'url(\'' + this.state.currentSkin + '\')';
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
      const currentBg = backgrounds.find(function(bg) {
        return bg.name === this.state.currentBackground;
      }.bind(this));
      if (currentBg) {
        document.body.style.backgroundImage = currentBg.image;
      }
    }

    // Обновляем ключи
    this.updateKeysDisplay();

    // Обновляем отображение талантов
    updateTalentPrices();
    updateTalentLevelsDisplay();
  }

  updateKeysDisplay() {
    document.querySelectorAll('.current-keys').forEach(function(el) {
      const bossType = el.dataset.boss;
      if (this.state.keys[bossType] !== undefined) {
        el.textContent = this.state.keys[bossType];
      }
    }.bind(this));
  }

  cleanupBattleEffects() {
    this.battleEffects.forEach(function(effect) {
      if (effect.interval) clearInterval(effect.interval);
      if (effect.timeout) clearTimeout(effect.timeout);
    });
    this.battleEffects.clear();

    // Очищаем контейнер таймеров
    const poisonContainer = document.getElementById('poisonTimersContainer');
    if (poisonContainer) {
      poisonContainer.innerHTML = '';
    }
  }

  startBattleTimer(seconds) {
    if (this.battleTimer) clearInterval(this.battleTimer);
    let timeLeft = seconds;

    const timerElement = document.getElementById('combatTimer');
    if (timerElement) timerElement.textContent = timeLeft;

    this.battleTimer = setInterval(function() {
      if (!this.state.inBattle || !this.state.currentBoss || this.state.currentBoss.currentHealth <= 0) {
        clearInterval(this.battleTimer);
        this.battleTimer = null;
        return;
      }

      timeLeft--;
      if (timerElement) {
        timerElement.textContent = timeLeft;
        timerElement.style.color = timeLeft <= 10 ? 'red' : 'white';
      }

      if (timeLeft <= 0) {
        this.endBattle(false, this.state.currentBoss?.type, this.state.currentBoss?.maxHealth);
        const bossImage = document.getElementById('bossCombatImage');
        if (bossImage) bossImage.classList.add('grayscale');
        clearInterval(this.battleTimer);
        this.battleTimer = null;
      }
    }.bind(this), 1000);
  }

  endBattle(victory, bossType = null, bossMaxHealth = null) {
    // Если тип босса не передан, пытаемся получить из состояния
    if (!bossType && this.state.currentBoss) {
      bossType = this.state.currentBoss.type;
      bossMaxHealth = this.state.currentBoss.maxHealth;
    }

    // Если все еще нет данных о боссе, выходим
    if (!bossType) {
      console.error('Не удалось определить тип босса для завершения битвы');
      return;
    }

    console.log('Завершение битвы:', {
      victory: victory,
      boss: bossType,
      bossMaxHealth: bossMaxHealth
    });

    const bossConfig = gameConfig.bosses[bossType];
    if (!bossConfig) {
      console.error('Конфигурация босса не найдена для типа:', bossType);
      return;
    }

    const reward = victory ? {
      honey: bossConfig.honeyReward,
      xp: bossConfig.xpReward,
      keys: bossConfig.keyReward ? { [bossConfig.keyReward.type]: bossConfig.keyReward.amount } : {}
    } : null;

    // ДОБАВЛЕНО: Корректируем статистику урона перед сохранением
    const totalDamage = this.state.battleStats.totalDamage || 0;

    if (totalDamage > bossMaxHealth) {
      const newStats = Object.assign({}, this.state.battleStats);
      const difference = totalDamage - bossMaxHealth;

      // Распределяем корректировку пропорционально
      Object.keys(newStats).forEach(function(key) {
        if (key !== 'totalDamage' && newStats[key] > 0) {
          const proportion = newStats[key] / (totalDamage - difference);
          newStats[key] = Math.max(0, Math.round(newStats[key] - (difference * proportion)));
        }
      });

      newStats.totalDamage = bossMaxHealth;
      this.manager.setState({ battleStats: newStats });
    }

    // Создаем объект босса для результата
    const bossData = {
      type: bossType,
      currentHealth: 0,
      maxHealth: bossMaxHealth || bossConfig.health
    };

    this.manager.setState({
      pendingBattleResult: {
        victory: victory,
        boss: bossData,
        reward: reward,
        battleStats: this.state.battleStats
      },
      pendingBattleResultType: victory ? 'victory' : 'defeat',
      activeBattle: null,
      battleStartTime: null,
      battleTimeLimit: null,
      inBattle: false,
      currentBoss: null,
      selectedTalent: null
    });

    // Полная очистка ядовитых эффектов
    this.cleanupBattleEffects();

    const bossCombatImage = document.getElementById('bossCombatImage');
    if (bossCombatImage) bossCombatImage.classList.remove('grayscale');

    this.battleResult = {
      victory: victory,
      boss: bossData,
      reward: reward
    };

    console.log('Battle result установлен:', this.battleResult);

    if (this.battleTimer) {
      clearInterval(this.battleTimer);
      this.battleTimer = null;
    }

    // ДОБАВЛЕНО: Сбрасываем флаг показа результатов
    battleResultShown = false;

    // Сохраняем прогресс после боя
    setTimeout(() => {
      this.save(true);
    }, 1000);
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
    getDamage: function(level) { return 10 + (level * 2); },
    getCost: function(level) { return Math.floor(75 * Math.pow(1.3, level - 1)); }
  },
  critical: {
    maxLevel: 10,
    getChance: function(level) { return 0.15 + (level * 0.05); },
    getCost: function(level) { return Math.floor(150 * Math.pow(1.3, level - 1)); }
  },
  poison: {
    maxLevel: 10,
    getDamage: function(level) { return 2 + level; },
    getDuration: function(level) { return 5 + level; },
    getCost: function(level) { return Math.floor(200 * Math.pow(1.3, level - 1)); }
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

// =================== НОВЫЕ ФУНКЦИИ ДЛЯ ИСПРАВЛЕНИЙ ===================

// ДОБАВЛЕНО: Функция для мгновенного обновления ключей
function updateKeysImmediately() {
  if (!gameState) return;

  const keys = gameState.state.keys;

  // Обновляем отображение всех ключей
  document.querySelectorAll('.current-keys').forEach(el => {
    const bossType = el.dataset.boss;
    if (keys[bossType] !== undefined) {
      el.textContent = keys[bossType];

      // Обновляем состояние блокировки карточки
      const bossCard = el.closest('.boss-card');
      if (bossCard) {
        const isLocked = keys[bossType] < 3;
        bossCard.classList.toggle('locked', isLocked);
      }
    }
  });
}

// ДОБАВЛЕНО: Функция для расчета фактического урона (не превышающего HP босса)
function calculateActualDamage(damage, currentHealth) {
  return Math.min(damage, currentHealth);
}

// ДОБАВЛЕНО: Функция обновления достижений при победе
function updateAchievementsOnVictory(bossType) {
  if (!gameState) return;

  const state = gameState.state;
  const newAchievements = Object.assign({}, state.achievements);

  // Обновляем счетчик убийств
  if (bossType === 'wasp') {
    newAchievements.waspKills = (newAchievements.waspKills || 0) + 1;
  } else if (bossType === 'bear') {
    newAchievements.bearKills = (newAchievements.bearKills || 0) + 1;
  }

  // Обновляем статусы выполнения достижений
  updateAchievementCompletion(newAchievements, bossType);

  // Сохраняем обновленные достижения
  gameState.manager.setState({ achievements: newAchievements });

  // Немедленно обновляем UI
  updateAchievementsUI();

  // Сохраняем в Firebase
  setTimeout(() => gameState.save(true), 500);
}

// ДОБАВЛЕНО: Функция обновления статусов достижений
function updateAchievementCompletion(achievements, bossType) {
  const config = achievementsConfig[bossType];
  if (!config) return;

  const killsKey = bossType === 'wasp' ? 'waspKills' : 'bearKills';
  const kills = achievements[killsKey] || 0;
  const completedKey = bossType === 'wasp' ? 'completed' : 'bearCompleted';

  // Проверяем каждый уровень
  config.levels.forEach((level, index) => {
    const levelNum = index + 1;
    const levelKey = 'level' + levelNum;

    if (kills >= level.kills) {
      achievements[completedKey][levelKey] = true;
    }
  });
}

// ДОБАВЛЕНО: Функция обновления элемента достижения
function updateAchievementElement(type, kills, completed, claimed, config) {
  const levelElement = document.getElementById(type + 'Level');
  const progress = document.getElementById(type + 'KillProgress');
  const killCount = document.getElementById(type + 'KillCount');

  if (!levelElement || !progress || !killCount) return;

  // Определяем текущий уровень
  let currentLevel = 0;
  let nextKills = config.levels[0].kills;
  let progressPercent = 0;

  for (let i = 0; i < config.levels.length; i++) {
    const level = config.levels[i];

    if (kills >= level.kills) {
      currentLevel = i + 1;
      if (i < config.levels.length - 1) {
        nextKills = config.levels[i + 1].kills - level.kills;
      }
    }
  }

  // Обновляем отображение
  if (currentLevel >= config.levels.length) {
    levelElement.textContent = 'Максимум';
    progressPercent = 100;
    killCount.textContent = kills + '/' + kills;
  } else {
    levelElement.textContent = 'Уровень ' + currentLevel;
    const currentLevelKills = currentLevel > 0 ? config.levels[currentLevel - 1].kills : 0;
    const killsInCurrentLevel = kills - currentLevelKills;
    progressPercent = (killsInCurrentLevel / (config.levels[currentLevel].kills - currentLevelKills)) * 100;
    killCount.textContent = killsInCurrentLevel + '/' + (config.levels[currentLevel].kills - currentLevelKills);
  }

  progress.style.width = Math.min(progressPercent, 100) + '%';

  // Обновляем кнопки получения наград
  for (let i = 1; i <= 3; i++) {
    const claimBtn = document.getElementById('claim' + type.charAt(0).toUpperCase() + type.slice(1) + i);
    if (claimBtn) {
      const levelKey = 'level' + i;
      const isCompleted = completed[levelKey] || false;
      const isClaimed = claimed[levelKey] || false;

      claimBtn.style.display = (isCompleted && !isClaimed) ? 'block' : 'none';
      claimBtn.disabled = isClaimed;
      claimBtn.textContent = isClaimed ? 'Получено' : 'Получить награду';
    }
  }
}

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
        console.warn('Попытка ' + (loadAttempts + 1) + ' загрузки не удалась:', loadError);
        loadAttempts++;
        await new Promise(function(resolve) {
          setTimeout(resolve, 1000);
        });
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

    setTimeout(function() {
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
    if (window.Telegram && window.Telegram.WebApp) {
      tg = window.Telegram.WebApp;
      tg.expand();

      // Настройка Telegram интерфейса
      tg.setHeaderColor('#8B4513');
      tg.setBackgroundColor('#8B4513');
      tg.enableClosingConfirmation();

      // Кнопка "Назад"
      if (tg.BackButton) {
        tg.BackButton.onClick(function() {
          const activePopup = document.querySelector('.popup.active');
          if (activePopup) {
            hideAllPopups();
          } else {
            tg.BackButton.hide();
          }
        });
      }

      if (tg.onEvent) {
        tg.onEvent('viewportChanged', handleViewportChange);
      }

      logger.info('Telegram WebApp инициализирован');
    }
  } catch (error) {
    logger.warn('Telegram WebApp не доступен', error);
  }
}

function handleViewportChange() {
  updateHiveDisplay();
  updateCombatUI();
}

function initUI() {
  // Подписка на изменения состояния
  gameState.subscribe(function(oldState, newState) {
    updateGameUI(oldState, newState);

    // ДОБАВЛЕНО: Обновляем кнопки улучшения талантов при изменении меда
    if (oldState.honey !== newState.honey) {
      updateTalentPrices();
    }
  });

  // Инициализация элементов
  updateHiveDisplay();
  updateUI();
  updateBossAvailability();
  updateAchievementsUI();
  updateTalentLevelsDisplay();

  // ДОБАВЛЕНО: Инициализируем цены талантов
  updateTalentPrices();

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
    updateKeysImmediately(); // ДОБАВЛЕНО: Мгновенное обновление
  }

  // Применяем изменения
  Object.keys(changes).forEach(function(key) {
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
  const claimRewardButton = document.getElementById('claimRewardButton');
  if (claimRewardButton) {
    claimRewardButton.addEventListener('click', claimBattleReward);
  }

  const closeResultButton = document.getElementById('closeResultButton');
  if (closeResultButton) {
    closeResultButton.addEventListener('click', closeBattleResult);
  }

  // Сетевые слушатели
  initNetworkListeners();
}

function startGameLoops() {
  // Восстановление энергии
  gameState.energyRecoveryInterval = setInterval(function() {
    if (gameState.state.energy < gameState.state.maxEnergy) {
      gameState.scheduleUIUpdate('energy', Math.min(
        gameState.state.energy + 1,
        gameState.state.maxEnergy
      ));
    }
  }, 3000);

  // Автосохранение
  setInterval(function() {
    gameState.save();
  }, 30000);

  // Проверка онлайна друзей
  setInterval(function() {
    if (window.firebaseManager && window.firebaseManager.isOnline) {
      updateFriendsOnlineStatus();
    }
  }, 60000);
}

// =================== СЕТЕВЫЕ СЛУШАТЕЛИ ===================
function initNetworkListeners() {
  window.addEventListener('online', function() {
    console.log('Сетевое соединение восстановлено');
    showMessage('🌐 Подключение к интернету восстановлено');

    // Пытаемся сохранить данные если менеджер доступен
    if (window.firebaseManager) {
      window.firebaseManager.isOnline = true;
      setTimeout(function() {
        gameState.save();
      }, 1000);
    }
  });

  window.addEventListener('offline', function() {
    console.log('Сетевое соединение потеряно');
    showMessage('⚠️ Потеряно соединение с интернетом');

    if (window.firebaseManager) {
      window.firebaseManager.isOnline = false;
    }
  });
}

// =================== ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ UI ===================
function updateUI(keys) {
  if (!keys) keys = ['all'];
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
    elements.levelProgress.style.width = Math.min(progress, 100) + '%';
  }
}

function updateHiveDisplay() {
  const hiveImg = document.querySelector('.hive-img');
  if (hiveImg && gameState.state.currentSkin) {
    hiveImg.style.backgroundImage = 'url(\'' + gameState.state.currentSkin + '\')';
  }
}

function updateBossAvailability() {
  document.querySelectorAll('.boss-card').forEach(function(card) {
    const bossType = card.dataset.boss;
    let isLocked = false;

    if (bossType === 'bear' || bossType === 'dragon' || bossType === 'hydra' || bossType === 'kraken') {
      isLocked = gameState.state.keys[bossType] < 3;
    }

    card.classList.toggle('locked', isLocked);
  });
}

// ДОБАВЛЕНО: Новая функция обновления достижений
function updateAchievementsUI() {
  const state = gameState.state;

  // ОСЫ
  const waspKills = state.achievements.waspKills || 0;
  const waspCompleted = state.achievements.completed || {};
  const waspClaimed = state.achievements.claimed || {};

  updateAchievementElement('wasp', waspKills, waspCompleted, waspClaimed, achievementsConfig.wasp);

  // МЕДВЕДИ
  const bearKills = state.achievements.bearKills || 0;
  const bearCompleted = state.achievements.bearCompleted || {};
  const bearClaimed = state.achievements.bearClaimed || {};

  updateAchievementElement('bear', bearKills, bearCompleted, bearClaimed, achievementsConfig.bear);
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
      elements.backgroundMusic.play().catch(function(error) {
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
  document.querySelectorAll('.friends-tabs .tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.friends-tabs .tab-btn, .friends-tab').forEach(function(el) {
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
  const sendFriendRequestBtn = document.getElementById('sendFriendRequestBtn');
  if (sendFriendRequestBtn) {
    sendFriendRequestBtn.addEventListener('click', sendFriendRequest);
  }

  // Кнопка копирования своего ID
  const copyMyIdBtn = document.getElementById('copyMyIdBtn');
  if (copyMyIdBtn) {
    copyMyIdBtn.addEventListener('click', copyMyTelegramId);
  }

  // Поиск по друзьям
  const searchFriendInput = document.getElementById('searchFriend');
  if (searchFriendInput) {
    searchFriendInput.addEventListener('input', filterFriendsList);
  }

  // Показываем свой Telegram ID
  updateMyTelegramId();
}

async function updateMyTelegramId() {
  try {
    const myIdElement = document.getElementById('myTelegramId');
    const copyBtn = document.getElementById('copyMyIdBtn');

    // Получаем Telegram ID из WebApp
    const telegramId = window.Telegram && window.Telegram.WebApp &&
                       window.Telegram.WebApp.initDataUnsafe &&
                       window.Telegram.WebApp.initDataUnsafe.user &&
                       window.Telegram.WebApp.initDataUnsafe.user.id;

    if (telegramId) {
      if (myIdElement) myIdElement.textContent = telegramId;
      if (copyBtn) copyBtn.style.display = 'inline-block';

      // Проверяем, сохранен ли Telegram ID в Firebase
      if (window.firebaseManager) {
        setTimeout(async function() {
          try {
            const telegramIdFromFirebase = await window.firebaseManager.getCurrentTelegramId();

            if (!telegramIdFromFirebase) {
              console.warn('Telegram ID не найден в Firebase. Сохраняем игру...');
              if (gameState) {
                await gameState.save(true);
              }
            }

            // Получаем количество друзей для отображения
            const friendsCount = await window.firebaseManager.getFriendsCount(
              window.firebaseManager.currentUser ? window.firebaseManager.currentUser.uid : null
            );

            // Обновляем счетчик друзей
            let counter = myIdElement ? myIdElement.parentElement.querySelector('.friends-counter') : null;
            if (!counter && myIdElement && myIdElement.parentElement) {
              counter = document.createElement('div');
              counter.className = 'friends-counter';
              myIdElement.parentElement.appendChild(counter);
            }
            if (counter) {
              counter.innerHTML = '<span style="font-size: 0.9em; color: rgba(255,255,255,0.7);">Друзей: ' + friendsCount + '/20</span>';
            }

          } catch (error) {
            console.error('Ошибка получения данных друзей:', error);
          }
        }, 2000);
      }
    } else {
      if (myIdElement) myIdElement.textContent = 'Откройте игру через Telegram';
      if (copyBtn) copyBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('Ошибка получения Telegram ID:', error);
    const myIdElement = document.getElementById('myTelegramId');
    if (myIdElement) myIdElement.textContent = 'Ошибка загрузки';
  }
}

function copyMyTelegramId() {
  const myIdElement = document.getElementById('myTelegramId');
  if (!myIdElement) return;

  const myId = myIdElement.textContent;
  if (myId && myId !== 'Откройте игру через Telegram') {
    navigator.clipboard.writeText(myId).then(function() {
      showMessage('✅ ID скопирован в буфер обмена!');
    }).catch(function() {
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
    if (!friendsContainer) return;

    friendsContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const friends = await window.firebaseManager.getFriends();
    gameState.manager.setState({ friends: friends });

    console.log('Загружено друзей:', friends.length);
    displayFriendsList(friends);
  } catch (error) {
    console.error('Ошибка загрузки друзей:', error);
    const friendsContainer = document.getElementById('friendsContainer');
    if (friendsContainer) {
      friendsContainer.innerHTML = '<div class="empty-state">❌ Ошибка загрузки друзей</div>';
    }
  }
}

function displayFriendsList(friends, searchQuery) {
  const friendsContainer = document.getElementById('friendsContainer');
  if (!friendsContainer) return;

  friendsContainer.innerHTML = '';

  if (friends.length === 0) {
    if (searchQuery) {
      friendsContainer.innerHTML = '<div class="empty-state">🔍 Друзья с ID "' + searchQuery + '" не найдены</div>';
    } else {
      friendsContainer.innerHTML = '<div class="empty-state">👥 У вас пока нет друзей</div>';
    }
    return;
  }

  // Показываем счетчик друзей
  const friendsCounter = document.createElement('div');
  friendsCounter.className = 'friends-counter';
  friendsCounter.innerHTML = '<span>Друзей: ' + friends.length + '/20</span>';
  if (friends.length >= 20) {
    friendsCounter.innerHTML += '<span style="color: #ff6b6b; margin-left: 10px;">Лимит достигнут!</span>';
  }
  friendsContainer.appendChild(friendsCounter);

  friends.forEach(function(friend) {
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

  card.innerHTML = '<div class="friend-header"><div class="friend-info"><h4>' + (friend.username || 'Неизвестный') + '</h4><div class="friend-status"><span class="status-dot" style="background: ' + statusColor + ';"></span><span>' + statusText + '</span><span style="margin-left: auto; font-family: monospace; font-size: 0.9em;">ID: ' + (friend.telegramId || '???') + '</span></div></div><div class="friend-level" style="background: rgba(139, 69, 19, 0.3); padding: 5px 10px; border-radius: 10px;">Ур. ' + (friend.level || 1) + '</div></div><div class="friend-stats"><div class="stat-item-small">🍯 ' + formatNumber(friend.honey || 0) + '</div><div class="stat-item-small">⭐ ' + formatNumber(friend.xp || 0) + ' XP</div><div class="stat-item-small">🕐 ' + (friend.lastOnline ? formatLastSeen(friend.lastOnline) : 'Неизвестно') + '</div><div class="stat-item-small">📅 ' + (friend.lastOnline ? formatDate(friend.lastOnline) : 'Нет данных') + '</div></div><div class="friend-actions"><button class="remove-friend-btn" data-friend-id="' + friend.id + '">🗑️ Удалить из друзей</button></div>';

  // Обработчик удаления друга
  const removeButton = card.querySelector('.remove-friend-btn');
  if (removeButton) {
    removeButton.addEventListener('click', async function(e) {
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
  }

  return card;
}

function filterFriendsList() {
  const searchInput = document.getElementById('searchFriend');
  if (!searchInput) return;

  const searchText = searchInput.value.trim();
  const friends = gameState.state.friends;

  if (!searchText) {
    // Показываем всех друзей
    displayFriendsList(friends);
    return;
  }

  // Ищем только по Telegram ID
  const filteredFriends = friends.filter(function(friend) {
    return friend.telegramId && friend.telegramId.toString().includes(searchText);
  });

  displayFriendsList(filteredFriends, searchText);
}

async function sendFriendRequest() {
  try {
    const telegramIdInput = document.getElementById('friendTelegramId');
    const messageInput = document.getElementById('friendMessage');

    if (!telegramIdInput || !messageInput) {
      showMessage('❌ Ошибка формы');
      return;
    }

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

    // Проверяем, не отправляем ли заявку себе
    const myTelegramIdElement = document.getElementById('myTelegramId');
    if (myTelegramIdElement && myTelegramIdElement.textContent === telegramId) {
      showMessage('❌ Нельзя отправить заявку самому себе');
      return;
    }

    // Показываем индикатор загрузки
    const sendBtn = document.getElementById('sendFriendRequestBtn');
    if (!sendBtn) return;

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
      document.querySelectorAll('.friends-tabs .tab-btn, .friends-tab').forEach(function(el) {
        el.classList.remove('active');
      });
      const friendRequestsTab = document.querySelector('.friends-tabs .tab-btn[data-tab="friendRequests"]');
      const friendRequestsContent = document.getElementById('friendRequests');
      if (friendRequestsTab) friendRequestsTab.classList.add('active');
      if (friendRequestsContent) friendRequestsContent.classList.add('active');

      // Загружаем заявки
      loadFriendRequests();
    } else {
      showMessage('❌ ' + (result.error || 'Неизвестная ошибка'));
    }
  } catch (error) {
    console.error('Ошибка отправки заявки:', error);
    showMessage('❌ Ошибка отправки заявки');

    const sendBtn = document.getElementById('sendFriendRequestBtn');
    if (sendBtn) {
      sendBtn.textContent = 'Отправить заявку';
      sendBtn.disabled = false;
    }
  }
}

async function loadFriendRequests() {
  try {
    if (!window.firebaseManager) {
      showMessage('❌ Firebase не инициализирован');
      return;
    }

    const requestsContainer = document.getElementById('requestsContainer');
    if (!requestsContainer) return;

    requestsContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const requests = await window.firebaseManager.getFriendRequests();
    gameState.manager.setState({ friendRequests: requests });

    console.log('Загружено заявок:', {
      incoming: requests.incoming ? requests.incoming.length : 0,
      outgoing: requests.outgoing ? requests.outgoing.length : 0
    });

    // Обновляем счетчик заявок
    const badge = document.getElementById('requestsCount');
    if (badge) {
      const incomingCount = requests.incoming ? requests.incoming.length : 0;
      badge.textContent = incomingCount;
      badge.style.display = incomingCount > 0 ? 'inline-flex' : 'none';
    }

    if ((!requests.incoming || requests.incoming.length === 0) &&
        (!requests.outgoing || requests.outgoing.length === 0)) {
      requestsContainer.innerHTML = '<div class="empty-state">📭 У вас нет заявок в друзья</div>';
      return;
    }

    requestsContainer.innerHTML = '';

    // Входящие заявки
    if (requests.incoming && requests.incoming.length > 0) {
      const incomingHeader = document.createElement('h4');
      incomingHeader.textContent = 'Входящие заявки (' + requests.incoming.length + '):';
      incomingHeader.style.marginBottom = '10px';
      incomingHeader.style.color = 'var(--accent)';
      requestsContainer.appendChild(incomingHeader);

      requests.incoming.forEach(function(request) {
        const requestCard = createRequestCard(request, 'incoming');
        requestsContainer.appendChild(requestCard);
      });
    }

    // Исходящие заявки
    if (requests.outgoing && requests.outgoing.length > 0) {
      const outgoingHeader = document.createElement('h4');
      outgoingHeader.textContent = 'Исходящие заявки (' + requests.outgoing.length + '):';
      outgoingHeader.style.marginTop = '20px';
      outgoingHeader.style.marginBottom = '10px';
      outgoingHeader.style.color = 'var(--accent)';
      requestsContainer.appendChild(outgoingHeader);

      requests.outgoing.forEach(function(request) {
        const requestCard = createRequestCard(request, 'outgoing');
        requestsContainer.appendChild(requestCard);
      });
    }
  } catch (error) {
    console.error('Ошибка загрузки заявок:', error);
    const requestsContainer = document.getElementById('requestsContainer');
    if (requestsContainer) {
      requestsContainer.innerHTML = '<div class="empty-state">❌ Ошибка загрузки заявок</div>';
    }
  }
}

function createRequestCard(request, type) {
  const card = document.createElement('div');
  card.className = 'request-card';

  if (type === 'incoming') {
    card.innerHTML = '<div class="request-info"><div style="display: flex; justify-content: space-between; align-items: center;"><strong>' + (request.fromName || 'Неизвестный') + '</strong><span style="font-family: monospace; font-size: 0.9em; color: rgba(255,255,255,0.7);">ID: ' + (request.fromTelegramId || '???') + '</span></div>' + (request.message ? '<div style="margin-top: 5px; font-size: 0.9em; color: rgba(255,255,255,0.8);">💬 "' + request.message + '"</div>' : '') + '<div style="font-size: 0.8em; color: rgba(255,255,255,0.6); margin-top: 5px;">📅 ' + formatDate(request.createdAt) + '</div></div><div class="request-actions"><button class="accept-btn" data-request-id="' + request.id + '">✓ Принять</button><button class="reject-btn" data-request-id="' + request.id + '">✗ Отклонить</button></div>';

    // Обработчики для кнопок принятия/отклонения
    const acceptBtn = card.querySelector('.accept-btn');
    const rejectBtn = card.querySelector('.reject-btn');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', async function(e) {
        const requestId = e.target.dataset.requestId;
        const result = await window.firebaseManager.respondToFriendRequest(requestId, true);
        if (result.success) {
          showMessage('✅ Заявка принята! Теперь вы друзья!');
          loadFriendRequests();
          loadFriendsList();
        } else {
          showMessage('❌ ' + (result.error || 'Неизвестная ошибка'));
        }
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', async function(e) {
        const requestId = e.target.dataset.requestId;
        const result = await window.firebaseManager.respondToFriendRequest(requestId, false);
        if (result.success) {
          showMessage('Заявка отклонена');
          loadFriendRequests();
        } else {
          showMessage('❌ ' + (result.error || 'Неизвестная ошибка'));
        }
      });
    }
  } else {
    card.innerHTML = '<div class="request-info"><div style="display: flex; justify-content: space-between; align-items: center;"><strong>' + (request.toName || 'Неизвестный') + '</strong><span style="font-family: monospace; font-size: 0.9em; color: rgba(255,255,255,0.7);">ID: ' + (request.toTelegramId || '???') + '</span></div>' + (request.message ? '<div style="margin-top: 5px; font-size: 0.9em; color: rgba(255,255,255,0.8);">💬 "' + request.message + '"</div>' : '') + '<div style="font-size: 0.8em; color: rgba(255,255,255,0.6); margin-top: 5px;">📅 ' + formatDate(request.createdAt) + '</div><div style="font-size: 0.8em; color: rgba(255,255,255,0.6); margin-top: 5px;">Ожидание ответа...</div></div>';
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
  let time;
  if (timestamp.toDate) {
    time = timestamp.toDate().getTime();
  } else if (timestamp.getTime) {
    time = timestamp.getTime();
  } else {
    time = timestamp;
  }

  const diff = now - time;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return minutes + ' мин. назад';
  if (hours < 24) return hours + ' ч. назад';
  return days + ' дн. назад';
}

function formatDate(timestamp) {
  if (!timestamp) return '';

  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp.getTime) {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }

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

  talentCards.forEach(function(card) {
    card.addEventListener('click', function() {
      const emptySlot = Array.from(craftSlots).find(function(slot) {
        return !slot.dataset.talent;
      });
      if (emptySlot) {
        emptySlot.innerHTML = card.innerHTML;
        emptySlot.dataset.talent = card.dataset.talent;
        emptySlot.classList.add('filled');
        checkRecipe();
      }
    });
  });

  craftSlots.forEach(function(slot) {
    slot.addEventListener('click', function() {
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
    sonicButton.addEventListener('click', function(e) {
      e.stopPropagation();
      craftTalent('sonic', ['basic', 'critical']);
    });
  }

  if (fireButton) {
    fireButton.addEventListener('click', function(e) {
      e.stopPropagation();
      craftTalent('fire', ['critical', 'poison']);
    });
  }

  if (iceButton) {
    iceButton.addEventListener('click', function(e) {
      e.stopPropagation();
      craftTalent('ice', ['poison', 'basic']);
    });
  }

  // Скрываем кнопки крафта по умолчанию
  if (sonicButton) sonicButton.style.display = 'none';
  if (fireButton) fireButton.style.display = 'none';
  if (iceButton) iceButton.style.display = 'none';
}

function checkRecipe() {
  const slots = document.querySelectorAll('.craft-slot');
  const talents = Array.from(slots).map(function(slot) {
    return slot.dataset.talent;
  }).filter(Boolean);

  // Подсчитываем количество каждого типа таланта
  const talentCounts = {};
  talents.forEach(function(talent) {
    talentCounts[talent] = (talentCounts[talent] || 0) + 1;
  });

  const isSonicRecipe = talents.length === 2 &&
    talentCounts['basic'] >= 1 &&
    talentCounts['critical'] >= 1;

  const isFireRecipe = talents.length === 2 &&
    talentCounts['critical'] >= 1 &&
    talentCounts['poison'] >= 1;

  const isIceRecipe = talents.length === 2 &&
    talentCounts['poison'] >= 1 &&
    talentCounts['basic'] >= 1;

  const sonicButton = document.getElementById('sonicButton');
  const fireButton = document.getElementById('fireButton');
  const iceButton = document.getElementById('iceButton');

  if (sonicButton) {
    sonicButton.style.display = isSonicRecipe ? 'block' : 'none';
    if (isSonicRecipe) {
      const state = gameState.state;
      sonicButton.disabled = state.attackCharges.basic.charges < talentCounts['basic'] ||
        state.attackCharges.critical.charges < talentCounts['critical'];
    }
  }

  if (fireButton) {
    fireButton.style.display = isFireRecipe ? 'block' : 'none';
    if (isFireRecipe) {
      const state = gameState.state;
      fireButton.disabled = state.attackCharges.critical.charges < talentCounts['critical'] ||
        state.attackCharges.poison.charges < talentCounts['poison'];
    }
  }

  if (iceButton) {
    iceButton.style.display = isIceRecipe ? 'block' : 'none';
    if (isIceRecipe) {
      const state = gameState.state;
      iceButton.disabled = state.attackCharges.basic.charges < talentCounts['basic'] ||
        state.attackCharges.poison.charges < talentCounts['poison'];
    }
  }

  return isSonicRecipe || isFireRecipe || isIceRecipe;
}

function craftTalent(talentType, requiredTypes) {
  const state = gameState.state;

  // Подсчитываем количество каждого типа таланта
  const talentCounts = {};
  requiredTypes.forEach(function(type) {
    talentCounts[type] = (talentCounts[type] || 0) + 1;
  });

  // Проверяем достаточно ли зарядов для каждого типа
  const hasEnoughCharges = Object.keys(talentCounts).every(function(type) {
    return state.attackCharges[type].charges >= talentCounts[type];
  });

  if (!hasEnoughCharges) {
    showMessage('Недостаточно зарядов!');
    return;
  }

  // Создаем новые объекты для иммутабельности
  const newAttackCharges = Object.assign({}, state.attackCharges);
  const newCraftedTalents = Object.assign({}, state.craftedTalents);

  // Вычитаем заряды
  Object.keys(talentCounts).forEach(function(type) {
    newAttackCharges[type].charges -= talentCounts[type];
  });

  // Добавляем крафтовый талант
  newCraftedTalents[talentType].charges += 1;
  newCraftedTalents[talentType].level = Math.max(
    newCraftedTalents[talentType].level,
    Math.max.apply(Math, requiredTypes.map(function(type) {
      return state.talents[type].level;
    }))
  );

  // Обновляем состояние
  gameState.manager.setState({
    attackCharges: newAttackCharges,
    craftedTalents: newCraftedTalents
  });

  showMessage('✨ Создан новый талант: ' + getTalentName(talentType) + '!');
  resetCrafting();
  updateTalentBuyTab();

  if (state.inBattle) {
    setTimeout(function() {
      createTalentButtons();
    }, 100);
  }

  // Сохраняем после крафта
  setTimeout(function() {
    gameState.save(true);
  }, 100);
}

function getTalentName(type) {
  const names = {
    sonic: 'Звуковой удар',
    fire: 'Огненный удар',
    ice: 'Ледяной удар'
  };
  return names[type] || type;
}

function resetCrafting() {
  gameState.manager.setState({ selectedForCraft: [] });
  document.querySelectorAll('.talent-card').forEach(function(card) {
    card.classList.remove('selected');
  });
  document.querySelectorAll('.craft-slot').forEach(function(slot) {
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
    bgMenuBtn.addEventListener('click', function() {
      previousBg = gameState.state.currentBackground;
      const selector = document.getElementById('backgroundSelector');
      if (selector) selector.classList.add('active');
      currentBgIndex = backgrounds.findIndex(function(bg) {
        return bg.name === gameState.state.currentBackground;
      });
      updateBackgroundUI();
    });
  }

  const bgPrevBtn = document.getElementById('bgPrevBtn');
  if (bgPrevBtn) {
    bgPrevBtn.addEventListener('click', function() {
      currentBgIndex = (currentBgIndex - 1 + backgrounds.length) % backgrounds.length;
      updateBackgroundUI();
    });
  }

  const bgNextBtn = document.getElementById('bgNextBtn');
  if (bgNextBtn) {
    bgNextBtn.addEventListener('click', function() {
      currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
      updateBackgroundUI();
    });
  }

  const bgActionBtn = document.getElementById('bgActionBtn');
  if (bgActionBtn) {
    bgActionBtn.addEventListener('click', function() {
      const currentBg = backgrounds[currentBgIndex];

      if (!gameState.state.purchasedBackgrounds.includes(currentBg.name)) {
        if (gameState.state.honey >= currentBg.cost) {
          gameState.scheduleUIUpdate('honey', gameState.state.honey - currentBg.cost);

          const newPurchasedBackgrounds = gameState.state.purchasedBackgrounds.slice();
          newPurchasedBackgrounds.push(currentBg.name);
          gameState.manager.setState({ purchasedBackgrounds: newPurchasedBackgrounds });
        } else {
          showMessage('Недостаточно мёда!');
          return;
        }
      }

      gameState.manager.setState({ currentBackground: currentBg.name });
      showMessage('Фон "' + currentBg.name + '" выбран!');
      updateBackgroundUI();

      // Сохраняем после выбора фона
      setTimeout(function() {
        gameState.save(true);
      }, 100);
    });
  }

  // Кнопка закрытия меню фона
  const bgCloseBtn = document.getElementById('bgCloseBtn');
  if (bgCloseBtn) {
    bgCloseBtn.addEventListener('click', function() {
      const selector = document.getElementById('backgroundSelector');
      if (selector) selector.classList.remove('active');
    });
  }

  // Закрытие при клике вне меню
  const selector = document.getElementById('backgroundSelector');
  if (selector) {
    selector.addEventListener('click', function(e) {
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
    actionBtn.textContent = isPurchased ? (isSelected ? 'Выбран' : 'Выбрать') : 'Купить за ' + currentBg.cost;
    actionBtn.disabled = isSelected || (!isPurchased && gameState.state.honey < currentBg.cost);
  }
}

// =================== МАГАЗИН ТАЛЕНТОВ ===================
function initTalentShop() {
  // Инициализация вкладок магазина талантов
  document.querySelectorAll('.talent-tabs .tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.talent-tabs .tab-btn, .shop-tab').forEach(function(el) {
        el.classList.remove('active');
      });
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Обработчики для кнопок покупки зарядов
  document.querySelectorAll('#buyCharges .btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const type = btn.dataset.type;
      buyCharges(type);
    });
  });

  // Обработчики для кнопок улучшения талантов
  document.querySelectorAll('#upgradeTalents .btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      const talent = e.target.closest('.talent');
      if (!talent) return;
      const talentType = talent.dataset.talent;
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

  Object.entries(gameState.state.attackCharges).forEach(function(entry) {
    const type = entry[0];
    const data = entry[1];
    const item = document.createElement('div');
    item.className = 'attack-charge-item';
    item.innerHTML = '<div><h3>' + getAttackName(type) + '</h3><span class="charge-counter">' + data.charges + ' шт</span></div><button class="btn" data-type="' + type + '">' + data.basePrice + '</button>';

    item.querySelector('button').addEventListener('click', function() {
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

    const newCharges = Object.assign({}, state.attackCharges);
    newCharges[type].charges += 5;

    gameState.manager.setState({ attackCharges: newCharges });

    // Обновляем UI
    updateUI(['honey']);
    updateChargeDisplay(type);
    updateTalentBuyTab();

    if (state.inBattle) {
      createTalentButtons();
    }

    // Сохраняем после покупки
    setTimeout(function() {
      gameState.save(true);
    }, 100);
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

  const newTalents = Object.assign({}, state.talents);
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
  updateTalentLevelsDisplay();
  updateTalentPrices();
  showMessage('Талант улучшен!');

  // Сохраняем после улучшения
  setTimeout(function() {
    gameState.save(true);
  }, 100);
}

function updateTalentPrices() {
  if (!gameState) return;

  const state = gameState.state;

  Object.keys(talentsConfig).forEach(function(talentType) {
    const talent = talentsConfig[talentType];
    const currentLevel = state.talents[talentType].level;
    const button = document.querySelector('.talent[data-talent="' + talentType + '"] button');

    if (button) {
      if (currentLevel >= talent.maxLevel) {
        button.textContent = 'MAX';
        button.disabled = true;
      } else {
        const cost = Math.floor(talent.getCost(currentLevel));
        button.textContent = cost;
        // СРАЗУ обновляем доступность кнопки на основе текущего количества меда
        button.disabled = state.honey < cost;
      }
    }
  });
}

function updateTalentLevelsDisplay() {
  const state = gameState.state;

  // Обновляем уровни в попапе улучшения
  document.getElementById('basicLevel').textContent = state.talents.basic.level;
  document.getElementById('critLevel').textContent = state.talents.critical.level;
  document.getElementById('poisonLevel').textContent = state.talents.poison.level;

  // Обновляем урон и характеристики
  document.getElementById('basicDmg').textContent = state.talents.basic.damage;
  document.getElementById('critChanceUpgrade').textContent = Math.floor(state.talents.critical.chance * 100);
  document.getElementById('poisonDmgUpgrade').textContent = state.talents.poison.damage;
}

function updateChargeDisplay(type) {
  const state = gameState.state;

  // Обновляем отображение в магазине
  const chargeCounter = document.querySelector('.attack-charge-item[data-type="' + type + '"] .charge-counter');
  if (chargeCounter) {
    chargeCounter.textContent = state.attackCharges[type].charges + ' шт';
  }

  // Обновляем отображение в бою
  if (state.inBattle) {
    const combatButton = document.querySelector('.attack-btn[data-attack="' + type + '"] .charge-counter');
    if (combatButton) {
      combatButton.textContent = 'Зарядов: ' + state.attackCharges[type].charges;
    }
  }
}

function updateTalentBuyTab() {
  const container = document.getElementById('buyCharges');
  if (!container) return;

  container.querySelectorAll('.attack-charge-item').forEach(function(item) {
    const button = item.querySelector('button');
    if (!button) return;

    const type = button.dataset.type;
    const charges = gameState.state.attackCharges[type].charges;
    const chargeCounter = item.querySelector('.charge-counter');
    if (chargeCounter) {
      chargeCounter.textContent = charges + ' шт';
    }
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
    showMessage('Нужно 3 ключа! У вас: ' + gameState.state.keys[bossType]);
    return;
  }

  if (gameState.state.inBattle) {
    showMessage('Вы уже в бою!');
    return;
  }

  // ДОБАВЛЕНО: Сбрасываем флаг показа результатов
  battleResultShown = false;

  // Вычитаем ключи если нужно
  if (bossType !== 'wasp') {
    const newKeys = Object.assign({}, gameState.state.keys);
    newKeys[bossType] -= 3;
    gameState.manager.setState({ keys: newKeys });
    gameState.updateKeysDisplay();
    updateKeysImmediately(); // ДОБАВЛЕНО: Мгновенное обновление
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
    currentBoss: Object.assign({}, bossConfig, {
      currentHealth: bossConfig.health,
      maxHealth: bossConfig.health,
      type: bossType
    }),
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

  setTimeout(function() {
    if (bossHealth) bossHealth.style.transition = 'width 0.3s';
    updateCombatUI();
  }, 50);

  createTalentButtons();
  gameState.startBattleTimer(bossConfig.time);

  // Сохраняем сразу после начала боя
  setTimeout(function() {
    gameState.save(true);
  }, 500);
}

function createTalentButtons() {
  if (!elements.combatTalents) return;

  elements.combatTalents.innerHTML = '';

  const state = gameState.state;

  // Добавляем обычные таланты
  Object.entries(state.talents).forEach(function(entry) {
    const type = entry[0];
    const talent = entry[1];
    if (talent.level > 0) {
      const charges = state.attackCharges[type].charges;
      if (charges <= 0) return; // Пропускаем таланты без зарядов

      const isSelected = state.selectedTalent === type;
      const isDisabled = !state.inBattle;

      const button = document.createElement('button');
      button.className = 'attack-btn' + (isSelected ? ' selected' : '') + (isDisabled ? ' disabled' : '');
      button.dataset.attack = type;
      button.disabled = isDisabled;
      button.innerHTML = '<div class="talent-icon">' + getTalentIcon(type) + '</div><div class="talent-info"><div>' + getTalentButtonText(type) + '</div><div class="charge-counter">Зарядов: ' + charges + '</div></div>';

      button.onclick = function() {
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

  craftedTalents.forEach(function(talent) {
    if (state.craftedTalents[talent.type].charges > 0) {
      const button = document.createElement('button');
      button.className = 'attack-btn' + (state.selectedTalent === talent.type ? ' selected' : '');
      button.dataset.attack = talent.type;
      button.innerHTML = '<div class="talent-icon">' + talent.icon + '</div><div class="talent-info"><div>' + talent.name + '</div><div class="charge-counter">Зарядов: ' + state.craftedTalents[talent.type].charges + '</div></div>';
      button.onclick = function() {
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
    showMessage('Нет зарядов ' + getTalentName(attackType) + ' удара!');
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
const newCharges = Object.assign({}, state.attackCharges);
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
let actualDamage = 0;
switch (attackType) {
  case 'basic':
    damage = calculateBasicDamage();
    // Ограничиваем урон здоровьем босса
    actualDamage = calculateActualDamage(damage, state.currentBoss.currentHealth);
    showBasicEffect(actualDamage);
    break;
  case 'critical':
    damage = calculateBasicDamage();
    if (Math.random() < state.talents.critical.chance) {
      damage *= 2;
      // Ограничиваем урон здоровьем босса
      actualDamage = calculateActualDamage(damage, state.currentBoss.currentHealth);
      showCriticalEffect(actualDamage);
    } else {
      // Ограничиваем урон здоровьем босса
      actualDamage = calculateActualDamage(damage, state.currentBoss.currentHealth);
      showBasicEffect(actualDamage);
    }
    break;
  case 'poison':
    startPoisonEffect();
    return; // Яд не наносит мгновенного урона
}

// Применяем урон к боссу обычным способом
applyDamageToBoss(actualDamage, attackType === 'basic' ? 'basicDamage' : 'criticalDamage');

// Обновляем UI
updateCombatUI();
updateTalentBuyTab();

// Сохраняем состояние после атаки
setTimeout(function() {
  gameState.save(true);
}, 100);
}

function handleCraftedTalentAttack(type) {
const state = gameState.state;

if (!state.inBattle) {
  console.warn('Попытка использовать крафтовый талант вне боя');
  return;
}

const talent = state.craftedTalents[type];

if (talent.charges <= 0) {
  showMessage('Нет зарядов ' + getTalentName(type) + ' удара!');
  return;
}

// Уменьшаем заряды
const newCraftedTalents = Object.assign({}, state.craftedTalents);
if (newCraftedTalents[type].charges > 0) {
  newCraftedTalents[type].charges--;
  gameState.manager.setState({ craftedTalents: newCraftedTalents });
} else {
  showMessage('Нет зарядов ' + getTalentName(type) + ' удара!');
  gameState.manager.setState({ selectedTalent: null });
  createTalentButtons();
  return;
}

// Наносим урон
const damage = talent.damage * (talent.level || 1);

// Ограничиваем урон максимальным здоровьем босса
const actualDamage = calculateActualDamage(damage, state.currentBoss.currentHealth);

// Обновляем достижения ПЕРЕД завершением боя
if (state.currentBoss && actualDamage >= state.currentBoss.currentHealth) {
  updateAchievementsOnVictory(state.currentBoss.type);

  // Немедленно завершаем бой с победой
  setTimeout(() => {
    gameState.endBattle(true, state.currentBoss.type, state.currentBoss.maxHealth);
  }, 10);

  // Немедленно показываем результат
  setTimeout(() => {
    updateResultPopup();
    showBattleResultPopup();
  }, 300);
} else {
  // Применяем урон к боссу обычным способом
  const statName = type + 'Damage';
  applyDamageToBoss(actualDamage, statName);
}

// Обновляем UI
updateCombatUI();

// Сохраняем состояние после атаки
setTimeout(function() {
  gameState.save(true);
}, 100);
}

// =================== ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ НАНЕСЕНИЯ УРОНА БОССУ ===================
function applyDamageToBoss(damage, damageType = null) {
  const state = gameState.state;
  if (!state.currentBoss || !state.inBattle) return;

  // Ограничиваем урон текущим здоровьем босса
  const actualDamage = calculateActualDamage(damage, state.currentBoss.currentHealth);
  const newHealth = Math.max(0, state.currentBoss.currentHealth - actualDamage);

  // Сохраняем данные босса ДО обновления состояния
  const bossType = state.currentBoss.type;
  const bossMaxHealth = state.currentBoss.maxHealth;

  const newBoss = Object.assign({}, state.currentBoss, {
    currentHealth: newHealth
  });

  // Обновляем активный бой с текущим здоровьем
  const newActiveBattle = state.activeBattle ? Object.assign({}, state.activeBattle, {
    health: newHealth
  }) : {
    type: state.currentBoss.type,
    health: newHealth,
    timeLimit: state.battleTimeLimit
  };

  gameState.manager.setState({
    currentBoss: newBoss,
    activeBattle: newActiveBattle
  });

  // Обновляем статистику с actualDamage
  if (damageType) {
    const newStats = Object.assign({}, state.battleStats);

    // Добавляем урон к соответствующему типу
    if (damageType === 'basicDamage' || damageType === 'criticalDamage') {
      newStats[damageType] = (newStats[damageType] || 0) + actualDamage;
    } else if (damageType.endsWith('Damage')) {
      newStats[damageType] = (newStats[damageType] || 0) + actualDamage;
    }

    // Обновляем общий урон
    newStats.totalDamage = (newStats.totalDamage || 0) + actualDamage;

    // Корректируем статистику, чтобы общий урон не превышал максимальное здоровье
    if (newStats.totalDamage > bossMaxHealth) {
      const difference = newStats.totalDamage - bossMaxHealth;
      newStats.totalDamage = bossMaxHealth;

      // Корректируем соответствующий тип урона
      if (damageType === 'basicDamage' || damageType === 'criticalDamage' || damageType.endsWith('Damage')) {
        newStats[damageType] = Math.max(0, newStats[damageType] - difference);
      }
    }

    gameState.manager.setState({ battleStats: newStats });
  }

  // СРАЗУ проверяем смерть босса и обновляем UI
  if (newHealth <= 0) {
    // Обновляем достижения ПЕРЕД завершением боя
    updateAchievementsOnVictory(bossType);

    // Немедленно завершаем бой с ПЕРЕДАЧЕЙ ДАННЫХ БОССА
    setTimeout(() => {
      gameState.endBattle(true, bossType, bossMaxHealth);
    }, 10);

    // СРАЗУ показываем результат без задержки
    setTimeout(() => {
      updateResultPopup();
      showBattleResultPopup();
    }, 50);

    return; // Важно: выходим из функции, чтобы не вызывать updateCombatUI
  }

  // Обновляем UI только если босс еще жив
  updateCombatUI();
}

// =================== ОБНОВЛЕННЫЕ ТАЙМЕРЫ ЯДА ===================
function updatePoisonTimersDisplay() {
const container = document.getElementById('poisonTimersContainer');
if (!container) return;

container.innerHTML = '';

// Создаем копию для безопасной итерации
const effects = Array.from(gameState.battleEffects);
let hasActiveEffects = false;

effects.forEach(function(effect) {
  if (effect.duration > 0) {
    const timer = document.createElement('div');
    timer.className = 'poison-timer';
    timer.innerHTML = '☠️ ' + effect.duration + 's';
    container.appendChild(timer);
    hasActiveEffects = true;

    // Уменьшаем только для отображения, сохраняя оригинальное duration для логики
    effect.displayDuration = (effect.displayDuration || effect.duration) - 1;
  }
});

// Если нет активных эффектов, но контейнер не пустой - очищаем
if (!hasActiveEffects && container.children.length > 0) {
  setTimeout(() => {
    container.innerHTML = '';
  }, 100);
}
}

function startPoisonEffect() {
const state = gameState.state;
const poisonDamage = state.talents.poison.damage;
const duration = talentsConfig.poison.getDuration(state.talents.poison.level);

showPoisonAttackEffect(poisonDamage);

const effect = {
  damage: poisonDamage,
  duration: duration,
  displayDuration: duration,
  interval: null,
  timer: null
};

// Первый тик сразу
applyPoisonTick(effect);

// Последующие тики
effect.interval = setInterval(function() {
  applyPoisonTick(effect);
}, 1000);

// Остановка через duration секунд
effect.timer = setTimeout(function() {
  if (effect.interval) clearInterval(effect.interval);
  gameState.battleEffects.delete(effect);
  updatePoisonTimersDisplay();
}, duration * 1000);

gameState.battleEffects.add(effect);
updatePoisonTimersDisplay();
}

function applyPoisonTick(effect) {
const state = gameState.state;
if (!state.inBattle || !state.currentBoss) {
  clearInterval(effect.interval);
  gameState.battleEffects.delete(effect);
  updatePoisonTimersDisplay();
  return;
}

const damage = effect.damage;

// Ограничиваем урон максимальным здоровьем босса
const actualDamage = calculateActualDamage(damage, state.currentBoss.currentHealth);
const newHealth = Math.max(0, state.currentBoss.currentHealth - actualDamage);

const newBoss = Object.assign({}, state.currentBoss, {
  currentHealth: newHealth
});

// Обновляем статистику с ограничением
const newStats = Object.assign({}, state.battleStats);
const currentPoisonDamage = newStats.poisonDamage || 0;
const bossMaxHealth = state.currentBoss.maxHealth;
const totalDamageAfterThis = (newStats.totalDamage || 0) + actualDamage;

// Проверяем, не превышает ли общий урон максимальное здоровье
if (totalDamageAfterThis > bossMaxHealth) {
  const allowedDamage = bossMaxHealth - (newStats.totalDamage || 0);
  if (allowedDamage > 0) {
    newStats.poisonDamage = currentPoisonDamage + allowedDamage;
    newStats.totalDamage = bossMaxHealth;
  }
} else {
  newStats.poisonDamage = currentPoisonDamage + actualDamage;
  newStats.totalDamage = totalDamageAfterThis;
}

gameState.manager.setState({
  currentBoss: newBoss,
  battleStats: newStats
});

showPoisonDamageEffect(actualDamage);
updateCombatUI();

// Уменьшаем длительность эффекта
effect.duration -= 1;
effect.displayDuration = effect.duration;

// Обновляем отображение таймеров
updatePoisonTimersDisplay();

if (effect.duration <= 0) {
  clearInterval(effect.interval);
  if (effect.timer) clearTimeout(effect.timer);
  gameState.battleEffects.delete(effect);
  updatePoisonTimersDisplay();
}

// Немедленная победа при смерти от яда с обновлением достижений
if (newHealth <= 0) {
  clearInterval(effect.interval);
  if (effect.timer) clearTimeout(effect.timer);
  gameState.battleEffects.delete(effect);
  updatePoisonTimersDisplay();

  // Обновляем достижения ДО завершения боя
  updateAchievementsOnVictory(state.currentBoss.type);

  // Немедленно завершаем бой
  setTimeout(() => {
    gameState.endBattle(true, state.currentBoss.type, state.currentBoss.maxHealth);
  }, 10);

  // Немедленно показываем результат
  setTimeout(() => {
    updateResultPopup();
    showBattleResultPopup();
  }, 300);
}

setTimeout(function() {
  gameState.save(true);
}, 100);
}

function updateBattleStats(stat, damage) {
  const state = gameState.state;
  if (!state.currentBoss) return;

  // Всегда ограничиваем урон текущим здоровьем босса
  const remainingHealth = state.currentBoss.currentHealth;
  const actualDamage = calculateActualDamage(damage, remainingHealth);

  const newStats = Object.assign({}, state.battleStats);
  newStats[stat] = (newStats[stat] || 0) + actualDamage;
  newStats.totalDamage = (newStats.totalDamage || 0) + actualDamage;

  // Проверяем, чтобы общий урон не превышал максимальное здоровье босса
  if (newStats.totalDamage > state.currentBoss.maxHealth) {
    // Корректируем общий урон
    const maxPossibleDamage = state.currentBoss.maxHealth;
    const difference = newStats.totalDamage - maxPossibleDamage;

    // Корректируем текущий тип урона
    newStats[stat] = Math.max(0, newStats[stat] - difference);
    newStats.totalDamage = maxPossibleDamage;
  }

  gameState.manager.setState({ battleStats: newStats });
}

function updateCombatUI() {
const state = gameState.state;
if (!state.currentBoss) return;

if (state.currentBoss.currentHealth < 0) {
  state.currentBoss.currentHealth = 0;
}

const healthPercent = (state.currentBoss.currentHealth / state.currentBoss.maxHealth) * 100;
if (elements.bossHealth) elements.bossHealth.style.width = healthPercent + '%';
if (elements.currentHealth) elements.currentHealth.textContent = state.currentBoss.currentHealth;

const bossCombatImage = document.getElementById('bossCombatImage');
if (bossCombatImage) {
  if (healthPercent <= 25) {
    bossCombatImage.src = 'img/' + state.currentBoss.type + '_critical.jpg';
  } else if (healthPercent <= 50) {
    bossCombatImage.src = 'img/' + state.currentBoss.type + '_wounded.jpg';
  } else {
    bossCombatImage.src = gameConfig.bosses[state.currentBoss.type].image;
  }
}
}

function calculateDamage(type) {
const state = gameState.state;

switch (type) {
  case 'basic':
    return calculateBasicDamage();
  case 'critical':
    return Math.random() < state.talents.critical.chance ?
      calculateBasicDamage() * 2 :
      calculateBasicDamage();
  case 'poison':
    return state.talents.poison.damage;
  case 'sonic':
    return state.craftedTalents.sonic.damage;
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
let clickTimestamps = [];

function handleHiveClick(e) {
const now = Date.now();

// Защита от спама кликами
clickTimestamps = clickTimestamps.filter(time => now - time < 1000);
if (clickTimestamps.length >= 20) {
  showMessage('⚠️ Слишком быстро!');
  return;
}

if (now - lastClickTime < CLICK_COOLDOWN) return;

lastClickTime = now;
clickTimestamps.push(now);

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
setTimeout(function() {
  hive.style.transform = 'scale(1)';
}, 100);

// Создаем эффект
createClickEffect(e);

// Автосохранение
gameState.save();
}

function handleBattleClick(e) {
const state = gameState.state;
if (!state.inBattle || !state.selectedTalent) return;

const clickArea = document.querySelector('.click-area');
if (!clickArea) return;

const rect = clickArea.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;

// Эффект урона
const damageEffect = document.createElement('div');
damageEffect.className = 'damage-effect';
damageEffect.style.left = x + 'px';
damageEffect.style.top = y + 'px';

const damage = calculateDamage(state.selectedTalent);
damageEffect.textContent = '-' + damage;

clickArea.appendChild(damageEffect);
setTimeout(function() {
  damageEffect.remove();
}, 800);

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
setTimeout(function() {
  heart.remove();
}, 1000);
}

// =================== УПРАВЛЕНИЕ ПОПАПАМИ ===================
function showPopup(popupType) {
// ДОБАВЛЕНО: Если это попап битвы, проверяем наличие необработанного результата
if (popupType === 'battle') {
  // Показываем результаты битвы ТОЛЬКО если они есть и еще не были показаны
  if (gameState && gameState.battleResult && !battleResultShown) {
    // Задержка для корректного отображения UI
    setTimeout(() => {
      updateResultPopup();
      showBattleResultPopup();
      battleResultShown = true;
    }, 300);
  }
}

hideAllPopups();
const popup = document.getElementById(popupType + 'Popup');
if (popup) {
  popup.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Особые действия при открытии определенных попапов
  if (popupType === 'friends') {
    loadFriendsList();
  }

  // Для попапа битвы: восстановление активного боя
  if (popupType === 'battle' && gameState && gameState.state && gameState.state.inBattle) {
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

const popup = document.getElementById(type + 'Popup');
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
document.querySelectorAll('.popup').forEach(function(p) {
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
  resultBossImage.src = battleResult.victory ? (bossConfig.defeatImage || bossConfig.image) : bossConfig.image;
  resultBossImage.classList.toggle('defeat-image', !battleResult.victory);
  resultBossImage.classList.toggle('victory-image', battleResult.victory);
}

if (battleResult.reward) {
  if (rewardHoney) rewardHoney.textContent = battleResult.reward.honey || 0;
  if (rewardXP) rewardXP.textContent = battleResult.reward.xp || 0;

  const keys = Object.entries(battleResult.reward.keys || {}).map(function(entry) {
    return entry[1];
  }).reduce(function(a, b) {
    return a + b;
  }, 0);

  if (rewardKeys) rewardKeys.textContent = keys > 0 ? keys : '0';
} else {
  if (rewardHoney) rewardHoney.textContent = '0';
  if (rewardXP) rewardXP.textContent = '0';
  if (rewardKeys) rewardKeys.textContent = '0';
}

// Отображение статистики урона с исправленными значениями
const damageStats = document.getElementById('damageStats');
if (!damageStats) {
  // Создаем контейнер для статистики, если его нет
  const resultBody = document.querySelector('.result-body');
  if (resultBody) {
    const statsDiv = document.createElement('div');
    statsDiv.id = 'damageStats';
    statsDiv.className = 'damage-stats';

    statsDiv.innerHTML = '<h3>Статистика урона:</h3><div class="damage-stats-grid" id="damageStatsGrid"></div>';

    // Вставляем перед кнопками действий
    const actionsDiv = resultBody.querySelector('.result-actions');
    if (actionsDiv) {
      resultBody.insertBefore(statsDiv, actionsDiv);
    }
  }
}

// Обновляем значения статистики - показываем только использованные типы урона
const state = gameState.state;
const damageStatsGrid = document.getElementById('damageStatsGrid');

if (damageStatsGrid && state.battleStats) {
  damageStatsGrid.innerHTML = '';

  const damageTypes = [
    { key: 'basicDamage', label: '🗡️ Базовый', value: state.battleStats.basicDamage || 0 },
    { key: 'criticalDamage', label: '💥 Критический', value: state.battleStats.criticalDamage || 0 },
    { key: 'poisonDamage', label: '☠️ Ядовитый', value: state.battleStats.poisonDamage || 0 },
    { key: 'sonicDamage', label: '🔊 Звуковой', value: state.battleStats.sonicDamage || 0 },
    { key: 'fireDamage', label: '🔥 Огненный', value: state.battleStats.fireDamage || 0 },
    { key: 'iceDamage', label: '❄️ Ледяной', value: state.battleStats.iceDamage || 0 }
  ];

  // Фильтруем и показываем только те, у которых урон > 0
  damageTypes.forEach(type => {
    if (type.value > 0) {
      const statElement = document.createElement('div');
      statElement.className = 'damage-stat';
      statElement.innerHTML = `${type.label}: <span>${type.value}</span>`;
      damageStatsGrid.appendChild(statElement);
    }
  });

  // Всегда показываем общий урон
  const totalElement = document.createElement('div');
  totalElement.className = 'damage-stat total';
  totalElement.innerHTML = `📊 Общий урон: <span>${state.battleStats.totalDamage || 0}</span>`;
  damageStatsGrid.appendChild(totalElement);
}
}

function claimBattleReward() {
const battleResult = gameState.battleResult;
const reward = battleResult && battleResult.reward;
const bossType = battleResult && battleResult.boss && battleResult.boss.type;

if (reward) {
  // Добавляем награды
  const currentHoney = gameState.state.honey;
  const currentXP = gameState.state.xp;

  gameState.manager.setState({
    honey: currentHoney + reward.honey,
    xp: currentXP + reward.xp,
    pendingBattleResult: null, // Очищаем незакрытый результат
    pendingBattleResultType: null
  });

  // Добавляем ключи
  if (reward.keys) {
    const newKeys = Object.assign({}, gameState.state.keys);
    Object.entries(reward.keys).forEach(function(entry) {
      const type = entry[0];
      const amount = entry[1];
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
  updateKeysImmediately(); // ДОБАВЛЕНО: Мгновенное обновление
  updateAchievementsUI();

  // Закрываем попап результатов
  hidePopup('battleResult');

  // Сбрасываем флаг поражения
  defeatShown = false;

  // Сбрасываем флаг показа результатов
  battleResultShown = false;

  // Скрываем боевой экран
  const combatScreen = document.getElementById('combatScreen');
  if (combatScreen) combatScreen.style.display = 'none';

  // Показываем выбор боссов
  const bossSelection = document.getElementById('bossSelection');
  if (bossSelection) bossSelection.style.display = 'block';

  // Сбрасываем результат битвы
  gameState.battleResult = null;

  // Сохраняем после получения награды
  setTimeout(function() {
    gameState.save(true);
  }, 100);

  showMessage('🎉 Награда получена!');
}
}

function closeBattleResult() {
// Очищаем незакрытый результат
gameState.manager.setState({
  pendingBattleResult: null,
  pendingBattleResultType: null
});

// Закрываем попап результатов
hidePopup('battleResult');

// Сбрасываем флаг поражения
defeatShown = false;

// Сбрасываем флаг показа результатов
battleResultShown = false;

// Скрываем боевой экран
const combatScreen = document.getElementById('combatScreen');
if (combatScreen) combatScreen.style.display = 'none';

// Показываем выбор боссов
const bossSelection = document.getElementById('bossSelection');
if (bossSelection) bossSelection.style.display = 'block';

gameState.battleResult = null;

// Сохраняем состояние после закрытия попапа
setTimeout(() => {
  gameState.save(true);
}, 100);
}

// =================== ИСПРАВЛЕННАЯ ФУНКЦИЯ ПОВЫШЕНИЯ УРОВНЯ ===================
function checkLevelUp() {
const state = gameState.state;
let currentXP = state.xp;
let currentLevel = state.level;
let xpToNextLevel = state.xpToNextLevel;
let levelsGained = 0;

console.log('Проверка уровня:', {
  currentXP: currentXP,
  currentLevel: currentLevel,
  xpToNextLevel: xpToNextLevel
});

while (currentXP >= xpToNextLevel && currentLevel < 100) {
  currentXP -= xpToNextLevel;
  currentLevel += 1;
  levelsGained++;
  xpToNextLevel = gameState.calculateXPRequired(currentLevel);

  console.log('Уровень повышен:', {
    новыйУровень: currentLevel,
    остатокОпыта: currentXP,
    опытДляСледующегоУровня: xpToNextLevel
  });
}

if (levelsGained > 0) {
  // Обновляем состояние одним вызовом
  gameState.manager.setState({
    xp: currentXP,
    level: currentLevel,
    xpToNextLevel: xpToNextLevel
  });

  // Применяем бонусы за уровни
  applyLevelBonuses(levelsGained);

  // Показываем эффект
  showLevelUpEffect(levelsGained);

  // Обновляем UI
  updateUI(['level', 'xp', 'xpToNextLevel']);
  updateLevelProgress();
  updateAchievementsUI();

  // Сохраняем при повышении уровня
  setTimeout(function() {
    gameState.save(true);
  }, 100);

  showMessage('🎉 Уровень повышен до ' + currentLevel + '!');
  return true;
}
return false;
}

function applyLevelBonuses(levels) {
const newTalents = Object.assign({}, gameState.state.talents);
newTalents.basic.damage += 2 * levels;
gameState.manager.setState({ talents: newTalents });

const newBoosts = Object.assign({}, gameState.state.boosts);
newBoosts.attackSpeed += 0.03 * levels;
gameState.manager.setState({ boosts: newBoosts });

console.log('Получено ' + levels + ' уровень(ей). Базовый урон: ' + newTalents.basic.damage);
}

// =================== КАСТОМИЗАЦИЯ ===================
function showTab(tabName) {
document.querySelectorAll('.tab-content').forEach(function(tab) {
  tab.classList.remove('active');
});
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.classList.remove('active');
});

const tabElement = document.getElementById(tabName);
const button = document.querySelector('button[onclick="showTab(\'' + tabName + '\')"]');

if (tabElement) tabElement.classList.add('active');
if (button) button.classList.add('active');
}

async function selectSkin() {
try {
  const selectedSkinElement = document.getElementById('selected-skin');
  if (!selectedSkinElement) return;

  const selectedSkin = selectedSkinElement.src;
  const hiveImg = document.querySelector('.hive-img');
  if (hiveImg) {
    hiveImg.style.backgroundImage = 'url(\'' + selectedSkin + '\')';
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
const selectedSkinElement = document.getElementById('selected-skin');
if (!selectedSkinElement || !selectButton) return;

const currentSkin = selectedSkinElement.src;
if (currentSkin === gameState.state.currentSkin) {
  selectButton.disabled = true;
  selectButton.textContent = 'Выбрано';
} else {
  selectButton.disabled = false;
  selectButton.textContent = 'Выбрать';
}
}

async function selectPet() {
try {
  const selectedPetElement = document.getElementById('selected-pet');
  if (!selectedPetElement) return;

  const selectedPet = selectedPetElement.src;
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
const selectedPetElement = document.getElementById('selected-pet');
if (!selectedPetElement || !selectButton) return;

const currentPet = selectedPetElement.src;
if (currentPet === gameState.state.currentPet) {
  selectButton.disabled = true;
  selectButton.textContent = 'Выбрано';
} else {
  selectButton.disabled = false;
  selectButton.textContent = 'Выбрать';
}
}

// =================== НАГРАДЫ ЗА ДОСТИЖЕНИЯ ===================
async function claimAchievementReward(type, level) {
try {
  const state = gameState.state;
  const newAchievements = Object.assign({}, state.achievements);
  const config = achievementsConfig[type];

  if (!config || level < 1 || level > config.levels.length) {
    showMessage('❌ Неверный уровень достижения');
    return false;
  }

  const levelKey = 'level' + level;
  const completedKey = type === 'wasp' ? 'completed' : 'bearCompleted';
  const claimedKey = type === 'wasp' ? 'claimed' : 'bearClaimed';

  // Проверяем, выполнено ли достижение
  if (!newAchievements[completedKey][levelKey]) {
    showMessage('❌ Достижение еще не выполнено');
    return false;
  }

  // Проверяем, получена ли уже награда
  if (newAchievements[claimedKey][levelKey]) {
    showMessage('✅ Награда уже получена');
    return false;
  }

  // Получаем награду
  const reward = config.levels[level - 1];

  // Выдаем награду
  gameState.scheduleUIUpdate('honey', state.honey + reward.honey);
  gameState.scheduleUIUpdate('xp', state.xp + reward.xp);

  // Отмечаем награду как полученную
  newAchievements[claimedKey][levelKey] = true;
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
  showMessage('❌ Ошибка получения награды');
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
setTimeout(function() {
  if (msg.parentNode) {
    msg.remove();
  }
}, 2000);
}

function showLevelUpEffect(levels) {
const div = document.createElement('div');
div.className = 'level-up';
div.textContent = 'Уровень +' + levels + '!';
document.body.appendChild(div);
setTimeout(function() {
  div.remove();
}, 2000);
}

function showCriticalEffect(damage) {
if (!elements.combatScreen) return;

const div = document.createElement('div');
div.className = 'critical-effect';
div.textContent = 'CRIT! ' + damage;
elements.combatScreen.appendChild(div);
setTimeout(function() {
  div.remove();
}, 1000);
}

function showEnergyWarning() {
const div = document.createElement('div');
div.className = 'energy-warning';
div.textContent = 'Недостаточно энергии!';
document.body.appendChild(div);
setTimeout(function() {
  div.remove();
}, 1500);
}

function showSonicEffect(damage) {
if (!elements.combatScreen) return;

const effect = document.createElement('div');
effect.className = 'sonic-effect';
effect.textContent = '🔊 ' + damage;
elements.combatScreen.appendChild(effect);
setTimeout(function() {
  effect.remove();
}, 1000);
}

function showFireEffect(damage) {
if (!elements.combatScreen) return;

const effect = document.createElement('div');
effect.className = 'fire-effect';
effect.textContent = '🔥 ' + damage;
effect.style.color = '#ff4400';
elements.combatScreen.appendChild(effect);
setTimeout(function() {
  effect.remove();
}, 1000);
}

function showIceEffect(damage) {
if (!elements.combatScreen) return;

const effect = document.createElement('div');
effect.className = 'ice-effect';
effect.textContent = '❄️ ' + damage;
effect.style.color = '#00cccc';
elements.combatScreen.appendChild(effect);
setTimeout(function() {
  effect.remove();
}, 1000);
}

function showBasicEffect(damage) {
if (!elements.combatScreen) return;

const effect = document.createElement('div');
effect.className = 'basic-effect';
effect.textContent = '🗡️ ' + damage;
effect.style.color = '#ffd700';
elements.combatScreen.appendChild(effect);
setTimeout(function() {
  effect.remove();
}, 1000);
}

function showPoisonAttackEffect(damage) {
if (!elements.combatScreen) return;

const effect = document.createElement('div');
effect.className = 'poison-attack-effect';
effect.textContent = '☠️ ' + damage;
effect.style.color = '#32CD32';
elements.combatScreen.appendChild(effect);
setTimeout(() => effect.remove(), 1000);
}

function showPoisonDamageEffect(damage) {
if (!elements.combatScreen) return;

const effect = document.createElement('div');
effect.className = 'poison-damage-effect';
effect.textContent = '☠️ ' + damage;
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
  progressBar.style.width = Math.min(percent, 100) + '%';
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
