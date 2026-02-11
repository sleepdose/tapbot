// ============================
// ИНИЦИАЛИЗАЦИЯ TELEGRAM И FIREBASE
// ============================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// 🔧 ТВОИ ДАННЫЕ FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAhzdARqvqC4a6zCaXUVoO9Ij94mtoNha0",
    authDomain: "hiko-ca02d.firebaseapp.com",
    projectId: "hiko-ca02d",
    storageBucket: "hiko-ca02d.firebasestorage.app",
    messagingSenderId: "100480722325",
    appId: "1:100480722325:web:781a1fb54807b047e1829c",
    measurementId: "G-3E97NRDJTD"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

const userId = tg.initDataUnsafe.user?.id.toString() || 'test_user_' + Date.now();
const userName = tg.initDataUnsafe.user?.first_name || 'Игрок';

// ============================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================
let currentUser = null;
let currentGuild = null;
let guildListener = null;
let battleListener = null;
let battleTimerInterval = null;
let selectedTalent = null;
let currentCustomizationSlot = 'hat'; // выбранный слот во вкладке персонажа

// ============================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================
async function getUserData(forceRefresh = false) {
    if (currentUser && !forceRefresh) return currentUser;
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    if (!doc.exists) {
        const newUser = {
            id: userId,
            name: userName,
            energy: 100,
            maxEnergy: 100,
            money: 500,
            lastEnergyUpdate: Date.now(),
            equipped: { hat: null, shirt: null, jeans: null, boots: null },
            pets: [],
            talents: [],
            inventory: [],
            guildId: null,
            friends: [],
            pendingRequests: []
        };
        await userRef.set(newUser);
        currentUser = newUser;
    } else {
        currentUser = doc.data();
        const now = Date.now();
        const delta = Math.floor((now - currentUser.lastEnergyUpdate) / 1000);
        currentUser.energy = Math.min(currentUser.maxEnergy, currentUser.energy + delta);
        currentUser.lastEnergyUpdate = now;
        await userRef.update({ energy: currentUser.energy, lastEnergyUpdate: now });
    }
    return currentUser;
}

async function updateUser(updates) {
    const userRef = db.collection('users').doc(userId);
    await userRef.update(updates);
    Object.assign(currentUser, updates);
    updateMainUI();
}

// ============================
// ГЛАВНЫЙ ЭКРАН
// ============================
function updateMainUI() {
    if (!currentUser) return;
    document.getElementById('money').innerText = currentUser.money;
    document.getElementById('energy-display').innerText = `⚡ ${currentUser.energy}/${currentUser.maxEnergy}`;

    const eqLayer = document.getElementById('equipment-layer');
    eqLayer.innerHTML = '';
    const slots = ['hat', 'shirt', 'jeans', 'boots'];
    slots.forEach(slot => {
        if (currentUser.equipped[slot]) {
            const img = document.createElement('img');
            img.src = currentUser.equipped[slot].imageUrl;
            img.style.zIndex = 2;
            img.classList.add(slot);
            eqLayer.appendChild(img);
        }
    });

    const petLayer = document.getElementById('pet-layer');
    petLayer.innerHTML = '';
    if (currentUser.pets.length > 0) {
        const activePet = currentUser.pets[0];
        const img = document.createElement('img');
        img.src = activePet.imageUrl;
        petLayer.appendChild(img);
    }
}

// ============================
// МАСТЕРСКАЯ – ПОКУПКИ, ПИТОМЦЫ, ТАЛАНТЫ
// ============================
async function loadShop() {
    try {
        const clothesSnap = await db.collection('shop_items').where('type', '==', 'clothes').get();
        renderClothesShop(clothesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const petsSnap = await db.collection('shop_items').where('type', '==', 'pet').get();
        renderPetsShop(petsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const talentsSnap = await db.collection('shop_items').where('type', '==', 'talent').get();
        renderTalentsShop(talentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
        tg.showPopup({ title: 'Ошибка', message: 'Не удалось загрузить магазин' });
    }
}

function renderClothesShop(items) {
    const container = document.getElementById('shop-clothes');
    if (!container) return;
    container.innerHTML = items.map(item => `
        <div class="item-card">
            <img src="${item.imageUrl}" alt="${item.name}">
            <span>${item.name}</span>
            <span>${item.price} 🪙</span>
            <button onclick="buyItem('${item.id}')">Купить</button>
        </div>
    `).join('');
}

function renderPetsShop(items) {
    const container = document.getElementById('shop-pets');
    if (!container) return;
    container.innerHTML = items.map(item => `
        <div class="item-card">
            <img src="${item.imageUrl}" alt="${item.name}">
            <span>${item.name}</span>
            <span>${item.price} 🪙</span>
            <button onclick="buyItem('${item.id}')">Купить</button>
        </div>
    `).join('');
}

function renderTalentsShop(items) {
    const container = document.getElementById('shop-talents');
    if (!container) return;
    container.innerHTML = items.map(item => `
        <div class="item-card">
            <img src="${item.imageUrl}" alt="${item.name}">
            <span>${item.name}</span>
            <span>${item.price} 🪙</span>
            <button onclick="buyItem('${item.id}')">Купить</button>
        </div>
    `).join('');
}

async function buyItem(itemId) {
    const user = await getUserData();
    const itemDoc = await db.collection('shop_items').doc(itemId).get();
    if (!itemDoc.exists) {
        tg.showPopup({ title: 'Ошибка', message: 'Товар не найден' });
        return;
    }
    const item = itemDoc.data();
    if (user.money < item.price) {
        tg.showPopup({ title: 'Ошибка', message: 'Недостаточно денег!' });
        return;
    }
    if (item.type === 'talent') {
        if (user.talents.some(t => t.id === item.id)) {
            tg.showPopup({ title: 'Уже есть', message: 'Этот талант уже изучен' });
            return;
        }
    }
    const newMoney = user.money - item.price;
    if (item.type === 'talent') {
        user.talents.push({ id: item.id, name: item.name, damage: item.damage || 10 });
        await updateUser({ money: newMoney, talents: user.talents });
    } else {
        const inventoryItem = {
            id: item.id,
            ...item,
            instanceId: Date.now() + Math.random()
        };
        user.inventory.push(inventoryItem);
        await updateUser({ money: newMoney, inventory: user.inventory });
    }
    loadShop();
    tg.showPopup({ title: 'Успех', message: 'Покупка совершена!' });
}

// ============================
// КАСТОМИЗАЦИЯ ПЕРСОНАЖА (ВКЛАДКА "ПЕРСОНАЖ")
// ============================
async function loadCharacterCustomization() {
    const user = await getUserData();
    const container = document.getElementById('tab-character');
    if (!container) return;

    container.innerHTML = `
        <div class="customization-preview">
            <div id="char-preview-container" class="character-preview">
                <img id="preview-base" src="img/character.png" alt="Персонаж">
                <div id="preview-equipment"></div>
                <div id="preview-pet"></div>
            </div>
        </div>
        <div class="slot-selector">
            <button class="slot-btn ${currentCustomizationSlot === 'hat' ? 'active' : ''}" data-slot="hat">🎩 Голова</button>
            <button class="slot-btn ${currentCustomizationSlot === 'shirt' ? 'active' : ''}" data-slot="shirt">👕 Туловище</button>
            <button class="slot-btn ${currentCustomizationSlot === 'jeans' || currentCustomizationSlot === 'boots' ? 'active' : ''}" data-slot="legs">👖 Ноги</button>
        </div>
        <div id="slot-items" class="items-grid"></div>
    `;

    updatePreviewCharacter(user);

    document.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const slot = e.target.dataset.slot;
            if (slot === 'legs') {
                currentCustomizationSlot = 'legs';
                renderItemsForSlot('legs');
            } else {
                currentCustomizationSlot = slot;
                renderItemsForSlot(slot);
            }
        });
    });

    renderItemsForSlot('hat');
}

function updatePreviewCharacter(user) {
    const eqLayer = document.getElementById('preview-equipment');
    if (!eqLayer) return;
    eqLayer.innerHTML = '';
    const slots = ['hat', 'shirt', 'jeans', 'boots'];
    slots.forEach(slot => {
        if (user.equipped[slot]) {
            const img = document.createElement('img');
            img.src = user.equipped[slot].imageUrl;
            img.classList.add(slot);
            eqLayer.appendChild(img);
        }
    });
}

async function renderItemsForSlot(slot) {
    const user = await getUserData();
    const container = document.getElementById('slot-items');
    if (!container) return;

    let items = [];
    if (slot === 'legs') {
        items = user.inventory.filter(i => i.type === 'clothes' && (i.slot === 'jeans' || i.slot === 'boots'));
    } else {
        items = user.inventory.filter(i => i.type === 'clothes' && i.slot === slot);
    }

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-msg">Нет предметов для этого слота</p>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="item-card">
            <img src="${item.imageUrl}" alt="${item.name}">
            <span>${item.name}</span>
            <button onclick="equipFromCustomization('${item.instanceId}', '${item.slot}')">Экипировать</button>
        </div>
    `).join('');
}

window.equipFromCustomization = async function(instanceId, slot) {
    const user = await getUserData();
    const item = user.inventory.find(i => i.instanceId === instanceId);
    if (!item) return;

    const updates = {};
    updates.equipped = { ...user.equipped, [slot]: item };
    await updateUser(updates);

    updatePreviewCharacter(user);
    updateMainUI();
    renderItemsForSlot(currentCustomizationSlot);
};

// ============================
// ПИТОМЦЫ
// ============================
async function loadInventoryPets() {
    const user = await getUserData();
    const petsInInventory = user.inventory.filter(i => i.type === 'pet');
    const container = document.getElementById('inventory-pets');
    if (!container) return;
    container.innerHTML = petsInInventory.map(item => `
        <div class="item-card">
            <img src="${item.imageUrl}" alt="${item.name}">
            <span>${item.name}</span>
            <button onclick="activatePet('${item.instanceId}')">Сделать активным</button>
        </div>
    `).join('');
}

window.activatePet = async function(instanceId) {
    const user = await getUserData();
    const pet = user.inventory.find(i => i.instanceId === instanceId);
    if (!pet) return;
    user.pets = [pet];
    await updateUser({ pets: user.pets });
    updateMainUI();
    updatePreviewCharacter(user);
};

// ============================
// ТАЛАНТЫ И КРАФТ
// ============================
async function loadTalentsUI() {
    const user = await getUserData();
    const container = document.getElementById('my-talents');
    if (!container) return;
    container.innerHTML = user.talents.map(t => `
        <div class="talent-badge">
            <span>✨ ${t.name || t.id}</span>
        </div>
    `).join('') || '<p>У вас пока нет талантов</p>';
}

async function loadCraftUI() {
    const user = await getUserData();
    const container = document.getElementById('craft-section');
    if (!container) return;
    const recipesSnap = await db.collection('recipes').get();
    const recipes = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = recipes.map(recipe => {
        const hasAll = recipe.requires.every(r => user.talents.some(t => t.id === r));
        return `
            <div class="craft-card ${hasAll ? 'available' : 'locked'}">
                <span>🔮 ${recipe.name || recipe.result}</span>
                <small>Требует: ${recipe.requires.join(', ')}</small>
                ${hasAll ? `<button onclick="craftTalent('${recipe.id}')">Создать</button>` : '<span>❌ Нет ресурсов</span>'}
            </div>
        `;
    }).join('');
}

window.craftTalent = async function(recipeId) {
    const user = await getUserData();
    const recipeDoc = await db.collection('recipes').doc(recipeId).get();
    if (!recipeDoc.exists) return;
    const recipe = recipeDoc.data();
    const hasAll = recipe.requires.every(r => user.talents.some(t => t.id === r));
    if (hasAll && !user.talents.some(t => t.id === recipe.result)) {
        const newTalent = { id: recipe.result, name: recipe.name || recipe.result, damage: recipe.damage || 15 };
        user.talents.push(newTalent);
        await updateUser({ talents: user.talents });
        loadTalentsUI();
        loadCraftUI();
        tg.showPopup({ title: 'Успех', message: `Вы скрафтили ${recipe.name || recipe.result}!` });
    } else {
        tg.showPopup({ title: 'Ошибка', message: 'Не хватает талантов или уже есть.' });
    }
};

// ============================
// ГИЛЬДИИ
// ============================
async function loadGuildScreen() {
    const user = await getUserData(true);
    const container = document.getElementById('guild-view');
    if (!container) return;

    if (!user.guildId) {
        const guildsSnap = await db.collection('guilds').get();
        const guilds = guildsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        container.innerHTML = `
            <h2>🏰 Гильдии</h2>
            <div class="guild-list">
                ${guilds.length ? guilds.map(g => `
                    <div class="guild-card">
                        <h3>${g.name}</h3>
                        <p>${g.description || ''}</p>
                        <p>👥 ${g.members?.length || 0} участников</p>
                        <p>🏆 Уровень ${g.level || 1}</p>
                        <button onclick="joinGuild('${g.id}')">Вступить</button>
                    </div>
                `).join('') : '<p>Гильдий пока нет</p>'}
            </div>
            <button id="create-guild-btn" class="glow-button" style="margin-top:20px;">✨ Создать гильдию</button>
        `;
        document.getElementById('create-guild-btn').onclick = () => {
            const name = prompt('Название гильдии');
            const desc = prompt('Описание');
            if (name && desc) createGuild(name, desc);
        };
    } else {
        const guildDoc = await db.collection('guilds').doc(user.guildId).get();
        if (!guildDoc.exists) {
            await updateUser({ guildId: null });
            loadGuildScreen();
            return;
        }
        const guild = { id: guildDoc.id, ...guildDoc.data() };
        currentGuild = guild;
        renderGuildPage(guild);
        if (guildListener) guildListener();
        guildListener = db.collection('guilds').doc(user.guildId).onSnapshot(doc => {
            if (doc.exists) {
                currentGuild = { id: doc.id, ...doc.data() };
                renderGuildPage(currentGuild);
            }
        });
    }
}

async function createGuild(name, description) {
    const user = await getUserData();
    const newGuild = {
        name,
        description,
        leaderId: userId,
        members: [userId],
        level: 1,
        rating: 0,
        bossId: 'boss1',
        bossHp: 1000,
        maxBossHp: 1000,
        battleActive: false,
        battleEndTime: null,
        keys: { boss2: 0 }
    };
    try {
        const docRef = await db.collection('guilds').add(newGuild);
        await updateUser({ guildId: docRef.id });
        await getUserData(true);
        loadGuildScreen();
        tg.showPopup({ title: 'Гильдия создана', message: `Добро пожаловать в ${name}!` });
    } catch (e) {
        tg.showPopup({ title: 'Ошибка', message: 'Не удалось создать гильдию. Попробуйте позже.' });
    }
}

async function joinGuild(guildId) {
    const user = await getUserData();
    const guildRef = db.collection('guilds').doc(guildId);
    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw 'Гильдия не найдена';
            const members = guildDoc.data().members || [];
            if (members.includes(userId)) throw 'Уже в гильдии';
            members.push(userId);
            transaction.update(guildRef, { members });
        });
        await updateUser({ guildId });
        await getUserData(true);
        loadGuildScreen();
    } catch (e) {
        tg.showPopup({ title: 'Ошибка', message: e.toString() });
    }
}

function renderGuildPage(guild) {
    const container = document.getElementById('guild-view');
    const isLeader = guild.leaderId === userId;

    const bosses = ['boss1', 'boss2'];
    const currentBossIndex = bosses.indexOf(guild.bossId);
    const nextBoss = bosses[(currentBossIndex + 1) % bosses.length];
    const prevBoss = bosses[(currentBossIndex - 1 + bosses.length) % bosses.length];

    const keysDisplay = guild.bossId === 'boss2'
        ? `<div class="boss-keys">🔑 Ключи: ${guild.keys?.boss2 || 0} / 3</div>`
        : '';

    container.innerHTML = `
        <h1 id="guild-title" style="cursor: pointer;">🏰 ${guild.name} (ур. ${guild.level})</h1>
        <div id="guild-info-panel" class="guild-info-panel hidden">
            <h3>📋 Информация о гильдии</h3>
            <p><strong>Название:</strong> ${guild.name}</p>
            <p><strong>Уровень:</strong> ${guild.level}</p>
            <p><strong>Описание:</strong> ${guild.description || '—'}</p>
            <p><strong>Лидер:</strong> ${guild.leaderId}</p>
            <h4>Участники (${guild.members?.length || 0})</h4>
            <ul class="member-list">
                ${guild.members?.map(memberId => `
                    <li>
                        <span>${memberId === userId ? '⭐ ' : ''}${memberId}</span>
                        ${isLeader && memberId !== userId ?
                            `<button class="remove-member-btn" onclick="removeFromGuild('${guild.id}', '${memberId}')">❌ Удалить</button>`
                            : ''}
                    </li>
                `).join('') || '<li>Нет участников</li>'}
            </ul>
            <button id="leave-guild-btn" class="glow-button" style="margin-top:15px;">🚪 Покинуть гильдию</button>
        </div>
        <p>👥 Участников: ${guild.members?.length || 1}</p>
        <div class="boss-selector">
            <button onclick="changeBoss('${prevBoss}')" ${guild.battleActive ? 'disabled' : ''}>◀</button>
            <span>Текущий босс: ${guild.bossId}</span>
            <button onclick="changeBoss('${nextBoss}')" ${guild.battleActive ? 'disabled' : ''}>▶</button>
        </div>
        <div id="boss-battle-area">
            ${renderBossBattle(guild)}
        </div>
        ${keysDisplay}
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button onclick="showGuildRating()">🏆 Рейтинг</button>
            <button onclick="showInviteMenu()">📨 Пригласить</button>
            ${isLeader && !guild.battleActive ? `<button id="start-battle-btn" class="glow-button">⚔️ Начать сражение</button>` : ''}
        </div>
    `;

    document.getElementById('guild-title').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('guild-info-panel').classList.toggle('hidden');
    };

    document.getElementById('leave-guild-btn')?.addEventListener('click', () => leaveGuild(guild.id));

    if (isLeader && !guild.battleActive) {
        document.getElementById('start-battle-btn').onclick = () => startBattle(guild.id);
    }
}

function renderBossBattle(guild) {
    if (!guild.battleActive) {
        return `<div class="boss-container">
                    <img class="boss-image" src="https://via.placeholder.com/150?text=${guild.bossId}" onclick="attackBoss()">
                    <h3>${guild.bossId}</h3>
                    <p>Босс ожидает битвы</p>
                </div>`;
    } else {
        const hpPercent = (guild.bossHp / guild.maxBossHp) * 100;
        let stage = 1;
        if (hpPercent <= 33) stage = 3;
        else if (hpPercent <= 66) stage = 2;
        const bossImageUrl = `https://via.placeholder.com/150?text=${guild.bossId}_${stage}`;

        return `
            <div class="boss-container">
                <img class="boss-image" src="${bossImageUrl}" onclick="attackBoss()">
                <h3>${guild.bossId}</h3>
                <div class="boss-hp-bar">
                    <div class="boss-hp-fill" style="width: ${hpPercent}%;"></div>
                </div>
                <div id="battle-timer">⏳ 120с</div>
                <div id="talent-selector"></div>
            </div>
        `;
    }
}

window.changeBoss = async function(bossId) {
    if (!currentGuild) return;
    if (currentGuild.battleActive) {
        tg.showPopup({ title: 'Ошибка', message: 'Нельзя сменить босса во время битвы' });
        return;
    }
    if (bossId === 'boss2' && (!currentGuild.keys?.boss2 || currentGuild.keys.boss2 < 3)) {
        tg.showPopup({ title: 'Нет ключей', message: 'Нужно 3 ключа для босса 2' });
        return;
    }

    const updates = { bossId };
    if (bossId === 'boss2') {
        updates.keys = { boss2: (currentGuild.keys?.boss2 || 0) - 3 };
        updates.maxBossHp = 2000;
        updates.bossHp = 2000;
    } else {
        updates.maxBossHp = 1000;
        updates.bossHp = 1000;
    }

    await db.collection('guilds').doc(currentGuild.id).update(updates);
};

async function startBattle(guildId) {
    const guildRef = db.collection('guilds').doc(guildId);
    const guild = (await guildRef.get()).data();
    if (guild.battleActive) return;
    const battleEndTime = Date.now() + 120000;
    await guildRef.update({
        battleActive: true,
        battleEndTime,
        bossHp: guild.maxBossHp
    });
    selectedTalent = null;
    if (battleListener) battleListener();
    battleListener = guildRef.onSnapshot(doc => {
        const g = doc.data();
        if (!g.battleActive) {
            battleListener();
            battleListener = null;
            if (battleTimerInterval) {
                clearInterval(battleTimerInterval);
                battleTimerInterval = null;
            }
        }
        renderGuildPage({ id: doc.id, ...g });
        if (g.battleActive) {
            updateTimer(g.battleEndTime, guildId);
            loadTalentsForBattle();
        }
    });
}

function updateTimer(endTime, guildId) {
    const timerDiv = document.getElementById('battle-timer');
    if (!timerDiv) return;
    if (battleTimerInterval) clearInterval(battleTimerInterval);
    battleTimerInterval = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.floor(remaining / 1000);
        if (timerDiv) timerDiv.innerText = `⏳ ${seconds}с`;
        if (seconds <= 0) {
            clearInterval(battleTimerInterval);
            battleTimerInterval = null;
            endBattle(false, guildId);
        }
    }, 1000);
}

async function loadTalentsForBattle() {
    const user = await getUserData();
    const container = document.getElementById('talent-selector');
    if (!container) return;
    container.innerHTML = '<div class="talent-buttons"></div>';
    const btnsDiv = container.querySelector('.talent-buttons');
    user.talents.forEach(talent => {
        const btn = document.createElement('button');
        btn.classList.add('talent-btn');
        btn.innerText = talent.name || talent.id;
        btn.onclick = () => selectTalent(talent.id);
        btnsDiv.appendChild(btn);
    });
}

function selectTalent(talentId) {
    selectedTalent = talentId;
    tg.showPopup({ title: 'Талант', message: `Выбран ${talentId}` });
}

async function attackBoss() {
    if (!selectedTalent) {
        tg.showPopup({ title: 'Нет таланта', message: 'Выберите талант!' });
        return;
    }
    const user = await getUserData();
    if (!currentGuild || !currentGuild.battleActive) return;

    if (user.energy < 1) {
        tg.showPopup({ title: 'Нет энергии', message: 'Подождите восстановления' });
        return;
    }

    const talent = user.talents.find(t => t.id === selectedTalent);
    let damage = talent?.damage || 10;

    await updateUser({ energy: user.energy - 1, lastEnergyUpdate: Date.now() });

    const guildRef = db.collection('guilds').doc(currentGuild.id);
    await guildRef.update({
        bossHp: firebase.firestore.FieldValue.increment(-damage)
    });

    const guild = (await guildRef.get()).data();
    if (guild.bossHp <= 0) {
        await endBattle(true, currentGuild.id);
    }
}

async function endBattle(victory, guildId) {
    if (!currentGuild || currentGuild.id !== guildId) return;
    const guildRef = db.collection('guilds').doc(guildId);
    const guild = (await guildRef.get()).data();
    if (!guild.battleActive) return;

    if (victory) {
        const rewardMoney = 500;
        const rewardRating = 100;
        const rewardKeys = guild.bossId === 'boss1' ? 1 : 2;

        const newRating = (guild.rating || 0) + rewardRating;
        const newLevel = Math.floor(newRating / 100) + 1;

        await guildRef.update({
            battleActive: false,
            bossHp: guild.maxBossHp,
            rating: newRating,
            level: newLevel,
            keys: { boss2: (guild.keys?.boss2 || 0) + rewardKeys }
        });

        const members = guild.members || [];
        await Promise.all(members.map(async (memberId) => {
            const memberRef = db.collection('users').doc(memberId);
            await memberRef.update({ money: firebase.firestore.FieldValue.increment(rewardMoney) });
        }));

        tg.showPopup({ title: 'Победа!', message: `+${rewardMoney} 🪙, +${rewardRating} рейтинга` });
    } else {
        await guildRef.update({ battleActive: false, bossHp: guild.maxBossHp });
        tg.showPopup({ title: 'Поражение', message: 'Босс победил...' });
    }

    if (battleTimerInterval) {
        clearInterval(battleTimerInterval);
        battleTimerInterval = null;
    }
}

async function showGuildRating() {
    const guildsSnap = await db.collection('guilds').orderBy('rating', 'desc').get();
    const guilds = guildsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let msg = '🏆 Рейтинг гильдий:\n';
    guilds.forEach((g, i) => {
        msg += `${i+1}. ${g.name} — ур.${g.level} (${g.rating || 0} очков)\n`;
    });
    tg.showPopup({ title: 'Рейтинг', message: msg });
}

window.showInviteMenu = function() {
    tg.showPopup({
        title: 'Пригласить друга',
        message: 'Введите Telegram ID друга:',
        buttons: [
            { id: 'invite', type: 'default', text: 'Отправить' },
            { type: 'cancel', text: 'Отмена' }
        ]
    }, async (buttonId) => {
        if (buttonId === 'invite') {
            tg.showPopup({ title: 'Функция', message: 'Отправка приглашения через бота (в разработке)' });
        }
    });
};

async function leaveGuild(guildId) {
    const user = await getUserData();
    const guildRef = db.collection('guilds').doc(guildId);
    const guild = (await guildRef.get()).data();

    if (!guild.members.includes(userId)) return;

    if (guild.leaderId === userId) {
        const otherMembers = guild.members.filter(id => id !== userId);
        if (otherMembers.length === 0) {
            await guildRef.delete();
        } else {
            await guildRef.update({
                leaderId: otherMembers[0],
                members: otherMembers
            });
        }
    } else {
        await guildRef.update({
            members: guild.members.filter(id => id !== userId)
        });
    }

    await updateUser({ guildId: null });
    await getUserData(true);
    loadGuildScreen();
    tg.showPopup({ title: 'Успех', message: 'Вы покинули гильдию.' });
}

window.removeFromGuild = async function(guildId, memberId) {
    const user = await getUserData();
    const guildRef = db.collection('guilds').doc(guildId);
    const guild = (await guildRef.get()).data();

    if (guild.leaderId !== userId) {
        tg.showPopup({ title: 'Ошибка', message: 'Только лидер может удалять участников.' });
        return;
    }
    if (memberId === userId) {
        tg.showPopup({ title: 'Ошибка', message: 'Нельзя удалить самого себя. Используйте "Покинуть гильдию".' });
        return;
    }

    await guildRef.update({
        members: guild.members.filter(id => id !== memberId)
    });

    const memberRef = db.collection('users').doc(memberId);
    await memberRef.update({ guildId: null });

    tg.showPopup({ title: 'Успех', message: 'Участник удалён.' });
};

// ============================
// ДРУЗЬЯ
// ============================
async function loadFriendsScreen() {
    const user = await getUserData();
    const container = document.getElementById('friends-view');

    const myIdHtml = `
        <div class="my-id-card">
            <span>🆔 Ваш Telegram ID: </span>
            <strong>${userId}</strong>
            <button class="copy-btn" onclick="copyToClipboard('${userId}')">📋 Копировать</button>
        </div>
    `;

    const friendDocs = await Promise.all(user.friends.map(fid => db.collection('users').doc(fid).get()));
    const friends = friendDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));

    const requestsSnap = await db.collection('friendRequests').where('to', '==', userId).get();
    const incomingRequests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    container.innerHTML = `
        <h2>👥 Друзья</h2>
        ${myIdHtml}
        <div id="friend-list">
            <h3>Мои друзья</h3>
            ${friends.length ? friends.map(f => `
                <div class="friend-item">
                    <span>${f.name || f.id}</span>
                    <span class="${isOnline(f) ? 'online' : 'offline'}">${isOnline(f) ? '● в сети' : '○ офлайн'}</span>
                </div>
            `).join('') : '<p>У вас пока нет друзей</p>'}
        </div>

        <h3>Входящие заявки</h3>
        <div id="incoming-requests">
            ${incomingRequests.length ? incomingRequests.map(req => `
                <div class="friend-request">
                    <span>${req.from}</span>
                    <button onclick="acceptFriendRequest('${req.id}', '${req.from}')">✅ Принять</button>
                    <button onclick="declineFriendRequest('${req.id}')">❌ Отклонить</button>
                </div>
            `).join('') : '<p>Нет новых заявок</p>'}
        </div>

        <h3>Найти друга</h3>
        <input type="text" id="search-friend" placeholder="Telegram ID">
        <button id="search-btn">Поиск</button>
        <div id="search-result"></div>
    `;

    document.getElementById('search-btn').onclick = async () => {
        const searchId = document.getElementById('search-friend').value.trim();
        if (!searchId) return;
        if (searchId === userId) {
            tg.showPopup({ title: 'Ошибка', message: 'Это вы сами' });
            return;
        }
        const userDoc = await db.collection('users').doc(searchId).get();
        if (userDoc.exists) {
            const foundUser = userDoc.data();
            const resultDiv = document.getElementById('search-result');
            resultDiv.innerHTML = `
                <div class="friend-item">
                    <span>${foundUser.name || searchId}</span>
                    <button onclick="sendFriendRequest('${searchId}')">➕ Добавить</button>
                </div>
            `;
        } else {
            tg.showPopup({ title: 'Не найден', message: 'Пользователь не найден' });
        }
    };
}

function isOnline(user) {
    const lastSeen = user.lastEnergyUpdate || 0;
    return Date.now() - lastSeen < 5 * 60 * 1000;
}

window.sendFriendRequest = async function(targetId) {
    const user = await getUserData();
    if (user.friends.includes(targetId)) {
        tg.showPopup({ title: 'Уже друг', message: '' });
        return;
    }
    const existing = await db.collection('friendRequests')
        .where('from', '==', userId)
        .where('to', '==', targetId)
        .get();
    if (!existing.empty) {
        tg.showPopup({ title: 'Заявка уже отправлена', message: '' });
        return;
    }
    await db.collection('friendRequests').add({
        from: userId,
        to: targetId,
        timestamp: Date.now()
    });
    tg.showPopup({ title: 'Заявка отправлена', message: '' });
};

window.acceptFriendRequest = async function(requestId, fromId) {
    const user = await getUserData();
    await db.collection('users').doc(userId).update({
        friends: firebase.firestore.FieldValue.arrayUnion(fromId)
    });
    await db.collection('users').doc(fromId).update({
        friends: firebase.firestore.FieldValue.arrayUnion(userId)
    });
    await db.collection('friendRequests').doc(requestId).delete();
    loadFriendsScreen();
    tg.showPopup({ title: 'Друг добавлен', message: '' });
};

window.declineFriendRequest = async function(requestId) {
    await db.collection('friendRequests').doc(requestId).delete();
    loadFriendsScreen();
};

window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        tg.showPopup({ title: 'Скопировано', message: 'ID скопирован в буфер обмена' });
    }).catch(() => {
        tg.showPopup({ title: 'Ошибка', message: 'Не удалось скопировать' });
    });
};

// ============================
// НАВИГАЦИЯ И ЗАГРУЗКА ЭКРАНОВ
// ============================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-screen="${screenId}"]`).classList.add('active');

    if (screenId === 'workshop') {
        loadShop();
        loadInventoryPets();
        loadTalentsUI();
        loadCraftUI();
        loadCharacterCustomization();
    }
    if (screenId === 'guild') loadGuildScreen();
    if (screenId === 'friends') loadFriendsScreen();
}

// ============================
// ИНИЦИАЛИЗАЦИЯ
// ============================
window.onload = async () => {
    if (!navigator.onLine) {
        tg.showPopup({ title: 'Нет интернета', message: 'Игра требует подключения к сети.' });
        return;
    }

    // Добавление тестового предмета (шляпа), если магазин пуст
    async function initTestItems() {
        const clothesSnap = await db.collection('shop_items').where('type', '==', 'clothes').limit(1).get();
        if (clothesSnap.empty) {
            const hat = {
                name: 'Ковбойская шляпа',
                type: 'clothes',
                slot: 'hat',
                price: 100,
                imageUrl: 'https://via.placeholder.com/80?text=🎩',
                damage: 0
            };
            await db.collection('shop_items').add(hat);
            console.log('➕ Тестовая шляпа добавлена');
        }
    }
    await initTestItems();

    await getUserData();
    updateMainUI();

    // Клик по персонажу для заработка
    document.getElementById('character-container').onclick = async () => {
        const user = await getUserData();
        if (user.energy >= 1) {
            user.energy -= 1;
            user.money += 10;
            user.lastEnergyUpdate = Date.now();
            await updateUser({ energy: user.energy, money: user.money, lastEnergyUpdate: user.lastEnergyUpdate });
            updateMainUI();
        } else {
            tg.showPopup({ title: 'Нет энергии', message: 'Подожди, энергия восстановится!' });
        }
    };

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => showScreen(btn.dataset.screen);
    });

    // Восстановление энергии каждые 2 секунды
    setInterval(async () => {
        if (currentUser) {
            const now = Date.now();
            const delta = Math.floor((now - currentUser.lastEnergyUpdate) / 1000);
            if (delta > 0) {
                const newEnergy = Math.min(currentUser.maxEnergy, currentUser.energy + delta);
                currentUser.energy = newEnergy;
                currentUser.lastEnergyUpdate = now;
                await db.collection('users').doc(userId).update({ energy: newEnergy, lastEnergyUpdate: now });
                updateMainUI();
            }
        }
    }, 2000);

    // Обработчики вкладок в мастерской
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');

            if (tab === 'character') {
                loadCharacterCustomization();
            }
        });
    });
};

// ============================
// ЭКСПОРТ ГЛОБАЛЬНЫХ ФУНКЦИЙ
// ============================
window.buyItem = buyItem;
window.craftTalent = craftTalent;
window.joinGuild = joinGuild;
window.startBattle = startBattle;
window.attackBoss = attackBoss;
window.changeBoss = changeBoss;
window.showGuildRating = showGuildRating;
