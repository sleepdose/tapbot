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
            image: 'img/wasp.png',
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
            requiredLevel: 15,
            image: 'img/hydra.jpg',
            defeatImage: 'img/hydra_kill.jpg'
        },
        kraken: {
            health: 6000,
            time: 180,
            honeyReward: 10000,
            requiredKeys: 3,
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
        this.achievements = {
            waspKills: 0,
            currentLevel: 0,
            rewards: {
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
        this.reset();
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

let gameState = new GameState();
let isAnimating = false;

// =================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ===================
function initGame() {
    const petImg = document.querySelector('#pet-img');
    if (petImg) {
        petImg.style.display = 'none';
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
    // Difficulty tabs removed
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

    // Автозапуск музыки при первом клике на улей
    document.getElementById('hive').addEventListener('click', function firstPlay() {
        if (audioElements.bgMusic.paused) {
            audioElements.bgMusic.play();
        }
        document.removeEventListener('click', firstPlay);
    }, { once: true });
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
            return gameState.craftedTalents.ice.damage; //Added ice damage calculation.
        default:
            return 0;
    }
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
            isLocked = gameState.level < 15 || gameState.keys[bossType] < 3;
        } else if (bossType === 'kraken') {
            isLocked = gameState.level < 30 || gameState.keys[bossType] < 3;
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

    const button = document.querySelector(`.talent[data-talent="${talentType}"] button`);
    if (button) {
        const newLevel = gameState.talents[talentType].level;
        if (newLevel >= talent.maxLevel) {
            button.textContent = 'MAX';
            button.disabled = true;
        } else {
            button.textContent = `${Math.floor(talent.getCost(newLevel))}`;
            button.disabled = false;
        }
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
        { type: 'sonic', icon: '🔊', name: 'Звуковой удар' },
        { type: 'fire', icon: '🔥', name: 'Огненный удар' },
        { type: 'ice', icon: '❄️', name: 'Ледяной удар' } // Added ice talent
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
        //gameState.selectedTalent = null; // Снимаем выбор таланта
        createTalentButtons(); // Обновляем кнопки
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
            showBasicEffect(actualBasicDamage); // Добавляем эффект
            break;
        case 'critical':
            damage = calculateBasicDamage();
            if (Math.random() < gameState.talents.critical.chance) {
                damage *= 2;
                showCriticalEffect(damage);
            } else {
                showBasicEffect(damage); // Показываем обычный эффект если крит не сработал
            }
            const actualCritDamage = Math.min(damage, gameState.currentBoss.currentHealth);
            gameState.battleStats.criticalDamage += actualCritDamage;
            gameState.battleStats.totalDamage += actualCritDamage;
            break;
        case 'poison':
            // Логика ядовитого урона
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
                } gameState.currentBoss.currentHealth -= poisonDamage;
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

    // Обновляем интерфейс без сброса таланта
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
    gameState.selectedTalent = null;

    // Очистка таймеров
    if (gameState.battleTimer) {
        clearInterval(gameState.battleTimer);
        gameState.battleTimer = null;
    }

    // Обновляем статистику боя, показывая только использованные таланты
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

    // Обновление интерфейса
    try {
        updateResultPopup();
        showPopup('battleResult');
        document.querySelectorAll('.attack-btn').forEach(btn => btn.disabled = true);
        elements.combatScreen.style.display = 'none';
        elements.combatTalents.innerHTML = ''; // Очищаем таланты
        document.getElementById('bossSelection').style.display = 'block';
    } catch (e) {
        console.error('Ошибка обновления интерфейса:', e);
    }

    // Сбрасываем статистику для следующего боя
    gameState.battleStats = {
        basicDamage: 0,
        criticalDamage: 0,
        poisonDamage: 0,
        sonicDamage: 0,
        fireDamage: 0,
        iceDamage: 0,
        totalDamage: 0
    };

    // Принудительное обновление зарядов
    updateTalentBuyTab();
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
    const reward = gameState.battleResult?.reward;
    const bossType = gameState.battleResult?.boss?.type;

    if (reward) {
        if (bossType === 'wasp') {
            if (!gameState.achievements) {
                gameState.achievements = { waspKills: 0, rewards: { kingOfWasps: false } };
            }
            gameState.achievements.waspKills++;

            const kills = gameState.achievements.waspKills;
            if (kills >= 10 && !gameState.achievements.rewards.level1) {
                reward.honey += 1000;
                reward.xp += 500;
                gameState.achievements.rewards.level1 = true;
                showMessage('🏆 Достижение разблокировано: Король ОС (Уровень 1)!\nНаграда: 1000 меда и 500 опыта');
            } else if (kills >= 20 && !gameState.achievements.rewards.level2) {
                reward.honey += 2000;
                reward.xp += 1000;
                gameState.achievements.rewards.level2 = true;
                showMessage('🏆 Достижение разблокировано: Король ОС (Уровень 2)!\nНаграда: 2000 меда и 1000 опыта');
            } else if (kills >= 30 && !gameState.achievements.rewards.level3) {
                reward.honey += 3000;
                reward.xp += 1500;
                gameState.achievements.rewards.level3 = true;
                showMessage('🏆 Достижение разблокировано: Король ОС (Уровень 3)!\nНаграда: 3000 меда и 1500 опыта');
            }
            updateAchievementsUI();
            showMessage(`Прогресс достижения "Король ОС": ${gameState.achievements.waspKills}/10`);
        }

        gameState.honey += reward.honey;
        gameState.xp += reward.xp;

        Object.entries(reward.keys).forEach(([type, amount]) => {
            gameState.keys[type] = (gameState.keys[type] || 0) + amount;
        });

        checkLevelUp();
        updateUI();
        gameState.battleResult = null;
        gameState.inBattle = false;
        hidePopup('battleResult');
        document.getElementById('bossSelection').style.display = 'block';
    }
});

document.getElementById('closeResultButton').addEventListener('click', () => {
    gameState.battleResult = null;
    gameState.inBattle = false;
    hidePopup('battleResult');
    document.getElementById('bossSelection').style.display = 'block';
    document.getElementById('combatScreen').style.display = 'none';
});

// Находим блок с обработчиками закрытия попапов и изменяем его:
// Добавляем функцию для эффекта огненного удара
function showFireEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';  // Используем тот же класс для анимации
    effect.textContent = `🔥 ${damage}`;
    effect.style.color = '#ff4400';  // Огненный цвет
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
        updateAchievementsUI();
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

function showIceEffect(damage) { //Added ice effect
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `❄️ ${damage}`;
    effect.style.color = '#00cccc'; // Light blue color
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showBasicEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'basic-effect';
    effect.textContent = `🗡️ ${damage}`;
    effect.style.color = '#ffd700'; // Золотой цвет
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showPoisonAttackEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'poison-attack-effect';
    effect.textContent = `☠️ ${damage}`;
    effect.style.color = '#32CD32'; // Ядовито-зеленый
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
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
    if (boss.type === 'wasp') {
        gameState.achievements.waspKills++;
    }
    const reward = {
        honey: boss.honeyReward,
        xp: boss.xpReward,
        keys: {}
    };

    // Обновляем прогресс достижения для осы
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
            showMessage('🏆 Достижение разблокировано: Король ОС!\nНаграда: 1000 меда и 500 опыта');
        } else {
            showMessage(`Прогресс достижения "Король ОС": ${gameState.achievements.waspKills}/10`);
        }
    }

    if (boss.keyReward) {
        reward.keys[boss.keyReward.type] = boss.keyReward.amount;
    }
    if (gameState.achievements.waspKills >= 10 && !gameState.achievements.rewards.kingOfWasps) {
        // Выдать награду
        gameState.achievements.rewards.kingOfWasps = true;
        showMessage('🏆 Достижение разблокировано!');
    }

    if (gameState.activeHive === 'crystal') {
        reward.honey = Math.floor(reward.honey * 1.3);
    }

    return reward;
}
function updateAchievementsUI() {
    const waspKillCount = document.getElementById('waspKillCount');
    const waspProgress = document.getElementById('waspKillProgress');
    const achievementCard = document.querySelector('.achievement-card');
    const achievementInfo = document.querySelector('.achievement-info h3');
    const achievementRewards = document.querySelector('.achievement-rewards');

    if (!waspKillCount || !waspProgress) return;

    const kills = gameState.achievements.waspKills;
    let targetKills, level, rewards, background;

    if (kills < 10) {
        targetKills = 10;
        level = 0;
        rewards = '🍯 1000 ⭐ 500';
        background = 'rgba(0, 0, 0, 0.5)';
    } else if (kills < 20) {
        targetKills = 20;
        level = 1;
        rewards = '🍯 2000 ⭐ 1000';
        background = 'rgba(139, 69, 19, 0.5)';
    } else {
        targetKills = 30;
        level = 2;
        rewards = '🍯 3000 ⭐ 1500';
        background = 'rgba(218, 165, 32, 0.5)';
    }

    // Обновляем уровень достижения если изменился
    if (gameState.achievements.currentLevel !== level) {
        gameState.achievements.currentLevel = level;
    }

    waspKillCount.textContent = `${Math.min(kills, targetKills)}/${targetKills}`;
    const progress = (kills % 10) * 10;
    waspProgress.style.width = `${progress}%`;

    if (achievementCard) {
        achievementCard.style.background = background;
    }
    if (achievementInfo) {
        achievementInfo.textContent = `Король ОС (Уровень ${level + 1})`;
    }
    if (achievementRewards) {
        achievementRewards.innerHTML = rewards;
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
}

function getTalentButtonText(type) {
    return {
        basic: 'Базовый удар',
        critical: 'Критический удар',
        poison: 'Ядовитый удар'
    }[type] || '';
}

function getTalentIcon(type) {
    return {
        basic: '🗡️',
        critical: '💥',
        poison: '☠️',
        ice: '❄️' //Added ice icon
    }[type] || '';
}

// =================== ФУНКЦИИ КАСТОМИЗАЦИИ ===================
let skins = ['img/skin1.png', 'img/skin2.png', 'img/skin3.png'];
let pets = ['img/pet1.png', 'img/pet2.png', 'img/pet3.png'];

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
        // Сохраняем текущий выбор
        gameState.currentSkin = selectedSkin;
        // Обновляем состояние кнопки
        updateSkinButton();
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
        // Сохраняем текущий выбор
        gameState.currentPet = selectedPet;
        gameState.hasPet = true;
        petImg.style.display = 'block';
        // Обновляем состояние кнопки
        updatePetButton();
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
    const iceButton = document.getElementById('iceButton'); //Added ice button

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
        } else {
            showMessage('Недостаточно зарядов!');
        }
    });

    iceButton.addEventListener('click', (e) => { //Added ice button event listener
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

    // Проверяем рецепт звукового удара
    const isSonicRecipe = talents.length === 2 &&
        talents.includes('basic') &&
        talents.includes('critical');

    // Проверяем рецепт огненного удара
    const isFireRecipe = talents.length === 2 &&
        talents.includes('critical') &&
        talents.includes('poison');

    // Проверяем рецепт ледяного удара
    const isIceRecipe = talents.length === 2 &&
        talents.includes('poison') &&
        talents.includes('basic');


    const sonicButton = document.getElementById('sonicButton');
    const fireButton = document.getElementById('fireButton');
    const iceButton = document.getElementById('iceButton');

    // Управляем кнопкой звукового удара
    if (sonicButton) {
        sonicButton.style.display = isSonicRecipe ? 'block' : 'none';
        if (isSonicRecipe) {
            sonicButton.disabled = gameState.attackCharges.basic.charges < 1 ||
                gameState.attackCharges.critical.charges < 1;
        }
    }

    // Управляем кнопкой огненного удара
    if (fireButton) {
        fireButton.style.display = isFireRecipe ? 'block' : 'none';
        if (isFireRecipe) {
            fireButton.disabled = gameState.attackCharges.critical.charges < 1 ||
                gameState.attackCharges.poison.charges < 1;
        }
    }

    // Управляем кнопкой ледяного удара
    if (iceButton) {
        iceButton.style.display = isIceRecipe ? 'block' : 'none';
        if (isIceRecipe) {
            iceButton.disabled = gameState.attackCharges.critical.charges < 1 ||
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
    const iceButton = document.getElementById('iceButton'); //Added ice button
    if (sonicButton) {
        sonicButton.style.display = 'none';
    }
    if (fireButton) {
        fireButton.style.display = 'none';
    }
    if (iceButton) { //Added ice button reset
        iceButton.style.display = 'none';
    }
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

const shopTabs = document.querySelector('#shopPopup .shop-tabs');
if (shopTabs) {
    shopTabs.addEventListener('click', e => {
        const tabBtn = e.target.closest('.tab-btn');
        if (!tabBtn) return;

        document.querySelectorAll('#shopPopup .tab-btn, #shopPopup .shop-tab').forEach(el => {
            el.classList.remove('active');
        });

        tabBtn.classList.add('active');
        const tabId = `shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`;
        document.getElementById(tabId).classList.add('active');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    initCrafting();
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
let previousBg = ''; // Переменная для сохранения текущего фона перед открытием меню

// Функция для обновления фона на главном экране
function updateBackgroundUI() {
    const currentBg = backgrounds[currentBgIndex];

    // Обновляем фон на главном экране сразу
    document.body.style.backgroundImage = currentBg.image;

    const actionBtn = document.getElementById('bgActionBtn');
    const isPurchased = gameState.purchasedBackgrounds.includes(currentBg.name);
    const isSelected = gameState.currentBackground === currentBg.name;

    // Изменяем текст кнопки в зависимости от того, куплен ли фон
    actionBtn.textContent = isPurchased ? (isSelected ? 'Выбран' : 'Выбрать') : `Купить за ${currentBg.cost}`;

    // Блокируем кнопку, если это текущий выбранный фон
    actionBtn.disabled = isSelected || (!isPurchased && gameState.honey < currentBg.cost);
}

// Обработчик кнопки выбора фона
document.getElementById('bgMenuBtn').addEventListener('click', () => {
    previousBg = gameState.currentBackground; // Сохраняем текущий фон
    document.getElementById('backgroundSelector').classList.add('active');
    currentBgIndex = backgrounds.findIndex(bg => bg.name === gameState.currentBackground);
    updateBackgroundUI();
});

// Обработчики кнопок переключения фонов
document.getElementById('bgPrevBtn').addEventListener('click', () => {
    currentBgIndex = (currentBgIndex - 1 + backgrounds.length) % backgrounds.length;
    updateBackgroundUI();
});

document.getElementById('bgNextBtn').addEventListener('click', () => {
    currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
    updateBackgroundUI();
});

// Обработчик кнопки покупки или выбора фона
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

    // После выбора фона, обновляем текущий фон
    gameState.currentBackground = currentBg.name;
    showMessage(`Фон "${currentBg.name}" выбран!`);
    updateBackgroundUI();  // Обновляем UI
});

// Инициализация фона на главной странице
document.body.style.backgroundImage = backgrounds.find(bg => bg.name === gameState.currentBackground).image;

// Закрытие меню при клике вне его
document.addEventListener('click', (e) => {
    const bgSelector = document.getElementById('backgroundSelector');
    if (!bgSelector.contains(e.target) &&
        e.target.id !== 'bgMenuBtn' &&
        bgSelector.classList.contains('active')) {
        bgSelector.classList.remove('active');
        // Восстанавливаем фон при закрытии меню
        if (gameState.currentBackground === previousBg) {
            document.body.style.backgroundImage = backgrounds.find(bg => bg.name === gameState.currentBackground).image;
        }
    }
});
