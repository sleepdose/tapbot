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
    lastTalentUse: 0,
    guildEditing: false,
    guildInfoVisible: false
};

// MUSIC ADDITION: глобальная переменная для аудио
let backgroundMusic = null;

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

// Сохранить результат битвы в store и sessionStorage
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

// Восстановить результат из sessionStorage при загрузке страницы
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

// Функция управления видимостью модалки (с выделением текущего игрока)
function updateBattleResultModalVisibility() {
    const modal = document.getElementById('battle-result-modal');
    const guildScreenActive = document.getElementById('screen-guild').classList.contains('active');

    if (store.battleResult.visible && guildScreenActive) {
        const title = document.getElementById('battle-result-title');
        const content = document.getElementById('battle-result-content');
        const res = store.battleResult;

        const icon = document.getElementById('battle-result-icon');
        if (icon) icon.textContent = res.victory ? '🏆' : '💀';
        title.textContent = res.victory ? 'Победа!' : 'Поражение';
        title.style.color = res.victory ? '#ffd966' : '#ff8a8a';

        let html = '<table>';
        html += '<tr><th style="text-align:left;">Игрок</th><th style="text-align:right;">Урон</th></tr>';

        const entries = Object.entries(res.damageLog).sort((a,b) => b[1] - a[1]);
        if (entries.length === 0) {
            html += '<tr><td colspan="2" style="text-align:center; padding: 20px; color: var(--text-secondary);">Никто не нанёс урон</td></tr>';
        } else {
            for (const [uid, dmg] of entries) {
                const name = res.userNames[uid] || uid.slice(0, 6);
                const isCurrentUser = uid === store.authUser?.uid;
                const medal = entries.indexOf(entries.find(e => e[0] === uid)) === 0 ? '🥇 ' : '';
                const highlightClass = isCurrentUser ? ' class="current-user-row"' : '';
                html += `<tr${highlightClass}><td style="text-align:left;">${medal}${name}</td><td style="text-align:right;">${dmg}</td></tr>`;
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
    totalDamage: 0,
    skin: null // ДОБАВЛЕНО поле для цельного скина
};

// Конфигурация ежедневных бонусов — только монеты (без энергии)
const dailyBonusConfig = [
    { day: 1, reward: { money: 100 } },
    { day: 2, reward: { money: 150 } },
    { day: 3, reward: { money: 200 } },
    { day: 4, reward: { money: 250 } },
    { day: 5, reward: { money: 300 } },
    { day: 6, reward: { money: 350 } },
    { day: 7, reward: { money: 500 } }
];

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

    const tgUser = tg.initDataUnsafe?.user;
    const currentPhotoUrl = tgUser?.photo_url || '';

    if (!doc.exists) {
        const newUser = {
            id: uid,
            name: tgUser?.first_name || 'Игрок',
            telegramId: String(tgUser?.id || ''),
            photoUrl: currentPhotoUrl,
            energy: 100,
            maxEnergy: 100,
            lastEnergyUpdate: Date.now(),
            money: 500,
            pets: [],
            inventory: [],
            guildId: null,
            friends: [],
            pendingRequests: [],
            battleResultsSeen: {},
            ...defaultTalents,
            dailyBonus: {
                currentDay: 1,
                lastClaim: null,
                streak: 0
            },
            musicEnabled: true,
            skin: null // ДОБАВЛЕНО
        };
        await userRef.set(newUser);
        store.user = newUser;
        return store.user;
    }

    const data = doc.data();
    let needsUpdate = false;

    if (data.telegramId !== undefined && data.telegramId !== null) {
        if (typeof data.telegramId !== 'string') {
            data.telegramId = String(data.telegramId);
            needsUpdate = true;
        }
    } else {
        data.telegramId = String(tgUser?.id || '');
        needsUpdate = true;
    }

    if (data.photoUrl !== currentPhotoUrl) {
        data.photoUrl = currentPhotoUrl;
        needsUpdate = true;
    }

    if (!data.talents) { data.talents = defaultTalents.talents; needsUpdate = true; }
    if (!data.attackCharges) { data.attackCharges = defaultTalents.attackCharges; needsUpdate = true; }
    if (!data.craftedTalents) { data.craftedTalents = defaultTalents.craftedTalents; needsUpdate = true; }
    if (data.selectedTalent === undefined) { data.selectedTalent = null; needsUpdate = true; }
    if (!data.preferredBoss) { data.preferredBoss = 'boss1'; needsUpdate = true; }
    if (!data.battleResultsSeen) { data.battleResultsSeen = {}; needsUpdate = true; }
    if (data.level === undefined) { data.level = 1; needsUpdate = true; }
    if (data.xp === undefined) { data.xp = 0; needsUpdate = true; }
    if (data.totalDamage === undefined) { data.totalDamage = 0; needsUpdate = true; }
    if (!data.dailyBonus) { data.dailyBonus = { currentDay: 1, lastClaim: null, streak: 0 }; needsUpdate = true; }
    if (data.musicEnabled === undefined) { data.musicEnabled = false; needsUpdate = true; }
    if (data.skin === undefined) { data.skin = null; needsUpdate = true; } // ДОБАВЛЕНО

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

    if (needsUpdate) {
        const updateData = {
            telegramId: data.telegramId,
            photoUrl: data.photoUrl,
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
            totalDamage: data.totalDamage,
            dailyBonus: data.dailyBonus,
            musicEnabled: data.musicEnabled,
            skin: data.skin // ДОБАВЛЕНО
        };
        await userRef.update(updateData);
    }

    store.user = data;
    return store.user;
}
async function updateUser(updates) {
    if (!store.user || !store.authUser) return;
    const userRef = db.collection('users').doc(store.authUser.uid);
    await userRef.update(updates);
    Object.assign(store.user, updates);
    updateMainUI();
    updateFriendsOnlineCount();
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
// МУЗЫКАЛЬНАЯ СИСТЕМА
// =======================================================
function initMusic() {
    if (!backgroundMusic) {
        backgroundMusic = new Audio('audio/background.mp3');
        backgroundMusic.loop = true;
        backgroundMusic.volume = 0.5;
    }
}

function playMusic() {
    if (!backgroundMusic) return;
    backgroundMusic.play().catch(e => {
        console.log('Автовоспроизведение заблокировано браузером');
    });
}

function stopMusic() {
    if (!backgroundMusic) return;
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
}

function toggleMusic() {
    if (!store.user) return;
    const newState = !store.user.musicEnabled;
    updateUser({ musicEnabled: newState }).then(() => {
        if (newState) {
            initMusic();
            playMusic();
        } else {
            stopMusic();
        }
        updateMusicToggleButton();
    });
}

function updateMusicToggleButton() {
    const btn = document.getElementById('music-toggle-btn');
    if (!btn || !store.user) return;
    btn.textContent = store.user.musicEnabled ? '🎵 Музыка: Выкл' : '🎵 Музыка: Вкл';
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
    const avatarLevel = document.getElementById('avatar-level');
    if (avatarLevel) avatarLevel.textContent = user.level;

    const baseChar = document.getElementById('base-character');
    const eqLayer = document.getElementById('equipment-layer');
    const petContainer = document.getElementById('pet-main-container');
    if (eqLayer) eqLayer.innerHTML = '';
    if (petContainer) petContainer.innerHTML = '';

    // Отображение скина, если он есть
    if (user.skin) {
        baseChar.src = user.skin.imageUrl;
    } else {
        baseChar.src = 'img/men.png';
        // Старая система экипировки удалена
    }

    if (user.pets.length > 0) {
        const activePet = user.pets[0];
        const img = document.createElement('img');
        img.src = activePet.imageUrl;
        petContainer?.appendChild(img);
    }
}
async function onCharacterClick() {
    const container = document.getElementById('character-container');
    container.classList.add('clicked');
    setTimeout(() => container.classList.remove('clicked'), 200);

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
// МАСТЕРСКАЯ — КАСТОМИЗАЦИЯ (ТЕПЕРЬ ТОЛЬКО СКИНЫ)
// =======================================================

// Функция для логического слота (оставлена для совместимости, если где-то используется)
const logicalSlotMap = {
    hat: 'head',
    shirt: 'body',
    jeans: 'legs',
    boots: 'legs'
};
function getLogicalSlot(physicalSlot) {
    return logicalSlotMap[physicalSlot] || physicalSlot;
}

// Функция для предпросмотра скина по клику на карточку
window.previewSkin = function(imageUrl) {
    const previewBase = document.getElementById('preview-base');
    if (previewBase) {
        previewBase.src = imageUrl;
        // Скрываем слоты экипировки, если они есть
        document.getElementById('preview-equipment').innerHTML = '';
    }
};

// Функция для загрузки и отображения скинов
async function renderSkins() {
    const user = await getUser();
    const container = document.getElementById('slot-items');
    if (!container) return;

    // 1. Загружаем скины из магазина (коллекция shop_items)
    const shopSnapshot = await db.collection('shop_items').where('type', '==', 'skin').get();
    const shopSkins = shopSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Получаем все скины из инвентаря пользователя
    const inventorySkins = user.inventory.filter(inv => inv.type === 'skin');

    // 3. Собираем уникальные скины по id (приоритет – данные из магазина, если есть)
    const skinsMap = new Map();

    // Сначала добавляем скины из магазина
    shopSkins.forEach(skin => skinsMap.set(skin.id, { ...skin, fromShop: true }));

    // Затем добавляем скины из инвентаря, которых нет в магазине
    inventorySkins.forEach(invSkin => {
        if (!skinsMap.has(invSkin.id)) {
            skinsMap.set(invSkin.id, {
                id: invSkin.id,
                name: invSkin.name,
                type: 'skin',
                price: invSkin.price || 0,       // у эксклюзивных цена 0
                imageUrl: invSkin.imageUrl,
                fromInventory: true
            });
        }
    });

    const allSkins = Array.from(skinsMap.values());

    if (allSkins.length === 0) {
        container.innerHTML = '<p class="empty-msg">Скины пока не доступны</p>';
        return;
    }

    // 4. Отрисовываем карточки скинов
    container.innerHTML = allSkins.map(skin => {
        const isOwned = user.inventory.some(inv => inv.id === skin.id);
        const isActive = user.skin?.id === skin.id;

        let buttonText = 'Купить';
        let buttonAction = `buySkin('${skin.id}')`;
        let disabled = false;

        if (isOwned) {
            if (isActive) {
                buttonText = 'Активен';
                disabled = true;
            } else {
                buttonText = 'Выбрать';
                buttonAction = `equipSkin('${skin.id}')`;
            }
        } else {
            buttonText = `Купить`; // цена убрана из кнопки по желанию
        }

        return `
            <div class="item-card" data-skin-id="${skin.id}" onclick="previewSkin('${skin.imageUrl}')">
                <img src="${skin.imageUrl}" alt="${skin.name}">
                <span>${skin.name}</span>
                <span class="item-price">${skin.price} 🪙</span>
                <button onclick="${buttonAction}; event.stopPropagation();" ${disabled ? 'disabled' : ''}>${buttonText}</button>
            </div>
        `;
    }).join('');

    // Обновляем превью текущего персонажа
    updatePreviewCharacter(user);
}

// Покупка скина
window.buySkin = async function(skinId) {
    if (!store.authUser) {
        showNotification('Ошибка', 'Пользователь не авторизован');
        return;
    }
    const user = await getUser();
    const skinRef = db.collection('shop_items').doc(skinId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        await db.runTransaction(async (transaction) => {
            const skinDoc = await transaction.get(skinRef);
            const userDoc = await transaction.get(userRef);
            if (!skinDoc.exists) throw new Error('Скин не найден');
            const skin = skinDoc.data();
            if (userDoc.data().money < skin.price) throw new Error('Недостаточно денег');
            const inventory = userDoc.data().inventory || [];
            if (inventory.some(inv => inv.id === skinId)) {
                throw new Error('Скин уже есть в инвентаре');
            }

            const inventoryItem = {
                id: skinId,
                name: skin.name,
                type: 'skin',
                price: skin.price,
                imageUrl: skin.imageUrl,
                instanceId: `${Date.now()}_${Math.random()}`
            };

            transaction.update(userRef, {
                money: firebase.firestore.FieldValue.increment(-skin.price),
                inventory: firebase.firestore.FieldValue.arrayUnion(inventoryItem)
            });
        });

        await loadUserFromFirestore(true);
        renderSkins();
        updateMainUI();
        showNotification('Успех', 'Скин куплен!');
        hapticFeedback();
    } catch (e) {
        console.error('Ошибка покупки скина:', e);
        showNotification('Ошибка', e.message || 'Не удалось купить скин');
    }
};

// Выбор скина (экипировка)
window.equipSkin = async function(skinId) {
    const user = await getUser();
    const skinItem = user.inventory.find(inv => inv.id === skinId);
    if (!skinItem) return;
    await updateUser({ skin: skinItem });
    renderSkins();
    updateMainUI();
    updatePreviewCharacter(user);
    hapticFeedback();
};

// Функция предпросмотра (обновлённая)
function updatePreviewCharacter(user) {
    const previewBase = document.getElementById('preview-base');
    const eqLayer = document.getElementById('preview-equipment');
    if (!previewBase || !eqLayer) return;
    eqLayer.innerHTML = '';

    if (user.skin) {
        previewBase.src = user.skin.imageUrl;
    } else {
        previewBase.src = 'img/men.png';
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
                }
            }
        });
    }
}
// =======================================================
// ПИТОМЦЫ
// =======================================================
async function loadPetsGrid() {
    const user = await getUser();
    const container = document.getElementById('pets-grid');
    if (!container) return;
    const snapshot = await db.collection('shop_items').where('type', '==', 'pet').get();
    const pets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (pets.length === 0) {
        container.innerHTML = '<p class="empty-msg">Питомцы пока не доступны</p>';
        return;
    }

    container.innerHTML = pets.map(pet => {
        const ownedItem = user.inventory.find(inv => inv.id === pet.id);
        const isActive = user.pets[0]?.id === pet.id;
        let button = '';
        if (!ownedItem) {
            button = `<button onclick="buyPet('${pet.id}')">Купить</button>`;
        } else {
            if (isActive) {
                button = `<button disabled>Активен</button>`;
            } else {
                button = `<button onclick="activatePet('${pet.id}')">Активировать</button>`;
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
// ФУНКЦИЯ СОЗДАНИЯ КНОПОК ТАЛАНТОВ
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
// НОВАЯ СИСТЕМА МНОЖЕСТВЕННЫХ ЭФФЕКТОВ ЯДА (с сохранением в Firestore)
// =======================================================

// Функция запуска эффекта из данных (используется при загрузке)
function startPoisonEffectFromData(effect, guildId) {
    const { userId, damage, endTime, duration } = effect;
    if (!guildId || !userId) return;
    if (store.guild?.id !== guildId) return;

    const effectId = `${guildId}_${userId}_${endTime}`;
    if (store.activePoisonEffects[effectId]) return; // уже запущен

    const now = Date.now();
    const remaining = Math.max(0, endTime - now);
    if (remaining <= 0) return;

    const timerInterval = setInterval(() => {
        updatePoisonTimers(guildId);
    }, 200);

    let ticks = Math.ceil(remaining / 1000);
    const damageInterval = setInterval(async () => {
        if (!store.guild?.battleActive || store.guild?.id !== guildId || ticks <= 0) {
            clearInterval(damageInterval);
            clearInterval(timerInterval);
            delete store.activePoisonEffects[effectId];
            updatePoisonTimers(guildId);
            return;
        }

        const guildRef = db.collection('guilds').doc(guildId);
        // FIX: Проверяем, жив ли ещё босс, прежде чем наносить урон
        const guildDoc = await guildRef.get();
        if (!guildDoc.exists || guildDoc.data().bossHp <= 0) {
            // Босс мёртв – останавливаем яд
            clearInterval(damageInterval);
            clearInterval(timerInterval);
            delete store.activePoisonEffects[effectId];
            updatePoisonTimers(guildId);
            return;
        }

        await guildRef.update({
            bossHp: firebase.firestore.FieldValue.increment(-damage),
            [`damageLog.${userId}`]: firebase.firestore.FieldValue.increment(damage)
        });

        showDamageEffect(damage, '☠️');

        // Проверяем, не убил ли этот тик босса (если да, вызываем endBattle)
        const updatedGuildDoc = await guildRef.get();
        if (updatedGuildDoc.exists && updatedGuildDoc.data().bossHp <= 0) {
            // Останавливаем этот яд и все остальные (вызов stopPoisonEffectsForGuild произойдёт в endBattle)
            clearInterval(damageInterval);
            clearInterval(timerInterval);
            delete store.activePoisonEffects[effectId];
            await endBattle(true, guildId);
        }

        ticks--;
    }, 1000);

    store.activePoisonEffects[effectId] = {
        interval: damageInterval,
        timerInterval,
        userId,
        guildId,
        damage,
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
    document.getElementById('guild-chat-link').value = '';
};

// Валидация ссылки
function validateUrl(url) {
    if (!url) return true; // пустая ссылка допустима
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

async function createGuild(name, description, chatLink) {
    if (name.length < 5) {
        showNotification('Ошибка', 'Название гильдии должно содержать минимум 5 символов');
        return;
    }
    if (!validateUrl(chatLink)) {
        showNotification('Ошибка', 'Ссылка на чат/канал некорректна. Введите полный URL (например, https://t.me/...)');
        return;
    }

    const user = await getUser();
    const newGuild = {
        name,
        description,
        chatLink: chatLink || '',
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
        damageLog: {},
        poisonEffects: []
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
                throw new Error('Гильдия полна');
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

function getGuildLevelAndMaxMembersFromRating(rating) {
    if (rating >= 300) {
        return { level: 3, maxMembers: 60 };
    } else if (rating >= 100) {
        return { level: 2, maxMembers: 40 };
    } else {
        return { level: 1, maxMembers: 20 };
    }
}

// ========== НОВАЯ ФУНКЦИЯ ПОКАЗА РЕЙТИНГА В МОДАЛКЕ ==========
async function showGuildRatingModal() {
    const modal = document.getElementById('guild-rating-modal');
    if (!modal) return;
    const contentDiv = document.getElementById('guild-rating-content');
    showLoader('guild-rating-content', true);
    const guildsSnap = await db.collection('guilds').orderBy('rating', 'desc').get();
    const guilds = guildsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    showLoader('guild-rating-content', false);

    if (guilds.length === 0) {
        contentDiv.innerHTML = '<p class="empty-msg">Гильдий пока нет</p>';
    } else {
        let html = '<table class="rating-table">';
        html += '<tr><th>#</th><th>Гильдия</th><th>Ур.</th><th>👥</th><th>🏆</th></tr>';
        guilds.forEach((g, index) => {
            html += `<tr>
                <td>${index + 1}</td>
                <td>${g.name}</td>
                <td>${g.level || 1}</td>
                <td>${g.members?.length || 0}</td>
                <td>${g.rating || 0}</td>
            </tr>`;
        });
        html += '</table>';
        contentDiv.innerHTML = html;
    }

    modal.classList.remove('hidden');
    document.getElementById('close-guild-rating').onclick = () => {
        modal.classList.add('hidden');
    };
}
window.showGuildRatingModal = showGuildRatingModal;

// ========== ФУНКЦИИ РЕДАКТИРОВАНИЯ ГИЛЬДИИ ==========
function toggleEditMode(event) {
    if (event) {
        event.stopPropagation();
    }
    store.guildEditing = !store.guildEditing;
    if (store.guild) {
        if (store.guildEditing) {
            store.guildInfoVisible = true;
        }
        renderGuildPage(store.guild);
    }
}

async function updateGuildInfo() {
    const guild = store.guild;
    if (!guild) return;

    const nameInput = document.getElementById('edit-guild-name');
    const descInput = document.getElementById('edit-guild-desc');
    const linkInput = document.getElementById('edit-guild-chatLink');

    const newName = nameInput.value.trim();
    const newDesc = descInput.value.trim();
    const newLink = linkInput.value.trim();

    if (newName.length < 5) {
        showNotification('Ошибка', 'Название должно быть не менее 5 символов');
        return;
    }
    if (!validateUrl(newLink)) {
        showNotification('Ошибка', 'Некорректная ссылка на чат/канал');
        return;
    }

    try {
        const guildRef = db.collection('guilds').doc(guild.id);
        await guildRef.update({
            name: newName,
            description: newDesc,
            chatLink: newLink
        });
        showNotification('Успех', 'Информация обновлена');
        store.guildEditing = false;
        const updatedDoc = await guildRef.get();
        store.guild = { id: updatedDoc.id, ...updatedDoc.data() };
        renderGuildPage(store.guild);
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', 'Не удалось обновить данные');
    }
}

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

                // Если босс умер во время атаки другого игрока, завершаем бой
                if (updatedGuild.battleActive && updatedGuild.bossHp <= 0) {
                    await endBattle(true, updatedGuild.id);
                    return; // renderGuildPage будет вызван снова после завершения
                }

                if (updatedGuild.poisonEffects && Array.isArray(updatedGuild.poisonEffects)) {
                    updatedGuild.poisonEffects.forEach(effect => {
                        startPoisonEffectFromData(effect, updatedGuild.id);
                    });
                }

                if (updatedGuild.battleActive && updatedGuild.battleEndTime < Date.now()) {
                    endBattle(false, updatedGuild.id);
                }

                if (updatedGuild.lastBattleResult) {
                    const res = updatedGuild.lastBattleResult;
                    if (store.user?.guildId === updatedGuild.id) {
                        const currentUser = await getUser();
                        const seenTimestamp = currentUser.battleResultsSeen?.[updatedGuild.id];
                        // Показываем результат, если ещё не видели И (пользователь лидер ИЛИ участник боя)
                        const isLeader = updatedGuild.leaderId === store.authUser.uid;
                        const isParticipant = res.participants && res.participants.includes(store.authUser.uid);
                        if ((!seenTimestamp || seenTimestamp < res.timestamp) && (isLeader || isParticipant)) {
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

// ========== НОВАЯ ФУНКЦИЯ ГЕНЕРАЦИИ БОЕВОГО ЭКРАНА (с изменениями) ==========
function generateBattleHTML(guild, isLeader) {
    const bossId = guild.bossId;
    const bossNames = {
        boss1: 'Лесной страж',
        boss2: 'Огненный дракон'
    };
    const bossName = bossNames[bossId] || bossId;

    // Разные фоны и картинки для боссов
    let bgImageUrl, bossImageUrl;
    if (bossId === 'boss2') {
        bgImageUrl = 'img/battle2.png';
        bossImageUrl = 'img/battleboss2.png';
    } else {
        bgImageUrl = 'img/battle1.png';
        bossImageUrl = 'img/battleboss1.png';
    }

    const hpPercent = (guild.bossHp / guild.maxBossHp) * 100;
    const remainingSeconds = Math.max(0, Math.floor((guild.battleEndTime - Date.now()) / 1000));

    let embersHTML = '';
    for (let i = 0; i < 28; i++) {
        embersHTML += `<span class="battle-ember hiko-e${i}"></span>`;
    }

    return `
        <div class="battle-view" style="background-image: url('${bgImageUrl}');">

            <!-- Вспышка при ударе -->
            <div class="battle-hit-flash" id="battle-hit-flash" style="display:none; pointer-events:none;"></div>

            <!-- Частицы-искры -->
            <div class="battle-embers" aria-hidden="true">${embersHTML}</div>

            <!-- Радиальное свечение -->
            <div class="battle-zone-glow" id="battle-zone-glow"></div>

            <!-- Расширяющиеся кольца -->
            <div class="battle-ring battle-ring-1"></div>
            <div class="battle-ring battle-ring-2"></div>
            <div class="battle-ring battle-ring-3"></div>

            <!-- Новый заголовок: название по центру, кнопка сдачи справа (только для лидера) -->
            <div class="battle-header">
                <div class="battle-header-top">
                    <div class="battle-header-left"></div> <!-- пустой слева для баланса -->
                    <div class="boss-name">${bossName}</div>
                    ${isLeader ? '<button class="surrender-btn" onclick="surrenderBattle(\'' + guild.id + '\')">⚑ Сдаться</button>' : '<div style="width:80px;"></div>'}
                </div>
                <div class="battle-header-middle">
                    <div class="hp-bar-container">
                        <div class="hp-bar-fill" id="boss-hp-fill" style="width: ${hpPercent}%;"></div>
                        <div class="hp-bar-gloss"></div>
                    </div>
                    <div class="hp-text" id="boss-hp-text">${guild.bossHp}/${guild.maxBossHp}</div>
                </div>
                <div class="battle-header-bottom">
                    <div class="timer" id="battle-timer">⏳ ${remainingSeconds}с</div>
                </div>
            </div>

            <!-- Босс без ауры -->
            <div class="boss-image-container" onclick="attackBoss()">
                <img src="${bossImageUrl}" class="boss-image" id="boss-battle-img">
            </div>

            <div class="talents-container">
                <div id="talent-selector"></div>
            </div>
        </div>
    `;
}

// ========== ФУНКЦИЯ СДАЧИ В БОЮ ==========
window.surrenderBattle = async function(guildId) {
    await endBattle(false, guildId);
};

// ========== ОБНОВЛЁННАЯ ФУНКЦИЯ РЕНДЕРИНГА ГИЛЬДИИ ==========
async function renderGuildPage(guild) {
    const container = document.getElementById('guild-view');
    const isLeader = guild.leaderId === store.authUser.uid;
    const editing = store.guildEditing;
    const guildInfoVisible = store.guildInfoVisible;
    const user = store.user;

    // Если битва активна – показываем боевой экран
    if (guild.battleActive) {
        container.innerHTML = generateBattleHTML(guild, isLeader);
        // Таймер будет обновляться в startBattleTimer
        if (guild.battleEndTime) {
            const timerKey = `battleTimer_${guild.id}`;
            if (!store.listeners[timerKey]) {
                startBattleTimer(guild.battleEndTime, guild.id);
            }
        }
        createBattleTalentButtons();
        return;
    }

    // Иначе – обычный вид гильдии
    const { level: computedLevel, maxMembers: computedMaxMembers } = getGuildLevelAndMaxMembersFromRating(guild.rating || 0);
    guild.level = computedLevel;
    guild.maxMembers = computedMaxMembers;
    guild.rating = guild.rating ?? 0;

    const currentLevel = guild.level || 1;
    const rating = guild.rating || 0;
    const progress = currentLevel === 3 ? 100 : (rating % (currentLevel === 1 ? 100 : 200)) / ((currentLevel === 1 ? 100 : 200)) * 100;
    const toNextLevel = currentLevel === 3 ? 0 : (currentLevel === 1 ? 100 - rating : 300 - rating);
    const expBarHtml = `
        <div style="margin: 15px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 14px; color: #ccc;">
                <span>Текущий рейтинг: ${rating}</span>
                <span>Уровень ${currentLevel}</span>
            </div>
            <div class="exp-bar-container" style="width: 100%; height: 16px; background: #2a2a2a; border-radius: 8px; overflow: hidden; margin: 5px 0;">
                <div class="exp-bar-fill" style="width: ${progress}%;" data-progress="${Math.round(progress)}"></div>
            </div>
            ${currentLevel < 3 ? `<div style="text-align: right; font-size: 13px; color: #aaa;">
                До уровня ${currentLevel + 1}: осталось ${toNextLevel} очков
            </div>` : '<div style="text-align: right; font-size: 13px; color: #aaa;">Максимальный уровень</div>'}
        </div>
    `;

    const displayedBossId = guild.battleActive ? guild.bossId : (user.preferredBoss || 'boss1');
    const canAccessBoss2 = (guild.keys?.boss2 || 0) >= 3;

    // Загружаем данные участников только если не в бою (уже проверили выше)
    const memberPromises = guild.members.map(async (memberId) => {
        const memberDoc = await db.collection('users').doc(memberId).get();
        if (memberDoc.exists) {
            const data = memberDoc.data();
            return {
                id: memberId,
                name: data.name || 'Без имени',
                telegramId: data.telegramId || memberId.slice(0, 6),
                level: data.level || 1,
                photoUrl: data.photoUrl || null
            };
        } else {
            return {
                id: memberId,
                name: 'Неизвестный',
                telegramId: memberId.slice(0, 6),
                level: 1,
                photoUrl: null
            };
        }
    });
    const membersData = await Promise.all(memberPromises);

    container.innerHTML = `
         <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="width: 100px;"></div>
            <h1 id="guild-title" style="cursor: pointer; text-align: center; margin: 0;">
                ${guild.name}
            </h1>
            <button onclick="showGuildRatingModal()" class="glow-button" style="width: auto; padding: 8px 16px;">🏆 Рейтинг</button>
         </div>

         <div id="guild-info-panel" class="guild-info-panel ${editing ? 'editing' : ''} ${!guildInfoVisible ? 'hidden' : ''}">
             <h3>📋 Информация о гильдии ${isLeader && !editing ? '<span class="edit-icon" onclick="toggleEditMode(event)">✏️</span>' : ''}</h3>
             ${editing ? `
                 <div class="edit-fields">
                     <input type="text" id="edit-guild-name" class="edit-input" value="${guild.name}" placeholder="Название (мин. 5 симв.)" autofocus>
                     <textarea id="edit-guild-desc" class="edit-input" placeholder="Описание">${guild.description || ''}</textarea>
                     <input type="url" id="edit-guild-chatLink" class="edit-input" value="${guild.chatLink || ''}" placeholder="Ссылка на чат/канал">
                     <div class="edit-actions">
                         <button onclick="updateGuildInfo()" class="glow-button save-btn">💾 Сохранить</button>
                         <button onclick="toggleEditMode()" class="glow-button cancel-btn">❌ Отмена</button>
                     </div>
                 </div>
             ` : `
                 <p><strong>Описание:</strong> ${guild.description || '—'}</p>
                 ${guild.chatLink ? `<p><strong>Чат/канал:</strong> <a href="${guild.chatLink}" target="_blank" style="color: #8ab3ff;">${guild.chatLink}</a></p>` : ''}
                 ${expBarHtml}
             `}

             <h4>Участники (${guild.members?.length || 0} / ${guild.maxMembers || 20})</h4>
             <ul class="member-list">
                ${membersData.map(member => {
                    const avatarHtml = member.photoUrl
                        ? `<img src="${member.photoUrl}" class="member-avatar-img" alt="avatar">`
                        : `<span class="member-avatar-initials">${member.name[0]?.toUpperCase() || '?'}</span>`;
                    const isLeaderMember = member.id === guild.leaderId;
                    const leaderStar = isLeaderMember ? ' 👑' : '';
                    const removeBtn = (editing && !isLeaderMember) ? `<button class="remove-member-btn" onclick="removeFromGuild('${guild.id}', '${member.id}')">❌ Удалить</button>` : '';
                    return `
                        <li>
                            <div style="display: flex; align-items: center; gap: 10px; flex:1;">
                                <div class="member-avatar">
                                    ${avatarHtml}
                                    <span class="member-level-badge">${member.level}</span>
                                </div>
                                <div>
                                    <div>${member.name}${leaderStar}</div>
                                    <div style="font-size: 12px; color: #aaa;">${member.telegramId}</div>
                                </div>
                            </div>
                            ${removeBtn}
                        </li>
                    `;
                }).join('') || '<li>Нет участников</li>'}
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
                 <button class="glow-button" onclick="startBattle('${guild.id}')">⚔️ Начать сражение</button>
             </div>
        ` : ''}

         <div id="talent-selector"></div>
         <div id="poison-timer-container" style="margin-top: 10px; text-align: center;"></div>
    `;

    document.getElementById('guild-title').onclick = () => {
        store.guildInfoVisible = !store.guildInfoVisible;
        const panel = document.getElementById('guild-info-panel');
        if (panel) {
            if (store.guildInfoVisible) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }
    };

    document.getElementById('leave-guild-btn')?.addEventListener('click', () => leaveGuild(guild.id));
    document.getElementById('invite-friend-btn')?.addEventListener('click', showInviteMenu);
}
function renderBossBattle(guild, currentBossId, canAccessBoss2, isLeader) {
    const isBattleActive = guild.battleActive;
    const hpPercent = isBattleActive ? (guild.bossHp / guild.maxBossHp) * 100 : 100;

    // Разделяем картинки для боя и для превью
    let bossImageUrl;
    if (isBattleActive) {
        // Боевая картинка
        bossImageUrl = currentBossId === 'boss2' ? 'img/battleboss2.png' : 'img/battleboss1.png';
    } else {
        // Картинка для предпросмотра (замените на свои файлы)
        bossImageUrl = currentBossId === 'boss2' ? 'img/boss2_preview.png' : 'img/boss1_preview.png';
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
                <img class="boss-image" src="${bossImageUrl}" ${isBattleActive ? 'onclick="attackBoss()"' : ''} style="${isBattleActive ? 'cursor: pointer;' : 'cursor: default;'}">
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
                damageLog: {},
                poisonEffects: []
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
            timerDiv.innerText = (seconds <= 30 ? '⚠️ ' : '⏳ ') + seconds + 'с';
            if (seconds <= 30) {
                timerDiv.classList.add('timer-urgent');
            } else {
                timerDiv.classList.remove('timer-urgent');
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

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ ENDBATTLE ==========
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

    stopPoisonEffectsForGuild(guildId);

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
                    damageLog: {},
                    poisonEffects: []
                };

                if (victory) {
                    const newRating = (freshGuild.rating || 0) + 10;
                    updates.rating = newRating;

                    const { level: newLevel, maxMembers: newMaxMembers } = getGuildLevelAndMaxMembersFromRating(newRating);
                    updates.level = newLevel;
                    updates.maxMembers = newMaxMembers;

                    if (freshGuild.bossId === 'boss1') {
                        updates['keys.boss2'] = firebase.firestore.FieldValue.increment(1);
                    }

                    finalRating = newRating;
                    finalLevel = newLevel;
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

            // Если транзакция успешна и победа, выдаём награды участникам
            if (victory && userIds.length > 0) {
                const bossId = guild.bossId;
                const rewardAmount = bossId === 'boss2' ? 2000 : 1000;
                const xpReward = bossId === 'boss2' ? 100 : 50;

                const batch = db.batch();
                for (const uid of userIds) {
                    const memberRef = db.collection('users').doc(uid);
                    const memberDoc = await memberRef.get();
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
                        batch.update(memberRef, updatesForMember);
                    }
                }
                await batch.commit();
            }

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
        finishedBattles.add(guildId);
    } else {
        console.log("Бой не был завершён, модальное окно не показывается.");
    }
}

// =======================================================
// АТАКА БОССА (исправленная, убрана трата энергии)
// =======================================================
window.attackBoss = async function() {
    if (isAttacking) return;
    isAttacking = true;

    try {
        const now = Date.now();
        if (now - store.lastTalentUse < 2000) return;

        if (!store.guild || !store.guild.battleActive) {
            showNotification('Ошибка', 'Сейчас нет активной битвы');
            return;
        }

        const user = await getUser(true);

        // Энергия больше не тратится при атаке босса
        // const currentEnergy = getCurrentEnergy();
        // if (currentEnergy < 1) {
        //     showNotification('Нет энергии', 'Подождите восстановления');
        //     return;
        // }

        if (!user.selectedTalent) {
            showNotification('Ошибка', 'Сначала выберите талант для атаки');
            return;
        }

        let talentType = user.selectedTalent;
        let needResetTalent = false;

        if (user.talents[talentType]) {
            if ((user.attackCharges[talentType]?.charges || 0) <= 0) needResetTalent = true;
        } else if (user.craftedTalents[talentType]) {
            if ((user.craftedTalents[talentType]?.charges || 0) <= 0) needResetTalent = true;
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
        let isPoison = false;
        let poisonDamage = 0, poisonDuration = 0;

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
                isPoison = true;
                poisonDamage = user.talents.poison.damage;
                poisonDuration = 5 + user.talents.poison.level;
            }
        } else if (user.craftedTalents[talentType]) {
            const config = craftedTalentsConfig[talentType];
            const [t1, t2] = config.recipe;
            const level1 = user.talents[t1].level;
            const level2 = user.talents[t2].level;
            damage = config.damageFormula(level1, level2);
        }

        // Энергия не тратится
        // if (!(await spendEnergy(1))) return;

        const guildRef = db.collection('guilds').doc(store.guild.id);
        let finalDamage = 0;
        let bossKilled = false;

        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            const guild = guildDoc.data();
            if (!guild.battleActive) throw new Error('Битва уже закончилась');

            const remainingHp = guild.bossHp;
            finalDamage = Math.min(damage, remainingHp);

            transaction.update(guildRef, {
                bossHp: firebase.firestore.FieldValue.increment(-finalDamage),
                [`damageLog.${store.authUser.uid}`]: firebase.firestore.FieldValue.increment(finalDamage)
            });

            // FIX: добавляем яд только если босс НЕ убит этой атакой
            if (isPoison && finalDamage > 0 && !bossKilled) {
                const endTime = Date.now() + poisonDuration * 1000;
                const poisonEffect = {
                    userId: store.authUser.uid,
                    damage: poisonDamage,
                    endTime,
                    duration: poisonDuration
                };
                transaction.update(guildRef, {
                    poisonEffects: firebase.firestore.FieldValue.arrayUnion(poisonEffect)
                });
            }

            if (guild.bossHp - finalDamage <= 0) {
                bossKilled = true;
            }
        });

        if (user.talents[talentType]) {
            const newCharges = { ...user.attackCharges };
            newCharges[talentType].charges -= 1;
            await updateUser({ attackCharges: newCharges });
        } else if (user.craftedTalents[talentType]) {
            const newCrafted = { ...user.craftedTalents };
            newCrafted[talentType].charges -= 1;
            await updateUser({ craftedTalents: newCrafted });
        }

        store.lastTalentUse = now;
        showDamageEffect(finalDamage, talentIcon);
        hapticFeedback('light');

        // FIX: останавливаем все яды для этой гильдии перед вызовом endBattle
        if (bossKilled) {
            stopPoisonEffectsForGuild(store.guild.id);
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
    const container = document.querySelector('.boss-image-container');
    if (!container) return;

    // Определяем тип удара по иконке
    let dmgType = 'normal';
    if (icon.includes('💥⚡')) dmgType = 'crit';
    else if (icon.includes('🔥')) dmgType = 'fire';
    else if (icon.includes('☠') || icon.includes('poison')) dmgType = 'poison';
    else if (icon.includes('❄') || icon.includes('ice')) dmgType = 'ice';

    // Позиция: случайная в зоне босса
    const x = 25 + Math.random() * 50;
    const y = 10 + Math.random() * 40;

    const div = document.createElement('div');
    div.className = `hiko-damage-number hiko-dmg-${dmgType}`;
    if (dmgType === 'crit') {
        div.innerHTML = `<span style="font-size:0.75em;vertical-align:middle;">✦ </span>-${amount}`;
    } else {
        div.textContent = `-${amount}`;
    }
    div.style.left = x + '%';
    div.style.top  = y + '%';
    container.style.position = 'relative';
    container.appendChild(div);
    setTimeout(() => div.remove(), 1200);

    // Тряска изображения босса
    const bossImg = document.getElementById('boss-battle-img');
    if (bossImg) {
        bossImg.classList.remove('boss-hit-shake');
        void bossImg.offsetWidth;
        bossImg.classList.add('boss-hit-shake');
        setTimeout(() => bossImg.classList.remove('boss-hit-shake'), 300);
    }

    // Вспышка экрана
    const flash = document.getElementById('battle-hit-flash');
    if (flash) {
        const colors = {
            crit:   'rgba(255,200,0,0.22)',
            fire:   'rgba(255,80,0,0.2)',
            ice:    'rgba(100,200,255,0.18)',
            poison: 'rgba(80,200,50,0.15)',
            normal: 'rgba(255,255,255,0.12)',
        };
        flash.style.background = colors[dmgType] || colors.normal;
        flash.style.display = 'block';
        setTimeout(() => { flash.style.display = 'none'; }, 100);
    }

    // Обновляем ауру + свечение если HP низкое (аура удалена, но свечение остаётся)
    updateBossVisualState();
}

function updateBossVisualState() {
    if (!store.guild) return;
    const pct = store.guild.bossHp / store.guild.maxBossHp;
    const isRage = pct < 0.3 && pct > 0;

    const glow = document.getElementById('battle-zone-glow');
    const hpFill = document.getElementById('boss-hp-fill');

    if (glow) glow.classList.toggle('rage', isRage);
    if (hpFill) {
        hpFill.classList.toggle('hp-rage', isRage);
        // Обновляем ширину
        const hpPct = Math.max(0, pct * 100);
        hpFill.style.width = hpPct + '%';
    }

    const hpText = document.getElementById('boss-hp-text');
    if (hpText && store.guild) {
        hpText.textContent = `${Math.max(0, store.guild.bossHp)}/${store.guild.maxBossHp}`;
    }
}

// =======================================================
// СИСТЕМА ЕЖЕДНЕВНЫХ БОНУСОВ (ТОЛЬКО МОНЕТЫ + ТАЙМЕР)
// =======================================================
function getCurrentDailyBonus(user) {
    const now = new Date();
    const lastClaim = user.dailyBonus.lastClaim ? new Date(user.dailyBonus.lastClaim) : null;
    const today = now.toDateString();
    const lastClaimDate = lastClaim ? lastClaim.toDateString() : null;

    // Проверка сброса серии при пропуске дня
    if (lastClaim) {
        const diffDays = Math.floor((now - lastClaim) / (1000 * 60 * 60 * 24));
        if (diffDays >= 2) {
            // Пропущен день, сбрасываем
            user.dailyBonus.streak = 0;
            user.dailyBonus.currentDay = 1;
        }
    }

    const canClaim = lastClaimDate !== today;
    return {
        canClaim,
        currentDay: user.dailyBonus.currentDay,
        streak: user.dailyBonus.streak,
        nextReward: dailyBonusConfig[(user.dailyBonus.currentDay - 1) % dailyBonusConfig.length]
    };
}

async function claimDailyBonus() {
    const user = await getUser();
    const bonusInfo = getCurrentDailyBonus(user);
    if (!bonusInfo.canClaim) {
        showNotification('Уже получено', 'Вы уже получили бонус сегодня');
        return;
    }

    const reward = bonusInfo.nextReward.reward;
    const updates = {
        money: user.money + reward.money,
        dailyBonus: {
            currentDay: (user.dailyBonus.currentDay % dailyBonusConfig.length) + 1,
            lastClaim: Date.now(),
            streak: user.dailyBonus.streak + 1
        }
    };

    await updateUser(updates);
    triggerBonusConfetti();
    showNotification('🎉 Бонус получен!', `Вы получили ${reward.money} 🪙`);
    updateDailyBonusModal();
    stopBonusTimer();
    startBonusTimer(); // запускаем отсчёт до следующего дня
}

let bonusTimerInterval = null;

function getTimeToNextBonus() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow - now;
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}ч ${String(minutes).padStart(2,'0')}м ${String(seconds).padStart(2,'0')}с`;
}

function updateBonusTimer() {
    const user = store.user;
    if (!user) return;
    const info = getCurrentDailyBonus(user);
    const timerElement = document.getElementById('bonus-info');
    if (!timerElement) return;

    if (info.canClaim) {
        timerElement.innerHTML = `<p class="bonus-ready-text">✨ Твой бонус ждёт тебя!</p>`;
    } else {
        const timeLeft = getTimeToNextBonus();
        timerElement.innerHTML = `<p class="bonus-timer-text">⏳ Следующий бонус через: <strong>${formatTime(timeLeft)}</strong></p>`;
    }
}

function startBonusTimer() {
    if (bonusTimerInterval) clearInterval(bonusTimerInterval);
    updateBonusTimer();
    bonusTimerInterval = setInterval(updateBonusTimer, 1000); // обновляем каждую секунду
}

function stopBonusTimer() {
    if (bonusTimerInterval) {
        clearInterval(bonusTimerInterval);
        bonusTimerInterval = null;
    }
}

window.openDailyBonusModal = async function() {
    const modal = document.getElementById('daily-bonus-modal');
    if (!modal) return;
    await getUser(true); // принудительно загружаем пользователя
    updateDailyBonusModal();
    modal.classList.remove('hidden');
    startBonusTimer();
};

window.closeDailyBonusModal = function() {
    document.getElementById('daily-bonus-modal').classList.add('hidden');
    stopBonusTimer();
};

const DAY_ICONS = ['🎯', '⚡', '💎', '🔮', '⭐', '💰', '👑'];

function updateDailyBonusModal() {
    const user = store.user;
    if (!user) return;
    const info = getCurrentDailyBonus(user);

    // Streak display
    const streakEl = document.getElementById('bonus-streak-display');
    if (streakEl) {
        const streak = info.streak || 0;
        if (streak > 0) {
            streakEl.innerHTML = `<span class="bonus-streak-badge">🔥 Серия ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}</span>`;
        } else {
            streakEl.innerHTML = `<span class="bonus-streak-badge no-streak">🌟 Начни серию!</span>`;
        }
    }

    // Calendar — no nested wrapper, direct cards
    const calendar = document.getElementById('bonus-calendar');
    let html = '';
    for (let i = 0; i < dailyBonusConfig.length; i++) {
        const dayConfig = dailyBonusConfig[i];
        const dayNum = i + 1;
        let statusClass = 'future';

        if (dayNum < user.dailyBonus.currentDay) {
            statusClass = 'claimed';
        } else if (dayNum === user.dailyBonus.currentDay && info.canClaim) {
            statusClass = 'available';
        }

        const icon = statusClass === 'claimed' ? '✅' : DAY_ICONS[i] || '🎁';
        const isJackpot = dayNum === 7;

        html += `<div class="bonus-day ${statusClass}${isJackpot ? ' jackpot' : ''}" data-day="${dayNum}">
            <div class="day-number">День ${dayNum}</div>
            <div class="day-icon">${icon}</div>
            <div class="reward">${dayConfig.reward.money}<span class="reward-coin">🪙</span></div>
        </div>`;
    }
    calendar.innerHTML = html;

    // Info / timer
    const infoDiv = document.getElementById('bonus-info');
    if (infoDiv) {
        if (info.canClaim) {
            infoDiv.innerHTML = `<p class="bonus-ready-text">✨ Твой бонус ждёт тебя!</p>`;
        } else {
            const timeLeft = getTimeToNextBonus();
            infoDiv.innerHTML = `<p class="bonus-timer-text">⏳ Следующий бонус через: <strong>${formatTime(timeLeft)}</strong></p>`;
        }
    }

    const claimBtn = document.getElementById('claim-bonus-btn');
    claimBtn.disabled = !info.canClaim;
    claimBtn.onclick = claimDailyBonus;
}

function triggerBonusConfetti() {
    const container = document.getElementById('daily-bonus-modal');
    if (!container) return;
    const colors = ['#f4c430', '#9d5ffa', '#22d3a0', '#ff6b9d', '#60a5fa'];
    for (let i = 0; i < 40; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.cssText = `
            left: ${Math.random() * 100}%;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            animation-delay: ${Math.random() * 0.6}s;
            animation-duration: ${0.8 + Math.random() * 0.8}s;
            width: ${4 + Math.random() * 6}px;
            height: ${4 + Math.random() * 6}px;
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        `;
        container.appendChild(piece);
        setTimeout(() => piece.remove(), 1800);
    }
}

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
            if (activeTab === 'character') renderSkins(); // заменено с loadCharacterCustomization
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

    // MUSIC ADDITION: обновляем текст кнопки музыки при открытии профиля
    updateMusicToggleButton();
}

// =======================================================
// ТЕСТОВЫЕ ДАННЫЕ (добавлены скины, удалена одежда)
// =======================================================
async function initTestData() {
    const petsSnap = await db.collection('shop_items').where('type', '==', 'pet').limit(1).get();
    if (petsSnap.empty) {
        const pets = [
            { name: 'Слизиус', type: 'pet', price: 250, imageUrl: 'img/pet1.png'},
            { name: 'Пукиш', type: 'pet', price: 200, imageUrl: 'img/pet2.png' }
        ];
        for (const pet of pets) {
            await db.collection('shop_items').add(pet);
        }
        console.log('➕ Тестовые питомцы добавлены');
    }

    // Добавляем тестовые скины
    const skinsSnap = await db.collection('shop_items').where('type', '==', 'skin').limit(1).get();
    if (skinsSnap.empty) {
        const skins = [
            { name: 'Рыцарь', type: 'skin', price: 300, imageUrl: 'img/skin_knight.png' },
            { name: 'Маг', type: 'skin', price: 350, imageUrl: 'img/skin_mage.png' },
            { name: 'Разбойник', type: 'skin', price: 320, imageUrl: 'img/skin_rogue.png' }
        ];
        for (const skin of skins) {
            await db.collection('shop_items').add(skin);
        }
        console.log('➕ Тестовые скины добавлены');
    }
}

// =======================================================
// СИСТЕМА ДРУЗЕЙ
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
// ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ГИЛЬДИЕЙ (ВЫХОД, ИСКЛЮЧЕНИЕ, ПРИГЛАШЕНИЕ)
// =======================================================

/**
 * Покинуть гильдию (для рядового участника) или распустить гильдию (для лидера)
 */
async function leaveGuild(guildId) {
    if (!store.authUser) return;
    const user = await getUser();
    if (!user.guildId || user.guildId !== guildId) {
        showNotification('Ошибка', 'Вы не в этой гильдии');
        return;
    }

    const guildRef = db.collection('guilds').doc(guildId);
    const userRef = db.collection('users').doc(store.authUser.uid);

    try {
        const guildDoc = await guildRef.get();
        if (!guildDoc.exists) {
            await userRef.update({ guildId: null });
            await loadUserFromFirestore(true);
            loadGuildScreen();
            showNotification('Гильдия уже расформирована', '');
            return;
        }

        const guild = guildDoc.data();
        const isLeader = guild.leaderId === store.authUser.uid;

        if (isLeader) {
            const batch = db.batch();
            batch.delete(guildRef);
            const members = guild.members || [];
            for (const memberId of members) {
                const memberRef = db.collection('users').doc(memberId);
                batch.update(memberRef, { guildId: null });
            }
            await batch.commit();
            showNotification('Гильдия расформирована', '');
        } else {
            await db.runTransaction(async (transaction) => {
                const freshGuildDoc = await transaction.get(guildRef);
                if (!freshGuildDoc.exists) throw new Error('Гильдия не найдена');
                const freshGuild = freshGuildDoc.data();
                if (!freshGuild.members.includes(store.authUser.uid)) {
                    throw new Error('Вы не состоите в гильдии');
                }
                transaction.update(guildRef, {
                    members: firebase.firestore.FieldValue.arrayRemove(store.authUser.uid)
                });
                transaction.update(userRef, { guildId: null });
            });
            showNotification('Вы покинули гильдию', '');
        }

        await loadUserFromFirestore(true);
        loadGuildScreen();
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось выполнить действие');
    }
}

/**
 * Исключить участника из гильдии (только для лидера)
 */
async function removeFromGuild(guildId, memberId) {
    if (!store.authUser) return;
    const user = await getUser();
    if (user.guildId !== guildId) {
        showNotification('Ошибка', 'Вы не в этой гильдии');
        return;
    }
    const guildRef = db.collection('guilds').doc(guildId);
    try {
        await db.runTransaction(async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists) throw new Error('Гильдия не найдена');
            const guild = guildDoc.data();
            if (guild.leaderId !== store.authUser.uid) {
                throw new Error('Только лидер может исключать участников');
            }
            if (memberId === store.authUser.uid) {
                throw new Error('Нельзя удалить самого себя. Используйте "Покинуть гильдию".');
            }
            if (!guild.members.includes(memberId)) {
                throw new Error('Участник не найден');
            }
            transaction.update(guildRef, {
                members: firebase.firestore.FieldValue.arrayRemove(memberId)
            });
            const memberRef = db.collection('users').doc(memberId);
            transaction.update(memberRef, { guildId: null });
        });
        showNotification('Участник исключён', '');
        loadGuildScreen();
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось исключить');
    }
}

/**
 * Показать меню приглашения в гильдию (копирование ID гильдии)
 */
function showInviteMenu() {
    const guild = store.guild;
    if (!guild) return;

    function fallbackInvite() {
        const id = prompt('ID гильдии (скопируйте и отправьте другу):', guild.id);
        if (id) copyToClipboard(id);
    }

    if (tg && typeof tg.showPopup === 'function') {
        try {
            tg.showPopup({
                title: 'Приглашение в гильдию',
                message: `ID гильдии: ${guild.id}\n\nОтправьте этот ID другу, он сможет вступить, нажав "Вступить" в списке гильдий или через поиск.`,
                buttons: [
                    { type: 'default', text: 'Скопировать ID' },
                    { type: 'cancel', text: 'Закрыть' }
                ]
            }, (btnId) => {
                if (btnId === '0') {
                    copyToClipboard(guild.id);
                }
            });
        } catch (e) {
            console.warn('Telegram WebApp showPopup не поддерживается, используем prompt', e);
            fallbackInvite();
        }
    } else {
        fallbackInvite();
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
            const chatLink = document.getElementById('guild-chat-link').value.trim();
            if (!name) {
                 showNotification('Ошибка', 'Введите название гильдии');
                return;
            }
            if (name.length < 5) {
                showNotification('Ошибка', 'Название гильдии должно содержать минимум 5 символов');
                return;
            }
            hideCreateGuildModal();
            await createGuild(name, desc, chatLink);
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

            if (tab === 'character') renderSkins(); // изменено
            if (tab === 'pets') loadPetsGrid();
            if (tab === 'talents') {
                initTalentsTab();
            }
        });

        // Селектор слотов удалён, поэтому обработчик для .slot-selector можно удалить или закомментировать
        // document.querySelector('.slot-selector').addEventListener('click', ...);

        if (window.energyUpdateInterval) {
            clearInterval(window.energyUpdateInterval);
        }
        window.energyUpdateInterval = setInterval(updateMainUI, 1000);

        updateBattleResultModalVisibility();

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
        setInterval(updateFriendsOnlineCount, 10000);

        // MUSIC ADDITION: инициализация музыки, если включена
        if (store.user.musicEnabled) {
            initMusic();
            playMusic();
        }

        // MUSIC ADDITION: обработчик кнопки музыки
        const musicBtn = document.getElementById('music-toggle-btn');
        if (musicBtn) {
            musicBtn.addEventListener('click', toggleMusic);
        }

        console.log('✅ Игра готова');
    } catch (e) {
        console.error('Ошибка инициализации:', e);
        showNotification('Ошибка', 'Не удалось загрузить игру. Попробуйте позже.');
    }
};

// =======================================================
// ЭКСПОРТ ГЛОБАЛЬНЫХ ФУНКЦИЙ
// =======================================================
window.buyPet = window.buyPet;
window.activatePet = window.activatePet;
window.buyCharges = window.buyCharges;
window.upgradeTalent = window.upgradeTalent;
window.craftTalent = window.craftTalent;
window.selectBattleTalent = window.selectBattleTalent;
window.attackBoss = window.attackBoss;
window.joinGuild = window.joinGuild;
window.leaveGuild = leaveGuild;
window.startBattle = startBattle;
window.showGuildRatingModal = showGuildRatingModal;
window.toggleEditMode = toggleEditMode;
window.updateGuildInfo = updateGuildInfo;
window.removeFriend = window.removeFriend;
window.sendFriendRequest = window.sendFriendRequest;
window.acceptFriendRequest = window.acceptFriendRequest;
window.declineFriendRequest = window.declineFriendRequest;
window.copyToClipboard = window.copyToClipboard;
window.removeFromGuild = removeFromGuild;
window.showCreateGuildModal = window.showCreateGuildModal;
window.hideCreateGuildModal = window.hideCreateGuildModal;
window.openDailyBonusModal = openDailyBonusModal;
window.closeDailyBonusModal = closeDailyBonusModal;
window.showInviteMenu = showInviteMenu;
// Новые функции для скинов
window.buySkin = window.buySkin;
window.equipSkin = window.equipSkin;
window.previewSkin = window.previewSkin;

// =======================================================
// СУНДУК С СОКРОВИЩАМИ (ГАЧА)
// =======================================================

// Описание эксклюзивных предметов (только для гачи, не продаются в магазине)
const EXCLUSIVE_GACHA_ITEMS = [
    {
        id: 'gacha_skin_dragon',
        name: 'Дракон',
        type: 'skin',
        price: 0,
        imageUrl: 'img/skin_dragon.png',
        exclusive: true
    },
    {
        id: 'gacha_skin_phantom',
        name: 'Призрак',
        type: 'skin',
        price: 0,
        imageUrl: 'img/skin_phantom.png',
        exclusive: true
    }
];

const GACHA_COST = 200;

let gachaTreasurePool = [];
let isSpinning = false;

// Инициализация: загружает все предметы из Firebase + добавляет эксклюзивы
async function loadTreasurePool() {
    console.log('📦 Загружаем пул сундука...');
    const snapshot = await db.collection('shop_items').get();
    const shopItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Объединяем обычные предметы + эксклюзивные
    gachaTreasurePool = [...shopItems, ...EXCLUSIVE_GACHA_ITEMS];
    console.log('📦 Пул сундука:', gachaTreasurePool.length, 'предметов');
}

// Открыть модалку сундука
window.openTreasureModal = async function() {
    try {
        const modal = document.getElementById('treasure-modal');
        if (!modal) return;
        // Скрыть старый результат
        document.getElementById('treasure-result').classList.add('hidden');
        modal.classList.remove('hidden');
        // Загрузить пул и отрисовать
        await loadTreasurePool();
        renderTreasurePool();
        buildSlotTrack();
    } catch (e) {
        console.error('Ошибка при открытии сундука:', e);
        showNotification('Ошибка', 'Не удалось загрузить сундук');
    }
};

// Закрыть модалку
window.closeTreasureModal = function() {
    document.getElementById('treasure-modal').classList.add('hidden');
    isSpinning = false;
};

// Отрисовать сетку доступных предметов
function renderTreasurePool() {
    const grid = document.getElementById('treasure-pool-grid');
    if (!grid) return;
    grid.innerHTML = '';
    gachaTreasurePool.forEach(item => {
        const div = document.createElement('div');
        div.className = 'pool-item' + (item.exclusive ? ' exclusive' : '');
        const imgOrEmoji = item.imageUrl
            ? `<img src="${item.imageUrl}" alt="${item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
              + `<span class="item-emoji" style="display:none">${item.type === 'pet' ? '🐾' : '🧙'}</span>`
            : `<span class="item-emoji">${item.type === 'pet' ? '🐾' : '🧙'}</span>`;
        div.innerHTML = `
            ${imgOrEmoji}
            <span class="pool-item-name">${item.name}</span>
            ${item.exclusive ? '<span class="exclusive-badge">эксклюзив</span>' : ''}
        `;
        grid.appendChild(div);
    });
}

// Создать ленту для слот-машины (зациклить предметы несколько раз)
function buildSlotTrack() {
    const track = document.getElementById('slot-track');
    if (!track || gachaTreasurePool.length === 0) return;
    // Повторяем пул 5 раз для эффекта бесконечной прокрутки
    const repeated = [];
    for (let i = 0; i < 5; i++) {
        repeated.push(...gachaTreasurePool);
    }
    track.innerHTML = '';
    repeated.forEach(item => {
        const div = document.createElement('div');
        div.className = 'slot-item';
        if (item.imageUrl) {
            div.innerHTML = `<img src="${item.imageUrl}" alt="${item.name}" onerror="this.innerHTML='<span class=slot-emoji>${item.type === 'pet' ? '🐾' : '🧙'}</span>'">`;
        } else {
            div.innerHTML = `<span class="slot-emoji">${item.type === 'pet' ? '🐾' : '🧙'}</span>`;
        }
        track.appendChild(div);
    });
    // Вернуть в начало
    track.style.transform = 'translateY(0px)';
}

// Крутить!
window.spinTreasure = async function() {
    if (isSpinning) return;
    const user = store.user;
    if (!user) { showNotification('Ошибка', 'Пользователь не загружен'); return; }
    if (user.money < GACHA_COST) {
        showNotification('Недостаточно монет', `Нужно ${GACHA_COST} 🪙`);
        return;
    }
    if (gachaTreasurePool.length === 0) {
        await loadTreasurePool();
        if (gachaTreasurePool.length === 0) {
            showNotification('Ошибка', 'Пул пуст, попробуйте ещё раз');
            return;
        }
    }

    isSpinning = true;
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = true;
    spinBtn.classList.add('spinning');

    // Скрыть предыдущий результат
    document.getElementById('treasure-result').classList.add('hidden');

    // Выбрать победителя
    const winner = gachaTreasurePool[Math.floor(Math.random() * gachaTreasurePool.length)];
    console.log('🎰 Победитель:', winner.name);

    // Анимация прокрутки
    const track = document.getElementById('slot-track');
    const itemHeight = 100;
    const poolLen = gachaTreasurePool.length;
    const winnerIndex = gachaTreasurePool.findIndex(i => i.id === winner.id);
    const targetIndex = poolLen * 2 + winnerIndex;
    const targetY = -(targetIndex * itemHeight); // центрируем в окне (верх окна совпадает с верхом элемента)

    // Получаем текущее положение
    let startY = 0;
    const transform = track.style.transform;
    if (transform && transform.includes('translateY')) {
        const match = transform.match(/translateY\(([^)]+)\)/);
        if (match) startY = parseFloat(match[1]) || 0;
    }

    let startTime = null;
    const duration = 2200; // мс

    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        const currentY = startY + (targetY - startY) * eased;
        track.style.transform = `translateY(${currentY}px)`;
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Анимация завершена — списываем деньги и добавляем предмет
            finalizeSpin(winner);
        }
    }
    requestAnimationFrame(animate);
};

async function finalizeSpin(winner) {
    const spinBtn = document.getElementById('spin-btn');
    try {
        const userRef = db.collection('users').doc(store.authUser.uid);
        let alreadyOwned = false;
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('Пользователь не найден');
            const data = userDoc.data();
            if (data.money < GACHA_COST) throw new Error('Недостаточно монет');
            const inventory = data.inventory || [];
            alreadyOwned = inventory.some(inv => inv.id === winner.id);

            const updates = {
                money: firebase.firestore.FieldValue.increment(-GACHA_COST)
            };

            if (!alreadyOwned) {
                const invItem = {
                    id: winner.id,
                    name: winner.name,
                    type: winner.type,
                    price: winner.price || 0,
                    imageUrl: winner.imageUrl || null,
                    instanceId: `${Date.now()}_${Math.random()}`
                };
                if (winner.exclusive) invItem.exclusive = true;
                updates.inventory = firebase.firestore.FieldValue.arrayUnion(invItem);
            }
            transaction.update(userRef, updates);
        });

        await loadUserFromFirestore(true);
        updateMainUI();

        // Обновляем интерфейс мастерской, если открыта соответствующая вкладка
        if (document.getElementById('screen-workshop').classList.contains('active')) {
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
            if (activeTab === 'character') renderSkins();
            if (activeTab === 'pets') loadPetsGrid();
        }

        if (alreadyOwned) {
        } else {
        }
        hapticFeedback('heavy');
        showTreasureResult(winner);
    } catch (e) {
        console.error('Ошибка гачи:', e);
        showNotification('Ошибка', e.message || 'Что-то пошло не так');
    } finally {
        spinBtn.disabled = false;
        spinBtn.classList.remove('spinning');
        isSpinning = false;
    }
}

function showTreasureResult(item) {
    const resultEl = document.getElementById('treasure-result');
    const imgEl    = document.getElementById('treasure-result-img');
    const nameEl   = document.getElementById('treasure-result-name');
    const labelEl  = document.getElementById('treasure-result-label');

    if (item.imageUrl) {
        imgEl.src = item.imageUrl;
        imgEl.style.display = 'block';
        imgEl.onerror = () => {
            imgEl.style.display = 'none';
            // Можно показать эмодзи, но в данном случае оставляем имя
        };
    } else {
        imgEl.style.display = 'none';
    }
    nameEl.textContent = item.name;

    const user = store.user;
    const owned = user.inventory && user.inventory.some(inv => inv.id === item.id);
    // Если предмет только что получили — он теперь есть в инвентаре
    if (item.exclusive) {
        labelEl.className = 'result-label exclusive';
        labelEl.textContent = '✨ Эксклюзивный предмет!';
    } else if (!owned) {
        labelEl.className = 'result-label new';
        labelEl.textContent = '🎉 Новый предмет!';
    } else {
        labelEl.className = 'result-label owned';
        labelEl.textContent = '📦 Уже есть в инвентаре';
    }

    resultEl.classList.remove('hidden');
}

// Экспорт
window.openTreasureModal   = openTreasureModal;
window.closeTreasureModal  = closeTreasureModal;
window.spinTreasure        = spinTreasure;
