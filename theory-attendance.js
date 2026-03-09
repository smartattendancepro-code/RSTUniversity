import {
    collection, query, where, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = window.db;
const auth = window.auth;

const _theoryCache = {
    uid: null,
    subjects: null,
    collegeCode: null,
    doctorName: null,
};

window.clearTheoryAttendanceCache = function () {
    _theoryCache.uid = null;
    _theoryCache.subjects = null;
    _theoryCache.collegeCode = null;
    _theoryCache.doctorName = null;
};

async function _loadTheoryCache(user) {
    if (_theoryCache.uid === user.uid && _theoryCache.subjects !== null) {
        return; // كاش موجود، مش محتاج تحميل
    }
    const facSnap = await getDoc(doc(db, 'faculty_members', user.uid));
    _theoryCache.collegeCode = 'NURS';
    _theoryCache.doctorName = user.displayName || user.email || 'Unknown Lecturer';
    if (facSnap.exists()) {
        const fd = facSnap.data();
        if (fd.college) _theoryCache.collegeCode = fd.college;
        if (fd.name || fd.fullName) _theoryCache.doctorName = fd.name || fd.fullName;
    }
    const subjects = new Set();
    const snap = await getDocs(
        query(collection(db, 'subject_enrollments'), where('doctorUID', '==', user.uid))
    );
    snap.forEach(d => { if (d.data().subjectName) subjects.add(d.data().subjectName); });
    const sharedSnap = await getDocs(
        query(collection(db, 'subject_enrollments'),
            where('sharedWithAll', '==', true),
            where('college', '==', _theoryCache.collegeCode))
    );
    sharedSnap.forEach(d => { if (d.data().subjectName) subjects.add(d.data().subjectName); });
    _theoryCache.uid = user.uid;
    _theoryCache.subjects = subjects;
}

async function loadExcelJS() {
    if (window.ExcelJS) return window.ExcelJS;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
        s.onload = () => resolve(window.ExcelJS);
        s.onerror = () => reject(new Error('Failed to load ExcelJS'));
        document.head.appendChild(s);
    });
}

const COLORS = {
    navyBg: '1E3A5F',
    navyText: 'FFFFFF',
    blueBg: '1E40AF',
    blueText: 'FFFFFF',
    labelBg: 'EFF6FF',
    labelText: '1E3A5F',
    presentBg: 'D1FAE5',
    presentText: '065F46',
    absentBg: 'FEE2E2',
    absentText: '991B1B',
    extraBg: 'FEF3C7',
    extraText: '92400E',
    summaryBg: 'F3F4F6',
    summaryText: '374151',
    border: 'CBD5E1',
};

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

    if (!modal) return;

    dateInput.valueAsDate = new Date();
    select.innerHTML = '<option value="" disabled selected>Loading your subjects…</option>';
    modal.style.display = 'flex';

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please log in first', 3000, '#f59e0b');
        return;
    }

    try {
        await _loadTheoryCache(user);

        select.innerHTML = '<option value="" disabled selected>-- Select Subject --</option>';

        if (_theoryCache.subjects.size === 0) {
            select.innerHTML = '<option value="" disabled>No registered subjects (upload student files first)</option>';
            return;
        }
        _theoryCache.subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = opt.innerText = sub;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Error loading subjects:', e);
        select.innerHTML = '<option value="" disabled>Error loading subjects</option>';
    }
};

window.generateTheoryReport = async function () {
    const subject = document.getElementById('theorySubjectSelect').value;
    const rawDate = document.getElementById('theoryDateInput').value;
    const btn = document.querySelector('#theoryAttendanceModal .btn-main');

    if (!subject || !rawDate) {
        if (typeof showToast === 'function') showToast('⚠️ Please select a subject and date', 3000, '#f59e0b');
        return;
    }

    // بعد ✅
    const [yyyy, mm, dd] = rawDate.split('-');
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const dateObj = new Date(+yyyy, +mm - 1, +dd);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Building report…';
    btn.disabled = true;

    try {
        const ExcelJS = await loadExcelJS();
        const user = auth.currentUser;

        await _loadTheoryCache(user);
        const collegeCode = _theoryCache.collegeCode;
        const doctorName = _theoryCache.doctorName;

        const attCollection = `attendance_${collegeCode}`;

        const enrollSnap = await getDocs(query(
            collection(db, 'subject_enrollments'),
            where('doctorUID', '==', user.uid),
            where('subjectName', '==', subject)
        ));

        let masterStudents = [];

        if (!enrollSnap.empty) {
            enrollSnap.forEach(d => {
                const data = d.data();
                if (data.students && Array.isArray(data.students))
                    masterStudents = [...masterStudents, ...data.students];
            });
        } else {
            // جرب الشيت المشترك من الادمن
            const sharedEnrollSnap = await getDocs(query(
                collection(db, 'subject_enrollments'),
                where('sharedWithAll', '==', true),
                where('subjectName', '==', subject),
                where('college', '==', collegeCode)
            ));
            if (sharedEnrollSnap.empty) {
                if (typeof showToast === 'function')
                    showToast('❌ No enrolled student list found for this subject.', 4000, '#ef4444');
                throw new Error('No enrollment found');
            }
            sharedEnrollSnap.forEach(d => {
                const data = d.data();
                if (data.students && Array.isArray(data.students))
                    masterStudents = [...masterStudents, ...data.students];
            });
        }

        const todaySnap = await getDocs(query(
            collection(db, attCollection),
            where('date', '==', dateStr),
            where('subject', '==', subject),
            where('doctorUID', '==', user.uid)
        ));

        if (todaySnap.empty) {
            if (typeof showToast === 'function')
                showToast(`⚠️ No attendance records found for ${dateStr}`, 4000, '#f59e0b');
            return;
        }

        const todayMap = {};
        todaySnap.forEach(d => {
            const data = d.data();
            const cleanID = String(data.id).trim();
            const absent = data.status === 'ABSENT' || data.status === 'Absent' || data.notes === 'Absent';

            let behavior = 'Disciplined';
            if (data.isUnruly) behavior = '⚠️ Disruptive';
            else if (data.isUniformViolation) behavior = '👕 Uniform Violation';

            todayMap[cleanID] = {
                status: absent ? '❌ Absent' : '✅ Present',
                time: (data.time_str && data.time_str !== '--:--') ? data.time_str : '--:--',
                behavior,
            };
        });

        const allTimeSnap = await getDocs(query(
            collection(db, attCollection),
            where('subject', '==', subject),
            where('doctorUID', '==', user.uid)
        ));

        const absenceCount = {};
        allTimeSnap.forEach(d => {
            const data = d.data();
            const cleanID = String(data.id).trim();
            const absent = data.status === 'ABSENT' || data.status === 'Absent' || data.notes === 'Absent';
            if (absent) absenceCount[cleanID] = (absenceCount[cleanID] || 0) + 1;
        });

        let rows = [];
        const processedIDs = new Set();

        masterStudents.forEach(student => {
            const id = String(student.id).trim();
            const rec = todayMap[id];
            processedIDs.add(id);
            rows.push({
                name: student.name,
                id,
                group: student.group || '--',
                status: rec ? rec.status : '❌ Absent',
                behavior: rec ? rec.behavior : '--',
                time: rec ? rec.time : '--:--',
                type: 'Primary',
                absences: absenceCount[id] || 0,
            });
        });

        todaySnap.forEach(d => {
            const data = d.data();
            const id = String(data.id).trim();
            const absent = data.status === 'ABSENT' || data.status === 'Absent';
            if (!processedIDs.has(id) && !absent) {
                let behavior = 'Disciplined';
                if (data.isUnruly) behavior = '⚠️ Disruptive';
                else if (data.isUniformViolation) behavior = '👕 Uniform Violation';
                rows.push({
                    name: data.name,
                    id,
                    group: data.group || 'Not Enrolled',
                    status: '⚠️ Present (Extra)',
                    behavior,
                    time: data.time_str,
                    type: 'Visitor / Extra',
                    absences: absenceCount[id] || 0,
                });
            }
        });

        rows.sort((a, b) => a.name.localeCompare(b.name, 'en'));
        rows = rows.map((r, i) => ({ no: i + 1, ...r }));

        const totalPresent = rows.filter(r => r.status.includes('Present')).length;
        const totalAbsent = rows.filter(r => r.status === '❌ Absent').length;
        const totalExtra = rows.filter(r => r.status.includes('Extra')).length;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = doctorName;
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Attendance Report', {
            views: [{ showGridLines: false }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

        const TOTAL_COLS = 9;

        ws.mergeCells(1, 1, 1, TOTAL_COLS);
        styleCell(ws.getCell('A1'), {
            bgColor: COLORS.navyBg, bold: true, size: 16, border: false
        });
        ws.getCell('A1').value = '📋  THEORY ATTENDANCE REPORT';
        ws.getRow(1).height = 42;

        ws.getRow(2).height = 26;
        [
            { label: 'SUBJECT', value: subject, startCol: 1, endCol: 3 },
            { label: 'DATE', value: dateStr, startCol: 4, endCol: 6 },
            { label: 'DAY', value: dayName, startCol: 7, endCol: 9 },
        ].forEach(({ label, value, startCol, endCol }) => {
            const lbl = ws.getCell(2, startCol);
            lbl.value = label;
            styleCell(lbl, { bgColor: COLORS.blueBg, fontColor: COLORS.blueText, bold: true, size: 10 });

            ws.mergeCells(2, startCol + 1, 2, endCol);
            const val = ws.getCell(2, startCol + 1);
            val.value = value;
            styleCell(val, { bgColor: COLORS.labelBg, fontColor: COLORS.labelText, bold: true, size: 11, hAlign: 'left' });
        });

        ws.getRow(3).height = 26;
        [
            { label: 'LECTURER', value: doctorName, startCol: 1, endCol: 3 },
            { label: 'COLLEGE', value: collegeCode, startCol: 4, endCol: 6 },
            { label: 'ENROLLED', value: `${masterStudents.length} students`, startCol: 7, endCol: 9 },
        ].forEach(({ label, value, startCol, endCol }) => {
            const lbl = ws.getCell(3, startCol);
            lbl.value = label;
            styleCell(lbl, { bgColor: COLORS.blueBg, fontColor: COLORS.blueText, bold: true, size: 10 });

            ws.mergeCells(3, startCol + 1, 3, endCol);
            const val = ws.getCell(3, startCol + 1);
            val.value = value;
            styleCell(val, { bgColor: COLORS.labelBg, fontColor: COLORS.labelText, bold: true, size: 11, hAlign: 'left' });
        });

        ws.getRow(4).height = 10;

        const headers = ['#', 'Student Name', 'University ID', 'Group',
            'Status', 'Behavior', 'Check-in Time', 'Record Type', 'Total Absences'];
        ws.getRow(5).height = 30;
        headers.forEach((h, i) => {
            const cell = ws.getCell(5, i + 1);
            cell.value = h;
            styleCell(cell, { bgColor: COLORS.blueBg, fontColor: COLORS.blueText, bold: true, size: 11 });
        });

        rows.forEach((r, idx) => {
            const rowNum = idx + 6;
            const values = [r.no, r.name, r.id, r.group, r.status, r.behavior, r.time, r.type, r.absences];

            let bg, fg;
            if (r.status === '❌ Absent') { bg = COLORS.absentBg; fg = COLORS.absentText; }
            else if (r.status.includes('Extra')) { bg = COLORS.extraBg; fg = COLORS.extraText; }
            else { bg = COLORS.presentBg; fg = COLORS.presentText; }

            ws.getRow(rowNum).height = 22;
            values.forEach((v, ci) => {
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
        styleCell(sumLbl, { bgColor: COLORS.navyBg, fontColor: COLORS.navyText, bold: true, size: 11 });

        [
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

        [5, 32, 14, 10, 18, 20, 14, 16, 15].forEach((w, i) => {
            ws.getColumn(i + 1).width = w;
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safe = subject.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
        a.download = `Theory_${safe}_${dateStr.replace(/\//g, '-')}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        if (typeof showToast === 'function')
            showToast(
                `✅ Report exported — ${rows.length} students  |  ✅ ${totalPresent} present  |  ❌ ${totalAbsent} absent`,
                4500, '#10b981'
            );

        document.getElementById('theoryAttendanceModal').style.display = 'none';

    } catch (e) {
        console.error('Theory Report Error:', e);
        if (typeof showToast === 'function')
            showToast('❌ Error: ' + e.message, 4000, '#ef4444');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};