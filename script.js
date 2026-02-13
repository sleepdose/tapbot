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
// РАБОТА С ПОЛЬЗОВАТЕЛЕМ (с полями талантов и telegramId)
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
            telegramId: tg.initDataUnsafe.user?.id || null,
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
        let needsUpdate = false;

        if (!data.telegramId) {
            data.telegramId = tg.initDataUnsafe.user?.id || null;
            needsUpdate = true;
        }
        if (!data.talents) { data.talents = defaultTalents.talents; needsUpdate = true; }
        if (!data.attackCharges) { data.attackCharges = defaultTalents.attackCharges; needsUpdate = true; }
        if (!data.craftedTalents) { data.craftedTalents = defaultTalents.craftedTalents; needsUpdate = true; }
        if (data.selectedTalent === undefined) { data.selectedTalent = null; needsUpdate = true; }

        if (needsUpdate) {
            await userRef.update({
                telegramId: data.telegramId,
                talents: data.talents,
                attackCharges: data.attackCharges,
                craftedTalents: data.craftedTalents,
                selectedTalent: data.selectedTalent
            });
        }

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

// Карта логических слотов: физические слоты -> логический слот
// Это позволяет обрабатывать слоты типа 'jeans' и 'boots' как один логический слот 'legs'.
const logicalSlotMap = {
    hat: 'head',
    shirt: 'body',
    jeans: 'legs',
    boots: 'legs'
};

/**
 * Возвращает логический слот для физического слота предмета.
 * @param {string} physicalSlot - Пример: 'jeans', 'hat'.
 * @returns {string} - Пример: 'legs', 'head'.
 */
function getLogicalSlot(physicalSlot) {
    return logicalSlotMap[physicalSlot] || physicalSlot; // Если нет в мапе, возвращаем как есть
}

/**
 * Находит текущий экипированный предмет в *том же логическом слоте*, что и переданный физический слот.
 * @param {Object} user - Объект пользователя из store.user.
 * @param {string} physicalSlot - Физический слот проверяемого предмета (например, 'boots').
 * @returns {Object|null} - Возвращает экипированный предмет или null.
 */
function findCurrentItemInLogicalSlot(user, physicalSlot) {
    const logicalSlot = getLogicalSlot(physicalSlot);
    const currentEquipment = user.equipped;

    for (const equippedSlotKey in currentEquipment) {
        const equippedItem = currentEquipment[equippedSlotKey];
        // Проверяем, если предмет экипирован И его физический слот принадлежит тому же логическому слоту
        if (equippedItem && getLogicalSlot(equippedSlotKey) === logicalSlot) {
            return { slot: equippedSlotKey, item: equippedItem }; // Возвращаем и слот, и предмет
        }
    }
    return null; // Нет экипированного предмета в этой логической группе
}

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
            .where('slot', 'in', ['jeans', 'boots']); // ИСПРАВЛЕНО: 'je ans'
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
        // Проверяем, является ли *этот* конкретный предмет экипированным
        const isEquipped = user.equipped[item.slot]?.id === item.id;

        // Определяем, есть ли уже предмет в *логическом* слоте
        const currentItemInLogicalSlot = findCurrentItemInLogicalSlot(user, item.slot);

        // ★ ИЗМЕНЕНО: Логика кнопки
        let buttonText = 'Купить';
        let buttonAction = `buyItem('${item.id}')`;
        let isDisabled = false;

        if (isOwned) {
            if (isEquipped) {
                // Если это именно экипированный предмет, кнопка "Снять"
                buttonText = 'Снять';
                buttonAction = `unequipItem('${item.slot}')`;
            } else if (currentItemInLogicalSlot) {
                // Если в логическом слоте *уже* есть предмет (но не этот), кнопка "Выбрать" для переключения
                buttonText = 'Выбрать';
                // При выборе нового предмета, старый в той же группе снимется внутри equipItem
                buttonAction = `equipItem('${item.id}', '${item.slot}')`;
            } else {
                // Если логический слот свободен, обычная кнопка "Выбрать"
                buttonText = 'Выбрать';
                buttonAction = `equipItem('${item.id}', '${item.slot}')`;
            }
        } else {
             // Для не купленных предметов
             buttonText = `Купить ${item.price} 🪙`;
             // Цена отображается отдельно
        }

        return `
             <div class="item-card" data-item-id="${item.id}" data-slot="${item.slot}" data-image="${item.imageUrl}">
                 <img src="${item.imageUrl}" alt="${item.name}" onclick="previewItem('${item.id}')">
                 <span>${item.name}</span>
                ${!isOwned ? `<span class="item-price">${item.price} 🪙</span>` : ''}
                 <button onclick="${buttonAction}" ${isDisabled ? 'disabled' : ''}>${buttonText}</button>
             </div>
        `;
    }).join('');
}
window.previewItem = function(itemId) {
    previewItemId = itemId;
    updatePreviewCharacter(store.user);
};
// ========== СНЯТЬ ЭКИПИРОВКУ ==========
window.unequipItem = async function(slot) {
    const user = await getUser();
    if (!user.equipped[slot]) {
        showNotification('Ошибка', 'В этом слоте ничего не надето');
        return;
    }
    const updates = {
        equipped: { ...user.equipped, [slot]: null }
    };
    await updateUser(updates);

    previewItemId = null;
    updatePreviewCharacter(user);
    await renderItemsForSlot(currentCustomizationSlot);
    updateMainUI();
    hapticFeedback();
};
// =======================================================
// ПОКУПКА ЭКИПИРОВКИ
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
            if (inventory.some(inv => inv.id === itemId)) {
                throw new Error('Предмет уже есть в инвентаре');
            }

            const inventoryItem = {
                id: String(itemId),
                name: String(item.name || ''),
                type: String(item.type || ''),
                slot: String(item.slot || ''),
                price: typeof item.price === 'number' ? item.price : 0,
                imageUrl: String(item.imageUrl || ''),
                damage: typeof item.damage === 'number' ? item.damage : 0,
                instanceId: `${Date.now()}_${Math.random()}`
            };

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
        updateMainUI();
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
    // ★ ИСПРАВЛЕНО: Перед экипировкой снимаем предметы из той же логической группы
    const logicalTargetSlot = getLogicalSlot(targetSlot);
    const updates = { equipped: { ...user.equipped } };

    // Проходим по всем экипированным слотам и снимаем те, что принадлежат той же логической группе
    for (const equippedSlotKey in updates.equipped) {
        if (getLogicalSlot(equippedSlotKey) === logicalTargetSlot && updates.equipped[equippedSlotKey]) {
            updates.equipped[equippedSlotKey] = null; // Снимаем текущий предмет из группы
        }
    }

    // Теперь экипируем новый предмет
    updates.equipped[targetSlot] = inventoryItem;

    await updateUser(updates);
    previewItemId = null;
    updatePreviewCharacter(user);
    await renderItemsForSlot(currentCustomizationSlot); // Обновляем список после экипировки
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
            if (inventory.some(inv => inv.id === petId)) {
                throw new Error('Питомец уже есть в инвентаре');
            }

            const inventoryItem = {
                id: String(petId),
                name: String(pet.name || ''),
                type: String(pet.type || ''),
                price: typeof pet.price === 'number' ? pet.price : 0,
                imageUrl: String(pet.imageUrl || ''),
                instanceId: `${Date.now()}_${Math.random()}`
            };

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
        updateMainUI();
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
// СИСТЕМА ТАЛАНТОВ И КРАФТА
// =======================================================
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
function initTalentsTab() {
    renderBuyChargesUI();
    updateTalentUI();
}
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
// ГИЛЬДИИ — СИСТЕМА РЕЙТИНГА И МОДАЛЬНОЕ ОКНО РЕЗУЛЬТАТОВ
// =======================================================
// --- Функция показа модального окна с результатами битвы ---
function showBattleResultModal(victory, damageLog, userNames, guildName) {
    const modal = document.getElementById('battle-result-modal');
    const title = document.getElementById('battle-result-title');
    const content = document.getElementById('battle-result-content');
    title.textContent = victory ? '🎉 Победа!' : '💀 Поражение';
    title.style.color = victory ? '#ffd966' : '#ff8a8a';

    let html = `<p style="margin-bottom: 12px; color: #aaa;">🏰 ${guildName}</p>`;
    html += '<table style="width:100%; border-collapse: collapse; color: #e0e0e0;">';
    html += '<tr style="border-bottom: 1px solid #4a4a4a;"><th style="text-align:left; padding: 6px 0;">Игрок</th><th style="text-align:right; padding: 6px 0;">Урон</th></tr>';

    const entries = Object.entries(damageLog).sort((a,b) => b[1] - a[1]);

    if (entries.length === 0) {
        html += '<tr><td colspan="2" style="text-align:center; padding: 20px;">Никто не нанёс урон</td></tr>';
    } else {
        for (const [uid, dmg] of entries) {
            const name = userNames[uid] || uid.slice(0, 6);
            html += `<tr>
                         <td style="text-align:left; padding: 6px 0;">${name}</td>
                         <td style="text-align:right; padding: 6px 0; color: #ffaa00;">${dmg}</td>
                     </tr>`;
        }
    }

    html += '</table>';
    content.innerHTML = html;
    modal.classList.remove('hidden');
}
// --- Модальное окно создания гильдии ---
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
        maxMembers: 20,
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
    if (store.listeners.guild) {
        store.listeners.guild();
        store.listeners.guild = null;
    }
    // Очищаем *все* активные таймеры битв при переключении с вкладки гильдии
    for (let key in store.listeners) {
        if (key.startsWith('battleTimer_') && store.listeners[key]) {
            console.log("Очищаем таймер битвы при переключении вкладки:", key);
            clearInterval(store.listeners[key]);
            store.listeners[key] = null;
        }
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
    // Инициализация полей для старых гильдий
    guild.level = guild.level ?? 1;
    guild.rating = guild.rating ?? 0;

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
             <p><strong>Рейтинг:</strong> ${guild.rating}</p>
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

         <!-- УДАЛЕНО: дублирующая строка с количеством участников -->

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
    const bossImageUrl = `img/boss1.png`;
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

            battleEndTime = Date.now() + 120000;
            transaction.update(guildRef, {
                battleActive: true,
                battleEndTime,
                bossHp: guild.maxBossHp,
                damageLog: {}
            });
        });

        // Сбрасываем метку завершённого боя для этой гильдии при начале новой
        finishedBattles.delete(guildId);

        startBattleTimer(battleEndTime, guildId);
        await updateUser({ selectedTalent: null });
        createBattleTalentButtons();
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось начать битву');
    }
}
// =======================================================
// ЗАВЕРШЕНИЕ БИТВЫ — ИСПРАВЛЕННАЯ ВЕРСИЯ (НЕ ЗАВИСИТ ОТ store.guild, КОРРЕКТНОЕ ВЗАИМОДЕЙСТВИЕ С ТАЙМЕРОМ)
// =======================================================

// Переменная для отслеживания завершённых битв (локально в сессии)
// Это поможет избежать повторных попыток завершения одного и того же боя в этой вкладке
const finishedBattles = new Set();

function startBattleTimer(endTime, guildId) {
    // Очищаем предыдущий таймер для этой гильдии, если он был
    const previousTimerKey = `battleTimer_${guildId}`;
    if (store.listeners[previousTimerKey]) {
        clearInterval(store.listeners[previousTimerKey]);
        console.log("Предыдущий таймер боя очищен перед запуском нового.");
    }

    // Используем уникальный ключ для таймера этой гильдии
    const timerKey = `battleTimer_${guildId}`;

    // Запускаем новый таймер
    store.listeners[timerKey] = setInterval(() => {
        // Проверяем, не был ли бой уже завершён в этой сессии
        if (finishedBattles.has(guildId)) {
            console.log("Таймер обнаружил, что бой уже завершён, останавливается.");
            clearInterval(store.listeners[timerKey]);
            store.listeners[timerKey] = null;
            return; // Выходим из коллбэка таймера
        }

        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.floor(remaining / 1000);
        const timerDiv = document.getElementById('battle-timer');
        if (timerDiv) {
            timerDiv.innerText = `⏳ ${seconds}с`;
            // Обновляем цвет таймера при приближении к концу (по желанию)
            if (seconds <= 10) {
                timerDiv.style.color = '#ff6b6b'; // Красный цвет
            } else {
                timerDiv.style.color = '#ffd966'; // Жёлтый цвет по умолчанию
            }
        }
        if (seconds <= 0) {
            console.log("Таймер истёк, вызываем endBattle для guildId:", guildId);
            clearInterval(store.listeners[timerKey]);
            store.listeners[timerKey] = null; // Очищаем ссылку
            endBattle(false, guildId); // Вызываем endBattle с guildId
        }
    }, 1000); // Обновляем каждую секунду

    console.log("Таймер боя запущен для гильдии", guildId);
}

async function endBattle(victory, guildId) {
    // 1️⃣ Проверяем, не завершали ли мы этот бой ранее в этой сессии
    if (finishedBattles.has(guildId)) {
        console.log("Бой для гильдии", guildId, "уже был обработан в этой сессии.");
        return;
    }

    // 1️⃣ Помечаем бой как завершённый до выполнения транзакции
    finishedBattles.add(guildId);

    // 1️⃣ Останавливаем таймер, если он был запущен в контексте текущей сессии для этой гильдии
    // Используем специфичный ключ для таймера гильдии
    const timerKey = `battleTimer_${guildId}`;
    if (store.listeners[timerKey]) {
        clearInterval(store.listeners[timerKey]);
        store.listeners[timerKey] = null;
        console.log("Таймер боя остановлен при завершении (endBattle).");
    } else {
        console.log("Таймер боя не был активен в этой сессии при вызове endBattle.");
    }

    const guildRef = db.collection('guilds').doc(guildId);
    let success = false;
    let damageLog = {};
    let userNames = {};
    let guildName = '';
    let finalRating = 0; // Для модального окна
    let finalLevel = 1;  // Для модального окна

    console.log(`Попытка завершить бой для гильдии ${guildId}. Победа: ${victory}`);

    // 2️⃣ Пытаемся выполнить транзакцию до 3 раз (на случай конфликта)
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await db.runTransaction(async (transaction) => {
                const guildDoc = await transaction.get(guildRef);
                if (!guildDoc.exists) throw new Error('Гильдия не найдена');

                const guild = guildDoc.data();

                // Если бой уже не активен — ничего не делаем
                if (!guild.battleActive) {
                    console.log("Транзакция: Бой уже не активен, выход.");
                    success = false; // Не помечаем как успешный
                    return; // Прерываем транзакцию
                }

                // Сохраняем данные для модального окна
                damageLog = guild.damageLog || {};
                guildName = guild.name;

                const userIds = Object.keys(damageLog);
                // Используем getAll для более эффективного получения документов
                const userRefs = userIds.map(uid => db.collection('users').doc(uid));
                const userSnapshots = await db.getAll(...userRefs);
                userSnapshots.forEach((doc, idx) => {
                    if (doc.exists) {
                        // Используем имя пользователя, если есть, иначе ID
                        userNames[userIds[idx]] = doc.data().name || userIds[idx];
                    } else {
                        // На всякий случай, если юзер не найден
                        userNames[userIds[idx]] = userIds[idx];
                    }
                });

                // Подготавливаем обновления для гильдии
                const updates = {
                    battleActive: false,
                    bossHp: guild.maxBossHp, // Сброс HP босса
                    damageLog: {} // Очистка лога урона
                };

                if (victory) {
                    // 🏆 Рейтинг +10, уровень пересчитывается
                    const newRating = (guild.rating || 0) + 10;
                    updates.rating = newRating;
                    updates.level = Math.floor(newRating / 100) + 1;

                    // Сохраняем финальные значения для модального окна
                    finalRating = updates.rating;
                    finalLevel = updates.level;

                    // 🔑 Ключ для босса 2 (только при победе над боссом 1)
                    if (guild.bossId === 'boss1') {
                        updates['keys.boss2'] = firebase.firestore.FieldValue.increment(1);
                    }

                    // 💰 Награда всем, кто нанёс урон
                    for (const uid of userIds) {
                        const memberRef = db.collection('users').doc(uid);
                        transaction.update(memberRef, {
                            money: firebase.firestore.FieldValue.increment(1000) // Награда 1000 монет
                        });
                    }
                } else {
                     // В случае поражения также сохраняем текущий рейтинг и уровень
                     finalRating = guild.rating || 0;
                     finalLevel = guild.level || 1;
                }

                transaction.update(guildRef, updates);
                success = true; // помечаем, что транзакция успешно выполнена
                console.log("Транзакция: Обновления применены успешно.");
            });

            if (success) {
                 console.log("Бой успешно завершён в Firestore.");
                 break; // успешно – выходим из цикла
            } else {
                console.log("Транзакция: Бой уже был завершён кем-то другим или не активен.");
                 // Если бой уже завершили, всё равно можно попытаться показать результаты,
                 // если мы их успели получить. Но в данном случае, если success=false,
                 // значит бой уже не был активен на момент начала транзакции.
                 // В реальности это может означать, что другой участник тоже вызвал endBattle
                 // одновременно, и одна из транзакций проиграла. Это нормальное поведение.
                 // Удаляем из finishedBattles, так как бой не был завершён этой вкладкой
                 finishedBattles.delete(guildId);
                 return; // Прерываем дальнейшие попытки и показ модального окна
            }
        } catch (error) {
            console.error(`❌ Попытка ${attempt} завершения битвы не удалась:`, error);
            // Возвращаем метку в Set, если транзакция не удалась, чтобы можно было повторить
            finishedBattles.delete(guildId);
            if (attempt === 3) {
                showNotification('Ошибка', 'Не удалось завершить битву. Попробуйте позже.');
                // Удаляем метку, так как окончательно не удалось
                finishedBattles.delete(guildId);
                return; // Выходим после последней неудачной попытки
            }
            // Небольшая задержка перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Увеличиваем задержку с каждой попыткой
        }
    }

    // 3️⃣ Если транзакция успешна – показываем результаты
    // Показываем модальное окно независимо от того, была ли вкладка гильдии открыта
    if (success) {
        console.log("Показываем модальное окно результата боя.");
        // Обновляем store.guild, если он был для этой гильдии, чтобы UI отразил изменения
        if (store.guild && store.guild.id === guildId) {
            // Просто обновим флаг, чтобы renderGuildPage знал, что бой закончен
            // Лучше всего обновить store.guild через подписку, если она активна,
            // но если нет, просто вызовем renderGuildPage напрямую с новыми данными
            // Однако подписка должна сработать. Проверим.
            // console.log("store.guild до обновления:", store.guild);
            // loadGuildScreen(); // Это перезагрузит данные из Firestore и обновит UI
            // renderGuildPage({...store.guild, battleActive: false}); // Пример ручного обновления
            // Лучше дать подписке сработать. Просто покажем модальное окно.
        }
        showBattleResultModal(victory, damageLog, userNames, `${guildName} (ур. ${finalLevel}, рейт. ${finalRating})`);
    } else {
          console.log("Бой не был завершён, модальное окно не показывается.");
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
// ДРУЗЬЯ — ИСПРАВЛЕН ПОИСК ПО TELEGRAM ID
// =======================================================
async function loadFriendsScreen() {
    const user = await getUser();
    const container = document.getElementById('friends-view');
    if (!container) return;
    const myIdHtml = `
         <div class="my-id-card">
             <span>🆔 Ваш Telegram ID: </span>
             <strong>${user.telegramId || 'Не указан'}</strong>
             <button class="copy-btn" onclick="copyToClipboard('${user.telegramId || ''}')">📋 Копировать</button>
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
                     <span>${f.name || 'Игрок'} (ID: ${f.telegramId || f.id.slice(0,6)})</span>
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

        const currentUser = await getUser();
        if (searchId === currentUser.telegramId) {
            showNotification('Ошибка', 'Это вы сами');
            return;
        }

        const userQuery = await db.collection('users')
            .where('telegramId', '==', searchId)
            .get();

        if (!userQuery.empty) {
            const foundUserDoc = userQuery.docs[0];
            const foundUser = foundUserDoc.data();
            const resultDiv = document.getElementById('search-result');
            resultDiv.innerHTML = `
                 <div class="friend-item">
                     <span>${foundUser.name || foundUser.telegramId || searchId}</span>
                     <button onclick="sendFriendRequest('${foundUserDoc.id}')">➕ Добавить</button>
                 </div>
            `;
        } else {
            showNotification('Не найден', 'Пользователь с таким Telegram ID не найден');
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
// ТЕСТОВЫЕ ДАННЫЕ
// =======================================================
async function initTestData() {
    const clothesSnap = await db.collection('shop_items').where('type', '==', 'clothes').limit(1).get();
    if (clothesSnap.empty) {
        const items = [
            { name: 'Ковбойская шляпа', type: 'clothes', slot: 'hat', price: 100, imageUrl: 'img/skin1.png', damage: 0 },
            { name: 'Бейсболка', type: 'clothes', slot: 'hat', price: 80, imageUrl: 'img/skin2.png', damage: 0 },
            { name: 'Кожаная куртка', type: 'clothes', slot: 'shirt', price: 200, imageUrl: 'img/skin6.png', damage: 0 },
            { name: 'Джинсы', type: 'clothes', slot: 'jeans', price: 150, imageUrl: 'img/skin5.png', damage: 0 },
            { name: 'Спортивки', type: 'clothes', slot: 'boots', price: 120, imageUrl: 'img/skin4.png', damage: 0 }
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
window.onload = async () => { // ИСПРАВЛЕНО: async
    // Получаем элементы прелоадера и основного приложения
    const preloader = document.getElementById('preloader');
    const appElement = document.getElementById('app');

    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled rejection during startup:', event.reason);
        // Опционально: показать ошибку пользователю через прелоадер
        const loaderContent = preloader.querySelector('.preloader-content');
        loaderContent.innerHTML = '<span class="preloader-error">Ошибка загрузки. Проверьте подключение.</span>';
        // Все равно скрываем прелоадер через некоторое время, чтобы показать сообщение
        setTimeout(() => {
            preloader.classList.add('hidden');
            appElement.style.display = 'block';
        }, 3000);
    });
    if (!navigator.onLine) {
        showNotification('Нет интернета', 'Игра требует подключения к сети.');
        // Скрыть прелоадер, показать сообщение
        const loaderContent = preloader.querySelector('.preloader-content');
        loaderContent.innerHTML = '<span class="preloader-error">Нет интернета!</span>';
        setTimeout(() => {
            preloader.classList.add('hidden');
            appElement.style.display = 'block';
        }, 3000);
        return;
    }

    try {
        console.log('Запуск инициализации...');
        await initAuth();
        await initTestData();
        await getUser();
        updateMainUI();

        setupTalentsGlobalListeners();

        // --- Остальная инициализация ---
        // (скопируйте сюда весь код, который был внутри старой window.onload после инициализации)
        // Например:
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

        // Закрытие модального окна результатов битвы
        document.getElementById('close-battle-result').onclick = () => {
            document.getElementById('battle-result-modal').classList.add('hidden');
        };

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
            if ( tab === 'pets') loadPetsGrid();
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
        // --- Конец остальной инициализации ---

        // Успешно завершена инициализация
        console.log('Инициализация завершена успешно.');
        // Скрываем прелоадер
        preloader.classList.add('hidden');
        // Показываем основное приложение (если оно было скрыто стилями)
        appElement.style.display = 'block';

    } catch (e) {
        console.error('Ошибка инициализации:', e);
        // Показываем ошибку в прелоадере
        const loaderContent = preloader.querySelector('.preloader-content');
        loaderContent.innerHTML = '<span class="preloader-error">Ошибка загрузки игры.</span>';
        // Опционально: через N секунд всё равно скрыть прелоадер и показать основное приложение
        setTimeout(() => {
            preloader.classList.add('hidden');
            appElement.style.display = 'block';
        }, 3000);
        // showNotification('Ошибка', 'Не удалось загрузить игру. Попробуйте позже.'); // Может быть не видно, если прелоадер активен
    }
};
// =======================================================
// ЭКСПОРТ ГЛОБАЛЬНЫХ ФУНКЦИЙ
// =======================================================
window.buyItem = window.buyItem;
window.equipItem = window.equipItem;
window.unequipItem = window.unequipItem;   // ✅ ДОБАВЛЕНО
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
