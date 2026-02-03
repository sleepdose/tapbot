// Инициализация Telegram WebApp
let tg;
try {
    tg = window.Telegram.WebApp;
    tg.expand(); // Раскрываем на полный экран
} catch (error) {
    console.error('Ошибка инициализации Telegram WebApp:', error);
    alert('Ошибка инициализации. Пожалуйста, убедитесь что приложение открыто в Telegram.');
}

// =================== КОНФИГУРАЦИЯ И ЭЛЕМЕНТЫ DOM ===================
'use strict';

const elements = {
    honey: document.getElementById('honey'),
    energy: document.getElementById('energy'),
    maxEnergy: document.getElementById('maxEnergy'),
    level: document.getElementById('level'),
    xp: document.getElementById('xp'),
    xpToNextLevel: document.getElementById('xpToNextLevel'),
    basicLevel: document.getElementById('basicLevel'),
    basicDmg: document.getElementById('basicDmg'),
    critLevel: document.getElementById('critLevel'),
    critChanceUpgrade: document.getElementById('critChanceUpgrade'),
    poisonLevel: document.getElementById('poisonLevel'),
    poisonDmgUpgrade: document.getElementById('poisonDmgUpgrade'),
    combatTimer: document.getElementById('combatTimer'),
    bossHealth: document.getElementById('bossHealth'),
    currentHealth: document.getElementById('currentHealth'),
    maxHealth: document.getElementById('maxHealth'),
    levelProgress: document.querySelector('.level-progress-bar'),
    combatTalents: document.getElementById('combatTalents'),
    combatScreen: document.getElementById('combatScreen'),
    bossCombatImage: document.getElementById('bossCombatImage'),
    battleReward: document.getElementById('battleReward')
};
const audioElements = {
    bgMusic: document.getElementById('backgroundMusic'),
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

// =================== КЛАСС СОСТОЯНИЯ ИГРЫ С FIREBASE ===================
class GameState {
    constructor() {
        this.achievements = {
            waspKills: 0,
            bearKills: 0,
            currentLevel: 0,
            rewards: {
                level1: false,
                level2: false,
                level3: false
            },
            bearRewards: {
                level1: false,
                level2: false,
                level3: false
            }
        };
        this.purchasedBackgrounds = ['default'];
        this.selectedTalent = null;
        this.currentBackground = 'default';
        this.hasPet = false;
        this.selectedForCraft = [];
        this.craftedTalents = {
            sonic: { level: 0, damage: 50, charges: 0 },
            fire: { level: 0, damage: 75, charges: 0 },
            ice: { level: 0, damage: 60, charges: 0 }
        };
        this.currentSkin = 'img/skin1.png';
        this.currentPet = 'img/pet1.png';
        this.battleResult = null;
        this.isMusicMuted = localStorage.getItem('musicMuted') === 'true';
        this.previewHive = 'basic';
        this.attackCooldowns = {
            basic: 0,
            critical: 0,
            poison: 0
        };
        this.hiveImages = {
            basic: 'img/human_male.png',
            golden: 'img/1.png',
            crystal: 'https://cdn.pixabay.com/photo/2016/09/10/13/28/diamond-1659283_1280.png',
            inferno: 'https://cdn.pixabay.com/photo/2013/07/13/12/35/flame-160034_1280.png'
        };
        this.keys = { bear: 0, dragon: 0, hydra: 0, kraken: 0 };
        this.attackCharges = {
            basic: { charges: 15, basePrice: 50 },
            critical: { charges: 15, basePrice: 75 },
            poison: { charges: 15, basePrice: 100 }
        };
        this.activeEffects = { poison: [], shield: null, multiclick: null };
        this.battleStats = {
            basicDamage: 0,
            criticalDamage: 0,
            poisonDamage: 0,
            sonicDamage: 0,
            fireDamage: 0,
            iceDamage: 0,
            totalDamage: 0
        };
        this.friends = [];
        this.friendRequests = { incoming: [], outgoing: [] };

        // Для автосохранения
        this.lastSaveTime = 0;
        this.saveCooldown = 10000; // 10 секунд между автосохранениями

        this.reset();
    }

    reset() {
        this.honey = 0;
        this.xp = 0;
        this.level = 1;
        this.energy = 100;
        this.maxEnergy = 100;
        this.xpToNextLevel = this.calculateXPRequired(1);
        this.purchasedHives = ['basic'];
        this.activeHive = 'basic';
        this.inBattle = false;
        this.talents = {
            basic: { level: 1, damage: 10 },
            critical: { level: 1, chance: 0.2 },
            poison: { level: 1, damage: 3 }
        };
        this.boosts = {
            battleBonus: 1.0,
            attackSpeed: 1.0,
            shield: false,
            multiclick: false
        };
        this.battleStats = {
            basicDamage: 0,
            criticalDamage: 0,
            poisonDamage: 0,
            sonicDamage: 0,
            fireDamage: 0,
            iceDamage: 0,
            totalDamage: 0
        };
    }

    calculateXPRequired(level) {
        return Math.floor(100 * Math.pow(1.2, level - 1));
    }

    updateKeysDisplay() {
        document.querySelectorAll('.current-keys').forEach(el => {
            const bossType = el.dataset.boss;
            el.textContent = this.keys[bossType];
        });
    }

    // Метод сохранения в Firebase
    async save(force = false) {
        const now = Date.now();

        // Проверяем кулдаун (чтобы не сохранять слишком часто)
        if (!force && now - this.lastSaveTime < this.saveCooldown) {
            return;
        }

        try {
            if (window.firebaseManager) {
                const success = await window.firebaseManager.saveGameData(this);
                if (success) {
                    console.log('Игра сохранена в Firebase');
                    this.lastSaveTime = now;

                    // Обновляем статус UI
                    updateFirebaseStatusUI(true);
                } else {
                    console.warn('Не удалось сохранить в Firebase (нет интернета)');
                    updateFirebaseStatusUI(false);
                }
            }
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            updateFirebaseStatusUI(false);
        }
    }

    // Метод загрузки из Firebase
    async load() {
        try {
            if (window.firebaseManager) {
                const result = await window.firebaseManager.loadGameData();

                if (result.success && result.data) {
                    this.applyLoadedData(result.data);
                    console.log('Данные загружены из:', result.source);
                    updateFirebaseStatusUI(result.source === 'firebase');
                    return true;
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            updateFirebaseStatusUI(false);
        }

        return false;
    }

    // Применение загруженных данных
    applyLoadedData(data) {
        // Основные данные
        this.honey = data.honey || 0;
        this.xp = data.xp || 0;
        this.level = data.level || 1;
        this.energy = data.energy || 100;
        this.maxEnergy = data.maxEnergy || 100;
        this.xpToNextLevel = data.xpToNextLevel || this.calculateXPRequired(1);

        // Восстановление энергии в оффлайне
        if (data.lastSavedTimestamp) {
            const timePassed = Date.now() - data.lastSavedTimestamp;
            const minutesPassed = Math.floor(timePassed / (1000 * 60));
            const energyToRestore = Math.floor(minutesPassed * 20); // 20 энергии в минуту

            this.energy = Math.min(this.maxEnergy, (this.energy || 0) + energyToRestore);

            // Ограничиваем восстановление максимум 8 часами
            const maxRestoreTime = 8 * 60; // 8 часов в минутах
            if (minutesPassed > maxRestoreTime) {
                this.energy = this.maxEnergy;
            }
        }

        // Таланты
        this.talents = data.talents || {
            basic: { level: 1, damage: 10 },
            critical: { level: 1, chance: 0.2 },
            poison: { level: 1, damage: 3 }
        };

        // Заряды
        this.attackCharges = data.attackCharges || {
            basic: { charges: 15, basePrice: 50 },
            critical: { charges: 15, basePrice: 75 },
            poison: { charges: 15, basePrice: 100 }
        };

        // Крафтовые таланты
        this.craftedTalents = data.craftedTalents || {
            sonic: { level: 0, damage: 50, charges: 0 },
            fire: { level: 0, damage: 75, charges: 0 },
            ice: { level: 0, damage: 60, charges: 0 }
        };

        // Ключи
        this.keys = data.keys || { bear: 0, dragon: 0, hydra: 0, kraken: 0 };

        // Достижения
        this.achievements = data.achievements || {
            waspKills: 0,
            bearKills: 0,
            currentLevel: 0,
            rewards: { level1: false, level2: false, level3: false },
            bearRewards: { level1: false, level2: false, level3: false }
        };

        // Фоны
        this.purchasedBackgrounds = data.purchasedBackgrounds || ['default'];
        this.currentBackground = data.currentBackground || 'default';

        // Скины и питомцы
        this.currentSkin = data.currentSkin || 'img/skin1.png';
        this.currentPet = data.currentPet || 'img/pet1.png';
        this.hasPet = data.hasPet || false;

        // Ульи
        this.activeHive = data.activeHive || 'basic';
        this.purchasedHives = data.purchasedHives || ['basic'];
    }
}

const talentsConfig = {
    basic: {
        maxLevel: 10,
        getDamage: level => 10 * level,
        getCost: level => 75 * Math.pow(1.5, level - 1)
    },
    critical: {
        maxLevel: 10,
        getChance: level => 0.15 + 0.05 * level,
        getCost: level => 150 * Math.pow(1.4, level)
    },
    poison: {
        maxLevel: 10,
        getDamage: level => 2 + level,
        getDuration: level => 5 + level,
        getCost: level => 200 * Math.pow(1.6, level)
    }
};

let gameState;
let isAnimating = false;
let isGameInitialized = false;

// =================== ФУНКЦИИ ДЛЯ FIREBASE ===================
function updateFirebaseStatusUI(isOnline) {
    const statusElement = document.getElementById('firebaseStatus');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (statusElement && statusDot && statusText) {
        if (isOnline) {
            statusElement.style.display = 'block';
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Сохранено в облаке';

            // Скрываем через 3 секунды
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

// =================== ПРЕЛОАДЕР ===================
function showPreloader(text = 'Загрузка AIKO TAPBOT...') {
    const preloader = document.getElementById('preloader');
    const statusText = document.getElementById('preloaderStatus');

    if (preloader) {
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

      // ПОКАЗЫВАЕМ ИГРОВОЙ ЭКРАН
      if (gameScreen) {
        gameScreen.style.display = 'block';
      }

      // Удаляем прелоадер из DOM после анимации
      setTimeout(() => {
        if (preloader.parentNode) {
          preloader.style.display = 'none';
        }
      }, 500);
    }, 500);
  }
}

// =================== СИСТЕМА ДРУЗЕЙ ===================

// Инициализация системы друзей
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
  document.getElementById('sendFriendRequestBtn').addEventListener('click', sendFriendRequest);

  // Кнопка копирования своего ID
  document.getElementById('copyMyIdBtn').addEventListener('click', copyMyTelegramId);

  // Поиск по друзьям - теперь только по ID
  document.getElementById('searchFriend').addEventListener('input', filterFriendsList);

  // Показываем подсказку под полем поиска
  const searchInput = document.getElementById('searchFriend');
  searchInput.placeholder = 'Поиск по Telegram ID...';

  // Добавляем подсказку
  const searchContainer = document.querySelector('.friends-search');
  const hint = document.createElement('div');
  hint.className = 'search-hint';
  hint.innerHTML = '🔍 Введите Telegram ID для поиска друзей';
  hint.style.fontSize = '0.8em';
  hint.style.color = 'rgba(255,255,255,0.6)';
  hint.style.marginTop = '5px';
  hint.style.textAlign = 'center';
  searchContainer.appendChild(hint);

  // Показываем свой Telegram ID
  updateMyTelegramId();
}

// Обновление своего Telegram ID
async function updateMyTelegramId() {
  try {
    const myIdElement = document.getElementById('myTelegramId');
    const copyBtn = document.getElementById('copyMyIdBtn');

    // Получаем Telegram ID из WebApp
    const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

    console.log('=== ОБНОВЛЕНИЕ TELEGRAM ID ===');
    console.log('Telegram ID из WebApp:', telegramId);

    if (telegramId) {
      myIdElement.textContent = telegramId;
      copyBtn.style.display = 'inline-block';

      // Проверяем, сохранен ли Telegram ID в Firebase
      if (window.firebaseManager) {
        setTimeout(async () => {
          try {
            const telegramIdFromFirebase = await window.firebaseManager.getCurrentTelegramId();
            console.log('Telegram ID из Firebase:', telegramIdFromFirebase);

            if (!telegramIdFromFirebase) {
              console.warn('Telegram ID не найден в Firebase. Сохраняем игру...');
              if (gameState) {
                await gameState.save(true);
                console.log('Игра сохранена для записи Telegram ID');
              }
            }

            // Получаем количество друзей для отображения
            const friendsCount = await window.firebaseManager.getFriendsCount(window.firebaseManager.currentUser?.uid);
            console.log('Количество друзей:', friendsCount);

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
      copyBtn.style.display = 'none';
      console.warn('Telegram ID не доступен. Запустите игру через Telegram.');
    }
  } catch (error) {
    console.error('Ошибка получения Telegram ID:', error);
    document.getElementById('myTelegramId').textContent = 'Ошибка загрузки';
  }
}

// Копирование своего Telegram ID
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

// Принудительное сохранение Telegram ID
async function forceSaveTelegramId() {
  try {
    if (window.firebaseManager && gameState) {
      console.log('Принудительное сохранение Telegram ID...');

      // Получаем Telegram ID из WebApp
      const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      const telegramUsername = window.Telegram?.WebApp?.initDataUnsafe?.user?.username ||
                              window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name ||
                              `Игрок ${telegramId || 'Аноним'}`;

      if (telegramId) {
        console.log('Сохраняем Telegram ID:', telegramId);

        // Сохраняем данные пользователя напрямую
        await window.firebaseManager.db.collection('users').doc(window.firebaseManager.currentUser.uid).set({
          telegramId: Number(telegramId),
          username: telegramUsername,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showMessage('✅ Telegram ID сохранен!');

        // Обновляем отображение
        updateMyTelegramId();
      } else {
        showMessage('❌ Telegram ID не найден');
      }
    }
  } catch (error) {
    console.error('Ошибка сохранения Telegram ID:', error);
    showMessage('❌ Ошибка сохранения Telegram ID');
  }
}

// Загрузка списка друзей
async function loadFriendsList() {
  try {
    if (!window.firebaseManager) {
      showMessage('❌ Firebase не инициализирован');
      return;
    }

    const friendsContainer = document.getElementById('friendsContainer');
    friendsContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const friends = await window.firebaseManager.getFriends();
    gameState.friends = friends;

    console.log('Загружено друзей:', friends.length);
    displayFriendsList(friends);
  } catch (error) {
    console.error('Ошибка загрузки друзей:', error);
    document.getElementById('friendsContainer').innerHTML =
      '<div class="empty-state">❌ Ошибка загрузки друзей</div>';
  }
}

// Отображение списка друзей
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

// Создание карточки друга
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

// Фильтрация списка друзей по Telegram ID
function filterFriendsList() {
  const searchText = document.getElementById('searchFriend').value.trim();
  const friends = gameState.friends;

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

// Отправка заявки в друзья
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

// Загрузка заявок в друзья
async function loadFriendRequests() {
  try {
    if (!window.firebaseManager) {
      showMessage('❌ Firebase не инициализирован');
      return;
    }

    const requestsContainer = document.getElementById('requestsContainer');
    requestsContainer.innerHTML = '<div class="loading">Загрузка...</div>';

    const requests = await window.firebaseManager.getFriendRequests();
    gameState.friendRequests = requests;

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

// Создание карточки заявки
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

// Форматирование чисел
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return Math.floor(num).toLocaleString('ru-RU');
}

// Форматирование времени последнего визита
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

// Форматирование даты
function formatDate(timestamp) {
  if (!timestamp) return '';

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ru-RU');
}

// =================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ===================
async function initGame() {
    if (isGameInitialized) {
        console.warn('Игра уже инициализирована');
        return;
    }

    console.log('=== ЗАГРУЗКА ИГРЫ AIKO TAPBOT ===');
    console.log('Telegram WebApp доступен:', !!window.Telegram?.WebApp);
    console.log('Telegram данные:', window.Telegram?.WebApp?.initDataUnsafe);

    // Убедитесь, что игровой экран скрыт в начале
    const gameScreen = document.getElementById('gameScreen');
    if (gameScreen) {
        gameScreen.style.display = 'none';
    }

    // Показываем прелоадер
    showPreloader('Инициализация игры...');
    updatePreloaderProgress(10);

    try {
        // Инициализируем Firebase
        updatePreloaderProgress(20);
        if (window.firebaseManager) {
            const firebaseReady = await window.firebaseManager.init();
            if (!firebaseReady) {
                console.warn('Firebase не удалось инициализировать, игра запущена без сохранения');
                updateFirebaseStatusUI(false);
            }
        }

        updatePreloaderProgress(30);

        // Создаем состояние игры
        gameState = new GameState();

        // Пробуем загрузить сохраненные данные из Firebase
        updatePreloaderProgress(40);
        const loaded = await gameState.load();

        if (!loaded) {
            console.log('Создаем новый профиль');
            gameState.reset();
            updateFirebaseStatusUI(false);
        }

        updatePreloaderProgress(60);

        // Настраиваем UI
        const petImg = document.querySelector('#pet-img');
        if (petImg) {
            petImg.style.display = gameState.hasPet ? 'block' : 'none';
            petImg.src = gameState.currentPet;
        }

        // Применяем сохраненный скин
        const hiveImg = document.querySelector('.hive-img');
        if (hiveImg && gameState.currentSkin) {
            hiveImg.style.backgroundImage = `url('${gameState.currentSkin}')`;
        }

        const requiredElements = Object.keys(elements)
            .filter(key => key !== 'levelProgress')
            .map(key => elements[key]?.id || key);

        const missingElements = requiredElements
            .filter(id => !document.getElementById(id));

        if (missingElements.length > 0) {
            console.error('Отсутствуют элементы:', missingElements);
            alert(`Ошибка загрузки! Отсутствуют: ${missingElements.join(', ')}`);
            throw new Error('Critical UI elements missing');
        }

        if (hiveImg) {
            hiveImg.style.backgroundImage = `url('${gameState.hiveImages[gameState.activeHive]}')`;
        }

        const hiveElement = document.getElementById('hive');
        if (hiveElement) {
            hiveElement.addEventListener('click', handleHiveClick);
        }

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => showPopup(btn.dataset.popup));
        });

        document.querySelectorAll('.close').forEach(btn => {
            btn.addEventListener('click', hideAllPopups);
        });

        const bossCombatImage = document.getElementById('bossCombatImage');
        if (bossCombatImage) {
            bossCombatImage.addEventListener('click', handleBossClick);
        }
        const shopTabs = document.querySelector('.shop-tabs');
        if (shopTabs) {
            shopTabs.addEventListener('click', handleShopTabs);
        }

        document.getElementById('battlePopup').addEventListener('click', handleBossSelect);

        document.addEventListener('click', e => {
            const isCombatElement = e.target.closest('#combatScreen') ||
                e.target.closest('.attack-btn') ||
                e.target.closest('.battle-reward');
            const isPopup = e.target.closest('.popup');
            const isNavButton = e.target.closest('.nav-btn');

            if (!isPopup && !isNavButton && !isCombatElement) {
                hideAllPopups();
            }

            if (gameState.inBattle && !document.getElementById('combatScreen').style.display) {
                createTalentButtons();
            }

            if (e.target.closest('.shop-item button')) {
                handleShopButton(e.target);
            }

            if (e.target.closest('.talent button')) {
                handleTalentButton(e.target);
            }
        });

        window.addEventListener('resize', () => {
            updateHiveDisplay();
            updateCombatUI(true);
        });

        updateShopItems();
        updateUI();
        startEnergyRecovery();
        gameState.updateKeysDisplay();
        initTalentBuyTab();
        initAudio();
        audioElements.musicToggle.addEventListener('click', toggleMusic);
        initCrafting();

        // Инициализация системы друзей
        updatePreloaderProgress(80);
        initFriendsSystem();

        // Инициализация системы фонов
        initBackgroundSystem();

        // Обработчики для окна результатов битвы
        document.getElementById('claimRewardButton').addEventListener('click', claimBattleReward);
        document.getElementById('closeResultButton').addEventListener('click', closeBattleResult);

        // Обновляем цены талантов
        setTimeout(() => {
            updateTalentPrices();
        }, 100);

        // Автозапуск музыки при первом клике на улей
        document.getElementById('hive').addEventListener('click', function firstPlay() {
            if (audioElements.bgMusic.paused) {
                audioElements.bgMusic.play();
            }
            document.removeEventListener('click', firstPlay);
        }, { once: true });

        // Автосохранение каждые 30 секунд (ТОЛЬКО ПРИ НАЛИЧИИ ИНТЕРНЕТА)
        setInterval(() => {
            if (gameState && typeof gameState.save === 'function') {
                gameState.save();
            }
        }, 30000);

        // Устанавливаем фон после загрузки игры
        if (gameState && gameState.currentBackground) {
            const currentBg = backgrounds.find(bg => bg.name === gameState.currentBackground);
            if (currentBg) {
                document.body.style.backgroundImage = currentBg.image;
            }
        }

        // Сохраняем при первой загрузке (если есть интернет)
        setTimeout(() => gameState.save(true), 2000);

        updatePreloaderProgress(100);

        // Показываем игровой экран ПЕРЕД скрытием прелоадера
        if (gameScreen) {
            gameScreen.style.display = 'block';
        }

        // Скрываем прелоадер с задержкой
        setTimeout(() => {
            hidePreloader();
            isGameInitialized = true;
            console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        }, 300);

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        // Показываем ошибку пользователю
        const statusText = document.getElementById('preloaderStatus');
        if (statusText) {
            statusText.textContent = 'Ошибка загрузки. Пожалуйста, перезагрузите игру.';
            statusText.style.color = '#ff6b6b';
        }

        // Все равно показываем игру
        setTimeout(() => {
            hidePreloader();
            if (gameScreen) {
                gameScreen.style.display = 'block';
            }
            isGameInitialized = true;
        }, 3000);

        // Создаем новое состояние при ошибке
        gameState = new GameState();
        gameState.reset();
        updateFirebaseStatusUI(false);
    }

    // Добавляем кнопки отладки (можно убрать после тестирования)
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
        addTelegramIdDebugButton();
        addTestButton();
    }
}

function initAudio() {
    audioElements.bgMusic.muted = gameState.isMusicMuted;
    audioElements.musicToggle.classList.toggle('muted', gameState.isMusicMuted);

    // Попытка автовоспроизведения при первом взаимодействии
    document.addEventListener('click', function initialPlay() {
        if (audioElements.bgMusic.paused) {
            audioElements.bgMusic.play().catch(error => {
                console.error('Ошибка воспроизведения музыки:', error);
            });
        }
        document.removeEventListener('click', initialPlay);
    }, { once: true });
}

function toggleMusic() {
    gameState.isMusicMuted = !gameState.isMusicMuted;
    audioElements.bgMusic.muted = gameState.isMusicMuted;
    audioElements.musicToggle.classList.toggle('muted', gameState.isMusicMuted);
    localStorage.setItem('musicMuted', gameState.isMusicMuted);
}

function handleBossClick(e) {
    if (!gameState.inBattle || !gameState.selectedTalent) {
        return;
    }

    // Add vibration effect
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }

    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Создаем эффект урона
    const damageEffect = document.createElement('div');
    damageEffect.className = 'damage-effect';
    damageEffect.style.left = x + 'px';
    damageEffect.style.top = y + 'px';

    // Рассчитываем и показываем урон
    let damage = calculateDamage(gameState.selectedTalent);
    damageEffect.textContent = `-${damage}`;

    e.target.appendChild(damageEffect);
    setTimeout(() => damageEffect.remove(), 800);

    // Наносим урон выбранным талантом
    attack(gameState.selectedTalent);

    // Добавляем анимацию для обратной связи
    const bossImage = document.getElementById('bossCombatImage');
    bossImage.style.transform = 'scale(0.95)';
    setTimeout(() => bossImage.style.transform = 'scale(1)', 100);
}

function calculateDamage(type) {
    switch (type) {
        case 'basic':
            return gameState.talents.basic.damage;
        case 'critical':
            return Math.random() < gameState.talents.critical.chance ?
                gameState.talents.basic.damage * 2 :
                gameState.talents.basic.damage;
        case 'poison':
            return gameState.talents.poison.damage;
        case 'ice':
            return gameState.craftedTalents.ice.damage;
        default:
            return 0;
    }
}

function startEnergyRecovery() {
    if (gameState.energyRecoveryInterval) {
        clearInterval(gameState.energyRecoveryInterval);
    }

    gameState.energyRecoveryInterval = setInterval(() => {
        if (gameState.energy < gameState.maxEnergy) {
            gameState.energy = Math.min(gameState.energy + 1, gameState.maxEnergy);
            updateUI(['energy']);
        }
    }, 3000);
    updateLevelProgress();
}

function initTalentBuyTab() {
    const container = document.getElementById('buyCharges');
    if (!container) return;

    // Очищаем контейнер перед добавлением новых элементов
    container.innerHTML = '';

    Object.entries(gameState.attackCharges).forEach(([type, data]) => {
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
            if (gameState.honey >= data.basePrice) {
                gameState.honey -= data.basePrice;
                data.charges += 5;
                updateUI(['honey']);
                if (gameState.inBattle) {
                    createTalentButtons();
                }
                item.querySelector('.charge-counter').textContent = `${data.charges} шт`;

                // Сохраняем после покупки
                setTimeout(() => gameState.save(), 100);
            } else {
                showMessage('Недостаточно мёда!');
            }
        });

        container.appendChild(item);
    });
}

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

// =================== ОБРАБОТЧИКИ СОБЫТИЙ ===================
let lastClick = 0;
function handleHiveClick(e) {
    if (document.querySelector('.popup.active')) {
        showMessage('Закройте другие окна!');
        return;
    }

    // Если в бою и выбран талант - наносим урон
    if (gameState.inBattle && gameState.selectedTalent) {
        const clickArea = document.querySelector('.click-area');
        const rect = clickArea.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Создаем эффект урона
        const damageEffect = document.createElement('div');
        damageEffect.className = 'damage-effect';
        damageEffect.style.left = x + 'px';
        damageEffect.style.top = y + 'px';

        // Рассчитываем и показываем урон
        let damage = calculateDamage(gameState.selectedTalent);
        damageEffect.textContent = `-${damage}`;
        clickArea.appendChild(damageEffect);

        setTimeout(() => damageEffect.remove(), 800);
        attack(gameState.selectedTalent);
        return;
    }
    // Создаем сердечки в случайных местах
    if (!gameState.inBattle) {
        const rect = e.currentTarget.getBoundingClientRect();

        // Создаем 3 сердечка в разных местах
        for (let i = 0; i < 1; i++) {
            const heart = document.createElement('div');
            heart.className = 'heart-effect';
            heart.innerHTML = '❤️';

            // Случайные координаты в пределах элемента
            const x = Math.random() * rect.width;
            const y = Math.random() * rect.height;

            heart.style.left = x + 'px';
            heart.style.top = y + 'px';

            e.currentTarget.appendChild(heart);

            setTimeout(() => {
                heart.remove();
            }, 1000);
        }
    }
    if (document.querySelector('.popup.active')) {
        showMessage('Закройте другие окна!');
        return;
    }
    const currentTime = Date.now();
    if (currentTime - lastClick < 100) return;
    lastClick = currentTime;
    if (isAnimating || gameState.energy <= 0) {
        if (gameState.energy <= 0) showEnergyWarning();
        return;
    }

    isAnimating = true;
    const multiplier = gameState.boosts.multiclick ? 2 : 1;

    try {
        gameState.honey += 1 * multiplier;
        gameState.energy = Math.max(0, gameState.energy - 1);
        updateUI(['honey', 'energy']);

        const hive = document.getElementById('hive');
        hive.style.transform = 'scale(0.95)';
        setTimeout(() => {
            hive.style.transform = 'scale(1)';
            isAnimating = false;
        }, 100);

        // Автосохранение
        setTimeout(() => gameState.save(), 100);
    } catch (error) {
        console.error('Ошибка при клике:', error);
        isAnimating = false;
    }
}

function handleShopButton(button) {
    const shopItem = button.closest('.shop-item');
    const type = shopItem?.dataset.type;
    if (!type) return;
    shopItem.closest('#shopHives') ? buyHive(type) : buyBoost(type);
}

function handleTalentButton(button) {
    const talentType = button.closest('.talent').dataset.talent;
    upgradeTalent(talentType);
}

function handleShopTabs(e) {
    const tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;

    // Убираем вкладку со скинами
    if (tabBtn.dataset.tab === 'hives') return;

    document.querySelectorAll('.shop-tab, .tab-btn').forEach(el => el.classList.remove('active'));
    tabBtn.classList.add('active');
    const tabId = `shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`;
    document.getElementById(tabId)?.classList.add('active');
}

function updateBossAvailability() {
    document.querySelectorAll('.boss-card').forEach(card => {
        const bossType = card.dataset.boss;
        let isLocked = false;

        if (bossType === 'bear' || bossType === 'dragon') {
            isLocked = gameState.keys[bossType] < 3;
        } else if (bossType === 'hydra') {
            isLocked = gameState.keys[bossType] < 3;
        } else if (bossType === 'kraken') {
            isLocked = gameState.keys[bossType] < 3;
        }

        card.classList.toggle('locked', isLocked);
    });
}

function handleBossSelect(e) {
    const bossCard = e.target.closest('.boss-card');
    if (bossCard && !bossCard.classList.contains('locked')) {
        startBattle(bossCard.dataset.boss);
    }
}

function buyBoost(type) {
    const button = document.querySelector(`.shop-item[data-type="${type}"] button`);
    if (!button || button.disabled) return;

    if (gameState.honey >= gameConfig.boostPrices[type]) {
        gameState.honey -= gameConfig.boostPrices[type];
        button.disabled = true;
        button.textContent = 'Куплено';

        const boostDuration = {
            energy: 0,
            shield: 60000,
            multiclick: 30000
        }[type];

        if (boostDuration > 0) {
            const timerElement = document.createElement('div');
            timerElement.className = 'boost-timer';
            document.body.appendChild(timerElement);

            let timeLeft = boostDuration / 1000;
            const timer = setInterval(() => {
                timeLeft--;
                timerElement.textContent = `${button.textContent.split(' ')[0]}: ${timeLeft}s`;
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    timerElement.remove();
                }
            }, 1000);
        }

        switch (type) {
            case 'energy':
                gameState.maxEnergy += 40;
                gameState.energy += 40;
                break;
            case 'shield':
                gameState.boosts.shield = true;
                setTimeout(() => gameState.boosts.shield = false, 60000);
                break;
            case 'multiclick':
                gameState.boosts.multiclick = true;
                setTimeout(() => gameState.boosts.multiclick = false, 30000);
                break;
        }
        updateUI(['honey']);
        showMessage('Буст активирован!');

        // Сохраняем после покупки
        setTimeout(() => gameState.save(), 100);
    } else {
        showMessage(`Недостаточно меда! Нужно: ${gameConfig.boostPrices[type]}`);
    }
}

function upgradeTalent(talentType) {
    const talent = talentsConfig[talentType];
    const currentLevel = gameState.talents[talentType].level;

    if (currentLevel >= talent.maxLevel) return;
    const cost = talent.getCost(currentLevel);
    if (gameState.honey < cost) {
        showMessage('Недостаточно меда!');
        return;
    }

    gameState.honey -= cost;
    gameState.talents[talentType].level++;

    switch (talentType) {
        case 'basic':
            gameState.talents.basic.damage = talent.getDamage(gameState.talents.basic.level);
            // Обновляем урон звукового и ледяного ударов
            if (gameState.craftedTalents.sonic.level > 0) {
                gameState.craftedTalents.sonic.damage = 50 * gameState.talents.basic.level;
            }
            if (gameState.craftedTalents.ice.level > 0) {
                gameState.craftedTalents.ice.damage = 60 * gameState.talents.basic.level;
            }
            break;
        case 'critical':
            gameState.talents.critical.chance = talent.getChance(gameState.talents.critical.level);
            // Обновляем урон крафтовых талантов
            if (gameState.craftedTalents.sonic.level > 0) {
                gameState.craftedTalents.sonic.damage = 50 * gameState.talents.basic.level;
            }
            if (gameState.craftedTalents.fire.level > 0) {
                gameState.craftedTalents.fire.damage = 75 * gameState.talents.critical.level;
            }
            break;
        case 'poison':
            gameState.talents.poison.damage = talent.getDamage(gameState.talents.poison.level);
            // Обновляем урон огненного и ледяного ударов
            if (gameState.craftedTalents.fire.level > 0) {
                gameState.craftedTalents.fire.damage = 75 * gameState.talents.critical.level;
            }
            if (gameState.craftedTalents.ice.level > 0) {
                gameState.craftedTalents.ice.damage = 60 * gameState.talents.poison.level;
            }
            break;
    }

    updateTalentPrices();
    updateUI(['honey', 'talents']);
    showMessage('Талант улучшен!');

    // Сохраняем после улучшения
    setTimeout(() => gameState.save(), 100);
}

// =================== БОЕВАЯ СИСТЕМА ===================
function startBattle(bossType) {
    const bossConfig = gameConfig.bosses[bossType];
    if (!bossConfig) return;

    if (bossType !== 'wasp' && gameState.keys[bossType] < 3) {
        showMessage(`Нужно 3 ключа! У вас: ${gameState.keys[bossType]}`);
        return;
    }

    if (bossType !== 'wasp') {
        gameState.keys[bossType] -= 3;
        gameState.updateKeysDisplay();
    }

    if (gameState.inBattle) return;

    gameState.inBattle = true;
    gameState.currentBoss = {
        ...bossConfig,
        currentHealth: bossConfig.health,
        maxHealth: bossConfig.health,
        type: bossType
    };

    const bossSelection = document.getElementById('bossSelection');
    if (bossSelection) bossSelection.style.display = 'none';

    const combatScreen = document.getElementById('combatScreen');
    if (combatScreen) combatScreen.style.display = 'block';

    const bossCombatImage = document.getElementById('bossCombatImage');
    if (bossCombatImage) bossCombatImage.src = bossConfig.image;

    const battleReward = document.getElementById('battleReward');
    if (battleReward) battleReward.style.display = 'none';

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
        updateCombatUI(true);
    }, 50);

    createTalentButtons();
    startBattleTimer(bossConfig.time);
}

function createTalentButtons() {
    elements.combatTalents.innerHTML = '';

    // Добавляем обычные таланты
    Object.entries(gameState.talents).forEach(([type, talent]) => {
        if (talent.level > 0) {
            const charges = gameState.attackCharges[type].charges;
            if (charges <= 0) return; // Пропускаем таланты без зарядов

            const isSelected = gameState.selectedTalent === type;
            const isDisabled = !gameState.inBattle;

            const button = document.createElement('button');
            button.className = `attack-btn ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`;
            button.dataset.attack = type;
            button.disabled = isDisabled;
            button.innerHTML = `
                <div class="talent-icon">${getTalentIcon(type)}</div>
                <div class="talent-info">
                    <div>${getTalentButtonText(type)}</div>
                    <div class="charge-counter">Всего: ${charges}</div>
                </div>
            `;

            button.onclick = () => {
                if (gameState.selectedTalent === type) {
                    gameState.selectedTalent = null; // Снять выбор
                } else {
                    gameState.selectedTalent = type; // Выбрать талант
                }
                createTalentButtons(); // Обновить кнопки
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
        if (gameState.craftedTalents[talent.type].charges > 0) {
            const button = document.createElement('button');
            button.className = `attack-btn ${gameState.selectedTalent === talent.type ? 'selected' : ''}`;
            button.dataset.attack = talent.type;
            button.innerHTML = `
                <div class="talent-icon">${talent.icon}</div>
                <div class="talent-info">
                    <div>${talent.name}</div>
                    <div class="charge-counter">Всего: ${gameState.craftedTalents[talent.type].charges}</div>
                </div>
            `;
            button.onclick = () => {
                gameState.selectedTalent = gameState.selectedTalent === talent.type ? null : talent.type;
                createTalentButtons();
            };
            elements.combatTalents.appendChild(button);
        }
    });
}

function startBattleTimer(seconds) {
    if (gameState.battleTimer) clearInterval(gameState.battleTimer);
    let timeLeft = seconds;
    elements.combatTimer.textContent = timeLeft;
    elements.combatTimer.style.color = 'white';

    gameState.battleTimer = setInterval(() => {
        if (!gameState.inBattle || gameState.currentBoss.currentHealth <= 0) {
            clearInterval(gameState.battleTimer);
            return;
        }
        if (!gameState.inBattle) {
            clearInterval(gameState.battleTimer);
            return;
        }
        timeLeft--;
        elements.combatTimer.textContent = timeLeft;
        elements.combatTimer.style.color = timeLeft <= 10 ? 'red' : 'white';
        if (gameState.currentBoss.currentHealth <= 0) {
            clearInterval(gameState.battleTimer);
            return;
        }
        if (timeLeft <= 0) {
            endBattle(false);
            elements.bossCombatImage.classList.add('grayscale');
        }
    }, 1000);
}

function attack(type) {
    if (!gameState.inBattle || !gameState.selectedTalent) {
        return;
    }

    // Проверяем кулдаун
    const now = Date.now();
    if (now - (gameState.lastAttackTime || 0) < 1000) {
        return; // Пропускаем атаку если прошло менее 1 секунды
    }
    gameState.lastAttackTime = now;

    // Обработка крафтовых талантов
    if (type === 'sonic' || type === 'fire' || type === 'ice') {
        if (!gameState.craftedTalents[type]) {
            console.error('Crafted talent not found:', type);
            return;
        }
        const talent = gameState.craftedTalents[type];
        if (talent.charges <= 0) {
            showMessage(`Нет зарядов ${type === 'sonic' ? 'звукового' : (type === 'fire' ? 'огненного' : 'ледяного')} удара!`);
            return;
        }
        talent.charges--;
        const rawDamage = talent.damage * talent.level;
        const actualDamage = Math.min(rawDamage, gameState.currentBoss.currentHealth);

        gameState.currentBoss.currentHealth = Math.max(0, gameState.currentBoss.currentHealth - rawDamage);
        gameState.battleStats[`${type}Damage`] += actualDamage;
        gameState.battleStats.totalDamage += actualDamage;

        if (type === 'sonic') {
            showSonicEffect(rawDamage);
        } else if (type === 'fire') {
            showFireEffect(rawDamage);
        } else {
            showIceEffect(rawDamage);
        }

        updateCombatUI();
        createTalentButtons();
        if (gameState.currentBoss.currentHealth <= 0) {
            endBattle(true);
        }
        return;
    }

    // Проверяем заряды
    if (gameState.attackCharges[type].charges <= 0) {
        showMessage('Заряды кончились!');
        createTalentButtons();
        return;
    }

    // Уменьшаем заряды
    gameState.attackCharges[type].charges--;
    updateTalentBuyTab();

    // Наносим урон
    let damage = 0;
    switch (type) {
        case 'basic':
            damage = calculateBasicDamage();
            const actualBasicDamage = Math.min(damage, gameState.currentBoss.currentHealth);
            gameState.battleStats.basicDamage += actualBasicDamage;
            gameState.battleStats.totalDamage += actualBasicDamage;
            showBasicEffect(actualBasicDamage);
            break;
        case 'critical':
            damage = calculateBasicDamage();
            if (Math.random() < gameState.talents.critical.chance) {
                damage *= 2;
                showCriticalEffect(damage);
            } else {
                showBasicEffect(damage);
            }
            const actualCritDamage = Math.min(damage, gameState.currentBoss.currentHealth);
            gameState.battleStats.criticalDamage += actualCritDamage;
            gameState.battleStats.totalDamage += actualCritDamage;
            break;
        case 'poison':
            const poisonDamage = gameState.talents.poison.damage;
            const duration = talentsConfig.poison.getDuration(gameState.talents.poison.level);
            const poisonEffect = {
                damage: poisonDamage,
                startTime: Date.now(),
                duration: duration * 1000,
                timer: null,
                remaining: duration
            };
            poisonEffect.timer = setInterval(() => {
                if (!gameState.inBattle || gameState.currentBoss.currentHealth <= 0) {
                    clearInterval(poisonEffect.timer);
                    return;
                }
                gameState.currentBoss.currentHealth -= poisonDamage;
                gameState.battleStats.poisonDamage += poisonDamage;
                gameState.battleStats.totalDamage += poisonDamage;
                updateCombatUI();
                if (gameState.currentBoss.currentHealth <= 0) {
                    endBattle(true);
                }
            }, 1000);
            setTimeout(() => {
                clearInterval(poisonEffect.timer);
                gameState.activeEffects.poison = gameState.activeEffects.poison.filter(e => e !== poisonEffect);
                updatePoisonTimersDisplay();
            }, poisonEffect.duration);
            gameState.activeEffects.poison.push(poisonEffect);
            showPoisonTimer(duration);
            break;
    }
    gameState.battleStats.totalDamage += damage;

    if (damage > 0) {
        gameState.currentBoss.currentHealth = Math.max(gameState.currentBoss.currentHealth - damage, 0);
        updateCombatUI();

        if (gameState.currentBoss.currentHealth <= 0) {
            endBattle(true);
        }
    }

    // Обновляем интерфейс зарядов
    const chargeCounter = document.querySelector(`[data-attack="${type}"] .charge-counter`);
    if (chargeCounter) {
        chargeCounter.textContent = `Зарядов: ${gameState.attackCharges[type].charges}`;
    }

    // Обновляем интерфейс
    createTalentButtons();
}

function endBattle(victory) {
    if (!gameState.inBattle || !gameState.currentBoss) return;

    // Очистка ядовитых эффектов
    gameState.activeEffects.poison.forEach(e => {
        clearInterval(e.timer);
        clearTimeout(e.timeout);
    });
    gameState.activeEffects.poison = [];

    const poisonContainer = document.getElementById('poisonTimersContainer');
    if (poisonContainer) poisonContainer.innerHTML = '';

    elements.bossCombatImage?.classList.remove('grayscale');

    let reward = null;
    if (victory) {
        const bossConfig = gameConfig.bosses[gameState.currentBoss.type];
        reward = {
            honey: bossConfig.honeyReward,
            xp: bossConfig.xpReward,
            keys: bossConfig.keyReward ? { [bossConfig.keyReward.type]: bossConfig.keyReward.amount } : {}
        };
    }

    gameState.battleResult = {
        victory: victory,
        boss: { ...gameState.currentBoss },
        reward: reward
    };

    gameState.inBattle = false;
    gameState.currentBoss = null;
    gameState.selectedTalent = null;

    if (gameState.battleTimer) {
        clearInterval(gameState.battleTimer);
        gameState.battleTimer = null;
    }

    const stats = document.querySelector('.stats-grid');
    stats.innerHTML = '';

    const addStatIfUsed = (type, icon, name) => {
        const damage = gameState.battleStats[`${type}Damage`];
        if (damage > 0) {
            const div = document.createElement('div');
            div.className = 'stat-item';
            div.innerHTML = `${icon} ${name}: <span>${Math.floor(damage)}</span>`;
            stats.appendChild(div);
        }
    };

    addStatIfUsed('basic', '🗡️', 'Базовый урон');
    addStatIfUsed('critical', '💥', 'Критический урон');
    addStatIfUsed('poison', '☠️', 'Ядовитый урон');
    addStatIfUsed('sonic', '🔊', 'Звуковой урон');
    addStatIfUsed('fire', '🔥', 'Огненный урон');
    addStatIfUsed('ice', '❄️', 'Ледяной урон');

    try {
        updateResultPopup();
        showPopup('battleResult');
        document.querySelectorAll('.attack-btn').forEach(btn => btn.disabled = true);
        elements.combatScreen.style.display = 'none';
        elements.combatTalents.innerHTML = '';
        document.getElementById('bossSelection').style.display = 'block';
    } catch (e) {
        console.error('Ошибка обновления интерфейса:', e);
    }

    gameState.battleStats = {
        basicDamage: 0,
        criticalDamage: 0,
        poisonDamage: 0,
        sonicDamage: 0,
        fireDamage: 0,
        iceDamage: 0,
        totalDamage: 0
    };

    updateTalentBuyTab();

    // Сохраняем прогресс после боя
    setTimeout(() => gameState.save(), 500);
}

function updateTalentBuyTab() {
    const container = document.getElementById('buyCharges');
    if (!container) return;

    container.querySelectorAll('.attack-charge-item').forEach(item => {
        const type = item.querySelector('button').dataset.type;
        const charges = gameState.attackCharges[type].charges;
        item.querySelector('.charge-counter').textContent = `${charges} шт`;
    });
}

// =================== ОБНОВЛЕНИЕ ПОПАПА РЕЗУЛЬТАТОВ ===================
function updateResultPopup() {
    if (!gameState.battleResult) return;

    const resultTitle = document.getElementById('resultTitle');
    const resultBossImage = document.getElementById('resultBossImage');
    const rewardHoney = document.getElementById('rewardHoney');
    const rewardXP = document.getElementById('rewardXP');
    const rewardKeys = document.getElementById('rewardKeys');
    const claimBtn = document.getElementById('claimRewardButton');
    const closeBtn = document.getElementById('closeResultButton');

    if (!gameState.battleResult || !gameState.battleResult.boss) return;
    const bossConfig = gameConfig.bosses[gameState.battleResult.boss.type];
    const reward = gameState.battleResult.reward;

    resultBossImage.src = gameState.battleResult.victory
        ? bossConfig.defeatImage
        : bossConfig.image;

    if (gameState.battleResult.victory) {
        resultTitle.textContent = "ПОБЕДА!";
        resultTitle.style.color = "#4CAF50";
        claimBtn.style.display = 'block';
        closeBtn.style.display = 'none';

        if (reward) {
            rewardHoney.textContent = reward.honey;
            rewardXP.textContent = reward.xp;

            const keys = Object.entries(reward.keys || {})
                .map(([type, amount]) => amount)
                .reduce((a, b) => a + b, 0);

            rewardKeys.textContent = keys > 0 ? keys : '0';
        }
    } else {
        resultTitle.textContent = "ПОРАЖЕНИЕ";
        resultTitle.style.color = "#f44336";
        claimBtn.style.display = 'none';
        closeBtn.style.display = 'block';

        rewardHoney.textContent = '0';
        rewardXP.textContent = '0';
        rewardKeys.textContent = '0';
    }

    resultBossImage.classList.toggle('defeat-image', !gameState.battleResult.victory);
    resultBossImage.classList.toggle('victory-image', gameState.battleResult.victory);
}

// Обработчик получения награды
function claimBattleReward() {
    const reward = gameState.battleResult?.reward;
    const bossType = gameState.battleResult?.boss?.type;

    if (reward) {
        if (bossType === 'wasp' || bossType === 'bear') {
            if (!gameState.achievements) {
                gameState.achievements = {
                    waspKills: 0,
                    bearKills: 0,
                    rewards: { kingOfWasps: false },
                    bearRewards: { kingOfBears: false }
                };
            }

            if (bossType === 'wasp') {
                gameState.achievements.waspKills++;
                const kills = gameState.achievements.waspKills;
                if (kills >= 10 && !gameState.achievements.rewards.level1) {
                    reward.honey += 1000;
                    reward.xp += 500;
                    gameState.achievements.rewards.level1 = true;
                } else if (kills >= 20 && !gameState.achievements.rewards.level2) {
                    reward.honey += 2000;
                    reward.xp += 1000;
                    gameState.achievements.rewards.level2 = true;
                } else if (kills >= 30 && !gameState.achievements.rewards.level3) {
                    reward.honey += 3000;
                    reward.xp += 1500;
                    gameState.achievements.rewards.level3 = true;
                }
            } else if (bossType === 'bear') {
                gameState.achievements.bearKills++;
                const kills = gameState.achievements.bearKills;
                if (kills >= 10 && !gameState.achievements.bearRewards.level1) {
                    reward.honey += 2000;
                    reward.xp += 1000;
                    gameState.achievements.bearRewards.level1 = true;
                } else if (kills >= 20 && !gameState.achievements.bearRewards.level2) {
                    reward.honey += 4000;
                    reward.xp += 2000;
                    gameState.achievements.bearRewards.level2 = true;
                } else if (kills >= 30 && !gameState.achievements.bearRewards.level3) {
                    reward.honey += 6000;
                    reward.xp += 3000;
                    gameState.achievements.bearRewards.level3 = true;
                }
            }
            updateAchievementsUI();
        }

        gameState.honey += reward.honey;
        gameState.xp += reward.xp;

        Object.entries(reward.keys || {}).forEach(([type, amount]) => {
            gameState.keys[type] = (gameState.keys[type] || 0) + amount;
        });

        checkLevelUp();
        updateUI();
        gameState.battleResult = null;
        gameState.inBattle = false;
        hidePopup('battleResult');
        document.getElementById('bossSelection').style.display = 'block';
        document.getElementById('combatScreen').style.display = 'none';

        // Сохраняем после получения награды
        setTimeout(() => gameState.save(), 100);
    }
}

// Обработчик закрытия результатов
function closeBattleResult() {
    gameState.battleResult = null;
    gameState.inBattle = false;
    hidePopup('battleResult');
    document.getElementById('bossSelection').style.display = 'block';
    document.getElementById('combatScreen').style.display = 'none';
}

function showFireEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `🔥 ${damage}`;
    effect.style.color = '#ff4400';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

document.querySelectorAll('.popup .close').forEach(btn => {
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
            hidePopup(popup.id.replace('Popup', ''));
        }
    });
});

// =================== СИСТЕМА УРОВНЕЙ ===================
function checkLevelUp() {
    let levelsGained = 0;
    while (gameState.xp >= gameState.xpToNextLevel) {
        gameState.xp -= gameState.xpToNextLevel;
        gameState.level++;
        levelsGained++;
        gameState.xpToNextLevel = gameState.calculateXPRequired(gameState.level);
    }

    if (levelsGained > 0) {
        applyLevelBonuses(levelsGained);
        showLevelUpEffect(levelsGained);
        updateLevelProgress();
        updateUI(['level']);
        updateAchievementsUI();

        // Сохраняем при повышении уровня
        setTimeout(() => gameState.save(), 100);
    }
}

function applyLevelBonuses(levels) {
    gameState.maxEnergy += 5 * levels;
    gameState.talents.basic.damage += 2 * levels;
    gameState.boosts.attackSpeed += 0.03 * levels;
}

function updateLevelProgress() {
    const progress = (gameState.xp / gameState.xpToNextLevel) * 100;
    elements.levelProgress.style.width = `${Math.min(progress, 100)}%`;
}

// =================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ===================
function updateHiveDisplay() {
    const hiveImg = document.querySelector('.hive-img');
    if (hiveImg) {
        hiveImg.style.backgroundImage = `url('${gameState.hiveImages[gameState.activeHive]}')`;
    }
}

function updatePoisonTimersDisplay() {
    const container = document.getElementById('poisonTimersContainer');
    if (!container) return;

    container.innerHTML = '';
    gameState.activeEffects.poison.forEach(effect => {
        const remaining = Math.ceil((effect.duration - (Date.now() - effect.startTime)) / 1000);
        if (remaining > 0) {
            const timer = document.createElement('div');
            timer.className = 'poison-timer';
            timer.innerHTML = `☠️ ${remaining}s`;
            container.appendChild(timer);
        }
    });
}

function updateUI(changedKeys = ['all']) {
    updateBossAvailability();
    const updates = {
        honey: () => {
            if (elements.honey) elements.honey.textContent = Math.floor(gameState.honey);
        },
        energy: () => {
            if (elements.energy) elements.energy.textContent = Math.floor(gameState.energy);
            if (elements.maxEnergy) elements.maxEnergy.textContent = gameState.maxEnergy;
        },
        level: () => {
            if (elements.level) elements.level.textContent = gameState.level;
            if (elements.xp) elements.xp.textContent = Math.floor(gameState.xp);
            if (elements.xpToNextLevel) {
                elements.xpToNextLevel.textContent = Math.floor(gameState.xpToNextLevel);
            }
        },
        talents: () => {
            updateTalentUI('basic', 'basicLevel', 'basicDmg');
            updateTalentUI('critical', 'critLevel', 'critChanceUpgrade');
            updateTalentUI('poison', 'poisonLevel', 'poisonDmgUpgrade');
            updateTalentPrices();
        }
    };

    function updateTalentUI(talentType, levelElementId, statElementId) {
        const levelElem = document.getElementById(levelElementId);
        const statElem = document.getElementById(statElementId);
        if (levelElem) levelElem.textContent = gameState.talents[talentType].level;
        if (statElem) {
            const value = gameState.talents[talentType][talentType === 'critical' ? 'chance' : 'damage'];
            statElem.textContent = talentType === 'critical' ? value.toFixed(2) : value;
        }
    }

    function updateTalentPrices() {
        Object.keys(talentsConfig).forEach(talentType => {
            const talent = talentsConfig[talentType];
            const currentLevel = gameState.talents[talentType].level;
            const button = document.querySelector(`.talent[data-talent="${talentType}"] button`);
            if (button) {
                if (currentLevel >= talent.maxLevel) {
                    button.textContent = 'MAX';
                    button.disabled = true;
                } else {
                    const cost = Math.floor(talent.getCost(currentLevel));
                    button.textContent = `${cost}`;
                    button.disabled = gameState.honey < cost;
                }
            }
        });
    }

    if (changedKeys.includes('all')) {
        Object.values(updates).forEach(update => update());
        updateLevelProgress();
        gameState.updateKeysDisplay();
    } else {
        changedKeys.forEach(key => {
            if (updates[key]) updates[key]();
        });
        if (changedKeys.includes('level')) updateLevelProgress();
    }

    updateLevelProgress();
}

// =================== ВИЗУАЛЬНЫЕ ЭФФЕКТЫ ===================
function showLevelUpEffect(levels) {
    const div = document.createElement('div');
    div.className = 'level-up';
    div.textContent = `Уровень +${levels}!`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}

function showCriticalEffect(damage) {
    const div = document.createElement('div');
    div.className = 'critical-effect';
    div.textContent = `CRIT! ${damage}`;
    elements.combatScreen.appendChild(div);
    setTimeout(() => div.remove(), 1000);
}

function showHealEffect(amount) {
    const healIndicator = document.createElement('div');
    healIndicator.className = 'heal-effect';
    healIndicator.textContent = `+${amount} ⚡`;
    elements.combatScreen.appendChild(healIndicator);
    setTimeout(() => healIndicator.remove(), 1000);
}

function showEnergyWarning() {
    const div = document.createElement('div');
    div.className = 'energy-warning';
    div.textContent = 'Недостаточно энергии!';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1500);
}

function showMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'game-message';
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);
}

function showSonicEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `🔊 ${damage}`;
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showIceEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `❄️ ${damage}`;
    effect.style.color = '#00cccc';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showBasicEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'basic-effect';
    effect.textContent = `🗡️ ${damage}`;
    effect.style.color = '#ffd700';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showPoisonAttackEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'poison-attack-effect';
    effect.textContent = `☠️ ${damage}`;
    effect.style.color = '#32CD32';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

// =================== УПРАВЛЕНИЕ ПОПАПАМИ ===================
function showPopup(popupType) {
    if (popupType === 'battleResult' && !gameState.battleResult) return;
    hideAllPopups();
    const popup = document.getElementById(`${popupType}Popup`);
    if (popup) {
        popup.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Особые действия при открытии определенных попапов
        if (popupType === 'friends') {
            // При открытии попапа друзей загружаем данные
            loadFriendsList();
        }
        if (popupType === 'battleResult') updateResultPopup();
    }
}

function hidePopup(type) {
    const popup = document.getElementById(`${type}Popup`);
    if (popup) {
        popup.classList.remove('active');
        document.body.style.overflow = '';

        if (type === 'battle') {
            gameState.selectedTalent = null;
            if (!gameState.inBattle) {
                document.getElementById('combatScreen').style.display = 'none';
            }
            createTalentButtons();
        }

        if (type === 'battleResult') {
            gameState.battleResult = null;
            gameState.inBattle = false;
            document.getElementById('combatScreen').style.display = 'none';
        }
    }
}

function hideAllPopups() {
    document.querySelectorAll('.popup').forEach(p => {
        p.classList.remove('active');
    });
    document.body.style.overflow = '';
}

function updateShopItems() {
    document.querySelectorAll('.shop-item').forEach(item => {
        const type = item.dataset.type;
        if (type && gameState.purchasedHives.includes(type)) {
            item.classList.add('disabled');
            const button = item.querySelector('button');
            button.disabled = true;
            button.textContent = 'Куплено';
        }
    });
}

// =================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===================
function getAttackName(type) {
    return {
        basic: 'Базовый удар',
        critical: 'Критический удар',
        poison: 'Ядовитый удар'
    }[type];
}

function calculateBasicDamage() {
    let damage = talentsConfig.basic.getDamage(gameState.talents.basic.level);
    damage *= gameState.boosts.attackSpeed;
    if (gameState.activeHive === 'inferno') damage += gameState.hiveBonuses.inferno.fireDamage;
    if (gameState.boosts.shield) damage *= 0.7;
    return Math.round(damage);
}

function calculateReward(boss) {
    if (boss.type === 'wasp') {
        gameState.achievements.waspKills++;
    }
    const reward = {
        honey: boss.honeyReward,
        xp: boss.xpReward,
        keys: {}
    };

    if (boss.type === 'wasp') {
        if (!gameState.achievements) {
            gameState.achievements = { waspKills: 0 };
        }
        gameState.achievements.waspKills++;

        if (gameState.achievements.waspKills >= 10 && !gameState.achievements.rewards?.kingOfWasps) {
            reward.honey += 1000;
            reward.xp += 500;
            if (!gameState.achievements.rewards) {
                gameState.achievements.rewards = {};
            }
            gameState.achievements.rewards.kingOfWasps = true;
        }
    }

    if (boss.keyReward) {
        reward.keys[boss.keyReward.type] = boss.keyReward.amount;
    }
    if (gameState.achievements.waspKills >= 10 && !gameState.achievements.rewards.kingOfWasps) {
        gameState.achievements.rewards.kingOfWasps = true;
    }

    if (gameState.activeHive === 'crystal') {
        reward.honey = Math.floor(reward.honey * 1.3);
    }

    return reward;
}

function updateAchievementsUI() {
    const waspKillCount = document.getElementById('waspKillCount');
    const waspProgress = document.getElementById('waspKillProgress');
    const waspCard = document.querySelector('.achievement-card');

    if (waspKillCount && waspProgress) {
        const waspKills = gameState.achievements.waspKills;
        let waspTarget, waspLevel, waspRewards, waspBackground;

        if (waspKills < 10) {
            waspTarget = 10;
            waspLevel = 0;
            waspRewards = '🍯 1000 ⭐ 500';
            waspBackground = 'rgba(0, 0, 0, 0.5)';
        } else if (waspKills < 20) {
            waspTarget = 20;
            waspLevel = 1;
            waspRewards = '🍯 2000 ⭐ 1000';
            waspBackground = 'rgba(139, 69, 19, 0.5)';
        } else if (waspKills < 30) {
            waspTarget = 30;
            waspLevel = 2;
            waspRewards = '🍯 3000 ⭐ 1500';
            waspBackground = 'rgba(218, 165, 32, 0.5)';
        } else {
            waspTarget = 30;
            waspLevel = 3;
            waspRewards = 'Максимум';
            waspBackground = 'rgba(218, 165, 32, 0.5)';
        }

        waspKillCount.textContent = `${Math.min(waspKills, waspTarget)}/${waspTarget}`;
        const waspProgressValue = (waspKills % 10) * 10;
        waspProgress.style.width = `${waspProgressValue}%`;

        if (waspCard) {
            waspCard.style.background = waspBackground;
            waspCard.querySelector('.achievement-info h3').textContent = `Король ОС (Уровень ${waspLevel + 1})`;
            if (waspKills < 30) {
                waspCard.querySelector('.achievement-rewards').innerHTML = waspRewards;
            }
        }
    }

    const bearKillCount = document.getElementById('bearKillCount');
    const bearProgress = document.getElementById('bearKillProgress');
    const bearCard = document.querySelectorAll('.achievement-card')[1];

    if (bearKillCount && bearProgress) {
        const bearKills = gameState.achievements.bearKills;
        let bearTarget, bearLevel, bearRewards, bearBackground;

        if (bearKills < 10) {
            bearTarget = 10;
            bearLevel = 0;
            bearRewards = '🍯 2000 ⭐ 1000';
            bearBackground = 'rgba(0, 0, 0, 0.5)';
        } else if (bearKills < 20) {
            bearTarget = 20;
            bearLevel = 1;
            bearRewards = '🍯 4000 ⭐ 2000';
            bearBackground = 'rgba(139, 69, 19, 0.5)';
        } else if (bearKills < 30) {
            bearTarget = 30;
            bearLevel = 2;
            bearRewards = '🍯 6000 ⭐ 3000';
            bearBackground = 'rgba(218, 165, 32, 0.5)';
        } else {
            bearTarget = 30;
            bearLevel = 3;
            bearRewards = 'Максимум';
            bearBackground = 'rgba(218, 165, 32, 0.5)';
        }

        bearKillCount.textContent = `${Math.min(bearKills, bearTarget)}/${bearTarget}`;
        const bearProgressValue = (bearKills % 10) * 10;
        bearProgress.style.width = `${bearProgressValue}%`;

        if (bearCard) {
            bearCard.style.background = bearBackground;
            bearCard.querySelector('.achievement-info h3').textContent = `Король Медведей (Уровень ${bearLevel + 1})`;
            if (bearKills < 30) {
                bearCard.querySelector('.achievement-rewards').innerHTML = bearRewards;
            }
        }
    }
}

function updateCombatUI() {
    if (!gameState.currentBoss) return;
    if (gameState.currentBoss.currentHealth < 0) {
        gameState.currentBoss.currentHealth = 0;
    }
    const healthPercent = (gameState.currentBoss.currentHealth / gameState.currentBoss.maxHealth) * 100;
    elements.bossHealth.style.width = `${healthPercent}%`;
    elements.currentHealth.textContent = gameState.currentBoss.currentHealth;

    const bossCombatImage = document.getElementById('bossCombatImage');
    if (bossCombatImage) {
        if (healthPercent <= 25) {
            bossCombatImage.src = `img/${gameState.currentBoss.type}_critical.jpg`;
        } else if (healthPercent <= 50) {
            bossCombatImage.src = `img/${gameState.currentBoss.type}_wounded.jpg`;
        } else {
            bossCombatImage.src = gameConfig.bosses[gameState.currentBoss.type].image;
        }
    }
}

function getTalentButtonText(type) {
    return {
        basic: 'Базовый',
        critical: 'Критический',
        poison: 'Ядовитый'
    }[type] || '';
}

function getTalentIcon(type) {
    return {
        basic: '🗡️',
        critical: '💥',
        poison: '☠️',
        ice: '❄️'
    }[type] || '';
}

// =================== ФУНКЦИИ КАСТОМИЗАЦИИ ===================
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');
    document.querySelector(`button[onclick="showTab('${tabName}')"]`).classList.add('active');
}

function selectSkin() {
    const selectedSkin = document.getElementById('selected-skin').src;
    const hiveImg = document.querySelector('.hive-img');
    if (hiveImg) {
        hiveImg.style.backgroundImage = `url('${selectedSkin}')`;
        gameState.currentSkin = selectedSkin;
        updateSkinButton();

        // СОХРАНЯЕМ СРАЗУ
        gameState.save(true).then(() => {
            console.log('Скин сохранен');
        });
    }
    hidePopup('customization');
}

function previewSkin(skin, name) {
    document.getElementById('selected-skin').src = skin;
    document.getElementById('skin-name').textContent = name;
    updateSkinButton();
}

function updateSkinButton() {
    const selectButton = document.getElementById('select-skin');
    const currentSkin = document.getElementById('selected-skin').src;
    if (selectButton) {
        if (currentSkin === gameState.currentSkin) {
            selectButton.disabled = true;
            selectButton.textContent = 'Выбрано';
        } else {
            selectButton.disabled = false;
            selectButton.textContent = 'Выбрать';
        }
    }
}

function selectPet() {
    const selectedPet = document.getElementById('selected-pet').src;
    const petImg = document.querySelector('#pet-img');
    if (petImg) {
        petImg.src = selectedPet;
        gameState.currentPet = selectedPet;
        gameState.hasPet = true;
        petImg.style.display = 'block';
        updatePetButton();

        // СОХРАНЯЕМ СРАЗУ
        gameState.save(true).then(() => {
            console.log('Питомец сохранен');
        });
    }
    hidePopup('customization');
}

function previewPet(pet, name) {
    document.getElementById('selected-pet').src = pet;
    document.getElementById('pet-name').textContent = name;
    updatePetButton();
}

function updatePetButton() {
    const selectButton = document.getElementById('select-pet');
    const currentPet = document.getElementById('selected-pet').src;
    if (selectButton) {
        if (currentPet === gameState.currentPet) {
            selectButton.disabled = true;
            selectButton.textContent = 'Выбрано';
        } else {
            selectButton.disabled = false;
            selectButton.textContent = 'Выбрать';
        }
    }
}

// =================== СИСТЕМА КРАФТИНГА ===================
function initCrafting() {
    const talentCards = document.querySelectorAll('.talent-card');
    const craftSlots = document.querySelectorAll('.craft-slot');
    const craftButton = document.getElementById('craftButton');

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

    sonicButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (gameState.attackCharges.basic.charges >= 1 && gameState.attackCharges.critical.charges >= 1) {
            gameState.attackCharges.basic.charges -= 1;
            gameState.attackCharges.critical.charges -= 1;

            gameState.craftedTalents.sonic.charges += 1;
            gameState.craftedTalents.sonic.level = Math.max(
                gameState.talents.basic.level,
                gameState.talents.critical.level
            );

            showMessage('✨ Создан новый талант: Звуковой удар!');
            resetCrafting();
            updateTalentBuyTab();
            if (gameState.inBattle) {
                setTimeout(() => createTalentButtons(), 100);
            }

            // Сохраняем после крафта
            setTimeout(() => gameState.save(), 100);
        } else {
            showMessage('Недостаточно зарядов!');
        }
    });

    fireButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (gameState.attackCharges.critical.charges >= 1 && gameState.attackCharges.poison.charges >= 1) {
            gameState.attackCharges.critical.charges -= 1;
            gameState.attackCharges.poison.charges -= 1;

            gameState.craftedTalents.fire.charges += 1;
            gameState.craftedTalents.fire.level = Math.max(
                gameState.talents.critical.level,
                gameState.talents.poison.level
            );

            showMessage('🔥 Создан новый талант: Огненный удар!');
            resetCrafting();
            updateTalentBuyTab();
            if (gameState.inBattle) {
                setTimeout(() => createTalentButtons(), 100);
            }

            // Сохраняем после крафта
            setTimeout(() => gameState.save(), 100);
        } else {
            showMessage('Недостаточно зарядов!');
        }
    });

    iceButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (gameState.attackCharges.poison.charges >= 1 && gameState.attackCharges.basic.charges >= 1) {
            gameState.attackCharges.poison.charges -= 1;
            gameState.attackCharges.basic.charges -= 1;

            gameState.craftedTalents.ice.charges += 1;
            gameState.craftedTalents.ice.level = Math.max(
                gameState.talents.poison.level,
                gameState.talents.basic.level
            );

            showMessage('❄️ Создан новый талант: Ледяной удар!');
            resetCrafting();
            updateTalentBuyTab();
            if (gameState.inBattle) {
                setTimeout(() => createTalentButtons(), 100);
            }

            // Сохраняем после крафта
            setTimeout(() => gameState.save(), 100);
        } else {
            showMessage('Недостаточно зарядов!');
        }
    });

    if (sonicButton) sonicButton.style.display = 'none';
    if (fireButton) fireButton.style.display = 'none';
    if (iceButton) iceButton.style.display = 'none';
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
            sonicButton.disabled = gameState.attackCharges.basic.charges < 1 ||
                gameState.attackCharges.critical.charges < 1;
        }
    }

    if (fireButton) {
        fireButton.style.display = isFireRecipe ? 'block' : 'none';
        if (isFireRecipe) {
            fireButton.disabled = gameState.attackCharges.critical.charges < 1 ||
                gameState.attackCharges.poison.charges < 1;
        }
    }

    if (iceButton) {
        iceButton.style.display = isIceRecipe ? 'block' : 'none';
        if (isIceRecipe) {
            iceButton.disabled = gameState.attackCharges.basic.charges < 1 ||
                gameState.attackCharges.poison.charges < 1;
        }
    }

    return isSonicRecipe || isFireRecipe || isIceRecipe;
}

function resetCrafting() {
    gameState.selectedForCraft = [];
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

// =================== ДЕБАГ И ТЕСТ ФУНКЦИИ ===================

// Функция отладки Telegram данных
async function debugTelegramData() {
    try {
        console.log('=== ДЕБАГ ТЕЛЕГРАМ ДАННЫХ ===');

        // 1. Проверяем данные из Telegram WebApp
        const webAppData = window.Telegram?.WebApp?.initDataUnsafe;
        console.log('Telegram WebApp данные:', webAppData);
        console.log('Telegram ID из WebApp:', webAppData?.user?.id);
        console.log('Telegram username:', webAppData?.user?.username);

        // 2. Проверяем данные в Firebase
        if (window.firebaseManager && window.firebaseManager.currentUser) {
            const doc = await window.firebaseManager.db
                .collection('users')
                .doc(window.firebaseManager.currentUser.uid)
                .get();

            if (doc.exists) {
                console.log('Данные из Firebase:', doc.data());
                console.log('Telegram ID в Firebase:', doc.data().telegramId);
            } else {
                console.log('Пользователь не найден в Firebase');
            }
        } else {
            console.log('Firebase не инициализирован');
        }

        showMessage('✅ Данные проверены (см. консоль)');
    } catch (error) {
        console.error('Ошибка дебага:', error);
        showMessage('❌ Ошибка дебага');
    }
}

// Функция тестирования системы друзей
async function testFriendSystem() {
    try {
        console.log('=== ТЕСТ СИСТЕМЫ ДРУЗЕЙ ===');

        // 1. Проверяем Firebase
        if (!window.firebaseManager || !window.firebaseManager.currentUser) {
            console.error('Firebase не инициализирован');
            showMessage('❌ Firebase не инициализирован');
            return;
        }

        // 2. Проверяем Telegram ID
        const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        console.log('Telegram ID из WebApp:', telegramId);

        // 3. Проверяем данные в Firebase
        const userDoc = await window.firebaseManager.db
            .collection('users')
            .doc(window.firebaseManager.currentUser.uid)
            .get();

        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log('Данные пользователя:', userData);
            console.log('Telegram ID в Firebase:', userData.telegramId);

            if (!userData.telegramId) {
                showMessage('❌ Telegram ID не сохранен в Firebase');
            } else {
                showMessage('✅ Telegram ID сохранен: ' + userData.telegramId);
            }
        }

        // 4. Загружаем друзей для проверки
        const friends = await window.firebaseManager.getFriends();
        console.log('Количество друзей:', friends.length);

        // 5. Загружаем заявки для проверки
        const requests = await window.firebaseManager.getFriendRequests();
        console.log('Заявки:', requests);

    } catch (error) {
        console.error('Ошибка теста:', error);
        showMessage('❌ Ошибка теста: ' + error.message);
    }
}

// Добавление кнопки для отладки Telegram
function addTelegramIdDebugButton() {
    const debugBtn = document.createElement('button');
    debugBtn.textContent = '🔧 Debug';
    debugBtn.style.cssText = `
        position: fixed;
        top: 120px;
        right: 15px;
        padding: 8px 12px;
        background: rgba(139, 69, 19, 0.9);
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 0.8em;
        z-index: 1000;
        cursor: pointer;
    `;
    debugBtn.onclick = debugTelegramData;
    document.body.appendChild(debugBtn);
}

// Добавление кнопки для тестирования системы друзей
function addTestButton() {
    const testBtn = document.createElement('button');
    testBtn.textContent = '🧪 Test';
    testBtn.style.cssText = `
        position: fixed;
        top: 160px;
        right: 15px;
        padding: 8px 12px;
        background: rgba(0, 100, 255, 0.9);
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 0.8em;
        z-index: 1000;
        cursor: pointer;
    `;
    testBtn.onclick = testFriendSystem;
    document.body.appendChild(testBtn);
}

// =================== СИСТЕМА ФОНОВ ===================
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

let currentBgIndex = 0;
let previousBg = '';

function updateBackgroundUI() {
    const currentBg = backgrounds[currentBgIndex];

    document.body.style.backgroundImage = currentBg.image;

    const actionBtn = document.getElementById('bgActionBtn');
    const isPurchased = gameState.purchasedBackgrounds.includes(currentBg.name);
    const isSelected = gameState.currentBackground === currentBg.name;

    actionBtn.textContent = isPurchased ? (isSelected ? 'Выбран' : 'Выбрать') : `Купить за ${currentBg.cost}`;

    actionBtn.disabled = isSelected || (!isPurchased && gameState.honey < currentBg.cost);
}

// Инициализация обработчиков фона
function initBackgroundSystem() {
    document.getElementById('bgMenuBtn').addEventListener('click', () => {
        previousBg = gameState.currentBackground;
        document.getElementById('backgroundSelector').classList.add('active');
        currentBgIndex = backgrounds.findIndex(bg => bg.name === gameState.currentBackground);
        updateBackgroundUI();
    });

    document.getElementById('bgPrevBtn').addEventListener('click', () => {
        currentBgIndex = (currentBgIndex - 1 + backgrounds.length) % backgrounds.length;
        updateBackgroundUI();
    });

    document.getElementById('bgNextBtn').addEventListener('click', () => {
        currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
        updateBackgroundUI();
    });

    document.getElementById('bgActionBtn').addEventListener('click', () => {
        const currentBg = backgrounds[currentBgIndex];

        if (!gameState.purchasedBackgrounds.includes(currentBg.name)) {
            if (gameState.honey >= currentBg.cost) {
                gameState.honey -= currentBg.cost;
                gameState.purchasedBackgrounds.push(currentBg.name);
                updateUI(['honey']);
            } else {
                showMessage('Недостаточно мёда!');
                return;
            }
        }

        gameState.currentBackground = currentBg.name;
        showMessage(`Фон "${currentBg.name}" выбран!`);
        updateBackgroundUI();

        // Сохраняем после выбора фона
        setTimeout(() => gameState.save(), 100);
    });

    // Кнопка закрытия меню фона
    document.getElementById('bgCloseBtn').addEventListener('click', () => {
        document.getElementById('backgroundSelector').classList.remove('active');
    });

    // Закрытие при клике вне меню
    document.getElementById('backgroundSelector').addEventListener('click', (e) => {
        if (e.target.id === 'backgroundSelector') {
            document.getElementById('backgroundSelector').classList.remove('active');
        }
    });
}

// =================== ЗАПУСК ИГРЫ ===================
// Обработка глобальных ошибок
window.addEventListener('error', function(e) {
    console.error('Глобальная ошибка:', e.error);

    // Показываем пользователю сообщение об ошибке
    if (gameState && isGameInitialized) {
        showMessage('⚠️ Произошла ошибка. Попробуйте перезагрузить игру.');
    }
});

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем игру
    initGame();

    // Проверка необходимых элементов
    const elementsToCheck = [
        'battleResultPopup',
        'resultTitle',
        'resultBossImage',
        'claimRewardButton'
    ];

    elementsToCheck.forEach(id => {
        if (!document.getElementById(id)) {
            console.error(`Элемент с ID "${id}" не найден! Проверьте HTML.`);
        }
    });
});
