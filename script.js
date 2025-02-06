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
            xpReward: 1500,
            image: 'img/dragon.jpg',
            defeatImage: 'img/dragon_kill.jpg'
        },
        hydra: {
            health: 4000,
            time: 150,
            honeyReward: 7500,
            xpReward: 2500,
            requiredLevel: 15,
            image: 'img/hydra.jpg',
            defeatImage: 'img/hydra_kill.jpg'
        },
        kraken: {
            health: 6000,
            time: 180,
            honeyReward: 10000,
            xpReward: 4000,
            requiredLevel: 30,
            image: 'img/kraken.jpg',
            defeatImage: 'img/kraken_kill.jpg'
        }
    },
    hivePrices: { golden: 1500, crystal: 3000, inferno: 4500 },
    boostPrices: { energy: 1000, shield: 1200, multiclick: 800 }
};

// =================== КЛАСС СОСТОЯНИЯ ИГРЫ ===================
class GameState {
    constructor() {
        this.purchasedBackgrounds = ['default'];
        this.currentBackground = 'default';
        this.battleResult = null;
        this.reset();
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
        this.keys = { bear: 0, dragon: 0 };
        this.attackCharges = {
            basic: { charges: 15, basePrice: 50 },
            critical: { charges: 15, basePrice: 75 },
            poison: { charges: 15, basePrice: 100 }
        };
        this.activeEffects = { poison: [], shield: null, multiclick: null };
    }

    reset() {
        this.honey = 100000;
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
        getDuration: level => 5 + level,
        getCost: level => 200 * Math.pow(1.6, level)
    }
};

let gameState = new GameState();
let isAnimating = false;

// =================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ===================
function initGame() {
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

    const hiveImg = document.querySelector('.hive-img');
    if (!hiveImg) {
        console.error('Элемент .hive-img не найден!');
        return;
    }
    hiveImg.style.backgroundImage = `url('${gameState.hiveImages[gameState.activeHive]}')`;

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
    document.querySelectorAll('.difficulty-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const difficulty = btn.dataset.difficulty;
            document.querySelectorAll('.difficulty-tabs .tab-btn, .boss-selection').forEach(el => {
                el.classList.remove('active');
            });
            btn.classList.add('active');
            document.getElementById(`${difficulty}Bosses`).classList.add('active');
        });
    });

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
function handleHiveClick() {
    if (document.querySelector('.popup.active')) {
        showMessage('Закройте другие окна!');
        return;
    }
    const now = Date.now();
    if (now - lastClick < 100) return;
    lastClick = now;
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

    // Убираем вкладку со скинами
    if(tabBtn.dataset.tab === 'hives') return;

    document.querySelectorAll('.shop-tab, .tab-btn').forEach(el => el.classList.remove('active'));
    tabBtn.classList.add('active');
    const tabId = `shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`;
    document.getElementById(tabId)?.classList.add('active');
}

function handleBossSelect(e) {
    const bossCard = e.target.closest('.boss-card');
    if (bossCard) startBattle(bossCard.dataset.boss);
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
    const bossConfig = gameConfig.bosses[bossType];
    if (!bossConfig) return;

    // Проверка уровня для Hydra и Kraken
    if (bossType === 'hydra' && gameState.level < 15) {
        showMessage('Для сражения с Hydra требуется уровень 15!');
        return;
    }
    if (bossType === 'kraken' && gameState.level < 30) {
        showMessage('Для сражения с Kraken требуется уровень 30!');
        return;
    }

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
    Object.entries(gameState.talents).forEach(([type, talent]) => {
        if (talent.level > 0) {
            const charges = gameState.attackCharges[type].charges;
            const isDisabled = !gameState.inBattle || charges === 0;

            const button = document.createElement('button');
            button.className = `attack-btn ${isDisabled ? 'disabled' : ''}`;
            button.dataset.attack = type;
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

    gameState.attackCooldowns[type] = Date.now() + 1000;
    gameState.attackCharges[type].charges--;
    updateTalentBuyTab(); // Добавить эту строку
createTalentButtons();

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
                // Новая логика ядовитого эффекта
                const poisonDamage = gameState.talents.poison.damage;
                const duration = talentsConfig.poison.getDuration(gameState.talents.poison.level);

                const poisonEffect = {
                    damage: poisonDamage,
                    startTime: Date.now(),
                    duration: duration * 1000, // Конвертируем в миллисекунды
                    timer: null,
                    remaining: duration
                };

                // Запуск периодического урона
                poisonEffect.timer = setInterval(() => {
                    if (!gameState.inBattle || gameState.currentBoss.currentHealth <= 0) {
                        clearInterval(poisonEffect.timer);
                        return;
                    }

                    gameState.currentBoss.currentHealth -= poisonDamage;
                    updateCombatUI();

                    if (gameState.currentBoss.currentHealth <= 0) {
                        endBattle(true);
                    }
                }, 1000);

                // Таймер окончания эффекта
                setTimeout(() => {
                    clearInterval(poisonEffect.timer);
                    gameState.activeEffects.poison = gameState.activeEffects.poison.filter(
                        e => e !== poisonEffect
                    );
                    updatePoisonTimersDisplay(); // Обновляем отображение таймеров
                }, poisonEffect.duration);

                gameState.activeEffects.poison.push(poisonEffect);
                showPoisonTimer(duration); // Показываем таймер

                // Обновление интерфейса
                const chargeCounter = document.querySelector(`[data-attack="${type}"] .charge-counter`);
                if (chargeCounter) {
                    chargeCounter.textContent = `Зарядов: ${gameState.attackCharges[type].charges}`;
                }
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
    // Проверка состояния боя
    if (!gameState.inBattle || !gameState.currentBoss) return;

    // Очистка ядовитых эффектов
    gameState.activeEffects.poison.forEach(e => {
        clearInterval(e.timer);
        clearTimeout(e.timeout);
    });
    gameState.activeEffects.poison = [];

    // Удаление визуальных таймеров яда
    const poisonContainer = document.getElementById('poisonTimersContainer');
    if (poisonContainer) poisonContainer.innerHTML = '';

    // Сброс визуальных эффектов босса
    elements.bossCombatImage?.classList.remove('grayscale');

    // Настройка наград
    let reward = null;
    if (victory) {
        const bossConfig = gameConfig.bosses[gameState.currentBoss.type];
        reward = {
            honey: bossConfig.honeyReward,
            xp: bossConfig.xpReward,
            keys: bossConfig.keyReward ? { [bossConfig.keyReward.type]: bossConfig.keyReward.amount } : {}
        };
    }

    // Обновление состояния игры
    gameState.battleResult = {
        victory: victory,
        boss: { ...gameState.currentBoss },
        reward: reward
    };

    // Сброс боевых параметров
    gameState.inBattle = false;
    gameState.currentBoss = null;

    // Очистка таймеров
    if (gameState.battleTimer) {
        clearInterval(gameState.battleTimer);
        gameState.battleTimer = null;
    }

    // Обновление интерфейса
    try {
        updateResultPopup();
        showPopup('battleResult');
        document.querySelectorAll('.attack-btn').forEach(btn => btn.disabled = true);
        elements.combatScreen.style.display = 'none';
        document.getElementById('bossSelection').style.display = 'block';
    } catch (e) {
        console.error('Ошибка обновления интерфейса:', e);
    }

    // Принудительное обновление зарядов
    updateTalentBuyTab();
    createTalentButtons();
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

    // Установка изображения босса
    resultBossImage.src = gameState.battleResult.victory
        ? bossConfig.defeatImage
        : bossConfig.image;

    // Установка стилей для результата
    if (gameState.battleResult.victory) {
        resultTitle.textContent = "ПОБЕДА!";
        resultTitle.style.color = "#4CAF50";
        claimBtn.style.display = 'block';
        closeBtn.style.display = 'none';

        // Обновление данных наград
        if (reward) {
            rewardHoney.textContent = reward.honey;
            rewardXP.textContent = reward.xp;

            // Обработка ключей
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

        // Сброс значений наград при поражении
        rewardHoney.textContent = '0';
        rewardXP.textContent = '0';
        rewardKeys.textContent = '0';
    }

    // Анимация изображения босса
    resultBossImage.classList.toggle('defeat-image', !gameState.battleResult.victory);
    resultBossImage.classList.toggle('victory-image', gameState.battleResult.victory);
}
// =================== ОБРАБОТЧИКИ КНОПОК ===================
document.getElementById('claimRewardButton').addEventListener('click', () => {
    if (gameState.battleResult?.reward) {
        const reward = gameState.battleResult.reward;

        gameState.honey += reward.honey;
        gameState.xp += reward.xp;

        Object.entries(reward.keys).forEach(([type, amount]) => {
            gameState.keys[type] += amount;
        });

        gameState.updateKeysDisplay();
        checkLevelUp();
        updateUI();

        gameState.battleResult = null;
        hidePopup('battleResult');
        document.getElementById('bossSelection').style.display = 'block';
    }
});

document.getElementById('closeResultButton').addEventListener('click', () => {
    gameState.battleResult = null;
    hidePopup('battleResult');
    document.getElementById('bossSelection').style.display = 'block';
});

// Находим блок с обработчиками закрытия попапов и изменяем его:
document.querySelectorAll('.popup .close').forEach(btn => {
    btn.addEventListener('click', () => {
        const popup = btn.closest('.popup');
        if (popup.id === 'battleResultPopup') {
            // Если это попап результатов
            if (gameState.battleResult?.victory) {
                // При победе - имитируем нажатие "Получить награду"
                document.getElementById('claimRewardButton').click();
            } else {
                // При поражении - имитируем нажатие "Выйти"
                document.getElementById('closeResultButton').click();
            }
        } else {
            // Для других попапов обычное закрытие
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
            updateTalentUI('basic', 'basicLevel', 'basicDmg');
            updateTalentUI('critical', 'critLevel', 'critChanceUpgrade');
            updateTalentUI('poison', 'poisonLevel', 'poisonDmgUpgrade');
        }
    };

    function updateTalentUI(talentType, levelElementId, statElementId) {
        const levelElem = document.getElementById(levelElementId);
        const statElem = document.getElementById(statElementId);
        if (levelElem) levelElem.textContent = gameState.talents[talentType].level;
        if (statElem) statElem.textContent = gameState.talents[talentType][talentType === 'critical' ? 'chance' : 'damage'];
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

// =================== УПРАВЛЕНИЕ ПОПАПАМИ ===================
function showPopup(popupType) {
    if (popupType === 'battleResult' && !gameState.battleResult) return;
    hideAllPopups(); // Скрываем все другие попапы
    const popup = document.getElementById(`${popupType}Popup`);
    if (popup) {
        popup.classList.add('active'); // Добавляем класс active для отображения
        document.body.style.overflow = 'hidden'; // Блокируем прокрутку основного контента
        // Активируем первую вкладку магазина или талантов
        if (popupType === 'shop') {
            document.querySelector('#shopPopup .tab-btn[data-tab="boosts"]').click();
        }
        if (popupType === 'talents') {
            document.querySelector('#talentsPopup .tab-btn[data-tab="buyCharges"]').click();
        }
        if (popupType === 'battleResult') updateResultPopup(); // Обновляем содержимое результата боя
    }
}


function hidePopup(type) {
    const popup = document.getElementById(`${type}Popup`);
    if (popup) {
        popup.classList.remove('active'); // Убираем класс active
        document.body.style.overflow = ''; // Разблокируем прокрутку основного контента
    }
}

function hideAllPopups() {
    document.querySelectorAll('.popup').forEach(p => {
        p.classList.remove('active'); // Скрываем все попапы
    });
    document.body.style.overflow = ''; // Разблокируем прокрутку основного контента
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
    const reward = {
        honey: boss.honeyReward,
        xp: boss.xpReward,
        keys: {}
    };

    if (boss.keyReward) {
        reward.keys[boss.keyReward.type] = boss.keyReward.amount;
    }

    if (gameState.activeHive === 'crystal') {
        reward.honey = Math.floor(reward.honey * 1.3);
    }

    return reward;
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
        poison: 'Яд'
    }[type] || '';
}

function getTalentIcon(type) {
    return {
        basic: '🗡️',
        critical: '💥',
        poison: '☠️'
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

document.addEventListener('DOMContentLoaded', () => {
  initGame(); // Добавьте эту строку
    document.getElementById('gameScreen').style.display = 'block';
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

    document.getElementById('claimRewardButton')?.addEventListener('click', () => {
        const reward = gameState.battleResult?.reward;

        if (reward) {
            gameState.honey += reward.honey;
            gameState.xp += reward.xp;

            Object.entries(reward.keys).forEach(([type, amount]) => {
                gameState.keys[type] = (gameState.keys[type] || 0) + amount;
            });

            checkLevelUp();
            updateUI();
            hidePopup('battleResult');
            document.getElementById('bossSelection').style.display = 'block';
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && gameState.battleResult && !document.querySelector('#battleResultPopup.active')) {
            updateResultPopup();
            showPopup('battleResult');
        }
    });
});

// =================== ФУНКЦИИ ТАЙМЕРОВ ЯДА ===================
function showPoisonTimer(duration) {
    let timerContainer = document.getElementById('poisonTimersContainer');
    if (!timerContainer) {
        timerContainer = document.createElement('div');
        timerContainer.id = 'poisonTimersContainer';
        timerContainer.className = 'poison-timers';
        elements.combatScreen.appendChild(timerContainer);
    }

    const timerElement = document.createElement('div');
    timerElement.className = 'poison-timer';
    const timerId = `poison-timer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    timerElement.id = timerId;

    timerElement.innerHTML = `
        <span class="poison-icon">☠️</span>
        <span class="poison-duration">${duration}s</span>
        <div class="poison-progress"></div>
    `;

    const progressBar = timerElement.querySelector('.poison-progress');
    progressBar.style.animation = `poison-progress ${duration}s linear forwards`;

    timerContainer.appendChild(timerElement);

    const poisonEffect = {
        id: timerId,
        startTime: Date.now(),
        duration: duration * 1000,
        timerElement: timerElement,
        interval: null,
        timeout: null
    };

    gameState.activeEffects.poison.push(poisonEffect);

    poisonEffect.interval = setInterval(() => {
        const currentTime = Date.now();
        const elapsed = currentTime - poisonEffect.startTime;
        const remaining = Math.ceil((poisonEffect.duration - elapsed) / 1000);

        const durationElement = timerElement.querySelector('.poison-duration');
        if (durationElement) {
            durationElement.textContent = `${remaining}s`;

            if (remaining <= 5) {
                const intensity = 100 + Math.floor(30 * (remaining / 5));
                timerElement.style.backgroundColor = `rgba(50, ${intensity}, 50, 0.9)`;
            }
        }

        if (remaining <= 0) {
            clearInterval(poisonEffect.interval);
            removePoisonTimer(timerId);
        }
    }, 100);

    poisonEffect.timeout = setTimeout(() => {
        removePoisonTimer(timerId);
    }, poisonEffect.duration + 500);

    setTimeout(() => {
        timerElement.style.opacity = '1';
        timerElement.style.transform = 'translateY(0)';
    }, 10);
}

function removePoisonTimer(timerId) {
    const timerElement = document.getElementById(timerId);
    if (timerElement) {
        timerElement.style.opacity = '0';
        timerElement.style.transform = 'translateY(-20px)';
        setTimeout(() => timerElement.remove(), 500);
    }

    gameState.activeEffects.poison = gameState.activeEffects.poison.filter(effect => {
        if (effect.id === timerId) {
            clearInterval(effect.interval);
            clearTimeout(effect.timeout);
            return false;
        }
        return true;
    });

    if (gameState.inBattle) {
        createTalentButtons();
    }
}

function updatePoisonTimers() {
    const activeEffects = gameState.activeEffects.poison;
    const timerContainer = document.getElementById('poisonTimersContainer');
    if (!timerContainer) return;

    const currentTime = Date.now();

    activeEffects.forEach(effect => {
        const remaining = Math.ceil((effect.duration - (currentTime - effect.startTime)) / 1000);
        if (remaining > 0) {
            showPoisonTimer(remaining);
        }
    });
}
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

function updateBackgroundUI() {
    const bgSelector = document.getElementById('backgroundSelector');
    const bgPreview = bgSelector.querySelector('.bg-preview');
    const actionBtn = document.getElementById('bgActionBtn');
    const currentBg = backgrounds[currentBgIndex];

    bgPreview.style.backgroundImage = `url('${currentBg.preview}')`;

    const isPurchased = gameState.purchasedBackgrounds.includes(currentBg.name);
    actionBtn.textContent = isPurchased ? 'Выбрать' : `Купить за ${currentBg.cost}`;
    actionBtn.disabled = !isPurchased && gameState.honey < currentBg.cost;
}

document.getElementById('bgMenuBtn').addEventListener('click', () => {
    document.getElementById('backgroundSelector').classList.add('active');
    currentBgIndex = backgrounds.findIndex(bg => bg.name === gameState.currentBackground);
    updateBackgroundUI();
});

document.getElementById('bgCloseBtn').addEventListener('click', () => {
    document.getElementById('backgroundSelector').classList.remove('active');
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
    document.body.style.backgroundImage = currentBg.image;
    showMessage(`Фон "${currentBg.name}" выбран!`);
    updateBackgroundUI();
});

// Инициализация при загрузке
document.body.style.backgroundImage =
    backgrounds.find(bg => bg.name === gameState.currentBackground).image;

// Закрытие при клике вне меню
document.addEventListener('click', (e) => {
    const bgSelector = document.getElementById('backgroundSelector');
    if (!bgSelector.contains(e.target) &&
        e.target.id !== 'bgMenuBtn' &&
        bgSelector.classList.contains('active')) {
        bgSelector.classList.remove('active');
    }
});
