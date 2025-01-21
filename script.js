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
    boostPrices: { energy: 1000, shield: 1200, multiclick: 800 },
    baseEnergyRegen: 2000
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
        this.nextLevelHoney = 500;
        this.purchasedHives = ['basic'];
        this.activeHive = 'basic';
        this.inBattle = false;
        this.talents = {
            basic: { level: 1, cost: 75 },
            critical: { level: 0, cost: 150 },
            poison: { level: 0, cost: 200 },
            vampire: { level: 0, cost: 500 }
        };
        this.boosts = {
            battleBonus: 1.0,
            attackSpeed: 1.0,
            shield: false,
            multiclick: false
        };
        this.activeEffects = [];
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
const resources = {
    images: [
        'human_male.png',
        'golden_hive.png',
        'crystal_hive.png',
        'inferno_hive.png'
    ]
};

function preloadResources() {
    return new Promise((resolve, reject) => {
        let loaded = 0;
        const total = resources.images.length;

        if(total === 0) resolve();

        resources.images.forEach(img => {
            const image = new Image();
            image.src = img;
            image.onload = () => {
                loaded++;
                updateLoaderProgress(loaded, total);
                if(loaded === total) resolve();
            };
            image.onerror = () => {
                console.error(`Ошибка загрузки: ${img}`);
                loaded++;
                if(loaded === total) resolve();
            };
        });
    });
}

function updateLoaderProgress(loaded, total) {
    const progress = Math.round((loaded / total) * 100);
    document.querySelector('.loader p').textContent = `Загрузка: ${progress}%`;
}

function initGame() {
    try {
        const hiveElement = document.getElementById('hive');
        hiveElement.replaceWith(hiveElement.cloneNode(true));

        document.getElementById('hive').addEventListener('click', handleHiveClick);

        if (gameState.energyInterval) clearInterval(gameState.energyInterval);

        gameState.energyInterval = setInterval(() => {
            if (gameState.energy < gameState.maxEnergy) {
                gameState.energy++;
                updateUI(['energy']);
            }
        }, gameState.boosts.speed ? 1000 : 2000);

        gameState.reset();
        updateUI();
        updateHiveDisplay();
    } catch (error) {
        console.error('Ошибка инициализации игры:', error);
    }
}

function handleHiveClick() {
    const hive = document.getElementById('hive');
    hive.classList.add('click-effect');
    setTimeout(() => hive.classList.remove('click-effect'), 100);

    if (gameState.energy > 0) {
        const honeyMultiplier = gameState.boosts.multiclick ? 2 : 1;
        gameState.honey += 1 * honeyMultiplier;
        gameState.energy--;
        checkLevelUp();
        updateUI(['honey', 'energy', 'level']);
    }
}

function checkLevelUp() {
    const progress = Math.min((gameState.honey / gameState.nextLevelHoney) * 100, 100);
    elements.levelProgress.style.width = `${progress}%`;

    if (gameState.honey >= gameState.nextLevelHoney) {
        gameState.level++;
        gameState.nextLevelHoney = Math.floor(gameState.nextLevelHoney * 1.5);
        showLevelUpEffect();
        updateUI(['level']);
    }
}

function startBattle(bossType) {
    const boss = gameConfig.bosses[bossType];
    gameState.inBattle = true;
    gameState.currentBoss = {
        ...boss,
        currentHealth: boss.health,
        maxHealth: boss.health
    };

    elements.currentHealth.textContent = boss.health;
    elements.maxHealth.textContent = boss.health;
    createTalentButtons();
    showCombatScreen();
    startBattleTimer(boss.time);
}

function createTalentButtons() {
    elements.combatTalents.innerHTML = '';
    Object.entries(gameState.talents).forEach(([key, talent]) => {
        if(talent.level > 0) {
            const button = document.createElement('button');
            button.className = 'attack-btn';
            button.onclick = () => attack(key);

            switch(key) {
                case 'basic': button.innerHTML = '🗡️ Базовый'; break;
                case 'critical': button.innerHTML = '💥 Крит'; break;
                case 'poison': button.innerHTML = '☠️ Яд'; break;
                case 'vampire': button.innerHTML = '❤️ Вампир'; break;
            }

            elements.combatTalents.appendChild(button);
        }
    });
}

function startBattleTimer(seconds) {
    let timeLeft = seconds;
    updateTimer(timeLeft);

    gameState.battleTimer = setInterval(() => {
        timeLeft--;
        updateTimer(timeLeft);

        if (timeLeft <= 0) {
            endBattle(false);
            showBattleResult('Время вышло! Поражение!');
        }
    }, 1000);
}

function attack(type) {
    const button = event.target;
    button.classList.add('attack-pulse');
    setTimeout(() => button.classList.remove('attack-pulse'), 200);

    let damage = 0;
    switch (type) {
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
            damage = gameState.talents.poison.damage;
            gameState.activeEffects.push({
                type: 'poison',
                damage: damage,
                duration: 3
            });
            break;
    }

    if (gameState.talents.vampire.level > 0) {
        const heal = damage * gameState.talents.vampire.percent;
        gameState.energy = Math.min(gameState.energy + heal, gameState.maxEnergy);
    }

    gameState.currentBoss.currentHealth -= damage;
    updateCombatUI();

    if (gameState.currentBoss.currentHealth <= 0) {
        endBattle(true);
        const reward = Math.floor(gameState.currentBoss.reward * gameState.boosts.battleBonus);
        showBattleResult(`Победа! Получено ${reward} 🍯`);
    }
}

function endBattle(victory) {
    clearInterval(gameState.battleTimer);
    gameState.inBattle = false;

    if (victory) {
        const baseReward = gameState.currentBoss.reward;
        const totalReward = Math.floor(baseReward * gameState.boosts.battleBonus);
        gameState.honey += totalReward;
        checkLevelUp();
    }

    gameState.currentBoss = null;
    elements.combatScreen.style.display = 'none';
    updateUI();
}

function buyHive(type) {
    if (!gameState.purchasedHives.includes(type) && gameState.honey >= gameConfig.hivePrices[type]) {
        gameState.honey -= gameConfig.hivePrices[type];
        gameState.purchasedHives.push(type);
        updateHiveDisplay();
        updateUI(['honey']);
    }
}

function switchHive(type) {
    if (gameState.purchasedHives.includes(type)) {
        gameState.activeHive = type;
        gameState.boosts = {
            battleBonus: 1.0,
            attackSpeed: 1.0,
            shield: false,
            multiclick: false
        };

        let hiveName = '';
        let bonusText = '';
        switch(type) {
            case 'golden':
                gameState.boosts.attackSpeed = 1.15;
                hiveName = 'Золотой';
                bonusText = '+15% скорости атак';
                break;
            case 'crystal':
                gameState.boosts.battleBonus = 1.3;
                hiveName = 'Кристальный';
                bonusText = '+30% награды за бои';
                break;
            case 'inferno':
                gameState.boosts.fireDamage = 1.25;
                hiveName = '🔥 Пламенный';
                bonusText = '+25% к урону огнем';
                break;
            default:
                hiveName = 'Обычный';
                bonusText = 'Без специальных бонусов';
        }

        elements.activeHiveName.textContent = hiveName;
        elements.activeHiveBonus.textContent = bonusText;
        updateHiveDisplay();
        hidePopup('hives');
        updateUI();
    }
}

function updateHiveDisplay() {
    const hiveSelector = document.querySelector('.hive-selector');
    hiveSelector.innerHTML = '';

    if (gameState.purchasedHives.length === 0) {
        hiveSelector.innerHTML = '<p>Купите улей в магазине!</p>';
        return;
    }

    gameState.purchasedHives.forEach(hive => {
        const div = document.createElement('div');
        div.className = `hive-option ${hive === gameState.activeHive ? 'active' : ''}`;
        div.onclick = () => switchHive(hive);

        let content = '';
        switch(hive) {
            case 'basic': content = '<h3>Обычный</h3><p>Без бонусов</p>'; break;
            case 'golden': content = '<h3>Золотой</h3><p>+15% скорости атак</p>'; break;
            case 'crystal': content = '<h3>Кристальный</h3><p>+30% награды за бои</p>'; break;
            case 'inferno': content = '<h3>🔥 Пламенный</h3><p>+25% к урону огнем</p>'; break;
        }

        div.innerHTML = content;
        hiveSelector.appendChild(div);
    });
}

function buyBoost(type) {
    if (gameState.honey >= gameConfig.boostPrices[type]) {
        gameState.honey -= gameConfig.boostPrices[type];

        switch(type) {
            case 'energy':
                gameState.maxEnergy += 40;
                gameState.energy += 40;
                break;
            case 'shield':
                gameState.boosts.shield = true;
                break;
            case 'multiclick':
                gameState.activeEffects.push({
                    type: 'multiclick',
                    duration: 30
                });
                break;
        }
        updateUI();
    }
}

function upgradeTalent(type) {
    const config = talentsConfig[type];
    const talent = gameState.talents[type];

    if (!config || talent.level >= config.maxLevel) return;

    const cost = Math.floor(config.getCost(talent.level));
    if (gameState.honey < cost) {
        showErrorEffect('Недостаточно мёда!');
        return;
    }

    gameState.honey -= cost;
    talent.level++;
    talent.cost = Math.floor(config.getCost(talent.level));

    switch(type) {
        case 'critical':
            talent.chance = config.getChance(talent.level);
            break;
        case 'poison':
            talent.damage = config.getDamage(talent.level);
            break;
        case 'vampire':
            talent.percent = config.getPercent(talent.level);
            break;
    }
    updateUI(['talents']);
}

const UIUpdateMap = {
    honey: value => elements.honey.textContent = value,
    energy: value => {
        elements.energy.textContent = value;
        elements.maxEnergy.textContent = gameState.maxEnergy;
    },
    level: value => {
        elements.level.textContent = value;
        elements.levelProgress.style.width =
            `${Math.min((gameState.honey / gameState.nextLevelHoney) * 100, 100)}%`;
    },
    talents: () => {
        elements.basicLevel.textContent = gameState.talents.basic.level;
        elements.basicDmg.textContent = calculateBasicDamage();
        elements.critLevel.textContent = gameState.talents.critical.level;
        elements.critChance.textContent = Math.round(gameState.talents.critical.chance * 100);
        elements.poisonLevel.textContent = gameState.talents.poison.level;
        elements.poisonDmg.textContent = gameState.talents.poison.damage;
        elements.vampireLevel.textContent = gameState.talents.vampire.level;
        elements.vampirePercent.textContent = Math.round(gameState.talents.vampire.percent * 100);
    }
};

function updateUI(changedKeys = ['all']) {
    if (changedKeys.includes('all')) {
        Object.keys(UIUpdateMap).forEach(key => UIUpdateMap[key](gameState[key]));
        return;
    }

    changedKeys.forEach(key => UIUpdateMap[key]?.(gameState[key]));
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

function updateTimer(time) {
    elements.combatTimer.textContent = time;
}

function updateCombatUI() {
    const healthPercent = (gameState.currentBoss.currentHealth / gameState.currentBoss.maxHealth) * 100;
    elements.bossHealth.style.width = `${healthPercent}%`;
    elements.currentHealth.textContent = gameState.currentBoss.currentHealth;
}

function showCombatScreen() {
    hideAllPopups();
    elements.combatScreen.style.display = 'block';
    updateCombatUI();
}

function showPopup(type) {
    hideAllPopups();
    const popup = document.getElementById(`${type}Popup`);
    popup.style.display = 'block';

    if (window.innerWidth <= 480) {
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
    }

    if (type === 'hives') updateHiveDisplay();
}

function hidePopup(type) {
    document.getElementById(`${type}Popup`).style.display = 'none';
}

function hideAllPopups() {
    document.querySelectorAll('.popup').forEach(p => p.style.display = 'none');
}

function showBattleResult(text) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'battle-result';
    resultDiv.textContent = text;
    document.body.appendChild(resultDiv);
    setTimeout(() => resultDiv.remove(), 3000);
}

function showMissEffect() {
    const missDiv = document.createElement('div');
    missDiv.className = 'miss-effect';
    missDiv.textContent = 'Промах!';
    elements.combatScreen.appendChild(missDiv);
    setTimeout(() => missDiv.remove(), 1000);
}

function showLevelUpEffect() {
    const levelUpDiv = document.createElement('div');
    levelUpDiv.className = 'level-up';
    levelUpDiv.textContent = `Уровень ${gameState.level}!`;
    document.body.appendChild(levelUpDiv);
    setTimeout(() => levelUpDiv.remove(), 2000);
}

function showErrorEffect(text) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = text;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 1500);
}

function showShopTab(tabName) {
    document.querySelectorAll('.shop-tab').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`shop${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).style.display = 'block';
    event.target.classList.add('active');
}

window.addEventListener('load', () => {
    preloadResources()
        .then(() => {
            document.getElementById('preloader').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('preloader').style.display = 'none';
                document.getElementById('gameScreen').style.display = 'block';
                initGame();
            }, 500);
        })
        .catch(error => {
            console.error('Ошибка загрузки:', error);
            document.querySelector('.loader p').textContent =
                'Ошибка загрузки ресурсов. Попробуйте перезагрузить страницу.';
            document.querySelector('.honeycomb').style.display = 'none';
        });
});

window.onclick = function(e) {
    if (e.target.classList.contains('popup')) {
        hideAllPopups();
    }
};

setInterval(() => {
    gameState.activeEffects = gameState.activeEffects.filter(effect => {
        effect.duration--;
        if(effect.duration <= 0) return false;

        switch(effect.type) {
            case 'multiclick':
                gameState.boosts.multiclick = true;
                break;
            case 'poison':
                gameState.currentBoss.currentHealth -= effect.damage;
                updateCombatUI();
                break;
        }
        return true;
    });

    if (!gameState.activeEffects.some(e => e.type === 'multiclick')) {
        gameState.boosts.multiclick = false;
    }
}, 1000);
