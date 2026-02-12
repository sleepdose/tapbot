// =======================================================
// ГЛОБАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ TELEGRAM, FIREBASE, АУТЕНТИФИКАЦИЯ
// =======================================================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Firebase config (твои данные)
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
const auth = firebase.auth();

// =======================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ (СТОР) И ПОДПИСКИ
// =======================================================
const store = {
    user: null,           // текущий пользователь (из Firestore)
    guild: null,          // текущая гильдия
    authUser: null,       // объект из Firebase Auth
    listeners: {
        guild: null,      // функция отписки от гильдии
        battleTimer: null // идентификатор интервала
    }
};

// Функции для уведомлений (UI)
function showNotification(title, message) {
    tg.showPopup({ title, message });
}

function hapticFeedback(style = 'medium') {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
}

// Утилита для отображения лоадера
function showLoader(containerId, show = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const existing = container.querySelector('.loader');
    if (show) {
        if (!existing) {
            const loader = document.createElement('div');
            loader.className = 'loader';
            container.prepend(loader);
        }
    } else {
        if (existing) existing.remove();
    }
}

// =======================================================
// АУТЕНТИФИКАЦИЯ (АНОНИМНАЯ)
// =======================================================
async function initAuth() {
    try {
        const userCred = await auth.signInAnonymously();
        store.authUser = userCred.user;
        console.log('Аутентифицирован:', store.authUser.uid);
        return store.authUser.uid;
    } catch (e) {
        console.error('Ошибка аутентификации:', e);
        showNotification('Ошибка', 'Не удалось войти. Проверьте интернет.');
        throw e;
    }
}

// =======================================================
// РАБОТА С ПОЛЬЗОВАТЕЛЕМ (БЕЗ ЛИШНИХ ЗАПРОСОВ)
// =======================================================

// Получить актуальные данные пользователя (из памяти или загрузить)
async function getUser(forceReload = false) {
    if (!store.user || forceReload) {
        await loadUserFromFirestore();
    }
    return store.user;
}

// Загрузить/создать документ пользователя
async function loadUserFromFirestore() {
    if (!store.authUser) throw new Error('Not authenticated');
    const uid = store.authUser.uid;
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
        const newUser = {
            id: uid,
            name: tg.initDataUnsafe.user?.first_name || 'Игрок',
            energy: 100,
            maxEnergy: 100,
            lastEnergyUpdate: Date.now(),
            money: 500,
            equipped: { hat: null, shirt: null, jeans: null, boots: null },
            pets: [],
            talents: [],
            inventory: [],
            guildId: null,
            friends: [],
            pendingRequests: []
        };
        await userRef.set(newUser);
        store.user = newUser;
    } else {
        const data = doc.data();
        // Пересчёт энергии без записи в БД (запись только при действии)
        const now = Date.now();
        const deltaSeconds = Math.floor((now - (data.lastEnergyUpdate || now)) / 1000);
        data.energy = Math.min(data.maxEnergy, (data.energy || 0) + deltaSeconds);
        data.lastEnergyUpdate = now;
        store.user = data;
    }
    return store.user;
}

// Обновить пользователя в БД и в сторе
async function updateUser(updates) {
    if (!store.user || !store.authUser) return;
    const userRef = db.collection('users').doc(store.authUser.uid);
    await userRef.update(updates);
    Object.assign(store.user, updates);
    updateMainUI(); // реактивность
}

// Получить текущую энергию (без запроса к БД)
function getCurrentEnergy() {
    if (!store.user) return 0;
    const now = Date.now();
    const delta = Math.floor((now - store.user.lastEnergyUpdate) / 1000);
    return Math.min(store.user.maxEnergy, store.user.energy + delta);
}

// Списать энергию и записать в БД
async function spendEnergy(amount = 1) {
    if (!store.user) return false;
    const current = getCurrentEnergy();
    if (current < amount) return false;
    const newEnergy = current - amount;
    const now = Date.now();
    await updateUser({
        energy: newEnergy,
        lastEnergyUpdate: now
    });
    return true;
}

// =======================================================
// ГЛАВНЫЙ ЭКРАН
// =======================================================
function updateMainUI() {
    if (!store.user) return;
    const user = store.user;
    const currentEnergy = getCurrentEnergy();
    document.getElementById('money').innerText = user.money;
    document.getElementById('energy-display').innerText = `⚡ ${currentEnergy}/${user.maxEnergy}`;

    // Отображение экипировки
    const eqLayer = document.getElementById('equipment-layer');
    if (eqLayer) {
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

    // Отображение питомца
    const petLayer = document.getElementById('pet-layer');
    if (petLayer) {
        petLayer.innerHTML = '';
        if (user.pets.length > 0) {
            const activePet = user.pets[0];
            const img = document.createElement('img');
            img.src = activePet.imageUrl;
            petLayer.appendChild(img);
        }
    }
}

// Клик по персонажу — заработок монет
async function onCharacterClick() {
    const user = await getUser();
    const currentEnergy = getCurrentEnergy();
    if (currentEnergy >= 1) {
        const success = await spendEnergy(1);
        if (success) {
            user.money += 10;
            await updateUser({ money: user.money });
            hapticFeedback('light');
        }
    } else {
        showNotification('Нет энергии', 'Подожди, энергия восстановится!');
    }
}

// =======================================================
// МАСТЕРСКАЯ — КАСТОМИЗАЦИЯ
// =======================================================
let currentCustomizationSlot = 'hat';
let previewItemId = null;

// Загрузка вкладки "Персонаж"
async function loadCharacterCustomization() {
    const user = await getUser();
    const container = document.getElementById('tab-character');
    if (!container) return;
    previewItemId = null;
    updatePreviewCharacter(user);
    await renderItemsForSlot(currentCustomizationSlot);
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

    if (previewItemId) {
        const previewCard = document.querySelector(`.item-card[data-item-id="${previewItemId}"]`);
        if (previewCard) {
            const slot = previewCard.dataset.slot;
            const imgUrl = previewCard.dataset.image;
            const img = document.createElement('img');
            img.src = imgUrl;
            img.classList.add(slot);
            img.style.zIndex = 10;
            img.style.opacity = '0.7';
            eqLayer.appendChild(img);
        }
    }
}

async function renderItemsForSlot(slot) {
    const user = await getUser();
    const container = document.getElementById('slot-items');
    if (!container) return;

    showLoader('slot-items', true);

    let query;
    if (slot === 'legs') {
        query = db.collection('shop_items')
            .where('type', '==', 'clothes')
            .where('slot', 'in', ['jeans', 'boots']);
    } else {
        query = db.collection('shop_items')
            .where('type', '==', 'clothes')
            .where('slot', '==', slot);
    }

    const snapshot = await query.get();
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    showLoader('slot-items', false);

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-msg">Нет доступных предметов</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const isOwned = user.inventory.some(inv => inv.id === item.id);
        const isEquipped = user.equipped[item.slot]?.id === item.id;
        const buttonText = isOwned
            ? (isEquipped ? '✅ Экипировано' : 'Выбрать')
            : `Купить ${item.price} 🪙`;
        const buttonDisabled = isEquipped ? 'disabled' : '';
        const buttonAction = isOwned
            ? `equipItem('${item.id}', '${item.slot}')`
            : `buyItem('${item.id}', '${item.slot}')`;

        return `
            <div class="item-card" data-item-id="${item.id}" data-slot="${item.slot}" data-image="${item.imageUrl}">
                <img src="${item.imageUrl}" alt="${item.name}" onclick="previewItem('${item.id}')">
                <span>${item.name}</span>
                ${!isOwned ? `<span class="item-price">${item.price} 🪙</span>` : ''}
                <button onclick="${buttonAction}" ${buttonDisabled}>${buttonText}</button>
            </div>
        `;
    }).join('');
}

// Глобальные функции для кнопок
window.previewItem = function(itemId) {
    previewItemId = itemId;
    updatePreviewCharacter(store.user);
};

window.buyItem = async function(itemId, slot) {
    const user = await getUser();
    const itemRef = db.collection('shop_items').doc(itemId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            const userDoc = await transaction.get(userRef);
            if (!itemDoc.exists) throw 'Товар не найден';
            const item = itemDoc.data();
            if (userDoc.data().money < item.price) throw 'Недостаточно денег';
            if (userDoc.data().inventory.some(inv => inv.id === itemId)) throw 'Уже есть в инвентаре';

            const inventoryItem = {
                id: item.id,
                ...item,
                instanceId: Date.now() + Math.random()
            };
            transaction.update(userRef, {
                money: userDoc.data().money - item.price,
                inventory: [...userDoc.data().inventory, inventoryItem]
            });
        });
        await loadUserFromFirestore(true); // перезагрузить пользователя
        await renderItemsForSlot(currentCustomizationSlot);
        showNotification('Успех', 'Предмет куплен!');
        hapticFeedback();
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
};

window.equipItem = async function(itemId, slot) {
    const user = await getUser();
    const inventoryItem = user.inventory.find(inv => inv.id === itemId);
    if (!inventoryItem) return;

    let targetSlot = slot;
    if (currentCustomizationSlot === 'legs') {
        targetSlot = inventoryItem.slot;
    }

    const updates = {
        equipped: { ...user.equipped, [targetSlot]: inventoryItem }
    };
    await updateUser(updates);
    previewItemId = null;
    updatePreviewCharacter(user);
    await renderItemsForSlot(currentCustomizationSlot);
    updateMainUI();
    hapticFeedback();
};

// =======================================================
// ПИТОМЦЫ
// =======================================================
async function loadPetsGrid() {
    const user = await getUser();
    const container = document.getElementById('pets-grid');
    if (!container) return;

    showLoader('pets-grid', true);
    const snapshot = await db.collection('shop_items').where('type', '==', 'pet').get();
    const pets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    showLoader('pets-grid', false);

    if (pets.length === 0) {
        container.innerHTML = '<p class="empty-msg">Питомцы пока не доступны</p>';
        return;
    }

    container.innerHTML = pets.map(pet => {
        const ownedItem = user.inventory.find(inv => inv.id === pet.id);
        const isActive = user.pets[0]?.id === pet.id;
        let button = '';
        if (!ownedItem) {
            button = `<button onclick="buyPet('${pet.id}')">Купить ${pet.price} 🪙</button>`;
        } else {
            if (isActive) {
                button = `<button disabled>✅ Активен</button>`;
            } else {
                button = `<button onclick="activatePet('${pet.id}')">🐾 Активировать</button>`;
            }
        }

        return `
            <div class="item-card">
                <img src="${pet.imageUrl}" alt="${pet.name}">
                <span>${pet.name}</span>
                <span>${pet.price} 🪙</span>
                ${button}
            </div>
        `;
    }).join('');
}

window.buyPet = async function(petId) {
    const user = await getUser();
    const itemRef = db.collection('shop_items').doc(petId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const petDoc = await transaction.get(itemRef);
            const userDoc = await transaction.get(userRef);
            if (!petDoc.exists) throw 'Питомец не найден';
            const pet = petDoc.data();
            if (userDoc.data().money < pet.price) throw 'Недостаточно денег';
            if (userDoc.data().inventory.some(inv => inv.id === petId)) throw 'Уже есть в инвентаре';

            const inventoryItem = {
                id: pet.id,
                ...pet,
                instanceId: Date.now() + Math.random()
            };
            transaction.update(userRef, {
                money: userDoc.data().money - pet.price,
                inventory: [...userDoc.data().inventory, inventoryItem]
            });
        });
        await loadUserFromFirestore(true);
        await loadPetsGrid();
        showNotification('Успех', 'Питомец куплен!');
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
};

window.activatePet = async function(petId) {
    const user = await getUser();
    const petItem = user.inventory.find(inv => inv.id === petId);
    if (!petItem) return;
    await updateUser({ pets: [petItem] });
    await loadPetsGrid();
    updateMainUI();
    updatePreviewCharacter(user);
    hapticFeedback();
};

// =======================================================
// ТАЛАНТЫ И КРАФТ (ИСПРАВЛЕНО: ИСПОЛЬЗУЕМ ID)
// =======================================================
async function loadTalentsGrid() {
    const user = await getUser();
    const container = document.getElementById('talents-grid');
    if (!container) return;

    showLoader('talents-grid', true);
    const snapshot = await db.collection('shop_items').where('type', '==', 'talent').get();
    const talents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    showLoader('talents-grid', false);

    if (talents.length === 0) {
        container.innerHTML = '<p class="empty-msg">Таланты пока не доступны</p>';
        return;
    }

    container.innerHTML = talents.map(talent => {
        const isLearned = user.talents.some(t => t.id === talent.id);
        const button = isLearned
            ? `<button disabled>✅ Изучен</button>`
            : `<button onclick="buyTalent('${talent.id}')">Изучить ${talent.price} 🪙</button>`;

        return `
            <div class="item-card">
                <img src="${talent.imageUrl}" alt="${talent.name}">
                <span>${talent.name}</span>
                <span>${talent.price} 🪙</span>
                <span>⚔️ ${talent.damage || 0} урона</span>
                ${button}
            </div>
        `;
    }).join('');
}

window.buyTalent = async function(talentId) {
    const user = await getUser();
    const talentRef = db.collection('shop_items').doc(talentId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const talentDoc = await transaction.get(talentRef);
            const userDoc = await transaction.get(userRef);
            if (!talentDoc.exists) throw 'Талант не найден';
            const talent = talentDoc.data();
            if (userDoc.data().money < talent.price) throw 'Недостаточно денег';
            if (userDoc.data().talents.some(t => t.id === talentId)) throw 'Уже изучен';

            const newTalent = {
                id: talent.id,
                name: talent.name,
                damage: talent.damage || 10
            };
            transaction.update(userRef, {
                money: userDoc.data().money - talent.price,
                talents: [...userDoc.data().talents, newTalent]
            });
        });
        await loadUserFromFirestore(true);
        await loadTalentsGrid();
        await loadCraftUI();
        showNotification('Успех', 'Талант изучен!');
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
};

async function loadCraftUI() {
    const user = await getUser();
    const container = document.getElementById('craft-section');
    if (!container) return;

    showLoader('craft-section', true);
    const recipesSnap = await db.collection('recipes').get();
    const recipes = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    showLoader('craft-section', false);

    container.innerHTML = recipes.map(recipe => {
        // Проверка по ID талантов
        const hasAll = recipe.requires.every(requiredId => user.talents.some(t => t.id === requiredId));
        const alreadyCrafted = user.talents.some(t => t.id === recipe.result);
        return `
            <div class="craft-card ${hasAll && !alreadyCrafted ? 'available' : 'locked'}">
                <span>🔮 ${recipe.name || recipe.result}</span>
                <small>Требует: ${recipe.requires.join(', ')}</small>
                ${hasAll && !alreadyCrafted ? `<button onclick="craftTalent('${recipe.id}')">Создать</button>` : '<span>❌ Недоступно</span>'}
            </div>
        `;
    }).join('');
}

window.craftTalent = async function(recipeId) {
    const user = await getUser();
    const recipeRef = db.collection('recipes').doc(recipeId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const recipeDoc = await transaction.get(recipeRef);
            const userDoc = await transaction.get(userRef);
            if (!recipeDoc.exists) throw 'Рецепт не найден';
            const recipe = recipeDoc.data();

            const hasAll = recipe.requires.every(requiredId => userDoc.data().talents.some(t => t.id === requiredId));
            if (!hasAll) throw 'Не хватает талантов';
            if (userDoc.data().talents.some(t => t.id === recipe.result)) throw 'Уже есть этот талант';

            const newTalent = {
                id: recipe.result,
                name: recipe.name || recipe.result,
                damage: recipe.damage || 15
            };
            transaction.update(userRef, {
                talents: [...userDoc.data().talents, newTalent]
            });
        });
        await loadUserFromFirestore(true);
        await loadTalentsGrid();
        await loadCraftUI();
        showNotification('Успех', 'Талант создан!');
        hapticFeedback();
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
};

// =======================================================
// ГИЛЬДИИ (С ТРАНЗАКЦИЯМИ И ОЧИСТКОЙ СЛУШАТЕЛЕЙ)
// =======================================================
async function loadGuildScreen() {
    const user = await getUser(true);
    const container = document.getElementById('guild-view');
    if (!container) return;

    // Очистка старых слушателей и таймеров
    if (store.listeners.guild) store.listeners.guild();
    if (store.listeners.battleTimer) clearInterval(store.listeners.battleTimer);
    store.listeners.battleTimer = null;

    if (!user.guildId) {
        // Показываем список гильдий
        showLoader('guild-view', true);
        const guildsSnap = await db.collection('guilds').get();
        const guilds = guildsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        showLoader('guild-view', false);

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
        // Загружаем конкретную гильдию
        const guildDoc = await db.collection('guilds').doc(user.guildId).get();
        if (!guildDoc.exists) {
            await updateUser({ guildId: null });
            loadGuildScreen();
            return;
        }
        const guild = { id: guildDoc.id, ...guildDoc.data() };
        store.guild = guild;
        renderGuildPage(guild);

        // Подписка на обновления гильдии
        store.listeners.guild = db.collection('guilds').doc(user.guildId).onSnapshot(doc => {
            if (doc.exists) {
                const updatedGuild = { id: doc.id, ...doc.data() };
                store.guild = updatedGuild;
                // Обновляем только зону боя и тайтл
                const titleEl = document.getElementById('guild-title');
                if (titleEl) titleEl.innerText = `🏰 ${updatedGuild.name} (ур. ${updatedGuild.level})`;
                const area = document.getElementById('boss-battle-area');
                if (area) {
                    area.innerHTML = renderBossBattle(updatedGuild);
                    if (updatedGuild.battleActive) {
                        startBattleTimer(updatedGuild.battleEndTime, updatedGuild.id);
                        loadTalentsForBattle();
                    } else {
                        if (store.listeners.battleTimer) clearInterval(store.listeners.battleTimer);
                        store.listeners.battleTimer = null;
                    }
                }
            }
        });
    }
}

async function createGuild(name, description) {
    const user = await getUser();
    const newGuild = {
        name,
        description,
        leaderId: store.authUser.uid,
        members: [store.authUser.uid],
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
        await loadUserFromFirestore(true);
        loadGuildScreen();
        showNotification('Гильдия создана', `Добро пожаловать в ${name}!`);
    } catch (e) {
        showNotification('Ошибка', 'Не удалось создать гильдию.');
    }
}

window.joinGuild = async function(guildId) {
    const user = await getUser();
    const guildRef = db.collection('guilds').doc(guildId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            const userDoc = await transaction.get(userRef);
            if (!guildDoc.exists) throw 'Гильдия не найдена';
            if (userDoc.data().guildId) throw 'Вы уже в гильдии';
            const members = guildDoc.data().members || [];
            if (members.includes(store.authUser.uid)) throw 'Уже в гильдии';
            members.push(store.authUser.uid);
            transaction.update(guildRef, { members });
            transaction.update(userRef, { guildId });
        });
        await loadUserFromFirestore(true);
        loadGuildScreen();
        showNotification('Успех', 'Вы вступили в гильдию!');
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
};

function renderGuildPage(guild) {
    const container = document.getElementById('guild-view');
    const isLeader = guild.leaderId === store.authUser.uid;

    const bosses = ['boss1', 'boss2'];
    const currentBossIndex = bosses.indexOf(guild.bossId);
    const nextBoss = bosses[(currentBossIndex + 1) % bosses.length];
    const prevBoss = bosses[(currentBossIndex - 1 + bosses.length) % bosses.length];

    const keysDisplay = `<div class="boss-keys">🔑 Ключи для босса 2: ${guild.keys?.boss2 || 0} / 3</div>`;

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
                        <span>${memberId === store.authUser.uid ? '⭐ ' : ''}${memberId}</span>
                        ${isLeader && memberId !== store.authUser.uid ?
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
        ${keysDisplay}
        <div id="boss-battle-area">
            ${renderBossBattle(guild)}
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button onclick="showGuildRating()">🏆 Рейтинг</button>
            <button onclick="showInviteMenu()">📨 Пригласить</button>
            ${isLeader && !guild.battleActive ? `<button id="start-battle-btn" class="glow-button">⚔️ Начать сражение</button>` : ''}
        </div>
    `;

    document.getElementById('guild-title').onclick = () => {
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
                    <img class="boss-image" src="https://via.placeholder.com/150/8B0000/FFFFFF?text=${guild.bossId}" onclick="attackBoss()">
                    <h3>${guild.bossId}</h3>
                    <p>Босс ожидает битвы</p>
                </div>`;
    } else {
        const hpPercent = (guild.bossHp / guild.maxBossHp) * 100;
        let stage = 1;
        if (hpPercent <= 33) stage = 3;
        else if (hpPercent <= 66) stage = 2;
        const bossImageUrl = `https://via.placeholder.com/150/8B0000/FFFFFF?text=${guild.bossId}_${stage}`;

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
    if (!store.guild) return;
    if (store.guild.battleActive) {
        showNotification('Ошибка', 'Нельзя сменить босса во время битвы');
        return;
    }
    const updates = { bossId };
    if (bossId === 'boss2') {
        updates.maxBossHp = 2000;
        updates.bossHp = 2000;
    } else {
        updates.maxBossHp = 1000;
        updates.bossHp = 1000;
    }
    await db.collection('guilds').doc(store.guild.id).update(updates);
};

async function startBattle(guildId) {
    const guildRef = db.collection('guilds').doc(guildId);
    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw 'Гильдия не найдена';
            const guild = guildDoc.data();
            if (guild.battleActive) throw 'Битва уже идёт';
            if (guild.leaderId !== store.authUser.uid) throw 'Только лидер может начать битву';

            if (guild.bossId === 'boss2') {
                const keys = guild.keys?.boss2 || 0;
                if (keys < 3) throw 'Недостаточно ключей для босса 2';
                transaction.update(guildRef, {
                    keys: { boss2: keys - 3 }
                });
            }

            const battleEndTime = Date.now() + 120000;
            transaction.update(guildRef, {
                battleActive: true,
                battleEndTime,
                bossHp: guild.maxBossHp
            });
        });
        selectedTalent = null;
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
}

function startBattleTimer(endTime, guildId) {
    if (store.listeners.battleTimer) clearInterval(store.listeners.battleTimer);
    const timerDiv = document.getElementById('battle-timer');
    store.listeners.battleTimer = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.floor(remaining / 1000);
        if (timerDiv) timerDiv.innerText = `⏳ ${seconds}с`;
        if (seconds <= 0) {
            clearInterval(store.listeners.battleTimer);
            store.listeners.battleTimer = null;
            endBattle(false, guildId);
        }
    }, 1000);
}

async function loadTalentsForBattle() {
    const user = await getUser();
    const container = document.getElementById('talent-selector');
    if (!container) return;
    container.innerHTML = '<div class="talent-buttons"></div>';
    const btnsDiv = container.querySelector('.talent-buttons');
    user.talents.forEach(talent => {
        const btn = document.createElement('button');
        btn.classList.add('talent-btn');
        btn.innerText = `${talent.name || talent.id} (${talent.damage || 0})`;
        btn.onclick = () => selectTalent(talent.id);
        btnsDiv.appendChild(btn);
    });
}

let selectedTalent = null;
function selectTalent(talentId) {
    selectedTalent = talentId;
    showNotification('Талант', `Выбран ${talentId}`);
}

async function attackBoss() {
    if (!selectedTalent) {
        showNotification('Нет таланта', 'Выберите талант!');
        return;
    }
    if (!store.guild || !store.guild.battleActive) return;

    const user = await getUser();
    const currentEnergy = getCurrentEnergy();
    if (currentEnergy < 1) {
        showNotification('Нет энергии', 'Подождите восстановления');
        return;
    }

    const talent = user.talents.find(t => t.id === selectedTalent);
    let damage = talent?.damage || 10;

    // Списываем энергию
    const spent = await spendEnergy(1);
    if (!spent) return;

    const guildRef = db.collection('guilds').doc(store.guild.id);
    await guildRef.update({
        bossHp: firebase.firestore.FieldValue.increment(-damage)
    });
    hapticFeedback('heavy');

    // Проверим, не убит ли босс (следующий snapshot сам обновит UI)
}

async function endBattle(victory, guildId) {
    if (!store.guild || store.guild.id !== guildId) return;
    const guildRef = db.collection('guilds').doc(guildId);
    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) return;
            const guild = guildDoc.data();
            if (!guild.battleActive) return;

            if (victory) {
                const rewardMoney = 500;
                const rewardRating = 100;
                const rewardKeys = guild.bossId === 'boss1' ? 1 : 2;

                const newRating = (guild.rating || 0) + rewardRating;
                const newLevel = Math.floor(newRating / 100) + 1;

                transaction.update(guildRef, {
                    battleActive: false,
                    bossHp: guild.maxBossHp,
                    rating: newRating,
                    level: newLevel,
                    keys: { boss2: (guild.keys?.boss2 || 0) + rewardKeys }
                });

                // Награда всем участникам
                const members = guild.members || [];
                members.forEach(memberId => {
                    const memberRef = db.collection('users').doc(memberId);
                    transaction.update(memberRef, {
                        money: firebase.firestore.FieldValue.increment(rewardMoney)
                    });
                });
                showNotification('Победа!', `+${rewardMoney} 🪙, +${rewardRating} рейтинга`);
            } else {
                transaction.update(guildRef, { battleActive: false, bossHp: guild.maxBossHp });
                showNotification('Поражение', 'Босс победил...');
            }
        });
    } catch (e) {
        console.error('Ошибка завершения битвы:', e);
    }
}

async function showGuildRating() {
    const guildsSnap = await db.collection('guilds').orderBy('rating', 'desc').get();
    const guilds = guildsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let msg = '🏆 Рейтинг гильдий:\n';
    guilds.forEach((g, i) => {
        msg += `${i+1}. ${g.name} — ур.${g.level} (${g.rating || 0} очков)\n`;
    });
    showNotification('Рейтинг', msg);
}

window.showInviteMenu = function() {
    showNotification('Пригласить друга', 'Функция в разработке');
};

async function leaveGuild(guildId) {
    const user = await getUser();
    const guildRef = db.collection('guilds').doc(guildId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            const userDoc = await transaction.get(userRef);
            if (!guildDoc.exists) return;
            const guild = guildDoc.data();
            if (!guild.members.includes(store.authUser.uid)) return;

            if (guild.leaderId === store.authUser.uid) {
                const otherMembers = guild.members.filter(id => id !== store.authUser.uid);
                if (otherMembers.length === 0) {
                    transaction.delete(guildRef);
                } else {
                    transaction.update(guildRef, {
                        leaderId: otherMembers[0],
                        members: otherMembers
                    });
                }
            } else {
                transaction.update(guildRef, {
                    members: guild.members.filter(id => id !== store.authUser.uid)
                });
            }
            transaction.update(userRef, { guildId: null });
        });
        await loadUserFromFirestore(true);
        loadGuildScreen();
        showNotification('Успех', 'Вы покинули гильдию.');
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
}

window.removeFromGuild = async function(guildId, memberId) {
    const user = await getUser();
    const guildRef = db.collection('guilds').doc(guildId);
    const memberRef = db.collection('users').doc(memberId);

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw 'Гильдия не найдена';
            const guild = guildDoc.data();
            if (guild.leaderId !== store.authUser.uid) throw 'Только лидер может удалять';
            if (memberId === store.authUser.uid) throw 'Нельзя удалить себя';

            transaction.update(guildRef, {
                members: guild.members.filter(id => id !== memberId)
            });
            transaction.update(memberRef, { guildId: null });
        });
        showNotification('Успех', 'Участник удалён');
    } catch (e) {
        showNotification('Ошибка', e.toString());
    }
};

// =======================================================
// ДРУЗЬЯ (КОПИРОВАНИЕ ID, ЗАПРОСЫ)
// =======================================================
async function loadFriendsScreen() {
    const user = await getUser();
    const container = document.getElementById('friends-view');
    if (!container) return;

    const myIdHtml = `
        <div class="my-id-card">
            <span>🆔 Ваш Telegram ID: </span>
            <strong>${store.authUser.uid}</strong>
            <button class="copy-btn" onclick="copyToClipboard('${store.authUser.uid}')">📋 Копировать</button>
        </div>
    `;

    const friendDocs = await Promise.all(user.friends.map(fid => db.collection('users').doc(fid).get()));
    const friends = friendDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));

    const requestsSnap = await db.collection('friendRequests').where('to', '==', store.authUser.uid).get();
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
                    <button onclick="removeFriend('${f.id}')">❌ Удалить</button>
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
        if (searchId === store.authUser.uid) {
            showNotification('Ошибка', 'Это вы сами');
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
            showNotification('Не найден', 'Пользователь не найден');
        }
    };
}

function isOnline(user) {
    const lastSeen = user.lastEnergyUpdate || 0;
    return Date.now() - lastSeen < 5 * 60 * 1000;
}

window.sendFriendRequest = async function(targetId) {
    const user = await getUser();
    if (user.friends.includes(targetId)) {
        showNotification('Уже друг', '');
        return;
    }
    const existing = await db.collection('friendRequests')
        .where('from', '==', store.authUser.uid)
        .where('to', '==', targetId)
        .get();
    if (!existing.empty) {
        showNotification('Заявка уже отправлена', '');
        return;
    }
    await db.collection('friendRequests').add({
        from: store.authUser.uid,
        to: targetId,
        timestamp: Date.now()
    });
    showNotification('Заявка отправлена', '');
};

window.acceptFriendRequest = async function(requestId, fromId) {
    const user = await getUser();
    await db.collection('users').doc(store.authUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayUnion(fromId)
    });
    await db.collection('users').doc(fromId).update({
        friends: firebase.firestore.FieldValue.arrayUnion(store.authUser.uid)
    });
    await db.collection('friendRequests').doc(requestId).delete();
    loadFriendsScreen();
    showNotification('Друг добавлен', '');
};

window.declineFriendRequest = async function(requestId) {
    await db.collection('friendRequests').doc(requestId).delete();
    loadFriendsScreen();
};

window.removeFriend = async function(friendId) {
    const user = await getUser();
    if (!user.friends.includes(friendId)) return;

    await db.collection('users').doc(store.authUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayRemove(friendId)
    });
    await db.collection('users').doc(friendId).update({
        friends: firebase.firestore.FieldValue.arrayRemove(store.authUser.uid)
    });

    store.user.friends = store.user.friends.filter(id => id !== friendId);
    loadFriendsScreen();
    showNotification('Удалён', 'Пользователь удалён из друзей');
};

window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Скопировано', 'ID скопирован в буфер обмена');
    }).catch(() => {
        showNotification('Ошибка', 'Не удалось скопировать');
    });
};

// =======================================================
// НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ
// =======================================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-screen="${screenId}"]`).classList.add('active');

    // Загружаем соответствующий экран
    switch (screenId) {
        case 'workshop':
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'character';
            if (activeTab === 'character') loadCharacterCustomization();
            if (activeTab === 'pets') loadPetsGrid();
            if (activeTab === 'talents') {
                loadTalentsGrid();
                loadCraftUI();
            }
            break;
        case 'guild':
            loadGuildScreen();
            break;
        case 'friends':
            loadFriendsScreen();
            break;
        // main не требует дополнительной загрузки
    }
}

// =======================================================
// ИНИЦИАЛИЗАЦИЯ ТЕСТОВЫХ ДАННЫХ FIRESTORE (ТОЛЬКО ДЛЯ ПЕРВОГО ЗАПУСКА)
// =======================================================
async function initTestData() {
    // ОДЕЖДА
    const clothesSnap = await db.collection('shop_items').where('type', '==', 'clothes').limit(1).get();
    if (clothesSnap.empty) {
        const items = [
            { name: 'Ковбойская шляпа', type: 'clothes', slot: 'hat', price: 100, imageUrl: 'img/skin1.png', damage: 0 },
            { name: 'Бейсболка', type: 'clothes', slot: 'hat', price: 80, imageUrl: 'https://via.placeholder.com/80/2E8B57/FFFFFF?text=Cap', damage: 0 },
            { name: 'Кожаная куртка', type: 'clothes', slot: 'shirt', price: 200, imageUrl: 'https://via.placeholder.com/80/8B4513/FFFFFF?text=Jacket', damage: 0 },
            { name: 'Джинсы', type: 'clothes', slot: 'jeans', price: 150, imageUrl: 'https://via.placeholder.com/80/4169E1/FFFFFF?text=Jeans', damage: 0 },
            { name: 'Ботинки', type: 'clothes', slot: 'boots', price: 120, imageUrl: 'https://via.placeholder.com/80/8B4513/FFFFFF?text=Boots', damage: 0 }
        ];
        for (const item of items) {
            await db.collection('shop_items').add(item);
        }
        console.log('➕ Тестовая одежда добавлена');
    }

    // ПИТОМЦЫ
    const petsSnap = await db.collection('shop_items').where('type', '==', 'pet').limit(1).get();
    if (petsSnap.empty) {
        const pets = [
            { name: 'Собака', type: 'pet', price: 250, imageUrl: 'https://via.placeholder.com/80/964B00/FFFFFF?text=Dog' },
            { name: 'Кошка', type: 'pet', price: 200, imageUrl: 'https://via.placeholder.com/80/FFA500/FFFFFF?text=Cat' }
        ];
        for (const pet of pets) {
            await db.collection('shop_items').add(pet);
        }
        console.log('➕ Тестовые питомцы добавлены');
    }

    // ТАЛАНТЫ
    const talentsSnap = await db.collection('shop_items').where('type', '==', 'talent').limit(1).get();
    if (talentsSnap.empty) {
        const talents = [
            { name: 'Удар ногой', type: 'talent', price: 150, imageUrl: 'https://via.placeholder.com/80/FFA500/FFFFFF?text=Kick', damage: 15 },
            { name: 'Огненный шар', type: 'talent', price: 300, imageUrl: 'https://via.placeholder.com/80/FF4500/FFFFFF?text=Fire', damage: 25 },
            { name: 'Лечение', type: 'talent', price: 200, imageUrl: 'https://via.placeholder.com/80/32CD32/FFFFFF?text=Heal', damage: 0 }
        ];
        const addedRefs = [];
        for (const t of talents) {
            const ref = await db.collection('shop_items').add(t);
            addedRefs.push(ref);
        }
        console.log('➕ Тестовые таланты добавлены');

        // РЕЦЕПТЫ КРАФТА (используем ID талантов)
        const ids = addedRefs.map(ref => ref.id);
        await db.collection('recipes').add({
            name: 'Мегаудар',
            requires: [ids[0], ids[1]],
            result: 'crafted_megahit_' + Date.now(),
            damage: 40
        });
        await db.collection('recipes').add({
            name: 'Божественное исцеление',
            requires: [ids[2], ids[1]],
            result: 'crafted_heal_' + Date.now(),
            damage: 0
        });
        console.log('➕ Тестовые рецепты добавлены (по ID)');
    }
}

// =======================================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// =======================================================
window.onload = async () => {
    if (!navigator.onLine) {
        showNotification('Нет интернета', 'Игра требует подключения к сети.');
        return;
    }

    try {
        // 1. Аутентификация
        await initAuth();

        // 2. Инициализация тестовых данных (если нужно)
        await initTestData();

        // 3. Загрузка пользователя
        await getUser();

        // 4. Первичное обновление UI
        updateMainUI();

        // 5. Обработчики событий
        document.getElementById('character-container').onclick = onCharacterClick;

        // Навигация
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => showScreen(btn.dataset.screen);
        });

        // Обработка вкладок мастерской (делегирование)
        document.querySelector('.tabs').addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-button');
            if (!tabBtn) return;
            const tab = tabBtn.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');

            if (tab === 'character') loadCharacterCustomization();
            if (tab === 'pets') loadPetsGrid();
            if (tab === 'talents') {
                loadTalentsGrid();
                loadCraftUI();
            }
        });

        // Делегирование для слотов (избегаем повторных подписок)
        document.querySelector('.slot-selector').addEventListener('click', (e) => {
            const slotBtn = e.target.closest('.slot-btn');
            if (!slotBtn) return;
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
            slotBtn.classList.add('active');
            currentCustomizationSlot = slotBtn.dataset.slot;
            renderItemsForSlot(currentCustomizationSlot);
        });

        // Энергия больше не обновляется каждые 2 секунды, только при действиях
        // Можно добавить периодический пересчёт отображения энергии (раз в минуту)
        setInterval(() => {
            updateMainUI(); // обновит отображение энергии из памяти
        }, 60000);

        console.log('✅ Игра готова');
    } catch (e) {
        console.error('Ошибка инициализации:', e);
        showNotification('Ошибка', 'Не удалось загрузить игру. Попробуйте позже.');
    }
};

// Глобальный экспорт функций (для HTML onclick)
window.buyItem = window.buyItem;
window.equipItem = window.equipItem;
window.buyPet = window.buyPet;
window.activatePet = window.activatePet;
window.buyTalent = window.buyTalent;
window.craftTalent = window.craftTalent;
window.joinGuild = window.joinGuild;
window.startBattle = window.startBattle;
window.attackBoss = window.attackBoss;
window.changeBoss = window.changeBoss;
window.showGuildRating = window.showGuildRating;
window.removeFriend = window.removeFriend;
window.sendFriendRequest = window.sendFriendRequest;
window.acceptFriendRequest = window.acceptFriendRequest;
window.declineFriendRequest = window.declineFriendRequest;
window.copyToClipboard = window.copyToClipboard;
window.removeFromGuild = window.removeFromGuild;
window.previewItem = window.previewItem;
