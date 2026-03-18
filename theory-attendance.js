import {
    collection, query, where, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";



const _theoryCache = {
    uid: null,
    subjects: null,
    collegeCode: null,
    doctorName: null,
};

window.clearTheoryAttendanceCache = function () {
    Object.assign(_theoryCache, { uid: null, subjects: null, collegeCode: null, doctorName: null });
};

async function _loadTheoryCache(user) {
    if (_theoryCache.uid === user.uid && _theoryCache.subjects instanceof Set) return;

    const db = window.db;

    const [facSnap, ownSnap] = await Promise.all([
        getDoc(doc(db, 'faculty_members', user.uid)),
        getDocs(query(collection(db, 'subject_enrollments'), where('doctorUID', '==', user.uid)))
    ]);

    _theoryCache.collegeCode = 'NURS';
    _theoryCache.doctorName = user.displayName || user.email || 'Unknown Lecturer';

    if (facSnap.exists()) {
        const fd = facSnap.data();
        if (fd.college) _theoryCache.collegeCode = fd.college;
        if (fd.name || fd.fullName) _theoryCache.doctorName = fd.name || fd.fullName;
    }

    const subjects = new Set();
    ownSnap.forEach(d => { if (d.data().subjectName) subjects.add(d.data().subjectName); });

    const sharedSnap = await getDocs(query(
        collection(db, 'subject_enrollments'),
        where('sharedWithAll', '==', true),
        where('college', '==', _theoryCache.collegeCode)
    ));
    sharedSnap.forEach(d => { if (d.data().subjectName) subjects.add(d.data().subjectName); });

    _theoryCache.uid = user.uid;
    _theoryCache.subjects = subjects;
}

let _excelLoaderPromise = null;
function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (_excelLoaderPromise) return _excelLoaderPromise;

    _excelLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
        script.onload = () => resolve(window.ExcelJS);
        script.onerror = () => { _excelLoaderPromise = null; reject(new Error('Failed to load ExcelJS')); };
        document.head.appendChild(script);
    });
    return _excelLoaderPromise;
}

const COLORS = Object.freeze({
    navyBg: '1E3A5F', navyText: 'FFFFFF',
    blueBg: '1E40AF', blueText: 'FFFFFF',
    labelBg: 'EFF6FF', labelText: '1E3A5F',
    presentBg: 'D1FAE5', presentText: '065F46',
    absentBg: 'FEE2E2', absentText: '991B1B',
    extraBg: 'FEF3C7', extraText: '92400E',
    summaryBg: 'F3F4F6', summaryText: '374151',
    border: 'CBD5E1',
});

function applyBorder(cell, color = COLORS.border) {
    const side = { style: 'thin', color: { argb: 'FF' + color } };
    cell.border = { top: side, left: side, bottom: side, right: side };
}

function styleCell(cell, {
    bgColor, fontColor = 'FFFFFF', bold = false,
    size = 11, hAlign = 'center', vAlign = 'middle',
    border = true, wrapText = false
} = {}) {
    if (bgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    cell.font = { name: 'Arial', bold, size, color: { argb: 'FF' + fontColor } };
    cell.alignment = { horizontal: hAlign, vertical: vAlign, wrapText };
    if (border) applyBorder(cell);
}

window.openTheoryAttendanceModal = async function () {
    const modal = document.getElementById('theoryAttendanceModal');
    const select = document.getElementById('theorySubjectSelect');
    const dateInput = document.getElementById('theoryDateInput');
    if (!modal || !select || !dateInput) return;

    dateInput.valueAsDate = new Date();
    select.innerHTML = '<option value="" disabled selected>Loading subjects...</option>';
    select.disabled = true;
    modal.style.display = 'flex';

    if (!window.auth || !window.db) {
        select.innerHTML = '<option value="" disabled>System initializing...</option>';
        window.showToast?.('⚠️ النظام قيد التهيئة، يرجى المحاولة بعد ثواني', 3000, '#f59e0b');
        select.disabled = false;
        return;
    }

    const user = window.auth.currentUser;
    if (!user) {
        modal.style.display = 'none';
        window.showToast?.('⚠️ Please log in first', 3000, '#f59e0b');
        return;
    }

    try {
        await _loadTheoryCache(user);
        select.innerHTML = '<option value="" disabled selected>-- Select Subject --</option>';

        if (_theoryCache.subjects.size === 0) {
            select.innerHTML = '<option value="" disabled>No registered subjects found</option>';
            return;
        }

        const fragment = document.createDocumentFragment();
        _theoryCache.subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = sub;
            fragment.appendChild(opt);
        });
        select.appendChild(fragment);

    } catch (e) {
        console.error('Error loading subjects:', e);
        select.innerHTML = '<option value="" disabled>Error loading subjects</option>';
    } finally {
        select.disabled = false;
    }
};

window.generateTheoryReport = async function () {
    const subject = document.getElementById('theorySubjectSelect')?.value;
    const rawDate = document.getElementById('theoryDateInput')?.value;
    const btn = document.querySelector('#theoryAttendanceModal .btn-main');

    if (!subject || !rawDate) return showToast?.('⚠️ Please select a subject and date', 3000, '#f59e0b');

    const [yyyy, mm, dd] = rawDate.split('-');
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const dayName = new Date(+yyyy, +mm - 1, +dd).toLocaleDateString('en-US', { weekday: 'long' });

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Building report...';
    btn.disabled = true;

    try {
        if (!window.auth || !window.db) {
            throw new Error('النظام قيد التهيئة، يرجى المحاولة بعد ثواني');
        }
        const db = window.db;

        const [ExcelJS, user] = await Promise.all([loadExcelJS(), window.auth.currentUser]);
        if (!user) throw new Error('Authentication lost');

        await _loadTheoryCache(user);
        const { collegeCode, doctorName } = _theoryCache;
        const attCollection = `attendance_${collegeCode}`;

        const [enrollSnap, todaySnap, absenceSnap] = await Promise.all([
            getDocs(query(collection(db, 'subject_enrollments'), where('doctorUID', '==', user.uid), where('subjectName', '==', subject))),
            getDocs(query(collection(db, attCollection), where('date', '==', dateStr), where('subject', '==', subject), where('doctorUID', '==', user.uid))),
            getDocs(query(collection(db, attCollection), where('subject', '==', subject), where('doctorUID', '==', user.uid), where('status', 'in', ['ABSENT', 'Absent', 'absent'])))
        ]);

        let masterStudents = [];
        if (!enrollSnap.empty) {
            enrollSnap.forEach(d => { if (Array.isArray(d.data().students)) masterStudents.push(...d.data().students); });
        } else {
            const sharedSnap = await getDocs(query(collection(db, 'subject_enrollments'), where('sharedWithAll', '==', true), where('subjectName', '==', subject), where('college', '==', collegeCode)));
            if (sharedSnap.empty) throw new Error('No enrolled student list found for this subject.');
            sharedSnap.forEach(d => { if (Array.isArray(d.data().students)) masterStudents.push(...d.data().students); });
        }

        if (todaySnap.empty) {
            window.showToast?.(`⚠️ No attendance records found for ${dateStr}`, 4000, '#f59e0b');
            return;
        }

        const studentMap = new Map();

        masterStudents.forEach(s => {
            studentMap.set(String(s.id).trim(), {
                name: s.name, id: String(s.id).trim(), group: s.group || '--',
                status: '❌ Absent', behavior: '--', time: '--:--', type: 'Primary', absences: 0
            });
        });

        absenceSnap.forEach(d => {
            const id = String(d.data().id).trim();
            if (studentMap.has(id)) studentMap.get(id).absences++;
        });

        todaySnap.forEach(d => {
            const data = d.data();
            const id = String(data.id).trim();
            const isAbsent = data.status?.toUpperCase() === 'ABSENT' || data.notes?.toUpperCase() === 'ABSENT';
            const behavior = data.isUnruly ? '⚠️ Disruptive' : (data.isUniformViolation ? '👕 Uniform Violation' : 'Disciplined');
            const timeStr = (data.time_str && data.time_str !== '--:--') ? data.time_str : '--:--';

            if (studentMap.has(id)) {
                const stu = studentMap.get(id);
                stu.status = isAbsent ? '❌ Absent' : '✅ Present';
                stu.time = timeStr;
                stu.behavior = behavior;
            } else if (!isAbsent) {
                studentMap.set(id, {
                    name: data.name || 'Unknown', id, group: data.group || 'Not Enrolled',
                    status: '⚠️ Present (Extra)', behavior, time: timeStr,
                    type: 'Visitor / Extra', absences: 0
                });
            }
        });

        const rows = Array.from(studentMap.values())
            .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
            .map((r, i) => ({ no: i + 1, ...r }));

        let totalPresent = 0, totalAbsent = 0, totalExtra = 0;
        rows.forEach(r => {
            if (r.status === '❌ Absent') totalAbsent++;
            else if (r.status.includes('Extra')) totalExtra++;
            else totalPresent++;
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = doctorName;
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Attendance Report', {
            views: [{ showGridLines: false }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

        const TOTAL_COLS = 9;

        ws.mergeCells(1, 1, 1, TOTAL_COLS);
        styleCell(ws.getCell('A1'), { bgColor: COLORS.navyBg, bold: true, size: 16, border: false });
        ws.getCell('A1').value = '📋  THEORY ATTENDANCE REPORT';
        ws.getRow(1).height = 42;

        const metaRows = [[
            { label: 'SUBJECT', value: subject, startCol: 1, endCol: 3 },
            { label: 'DATE', value: dateStr, startCol: 4, endCol: 6 },
            { label: 'DAY', value: dayName, startCol: 7, endCol: 9 },
        ], [
            { label: 'LECTURER', value: doctorName, startCol: 1, endCol: 3 },
            { label: 'COLLEGE', value: collegeCode, startCol: 4, endCol: 6 },
            { label: 'ENROLLED', value: `${masterStudents.length} students`, startCol: 7, endCol: 9 },
        ]];

        metaRows.forEach((rowDef, ri) => {
            ws.getRow(ri + 2).height = 26;
            rowDef.forEach(({ label, value, startCol, endCol }) => {
                const lbl = ws.getCell(ri + 2, startCol);
                lbl.value = label;
                styleCell(lbl, { bgColor: COLORS.blueBg, fontColor: COLORS.blueText, bold: true, size: 10 });
                ws.mergeCells(ri + 2, startCol + 1, ri + 2, endCol);
                const val = ws.getCell(ri + 2, startCol + 1);
                val.value = value;
                styleCell(val, { bgColor: COLORS.labelBg, fontColor: COLORS.labelText, bold: true, size: 11, hAlign: 'left' });
            });
        });

        ws.getRow(4).height = 10;

        const headers = ['#', 'Student Name', 'University ID', 'Group', 'Status', 'Behavior', 'Check-in Time', 'Record Type', 'Total Absences'];
        ws.getRow(5).height = 30;
        headers.forEach((h, i) => {
            const cell = ws.getCell(5, i + 1);
            cell.value = h;
            styleCell(cell, { bgColor: COLORS.blueBg, fontColor: COLORS.blueText, bold: true, size: 11 });
        });

        rows.forEach((r, idx) => {
            const rowNum = idx + 6;
            let bg = COLORS.presentBg, fg = COLORS.presentText;

            if (r.status === '❌ Absent') { bg = COLORS.absentBg; fg = COLORS.absentText; }
            else if (r.status.includes('Extra')) { bg = COLORS.extraBg; fg = COLORS.extraText; }

            ws.getRow(rowNum).height = 22;[r.no, r.name, r.id, r.group, r.status, r.behavior, r.time, r.type, r.absences]
                .forEach((v, ci) => {
                    const cell = ws.getCell(rowNum, ci + 1);
                    cell.value = v;
                    styleCell(cell, { bgColor: bg, fontColor: fg, size: 11, hAlign: ci === 1 ? 'left' : 'center' });
                });
        });

        const sumRow = rows.length + 6;
        ws.getRow(sumRow).height = 26;
        ws.mergeCells(sumRow, 1, sumRow, 2);

        const sumLbl = ws.getCell(sumRow, 1);
        sumLbl.value = 'SUMMARY';
        styleCell(sumLbl, { bgColor: COLORS.navyBg, fontColor: COLORS.navyText, bold: true, size: 11 });[
            { col: 3, span: 2, value: `✅  Present: ${totalPresent}`, bg: COLORS.presentBg, fg: COLORS.presentText },
            { col: 5, span: 2, value: `❌  Absent:  ${totalAbsent}`, bg: COLORS.absentBg, fg: COLORS.absentText },
            { col: 7, span: 1, value: `⚠️  Extra:  ${totalExtra}`, bg: COLORS.extraBg, fg: COLORS.extraText },
            { col: 8, span: 2, value: `Total: ${rows.length}`, bg: COLORS.summaryBg, fg: COLORS.summaryText },
        ].forEach(({ col, span, value, bg, fg }) => {
            if (span > 1) ws.mergeCells(sumRow, col, sumRow, col + span - 1);
            const cell = ws.getCell(sumRow, col);
            cell.value = value;
            styleCell(cell, { bgColor: bg, fontColor: fg, bold: true, size: 11 });
        });


        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `Theory_${subject.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}_${dateStr.replace(/\//g, '-')}.xlsx`;
        a.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        window.showToast?.(`✅ Report exported: ${totalPresent} Present | ${totalAbsent} Absent`, 4500, '#10b981');
        document.getElementById('theoryAttendanceModal').style.display = 'none';

    } catch (e) {
        console.error('Theory Report Error:', e);
        window.showToast?.('❌ Error: ' + e.message, 4000, '#ef4444');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};

console.log("✅ Theory Attendance Module Loaded (100% Optimized)");