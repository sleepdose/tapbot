const elements = {
    honey: document.getElementById('honey'),
    energy: document.getElementById('energy'),
    maxEnergy: document.getElementById('maxEnergy'),
    level: document.getElementById('level'),
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
    gameScreen: document.getElementById('gameScreen'),
    levelProgress: document.querySelector('.level-progress-bar'),
    combatTalents: document.getElementById('combatTalents'),
    combatScreen: document.getElementById('combatScreen')
};

const gameConfig = {
    bosses: {
        wasp: { health: 500, time: 60, reward: 1000 },
        bear: { health: 1000, time: 90, reward: 2000 }
    },
    hivePrices: { golden: 1500, crystal: 3000, inferno: 4500 },
    boostPrices: { energy: 1000, shield: 1200, multiclick: 800 }
};

class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.honey = 0;
        this.energy = 100;
        this.maxEnergy = 100;
        this.level = 1;
        this.baseLevelHoney = 500;
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
        this.activeEffects = [];
        this.currentBoss = null;
        this.battleTimer = null;
        this.energyRecoveryInterval = null;
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

function initGame() {
    if (!elements.levelProgress) {
        console.error('Элемент прогресса уровня не найден!');
        return;
    }

    document.getElementById('hive').addEventListener('click', handleHiveClick);
    document.querySelectorAll('.close').forEach(btn => btn.addEventListener('click', hideAllPopups));
    document.querySelector('.shop-tabs').addEventListener('click', handleShopTabs);
    document.getElementById('battlePopup').addEventListener('click', handleBossSelect);

    document.querySelectorAll('.controls .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const popupType = this.dataset.popup;
            showPopup(popupType);
        });
    });

    document.querySelectorAll('.shop-item button').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.closest('.shop-item').dataset.type;
            if (this.closest('#shopHives')) {
                buyHive(type);
            } else {
                buyBoost(type);
            }
        });
    });

    document.querySelectorAll('.talent button').forEach(btn => {
        btn.addEventListener('click', function() {
            const talentType = this.closest('.talent').dataset.talent;
            upgradeTalent(talentType);
        });
    });

    updateHiveDisplay();
    updateShopItems();
    updateUI();
    startEnergyRecovery();
}

function handleHiveClick() {
    if (gameState.energy <= 0) return;

    const hive = document.getElementById('hive');
    hive.classList.add('click-effect');
    setTimeout(() => hive.classList.remove('click-effect'), 300);

    const multiplier = gameState.boosts.multiclick ? 2 : 1;
    gameState.honey += 1 * multiplier;
    gameState.energy--;

    checkLevelUp();
    updateUI(['honey', 'energy']);
}

function handleShopTabs(e) {
    const tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;

    document.querySelectorAll('.shop-tab, .tab-btn').forEach(el => el.classList.remove('active'));
    tabBtn.classList.add('active');
    document.getElementById(`shop${tabBtn.dataset.tab.charAt(0).toUpperCase() + tabBtn.dataset.tab.slice(1)}`)
        .classList.add('active');
}

function handleBossSelect(e) {
    const bossCard = e.target.closest('.boss-card');
    if (bossCard) startBattle(bossCard.dataset.boss);
}

function buyHive(type) {
    if (!gameState.purchasedHives.includes(type) && gameState.honey >= gameConfig.hivePrices[type]) {
        gameState.honey -= gameConfig.hivePrices[type];
        gameState.purchasedHives.push(type);
        switchHive(type);
        updateHiveDisplay();
        updateShopItems();
        updateUI(['honey']);
    }
}

function buyBoost(type) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;

    if (gameState.honey >= gameConfig.boostPrices[type]) {
        gameState.honey -= gameConfig.boostPrices[type];
        button.disabled = true;
        button.textContent = 'Куплено';

        setTimeout(() => {
            button.disabled = false;
            button.textContent = `${gameConfig.boostPrices[type]} 🍯`;
        }, 5000);

        switch(type) {
            case 'energy':
                gameState.maxEnergy += 40;
                gameState.energy += 40;
                break;
            case 'shield':
                gameState.boosts.shield = true;
                break;
            case 'multiclick':
                gameState.boosts.multiclick = true;
                break;
        }
        updateUI(['honey']);
    }
}

function upgradeTalent(talentType) {
    const talent = talentsConfig[talentType];
    const currentLevel = gameState.talents[talentType].level;

    if (currentLevel >= talent.maxLevel) return;

    const cost = talent.getCost(currentLevel);
    if (gameState.honey < cost) return;

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
        const newCost = newLevel < talent.maxLevel
            ? Math.floor(talent.getCost(newLevel))
            : 'MAX';
        button.textContent = newLevel < talent.maxLevel ? `${newCost} 🍯` : 'MAX';
    }

    updateUI(['honey', 'talents']);
}

function checkLevelUp() {
    let levelsGained = 0;
    const maxPossibleLevel = Math.floor(gameState.honey / gameState.baseLevelHoney) + 1;

    while (gameState.level < maxPossibleLevel) {
        gameState.level++;
        levelsGained++;
    }

    if (levelsGained > 0) {
        showLevelUpEffect(levelsGained);
        updateLevelProgress();
        updateUI(['level']);
    } else {
        updateLevelProgress();
    }
}

function updateLevelProgress() {
    if (!elements.levelProgress) return;

    const currentLevel = gameState.level;
    const prevLevelHoney = gameState.baseLevelHoney * (currentLevel - 1);
    const neededHoney = gameState.baseLevelHoney * currentLevel;

    const honeyDiff = neededHoney - prevLevelHoney;
    if (honeyDiff <= 0) {
        elements.levelProgress.style.width = '0%';
        return;
    }

    const currentHoney = Math.max(0, gameState.honey - prevLevelHoney);
    let progress = (currentHoney / honeyDiff) * 100;
    progress = Math.max(0, Math.min(progress, 100));

    try {
        elements.levelProgress.style.width = `${progress}%`;
    } catch (e) {
        console.error('Ошибка обновления прогресса:', e);
    }
}

function startBattle(bossType) {
    if (!gameConfig.bosses[bossType] || gameState.inBattle) return;

    elements.bossHealth.style.transition = 'none';
    elements.bossHealth.style.width = '100%';

    gameState.inBattle = true;
    const boss = gameConfig.bosses[bossType];
    gameState.currentBoss = {
        ...boss,
        currentHealth: boss.health,
        maxHealth: boss.health
    };

    elements.currentHealth.textContent = boss.health;
    elements.maxHealth.textContent = boss.health;
    elements.combatTimer.textContent = boss.time;

    setTimeout(() => {
        elements.bossHealth.style.transition = 'width 0.3s';
        updateCombatUI(true);
    }, 50);

    createTalentButtons();
    showCombatScreen();
    startBattleTimer(boss.time);
}

function showCombatScreen() {
    hideAllPopups();
    elements.combatScreen.style.display = 'block';
}

function startBattleTimer(seconds) {
    let timeLeft = seconds;
    elements.combatTimer.textContent = timeLeft;

    gameState.battleTimer = setInterval(() => {
        timeLeft--;
        elements.combatTimer.textContent = timeLeft;

        if (timeLeft <= 0) {
            endBattle(false);
            showBattleResult('Время вышло! Поражение!');
        }
    }, 1000);
}

function createTalentButtons() {
    elements.combatTalents.innerHTML = '';
    Object.entries(gameState.talents).forEach(([type, talent]) => {
        if (talent.level > 0) {
            const button = document.createElement('button');
            button.className = 'attack-btn';
            button.textContent = getTalentButtonText(type);
            button.onclick = () => attack(type);
            elements.combatTalents.appendChild(button);
        }
    });
}

function getTalentButtonText(type) {
    switch(type) {
        case 'basic': return '🗡️ Базовый';
        case 'critical': return '💥 Крит';
        case 'poison': return '☠️ Яд';
        case 'vampire': return '❤️ Вампир';
        default: return '';
    }
}

function attack(type) {
    if (!gameState.currentBoss || !gameState.inBattle) return;

    let damage = 0;
    let bossReward = 0;

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
            const poisonInterval = setInterval(() => {
                gameState.currentBoss.currentHealth -= gameState.talents.poison.damage;
                updateCombatUI();
            }, 1000);
            gameState.activeEffects.push({
                type: 'poison',
                interval: poisonInterval,
                duration: 3
            });
            setTimeout(() => clearInterval(poisonInterval), 3000);
            break;
    }

    if (gameState.talents.vampire.level > 0) {
        const heal = Math.floor(damage * gameState.talents.vampire.percent);
        gameState.energy = Math.min(gameState.energy + heal, gameState.maxEnergy);
        updateUI(['energy']);
    }

    gameState.currentBoss.currentHealth = Math.max(gameState.currentBoss.currentHealth - damage, 0);
    updateCombatUI();

    if (gameState.currentBoss.currentHealth <= 0) {
        bossReward = gameState.currentBoss.reward;
        const bonusMultiplier = gameState.boosts.battleBonus;
        const totalReward = Math.floor(bossReward * bonusMultiplier);

        endBattle(true);

        gameState.honey += totalReward;
        checkLevelUp();
        showBattleResult(`Победа! Получено ${totalReward} 🍯`);
        updateUI(['honey', 'level']);
    }
}

function endBattle(victory) {
    clearInterval(gameState.battleTimer);
    gameState.activeEffects.forEach(effect => {
        if (effect.interval) clearInterval(effect.interval);
    });
    gameState.activeEffects = [];
    gameState.inBattle = false;

    setTimeout(() => {
        gameState.currentBoss = null;
        elements.combatScreen.style.display = 'none';
    }, 100);
}

function updateUI(changedKeys = ['all']) {
    const updates = {
        honey: () => elements.honey.textContent = Math.floor(gameState.honey),
        energy: () => {
            elements.energy.textContent = Math.floor(gameState.energy);
            elements.maxEnergy.textContent = gameState.maxEnergy;
        },
        level: () => {
            elements.level.textContent = gameState.level;
            updateLevelProgress();
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

    if (changedKeys.includes('all')) {
        Object.values(updates).forEach(update => update());
    } else {
        changedKeys.forEach(key => updates[key]?.());
    }
}

function showPopup(popupType) {
    const popupId = `${popupType}Popup`;
    const popup = document.getElementById(popupId);
    if (!popup) return;

    hideAllPopups();
    popup.style.display = 'block';
    document.body.classList.add('popup-open');
}

function hideAllPopups() {
    document.querySelectorAll('.popup').forEach(p => p.style.display = 'none');
    document.body.classList.remove('popup-open');
}

function updateHiveDisplay() {
    const selector = document.querySelector('.hive-selector');
    selector.innerHTML = '';

    gameState.purchasedHives.forEach(type => {
        const div = document.createElement('div');
        div.className = `hive-option ${type === gameState.activeHive ? 'active' : ''}`;
        div.dataset.type = type;
        div.onclick = () => switchHive(type);

        let content = '';
        switch(type) {
            case 'basic': content = '<h3>Обычный</h3><p>Без бонусов</p>'; break;
            case 'golden': content = '<h3>Золотой</h3><p>+15% скорости атак</p>'; break;
            case 'crystal': content = '<h3>Кристальный</h3><p>+30% награды за бои</p>'; break;
            case 'inferno': content = '<h3>🔥 Пламенный</h3><p>+25% к урону огнем</p>'; break;
        }

        div.innerHTML = content;
        selector.appendChild(div);
    });
}

function updateShopItems() {
    document.querySelectorAll('.shop-item').forEach(item => {
        const type = item.dataset.type;
        if (type && gameState.purchasedHives.includes(type)) {
            item.classList.add('disabled');
            item.querySelector('button').disabled = true;
            item.querySelector('button').textContent = 'Куплено';
        }
    });
}

function switchHive(type) {
    if (gameState.purchasedHives.includes(type)) {
        gameState.activeHive = type;
        gameState.boosts.attackSpeed = type === 'golden' ? 1.15 : 1.0;
        gameState.boosts.battleBonus = type === 'crystal' ? 1.3 : 1.0;
        updateUI();
    }
}

function startEnergyRecovery() {
    if (gameState.energyRecoveryInterval) return;

    gameState.energyRecoveryInterval = setInterval(() => {
        if (gameState.energy < gameState.maxEnergy) {
            gameState.energy = Math.min(gameState.energy + 1, gameState.maxEnergy);
            updateUI(['energy']);
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

function showBattleResult(text) {
    const div = document.createElement('div');
    div.className = 'battle-result';
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

    if(forceUpdate) {
        elements.bossHealth.style.width = `${healthPercent}%`;
        elements.bossHealth.offsetHeight;
    }

    elements.bossHealth.style.width = `${healthPercent}%`;
    elements.currentHealth.textContent = gameState.currentBoss.currentHealth;
}

window.addEventListener('load', () => {
    preloadResources().then(() => {
        document.getElementById('preloader').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        initGame();
    });
});

function preloadResources() {
    return new Promise((resolve) => {
        const images = [
            'img/human_male.png',
            'img/golden_hive.png',
            'img/crystal_hive.png',
            'img/inferno_hive.png'
        ];
        let loaded = 0;

        images.forEach(img => {
            const image = new Image();
            image.src = img;
            image.onload = () => {
                loaded++;
                if (loaded === images.length) resolve();
            };
            image.onerror = () => {
                loaded++;
                if (loaded === images.length) resolve();
            };
        });
    });
}
