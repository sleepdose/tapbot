// =======================================================
// ГЛОБАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ TELEGRAM, FIREBASE, АУТЕНТИФИКАЦИЯ
// =======================================================
if (!window.Telegram || !window.Telegram.WebApp) {
    console.warn('Telegram WebApp SDK не загружен. Запуск в режиме отладки.');
    window.Telegram = {
        WebApp: {
            expand: () => {},
            ready: () => {},
            HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
            initDataUnsafe: { user: { id: 0, first_name: 'Debug', last_name: 'User', username: 'debug_user' } },
            version: '6.0',
            platform: 'unknown',
            colorScheme: 'dark',
            themeParams: {},
            isExpanded: true,
            viewportHeight: window.innerHeight,
            viewportStableHeight: window.innerHeight
        }
    };
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
        avatarImg.style.display = '';
        // убираем инициалы если они были добавлены раньше
        const avatarDiv = document.getElementById('user-avatar');
        const existing = avatarDiv.querySelector('.avatar-initials');
        if (existing) existing.remove();
    } else {
        avatarImg.style.display = 'none';
        const avatarDiv = document.getElementById('user-avatar');
        // не дублируем span при повторных вызовах
        if (!avatarDiv.querySelector('.avatar-initials')) {
            const initials = user ? (user.first_name?.[0] || '').toUpperCase() : '?';
            const span = document.createElement('span');
            span.className = 'avatar-initials';
            span.textContent = initials;
            avatarDiv.appendChild(span);
        }
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
    docId: null, // Firestore document ID: telegramId if available, else Firebase UID
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
    guildInfoVisible: false,
    guildMemberNames: {} // { guildId: { userId: name } }
};

// MUSIC ADDITION: глобальная переменная для аудио
let backgroundMusic = null;

// =======================================================
// ПРЕЛОАДЕР
// =======================================================
function setPreloaderProgress(percent, statusText) {
    const bar = document.getElementById('preloader-progress-bar');
    const tip = document.getElementById('preloader-tip');
    if (bar) bar.style.width = percent + '%';
    if (tip && statusText) tip.textContent = statusText;
    console.log(`[Preloader] ${percent}% — ${statusText}`);
}

function hidePreloader() {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;
    preloader.style.opacity = '0';
    preloader.style.transition = 'opacity 0.6s ease';
    setTimeout(() => {
        preloader.style.display = 'none';
    }, 650);
}

// Предзагрузка изображений — возвращает Promise, который резолвится когда все картинки загружены
function preloadImages(urls) {
    let loaded = 0;
    const total = urls.length;
    return new Promise(resolve => {
        if (total === 0) { resolve(); return; }
        urls.forEach(url => {
            const img = new Image();
            img.onload = img.onerror = () => {
                loaded++;
                // Обновляем прогресс-бар от 90% до 99% по мере загрузки картинок
                const progress = 90 + Math.floor((loaded / total) * 9);
                setPreloaderProgress(progress, `Загрузка ресурсов... ${loaded}/${total}`);
                if (loaded === total) resolve();
            };
            img.src = url;
        });
    });
}

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
            const guildNames = store.guildMemberNames[store.guild?.id] || {};
            for (const [uid, dmg] of entries) {
                const memberData = guildNames[uid];
                const name = (typeof memberData === 'object' && memberData?.name)
                    ? memberData.name
                    : (res.userNames[uid] || uid.slice(0, 6));
                const photoUrl = (typeof memberData === 'object' && memberData?.photoUrl) ? memberData.photoUrl : '';
                const level = (typeof memberData === 'object' && memberData?.level != null) ? memberData.level : 1;
                const initial = name.charAt(0).toUpperCase();
                const isCurrentUser = uid === store.docId;
                const rankIndex = entries.findIndex(e => e[0] === uid);
                const rankBadge = `<span style="font-size:12px;font-weight:800;color:var(--text-secondary);min-width:20px;text-align:center;">${rankIndex + 1}</span>`;
                const highlightClass = isCurrentUser ? ' class="current-user-row"' : '';
                const avatarHtml = `<div class="member-avatar">${
                    photoUrl
                        ? `<img class="member-avatar-img" src="${photoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="member-avatar-initials" style="display:none">${initial}</span>`
                        : `<span class="member-avatar-initials">${initial}</span>`
                }<span class="member-level-badge">${level}</span></div>`;
                html += `<tr${highlightClass}><td style="text-align:left;"><span style="display:inline-flex;align-items:center;gap:8px;">${rankBadge}${avatarHtml}<span>${name}</span></span></td><td style="text-align:right;font-weight:700;color:var(--accent-gold);">${dmg}</td></tr>`;
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
        basic: { charges: 8, basePrice: 200 },
        critical: { charges: 8, basePrice: 350 },
        poison: { charges: 8, basePrice: 500 }
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
    skin: null
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

// ========== НОВЫЕ ФУНКЦИИ ПРОГРЕССИИ УРОВНЯ ==========
function getXPForLevel(level) {
    if (level <= 1) return 0;
    return 100 * (level - 1) * level / 2;
}

function getLevelFromXP(xp) {
    let level = 1;
    while (xp >= getXPForLevel(level + 1)) {
        level++;
    }
    return level;
}

function getXPProgress(user) {
    const currentLevelXP = getXPForLevel(user.level);
    const nextLevelXP = getXPForLevel(user.level + 1);
    const xpInThisLevel = user.xp - currentLevelXP;
    const neededForNext = nextLevelXP - currentLevelXP;
    const progress = neededForNext > 0 ? (xpInThisLevel / neededForNext) * 100 : 100;
    return { xpInThisLevel, neededForNext, progress };
}

async function getUser(forceReload = false) {
    if (!store.user || forceReload) {
        await loadUserFromFirestore();
    }
    return store.user;
}
async function loadUserFromFirestore() {
    if (!store.authUser) throw new Error('Not authenticated');
    const uid = store.authUser.uid;
    const tgUser = tg.initDataUnsafe?.user;
    const telegramId = tgUser?.id ? String(tgUser.id) : null;
    const currentPhotoUrl = tgUser?.photo_url || '';

    // Use telegramId as doc key — survives cache clears / device switches
    // Fall back to Firebase UID in debug mode (no real Telegram)
    const docId = telegramId || uid;
    store.docId = docId;
    console.log(`[Auth] docId=${docId} (tgId=${telegramId}, uid=${uid})`);

    let userRef = db.collection('users').doc(docId);
    let doc = await userRef.get();

    // Migration: move old uid-keyed doc to telegramId-keyed doc
    if (!doc.exists && telegramId && telegramId !== uid) {
        const oldRef = db.collection('users').doc(uid);
        const oldDoc = await oldRef.get();
        if (oldDoc.exists) {
            console.log('[Auth] Migrating user data: uid → telegramId doc');
            const oldData = oldDoc.data();
            oldData.telegramId = telegramId;
            oldData.id = docId;
            await userRef.set(oldData);
            await oldRef.delete();
            doc = await userRef.get();
        }
    }

    if (!doc.exists) {
        const newUser = {
            id: docId,
            name: tgUser?.first_name || 'Игрок',
            telegramId: telegramId || '',
            photoUrl: currentPhotoUrl,
            energy: 100,
            maxEnergy: 100,
            lastEnergyUpdate: Date.now(),
            money: 300,
            pets: [],
            inventory: [],
            petLevels: {},
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
            equipped: {},
            skin: null,
            completedTasks: [], // <-- новое поле для выполненных заданий
            authUid: uid
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
    if (data.skin === undefined) { data.skin = null; needsUpdate = true; }
    if (!data.equipped) { data.equipped = {}; needsUpdate = true; }
    if (!Array.isArray(data.pets)) { data.pets = []; needsUpdate = true; }
    if (!Array.isArray(data.friends)) { data.friends = []; needsUpdate = true; }
    if (!Array.isArray(data.pendingRequests)) { data.pendingRequests = []; needsUpdate = true; }
    if (!Array.isArray(data.inventory)) { data.inventory = []; needsUpdate = true; }
    if (!Array.isArray(data.completedTasks)) { data.completedTasks = []; needsUpdate = true; } // <-- добавили
    if (!data.authUid || data.authUid !== uid) { data.authUid = uid; needsUpdate = true; }

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
            equipped: data.equipped,
            skin: data.skin,
            completedTasks: data.completedTasks // <-- сохраняем
        };
        await userRef.update(updateData);
    }

    store.user = data;
    updateFriendsFabState();
    return store.user;
}
async function updateUser(updates) {
    if (!store.user || !store.authUser) return;
    const userRef = db.collection('users').doc(store.docId);
    try {
        await userRef.update(updates);
        Object.assign(store.user, updates);
        updateMainUI();
        updateFriendsOnlineCount();
        updateFriendsFabState();
    } catch (error) {
        console.error('Ошибка при обновлении пользователя:', error);
        throw error;
    }
}
function getCurrentEnergy(userData = store.user) {
    if (!userData) return 0;
    const now = Date.now();
    const delta = Math.floor((now - (userData.lastEnergyUpdate || now)) / 2000);
    return Math.min(userData.maxEnergy || 100, userData.energy + Math.max(0, delta));
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
    btn.textContent = store.user.musicEnabled ? '🎵 Музыка: Вкл' : '🎵 Музыка: Выкл';
}

// =======================================================
// ГЛАВНЫЙ ЭКРАН
// =======================================================
function updateMainUI() {
    if (!store.user) return;
    const user = store.user;
    const currentEnergy = getCurrentEnergy();
    const moneyEl = document.getElementById('money');
    if (moneyEl) moneyEl.innerText = user.money;
    const energyEl = document.getElementById('energy-display');
    if (energyEl) energyEl.innerText = `⚡ ${currentEnergy}/${user.maxEnergy}`;
    const avatarLevel = document.getElementById('avatar-level');
    if (avatarLevel) avatarLevel.textContent = user.level;

    const baseChar = document.getElementById('base-character');
    const eqLayer = document.getElementById('equipment-layer');
    const petContainer = document.getElementById('pet-main-container');
    if (eqLayer) eqLayer.innerHTML = '';
    if (petContainer) petContainer.innerHTML = '';

    // Отображение скина, если он есть
    if (baseChar) {
        if (user.skin) {
            baseChar.src = user.skin.imageUrl;
        } else {
            baseChar.src = 'img/men.png';
        }
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
    if (!container) return;
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
        document.getElementById('preview-equipment').innerHTML = '';
    }
};

// Функция для загрузки и отображения скинов (с сортировкой, обводкой, скрытием цены у эксклюзивов)
async function renderSkins() {
    const user = await getUser();
    const container = document.getElementById('slot-items');
    if (!container) return;

    // Показываем только скины из инвентаря — полученные через сундуки
    const ownedSkins = user.inventory.filter(inv => inv.type === 'skin');

    if (ownedSkins.length === 0) {
        container.innerHTML = '<p class="empty-msg">У тебя пока нет скинов. Открой сундук с сокровищами!</p>';
        updatePreviewCharacter(user);
        return;
    }

    // Сортировка: сначала обычные, потом эксклюзивные
    const normalSkins = ownedSkins.filter(s => !s.exclusive);
    const exclusiveSkins = ownedSkins.filter(s => s.exclusive);
    const sortedSkins = [...normalSkins, ...exclusiveSkins];

    container.innerHTML = sortedSkins.map(skin => {
        const isActive = user.skin?.id === skin.id;
        const cardClass = `item-card ${skin.exclusive ? 'exclusive' : ''}`;
        const actionBtn = isActive
            ? `<button disabled>Активен</button>`
            : `<button onclick="equipSkin('${skin.id}'); event.stopPropagation();">Выбрать</button>`;

        return `
            <div class="${cardClass}" data-skin-id="${skin.id}" onclick="previewSkin('${skin.imageUrl}')">
                <img src="${skin.imageUrl}" alt="${skin.name}">
                <span>${skin.name}</span>
                ${actionBtn}
            </div>
        `;
    }).join('');

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
    const userRef = db.collection('users').doc(store.docId);

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
            if (user.equipped?.[slot]) {
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
// ПИТОМЦЫ (с сортировкой, обводкой, кнопками "Выбрать")
// =======================================================
async function loadPetsGrid() {
    const user = await getUser();
    const container = document.getElementById('pets-grid');
    if (!container) return;

    // Показываем только питомцев из инвентаря — полученных через сундуки
    const ownedPets = user.inventory.filter(inv => inv.type === 'pet');

    if (ownedPets.length === 0) {
        container.innerHTML = '<p class="empty-msg">У тебя пока нет питомцев. Открой сундук с сокровищами!</p>';
        return;
    }

    // Сортировка: сначала обычные, потом эксклюзивные
    const normalPets = ownedPets.filter(p => !p.exclusive);
    const exclusivePets = ownedPets.filter(p => p.exclusive);
    const sortedPets = [...normalPets, ...exclusivePets];

    container.innerHTML = sortedPets.map(pet => {
        const isActive = user.pets[0]?.id === pet.id;
        const cardClass = `item-card ${pet.exclusive ? 'exclusive' : ''}`;
        const button = isActive
            ? `<button disabled>Активен</button>`
            : `<button onclick="activatePet('${pet.id}')">Выбрать</button>`;

        return `
            <div class="${cardClass}">
                <img src="${pet.imageUrl}" alt="${pet.name}">
                <span>${pet.name}</span>
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
    const userRef = db.collection('users').doc(store.docId);

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
    // Reload from Firestore so upgrade tab reflects the change immediately
    await loadUserFromFirestore(true);
    await loadPetsGrid();
    loadPetUpgradeList();
    showPetUpgradePreview(petId);
    updateMainUI();
    updatePreviewCharacter(store.user);
    hapticFeedback();
};

// =======================================================
// ПИТОМЦЫ: УРОВНИ И УЛУЧШЕНИЯ
// =======================================================

const PET_LEVELS = {
    1: { bonus: 5,  cost: 0 },
    2: { bonus: 10, cost: 1500 },
    3: { bonus: 15, cost: 3500 },
    4: { bonus: 20, cost: 8000 },
    5: { bonus: 25, cost: 20000 }
};
const PET_MAX_LEVEL = 5;

window.switchPetTab = function(tab, btn) {
    document.querySelectorAll('.pet-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pet-tab-content').forEach(c => c.classList.add('hidden'));
    if (btn) btn.classList.add('active');
    const el = document.getElementById('pet-tab-' + tab);
    if (el) el.classList.remove('hidden');
    if (tab === 'upgrade') loadPetUpgradeList();
};

async function loadPetUpgradeList() {
    const user = await getUser();
    const container = document.getElementById('pets-upgrade-list');
    if (!container) return;

    const ownedPets = user.inventory.filter(inv => inv.type === 'pet');
    if (ownedPets.length === 0) {
        container.innerHTML = '<p class="empty-msg">У тебя пока нет питомцев</p>';
        return;
    }

    container.innerHTML = ownedPets.map(pet => {
        const lvl = (user.petLevels && user.petLevels[pet.id]) || 1;
        const isActive = user.pets[0]?.id === pet.id;
        return `
            <div class="pet-upgrade-item ${isActive ? 'active' : ''}" onclick="showPetUpgradePreview('${pet.id}')">
                <img src="${pet.imageUrl}" alt="${pet.name}">
                <div class="pet-upgrade-item-info">
                    <span class="pet-upgrade-item-name">${pet.name}</span>
                    <span class="pet-upgrade-item-level">Ур. ${lvl} / ${PET_MAX_LEVEL}</span>
                </div>
            </div>
        `;
    }).join('');
}

window.showPetUpgradePreview = async function(petId) {
    const user = await getUser();
    const preview = document.getElementById('pet-upgrade-preview');
    if (!preview) return;

    const pet = user.inventory.find(inv => inv.id === petId);
    if (!pet) return;

    const petLevels = user.petLevels || {};
    const currentLevel = petLevels[petId] || 1;
    const nextLevel = currentLevel + 1;
    const isMaxLevel = currentLevel >= PET_MAX_LEVEL;
    const isActive = user.pets[0]?.id === petId;
    const bonus = PET_LEVELS[currentLevel].bonus;

    let upgradeSection = '';
    if (!isMaxLevel) {
        const cost = PET_LEVELS[nextLevel].cost;
        const nextBonus = PET_LEVELS[nextLevel].bonus;
        const canAfford = user.money >= cost;
        upgradeSection = `
            <div class="pet-upgrade-cost">
                <div class="pet-upgrade-cost-row">
                    <span>Стоимость улучшения:</span>
                    <span class="cost-value">${cost} 💰</span>
                </div>
                <div class="pet-upgrade-cost-row">
                    <span>Следующий уровень:</span>
                    <span class="cost-value">${nextBonus}% урона</span>
                </div>
            </div>
            <button class="glow-button pet-upgrade-btn" onclick="upgradePet('${petId}')"
                ${canAfford ? '' : 'disabled'}>
                ${canAfford ? '⬆️ Улучшить' : '💸 Недостаточно монет'}
            </button>
        `;
    } else {
        upgradeSection = `<div class="pet-max-level">✨ Максимальный уровень!</div>`;
    }

    const levelStars = Array.from({ length: PET_MAX_LEVEL }, (_, i) =>
        `<span class="pet-level-star ${i < currentLevel ? 'filled' : ''}">${i < currentLevel ? '★' : '☆'}</span>`
    ).join('');

    preview.innerHTML = `
        <img class="pet-preview-img" src="${pet.imageUrl}" alt="${pet.name}">
        <div class="pet-preview-name">${pet.name}</div>
        <div class="pet-preview-stars">${levelStars}</div>
        <div class="pet-preview-level">Уровень ${currentLevel} / ${PET_MAX_LEVEL}</div>
        <div class="pet-preview-ability">
            🛡️ Пассивная способность:<br>
            <strong>+${bonus}% урона в бою</strong><br>
            <small>${isActive ? '✅ Экипирован (бонус активен)' : '⚠️ Не экипирован — бонус неактивен'}</small>
        </div>
        ${upgradeSection}
        ${!isActive ? `<button class="glow-button" style="margin-top:8px;" onclick="activatePet('${petId}')">Экипировать</button>` : ''}
    `;
};

window.upgradePet = async function(petId) {
    const user = await getUser();
    const petLevels = { ...(user.petLevels || {}) };
    const currentLevel = petLevels[petId] || 1;

    if (currentLevel >= PET_MAX_LEVEL) {
        showNotification('Максимум', 'Питомец уже на максимальном уровне');
        return;
    }

    const nextLevel = currentLevel + 1;
    const cost = PET_LEVELS[nextLevel].cost;

    if (user.money < cost) {
        showNotification('Недостаточно монет', `Нужно ${cost} 💰`);
        return;
    }

    try {
        petLevels[petId] = nextLevel;
        await updateUser({
            money: user.money - cost,
            petLevels
        });
        await loadUserFromFirestore(true);
        await loadPetUpgradeList();
        await showPetUpgradePreview(petId);
        updateMainUI();
        hapticFeedback();
        showNotification('Успех', `Питомец улучшен до уровня ${nextLevel}!`);
    } catch (e) {
        console.error('Ошибка улучшения питомца:', e);
        showNotification('Ошибка', 'Не удалось улучшить питомца');
    }
};

// =======================================================
// СИСТЕМА ТАЛАНТОВ И КРАФТА
// =======================================================
const talentsConfig = {
    basic: {
        maxLevel: 10,
        getDamage: (level) => 10 + (level * 2),
        getCost: (level) => Math.floor(200 * Math.pow(1.4, level - 1))
    },
    critical: {
        maxLevel: 10,
        getChance: (level) => 0.15 + (level * 0.05),
        getCost: (level) => Math.floor(400 * Math.pow(1.4, level - 1))
    },
    poison: {
        maxLevel: 10,
        getDamage: (level) => 2 + level,
        getDuration: (level) => 5 + level,
        getCost: (level) => Math.floor(600 * Math.pow(1.4, level - 1))
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

    // Fixed order to prevent buttons from jumping around during battle
    const talentOrder = ['basic', 'critical', 'poison'];
    talentOrder.forEach(type => {
        const talent = user.talents[type];
        if (!talent || talent.level <= 0) return;
        const charges = user.attackCharges[type]?.charges || 0;
        if (charges <= 0) return; // Hide talents with 0 charges
        const isSelected = user.selectedTalent === type;
        html += `<button class="talent-btn ${isSelected ? 'active' : ''}"
            data-talent="${type}"
            onclick="selectBattleTalent('${type}')">
            <span class="talent-icon">${getTalentIcon(type)}</span>
            <span class="talent-name">${getTalentName(type)}</span>
            <span class="talent-charges">${charges}</span>
        </button>`;
    });

    // Crafted talents — only show when charges > 0 (they are rare and situational)
    const craftedOrder = ['sonic', 'fire', 'ice'];
    craftedOrder.forEach(type => {
        const data = user.craftedTalents[type];
        if (!data || data.charges <= 0) return;
        const isSelected = user.selectedTalent === type;
        html += `<button class="talent-btn ${isSelected ? 'active' : ''}" data-talent="${type}" onclick="selectBattleTalent('${type}')">
            <span class="talent-icon">${getTalentIcon(type)}</span>
            <span class="talent-name">${getTalentName(type)}</span>
            <span class="talent-charges">${data.charges}</span>
        </button>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

window.selectBattleTalent = async function(talentType) {
    const user = await getUser();
    const newSelected = user.selectedTalent === talentType ? null : talentType;
    // Optimistic update: refresh UI instantly, sync to Firestore in background
    store.user.selectedTalent = newSelected;
    createBattleTalentButtons();
    updateUser({ selectedTalent: newSelected }).catch(err => {
        console.error('Не удалось сохранить выбор таланта:', err);
        store.user.selectedTalent = user.selectedTalent;
        createBattleTalentButtons();
    });
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
        const guildDoc = await guildRef.get();
        if (!guildDoc.exists || guildDoc.data().bossHp <= 0) {
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

        const updatedGuildDoc = await guildRef.get();
        if (updatedGuildDoc.exists && updatedGuildDoc.data().bossHp <= 0) {
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

function validateUrl(url) {
    if (!url) return true;
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
        leaderId: store.docId,
        members: [store.docId],
        maxMembers: 20,
        level: 1,
        rating: 0,
        bossId: 'boss1',
        bossHp: 5000,
        maxBossHp: 5000,
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
    const userRef = db.collection('users').doc(store.docId);
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
            if (guild.members.includes(store.docId)) throw new Error('Уже в гильдии');

            transaction.update(guildRef, {
                members: firebase.firestore.FieldValue.arrayUnion(store.docId)
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

// ========== ЗАГРУЗКА ИМЁН УЧАСТНИКОВ ГИЛЬДИИ (для модалки урона) ==========
async function loadGuildMemberNames(guildId) {
    if (!guildId) return;
    if (store.guildMemberNames[guildId]) return; // уже загружены

    const membersSnapshot = await db.collection('users').where('guildId', '==', guildId).get();
    const names = {};
    membersSnapshot.forEach(doc => {
        const data = doc.data();
        const memberInfo = {
            name: data.name || doc.id.slice(0, 6),
            photoUrl: data.photoUrl || '',
            level: data.level || 1
        };
        names[doc.id] = memberInfo;
        // Also index by Firebase Auth UID so damageLog keys match
        if (data.authUid && data.authUid !== doc.id) {
            names[data.authUid] = memberInfo;
        }
    });
    store.guildMemberNames[guildId] = names;
}

// ========== [NEW] ФУНКЦИИ ДЛЯ МОДАЛЬНОГО ОКНА УРОНА ==========
window.showDamagePopup = function() {
    const modal = document.getElementById('damage-popup-modal');
    if (!modal) return;
    updateDamagePopup();
    modal.classList.remove('hidden');
};

window.closeDamagePopup = function() {
    document.getElementById('damage-popup-modal').classList.add('hidden');
};

function updateDamagePopup() {
    const listEl = document.getElementById('damage-popup-list');
    if (!listEl || !store.guild || !store.guild.battleActive) return;

    const damageLog = store.guild.damageLog || {};
    const names = store.guildMemberNames[store.guild.id] || {};
    const entries = Object.entries(damageLog).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        listEl.innerHTML = '<div class="damage-popup-empty">Пока никто не нанёс урон</div>';
        return;
    }

    let html = '';
    entries.forEach(([userId, dmg]) => {
        const memberData = names[userId];
        const name = (typeof memberData === 'object' && memberData?.name) ? memberData.name : (memberData || userId.slice(0, 6));
        const photoUrl = (typeof memberData === 'object' && memberData?.photoUrl) ? memberData.photoUrl : '';
        const level = (typeof memberData === 'object' && memberData?.level) ? memberData.level : 1;
        const isCurrent = userId === store.docId;
        const avatarInner = photoUrl
            ? `<img class="member-avatar-img" src="${photoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="member-avatar-initials" style="display:none">${name.charAt(0).toUpperCase()}</span><span class="member-level-badge">${level}</span>`
            : `<span class="member-avatar-initials">${name.charAt(0).toUpperCase()}</span><span class="member-level-badge">${level}</span>`;
        html += `<div class="damage-popup-row ${isCurrent ? 'current' : ''}">
            <div class="damage-popup-player-info">
                <div class="member-avatar">${avatarInner}</div>
                <span class="damage-popup-name">${name}</span>
            </div>
            <span class="damage-popup-value">${dmg}</span>
        </div>`;
    });
    listEl.innerHTML = html;
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

        // Load pending guild invitations for this user
        let invitationsHtml = '';
        try {
            const invSnap = await db.collection('guildInvitations')
                .where('toUserId', '==', store.docId)
                .where('status', '==', 'pending')
                .get();
            if (!invSnap.empty) {
                // Проверяем, существуют ли гильдии, и отменяем приглашения от расформированных
                const validInvitations = [];
                const cancelBatch = db.batch();
                let hasCancellations = false;
                for (const doc of invSnap.docs) {
                    const inv = doc.data();
                    const guildDoc = await db.collection('guilds').doc(inv.guildId).get();
                    if (guildDoc.exists) {
                        validInvitations.push({ doc, inv });
                    } else {
                        cancelBatch.update(doc.ref, { status: 'cancelled' });
                        hasCancellations = true;
                        console.log(`[Guild] Автоматически отменено приглашение ${doc.id} — гильдия ${inv.guildId} расформирована`);
                    }
                }
                if (hasCancellations) await cancelBatch.commit();

                if (validInvitations.length > 0) {
                    invitationsHtml = `<div class="guild-invitations-section">
                        <h3 class="guild-invitations-title">📬 Приглашения в гильдию</h3>
                        ${validInvitations.map(({ doc, inv }) => {
                            return `<div class="guild-invitation-card">
                                <div class="guild-inv-info">
                                    <div class="guild-inv-name">${inv.guildName}</div>
                                    <div class="guild-inv-stats">
                                        <span>🏆 Ур. ${inv.guildLevel}</span>
                                        <span>👥 ${inv.memberCount}/${inv.maxMembers}</span>
                                        <span>⭐ ${inv.rating || 0}</span>
                                    </div>
                                </div>
                                <div class="guild-inv-actions">
                                    <button class="glow-button guild-inv-accept-btn" onclick="acceptGuildInvitation('${doc.id}','${inv.guildId}')">✅ Принять</button>
                                    <button class="guild-inv-decline-btn" onclick="declineGuildInvitation('${doc.id}')">❌</button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>`;
                }
            }
        } catch(e) {
            console.warn('Ошибка загрузки приглашений:', e);
        }

        container.innerHTML = `
             ${invitationsHtml}
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

        // Подписка на изменения гильдии
        store.listeners.guild = db.collection('guilds').doc(user.guildId).onSnapshot(async (doc) => {
            if (doc.exists) {
                const updatedGuild = { id: doc.id, ...doc.data() };
                store.guild = updatedGuild;

                // Если бой активен и боевой экран уже показан — не перерисовываем всё,
                // чтобы яд и другие эффекты не сбрасывали интерфейс каждую секунду.
                const battleViewAlreadyShown = updatedGuild.battleActive && !!document.querySelector('.battle-view');
                if (battleViewAlreadyShown) {
                    // Тихое обновление HP без пересоздания DOM
                    const hpFill = document.getElementById('boss-hp-fill');
                    const hpText = document.getElementById('boss-hp-text');
                    if (hpFill && hpText) {
                        const hpPct = Math.max(0, (updatedGuild.bossHp / updatedGuild.maxBossHp) * 100);
                        hpFill.style.width = hpPct + '%';
                        hpText.textContent = `${updatedGuild.bossHp}/${updatedGuild.maxBossHp}`;
                    }
                } else {
                    renderGuildPage(updatedGuild);
                }

                if (updatedGuild.battleActive && updatedGuild.bossHp <= 0) {
                    await endBattle(true, updatedGuild.id);
                    return;
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
                        const isLeader = updatedGuild.leaderId === store.docId;
                        const isParticipant = res.participants && res.participants.includes(store.docId);
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

                // Если бой активен и модалка урона открыта, обновляем её
                if (updatedGuild.battleActive) {
                    const modal = document.getElementById('damage-popup-modal');
                    if (modal && !modal.classList.contains('hidden')) {
                        updateDamagePopup();
                    }
                }
            }
        });
    }
    updateBattleResultModalVisibility();
}

// ========== ФУНКЦИИ ГЕНЕРАЦИИ БОЕВОГО ЭКРАНА ==========
function generateBattleHTML(guild, isLeader) {
    const bossId = guild.bossId;
    const bossNames = {
        boss1: 'Зарг',
        boss2: 'Вокс'
    };
    const bossName = bossNames[bossId] || bossId;

    let bgImageUrl, bossImageUrl;
    if (bossId === 'boss2') {
        bgImageUrl = 'img/battle2.JPG';
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
        <div class="battle-view" style="background-image: url('${bgImageUrl}')">

            <div class="battle-hit-flash" id="battle-hit-flash" style="display:none; pointer-events:none;"></div>
            <div class="battle-embers" aria-hidden="true">${embersHTML}</div>
            <div class="battle-zone-glow" id="battle-zone-glow"></div>
            <div class="battle-ring battle-ring-1"></div>
            <div class="battle-ring battle-ring-2"></div>
            <div class="battle-ring battle-ring-3"></div>

            <div class="battle-header">
                <div class="battle-header-top">
                    <div class="battle-header-left"></div>
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
                    <!-- [NEW] Кнопка для открытия модалки урона -->
                    <button class="damage-popup-btn" onclick="showDamagePopup()">📊 Урон</button>
                </div>
            </div>

            <div class="boss-image-container" onclick="attackBoss()">
                <img src="${bossImageUrl}" class="boss-image" id="boss-battle-img">
            </div>

            <div class="talents-container">
                <div id="talent-selector"></div>
            </div>
        </div>
    `;
}

window.surrenderBattle = async function(guildId) {
    const guild = store.guild;
    if (!guild || guild.leaderId !== store.docId) {
        console.warn('surrenderBattle: только лидер гильдии может сдаться');
        showNotification('Доступ запрещён', 'Только лидер гильдии может завершить бой');
        return;
    }
    await endBattle(false, guildId);
};

async function renderGuildPage(guild) {
    const container = document.getElementById('guild-view');
    const isLeader = guild.leaderId === store.docId;
    const editing = store.guildEditing;
    const guildInfoVisible = store.guildInfoVisible;
    const user = store.user;

    if (guild.battleActive) {
        container.innerHTML = generateBattleHTML(guild, isLeader);
        if (guild.battleEndTime) {
            const timerKey = `battleTimer_${guild.id}`;
            if (!store.listeners[timerKey]) {
                startBattleTimer(guild.battleEndTime, guild.id);
            }
        }
        createBattleTalentButtons();

        // Загружаем имена участников для отображения в модалке
        await loadGuildMemberNames(guild.id);
        // Закрываем модалку, если она была открыта от предыдущего боя (на всякий случай)
        closeDamagePopup();

        return;
    }

    // ========== НЕБОЕВОЙ РЕЖИМ (остаётся без изменений) ==========
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
            <button onclick="showGuildRatingModal()" class="glow-button" style="width: auto; padding: 8px 16px;">Рейтинг</button>
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
                        ? `<img src="${member.photoUrl}" class="member-avatar-img" alt="avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="member-avatar-initials" style="display:none">${member.name[0]?.toUpperCase() || '?'}</span>`
                        : `<span class="member-avatar-initials">${member.name[0]?.toUpperCase() || '?'}</span>`;
                    const isLeaderMember = member.id === guild.leaderId;
                    const leaderStar = isLeaderMember ? ' 👑' : '';
                    const removeBtn = (editing && !isLeaderMember) ? `<button class="remove-member-btn" onclick="removeFromGuild('${guild.id}', '${member.id}', event)">❌ Удалить</button>` : '';
                    return `
                        <li data-user-id="${member.id}" onclick="openVisitModal('${member.id}')">
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

    const bossNames = { boss1: 'Зарг', boss2: 'Вокс' };
    const bossDisplayName = bossNames[currentBossId] || currentBossId;

    let bossImageUrl;
    if (isBattleActive) {
        bossImageUrl = currentBossId === 'boss2' ? 'img/battleboss2.png' : 'img/battleboss1.png';
    } else {
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
                <h3>${bossDisplayName}</h3>
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
            if (guild.leaderId !== store.docId) throw new Error('Только лидер может начать битву');

            const bossId = user.preferredBoss || 'boss1';

            if (bossId === 'boss2') {
                const keys = guild.keys?.boss2 || 0;
                if (keys < 3) throw new Error('Недостаточно ключей для босса 2');
                transaction.update(guildRef, {
                    'keys.boss2': firebase.firestore.FieldValue.increment(-3)
                });
            }

            const maxBossHp = bossId === 'boss2' ? 15000 : 5000;

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

        // Уведомляем всех участников гильдии о начале битвы
        notifyGuildBattleStart(guildId).catch(err => console.error('Ошибка уведомления гильдии:', err));
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', e.message || 'Не удалось начать битву');
    }
}

// ===== УВЕДОМЛЕНИЕ О НАЧАЛЕ БИТВЫ =====
async function notifyGuildBattleStart(guildId) {
    try {
        const guildDoc = await db.collection('guilds').doc(guildId).get();
        if (!guildDoc.exists) return;

        const guild = guildDoc.data();
        const bossId = guild.bossId || 'boss1';
        const bossName = bossId === 'boss2' ? 'Вокс' : 'Зарг';

        // Получаем telegramId всех участников гильдии
        const memberIds = guild.members || [];
        const memberTelegramIds = [];

        await Promise.all(memberIds.map(async (uid) => {
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const telegramId = userDoc.data().telegramId;
                if (telegramId) memberTelegramIds.push(telegramId);
            }
        }));

        console.log(`Отправляем уведомление о битве ${memberTelegramIds.length} участникам гильдии ${guild.name}`);

        await fetch('https://hiko-bot-backend.onrender.com/api/notify-battle-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guildName: guild.name || 'Гильдия',
                bossName,
                memberTelegramIds
            })
        });
    } catch (err) {
        console.error('notifyGuildBattleStart ошибка:', err);
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

// ========== НОВАЯ ФУНКЦИЯ ДЛЯ НАЧИСЛЕНИЯ НАГРАД ==========
async function applyRewards(userIds, damageLog, bossId) {
    const rewardAmount = bossId === 'boss2' ? 8000 : 2500;
    const xpReward = bossId === 'boss2' ? 300 : 100;
    let attempts = 0;
    const maxAttempts = 3;

    // Собираем снапшоты участников заранее
    const memberDataMap = {};
    for (const uid of userIds) {
        const memberDoc = await db.collection('users').doc(uid).get();
        if (memberDoc.exists) memberDataMap[uid] = memberDoc.data();
    }

    while (attempts < maxAttempts) {
        try {
            const batch = db.batch();
            for (const uid of userIds) {
                const memberData = memberDataMap[uid];
                if (!memberData) {
                    console.warn(`⚠️ Пользователь ${uid} не найден, пропускаем награду`);
                    continue;
                }
                const newXP = (memberData.xp || 0) + xpReward;
                const damageDealt = damageLog[uid] || 0;
                const newTotalDamage = (memberData.totalDamage || 0) + damageDealt;
                const newLevel = getLevelFromXP(newXP);
                const updatesForMember = {
                    // increment — атомарная операция на сервере
                    money: firebase.firestore.FieldValue.increment(rewardAmount),
                    xp: newXP,
                    totalDamage: newTotalDamage
                };
                if (newLevel !== (memberData.level || 1)) {
                    updatesForMember.level = newLevel;
                }
                batch.update(db.collection('users').doc(uid), updatesForMember);
            }

            await batch.commit();
            console.log(`✅ Награды начислены: +${rewardAmount} монет, +${xpReward} XP`);

            // После успешного commit обновляем store.user для текущего игрока
            const currentUid = store.authUser?.uid;
            if (currentUid && userIds.includes(currentUid) && store.user) {
                const myData = memberDataMap[currentUid];
                if (myData) {
                    const newXP = (myData.xp || 0) + xpReward;
                    const newLevel = getLevelFromXP(newXP);
                    const newTotalDamage = (myData.totalDamage || 0) + (damageLog[currentUid] || 0);

                    store.user.money = (myData.money || 0) + rewardAmount;
                    store.user.xp = newXP;
                    store.user.totalDamage = newTotalDamage;

                    if (newLevel !== store.user.level) {
                        store.user.level = newLevel;
                        showNotification('🎉 Новый уровень!', `Вы достигли ${newLevel} уровня!`);
                    }
                }
                // Принудительно обновляем UI — баланс и XP
                updateMainUI();
            }

            return; // успех
        } catch (error) {
            attempts++;
            console.error(`❌ Попытка ${attempts} начисления наград не удалась:`, error);
            if (attempts >= maxAttempts) {
                showNotification('Ошибка', 'Не удалось начислить награды. Обратитесь в поддержку.');
                // Последний резерв — перезагрузить данные из Firebase и обновить UI
                await getUser(true);
                updateMainUI();
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
    }
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

            if (success) {
                if (victory && userIds.length > 0) {
                    await applyRewards(userIds, damageLog, guild.bossId);
                }
                break;
            }
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
        // Очищаем кеш имён для этой гильдии
        delete store.guildMemberNames[guildId];
        // Закрываем модалку урона
        closeDamagePopup();
        // Страховка: перезагружаем актуальные данные из Firebase и обновляем UI
        // (applyRewards уже обновил store.user оптимистично, этот вызов финализирует)
        getUser(true).then(() => updateMainUI()).catch(e => console.error('Ошибка перезагрузки пользователя:', e));
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
        const cooldownRemaining = 2000 - (now - store.lastTalentUse);
        if (cooldownRemaining > 0) {
            return;
        }

        if (!store.guild || !store.guild.battleActive) {
            showNotification('Ошибка', 'Сейчас нет активной битвы');
            return;
        }

        const user = await getUser(true);

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

        // Apply equipped pet passive damage bonus
        if (user.pets && user.pets.length > 0) {
            const equippedPet = user.pets[0];
            const petLevel = (user.petLevels && user.petLevels[equippedPet.id]) || 1;
            const petBonus = PET_LEVELS[petLevel]?.bonus || 0;
            if (petBonus > 0) {
                const bonusDmg = Math.round(damage * petBonus / 100);
                console.log(`[Pet] ${equippedPet.name} Ур.${petLevel} даёт +${petBonus}% (+${bonusDmg} урона)`);
                damage += bonusDmg;
                // Также применяем бонус питомца к урону яда (каждый тик)
                if (isPoison && poisonDamage > 0) {
                    const poisonBonusDmg = Math.round(poisonDamage * petBonus / 100);
                    poisonDamage += poisonBonusDmg;
                    console.log(`[Pet] Яд усилен на +${petBonus}% (+${poisonBonusDmg} к тику яда), итого ${poisonDamage}`);
                }
            }
        }

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
                [`damageLog.${store.docId}`]: firebase.firestore.FieldValue.increment(finalDamage)
            });

            if (isPoison && finalDamage > 0 && !bossKilled) {
                const endTime = Date.now() + poisonDuration * 1000;
                const poisonEffect = {
                    userId: store.docId,
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

    let dmgType = 'normal';
    if (icon.includes('💥⚡')) dmgType = 'crit';
    else if (icon.includes('🔥')) dmgType = 'fire';
    else if (icon.includes('☠') || icon.includes('poison')) dmgType = 'poison';
    else if (icon.includes('❄') || icon.includes('ice')) dmgType = 'ice';

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

    const bossImg = document.getElementById('boss-battle-img');
    if (bossImg) {
        bossImg.classList.remove('boss-hit-shake');
        void bossImg.offsetWidth;
        bossImg.classList.add('boss-hit-shake');
        setTimeout(() => bossImg.classList.remove('boss-hit-shake'), 300);
    }

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

    updateBossVisualState();
}

function updateBossVisualState() {
    if (!store.guild) return;
    const maxHp = store.guild.maxBossHp || 1;
    const pct = store.guild.bossHp / maxHp;
    const isRage = pct < 0.3 && pct > 0;

    const glow = document.getElementById('battle-zone-glow');
    const hpFill = document.getElementById('boss-hp-fill');

    if (glow) glow.classList.toggle('rage', isRage);
    if (hpFill) {
        hpFill.classList.toggle('hp-rage', isRage);
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

    if (lastClaim) {
        const diffDays = Math.floor((now - lastClaim) / (1000 * 60 * 60 * 24));
        if (diffDays >= 2) {
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
    // Считаем актуальный currentDay и streak ПЕРЕД мутацией объекта
    const now = new Date();
    const lastClaim = user.dailyBonus.lastClaim ? new Date(user.dailyBonus.lastClaim) : null;
    const today = now.toDateString();
    const lastClaimDate = lastClaim ? lastClaim.toDateString() : null;

    if (lastClaimDate === today) {
        showNotification('Уже получено', 'Вы уже получили бонус сегодня');
        return;
    }

    // Если пропустили 2+ дней — сброс серии
    let currentDay = user.dailyBonus.currentDay;
    let streak = user.dailyBonus.streak;
    if (lastClaim) {
        const diffDays = Math.floor((now - lastClaim) / (1000 * 60 * 60 * 24));
        if (diffDays >= 2) {
            currentDay = 1;
            streak = 0;
        }
    }

    const reward = dailyBonusConfig[(currentDay - 1) % dailyBonusConfig.length].reward;
    const updates = {
        money: user.money + reward.money,
        dailyBonus: {
            currentDay: (currentDay % dailyBonusConfig.length) + 1,
            lastClaim: Date.now(),
            streak: streak + 1
        }
    };

    await updateUser(updates);
    triggerBonusConfetti();
    showNotification('🎉 Бонус получен!', `Вы получили ${reward.money} 🪙`);
    updateDailyBonusModal();
    stopBonusTimer();
    startBonusTimer();
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
    bonusTimerInterval = setInterval(updateBonusTimer, 1000);
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
    await getUser(true);
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

    const streakEl = document.getElementById('bonus-streak-display');
    if (streakEl) {
        const streak = info.streak || 0;
        if (streak > 0) {
            streakEl.innerHTML = `<span class="bonus-streak-badge">🔥 Серия ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}</span>`;
        } else {
            streakEl.innerHTML = `<span class="bonus-streak-badge no-streak">🌟 Начни серию!</span>`;
        }
    }

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

        html += `<div class="bonus-day ${statusClass}" data-day="${dayNum}">
            <div class="day-number">День ${dayNum}</div>
            <div class="day-icon">${icon}</div>
            <div class="reward">${dayConfig.reward.money}<span class="reward-coin">🪙</span></div>
        </div>`;
    }
    calendar.innerHTML = html;

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
    // Закрываем модальное окно сундука при переключении вкладок
    const treasureModal = document.getElementById('treasure-modal');
    if (treasureModal && !treasureModal.classList.contains('hidden')) {
        document.getElementById('treasure-modal').classList.add('hidden');
        isSpinning = false;
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screenEl = document.getElementById(`screen-${screenId}`);
    if (screenEl) screenEl.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-screen="${screenId}"]`);
    if (navBtn) navBtn.classList.add('active');
    switch (screenId) {
        case 'workshop':
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'character';
            if (activeTab === 'character') renderSkins();
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
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.add('hidden');
}
function updateProfileModal() {
    const user = store.user;
    if (!user) return;

    const avatarImg = document.getElementById('profile-avatar-img');
    const tgUser = tg.initDataUnsafe?.user;
    if (avatarImg) {
        if (tgUser && tgUser.photo_url) {
            avatarImg.src = tgUser.photo_url;
            avatarImg.style.display = '';
            const profileAvatarDiv = avatarImg.parentElement;
            const existingInit = profileAvatarDiv?.querySelector('.avatar-initials');
            if (existingInit) existingInit.remove();
        } else {
            avatarImg.style.display = 'none';
            const profileAvatarDiv = avatarImg.parentElement;
            if (profileAvatarDiv && !profileAvatarDiv.querySelector('.avatar-initials')) {
                const span = document.createElement('span');
                span.className = 'avatar-initials';
                span.textContent = (user.name?.[0] || '?').toUpperCase();
                profileAvatarDiv.appendChild(span);
            }
        }
    }

    const profileName = document.getElementById('profile-name');
    if (profileName) profileName.textContent = user.name || 'Игрок';
    const profileId = document.getElementById('profile-id');
    if (profileId) profileId.textContent = user.telegramId || (user.id ? user.id.slice(0,8) : '—');
    document.getElementById('profile-level').textContent = user.level;

    const { xpInThisLevel, neededForNext, progress } = getXPProgress(user);
    document.getElementById('profile-xp-current').textContent = xpInThisLevel;
    document.getElementById('profile-xp-next').textContent = neededForNext;
    document.getElementById('profile-xp-fill').style.width = progress + '%';
    document.getElementById('profile-damage').textContent = user.totalDamage || 0;

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

// ========== ИНИЦИАЛИЗАЦИЯ ЗАДАНИЙ ==========
async function initTasks() {
    const tasksSnap = await db.collection('tasks').limit(1).get();
    if (tasksSnap.empty) {
        const defaultTask = {
            id: 'join_channel_sol_hiko',
            title: 'Вступить в канал игры',
            description: 'Подпишись на @sol_hiko',
            reward: { money: 500 },
            conditionType: 'telegram_channel',
            conditionData: { channel: '@sol_hiko', link: 'https://t.me/sol_hiko' },
            isActive: true
        };
        await db.collection('tasks').doc(defaultTask.id).set(defaultTask);
        console.log('➕ Тестовое задание добавлено');
    }
}

// ========== ЗАДАНИЯ: ОТКРЫТИЕ МОДАЛКИ И РЕНДЕР ==========
async function openTasksModal() {
    const modal = document.getElementById('tasks-modal');
    if (!modal) return;
    await renderTasksModal();   // теперь асинхронная
    modal.classList.remove('hidden');
}
window.openTasksModal = openTasksModal;

function closeTasksModal() {
    const modal = document.getElementById('tasks-modal');
    if (modal) modal.classList.add('hidden');
}
window.closeTasksModal = closeTasksModal;

async function renderTasksModal() {
    const user = store.user;
    if (!user) return;

    // Загружаем все активные задания из Firestore
    const tasksSnap = await db.collection('tasks').where('isActive', '==', true).get();
    const allTasks = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Фильтруем невыполненные
    const completed = user.completedTasks || [];
    const availableTasks = allTasks.filter(task => !completed.includes(task.id));

    const container = document.querySelector('.tasks-list');
    if (!container) return;

    if (availableTasks.length === 0) {
        container.innerHTML = '<p class="empty-msg">✨ Все задания выполнены! Жди новых.</p>';
        return;
    }

    let html = '';
    availableTasks.forEach(task => {
        html += `
            <div class="task-item" data-task-id="${task.id}" data-condition-type="${task.conditionType}">
                <div class="task-icon">📢</div>
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-desc">${task.description}</div>
                    <div class="task-reward">${formatReward(task.reward)}</div>
                </div>
                <div class="task-action">
                    <button class="task-btn task-btn-go" onclick="taskGo('${task.id}')">Перейти</button>
                    <button class="task-btn task-btn-check hidden" onclick="taskCheck('${task.id}')">Проверить</button>
                    <div class="task-done hidden">✅ Выполнено</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function formatReward(reward) {
    let parts = [];
    if (reward.money) parts.push(`🪙 +${reward.money}`);
    if (reward.energy) parts.push(`⚡ +${reward.energy}`);
    if (reward.item) parts.push(`🎁 ${reward.item}`);
    return parts.join(' + ') || '???';
}

// ========== ЗАДАНИЯ: ОБРАБОТЧИКИ ==========
window.taskGo = async function(taskId) {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) return;
    const task = taskDoc.data();

    if (task.conditionType === 'telegram_channel') {
        const link = task.conditionData?.link;
        if (link) {
            if (tg && typeof tg.openTelegramLink === 'function') {
                tg.openTelegramLink(link);
            } else {
                window.open(link, '_blank');
            }
            // Показываем кнопку "Проверить" для этой карточки
            const taskItem = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
            if (taskItem) {
                taskItem.querySelector('.task-btn-go').classList.add('hidden');
                taskItem.querySelector('.task-btn-check').classList.remove('hidden');
            }
        }
    }
};

window.taskCheck = async function(taskId) {
    const user = store.user;
    if (!user) return;

    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) return;
    const task = taskDoc.data();

    const taskItem = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    const checkBtn = taskItem?.querySelector('.task-btn-check');
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = '⏳ Проверяю...';
    }

    let success = false;
    if (task.conditionType === 'telegram_channel') {
        const userId = tg.initDataUnsafe?.user?.id;
        if (!userId) {
            showNotification('Ошибка', 'Не удалось получить Telegram ID');
            resetCheckButton(taskId);
            return;
        }
        try {
            const res = await fetch(`https://hiko-bot-backend.onrender.com/api/check-membership?user_id=${userId}`);
            const data = await res.json();
            success = data.isMember;
        } catch (err) {
            console.error('Check error:', err);
            showNotification('Ошибка', 'Не удалось проверить подписку');
        }
    }

    if (success) {
        // Начисляем награду
        const updates = {};
        if (task.reward.money) updates.money = (user.money || 0) + task.reward.money;
        if (task.reward.energy) {
            const currentEnergy = getCurrentEnergy();
            updates.energy = Math.min(user.maxEnergy, currentEnergy + task.reward.energy);
            updates.lastEnergyUpdate = Date.now();
        }
        const completedTasks = [...(user.completedTasks || []), taskId];
        updates.completedTasks = completedTasks;

        await updateUser(updates);

        // Обновляем отображение (скрываем карточку)
        if (taskItem) {
            taskItem.classList.add('hidden');
        }
        showNotification('🎉 Задание выполнено!', formatReward(task.reward));
    } else {
        showNotification('❌ Не засчитано', 'Попробуй ещё раз');
    }

    // Разблокируем кнопку, если не удалили карточку
    if (taskItem && !taskItem.classList.contains('hidden')) {
        const btn = taskItem.querySelector('.task-btn-check');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Проверить';
        }
    }
};

function resetCheckButton(taskId) {
    const taskItem = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    if (taskItem) {
        const btn = taskItem.querySelector('.task-btn-check');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Проверить';
        }
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
    const modal = document.getElementById('friends-modal');
    if (modal) modal.classList.add('hidden');
}
window.openFriendsModal = openFriendsModal;

function updateFriendsMyId() {
    const user = store.user;
    if (user) {
        const myIdEl = document.getElementById('friends-my-id-value');
        if (myIdEl) myIdEl.innerText = user.telegramId || (user.id ? user.id.slice(0,8) : '—');
    }
}

async function loadFriendsList() {
    const container = document.getElementById('friends-list-container');
    if (!container) return;
    const user = store.user;
    if (!user) return;
    if (!user.friends || user.friends.length === 0) {
        container.innerHTML = '<p class="empty-msg">У вас пока нет друзей</p>';
        return;
    }
    const friendDocs = await Promise.all(user.friends.map(fid => db.collection('users').doc(fid).get()));
    const friends = friendDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));

    let html = '';
    for (const friend of friends) {
        const lastSeen = friend.lastSeen || friend.lastEnergyUpdate || 0;
        const isOnline = Date.now() - lastSeen < 5 * 60 * 1000;
        const photoUrl = friend.photoUrl || '';
        const initial = (friend.name || '?').charAt(0).toUpperCase();
        const level = friend.level || 1;
        const avatarInner = photoUrl
            ? `<img class="member-avatar-img" src="${photoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="member-avatar-initials" style="display:none">${initial}</span>`
            : `<span class="member-avatar-initials">${initial}</span>`;
        html += `
            <div class="friend-item" data-user-id="${friend.id}" onclick="openVisitModal('${friend.id}')">
                <div class="member-avatar" style="flex-shrink:0;">
                    ${avatarInner}
                    <span class="member-level-badge">${level}</span>
                    <span class="friend-status ${isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:-2px;left:-2px;z-index:11;"></span>
                </div>
                <div class="friend-info">
                    <div class="friend-name">${friend.name || 'Без имени'}</div>
                    <div class="friend-id">${friend.telegramId || friend.id.slice(0,8)}</div>
                </div>
                <button class="remove-friend-btn" onclick="removeFriend('${friend.id}', event)">❌</button>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function loadFriendRequests() {
    const container = document.getElementById('friends-requests-container');
    if (!container) return;
    const requestsSnap = await db.collection('friendRequests').where('to', '==', store.docId).get();
    const requests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Синхронизируем pendingRequests в store.user и обновляем FAB
    if (store.user) {
        store.user.pendingRequests = requests.map(r => r.id);
        updateFriendsFabState();
    }

    if (requests.length === 0) {
        container.innerHTML = '<p class="empty-msg">Нет входящих заявок</p>';
        return;
    }

    let html = '';
    for (const req of requests) {
        const fromDoc = await db.collection('users').doc(req.from).get();
        const fromData = fromDoc.exists ? fromDoc.data() : {};
        const fromName = fromData.name || req.from.slice(0,6);
        const lastSeen = fromData.lastSeen || fromData.lastEnergyUpdate || 0;
        const isOnline = Date.now() - lastSeen < 5 * 60 * 1000;
        const reqPhotoUrl = fromData.photoUrl || '';
        const reqInitial = (fromName || '?').charAt(0).toUpperCase();
        const reqLevel = fromData.level || 1;
        const reqAvatarInner = reqPhotoUrl
            ? `<img class="member-avatar-img" src="${reqPhotoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="member-avatar-initials" style="display:none">${reqInitial}</span>`
            : `<span class="member-avatar-initials">${reqInitial}</span>`;
        html += `
            <div class="friend-request">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                    <div class="member-avatar" style="flex-shrink:0;">
                        ${reqAvatarInner}
                        <span class="member-level-badge">${reqLevel}</span>
                        <span class="friend-status ${isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:-2px;left:-2px;z-index:11;"></span>
                    </div>
                    <span style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fromName}</span>
                </div>
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
            const lastSeen = friend.lastSeen || friend.lastEnergyUpdate || 0;
            if (Date.now() - lastSeen < 5 * 60 * 1000) online++;
        }
    }
    document.getElementById('friends-online-count').textContent = online;
}

function updateFriendsFabState() {
    const fab = document.getElementById('friends-fab');
    if (!fab) return;
    const pending = store.incomingFriendRequestsCount || store.user?.pendingRequests?.length || 0;
    if (pending > 0) {
        fab.classList.add('fab-pending');
    } else {
        fab.classList.remove('fab-pending');
    }
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
        from: store.docId,
        to: targetId,
        timestamp: Date.now()
    });
    showNotification('Заявка отправлена', '');

    // Уведомляем получателя через бота
    try {
        const targetDoc = await db.collection('users').doc(targetId).get();
        if (targetDoc.exists) {
            const targetUser = targetDoc.data();
            const targetTelegramId = targetUser.telegramId;
            const fromName = store.user?.name || 'Игрок';
            if (targetTelegramId) {
                await fetch('https://hiko-bot-backend.onrender.com/api/notify-friend-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetTelegramId, fromName })
                });
                console.log('Уведомление о заявке отправлено пользователю', targetTelegramId);
            }
        }
    } catch (err) {
        console.error('Ошибка отправки уведомления о заявке:', err);
    }

    closeVisitModal(); // закрыть модалку визита после отправки заявки
};

window.acceptFriendRequest = async function(requestId, fromId) {
    const user = await getUser();
    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(store.docId);
            const friendRef = db.collection('users').doc(fromId);
            const requestRef = db.collection('friendRequests').doc(requestId);
            transaction.update(userRef, {
                friends: firebase.firestore.FieldValue.arrayUnion(fromId)
            });
            transaction.update(friendRef, {
                friends: firebase.firestore.FieldValue.arrayUnion(store.docId)
            });
            transaction.delete(requestRef);
        });

        await loadUserFromFirestore(true);
        loadFriendsList();
        loadFriendRequests();
        updateFriendsOnlineCount();
        updateFriendsFabState();
        showNotification('Друг добавлен', '');
    } catch (e) {
        console.error(e);
        showNotification('Ошибка', 'Не удалось принять заявку');
    }
};

window.declineFriendRequest = async function(requestId) {
    await db.collection('friendRequests').doc(requestId).delete();
    await loadUserFromFirestore(true);
    loadFriendRequests();
    updateFriendsFabState();
};

window.removeFriend = async function(friendId, event) {
    if (event) event.stopPropagation();
    const user = await getUser();
    if (!user.friends.includes(friendId)) return;
    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(store.docId);
            const friendRef = db.collection('users').doc(friendId);
            transaction.update(userRef, {
                friends: firebase.firestore.FieldValue.arrayRemove(friendId)
            });
            transaction.update(friendRef, {
                friends: firebase.firestore.FieldValue.arrayRemove(store.docId)
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

async function leaveGuild(guildId) {
    if (!store.authUser) return;
    const user = await getUser();
    if (!user.guildId || user.guildId !== guildId) {
        showNotification('Ошибка', 'Вы не в этой гильдии');
        return;
    }

    const guildRef = db.collection('guilds').doc(guildId);
    const userRef = db.collection('users').doc(store.docId);

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
        const isLeader = guild.leaderId === store.docId;

        if (isLeader) {
            const batch = db.batch();
            batch.delete(guildRef);
            const members = guild.members || [];
            for (const memberId of members) {
                const memberRef = db.collection('users').doc(memberId);
                batch.update(memberRef, { guildId: null });
            }
            // Отменяем все ожидающие приглашения в эту гильдию
            try {
                const pendingInvSnap = await db.collection('guildInvitations')
                    .where('guildId', '==', guildId)
                    .where('status', '==', 'pending')
                    .get();
                for (const invDoc of pendingInvSnap.docs) {
                    batch.update(invDoc.ref, { status: 'cancelled' });
                }
                console.log(`[Guild] Отменено ${pendingInvSnap.size} pending-приглашений для расформированной гильдии`);
            } catch (invErr) {
                console.warn('[Guild] Не удалось отменить приглашения:', invErr);
            }
            await batch.commit();
            showNotification('Гильдия расформирована', '');
        } else {
            await db.runTransaction(async (transaction) => {
                const freshGuildDoc = await transaction.get(guildRef);
                if (!freshGuildDoc.exists) throw new Error('Гильдия не найдена');
                const freshGuild = freshGuildDoc.data();
                if (!freshGuild.members.includes(store.docId)) {
                    throw new Error('Вы не состоите в гильдии');
                }
                transaction.update(guildRef, {
                    members: firebase.firestore.FieldValue.arrayRemove(store.docId)
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

async function removeFromGuild(guildId, memberId, event) {
    if (event) event.stopPropagation();
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
            if (guild.leaderId !== store.docId) {
                throw new Error('Только лидер может исключать участников');
            }
            if (memberId === store.docId) {
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

function showInviteMenu() {
    const guild = store.guild;
    if (!guild) return;
    const modal = document.getElementById('guild-invite-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    loadGuildInviteList(guild);
}

window.closeGuildInviteModal = function() {
    const modal = document.getElementById('guild-invite-modal');
    if (modal) modal.classList.add('hidden');
};

async function loadGuildInviteList(guild) {
    const container = document.getElementById('guild-invite-list');
    if (!container) return;
    const user = store.user;
    if (!user || !user.friends || user.friends.length === 0) {
        container.innerHTML = '<p class="empty-msg">У вас нет друзей для приглашения</p>';
        return;
    }
    container.innerHTML = '<p class="empty-msg">Загрузка...</p>';
    try {
        const friendDocs = await Promise.all(user.friends.map(fid => db.collection('users').doc(fid).get()));
        const friends = friendDocs.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));
        if (friends.length === 0) {
            container.innerHTML = '<p class="empty-msg">Нет друзей</p>';
            return;
        }
        // Check existing invitations to avoid duplicates
        const existingInvSnap = await db.collection('guildInvitations')
            .where('guildId', '==', guild.id)
            .where('status', '==', 'pending')
            .get();
        const alreadyInvited = new Set(existingInvSnap.docs.map(d => d.data().toUserId));

        let html = '';
        for (const friend of friends) {
            const inGuild = !!friend.guildId;
            const invited = alreadyInvited.has(friend.id);
            const avatarInner = friend.photoUrl
                ? `<img class="member-avatar-img" src="${friend.photoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="member-avatar-initials" style="display:none">${(friend.name || '?').charAt(0).toUpperCase()}</div>`
                : `<div class="member-avatar-initials">${(friend.name || '?').charAt(0).toUpperCase()}</div>`;
            const levelBadge = `<div class="member-level-badge">${friend.level || 1}</div>`;
            let btnHtml;
            if (inGuild) {
                btnHtml = `<div class="invite-friend-cell">
                    <button class="glow-button invite-send-btn" disabled style="opacity:0.45;cursor:not-allowed;">В гильдии</button>
                    <span class="invite-in-guild-note">Уже состоит в гильдии</span>
                </div>`;
            } else if (invited) {
                btnHtml = `<div class="invite-friend-cell">
                    <button class="glow-button invite-send-btn" disabled style="opacity:0.55;cursor:not-allowed;">Отправлено</button>
                </div>`;
            } else {
                btnHtml = `<div class="invite-friend-cell">
                    <button class="glow-button invite-send-btn" onclick="sendGuildInvitation('${guild.id}','${friend.id}',this)">📨 Пригласить</button>
                </div>`;
            }
            html += `<div class="guild-invite-friend-row">
                <div class="member-avatar" style="flex-shrink:0;">${avatarInner}${levelBadge}</div>
                <div class="member-name">${friend.name || 'Игрок'}</div>
                ${btnHtml}
            </div>`;
        }
        container.innerHTML = html;
    } catch (e) {
        console.error('Ошибка загрузки списка друзей для приглашения:', e);
        container.innerHTML = '<p class="empty-msg">Ошибка загрузки</p>';
    }
}

window.sendGuildInvitation = async function(guildId, toUserId, btn) {
    const guild = store.guild;
    if (!guild) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
        await db.collection('guildInvitations').add({
            guildId,
            guildName: guild.name || 'Гильдия',
            guildLevel: guild.level || 1,
            memberCount: guild.members?.length || 0,
            maxMembers: guild.maxMembers || 20,
            rating: guild.rating || 0,
            fromUserId: store.docId,
            toUserId,
            status: 'pending',
            createdAt: Date.now()
        });
        if (btn) { btn.textContent = '✅ Отправлено'; btn.disabled = true; btn.style.opacity = '0.55'; }
        console.log('✉️ Приглашение отправлено игроку', toUserId);

        // Уведомляем игрока через Telegram-бота
        try {
            const targetDoc = await db.collection('users').doc(toUserId).get();
            if (targetDoc.exists) {
                const targetUser = targetDoc.data();
                const targetTelegramId = targetUser.telegramId;
                const fromName = store.user?.name || 'Игрок';
                if (targetTelegramId) {
                    await fetch('https://hiko-bot-backend.onrender.com/api/notify-guild-invitation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetTelegramId, fromName, guildName: guild.name || 'Гильдия' })
                    });
                    console.log('🔔 Уведомление о приглашении в гильдию отправлено игроку', targetTelegramId);
                }
            }
        } catch (notifyErr) {
            console.warn('Не удалось отправить уведомление о приглашении:', notifyErr);
        }
    } catch (e) {
        console.error('Ошибка отправки приглашения:', e);
        if (btn) { btn.disabled = false; btn.textContent = '📨 Пригласить'; }
        showNotification('Ошибка', 'Не удалось отправить приглашение');
    }
};

window.acceptGuildInvitation = async function(invId, guildId) {
    try {
        // Сначала проверяем, существует ли гильдия
        const guildDoc = await db.collection('guilds').doc(guildId).get();
        if (!guildDoc.exists) {
            await db.collection('guildInvitations').doc(invId).update({ status: 'cancelled' });
            console.log('[Guild] Попытка принять приглашение в расформированную гильдию, приглашение отменено');
            showNotification('Гильдия расформирована', 'Эта гильдия больше не существует');
            loadGuildScreen();
            return;
        }
        await db.collection('guildInvitations').doc(invId).update({ status: 'accepted' });
        await joinGuild(guildId);
    } catch(e) {
        console.error('Ошибка принятия приглашения:', e);
        showNotification('Ошибка', 'Не удалось принять приглашение');
    }
};

window.declineGuildInvitation = async function(invId) {
    try {
        await db.collection('guildInvitations').doc(invId).update({ status: 'declined' });
        loadGuildScreen();
    } catch(e) {
        console.error('Ошибка отклонения приглашения:', e);
    }
};

// =======================================================
// ВИЗИТ К ДРУГОМУ ИГРОКУ (улучшенная версия)
// =======================================================
async function openVisitModal(userId) {
    if (!userId) return;
    const currentUser = store.user;
    const isSelf = currentUser && currentUser.id === userId;

    const modal = document.getElementById('visit-modal');
    if (!modal) return;

    // Устанавливаем фон только на контейнер персонажа
    const modalContent = document.querySelector('.modal-content.visit-content');
    if (modalContent) {
        modalContent.style.backgroundImage = '';
        modalContent.style.backgroundSize = '';
        modalContent.style.backgroundPosition = '';
    }
    const visitCharBg = modal.querySelector('.visit-character-bg');
    if (visitCharBg) {
        visitCharBg.style.backgroundImage = "url('img/background.JPG')";
    }

    // Сброс содержимого
    document.getElementById('visit-name').textContent = 'Загрузка...';
    document.getElementById('visit-level-badge').textContent = '1';
    document.getElementById('visit-telegram-id-value').textContent = '';
    document.getElementById('visit-guild-value').textContent = '';
    document.getElementById('visit-avatar-img').src = '';
    document.getElementById('visit-base-character').src = 'img/men.png';
    document.getElementById('visit-equipment-layer').innerHTML = '';
    document.getElementById('visit-pet-container').innerHTML = '';

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showNotification('Ошибка', 'Пользователь не найден');
            return;
        }
        const userData = userDoc.data();

        // Основная информация
        document.getElementById('visit-name').textContent = userData.name || 'Без имени';
        document.getElementById('visit-level-badge').textContent = userData.level || 1;
        document.getElementById('visit-telegram-id-value').textContent = userData.telegramId || userData.id.slice(0,8);

        // Гильдия
        let guildName = 'Нет гильдии';
        if (userData.guildId) {
            const guildDoc = await db.collection('guilds').doc(userData.guildId).get();
            if (guildDoc.exists) {
                guildName = guildDoc.data().name;
            }
        }
        document.getElementById('visit-guild-value').textContent = guildName;

        // Аватар
        const avatarImg = document.getElementById('visit-avatar-img');
        if (userData.photoUrl) {
            avatarImg.src = userData.photoUrl;
            avatarImg.style.display = '';
            const visitAvatarDiv = avatarImg.parentElement;
            const existingInit = visitAvatarDiv?.querySelector('.avatar-initials');
            if (existingInit) existingInit.remove();
        } else {
            avatarImg.style.display = 'none';
            const visitAvatarDiv = avatarImg.parentElement;
            if (visitAvatarDiv && !visitAvatarDiv.querySelector('.avatar-initials')) {
                const span = document.createElement('span');
                span.className = 'avatar-initials';
                span.textContent = (userData.name?.[0] || '?').toUpperCase();
                visitAvatarDiv.appendChild(span);
            }
        }

        // Скин персонажа
        const baseChar = document.getElementById('visit-base-character');
        if (userData.skin) {
            baseChar.src = userData.skin.imageUrl;
        } else {
            baseChar.src = 'img/men.png';
        }

        // Питомец
        const petContainer = document.getElementById('visit-pet-container');
        if (userData.pets && userData.pets.length > 0) {
            const pet = userData.pets[0];
            const img = document.createElement('img');
            img.src = pet.imageUrl;
            img.style.width = '80px';
            img.style.height = '80px';
            img.style.objectFit = 'contain';
            petContainer.appendChild(img);
        }

        // Кнопка добавления в друзья
        const addBtn = document.getElementById('visit-add-friend-btn');
        if (isSelf) {
            addBtn.style.display = 'none';
        } else {
            const isFriend = currentUser.friends && currentUser.friends.includes(userId);
            if (isFriend) {
                addBtn.textContent = '✅ Уже в друзьях';
                addBtn.disabled = true;
            } else {
                // Проверяем, не отправлена ли уже заявка
                const existingReq = await db.collection('friendRequests')
                    .where('from', '==', store.authUser.uid)
                    .where('to', '==', userId)
                    .get();
                if (!existingReq.empty) {
                    addBtn.textContent = '⏳ Заявка отправлена';
                    addBtn.disabled = true;
                } else {
                    addBtn.textContent = '➕ Добавить в друзья';
                    addBtn.disabled = false;
                    addBtn.onclick = () => sendFriendRequest(userId);
                }
            }
            addBtn.style.display = 'block';
        }

        modal.classList.remove('hidden');
    } catch (e) {
        console.error('Ошибка загрузки профиля для визита:', e);
        showNotification('Ошибка', 'Не удалось загрузить данные пользователя');
    }
}

function closeVisitModal() {
    document.getElementById('visit-modal').classList.add('hidden');
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
        setPreloaderProgress(15, 'Авторизация...');
        await initAuth();

        setPreloaderProgress(35, 'Загрузка данных...');
        await initTestData();
        await initTasks(); // <-- добавили инициализацию заданий

        setPreloaderProgress(65, 'Загрузка профиля...');
        await getUser();

        // Слушатель входящих заявок в друзья в реальном времени
        store.friendRequestsListener = db.collection('friendRequests')
            .where('to', '==', store.authUser.uid)
            .onSnapshot(snapshot => {
                store.incomingFriendRequestsCount = snapshot.size;
                console.log('🔔 Входящих заявок в друзья (live):', snapshot.size);
                updateFriendsFabState();
            }, err => {
                console.error('Ошибка слушателя заявок:', err);
            });

        setPreloaderProgress(90, 'Подготовка...');
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
                const userRef = db.collection('users').doc(store.docId);
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

            if (tab === 'character') renderSkins();
            if (tab === 'pets') { loadPetsGrid(); loadPetUpgradeList(); }
            if (tab === 'talents') {
                initTalentsTab();
            }
        });


// ===== Heartbeat для статуса онлайн =====
async function updateLastSeen() {
    if (!store.authUser) return;
    try {
        await db.collection('users').doc(store.docId).update({
            lastSeen: Date.now()
        });
        console.log('lastSeen обновлён');
    } catch (e) {
        console.warn('Ошибка обновления lastSeen:', e);
    }
}

        if (window.energyUpdateInterval) {
            clearInterval(window.energyUpdateInterval);
        }
        window.energyUpdateInterval = setInterval(updateMainUI, 1000);

        // Запуск heartbeat для онлайн-статуса (обновляем lastSeen каждые 60 секунд)
        updateLastSeen();
        if (window.lastSeenInterval) clearInterval(window.lastSeenInterval);
        window.lastSeenInterval = setInterval(updateLastSeen, 60000);

        updateBattleResultModalVisibility();

        document.getElementById('user-avatar').onclick = openProfileModal;
        document.getElementById('close-profile-modal').onclick = closeProfileModal;
        document.getElementById('close-friends-modal').onclick = closeFriendsModal;
        document.getElementById('close-visit-modal').onclick = closeVisitModal;

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
                const lastSeen = foundUser.lastSeen || foundUser.lastEnergyUpdate || 0;
                const isOnline = Date.now() - lastSeen < 5 * 60 * 1000;
                const srPhotoUrl = foundUser.photoUrl || '';
                const srInitial = (foundUser.name || '?').charAt(0).toUpperCase();
                const srLevel = foundUser.level || 1;
                const srAvatarInner = srPhotoUrl
                    ? `<img class="member-avatar-img" src="${srPhotoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="member-avatar-initials" style="display:none">${srInitial}</span>`
                    : `<span class="member-avatar-initials">${srInitial}</span>`;
                resultDiv.innerHTML = `
                    <div class="friend-item">
                        <div class="member-avatar" style="flex-shrink:0;">
                            ${srAvatarInner}
                            <span class="member-level-badge">${srLevel}</span>
                            <span class="friend-status ${isOnline ? 'online' : 'offline'}" style="position:absolute;bottom:-2px;left:-2px;z-index:11;"></span>
                        </div>
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
        if (window.friendsOnlineInterval) clearInterval(window.friendsOnlineInterval);
        window.friendsOnlineInterval = setInterval(updateFriendsOnlineCount, 10000);

        if (store.user.musicEnabled) {
            initMusic();
            playMusic();
        }

        const musicBtn = document.getElementById('music-toggle-btn');
        if (musicBtn) {
            musicBtn.addEventListener('click', toggleMusic);
        }

        setPreloaderProgress(90, 'Загрузка ресурсов...');

        // Предзагружаем все ключевые изображения игры
        const KEY_IMAGES = [
            'img/men.png',
            'img/battle1.png',
            'img/battle2.JPG',
            'img/battleboss1.png',
            'img/battleboss2.png',
            'img/boss1_preview.png',
            'img/boss2_preview.png',
            'img/background.JPG',
            'img/pet1.png',
            'img/pet2.png',
            'img/skin_knight.png',
            'img/skin_mage.png',
            'img/skin_rogue.png',
            'img/skin_dragon.png',
            'img/skin_druid.png',
            'img/skin_phantom.png',
        ];
        await preloadImages(KEY_IMAGES);

        setPreloaderProgress(100, 'Готово!');
        setTimeout(hidePreloader, 400);
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
window.buySkin = window.buySkin;
window.equipSkin = window.equipSkin;
window.previewSkin = window.previewSkin;
window.openVisitModal = openVisitModal;
window.closeVisitModal = closeVisitModal;

// =======================================================
// СУНДУК С СОКРОВИЩАМИ (ГАЧА)
// =======================================================

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
        id: 'gacha_skin_druid',
        name: 'Друид',
        type: 'skin',
        price: 0,
        imageUrl: 'img/skin_druid.png',
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
const STARS_COST = 10; // Telegram Stars price

let _countdownTimer = null;

// Показывает нужную кнопку и таймер в зависимости от доступности бесплатного прокрута
function updateSpinButtons(type) {
    const freeBtn   = document.getElementById('free-spin-btn');
    const spinBtn   = document.getElementById('spin-btn');
    const timerDiv  = document.getElementById('free-spin-timer');
    const costLabel = document.getElementById('spin-cost-label');
    if (!spinBtn) return;

    const hasFree = (type === 'regular') && checkTodayFreeSpin();

    if (freeBtn)  freeBtn.style.display  = hasFree ? '' : 'none';
    if (timerDiv) timerDiv.style.display = (!hasFree && type === 'regular') ? '' : 'none';
    spinBtn.style.display = hasFree ? 'none' : '';

    // Show cost outside button
    if (costLabel) {
        if (hasFree) {
            costLabel.textContent = '';
        } else if (type === 'stars') {
            costLabel.textContent = `Стоимость: ${STARS_COST} ⭐ Telegram Stars`;
        } else {
            costLabel.textContent = `Стоимость: ${GACHA_COST} 🪙`;
        }
    }

    if (!hasFree && type === 'regular') {
        startFreeSpinCountdown();
    } else {
        stopFreeSpinCountdown();
    }
}

function stopFreeSpinCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    const timerDiv = document.getElementById('free-spin-timer');
    if (timerDiv) timerDiv.style.display = 'none';
}

function startFreeSpinCountdown() {
    if (_countdownTimer) clearInterval(_countdownTimer);
    function tick() {
        if (checkTodayFreeSpin()) {
            stopFreeSpinCountdown();
            updateSpinButtons('regular');
            return;
        }
        const lastSpin = parseInt(localStorage.getItem('lastFreeSpinTimestamp') || '0');
        const nextFree = lastSpin + 24 * 60 * 60 * 1000;
        const diff = Math.max(0, nextFree - Date.now());
        const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        const el = document.getElementById('free-spin-countdown');
        if (el) el.textContent = h + ':' + m + ':' + s;
    }
    tick();
    _countdownTimer = setInterval(tick, 1000);
}

let gachaTreasurePool = [];
let regularTreasurePool = [];
let starsTreasurePool = [];
let currentChestTab = 'regular';
window.currentChestTab = currentChestTab;
let isSpinning = false;

async function loadTreasurePool() {
    console.log('📦 Загружаем пулы сундуков...');
    const snapshot = await db.collection('shop_items').get();
    const shopItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    regularTreasurePool = shopItems.filter(item => !item.exclusive);
    if (regularTreasurePool.length === 0) regularTreasurePool = shopItems; // fallback
    starsTreasurePool = [...EXCLUSIVE_GACHA_ITEMS];
    gachaTreasurePool = currentChestTab === 'stars' ? starsTreasurePool : regularTreasurePool;
    console.log('📦 Обычный:', regularTreasurePool.length, '| Звёздный:', starsTreasurePool.length);
}

function getActivePool() {
    return currentChestTab === 'stars' ? starsTreasurePool : regularTreasurePool;
}

function checkTodayFreeSpin() {
    const lastSpin = localStorage.getItem('lastFreeSpinTimestamp');
    if (!lastSpin) return true;
    return (Date.now() - parseInt(lastSpin)) >= 24 * 60 * 60 * 1000;
}

function markFreeSpinUsed() {
    localStorage.setItem('lastFreeSpinTimestamp', Date.now().toString());
}

window.switchChestTab = function(type) {
    currentChestTab = type;
    window.currentChestTab = type;
    document.getElementById('chest-tab-regular').classList.toggle('active', type === 'regular');
    document.getElementById('chest-tab-stars').classList.toggle('active', type === 'stars');
    const modalContent = document.querySelector('.treasure-modal-content');
    if (modalContent) modalContent.classList.toggle('stars-theme', type === 'stars');
    const chestIcon = document.getElementById('treasure-chest-icon');
    const titleText = document.getElementById('treasure-title-text');
    if (type === 'stars') {
        if (chestIcon) chestIcon.textContent = '⭐';
        if (titleText) titleText.textContent = 'Звёздный сундук';
    } else {
        if (chestIcon) chestIcon.textContent = '📦';
        if (titleText) titleText.textContent = 'Сундук с сокровищами';
    }
    const spinBtn = document.getElementById('spin-btn');
    if (spinBtn) {
        spinBtn.innerHTML = type === 'stars' ? '⭐ Крутить' : '🎰 Крутить';
    }
    updateSpinButtons(type);
    gachaTreasurePool = getActivePool();
    renderTreasurePool();
    buildSlotTrack();
    console.log('🔄 Сундук переключён:', type);
};

window.openTreasureModal = async function() {
    try {
        const modal = document.getElementById('treasure-modal');
        if (!modal) return;
        document.getElementById('treasure-inline-result').classList.add('hidden');
        modal.classList.remove('hidden');
        // Reset to regular tab on open
        currentChestTab = 'regular';
        window.currentChestTab = 'regular';
        document.getElementById('chest-tab-regular').classList.add('active');
        document.getElementById('chest-tab-stars').classList.remove('active');
        const modalContent = document.querySelector('.treasure-modal-content');
        if (modalContent) modalContent.classList.remove('stars-theme');
        const chestIcon = document.getElementById('treasure-chest-icon');
        const titleText = document.getElementById('treasure-title-text');
        if (chestIcon) chestIcon.textContent = '📦';
        if (titleText) titleText.textContent = 'Сундук с сокровищами';
        const spinBtn = document.getElementById('spin-btn');
        if (spinBtn) spinBtn.innerHTML = '🎰 Крутить';

        updateSpinButtons('regular');
        await loadTreasurePool();
        renderTreasurePool();
        buildSlotTrack();
    } catch (e) {
        console.error('Ошибка при открытии сундука:', e);
        showNotification('Ошибка', 'Не удалось загрузить сундук');
    }
};

window.closeTreasureModal = function() {
    document.getElementById('treasure-modal').classList.add('hidden');
    isSpinning = false;
};

function renderTreasurePool() {
    const grid = document.getElementById('treasure-pool-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const pool = getActivePool().length > 0 ? getActivePool() : gachaTreasurePool;
    pool.forEach(item => {
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

function buildSlotTrack() {
    const track = document.getElementById('slot-track');
    if (!track || gachaTreasurePool.length === 0) return;
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
    track.style.transform = 'translateY(0px)';
}

window.spinTreasure = async function(spinType) {
    if (isSpinning) return;
    const user = store.user;
    if (!user) { showNotification('Ошибка', 'Пользователь не загружен'); return; }

    // Determine mode: free / paid (coins) / stars
    const mode = spinType || 'paid';
    if (mode === 'free') {
        if (!checkTodayFreeSpin()) {
            showNotification('Уже использован', 'Бесплатный прокрут доступен раз в день');
            return;
        }
    } else if (mode === 'stars') {
        // Stars payment via Telegram – open invoice then spin
        const spinBtn = document.getElementById('spin-btn');
        const freeBtn = document.getElementById('free-spin-btn');
        if (spinBtn) { spinBtn.disabled = true; spinBtn.classList.add('spinning'); }
        if (freeBtn) freeBtn.disabled = true;
        try {
            const resp = await fetch('https://hiko-bot-backend.onrender.com/api/create-stars-invoice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-telegram-init-data': tg.initData || ''
                },
                body: JSON.stringify({ userId: store.user?.telegramId || store.docId, stars: STARS_COST })
            });
            const data = await resp.json();
            if (!data.success || !data.link) {
                showNotification('Ошибка', data.error || 'Не удалось создать счёт Stars');
                if (spinBtn) { spinBtn.disabled = false; spinBtn.classList.remove('spinning'); }
                if (freeBtn) freeBtn.disabled = false;
                return;
            }
            tg.openInvoice(data.link, (status) => {
                console.log('⭐ Stars payment status:', status);
                if (status === 'paid') {
                    // Payment confirmed — spin without coin deduction
                    spinTreasure('stars-paid');
                } else {
                    if (spinBtn) { spinBtn.disabled = false; spinBtn.classList.remove('spinning'); }
                    if (freeBtn) freeBtn.disabled = false;
                    if (status === 'failed') {
                        showNotification('Оплата не прошла', 'Попробуйте ещё раз');
                    }
                }
            });
        } catch (e) {
            console.error('Stars invoice error:', e);
            showNotification('Ошибка', 'Сбой при создании оплаты Stars');
            if (spinBtn) { spinBtn.disabled = false; spinBtn.classList.remove('spinning'); }
            if (freeBtn) freeBtn.disabled = false;
        }
        return;
    } else if (mode === 'stars-paid') {
        // Stars already paid – fall through to animation without deducting coins
    } else {
        // paid with coins
        if (user.money < GACHA_COST) {
            showNotification('Недостаточно монет', `Нужно ${GACHA_COST} 🪙`);
            return;
        }
    }

    // Ensure pool is loaded
    const activePool = getActivePool();
    if (activePool.length === 0) {
        await loadTreasurePool();
        if (getActivePool().length === 0) {
            showNotification('Ошибка', 'Пул пуст, попробуйте ещё раз');
            return;
        }
    }
    gachaTreasurePool = getActivePool();

    isSpinning = true;
    const spinBtn = document.getElementById('spin-btn');
    if (mode !== 'free') { spinBtn.disabled = true; }
    spinBtn.classList.add('spinning');
    // Disable free spin button during spin
    const freeBtn = document.getElementById('free-spin-btn');
    if (freeBtn) freeBtn.disabled = true;

    document.getElementById('treasure-inline-result').classList.add('hidden');

    const pool = gachaTreasurePool;
    const winner = pool[Math.floor(Math.random() * pool.length)];
    console.log('🎰 Победитель:', winner.name, '| Режим:', mode);

    const track = document.getElementById('slot-track');
    const itemHeight = 118; // высота элемента 118px
    const poolLen = pool.length;
    const winnerIndex = pool.findIndex(i => i.id === winner.id);

    const rotations = 3;
    const targetIndex = rotations * poolLen + winnerIndex;
    const targetY = -(targetIndex * itemHeight);

    track.style.transition = 'none';
    track.style.transform = 'translateY(0px)';
    void track.offsetHeight;
    track.style.transition = '';

    let startTime = null;
    const duration = 2200;

    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        const currentY = 0 + (targetY - 0) * eased;
        track.style.transform = `translateY(${currentY}px)`;
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            finalizeSpin(winner, mode);
        }
    }
    requestAnimationFrame(animate);
};

async function finalizeSpin(winner, mode) {
    const spinBtn = document.getElementById('spin-btn');
    try {
        const userRef = db.collection('users').doc(store.docId);
        let alreadyOwned = false;
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('Пользователь не найден');
            const data = userDoc.data();
            const inventory = data.inventory || [];
            alreadyOwned = inventory.some(inv => inv.id === winner.id);

            const updates = {};

            // Deduct cost only for paid spins
            if (mode === 'paid') {
                if (data.money < GACHA_COST) throw new Error('Недостаточно монет');
                updates.money = firebase.firestore.FieldValue.increment(-GACHA_COST);
            }
            // Free spin: no coin deduction; stars handled externally

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
            if (Object.keys(updates).length > 0) transaction.update(userRef, updates);
        });
        // Mark free spin used after successful transaction
        if (mode === 'free') {
            markFreeSpinUsed();
            updateSpinButtons('regular');
        }

        await loadUserFromFirestore(true);
        updateMainUI();

        if (document.getElementById('screen-workshop').classList.contains('active')) {
            const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
            if (activeTab === 'character') renderSkins();
            if (activeTab === 'pets') loadPetsGrid();
        }

        updateInlineResult(winner, alreadyOwned);
        hapticFeedback('heavy');
    } catch (e) {
        console.error('Ошибка гачи:', e);
        showNotification('Ошибка', e.message || 'Что-то пошло не так');
    } finally {
        spinBtn.disabled = false;
        spinBtn.classList.remove('spinning');
        isSpinning = false;
        // Restore correct button state after spin
        updateSpinButtons(currentChestTab);
    }
}

function updateInlineResult(item, alreadyOwned) {
    const inlineDiv = document.getElementById('treasure-inline-result');
    if (!inlineDiv) return;
    const nameSpan = inlineDiv.querySelector('.inline-result-name');
    const statusSpan = inlineDiv.querySelector('.inline-result-status');
    if (!nameSpan || !statusSpan) return;

    nameSpan.textContent = item.name;

    const user = store.user;
    // Use pre-transaction alreadyOwned flag when available (avoids false positive after inventory update)
    const owned = (alreadyOwned !== undefined) ? alreadyOwned : (user.inventory && user.inventory.some(inv => inv.id === item.id));

    let statusText = '';
    let statusClass = '';
    if (item.exclusive) {
        statusText = '✨ Эксклюзивный!';
        statusClass = 'exclusive';
    } else if (!owned) {
        statusText = '🎉 Новый предмет!';
        statusClass = 'new';
    } else {
        statusText = '📦 Уже есть в инвентаре';
        statusClass = 'owned';
    }
    statusSpan.textContent = statusText;
    statusSpan.className = 'inline-result-status ' + statusClass;

    inlineDiv.classList.remove('hidden');
}

window.openTreasureModal   = openTreasureModal;
window.closeTreasureModal  = closeTreasureModal;
window.spinTreasure        = spinTreasure;
window.switchChestTab      = switchChestTab;
