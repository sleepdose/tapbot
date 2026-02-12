// =======================================================
// ГЛОБАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ TELEGRAM, FIREBASE, АУТЕНТИФИКАЦИЯ
// =======================================================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Firebase config
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
    user: null,
    guild: null,
    authUser: null,
    listeners: {
        guild: null,
        battleTimer: null
    }
};

// =======================================================
// УВЕДОМЛЕНИЯ — поддержка старых версий Telegram
// =======================================================
function showNotification(title, message) {
    if (tg && typeof tg.showPopup === 'function') {
        try {
            tg.showPopup({ title, message });
        } catch (e) {
            console.warn('Не удалось показать уведомление через tg:', e);
            alert(`${title}: ${message}`);
        }
    } else {
        alert(`${title}: ${message}`);
    }
}

function hapticFeedback(style = 'medium') {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
}

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
// РАБОТА С ПОЛЬЗОВАТЕЛЕМ (с полями талантов)
// =======================================================

// Значения по умолчанию для новых пользователей
const defaultTalents = {
    talents: {
        basic: { level: 1, damage: 10 },
        critical: { level: 1, chance: 0.2 },
        poison: { level: 1, damage: 3 }
    },
    attackCharges: {
        basic: { charges: 15, basePrice: 50 },
        critical: { charges: 15, basePrice: 75 },
        poison: { charges: 15, basePrice: 100 }
    },
    craftedTalents: {
        sonic: { level: 0, damage: 50, charges: 0 },
        fire:   { level: 0, damage: 75, charges: 0 },
        ice:    { level: 0, damage: 60, charges: 0 }
    },
    selectedTalent: null
};

async function getUser(forceReload = false) {
    if (!store.user || forceReload) {
        await loadUserFromFirestore();
    }
    return store.user;
}

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
            inventory: [],
            guildId: null,
            friends: [],
            pendingRequests: [],
            ...defaultTalents
        };
        await userRef.set(newUser);
        store.user = newUser;
    } else {
        const data = doc.data();
        // Добавляем недостающие поля талантов, если их нет
        let needsUpdate = false;
        if (!data.talents) { data.talents = defaultTalents.talents; needsUpdate = true; }
        if (!data.attackCharges) { data.attackCharges = defaultTalents.attackCharges; needsUpdate = true; }
        if (!data.craftedTalents) { data.craftedTalents = defaultTalents.craftedTalents; needsUpdate = true; }
        if (data.selectedTalent === undefined) { data.selectedTalent = null; needsUpdate = true; }

        if (needsUpdate) {
            await userRef.update({
                talents: data.talents,
                attackCharges: data.attackCharges,
                craftedTalents: data.craftedTalents,
                selectedTalent: data.selectedTalent
            });
        }

        // Пересчёт энергии на лету
        const now = Date.now();
        const deltaSeconds = Math.floor((now - (data.lastEnergyUpdate || now)) / 1000);
        data.energy = Math.min(data.maxEnergy, (data.energy || 0) + deltaSeconds);
        data.lastEnergyUpdate = now;
        store.user = data;
    }
    return store.user;
}

async function updateUser(updates) {
    if (!store.user || !store.authUser) return;
    const userRef = db.collection('users').doc(store.authUser.uid);
    await userRef.update(updates);
    Object.assign(store.user, updates);
    updateMainUI();
}

function getCurrentEnergy(userData = store.user) {
    if (!userData) return 0;
    const now = Date.now();
    const delta = Math.floor((now - userData.lastEnergyUpdate) / 1000);
    return Math.min(userData.maxEnergy, userData.energy + delta);
}

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

    // Полная очистка слоёв перед отрисовкой
    const eqLayer = document.getElementById('equipment-layer');
    const petLayer = document.getElementById('pet-layer');
    if (eqLayer) eqLayer.innerHTML = '';
    if (petLayer) petLayer.innerHTML = '';

    const slots = ['hat', 'shirt', 'jeans', 'boots'];
    slots.forEach(slot => {
        if (user.equipped[slot]) {
            const img = document.createElement('img');
            img.src = user.equipped[slot].imageUrl;
            img.classList.add(slot);
            eqLayer?.appendChild(img);
        }
    });

    if (user.pets.length > 0) {
        const activePet = user.pets[0];
        const img = document.createElement('img');
        img.src = activePet.imageUrl;
        petLayer?.appendChild(img);
    }
}

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
            : `buyItem('${item.id}')`;

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

window.previewItem = function(itemId) {
    previewItemId = itemId;
    updatePreviewCharacter(store.user);
};

// =======================================================
// ИСПРАВЛЕННАЯ ПОКУПКА ЭКИПИРОВКИ (БЕЗ undefined)
// =======================================================
window.buyItem = async function(itemId) {
    if (!store.authUser) {
        showNotification('Ошибка', 'Пользователь не авторизован');
        return;
    }

    const user = await getUser();
    const itemRef = db.collection('shop_items').doc(itemId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            const userDoc = await transaction.get(userRef);
            if (!itemDoc.exists) throw new Error('Товар не найден');
            const item = itemDoc.data();
            if (userDoc.data().money < item.price) throw new Error('Недостаточно денег');

            const inventory = userDoc.data().inventory || [];
            // Проверяем по правильному ID документа
            if (inventory.some(inv => inv.id === itemId)) {
                throw new Error('Предмет уже есть в инвентаре');
            }

            // ✅ Безопасное создание объекта — используем itemId как id
            const inventoryItem = {
                id: String(itemId),                      // ID документа Firestore
                name: String(item.name || ''),
                type: String(item.type || ''),
                slot: String(item.slot || ''),
                price: typeof item.price === 'number' ? item.price : 0,
                imageUrl: String(item.imageUrl || ''),
                damage: typeof item.damage === 'number' ? item.damage : 0,
                instanceId: `${Date.now()}_${Math.random()}`
            };

            // Удаляем возможные undefined (на всякий случай)
            Object.keys(inventoryItem).forEach(key => {
                if (inventoryItem[key] === undefined) {
                    console.error(`⚠️ Поле ${key} оказалось undefined — заменено на null`);
                    inventoryItem[key] = null;
                }
            });

            transaction.update(userRef, {
                money: firebase.firestore.FieldValue.increment(-item.price),
                inventory: firebase.firestore.FieldValue.arrayUnion(inventoryItem)
            });
        });

        await loadUserFromFirestore(true);
        await renderItemsForSlot(currentCustomizationSlot);
        updateMainUI(); // Обновляем главный экран сразу
        showNotification('Успех', 'Предмет куплен!');
        hapticFeedback();
    } catch (e) {
        console.error('Ошибка покупки:', e);
        showNotification('Ошибка', e.message || 'Не удалось купить предмет');
    }
};

window.equipItem = async function(itemId, slot) {
    const user = await getUser();
    const inventoryItem = user.inventory.find(inv => inv.id === itemId);
    if (!inventoryItem) return;

    const targetSlot = slot;
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
// ПИТОМЦЫ (ИСПРАВЛЕННАЯ ПОКУПКА)
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
    if (!store.authUser) {
        showNotification('Ошибка', 'Пользователь не авторизован');
        return;
    }

    const itemRef = db.collection('shop_items').doc(petId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const petDoc = await transaction.get(itemRef);
            const userDoc = await transaction.get(userRef);
            if (!petDoc.exists) throw new Error('Питомец не найден');
            const pet = petDoc.data();
            if (userDoc.data().money < pet.price) throw new Error('Недостаточно денег');

            const inventory = userDoc.data().inventory || [];
            // Проверяем по правильному ID документа
            if (inventory.some(inv => inv.id === petId)) {
                throw new Error('Питомец уже есть в инвентаре');
            }

            // ✅ Безопасное создание объекта — используем petId как id
            const inventoryItem = {
                id: String(petId),
                name: String(pet.name || ''),
                type: String(pet.type || ''),
                price: typeof pet.price === 'number' ? pet.price : 0,
                imageUrl: String(pet.imageUrl || ''),
                instanceId: `${Date.now()}_${Math.random()}`
            };

            // Удаляем возможные undefined
            Object.keys(inventoryItem).forEach(key => {
                if (inventoryItem[key] === undefined) {
                    console.error(`⚠️ Поле ${key} оказалось undefined — заменено на null`);
                    inventoryItem[key] = null;
                }
            });

            transaction.update(userRef, {
                money: firebase.firestore.FieldValue.increment(-pet.price),
                inventory: firebase.firestore.FieldValue.arrayUnion(inventoryItem)
            });
        });

        await loadUserFromFirestore(true);
        await loadPetsGrid();
        updateMainUI(); // Обновляем главный экран (питомец)
        showNotification('Успех', 'Питомец куплен!');
        hapticFeedback();
    } catch (e) {
        console.error('Ошибка покупки питомца:', e);
        showNotification('Ошибка', e.message || 'Не удалось купить питомца');
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
// НОВАЯ СИСТЕМА ТАЛАНТОВ И КРАФТА
// =======================================================

// ---------- Конфигурация ----------
const talentsConfig = {
    basic: {
        maxLevel: 10,
        getDamage: (level) => 10 + (level * 2),
        getCost: (level) => Math.floor(75 * Math.pow(1.3, level - 1))
    },
    critical: {
        maxLevel: 10,
        getChance: (level) => 0.15 + (level * 0.05),
        getCost: (level) => Math.floor(150 * Math.pow(1.3, level - 1))
    },
    poison: {
        maxLevel: 10,
        getDamage: (level) => 2 + level,
        getDuration: (level) => 5 + level,
        getCost: (level) => Math.floor(200 * Math.pow(1.3, level - 1))
    }
};

const craftedTalentsConfig = {
    sonic: { damage: 50, recipe: ['basic', 'critical'] },
    fire:  { damage: 75, recipe: ['critical', 'poison'] },
    ice:   { damage: 60, recipe: ['poison', 'basic'] }
};

function getTalentName(type) {
    const names = { basic: 'Базовый', critical: 'Критический', poison: 'Ядовитый',
                    sonic: 'Звуковой', fire: 'Огненный', ice: 'Ледяной' };
    return names[type] || type;
}

function getTalentIcon(type) {
    const icons = { basic: '🗡️', critical: '💥', poison: '☠️',
                    sonic: '🔊', fire: '🔥', ice: '❄️' };
    return icons[type] || '';
}

// ---------- Покупка зарядов ----------
window.buyCharges = async function(type) {
    const user = await getUser();
    const charges = user.attackCharges[type];
    const cost = charges.basePrice;

    if (user.money < cost) {
        showNotification('Недостаточно мёда', `Нужно ${cost} 🪙`);
        return;
    }

    const newCharges = { ...user.attackCharges };
    newCharges[type].charges += 5;

    await updateUser({
        money: user.money - cost,
        attackCharges: newCharges
    });

    showNotification('Успех', `+5 зарядов ${getTalentName(type)}`);
    hapticFeedback();
    renderBuyChargesUI();
    if (store.guild?.battleActive) createBattleTalentButtons();
};

// ---------- Улучшение таланта ----------
window.upgradeTalent = async function(talentType) {
    const user = await getUser();
    const talent = user.talents[talentType];
    const config = talentsConfig[talentType];

    if (talent.level >= config.maxLevel) {
        showNotification('Максимальный уровень', '');
        return;
    }

    const cost = config.getCost(talent.level);
    if (user.money < cost) {
        showNotification('Недостаточно мёда', `Нужно ${cost} 🪙`);
        return;
    }

    const newTalents = { ...user.talents };
    newTalents[talentType].level++;

    switch (talentType) {
        case 'basic':
            newTalents.basic.damage = config.getDamage(newTalents.basic.level);
            break;
        case 'critical':
            newTalents.critical.chance = config.getChance(newTalents.critical.level);
            break;
        case 'poison':
            newTalents.poison.damage = config.getDamage(newTalents.poison.level);
            break;
    }

    await updateUser({
        money: user.money - cost,
        talents: newTalents
    });

    showNotification('Талант улучшен!', `Теперь ${newTalents[talentType].level} уровень`);
    hapticFeedback();
    updateTalentUI();
};

// ---------- Крафт таланта ----------
window.craftTalent = async function(talentType) {
    const user = await getUser();
    const recipe = craftedTalentsConfig[talentType].recipe;

    const slots = document.querySelectorAll('.craft-slot');
    const selectedTalents = Array.from(slots).map(s => s.dataset.talent).filter(Boolean);
    if (selectedTalents.length !== 2) {
        showNotification('Ошибка', 'Нужно два таланта');
        return;
    }

    const isRecipe = recipe.every(r => selectedTalents.includes(r));
    if (!isRecipe) {
        showNotification('Неверный рецепт', 'Попробуй другую комбинацию');
        return;
    }

    const talentCounts = {};
    selectedTalents.forEach(t => { talentCounts[t] = (talentCounts[t] || 0) + 1; });
    const hasEnough = Object.keys(talentCounts).every(t =>
        user.attackCharges[t].charges >= talentCounts[t]
    );

    if (!hasEnough) {
        showNotification('Недостаточно зарядов', 'Купи заряды в магазине');
        return;
    }

    const newCharges = { ...user.attackCharges };
    Object.keys(talentCounts).forEach(t => {
        newCharges[t].charges -= talentCounts[t];
    });

    const newCrafted = { ...user.craftedTalents };
    newCrafted[talentType].charges += 1;
    newCrafted[talentType].level = Math.max(
        newCrafted[talentType].level,
        ...recipe.map(t => user.talents[t].level)
    );

    await updateUser({
        attackCharges: newCharges,
        craftedTalents: newCrafted
    });

    showNotification('✨ Крафт успешен!', `Получен ${getTalentName(talentType)}`);
    hapticFeedback();
    resetCraftingSlots();
    renderBuyChargesUI();
    if (store.guild?.battleActive) createBattleTalentButtons();
};

function resetCraftingSlots() {
    document.querySelectorAll('.craft-slot').forEach(slot => {
        slot.innerHTML = '';
        slot.dataset.talent = '';
        slot.classList.remove('filled');
    });
    document.querySelectorAll('.craft-result button').forEach(btn => btn.style.display = 'none');
}

function checkRecipe() {
    const slots = document.querySelectorAll('.craft-slot');
    const talents = Array.from(slots).map(s => s.dataset.talent).filter(Boolean);
    if (talents.length !== 2) return;

    const counts = {};
    talents.forEach(t => counts[t] = (counts[t] || 0) + 1);

    const sonicBtn = document.getElementById('sonicButton');
    const fireBtn = document.getElementById('fireButton');
    const iceBtn = document.getElementById('iceButton');

    sonicBtn.style.display = (counts.basic >= 1 && counts.critical >= 1) ? 'block' : 'none';
    fireBtn.style.display = (counts.critical >= 1 && counts.poison >= 1) ? 'block' : 'none';
    iceBtn.style.display = (counts.poison >= 1 && counts.basic >= 1) ? 'block' : 'none';
}

// ---------- Рендер UI талантов ----------
function renderBuyChargesUI() {
    const container = document.querySelector('.attack-charges-container');
    if (!container) return;
    const user = store.user;
    if (!user) return;

    container.innerHTML = Object.entries(user.attackCharges).map(([type, data]) => `
        <div class="attack-charges-item">
            <div>
                <strong>${getTalentIcon(type)} ${getTalentName(type)}</strong>
                <span class="charge-counter">${data.charges} шт</span>
            </div>
            <button onclick="buyCharges('${type}')">Купить 5 за ${data.basePrice} 🪙</button>
        </div>
    `).join('');
}

function updateTalentUI() {
    const user = store.user;
    if (!user) return;

    const basicLevel = document.getElementById('basicLevel');
    const critLevel = document.getElementById('critLevel');
    const poisonLevel = document.getElementById('poisonLevel');
    if (basicLevel) basicLevel.textContent = user.talents.basic.level;
    if (critLevel) critLevel.textContent = user.talents.critical.level;
    if (poisonLevel) poisonLevel.textContent = user.talents.poison.level;

    const basicDmg = document.getElementById('basicDmg');
    const critChance = document.getElementById('critChanceUpgrade');
    const poisonDmg = document.getElementById('poisonDmgUpgrade');
    if (basicDmg) basicDmg.textContent = user.talents.basic.damage;
    if (critChance) critChance.textContent = Math.floor(user.talents.critical.chance * 100);
    if (poisonDmg) poisonDmg.textContent = user.talents.poison.damage;

    Object.keys(talentsConfig).forEach(type => {
        const btn = document.querySelector(`.upgrade-btn[data-talent="${type}"]`);
        if (!btn) return;
        const currentLevel = user.talents[type].level;
        const config = talentsConfig[type];
        if (currentLevel >= config.maxLevel) {
            btn.textContent = 'MAX';
            btn.disabled = true;
        } else {
            const cost = config.getCost(currentLevel);
            btn.textContent = cost;
            btn.disabled = user.money < cost;
        }
    });
}

// ---------- Инициализация вкладки талантов ----------
function initTalentsTab() {
    renderBuyChargesUI();
    updateTalentUI();
}

// ---------- Глобальные обработчики талантов ----------
function setupTalentsGlobalListeners() {
    const talentsScreen = document.getElementById('tab-talents');
    if (!talentsScreen) return;

    talentsScreen.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.talent-tabs .tab-btn');
        if (tabBtn) {
            e.preventDefault();
            const tabId = tabBtn.dataset.tab;
            document.querySelectorAll('.talent-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        }
    });

    talentsScreen.addEventListener('click', (e) => {
        const card = e.target.closest('.talent-card');
        if (!card) return;
        const emptySlot = Array.from(document.querySelectorAll('.craft-slot')).find(slot => !slot.dataset.talent);
        if (emptySlot) {
            emptySlot.innerHTML = card.innerHTML;
            emptySlot.dataset.talent = card.dataset.talent;
            emptySlot.classList.add('filled');
            checkRecipe();
        }
    });

    talentsScreen.addEventListener('click', (e) => {
        const slot = e.target.closest('.craft-slot.filled');
        if (slot) {
            slot.innerHTML = '';
            slot.dataset.talent = '';
            slot.classList.remove('filled');
            checkRecipe();
        }
    });

    talentsScreen.addEventListener('click', (e) => {
        const upgradeBtn = e.target.closest('.upgrade-btn');
        if (upgradeBtn) {
            e.stopPropagation();
            upgradeTalent(upgradeBtn.dataset.talent);
        }
    });

    document.getElementById('sonicButton').onclick = () => craftTalent('sonic');
    document.getElementById('fireButton').onclick = () => craftTalent('fire');
    document.getElementById('iceButton').onclick = () => craftTalent('ice');
}

// ---------- Интеграция талантов в бой гильдии ----------
function createBattleTalentButtons() {
    const container = document.getElementById('talent-selector');
    if (!container) return;
    const user = store.user;
    if (!user || !store.guild?.battleActive) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="talent-buttons">';

    Object.entries(user.talents).forEach(([type, talent]) => {
        if (talent.level > 0) {
            const charges = user.attackCharges[type]?.charges || 0;
            if (charges <= 0) return;
            const isSelected = user.selectedTalent === type;
            html += `<button class="talent-btn ${isSelected ? 'active' : ''}"
                            data-talent="${type}"
                            onclick="selectBattleTalent('${type}')">
                        ${getTalentIcon(type)} ${getTalentName(type)} (${charges})
                      </button>`;
        }
    });

    Object.entries(user.craftedTalents).forEach(([type, data]) => {
        if (data.charges > 0) {
            const isSelected = user.selectedTalent === type;
            html += `<button class="talent-btn ${isSelected ? 'active' : ''}"
                            data-talent="${type}"
                            onclick="selectBattleTalent('${type}')">
                        ${getTalentIcon(type)} ${getTalentName(type)} (${data.charges})
                      </button>`;
        }
    });

    html += '</div>';
    container.innerHTML = html;
}

window.selectBattleTalent = async function(talentType) {
    const user = await getUser();
    const newSelected = user.selectedTalent === talentType ? null : talentType;
    await updateUser({ selectedTalent: newSelected });
    createBattleTalentButtons();
};

// =======================================================
// ИСПРАВЛЕНИЕ БОЯ: ТАЙМЕР И ЯД
// =======================================================
let poisonInterval = null;

function startPoisonEffect(damagePerSec, duration) {
    if (poisonInterval) clearInterval(poisonInterval);
    let ticks = duration;
    poisonInterval = setInterval(async () => {
        if (!store.guild?.battleActive || ticks <= 0) {
            clearInterval(poisonInterval);
            poisonInterval = null;
            return;
        }

        const guildRef = db.collection('guilds').doc(store.guild.id);
        await guildRef.update({
            bossHp: firebase.firestore.FieldValue.increment(-damagePerSec)
        });

        showDamageEffect(damagePerSec, '☠️');

        // Проверяем, не убит ли босс после каждого тика яда
        const guildDoc = await guildRef.get();
        if (guildDoc.exists) {
            const guild = guildDoc.data();
            if (guild.bossHp <= 0) {
                await endBattle(true, store.guild.id);
            }
        }

        ticks--;
    }, 1000);
}

function showDamageEffect(amount, icon = '💥') {
    const bossImg = document.querySelector('.boss-image');
    if (!bossImg) return;
    const div = document.createElement('div');
    div.textContent = `${icon} -${amount}`;
    div.style.position = 'absolute';
    div.style.left = bossImg.offsetLeft + bossImg.offsetWidth/2 + 'px';
    div.style.top = bossImg.offsetTop + 'px';
    div.style.color = '#ffaa00';
    div.style.fontSize = '24px';
    div.style.fontWeight = 'bold';
    div.style.textShadow = '2px 2px 0 #000';
    div.style.animation = 'flyUp 1s ease-out';
    document.getElementById('guild-view').appendChild(div);
    setTimeout(() => div.remove(), 1000);
}

// =======================================================
// ГИЛЬДИИ
// =======================================================

// ---------- Модальное окно создания гильдии ----------
window.showCreateGuildModal = function() {
    document.getElementById('create-guild-modal').classList.remove('hidden');
};

window.hideCreateGuildModal = function() {
    document.getElementById('create-guild-modal').classList.add('hidden');
    document.getElementById('guild-name').value = '';
    document.getElementById('guild-desc').value = '';
};

async function createGuild(name, description) {
    const user = await getUser();
    const newGuild = {
        name,
        description,
        leaderId: store.authUser.uid,
        members: [store.authUser.uid],
        maxMembers: 20,                  // ✅ лимит участников
        level: 1,
        rating: 0,
        bossId: 'boss1',
        bossHp: 1000,
        maxBossHp: 1000,
        battleActive: false,
        battleEndTime: null,
        keys: { boss2: 0 },
        damageLog: {}
    };
    try {
        const docRef = await db.collection('guilds').add(newGuild);
        await updateUser({ guildId: docRef.id });
        await loadUserFromFirestore(true);
        loadGuildScreen();
        showNotification('Гильдия создана', `Добро пожаловать в ${name}!`);
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', 'Не удалось создать гильдию.');
    }
}

window.joinGuild = async function(guildId) {
    if (!store.authUser) return;
    const guildRef = db.collection('guilds').doc(guildId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            const userDoc = await transaction.get(userRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            if (userDoc.data().guildId) throw new Error('Вы уже в гильдии');

            const guild = guildDoc.data();
            if (guild.members.length >= (guild.maxMembers || 20)) {
                throw new Error('Гильдия полна (макс. 20 участников)');
            }
            if (guild.members.includes(store.authUser.uid)) throw new Error('Уже в гильдии');

            transaction.update(guildRef, {
                members: firebase.firestore.FieldValue.arrayUnion(store.authUser.uid)
            });
            transaction.update(userRef, { guildId });
        });

        await loadUserFromFirestore(true);
        loadGuildScreen();
        showNotification('Успех', 'Вы вступили в гильдию!');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось вступить');
    }
};

async function loadGuildScreen() {
    const user = await getUser(true);
    const container = document.getElementById('guild-view');
    if (!container) return;

    // Отписываемся от старого слушателя
    if (store.listeners.guild) {
        store.listeners.guild();
        store.listeners.guild = null;
    }
    if (store.listeners.battleTimer) {
        clearInterval(store.listeners.battleTimer);
        store.listeners.battleTimer = null;
    }

    if (!user.guildId) {
        showLoader('guild-view', true);
        const guildsSnap = await db.collection('guilds').get();
        const guilds = guildsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        showLoader('guild-view', false);

        container.innerHTML = `
            <div class="guild-header">
                <h2>🏰 Гильдии</h2>
                <button id="create-guild-btn" class="glow-button">✨ Создать</button>
            </div>
            <div class="guild-list">
                ${guilds.length ? guilds.map(g => `
                    <div class="guild-card">
                        <h3>${g.name}</h3>
                        <p>${g.description || ''}</p>
                        <p>👥 ${g.members?.length || 0} / ${g.maxMembers || 20} участников</p>
                        <p>🏆 Уровень ${g.level || 1}</p>
                        <button onclick="joinGuild('${g.id}')">Вступить</button>
                    </div>
                `).join('') : '<p>Гильдий пока нет</p>'}
            </div>
        `;

        document.getElementById('create-guild-btn').onclick = showCreateGuildModal;
    } else {
        const guildDoc = await db.collection('guilds').doc(user.guildId).get();
        if (!guildDoc.exists) {
            await updateUser({ guildId: null });
            loadGuildScreen();
            return;
        }
        const guild = { id: guildDoc.id, ...guildDoc.data() };
        store.guild = guild;
        renderGuildPage(guild);

        store.listeners.guild = db.collection('guilds').doc(user.guildId).onSnapshot(doc => {
            if (doc.exists) {
                const updatedGuild = { id: doc.id, ...doc.data() };
                store.guild = updatedGuild;
                renderGuildPage(updatedGuild);
            }
        });
    }
}

function renderGuildPage(guild) {
    const container = document.getElementById('guild-view');
    const isLeader = guild.leaderId === store.authUser.uid;

    const bosses = ['boss1', 'boss2'];
    const currentBossIndex = bosses.indexOf(guild.bossId);
    const nextBoss = bosses[(currentBossIndex + 1) % bosses.length];
    const prevBoss = bosses[(currentBossIndex - 1 + bosses.length) % bosses.length];

    container.innerHTML = `
        <h1 id="guild-title" style="cursor: pointer;">🏰 ${guild.name} (ур. ${guild.level})</h1>

        <div id="guild-info-panel" class="guild-info-panel hidden">
            <h3>📋 Информация о гильдии</h3>
            <p><strong>Название:</strong> ${guild.name}</p>
            <p><strong>Уровень:</strong> ${guild.level}</p>
            <p><strong>Описание:</strong> ${guild.description || '—'}</p>
            <p><strong>Лидер:</strong> ${guild.leaderId}</p>
            <h4>Участники (${guild.members?.length || 0} / ${guild.maxMembers || 20})</h4>
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
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="invite-friend-btn" class="glow-button" style="flex:1;">📨 Пригласить</button>
                <button id="leave-guild-btn" class="glow-button" style="flex:1; background:#b33e3e;">🚪 Покинуть</button>
            </div>
        </div>

        <p style="text-align: right; color: #aaa; margin-top: -10px;">
            👥 Участников: ${guild.members?.length || 1} / ${guild.maxMembers || 20}
        </p>

        <div id="boss-battle-area">
            ${renderBossBattle(guild, prevBoss, nextBoss)}
        </div>

        ${isLeader && !guild.battleActive ? `
            <div style="display: flex; justify-content: center; margin: 20px 0;">
                <button id="start-battle-btn" class="glow-button">⚔️ Начать сражение</button>
            </div>
        ` : ''}

        <div id="talent-selector"></div>

        <div style="position: sticky; bottom: 10px; left: 0; margin-top: 20px;">
            <button onclick="showGuildRating()" class="glow-button" style="width: auto; padding: 10px 20px;">🏆 Рейтинг</button>
        </div>
    `;

    document.getElementById('guild-title').onclick = () => {
        document.getElementById('guild-info-panel').classList.toggle('hidden');
    };

    document.getElementById('leave-guild-btn')?.addEventListener('click', () => leaveGuild(guild.id));
    document.getElementById('invite-friend-btn')?.addEventListener('click', showInviteMenu);

    if (isLeader && !guild.battleActive) {
        document.getElementById('start-battle-btn').onclick = () => startBattle(guild.id);
    }

    // ✅ Обновляем кнопки талантов, если бой активен
    if (guild.battleActive) {
        createBattleTalentButtons();
    }
}

function renderBossBattle(guild, prevBoss, nextBoss) {
    const isBattleActive = guild.battleActive;
    const hpPercent = isBattleActive ? (guild.bossHp / guild.maxBossHp) * 100 : 100;
    let stage = 1;
    if (hpPercent <= 33) stage = 3;
    else if (hpPercent <= 66) stage = 2;
    const bossImageUrl = `https://via.placeholder.com/150/8B0000/FFFFFF?text=${guild.bossId}_${stage}`;

    let remainingSeconds = 0;
    if (isBattleActive && guild.battleEndTime) {
        remainingSeconds = Math.max(0, Math.floor((guild.battleEndTime - Date.now()) / 1000));
    }

    return `
        <div class="boss-wrapper">
            ${!isBattleActive ? `
                <button class="boss-arrow" onclick="changeBoss('${prevBoss}')" ${isBattleActive ? 'disabled' : ''}>◀</button>
            ` : ''}

            <div class="boss-container">
                <h3>${guild.bossId}</h3>
                <img class="boss-image" src="${bossImageUrl}" onclick="attackBoss()">
                ${isBattleActive ? `
                    <div class="boss-hp-bar">
                        <div class="boss-hp-fill" style="width: ${hpPercent}%;"></div>
                    </div>
                    <div class="boss-hp-text">${guild.bossHp} / ${guild.maxBossHp}</div>
                    <div id="battle-timer">⏳ ${remainingSeconds}с</div>
                ` : ''}
            </div>

            ${!isBattleActive ? `
                <button class="boss-arrow" onclick="changeBoss('${nextBoss}')" ${isBattleActive ? 'disabled' : ''}>▶</button>
            ` : ''}
        </div>

        ${guild.bossId === 'boss2' ? `
            <div class="boss-keys">🔑 Ключи для босса 2: ${guild.keys?.boss2 || 0} / 3</div>
        ` : ''}
    `;
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

// ---------- Исправлено: запуск таймера битвы ----------
async function startBattle(guildId) {
    const guildRef = db.collection('guilds').doc(guildId);
    try {
        let battleEndTime;
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            const guild = guildDoc.data();
            if (guild.battleActive) throw new Error('Битва уже идёт');
            if (guild.leaderId !== store.authUser.uid) throw new Error('Только лидер может начать битву');

            if (guild.bossId === 'boss2') {
                const keys = guild.keys?.boss2 || 0;
                if (keys < 3) throw new Error('Недостаточно ключей для босса 2');
                transaction.update(guildRef, {
                    'keys.boss2': firebase.firestore.FieldValue.increment(-3)
                });
            }

            battleEndTime = Date.now() + 120000; // 2 минуты
            transaction.update(guildRef, {
                battleActive: true,
                battleEndTime,
                bossHp: guild.maxBossHp,
                damageLog: {}
            });
        });

        // ✅ Запускаем таймер битвы
        startBattleTimer(battleEndTime, guildId);

        await updateUser({ selectedTalent: null });
        createBattleTalentButtons();
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось начать битву');
    }
}

function startBattleTimer(endTime, guildId) {
    if (store.listeners.battleTimer) clearInterval(store.listeners.battleTimer);
    store.listeners.battleTimer = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.floor(remaining / 1000);
        const timerDiv = document.getElementById('battle-timer'); // ищем каждый раз
        if (timerDiv) timerDiv.innerText = `⏳ ${seconds}с`;
        if (seconds <= 0) {
            clearInterval(store.listeners.battleTimer);
            store.listeners.battleTimer = null;
            endBattle(false, guildId);
        }
    }, 1000);
}

window.attackBoss = async function() {
    const user = await getUser();
    if (!user.selectedTalent) {
        showNotification('Талант не выбран', 'Кликни по таланту, чтобы выбрать');
        return;
    }
    if (!store.guild?.battleActive) {
        showNotification('Битва не активна', '');
        return;
    }

    const currentEnergy = getCurrentEnergy();
    if (currentEnergy < 1) {
        showNotification('Нет энергии', 'Подожди восстановления');
        return;
    }

    const guildRef = db.collection('guilds').doc(store.guild.id);
    const userRef = db.collection('users').doc(store.authUser.uid);
    let damage = 0;

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            const userDoc = await transaction.get(userRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            if (!userDoc.exists) throw new Error('Пользователь не найден');

            const guild = guildDoc.data();
            const userData = userDoc.data();

            if (!guild.battleActive) throw new Error('Битва уже закончилась');
            if (getCurrentEnergy(userData) < 1) throw new Error('Недостаточно энергии');

            let talentType = user.selectedTalent;

            if (['basic', 'critical', 'poison'].includes(talentType)) {
                const charges = userData.attackCharges[talentType]?.charges;
                if (!charges || charges <= 0) throw new Error('Нет зарядов');

                const newCharges = { ...userData.attackCharges };
                newCharges[talentType].charges--;
                transaction.update(userRef, { attackCharges: newCharges });

                if (talentType === 'basic') {
                    damage = userData.talents.basic.damage;
                } else if (talentType === 'critical') {
                    damage = userData.talents.basic.damage;
                    if (Math.random() < userData.talents.critical.chance) {
                        damage *= 2;
                    }
                } else if (talentType === 'poison') {
                    const dmg = userData.talents.poison.damage;
                    const dur = talentsConfig.poison.getDuration(userData.talents.poison.level);
                    startPoisonEffect(dmg, dur);
                    damage = 0;
                }
            } else if (['sonic', 'fire', 'ice'].includes(talentType)) {
                const crafted = userData.craftedTalents[talentType];
                if (!crafted.charges) throw new Error('Нет зарядов');
                const newCrafted = { ...userData.craftedTalents };
                newCrafted[talentType].charges--;
                transaction.update(userRef, { craftedTalents: newCrafted });
                damage = crafted.damage * (crafted.level || 1);
            }

            const newEnergy = getCurrentEnergy(userData) - 1;
            transaction.update(userRef, {
                energy: newEnergy,
                lastEnergyUpdate: Date.now()
            });

            if (damage > 0) {
                const newHp = guild.bossHp - damage;
                transaction.update(guildRef, {
                    bossHp: newHp,
                    [`damageLog.${store.authUser.uid}`]: firebase.firestore.FieldValue.increment(damage)
                });

                if (newHp <= 0) {
                    transaction.update(guildRef, {
                        battleActive: false,
                        battleEndTime: null
                    });
                }
            }
        });

        await loadUserFromFirestore(true);
        createBattleTalentButtons();
        updateMainUI();

        if (damage > 0) {
            const icon = getTalentIcon(user.selectedTalent);
            showDamageEffect(damage, icon);
        }

        // ✅ Убрали повторный вызов endBattle — он вызывается из таймера или при достижении 0 HP в транзакции

        hapticFeedback('heavy');
    } catch (e) {
        console.error('Ошибка атаки:', e);
        showNotification('Ошибка', e.message || 'Не удалось атаковать');
        if (e.message.includes('Нет зарядов')) {
            await updateUser({ selectedTalent: null });
            createBattleTalentButtons();
        }
    }
};

async function endBattle(victory, guildId) {
    if (!store.guild || store.guild.id !== guildId) return;
    const guildRef = db.collection('guilds').doc(guildId);

    // Останавливаем таймер, если он ещё работает
    if (store.listeners.battleTimer) {
        clearInterval(store.listeners.battleTimer);
        store.listeners.battleTimer = null;
    }

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) return;
            const guild = guildDoc.data();
            if (!guild.battleActive) return;

            const damageLog = guild.damageLog || {};

            let resultMessage = victory ? '🎉 ПОБЕДА!\n\n' : '💀 ПОРАЖЕНИЕ...\n\n';
            if (victory) {
                resultMessage += 'Награды:\n• +500 🪙 каждому\n• +100 рейтинга гильдии\n';
                if (guild.bossId === 'boss1') resultMessage += '• +1 ключ 🔑\n';
                else resultMessage += '• +2 ключа 🔑\n';
            }
            resultMessage += '\n📊 Урон участников:\n';

            const userIds = Object.keys(damageLog);
            const userSnapshots = await Promise.all(userIds.map(uid => db.collection('users').doc(uid).get()));
            const userNames = {};
            userSnapshots.forEach((doc, idx) => {
                if (doc.exists) userNames[userIds[idx]] = doc.data().name || userIds[idx];
            });

            for (const [uid, dmg] of Object.entries(damageLog)) {
                const name = userNames[uid] || uid.slice(0, 6);
                resultMessage += `• ${name}: ${dmg} урона\n`;
            }

            setTimeout(() => showNotification('Результат битвы', resultMessage), 100);

            if (victory) {
                const rewardMoney = 500;
                const rewardRating = 100;
                const rewardKeys = guild.bossId === 'boss1' ? 1 : 2;

                transaction.update(guildRef, {
                    battleActive: false,
                    bossHp: guild.maxBossHp,
                    rating: firebase.firestore.FieldValue.increment(rewardRating),
                    'keys.boss2': firebase.firestore.FieldValue.increment(rewardKeys),
                    damageLog: {}
                });

                const members = guild.members || [];
                members.forEach(memberId => {
                    const memberRef = db.collection('users').doc(memberId);
                    transaction.update(memberRef, {
                        money: firebase.firestore.FieldValue.increment(rewardMoney)
                    });
                });
            } else {
                transaction.update(guildRef, {
                    battleActive: false,
                    bossHp: guild.maxBossHp,
                    damageLog: {}
                });
            }
        });

        if (victory) {
            const guildSnap = await guildRef.get();
            const updatedGuild = guildSnap.data();
            const newLevel = Math.floor((updatedGuild.rating || 0) / 100) + 1;
            await guildRef.update({ level: newLevel });
        }
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
                    members: firebase.firestore.FieldValue.arrayRemove(store.authUser.uid)
                });
            }
            transaction.update(userRef, { guildId: null });
        });

        await loadUserFromFirestore(true);
        loadGuildScreen();
        showNotification('Успех', 'Вы покинули гильдию.');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось покинуть гильдию');
    }
}

window.removeFromGuild = async function(guildId, memberId) {
    const user = await getUser();
    const guildRef = db.collection('guilds').doc(guildId);
    const memberRef = db.collection('users').doc(memberId);

    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            const guild = guildDoc.data();
            if (guild.leaderId !== store.authUser.uid) throw new Error('Только лидер может удалять');
            if (memberId === store.authUser.uid) throw new Error('Нельзя удалить себя');

            transaction.update(guildRef, {
                members: firebase.firestore.FieldValue.arrayRemove(memberId)
            });
            transaction.update(memberRef, { guildId: null });
        });

        showNotification('Успех', 'Участник удалён');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось удалить участника');
    }
};

// =======================================================
// ДРУЗЬЯ (без изменений)
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
    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(store.authUser.uid);
            const friendRef = db.collection('users').doc(fromId);
            const requestRef = db.collection('friendRequests').doc(requestId);

            transaction.update(userRef, {
                friends: firebase.firestore.FieldValue.arrayUnion(fromId)
            });
            transaction.update(friendRef, {
                friends: firebase.firestore.FieldValue.arrayUnion(store.authUser.uid)
            });
            transaction.delete(requestRef);
        });

        await loadUserFromFirestore(true);
        loadFriendsScreen();
        showNotification('Друг добавлен', '');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', 'Не удалось принять заявку');
    }
};

window.declineFriendRequest = async function(requestId) {
    await db.collection('friendRequests').doc(requestId).delete();
    loadFriendsScreen();
};

window.removeFriend = async function(friendId) {
    const user = await getUser();
    if (!user.friends.includes(friendId)) return;

    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(store.authUser.uid);
            const friendRef = db.collection('users').doc(friendId);
            transaction.update(userRef, {
                friends: firebase.firestore.FieldValue.arrayRemove(friendId)
            });
            transaction.update(friendRef, {
                friends: firebase.firestore.FieldValue.arrayRemove(store.authUser.uid)
            });
        });

        store.user.friends = store.user.friends.filter(id => id !== friendId);
        loadFriendsScreen();
        showNotification('Удалён', 'Пользователь удалён из друзей');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', 'Не удалось удалить друга');
    }
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

    switch (screenId) {
        case 'workshop':
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'character';
            if (activeTab === 'character') loadCharacterCustomization();
            if (activeTab === 'pets') loadPetsGrid();
            if (activeTab === 'talents') {
                initTalentsTab();
            }
            break;
        case 'guild':
            loadGuildScreen();
            break;
        case 'friends':
            loadFriendsScreen();
            break;
    }
}

// =======================================================
// ТЕСТОВЫЕ ДАННЫЕ (добавлено поле damage)
// =======================================================
async function initTestData() {
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
}

// =======================================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// =======================================================
window.onload = async () => {
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled rejection:', event.reason);
    });

    if (!navigator.onLine) {
        showNotification('Нет интернета', 'Игра требует подключения к сети.');
        return;
    }

    try {
        await initAuth();
        await initTestData();
        await getUser();
        updateMainUI();

        setupTalentsGlobalListeners();

        document.getElementById('confirm-create-guild').onclick = async () => {
            const name = document.getElementById('guild-name').value.trim();
            const desc = document.getElementById('guild-desc').value.trim();
            if (!name) {
                showNotification('Ошибка', 'Введите название гильдии');
                return;
            }
            hideCreateGuildModal();
            await createGuild(name, desc);
        };
        document.getElementById('cancel-create-guild').onclick = hideCreateGuildModal;

        document.getElementById('character-container').onclick = onCharacterClick;

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => showScreen(btn.dataset.screen);
        });

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
                initTalentsTab();
            }
        });

        document.querySelector('.slot-selector').addEventListener('click', (e) => {
            const slotBtn = e.target.closest('.slot-btn');
            if (!slotBtn) return;
            document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
            slotBtn.classList.add('active');
            currentCustomizationSlot = slotBtn.dataset.slot;
            renderItemsForSlot(currentCustomizationSlot);
        });

        setInterval(() => {
            updateMainUI();
        }, 60000);

        console.log('✅ Игра готова');
    } catch (e) {
        console.error('Ошибка инициализации:', e);
        showNotification('Ошибка', 'Не удалось загрузить игру. Попробуйте позже.');
    }
};

// =======================================================
// ЭКСПОРТ ГЛОБАЛЬНЫХ ФУНКЦИЙ
// =======================================================
window.buyItem = window.buyItem;
window.equipItem = window.equipItem;
window.previewItem = window.previewItem;
window.buyPet = window.buyPet;
window.activatePet = window.activatePet;
window.buyCharges = window.buyCharges;
window.upgradeTalent = window.upgradeTalent;
window.craftTalent = window.craftTalent;
window.selectBattleTalent = window.selectBattleTalent;
window.attackBoss = window.attackBoss;
window.joinGuild = window.joinGuild;
window.leaveGuild = leaveGuild;
window.startBattle = window.startBattle;
window.changeBoss = window.changeBoss;
window.showGuildRating = window.showGuildRating;
window.removeFriend = window.removeFriend;
window.sendFriendRequest = window.sendFriendRequest;
window.acceptFriendRequest = window.acceptFriendRequest;
window.declineFriendRequest = window.declineFriendRequest;
window.copyToClipboard = window.copyToClipboard;
window.removeFromGuild = window.removeFromGuild;
window.showCreateGuildModal = window.showCreateGuildModal;
window.hideCreateGuildModal = window.hideCreateGuildModal;
