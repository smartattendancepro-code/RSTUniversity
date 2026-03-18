

import {
    getFirestore,
    collection, doc,
    getDocs, getDoc,
    query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getApp }  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const PROFILE_PATH = (uid) => `user_registrations/${uid}/sensitive_info/main`;
const BATCH        = 20;

const _profileCache = new Map();

const VERDICT = {
    CLEAN:      { label: "جهاز أصلي",        icon: "✔", color: "#3ecf8e", bg: "rgba(62,207,142,.12)",  border: "rgba(62,207,142,.35)"  },
    SECONDARY:  { label: "جهاز ثانوي",       icon: "⊕", color: "#f5c542", bg: "rgba(245,197,66,.12)",  border: "rgba(245,197,66,.35)"  },
    UNKNOWN:    { label: "جهاز غير معروف",   icon: "✖", color: "#f56565", bg: "rgba(245,101,101,.12)", border: "rgba(245,101,101,.35)" },
    NO_PROFILE: { label: "لا يوجد ملف",      icon: "◌", color: "#718096", bg: "rgba(113,128,150,.12)", border: "rgba(113,128,150,.35)" },
    SHARED:     { label: "بصمة مشتركة ⚠",    icon: "⚠", color: "#ed8936", bg: "rgba(237,137,54,.12)",  border: "rgba(237,137,54,.35)"  },
};

(function init() {
    injectCSS();
    const auth = getAuth(getApp());
    onAuthStateChanged(auth, async user => {
        if (!user) return;
        try {
            const snap = await getDoc(doc(getFirestore(getApp()), "faculty_members", user.uid));
            if (snap.exists() && snap.data()?.role === "dean") {
                const btn = document.getElementById("farBtn");
                if (btn) btn.style.display = "";
            }
        } catch (e) { console.warn("[FAR]", e); }
    });
})();

window.openFARSystem = () => {
    document.getElementById("farModal").style.display = "flex";
    const inp = document.getElementById("farDateInput");
    if (inp && !inp.value) inp.value = todayStr();
    showScreen("screenDate");
};
window.closeFARModal = () => document.getElementById("farModal").style.display = "none";

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, "0"); }

function showScreen(id) {
    ["screenDate","screenSessions","screenSession"].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = s === id ? "block" : "none";
    });
}

window.farStartScan = async () => {
    const dateVal = document.getElementById("farDateInput").value;
    if (!dateVal) return showToast("يرجى اختيار التاريخ أولاً", "warn");

    const btn = document.getElementById("farStartBtn");
    setBtnLoading(btn, true);

    try {
        const db       = getFirestore(getApp());
        const sessions = await fetchSessionsOnly(db, dateVal);

        if (!sessions.length) {
            showToast("لا توجد جلسات لهذا اليوم", "warn");
            return;
        }

        window._farState = { date: dateVal, sessions, db };
        renderSessionsList(sessions, dateVal);
        showScreen("screenSessions");

    } catch (err) {
        showToast("خطأ: " + err.message, "err");
        console.error("[FAR]", err);
    } finally {
        setBtnLoading(btn, false);
    }
};

async function fetchSessionsOnly(db, dateStr) {
    const sessionsCol = collection(db, "audit_logs", dateStr, "sessions");
    const snap = await getDocs(sessionsCol);

    return snap.docs.map(d => ({
        sessionUID: d.id,
        ...d.data(),
        _studentsLoaded: false,
        _students: [],
    }));
}

function renderSessionsList(sessions, date) {
    const d = new Date(date + "T12:00:00");
    const dateLabel = d.toLocaleDateString("ar-EG", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    document.getElementById("screenSessions").innerHTML = `
        <div class="far-screen-header">
            <button class="far-back-btn" onclick="showScreen('screenDate')">&#8594; رجوع</button>
            <div>
                <div class="far-screen-title">جلسات ${dateLabel}</div>
                <div class="far-screen-sub">${sessions.length} جلسة مسجلة</div>
            </div>
        </div>
        <div class="far-sessions-grid">
            ${sessions.map((s, i) => buildSessionCard(s, i)).join("")}
        </div>
    `;
}

function buildSessionCard(s, idx) {
    const isActive = s.isActive === true;
    return `
    <div class="far-session-card ${isActive ? "active-session" : ""}" onclick="openSession(${idx})">
        <div class="far-session-live ${isActive ? "live" : ""}">
            ${isActive ? `<span class="far-dot-live"></span>LIVE` : "مغلقة"}
        </div>
        <div class="far-session-subject">${s.subject || "—"}</div>
        <div class="far-session-doctor">${s.doctorName || "—"}</div>
        <div class="far-session-hall">
            <span>📍</span>${s.hall || "—"}
            <span class="far-session-code">${s.sessionCode || ""}</span>
        </div>
        <div class="far-session-footer">
            <span class="far-load-hint">اضغط للتحليل</span>
        </div>
    </div>`;
}

window.openSession = async (idx) => {
    const { date, sessions, db } = window._farState;
    const session = sessions[idx];

    showScreen("screenSession");
    setSessionLoading(session);

    try {
        if (!session._studentsLoaded) {
            session._students      = await fetchStudents(db, date, session.sessionUID);
            session._studentsLoaded = true;
        }

        const uids     = [...new Set(session._students.map(r => r.studentUID).filter(Boolean))];
        const profiles = await fetchProfilesCached(db, uids);

        const analyzed = analyzeStudents(session._students, profiles);
        const stats    = calcStats(analyzed);

        renderSessionDetails(session, analyzed, stats);

    } catch (err) {
        document.getElementById("screenSession").innerHTML +=
            `<div class="far-error">❌ ${err.message}</div>`;
        console.error("[FAR]", err);
    }
};

function setSessionLoading(session) {
    document.getElementById("screenSession").innerHTML = `
        <div class="far-screen-header">
            <button class="far-back-btn" onclick="showScreen('screenSessions')">&#8594; رجوع</button>
            <div>
                <div class="far-screen-title">${session.subject || "جلسة"}</div>
                <div class="far-screen-sub">${session.doctorName || ""} — ${session.hall || ""}</div>
            </div>
        </div>
        <div class="far-loading-state">
            <span class="far-spin big"></span>
            <div>جاري تحليل البصمات والمواقع...</div>
        </div>`;
}

async function fetchStudents(db, date, sessionUID) {
    const studentsCol = collection(db, "audit_logs", date, "sessions", sessionUID, "students");
    const snap = await getDocs(studentsCol);

    return snap.docs.map(d => {
        const data = d.data();
        return {
            studentUID:   data.studentUID   || d.id,
            studentName:  data.studentName  || "مجهول",
            studentID:    data.studentID    || "—",
            studentEmail: data.studentEmail || "—",

            usedFP:    data.device?.fingerprint || null,
            ipAddress: data.device?.ipAddress   || null,
            platform:  data.device?.platform    || null,
            language:  data.device?.language    || null,

            gps: {
                lat:          data.gps?.lat          ?? null,
                lng:          data.gps?.lng          ?? null,
                inRange:      data.gps?.in_range     ?? null,
                status:       data.gps?.status       || null,
                accuracy:     data.gps?.accuracy     ?? null,
                distance:     data.gps?.distance     ?? null,
                isSuspicious: data.gps?.is_suspicious ?? false,
                cheatReason:  data.gps?.cheat_reason  || null,
            },

            security: {
                overallStatus:  data.security_result?.overall_status  || null,
                deviceTrusted:  data.security_result?.device_trusted  ?? null,
                gpsInRange:     data.security_result?.gps_in_range    ?? null,
                gpsSuspicious:  data.security_result?.gps_suspicious  ?? null,
            },
        };
    });
}

async function fetchProfilesCached(db, uids) {
    const toFetch = uids.filter(uid => !_profileCache.has(uid));

    if (toFetch.length > 0) {
        for (let i = 0; i < toFetch.length; i += BATCH) {
            await Promise.all(toFetch.slice(i, i + BATCH).map(async uid => {
                try {
                    const snap = await getDoc(doc(db, PROFILE_PATH(uid)));
                    if (snap.exists()) {
                        const data = snap.data();
                        _profileCache.set(uid, {
                            boundDeviceId:  data.bound_device_id  || data.boundDeviceId || null,
                            allowedDevices: Array.isArray(data.allowed_devices) ? data.allowed_devices : [],
                        });
                    } else {
                        _profileCache.set(uid, null);
                    }
                } catch {
                    _profileCache.set(uid, null);
                }
            }));
        }
    }

    return Object.fromEntries(uids.map(uid => [uid, _profileCache.get(uid) ?? null]));
}

function analyzeStudents(students, profiles) {
    const fpMap = {};  
    const ipMap = {};   

    students.forEach(r => {
        if (r.usedFP)    (fpMap[r.usedFP]    ??= []).push(r.studentUID);
        if (r.ipAddress) (ipMap[r.ipAddress]  ??= []).push(r.studentUID);
    });

    return students.map(r => {
        const profile  = profiles[r.studentUID];
        const fp       = r.usedFP;

        let verdict;
        if (!fp) {
            verdict = "NO_PROFILE";
        } else if (!profile) {
            verdict = "NO_PROFILE";
        } else if (fp === profile.boundDeviceId) {
            verdict = "CLEAN";
        } else if (profile.allowedDevices.includes(fp)) {
            verdict = "SECONDARY";
        } else {
            verdict = "UNKNOWN";
        }

        const sharedFPWith = fp ? (fpMap[fp] || []).filter(uid => uid !== r.studentUID) : [];
        if (sharedFPWith.length > 0) verdict = "SHARED";

        const sharedIPWith = r.ipAddress
            ? (ipMap[r.ipAddress] || []).filter(uid => uid !== r.studentUID)
            : [];

        return { ...r, profile, verdict, sharedFPWith, sharedIPWith };
    });
}

function calcStats(analyzed) {
    return {
        total:     analyzed.length,
        clean:     analyzed.filter(s => s.verdict === "CLEAN").length,
        secondary: analyzed.filter(s => s.verdict === "SECONDARY").length,
        shared:    analyzed.filter(s => s.verdict === "SHARED").length,
        unknown:   analyzed.filter(s => s.verdict === "UNKNOWN").length,
        noProfile: analyzed.filter(s => s.verdict === "NO_PROFILE").length,
        gpsOk:     analyzed.filter(s => s.gps.inRange === true).length,
        gpsOut:    analyzed.filter(s => s.gps.inRange === false && s.gps.lat !== null).length,
        gpsNone:   analyzed.filter(s => s.gps.lat === null).length,
        flagged:   analyzed.filter(s => s.security.overallStatus === "FLAGGED").length,
    };
}

function renderSessionDetails(session, students, stats) {
    const ORDER = { SHARED:0, UNKNOWN:1, SECONDARY:2, NO_PROFILE:3, CLEAN:4 };
    students.sort((a,b) => ORDER[a.verdict] - ORDER[b.verdict]);

    document.getElementById("screenSession").innerHTML = `
        <div class="far-screen-header">
            <button class="far-back-btn" onclick="showScreen('screenSessions')">&#8594; رجوع</button>
            <div>
                <div class="far-screen-title">${session.subject || "جلسة"}</div>
                <div class="far-screen-sub">${session.doctorName || ""} — ${session.hall || ""} — كود: ${session.sessionCode || "—"}</div>
            </div>
        </div>

        <!-- إحصائيات مختصرة -->
        <div class="far-stats-bar">
            <div class="far-stat-item clean">
                <span class="far-stat-num">${stats.clean}</span>
                <span class="far-stat-lbl">أصلي</span>
            </div>
            <div class="far-stat-item secondary">
                <span class="far-stat-num">${stats.secondary}</span>
                <span class="far-stat-lbl">ثانوي</span>
            </div>
            <div class="far-stat-item shared">
                <span class="far-stat-num">${stats.shared}</span>
                <span class="far-stat-lbl">مشترك</span>
            </div>
            <div class="far-stat-item unknown">
                <span class="far-stat-num">${stats.unknown}</span>
                <span class="far-stat-lbl">غريب</span>
            </div>
            <div class="far-stat-sep"></div>
            <div class="far-stat-item gpsok">
                <span class="far-stat-num">${stats.gpsOk}</span>
                <span class="far-stat-lbl">GPS ✔</span>
            </div>
            <div class="far-stat-item gpsout">
                <span class="far-stat-num">${stats.gpsOut}</span>
                <span class="far-stat-lbl">خارج النطاق</span>
            </div>
            <div class="far-stat-item gpsnone">
                <span class="far-stat-num">${stats.gpsNone}</span>
                <span class="far-stat-lbl">GPS غير محدد</span>
            </div>
            <div class="far-stat-sep"></div>
            <div class="far-stat-item flagged">
                <span class="far-stat-num">${stats.flagged}</span>
                <span class="far-stat-lbl">🚩 مُبلَّغ</span>
            </div>
        </div>

        <!-- فلتر -->
        <div class="far-filter-row">
            <button class="far-filter-btn active" onclick="filterFAR('ALL',this)">الكل (${stats.total})</button>
            <button class="far-filter-btn" onclick="filterFAR('SHARED',this)">مشترك (${stats.shared})</button>
            <button class="far-filter-btn" onclick="filterFAR('UNKNOWN',this)">غريب (${stats.unknown})</button>
            <button class="far-filter-btn" onclick="filterFAR('SECONDARY',this)">ثانوي (${stats.secondary})</button>
            <button class="far-filter-btn" onclick="filterFAR('CLEAN',this)">أصلي (${stats.clean})</button>
            <button class="far-filter-btn" onclick="filterFAR('NO_PROFILE',this)">بدون ملف (${stats.noProfile})</button>
        </div>

        <!-- قائمة الطلاب -->
        <div id="far-students-list">
            ${students.map((s, i) => buildStudentCard(s, i, students)).join("")}
        </div>
    `;

    window._farStudents = students;
}

function buildStudentCard(s, i, all) {
    const v   = VERDICT[s.verdict];
    const gps = s.gps;

    const boundFP    = s.profile?.boundDeviceId  || null;
    const allowedFPs = s.profile?.allowedDevices || [];
    const usedFP     = s.usedFP                  || null;

    const fpMatchBound    = usedFP && boundFP && usedFP === boundFP;
    const fpMatchAllowed  = usedFP && allowedFPs.includes(usedFP);

    let gpsHtml;
    if (gps.lat === null) {
        gpsHtml = `<div class="far-gps-row gps-none">📡 الموقع: <strong>لم يتم تحديده</strong></div>`;
    } else if (gps.inRange) {
        gpsHtml = `<div class="far-gps-row gps-ok">📍 الموقع: <strong>داخل النطاق</strong>
            <span class="far-gps-acc">دقة: ${gps.accuracy?.toFixed(0) ?? "—"} م</span></div>`;
    } else {
        gpsHtml = `
        <div class="far-gps-row gps-out">
            📍 الموقع: <strong>خارج النطاق</strong>
            <span class="far-gps-dist">المسافة: ${gps.distance ?? "—"} م</span>
        </div>
        <div class="far-gps-coords">
            <a class="far-coords-link"
               href="https://maps.google.com/?q=${gps.lat},${gps.lng}" target="_blank">
               🗺 ${gps.lat?.toFixed(5)}, ${gps.lng?.toFixed(5)}
            </a>
            ${gps.isSuspicious ? `<span class="far-gps-suspicious">مشبوه</span>` : ""}
            ${gps.cheatReason  ? `<span class="far-gps-reason">${gps.cheatReason}</span>` : ""}
        </div>`;
    }

    const ipShared  = s.sharedIPWith.length > 0;
    const ipNames   = s.sharedIPWith.map(uid => {
        const found = all.find(st => st.studentUID === uid);
        return found ? found.studentName : uid.slice(0,8) + "…";
    }).join("، ");
    const ipHtml = s.ipAddress
        ? `<div class="far-ip-row ${ipShared ? "ip-shared" : ""}">
            🌐 ${s.ipAddress}
            ${ipShared ? `<span class="far-ip-warn">مشترك مع: ${ipNames}</span>` : ""}
           </div>`
        : `<div class="far-ip-row ip-none">🌐 IP غير معروف</div>`;

    const sharedFPHtml = s.sharedFPWith.length > 0 ? `
        <div class="far-shared-alert">
            ⚠ نفس بصمة الجهاز مع:
            ${s.sharedFPWith.map(uid => {
                const found = all.find(st => st.studentUID === uid);
                return `<strong>${found ? found.studentName : uid.slice(0,8)+"…"}</strong>`;
            }).join("، ")}
        </div>` : "";

    const osLabel = {
        FLAGGED: `<span class="far-os flagged">🚩 FLAGGED</span>`,
        PASSED:  `<span class="far-os passed">✅ PASSED</span>`,
        WARNING: `<span class="far-os warning">⚠ WARNING</span>`,
    }[s.security.overallStatus] ?? `<span class="far-os neutral">${s.security.overallStatus ?? "—"}</span>`;

    return `
    <div class="far-student-row verdict-${s.verdict.toLowerCase()}" data-verdict="${s.verdict}" id="fsr-${i}">
        <!-- رأس البطاقة -->
        <div class="far-student-header" onclick="toggleFAR(${i})">
            <div class="far-student-left">
                <div class="far-student-name">${s.studentName}</div>
                <div class="far-student-meta2">${s.studentID} · ${s.studentEmail}</div>
            </div>
            <div class="far-student-right">
                ${osLabel}
                <span class="far-verdict-badge" style="color:${v.color};background:${v.bg};border-color:${v.border}">
                    ${v.icon} ${v.label}
                </span>
                <span class="far-chev" id="chev-${i}">&#8964;</span>
            </div>
        </div>

        <!-- جسم البطاقة (مخفي) -->
        <div class="far-student-body" id="body-${i}">

            ${sharedFPHtml}

            <!-- مقارنة البصمات -->
            <div class="far-section-title">🔑 البصمات</div>
            <div class="far-fp-table">
                <div class="far-fp-row">
                    <span class="far-fp-label">بصمة اليوم</span>
                    ${fpVal(usedFP, fpMatchBound || fpMatchAllowed)}
                    ${usedFP ? copyBtn(usedFP) : ""}
                </div>
                <div class="far-fp-row">
                    <span class="far-fp-label">جهاز الحساب</span>
                    ${fpVal(boundFP, fpMatchBound)}
                    ${boundFP ? copyBtn(boundFP) : ""}
                </div>
                ${allowedFPs.length ? `
                <div class="far-fp-row">
                    <span class="far-fp-label">أجهزة مسموحة</span>
                    <div class="far-allowed-list">
                        ${allowedFPs.map(fp =>
                            fpVal(fp, fp === usedFP)
                        ).join("")}
                    </div>
                </div>` : ""}
            </div>

            <!-- GPS -->
            <div class="far-section-title">📡 الموقع</div>
            <div class="far-gps-block">${gpsHtml}</div>

            <!-- IP -->
            <div class="far-section-title">🌐 عنوان IP</div>
            <div class="far-ip-block">${ipHtml}</div>

        </div>
    </div>`;
}

function fpVal(fp, isMatch) {
    if (!fp) return `<code class="far-fp-val empty">—</code>`;
    return `<code class="far-fp-val ${isMatch ? "fp-match" : "fp-nomatch"}">${fp}</code>`;
}
function copyBtn(text) {
    return `<button class="far-copy-mini" onclick="farCopy('${text}',this)">نسخ</button>`;
}

window.toggleFAR = (i) => {
    const body = document.getElementById(`body-${i}`);
    const chev = document.getElementById(`chev-${i}`);
    body.classList.toggle("open");
    chev.classList.toggle("rot");
};

window.filterFAR = (verdict, btn) => {
    document.querySelectorAll(".far-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".far-student-row").forEach(row => {
        row.style.display = (verdict === "ALL" || row.dataset.verdict === verdict) ? "" : "none";
    });
};

window.farCopy = (text, btn) => {
    navigator.clipboard.writeText(text).then(() => {
        const o = btn.textContent;
        btn.textContent = "✔"; btn.style.color = "#3ecf8e";
        setTimeout(() => { btn.textContent = o; btn.style.color = ""; }, 1500);
    });
};

function setBtnLoading(btn, loading) {
    btn.disabled = loading;
    btn.innerHTML = loading
        ? `<span class="far-spin"></span> جاري الجلب...`
        : "ابدأ الفحص";
}

function showToast(msg, type = "info") {
    const c = type==="err" ? "#f56565" : type==="warn" ? "#f5c542" : "#3ecf8e";
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:#1a202c;color:${c};border:1px solid ${c}40;
        padding:10px 20px;border-radius:8px;font-size:13px;z-index:99999;
        font-family:inherit;direction:rtl;box-shadow:0 4px 20px rgba(0,0,0,.4);`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function injectCSS() {
    const s = document.createElement("style");
    s.textContent = `
/* ── Modal overlay ────────────────────────────────────── */
#farModal {
    position:fixed; inset:0;
    background:rgba(0,0,0,.88); backdrop-filter:blur(6px);
    z-index:2147483647; display:none;
    align-items:flex-start; justify-content:center;
    padding:16px 10px 40px; overflow-y:auto;
}
.far-box {
    background:#0d1117; border:1px solid #21262d; border-radius:14px;
    width:100%; max-width:720px;
    font-family:'Segoe UI',Tahoma,sans-serif; direction:rtl; overflow:hidden;
}

/* ── Top bar ───────────────────────────────────────────── */
.far-topbar {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 20px; background:#161b22; border-bottom:1px solid #21262d;
}
.far-brand { display:flex; align-items:center; gap:10px; }
.far-brand-badge {
    background:rgba(245,98,84,.15); color:#f56254;
    border:1px solid rgba(245,98,84,.3);
    font-size:9px; font-weight:700; letter-spacing:2px;
    padding:3px 8px; border-radius:4px;
}
.far-brand-name { color:#e6edf3; font-size:14px; font-weight:700; }
.far-brand-sub  { color:#8b949e; font-size:11px; margin-top:1px; }
.far-close {
    background:none; border:none; color:#8b949e;
    font-size:20px; cursor:pointer; padding:4px 8px; border-radius:6px; transition:.2s;
}
.far-close:hover { color:#e6edf3; background:#21262d; }

/* ── Body ──────────────────────────────────────────────── */
.far-body { padding:20px; }
#screenDate, #screenSessions, #screenSession { display:none; }

/* ── شاشة التاريخ ──────────────────────────────────────── */
.far-date-label { font-size:12px; color:#8b949e; margin-bottom:8px; }
.far-date-row   { display:flex; gap:10px; align-items:center; }
#farDateInput {
    flex:1; background:#161b22; border:1px solid #30363d;
    color:#e6edf3; border-radius:8px; padding:10px 14px;
    font-size:14px; outline:none; transition:.2s; font-family:inherit;
}
#farDateInput:focus { border-color:#3ecf8e; box-shadow:0 0 0 3px rgba(62,207,142,.15); }
#farStartBtn {
    background:#3ecf8e; color:#0d1117; border:none; border-radius:8px;
    padding:10px 22px; font-size:14px; font-weight:700; cursor:pointer;
    transition:.2s; display:flex; align-items:center; gap:8px;
    white-space:nowrap; font-family:inherit;
}
#farStartBtn:hover:not(:disabled) { background:#2eb87a; }
#farStartBtn:disabled { opacity:.5; cursor:not-allowed; }

/* ── Screen header ─────────────────────────────────────── */
.far-screen-header {
    display:flex; align-items:center; gap:14px;
    padding-bottom:16px; margin-bottom:16px; border-bottom:1px solid #21262d;
}
.far-back-btn {
    background:#21262d; border:1px solid #30363d; color:#8b949e;
    border-radius:8px; padding:7px 12px; font-size:12px;
    cursor:pointer; transition:.2s; white-space:nowrap; font-family:inherit;
}
.far-back-btn:hover { color:#e6edf3; border-color:#8b949e; }
.far-screen-title { color:#e6edf3; font-size:16px; font-weight:700; }
.far-screen-sub   { color:#8b949e; font-size:11px; margin-top:3px; }

/* ── Sessions grid ─────────────────────────────────────── */
.far-sessions-grid {
    display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px;
}
.far-session-card {
    background:#161b22; border:1px solid #30363d; border-radius:10px;
    padding:14px; cursor:pointer; transition:.2s;
}
.far-session-card:hover { border-color:#8b949e; transform:translateY(-2px); }
.far-session-card.active-session { border-color:rgba(62,207,142,.4); }
.far-session-live {
    font-size:9px; font-weight:700; letter-spacing:1px;
    color:#6e7681; margin-bottom:10px; display:flex; align-items:center; gap:5px;
}
.far-session-live.live { color:#3ecf8e; }
.far-dot-live {
    width:6px; height:6px; background:#3ecf8e; border-radius:50%;
    animation:far-pulse 1.4s ease-in-out infinite;
}
@keyframes far-pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:.4; transform:scale(1.4); }
}
.far-session-subject { color:#e6edf3; font-size:13px; font-weight:700; margin-bottom:4px; }
.far-session-doctor  { color:#8b949e; font-size:11px; margin-bottom:3px; }
.far-session-hall    {
    color:#6e7681; font-size:10px; font-family:monospace;
    margin-bottom:12px; display:flex; align-items:center; gap:6px;
}
.far-session-code {
    background:#21262d; padding:1px 6px; border-radius:4px; font-size:9px;
}
.far-session-footer { display:flex; justify-content:flex-end; }
.far-load-hint { color:#484f58; font-size:10px; font-style:italic; }

/* ── Stats bar ─────────────────────────────────────────── */
.far-stats-bar {
    display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; align-items:center;
}
.far-stat-item {
    background:#161b22; border:1px solid #30363d; border-radius:8px;
    padding:8px 10px; text-align:center; min-width:52px;
}
.far-stat-num { display:block; font-size:18px; font-weight:700; line-height:1; }
.far-stat-lbl { display:block; font-size:9px; color:#8b949e; margin-top:3px; }
.far-stat-sep { width:1px; background:#30363d; align-self:stretch; margin:0 2px; }
.far-stat-item.clean     .far-stat-num { color:#3ecf8e; }
.far-stat-item.secondary .far-stat-num { color:#f5c542; }
.far-stat-item.shared    .far-stat-num { color:#ed8936; }
.far-stat-item.unknown   .far-stat-num { color:#f56565; }
.far-stat-item.gpsok     .far-stat-num { color:#3ecf8e; }
.far-stat-item.gpsout    .far-stat-num { color:#f5c542; }
.far-stat-item.gpsnone   .far-stat-num { color:#718096; }
.far-stat-item.flagged   .far-stat-num { color:#f56565; }

/* ── Filter ────────────────────────────────────────────── */
.far-filter-row { display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap; }
.far-filter-btn {
    background:#21262d; border:1px solid #30363d; color:#8b949e;
    border-radius:100px; padding:5px 14px; font-size:11px;
    cursor:pointer; transition:.2s; font-family:inherit;
}
.far-filter-btn:hover  { border-color:#8b949e; color:#e6edf3; }
.far-filter-btn.active { background:rgba(62,207,142,.1); border-color:#3ecf8e; color:#3ecf8e; }

/* ── Student row ───────────────────────────────────────── */
.far-student-row {
    background:#161b22; border:1px solid #30363d; border-radius:10px;
    margin-bottom:8px; overflow:hidden; border-right-width:3px;
}
.far-student-row.verdict-clean      { border-right-color:#3ecf8e; }
.far-student-row.verdict-secondary  { border-right-color:#f5c542; }
.far-student-row.verdict-unknown    { border-right-color:#f56565; }
.far-student-row.verdict-shared     { border-right-color:#ed8936; }
.far-student-row.verdict-no_profile { border-right-color:#718096; }

.far-student-header {
    display:flex; justify-content:space-between; align-items:center;
    padding:12px 16px; cursor:pointer; user-select:none;
    background:#1c2128; transition:.15s;
}
.far-student-header:hover { background:#21262d; }
.far-student-name  { color:#e6edf3; font-size:13px; font-weight:600; }
.far-student-meta2 { color:#8b949e; font-size:10px; font-family:monospace; margin-top:2px; }
.far-student-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

.far-verdict-badge {
    font-size:9px; font-weight:700; padding:3px 9px;
    border-radius:4px; border:1px solid; white-space:nowrap;
}
.far-os {
    font-size:9px; font-weight:700; padding:3px 9px;
    border-radius:4px; white-space:nowrap;
}
.far-os.flagged { color:#f56565; background:rgba(245,101,101,.1); border:1px solid rgba(245,101,101,.3); }
.far-os.passed  { color:#3ecf8e; background:rgba(62,207,142,.1);  border:1px solid rgba(62,207,142,.3); }
.far-os.warning { color:#f5c542; background:rgba(245,197,66,.1);  border:1px solid rgba(245,197,66,.3); }
.far-os.neutral { color:#8b949e; background:#21262d; border:1px solid #30363d; }

.far-chev { color:#8b949e; font-size:14px; transition:.3s; display:inline-block; }
.far-chev.rot { transform:rotate(180deg); }

.far-student-body {
    display:none; padding:14px 16px; flex-direction:column; gap:12px;
    border-top:1px solid #21262d;
}
.far-student-body.open { display:flex; }

/* ── Section title ─────────────────────────────────────── */
.far-section-title {
    font-size:10px; font-weight:700; color:#8b949e;
    letter-spacing:1px; text-transform:uppercase; margin-bottom:4px;
}

/* ── Shared alert ──────────────────────────────────────── */
.far-shared-alert {
    background:rgba(237,137,54,.07); border:1px solid rgba(237,137,54,.3);
    border-radius:6px; padding:8px 12px; color:#ed8936; font-size:12px; font-weight:600;
}

/* ── FP table ──────────────────────────────────────────── */
.far-fp-table {
    background:#0d1117; border:1px solid #21262d; border-radius:8px;
    padding:12px; display:flex; flex-direction:column; gap:8px;
}
.far-fp-row { display:flex; align-items:flex-start; gap:8px; flex-wrap:wrap; }
.far-fp-label { font-size:9px; color:#8b949e; min-width:80px; padding-top:5px; }
.far-fp-val {
    font-size:10px; font-family:monospace; background:#161b22;
    border:1px solid #30363d; padding:4px 8px; border-radius:4px;
    color:#8b949e; word-break:break-all; flex:1;
}
.far-fp-val.empty   { color:#484f58; border-style:dashed; }
.far-fp-val.fp-match   { color:#3ecf8e; border-color:rgba(62,207,142,.4);  background:rgba(62,207,142,.06); }
.far-fp-val.fp-nomatch { color:#f56565; border-color:rgba(245,101,101,.4); background:rgba(245,101,101,.06); }
.far-allowed-list { display:flex; flex-wrap:wrap; gap:4px; flex:1; }
.far-copy-mini {
    background:#21262d; border:1px solid #30363d; color:#8b949e;
    font-size:9px; cursor:pointer; padding:3px 7px;
    border-radius:4px; transition:.2s; font-family:inherit; white-space:nowrap;
}
.far-copy-mini:hover { color:#e6edf3; }

/* ── GPS block ─────────────────────────────────────────── */
.far-gps-block {
    background:#0d1117; border:1px solid #21262d; border-radius:8px; padding:10px 12px;
    display:flex; flex-direction:column; gap:6px;
}
.far-gps-row {
    font-size:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;
}
.far-gps-row.gps-none { color:#718096; }
.far-gps-row.gps-ok   { color:#3ecf8e; }
.far-gps-row.gps-out  { color:#f5c542; }
.far-gps-acc  { font-size:10px; color:#8b949e; }
.far-gps-dist { font-size:10px; color:#8b949e; }
.far-gps-coords { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.far-coords-link {
    font-family:monospace; font-size:11px; color:#58a6ff; text-decoration:none;
    border:1px solid rgba(88,166,255,.3); border-radius:4px; padding:3px 8px;
    background:rgba(88,166,255,.06); transition:.2s;
}
.far-coords-link:hover { background:rgba(88,166,255,.12); }
.far-gps-suspicious {
    font-size:9px; font-weight:700; color:#f56565;
    background:rgba(245,101,101,.1); border:1px solid rgba(245,101,101,.3);
    padding:2px 8px; border-radius:4px;
}
.far-gps-reason {
    font-size:9px; color:#8b949e; background:#161b22;
    border:1px solid #30363d; padding:2px 8px; border-radius:4px;
}

/* ── IP block ──────────────────────────────────────────── */
.far-ip-block {
    background:#0d1117; border:1px solid #21262d; border-radius:8px; padding:10px 12px;
}
.far-ip-row { font-size:12px; color:#8b949e; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.far-ip-row.ip-shared { color:#f5c542; }
.far-ip-row.ip-none   { color:#484f58; }
.far-ip-warn {
    font-size:10px; color:#f56565; background:rgba(245,101,101,.08);
    border:1px solid rgba(245,101,101,.3); padding:2px 8px; border-radius:4px;
}

/* ── States ────────────────────────────────────────────── */
.far-loading-state {
    text-align:center; padding:40px; color:#8b949e; font-size:13px;
    display:flex; flex-direction:column; align-items:center; gap:12px;
}
.far-error { color:#f56565; padding:20px; text-align:center; font-size:13px; }

/* ── Spinner ───────────────────────────────────────────── */
.far-spin {
    display:inline-block; width:14px; height:14px;
    border:2px solid #21262d; border-top-color:#3ecf8e;
    border-radius:50%; animation:far-rotate .7s linear infinite;
}
.far-spin.big { width:28px; height:28px; border-width:3px; }
@keyframes far-rotate { to { transform:rotate(360deg); } }
    `;
    document.head.appendChild(s);
}