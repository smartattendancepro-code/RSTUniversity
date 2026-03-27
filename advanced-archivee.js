import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.ARCHIVE_SETUP_CACHE = {
    subjects: [],
    isReady: false,
    lastFetch: null,
    TTL: 5 * 60 * 1000
};

window.preFetchArchiveData = async function () {
    const user = window.auth?.currentUser;
    if (!user || window.ARCHIVE_SETUP_CACHE.isReady) return;

    try {
        const facSnap = await getDoc(doc(window.db, "faculty_members", user.uid));
        const college = facSnap.exists() ? facSnap.data().college : "";

        const enrollmentsRef = collection(window.db, "subject_enrollments");

        const [personalSnap, sharedSnap] = await Promise.all([
            getDocs(query(enrollmentsRef, where("doctorUID", "==", user.uid))),
            college
                ? getDocs(query(enrollmentsRef, where("sharedWithAll", "==", true), where("college", "==", college)))
                : Promise.resolve({ forEach: () => { } })
        ]);

        let subjects = new Set();
        personalSnap.forEach(d => { if (d.data().subjectName) subjects.add(d.data().subjectName.trim()); });
        sharedSnap.forEach(d => { if (d.data().subjectName) subjects.add(d.data().subjectName.trim()); });

        window.ARCHIVE_SETUP_CACHE.subjects = [...subjects].sort((a, b) => a.localeCompare(b, 'ar'));
        window.ARCHIVE_SETUP_CACHE.isReady = true;
        window.ARCHIVE_SETUP_CACHE.lastFetch = Date.now();
        console.log("📊 Archive Cache Ready:", window.ARCHIVE_SETUP_CACHE.subjects.length, "subjects");
    } catch (e) { console.warn("Archive Fetch Error", e); }
};

// ─── بار البحث الذكي ───
window._archiveSubjectsList = [];

window.filterArchiveSubjects = function (searchQuery) {
    const select = document.getElementById('archSubjectSelect');
    if (!select) return;

    const normalized = (str) => str.toLowerCase()
        .replace(/أ|إ|آ/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي');

    const q = normalized(searchQuery.trim());

    for (let i = 0; i < select.options.length; i++) {
        const optText = normalized(select.options[i].text);
        select.options[i].style.display =
            (q === '' || optText.includes(q)) ? '' : 'none';
    }
};

window.openAdvancedArchiveModal = async function () {
    if (typeof window.playClick === 'function') window.playClick();

    let modal = document.getElementById('advancedArchiveModalV2');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'advancedArchiveModalV2';
        modal.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(5px);
            z-index: 999999;
            align-items: center;
            justify-content: center;
            font-family: 'Tajawal', 'Cairo', sans-serif;
        `;
        modal.innerHTML = `
            <div style="
                background: #ffffff;
                border-radius: 24px;
                padding: 28px;
                width: 92%;
                max-width: 440px;
                box-shadow: 0 25px 60px rgba(0,0,0,0.3);
                position: relative;
                overflow: hidden;
            ">
                <div style="
                    position: absolute; top: 0; left: 0; right: 0; height: 4px;
                    background: linear-gradient(90deg, #0ea5e9, #6366f1, #0ea5e9);
                "></div>

                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px;">
                    <div>
                        <h3 style="margin:0; font-size:18px; font-weight:900; color:#0f172a;">
                            📊 Advanced Archive
                        </h3>
                        <p style="margin:5px 0 0; font-size:12px; color:#64748b;">
                            Export full attendance sheet for a date range
                        </p>
                    </div>
                    <button onclick="document.getElementById('advancedArchiveModalV2').style.display='none'"
                        style="background:#f1f5f9; border:none; width:36px; height:36px; border-radius:50%;
                               cursor:pointer; font-size:16px; color:#64748b; flex-shrink:0;">✕</button>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="font-size:12px; font-weight:700; color:#475569; display:block;
                                  margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">
                        📚 Subject
                    </label>

                    <input type="text" id="archSubjectSearch"
                        placeholder="🔍 ابحث عن المادة..."
                        style="width:100%; padding:10px 14px; border:1.5px solid #e2e8f0;
                               border-radius:12px 12px 0 0; font-size:13px; font-family:inherit;
                               background:#f0f9ff; color:#0f172a; outline:none;
                               box-sizing:border-box; border-bottom:1px solid #e2e8f0;"
                        oninput="filterArchiveSubjects(this.value)"
                        autocomplete="off">

                    <select id="archSubjectSelect" style="
                        width:100%; padding:8px 14px; border:1.5px solid #e2e8f0;
                        border-top:none; border-radius:0 0 12px 12px;
                        font-size:13px; font-family:inherit;
                        background:#f8fafc; color:#0f172a; outline:none;
                        cursor:pointer; box-sizing:border-box; min-height:110px;
                    " size="5">
                        <option value="" disabled selected>⏳ Loading subjects...</option>
                    </select>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
                    <div>
                        <label style="font-size:12px; font-weight:700; color:#475569; display:block;
                                      margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">
                            📅 From
                        </label>
                        <input type="date" id="archStartDate" style="
                            width:100%; padding:12px 10px; border:1.5px solid #e2e8f0;
                            border-radius:12px; font-size:13px; font-family:inherit;
                            background:#f8fafc; color:#0f172a; outline:none; box-sizing:border-box;
                        ">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:700; color:#475569; display:block;
                                      margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">
                            📅 To
                        </label>
                        <input type="date" id="archEndDate" style="
                            width:100%; padding:12px 10px; border:1.5px solid #e2e8f0;
                            border-radius:12px; font-size:13px; font-family:inherit;
                            background:#f8fafc; color:#0f172a; outline:none; box-sizing:border-box;
                        ">
                    </div>
                </div>

                <div style="
                    background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px;
                    padding:10px 14px; font-size:11px; color:#0369a1;
                    margin-bottom:20px; display:flex; align-items:center; gap:8px;
                ">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>Each lecture date becomes a column. Students sorted by ID ascending.</span>
                </div>

                <button id="btnGenerateArchive" onclick="generateArchiveReport()" style="
                    width:100%; padding:14px;
                    background:linear-gradient(135deg, #0ea5e9, #0284c7);
                    color:#fff; border:none; border-radius:14px;
                    font-size:15px; font-weight:800; cursor:pointer;
                    font-family:inherit;
                    box-shadow:0 6px 20px rgba(14,165,233,0.35);
                    display:flex; align-items:center; justify-content:center; gap:10px;
                ">
                    <i class="fa-solid fa-file-excel"></i> Export Sheet
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const select = modal.querySelector('#archSubjectSelect');
    const searchInput = modal.querySelector('#archSubjectSearch');

    select.innerHTML = '<option value="" disabled selected>⏳ Loading subjects...</option>';
    if (searchInput) searchInput.value = '';

    const cacheNow = Date.now();
    const cacheExpired = !window.ARCHIVE_SETUP_CACHE.lastFetch ||
        (cacheNow - window.ARCHIVE_SETUP_CACHE.lastFetch) > window.ARCHIVE_SETUP_CACHE.TTL;

    if (!window.ARCHIVE_SETUP_CACHE.isReady || cacheExpired) {
        window.ARCHIVE_SETUP_CACHE.isReady = false;
        await window.preFetchArchiveData();
    }
    let subjects = [];

    if (window.ARCHIVE_SETUP_CACHE && window.ARCHIVE_SETUP_CACHE.isReady) {
        subjects = window.ARCHIVE_SETUP_CACHE.subjects;
    }

    if (subjects.length === 0) {
        try {
            const user = window.auth?.currentUser;
            if (user) {
                const enrollmentsRef = collection(window.db, "subject_enrollments");
                const [personalSnap, facSnap] = await Promise.all([
                    getDocs(query(enrollmentsRef, where("doctorUID", "==", user.uid))),
                    getDoc(doc(window.db, "faculty_members", user.uid))
                ]);

                personalSnap.forEach(d => {
                    const s = d.data().subjectName;
                    if (s) subjects.push(s);
                });

                const college = facSnap.exists() ? (facSnap.data().college || "") : "";
                if (college) {
                    const sharedSnap = await getDocs(query(
                        enrollmentsRef,
                        where("sharedWithAll", "==", true),
                        where("college", "==", college)
                    ));
                    sharedSnap.forEach(d => {
                        const s = d.data().subjectName;
                        if (s && !subjects.includes(s)) subjects.push(s);
                    });
                }

                window.ARCHIVE_SETUP_CACHE.subjects = subjects.sort((a, b) => a.localeCompare(b, 'ar'));
                window.ARCHIVE_SETUP_CACHE.isReady = true;
                window.ARCHIVE_SETUP_CACHE.lastFetch = Date.now();
            }
        } catch (e) {
            console.warn("⚠️ Failed to fetch archive subjects:", e);
        }
    }

    select.innerHTML = '<option value="" disabled selected>-- Select Subject --</option>';

    if (subjects.length === 0) {
        select.innerHTML = '<option value="" disabled>⚠️ No subjects found</option>';
    } else {
        window._archiveSubjectsList = subjects;
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.text = sub;
            select.appendChild(opt);
        });
    }

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    modal.querySelector('#archStartDate').value = firstDay.toISOString().split('T')[0];
    modal.querySelector('#archEndDate').value = now.toISOString().split('T')[0];

    modal.style.display = 'flex';
};

window.generateArchiveReport = async function () {

    const db = window.db;
    const modal = document.getElementById('advancedArchiveModalV2');

    const subjectName = modal.querySelector('#archSubjectSelect').value;
    const startDateInput = modal.querySelector('#archStartDate').value;
    const endDateInput = modal.querySelector('#archEndDate').value;
    const btn = modal.querySelector('#btnGenerateArchive');

    if (!subjectName) {
        if (typeof window.showToast === 'function')
            window.showToast("⚠️ Please select a subject", 3000, "#f59e0b");
        return;
    }
    if (!startDateInput || !endDateInput) {
        if (typeof window.showToast === 'function')
            window.showToast("⚠️ Please select date range", 3000, "#f59e0b");
        return;
    }

    const startObj = new Date(startDateInput);
    const endObj = new Date(endDateInput);
    endObj.setHours(23, 59, 59, 999);

    if (startObj > endObj) {
        if (typeof window.showToast === 'function')
            window.showToast("⚠️ Start date is after end date!", 3000, "#ef4444");
        return;
    }

    const diffDays = Math.round((endObj - startObj) / (1000 * 60 * 60 * 24));
    if (diffDays > 180) {
        if (typeof window.showToast === 'function')
            window.showToast("⚠️ Max range is 6 months", 3000, "#ef4444");
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
    btn.style.pointerEvents = 'none';

    if (typeof window.showToast === 'function')
        window.showToast("⏳ Fetching data...", 3000, "#0ea5e9");

    try {
        const user = window.auth?.currentUser;
        if (!user) throw new Error("Not authenticated");

        const facSnap = await getDoc(doc(db, "faculty_members", user.uid));
        if (!facSnap.exists()) throw new Error("Doctor profile not found");

        const facData = facSnap.data();
        const doctorCollege = facData.college || "NURS";
        const doctorName = facData.fullName || "Instructor";

        // ✅ البحث في كل الكليات عشان نلاقي السجلات بغض النظر عن مكان التخزين
        const ALL_COLLEGES = ["NURS", "PT", "PHARM", "DENT", "CS", "BA", "HS"];

        const datesList = [];
        const cursor = new Date(startObj);
        while (cursor <= endObj) {
            const d = ('0' + cursor.getDate()).slice(-2);
            const m = ('0' + (cursor.getMonth() + 1)).slice(-2);
            const y = cursor.getFullYear();
            datesList.push(`${d}/${m}/${y}`);
            cursor.setDate(cursor.getDate() + 1);
        }

        const CHUNK_SIZE = 30;
        const allRecords = [];

        for (let i = 0; i < datesList.length; i += CHUNK_SIZE) {
            const chunk = datesList.slice(i, i + CHUNK_SIZE);

            const primarySnap = await getDocs(query(
                collection(window.db, `attendance_${doctorCollege}`),
                where("subject", "==", subjectName),
                where("doctorUID", "==", user.uid),
                where("date", "in", chunk)
            ));

            primarySnap.forEach(d => allRecords.push(d.data()));

            if (primarySnap.empty) {
                const otherColleges = ALL_COLLEGES.filter(c => c !== doctorCollege);
                const promises = otherColleges.map(college =>
                    getDocs(query(
                        collection(window.db, `attendance_${college}`),
                        where("subject", "==", subjectName),
                        where("doctorUID", "==", user.uid),
                        where("date", "in", chunk)
                    ))
                );
                const results = await Promise.all(promises);
                results.forEach(snap => snap.forEach(d => allRecords.push(d.data())));
            }
        }

        if (allRecords.length === 0) {
            if (typeof window.showToast === 'function')
                window.showToast("⚠️ No records found in this period", 4000, "#f59e0b");
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
            return;
        }

        console.log(`✅ Found ${allRecords.length} records for "${subjectName}"`);

        let enrolledStudents = [];
        try {
            const qPersonal = query(
                collection(db, "subject_enrollments"),
                where("doctorUID", "==", user.uid),
                where("subjectName", "==", subjectName)
            );
            const personalSnap = await getDocs(qPersonal);
            if (!personalSnap.empty) {
                enrolledStudents = personalSnap.docs[0].data().students || [];
            } else {
                const qShared = query(
                    collection(db, "subject_enrollments"),
                    where("sharedWithAll", "==", true),
                    where("subjectName", "==", subjectName),
                    where("college", "==", doctorCollege)
                );
                const sharedSnap = await getDocs(qShared);
                if (!sharedSnap.empty) {
                    enrolledStudents = sharedSnap.docs[0].data().students || [];
                }
            }
        } catch (e) {
            console.warn("Enrollment fetch failed:", e);
        }

        const lecturesSet = new Set();
        allRecords.forEach(r => {
            if (r.date && r.status !== "ABSENT") lecturesSet.add(r.date);
        });

        const lectures = [...lecturesSet].sort((a, b) => {
            const parse = s => {
                const [dd, mm, yy] = s.split('/');
                return new Date(`${yy}-${mm}-${dd}`);
            };
            return parse(a) - parse(b);
        });

        if (lectures.length === 0) {
            if (typeof window.showToast === 'function')
                window.showToast("⚠️ No lecture sessions found", 3000, "#f59e0b");
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
            return;
        }

        const studentsMap = new Map();

        enrolledStudents.forEach(st => {
            const sid = String(st.id || "").trim();
            if (!sid) return;
            studentsMap.set(sid, {
                id: sid,
                name: st.name || "---",
                group: st.group || "--",
                attendance: {}
            });
        });

        allRecords.forEach(rec => {
            const sid = String(rec.id || "").trim();
            if (!sid) return;
            if (!studentsMap.has(sid)) {
                studentsMap.set(sid, {
                    id: sid,
                    name: rec.name || "---",
                    group: (rec.group || "--") + " *",
                    attendance: {}
                });
            }
            const student = studentsMap.get(sid);
            if (rec.status !== "ABSENT") {
                student.attendance[rec.date] = "P";
            } else if (!student.attendance[rec.date]) {
                student.attendance[rec.date] = "A";
            }
        });

        studentsMap.forEach(student => {
            lectures.forEach(date => {
                if (!student.attendance[date]) student.attendance[date] = "A";
            });
        });

        // ✅ ترتيب تصاعدي بالـ ID
        const students = [...studentsMap.values()].sort((a, b) =>
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
        );

        const totalLectures = lectures.length;
        const totalStudents = students.length;

        if (typeof XLSX === 'undefined') throw new Error("XLSX library not loaded");

        const wb = XLSX.utils.book_new();
        const shortDate = s => s.substring(0, 5);

        const wsData = [];

        wsData.push([
            `Subject: ${subjectName}`,
            `Instructor: ${doctorName}`,
            `College: ${doctorCollege}`,
            `Period: ${startDateInput.split('-').reverse().join('/')} → ${endDateInput.split('-').reverse().join('/')}`,
            `Lectures: ${totalLectures}`,
            `Students: ${totalStudents}`
        ]);

        wsData.push([]);

        const headerRow = ["#", "Student ID", "Student Name", "Group"];
        lectures.forEach(date => headerRow.push(shortDate(date)));
        headerRow.push("Present", "Absent", "Rate %");
        wsData.push(headerRow);

        students.forEach((student, idx) => {
            const row = [idx + 1, student.id, student.name, student.group];
            let presentCount = 0;

            lectures.forEach(date => {
                const s = student.attendance[date] || "A";
                row.push(s === "P" ? "✓" : "✗");
                if (s === "P") presentCount++;
            });

            const absentCount = totalLectures - presentCount;
            const rate = totalLectures > 0 ? Math.round((presentCount / totalLectures) * 100) : 0;
            row.push(presentCount, absentCount, rate + "%");
            wsData.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        const colWidths = [{ wch: 5 }, { wch: 14 }, { wch: 32 }, { wch: 10 }];
        lectures.forEach(() => colWidths.push({ wch: 8 }));
        colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 10 });
        ws['!cols'] = colWidths;
        ws['!views'] = [{ RTL: true }];

        const S = {
            info: {
                font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "0F172A" } },
                alignment: { horizontal: "center", vertical: "center", wrapText: true }
            },
            header: {
                font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "0284C7" } },
                alignment: { horizontal: "center", vertical: "center" }
            },
            present: {
                font: { bold: true, color: { rgb: "166534" } },
                fill: { fgColor: { rgb: "DCFCE7" } },
                alignment: { horizontal: "center" }
            },
            absent: {
                font: { bold: true, color: { rgb: "991B1B" } },
                fill: { fgColor: { rgb: "FEE2E2" } },
                alignment: { horizontal: "center" }
            },
            good: {
                font: { bold: true, color: { rgb: "166534" } },
                fill: { fgColor: { rgb: "F0FDF4" } },
                alignment: { horizontal: "center" }
            },
            warn: {
                font: { bold: true, color: { rgb: "92400E" } },
                fill: { fgColor: { rgb: "FFFBEB" } },
                alignment: { horizontal: "center" }
            },
            bad: {
                font: { bold: true, color: { rgb: "991B1B" } },
                fill: { fgColor: { rgb: "FFF1F2" } },
                alignment: { horizontal: "center" }
            },
            even: { fill: { fgColor: { rgb: "F8FAFC" } }, alignment: { horizontal: "center" } },
            odd: { fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "center" } }
        };

        const range = XLSX.utils.decode_range(ws['!ref']);
        const statsCol = 4 + totalLectures;

        for (let R = range.s.r; R <= range.e.r; R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const ref = XLSX.utils.encode_cell({ c: C, r: R });
                if (!ws[ref]) ws[ref] = { t: 's', v: '' };
                const val = ws[ref].v;

                if (R === 0) {
                    ws[ref].s = S.info;
                } else if (R === 2) {
                    ws[ref].s = S.header;
                } else if (R >= 3) {
                    if (val === "✓") ws[ref].s = S.present;
                    else if (val === "✗") ws[ref].s = S.absent;
                    else if (C === statsCol) ws[ref].s = S.good;
                    else if (C === statsCol + 1) ws[ref].s = S.bad;
                    else if (C === statsCol + 2) {
                        const pct = parseInt(val);
                        ws[ref].s = pct >= 75 ? S.good : pct >= 50 ? S.warn : S.bad;
                    } else {
                        ws[ref].s = R % 2 === 0 ? S.even : S.odd;
                    }
                }
            }
        }

        // ─── Summary Sheet ───
        const atRisk = students.filter(st => {
            const absent = lectures.filter(d => st.attendance[d] === "A").length;
            return totalLectures > 0 && (absent / totalLectures) > 0.25;
        });

        const summaryData = [
            ["📊 Report Summary"],
            [],
            ["Field", "Value"],
            ["Subject", subjectName],
            ["Instructor", doctorName],
            ["College", doctorCollege],
            ["From", startDateInput.split('-').reverse().join('/')],
            ["To", endDateInput.split('-').reverse().join('/')],
            ["Total Lectures", totalLectures],
            ["Total Students", totalStudents],
            ["Students at Risk (>25% absence)", atRisk.length],
            [],
            ["⚠️ At-Risk Students (Absence > 25%)"],
            ["Student ID", "Name", "Group", "Absent Sessions", "Absence Rate %"]
        ];

        atRisk.forEach(st => {
            const absent = lectures.filter(d => st.attendance[d] === "A").length;
            const rate = Math.round((absent / totalLectures) * 100);
            summaryData.push([st.id, st.name, st.group, absent, rate + "%"]);
        });

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        wsSummary['!cols'] = [
            { wch: 30 }, { wch: 35 }, { wch: 12 }, { wch: 18 }, { wch: 15 }
        ];

        [[2, "1E293B"], [13, "DC2626"]].forEach(([rowIdx, color]) => {
            const sr = XLSX.utils.decode_range(wsSummary['!ref']);
            for (let C = sr.s.c; C <= sr.e.c; C++) {
                const ref = XLSX.utils.encode_cell({ c: C, r: rowIdx });
                if (wsSummary[ref]) {
                    wsSummary[ref].s = {
                        font: { bold: true, color: { rgb: "FFFFFF" } },
                        fill: { fgColor: { rgb: color } },
                        alignment: { horizontal: "center" }
                    };
                }
            }
        });

        XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        const startStr = startDateInput.split('-').reverse().join('-');
        const endStr = endDateInput.split('-').reverse().join('-');
        const safeName = subjectName.replace(/[\s/\\?*[\]]/g, '_');
        const fileName = `Archive_${safeName}_${startStr}_to_${endStr}.xlsx`;

        XLSX.writeFile(wb, fileName);

        if (typeof window.playSuccess === 'function') window.playSuccess();
        if (navigator.vibrate) navigator.vibrate(50);

        if (typeof window.showToast === 'function')
            window.showToast(
                `✅ Exported: ${totalStudents} students | ${totalLectures} lectures | ${atRisk.length} at risk`,
                5000, "#10b981"
            );

        modal.style.display = 'none';

    } catch (error) {
        console.error("generateArchiveReport Error:", error);
        if (typeof window.showToast === 'function')
            window.showToast("❌ Error: " + error.message, 4000, "#ef4444");
    } finally {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = 'auto';
    }
};

console.log("✅ Advanced Archive v4.0 - Multi-College + Smart Search + Sorted by ID");
