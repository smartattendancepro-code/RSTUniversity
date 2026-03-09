import { COLLEGE_SUBJECTS, COLLEGE_NAMES } from './config.js';
import {
    getFirestore, collection, doc,
    getDoc, getDocs, addDoc, setDoc, deleteDoc,
    query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;


window.openSubjectEnrollmentModal = async function () {
    const modal = document.getElementById('subjectEnrollmentModal');
    if (!modal) return;

    modal.style.display = 'flex';

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast("⚠️ يرجى تسجيل الدخول أولاً", 3000, "#f59e0b");
        return;
    }

    const collegeSelectorSection = document.getElementById('collegeSelectorSection');
    const enrollmentListContainer = document.getElementById('enrollmentListContainer');

    if (collegeSelectorSection) collegeSelectorSection.style.display = 'none';
    if (enrollmentListContainer) enrollmentListContainer.innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:30px; color:#7c3aed; margin-bottom:15px;"></i>
            <div style="font-weight:bold; color:#64748b;">جاري التحقق من بياناتك...</div>
        </div>`;

    try {
        const facRef = doc(db, "faculty_members", user.uid);
        const facSnap = await getDoc(facRef);

        if (!facSnap.exists()) {
            if (typeof showToast === 'function') showToast("❌ لم يتم العثور على بيانات حسابك", 3000, "#ef4444");
            modal.style.display = 'none';
            return;
        }

        const facData = facSnap.data();
        const college = facData.college;

        if (!college) {
            if (collegeSelectorSection) collegeSelectorSection.style.display = 'block';
            if (enrollmentListContainer) enrollmentListContainer.innerHTML = '';
        } else {
            if (collegeSelectorSection) collegeSelectorSection.style.display = 'none';
            await _renderEnrollmentList(college, user.uid, facData.fullName || "");
        }

    } catch (e) {
        console.error("openSubjectEnrollmentModal Error:", e);
        if (enrollmentListContainer) enrollmentListContainer.innerHTML = `
            <div style="color:#ef4444; text-align:center; padding:30px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:30px; margin-bottom:10px; display:block;"></i>
                خطأ في تحميل البيانات
            </div>`;
    }
};


window.saveAndLoadCollege = async function () {
    const select = document.getElementById('enrollmentCollegeSelect');
    if (!select || !select.value) {
        if (typeof showToast === 'function') showToast("⚠️ يرجى اختيار الكلية أولاً", 3000, "#f59e0b");
        return;
    }

    const college = select.value;
    const user = auth.currentUser;
    if (!user) return;

    const btn = document.getElementById('btnSaveCollege');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الحفظ...';
        btn.disabled = true;
    }

    try {
        await setDoc(doc(db, "faculty_members", user.uid), { college: college }, { merge: true });

        const collegeSelectorSection = document.getElementById('collegeSelectorSection');
        if (collegeSelectorSection) collegeSelectorSection.style.display = 'none';

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const doctorName = facSnap.exists() ? (facSnap.data().fullName || "") : "";

        await _renderEnrollmentList(college, user.uid, doctorName);

        if (typeof showToast === 'function') showToast("✅ تم حفظ الكلية بنجاح", 2000, "#10b981");

    } catch (e) {
        console.error("saveAndLoadCollege Error:", e);
        if (typeof showToast === 'function') showToast("❌ حدث خطأ أثناء الحفظ", 3000, "#ef4444");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

async function _renderEnrollmentList(college, doctorUID, doctorName) {
    const container = document.getElementById('enrollmentListContainer');
    if (!container) return;

    const collegeName = COLLEGE_NAMES[college] || college;
    const headerEl = document.getElementById('enrollmentCollegeTitle');
    if (headerEl) headerEl.innerText = collegeName;

    container.innerHTML = `
        <div style="text-align:center; padding:30px 20px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#7c3aed;"></i>
            <div style="margin-top:10px; color:#64748b; font-size:13px; font-weight:600;">جاري تحميل المواد...</div>
        </div>`;

    try {
        const q = query(
            collection(db, "subject_enrollments"),
            where("doctorUID", "==", doctorUID)
        );
        const enrollSnap = await getDocs(q);

        const isAdmin = await _isAdminDoctor(doctorUID);


        const enrolledMap = {};
        enrollSnap.forEach(d => {
            const data = d.data();
            const subjectName = data.subjectName || "";
            if (subjectName) {
                enrolledMap[subjectName] = {
                    docId: d.id,
                    studentCount: data.studentCount || 0,
                    isShared: false,
                    ownerUID: data.doctorUID || doctorUID
                };
            }
        });

        if (isAdmin) {
            // جلب الشيتات غير المشتركة (بتاعت الدكاترة) في نفس الكلية
            const allEnrollQ = query(
                collection(db, "subject_enrollments"),
                where("sharedWithAll", "==", false),
                where("college", "==", college)
            );
            const allEnrollSnap = await getDocs(allEnrollQ);
            allEnrollSnap.forEach(d => {
                const data = d.data();
                const subjectName = data.subjectName || "";
                if (subjectName && !enrolledMap[subjectName]) {
                    enrolledMap[subjectName] = {
                        docId: d.id,
                        studentCount: data.studentCount || 0,
                        isShared: false,
                        ownerUID: data.doctorUID || ""
                    };
                }
            });
        }

        const sharedQ = query(
            collection(db, "subject_enrollments"),
            where("sharedWithAll", "==", true),
            where("college", "==", college)
        );
        const sharedSnap = await getDocs(sharedQ);
        sharedSnap.forEach(d => {


            const data = d.data();
            const subjectName = data.subjectName || "";
            // الشيت المشترك يظهر فقط لو مفيش شيت خاص للدكتور لنفس المادة
            if (subjectName && !enrolledMap[subjectName]) {
                enrolledMap[subjectName] = {
                    docId: d.id,
                    studentCount: data.studentCount || 0,
                    isShared: true,
                    ownerUID: data.doctorUID || ""
                };
            }
        });

        const collegeSubjectsData = COLLEGE_SUBJECTS[college] || {};

        const YEAR_LABELS = {
            "first_year": "الفرقة الأولى",
            "second_year": "الفرقة الثانية",
            "third_year": "الفرقة الثالثة",
            "fourth_year": "الفرقة الرابعة",
            "fifth_year": "الفرقة الخامسة"
        };

        let allSubjects = [];
        for (const [yearKey, subjects] of Object.entries(collegeSubjectsData)) {
            subjects.forEach(sub => {
                allSubjects.push({ name: sub, year: yearKey });
            });
        }

        if (allSubjects.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                    <i class="fa-solid fa-book-open" style="font-size:40px; margin-bottom:15px; display:block;"></i>
                    <div style="font-weight:bold;">لا توجد مواد مضافة لهذه الكلية بعد</div>
                    <div style="font-size:12px; margin-top:8px;">يمكن إضافتها من ملف config.js</div>
                </div>`;
            return;
        }

        let html = '';
        let lastYear = '';

        allSubjects.forEach(({ name: subjectName, year: yearKey }) => {
            const yearLabel = YEAR_LABELS[yearKey] || yearKey;
            const enrolled = enrolledMap[subjectName];
            const isEnrolled = !!enrolled;
            const studentCount = isEnrolled ? enrolled.studentCount : 0;
            const docId = isEnrolled ? enrolled.docId : null;
            const isSharedEntry = isEnrolled ? (enrolled.isShared || false) : false;
            const entryOwnerUID = isEnrolled ? (enrolled.ownerUID || doctorUID) : doctorUID;

            if (yearKey !== lastYear) {
                lastYear = yearKey;
                html += `
                    <div style="
                        background: linear-gradient(135deg, #7c3aed15, #6d28d915);
                        border: 1px solid #7c3aed30;
                        border-radius: 10px;
                        padding: 8px 14px;
                        margin: 16px 0 8px;
                        font-size: 12px;
                        font-weight: 800;
                        color: #7c3aed;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <i class="fa-solid fa-layer-group"></i>
                        ${yearLabel}
                    </div>`;
            }

            const subjectSafe = subjectName.replace(/'/g, "\\'");

            html += `
                <div style="
                    background: #fff;
                    border: 1px solid ${isEnrolled ? '#7c3aed30' : '#e2e8f0'};
                    border-radius: 14px;
                    padding: 14px 16px;
                    margin-bottom: 10px;
                    box-shadow: ${isEnrolled ? '0 2px 8px rgba(124,58,237,0.08)' : '0 1px 3px rgba(0,0,0,0.04)'};
                    ${isEnrolled ? 'border-right: 4px solid #7c3aed;' : ''}
                ">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                        
                        <!-- اسم المادة + badge -->
                        <div style="flex:1;">
                            <div style="font-size:14px; font-weight:800; color:#1e293b; margin-bottom:6px; line-height:1.4;">
                                ${subjectName}
                            </div>
                            ${isEnrolled ? `
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="
                                        background:#f3e8ff; color:#7c3aed;
                                        padding:3px 10px; border-radius:20px;
                                        font-size:11px; font-weight:800;
                                        border:1px solid #e9d5ff;
                                    ">
                                        <i class="fa-solid fa-check-circle"></i> مسجلة
                                    </span>
                                    <span style="
                                        background:#e0f2fe; color:#0284c7;
                                        padding:3px 10px; border-radius:20px;
                                        font-size:11px; font-weight:800;
                                        border:1px solid #bae6fd;
                                    ">
                                        <i class="fa-solid fa-users"></i> ${studentCount} طالب
                                    </span>
                                    ${isSharedEntry ? `
                                        <span style="
                                            background:#fef9c3; color:#ca8a04;
                                            padding:3px 10px; border-radius:20px;
                                            font-size:11px; font-weight:800;
                                            border:1px solid #fde68a;
                                        ">
                                            <i class="fa-solid fa-share-nodes"></i> مشترك من الادمن
                                        </span>
                                    ` : ''}
                                </div>
                            ` : `
                                <span style="
                                    background:#f8fafc; color:#94a3b8;
                                    padding:3px 10px; border-radius:20px;
                                    font-size:11px; font-weight:600;
                                    border:1px solid #e2e8f0;
                                ">
                                    <i class="fa-solid fa-minus-circle"></i> لم تُسجَّل بعد
                                </span>
                            `}
                        </div>

                        <!-- أزرار -->
                        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                            
                            <!-- زر رفع القائمة العادي -->
                            <label style="
                                background: ${isEnrolled ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)'};
                                color:#fff; padding:7px 12px;
                                border-radius:10px; font-size:11px; font-weight:800;
                                cursor:pointer; display:flex; align-items:center; gap:6px;
                                box-shadow: 0 2px 8px rgba(124,58,237,0.25);
                                white-space:nowrap;
                            ">
                                <i class="fa-solid fa-file-excel"></i>
                                ${isEnrolled ? 'تحديث' : 'رفع قائمة'}
                                <input 
                                    type="file" 
                                    accept=".xlsx,.xls" 
                                    style="display:none;" 
                                    onchange="handleSubjectExcelUpload(this, '${subjectSafe}')"
                                >
                            </label>

                            <!-- زر رفع الشيت المشترك — للادمن فقط -->
                            ${isAdmin ? `
                                <label style="
                                    background: linear-gradient(135deg,#0ea5e9,#0284c7);
                                    color:#fff; padding:7px 12px;
                                    border-radius:10px; font-size:11px; font-weight:800;
                                    cursor:pointer; display:flex; align-items:center; gap:6px;
                                    box-shadow: 0 2px 8px rgba(2,132,199,0.3);
                                    white-space:nowrap;
                                ">
                                    <i class="fa-solid fa-globe"></i> رفع مشترك
                                    <input 
                                        type="file" 
                                        accept=".xlsx,.xls" 
                                        style="display:none;" 
                                        onchange="handleAdminSharedExcelUpload(this, '${subjectSafe}')"
                                    >
                                </label>
                            ` : ''}

                            <!-- زر العرض (فقط لو مسجلة) -->
                            ${isEnrolled ? `
                                <button 
                                    onclick="viewEnrolledStudents('${subjectSafe}', '${docId}')"
                                    style="
                                        background:#f3e8ff; color:#7c3aed;
                                        border:1px solid #e9d5ff; padding:7px 12px;
                                        border-radius:10px; font-size:11px; font-weight:800;
                                        cursor:pointer; display:flex; align-items:center; gap:6px;
                                        white-space:nowrap;
                                    "
                                >
                                    <i class="fa-solid fa-eye"></i> عرض
                                </button>
                            ` : ''}

                            <!-- زر الحذف — للادمن فقط وعلى أي شيت مسجل -->
                            ${isAdmin && isEnrolled ? `
                                <button 
                                    onclick="adminDeleteEnrollment('${docId}', '${subjectSafe}', '${entryOwnerUID}')"
                                    style="
                                        background:#fee2e2; color:#dc2626;
                                        border:1px solid #fecaca; padding:7px 12px;
                                        border-radius:10px; font-size:11px; font-weight:800;
                                        cursor:pointer; display:flex; align-items:center; gap:6px;
                                        white-space:nowrap;
                                    "
                                >
                                    <i class="fa-solid fa-trash"></i> حذف
                                </button>
                            ` : ''}

                        </div>
                    </div>
                </div>`;
        });

        container.innerHTML = html;

    } catch (e) {
        console.error("_renderEnrollmentList Error:", e);
        container.innerHTML = `
            <div style="color:#ef4444; text-align:center; padding:30px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:30px; margin-bottom:10px; display:block;"></i>
                خطأ في تحميل قائمة المواد
            </div>`;
    }
}


window.handleSubjectExcelUpload = async function (input, subjectName) {
    const file = input.files[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
        return;
    }

    if (typeof showToast === 'function') showToast("⏳ جاري قراءة الملف...", 2000, "#7c3aed");

    try {
        const data = await _readExcelFile(file);

        if (!data || data.length === 0) {
            if (typeof showToast === 'function') showToast("❌ الملف فارغ أو غير صالح", 3000, "#ef4444");
            input.value = '';
            return;
        }

        const rows = data.slice(1);

        const students = rows
            .filter(row => row[0] && row[1])
            .map(row => ({
                id: String(row[0]).trim(),
                name: String(row[1]).trim(),
                group: row[2] ? String(row[2]).trim() : ""
            }));

        if (students.length === 0) {
            if (typeof showToast === 'function') showToast("❌ لا توجد بيانات صالحة في الملف", 3000, "#ef4444");
            input.value = '';
            return;
        }

        if (typeof showToast === 'function') showToast(`⬆️ جاري رفع ${students.length} طالب...`, 2000, "#7c3aed");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const facData = facSnap.exists() ? facSnap.data() : {};
        const doctorName = facData.fullName || "";
        const college = facData.college || "";

        const q = query(
            collection(db, "subject_enrollments"),
            where("doctorUID", "==", user.uid),
            where("subjectName", "==", subjectName)
        );
        const existingSnap = await getDocs(q);

        const payload = {
            doctorUID: user.uid,
            doctorName: doctorName,
            college: college,
            subjectName: subjectName,
            students: students,
            studentCount: students.length,
            updatedAt: serverTimestamp()
        };

        if (!existingSnap.empty) {
            const existingDocId = existingSnap.docs[0].id;
            await setDoc(doc(db, "subject_enrollments", existingDocId), payload, { merge: true });
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "subject_enrollments"), payload);
        }

        if (typeof showToast === 'function') showToast(`✅ تم رفع ${students.length} طالب بنجاح`, 3000, "#10b981");
        if (typeof playSuccess === 'function') playSuccess();
        if (typeof clearTheoryAttendanceCache === 'function') clearTheoryAttendanceCache();

        await _renderEnrollmentList(college, user.uid, doctorName);

    } catch (e) {
        console.error("handleSubjectExcelUpload Error:", e);
        if (typeof showToast === 'function') showToast("❌ خطأ أثناء رفع الملف", 3000, "#ef4444");
    } finally {
        input.value = '';
    }
};


window.viewEnrolledStudents = async function (subjectName, docId) {
    const modal = document.getElementById('enrolledStudentsViewModal');
    if (!modal) return;

    modal.style.display = 'flex';

    const titleEl = document.getElementById('enrolledSubjectTitle');
    if (titleEl) titleEl.innerText = subjectName;

    const listEl = document.getElementById('enrolledStudentsList');
    if (listEl) listEl.innerHTML = `
        <div style="text-align:center; padding:30px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#7c3aed;"></i>
        </div>`;

    const searchInput = document.getElementById('enrolledSearchInput');
    if (searchInput) searchInput.value = '';

    try {
        const docSnap = await getDoc(doc(db, "subject_enrollments", docId));

        if (!docSnap.exists()) {
            if (listEl) listEl.innerHTML = `<div class="empty-state">لا توجد بيانات</div>`;
            return;
        }

        const data = docSnap.data();
        const students = data.students || [];

        window._enrolledStudentsCache = students;
        window._enrolledSubjectName = subjectName;

        _renderEnrolledList(students);

    } catch (e) {
        console.error("viewEnrolledStudents Error:", e);
        if (listEl) listEl.innerHTML = `<div style="color:#ef4444; text-align:center; padding:20px;">خطأ في تحميل البيانات</div>`;
    }
};

window.filterEnrolledStudents = function (searchText) {
    if (!window._enrolledStudentsCache) return;

    const filtered = window._enrolledStudentsCache.filter(s => {
        const q = searchText.toLowerCase().trim();
        return (
            s.name.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            (s.group && s.group.toLowerCase().includes(q))
        );
    });

    _renderEnrolledList(filtered);
};


function _renderEnrolledList(students) {
    const listEl = document.getElementById('enrolledStudentsList');
    if (!listEl) return;

    if (students.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                <i class="fa-solid fa-magnifying-glass-minus" style="font-size:35px; margin-bottom:12px; display:block;"></i>
                <div style="font-weight:bold;">لا توجد نتائج مطابقة</div>
            </div>`;
        return;
    }

    let html = `
        <div style="
            background:#f8fafc; border-radius:10px; padding:10px 14px;
            margin-bottom:12px; display:flex; justify-content:space-between;
            align-items:center; border:1px solid #e2e8f0;
        ">
            <span style="font-size:12px; color:#64748b; font-weight:600;">
                إجمالي الطلاب
            </span>
            <span style="
                background:#7c3aed; color:#fff;
                padding:3px 12px; border-radius:20px;
                font-size:13px; font-weight:800;
            ">
                ${students.length} طالب
            </span>
        </div>`;

    students.forEach((student, index) => {
        html += `
            <div style="
                background:#fff; border:1px solid #e2e8f0;
                border-radius:12px; padding:12px 14px;
                margin-bottom:8px; display:flex;
                justify-content:space-between; align-items:center;
                gap:10px;
            ">
                <div style="
                    width:36px; height:36px; min-width:36px;
                    background:linear-gradient(135deg,#7c3aed15,#6d28d915);
                    border-radius:50%; display:flex; align-items:center;
                    justify-content:center; color:#7c3aed;
                    font-size:13px; font-weight:800;
                    border:1px solid #7c3aed20;
                ">
                    ${index + 1}
                </div>

                <div style="flex:1;">
                    <div style="font-size:13px; font-weight:800; color:#1e293b; margin-bottom:3px;">
                        ${student.name}
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:11px; color:#64748b; font-family:'Outfit',sans-serif; font-weight:600;">
                            ID: ${student.id}
                        </span>
                        ${student.group ? `
                            <span style="
                                background:#e0f2fe; color:#0284c7;
                                padding:1px 8px; border-radius:10px;
                                font-size:10px; font-weight:800;
                                border:1px solid #bae6fd;
                            ">
                                ${student.group}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>`;
    });

    listEl.innerHTML = html;
}


function _readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                resolve(json);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsArrayBuffer(file);
    });
}



async function _isAdminDoctor(uid) {
    try {
        const snap = await getDoc(doc(db, "faculty_members", uid));
        return snap.exists() && snap.data().isAdminDoctor === true;
    } catch (e) {
        return false;
    }
}

/**
 * يحذف أي تسجيل (خاص أو مشترك) — للادمن فقط
 * @param {string} docId       - ID مستند subject_enrollments
 * @param {string} subjectName - اسم المادة
 * @param {string} ownerUID    - صاحب الشيت (للتحقق فقط)
 */
window.adminDeleteEnrollment = async function (docId, subjectName, ownerUID) {
    const user = auth.currentUser;
    if (!user) return;

    const isAdmin = await _isAdminDoctor(user.uid);
    if (!isAdmin) {
        if (typeof showToast === 'function') showToast("❌ ليس لديك صلاحية الحذف", 3000, "#ef4444");
        return;
    }

    const confirmed = confirm(`هل أنت متأكد من حذف تسجيل مادة "${subjectName}" ؟\nلا يمكن التراجع عن هذا الإجراء.`);
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "subject_enrollments", docId));
        if (typeof showToast === 'function') showToast("🗑️ تم الحذف بنجاح", 2500, "#10b981");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const facData = facSnap.exists() ? facSnap.data() : {};
        await _renderEnrollmentList(facData.college || "", user.uid, facData.fullName || "");
    } catch (e) {
        console.error("adminDeleteEnrollment Error:", e);
        if (typeof showToast === 'function') showToast("❌ خطأ أثناء الحذف", 3000, "#ef4444");
    }
};


window.handleAdminSharedExcelUpload = async function (input, subjectName) {
    const file = input.files[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast("⚠️ يجب تسجيل الدخول أولاً", 3000, "#f59e0b");
        return;
    }

    const isAdmin = await _isAdminDoctor(user.uid);
    if (!isAdmin) {
        if (typeof showToast === 'function') showToast("❌ هذه الميزة للدكاترة الادمن فقط", 3000, "#ef4444");
        input.value = '';
        return;
    }

    if (typeof showToast === 'function') showToast("⏳ جاري قراءة الملف...", 2000, "#7c3aed");

    try {
        const data = await _readExcelFile(file);

        if (!data || data.length === 0) {
            if (typeof showToast === 'function') showToast("❌ الملف فارغ أو غير صالح", 3000, "#ef4444");
            input.value = '';
            return;
        }

        const rows = data.slice(1);
        const students = rows
            .filter(row => row[0] && row[1])
            .map(row => ({
                id: String(row[0]).trim(),
                name: String(row[1]).trim(),
                group: row[2] ? String(row[2]).trim() : ""
            }));

        if (students.length === 0) {
            if (typeof showToast === 'function') showToast("❌ لا توجد بيانات صالحة في الملف", 3000, "#ef4444");
            input.value = '';
            return;
        }

        if (typeof showToast === 'function') showToast(`⬆️ جاري رفع ${students.length} طالب (مشترك)...`, 2000, "#7c3aed");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        const facData = facSnap.exists() ? facSnap.data() : {};
        const college = facData.college || "";

        const q = query(
            collection(db, "subject_enrollments"),
            where("sharedWithAll", "==", true),
            where("subjectName", "==", subjectName),
            where("college", "==", college)
        );
        const existingSnap = await getDocs(q);

        const payload = {
            doctorUID: user.uid,
            doctorName: facData.fullName || "",
            college: college,
            subjectName: subjectName,
            students: students,
            studentCount: students.length,
            sharedWithAll: true,
            updatedAt: serverTimestamp()
        };

        if (!existingSnap.empty) {
            await setDoc(doc(db, "subject_enrollments", existingSnap.docs[0].id), payload, { merge: true });
        } else {
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "subject_enrollments"), payload);
        }

        if (typeof showToast === 'function') showToast(`✅ تم رفع الشيت المشترك (${students.length} طالب)`, 3000, "#10b981");
        if (typeof playSuccess === 'function') playSuccess();

        await _renderEnrollmentList(college, user.uid, facData.fullName || "");

    } catch (e) {
        console.error("handleAdminSharedExcelUpload Error:", e);
        if (typeof showToast === 'function') showToast("❌ خطأ أثناء رفع الشيت المشترك", 3000, "#ef4444");
    } finally {
        input.value = '';
    }
};

console.log("✅ Subject Enrollment System Loaded");