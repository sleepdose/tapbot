// =======================================================
// ГЛОБАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ TELEGRAM, FIREBASE, АУТЕНТИФИКАЦИЯ
// =======================================================
if (!window.Telegram || !window.Telegram.WebApp) {
    console.error('Telegram WebApp SDK не загружен или недоступен. Игра должна запускаться внутри Telegram.');
    alert('Ошибка: Игра должна запускаться через Telegram бота.');
    throw new Error('Telegram SDK недоступен.');
}

const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Функция установки аватара пользователя из Telegram
function setUserAvatar() {
    const user = tg.initDataUnsafe?.user;
    const avatarImg = document.getElementById('avatar-img');
    if (!avatarImg) return;

    if (user && user.photo_url) {
        avatarImg.src = user.photo_url;
    } else {
        // Если фото нет – показываем инициалы
        avatarImg.style.display = 'none';
        const avatarDiv = document.getElementById('user-avatar');
        const initials = user ? (user.first_name?.[0] || '').toUpperCase() : '?';
        const span = document.createElement('span');
        span.className = 'avatar-initials';
        span.textContent = initials;
        avatarDiv.appendChild(span);
    }
}

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
    },
    activePoisonEffects: {}, // { "guildId_userId_timestamp": { interval, timerInterval, userId, guildId, damage, endTime, duration } }
    battleResult: {
        visible: false,
        victory: false,
        damageLog: {},
        userNames: {},
        guildName: '',
        rating: 0,
        level: 0,
        timestamp: 0
    },
    lastTalentUse: 0
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

// [NEW] Сохранить результат битвы в store и sessionStorage
function setBattleResult(victory, damageLog, userNames, guildName, rating, level, timestamp) {
    store.battleResult = {
        visible: true,
        victory,
        damageLog,
        userNames,
        guildName,
        rating,
        level,
        timestamp
    };
    sessionStorage.setItem('battleResult', JSON.stringify(store.battleResult));
}

// [NEW] Восстановить результат из sessionStorage при загрузке страницы
function restoreBattleResultFromStorage() {
    const saved = sessionStorage.getItem('battleResult');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.visible) {
                store.battleResult = parsed;
            }
        } catch (e) {
            console.warn('Не удалось восстановить результат битвы', e);
        }
    }
}

// [NEW] Функция управления видимостью модалки
function updateBattleResultModalVisibility() {
    const modal = document.getElementById('battle-result-modal');
    const guildScreenActive = document.getElementById('screen-guild').classList.contains('active');

    if (store.battleResult.visible && guildScreenActive) {
        // Заполняем модалку данными из store
        const title = document.getElementById('battle-result-title');
        const content = document.getElementById('battle-result-content');
        const res = store.battleResult;

        title.textContent = res.victory ? '🎉 Победа!' : '💀 Поражение';
        title.style.color = res.victory ? '#ffd966' : '#ff8a8a';

        let html = '<table style="width:100%; border-collapse: collapse; color: #e0e0e0;">';
        html += '<tr style="border-bottom: 1px solid #4a4a4a;"><th style="text-align:left; padding: 6px 0;">Игрок</th><th style="text-align:right; padding: 6px 0;">Урон</th></tr>';

        const entries = Object.entries(res.damageLog).sort((a,b) => b[1] - a[1]);
        if (entries.length === 0) {
            html += '<tr><td colspan="2" style="text-align:center; padding: 20px;">Никто не нанёс урон</td></tr>';
        } else {
            for (const [uid, dmg] of entries) {
                const name = res.userNames[uid] || uid.slice(0, 6);
                html += `<tr><td style="text-align:left; padding: 6px 0;">${name}</td><td style="text-align:right; padding: 6px 0; color: #ffaa00;">${dmg}</td></tr>`;
            }
        }
        html += '</table>';
        content.innerHTML = html;

        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
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
    selectedTalent: null,
    preferredBoss: 'boss1',
    level: 1,
    xp: 0,
    totalDamage: 0
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
        // Создание нового пользователя
        const newUser = {
            id: uid,
            name: tg.initDataUnsafe.user?.first_name || 'Игрок',
            telegramId: String(tg.initDataUnsafe.user?.id || ''),
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
            battleResultsSeen: {},
            ...defaultTalents
        };
        await userRef.set(newUser);
        store.user = newUser;
        return store.user;
    }

    const data = doc.data();
    let needsUpdate = false;

    // Приведение telegramId к строке
    if (data.telegramId !== undefined && data.telegramId !== null) {
        if (typeof data.telegramId !== 'string') {
            data.telegramId = String(data.telegramId);
            needsUpdate = true;
        }
    } else {
        data.telegramId = String(tg.initDataUnsafe.user?.id || '');
        needsUpdate = true;
    }

    // Добавление недостающих полей талантов
    if (!data.talents) { data.talents = defaultTalents.talents; needsUpdate = true; }
    if (!data.attackCharges) { data.attackCharges = defaultTalents.attackCharges; needsUpdate = true; }
    if (!data.craftedTalents) { data.craftedTalents = defaultTalents.craftedTalents; needsUpdate = true; }
    if (data.selectedTalent === undefined) { data.selectedTalent = null; needsUpdate = true; }
    if (!data.preferredBoss) { data.preferredBoss = 'boss1'; needsUpdate = true; }
    if (!data.battleResultsSeen) { data.battleResultsSeen = {}; needsUpdate = true; }
    if (data.level === undefined) { data.level = 1; needsUpdate = true; }
    if (data.xp === undefined) { data.xp = 0; needsUpdate = true; }
    if (data.totalDamage === undefined) { data.totalDamage = 0; needsUpdate = true; }

    // --- ВОССТАНОВЛЕНИЕ ЭНЕРГИИ ---
    const now = Date.now();
    const originalEnergy = data.energy || 0;
    const originalLastUpdate = data.lastEnergyUpdate || now;

    const deltaSeconds = Math.floor((now - originalLastUpdate) / 1000);
    const newEnergy = Math.min(data.maxEnergy || 100, originalEnergy + deltaSeconds);

    const energyChanged = (newEnergy !== originalEnergy) || (now - originalLastUpdate > 5000);

    if (energyChanged) {
        data.energy = newEnergy;
        data.lastEnergyUpdate = now;
        needsUpdate = true;
    }

    // Если есть что обновлять в Firestore
    if (needsUpdate) {
        const updateData = {
            telegramId: data.telegramId,
            talents: data.talents,
            attackCharges: data.attackCharges,
            craftedTalents: data.craftedTalents,
            selectedTalent: data.selectedTalent,
            preferredBoss: data.preferredBoss,
            battleResultsSeen: data.battleResultsSeen,
            energy: data.energy,
            lastEnergyUpdate: data.lastEnergyUpdate,
            level: data.level,
            xp: data.xp,
            totalDamage: data.totalDamage
        };
        await userRef.update(updateData);
    }

    // Сохраняем в store
    store.user = data;
    return store.user;
}
async function updateUser(updates) {
    if (!store.user || !store.authUser) return;
    const userRef = db.collection('users').doc(store.authUser.uid);
    await userRef.update(updates);
    Object.assign(store.user, updates);
    updateMainUI();
    updateFriendsOnlineCount(); // Обновляем счётчик друзей после изменения
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
    // Обновляем уровень на аватарке
    const avatarLevel = document.getElementById('avatar-level');
    if (avatarLevel) avatarLevel.textContent = user.level;

    const eqLayer = document.getElementById('equipment-layer');
    const petLayer = document.getElementById('pet-layer');
    if (eqLayer) eqLayer.innerHTML = '';
    if (petLayer) petLayer.innerHTML = '';

    const slots = ['hat', 'shirt', 'jeans', 'boots'];
    const addedLogicalSlots = new Set();

    slots.forEach(slot => {
        if (user.equipped[slot]) {
            const logicalSlot = getLogicalSlot(slot);
            if (!addedLogicalSlots.has(logicalSlot)) {
                const img = document.createElement('img');
                img.src = user.equipped[slot].imageUrl;
                img.classList.add(slot);
                eqLayer?.appendChild(img);
                addedLogicalSlots.add(logicalSlot);
            } else {
                console.warn(`Обнаружен дубль для логического слота ${logicalSlot} (физический слот ${slot}), пропускаем.`);
            }
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

const logicalSlotMap = {
    hat: 'head',
    shirt: 'body',
    jeans: 'legs',
    boots: 'legs'
};

function getLogicalSlot(physicalSlot) {
    return logicalSlotMap[physicalSlot] || physicalSlot;
}

function findCurrentItemInLogicalSlot(user, physicalSlot) {
    const logicalSlot = getLogicalSlot(physicalSlot);
    const currentEquipment = user.equipped;
    for (const equippedSlotKey in currentEquipment) {
        const equippedItem = currentEquipment[equippedSlotKey];
        if (equippedItem && getLogicalSlot(equippedSlotKey) === logicalSlot) {
            return { slot: equippedSlotKey, item: equippedItem };
        }
    }
    return null;
}

async function loadCharacterCustomization() {
    const user = await getUser();
    const container = document.getElementById('tab-character');
    if (!container) return;
    previewItemId = null;
    updatePreviewCharacter(user);
    await renderItemsForSlot(currentCustomizationSlot);
}

// =======================================================
// МАСТЕРСКАЯ — предпросмотр
// =======================================================
function updatePreviewCharacter(user) {
    const eqLayer = document.getElementById('preview-equipment');
    if (!eqLayer) return;
    eqLayer.innerHTML = '';
    const slots = ['hat', 'shirt', 'jeans', 'boots'];
    const addedLogicalSlots = new Set();

    slots.forEach(slot => {
        if (user.equipped[slot]) {
            const logicalSlot = getLogicalSlot(slot);
            if (!addedLogicalSlots.has(logicalSlot)) {
                const img = document.createElement('img');
                img.src = user.equipped[slot].imageUrl;
                img.classList.add(slot);
                eqLayer.appendChild(img);
                addedLogicalSlots.add(logicalSlot);
            } else {
                console.warn(`Предпросмотр: дубль для логического слота ${logicalSlot} (физический слот ${slot}), пропускаем.`);
            }
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

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-msg">Нет доступных предметов</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const isOwned = user.inventory.some(inv => inv.id === item.id);
        const isEquipped = user.equipped[item.slot]?.id === item.id;
        const currentItemInLogicalSlot = findCurrentItemInLogicalSlot(user, item.slot);
        let buttonText = 'Купить';
        let buttonAction = `buyItem('${item.id}')`;
        let isDisabled = false;

        if (isOwned) {
            if (isEquipped) {
                buttonText = 'Снять';
                buttonAction = `unequipItem('${item.slot}')`;
            } else if (currentItemInLogicalSlot) {
                buttonText = 'Выбрать';
                buttonAction = `equipItem('${item.id}', '${item.slot}')`;
            } else {
                buttonText = 'Выбрать';
                buttonAction = `equipItem('${item.id}', '${item.slot}')`;
            }
        } else {
             buttonText = `Купить ${item.price} 🪙`;
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
    const logicalTargetSlot = getLogicalSlot(targetSlot);
    const updates = { equipped: { ...user.equipped } };

    for (const equippedSlotKey in updates.equipped) {
        if (getLogicalSlot(equippedSlotKey) === logicalTargetSlot && updates.equipped[equippedSlotKey]) {
            updates.equipped[equippedSlotKey] = null;
        }
    }

    updates.equipped[targetSlot] = inventoryItem;
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
    sonic: {
        baseDamage: 50,
        recipe: ['basic', 'critical'],
        damageFormula: (basicLevel, critLevel) => 50 + (basicLevel + critLevel) * 5
    },
    fire: {
        baseDamage: 75,
        recipe: ['critical', 'poison'],
        damageFormula: (critLevel, poisonLevel) => 75 + (critLevel + poisonLevel) * 8
    },
    ice: {
        baseDamage: 60,
        recipe: ['poison', 'basic'],
        damageFormula: (poisonLevel, basicLevel) => 60 + (poisonLevel + basicLevel) * 6
    }
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

// =======================================================
// 🆕 ФУНКЦИЯ СОЗДАНИЯ КНОПОК ТАЛАНТОВ
// =======================================================
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
            html += `<button class="talent-btn ${isSelected ? 'active' : ''}" data-talent="${type}" onclick="selectBattleTalent('${type}')">
                <span class="talent-icon">${getTalentIcon(type)}</span>
                <span class="talent-name">${getTalentName(type)}</span>
                <span class="talent-charges">${charges}</span>
            </button>`;
        }
    });

    Object.entries(user.craftedTalents).forEach(([type, data]) => {
        if (data.charges > 0) {
            const isSelected = user.selectedTalent === type;
            html += `<button class="talent-btn ${isSelected ? 'active' : ''}" data-talent="${type}" onclick="selectBattleTalent('${type}')">
                <span class="talent-icon">${getTalentIcon(type)}</span>
                <span class="talent-name">${getTalentName(type)}</span>
                <span class="talent-charges">${data.charges}</span>
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
// 🆕 НОВАЯ СИСТЕМА МНОЖЕСТВЕННЫХ ЭФФЕКТОВ ЯДА (для всех игроков)
// =======================================================

function startPoisonEffect(damagePerSec, duration, guildId, userId) {
    if (!guildId || !userId) return;
    if (store.guild?.id !== guildId) return; // защита от устаревших вызовов

    const effectId = `${guildId}_${userId}_${Date.now()}`;
    const endTime = Date.now() + duration * 1000;

    const timerInterval = setInterval(() => {
        updatePoisonTimers(guildId);
    }, 200);

    let ticks = duration;
    const damageInterval = setInterval(async () => {
        if (!store.guild?.battleActive || store.guild?.id !== guildId || ticks <= 0) {
            clearInterval(damageInterval);
            clearInterval(timerInterval);
            delete store.activePoisonEffects[effectId];
            updatePoisonTimers(guildId);
            return;
        }

        const guildRef = db.collection('guilds').doc(guildId);
        await guildRef.update({
            bossHp: firebase.firestore.FieldValue.increment(-damagePerSec),
            [`damageLog.${userId}`]: firebase.firestore.FieldValue.increment(damagePerSec)
        });

        showDamageEffect(damagePerSec, '☠️');

        const guildDoc = await guildRef.get();
        if (guildDoc.exists) {
            const guild = guildDoc.data();
            if (guild.bossHp <= 0) {
                await endBattle(true, guildId);
            }
        }

        ticks--;
    }, 1000);

    store.activePoisonEffects[effectId] = {
        interval: damageInterval,
        timerInterval,
        userId,
        guildId,
        damage: damagePerSec,
        endTime,
        duration
    };

    updatePoisonTimers(guildId);
}

function updatePoisonTimers(guildId) {
    if (store.guild?.id !== guildId) return;
    const container = document.getElementById('poison-timer-container');
    if (!container) return;

    const effects = Object.values(store.activePoisonEffects).filter(e => e.guildId === guildId);

    if (effects.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 5px;">';
    effects.forEach(eff => {
        const remaining = Math.max(0, Math.floor((eff.endTime - Date.now()) / 1000));
        html += `<div style="background: #2a3a4a; padding: 6px; border-radius: 20px; font-size: 13px;">
                    ☠️ Игрок: ${eff.userId.slice(0,6)} — урон ${eff.damage}/с, ост. ${remaining}с
                 </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function stopPoisonEffectsForGuild(guildId) {
    Object.keys(store.activePoisonEffects).forEach(effectId => {
        const eff = store.activePoisonEffects[effectId];
        if (eff.guildId === guildId) {
            clearInterval(eff.interval);
            clearInterval(eff.timerInterval);
            delete store.activePoisonEffects[effectId];
        }
    });
    updatePoisonTimers(guildId);
}

function stopPoisonEffectsForOtherGuilds(currentGuildId) {
    Object.keys(store.activePoisonEffects).forEach(effectId => {
        const eff = store.activePoisonEffects[effectId];
        if (eff.guildId !== currentGuildId) {
            clearInterval(eff.interval);
            clearInterval(eff.timerInterval);
            delete store.activePoisonEffects[effectId];
        }
    });
    updatePoisonTimers(currentGuildId);
}

// =======================================================
// ГИЛЬДИИ — СИСТЕМА РЕЙТИНГА И МОДАЛЬНОЕ ОКНО РЕЗУЛЬТАТОВ
// =======================================================

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
        stopPoisonEffectsForOtherGuilds(user.guildId);

        const guildDoc = await db.collection('guilds').doc(user.guildId).get();
        if (!guildDoc.exists) {
            await updateUser({ guildId: null });
            loadGuildScreen();
            return;
        }
        const guild = { id: guildDoc.id, ...guildDoc.data() };
        store.guild = guild;
        renderGuildPage(guild);

        store.listeners.guild = db.collection('guilds').doc(user.guildId).onSnapshot(async (doc) => {
            if (doc.exists) {
                const updatedGuild = { id: doc.id, ...doc.data() };
                store.guild = updatedGuild;
                renderGuildPage(updatedGuild);

                if (updatedGuild.battleActive && updatedGuild.battleEndTime < Date.now()) {
                    endBattle(false, updatedGuild.id);
                }

                if (updatedGuild.lastBattleResult) {
                    const res = updatedGuild.lastBattleResult;
                    if (res.participants && res.participants.includes(store.authUser.uid)) {
                        const currentUser = await getUser();
                        const seenTimestamp = currentUser.battleResultsSeen?.[updatedGuild.id];
                        if (!seenTimestamp || seenTimestamp < res.timestamp) {
                            setBattleResult(
                                res.victory,
                                res.damageLog,
                                res.userNames,
                                updatedGuild.name,
                                updatedGuild.rating,
                                updatedGuild.level,
                                res.timestamp
                            );
                            updateBattleResultModalVisibility();

                            await loadUserFromFirestore(true);
                            updateMainUI();
                        }
                    }
                }
            }
        });
    }
    updateBattleResultModalVisibility();
}

function getLevelFromXP(xp) {
    return Math.floor(xp / 100) + 1;
}
function getXPForLevel(level) {
    return (level - 1) * 100;
}
function getXPProgress(user) {
    const currentLevelXP = getXPForLevel(user.level);
    const nextLevelXP = getXPForLevel(user.level + 1);
    const xpInThisLevel = user.xp - currentLevelXP;
    const neededForNext = nextLevelXP - currentLevelXP;
    return { xpInThisLevel, neededForNext, progress: (xpInThisLevel / neededForNext) * 100 };
}

async function renderGuildPage(guild) {
    const container = document.getElementById('guild-view');
    const isLeader = guild.leaderId === store.authUser.uid;
    guild.level = guild.level ?? 1;
    guild.rating = guild.rating ?? 0;

    const currentLevel = guild.level || 1;
    const rating = guild.rating || 0;
    const nextLevelRating = currentLevel * 100;
    const progress = rating % 100;
    const toNextLevel = nextLevelRating - rating;
    const expBarHtml = `
        <div style="margin: 15px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 14px; color: #ccc;">
                <span>Текущий рейтинг: ${rating}</span>
                <span>Уровень ${currentLevel}</span>
            </div>
            <div class="exp-bar-container" style="width: 100%; height: 16px; background: #2a2a2a; border-radius: 8px; overflow: hidden; margin: 5px 0;">
                <div class="exp-bar-fill" style="width: ${progress}%;" data-progress="${Math.round(progress)}"></div>
            </div>
            <div style="text-align: right; font-size: 13px; color: #aaa;">
                До уровня ${currentLevel + 1}: осталось ${toNextLevel} очков
            </div>
        </div>
    `;

    const user = store.user;
    const isBattleActive = guild.battleActive;
    const displayedBossId = isBattleActive ? guild.bossId : (user.preferredBoss || 'boss1');
    const canAccessBoss2 = (guild.keys?.boss2 || 0) >= 3;

    container.innerHTML = `
         <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="width: 100px;"></div>
            <h1 id="guild-title" style="cursor: pointer; text-align: center; margin: 0;">${guild.name}</h1>
            <button onclick="showGuildRating()" class="glow-button" style="width: auto; padding: 8px 16px;">🏆 Рейтинг</button>
         </div>

         <div id="guild-info-panel" class="guild-info-panel hidden">
             <h3>📋 Информация о гильдии</h3>
             <p><strong>Описание:</strong> ${guild.description || '—'}</p>
             <p><strong>Лидер:</strong> ${guild.leaderId}</p>
             ${expBarHtml}
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

         <div id="boss-battle-area">
            ${renderBossBattle(guild, displayedBossId, canAccessBoss2, isLeader)}
         </div>

        ${isLeader && !guild.battleActive && (displayedBossId !== 'boss2' || canAccessBoss2) ? `
             <div style="display: flex; justify-content: center; margin: 20px 0;">
                 <button id="start-battle-btn" class="glow-button">⚔️ Начать сражение</button>
             </div>
        ` : ''}

         <div id="talent-selector"></div>

         <div id="poison-timer-container" style="margin-top: 10px; text-align: center;"></div>
    `;

    document.getElementById('guild-title').onclick = () => {
        document.getElementById('guild-info-panel').classList.toggle('hidden');
    };

    document.getElementById('leave-guild-btn')?.addEventListener('click', () => leaveGuild(guild.id));
    document.getElementById('invite-friend-btn')?.addEventListener('click', showInviteMenu);

    if (isLeader && !guild.battleActive && (displayedBossId !== 'boss2' || canAccessBoss2)) {
        document.getElementById('start-battle-btn').onclick = () => startBattle(guild.id);
    }

    if (guild.battleActive && guild.battleEndTime) {
        const timerKey = `battleTimer_${guild.id}`;
        if (!store.listeners[timerKey]) {
            startBattleTimer(guild.battleEndTime, guild.id);
        }
        if (guild.battleEndTime < Date.now()) {
            endBattle(false, guild.id);
        }
    }

    if (guild.battleActive) {
        createBattleTalentButtons();
    }
}

function renderBossBattle(guild, currentBossId, canAccessBoss2, isLeader) {
    const isBattleActive = guild.battleActive;
    const hpPercent = isBattleActive ? (guild.bossHp / guild.maxBossHp) * 100 : 100;

    let bossImageUrl = `img/${currentBossId}.JPG`;
    if (isBattleActive && guild.bossHp / guild.maxBossHp <= 0.5) {
        bossImageUrl = `img/${currentBossId}_half.JPG`;
    }

    let remainingSeconds = 0;
    if (isBattleActive && guild.battleEndTime) {
        remainingSeconds = Math.max(0, Math.floor((guild.battleEndTime - Date.now()) / 1000));
    }

    const showLeftArrow = !isBattleActive && currentBossId !== 'boss1';
    const showRightArrow = !isBattleActive && currentBossId !== 'boss2';

    return `
        <div class="boss-wrapper">
            ${showLeftArrow ?
                `<button class="boss-arrow" onclick="changePreferredBoss('boss1')">◀</button>` :
                '<div style="width:48px;"></div>'}

            <div class="boss-container">
                <h3>${currentBossId}</h3>
                <img class="boss-image" src="${bossImageUrl}" onclick="attackBoss()">
                ${isBattleActive ? `
                    <div class="boss-hp-bar">
                        <div class="boss-hp-fill" style="width: ${hpPercent}%;"></div>
                    </div>
                    <div class="boss-hp-text">${guild.bossHp} / ${guild.maxBossHp}</div>
                    <div id="battle-timer">⏳ ${remainingSeconds}с</div>
                ` : ''}
            </div>

            ${showRightArrow ?
                `<button class="boss-arrow" onclick="changePreferredBoss('boss2')">▶</button>` :
                '<div style="width:48px;"></div>'}
        </div>

        ${currentBossId === 'boss2' && !isBattleActive ? `
            <div class="boss-keys">🔑 Ключи для босса 2: ${guild.keys?.boss2 || 0} / 3</div>
        ` : ''}
    `;
}

window.changePreferredBoss = async function(targetBossId) {
    if (!store.guild) return;
    if (store.guild.battleActive) {
        showNotification('Ошибка', 'Нельзя сменить босса во время битвы');
        return;
    }
    await updateUser({ preferredBoss: targetBossId });
    renderGuildPage(store.guild);
};

async function startBattle(guildId) {
    const guildRef = db.collection('guilds').doc(guildId);
    const user = await getUser();
    try {
        let battleEndTime;
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            const guild = guildDoc.data();
            if (guild.battleActive) throw new Error('Битва уже идёт');
            if (guild.leaderId !== store.authUser.uid) throw new Error('Только лидер может начать битву');

            const bossId = user.preferredBoss || 'boss1';

            if (bossId === 'boss2') {
                const keys = guild.keys?.boss2 || 0;
                if (keys < 3) throw new Error('Недостаточно ключей для босса 2');
                transaction.update(guildRef, {
                    'keys.boss2': firebase.firestore.FieldValue.increment(-3)
                });
            }

            const maxBossHp = bossId === 'boss2' ? 2000 : 1000;

            battleEndTime = Date.now() + 120000;
            transaction.update(guildRef, {
                battleActive: true,
                battleEndTime,
                bossId: bossId,
                bossHp: maxBossHp,
                maxBossHp: maxBossHp,
                damageLog: {}
            });
        });

        finishedBattles.delete(guildId);
        startBattleTimer(battleEndTime, guildId);
        await updateUser({ selectedTalent: null });
        createBattleTalentButtons();
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось начать битву');
    }
}

const finishedBattles = new Set();
let isAttacking = false;

function startBattleTimer(endTime, guildId) {
    const timerKey = `battleTimer_${guildId}`;
    if (store.listeners[timerKey]) {
        console.log("Таймер для этой битвы уже работает, не создаём новый.");
        return;
    }

    store.listeners[timerKey] = setInterval(() => {
        if (finishedBattles.has(guildId)) {
            console.log("Таймер обнаружил, что бой уже завершён, останавливается.");
            clearInterval(store.listeners[timerKey]);
            store.listeners[timerKey] = null;
            return;
        }

        const remaining = Math.max(0, endTime - Date.now());
        const seconds = Math.floor(remaining / 1000);
        const timerDiv = document.getElementById('battle-timer');
        if (timerDiv) {
            timerDiv.innerText = `⏳ ${seconds}с`;
            if (seconds <= 10) {
                timerDiv.style.color = '#ff6b6b';
            } else {
                timerDiv.style.color = '#ffd966';
            }
        }
        if (seconds <= 0) {
            console.log("Таймер истёк, вызываем endBattle для guildId:", guildId);
            clearInterval(store.listeners[timerKey]);
            store.listeners[timerKey] = null;
            endBattle(false, guildId);
        }
    }, 1000);

    console.log("Таймер боя запущен для гильдии", guildId);
}

async function endBattle(victory, guildId) {
    if (finishedBattles.has(guildId)) {
        console.log("Бой для гильдии", guildId, "уже был обработан в этой сессии.");
        return;
    }

    const timerKey = `battleTimer_${guildId}`;
    if (store.listeners[timerKey]) {
        clearInterval(store.listeners[timerKey]);
        store.listeners[timerKey] = null;
        console.log("Таймер боя остановлен при завершении (endBattle).");
    }

    const guildRef = db.collection('guilds').doc(guildId);
    const guildDoc = await guildRef.get();
    if (!guildDoc.exists) {
        console.error("Гильдия не найдена");
        return;
    }
    const guild = guildDoc.data();

    if (!guild.battleActive) {
        console.log("Бой уже не активен, завершение не требуется.");
        finishedBattles.add(guildId);
        return;
    }

    const damageLog = guild.damageLog || {};
    const guildName = guild.name;
    let userNames = {};

    const userIds = Object.keys(damageLog);
    if (userIds.length > 0) {
        const userSnapshots = await Promise.all(
            userIds.map(uid => db.collection('users').doc(uid).get())
        );
        userSnapshots.forEach((doc, idx) => {
            if (doc.exists) {
                userNames[userIds[idx]] = doc.data().name || userIds[idx];
            } else {
                userNames[userIds[idx]] = userIds[idx];
            }
        });
    }

    let success = false;
    let finalRating = guild.rating || 0;
    let finalLevel = guild.level || 1;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await db.runTransaction(async (transaction) => {
                const freshGuildDoc = await transaction.get(guildRef);
                if (!freshGuildDoc.exists) throw new Error('Гильдия не найдена');
                const freshGuild = freshGuildDoc.data();

                if (!freshGuild.battleActive) {
                    console.log("Транзакция: бой уже завершён другим участником.");
                    return;
                }

                const updates = {
                    battleActive: false,
                    bossHp: freshGuild.maxBossHp,
                    damageLog: {}
                };

                if (victory) {
                    const newRating = (freshGuild.rating || 0) + 10;
                    updates.rating = newRating;
                    updates.level = Math.floor(newRating / 100) + 1;

                    if (freshGuild.bossId === 'boss1') {
                        updates['keys.boss2'] = firebase.firestore.FieldValue.increment(1);
                    }

                    const bossId = freshGuild.bossId;
                    const rewardAmount = bossId === 'boss2' ? 2000 : 1000;
                    const xpReward = bossId === 'boss2' ? 100 : 50;

                    for (const uid of userIds) {
                        const memberRef = db.collection('users').doc(uid);
                        const memberDoc = await transaction.get(memberRef);
                        if (memberDoc.exists) {
                            const memberData = memberDoc.data();
                            const newXP = (memberData.xp || 0) + xpReward;
                            const damageDealt = damageLog[uid] || 0;
                            const newTotalDamage = (memberData.totalDamage || 0) + damageDealt;
                            const updatesForMember = {
                                money: firebase.firestore.FieldValue.increment(rewardAmount),
                                xp: newXP,
                                totalDamage: newTotalDamage
                            };
                            const newLevel = getLevelFromXP(newXP);
                            if (newLevel !== (memberData.level || 1)) {
                                updatesForMember.level = newLevel;
                            }
                            transaction.update(memberRef, updatesForMember);
                        }
                    }

                    finalRating = newRating;
                    finalLevel = updates.level;
                }

                const lastBattleResult = {
                    victory: victory,
                    damageLog: damageLog,
                    userNames: userNames,
                    participants: userIds,
                    timestamp: Date.now()
                };
                updates.lastBattleResult = lastBattleResult;

                transaction.update(guildRef, updates);
                success = true;
            });

            if (success) break;
        } catch (error) {
            console.error(`❌ Попытка ${attempt} завершения битвы не удалась:`, error);
            if (attempt === 3) {
                showNotification('Ошибка', 'Не удалось завершить битву. Попробуйте позже.');
                finishedBattles.delete(guildId);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
    }

    if (success) {
        stopPoisonEffectsForGuild(guildId);
        finishedBattles.add(guildId);
    } else {
        console.log("Бой не был завершён, модальное окно не показывается.");
    }
}

// =======================================================
// АТАКА БОССА
// =======================================================
window.attackBoss = async function() {
    if (isAttacking) return;
    isAttacking = true;

    try {
        const now = Date.now();
        if (now - store.lastTalentUse < 2000) {
            return;
        }

        if (!store.guild || !store.guild.battleActive) {
            showNotification('Ошибка', 'Сейчас нет активной битвы');
            return;
        }

        const user = await getUser(true);
        const currentEnergy = getCurrentEnergy();
        if (currentEnergy < 1) {
            showNotification('Нет энергии', 'Подождите восстановления');
            return;
        }

        if (!user.selectedTalent) {
            showNotification('Ошибка', 'Сначала выберите талант для атаки');
            return;
        }

        let talentType = user.selectedTalent;
        let needResetTalent = false;

        if (user.talents[talentType]) {
            if ((user.attackCharges[talentType]?.charges || 0) <= 0) {
                needResetTalent = true;
            }
        } else if (user.craftedTalents[talentType]) {
            if ((user.craftedTalents[talentType]?.charges || 0) <= 0) {
                needResetTalent = true;
            }
        } else {
            needResetTalent = true;
        }

        if (needResetTalent) {
            await updateUser({ selectedTalent: null });
            showNotification('Заряды кончились', 'Талант сброшен, выберите другой талант');
            return;
        }

        let damage = 0;
        let talentIcon = getTalentIcon(talentType);

        if (user.talents[talentType]) {
            damage = user.talents[talentType].damage || 10;

            if (talentType === 'critical') {
                const critChance = user.talents.critical.chance;
                if (Math.random() < critChance) {
                    damage *= 2;
                    talentIcon = '💥⚡';
                }
            }
            if (talentType === 'poison') {
                const level = user.talents.poison.level;
                const dotDamage = user.talents.poison.damage;
                const duration = 5 + level;
                startPoisonEffect(dotDamage, duration, store.guild.id, store.authUser.uid);
            }

            const newCharges = { ...user.attackCharges };
            newCharges[talentType].charges -= 1;
            await updateUser({ attackCharges: newCharges });
        } else if (user.craftedTalents[talentType]) {
            const config = craftedTalentsConfig[talentType];
            const [t1, t2] = config.recipe;
            const level1 = user.talents[t1].level;
            const level2 = user.talents[t2].level;
            damage = config.damageFormula(level1, level2);

            const newCrafted = { ...user.craftedTalents };
            newCrafted[talentType].charges -= 1;
            await updateUser({ craftedTalents: newCrafted });
        }

        if (!(await spendEnergy(1))) return;

        store.lastTalentUse = now;

        const guildRef = db.collection('guilds').doc(store.guild.id);
        await guildRef.update({
            bossHp: firebase.firestore.FieldValue.increment(-damage),
            [`damageLog.${store.authUser.uid}`]: firebase.firestore.FieldValue.increment(damage)
        });

        showDamageEffect(damage, talentIcon);
        hapticFeedback('light');

        const updatedGuild = (await guildRef.get()).data();
        if (updatedGuild.bossHp <= 0) {
            await endBattle(true, store.guild.id);
        }

        createBattleTalentButtons();
    } catch (error) {
        console.error('Ошибка при атаке босса:', error);
        showNotification('Ошибка', 'Не удалось выполнить атаку');
    } finally {
        isAttacking = false;
    }
};

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

        stopPoisonEffectsForGuild(guildId);

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
// НОВАЯ СИСТЕМА ДРУЗЕЙ (МОДАЛЬНОЕ ОКНО)
// =======================================================

async function openFriendsModal() {
    const modal = document.getElementById('friends-modal');
    if (!modal) return;
    await loadFriendsList();
    await loadFriendRequests();
    updateFriendsMyId();
    modal.classList.remove('hidden');
}
function closeFriendsModal() {
    document.getElementById('friends-modal').classList.add('hidden');
}
window.openFriendsModal = openFriendsModal;

function updateFriendsMyId() {
    const user = store.user;
    if (user) {
        document.getElementById('friends-my-id-value').innerText = user.telegramId || user.id.slice(0,8);
    }
}

async function loadFriendsList() {
    const container = document.getElementById('friends-list-container');
    if (!container) return;
    const user = store.user;
    if (!user.friends || user.friends.length === 0) {
        container.innerHTML = '<p class="empty-msg">У вас пока нет друзей</p>';
        return;
    }
    const friendDocs = await Promise.all(user.friends.map(fid => db.collection('users').doc(fid).get()));
    const friends = friendDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));

    let html = '';
    for (const friend of friends) {
        const lastSeen = friend.lastEnergyUpdate || 0;
        const isOnline = Date.now() - lastSeen < 5 * 60 * 1000;
        html += `
            <div class="friend-item">
                <div class="friend-status ${isOnline ? 'online' : 'offline'}"></div>
                <div class="friend-info">
                    <div class="friend-name">${friend.name || 'Без имени'}</div>
                    <div class="friend-id">${friend.telegramId || friend.id.slice(0,8)}</div>
                </div>
                <button class="remove-friend-btn" onclick="removeFriend('${friend.id}')">❌</button>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function loadFriendRequests() {
    const container = document.getElementById('friends-requests-container');
    if (!container) return;
    const requestsSnap = await db.collection('friendRequests').where('to', '==', store.authUser.uid).get();
    const requests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (requests.length === 0) {
        container.innerHTML = '<p class="empty-msg">Нет входящих заявок</p>';
        return;
    }

    let html = '';
    for (const req of requests) {
        const fromDoc = await db.collection('users').doc(req.from).get();
        const fromName = fromDoc.exists ? fromDoc.data().name : req.from.slice(0,6);
        html += `
            <div class="friend-request">
                <span>${fromName}</span>
                <div>
                    <button class="accept" onclick="acceptFriendRequest('${req.id}', '${req.from}')">✅</button>
                    <button onclick="declineFriendRequest('${req.id}')">❌</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function updateFriendsOnlineCount() {
    if (!store.user || !store.user.friends || store.user.friends.length === 0) {
        document.getElementById('friends-online-count').textContent = '0';
        return;
    }
    let online = 0;
    for (const friendId of store.user.friends) {
        const friendDoc = await db.collection('users').doc(friendId).get();
        if (friendDoc.exists) {
            const friend = friendDoc.data();
            const lastSeen = friend.lastEnergyUpdate || 0;
            if (Date.now() - lastSeen < 5 * 60 * 1000) online++;
        }
    }
    document.getElementById('friends-online-count').textContent = online;
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
        loadFriendsList();
        loadFriendRequests();
        updateFriendsOnlineCount();
        showNotification('Друг добавлен', '');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', 'Не удалось принять заявку');
    }
};

window.declineFriendRequest = async function(requestId) {
    await db.collection('friendRequests').doc(requestId).delete();
    loadFriendRequests();
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
        loadFriendsList();
        updateFriendsOnlineCount();
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
    }
    updateBattleResultModalVisibility();
}

// =======================================================
// МОДАЛЬНОЕ ОКНО ПРОФИЛЯ
// =======================================================
function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    updateProfileModal();
    modal.classList.remove('hidden');
}
function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}
function updateProfileModal() {
    const user = store.user;
    if (!user) return;

    const avatarImg = document.getElementById('profile-avatar-img');
    const tgUser = tg.initDataUnsafe?.user;
    if (tgUser && tgUser.photo_url) {
        avatarImg.src = tgUser.photo_url;
    } else {
        avatarImg.src = '';
        avatarImg.alt = user.name?.[0] || '?';
    }

    document.getElementById('profile-name').textContent = user.name || 'Игрок';
    document.getElementById('profile-id').textContent = user.telegramId || user.id.slice(0,8);
    document.getElementById('profile-level').textContent = user.level;

    const { xpInThisLevel, neededForNext, progress } = getXPProgress(user);
    document.getElementById('profile-xp-current').textContent = xpInThisLevel;
    document.getElementById('profile-xp-next').textContent = neededForNext;
    document.getElementById('profile-xp-fill').style.width = progress + '%';
    document.getElementById('profile-damage').textContent = user.totalDamage || 0;
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

        setUserAvatar();

        setupTalentsGlobalListeners();

        restoreBattleResultFromStorage();

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

        document.getElementById('close-battle-result').onclick = async () => {
            const res = store.battleResult;
            if (res && res.visible && res.timestamp && store.guild) {
                const userRef = db.collection('users').doc(store.authUser.uid);
                await userRef.update({
                    [`battleResultsSeen.${store.guild.id}`]: res.timestamp
                });
                if (!store.user.battleResultsSeen) store.user.battleResultsSeen = {};
                store.user.battleResultsSeen[store.guild.id] = res.timestamp;
            }
            store.battleResult.visible = false;
            sessionStorage.removeItem('battleResult');
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

        if (window.energyUpdateInterval) {
            clearInterval(window.energyUpdateInterval);
        }
        window.energyUpdateInterval = setInterval(updateMainUI, 1000);

        updateBattleResultModalVisibility();

        // Инициализация модалок профиля и друзей
        document.getElementById('user-avatar').onclick = openProfileModal;
        document.getElementById('close-profile-modal').onclick = closeProfileModal;
        document.getElementById('close-friends-modal').onclick = closeFriendsModal;

        document.querySelectorAll('.friends-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.friends-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tabId = btn.dataset.tab;
                document.querySelectorAll('.friends-tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`friends-${tabId}-tab`).classList.add('active');
            });
        });

        document.getElementById('friends-search-btn').onclick = async () => {
            const searchId = document.getElementById('friends-search-input').value.trim();
            if (!searchId) return;

            const currentUser = await getUser();
            if (searchId === currentUser.telegramId) {
                showNotification('Ошибка', 'Это вы сами');
                return;
            }

            const userQuery = await db.collection('users')
                .where('telegramId', '==', searchId)
                .get();

            const resultDiv = document.getElementById('friends-search-result');
            if (!userQuery.empty) {
                const foundUserDoc = userQuery.docs[0];
                const foundUser = foundUserDoc.data();
                const lastSeen = foundUser.lastEnergyUpdate || 0;
                const isOnline = Date.now() - lastSeen < 5 * 60 * 1000;
                resultDiv.innerHTML = `
                    <div class="friend-item">
                        <div class="friend-status ${isOnline ? 'online' : 'offline'}"></div>
                        <div class="friend-info">
                            <div class="friend-name">${foundUser.name || foundUser.telegramId}</div>
                            <div class="friend-id">${foundUser.telegramId}</div>
                        </div>
                        <button onclick="sendFriendRequest('${foundUserDoc.id}')">➕ Добавить</button>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = '<p class="empty-msg">Пользователь не найден</p>';
            }
        };

        updateFriendsOnlineCount();
        setInterval(updateFriendsOnlineCount, 10000); // Обновление каждые 30 секунд

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
window.unequipItem = window.unequipItem;
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
window.showGuildRating = window.showGuildRating;
window.removeFriend = window.removeFriend;
window.sendFriendRequest = window.sendFriendRequest;
window.acceptFriendRequest = window.acceptFriendRequest;
window.declineFriendRequest = window.declineFriendRequest;
window.copyToClipboard = window.copyToClipboard;
window.removeFromGuild = window.removeFromGuild;
window.showCreateGuildModal = window.showCreateGuildModal;
window.hideCreateGuildModal = window.hideCreateGuildModal;
