// =================== ТЕЛЕГРАМ И СОХРАНЕНИЯ =================== 
const tg = window.Telegram.WebApp;
tg.expand();

// Получение данных игрока
const user = {
  id: tg.initDataUnsafe.user?.id,
  name: tg.initDataUnsafe.user?.first_name
};

// Функция сохранения
function saveGame() {
  if (!user.id) return;
  
  const saveData = {
    honey: gameState.honey,
    level: gameState.level,
    xp: gameState.xp,
    purchasedHives: gameState.purchasedHives,
    talents: gameState.talents,
    keys: gameState.keys,
    attackCharges: gameState.attackCharges
  };
  
  localStorage.setItem(`save_${user.id}`, JSON.stringify(saveData));
}

// Функция загрузки
function loadGame() {
  if (!user.id) return;
  
  const savedData = localStorage.getItem(`save_${user.id}`);
  if (savedData) {
    const loadedData = JSON.parse(savedData);
    
    gameState.honey = loadedData.honey ?? 10000;
    gameState.level = loadedData.level ?? 1;
    gameState.xp = loadedData.xp ?? 0;
    gameState.purchasedHives = loadedData.purchasedHives ?? ['basic'];
    gameState.talents = loadedData.talents ?? {
      basic: { level: 1, damage: 10 },
      critical: { level: 1, chance: 0 },
      poison: { level: 1, damage: 0 },
      vampire: { level: 1, percent: 0 }
    };
    gameState.keys = loadedData.keys ?? { bear: 0, dragon: 0 };
    gameState.attackCharges = loadedData.attackCharges ?? {
      basic: { charges: 10, basePrice: 50 },
      critical: { charges: 0, basePrice: 75 },
      poison: { charges: 0, basePrice: 100 },
      vampire: { charges: 0, basePrice: 150 }
    };
  }
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
    vampireLevel: document.getElementById('vampireLevel'),
    vampirePercentUpgrade: document.getElementById('vampirePercentUpgrade'),
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

const gameConfig = {
    bosses: {
        wasp: {
            health: 500,
            time: 60,
            honeyReward: 1000,
            xpReward: 200,
            image: 'img/wasp.jpg'
        },
        bear: {
            health: 1000,
            time: 90,
            honeyReward: 2000,
            xpReward: 500,
            image: 'img/bear.jpg'
        },
        dragon: {
            health: 2500,
            time: 120,
            honeyReward: 5000,
            xpReward: 1500,
            image: 'img/dragon.jpg'
        }
    },
    hivePrices: { golden: 1500, crystal: 3000, inferno: 4500 },
    boostPrices: { energy: 1000, shield: 1200, multiclick: 800 }
};

// =================== КЛАСС СОСТОЯНИЯ ИГРЫ ===================
class GameState {
    constructor() {
        this.reset();
        this.attackCooldowns = {
            basic: 0,
            critical: 0,
            poison: 0,
            vampire: 0
        };
        this.hiveImages = {
            basic: 'img/human_male.png',
            golden: 'img/1.png',
            crystal: 'https://cdn.pixabay.com/photo/2016/09/10/13/28/diamond-1659283_1280.png',
            inferno: 'https://cdn.pixabay.com/photo/2013/07/13/12/35/flame-160034_1280.png'
        };
        this.keys = { bear: 0, dragon: 0 };
        this.attackCharges = {
            basic: { charges: 10, basePrice: 50 },
            critical: { charges: 0, basePrice: 75 },
            poison: { charges: 0, basePrice: 100 },
            vampire: { charges: 0, basePrice: 150 }
        };
        this.hiveBonuses = {
            golden: { attackSpeed: 1.15 },
            crystal: { battleBonus: 1.3 },
            inferno: { fireDamage: 25 }
        };
        this.activeEffects = { poison: [], shield: null, multiclick: null };
    }

    reset() {
        this.honey = 10000;
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
            critical: { level: 1, chance: 0 },
            poison: { level: 1, damage: 0 },
            vampire: { level: 1, percent: 0 }
        };
        this.boosts = {
            battleBonus: 1.0,
            attackSpeed: 1.0,
            shield: false,
            multiclick: false
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
}

const talentsConfig = {
    basic: {
        maxLevel: 10,
        getDamage: level => 10 * level,
        getCost: level => 75 * Math.pow(1.5, level - 1)
    },
    critical: {
        maxLevel: 10,
        getChance: level => Math.min(0.5, 0.15 + 0.05 * level),
        getCost: level => 150 * Math.pow(1.4, level)
    },
    poison: {
        maxLevel: 10,
        getDamage: level => 2 + level,
        getCost: level => 200 * Math.pow(1.6, level)
    },
    vampire: {
        maxLevel: 10,
        getPercent: level => 0.01 * level,
        getCost: level => 500 * Math.pow(2, level)
    }
};

let gameState = new GameState();
let isAnimating = false;

// =================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ===================
function initGame() {
    const requiredElements = ['hive', 'honey', 'energy', 'level'];
    if (requiredElements.some(id => !document.getElementById(id))) {
        console.error('Critical elements missing!');
        return;
    }

    const hiveImg = document.querySelector('.hive-img');
    if (hiveImg) {
        hiveImg.style.backgroundImage = `url('${gameState.hiveImages[gameState.activeHive]}')`;
    }

    document.getElementById('hive').addEventListener('click', handleHiveClick);
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => showPopup(btn.dataset.popup));
    });
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', hideAllPopups);
    });
    document.querySelector('.shop-tabs').addEventListener('click', handleShopTabs);
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

    updateHiveDisplay();
    updateShopItems();
    updateUI();
    startEnergyRecovery();
    gameState.updateKeysDisplay();
    initTalentBuyTab();
}

function startEnergyRecovery() {
    gameState.energyRecoveryInterval = setInterval(() => {
        gameState.energy = Math.min(gameState.energy + 1, gameState.maxEnergy);
        updateUI(['energy']);
    }, 3000);
    updateLevelProgress();
}

function initTalentBuyTab() {
    const container = document.getElementById('buyCharges');
    Object.entries(gameState.attackCharges).forEach(([type, data]) => {
        const item = document.createElement('div');
        item.className = 'attack-charge-item';
        item.innerHTML = `
            <div>
                <h3>${getAttackName(type)}</h3>
                <span class="charge-counter">${data.charges} шт</span>
            </div>
            <button class="btn" data-type="${type}">${data.basePrice}
            </button>
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
function handleHiveClick() {
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

    document.querySelectorAll('.shop-tab, .tab-btn').forEach(el => el.classList.remove('active'));
    tabBtn.classList.add('active');
    const tabId = `shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`;
    document.getElementById(tabId)?.classList.add('active');
}

function handleBossSelect(e) {
    const bossCard = e.target.closest('.boss-card');
    if (bossCard) startBattle(bossCard.dataset.boss);
}

// =================== МАГАЗИН И ТАЛЕНТЫ ===================
function buyHive(type) {
    if (gameState.purchasedHives.includes(type)) {
        showMessage('Этот скин уже куплен!');
        return;
    }

    if (gameState.honey >= gameConfig.hivePrices[type]) {
        gameState.honey -= gameConfig.hivePrices[type];
        gameState.purchasedHives.push(type);
        switchHive(type);
        updateHiveDisplay();
        updateShopItems();
        updateUI(['honey']);
        showMessage('Скин успешно куплен!');
    } else {
        showMessage(`Недостаточно меда! Нужно: ${gameConfig.hivePrices[type]}`);
        document.getElementById('honey').classList.add('shake');
        setTimeout(() => document.getElementById('honey').classList.remove('shake'), 500);
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
            break;
        case 'critical':
            gameState.talents.critical.chance = talent.getChance(gameState.talents.critical.level);
            break;
        case 'poison':
            gameState.talents.poison.damage = talent.getDamage(gameState.talents.poison.level);
            break;
        case 'vampire':
            gameState.talents.vampire.percent = talent.getPercent(gameState.talents.vampire.level);
            break;
    }

    const button = document.querySelector(`.talent[data-talent="${talentType}"] button`);
    if (button) {
        const newLevel = gameState.talents[talentType].level;
        button.textContent = newLevel < talent.maxLevel
            ? `${Math.floor(talent.getCost(newLevel))}`
            : 'MAX';
    }

    updateUI(['honey', 'talents']);
    showMessage('Талант улучшен!');
}

// =================== БОЕВАЯ СИСТЕМА ===================
function startBattle(bossType) {
    if (bossType !== 'wasp' && gameState.keys[bossType] < 3) {
        showMessage(`Нужно 3 ключа! У вас: ${gameState.keys[bossType]}`);
        return;
    }

    if (bossType !== 'wasp') {
        gameState.keys[bossType] -= 3;
        gameState.updateKeysDisplay();
    }

    if (!gameConfig.bosses[bossType] || gameState.inBattle) return;

    gameState.inBattle = true;
    const boss = gameConfig.bosses[bossType];
    gameState.currentBoss = {
        ...boss,
        currentHealth: boss.health,
        maxHealth: boss.health,
        type: bossType
    };

    document.getElementById('bossSelection').style.display = 'none';
    elements.combatScreen.style.display = 'block';
    elements.bossCombatImage.src = boss.image;
    elements.battleReward.style.display = 'none';
    document.getElementById('backToBossSelection').style.display = 'none';

    elements.bossHealth.style.transition = 'none';
    elements.bossHealth.style.width = '100%';
    elements.currentHealth.textContent = boss.health;
    elements.maxHealth.textContent = boss.health;
    elements.combatTimer.textContent = boss.time;

    setTimeout(() => {
        elements.bossHealth.style.transition = 'width 0.3s';
        updateCombatUI(true);
    }, 50);

    createTalentButtons();
    startBattleTimer(boss.time);
}

function createTalentButtons() {
    elements.combatTalents.innerHTML = '';
    Object.entries(gameState.talents).forEach(([type, talent]) => {
      if (talent.level > 0) {
          const charges = gameState.attackCharges[type].charges;
          const isDisabled = !gameState.inBattle || charges === 0;

          const button = document.createElement('button');
button.className = `attack-btn ${isDisabled ? 'disabled' : ''}`;
button.disabled = isDisabled;
button.innerHTML = `
                <div class="talent-icon">${getTalentIcon(type)}</div>
                <div class="talent-info">
                    <div>${getTalentButtonText(type)}</div>
                    <div class="charge-counter">Всего: ${charges}</div>
                </div>
            `;

            if (charges > 0) {
                button.onclick = () => attack(type);
            } else {
                button.style.opacity = '0.5';
                button.style.cursor = 'not-allowed';
            }

            elements.combatTalents.appendChild(button);
        }
    });
}

function startBattleTimer(seconds) {
  // Очистка старого таймера
    if (gameState.battleTimer) clearInterval(gameState.battleTimer); // ← Добавить эту строку
    let timeLeft = seconds;
    elements.combatTimer.textContent = timeLeft;
    elements.combatTimer.style.color = 'white';

    gameState.battleTimer = setInterval(() => {
      if (!gameState.inBattle) { // ← Добавить проверку
          clearInterval(gameState.battleTimer);
          return;
      }
        timeLeft--;
        elements.combatTimer.textContent = timeLeft;
        elements.combatTimer.style.color = timeLeft <= 10 ? 'red' : 'white';
        // Мгновенная остановка при победе
                if (gameState.currentBoss.currentHealth <= 0) { // ← Добавить этот блок
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
  if (!gameState.inBattle || gameState.currentBoss.currentHealth <= 0) {
       showMessage("Бой уже завершен!");
       return;
   }

    if (Date.now() < gameState.attackCooldowns[type]) {
        const secondsLeft = Math.ceil((gameState.attackCooldowns[type] - Date.now()) / 1000);
        showMessage(`Не спеши`);
        return;
    }

    if (gameState.attackCharges[type].charges <= 0) {
        showMessage('Заряды кончились!');
        return;
    }

    let poisonInterval;

    gameState.attackCooldowns[type] = Date.now() + 1000;
    gameState.attackCharges[type].charges--;

    const button = document.querySelector(`[data-attack="${type}"]`);
    if (button) {
        button.classList.add('cooldown');
        button.disabled = true;

        let seconds = 2;
        const timerInterval = setInterval(() => {
            button.querySelector('.charge-counter').textContent = `Перезарядка: ${seconds}s`;
            seconds--;

            if (seconds < 0) {
                clearInterval(timerInterval);
                button.classList.remove('cooldown');
                button.disabled = false;
                button.querySelector('.charge-counter').textContent = `Зарядов: ${gameState.attackCharges[type].charges}`;
            }
        }, 1000);
    }

    let damage = 0;
    switch (type) {
        case 'basic':
            damage = calculateBasicDamage();
            break;

        case 'critical':
            damage = calculateBasicDamage();
            if (Math.random() < gameState.talents.critical.chance) {
                damage *= 2;
                showCriticalEffect(damage);
            }
            break;

            case 'poison':
        // ========== НАЧАЛО ИСПРАВЛЕНИЯ ==========
        damage = gameState.talents.poison.damage * 3;
        const poisonEffect = {
            interval: null,
            damage: gameState.talents.poison.damage
        };

        poisonEffect.interval = setInterval(() => {
            if (!gameState.inBattle || gameState.currentBoss.currentHealth <= 0) {
                clearInterval(poisonEffect.interval);
                return;
            }
            gameState.currentBoss.currentHealth -= poisonEffect.damage;
            updateCombatUI();

            if (gameState.currentBoss.currentHealth <= 0) {
                endBattle(true);
            }
        }, 1000);

        gameState.activeEffects.poison.push(poisonEffect);
        // ========== КОНЕЦ ИСПРАВЛЕНИЯ ==========
        break;

        case 'vampire':
            damage = calculateBasicDamage();
            const heal = Math.floor(damage * gameState.talents.vampire.percent);
            gameState.energy = Math.min(gameState.energy + heal, gameState.maxEnergy);
            showHealEffect(heal);
            updateUI(['energy']);
            break;
    }

    if (damage > 0) {
        gameState.currentBoss.currentHealth = Math.max(
            gameState.currentBoss.currentHealth - damage,
            0
        );
        updateCombatUI();

        if (gameState.currentBoss.currentHealth <= 0) {
            endBattle(true);
        }
    }

    const chargeCounter = document.querySelector(`[data-attack="${type}"] .charge-counter`);
    if (chargeCounter) {
        chargeCounter.textContent = `Зарядов: ${gameState.attackCharges[type].charges}`;
    }

    createTalentButtons();
}

function endBattle(victory) {
    // Сброс параметров боя
    if (gameState.currentBoss) {
        gameState.currentBoss.currentHealth = gameState.currentBoss.maxHealth;
    }
    gameState.inBattle = false;

    // Сброс перезарядок атак
    Object.keys(gameState.attackCooldowns).forEach(k => {
        gameState.attackCooldowns[k] = 0;
    });

    // ========== НАЧАЛО ИСПРАВЛЕНИЙ ========== //

    // 1. Остановка всех активных ядовитых эффектов
    gameState.activeEffects.poison.forEach(effect => {
        clearInterval(effect.interval);
    });
    gameState.activeEffects.poison = [];

    // 2. Полная блокировка кнопок атак
    document.querySelectorAll('.attack-btn').forEach(btn => {
        btn.classList.add('disabled'); // CSS-класс для стилей
        btn.disabled = true; // Функциональная блокировка
        btn.style.pointerEvents = 'none'; // Игнорирование кликов
    });

    // 3. Принудительная установка здоровья в 0 при победе
    if (victory && gameState.currentBoss) {
        gameState.currentBoss.currentHealth = 0;
        updateCombatUI(); // Обновим интерфейс
    }

    // ========== КОНЕЦ ИСПРАВЛЕНИЙ ========== //

    if (victory && gameState.currentBoss) {
        const bossType = gameState.currentBoss.type;
        const boss = gameConfig.bosses[bossType];

        // Начисление ключей
        switch(bossType) {
            case 'wasp':
                gameState.keys.bear += 1;
                break;

            case 'bear':
                gameState.keys.dragon += 1;
                break;
        }

        // Выдача наград
        const honeyReward = Math.floor(boss.honeyReward * (gameState.activeHive === 'crystal' ? 1.3 : 1));
        const xpReward = Math.floor(boss.xpReward * (1 + gameState.level * 0.05));

        gameState.honey += honeyReward;
        gameState.xp += xpReward;
        elements.battleReward.innerHTML = `
            Получено: ${honeyReward}🍯 + ${xpReward}XP<br>
            +1 🔑 ${bossType === 'wasp' ? '(Медведь)' : '(Дракон)'}
        `;
        elements.battleReward.style.display = 'block';

        checkLevelUp();
        gameState.updateKeysDisplay();
    }

    // Возврат в меню выбора боссов
    setTimeout(() => {
        if (document.getElementById('bossSelection')) {
            document.getElementById('bossSelection').style.display = 'block';
        }
        if (elements.combatScreen) {
            elements.combatScreen.style.display = 'none';
        }
        if (elements.bossCombatImage) {
            elements.bossCombatImage.classList.remove('grayscale');
        }
    }, 3000);
}

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
function updateUI(changedKeys = ['all']) {
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
            const basicLevelElem = document.getElementById('basicLevel');
            const basicDmgElem = document.getElementById('basicDmg');
            if (basicLevelElem) basicLevelElem.textContent = gameState.talents.basic.level;
            if (basicDmgElem) basicDmgElem.textContent = gameState.talents.basic.damage;

            const critLevelElem = document.getElementById('critLevel');
            const critChanceElem = document.getElementById('critChanceUpgrade');
            if (critLevelElem) critLevelElem.textContent = gameState.talents.critical.level;
            if (critChanceElem) {
                critChanceElem.textContent = Math.round(gameState.talents.critical.chance * 100);
            }

            const poisonLevelElem = document.getElementById('poisonLevel');
            const poisonDmgElem = document.getElementById('poisonDmgUpgrade');
            if (poisonLevelElem) poisonLevelElem.textContent = gameState.talents.poison.level;
            if (poisonDmgElem) poisonDmgElem.textContent = gameState.talents.poison.damage;

            const vampireLevelElem = document.getElementById('vampireLevel');
            const vampirePercentElem = document.getElementById('vampirePercentUpgrade');
            if (vampireLevelElem) vampireLevelElem.textContent = gameState.talents.vampire.level;
            if (vampirePercentElem) {
                vampirePercentElem.textContent = Math.round(gameState.talents.vampire.percent * 100);
            }
        }
    };

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

// =================== УПРАВЛЕНИЕ ПОПАПАМИ ===================
function showPopup(popupType) {
    hideAllPopups();
    const popup = document.getElementById(`${popupType}Popup`);
    if (!popup) return;

    popup.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideAllPopups() {
    document.querySelectorAll('.popup').forEach(p => p.classList.remove('active'));
    document.body.style.overflow = '';
}

// =================== УПРАВЛЕНИЕ УЛЬЯМИ ===================
function updateHiveDisplay() {
    const selector = document.querySelector('.hive-selector');
    if (!selector) return;

    selector.innerHTML = '';
    gameState.purchasedHives.forEach(type => {
        const div = document.createElement('div');
        div.className = `hive-option ${type === gameState.activeHive ? 'active' : ''}`;
        div.dataset.type = type;
        div.onclick = () => switchHive(type);

        let content = '';
        switch (type) {
            case 'basic':
                content = `<h3>Aiko #1</h3><p>${gameState.activeHive === type ? '✔️ Активен' : 'Активировать'}</p>`;
                break;
            case 'golden':
                content = `<h3>Aiko #2</h3><p>+15% скорости атак</p><p>${gameState.activeHive === type ? '✔️ Активен' : 'Активировать'}</p>`;
                break;
            case 'crystal':
                content = `<h3>Aiko #3</h3><p>+30% награды за бои</p><p>${gameState.activeHive === type ? '✔️ Активен' : 'Активировать'}</p>`;
                break;
            case 'inferno':
                content = `<h3>Aiko #4</h3><p>+25% к урону огнем</p><p>${gameState.activeHive === type ? '✔️ Активен' : 'Активировать'}</p>`;
                break;
        }

        div.innerHTML = content;
        selector.appendChild(div);
    });
}

function switchHive(type) {
    if (!gameState.purchasedHives.includes(type)) return;

    gameState.activeHive = type;
    const hiveImg = document.querySelector('.hive-img');
    if (hiveImg) {
        hiveImg.style.backgroundImage = `url('${gameState.hiveImages[type]}')`;
        hiveImg.classList.add('hive-change-animation');
        setTimeout(() => hiveImg.classList.remove('hive-change-animation'), 300);
    }

    Object.keys(gameState.boosts).forEach(key => {
        gameState.boosts[key] = 1.0;
    });

    const bonuses = gameState.hiveBonuses[type];
    if (bonuses) Object.assign(gameState.boosts, bonuses);

    updateHiveDisplay();
    updateUI();
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
        poison: 'Ядовитый удар',
        vampire: 'Вампиризм'
    }[type];
}

function calculateBasicDamage() {
    let damage = talentsConfig.basic.getDamage(gameState.talents.basic.level);
    damage *= gameState.boosts.attackSpeed;
    if (gameState.activeHive === 'inferno') damage += gameState.hiveBonuses.inferno.fireDamage;
    if (gameState.boosts.shield) damage *= 0.7;
    return Math.round(damage);
}

function updateCombatUI() {
    if (!gameState.currentBoss) return;
    if (gameState.currentBoss.currentHealth < 0) {
        gameState.currentBoss.currentHealth = 0;
    }
    const healthPercent = (gameState.currentBoss.currentHealth / gameState.currentBoss.maxHealth) * 100;
    elements.bossHealth.style.width = `${healthPercent}%`;
    elements.currentHealth.textContent = gameState.currentBoss.currentHealth;
}

function getTalentButtonText(type) {
    return {
        basic: 'Базовый',
        critical: 'Крит',
        poison: 'Яд',
        vampire: 'Вампир'
    }[type] || '';
}

function getTalentIcon(type) {
    return {
        basic: '🗡️',
        critical: '💥',
        poison: '☠️',
        vampire: '❤️'
    }[type] || '';
}

// =================== ЗАПУСК ИГРЫ ===================
document.getElementById('backToBossSelection').addEventListener('click', () => {
    endBattle(false);
    document.getElementById('bossSelection').style.display = 'block';
    document.getElementById('combatScreen').style.display = 'none';
});

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('gameScreen').style.display = 'block';
    initGame();
});

document.querySelector('#shopPopup .shop-tabs').addEventListener('click', e => {
    const tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;

    document.querySelectorAll('#shopPopup .tab-btn, #shopPopup .shop-tab').forEach(el => {
        el.classList.remove('active');
    });

    tabBtn.classList.add('active');
    const tabId = `shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`;
    document.getElementById(tabId).classList.add('active');
});
