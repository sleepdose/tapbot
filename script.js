// =================== КОНФИГУРАЦИЯ И ЭЛЕМЕНТЫ DOM ===================
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
    critChance: document.getElementById('critChance'),
    poisonLevel: document.getElementById('poisonLevel'),
    poisonDmg: document.getElementById('poisonDmg'),
    vampireLevel: document.getElementById('vampireLevel'),
    vampirePercent: document.getElementById('vampirePercent'),
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
            time: 120,       // 2 минуты на победу
            honeyReward: 5000,
            xpReward: 1500,
            image: 'img/dragon.jpg'  // положите файл в папку img/
        }
    },
    hivePrices: { golden: 1500, crystal: 3000, inferno: 4500 },
    boostPrices: { energy: 1000, shield: 1200, multiclick: 800 }
};

// =================== КЛАСС СОСТОЯНИЯ ИГРЫ ===================
class GameState {
    constructor() {
        this.reset();
        this.hiveImages = {
            basic: 'img/human_male.png',
            golden: 'img/1.png',
            crystal: 'https://cdn.pixabay.com/photo/2016/09/10/13/28/diamond-1659283_1280.png',
            inferno: 'https://cdn.pixabay.com/photo/2013/07/13/12/35/flame-160034_1280.png'
        };
        this.hiveBonuses = {
            golden: { attackSpeed: 1.15 },
            crystal: { battleBonus: 1.3 },
            inferno: { fireDamage: 1.25 }
        };
        this.activeEffects = { poison: [], shield: null, multiclick: null };
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
            critical: { level: 0, chance: 0.15 },
            poison: { level: 0, damage: 0 },
            vampire: { level: 0, percent: 0 }
        };
        this.boosts = {
            battleBonus: 1.0,
            attackSpeed: 1.0,
            shield: false,
            multiclick: false
        };
        this.currentBoss = null;
        this.battleTimer = null;
        this.energyRecoveryInterval = null;
    }

    calculateXPRequired(level) {
        return Math.floor(100 * Math.pow(1.2, level - 1));
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
        if (e.target.closest('.shop-item button')) handleShopButton(e.target);
        if (e.target.closest('.talent button')) handleTalentButton(e.target);
        if (!e.target.closest('.popup') && !e.target.closest('.nav-btn')) hideAllPopups();
    });

    window.addEventListener('resize', () => {
        updateHiveDisplay();
        updateCombatUI(true);
    });

    updateHiveDisplay();
    updateShopItems();
    updateUI();
    startEnergyRecovery();
}

function startEnergyRecovery() {
gameState.energyRecoveryInterval = setInterval(() => {
    gameState.energy = Math.min(gameState.energy + 1, gameState.maxEnergy);
    updateUI(['energy']);
}, 3000);
// Принудительно обнуляем прогресс при старте
elements.levelProgress.style.width = "0%";
setTimeout(() => {
    const progress = (gameState.xp / gameState.xpToNextLevel) * 100;
    elements.levelProgress.style.width = `${progress}%`;
}, 100);
}

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

// =================== МАГАЗИН И ТАЛАНТЫ ===================
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
        showMessage(`Недостаточно меда! Нужно: ${gameConfig.hivePrices[type]} 🍯`);
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

        setTimeout(() => {
            button.disabled = false;
            button.textContent = `${gameConfig.boostPrices[type]} 🍯`;
        }, 30000);

        switch(type) {
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
        showMessage(`Недостаточно меда! Нужно: ${gameConfig.boostPrices[type]} 🍯`);
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

    switch(talentType) {
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
            ? `${Math.floor(talent.getCost(newLevel))} 🍯`
            : 'MAX';
    }

    updateUI(['honey', 'talents']);
    showMessage('Талант улучшен!');
}

// =================== БОЕВАЯ СИСТЕМА ===================
function startBattle(bossType) {
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
            const button = document.createElement('button');
            button.className = 'attack-btn';
            button.dataset.type = type;
            button.innerHTML = `
                <div class="talent-icon">${getTalentIcon(type)}</div>
                <div class="talent-info">
                    <div>${getTalentButtonText(type)}</div>
                    <div class="cooldown-bar"></div>
                </div>
            `;
            button.onclick = () => attack(type);
            elements.combatTalents.appendChild(button);
        }
    });
}

function startBattleTimer(seconds) {
    let timeLeft = seconds;
    elements.combatTimer.textContent = timeLeft;
    elements.combatTimer.style.color = 'white';

    gameState.battleTimer = setInterval(() => {
        timeLeft--;
        elements.combatTimer.textContent = timeLeft;
        elements.combatTimer.style.color = timeLeft <= 10 ? 'red' : 'white';

        if (timeLeft <= 0) {
            endBattle(false);
            elements.bossCombatImage.classList.add('grayscale');
        }
    }, 1000);
}

function attack(type) {
      if (!gameState.inBattle) return; // Если бой завершен - не даем атаковать
    if (!gameState.currentBoss || !gameState.inBattle || isAnimating) return;

    const attackButton = document.querySelector(`.attack-btn[data-type="${type}"]`);
    attackButton.classList.add('attacking');
    isAnimating = true;

    setTimeout(() => {
        attackButton.classList.remove('attacking');
        isAnimating = false;
    }, 200);

    let damage = 0;
    switch(type) {
        case 'basic':
            damage = calculateBasicDamage();
            break;
        case 'critical':
            if (Math.random() < gameState.talents.critical.chance) {
                damage = calculateCriticalDamage();
            } else {
                showMissEffect();
                return;
            }
            break;
        case 'poison':
            damage = gameState.talents.poison.damage * 3;
            applyPoisonEffect();
            break;
    }

    handleVampireEffect(damage);
    updateBossHealth(damage);
}

function applyPoisonEffect() {
    const poisonInterval = setInterval(() => {
        gameState.currentBoss.currentHealth -= gameState.talents.poison.damage;
        updateCombatUI();
    }, 1000);

    gameState.activeEffects.poison.push({
        interval: poisonInterval,
        duration: 3
    });

    setTimeout(() => clearInterval(poisonInterval), 3000);
}

function handleVampireEffect(damage) {
    if (gameState.talents.vampire.level > 0) {
        const heal = Math.floor(damage * gameState.talents.vampire.percent);
        gameState.energy = Math.min(gameState.energy + heal, gameState.maxEnergy);
        showHealEffect(heal);
        updateUI(['energy']);
    }
}

function updateBossHealth(damage) {
    gameState.currentBoss.currentHealth = Math.max(
        gameState.currentBoss.currentHealth - damage,
        0
    );
    updateCombatUI();

    if (gameState.currentBoss.currentHealth <= 0) {
        endBattle(true);
    }
}

function endBattle(victory) {
  gameState.inBattle = false; // Блокируем бой сразу
   document.querySelectorAll('.attack-btn').forEach(btn => btn.style.pointerEvents = 'none'); // Отключаем кнопки
    clearInterval(gameState.battleTimer);
    gameState.activeEffects.poison.forEach(effect => clearInterval(effect.interval));
    gameState.activeEffects.poison = [];

    if (victory) {
        const boss = gameConfig.bosses[gameState.currentBoss.type];
        const honeyReward = Math.floor(boss.honeyReward * gameState.boosts.battleBonus);
        const xpReward = Math.floor(boss.xpReward * (1 + gameState.level * 0.05));

        gameState.honey += honeyReward;
        gameState.xp += xpReward;

        checkLevelUp();
        updateUI(['honey', 'xp']);
        showBattleResult(`Победа! +${honeyReward}🍯 +${xpReward}XP`, 'victory');
        elements.bossCombatImage.classList.add('grayscale');
    } else {
        showBattleResult('Поражение!', 'defeat');
    }

    setTimeout(() => {
        document.getElementById('bossSelection').style.display = 'block';
        elements.combatScreen.style.display = 'none';
        gameState.inBattle = false;
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
        honey: () => elements.honey.textContent = Math.floor(gameState.honey),
        energy: () => {
            elements.energy.textContent = Math.floor(gameState.energy);
            elements.maxEnergy.textContent = gameState.maxEnergy;
        },
        level: () => {
            elements.level.textContent = gameState.level;
            elements.xp.textContent = Math.floor(gameState.xp);
            elements.xpToNextLevel.textContent = Math.floor(gameState.xpToNextLevel);
        },
        talents: () => {
            elements.basicLevel.textContent = gameState.talents.basic.level;
            elements.basicDmg.textContent = gameState.talents.basic.damage;
            elements.critLevel.textContent = gameState.talents.critical.level;
            elements.critChance.textContent = `${Math.round(gameState.talents.critical.chance * 100)}%`;
            elements.poisonLevel.textContent = gameState.talents.poison.level;
            elements.poisonDmg.textContent = gameState.talents.poison.damage;
            elements.vampireLevel.textContent = gameState.talents.vampire.level;
            elements.vampirePercent.textContent = `${Math.round(gameState.talents.vampire.percent * 100)}%`;
        }
    };

    changedKeys.includes('all')
        ? Object.values(updates).forEach(update => update())
        : changedKeys.forEach(key => updates[key]?.());
}

// =================== ВИЗУАЛЬНЫЕ ЭФФЕКТЫ ===================
function showLevelUpEffect(levels) {
    const div = document.createElement('div');
    div.className = 'level-up';
    div.textContent = `Уровень +${levels}!`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}

function showBattleResult(text, type) {
    const div = document.createElement('div');
    div.className = `battle-result ${type}`;
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function showMissEffect() {
    const div = document.createElement('div');
    div.className = 'miss-effect';
    div.textContent = 'Промах!';
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
        switch(type) {
            case 'basic':
                content = `<h3>Обычный</h3><p>${gameState.activeHive === type ? '✔️ Активен' : 'Нажмите чтобы активировать'}</p>`;
                break;
            case 'golden':
                content = `<h3>Золотой</h3><p>+15% скорости атак</p><p>${gameState.activeHive === type ? '✔️ Активен' : ''}</p>`;
                break;
            case 'crystal':
                content = `<h3>Кристальный</h3><p>+30% награды за бои</p><p>${gameState.activeHive === type ? '✔️ Активен' : ''}</p>`;
                break;
            case 'inferno':
                content = `<h3>🔥 Пламенный</h3><p>+25% к урону огнем</p><p>${gameState.activeHive === type ? '✔️ Активен' : ''}</p>`;
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
function calculateBasicDamage() {
    let damage = talentsConfig.basic.getDamage(gameState.talents.basic.level);
    damage *= gameState.boosts.attackSpeed;
    if (gameState.activeHive === 'inferno') damage *= 1.25;
    return Math.round(damage);
}

function calculateCriticalDamage() {
    return calculateBasicDamage() * 3;
}

function updateCombatUI(forceUpdate = false) {
    if (!gameState.currentBoss) return;
    const healthPercent = (gameState.currentBoss.currentHealth / gameState.currentBoss.maxHealth) * 100;
    elements.bossHealth.style.width = `${healthPercent}%`;
    elements.currentHealth.textContent = gameState.currentBoss.currentHealth;
}

function getTalentButtonText(type) {
    const texts = {
        basic: '🗡️ Базовый',
        critical: '💥 Крит',
        poison: '☠️ Яд',
        vampire: '❤️ Вампир'
    };
    return texts[type] || '';
}

function getTalentIcon(type) {
    const icons = {
        basic: '🗡️',
        critical: '💥',
        poison: '☠️',
        vampire: '❤️'
    };
    return icons[type] || '';
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
