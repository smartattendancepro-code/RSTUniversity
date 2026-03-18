import { COLLEGE_SUBJECTS, COLLEGE_NAMES } from './config.js';
import {
    collection, doc,
    getDoc, getDocs, addDoc, setDoc, deleteDoc,
    query, where, serverTimestamp,
    onSnapshot   
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

let _activeListener = null;

function _injectStyles() {
    if (document.getElementById('enrollment-system-styles')) return;
    const style = document.createElement('style');
    style.id = 'enrollment-system-styles';
    style.innerHTML = `
        .en-loading { text-align:center; padding:30px 20px; color:#64748b; font-size:13px; font-weight:600; }
        .en-error { color:#ef4444; text-align:center; padding:30px; }
        .en-empty { text-align:center; padding:40px 20px; color:#94a3b8; }
        .en-year-header { background:linear-gradient(135deg,#7c3aed15,#6d28d915); border:1px solid #7c3aed30; border-radius:10px; padding:8px 14px; margin:16px 0 8px; font-size:12px; font-weight:800; color:#7c3aed; display:flex; align-items:center; gap:8px; }
        .en-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px 16px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:all 0.2s ease; }
        .en-card.enrolled { border-right:4px solid #7c3aed; border-color:#7c3aed30; box-shadow:0 2px 8px rgba(124,58,237,0.08); }
        .en-card-body { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
        .en-subject-title { font-size:14px; font-weight:800; color:#1e293b; margin-bottom:6px; line-height:1.4; }
        .en-badges { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .en-badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; border:1px solid; display:inline-flex; align-items:center; gap:4px; }
        .en-badge-success { background:#f3e8ff; color:#7c3aed; border-color:#e9d5ff; }
        .en-badge-info { background:#e0f2fe; color:#0284c7; border-color:#bae6fd; }
        .en-badge-warning { background:#fef9c3; color:#ca8a04; border-color:#fde68a; }
        .en-badge-neutral { background:#f8fafc; color:#94a3b8; border-color:#e2e8f0; font-weight:600; }
        .en-actions { display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
        .en-btn { padding:7px 12px; border-radius:10px; font-size:11px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; border:none; transition:transform 0.1s; }
        .en-btn:active { transform:scale(0.96); }
        .en-btn-primary { background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; box-shadow:0 2px 8px rgba(124,58,237,0.25); }
        .en-btn-update { background:linear-gradient(135deg,#f59e0b,#d97706); color:#fff; box-shadow:0 2px 8px rgba(245,158,11,0.25); }
        .en-btn-admin { background:linear-gradient(135deg,#0ea5e9,#0284c7); color:#fff; box-shadow:0 2px 8px rgba(2,132,199,0.3); }
        .en-btn-view { background:#f3e8ff; color:#7c3aed; border:1px solid #e9d5ff; }
        .en-btn-danger { background:#fee2e2; color:#dc2626; border:1px solid #fecaca; }
        .en-student-row { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .en-avatar { width:36px; height:36px; min-width:36px; background:linear-gradient(135deg,#7c3aed15,#6d28d915); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#7c3aed; font-size:13px; font-weight:800; border:1px solid #7c3aed20; }
        .en-stat-box { background:#f8fafc; border-radius:10px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; border:1px solid #e2e8f0; }

        /* ✅ مؤشر التحديث اللحظي */
        .en-live-badge {
            display:inline-flex; align-items:center; gap:5px;
            font-size:11px; font-weight:700; color:#10b981;
            background:#ecfdf5; border:1px solid #a7f3d0;
            border-radius:20px; padding:3px 10px;
        }
        .en-live-dot {
            width:7px; height:7px; border-radius:50%;
            background:#10b981; animation:en-pulse 1.4s infinite;
        }
        @keyframes en-pulse {
            0%,100% { opacity:1; transform:scale(1); }
            50% { opacity:0.4; transform:scale(0.7); }
        }
    `;
    document.head.appendChild(style);
}
_injectStyles();

let _adminCache = undefined;
let _adminCachePromise = null;

async function _isAdminDoctor(uid) {
    if (_adminCache !== undefined) return _adminCache;
    if (_adminCachePromise) return _adminCachePromise;

    _adminCachePromise = getDoc(doc(db, "faculty_members", uid))
        .then(snap => {
            _adminCache = snap.exists() && snap.data().isAdminDoctor === true;
            return _adminCache;
        })
        .catch(err => {
            console.error("Admin Check Error:", err);
            _adminCache = false;
            return false;
        })
        .finally(() => { _adminCachePromise = null; });

    return _adminCachePromise;
}

function _detachListener() {
    if (_activeListener) {
        _activeListener();
        _activeListener = null;
    }
}

window.openSubjectEnrollmentModal = async function () {
    const modal = document.getElementById('subjectEnrollmentModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const user = auth.currentUser;
    if (!user) {
        showToast?.("⚠️ يرجى تسجيل الدخول أولاً", 3000, "#f59e0b");
        return;
    }

    const collegeSelectorSection = document.getElementById('collegeSelectorSection');
    const enrollmentListContainer = document.getElementById('enrollmentListContainer');

    if (collegeSelectorSection) collegeSelectorSection.style.display = 'none';
    if (enrollmentListContainer) enrollmentListContainer.innerHTML = _loadingHTML("جاري التحقق من بياناتك...");

    try {
        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        if (!facSnap.exists()) {
            showToast?.("❌ لم يتم العثور على بيانات حسابك", 3000, "#ef4444");
            modal.style.display = 'none';
            return;
        }

        const { college, fullName = "" } = facSnap.data();

        if (!college) {
            if (collegeSelectorSection) collegeSelectorSection.style.display = 'block';
            if (enrollmentListContainer) enrollmentListContainer.innerHTML = '';
        } else {
            await _attachRealtimeListener(college, user.uid, fullName);
        }
    } catch (e) {
        console.error("openSubjectEnrollmentModal:", e);
        if (enrollmentListContainer) enrollmentListContainer.innerHTML = _errorHTML("خطأ في تحميل البيانات");
    }
};

window.closeSubjectEnrollmentModal = function () {
    const modal = document.getElementById('subjectEnrollmentModal');
    if (modal) modal.style.display = 'none';
    _detachListener();
};

window.closeEnrolledStudentsModal = function () {
    const modal = document.getElementById('enrolledStudentsViewModal');
    if (modal) modal.style.display = 'none';
    window._enrolledStudentsCache = null;
    window._enrolledSubjectName = null;
};

window.saveAndLoadCollege = async function () {
    const select = document.getElementById('enrollmentCollegeSelect');
    if (!select?.value) {
        showToast?.("⚠️ يرجى اختيار الكلية أولاً", 3000, "#f59e0b");
        return;
    }

    const college = select.value;
    const user = auth.currentUser;
    if (!user) return;

    const btn = document.getElementById('btnSaveCollege');
    const originalHTML = btn?.innerHTML ?? '';
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الحفظ...'; btn.disabled = true; }

    try {
        await setDoc(doc(db, "faculty_members", user.uid), { college }, { merge: true });
        const section = document.getElementById('collegeSelectorSection');
        if (section) section.style.display = 'none';

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const doctorName = facSnap.exists() ? (facSnap.data().fullName || "") : "";

        await _attachRealtimeListener(college, user.uid, doctorName);
        showToast?.("✅ تم حفظ الكلية بنجاح", 2000, "#10b981");
    } catch (e) {
        console.error("saveAndLoadCollege:", e);
        showToast?.("❌ حدث خطأ أثناء الحفظ", 3000, "#ef4444");
    } finally {
        if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
    }
};

async function _attachRealtimeListener(college, doctorUID, doctorName) {
    const container = document.getElementById('enrollmentListContainer');
    if (!container) return;

    const headerEl = document.getElementById('enrollmentCollegeTitle');
    if (headerEl) headerEl.innerText = COLLEGE_NAMES[college] || college;

    container.innerHTML = _loadingHTML("جاري تحميل المواد...");

    _detachListener();

    const isAdmin = await _isAdminDoctor(doctorUID);
    const enrollmentsRef = collection(db, "subject_enrollments");

    const queries = isAdmin
        ? [query(enrollmentsRef, where("college", "==", college))]
        : [
            query(enrollmentsRef, where("doctorUID", "==", doctorUID)),
            query(enrollmentsRef, where("sharedWithAll", "==", true), where("college", "==", college))
        ];

    const snapshots = new Map();
    let firstLoad = true;
    let listenerFailed = false;

    function _buildEnrolledMap() {
        const enrolledMap = {};
        if (isAdmin) {
            (snapshots.get(0) || []).forEach(d => {
                const data = d.data();
                const name = data.subjectName;
                if (!name) return;
                if (!enrolledMap[name] || data.doctorUID === doctorUID) {
                    enrolledMap[name] = {
                        docId: d.id,
                        studentCount: data.studentCount || 0,
                        isShared: data.sharedWithAll === true,
                        ownerUID: data.doctorUID || ""
                    };
                }
            });
        } else {
            (snapshots.get(0) || []).forEach(d => {
                const data = d.data();
                if (data.subjectName) {
                    enrolledMap[data.subjectName] = {
                        docId: d.id, studentCount: data.studentCount || 0,
                        isShared: false, ownerUID: doctorUID
                    };
                }
            });
            (snapshots.get(1) || []).forEach(d => {
                const data = d.data();
                if (data.subjectName && !enrolledMap[data.subjectName]) {
                    enrolledMap[data.subjectName] = {
                        docId: d.id, studentCount: data.studentCount || 0,
                        isShared: true, ownerUID: data.doctorUID || ""
                    };
                }
            });
        }
        return enrolledMap;
    }

    function _mergeAndRender() {
        _paintList(container, college, doctorUID, _buildEnrolledMap(), isAdmin);
        if (!firstLoad) showToast?.("🔄 تم تحديث القائمة تلقائياً", 1500, "#7c3aed");
        firstLoad = false;
    }

    async function _fallbackToDocs() {
        if (listenerFailed) return; 
        listenerFailed = true;
        console.warn("⚠️ onSnapshot فشل — جاري الرجوع لـ getDocs");
        try {
            const results = await Promise.all(queries.map(q => getDocs(q)));
            results.forEach((snap, idx) => snapshots.set(idx, snap.docs));
            _mergeAndRender();
            showToast?.("⚡ تم التحميل — التحديث اللحظي غير متاح حالياً", 3000, "#f59e0b");
        } catch (e) {
            console.error("Fallback getDocs فشل:", e);
            container.innerHTML = _errorHTML("خطأ في تحميل البيانات");
        }
    }

    const fallbackTimer = setTimeout(() => {
        if (firstLoad) _fallbackToDocs();
    }, 5000);

    const unsubscribers = queries.map((q, idx) =>
        onSnapshot(q, snap => {
            clearTimeout(fallbackTimer); 
            snapshots.set(idx, snap.docs);
            if (firstLoad && snapshots.size < queries.length) return;
            _mergeAndRender();
        }, err => {
            console.error("onSnapshot error:", err);
            clearTimeout(fallbackTimer);
            _fallbackToDocs(); 
        })
    );

    _activeListener = () => {
        clearTimeout(fallbackTimer);
        unsubscribers.forEach(fn => fn());
    };
}

function _paintList(container, college, doctorUID, enrolledMap, isAdmin) {
    const collegeSubjectsData = COLLEGE_SUBJECTS[college] || {};
    const YEAR_LABELS = {
        first_year: "الفرقة الأولى",
        second_year: "الفرقة الثانية",
        third_year: "الفرقة الثالثة",
        fourth_year: "الفرقة الرابعة",
        fifth_year: "الفرقة الخامسة"
    };

    const allSubjects = Object.entries(collegeSubjectsData)
        .flatMap(([yearKey, subjects]) => subjects.map(name => ({ name, year: yearKey })));

    if (allSubjects.length === 0) {
        container.innerHTML = `<div class="en-empty"><i class="fa-solid fa-book-open" style="font-size:40px;margin-bottom:15px;display:block;"></i><div style="font-weight:bold;">لا توجد مواد مضافة لهذه الكلية بعد</div></div>`;
        return;
    }

    const parts = [
        `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <span class="en-live-badge"><span class="en-live-dot"></span> تحديث لحظي مفعّل</span>
        </div>`
    ];

    let lastYear = '';

    for (const { name: subjectName, year: yearKey } of allSubjects) {
        if (yearKey !== lastYear) {
            lastYear = yearKey;
            parts.push(`<div class="en-year-header"><i class="fa-solid fa-layer-group"></i>${YEAR_LABELS[yearKey] || yearKey}</div>`);
        }

        const enrolled = enrolledMap[subjectName];
        const isEnrolled = !!enrolled;
        const subEscaped = subjectName.replace(/'/g, "\\'");

        parts.push(`
            <div class="en-card ${isEnrolled ? 'enrolled' : ''}">
                <div class="en-card-body">
                    <div style="flex:1;">
                        <div class="en-subject-title">${subjectName}</div>
                        ${isEnrolled ? `
                            <div class="en-badges">
                                <span class="en-badge en-badge-success"><i class="fa-solid fa-check-circle"></i> مسجلة</span>
                                <span class="en-badge en-badge-info"><i class="fa-solid fa-users"></i> ${enrolled.studentCount} طالب</span>
                                ${enrolled.isShared ? `<span class="en-badge en-badge-warning"><i class="fa-solid fa-share-nodes"></i> مشترك</span>` : ''}
                            </div>` : `
                            <span class="en-badge en-badge-neutral"><i class="fa-solid fa-minus-circle"></i> لم تُسجَّل بعد</span>`}
                    </div>
                    <div class="en-actions">
                        <label class="en-btn ${isEnrolled ? 'en-btn-update' : 'en-btn-primary'}">
                            <i class="fa-solid fa-file-excel"></i>${isEnrolled ? 'تحديث' : 'رفع قائمة'}
                            <input type="file" accept=".xlsx,.xls" style="display:none;" onchange="handleSubjectExcelUpload(this,'${subEscaped}')">
                        </label>
                        ${isAdmin ? `
                            <label class="en-btn en-btn-admin">
                                <i class="fa-solid fa-globe"></i> رفع مشترك
                                <input type="file" accept=".xlsx,.xls" style="display:none;" onchange="handleAdminSharedExcelUpload(this,'${subEscaped}')">
                            </label>` : ''}
                        ${isEnrolled ? `
                            <button class="en-btn en-btn-view" onclick="viewEnrolledStudents('${subEscaped}','${enrolled.docId}')">
                                <i class="fa-solid fa-eye"></i> عرض
                            </button>` : ''}
                        ${isAdmin && isEnrolled ? `
                            <button class="en-btn en-btn-danger" onclick="adminDeleteEnrollment('${enrolled.docId}','${subEscaped}')">
                                <i class="fa-solid fa-trash"></i> حذف
                            </button>` : ''}
                    </div>
                </div>
            </div>`);
    }

    container.innerHTML = parts.join('');
}

window.handleSubjectExcelUpload = async function (input, subjectName) {
    const file = input.files[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) return showToast?.("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");

    showToast?.("⏳ جاري قراءة الملف...", 2000, "#7c3aed");
    await new Promise(r => setTimeout(r, 100));

    try {
        const students = await _parseExcel(file);
        if (!students) { input.value = ''; return; }

        showToast?.(`⬆️ جاري رفع ${students.length} طالب...`, 2000, "#7c3aed");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const { fullName: doctorName = "", college = "" } = facSnap.exists() ? facSnap.data() : {};

        const q = query(collection(db, "subject_enrollments"),
            where("doctorUID", "==", user.uid),
            where("subjectName", "==", subjectName));
        const existingSnap = await getDocs(q);

        const payload = {
            doctorUID: user.uid, doctorName, college, subjectName,
            students, studentCount: students.length, updatedAt: serverTimestamp()
        };

        if (!existingSnap.empty) {
            await setDoc(doc(db, "subject_enrollments", existingSnap.docs[0].id), payload, { merge: true });
        } else {
            await addDoc(collection(db, "subject_enrollments"), { ...payload, createdAt: serverTimestamp() });
        }

        showToast?.(`✅ تم رفع ${students.length} طالب بنجاح`, 3000, "#10b981");
        if (typeof playSuccess === "function") playSuccess();
        if (typeof clearTheoryAttendanceCache === "function") clearTheoryAttendanceCache();
    } catch (e) {
        console.error("Upload Error:", e);
        showToast?.(e.message === "SheetJS missing" ? "❌ مكتبة الإكسل غير موجودة" : "❌ خطأ أثناء رفع الملف", 3000, "#ef4444");
    } finally { input.value = ''; }
};

window.handleAdminSharedExcelUpload = async function (input, subjectName) {
    const file = input.files[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) return showToast?.("⚠️ يجب تسجيل الدخول", 3000, "#f59e0b");

    if (!(await _isAdminDoctor(user.uid))) return showToast?.("❌ هذه الميزة للأدمن فقط", 3000, "#ef4444");

    showToast?.("⏳ جاري قراءة الملف...", 2000, "#7c3aed");
    await new Promise(r => setTimeout(r, 100));

    try {
        const students = await _parseExcel(file);
        if (!students) { input.value = ''; return; }

        showToast?.(`⬆️ جاري رفع المشترك (${students.length} طالب)...`, 2000, "#7c3aed");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const { fullName = "", college = "" } = facSnap.exists() ? facSnap.data() : {};

        const q = query(collection(db, "subject_enrollments"),
            where("sharedWithAll", "==", true),
            where("subjectName", "==", subjectName),
            where("college", "==", college));
        const existingSnap = await getDocs(q);

        const payload = {
            doctorUID: user.uid, doctorName: fullName, college, subjectName,
            students, studentCount: students.length, sharedWithAll: true,
            updatedAt: serverTimestamp()
        };

        if (!existingSnap.empty) {
            await setDoc(doc(db, "subject_enrollments", existingSnap.docs[0].id), payload, { merge: true });
        } else {
            await addDoc(collection(db, "subject_enrollments"), { ...payload, createdAt: serverTimestamp() });
        }

        showToast?.(`✅ تم رفع الشيت المشترك`, 3000, "#10b981");
        if (typeof playSuccess === "function") playSuccess();
    } catch (e) {
        showToast?.("❌ خطأ أثناء الرفع", 3000, "#ef4444");
    } finally { input.value = ''; }
};

window.adminDeleteEnrollment = async function (docId, subjectName) {
    const user = auth.currentUser;
    if (!user) return;
    if (!(await _isAdminDoctor(user.uid))) return showToast?.("❌ ليس لديك صلاحية", 3000, "#ef4444");

    if (!confirm(`هل أنت متأكد من حذف تسجيل مادة "${subjectName}"؟`)) return;

    try {
        await deleteDoc(doc(db, "subject_enrollments", docId));
        showToast?.("🗑️ تم الحذف بنجاح", 2500, "#10b981");
    } catch (e) {
        showToast?.("❌ خطأ أثناء الحذف", 3000, "#ef4444");
    }
};

window.viewEnrolledStudents = async function (subjectName, docId) {
    const modal = document.getElementById('enrolledStudentsViewModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const titleEl = document.getElementById('enrolledSubjectTitle');
    const listEl = document.getElementById('enrolledStudentsList');
    const searchInput = document.getElementById('enrolledSearchInput');

    if (titleEl) titleEl.innerText = subjectName;
    if (searchInput) searchInput.value = '';
    if (listEl) listEl.innerHTML = _loadingHTML("جاري جلب بيانات الطلاب...");

    try {
        const docSnap = await getDoc(doc(db, "subject_enrollments", docId));
        if (!docSnap.exists()) {
            listEl && (listEl.innerHTML = `<div class="en-empty">لا توجد بيانات</div>`);
            return;
        }

        const students = docSnap.data().students || [];
        window._enrolledStudentsCache = students;
        _renderEnrolledList(students);
    } catch (e) {
        if (listEl) listEl.innerHTML = _errorHTML("خطأ في التحميل");
    }
};

window.filterEnrolledStudents = function (searchText) {
    if (!window._enrolledStudentsCache) return;
    const q = searchText.toLowerCase().trim();
    _renderEnrolledList(window._enrolledStudentsCache.filter(s =>
        s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.group?.toLowerCase().includes(q)
    ));
};

function _renderEnrolledList(students) {
    const listEl = document.getElementById('enrolledStudentsList');
    if (!listEl) return;

    if (!students.length) {
        listEl.innerHTML = `<div class="en-empty"><i class="fa-solid fa-magnifying-glass-minus" style="font-size:35px;margin-bottom:12px;display:block;"></i><div>لا توجد نتائج</div></div>`;
        return;
    }

    const rows = students.map((s, i) => `
        <div class="en-student-row">
            <div class="en-avatar">${i + 1}</div>
            <div style="flex:1;">
                <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:3px;">${s.name}</div>
                <div class="en-badges">
                    <span style="font-size:11px;color:#64748b;font-weight:600;">ID: ${s.id}</span>
                    ${s.group ? `<span class="en-badge en-badge-info">${s.group}</span>` : ''}
                </div>
            </div>
        </div>`).join('');

    listEl.innerHTML = `
        <div class="en-stat-box">
            <span style="font-size:12px;color:#64748b;font-weight:600;">إجمالي الطلاب</span>
            <span style="background:#7c3aed;color:#fff;padding:3px 12px;border-radius:20px;font-size:13px;font-weight:800;">${students.length} طالب</span>
        </div>${rows}`;
}

async function _parseExcel(file) {
    if (typeof XLSX === 'undefined') throw new Error("SheetJS missing");
    try {
        const data = await _readExcelFile(file);
        if (!data?.length) { showToast?.("❌ الملف فارغ", 3000, "#ef4444"); return null; }

        const students = data.slice(1)
            .filter(r => r[0] && r[1])
            .map(r => ({
                id: String(r[0]).trim(),
                name: String(r[1]).trim(),
                group: r[2] ? String(r[2]).trim() : ""
            }));

        if (!students.length) { showToast?.("❌ بيانات غير صالحة", 3000, "#ef4444"); return null; }
        return students;
    } catch (err) {
        console.error("Excel Parse:", err);
        showToast?.("❌ خطأ في القراءة", 3000, "#ef4444");
        return null;
    }
}

function _readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("Read Error"));
        reader.readAsArrayBuffer(file);
    });
}

function _loadingHTML(msg) {
    return `<div class="en-loading"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px;color:#7c3aed;"></i><div style="margin-top:10px;">${msg}</div></div>`;
}

function _errorHTML(msg) {
    return `<div class="en-error"><i class="fa-solid fa-triangle-exclamation" style="font-size:30px;margin-bottom:10px;display:block;"></i>${msg}</div>`;
}

console.log("✅ Subject Enrollment System Loaded — Real-time onSnapshot Active");