// assets/js/app.js
console.log("✅ app.js loaded");
const DAILY_QUEST_KEY = "h3_daily_quest_v1";
const CLASS_LEVEL_KEY = "h3_class_level_v1";
const ROADMAP_STORAGE_KEY = "h3_roadmap_v1";
const STUDY_PROGRESS_KEY = "h3_study_progress_v1";
const RELATIONSHIP_PROGRESS_KEY = "h3_relationship_v1";
const PACKAGE_STORAGE_KEY = "h3_package_v1";
const USER_STATE_KEY = "h3_user_state_v1";
const BOSS_HOF_KEY = "h3_boss_hof_v1";              // Hall of Fame (Phase 3)
const BOSS_STATE_KEY = "h3_boss_state_v1";
const TODAY_LESSON_STATE_KEY = "h3_today_lesson_v1"; // trạng thái checkbox bài học theo ngày
const TEACHBACK_DB_NAME = "h3_teachback_db_v1";
const TEACHBACK_DB_STORE = "clips";
const SHEET_SYNC_URL = "https://script.google.com/macros/s/AKfycbwg4J3QiG_q2q9o0MYdxe6o7jrT9Vb1eh7cPnYiScenZJj8C3_JRTMWRZPnGiO6pGOhEw/exec"
const SHEET_SYNC_API_KEY = "H3KEY";
const SYNC_QUEUE_KEY = "h3_sync_queue_1707200909012009";

const App = {
    focusTimerId: null,
    focusRemainingSec: 0,
    roadmapData: [],
    dailyQuest: null,
    classLevel: 0,
    lastLevelUpDate: null,
    userState: null,
    bossState: null,
    bossHallOfFame: [],
    currentStudyDayKey: null,   // 👈 NEW: ô đang được highlight trên map
    syncTimer: null,

    init() {
        this.initTabs();
        this.initTheme();
        this.initPackage();
        this.initMoodPicker();

        this.loadRoadmapFromStorage();
        this.loadStudyProgress();
        this.loadUserState();          // 👈 thêm

        // ⚡ Daily Quest + Level lớp
        this.loadDailyQuestFromStorage();
        this.loadClassLevel();

        this.initDemoData();
        this.bindEvents();
        this.initTeachback();
        this.initStudyGame();          // 👈 thêm (sau bindEvents để DOM có sẵn)
        this.initSeriesPopup();
        window.addEventListener("online", () => this.flushSyncQueue());
    },

    /* ========== TABS ========== */
    initTabs() {
        const navItems = document.querySelectorAll(".app-nav .nav-item");
        const tabPanels = document.querySelectorAll(".tab-panel");

        navItems.forEach((btn) => {
            btn.addEventListener("click", () => {
                const targetId = btn.getAttribute("data-tab-target");

                // active nav
                navItems.forEach((b) => b.classList.remove("is-active"));
                btn.classList.add("is-active");

                // active panel
                tabPanels.forEach((panel) => {
                    panel.classList.toggle("is-active", panel.id === targetId);
                });
            });
        });
    },

    /* ========== THEME ========== */
    initTheme() {
        const themeSelect = document.getElementById("themeSelect");
        const savedTheme = localStorage.getItem("userTheme") || "default";
        this.setTheme(savedTheme);

        if (themeSelect) {
            themeSelect.value = savedTheme;
            themeSelect.addEventListener("change", (e) => {
                this.setTheme(e.target.value);
            });
        }
    },

    setTheme(themeName) {
        const themeLink = document.getElementById("themeStylesheet");
        if (!themeLink) return;

        themeLink.href = `assets/css/theme-${themeName}.css`;
        document.documentElement.setAttribute("data-theme", themeName);
        localStorage.setItem("userTheme", themeName);
    },

    /* ========== USER STATE – GAME (SP / ORB / SPARK / MASTERY) ========== */
    getDefaultUserState() {
        const mastery = {};
        for (let i = 1; i <= 14; i++) {
            const key = `day${String(i).padStart(2, "0")}`;
            mastery[key] = 0;
        }

        return {
            uid: "demo-user",
            sp: 0,
            orbs: 0,
            sparks: 0,
            moves: {
                quick_strike: 1,
                focus_burst: 0,
                gratitude_shield: 0,
            },
            runes: [],
            loadout: ["quick_strike"],
            streak_days: 0,
            mastery_stars: mastery,
            leitner: { easy: [], medium: [], hard: [] },
            study_combo_perfect: false,
            chain_today: 0,
            last_fight: null,
            lastBossFightDate: null,   // nếu đã thêm ở bản trước thì giữ nguyên
            lastBossRushDate: null,    // 👈 NEW: ngày đã làm Boss Rush map 14 gần nhất
        };
    },

    loadUserState() {
        try {
            const raw = localStorage.getItem(USER_STATE_KEY);
            if (!raw) {
                this.userState = this.getDefaultUserState();
            } else {
                const parsed = JSON.parse(raw);
                const def = this.getDefaultUserState();
                this.userState = {
                    ...def,
                    ...parsed,
                    mastery_stars: {
                        ...def.mastery_stars,
                        ...(parsed.mastery_stars || {}),
                    },
                    leitner: {
                        ...def.leitner,
                        ...(parsed.leitner || {}),
                    },
                };
            }
        } catch (err) {
            console.error("Lỗi load user state:", err);
            this.userState = this.getDefaultUserState();
        }
    },

    saveUserState() {
        if (!this.userState) return;
        try {
            localStorage.setItem(USER_STATE_KEY, JSON.stringify(this.userState));
            this.enqueueSyncEvent(USER_STATE_KEY, this.userState);
            this.flushSyncQueueDebounced();
        } catch (err) {
            console.error("Lỗi save user state:", err);
        }
    },

    /* ========== BOSS STATE & HALL OF FAME ========== */

    getDefaultBossState() {
        // V1 demo: 1 boss/tuần, HP cố định 1000
        return {
            weekId: "W1-demo",
            hpMax: 1000,
            hpCurrent: 1000,
        };
    },

    loadBossState() {
        try {
            const raw = localStorage.getItem(BOSS_STATE_KEY);
            if (!raw) {
                this.bossState = this.getDefaultBossState();
            } else {
                const parsed = JSON.parse(raw);
                const def = this.getDefaultBossState();
                this.bossState = {
                    ...def,
                    ...parsed,
                };
            }
        } catch (err) {
            console.error("Lỗi load boss state:", err);
            this.bossState = this.getDefaultBossState();
        }
    },

    saveBossState() {
        if (!this.bossState) return;
        try {
            localStorage.setItem(BOSS_STATE_KEY, JSON.stringify(this.bossState));

            // 🔁 SYNC
            this.enqueueSyncEvent(BOSS_STATE_KEY, this.bossState);
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save boss state:", err);
        }
    },

    loadBossHallOfFame() {
        try {
            const raw = localStorage.getItem(BOSS_HOF_KEY);
            if (!raw) {
                this.bossHallOfFame = [];
            } else {
                this.bossHallOfFame = JSON.parse(raw) || [];
            }
        } catch (err) {
            console.error("Lỗi load boss HOF:", err);
            this.bossHallOfFame = [];
        }
    },

    saveBossHallOfFame() {
        try {
            const data = this.bossHallOfFame || [];
            localStorage.setItem(BOSS_HOF_KEY, JSON.stringify(data));

            // 🔁 SYNC
            this.enqueueSyncEvent(BOSS_HOF_KEY, data);
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save boss HOF:", err);
        }
    },

    renderBossArena() {
        if (!this.bossState) return;

        const hpCurEl = document.getElementById("bossHpCurrent");
        const hpMaxEl = document.getElementById("bossHpMax");
        const barFill = document.getElementById("bossHpBarFill");
        const weekLabelEl = document.getElementById("bossWeekLabel");

        if (hpCurEl) hpCurEl.textContent = this.bossState.hpCurrent;
        if (hpMaxEl) hpMaxEl.textContent = this.bossState.hpMax;
        if (weekLabelEl) weekLabelEl.textContent = this.bossState.weekId || "Week 1";

        if (barFill) {
            const ratio = Math.max(
                0,
                Math.min(1, this.bossState.hpCurrent / this.bossState.hpMax)
            );
            barFill.style.width = `${ratio * 100}%`;
        }

        // 👇 Khoá / mở nút Đánh Boss dựa trên D7
        const btnFightBoss = document.getElementById("btnFightBoss");
        if (btnFightBoss) {
            if (!this.isBossArenaUnlocked()) {
                btnFightBoss.disabled = true;
                btnFightBoss.textContent = "Khoá – hoàn thành D7 trong Boss Rush để mở";
            } else {
                btnFightBoss.disabled = false;
                btnFightBoss.textContent = "🔥 Đánh Boss 3 lượt (demo)";
            }
        }

        this.renderBossHallOfFame();
    },

    renderBossHallOfFame() {
        const listEl = document.getElementById("bossHofList");
        if (!listEl) return;

        if (!this.bossHallOfFame || this.bossHallOfFame.length === 0) {
            listEl.innerHTML = `
                <li>Chưa có lượt đánh nào hôm nay.</li>
            `;
            return;
        }

        const html = this.bossHallOfFame
            .slice(0, 5)
            .map(
                (entry, idx) => `
                <li>
                    <span>#${idx + 1}</span> – ${entry.uid || "Bạn"}: 
                    <strong>${entry.damage}</strong> dmg
                </li>`
            )
            .join("");

        listEl.innerHTML = html;
    },

    /* ========== BOSS DAMAGE V2 (DEMO) ========== */

    computeBossDamageDemo() {
        if (!this.userState) {
            this.loadUserState();
        }
        if (!this.bossState) {
            this.loadBossState();
        }

        const movesCfg = this.getMovesConfig();
        const loadout = this.userState.loadout || ["quick_strike"];
        const moveLevels = this.userState.moves || {};

        // 3 lượt: nếu loadout <3 thì lặp lại
        const turns = [];
        for (let i = 0; i < 3; i++) {
            const moveId = loadout[i % loadout.length];
            const level = moveLevels[moveId] || 0;
            const cfg = movesCfg[moveId];
            if (!cfg || level === 0) continue;

            // Base damage mỗi lượt = baseDamage * (1 + 0.3*(level-1))
            const base = cfg.baseDamage * (1 + 0.3 * (level - 1));
            turns.push({ moveId, baseDamage: base });
        }

        if (turns.length === 0) {
            return {
                total: 0,
                detail: "Chưa có chiêu nào mở trong loadout.",
            };
        }

        const sameMoveTwice =
            turns.length >= 2 &&
            turns[0].moveId === turns[1].moveId &&
            turns[1].moveId === (turns[2]?.moveId || turns[1].moveId);

        const Base = turns.reduce((sum, t) => sum + t.baseDamage, 0);

        // Perfect: dùng cờ study_combo_perfect từ lần học gần nhất (demo)
        const Perfect = !!this.userState.study_combo_perfect;
        const PerfectMult = Perfect ? 1.15 : 1;

        // Orb: dùng orbs hiện có, nhưng demo chỉ cho dùng tối đa 2
        const orbs_used = Math.min(this.userState.orbs || 0, 2);
        const OrbMult = 1 + 0.2 * orbs_used;

        // Chain multiplier: từ chain_today (thiệp), demo: >=10:1.1; >=5:1.05
        const chain = this.userState.chain_today || 0;
        const ChainMult = chain >= 10 ? 1.1 : chain >= 5 ? 1.05 : 1;

        const AntiSpam = sameMoveTwice ? 0.85 : 1;

        // AI phase: dựa trên HP hiện tại
        const hpRatio = this.bossState.hpCurrent / this.bossState.hpMax;
        let AIphase = 1;
        if (hpRatio < 0.2) {
            AIphase = 0.5; // shield
        } else if (hpRatio < 0.5) {
            AIphase = 1.25; // enrage
        }

        const Final = Math.round(
            Base * PerfectMult * OrbMult * ChainMult * AntiSpam * AIphase
        );

        const detail =
            `Base=${Base.toFixed(1)}, Perfect×${PerfectMult.toFixed(2)}, ` +
            `Orb×${OrbMult.toFixed(2)}, Chain×${ChainMult.toFixed(2)}, ` +
            `AntiSpam×${AntiSpam.toFixed(2)}, AI×${AIphase.toFixed(2)}`;

        return {
            total: Final,
            detail,
            orbs_used,
            chain,
            perfect: Perfect,
            sameMoveTwice,
            turns,
        };
    },

    /* ========== MOOD PICKER ========== */
    initMoodPicker() {
        const moodPicker = document.getElementById("moodPicker");
        if (!moodPicker) return;

        const moods = [
            { id: "great", emoji: "😄", label: "Rất tốt" },
            { id: "ok", emoji: "🙂", label: "Ổn" },
            { id: "meh", emoji: "😐", label: "Bình thường" },
            { id: "tired", emoji: "😴", label: "Mệt" },
            { id: "sad", emoji: "😔", label: "Buồn" },
            { id: "stressed", emoji: "😣", label: "Căng" },
        ];

        moods.forEach((m) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "mood-option";
            btn.dataset.moodId = m.id;
            btn.title = m.label;
            btn.textContent = m.emoji;

            btn.addEventListener("click", () => {
                document
                    .querySelectorAll(".mood-option")
                    .forEach((el) => el.classList.remove("is-selected"));
                btn.classList.add("is-selected");
                moodPicker.dataset.currentMood = m.id;
            });

            moodPicker.appendChild(btn);
        });
    },

    initPackage() {
        const select = document.getElementById("packageSelect");
        const saved = localStorage.getItem(PACKAGE_STORAGE_KEY) || "normal";
        this.currentPackage = saved;

        this.applyPackage(saved);

        if (select) {
            select.value = saved;
            select.addEventListener("change", (e) => {
                this.currentPackage = e.target.value;
                this.applyPackage(this.currentPackage);
            });
        }
    },

    applyPackage(pkg) {
        document.documentElement.setAttribute("data-package", pkg);
        localStorage.setItem(PACKAGE_STORAGE_KEY, pkg);

        this.applyPackageVisibility(pkg);

        const badge = document.getElementById("packageBadge");
        if (badge) badge.textContent = pkg === "exam" ? "Ôn gấp" : "Học bình thường";
    },

    applyPackageVisibility(pkg) {
        document.querySelectorAll("[data-package-only]").forEach((el) => {
            el.style.display = el.dataset.packageOnly === pkg ? "" : "none";
        });

        document.querySelectorAll("[data-package-hide]").forEach((el) => {
            el.style.display = el.dataset.packageHide === pkg ? "none" : "";
        });
    },

    /* ========== STUDY – RESOURCE / SHOP / LOADOUT ========== */

    renderResourcesBar() {
        if (!this.userState) return;
        const spEl = document.getElementById("spValue");
        const orbEl = document.getElementById("orbValue");
        const sparkEl = document.getElementById("sparkValue");

        if (spEl) spEl.textContent = this.userState.sp ?? 0;
        if (orbEl) orbEl.textContent = this.userState.orbs ?? 0;
        if (sparkEl) sparkEl.textContent = this.userState.sparks ?? 0;
    },

    getMovesConfig() {
        // mô tả 3 chiêu: tên, base damage, mô tả, cost nâng cấp
        return {
            quick_strike: {
                id: "quick_strike",
                label: "Quick",
                description: "Đòn đánh nhanh – base damage thấp nhưng rẻ.",
                baseDamage: 10,
                upgradeCosts: [1, 2, 3], // level 1->2, 2->3, 3->max
            },
            focus_burst: {
                id: "focus_burst",
                label: "FocusBurst",
                description: "Tiêu hao Orb để tăng damage.",
                baseDamage: 12,
                upgradeCosts: [2, 3, 4],
            },
            gratitude_shield: {
                id: "gratitude_shield",
                label: "GratitudeShield",
                description: "Tiêu hao Spark – buff phòng thủ / multiplier.",
                baseDamage: 8,
                upgradeCosts: [2, 3, 4],
            },
        };
    },

    renderShop() {
        if (!this.userState) return;
        const container = document.getElementById("shopMovesList");
        if (!container) return;

        const movesCfg = this.getMovesConfig();
        const currentMoves = this.userState.moves || {};
        container.innerHTML = "";

        Object.values(movesCfg).forEach((cfg) => {
            const level = currentMoves[cfg.id] ?? 0;
            const maxLevel = 3;
            const canUpgrade = level < maxLevel;
            const nextCost =
                canUpgrade ? cfg.upgradeCosts[Math.max(level - 0, 0)] || cfg.upgradeCosts[0] : null;

            const row = document.createElement("div");
            row.className = "shop-move-row";

            row.innerHTML = `
                <div class="shop-move-main">
                    <span class="shop-move-name">${cfg.label}</span>
                    <span class="shop-move-meta">${cfg.description}</span>
                    <span class="shop-move-level">Level hiện tại: ${level}/${maxLevel}</span>
                </div>
                <div class="shop-move-side">
                    ${canUpgrade
                    ? `<div class="shop-move-cost">Cost: ${nextCost} SP</div>
                               <button class="btn btn-small shop-move-btn" data-move-id="${cfg.id}">
                                   Nâng cấp
                               </button>`
                    : `<div class="shop-move-cost">Đã max level</div>`
                }
                </div>
            `;

            container.appendChild(row);
        });

        container.querySelectorAll(".shop-move-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const moveId = e.currentTarget.getAttribute("data-move-id");
                this.handleUpgradeMove(moveId);
            });
        });
    },

    handleUpgradeMove(moveId) {
        if (!this.userState) return;
        const movesCfg = this.getMovesConfig()[moveId];
        if (!movesCfg) return;

        const maxLevel = 3;
        const currentLevel = this.userState.moves?.[moveId] ?? 0;
        if (currentLevel >= maxLevel) {
            alert("Chiêu đã đạt max level.");
            return;
        }

        const costs = movesCfg.upgradeCosts;
        const cost = costs[Math.max(currentLevel - 0, 0)] || costs[0];

        if (this.userState.sp < cost) {
            alert(`Không đủ SP. Cần ${cost} SP để nâng cấp.`);
            return;
        }

        this.userState.sp -= cost;
        this.userState.moves[moveId] = currentLevel + 1;
        this.saveUserState();

        this.renderResourcesBar();
        this.renderShop();
        this.renderLoadout();

        alert(`Đã nâng cấp ${movesCfg.label} lên level ${currentLevel + 1}!`);
    },

    renderLoadout() {
        if (!this.userState) return;
        const container = document.getElementById("loadoutMovesList");
        const hint = document.getElementById("loadoutHint");
        if (!container) return;

        const movesCfg = this.getMovesConfig();
        const currentMoves = this.userState.moves || {};
        const currentLoadout = this.userState.loadout || [];

        container.innerHTML = "";

        Object.values(movesCfg).forEach((cfg) => {
            const level = currentMoves[cfg.id] ?? 0;
            const pill = document.createElement("div");
            pill.className = "loadout-pill";
            if (currentLoadout.includes(cfg.id)) {
                pill.classList.add("is-active");
            }

            const disabled = level === 0;

            pill.textContent = `${cfg.label} (Lv.${level})${disabled ? " – chưa mở" : ""
                }`;

            if (!disabled) {
                pill.addEventListener("click", () => {
                    this.toggleLoadoutMove(cfg.id);
                });
            } else {
                pill.style.opacity = 0.5;
                pill.style.cursor = "not-allowed";
            }

            container.appendChild(pill);
        });

        if (hint) {
            hint.textContent = `Đang chọn: ${(this.userState.loadout || [])
                .map((id) => movesCfg[id]?.label || id)
                .join(", ") || "chưa chọn"} (tối đa 3 chiêu).`;
        }
    },

    toggleLoadoutMove(moveId) {
        if (!this.userState) return;
        const movesCfg = this.getMovesConfig();
        const maxSlots = 3;

        const currentLoadout = Array.isArray(this.userState.loadout)
            ? [...this.userState.loadout]
            : [];

        const idx = currentLoadout.indexOf(moveId);
        if (idx >= 0) {
            currentLoadout.splice(idx, 1);
        } else {
            if (currentLoadout.length >= maxSlots) {
                alert(`Bạn chỉ được mang tối đa ${maxSlots} chiêu vào Boss Rush.`);
                return;
            }
            currentLoadout.push(moveId);
        }

        this.userState.loadout = currentLoadout;
        this.saveUserState();
        this.renderLoadout();
    },

    /* ========== ROADMAP HỌC TẬP TỪ CSV ========== */

    // Đọc nội dung CSV từ File user chọn
    handleCsvImport(file) {
        if (!file) return;

        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target.result;
            this.roadmapData = this.parseRoadmapCsv(text);

            // Gán status theo ngày thực
            this.updateRoadmapStatuses();

            // 💾 Lưu vào localStorage
            this.saveRoadmapToStorage();

            // Render UI
            this.renderRoadmap();
            this.updateTodayLessonFromRoadmap();
        };

        reader.onerror = (e) => {
            console.error("Lỗi đọc file CSV:", e);
            const container = document.getElementById("roadmapContainer");
            if (container) {
                container.innerHTML = `
          <p class="placeholder">
            Không đọc được file CSV. Vui lòng thử lại với file khác.
          </p>
        `;
            }
        };

        reader.readAsText(file, "utf-8");
    },

    // Chuyển text CSV thành mảng object
    parseRoadmapCsv(csvText) {
        const lines = csvText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        if (lines.length <= 1) return [];

        const headers = lines[0].split(",").map((h) => h.trim());
        const dataLines = lines.slice(1);

        const items = dataLines.map((line) => {
            const cols = line.split(",").map((c) => c.trim());
            const obj = {};
            headers.forEach((key, idx) => {
                obj[key] = cols[idx] || "";
            });
            return obj;
        });

        return items;
    },

    // parse "dd/mm" thành Date của năm hiện tại
    parseDateDdMm(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split("/");
        if (parts.length !== 2) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS month 0-11
        const year = new Date().getFullYear(); // dùng năm hiện tại
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
    },

    // Gán statusKey + statusLabel cho từng task dựa trên ngày thực tế
    updateRoadmapStatuses() {
        const today = this.getTodayDate();

        this.roadmapData = this.roadmapData.map((item, index) => {
            const taskDate = this.parseDateDdMm(item.date);

            let statusKey = "pending";
            let statusLabel = "Chưa xếp lịch";

            if (!taskDate) {
                // không parse được ngày => để mặc định
            } else {
                const t = taskDate.getTime();
                const todayTime = today.getTime();

                if (t === todayTime) {
                    statusKey = "today";
                    statusLabel = "Hôm nay";
                } else if (t < todayTime) {
                    statusKey = "overdue";
                    statusLabel = "Thiếu";
                } else {
                    statusKey = "upcoming";
                    statusLabel = "Sắp tới";
                }
            }

            // sau này nếu bạn có logic "đã hoàn thành" => override ở đây:
            // if (this.isTaskCompleted(item, index)) { statusKey = "done"; statusLabel = "Đã xong"; }

            return {
                ...item,
                statusKey,
                statusLabel,
                // có thể gán thêm taskId để lưu localStorage sau này
                taskId: `${item.date}__${item.day}__${index}`,
            };
        });
    },

    updateRelationshipSummary(progress) {
        const relationshipSummary = document.getElementById("relationshipSummary");
        if (!relationshipSummary) return;

        const gifts = progress.gifts || 0;
        const missionsDone = (progress.missionsCompleted || []).length;
        const lastRecipient = progress.lastRecipient || "Chưa có";

        relationshipSummary.innerHTML = `
      <li>Thiệp đã tạo: <strong>${gifts}</strong></li>
      <li>Nhiệm vụ kindness hoàn thành: <strong>${missionsDone}</strong></li>
      <li>Người nhận gần nhất: <strong>${lastRecipient}</strong></li>
    `;

        this.updateLwi(progress);
    },

    updateLwi(progress) {
        const lwiScoreEl = document.getElementById("lwiScore");
        const lwiHistoryEl = document.getElementById("lwiHistory");
        if (!lwiScoreEl || !lwiHistoryEl) return;

        const gifts = progress.gifts || 0;
        const missionsDone = (progress.missionsCompleted || []).length;

        // LWI rất đơn giản: 50 điểm nền + 5*missions + 3*gifts, max 100
        let score = 50 + missionsDone * 5 + gifts * 3;
        if (score > 100) score = 100;

        lwiScoreEl.textContent = score;

        lwiHistoryEl.innerHTML = `
      <p class="placeholder">
        Điểm LWI hiện tại: ${score}/100.<br/>
        • Thiệp đã tạo: ${gifts}<br/>
        • Nhiệm vụ kindness: ${missionsDone}
      </p>
    `;
    },

    /* ========== DAILY QUEST (Học · Focus · Thiệp) ========== */

    loadDailyQuestFromStorage() {
        const todayIso = this.getTodayIso();
        let stored = null;

        try {
            const raw = localStorage.getItem(DAILY_QUEST_KEY);
            if (raw) stored = JSON.parse(raw);
        } catch (err) {
            console.error("Lỗi load daily quest:", err);
        }

        if (!stored || stored.date !== todayIso) {
            // Ngày mới hoặc chưa có => reset
            this.dailyQuest = {
                date: todayIso,
                study: false,
                focus: false,
                gratitude: false,
            };
            this.saveDailyQuestToStorage();
        } else {
            this.dailyQuest = stored;
        }

        this.renderDailyQuestStrip();
    },

    saveDailyQuestToStorage() {
        if (!this.dailyQuest) return;
        try {
            localStorage.setItem(DAILY_QUEST_KEY, JSON.stringify(this.dailyQuest));

            // 🔁 SYNC
            this.enqueueSyncEvent(DAILY_QUEST_KEY, this.dailyQuest);
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save daily quest:", err);
        }
    },

    renderDailyQuestStrip() {
        const strip = document.getElementById("dailyQuestStrip");
        if (!strip || !this.dailyQuest) return;

        const { study, focus, gratitude } = this.dailyQuest;

        strip.innerHTML = `
      <div class="quest-item ${study ? "is-done" : ""}">
        <div class="quest-icon">📚</div>
        <div>
          <div class="quest-text-main">Học 3 nhiệm vụ</div>
          <div class="quest-text-sub">${study ? "Đã hoàn tất hôm nay" : "Clear Boss Rush ngày hôm nay"}</div>
        </div>
      </div>
      <div class="quest-item ${focus ? "is-done" : ""}">
        <div class="quest-icon">⏱️</div>
        <div>
          <div class="quest-text-main">1 phiên Focus 25’+</div>
          <div class="quest-text-sub">${focus ? "Đã hoàn tất hôm nay" : "Hoàn thành 1 phiên Focus Arena"}</div>
        </div>
      </div>
      <div class="quest-item ${gratitude ? "is-done" : ""}">
        <div class="quest-icon">💌</div>
        <div>
          <div class="quest-text-main">1 thiệp biết ơn</div>
          <div class="quest-text-sub">${gratitude ? "Đã tạo thiệp hôm nay" : "Tạo 1 thiệp trong Gratitude Chain"}</div>
        </div>
      </div>
    `;
    },

    markDailyQuestDone(kind) {
        if (!this.dailyQuest) {
            this.loadDailyQuestFromStorage();
        }
        if (!this.dailyQuest) return;

        // Nếu đã done rồi thì thôi
        if (this.dailyQuest[kind]) return;

        this.dailyQuest[kind] = true;
        this.saveDailyQuestToStorage();
        this.renderDailyQuestStrip();

        // Kiểm tra xem đủ 3 quest để up level lớp
        this.checkClassLevelUpAfterQuest();
    },

    /* ========== CLASS LEVEL (0–10) ========== */

    loadClassLevel() {
        try {
            const raw = localStorage.getItem(CLASS_LEVEL_KEY);
            if (!raw) {
                this.classLevel = 0;
                this.lastLevelUpDate = null;
            } else {
                const data = JSON.parse(raw);
                this.classLevel = data.level || 0;
                this.lastLevelUpDate = data.lastLevelUpDate || null;
            }
        } catch (err) {
            console.error("Lỗi load class level:", err);
            this.classLevel = 0;
            this.lastLevelUpDate = null;
        }

        this.renderClassLevel();
    },

    saveClassLevel() {
        try {
            const payload = {
                level: this.classLevel || 0,
                lastLevelUpDate: this.lastLevelUpDate || null,
            };

            localStorage.setItem(CLASS_LEVEL_KEY, JSON.stringify(payload));

            // 🔁 SYNC
            this.enqueueSyncEvent(CLASS_LEVEL_KEY, payload);
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save class level:", err);
        }
    },

    renderClassLevel() {
        const valueEl = document.getElementById("classLevelValue");
        const barFill = document.getElementById("classLevelBarFill");
        if (!valueEl) return;

        const level = this.classLevel || 0;
        valueEl.textContent = level;

        if (barFill) {
            const percent = Math.min(100, (level / 10) * 100);
            barFill.style.width = `${percent}%`;
        }
    },

    checkClassLevelUpAfterQuest() {
        if (!this.dailyQuest) return;

        const todayIso = this.getTodayIso();
        const allDone =
            this.dailyQuest.study &&
            this.dailyQuest.focus &&
            this.dailyQuest.gratitude;

        if (!allDone) return;
        if (this.lastLevelUpDate === todayIso) return; // đã lên hôm nay
        if (this.classLevel >= 10) return; // max 10

        this.classLevel += 1;
        this.lastLevelUpDate = todayIso;
        this.saveClassLevel();
        this.renderClassLevel();

        // Animation nhỏ
        const valueEl = document.getElementById("classLevelValue");
        if (valueEl) {
            valueEl.classList.add("levelup-anim");
            setTimeout(() => {
                valueEl.classList.remove("levelup-anim");
            }, 600);
        }

        // Toast “Level up”
        const toast = document.createElement("div");
        toast.className = "levelup-toast";
        toast.textContent = `Level lớp +1! (Level ${this.classLevel}/10)`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 2000);
    },

    /* ========== LƯU / LOAD RELATIONSHIP PROGRESS ========== */
    loadRelationshipProgress() {
        try {
            const raw = localStorage.getItem(RELATIONSHIP_PROGRESS_KEY);
            if (!raw) return {
                gifts: 0,
                lastRecipient: null,
                missionsCompleted: [],
            };

            return JSON.parse(raw);
        } catch (err) {
            console.error("Lỗi load relationship progress:", err);
            return {
                gifts: 0,
                lastRecipient: null,
                missionsCompleted: [],
            };
        }
    },

    saveRelationshipProgress(progress) {
        try {
            localStorage.setItem(
                RELATIONSHIP_PROGRESS_KEY,
                JSON.stringify(progress)
            );

            // 🔁 SYNC
            this.enqueueSyncEvent(RELATIONSHIP_PROGRESS_KEY, progress);
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save relationship progress:", err);
        }
    },
    /* ========== LƯU / LOAD LỘ TRÌNH TỪ LOCALSTORAGE ========== */
    /* ========== LƯU / LOAD TIẾN ĐỘ HỌC TẬP (STREAK) ========== */

    loadStudyProgress() {
        try {
            const raw = localStorage.getItem(STUDY_PROGRESS_KEY);
            if (!raw) return;

            const data = JSON.parse(raw);
            const streakEl = document.getElementById("streakValue");
            if (streakEl && typeof data.streak === "number") {
                streakEl.textContent = data.streak;
            }
        } catch (err) {
            console.error("Lỗi load study progress:", err);
        }
    },

    saveStudyProgress(progress) {
        try {
            localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(progress));

            // 🔁 SYNC
            this.enqueueSyncEvent(STUDY_PROGRESS_KEY, progress);
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save study progress:", err);
        }
    },

    /* ========== TRẠNG THÁI CHECKBOX BÀI HỌC HÔM NAY ========== */
    loadTodayLessonState() {
        const todayIso = this.getTodayIso();

        try {
            const raw = localStorage.getItem(TODAY_LESSON_STATE_KEY);
            if (!raw) {
                return {
                    date: todayIso,
                    tasks: {},
                    completed: false,
                };
            }

            const parsed = JSON.parse(raw);
            if (parsed.date !== todayIso) {
                // Sang ngày mới => reset
                return {
                    date: todayIso,
                    tasks: {},
                    completed: false,
                };
            }

            return {
                date: parsed.date,
                tasks: parsed.tasks || {},
                completed: !!parsed.completed,
            };
        } catch (err) {
            console.error("Lỗi load today lesson state:", err);
            return {
                date: todayIso,
                tasks: {},
                completed: false,
            };
        }
    },

    saveTodayLessonState(state) {
        try {
            localStorage.setItem(
                TODAY_LESSON_STATE_KEY,
                JSON.stringify(state || {})
            );

            // 🔁 SYNC
            this.enqueueSyncEvent(TODAY_LESSON_STATE_KEY, state || {});
            this.flushSyncQueueDebounced();

        } catch (err) {
            console.error("Lỗi save today lesson state:", err);
        }
    },

    handleTodayTaskCheckboxChange(taskId, isChecked) {
        const state = this.loadTodayLessonState();
        state.tasks = state.tasks || {};
        state.tasks[taskId] = isChecked;
        this.saveTodayLessonState(state);

        // Re-render lại khu Bài học hôm nay để cập nhật nút Hoàn tất
        this.updateTodayLessonFromRoadmap();
    },

    handleCompleteTodayLesson() {
        const state = this.loadTodayLessonState();

        if (state.completed) {
            alert("Bạn đã hoàn thành ngày học hôm nay rồi.");
            return;
        }

        // Chốt: ngày hôm nay đã hoàn thành
        state.completed = true;
        this.saveTodayLessonState(state);

        // Cập nhật chuỗi ngày học
        this.markStudyDoneToday({ silent: false });

        const status = document.getElementById("todayStatus");
        if (status) status.textContent = "Đã hoàn thành ngày học hôm nay 🎉";

        // Khoá checkbox lại
        this.updateTodayLessonFromRoadmap();
    },

    /* ========== BOSS RUSH – STUDY MAP 14 NGÀY (V1 DEMO) ========== */

    initStudyGame() {
        if (!this.userState) {
            this.loadUserState();
        }

        this.currentStudyDayKey = this.getCurrentStudyDayKeyForUi();

        // Phase 1: map 14 ngày – nếu chưa làm, có thể thêm sau
        if (typeof this.renderStudyMap === "function") {
            this.renderStudyMap();
        }

        // Phase 2: Resource + Shop + Loadout
        this.renderResourcesBar();
        this.renderShop();
        this.renderLoadout();

        // Boss Arena
        this.loadBossState();
        this.loadBossHallOfFame();
        this.renderBossArena();

        // nếu có nút mission demo thì vẫn giữ
        const btnStart = document.getElementById("btnStartStudyMissions");
        const btnCompleteDemo = document.getElementById("btnCompleteStudyDemo");
        if (btnStart && this.handleStartStudyMissions) {
            btnStart.addEventListener("click", () => this.handleStartStudyMissions());
        }
        if (btnCompleteDemo && this.handleCompleteStudyDemo) {
            btnCompleteDemo.addEventListener("click", () => this.handleCompleteStudyDemo());
        }

        // 👇 Cập nhật trạng thái nút Boss Rush theo ngày
        this.updateBossRushButtonState();
    },

    getStudyDayKeys() {
        const keys = [];
        for (let i = 1; i <= 14; i++) {
            keys.push(`day${String(i).padStart(2, "0")}`);
        }
        return keys;
    },

    // Dùng cho LOGIC: ngày tiếp theo sẽ được cộng sao
    getNextStudyDayKeyForProgress() {
        const keys = this.getStudyDayKeys();
        const firstEmpty = keys.find((k) => {
            const v = this.userState.mastery_stars[k];
            return !v || v === 0;
        });
        // Nếu đã hết ô trống thì trả về ô cuối cùng
        return firstEmpty || keys[keys.length - 1];
    },

    // Dùng cho UI: ô đang "active" trên map
    getCurrentStudyDayKeyForUi() {
        const keys = this.getStudyDayKeys();
        // Tìm ngày đã clear gần nhất (từ D14 ngược về)
        const lastCleared = [...keys]
            .reverse()
            .find((k) => (this.userState.mastery_stars[k] || 0) > 0);

        if (lastCleared) return lastCleared;

        // Nếu chưa clear ô nào → active ô đầu tiên cần học
        return this.getNextStudyDayKeyForProgress();
    },

    /* ========== BOSS RUSH – GIỚI HẠN 1 LẦN / NGÀY ========== */
    canDoBossRushToday() {
        if (!this.userState) this.loadUserState();
        const todayIso = this.getTodayIso();
        return this.userState.lastBossRushDate !== todayIso;
    },

    hasUnclearedStudyDay() {
        if (!this.userState) this.loadUserState();
        const keys = this.getStudyDayKeys();
        return keys.some((k) => {
            const v = this.userState.mastery_stars[k];
            return !v || v === 0;
        });
    },

    updateBossRushButtonState() {
        const btnStart = document.getElementById("btnStartStudyMissions");
        if (!btnStart) return;
        if (!this.userState) this.loadUserState();

        // Nếu đã clear hết map 14 ngày
        if (!this.hasUnclearedStudyDay()) {
            btnStart.disabled = true;
            btnStart.textContent = "Đã hoàn thành map 14 ngày";
            return;
        }

        // Còn ô chưa clear
        if (!this.canDoBossRushToday()) {
            btnStart.disabled = true;
            btnStart.textContent = "Đã làm 3 nhiệm vụ hôm nay";
        } else {
            btnStart.disabled = false;
            btnStart.textContent = "Làm 3 nhiệm vụ hôm nay";
        }
    },

    renderStudyMap() {
        const container = document.getElementById("studyMapGrid");
        if (!container || !this.userState) return;

        const keys = this.getStudyDayKeys();
        const currentKey = this.currentStudyDayKey || this.getCurrentStudyDayKeyForUi();

        container.innerHTML = "";
        keys.forEach((key, idx) => {
            const cell = document.createElement("div");
            const stars = this.userState.mastery_stars[key] || 0;
            const dayNumber = idx + 1;

            cell.className = "study-map-cell";

            if (stars === 1) cell.classList.add("study-map-cell--stars1");
            if (stars === 2) cell.classList.add("study-map-cell--stars2");
            if (stars === 3) cell.classList.add("study-map-cell--stars3");
            if (key === currentKey) cell.classList.add("study-map-cell--active");

            cell.innerHTML = `
                <span class="day-label">D${dayNumber}</span>
                <span class="day-stars">
                    ${stars === 0 ? "—" : "★".repeat(stars)}
                </span>
            `;
            container.appendChild(cell);
        });
    },

    handleStartStudyMissions() {
        // Nếu đã làm Boss Rush hôm nay rồi thì chặn
        if (!this.canDoBossRushToday()) {
            alert("Hôm nay bạn đã làm Boss Rush (3 nhiệm vụ) rồi. Hãy quay lại vào ngày mai nhé.");
            this.updateBossRushButtonState();
            return;
        }

        // Nếu đã clear hết map 14 ngày
        if (!this.hasUnclearedStudyDay()) {
            alert("Bạn đã hoàn thành toàn bộ map 14 ngày. Lần này chỉ có thể ôn tập lại (không cộng thêm tài nguyên).");
            // Vẫn cho mở khu nhiệm vụ nếu bạn muốn cho ôn tập; nếu không thì return ở đây.
        }

        const missionArea = document.getElementById("studyMissionArea");
        const recap = document.getElementById("studyRecapCard");
        if (missionArea) missionArea.style.display = "";
        if (recap) recap.style.display = "none";

        const status = document.getElementById("todayStatus");
        if (status) status.textContent = "Đang làm Boss Rush...";
    },

    handleCompleteStudyDemo() {
        if (!this.userState) {
            this.loadUserState();
        }

        const dayKey = this.getNextStudyDayKeyForProgress();
        const currentStars = this.userState.mastery_stars[dayKey] || 0;

        // DEMO: giả lập độ chính xác ~90%
        const correctPercent = 90;
        let stars = 1;
        if (correctPercent >= 80) stars = 3;
        else if (correctPercent >= 60) stars = 2;

        const newStars = Math.max(currentStars, stars);
        const isFirstClear = currentStars === 0;

        this.userState.mastery_stars[dayKey] = newStars;
        // Sau khi clear xong, highlight luôn ngày vừa clear
        this.currentStudyDayKey = dayKey;

        // Thưởng tài nguyên CHỈ lần đầu clear ngày đó
        let spGain = 0;
        let orbGain = 0;
        let sparkGain = 0;

        if (isFirstClear) {
            if (newStars === 1) {
                spGain = 2;
            } else if (newStars === 2) {
                spGain = 3;
                orbGain = 1;
            } else if (newStars === 3) {
                spGain = 4;
                orbGain = 1;
                sparkGain = 1;
            }

            this.userState.sp += spGain;
            this.userState.orbs = (this.userState.orbs || 0) + orbGain;
            this.userState.sparks = (this.userState.sparks || 0) + sparkGain;
        }

        this.userState.study_combo_perfect = newStars === 3;

        // 👇 Ghi nhận đã làm Boss Rush hôm nay
        this.userState.lastBossRushDate = this.getTodayIso();

        this.saveUserState();
        this.renderStudyMap();
        this.renderResourcesBar();
        this.renderShop();
        this.renderLoadout();
        this.renderBossArena();
        this.updateBossRushButtonState(); // khóa nút tới ngày mai

        // cập nhật UI recap
        const missionArea = document.getElementById("studyMissionArea");
        const recap = document.getElementById("studyRecapCard");
        const recapTitle = document.getElementById("studyRecapTitle");
        const recapStars = document.getElementById("studyRecapStars");
        const recapDetail = document.getElementById("studyRecapDetail");

        if (missionArea) missionArea.style.display = "none";
        if (recap) recap.style.display = "";

        if (recapTitle) {
            const dayNumber = this.getStudyDayKeys().indexOf(dayKey) + 1;
            recapTitle.textContent = `Ngày D${dayNumber} – Hoàn tất Boss Rush`;
        }
        if (recapStars) recapStars.textContent = newStars ? "★".repeat(newStars) : "—";

        if (recapDetail) {
            if (isFirstClear) {
                const rewards = [
                    spGain ? `${spGain} SP` : null,
                    orbGain ? `${orbGain} Orb` : null,
                    sparkGain ? `${sparkGain} Spark` : null,
                ].filter(Boolean).join(", ");

                recapDetail.textContent = `Độ chính xác ~${correctPercent}%. Nhận ${rewards || "0 tài nguyên"} (lần đầu clear).`;
            } else {
                recapDetail.textContent = `Độ chính xác ~${correctPercent}%. Bạn đã từng clear ngày này trước đó – lần này chỉ là ôn tập, không cộng thêm tài nguyên.`;
            }
        }

        // ✅ Daily Quest: Học 3 nhiệm vụ = clear Boss Rush
        if (isFirstClear) {
            this.markDailyQuestDone("study");
        }

        const status = document.getElementById("todayStatus");
        if (status) status.textContent = "Đã hoàn tất Boss Rush hôm nay 🎉";
    },

    getTodayIso() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    },

    saveRoadmapToStorage() {
        try {
            if (this.roadmapData && this.roadmapData.length > 0) {
                const data = this.roadmapData.map(
                    ({ statusKey, statusLabel, ...rest }) => rest
                );

                localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(data));

                // 🔁 SYNC
                this.enqueueSyncEvent(ROADMAP_STORAGE_KEY, data);
                this.flushSyncQueueDebounced();

            } else {
                localStorage.removeItem(ROADMAP_STORAGE_KEY);

                // 🔁 SYNC xoá
                this.enqueueSyncEvent(ROADMAP_STORAGE_KEY, null);
                this.flushSyncQueueDebounced();
            }
        } catch (err) {
            console.error("Lỗi khi lưu roadmap:", err);
        }
    },

    loadRoadmapFromStorage() {
        try {
            const raw = localStorage.getItem(ROADMAP_STORAGE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) return;

            this.roadmapData = parsed;

            // Gán lại status theo NGÀY HIỆN TẠI mỗi lần mở web
            this.updateRoadmapStatuses();

            // Render UI
            this.renderRoadmap();
            this.updateTodayLessonFromRoadmap();
        } catch (err) {
            console.error("Lỗi khi load lộ trình từ localStorage:", err);
        }
    },


    // chuẩn hóa "hôm nay" (cắt giờ/phút/giây)
    getTodayDate() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },



    // Vẽ lộ trình ra UI từ this.roadmapData – group theo ngày và chia nhỏ nhiệm vụ
    renderRoadmap() {
        const container = document.getElementById("roadmapContainer");
        if (!container) return;

        if (!this.roadmapData || this.roadmapData.length === 0) {
            container.innerHTML = `
        <p class="placeholder">
          Chưa có lộ trình. Hãy import file CSV để bắt đầu, hệ thống sẽ tự tính “Hôm nay / Thiếu / Sắp tới”.
        </p>
      `;
            return;
        }

        const groups = {};
        this.roadmapData.forEach((item) => {
            const key = `${item.date}__${item.day}`;
            if (!groups[key]) {
                groups[key] = {
                    day: item.day,
                    date: item.date,
                    tasks: [],
                };
            }
            groups[key].tasks.push(item);
        });

        const dayBlocks = Object.values(groups);

        const html = dayBlocks
            .map((group) => {
                const tasksHtml = group.tasks
                    .map(
                        (t, idx) => `
            <li class="roadmap-task">
              <div class="roadmap-task-main">
                ${idx + 1}. ${t.topic}
              </div>
              <div class="roadmap-task-extra">
                <span class="roadmap-task-subject">${t.subject}</span>
                <span class="status-pill status-pill--${t.statusKey}">
                  ${t.statusLabel}
                </span>
              </div>
            </li>
          `
                    )
                    .join("");

                return `
          <div class="roadmap-day-block">
            <div class="roadmap-day-header">
              <div class="roadmap-day-info">
                <div class="roadmap-day-main">${group.day}</div>
                <div class="roadmap-day-sub">${group.date}</div>
              </div>
            </div>
            <ul class="roadmap-task-list">
              ${tasksHtml}
            </ul>
          </div>
        `;
            })
            .join("");

        container.innerHTML = `
      <div class="roadmap-grid">
        ${html}
      </div>
    `;
        this.updateTodayLessonFromRoadmap();
    },

    /* ========== DEMO DATA (gratitude, missions, wellbeing) ========== */
    initDemoData() {
        // Gratitude samples
        const gratitudeList = document.getElementById("gratitudeList");
        if (gratitudeList) {
            const samples = [
                "Cảm ơn vì đã kiên nhẫn giải thích cho mình bài khó hôm nay.",
                "Cảm ơn vì luôn lắng nghe và tôn trọng cảm xúc của mình.",
                "Cảm ơn thầy/cô vì đã tin tưởng và động viên em khi em nản.",
            ];

            gratitudeList.innerHTML = "";
            samples.forEach((text) => {
                const div = document.createElement("div");
                div.className = "placeholder";
                div.textContent = text;
                div.addEventListener("click", () => {
                    const textarea = document.getElementById("giftMessage");
                    if (textarea) textarea.value = text;
                });
                gratitudeList.appendChild(div);
            });
        }

        // Kindness missions
        const missionsList = document.getElementById("missionsList");
        if (missionsList) {
            const missions = [
                "Viết 1 lời cảm ơn cho người đã giúp bạn trong tuần.",
                "Giải thích lại bài cho 1 bạn đang yếu hơn.",
                "Dọn gọn góc học tập của mình và chụp ảnh trước/sau.",
                "Không đụng điện thoại trong 1 phiên học 25 phút.",
                "Khen 1 điều tốt thật lòng về bạn cùng lớp.",
                "Nhắn 1 tin hỏi thăm bạn đã lâu không nói chuyện.",
            ];

            missionsList.innerHTML = "";
            missions.forEach((m, idx) => {
                const row = document.createElement("label");
                row.className = "mission-item";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.dataset.missionIndex = idx;

                const span = document.createElement("span");
                span.textContent = m;

                row.appendChild(checkbox);
                row.appendChild(span);
                missionsList.appendChild(row);
            });
        }

        // Wellbeing list demo
        const wellbeingList = document.getElementById("wellbeingList");
        if (wellbeingList) {
            const items = [
                { type: "Tâm lý", title: "Đối mặt áp lực thi cử" },
                { type: "Tâm lý", title: "Không so sánh bản thân với người khác" },
                { type: "Gym", title: "7 bài tập tại chỗ cho học sinh" },
                { type: "Dinh dưỡng", title: "3 bữa ăn nhanh nhưng lành mạnh" },
            ];

            wellbeingList.innerHTML = "";
            items.forEach((item) => {
                const row = document.createElement("div");
                row.className = "placeholder";
                row.textContent = `[${item.type}] ${item.title}`;
                wellbeingList.appendChild(row);
            });
        }

        // Relationship summary demo
        const relationshipSummary = document.getElementById("relationshipSummary");
        if (relationshipSummary) {
            relationshipSummary.innerHTML = `
        <li>Thiệp đã tạo: <strong>0</strong></li>
        <li>Nhiệm vụ kindness hoàn thành: <strong>0</strong></li>
        <li>Người nhận gần nhất: <em>Chưa có</em></li>
      `;
        }

        // Áp lại trạng thái nhiệm vụ + summary từ localStorage
        const progress = this.loadRelationshipProgress();

        // Check các mission đã hoàn thành
        if (missionsList && progress.missionsCompleted) {
            missionsList.querySelectorAll("input[type='checkbox']").forEach((cb, idx) => {
                cb.checked = progress.missionsCompleted.includes(idx);
            });
        }

        // Cập nhật lại summary theo progress
        this.updateRelationshipSummary(progress);

    },

    /* ========== POPUP SERIES VIDEO ========== */
    initSeriesPopup() {
        const btnOpen = document.getElementById("btnOpenSeries");
        const modal = document.getElementById("seriesModal");
        if (!modal) return;

        const backdrop = modal.querySelector(".series-modal-backdrop");
        const btnClose = document.getElementById("btnCloseSeries");

        // Mở popup
        if (btnOpen) {
            btnOpen.addEventListener("click", () => {
                modal.classList.remove("is-hidden");
                modal.setAttribute("aria-hidden", "false");
            });
        }

        // Đóng popup bằng nút X
        if (btnClose) {
            btnClose.addEventListener("click", () => {
                this.closeSeriesModal();
            });
        }

        // Đóng popup bằng cách bấm vào nền tối (KHÔNG phải nội dung)
        if (backdrop) {
            backdrop.addEventListener("click", () => {
                this.closeSeriesModal();
            });
        }

        // Đóng bằng phím ESC
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !modal.classList.contains("is-hidden")) {
                this.closeSeriesModal();
            }
        });

        // Khởi tạo logic chuyển tab bên trong popup
        this.initSeriesTabs();
    },

    closeSeriesModal() {
        const modal = document.getElementById("seriesModal");
        if (!modal) return;
        modal.classList.add("is-hidden");
        modal.setAttribute("aria-hidden", "true");
    },

    initSeriesTabs() {
        const tabsWrapper = document.querySelector(".series-tabs-wrapper");
        if (!tabsWrapper) return;

        tabsWrapper.addEventListener("click", (e) => {
            const btn = e.target.closest(".series-tab");
            if (!btn) return;

            const seriesId = btn.dataset.seriesId;
            if (!seriesId) return;

            // 1. Active tab
            tabsWrapper.querySelectorAll(".series-tab").forEach((tab) => {
                tab.classList.toggle("is-active", tab === btn);
            });

            // 2. Active panel tương ứng
            document.querySelectorAll(".series-panel").forEach((panel) => {
                const panelId = panel.dataset.seriesId;
                panel.classList.toggle("is-active", panelId === seriesId);
            });
        });
    },

    /* ========== TEACH-BACK (REAL MEDIARECORDER) ========== */
    teachback: {
        recorder: null,
        stream: null,
        chunks: [],
        countdownTimer: null,
        remainingSec: 0,
        isRecording: false,
        clips: [], // metadata list for UI
    },

    async initTeachback() {
        // Load clips from IndexedDB and render
        try {
            const clips = await this.tbDbLoadAll();
            this.teachback.clips = clips || [];
            this.renderTeachbackList();
        } catch (e) {
            console.warn("Teachback DB load failed:", e);
            this.teachback.clips = [];
            this.renderTeachbackList();
        }
    },

    renderTeachbackList() {
        const list = document.getElementById("teachbackList");
        if (!list) return;

        const clips = this.teachback.clips || [];
        if (clips.length === 0) {
            list.innerHTML = `<div class="placeholder">Chưa có clip Teach-Back nào.</div>`;
            return;
        }

        // show newest first
        const html = [...clips].reverse().slice(0, 10).map((c) => {
            const time = new Date(c.createdAt).toLocaleString();
            const tag = c.kind === "video" ? "Video" : "Audio";
            const mediaEl = c.kind === "video"
                ? `<video controls playsinline style="width:100%; border-radius:12px;" src="${c.url}"></video>`
                : `<audio controls style="width:100%;" src="${c.url}"></audio>`;

            return `
                <div class="teachback-item" style="margin-bottom:12px;">
                    <div class="small text-muted" style="margin-bottom:6px;">
                        ${tag} · ${time} · ${Math.round((c.durationMs || 60000) / 1000)}s
                        <button class="btn btn-ghost btn-sm" data-tb-del="${c.id}" style="float:right;">Xoá</button>
                    </div>
                    ${mediaEl}
                </div>
            `;
        }).join("");

        list.innerHTML = html;

        // bind delete
        list.querySelectorAll("[data-tb-del]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                const id = e.currentTarget.getAttribute("data-tb-del");
                await this.tbDbDelete(id);
                const after = await this.tbDbLoadAll();
                this.teachback.clips = after || [];
                this.renderTeachbackList();
            });
        });
    },

    async handleTeachbackRecordClick() {
        // toggle
        if (this.teachback.isRecording) {
            this.stopTeachbackRecording();
            return;
        }

        // choose mode: audio or video
        const mode = confirm("OK = Ghi hình (video+audio)\nCancel = Chỉ ghi âm (audio)");
        const kind = mode ? "video" : "audio";

        await this.startTeachbackRecording(kind);
    },

    async startTeachbackRecording(kind = "audio") {
        const status = document.getElementById("teachbackStatus");
        const btn = document.getElementById("btnRecordTeachback");

        if (!navigator.mediaDevices?.getUserMedia) {
            alert("Trình duyệt không hỗ trợ getUserMedia. Hãy dùng Chrome/Edge và chạy trên HTTPS/localhost.");
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            alert("Trình duyệt không hỗ trợ MediaRecorder.");
            return;
        }

        // pick constraints
        const constraints = kind === "video"
            ? { audio: true, video: { width: 720, height: 1280, facingMode: "user" } }
            : { audio: true, video: false };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            // choose mimeType best-effort
            const preferredTypes = kind === "video"
                ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
                : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

            let mimeType = "";
            for (const t of preferredTypes) {
                if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
            }

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

            this.teachback.stream = stream;
            this.teachback.recorder = recorder;
            this.teachback.chunks = [];
            this.teachback.isRecording = true;
            this.teachback.remainingSec = 60;

            if (btn) btn.textContent = "⏹ Dừng (Teach-Back)";
            if (status) status.textContent = `Đang ghi ${kind === "video" ? "hình" : "âm"}... (60s)`;

            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) this.teachback.chunks.push(ev.data);
            };

            recorder.onstop = async () => {
                try {
                    const blob = new Blob(this.teachback.chunks, { type: recorder.mimeType || (kind === "video" ? "video/webm" : "audio/webm") });
                    const createdAt = Date.now();
                    const durationMs = 60000; // we enforce 60s
                    const id = await this.tbDbSave({ kind, createdAt, durationMs, blob });

                    // refresh list
                    const all = await this.tbDbLoadAll();
                    this.teachback.clips = all || [];
                    this.renderTeachbackList();

                    if (status) status.textContent = "Đã ghi xong ✅";
                } catch (e) {
                    console.error("Teachback save failed:", e);
                    alert("Ghi xong nhưng lưu thất bại. Xem console để biết lỗi.");
                    if (status) status.textContent = "Ghi xong nhưng lưu lỗi ❌";
                }
            };

            recorder.start(); // start recording

            // countdown + auto stop after 60s
            if (this.teachback.countdownTimer) clearInterval(this.teachback.countdownTimer);
            this.teachback.countdownTimer = setInterval(() => {
                this.teachback.remainingSec -= 1;
                if (status) status.textContent = `Đang ghi ${kind === "video" ? "hình" : "âm"}... (${this.teachback.remainingSec}s)`;

                if (this.teachback.remainingSec <= 0) {
                    this.stopTeachbackRecording();
                }
            }, 1000);

        } catch (err) {
            console.error("getUserMedia error:", err);
            alert("Không xin được quyền mic/camera. Kiểm tra HTTPS/localhost và permission trong trình duyệt.");
            if (status) status.textContent = "Chưa ghi";
        }
    },

    stopTeachbackRecording() {
        const status = document.getElementById("teachbackStatus");
        const btn = document.getElementById("btnRecordTeachback");

        if (!this.teachback.isRecording) return;

        this.teachback.isRecording = false;

        if (this.teachback.countdownTimer) {
            clearInterval(this.teachback.countdownTimer);
            this.teachback.countdownTimer = null;
        }

        try {
            if (this.teachback.recorder && this.teachback.recorder.state !== "inactive") {
                this.teachback.recorder.stop();
            }
        } catch (e) {
            console.warn("recorder.stop error:", e);
        }

        // stop tracks to release mic/cam
        if (this.teachback.stream) {
            this.teachback.stream.getTracks().forEach(t => t.stop());
            this.teachback.stream = null;
        }

        this.teachback.recorder = null;
        this.teachback.chunks = [];

        if (btn) btn.textContent = "Ghi âm / Ghi hình 60s";
        if (status) status.textContent = "Đang xử lý & lưu...";
    },

    /* ===== IndexedDB helpers for Teachback ===== */
    tbDbOpen() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(TEACHBACK_DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(TEACHBACK_DB_STORE)) {
                    db.createObjectStore(TEACHBACK_DB_STORE, { keyPath: "id" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async tbDbSave({ kind, createdAt, durationMs, blob }) {
        const db = await this.tbDbOpen();
        const id = `tb_${createdAt}_${Math.random().toString(16).slice(2)}`;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(TEACHBACK_DB_STORE, "readwrite");
            const store = tx.objectStore(TEACHBACK_DB_STORE);
            store.put({ id, kind, createdAt, durationMs, blob });

            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject(tx.error);
        });
    },

    async tbDbLoadAll() {
        const db = await this.tbDbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TEACHBACK_DB_STORE, "readonly");
            const store = tx.objectStore(TEACHBACK_DB_STORE);
            const req = store.getAll();

            req.onsuccess = () => {
                const rows = req.result || [];
                // convert blob to objectURL for UI
                const mapped = rows.map(r => ({
                    ...r,
                    url: URL.createObjectURL(r.blob),
                }));
                resolve(mapped);
            };
            req.onerror = () => reject(req.error);
        });
    },

    async tbDbDelete(id) {
        const db = await this.tbDbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(TEACHBACK_DB_STORE, "readwrite");
            const store = tx.objectStore(TEACHBACK_DB_STORE);
            store.delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },

    /* ========== BIND EVENTS ========== */
    bindEvents() {
        // Study tab
        const btnImportCsv = document.getElementById("btnImportCsv");
        const btnStartLesson = document.getElementById("btnStartLesson");
        const btnRecordTeachback = document.getElementById("btnRecordTeachback");
        const csvInput = document.getElementById("csvInput");
        const btnLogin = document.getElementById("btnLogin");
        if (btnLogin) {
            btnLogin.addEventListener("click", () => this.handleLoginClick());
        }

        const btnAutoSprint = document.getElementById("btnAutoSprint");
        if (btnAutoSprint) {
            btnAutoSprint.addEventListener("click", () => this.handleAutoSprint());
        }

        const btnLoadDemo = document.getElementById("btnLoadDemo");
        if (btnLoadDemo) btnLoadDemo.addEventListener("click", () => this.loadDemoPackage());


        if (btnImportCsv && csvInput) {
            // Bấm nút => mở chọn file
            btnImportCsv.addEventListener("click", () => {
                csvInput.click();
            });

            // Khi user chọn file xong
            csvInput.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;
                this.handleCsvImport(file);

                // cho phép chọn lại file giống nhau lần sau
                e.target.value = "";
            });
        }

        if (btnStartLesson) {
            btnStartLesson.addEventListener("click", () => this.handleStartLesson());
        }

        if (btnRecordTeachback) {
            btnRecordTeachback.addEventListener("click", () => this.handleTeachbackRecordClick());
        }

        // Health tab
        const btnSubmitMood = document.getElementById("btnSubmitMood");
        if (btnSubmitMood) {
            btnSubmitMood.addEventListener("click", () => this.handleMoodSubmit());
        }

        const btnStartFocus = document.getElementById("btnStartFocus");
        const btnStopFocus = document.getElementById("btnStopFocus");
        if (btnStartFocus) btnStartFocus.addEventListener("click", () => this.startFocus());
        if (btnStopFocus) btnStopFocus.addEventListener("click", () => this.stopFocus());

        // Relationship tab
        const giftForm = document.getElementById("giftForm");
        if (giftForm) {
            giftForm.addEventListener("submit", (e) => {
                e.preventDefault();
                this.handleGiftSubmit();
            });
        }

        const missionsList = document.getElementById("missionsList");
        if (missionsList) {
            missionsList.addEventListener("change", (e) => {
                if (e.target && e.target.matches("input[type='checkbox']")) {
                    const checkboxes = missionsList.querySelectorAll("input[type='checkbox']");
                    const completedIndexes = [];
                    checkboxes.forEach((cb, idx) => {
                        if (cb.checked) completedIndexes.push(idx);
                    });

                    const progress = this.loadRelationshipProgress();
                    const newProgress = {
                        gifts: progress.gifts || 0,
                        lastRecipient: progress.lastRecipient || null,
                        missionsCompleted: completedIndexes,
                    };

                    this.saveRelationshipProgress(newProgress);
                    this.updateRelationshipSummary(newProgress);
                }
            });
        }

        // Game cards ở Home → nhảy sang đúng tab
        const gameCards = document.querySelectorAll("[data-goto-tab]");
        if (gameCards.length) {
            gameCards.forEach((card) => {
                card.addEventListener("click", () => {
                    const targetId = card.dataset.gotoTab;
                    const navBtn = document.querySelector(
                        `.app-nav .nav-item[data-tab-target="${targetId}"]`
                    );
                    if (navBtn) {
                        navBtn.click();
                    }
                });
            });
        }

        // Boss Arena
        const btnFightBoss = document.getElementById("btnFightBoss");
        if (btnFightBoss) {
            btnFightBoss.addEventListener("click", () => this.handleBossFightDemo());
        }
    },

    /* ========== BOSS ARENA – UNLOCK & GIỚI HẠN ========== */
    isBossArenaUnlocked() {
        if (!this.userState) this.loadUserState();
        const starsD7 = this.userState.mastery_stars?.["day07"] || 0;
        return starsD7 > 0;
    },

    canFightBossToday() {
        if (!this.userState) this.loadUserState();

        if (!this.isBossArenaUnlocked()) {
            return { ok: false, reason: "locked" };
        }

        const todayIso = this.getTodayIso();
        const last = this.userState.lastBossFightDate || null;
        if (last === todayIso) {
            return { ok: false, reason: "already_today" };
        }

        return { ok: true, reason: null };
    },

    handleBossFightDemo() {
        if (!this.userState) this.loadUserState();
        if (!this.bossState) this.loadBossState();
        this.loadBossHallOfFame();

        const can = this.canFightBossToday();
        if (!can.ok) {
            if (can.reason === "locked") {
                alert("Boss Arena đang bị khoá. Hãy hoàn thành Boss Rush đến mốc D7 (ngày thứ 7) để mở khoá Boss tuần này.");
            } else if (can.reason === "already_today") {
                alert("Bạn đã đánh Boss hôm nay rồi. Boss Arena chỉ cho 1 trận/ngày.");
            }
            return;
        }

        const logEl = document.getElementById("bossBattleLog");
        if (!logEl) return;

        const uid = this.userState.uid || "demo-user";
        const beforeHp = this.bossState.hpCurrent;

        const dmgResult = this.computeBossDamageDemo();
        const damage = dmgResult.total;

        if (damage <= 0) {
            alert("Chưa có chiêu nào để đánh Boss. Hãy mở skill trong Shop & chọn Loadout.");
            return;
        }

        // Trừ HP boss
        this.bossState.hpCurrent = Math.max(0, this.bossState.hpCurrent - damage);
        this.saveBossState();
        this.renderBossArena();

        // Lưu ngày đã đánh Boss hôm nay
        this.userState.lastBossFightDate = this.getTodayIso();
        this.saveUserState();

        // Cập nhật HOF (Top-5 theo damage giảm dần)
        this.bossHallOfFame.push({
            uid,
            damage,
            at: new Date().toISOString(),
        });
        this.bossHallOfFame.sort((a, b) => b.damage - a.damage);
        this.bossHallOfFame = this.bossHallOfFame.slice(0, 5);
        this.saveBossHallOfFame();
        this.renderBossHallOfFame();

        // Render log
        const afterHp = this.bossState.hpCurrent;
        const entry = document.createElement("div");
        entry.className = "boss-battle-log-entry";
        entry.innerHTML = `
            <div><strong>${uid}</strong> gây <strong>${damage}</strong> damage.</div>
            <div>HP Boss: ${beforeHp} → ${afterHp}</div>
            <div class="text-muted small">${dmgResult.detail}</div>
        `;
        if (logEl.querySelector(".placeholder")) {
            logEl.innerHTML = "";
        }
        logEl.prepend(entry);

        if (this.bossState.hpCurrent === 0) {
            alert("KO! Boss đã bị hạ gục 🎉");
        }
    },

    handleAutoSprint() {
        if (!this.roadmapData || this.roadmapData.length === 0) {
            alert("Chưa có lộ trình. Hãy import CSV trước.");
            return;
        }

        const today = new Date();
        const slots = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
            const dd = String(d.getDate()).padStart(2, "0");
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            slots.push({ day: `D${i + 1}`, date: `${dd}/${mm}` });
        }

        const tasks = [...this.roadmapData];
        const perDay = Math.ceil(tasks.length / 7);

        const newData = [];
        let idx = 0;

        slots.forEach((slot) => {
            for (let k = 0; k < perDay && idx < tasks.length; k++, idx++) {
                newData.push({
                    ...tasks[idx],
                    day: slot.day,
                    date: slot.date,
                });
            }
        });

        this.roadmapData = newData;
        this.updateRoadmapStatuses();
        this.saveRoadmapToStorage();
        this.renderRoadmap();
        this.updateTodayLessonFromRoadmap();
    },

    /* ========== MOOD LOGIC ========== */
    handleStartLesson() {
        const status = document.getElementById("todayStatus");
        if (status) status.textContent = "Đang học...";

        // V1 hoàn chỉnh: chỉ thay đổi trạng thái UI,
        // KHÔNG cộng streak ở đây. Streak chỉ cộng khi bấm "Hoàn tất ngày học".
    },

    markStudyDoneToday({ silent = false } = {}) {
        // Lấy tiến độ hiện tại
        let current = { lastStudyDate: null, streak: 0 };
        try {
            const raw = localStorage.getItem(STUDY_PROGRESS_KEY);
            if (raw) current = JSON.parse(raw);
        } catch (err) {
            console.error("Lỗi đọc study progress:", err);
        }

        const todayIso = this.getTodayIso();
        let newStreak = current.streak || 0;

        if (current.lastStudyDate !== todayIso) {
            if (current.lastStudyDate) {
                const last = new Date(current.lastStudyDate);
                const today = new Date(todayIso);
                const diffDays = Math.round(
                    (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (diffDays === 1) {
                    newStreak += 1;
                } else {
                    newStreak = 1;
                }
            } else {
                newStreak = 1;
            }
        }

        const newProgress = {
            lastStudyDate: todayIso,
            streak: newStreak,
        };

        this.saveStudyProgress(newProgress);

        const streakEl = document.getElementById("streakValue");
        if (streakEl) streakEl.textContent = newStreak;

        if (!silent) {
            alert("Hệ thống đã cập nhật chuỗi ngày học của bạn.");
        }
        // Daily Quest: Học sẽ được tick khi clear Boss Rush (handleCompleteStudyDemo)
    },

    /* ========== LOGIN GIẢ LẬP ========== */
    handleLoginClick() {
        const name = prompt("Nhập tên của bạn để đăng nhập demo:");
        if (!name) return;

        // Lưu tên vào localStorage (sau này dùng để cá nhân hóa)
        try {
            localStorage.setItem("h3_username", name);
        } catch (err) {
            console.error("Lỗi lưu username:", err);
        }

        alert(`Xin chào, ${name}! (demo login – sau này sẽ nối tài khoản thật)`);
    },


    handleMoodSubmit() {
        const picker = document.getElementById("moodPicker");
        const suggestion = document.getElementById("moodSuggestion");
        if (!picker || !suggestion) return;

        const moodId = picker.dataset.currentMood;
        let text = "Hãy chọn 1 emoji trước đã nha.";

        switch (moodId) {
            case "great":
                text = "Bạn đang rất ổn! Hôm nay thử 1 phiên Focus dài 35' + 1 bài học khó nhé.";
                break;
            case "ok":
                text = "Bạn ổn. Gợi ý: 25' học + 5' nghỉ, lặp lại 2–3 lần.";
                break;
            case "meh":
                text = "Tâm trạng bình thường. Thử 20' học nhẹ + 1 video wellbeing.";
                break;
            case "tired":
                text = "Bạn hơi mệt. Nghỉ 10', uống nước, rồi học 15' nội dung nhẹ thôi.";
                break;
            case "sad":
                text = "Bạn buồn. Xem 1 video tâm lý, rồi nếu ổn hãy làm 1 nhiệm vụ kindness nhỏ.";
                break;
            case "stressed":
                text = "Bạn đang căng. Hít thở 2 phút, nghe nhạc nhẹ, tránh học nặng trong 30'.";
                break;
            default:
                break;
        }

        suggestion.textContent = text;
    },

    /* ========== FOCUS MODE ========== */
    startFocus() {
        const input = document.getElementById("focusDuration");
        const display = document.getElementById("focusTimerDisplay");
        const minutes = input ? parseInt(input.value, 10) || 25 : 25;

        this.focusRemainingSec = minutes * 60;

        if (this.focusTimerId) clearInterval(this.focusTimerId);

        // Hiển thị trạng thái ban đầu
        if (display) {
            const mm = String(minutes).padStart(2, "0");
            display.textContent = `${mm}:00`;
        }

        this.focusTimerId = setInterval(() => {
            this.focusRemainingSec -= 1;

            if (this.focusRemainingSec <= 0) {
                clearInterval(this.focusTimerId);
                this.focusTimerId = null;
                if (display) display.textContent = "Hoàn thành!";
                alert("Phiên Focus hoàn thành – sau này sẽ cộng điểm và LWI.");

                this.markDailyQuestDone("focus");
                return;
            }

            if (display) {
                const mm = Math.floor(this.focusRemainingSec / 60);
                const ss = this.focusRemainingSec % 60;
                display.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
            }
        }, 1000);
    },

    stopFocus() {
        if (this.focusTimerId) {
            clearInterval(this.focusTimerId);
            this.focusTimerId = null;
        }
    },

    /* ========== GIFT / RELATIONSHIP ========== */
    handleGiftSubmit() {
        const recipient = document.getElementById("giftRecipient")?.value.trim();
        const occasion = document.getElementById("giftOccasion")?.value.trim();
        const message = document.getElementById("giftMessage")?.value.trim();
        const consent = document.getElementById("giftConsent")?.checked;
        const preview = document.getElementById("giftPreview");

        if (!recipient || !occasion || !message) {
            alert("Vui lòng điền đủ Người nhận, Dịp, Lời nhắn.");
            return;
        }
        if (!consent) {
            alert("Bạn cần xác nhận quyền sử dụng hình ảnh/clip.");
            return;
        }

        if (preview) {
            preview.innerHTML = `
        <div class="gift-card-demo">
          <div class="gift-title">To: ${recipient}</div>
          <div class="gift-occasion">${occasion}</div>
          <div class="gift-message">${message}</div>
          <div class="gift-footer">— Tạo bởi nền tảng H³ (demo)</div>
        </div>
      `;
        }

        // Cập nhật progress & summary
        const progress = this.loadRelationshipProgress();
        const newProgress = {
            gifts: (progress.gifts || 0) + 1,
            lastRecipient: recipient,
            missionsCompleted: progress.missionsCompleted || [],
        };

        this.saveRelationshipProgress(newProgress);
        this.updateRelationshipSummary(newProgress);

        // ✅ Daily Quest: Thiệp
        this.markDailyQuestDone("gratitude");

        alert("Thiệp đã được tạo (demo) và tiến độ đã được cập nhật!");

    },
    /* ========== BÀI HỌC HÔM NAY – lấy từ CSV lộ trình ========== */
    /* ========== BÀI HỌC HÔM NAY – sync với lộ trình & status theo ngày thật ========== */
    updateTodayLessonFromRoadmap() {
        const container = document.getElementById("todayLessonContainer");
        const statusBadge = document.getElementById("todayStatus");
        if (!container) return;

        const data = this.roadmapData || [];

        // Nếu chưa có lộ trình
        if (data.length === 0) {
            container.innerHTML = `
                <p class="placeholder">
                    Chưa có nhiệm vụ cho hôm nay. Hãy import file CSV để hệ thống gợi ý.
                </p>
                <button class="btn" id="btnStartLesson">Bắt đầu học</button>
            `;
            if (statusBadge) statusBadge.textContent = "Chưa bắt đầu";

            const btn = container.querySelector("#btnStartLesson");
            if (btn) btn.addEventListener("click", () => this.handleStartLesson());
            return;
        }

        // 1. Ưu tiên task có statusKey = "today"
        let todayTasks = data.filter((t) => t.statusKey === "today");
        let dayLabel = "";
        let dateLabel = "";
        let modeLabel = ""; // Hôm nay / Chuẩn bị / Bù lại

        if (todayTasks.length > 0) {
            const refTask = todayTasks[0];
            dayLabel = refTask.day || "";
            dateLabel = refTask.date || "";
            modeLabel = "Hôm nay";

            if (statusBadge) {
                statusBadge.textContent = `Hôm nay: ${dayLabel} – ${dateLabel}`;
            }
        } else {
            // 2. Nếu không có "today": chọn ngày gần nhất (ưu tiên tương lai, sau đó quá khứ)
            const todayDate = this.getTodayDate();
            const todayTime = todayDate.getTime();

            let nearestFutureTask = null;
            let nearestFutureTime = Infinity;
            let nearestPastTask = null;
            let nearestPastTime = -Infinity;

            data.forEach((t) => {
                const d = this.parseDateDdMm(t.date);
                if (!d) return;
                const time = d.getTime();

                if (time > todayTime && time < nearestFutureTime) {
                    nearestFutureTime = time;
                    nearestFutureTask = t;
                }
                if (time < todayTime && time > nearestPastTime) {
                    nearestPastTime = time;
                    nearestPastTask = t;
                }
            });

            const refTask = nearestFutureTask || nearestPastTask || data[0];
            dayLabel = refTask.day || "";
            dateLabel = refTask.date || "";

            todayTasks = data.filter(
                (t) => t.date === refTask.date && t.day === refTask.day
            );

            if (statusBadge) {
                if (nearestFutureTask) {
                    statusBadge.textContent = `Chuẩn bị cho: ${dayLabel} – ${dateLabel}`;
                    modeLabel = "Chuẩn bị";
                } else if (nearestPastTask) {
                    statusBadge.textContent = `Bù lại: ${dayLabel} – ${dateLabel}`;
                    modeLabel = "Bù lại";
                } else {
                    statusBadge.textContent = "Chưa có nhiệm vụ hôm nay";
                    modeLabel = "";
                }
            }
        }

        // Nếu vì lý do nào đó vẫn không có task
        if (!todayTasks || todayTasks.length === 0) {
            container.innerHTML = `
                <p class="placeholder">
                    Lộ trình chưa có nhiệm vụ phù hợp để gợi ý cho hôm nay.
                </p>
                <button class="btn" id="btnStartLesson">Bắt đầu học</button>
            `;
            const btn = container.querySelector("#btnStartLesson");
            if (btn) btn.addEventListener("click", () => this.handleStartLesson());
            return;
        }

        // Trạng thái checkbox theo NGÀY THỰC (calendar)
        const todayState = this.loadTodayLessonState();
        const isCompletedDay = !!todayState.completed;

        // Xác định đã tick hết chưa
        const allChecked = todayTasks.every((t, idx) => {
            const taskId = t.taskId || `${t.date}__${t.day}__${idx}`;
            if (isCompletedDay) return true;
            return !!todayState.tasks[taskId];
        });

        const tasksHtml = todayTasks
            .map((t, idx) => {
                const taskId = t.taskId || `${t.date}__${t.day}__${idx}`;
                const checked = isCompletedDay || !!todayState.tasks[taskId];
                const disabledAttr = isCompletedDay ? "disabled" : "";

                return `
                    <li class="today-task-item">
                        <label class="today-task-row">
                            <input 
                                type="checkbox" 
                                class="today-task-checkbox" 
                                data-task-id="${taskId}"
                                ${checked ? "checked" : ""}
                                ${disabledAttr}
                            />
                            <div class="today-task-content">
                                <div class="today-task-title">
                                    ${idx + 1}. ${t.topic}
                                </div>
                                <div class="today-task-meta">
                                    <span>${t.subject || "Môn học"}</span>
                                    ${t.statusLabel
                        ? ` · <span class="today-task-status">${t.statusLabel}</span>`
                        : ""
                    }
                                </div>
                            </div>
                        </label>
                    </li>
                `;
            })
            .join("");

        container.innerHTML = `
            <div class="today-tasks">
                <p class="today-desc">
                    Nhiệm vụ của ngày <strong>${dayLabel} – ${dateLabel}</strong>
                    ${modeLabel ? ` <span class="today-mode-tag">(${modeLabel})</span>` : ""}
                    (lấy từ lộ trình):
                </p>
                <ul class="today-task-list">
                    ${tasksHtml}
                </ul>
                <div class="today-actions">
                    <button class="btn" id="btnCompleteToday" ${!allChecked || isCompletedDay ? "disabled" : ""}>
                        Hoàn tất ngày học
                    </button>
                </div>
            </div>
        `;

        // Nếu ngày đã hoàn thành rồi, cập nhật badge
        if (isCompletedDay && statusBadge) {
            statusBadge.textContent = `Đã hoàn thành ngày học hôm nay 🎉`;
        }

        // Gắn event
        const btnStart = container.querySelector("#btnStartLesson");
        if (btnStart) btnStart.addEventListener("click", () => this.handleStartLesson());

        const btnComplete = container.querySelector("#btnCompleteToday");
        if (btnComplete) {
            btnComplete.disabled = !allChecked || isCompletedDay;
            btnComplete.addEventListener("click", () => this.handleCompleteTodayLesson());
        }

        container.querySelectorAll(".today-task-checkbox").forEach((cb) => {
            cb.addEventListener("change", (e) => {
                const taskId = e.target.getAttribute("data-task-id");
                const checked = e.target.checked;
                this.handleTodayTaskCheckboxChange(taskId, checked);
            });
        });
    },

    // ======= SHEET SYNC (queue + debounce) =======

    enqueueSyncEvent(key, value) {
        try {
            const raw = localStorage.getItem(SYNC_QUEUE_KEY);
            const q = raw ? JSON.parse(raw) : [];
            q.push({ key, value, ts: Date.now() });
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
        } catch (e) {
            console.warn("enqueueSyncEvent failed:", e);
        }
    },

    flushSyncQueueDebounced() {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => this.flushSyncQueue(), 800);
    },

    async flushSyncQueue() {
        if (!navigator.onLine) return;

        let q = [];
        try {
            const raw = localStorage.getItem(SYNC_QUEUE_KEY);
            q = raw ? JSON.parse(raw) : [];
        } catch (e) {
            q = [];
        }

        if (!q.length) return;

        const uid = localStorage.getItem("h3_username") || "demo-user";
        const batch = q.slice(0, 50);

        const payloadObj = {
            apiKey: SHEET_SYNC_API_KEY,
            uid,
            source: "h3_web_github_pages",
            version: "v1",
            events: batch.map(ev => ({ key: ev.key, value: ev.value, ts: ev.ts }))
        };

        // ✅ sendBeacon: không preflight, không cần CORS
        const ok = navigator.sendBeacon(
            SHEET_SYNC_URL,
            new Blob([JSON.stringify(payloadObj)], { type: "text/plain;charset=UTF-8" })
        );

        if (ok) {
            const remain = q.slice(batch.length);
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remain));
        } else {
            console.warn("sendBeacon failed (will retry later)");
        }
    },

};


// chạy khi DOM load xong
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});

