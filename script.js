// Инициализация Telegram WebApp
let tg;
try {
    tg = window.Telegram.WebApp;
    tg.expand(); // Раскрываем на полный экран
} catch (error) {
    console.error('Ошибка инициализации Telegram WebApp:', error);
    alert('Ошибка инициализации. Пожалуйста, убедитесь что приложение открыто в Telegram.');
}

// Подключаем основной код игры
const gameScript = document.createElement('script');
gameScript.src = 'script.js';
document.body.appendChild(gameScript);

// Добавляем функции для интеграции с Telegram
function sendScoreToBot(score) {
    tg.sendData(JSON.stringify({ type: 'score', value: score }));
}

// Когда игра загружена
document.addEventListener('DOMContentLoaded', () => {
    if (tg.colorScheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    document.getElementById('gameScreen').style.display = 'block';
});

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
        wasp: { health: 500, time: 60, honeyReward: 1000, xpReward: 200, keyReward: { type: 'bear', amount: 1 }, image: 'img/wasp.jpg', defeatImage: 'img/wasp_kill.jpg' },
        bear: { health: 1000, time: 90, honeyReward: 2000, requiredKeys: 3, keyReward: { type: 'dragon', amount: 1 }, xpReward: 500, image: 'img/bear.jpg', defeatImage: 'img/bear_kill.jpg' },
        dragon: { health: 2500, time: 120, honeyReward: 5000, requiredKeys: 3, keyReward: { type: 'hydra', amount: 1 }, xpReward: 1500, image: 'img/dragon.jpg', defeatImage: 'img/dragon_kill.jpg' },
        hydra: { health: 4000, time: 150, honeyReward: 7500, requiredKeys: 3, keyReward: { type: 'kraken', amount: 1 }, xpReward: 2500, image: 'img/hydra.jpg', defeatImage: 'img/hydra_kill.jpg' },
        kraken: { health: 6000, time: 180, honeyReward: 10000, requiredKeys: 3, xpReward: 4000, image: 'img/kraken.jpg', defeatImage: 'img/kraken_kill.jpg' }
    },
    hivePrices: { golden: 1500, crystal: 3000, inferno: 4500 },
    boostPrices: { energy: 1000, shield: 1200, multiclick: 800 }
};

// =================== КЛАСС СОСТОЯНИЯ ИГРЫ ===================
class GameState {
    constructor() {
        this.achievements = { waspKills: 0, bearKills: 0, currentLevel: 0, rewards: { level1: false, level2: false, level3: false }, bearRewards: { level1: false, level2: false, level3: false } };
        this.purchasedBackgrounds = ['default'];
        this.selectedTalent = null;
        this.currentBackground = 'default';
        this.hasPet = false;
        this.selectedForCraft = [];
        this.craftedTalents = { sonic: { level: 0, damage: 50, charges: 0 }, fire: { level: 0, damage: 75, charges: 0 }, ice: { level: 0, damage: 60, charges: 0 } };
        this.currentSkin = 'img/skin1.png';
        this.currentPet = 'img/pet1.png';
        this.battleResult = null;
        this.reset();
        this.isMusicMuted = localStorage.getItem('musicMuted') === 'true';
        this.previewHive = 'basic';
        this.attackCooldowns = { basic: 0, critical: 0, poison: 0 };
        this.hiveImages = {
            basic: 'img/human_male.png',
            golden: 'img/1.png',
            crystal: 'https://cdn.pixabay.com/photo/2016/09/10/13/28/diamond-1659283_1280.png',
            inferno: 'https://cdn.pixabay.com/photo/2013/07/13/12/35/flame-160034_1280.png'
        };
        this.keys = { bear: 0, dragon: 0, hydra: 0, kraken: 0 };
        this.attackCharges = { basic: { charges: 15, basePrice: 50 }, critical: { charges: 15, basePrice: 75 }, poison: { charges: 15, basePrice: 100 } };
        this.activeEffects = { poison: [], shield: null, multiclick: null };
        this.battleStats = { basicDamage: 0, criticalDamage: 0, poisonDamage: 0, sonicDamage: 0, fireDamage: 0, iceDamage: 0, totalDamage: 0 };
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
        this.talents = { basic: { level: 1, damage: 10 }, critical: { level: 1, chance: 0.2 }, poison: { level: 1, damage: 3 } };
        this.boosts = { battleBonus: 1.0, attackSpeed: 1.0, shield: false, multiclick: false };
        this.battleStats = { basicDamage: 0, criticalDamage: 0, poisonDamage: 0, sonicDamage: 0, fireDamage: 0, iceDamage: 0, totalDamage: 0 };
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
    basic: { maxLevel: 10, getDamage: level => 10 * level, getCost: level => 75 * Math.pow(1.5, level - 1) },
    critical: { maxLevel: 10, getChance: level => 0.15 + 0.05 * level, getCost: level => 150 * Math.pow(1.4, level) },
    poison: { maxLevel: 10, getDamage: level => 2 + level, getDuration: level => 5 + level, getCost: level => 200 * Math.pow(1.6, level) }
};

let gameState = new GameState();
let isAnimating = false;

// Оптимизация автосохранения с throttle
let lastSaveTime = 0;
let savePending = false;

function throttleSaveGameState() {
    const now = Date.now();
    if (now - lastSaveTime >= 10000 && !savePending) {
        savePending = true;
        saveGameStateToCloud().then(() => {
            lastSaveTime = now;
            savePending = false;
        });
    }
}
// =================== TELEGRAM CLOUD STORAGE ===================
if (!tg.CloudStorage) console.error('Cloud Storage не поддерживается в этой версии Telegram WebApp');

// Оптимизация автосохранения с throttle
let lastSaveTime = 0;
let savePending = false;

function throttleSaveGameState() {
    const now = Date.now();
    if (now - lastSaveTime >= 10000 && !savePending) { // Сохраняем не чаще, чем раз в 10 секунд
        savePending = true;
        saveGameStateToCloud().then(() => {
            lastSaveTime = now;
            savePending = false;
        });
    }
}

function saveGameStateToCloud() {
    const gameData = {
        honey: gameState.honey,
        xp: gameState.xp,
        level: gameState.level,
        energy: gameState.energy,
        maxEnergy: gameState.maxEnergy,
        talents: gameState.talents,
        keys: gameState.keys,
        attackCharges: gameState.attackCharges,
        craftedTalents: gameState.craftedTalents,
        purchasedHives: gameState.purchasedHives,
        activeHive: gameState.activeHive,
        achievements: gameState.achievements,
        purchasedBackgrounds: gameState.purchasedBackgrounds,
        currentBackground: gameState.currentBackground,
        boosts: gameState.boosts,
        isMusicMuted: gameState.isMusicMuted,
        currentSkin: gameState.currentSkin,
        currentPet: gameState.currentPet,
        hasPet: gameState.hasPet
    };

    const jsonData = JSON.stringify(gameData);
    if (jsonData.length > 4096) {
        console.warn('Данные превышают 4096 символов, разбиваем на части');
        return saveSplitGameState(gameData);
    } else {
        return new Promise((resolve, reject) => {
            tg.CloudStorage.setItem('gameState', jsonData, (error, success) => {
                if (error) {
                    console.error('Ошибка сохранения в Cloud Storage:', error);
                    reject(error);
                } else {
                    console.log('Состояние игры сохранено в облаке');
                    resolve(success);
                }
            });
        });
    }
}

function saveSplitGameState(gameData) {
    const jsonData = JSON.stringify(gameData);
    const chunks = splitData(jsonData, 4096);
    const promises = chunks.map((chunk, index) => {
        return new Promise((resolve, reject) => {
            tg.CloudStorage.setItem(`gameState_part${index}`, chunk, (error, success) => {
                if (error) reject(error);
                else resolve(success);
            });
        });
    });

    return Promise.all(promises)
        .then(() => console.log('Все части сохранены'))
        .catch(err => console.error('Ошибка сохранения частей:', err));
}

function splitData(data, maxLength) {
    const chunks = [];
    for (let i = 0; i < data.length; i += maxLength) {
        chunks.push(data.slice(i, i + maxLength));
    }
    return chunks;
}

async function loadGameStateFromCloud() {
    try {
        const result = await new Promise((resolve, reject) => {
            tg.CloudStorage.getItem('gameState', (error, value) => {
                if (error) reject(error);
                else resolve(value);
            });
        });

        if (result) {
            const gameData = JSON.parse(result);
            Object.assign(gameState, gameData);
            console.log('Состояние загружено из Cloud Storage');
        } else {
            console.log('Нет сохраненных данных, используется начальное состояние');
            await saveGameStateToCloud();
        }
    } catch (error) {
        console.error('Ошибка загрузки из Cloud Storage:', error);
        await loadSplitGameState();
    }
    updateUI();
    updateHiveDisplay();
    gameState.updateKeysDisplay();
    updateBackgroundUI();
}

async function loadSplitGameState() {
    try {
        const keys = await new Promise((resolve, reject) => {
            tg.CloudStorage.getKeys((error, keys) => {
                if (error) reject(error);
                else resolve(keys);
            });
        });

        const gameStateKeys = keys.filter(k => k.startsWith('gameState_part')).sort();
        if (gameStateKeys.length === 0) return;

        const parts = await new Promise((resolve, reject) => {
            tg.CloudStorage.getItems(gameStateKeys, (error, values) => {
                if (error) reject(error);
                else resolve(Object.values(values));
            });
        });

        const fullData = parts.join('');
        const gameData = JSON.parse(fullData);
        Object.assign(gameState, gameData);
        console.log('Разбитые данные успешно загружены');
    } catch (error) {
        console.error('Ошибка загрузки разбитых данных:', error);
    }
}

// =================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ===================
function initGame() {
    if (!tg.CloudStorage) {
        console.error('Cloud Storage недоступен, игра будет работать без облачного сохранения');
        proceedWithInit();
    } else {
        loadGameStateFromCloud().then(proceedWithInit).catch(err => {
            console.error('Ошибка инициализации с Cloud Storage:', err);
            proceedWithInit();
        });
    }
}

function proceedWithInit() {
    const petImg = document.querySelector('#pet-img');
    if (petImg) petImg.style.display = gameState.hasPet ? 'block' : 'none';

    const requiredElements = Object.keys(elements).filter(key => key !== 'levelProgress').map(key => elements[key]?.id || key);
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length > 0) {
        console.error('Отсутствуют элементы:', missingElements);
        alert(`Ошибка загрузки! Отсутствуют: ${missingElements.join(', ')}`);
        throw new Error('Critical UI elements missing');
    }

    const elementsToInit = {
        hive: { element: document.getElementById('hive'), handler: handleHiveClick },
        bossCombatImage: { element: document.getElementById('bossCombatImage'), handler: handleBossClick },
        shopTabs: { element: document.querySelector('.shop-tabs'), handler: handleShopTabs },
        battlePopup: { element: document.getElementById('battlePopup'), handler: handleBossSelect }
    };

    for (const [key, { element, handler }] of Object.entries(elementsToInit)) {
        if (element) element.addEventListener('click', handler);
        else console.warn(`Элемент ${key} не найден`);
    }

    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showPopup(btn.dataset.popup)));
    document.querySelectorAll('.close').forEach(btn => btn.addEventListener('click', hideAllPopups));

    document.addEventListener('click', e => {
        const isCombatElement = e.target.closest('#combatScreen') || e.target.closest('.attack-btn') || e.target.closest('.battle-reward');
        const isPopup = e.target.closest('.popup');
        const isNavButton = e.target.closest('.nav-btn');

        if (!isPopup && !isNavButton && !isCombatElement) hideAllPopups();
        if (gameState.inBattle && !elements.combatScreen.style.display) debouncedCreateTalentButtons();

        if (e.target.closest('.shop-item button')) handleShopButton(e.target);
        if (e.target.closest('.talent button')) handleTalentButton(e.target);

        const bgSelector = document.getElementById('backgroundSelector');
        if (!bgSelector.contains(e.target) && e.target.id !== 'bgMenuBtn' && bgSelector.classList.contains('active')) {
            bgSelector.classList.remove('active');
            const bg = backgrounds.find(bg => bg.name === gameState.currentBackground);
            document.body.style.backgroundImage = bg.image;
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

    document.getElementById('hive').addEventListener('click', function firstPlay() {
        if (audioElements.bgMusic.paused) audioElements.bgMusic.play();
        document.removeEventListener('click', firstPlay);
    }, { once: true });

    window.addEventListener('beforeunload', throttleSaveGameState);
}

function initAudio() {
    audioElements.bgMusic.muted = gameState.isMusicMuted;
    audioElements.musicToggle.classList.toggle('muted', gameState.isMusicMuted);
    document.addEventListener('click', function initialPlay() {
        if (audioElements.bgMusic.paused) audioElements.bgMusic.play().catch(error => console.error('Ошибка воспроизведения музыки:', error));
        document.removeEventListener('click', initialPlay);
    }, { once: true });
}

function toggleMusic() {
    gameState.isMusicMuted = !gameState.isMusicMuted;
    audioElements.bgMusic.muted = gameState.isMusicMuted;
    audioElements.musicToggle.classList.toggle('muted', gameState.isMusicMuted);
    localStorage.setItem('musicMuted', gameState.isMusicMuted);
    throttleSaveGameState();
}
// Оптимизация автосохранения с throttle
let lastSaveTime = 0;
let savePending = false;

function throttleSaveGameState() {
    const now = Date.now();
    if (now - lastSaveTime >= 10000 && !savePending) { // Сохраняем не чаще, чем раз в 10 секунд
        savePending = true;
        saveGameStateToCloud().then(() => {
            lastSaveTime = now;
            savePending = false;
        });
    }
}

// Debounce для оптимизации частых вызовов
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

const debouncedCreateTalentButtons = debounce(createTalentButtons, 100);

let lastClick = 0;

function handleHiveClick(e) {
    if (document.querySelector('.popup.active')) {
        showMessage('Закройте другие окна!');
        return;
    }

    if (gameState.inBattle && gameState.selectedTalent) {
        const clickArea = document.querySelector('.click-area');
        const rect = clickArea.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const damageEffect = document.createElement('div');
        damageEffect.className = 'damage-effect';
        damageEffect.style.left = x + 'px';
        damageEffect.style.top = y + 'px';

        let damage = calculateDamage(gameState.selectedTalent);
        damageEffect.textContent = `-${damage}`;
        clickArea.appendChild(damageEffect);
        setTimeout(() => damageEffect.remove(), 800);
        attack(gameState.selectedTalent);
        return;
    }

    if (!gameState.inBattle) {
        const rect = e.currentTarget.getBoundingClientRect();
        for (let i = 0; i < 1; i++) {
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
    }

    const currentTime = Date.now();
    if (currentTime - lastClick < 100) return;
    lastClick = currentTime;
    if (isAnimating || gameState.energy <= 0) {
        if (gameState.energy <= 0) showMessage('Недостаточно энергии!');
        return;
    }

    isAnimating = true;
    const multiplier = gameState.boosts.multiclick ? 2 : 1;

    try {
        gameState.honey += 1 * multiplier;
        gameState.energy = Math.max(0, gameState.energy - 1);
        updateUI(['honey', 'energy']);
        throttleSaveGameState();

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

function handleBossClick(e) {
    if (!gameState.inBattle || !gameState.selectedTalent) return;

    if (navigator.vibrate) navigator.vibrate(50);

    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const damageEffect = document.createElement('div');
    damageEffect.className = 'damage-effect';
    damageEffect.style.left = x + 'px';
    damageEffect.style.top = y + 'px';

    let damage = calculateDamage(gameState.selectedTalent);
    damageEffect.textContent = `-${damage}`;
    e.target.appendChild(damageEffect);
    setTimeout(() => damageEffect.remove(), 800);

    attack(gameState.selectedTalent);

    const bossImage = document.getElementById('bossCombatImage');
    bossImage.style.transform = 'scale(0.95)';
    setTimeout(() => bossImage.style.transform = 'scale(1)', 100);
}

function calculateDamage(type) {
    switch (type) {
        case 'basic': return gameState.talents.basic.damage;
        case 'critical': return Math.random() < gameState.talents.critical.chance ? gameState.talents.basic.damage * 2 : gameState.talents.basic.damage;
        case 'poison': return gameState.talents.poison.damage;
        case 'sonic': return gameState.craftedTalents.sonic.damage;
        case 'fire': return gameState.craftedTalents.fire.damage;
        case 'ice': return gameState.craftedTalents.ice.damage;
        default: return 0;
    }
}

function startEnergyRecovery() {
    gameState.energyRecoveryInterval = setInterval(() => {
        gameState.energy = Math.min(Math.max(gameState.energy + 1, 0), gameState.maxEnergy);
        updateUI(['energy']);
        updateLevelProgress();
    }, 3000);
}

function initTalentBuyTab() {
    const container = document.getElementById('buyCharges');
    if (!container) return;

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
                if (gameState.inBattle) debouncedCreateTalentButtons();
                item.querySelector('.charge-counter').textContent = `${data.charges} шт`;
                throttleSaveGameState();
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
        document.querySelectorAll('.talent-tabs .tab-btn, .shop-tab').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});

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
    if (!tabBtn || tabBtn.dataset.tab === 'hives') return;

    document.querySelectorAll('.shop-tab, .tab-btn').forEach(el => el.classList.remove('active'));
    tabBtn.classList.add('active');
    const tabId = `shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`;
    document.getElementById(tabId)?.classList.add('active');
}

function updateBossAvailability() {
    document.querySelectorAll('.boss-card').forEach(card => {
        const bossType = card.dataset.boss;
        let isLocked = false;
        if (bossType === 'bear' || bossType === 'dragon' || bossType === 'hydra' || bossType === 'kraken') {
            isLocked = gameState.keys[bossType] < 3;
        }
        card.classList.toggle('locked', isLocked);
    });
}

function handleBossSelect(e) {
    const bossCard = e.target.closest('.boss-card');
    if (bossCard && !bossCard.classList.contains('locked')) startBattle(bossCard.dataset.boss);
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
    gameState.currentBoss = { ...bossConfig, currentHealth: bossConfig.health, maxHealth: bossConfig.health, type: bossType };

    document.getElementById('bossSelection').style.display = 'none';
    elements.combatScreen.style.display = 'block';
    elements.bossCombatImage.src = bossConfig.image;
    elements.battleReward.style.display = 'none';
    document.getElementById('backToBossSelection').style.display = 'none';

    elements.bossHealth.style.transition = 'none';
    elements.bossHealth.style.width = '100%';
    elements.currentHealth.textContent = bossConfig.health;
    elements.maxHealth.textContent = bossConfig.health;
    elements.combatTimer.textContent = bossConfig.time;

    setTimeout(() => {
        elements.bossHealth.style.transition = 'width 0.3s';
        updateCombatUI(true);
    }, 50);

    debouncedCreateTalentButtons();
    startBattleTimer(bossConfig.time);
    throttleSaveGameState();
}

function createTalentButtons() {
    elements.combatTalents.innerHTML = '';
    Object.entries(gameState.talents).forEach(([type, talent]) => {
        const charges = gameState.attackCharges[type].charges;
        if (charges <= 0 || talent.level <= 0) return;

        const isSelected = gameState.selectedTalent === type;
        const cooldown = Math.max(0, (gameState.lastAttackTime || 0) + 1000 - Date.now()) / 1000;

        const button = document.createElement('button');
        button.className = `attack-btn ${isSelected ? 'selected' : ''} ${cooldown > 0 ? 'disabled' : ''}`;
        button.dataset.attack = type;
        button.disabled = cooldown > 0 || !gameState.inBattle;
        button.innerHTML = `
            <div class="talent-icon">${getTalentIcon(type)}</div>
            <div class="talent-info">
                <div>${getTalentButtonText(type)}</div>
                <div class="charge-counter">Заряды: ${charges}</div>
                ${cooldown > 0 ? `<div class="cooldown">⌛ ${cooldown.toFixed(1)}s</div>` : ''}
            </div>
        `;
        button.title = `${getAttackName(type)}\nУрон: ${calculateDamage(type)}`;
        button.onclick = () => {
            gameState.selectedTalent = isSelected ? null : type;
            debouncedCreateTalentButtons();
        };
        elements.combatTalents.appendChild(button);
    });

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
                    <div class="charge-counter">Заряды: ${gameState.craftedTalents[talent.type].charges}</div>
                </div>
            `;
            button.onclick = () => {
                gameState.selectedTalent = gameState.selectedTalent === talent.type ? null : talent.type;
                debouncedCreateTalentButtons();
            };
            elements.combatTalents.appendChild(button);
        }
    });
}
// Оптимизация автосохранения с throttle
let lastSaveTime = 0;
let savePending = false;

function throttleSaveGameState() {
    const now = Date.now();
    if (now - lastSaveTime >= 10000 && !savePending) { // Сохраняем не чаще, чем раз в 10 секунд
        savePending = true;
        saveGameStateToCloud().then(() => {
            lastSaveTime = now;
            savePending = false;
        });
    }
}

// Debounce для оптимизации частых вызовов
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

const debouncedCreateTalentButtons = debounce(createTalentButtons, 100);

function startBattleTimer(seconds) {
    if (gameState.battleTimer) clearInterval(gameState.battleTimer);
    let timeLeft = seconds;
    elements.combatTimer.textContent = timeLeft;
    elements.combatTimer.style.transition = 'color 0.5s ease'; // Улучшение UX: плавный переход цвета
    elements.combatTimer.style.color = 'white';

    gameState.battleTimer = setInterval(() => {
        if (!gameState.inBattle || gameState.currentBoss.currentHealth <= 0) {
            clearInterval(gameState.battleTimer);
            return;
        }
        timeLeft--;
        elements.combatTimer.textContent = timeLeft;
        elements.combatTimer.style.color = timeLeft <= 10 ? '#ff4444' : 'white';
        if (timeLeft <= 0) {
            endBattle(false);
            elements.bossCombatImage.classList.add('grayscale');
        }
    }, 1000);
}

function attack(type) {
    if (!gameState.inBattle || !gameState.selectedTalent) return;

    const now = Date.now();
    if (now - (gameState.lastAttackTime || 0) < 1000) return;
    gameState.lastAttackTime = now;

    if (type === 'sonic' || type === 'fire' || type === 'ice') {
        const talent = gameState.craftedTalents[type];
        if (!talent) {
            console.error('Crafted talent not found:', type);
            return;
        }
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

        if (type === 'sonic') showSonicEffect(rawDamage);
        else if (type === 'fire') showFireEffect(rawDamage);
        else showIceEffect(rawDamage);

        updateCombatUI();
        debouncedCreateTalentButtons();
        if (gameState.currentBoss.currentHealth <= 0) endBattle(true);
        throttleSaveGameState();
        return;
    }

    if (gameState.attackCharges[type].charges <= 0) {
        showMessage('Заряды кончились!');
        debouncedCreateTalentButtons();
        return;
    }

    gameState.attackCharges[type].charges--;
    updateTalentBuyTab();

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
                timeout: null, // Исправление яда: добавлено поле для очистки timeout
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
                if (gameState.currentBoss.currentHealth <= 0) endBattle(true);
            }, 1000);
            poisonEffect.timeout = setTimeout(() => {
                clearInterval(poisonEffect.timer);
                gameState.activeEffects.poison = gameState.activeEffects.poison.filter(e => e !== poisonEffect);
                updatePoisonTimersDisplay();
            }, poisonEffect.duration);
            gameState.activeEffects.poison.push(poisonEffect);
            showPoisonTimer(duration);
            break;
    }

    if (damage > 0) {
        gameState.currentBoss.currentHealth = Math.max(gameState.currentBoss.currentHealth - damage, 0);
        updateCombatUI();
        if (gameState.currentBoss.currentHealth <= 0) endBattle(true);
    }

    debouncedCreateTalentButtons();
    throttleSaveGameState();
}

function endBattle(victory) {
    if (!gameState.inBattle || !gameState.currentBoss) return;

    gameState.activeEffects.poison.forEach(effect => {
        clearInterval(effect.timer);
        clearTimeout(effect.timeout); // Исправление яда: очистка timeout
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

    gameState.battleResult = { victory, boss: { ...gameState.currentBoss }, reward };
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

    gameState.battleStats = { basicDamage: 0, criticalDamage: 0, poisonDamage: 0, sonicDamage: 0, fireDamage: 0, iceDamage: 0, totalDamage: 0 };
    updateTalentBuyTab();
    throttleSaveGameState();
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

    if (!gameState.battleResult.boss) return;
    const bossConfig = gameConfig.bosses[gameState.battleResult.boss.type];
    const reward = gameState.battleResult.reward;

    resultBossImage.src = gameState.battleResult.victory ? bossConfig.defeatImage : bossConfig.image;

    if (gameState.battleResult.victory) {
        resultTitle.textContent = "ПОБЕДА!";
        resultTitle.style.color = "#4CAF50";
        claimBtn.style.display = 'block';
        closeBtn.style.display = 'none';

        if (reward) {
            rewardHoney.textContent = reward.honey;
            rewardXP.textContent = reward.xp;
            const keys = Object.entries(reward.keys || {}).map(([_, amount]) => amount).reduce((a, b) => a + b, 0);
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

// =================== ОБРАБОТЧИКИ КНОПОК ===================
document.getElementById('claimRewardButton').addEventListener('click', () => {
    const reward = gameState.battleResult?.reward;
    const bossType = gameState.battleResult?.boss?.type;

    if (reward) {
        if (bossType === 'wasp' || bossType === 'bear') {
            if (!gameState.achievements) gameState.achievements = { waspKills: 0, bearKills: 0, rewards: { level1: false, level2: false, level3: false }, bearRewards: { level1: false, level2: false, level3: false } };

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
        Object.entries(reward.keys).forEach(([type, amount]) => {
            gameState.keys[type] = (gameState.keys[type] || 0) + amount;
        });

        checkLevelUp();
        updateUI();
        throttleSaveGameState();
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
    elements.combatScreen.style.display = 'none';
    throttleSaveGameState();
});

document.querySelectorAll('.popup .close').forEach(btn => {
    btn.addEventListener('click', () => {
        const popup = btn.closest('.popup');
        if (popup.id === 'talentsPopup') resetCrafting();
        if (popup.id === 'battleResultPopup') {
            if (gameState.battleResult?.victory) document.getElementById('claimRewardButton').click();
            else document.getElementById('closeResultButton').click();
        } else {
            hidePopup(popup.id.replace('Popup', ''));
        }
    });
});
// Оптимизация автосохранения с throttle
let lastSaveTime = 0;
let savePending = false;

function throttleSaveGameState() {
    const now = Date.now();
    if (now - lastSaveTime >= 10000 && !savePending) { // Сохраняем не чаще, чем раз в 10 секунд
        savePending = true;
        saveGameStateToCloud().then(() => {
            lastSaveTime = now;
            savePending = false;
        });
    }
}

// Debounce для оптимизации частых вызовов
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

const debouncedCreateTalentButtons = debounce(createTalentButtons, 100);

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
        throttleSaveGameState(); // Улучшение: используем throttle вместо прямого saveGameStateToCloud
    }
}

function applyLevelBonuses(levels) {
    gameState.maxEnergy += 5 * levels;
    gameState.talents.basic.damage += 2 * levels;
    gameState.boosts.attackSpeed += 0.03 * levels;
}

function updateLevelProgress() {
    const progress = (gameState.xp / gameState.xpToNextLevel) * 100;
    elements.levelProgress.style.transition = 'width 0.5s ease-in-out'; // Улучшение UX: плавная анимация
    elements.levelProgress.style.width = `${Math.min(progress, 100)}%`;
    elements.levelProgress.style.backgroundColor = progress > 75 ? '#4CAF50' : progress > 50 ? '#FFC107' : '#F44336'; // Улучшение UX: цветовая индикация
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
    const shouldUpdateAll = changedKeys.includes('all');
    const updates = {
        honey: () => { if (elements.honey) elements.honey.textContent = Math.floor(gameState.honey); },
        energy: () => {
            if (elements.energy) elements.energy.textContent = Math.floor(gameState.energy);
            if (elements.maxEnergy) elements.maxEnergy.textContent = gameState.maxEnergy;
        },
        level: () => {
            if (elements.level) elements.level.textContent = gameState.level;
            if (elements.xp) elements.xp.textContent = Math.floor(gameState.xp);
            if (elements.xpToNextLevel) elements.xpToNextLevel.textContent = Math.floor(gameState.xpToNextLevel);
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
        if (levelElem) levelElem.textContent = `Уровень: ${gameState.talents[talentType].level}`;
        if (statElem) {
            if (talentType === 'basic') statElem.textContent = gameState.talents.basic.damage;
            else if (talentType === 'critical') statElem.textContent = `${(gameState.talents.critical.chance * 100).toFixed(0)}%`;
            else if (talentType === 'poison') statElem.textContent = gameState.talents.poison.damage;
        }
    }

    if (shouldUpdateAll) Object.values(updates).forEach(fn => fn());
    else changedKeys.forEach(key => updates[key]?.());
}

function showMessage(message, duration = 3000) {
    const msg = document.createElement('div');
    msg.className = 'notification';
    msg.textContent = message;
    Object.assign(msg.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '5px',
        zIndex: '1000',
        opacity: '0',
        transition: 'opacity 0.3s' // Улучшение UX: плавное появление/исчезновение
    });
    document.body.appendChild(msg);
    setTimeout(() => msg.style.opacity = '1', 10);
    setTimeout(() => {
        msg.style.opacity = '0';
        setTimeout(() => msg.remove(), 300);
    }, duration);
}

function showPopup(type) {
    hideAllPopups();
    const popup = document.getElementById(`${type}Popup`);
    if (popup) {
        popup.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (type === 'talents') document.querySelector('#talentsPopup .tab-btn[data-tab="buyCharges"]').click();
        if (type === 'battleResult') updateResultPopup();
    }
}

function hidePopup(type) {
    const popup = document.getElementById(`${type}Popup`);
    if (popup) {
        popup.classList.remove('active');
        document.body.style.overflow = '';
        if (type === 'battle') {
            gameState.selectedTalent = null;
            if (!gameState.inBattle) elements.combatScreen.style.display = 'none';
            debouncedCreateTalentButtons();
        }
        if (type === 'battleResult') {
            gameState.battleResult = null;
            gameState.inBattle = false;
            elements.combatScreen.style.display = 'none';
        }
    }
}

function hideAllPopups() {
    document.querySelectorAll('.popup').forEach(p => p.classList.remove('active'));
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
    return { basic: 'Базовый удар', critical: 'Критический удар', poison: 'Ядовитый удар' }[type];
}

function calculateBasicDamage() {
    let damage = talentsConfig.basic.getDamage(gameState.talents.basic.level);
    damage *= gameState.boosts.attackSpeed;
    if (gameState.activeHive === 'inferno') damage += gameState.hiveBonuses?.inferno?.fireDamage || 0; // Примечание: hiveBonuses отсутствует в вашем <DOCUMENT>, оставлено как было
    if (gameState.boosts.shield) damage *= 0.7;
    return Math.round(damage);
}

function showEnergyWarning() { // Заменяем отсутствующую функцию из вашего <DOCUMENT> на showMessage
    showMessage('Недостаточно энергии!');
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
        const waspProgressValue = waspKills >= 30 ? 100 : (waspKills % 10) * 10;
        waspProgress.style.width = `${waspProgressValue}%`;

        if (waspCard) {
            waspCard.style.background = waspBackground;
            waspCard.querySelector('.achievement-info h3').textContent = `Король ОС (Уровень ${waspLevel + 1})`;
            if (waspKills < 30) waspCard.querySelector('.achievement-rewards').innerHTML = waspRewards;
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
        const bearProgressValue = bearKills >= 30 ? 100 : (bearKills % 10) * 10;
        bearProgress.style.width = `${bearProgressValue}%`;

        if (bearCard) {
            bearCard.style.background = bearBackground;
            bearCard.querySelector('.achievement-info h3').textContent = `Король Медведей (Уровень ${bearLevel + 1})`;
            if (bearKills < 30) bearCard.querySelector('.achievement-rewards').innerHTML = bearRewards;
        }
    }
}

function updateCombatUI() {
    if (!gameState.currentBoss) return;
    if (gameState.currentBoss.currentHealth < 0) gameState.currentBoss.currentHealth = 0;
    const healthPercent = (gameState.currentBoss.currentHealth / gameState.currentBoss.maxHealth) * 100;
    elements.bossHealth.style.width = `${healthPercent}%`;
    elements.currentHealth.textContent = gameState.currentBoss.currentHealth;

    if (elements.bossCombatImage) {
        if (healthPercent <= 25) elements.bossCombatImage.src = `img/${gameState.currentBoss.type}_critical.jpg`;
        else if (healthPercent <= 50) elements.bossCombatImage.src = `img/${gameState.currentBoss.type}_wounded.jpg`;
        else elements.bossCombatImage.src = gameConfig.bosses[gameState.currentBoss.type].image;
    }
}

function getTalentButtonText(type) {
    return { basic: 'Базовый', critical: 'Критический', poison: 'Ядовитый' }[type] || '';
}

function getTalentIcon(type) {
    return { basic: '🗡️', critical: '💥', poison: '☠️', sonic: '🔊', fire: '🔥', ice: '❄️' }[type] || '';
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
        gameState.currentSkin = selectedSkin;
        updateSkinButton();
        throttleSaveGameState();
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
        throttleSaveGameState();
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
// Оптимизация автосохранения с throttle
// Оптимизация автосохранения с throttle
let lastSaveTime = 0;
let savePending = false;

function throttleSaveGameState() {
    const now = Date.now();
    if (now - lastSaveTime >= 10000 && !savePending) {
        savePending = true;
        saveGameStateToCloud().then(() => {
            lastSaveTime = now;
            savePending = false;
        });
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

const debouncedCreateTalentButtons = debounce(createTalentButtons, 100);

// =================== ФУНКЦИИ ЭФФЕКТОВ ===================
function showSonicEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `🔊 ${damage}`;
    effect.style.color = '#00aaff';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showFireEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `🔥 ${damage}`;
    effect.style.color = '#ff4400';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showIceEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'sonic-effect';
    effect.textContent = `❄️ ${damage}`;
    effect.style.color = '#00ccff';
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 1000);
}

function showBasicEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'damage-effect';
    effect.textContent = `🗡️ ${damage}`;
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 800);
}

function showCriticalEffect(damage) {
    const effect = document.createElement('div');
    effect.className = 'damage-effect critical';
    effect.textContent = `💥 ${damage}`;
    elements.combatScreen.appendChild(effect);
    setTimeout(() => effect.remove(), 800);
}

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

    throttleSaveGameState();
}

function showLevelUpEffect(levels) {
    const effect = document.createElement('div');
    effect.className = 'level-up-effect';
    effect.textContent = `Уровень повышен! +${levels}`;
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 2000);
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

    const craftButtons = {
        sonic: document.getElementById('sonicButton'),
        fire: document.getElementById('fireButton'),
        ice: document.getElementById('iceButton')
    };

    Object.entries(craftButtons).forEach(([type, button]) => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const requiredCharges = {
                sonic: ['basic', 'critical'],
                fire: ['critical', 'poison'],
                ice: ['poison', 'basic']
            }[type];

            if (gameState.attackCharges[requiredCharges[0]].charges >= 1 && gameState.attackCharges[requiredCharges[1]].charges >= 1) {
                gameState.attackCharges[requiredCharges[0]].charges -= 1;
                gameState.attackCharges[requiredCharges[1]].charges -= 1;
                gameState.craftedTalents[type].charges += 1;
                gameState.craftedTalents[type].level = Math.max(
                    gameState.talents[requiredCharges[0]].level,
                    gameState.talents[requiredCharges[1]].level
                );

                showMessage(`✨ Создан новый талант: ${type === 'sonic' ? 'Звуковой' : type === 'fire' ? 'Огненный' : 'Ледяной'} удар!`);
                resetCrafting();
                updateTalentBuyTab();
                if (gameState.inBattle) setTimeout(() => debouncedCreateTalentButtons(), 100);
                throttleSaveGameState();
            } else {
                showMessage('Недостаточно зарядов!');
            }
        });
        button.style.display = 'none';
    });
}

function checkRecipe() {
    const slots = document.querySelectorAll('.craft-slot');
    const talents = Array.from(slots).map(slot => slot.dataset.talent).filter(Boolean);

    const recipes = {
        sonic: talents.length === 2 && talents.includes('basic') && talents.includes('critical'),
        fire: talents.length === 2 && talents.includes('critical') && talents.includes('poison'),
        ice: talents.length === 2 && talents.includes('poison') && talents.includes('basic')
    };

    const craftButtons = {
        sonic: document.getElementById('sonicButton'),
        fire: document.getElementById('fireButton'),
        ice: document.getElementById('iceButton')
    };

    Object.entries(craftButtons).forEach(([type, button]) => {
        button.style.display = recipes[type] ? 'block' : 'none';
        if (recipes[type]) {
            const requiredCharges = {
                sonic: ['basic', 'critical'],
                fire: ['critical', 'poison'],
                ice: ['poison', 'basic']
            }[type];
            button.disabled = gameState.attackCharges[requiredCharges[0]].charges < 1 || gameState.attackCharges[requiredCharges[1]].charges < 1;
        }
    });

    return Object.values(recipes).some(v => v);
}

function resetCrafting() {
    gameState.selectedForCraft = [];
    document.querySelectorAll('.talent-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('.craft-slot').forEach(slot => {
        slot.innerHTML = '';
        slot.dataset.talent = '';
        slot.classList.remove('filled');
    });
    ['sonicButton', 'fireButton', 'iceButton'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.style.display = 'none';
    });
}

// =================== ФОНЫ ===================
const backgrounds = [
    { name: 'default', cost: 0, image: 'url("img/background1.png")', preview: 'img/background1.png' },
    { name: 'forest', cost: 1000, image: 'url("img/background2.png")', preview: 'img/background2.png' },
    { name: 'city', cost: 2500, image: 'url("img/background3.png")', preview: 'img/background3.png' },
    { name: 'space', cost: 5000, image: 'url("img/bg_space.jpg")', preview: 'img/bg_space_preview.jpg' }
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
            throttleSaveGameState();
        } else {
            showMessage('Недостаточно мёда!');
            return;
        }
    }
    gameState.currentBackground = currentBg.name;
    showMessage(`Фон "${currentBg.name}" выбран!`);
    updateBackgroundUI();
    throttleSaveGameState();
});

document.body.style.backgroundImage = backgrounds.find(bg => bg.name === gameState.currentBackground).image;

// =================== ПОКУПКА УЛЬЕВ И БУСТОВ ===================
function buyHive(type) {
    const price = gameConfig.hivePrices[type];
    if (!price || gameState.purchasedHives.includes(type)) return;

    if (gameState.honey >= price) {
        gameState.honey -= price;
        gameState.purchasedHives.push(type);
        gameState.activeHive = type;
        updateHiveDisplay();
        updateUI(['honey']);
        updateShopItems();
        throttleSaveGameState();
        showMessage(`Куплен улей: ${type}!`);
    } else {
        showMessage(`Недостаточно мёда! Нужно: ${price}`);
    }
}

function buyBoost(type) {
    const button = document.querySelector(`.shop-item[data-type="${type}"] button`);
    if (!button || button.disabled) return;

    if (gameState.honey >= gameConfig.boostPrices[type]) {
        gameState.honey -= gameConfig.boostPrices[type];
        button.disabled = true;
        button.textContent = 'Куплено';

        const boostDuration = { energy: 0, shield: 60000, multiclick: 30000 }[type];
        if (boostDuration > 0) {
            const timerElement = document.createElement('div');
            timerElement.className = 'boost-timer';
            document.body.appendChild(timerElement);

            let timeLeft = boostDuration / 1000;
            const timer = setInterval(() => {
                timeLeft--;
                timerElement.textContent = `${type}: ${timeLeft}s`;
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    timerElement.remove();
                }
            }, 1000);
        }

        switch (type) {
            case 'energy': gameState.maxEnergy += 40; gameState.energy += 40; break;
            case 'shield': gameState.boosts.shield = true; setTimeout(() => gameState.boosts.shield = false, 60000); break;
            case 'multiclick': gameState.boosts.multiclick = true; setTimeout(() => gameState.boosts.multiclick = false, 30000); break;
        }
        updateUI(['honey']);
        throttleSaveGameState();
        showMessage('Буст активирован!');
    } else {
        showMessage(`Недостаточно меда! Нужно: ${gameConfig.boostPrices[type]}`);
    }
}

// =================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===================
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
    if (gameState.achievements.waspKills >= 10 && !gameState.achievements.rewards?.kingOfWasps) {
        gameState.achievements.rewards.kingOfWasps = true;
    }

    if (gameState.activeHive === 'crystal') {
        reward.honey = Math.floor(reward.honey * 1.3);
    }

    return reward;
}

// =================== ЗАПУСК ИГРЫ ===================
document.getElementById('backToBossSelection').addEventListener('click', () => {
    endBattle(false);
    document.getElementById('bossSelection').style.display = 'block';
    elements.combatScreen.style.display = 'none';
    throttleSaveGameState();
});

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    initCrafting();
    document.getElementById('gameScreen').style.display = 'block';

    const elementsToCheck = ['battleResultPopup', 'resultTitle', 'resultBossImage', 'claimRewardButton'];
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
            throttleSaveGameState();
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

// Закрытие меню фонов при клике вне его
document.addEventListener('click', (e) => {
    const bgSelector = document.getElementById('backgroundSelector');
    if (!bgSelector.contains(e.target) && e.target.id !== 'bgMenuBtn' && bgSelector.classList.contains('active')) {
        bgSelector.classList.remove('active');
        const bg = backgrounds.find(bg => bg.name === gameState.currentBackground);
        document.body.style.backgroundImage = bg.image;
    }
});

// =================== ФУНКЦИИ ТАЙМЕРОВ ЯДА ===================
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
        debouncedCreateTalentButtons();
    }

    throttleSaveGameState();
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

function createTalentButtons() {
    elements.combatTalents.innerHTML = '';

    Object.entries(gameState.talents).forEach(([type, talent]) => {
        if (talent.level > 0) {
            const charges = gameState.attackCharges[type].charges;
            if (charges <= 0) return;

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
                    gameState.selectedTalent = null;
                } else {
                    gameState.selectedTalent = type;
                }
                debouncedCreateTalentButtons();
            };

            elements.combatTalents.appendChild(button);
        }
    });

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
                debouncedCreateTalentButtons();
            };
            elements.combatTalents.appendChild(button);
        }
    });
}
