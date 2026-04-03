import {
    getSubjectsByCollegeAndLevel,
    getAllSubjectsByCollege,
    getHallsByCollege
} from './config.js';
import { SmartHistory } from './SmartHistory.js';
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
    onSnapshot, serverTimestamp, increment, writeBatch, orderBy, limit,
    arrayUnion, arrayRemove, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { i18n } from './i18n.js';
import { applyVipTheme } from './VipThemeManager.js';

async function _getDocWithRetry(ref, label = "doc", maxRetries = 3) {
    for (let i = 1; i <= maxRetries; i++) {
        try {
            return await getDoc(ref);
        } catch (e) {
            console.warn(`⚠️ محاولة رقم ${i} لفشل الاتصال:`, label);
            if (i === maxRetries) throw e;
            await new Promise(r => setTimeout(r, 800 * i));
        }
    }
}

window.LECTURE_SETUP_CACHE = { subjects: [], halls: [], isReady: false };

window.globalTimeOffset = 0;


async function syncServerTime() {
    try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });

        const serverDateStr = response.headers.get('Date');
        if (!serverDateStr) return;

        const serverTime = new Date(serverDateStr).getTime();
        const localTime = Date.now();

        window.globalTimeOffset = serverTime - localTime;

        console.log("⏱️ Time Sync Offset:", window.globalTimeOffset, "ms");
    } catch (e) {
        console.warn("⚠️ Time Sync Failed, falling back to local time.", e);
    }
}

syncServerTime();

window.verifyAdminRole = async function () {
    const user = window.auth?.currentUser;
    if (!user) return false;

    try {
        const docRef = doc(db, "faculty_members", user.uid);
        const docSnap = await _getDocWithRetry(docRef, "verify_admin");

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.role === 'dean' || data.role === 'doctor') {
                console.log("✅ Identity Verified: " + data.role);
                return true;
            }
        }
    } catch (e) {
        console.error("Role Verification Failed:", e);
    }
    return false;
};

let sessionInterval = null;
let unsubscribeLiveSnapshot = null;
let deanRadarUnsubscribe = null;
let unsubscribeHeaderSession = null;

window.LECTURE_SETUP_CACHE = {
    isReady: false,
    baseSubjects: [],
    baseHalls: [],
    detectedLetter: "N",
    doctorUID: null
};


window.preFetchAdminSetupData = async function () {
    const user = window.auth?.currentUser;
    if (!user || !sessionStorage.getItem("secure_admin_session_token_v99")) return;
    if (window.LECTURE_SETUP_CACHE.isReady && window.LECTURE_SETUP_CACHE.doctorUID === user.uid) return;

    try {
        const collegeLetterMap = { "NURS": "N", "PT": "P", "PHARM": "C", "DENT": "D", "CS": "T", "BA": "B", "HS": "H" };
        let doctorCollege = "NURS";
        let doctorLevel = null;

        const facSnap = await _getDocWithRetry(doc(db, "faculty_members", user.uid), "prefetch_fac");
        if (facSnap.exists()) {
            const facData = facSnap.data();
            doctorCollege = facData.college || "NURS";
            doctorLevel = facData.level || null;
        }

        let subjectsArray = doctorLevel ? getSubjectsByCollegeAndLevel(doctorCollege, doctorLevel) : getAllSubjectsByCollege(doctorCollege);
        let hallsArray = getHallsByCollege(doctorCollege);
        let detectedLetter = collegeLetterMap[doctorCollege] || "N";

        let enrolledSubjectNames = new Set();
        try {
            const [enrollSnap, sharedSnap] = await Promise.all([
                getDocs(query(collection(db, "subject_enrollments"), where("doctorUID", "==", user.uid))),
                getDocs(query(collection(db, "subject_enrollments"), where("sharedWithAll", "==", true), where("college", "==", doctorCollege)))
            ]);
            enrollSnap.forEach(d => { if (d.data().subjectName) enrolledSubjectNames.add(d.data().subjectName.trim()); });
            sharedSnap.forEach(d => { if (d.data().subjectName) enrolledSubjectNames.add(d.data().subjectName.trim()); });
        } catch (e) { console.warn("Stars fetch failed"); }

        subjectsArray = subjectsArray.map(sub => enrolledSubjectNames.has(sub.trim()) ? `${sub} ⭐` : sub);

        window.LECTURE_SETUP_CACHE = {
            isReady: true,
            baseSubjects: subjectsArray,
            baseHalls: hallsArray,
            detectedLetter: detectedLetter,
            doctorUID: user.uid
        };
        console.log("⚡ Setup Data Pre-fetched Successfully.");
    } catch (err) { console.error("Pre-fetch Error:", err); }
};

window.toggleSessionState = async function () {
    if (!sessionStorage.getItem("secure_admin_session_token_v99")) return;

    const btn = document.getElementById('btnToggleSession');

    if (btn && btn.classList.contains('session-open')) {
        if (typeof switchScreen === 'function') switchScreen('screenLiveSession');
        if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();
        return;
    }

    const modal = document.getElementById('customTimeModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const user = window.auth?.currentUser;
    const cache = window.LECTURE_SETUP_CACHE;

    if (!cache.isReady || cache.doctorUID !== user?.uid) {
        await window.preFetchAdminSetupData();
    }

    let finalSubjects = [...window.LECTURE_SETUP_CACHE.baseSubjects];
    let finalHalls = [...window.LECTURE_SETUP_CACHE.baseHalls];

    if (user) {
        const historySubs = SmartHistory.get(`history_subjects_${user.uid}`);
        if (historySubs.length > 0) {
            finalSubjects = [...historySubs.map(s => `🕒 ${s}`), ...finalSubjects];
        }

        const historyHalls = SmartHistory.get(`history_halls_${user.uid}`);
        if (historyHalls.length > 0) {
            finalHalls = [...historyHalls.map(h => `🕒 ${h}`), ...finalHalls];
        }
    }

    const groupEl = document.getElementById('modalGroupInput');
    if (groupEl) groupEl.placeholder = `e.g. 1${window.LECTURE_SETUP_CACHE.detectedLetter}1`;

    renderCustomList('subjectList', finalSubjects, 'finalSubjectValue');
    renderCustomList('hallList', finalHalls, 'finalHallValue');
};


window.confirmSessionStart = async function () {
    const subjectEl = document.getElementById('finalSubjectValue');
    const hallEl = document.getElementById('finalHallValue');
    const groupEl = document.getElementById('modalGroupInput');
    const passEl = document.getElementById('modalSessionPassInput');

    if (!subjectEl || !hallEl) {
        console.error("Critical Error: Setup input elements missing!");
        showToast("⚠️ خطأ في النظام: يرجى تحديث الصفحة", 3000, "#ef4444");
        return;
    }

    const subject = subjectEl.value
        .replace("🕒 ", "")
        .replace("⭐", "")
        .replace("✅ ", "")
        .trim();

    const hall = hallEl.value.replace("🕒 ", "").trim();

    let rawGroup = groupEl ? groupEl.value.replace(/\s+/g, '').toUpperCase() : "";
    let groupInput = "GENERAL";
    let resolvedGroups = ["GENERAL"];

    if (rawGroup !== "") {
        const collegeLetterMap = {
            "NURS": "N", "PT": "P", "PHARM": "C", "DENT": "D", "CS": "T", "BA": "B", "HS": "H"
        };
        let doctorCollegeForGroup = "NURS";
        try {
            const _fs = await getDoc(doc(db, "faculty_members", auth.currentUser.uid));
            if (_fs.exists()) doctorCollegeForGroup = _fs.data().college || "NURS";
        } catch (e) { }

        const expectedLetter = collegeLetterMap[doctorCollegeForGroup] || "N";
        const groupPattern = new RegExp(`^[1-4][A-Z]\\d{1,2}$`);


        if (!groupPattern.test(rawGroup)) {
            showToast(`⚠️ Invalid Group Format! Must be like: 1N1`, 4000, "#ef4444");
            if (groupEl) {
                groupEl.style.borderColor = "#ef4444";
                groupEl.focus();
                setTimeout(() => groupEl.style.borderColor = "", 2000);
            }
            return;
        }
        groupInput = rawGroup;
        resolvedGroups = window.resolveGroups ? window.resolveGroups(rawGroup) : [rawGroup];
    }

    const password = passEl ? passEl.value.trim() : "";
    const user = window.auth?.currentUser;
    const lang = localStorage.getItem('sys_lang') || 'ar';
    const dict = (typeof i18n !== 'undefined' && i18n[lang]) ? i18n[lang] : {};

    if (!user) return;

    if (!subject || subject === "") {
        showToast(dict.validation_error_subject || "⚠️ Please select a subject", 3000, "#f59e0b");
        return;
    }
    if (!hall || hall === "") {
        showToast(dict.validation_error_hall || "⚠️ Please select a hall", 3000, "#f59e0b");
        return;
    }

    const doctorName = window.currentDoctorName || document.getElementById('profFacName')?.innerText || "Doctor";
    const facAvatarEl = document.getElementById('facCurrentAvatar');
    const avatarIconClass = facAvatarEl && facAvatarEl.querySelector('i') ? facAvatarEl.querySelector('i').className : "fa-solid fa-user-doctor";

    if (typeof SmartHistory !== 'undefined') {
        SmartHistory.push(`history_subjects_${user.uid}`, subject);
        SmartHistory.push(`history_halls_${user.uid}`, hall);
    }

    const btn = document.querySelector('#customTimeModal .btn-start-action') || document.querySelector('#customTimeModal .btn-main');
    const originalText = btn ? btn.innerHTML : "Start";

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ...';
        btn.style.pointerEvents = 'none';
    }

    try {
        const sessionRef = doc(db, "active_sessions", user.uid);
        let doctorCollege = "NURS";
        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        if (facSnap.exists()) doctorCollege = facSnap.data().college || "NURS";

        let enrollmentDocId = null;
        let enrolledStudentIds = [];

        try {
            const enrollmentsRef = collection(db, "subject_enrollments");
            const enrollQ = query(
                enrollmentsRef,
                where("subjectName", "==", subject),
                where("college", "==", doctorCollege)
            );
            const enrollSnap = await getDocs(enrollQ);

            if (!enrollSnap.empty) {
                const targetDoc = enrollSnap.docs.find(d => d.data().doctorUID === user.uid) ||
                    enrollSnap.docs.find(d => d.data().sharedWithAll === true);

                if (targetDoc) {
                    const enrollData = targetDoc.data();
                    enrollmentDocId = targetDoc.id;
                    enrolledStudentIds = (enrollData.students || []).map(s => String(s.id).trim());
                    console.log(`✅ Enrollment linked: ${enrolledStudentIds.length} students found.`);
                }
            }
        } catch (e) {
            console.warn("Enrollment link failed:", e);
        }

        await setDoc(sessionRef, {
            isActive: true,
            isDoorOpen: false,
            sessionCode: "------",
            college: doctorCollege,
            allowedSubject: subject,
            hall: hall,
            targetGroups: resolvedGroups,
            sessionPassword: password,
            maxStudents: 9999,
            doctorName: doctorName,
            doctorAvatar: avatarIconClass,
            doctorUID: user.uid,
            startTime: null,
            duration: 0,
            enrollmentDocId: enrollmentDocId,
            enrolledStudentIds: enrolledStudentIds, // القائمة الآن ستمتلئ ولن تكون فارغة
        }, { merge: true });

        // تحديث واجهة الجلسة الحية
        if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = doctorName;
        if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = subject;
        if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${hall}`;
        if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUP: ${groupInput}`;

        if (typeof closeSetupModal === 'function') {
            closeSetupModal();
        } else {
            document.getElementById('customTimeModal').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        switchScreen('screenLiveSession');
        if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();

        showToast("✅ " + (lang === 'ar' ? "تم التجهيز بنجاح" : "Session Ready"), 3000, "#10b981");

    } catch (e) {
        console.error("Setup Error:", e);
        showToast("❌ Error: " + e.message, 3000, "#ef4444");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
};


window.closeSessionImmediately = function () {

    const lang = localStorage.getItem('sys_lang') || 'ar';
    const t = (ar, en) => lang === 'ar' ? ar : en;

    const _getBtn = () =>
        document.getElementById('btnConfirmYes') || document.querySelector('.swal2-confirm');

    const confirmBtn = _getBtn();
    if (confirmBtn) {
        confirmBtn.innerHTML = t("تأكيد وحفظ ✅", "Confirm & Save ✅");
        confirmBtn.style.pointerEvents = 'auto';
        confirmBtn.style.opacity = '1';
        confirmBtn.disabled = false;
    }

    showModernConfirm(
        t("إنهاء الجلسة وحفظ الغياب", "End Session"),
        t("سيتم إغلاق البوابة وحفظ السجلات نهائياً.", "Session will be closed and records saved."),
        _executeClose
    );

    async function _executeClose() {

        // ── [1] التحقق من المستخدم ────────────────────────────────────────
        const user = window.auth?.currentUser;
        if (!user) {
            showToast(t("يجب تسجيل الدخول أولاً", "Please sign in first"), 3000, "#ef4444");
            return;
        }

        // ── [2] Lock مزدوج — منع التنفيذ المتكرر ─────────────────────────
        if (window._sessionClosing) {
            showToast(t("⏳ جاري الحفظ...", "⏳ Saving in progress..."), 2000, "#f59e0b");
            return;
        }
        window._sessionClosing = true;

        const actionBtn = _getBtn();
        _setButtonState(actionBtn, 'loading', lang);

        try {

            // ── [1] اقرأ البيانات الأول قبل قطع الاتصال ──────────────────
            const sessionRef = doc(db, "active_sessions", user.uid);
            const progressRef = doc(db, "active_sessions", user.uid, "close_progress", "current");

            const [sessionSnap, progressSnap] = await Promise.all([
                _getDocWithRetry(sessionRef, "session"),
                _getDocWithRetry(progressRef, "progress")
            ]);

            // ── [2] بعد ما البيانات اتقرأت، وقف المستمعين ────────────────
            _unsubscribeAll();

            // ── [5] التحقق من صحة الجلسة ──────────────────────────────────
            if (!sessionSnap.exists()) {
                showToast(t("لم يتم العثور على جلسة", "No session found"), 3000, "#ef4444");
                return;
            }
            const settings = sessionSnap.data();
            if (!settings.isActive) {
                showToast(t("⚠️ الجلسة محفوظة بالفعل", "⚠️ Session already saved"), 3000, "#f59e0b");
                return;
            }

            // ── [6] نقطة الاستئناف ────────────────────────────────────────
            let { lastCompletedBatch, totalBatchesSaved } =
                await _resolveProgress(progressSnap, progressRef, user.uid);

            // ── [7] بناء البيانات الوصفية ─────────────────────────────────
            const meta = _buildMeta(settings, user.uid);

            // ── [8] جلب المشاركين والمسجلين بالتوازي ─────────────────────
            const partsRef = collection(db, "active_sessions", user.uid, "participants");
            const [partsSnap, enrollSnap] = await Promise.all([
                _getDocsWithRetry(partsRef, "participants"),
                _fetchEnrollment(settings)
            ]);

            const allParticipants = partsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const attendedParticipants = allParticipants.filter(
                p => p.status === 'active' || p.status === 'on_break'
            );
            const attendedIds = new Set(attendedParticipants.map(p => p.id));
            const absentStudentsData = _resolveAbsent(settings, attendedIds, enrollSnap);

            // ── [9] بناء الـ Batches ──────────────────────────────────────
            const batches = _buildBatches(attendedParticipants, absentStudentsData, settings, meta, user.uid);
            const totalBatches = batches.length;

            // ── [10] حالة لا يوجد طلاب ────────────────────────────────────
            if (totalBatches === 0) {
                await _retryOp(() => updateDoc(sessionRef, { isActive: false, isDoorOpen: false }), "closeEmpty");
                showToast(t("✅ لا يوجد طلاب، تم إنهاء الجلسة", "✅ No students, session ended"), 3000, "#10b981");
                setTimeout(() => location.reload(), 1500);
                return;
            }

            // ── [11] تسجيل نقطة البداية في Firestore ─────────────────────
            if (lastCompletedBatch === -1) {
                await _retryOp(() => setDoc(progressRef, {
                    status: 'in_progress',
                    totalBatches,
                    lastSuccessfulBatch: -1,
                    startedAt: serverTimestamp(),
                    doctorUID: user.uid
                }), "initProgress");
            } else if (totalBatches !== totalBatchesSaved) {
                // عدم تطابق في عدد الـ batches — ابدأ من جديد
                lastCompletedBatch = -1;
                await _retryOp(() => setDoc(progressRef, {
                    status: 'in_progress',
                    totalBatches,
                    lastSuccessfulBatch: -1,
                    startedAt: serverTimestamp(),
                    doctorUID: user.uid
                }), "resetProgress");
            }

            // ── [12] تنفيذ الـ Batches ────────────────────────────────────
            for (let i = lastCompletedBatch + 1; i < batches.length; i++) {
                _setButtonState(actionBtn, 'progress', lang, i + 1, batches.length);
                await _commitWithRetry(batches[i].batch, batches[i].index, progressRef);
            }

            // ── [13] تأكيد الإنهاء ────────────────────────────────────────
            await _retryOp(() => updateDoc(progressRef, {
                status: 'completed',
                completedAt: serverTimestamp()
            }), "markComplete");

            // ── [14] تنظيف المشاركين المتبقين ────────────────────────────
            await _cleanupRemainingParticipants(user.uid);

            // ── [15] رسالة النجاح ─────────────────────────────────────────
            showToast(
                `✅ ${t('تم الحفظ', 'Saved')}: ${attendedParticipants.length} ${t('حضور', 'attended')} | ${absentStudentsData.length} ${t('غياب', 'absent')}`,
                5000, "#10b981"
            );
            setTimeout(() => location.reload(), 1500);

        } catch (e) {
            console.error("❌ Save Error:", e);
            _handleError(e, actionBtn, lang);
        } finally {
            window._sessionClosing = false;
            _setButtonState(_getBtn(), 'idle', lang);
        }
    }


    // ═══════════════════════════════════════════════════════════════════════
    //  ▶ Helper Functions
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * إيقاف جميع المستمعين
     * ✅ إضافة unsubscribeSessionListener لعدم فواته
     */
    function _unsubscribeAll() {
        [
            'unsubscribeLiveSnapshot',
            'unsubscribeHeaderSession',
            'deanRadarUnsubscribe',
            'unsubscribeSessionListener',
            'unsubscribeGlobalSettings'
        ].forEach(key => {
            if (window[key]) {
                try { window[key](); } catch (_) { }
                window[key] = null;
            }
        });
        console.log("🔇 All listeners detached.");
    }

    /**
     * قراءة مستند مع Retry نظيف (بدون enableNetwork)
     */
    async function _getDocWithRetry(ref, label = "doc", maxRetries = 3) {
        for (let i = 1; i <= maxRetries; i++) {
            try {
                return await getDoc(ref);
            } catch (e) {
                console.warn(`⚠️ getDoc [${label}] attempt ${i}:`, e.message);
                if (i === maxRetries) throw e;
                await new Promise(r => setTimeout(r, 800 * i));
            }
        }
    }

    /**
     * قراءة Collection مع Retry نظيف
     */
    async function _getDocsWithRetry(ref, label = "docs", maxRetries = 3) {
        for (let i = 1; i <= maxRetries; i++) {
            try {
                return await getDocs(ref);
            } catch (e) {
                console.warn(`⚠️ getDocs [${label}] attempt ${i}:`, e.message);
                if (i === maxRetries) throw e;
                await new Promise(r => setTimeout(r, 800 * i));
            }
        }
    }

    /**
     * تنفيذ عملية مع Retry نظيف (Generic)
     */
    async function _retryOp(fn, label = "op", maxRetries = 3) {
        for (let i = 1; i <= maxRetries; i++) {
            try {
                return await fn();
            } catch (e) {
                console.warn(`⚠️ _retryOp [${label}] attempt ${i}:`, e.message);
                if (i === maxRetries) throw e;
                await new Promise(r => setTimeout(r, 600 * i));
            }
        }
    }

    /**
     * تحديد نقطة الاستئناف من آخر حفظ
     */
    async function _resolveProgress(progressSnap, progressRef, uid) {
        let lastCompletedBatch = -1;
        let totalBatchesSaved = 0;

        if (progressSnap.exists()) {
            const prog = progressSnap.data();
            if (prog.status === 'in_progress' && prog.lastSuccessfulBatch !== undefined) {
                lastCompletedBatch = prog.lastSuccessfulBatch;
                totalBatchesSaved = prog.totalBatches;
                showToast(t("🔄 استكمال من نقطة التوقف...", "🔄 Resuming from checkpoint..."), 4000, "#3b82f6");
            } else if (prog.status === 'completed') {
                await deleteDoc(progressRef).catch(() => { });
            }
        }

        return { lastCompletedBatch, totalBatchesSaved };
    }

    /**
     * بناء البيانات الوصفية للجلسة
     */
    function _buildMeta(settings, uid) {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const rawSubject = settings.allowedSubject || "General";
        return {
            fixedDateStr: `${d}/${m}/${y}`,
            dateKey: `${d}-${m}-${y}`,
            closeTimeStr: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            year: y.toString(),
            rawSubject,
            cleanSubKey: rawSubject.trim()
                .replace(/\s+/g, '_')
                .replace(/[^\w\u0600-\u06FF]/g, ''),
            doctorName: settings.doctorName || "Doctor",
            college: settings.college || "NURS",
            targetGroups: settings.targetGroups?.length ? settings.targetGroups : ["General"],
            hall: settings.hall || "",
        };
    }

    /**
     * جلب بيانات المسجلين في المادة
     */
    async function _fetchEnrollment(settings) {
        if (!settings.enrollmentDocId || !settings.enrolledStudentIds?.length) return null;
        try {
            return await _retryOp(
                () => getDoc(doc(db, "subject_enrollments", settings.enrollmentDocId)),
                "enrollment"
            );
        } catch (e) {
            console.warn("Enrollment fetch skipped:", e.message);
            return null;
        }
    }

    /**
     * حساب الغائبين من قائمة المسجلين
     */
    function _resolveAbsent(settings, attendedIds, enrollSnap) {
        if (!settings.enrolledStudentIds?.length || !enrollSnap?.exists()) return [];
        const absentIds = new Set(
            settings.enrolledStudentIds.filter(id => !attendedIds.has(id))
        );
        return (enrollSnap.data().students || []).filter(s => absentIds.has(s.id));
    }

    /**
     * بناء كل الـ Batches (حد 400 عملية لكل batch)
     * ✅ كل العمليات محفوظة: حاضرون، غائبون، إحصائيات، إغلاق الجلسة
     */
    function _buildBatches(attended, absent, settings, meta, uid) {
        const BATCH_LIMIT = 400;
        const batches = [];
        let currentBatch = writeBatch(db);
        let opCount = 0;
        let batchIdx = 0;

        const flush = () => {
            if (opCount > 0) {
                batches.push({ batch: currentBatch, index: batchIdx++ });
                currentBatch = writeBatch(db);
                opCount = 0;
            }
        };

        const addOp = (fn) => {
            fn(currentBatch);
            if (++opCount >= BATCH_LIMIT) flush();
        };

        const {
            fixedDateStr, dateKey, closeTimeStr,
            rawSubject, cleanSubKey,
            doctorName, college, targetGroups, hall, year
        } = meta;

        const sessionRef = doc(db, "active_sessions", uid);

        // ── الحاضرون ──────────────────────────────────────────────────────
        attended.forEach(p => {
            const recID = `${p.id}_${dateKey}_${cleanSubKey}`;
            const finalGroup = (p.group && p.group !== "General") ? p.group : targetGroups[0];
            const notes = p.isUnruly
                ? "غير منضبط - مشاغب"
                : p.isUniformViolation
                    ? "مخالفة زي"
                    : "منضبط";

            const payload = {
                id: p.id,
                name: p.name,
                subject: rawSubject,
                college,
                hall,
                group: finalGroup,
                date: fixedDateStr,
                time_str: p.time_str || closeTimeStr,
                segment_count: p.segment_count || 1,
                notes,
                timestamp: serverTimestamp(),
                status: "ATTENDED",
                doctorUID: uid,
                doctorName,
                feedback_status: "pending",
                feedback_rating: 0,
                isUnruly: p.isUnruly || false,
                isUniformViolation: p.isUniformViolation || false
            };

            // حفظ في كلا المجموعتين
            addOp(b => b.set(doc(db, `attendance_${college}`, recID), payload));
            addOp(b => b.set(doc(db, "attendance", recID), payload));

            // إحصائيات الطالب
            addOp(b => b.set(doc(db, "student_stats", p.uid || p.id), {
                group: finalGroup,
                studentID: p.id,
                last_updated: serverTimestamp(),
                attended: { [cleanSubKey]: increment(1) },
                ...(p.isUnruly && { cumulative_unruly: increment(1) }),
                ...(p.isUniformViolation && { cumulative_uniform: increment(1) })
            }, { merge: true }));

            // حذف من قائمة المشاركين الحية
            addOp(b => b.delete(doc(db, "active_sessions", uid, "participants", p.id)));
        });

        // ── الغائبون ──────────────────────────────────────────────────────
        absent.forEach(student => {
            const absentID = `${student.id}_${dateKey}_${cleanSubKey}_ABSENT`;
            addOp(b => b.set(doc(db, `attendance_${college}`, absentID), {
                id: student.id,
                name: student.name,
                subject: rawSubject,
                college,
                hall,
                group: student.group || targetGroups[0] || "General",
                date: fixedDateStr,
                time_str: "--:--",
                notes: "غائب",
                timestamp: serverTimestamp(),
                status: "ABSENT",
                doctorUID: uid,
                doctorName,
                feedback_status: "none",
                isUnruly: false,
                isUniformViolation: false
            }));
        });

        // ── إحصائيات المجموعات ────────────────────────────────────────────
        targetGroups.forEach(groupName => {
            if (!groupName) return;

            addOp(b => b.set(doc(db, "groups_stats", groupName), {
                [`subjects.${cleanSubKey}.total_sessions_held`]: increment(1),
                last_updated: serverTimestamp()
            }, { merge: true }));

            const counterID = `${dateKey}_${cleanSubKey}_${groupName}`;
            addOp(b => b.set(doc(db, "course_counters", counterID), {
                subject: rawSubject,
                targetGroups: [groupName],
                date: fixedDateStr,
                timestamp: serverTimestamp(),
                doctorUID: uid,
                academic_year: year
            }));
        });

        // ── إغلاق الجلسة (آخر عملية دائماً) ─────────────────────────────
        addOp(b => b.update(sessionRef, { isActive: false, isDoorOpen: false }));

        flush(); // تفريغ أي عمليات متبقية
        return batches;
    }

    /**
     * تنفيذ Batch واحد مع Exponential Backoff
     * ✅ لا enableNetwork — السبب الجذري للخطأ
     */
    async function _commitWithRetry(batch, batchIdx, progressRef, maxRetries = 4) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await batch.commit();

                // تسجيل نجاح هذا الـ batch كنقطة استئناف
                await _retryOp(() => updateDoc(progressRef, {
                    lastSuccessfulBatch: batchIdx,
                    lastUpdate: serverTimestamp()
                }), `progress_${batchIdx}`);

                return; // نجح — خروج

            } catch (error) {
                console.warn(`⚠️ Batch ${batchIdx} — attempt ${attempt}/${maxRetries}:`, error.message);

                if (attempt === maxRetries) {
                    // تسجيل الفشل في Firestore للمراجعة
                    await updateDoc(progressRef, {
                        status: 'failed',
                        failedBatch: batchIdx,
                        error: error.message
                    }).catch(() => { });

                    throw new Error(
                        lang === 'ar'
                            ? `فشل الحفظ في الدفعة ${batchIdx + 1}. اضغط "إعادة المحاولة".`
                            : `Batch ${batchIdx + 1} failed. Tap Retry.`
                    );
                }

                // Exponential Backoff فقط — بدون لمس الشبكة
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            }
        }
    }

    /**
     * تنظيف أي مشاركين لم يُحذفوا في الـ batch
     */
    async function _cleanupRemainingParticipants(uid) {
        try {
            const remaining = await getDocs(
                collection(db, "active_sessions", uid, "participants")
            );
            if (remaining.empty) return;

            const batch = writeBatch(db);
            remaining.forEach(d => batch.delete(d.ref));
            await batch.commit();
            console.log(`🧹 Cleaned ${remaining.size} leftover participants.`);
        } catch (e) {
            console.warn("Cleanup warning:", e.message);
        }
    }

    /**
     * معالجة الأخطاء مع تصنيف ذكي
     */
    function _handleError(e, actionBtn, lang) {
        const t = (ar, en) => lang === 'ar' ? ar : en;

        if (e.code === 'permission-denied') {
            showToast(
                t("🚫 خطأ في الصلاحيات — راجع قواعد Firestore",
                    "🚫 Permission denied — check Firestore rules"),
                7000, "#ef4444"
            );
        } else if (!navigator.onLine) {
            showToast(
                t("📵 لا يوجد اتصال بالإنترنت. اتصل وأعد المحاولة.",
                    "📵 No internet connection. Reconnect and retry."),
                5000, "#f59e0b"
            );
        } else if (e.code === 'unavailable') {
            showToast(
                t("⚠️ Firestore غير متاح مؤقتاً. أعد المحاولة.",
                    "⚠️ Firestore temporarily unavailable. Retry."),
                5000, "#f59e0b"
            );
        } else {
            showToast(t("خطأ: ", "Error: ") + e.message, 4000, "#ef4444");
        }

        if (actionBtn) {
            actionBtn.innerHTML = t("⟳ إعادة المحاولة", "⟳ Retry");
            actionBtn.style.pointerEvents = 'auto';
            actionBtn.style.opacity = '1';
            actionBtn.disabled = false;
        }
    }

    /**
     * التحكم في حالة زر التأكيد
     */
    function _setButtonState(btn, state, lang, current, total) {
        if (!btn) return;
        const t = (ar, en) => lang === 'ar' ? ar : en;
        const states = {
            loading: {
                html: `<i class="fa-solid fa-circle-notch fa-spin"></i> ${t("جاري المعالجة...", "Processing...")}`,
                pointer: 'none',
                opacity: '0.7'
            },
            progress: {
                html: `<i class="fa-solid fa-circle-notch fa-spin"></i> ${current}/${total}`,
                pointer: 'none',
                opacity: '0.7'
            },
            idle: {
                html: t("تأكيد وحفظ ✅", "Confirm & Save ✅"),
                pointer: 'auto',
                opacity: '1'
            }
        };
        const s = states[state];
        if (!s) return;
        btn.innerHTML = s.html;
        btn.style.pointerEvents = s.pointer;
        btn.style.opacity = s.opacity;
        btn.disabled = s.pointer === 'none';
    }

};

// ════════════════════════════════════════════════════════
// 🚨 زر الحفظ الطارئ - نسخة احترافية مدمجة
// ════════════════════════════════════════════════════════
window.emergencyCloseSession = async function () {
    const lang = localStorage.getItem('sys_lang') || 'ar';
    const t = (ar, en) => lang === 'ar' ? ar : en;

    const user = window.auth?.currentUser;
    if (!user) {
        showToast(t("يجب تسجيل الدخول أولاً", "Please sign in first"), 3000, "#ef4444");
        return;
    }

    if (window._emergencyClosing) return;

    // طلب تأكيد قبل التنفيذ
    showModernConfirm(
        t("⚡ حفظ طوارئ نهائي", "⚡ Final Emergency Save"),
        t("سيتم الحفظ فوراً وتجاوز أي تعليق في النظام. هل أنت متأكد؟", "System will save immediately and bypass any lag. Proceed?"),
        _runEmergencyClose
    );

    async function _runEmergencyClose() {
        window._emergencyClosing = true;
        const btn = document.getElementById('btnEmergencyClose');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        }

        try {
            // استخدام db المعرف عالمياً في ملفك
            const sessionRef = doc(db, "active_sessions", user.uid);
            const sessionSnap = await getDoc(sessionRef);

            if (!sessionSnap.exists() || !sessionSnap.data().isActive) {
                showToast(t("⚠️ لا توجد جلسة نشطة", "⚠️ No active session"), 3000, "#f59e0b");
                return;
            }

            const settings = sessionSnap.data();
            const now = new Date();
            const d = String(now.getDate()).padStart(2, '0');
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const y = now.getFullYear();
            const fixedDateStr = `${d}/${m}/${y}`;
            const dateKey = `${d}-${m}-${y}`;
            const closeTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            const rawSubject = settings.allowedSubject || "General";
            const cleanSubKey = rawSubject.trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '');
            const college = settings.college || "NURS";
            const targetGroups = settings.targetGroups?.length ? settings.targetGroups : ["General"];
            const hall = settings.hall || "";
            const doctorName = settings.doctorName || "Doctor";

            // جلب المشاركين
            const partsSnap = await getDocs(collection(db, "active_sessions", user.uid, "participants"));
            const attended = partsSnap.docs
                .map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
                .filter(p => p.status === 'active' || p.status === 'on_break');

            // جلب الغائبين
            let absentStudents = [];
            if (settings.enrollmentDocId) {
                try {
                    const enrollSnap = await getDoc(doc(db, "subject_enrollments", settings.enrollmentDocId));
                    if (enrollSnap.exists()) {
                        const attendedIds = new Set(attended.map(p => p.id));
                        absentStudents = (enrollSnap.data().students || []).filter(s => !attendedIds.has(s.id));
                    }
                } catch (e) { console.log("Absentees fetch skipped"); }
            }

            const batch = writeBatch(db);

            // 1. حفظ الحاضرين
            attended.forEach(p => {
                const recID = `${p.id}_${dateKey}_${cleanSubKey}`;
                const payload = {
                    id: p.id, name: p.name, subject: rawSubject, college, hall,
                    group: p.group || targetGroups[0], date: fixedDateStr,
                    time_str: p.time_str || closeTimeStr, segment_count: p.segment_count || 1,
                    notes: p.isUnruly ? "غير منضبط" : (p.isUniformViolation ? "مخالفة زي" : "منضبط"),
                    timestamp: serverTimestamp(), status: "ATTENDED",
                    doctorUID: user.uid, doctorName, feedback_status: "pending", feedback_rating: 0
                };
                batch.set(doc(db, `attendance_${college}`, recID), payload);
                batch.set(doc(db, "attendance", recID), payload);
                batch.delete(p.ref);
            });

            // 2. حفظ الغائبين
            absentStudents.forEach(student => {
                const absentID = `${student.id}_${dateKey}_${cleanSubKey}_ABSENT`;
                batch.set(doc(db, `attendance_${college}`, absentID), {
                    id: student.id, name: student.name, subject: rawSubject,
                    college, hall, group: student.group || targetGroups[0],
                    date: fixedDateStr, time_str: "--:--", notes: "غائب",
                    timestamp: serverTimestamp(), status: "ABSENT",
                    doctorUID: user.uid, doctorName
                });
            });

            // 3. إغلاق الجلسة
            batch.update(sessionRef, { isActive: false, isDoorOpen: false });

            await batch.commit();
            showToast(`✅ ${t('تم الحفظ الطارئ', 'Emergency Save Done')}`, 4000, "#10b981");
            setTimeout(() => location.reload(), 1500);

        } catch (e) {
            console.error(e);
            showToast("❌ Error: " + e.message, 5000, "#ef4444");
        } finally {
            window._emergencyClosing = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🚨 طوارئ';
            }
        }
    }
};

window.performSessionPause = async function () {
    const user = window.auth?.currentUser;
    if (!user) return;

    const btn = document.querySelector('#sessionActionModal .btn-main');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التجميد...';

    try {
        await updateDoc(doc(db, "active_sessions", user.uid), {
            isDoorOpen: false,
            sessionCode: "PAUSED"
        });

        const partsRef = collection(db, "active_sessions", user.uid, "participants");
        const q = query(partsRef, where("status", "==", "active"));
        const snapshot = await getDocs(q);

        const batch = writeBatch(db);

        snapshot.forEach(docSnap => {
            const currentData = docSnap.data();

            let currentCount = currentData.segment_count;
            if (!currentCount || isNaN(currentCount)) {
                currentCount = 1;
            }

            const newCount = currentCount + 1;

            batch.update(docSnap.ref, {
                status: "on_break",
                needs_reconfirmation: true,
                segment_count: newCount
            });
        });

        await batch.commit();

        showToast("☕ تم تفعيل وضع الاستراحة (الجولة التالية)", 3000, "#f59e0b");
        document.getElementById('sessionActionModal').style.display = 'none';

    } catch (e) {
        console.error(e);
        showToast(" ", 3000, "#ef4444");
    } finally {
        if (btn) btn.innerHTML = '(Break)';
    }
};

window.triggerSessionEndOptions = function () {
    if (typeof playClick === 'function') playClick();
    const modal = document.getElementById('sessionActionModal');
    if (modal) modal.style.display = 'flex';
};


window.listenToSessionState = function () {
    const user = window.auth?.currentUser;

    if (!user) {
        console.log("⚠️ No user found, skipping session listener.");
        return;
    }

    const globalSettingsRef = doc(db, "settings", "control_panel");
    if (window.unsubscribeGlobalSettings) {
        window.unsubscribeGlobalSettings();
        window.unsubscribeGlobalSettings = null;
    }
    window.unsubscribeGlobalSettings = onSnapshot(globalSettingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            if (data.isQuickMode && data.quickModeFlags) {
                sessionStorage.setItem('is_quick_mode_active', 'true');
                sessionStorage.setItem('qm_disable_gps', data.quickModeFlags.disableGPS);
                sessionStorage.setItem('qm_disable_qr', data.quickModeFlags.disableQR);

                if (typeof window.applyQuickModeVisuals === 'function') {
                    window.applyQuickModeVisuals();
                }
                if (typeof window.handleQuickModeUI === 'function') {
                    window.handleQuickModeUI(true);
                }

            } else {
                sessionStorage.setItem('is_quick_mode_active', 'false');

                if (typeof window.removeQuickModeVisuals === 'function') {
                    window.removeQuickModeVisuals();
                }
                if (typeof window.handleQuickModeUI === 'function') {
                    window.handleQuickModeUI(false);
                }
            }
        }
    }, (error) => {
        console.warn("Global Settings Listener Warning:", error.message);
    });
    const doctorSessionRef = doc(db, "active_sessions", user.uid);

    if (window.unsubscribeSessionListener) {
        window.unsubscribeSessionListener();
        window.unsubscribeSessionListener = null;
    }

    window.unsubscribeSessionListener = onSnapshot(doctorSessionRef,
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const isActive = data.isActive === true;

                if (isActive) {
                    if (typeof updateSessionButtonUI === 'function') updateSessionButtonUI(true);
                    if (typeof handleSessionTimer === 'function') handleSessionTimer(true, data.startTime, data.duration);

                    if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Professor";
                    if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "";
                    if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || ""}`;
                    if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;
                    if (document.getElementById('liveSessionCodeDisplay')) document.getElementById('liveSessionCodeDisplay').innerText = data.sessionCode || "------";

                    const avatarLink = document.getElementById('liveDocAvatar');
                    if (avatarLink && data.doctorAvatar) {
                        avatarLink.innerHTML = `<i class="fa-solid ${data.doctorAvatar}"></i>`;
                    }

                } else {
                    if (typeof updateSessionButtonUI === 'function') updateSessionButtonUI(false);
                    if (typeof handleSessionTimer === 'function') handleSessionTimer(false, null, 0);
                }
            } else {
                if (typeof updateSessionButtonUI === 'function') updateSessionButtonUI(false);
                if (typeof handleSessionTimer === 'function') handleSessionTimer(false, null, 0);
            }
        },
        (error) => {
            console.error("Session Listener Error:", error);

            if (error.code === 'permission-denied') {
                console.log("🔄 Permission sync issue. Retrying in 2s...");
                setTimeout(() => {
                    if (auth.currentUser) window.listenToSessionState();
                }, 2000);
            }
        }
    );
};


function updateSessionButtonUI(isOpen) {
    const btn = document.getElementById('btnToggleSession');
    const icon = document.getElementById('sessionIcon');
    const txt = document.getElementById('sessionText');

    const lang = localStorage.getItem('sys_lang') || 'en';

    if (!btn) return;

    btn.style.display = 'flex';

    if (isOpen) {
        btn.classList.add('session-open');
        btn.style.background = "#dcfce7";
        btn.style.color = "#166534";
        btn.style.border = "2px solid #22c55e";

        if (icon) icon.className = "fa-solid fa-tower-broadcast fa-fade";

        if (txt) {
            txt.setAttribute('data-i18n', 'session_active_btn');
            txt.innerText = (lang === 'ar') ? "جلستك نشطة" : "Session Active";
        }

    } else {
        btn.classList.remove('session-open');
        btn.style.background = "#f1f5f9";
        btn.style.color = "#334155";
        btn.style.border = "2px solid #cbd5e1";

        if (icon) icon.className = "fa-solid fa-play";

        if (txt) {
            txt.setAttribute('data-i18n', 'start_new_session_btn');
            txt.innerText = (lang === 'ar') ? "بدء محاضرة جديدة" : "Start New Session";
        }
    }

    window.lastSessionState = isOpen;
}


window.handleSessionTimer = function (isActive, startTime, duration) {
    const btn = document.getElementById('btnToggleSession');
    const icon = document.getElementById('sessionIcon');
    const txt = document.getElementById('sessionText');
    const floatTimer = document.getElementById('studentFloatingTimer');
    const floatText = document.getElementById('floatingTimeText');
    const doorStatus = document.getElementById('doorStatusText');

    const isAdmin = !!sessionStorage.getItem("secure_admin_session_token_v99");

    if (sessionInterval) clearInterval(sessionInterval);

    if (!isActive) {
        if (isAdmin && btn) {
            const lang = localStorage.getItem('sys_lang') || 'en';

            btn.classList.remove('session-open');
            btn.style.background = "#f1f5f9";
            btn.style.color = "#334155";
            btn.style.border = "2px solid #cbd5e1";

            if (txt) {
                txt.setAttribute('data-i18n', 'start_new_session_btn');
                txt.innerText = (lang === 'ar') ? "بدء محاضرة جديدة" : "Start New Session";
            }

            if (icon) icon.className = "fa-solid fa-play";
        }
        if (floatTimer) floatTimer.style.display = 'none';
        return;
    }

    let startMs = 0;
    if (startTime && typeof startTime.toMillis === 'function') {
        startMs = startTime.toMillis();
    } else {
        startMs = startTime || (Date.now() + (window.globalTimeOffset || 0));
    }

    const updateTick = () => {
        const currentServerTime = Date.now() + (window.globalTimeOffset || 0);

        const elapsedSeconds = Math.floor((currentServerTime - startMs) / 1000);

        let remaining = duration - elapsedSeconds;
        if (remaining > duration) remaining = duration;


        if (isAdmin) {
            if (doorStatus) {
                if (duration == -1) {
                    doorStatus.innerHTML = '<i class="fa-solid fa-door-open"></i> OPEN (∞)';
                    doorStatus.style.color = "#10b981";
                } else if (remaining > 0) {
                    doorStatus.innerHTML = `<i class="fa-solid fa-hourglass-half fa-spin"></i> ${remaining}s`;
                    doorStatus.style.color = "#f59e0b";
                } else {
                    clearInterval(sessionInterval);
                    const user = window.auth?.currentUser;

                    updateDoc(doc(db, "active_sessions", user.uid), {
                        isDoorOpen: false,
                        sessionCode: "EXPIRED"
                    }).then(() => {
                        doorStatus.innerHTML = '<i class="fa-solid fa-door-closed"></i> CLOSED';
                        doorStatus.style.color = "#ef4444";
                        showToast("⏰ انتهى وقت الدخول وقُفل الباب", 4000, "#ef4444");
                    }).catch(err => console.error("Error closing door:", err));
                }
            }
        }

        else {
            if (floatTimer) {
                if (duration == -1) {
                    floatTimer.style.display = 'flex';
                    if (floatText) floatText.innerText = "OPEN";
                } else if (remaining > 0) {
                    floatTimer.style.display = 'flex';
                    if (floatText) floatText.innerText = remaining + "s";

                    if (remaining <= 10) floatTimer.classList.add('urgent');
                    else floatTimer.classList.remove('urgent');

                } else {
                    clearInterval(sessionInterval);
                    floatTimer.style.display = 'none';

                    const currentScreen = document.querySelector('.section.active')?.id;

                    if (currentScreen === 'screenDataEntry' && !window.isJoiningProcessActive) {

                        if (typeof window.resetApplicationState === 'function') {
                            window.resetApplicationState();
                        }

                        switchScreen('screenWelcome');
                        const modal = document.getElementById('systemTimeoutModal');
                        if (modal) modal.style.display = 'flex';
                    }
                }
            }
        }
    };

    updateTick();
    sessionInterval = setInterval(updateTick, 1000);
};
window.closeDoorImmediately = async function () {
    const user = window.auth?.currentUser;
    if (!user) return;

    const lang = localStorage.getItem('sys_lang') || 'en';
    const dict = (typeof i18n !== 'undefined' && i18n[lang]) ? i18n[lang] : {};
    const t = (key, defaultText) => dict[key] || defaultText;

    const btn = document.getElementById('btnCloseDoor');
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('closing_door_loading', 'Closing the Door...')}`;
        btn.style.pointerEvents = 'none';
    }

    try {
        const sessionRef = doc(db, "active_sessions", user.uid);

        await updateDoc(sessionRef, {
            isDoorOpen: false,
            sessionCode: "EXPIRED",
            duration: 0
        });

        document.getElementById('doorDurationModal').style.display = 'none';

        showToast(`🔒 ${t('close_door_success_toast', 'Door closed successfully')}`, 3000, "#10b981");

    } catch (e) {
        console.error("Error Closing Door:", e);
        showToast(`❌ ${t('close_door_error_toast', 'Error closing door')}`, 3000, "#ef4444");
        if (btn) {
            btn.innerHTML = `⛔ ${t('close_door_btn', 'Close the Door')}`;
            btn.style.pointerEvents = 'auto';
        }
    }
};
window.openDoorActionModal = function () {
    const isAdmin = sessionStorage.getItem("secure_admin_session_token_v99");
    if (!isAdmin) return;

    const modal = document.getElementById('doorDurationModal');
    if (!modal) return;

    const lang = localStorage.getItem('sys_lang') || 'ar';
    const dict = (typeof i18n !== 'undefined' && i18n[lang]) ? i18n[lang] : {};
    const t = (key, defaultText) => dict[key] || defaultText;

    const contentBox = modal.querySelector('.modal-box') || modal.firstElementChild;

    const modernStyles = `
        <style>
            .modern-door-container { font-family: inherit; text-align: center; }
            
            /* تنسيق شبكة الوقت الجديد (4 أعمدة) */
            .time-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
            
            .btn-time-opt {
                padding: 10px 2px; background: #fff; color: #334155; 
                border: 1px solid #cbd5e1; border-radius: 10px; font-weight: 700; cursor: pointer;
                transition: all 0.2s ease; font-size: 13px;
                box-shadow: 0 2px 0 rgba(0,0,0,0.05);
            }
            .btn-time-opt:hover { transform: translateY(-2px); border-color: #0ea5e9; color: #0ea5e9; background: #f0f9ff; }
            .btn-time-opt:active { transform: translateY(0); box-shadow: none; }

            /* زر الوقت المفتوح المميز */
            .btn-infinity {
                width: 100%; margin-top: 5px; margin-bottom: 20px;
                background: #ecfdf5; color: #059669; border: 1px dashed #6ee7b7;
                padding: 8px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 12px;
            }
            .btn-infinity:hover { background: #d1fae5; }

            /* التحكم في العدد */
            .counter-wrapper {
                display: flex; align-items: center; justify-content: center; gap: 10px;
                background: #f8fafc; padding: 10px; border-radius: 16px; margin-bottom: 15px;
                border: 1px solid #e2e8f0;
            }
            .btn-control {
                width: 40px; height: 40px; border-radius: 10px; border: none; cursor: pointer;
                font-size: 18px; display: flex; align-items: center; justify-content: center;
                transition: 0.2s; box-shadow: 0 3px 0 rgba(0,0,0,0.05);
            }
            .btn-minus { background: #fff; color: #ef4444; border: 1px solid #fee2e2; }
            .btn-plus { background: #fff; color: #10b981; border: 1px solid #d1fae5; }
            .btn-control:active { transform: translateY(2px); box-shadow: none; }
            
            #doorMaxLimitInput {
                width: 80px; font-size: 26px; font-weight: 800; text-align: center;
                background: transparent; border: none; color: #0f172a; outline: none;
            }
            input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            
            .quick-chips { display: flex; gap: 6px; justify-content: center; margin-bottom: 25px; flex-wrap: wrap; }
            .chip {
                padding: 5px 10px; border-radius: 15px; font-size: 11px; font-weight: bold; cursor: pointer;
                transition: 0.2s; border: 1px solid transparent;
            }
            .chip-blue { background: #e0f2fe; color: #0284c7; }
            .chip-purple { background: #f3e8ff; color: #7e22ce; }
            .chip-gray { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
            .chip:hover { filter: brightness(0.95); transform: translateY(-1px); }

            .btn-cancel-modern {
                width: 100%; padding: 12px; background: #fff; border: 1px solid #cbd5e1;
                border-radius: 12px; color: #64748b; font-weight: bold; cursor: pointer;
                transition: 0.2s;
            }
            .btn-cancel-modern:hover { background: #f1f5f9; color: #334155; }
            
            .section-label {
                display:block; text-align:${lang === 'ar' ? 'right' : 'left'}; 
                font-size:13px; font-weight:700; color:#334155; margin-bottom:8px;
            }
                .btn-close-door {
                width: 100%; 
                margin-top: 5px;
                margin-bottom: 20px;
                background: #fef2f2; 
                color: #b91c1c; 
                border: 1px dashed #fca5a5;
                padding: 10px; 
                border-radius: 10px; 
                font-weight: bold; 
                cursor: pointer; 
                font-size: 13px;
                transition: 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }
            .btn-close-door:hover { 
                background: #fee2e2; 
                border-color: #ef4444; 
                transform: translateY(-1px);
            }
        </style>
    `;

    const lblSec = t('time_sec', 'ث');
    const lblMin = t('time_min', 'د');
    const lblStd = t('chip_students', 'طلاب');

    contentBox.innerHTML = `
        ${modernStyles}
        <div class="modern-door-container">
            <div style="margin-bottom: 20px;">
                <div style="width: 45px; height: 45px; background: #e0f2fe; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                    <i class="fa-solid fa-door-open" style="font-size: 22px; color: #0284c7;"></i>
                </div>
                <h3 style="margin: 0; color: #0f172a; font-size: 18px;">${t('door_settings_title', 'إعدادات فتح البوابة')}</h3>
            </div>

            <!-- 1. القسم الأول: العدد (تم النقل للأعلى) -->
            <label class="section-label">
                1. ${t('door_limit_label', '👥 الحد الأقصى للطلاب (اختياري):')}
            </label>
            
            <div class="counter-wrapper">
                <button class="btn-control btn-minus" onclick="adjustDoorLimit(-1)"><i class="fa-solid fa-minus"></i></button>
                <input type="number" id="doorMaxLimitInput" placeholder="∞" value="">
                <button class="btn-control btn-plus" onclick="adjustDoorLimit(1)"><i class="fa-solid fa-plus"></i></button>
            </div>

            <div class="quick-chips">
                <div class="chip chip-blue" onclick="adjustDoorLimit(5)">+5 ${lblStd}</div>
                <div class="chip chip-blue" onclick="adjustDoorLimit(10)">+10 ${lblStd}</div>
                <div class="chip chip-purple" onclick="adjustDoorLimit(50)">+50 ${lblStd}</div>
                <div class="chip chip-gray" onclick="resetDoorLimit()">${t('chip_no_limit', 'بلا حد (∞)')}</div>
            </div>

            <!-- 2. القسم الثاني: المدة (تم النقل للأسفل) -->
            <label class="section-label">
                2. ${t('door_duration_label', '⏱️ حدد مدة فتح الكود:')}
            </label>
            
            <div class="time-grid">
    <button onclick="confirmOpenDoor(15)" class="btn-time-opt">15 ${lblSec}</button>
    <button onclick="confirmOpenDoor(20)" class="btn-time-opt">20 ${lblSec}</button>
    <button onclick="confirmOpenDoor(25)" class="btn-time-opt" style="background:#fef2f2; color:#b91c1c; border-color:#fca5a5;">25 ${lblSec} ⚠️</button>
    <button onclick="confirmOpenDoor(30)" class="btn-time-opt" style="background:#fef2f2; color:#b91c1c; border-color:#fca5a5;">30 ${lblSec} ⚠️</button>
</div>
            
            <!-- زر الوقت المفتوح -->
            <button onclick="confirmOpenDoor(-1)" class="btn-infinity">
                ${t('time_inf', '∞ وقت مفتوح (بدون عداد)')}
            </button>

             <button id="btnCloseDoor" onclick="closeDoorImmediately()" class="btn-close-door">
                ⛔ (Close The Door)
            </button>

            <!-- زر الإلغاء -->
            <button onclick="document.getElementById('doorDurationModal').style.display='none'" class="btn-cancel-modern">
                ${t('cancel_cmd', 'إلغاء الأمر')}
            </button>
        </div>
    `;

    modal.style.display = 'flex';
};

window.confirmOpenDoor = async function (seconds) {
    const user = window.auth?.currentUser;
    if (!user) return;

    const maxInput = document.getElementById('doorMaxLimitInput');
    let maxStudentsVal = 9999;

    if (maxInput && maxInput.value.trim() !== "") {
        maxStudentsVal = parseInt(maxInput.value);
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now(); 

    const durationMs = seconds === -1 ? -1 : (seconds * 1000);
    const expiresAt = seconds === -1 ? -1 : (now + durationMs);

    try {
        const sessionRef = doc(db, "active_sessions", user.uid);

        const currentSubject = document.getElementById('liveSubjectTag')?.innerText || "Subject";
        const currentHall = document.getElementById('liveHallTag')?.innerText || "Hall";
        const docName = document.getElementById('liveDocName')?.innerText || "Doctor";

        await updateDoc(sessionRef, {
            isDoorOpen: true,
            sessionCode: newCode,
            startTime: serverTimestamp(),
            duration: seconds,
            maxStudents: maxStudentsVal,
            codeOpenedAt: now,
            codeClosedAt: expiresAt
        });

        const codeLogRef = doc(db, "issued_codes_logs", newCode);
        await setDoc(codeLogRef, {
            code: newCode,
            doctorId: user.uid,
            doctorName: docName,
            subject: currentSubject,
            hall: currentHall,
            openedAt: now,      
            expiresAt: expiresAt, 
            isInfinite: seconds === -1,
            timestamp: serverTimestamp()
        });

        if (document.getElementById('doorDurationModal'))
            document.getElementById('doorDurationModal').style.display = 'none';

        if (document.getElementById('liveSessionCodeDisplay'))
            document.getElementById('liveSessionCodeDisplay').innerText = newCode;

        if (document.getElementById('doorStatusText'))
            document.getElementById('doorStatusText').innerHTML = '<i class="fa-solid fa-door-open fa-fade"></i> OPEN';

        let limitMsg = (maxStudentsVal === 9999) ? "عدد مفتوح" : `حد أقصى: ${maxStudentsVal}`;
        let timeMsg = seconds === -1 ? "وقت مفتوح" : `${seconds} ثانية`;
        showToast(`🔓 تم فتح البوابة بالكود [${newCode}] لمدة ${timeMsg}`, 4000, "#10b981");

        console.log(`✅ Code ${newCode} registered for offline verification.`);

    } catch (e) {
        console.error("Critical Door Open Error:", e);
        showToast("❌ خطأ في فتح البوابة.. تأكد من الاتصال", 3000, "#ef4444");
    }
};


window.startLiveSnapshotListener = function () {
    const user = window.auth?.currentUser;
    if (!user) {
        console.log("⏳ Waiting for Auth to initialize...");
        setTimeout(window.startLiveSnapshotListener, 500);
        return;
    }

    if (window.studentCountInterval) clearInterval(window.studentCountInterval);

    const grid = document.getElementById('liveStudentsGrid');
    if (grid) grid.innerHTML = '';

    const countEl = document.getElementById('livePresentCount');
    const extraEl = document.getElementById('liveExtraCount');

    const capacityLabel = extraEl?.parentElement?.querySelector('.stat-label') || document.querySelector("label[for='liveExtraCount']");
    if (capacityLabel) capacityLabel.innerText = "CAPACITY STATUS";

    const adminToken = sessionStorage.getItem("secure_admin_session_token_v99");
    const isDean = (adminToken === "SUPER_ADMIN_ACTIVE");
    const isDoctor = (adminToken === "ADMIN_ACTIVE");

    const adminFab = document.getElementById('adminFabControls');
    if (adminFab) {
        if (isDoctor || isDean) {
            adminFab.style.setProperty('display', 'flex', 'important');
        } else {
            adminFab.style.setProperty('display', 'none', 'important');
        }
    }

    if (grid) {
        if (isDoctor || isDean) {
            grid.style.setProperty('display', 'grid', 'important');
            grid.style.setProperty('grid-template-columns', '1fr', 'important');
            grid.style.setProperty('gap', '15px', 'important');
        } else {
            grid.style.removeProperty('grid-template-columns');
            grid.style.display = 'block';
        }
    }

    let targetRoomUID;

    if (isDean) {
        targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    } else if (isDoctor) {
        const storedTarget = sessionStorage.getItem('TARGET_DOCTOR_UID');
        targetRoomUID = (storedTarget && storedTarget !== user.uid) ? storedTarget : user.uid;
    } else {
        targetRoomUID = sessionStorage.getItem('TARGET_DOCTOR_UID');
    }

    applyVipTheme(targetRoomUID);


    if (!targetRoomUID) {
        return;
    }

    if (isDoctor && user.uid === targetRoomUID) document.body.classList.add('admin-mode');
    else document.body.classList.remove('admin-mode');

    let maxLimit = 9999;
    let currentCount = 0;

    const updateCapacityUI = () => {
        if (!extraEl) return;

        const limit = parseInt(maxLimit);
        const count = parseInt(currentCount);

        if (limit >= 9999 || isNaN(limit)) {
            extraEl.innerHTML = `<span style="font-size:24px;">∞</span> <span style="font-size:11px; opacity:0.8; font-weight:normal;">OPEN</span>`;
            extraEl.style.color = "#3b82f6";
        } else {
            const remaining = limit - count;
            let remainingHtml = remaining;

            if (remaining < 0) {
                extraEl.style.color = "#ef4444";
                extraEl.style.textShadow = "0 0 15px rgba(239, 68, 68, 0.2)";
                remainingHtml = `<i class="fa-solid fa-triangle-exclamation" style="font-size:12px;"></i> ${remaining}`;
            } else {
                extraEl.style.color = "#10b981";
                extraEl.style.textShadow = "none";
            }

            extraEl.innerHTML = `
                <span style="font-weight:800; font-size:20px;">${remainingHtml}</span>
                <span style="font-size:12px; color:#94a3b8; font-weight:600;"> / ${limit}</span>
            `;
        }
    };


    const sessionRef = doc(db, "active_sessions", targetRoomUID);

    const updateSessionHeaderUI = (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            const myToken = sessionStorage.getItem("secure_admin_session_token_v99");
            const iAmAdmin = (myToken === "ADMIN_ACTIVE" || myToken === "SUPER_ADMIN_ACTIVE");

            if (document.getElementById('liveDocName')) document.getElementById('liveDocName').innerText = data.doctorName || "Professor";
            if (document.getElementById('liveSubjectTag')) document.getElementById('liveSubjectTag').innerText = data.allowedSubject || "Subject";
            if (document.getElementById('liveHallTag')) document.getElementById('liveHallTag').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${data.hall || "Hall"}`;
            if (document.getElementById('liveGroupTag')) document.getElementById('liveGroupTag').innerText = `GROUPS: ${(data.targetGroups || []).join(', ')}`;

            const avatarLink = document.getElementById('liveDocAvatar');
            if (avatarLink) {
                avatarLink.innerHTML = `<i class="fa-solid ${data.doctorAvatar || 'fa-user-doctor'}"></i>`;

                if (iAmAdmin) {
                    avatarLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    avatarLink.style.cursor = "pointer";
                    avatarLink.style.pointerEvents = "auto";
                } else {
                    avatarLink.onclick = null;
                    avatarLink.style.cursor = "default";
                    avatarLink.style.pointerEvents = "none";
                }
            }

            const nameLink = document.getElementById('liveDocName');
            if (nameLink) {
                if (iAmAdmin) {
                    nameLink.onclick = () => openPublicProfile(targetRoomUID, true);
                    nameLink.style.cursor = "pointer";
                    nameLink.style.pointerEvents = "auto";
                } else {
                    nameLink.onclick = null;
                    nameLink.style.cursor = "default";
                    nameLink.style.pointerEvents = "none";
                }
            }

            if (document.getElementById('liveSessionCodeDisplay')) {
                document.getElementById('liveSessionCodeDisplay').innerText = (isDoctor || isDean) ? (data.sessionCode || "------") : "••••••";
            }

            const doorStatus = document.getElementById('doorStatusText');
            if (doorStatus) {
                if (data.sessionCode === "PAUSED") {
                    doorStatus.innerHTML = '<i class="fa-solid fa-mug-hot fa-bounce"></i> PAUSED';
                    doorStatus.style.color = "#f59e0b";
                } else {
                    doorStatus.innerHTML = data.isDoorOpen ? '<i class="fa-solid fa-door-open fa-fade"></i> OPEN' : '<i class="fa-solid fa-door-closed"></i> CLOSED';
                    doorStatus.style.color = data.isDoorOpen ? "#10b981" : "#ef4444";
                }
            }

            if (data.maxStudents !== undefined && data.maxStudents !== null && data.maxStudents !== "") {
                maxLimit = parseInt(data.maxStudents);
            } else {
                maxLimit = 9999;
            }

            if (!isDoctor && !isDean) {
                const centralCount = data.active_count || 0;
                currentCount = centralCount;
                if (countEl) countEl.innerText = centralCount;
            }

            updateCapacityUI();

            if (!data.isActive && !isDoctor && !isDean) {
                showToast("🏁 انتهت المحاضرة", 4000, "#10b981");
                setTimeout(() => { goHome(); location.reload(); }, 1500);
            }
        }
    };

    getDoc(sessionRef).then(updateSessionHeaderUI).catch(e => console.log("Header Prefetch:", e));

    if (window.unsubscribeHeaderSession) window.unsubscribeHeaderSession();

    window.unsubscribeHeaderSession = onSnapshot(sessionRef, updateSessionHeaderUI);


    const participantsRef = collection(db, "active_sessions", targetRoomUID, "participants");
    let q;

    if (isDoctor || isDean) {
        q = query(participantsRef, orderBy("timestamp", "desc"));
    } else {
        q = query(participantsRef, where("uid", "==", user.uid));
    }

    if (window.unsubscribeLiveSnapshot) window.unsubscribeLiveSnapshot();

    const domCache = new Map();


    window.unsubscribeLiveSnapshot = onSnapshot(q, (snapshot) => {

        const activeDocs = snapshot.docs.filter(d => d.data().status === 'active');

        if (isDoctor || isDean) {
            currentCount = activeDocs.length;
            if (countEl) countEl.innerText = currentCount;
            updateCapacityUI();

            if (window.updateCounterTimeout) clearTimeout(window.updateCounterTimeout);
            window.updateCounterTimeout = setTimeout(() => {
                updateDoc(doc(db, "active_sessions", targetRoomUID), {
                    active_count: currentCount
                }).catch(err => console.log("Counter Sync Skip", err));
            }, 2000);
        } else {

            if (window.studentCountInterval) {
                clearInterval(window.studentCountInterval);
                window.studentCountInterval = null;
            }
        }

        if (grid) {
            const currentIds = new Set();
            let sortedDocs = [];
            snapshot.forEach(doc => sortedDocs.push(doc));

            if (isDoctor || isDean) {
                sortedDocs.sort((a, b) => {
                    const sA = a.data();
                    const sB = b.data();

                    const trapA = sA.trap_report || { is_device_match: true, in_range: true };
                    const trapB = sB.trap_report || { is_device_match: true, in_range: true };

                    const isRedA = (trapA.is_device_match === false) || (trapA.is_in_range === false);
                    const isRedB = (trapB.is_device_match === false) || (trapB.is_in_range === false);


                    if (isRedA && !isRedB) return -1;
                    if (!isRedA && isRedB) return 1;

                    return 0;
                });
            }

            sortedDocs.forEach((docSnap, index) => {
                const s = docSnap.data();
                currentIds.add(docSnap.id);

                if (s.status === 'expelled') {
                    if (domCache.has(docSnap.id)) {
                        domCache.get(docSnap.id).element.remove();
                        domCache.delete(docSnap.id);
                    }
                    return;
                }

                const isOnBreak = s.status === 'on_break';
                const isLeft = s.status === 'left';
                const opacityVal = (isLeft || isOnBreak) ? '0.5' : '1';
                const borderStyle = isOnBreak ? '2px dashed #f59e0b' : '1px solid #e2e8f0';
                const rawCount = s.segment_count;
                const segCount = (rawCount && !isNaN(rawCount)) ? parseInt(rawCount) : 1;

                let countBadge = '';
                if (segCount > 1) {
                    let badgeColor = isOnBreak ? '#64748b' : '#0ea5e9';
                    countBadge = `<div style="position: absolute; top: -10px; left: -10px; background: ${badgeColor}; color: white; font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 800; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #f8fafc; z-index: 100; box-shadow: 0 4px 6px rgba(0,0,0,0.15); animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">${segCount}</div>`;
                }

                const clickAction = "";

                let finalInnerHTML = '';
                let finalClassName = '';
                let finalCSSText = '';

                if (isDoctor || isDean) {
                    const trap = s.trap_report || { is_device_match: true, in_range: true, is_gps_success: true };
                    const deviceIcon = trap.is_device_match ? `<div title="جهاز أصلي" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-mobile-screen" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="جهاز مختلف" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; animation: shake 0.5s infinite;"><i class="fa-solid fa-mobile-screen-button" style="color:#dc2626; font-size:14px;"></i></div>`;
                    const rangeIcon = trap.is_in_range ? `<div title="داخل النطاق" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-dot" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="خارج النطاق" style="background:#fee2e2; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-location-crosshairs" style="color:#dc2626; font-size:14px;"></i></div>`;
                    const isGpsOk = (trap.gps_success !== undefined) ? trap.gps_success : trap.is_gps_success;
                    const gpsIcon = isGpsOk ? `<div title="GPS نشط" style="background:#dcfce7; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#16a34a; font-size:14px;"></i></div>` : `<div title="فشل GPS" style="background:#f1f5f9; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-satellite-dish" style="color:#94a3b8; font-size:14px;"></i></div>`;
                    const badgesHTML = `<div style="display:flex; justify-content:center; gap:8px; margin-top:6px; border-top:1px dashed #e2e8f0; padding-top:6px; width:100%;">${deviceIcon} ${rangeIcon} ${gpsIcon}</div>`;
                    const leaveIcon = isLeft ? 'fa-arrow-rotate-left' : 'fa-person-walking-arrow-right';

                    finalClassName = `live-st-card admin-view-card`;
                    const trapAlert = s.trap_report || {};
                    const hasDeviceIssue = trapAlert.is_device_match === false;
                    const hasRangeIssue = trapAlert.is_in_range === false;

                    const cardBg = (hasDeviceIssue && hasRangeIssue)
                        ? '#fff5f5'
                        : hasDeviceIssue
                            ? '#fff8f8'
                            : hasRangeIssue
                                ? '#fffbf0'
                                : '#ffffff';

                    const cardBorder = (hasDeviceIssue && hasRangeIssue)
                        ? '2px solid #ef4444'
                        : hasDeviceIssue
                            ? '2px solid #fca5a5'
                            : hasRangeIssue
                                ? '2px solid #fcd34d'
                                : borderStyle;

                    finalCSSText = `background: ${cardBg}; border-radius: 18px; border: ${cardBorder}; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 5px; box-shadow: 0 4px 10px rgba(206, 99, 38, 0.03); height: auto; min-height: 220px; width: 100%; position: relative; overflow: visible !important; opacity: ${opacityVal}; transition: all 0.3s ease;`;

                    finalInnerHTML = `
                            ${countBadge}
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <div ${clickAction} style="cursor:pointer; width:55px; height:55px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center; font-size:24px; color:#0ea5e9; border:2.5px solid ${s.isUnruly ? '#ef4444' : (s.isUniformViolation ? '#f97316' : '#e2e8f0')};">
                                    <i class="fa-solid ${s.avatarClass || 'fa-user'}"></i>
                                </div>
                                <div ${clickAction} class="st-name" style="cursor:pointer; font-size:12px; font-weight:800; color:#0f172a; margin-top:5px; text-decoration:none;">${s.name}</div>
                                <div class="st-id en-font" style="font-size:10px; color:#64748b; background:#f1f5f9; padding:1px 8px; border-radius:10px;">#${s.id}</div>
                                ${badgesHTML}
                            </div>
                            <div style="display:flex; justify-content:center; gap:30px; border-top:1px solid #f1f5f9; padding-top:12px;">
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUniformViolation', ${s.isUniformViolation})" class="mini-action-btn" style="background:${s.isUniformViolation ? '#f97316' : '#fff7ed'}; color:${s.isUniformViolation ? 'white' : '#ea580c'};"><i class="fa-solid fa-shirt"></i></button>
                                <button onclick="toggleStudentFlag('${docSnap.id}', 'isUnruly', ${s.isUnruly})" class="mini-action-btn" style="background:${s.isUnruly ? '#ef4444' : '#fef2f2'}; color:${s.isUnruly ? 'white' : '#ef4444'};"><i class="fa-solid fa-fire"></i></button>
                                <button onclick="toggleStudentStatus('${docSnap.id}', '${s.status}')" class="mini-action-btn" style="background:#f8fafc; color:#64748b;"><i class="fa-solid ${leaveIcon}"></i></button>
                                <button onclick="updateStudentStatus('${docSnap.id}', 'expelled')" class="mini-action-btn" style="background:#fee2e2; color:#b91c1c;"><i class="fa-solid fa-ban"></i></button>
                            </div>`;
                } else {
                    const isMe = (user.uid === s.uid);
                    let statusColor = isLeft ? "#94a3b8" : (s.isUnruly ? "#ef4444" : (s.isUniformViolation ? "#f97316" : "#10b981"));
                    let statusText = isLeft ? "مغادر" : (s.isUnruly ? "مشاغب" : (s.isUniformViolation ? "مخالف" : "حاضر"));
                    const meClass = isMe ? 'is-me-card' : '';

                    finalClassName = `live-st-card student-view-card ${meClass}`;
                    finalCSSText = `background:white; border-radius:15px; padding:20px; display:flex; flex-direction:column; align-items:center; opacity:${opacityVal}; transition:0.3s; width:100%; max-width: 320px; margin: 0 auto; border: ${borderStyle}; position: relative; overflow: visible !important;`;

                    finalInnerHTML = `
                        ${isMe ? '<div class="me-badge">أنت</div>' : ''}
                            ${countBadge}
                            <div ${clickAction} style="cursor:pointer; width:70px; height:70px; border-radius:50%; background:#f8fafc; border:3.5px solid ${statusColor}; display:flex; align-items:center; justify-content:center; font-size:30px; color:#0284c7; margin-bottom:10px; z-index:2;">
                                <i class="fa-solid ${s.avatarClass || 'fa-user-graduate'}"></i>
                            </div>
                            <div style="text-align:center;">
                                <div ${clickAction} class="st-name notranslate" translate="no" style="cursor:pointer; font-size:16px; font-weight:900; color:#1e293b; text-decoration:none; text-align: center; direction: auto;">
    ${s.name}
</div>
                                <div class="st-id en-font" style="font-size:12px; color:#64748b;">#${s.id}</div>
                            </div>
                            <div style="margin-top:12px; padding:4px 15px; border-radius:6px; font-size:11px; font-weight:800; border:1px solid ${statusColor}30; background:${statusColor}15; color:${statusColor};">
                                ${statusText}
                            </div>`;
                }
                const dataSignature = JSON.stringify({
                    st: s.status, ur: s.isUnruly, uv: s.isUniformViolation,
                    tr: s.trap_report, sg: segCount, nm: s.name, av: s.avatarClass
                });

                let cardElement;

                if (domCache.has(docSnap.id)) {
                    const cached = domCache.get(docSnap.id);
                    cardElement = cached.element;

                    if (cached.signature !== dataSignature) {
                        if (cardElement.innerHTML !== finalInnerHTML) cardElement.innerHTML = finalInnerHTML;
                        if (cardElement.className !== finalClassName) cardElement.className = finalClassName;
                        if (cardElement.style.cssText !== finalCSSText) cardElement.style.cssText = finalCSSText;

                        cached.signature = dataSignature;
                    }
                } else {
                    cardElement = document.createElement('div');
                    cardElement.id = `card-${docSnap.id}`;
                    cardElement.className = finalClassName;
                    cardElement.style.cssText = finalCSSText;
                    cardElement.innerHTML = finalInnerHTML;

                    domCache.set(docSnap.id, { element: cardElement, signature: dataSignature });
                }

                const currentChildAtIndex = grid.children[index];
                if (currentChildAtIndex !== cardElement) {
                    if (currentChildAtIndex) {
                        grid.insertBefore(cardElement, currentChildAtIndex);
                    } else {
                        grid.appendChild(cardElement);
                    }
                }
            });

            domCache.forEach((value, key) => {
                if (!currentIds.has(key)) {
                    value.element.remove();
                    domCache.delete(key);
                }
            });
        }
        if (!isDoctor && !isDean) {
            const existingNote = grid.querySelector('.wait-note');
            if (!existingNote && grid.children.length > 0) {
                const noteDiv = document.createElement('div');
                noteDiv.className = 'wait-note';
                noteDiv.style.cssText = `margin-top: 50px; text-align: center; color: #070707; font-size: 15px; width: 100%; font-family: 'Tajawal', sans-serif; opacity: 1;`;
                noteDiv.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-left:5px;"></i> سيتم إتاحة عرض قائمة الحضور الكاملة في التحديث القادم`;
                grid.appendChild(noteDiv);
            }
        }
    });

};


window.openDeanOversight = function () {
    if (typeof playClick === 'function') playClick();

    const modal = document.getElementById('deanOversightModal');
    const container = document.getElementById('oversightContainer');
    const loader = document.getElementById('oversightLoader');
    const lecturesCountEl = document.getElementById('totalActiveLectures');
    const studentsCountEl = document.getElementById('totalStudentsNow');

    if (!modal || !container) return;

    modal.style.display = 'flex';
    loader.style.display = 'block';
    container.innerHTML = '';

    if (window.deanRadarUnsubscribe) {
        window.deanRadarUnsubscribe();
        window.deanRadarUnsubscribe = null;
    }

    const q = query(collection(db, "active_sessions"), where("isActive", "==", true));

    window.deanRadarUnsubscribe = onSnapshot(q, async (snapshot) => {
        loader.style.display = 'none';
        container.innerHTML = '';

        let grandTotalStudents = 0;
        lecturesCountEl.innerText = snapshot.size;

        if (snapshot.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#94a3b8;">
                    <i class="fa-solid fa-wind" style="font-size:40px; margin-bottom:15px; opacity:0.3;"></i>
                    <p style="font-weight:700; font-size:14px;">لا توجد محاضرات جارية حالياً</p>
                </div>`;
            studentsCountEl.innerText = "0";
            return;
        }

        const enrichedSessions = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const session = docSnap.data();
            const doctorUID = docSnap.id;

            const partsRef = collection(db, "active_sessions", doctorUID, "participants");
            const partsSnap = await getDocs(partsRef);

            const activeCount = partsSnap.docs.filter(d => d.data().status === 'active').length;
            const unrulyCount = partsSnap.docs.filter(d => d.data().isUnruly === true).length;

            return { ...session, doctorUID, activeCount, unrulyCount };
        }));

        enrichedSessions.forEach(session => {
            grandTotalStudents += session.activeCount;

            const card = document.createElement('div');
            card.className = `lecture-card-premium ${session.unrulyCount > 0 ? 'has-danger' : ''}`;

            const docClick = `onclick="event.stopPropagation(); openPublicProfile('${session.doctorUID}', true)"`;

            card.innerHTML = `
                <!-- الصف العلوي: رقم القاعة والنبض الحي -->
                <div class="card-top-info">
                    <div class="hall-badge-premium">
                        <i class="fa-solid fa-building-columns"></i>
                        <span>HALL: ${session.hall}</span>
                    </div>
                    <div class="live-status-pill">
                        <span class="blink-dot"></span>
                        LIVE
                    </div>
                </div>

                <!-- محتوى المحاضرة: المادة والدكتور -->
                <div class="card-main-content">
                    <h3 class="lec-subject-title">${session.allowedSubject}</h3>
                    
                    <!-- 🔥 [تم التعديل] جعل اسم الدكتور وصورته قابلة للضغط -->
                    <div class="lec-doctor-name" ${docClick} style="cursor:pointer;" title="عرض بروفايل الدكتور">
                        <div class="doc-avatar-mini">
                            <!-- عرض أفاتار الدكتور الديناميكي -->
                            <i class="fa-solid ${session.doctorAvatar || 'fa-user-doctor'}"></i>
                        </div>
                        <span style="text-decoration: underline; text-decoration-style: dotted;">د. ${session.doctorName}</span>
                    </div>
                </div>

                <!-- الفوتر المعلوماتي: الحضور والنشاط -->
                <div class="card-data-footer">
                    <div class="data-chip">
                        <i class="fa-solid fa-users"></i>
                        <strong>${session.activeCount}</strong> حاضر
                    </div>
                    
                    <div class="status-indicator-box ${session.unrulyCount > 0 ? 'alert' : 'stable'}">
                        <i class="fa-solid ${session.unrulyCount > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
                        <span>${session.unrulyCount > 0 ? session.unrulyCount + ' مخالفات' : 'الوضع مستقر'}</span>
                    </div>
                </div>

                <!-- زر الدخول المباشر للمراقبة -->
                <button class="btn-enter-oversight-pro" 
                        onclick="enterRoomAsDean('${session.doctorUID}')">
                    دخول القاعة للمراقبة <i class="fa-solid fa-arrow-left"></i>
                </button>
            `;
            container.appendChild(card);
        });

        studentsCountEl.innerText = grandTotalStudents;

    }, (error) => {
        console.error("Dean Radar Error:", error);
        loader.style.display = 'none';
        showToast("⚠️ خطأ في الاتصال بالرادار اللحظي", 4000, "#ef4444");
    });
};


window.enterRoomAsDean = function (doctorUID) {
    if (typeof playClick === 'function') playClick();

    sessionStorage.setItem('TARGET_DOCTOR_UID', doctorUID);

    switchScreen('screenLiveSession');
    if (typeof startLiveSnapshotListener === 'function') startLiveSnapshotListener();

    document.getElementById('deanOversightModal').style.display = 'none';
};
document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'modalGroupInput') {
        let val = e.target.value;

        val = val.toUpperCase();

        val = val.replace(/\s/g, '');

        if (e.target.value !== val) {
            e.target.value = val;
        }
    }
});
