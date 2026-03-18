(function () {

    const MODULE_ID = 'groupSearchModule';

    const COLLEGE_LETTER_MAP = {
        "NURS": "N", "PT": "P", "PHARM": "C",
        "DENT": "D", "CS": "T", "BA": "B", "HS": "H"
    };

    let _doctorCollege = null;
    let _collegeLetter = null;

    const _loadDoctorCollege = async () => {
        if (_doctorCollege) return;
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const db = window.db;
            const user = window.auth?.currentUser;
            if (!user || !db) return;
            const snap = await getDoc(doc(db, "faculty_members", user.uid));
            if (snap.exists()) {
                _doctorCollege = snap.data().college || "NURS";
                _collegeLetter = COLLEGE_LETTER_MAP[_doctorCollege] || "N";
            }
        } catch (e) { console.warn("GroupSearch: College fetch failed", e); }
    };

    const _buildGroupPattern = () => {
        const L = _collegeLetter || '[A-Z]';
        return new RegExp(`^\\d${L}\\d{1,3}( GP)?$`, 'i');
    };

    // ================================================================
    // CSS
    // ================================================================
    const injectCSS = () => {
        if (document.getElementById('groupSearchCSS')) return;
        const style = document.createElement('style');
        style.id = 'groupSearchCSS';
        style.textContent = `
#groupSearchBar {
    display:flex; align-items:center; gap:10px;
    background:linear-gradient(135deg,#f0f9ff,#e0f2fe);
    border:1.5px solid #bae6fd; border-radius:16px;
    padding:12px 16px; margin:0 0 14px 0;
    box-shadow:0 2px 10px rgba(14,165,233,0.08); transition:box-shadow 0.2s;
}
#groupSearchBar:focus-within { box-shadow:0 0 0 3px rgba(14,165,233,0.18); border-color:#0ea5e9; }
#groupSearchBar .gsb-icon { color:#0ea5e9; font-size:18px; flex-shrink:0; }
#groupCodeInput {
    flex:1; border:none; background:transparent; font-size:15px; font-weight:700;
    color:#0f172a; font-family:'Outfit','Cairo',sans-serif; outline:none;
    text-transform:uppercase; letter-spacing:1px; direction:ltr;
}
#groupCodeInput::placeholder { color:#94a3b8; font-weight:500; text-transform:none; letter-spacing:0; }
#btnGroupSearch {
    background:linear-gradient(135deg,#0ea5e9,#0284c7); color:#fff; border:none;
    border-radius:10px; padding:8px 16px; font-size:12px; font-weight:800;
    cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:6px;
    transition:transform 0.15s,box-shadow 0.15s;
    box-shadow:0 3px 10px rgba(14,165,233,0.3); white-space:nowrap;
}
#btnGroupSearch:active { transform:scale(0.96); }
#btnGroupSearch:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
#groupSearchDate {
    border:none; background:transparent; font-size:13px; font-weight:700;
    color:#0f172a; cursor:pointer; font-family:'Courier New',monospace; outline:none; flex:1;
}
.gsb-college-badge {
    display:inline-flex; align-items:center; gap:5px;
    background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:20px;
    font-size:11px; font-weight:800; border:1px solid #bae6fd; margin-bottom:10px;
}
#groupSearchResults {
    display:none; flex-direction:column; gap:0;
    background:#fff; border:1.5px solid #e2e8f0; border-radius:16px;
    overflow:hidden; margin-bottom:14px;
    box-shadow:0 4px 20px rgba(0,0,0,0.06); animation:gsFadeIn 0.25s ease;
}
@keyframes gsFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.gs-results-header {
    background:linear-gradient(135deg,#0f172a,#1e293b); color:#fff;
    padding:14px 18px; display:flex; justify-content:space-between;
    align-items:center; gap:10px; flex-wrap:wrap;
}
.gs-results-header .gs-group-name {
    font-size:18px; font-weight:900; letter-spacing:1px;
    font-family:'Outfit',sans-serif; color:#38bdf8;
}
.gs-results-header .gs-stats-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.gs-stat-pill { padding:4px 12px; border-radius:20px; font-size:11px; font-weight:800; display:flex; align-items:center; gap:5px; }
.gs-stat-present { background:#dcfce7; color:#166534; }
.gs-stat-absent  { background:#fee2e2; color:#991b1b; }
.gs-stat-total   { background:#e0f2fe; color:#0369a1; }
.gs-subjects-list { padding:12px; display:flex; flex-direction:column; gap:8px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
.gs-subjects-list-title { font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; padding:0 4px 4px; display:flex; align-items:center; gap:6px; }
.gs-subject-tab { display:flex; align-items:center; justify-content:space-between; background:#fff; border:1.5px solid #e2e8f0; border-radius:12px; padding:10px 14px; cursor:pointer; transition:all 0.15s; gap:10px; }
.gs-subject-tab:hover { border-color:#0ea5e9; background:#f0f9ff; transform:translateX(-2px); }
.gs-subject-tab.active { border-color:#0ea5e9; background:linear-gradient(135deg,#f0f9ff,#e0f2fe); box-shadow:0 2px 8px rgba(14,165,233,0.15); }
.gs-subject-tab-name { font-size:13px; font-weight:800; color:#0f172a; flex:1; }
.gs-subject-tab-meta { display:flex; align-items:center; gap:6px; }
.gs-subject-tab-count { background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800; }
.gs-subject-tab-doctor { background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; }
.gs-subject-tab-arrow { color:#94a3b8; font-size:11px; transition:transform 0.2s; }
.gs-subject-tab.active .gs-subject-tab-arrow { transform:rotate(90deg); color:#0ea5e9; }
.gs-subject-header { background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:10px 18px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
.gs-subject-name { font-size:13px; font-weight:800; color:#334155; flex:1; }
.gs-doctor-name { font-size:11px; font-weight:600; color:#64748b; background:#f1f5f9; padding:3px 8px; border-radius:8px; }
.gs-back-btn { display:flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:5px 10px; font-size:11px; font-weight:700; color:#334155; cursor:pointer; transition:all 0.15s; margin:10px 18px 0; width:fit-content; }
.gs-back-btn:hover { background:#e2e8f0; }
.gs-student-row { display:flex; align-items:center; padding:11px 18px; border-bottom:1px solid #f1f5f9; gap:12px; transition:background 0.1s; }
.gs-student-row:last-child { border-bottom:none; }
.gs-student-row:hover { background:#f8fafc; }
.gs-student-row.absent { background:#fff8f8; }
.gs-student-row.absent:hover { background:#fef2f2; }
.gs-status-badge { flex-shrink:0; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; }
.gs-status-badge.present { background:#dcfce7; color:#16a34a; }
.gs-status-badge.absent  { background:#fee2e2; color:#dc2626; }
.gs-student-info { flex:1; min-width:0; }
.gs-student-name { font-size:13px; font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gs-student-id   { font-size:11px; color:#64748b; font-family:'Courier New',monospace; margin-top:1px; }
.gs-att-details  { text-align:right; flex-shrink:0; }
.gs-att-time     { font-size:11px; font-weight:700; color:#0ea5e9; direction:ltr; }
.gs-att-hall     { font-size:10px; color:#94a3b8; margin-top:1px; }
.gs-absent-label { font-size:11px; font-weight:700; color:#ef4444; }
.gs-download-bar { background:#f8fafc; border-top:1.5px solid #e2e8f0; padding:12px 18px; display:flex; gap:10px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }
.gs-download-bar .gs-dl-info { flex:1; font-size:11px; color:#64748b; font-weight:600; }
.gs-btn-download { border:none; border-radius:10px; padding:9px 16px; font-size:12px; font-weight:800; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:6px; transition:transform 0.15s; }
.gs-btn-download:active { transform:scale(0.96); }
.gs-btn-excel { background:linear-gradient(135deg,#22c55e,#16a34a); color:#fff; box-shadow:0 3px 10px rgba(34,197,94,0.3); }
.gs-btn-csv   { background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; }
.gs-state-box { padding:30px 20px; text-align:center; color:#94a3b8; font-size:13px; font-weight:600; }
.gs-state-box i { font-size:30px; margin-bottom:10px; display:block; }
.gs-state-box.error { color:#ef4444; }
.gs-state-box.error i { color:#ef4444; }
.gs-skeleton-row { height:50px; background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size:200% 100%; animation:gsShimmer 1.2s infinite; margin:6px 18px; border-radius:8px; }
@keyframes gsShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.gs-percent-bar-wrap { height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden; margin-top:6px; width:120px; }
.gs-percent-bar-fill { height:100%; border-radius:2px; transition:width 0.6s ease; }
.gs-detail-view { animation:gsSlideIn 0.2s ease; }
@keyframes gsSlideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }

/* ── Subject Search ── */
#subjectSearchSection { margin-top:8px; }
#btnToggleSubjectSearch {
    width:100%; display:flex; align-items:center; justify-content:space-between;
    background:linear-gradient(135deg,#f5f3ff,#ede9fe);
    border:1.5px solid #ddd6fe; border-radius:14px;
    padding:12px 16px; cursor:pointer; font-family:inherit; transition:all 0.2s;
}
#btnToggleSubjectSearch:hover { box-shadow:0 0 0 3px rgba(124,58,237,0.12); }
#subjectSearchResults {
    display:none; flex-direction:column; gap:0; background:#fff;
    border:1.5px solid #e2e8f0; border-radius:16px; overflow:hidden;
    margin-top:10px; box-shadow:0 4px 20px rgba(0,0,0,0.06); animation:gsFadeIn 0.25s ease;
}
.gs-subject-item { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.15s; gap:10px; }
.gs-subject-item:last-child { border-bottom:none; }
.gs-subject-item:hover { background:#f5f3ff; }
.gs-subject-item-name { font-size:13px; font-weight:800; color:#1e293b; flex:1; }
.gs-year-divider { background:linear-gradient(135deg,#7c3aed15,#6d28d915); border-top:1px solid #7c3aed20; padding:6px 14px; font-size:11px; font-weight:800; color:#7c3aed; display:flex; align-items:center; gap:6px; }
.gs-doctor-card { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.15s; gap:12px; }
.gs-doctor-card:last-child { border-bottom:none; }
.gs-doctor-card:hover { background:#f0f9ff; }
.gs-doctor-avatar { width:38px; height:38px; min-width:38px; background:linear-gradient(135deg,#0ea5e920,#0284c720); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#0284c7; font-size:14px; font-weight:800; border:1px solid #0ea5e930; }
.gs-doctor-info { flex:1; }
.gs-doctor-name-text { font-size:13px; font-weight:800; color:#0f172a; }
.gs-doctor-count { font-size:11px; color:#64748b; margin-top:2px; }
        `;
        document.head.appendChild(style);
    };

    // ================================================================
    // HTML
    // ================================================================
    const fmtDate  = (iso) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const todayStr = () => { const n=new Date(); return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`; };
    const todayISO = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };

    const buildHTML = () => `
        <div id="${MODULE_ID}" style="padding:0 4px;">
            <div id="gsbCollegeBadge"></div>

            <!-- Group Search Bar -->
            <div id="groupSearchBar" style="display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <i class="fa-solid fa-users-rectangle gsb-icon"></i>
                    <input id="groupCodeInput" type="text" placeholder="e.g. 1P2" maxlength="8" autocomplete="off" spellcheck="false"/>
                    <button id="btnGroupSearch"><i class="fa-solid fa-magnifying-glass"></i> بحث</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:8px 12px;">
                    <i class="fa-regular fa-calendar-days" style="color:#64748b;font-size:14px;"></i>
                    <span style="font-size:12px;font-weight:700;color:#64748b;">تاريخ الحضور:</span>
                    <input id="groupSearchDate" type="date"/>
                </div>
            </div>

            <div id="groupSearchResults"></div>

            <!-- Subject Search Toggle -->
            <div id="subjectSearchSection">
                <button id="btnToggleSubjectSearch" onclick="window._gsToggleSubjectSearch()">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <i class="fa-solid fa-book-open" style="color:#7c3aed;font-size:16px;"></i>
                        <span style="font-size:13px;font-weight:800;color:#4c1d95;">البحث بالمادة</span>
                    </div>
                    <i id="subjectSearchArrow" class="fa-solid fa-chevron-down" style="color:#7c3aed;font-size:12px;transition:transform 0.3s;"></i>
                </button>

                <div id="subjectSearchPanel" style="display:none;margin-top:8px;">
                    <div style="display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin-bottom:8px;">
                        <i class="fa-regular fa-calendar-days" style="color:#7c3aed;font-size:14px;"></i>
                        <span style="font-size:12px;font-weight:700;color:#64748b;">تاريخ المحاضرة:</span>
                        <input id="subjectSearchDate" type="date" style="border:none;background:transparent;font-size:13px;font-weight:700;color:#0f172a;cursor:pointer;font-family:'Courier New',monospace;outline:none;flex:1;"/>
                    </div>
                    <div id="subjectsList" style="background:#fff;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;max-height:300px;overflow-y:auto;">
                        <div style="padding:14px;text-align:center;color:#94a3b8;font-size:12px;font-weight:600;">
                            <i class="fa-solid fa-circle-notch fa-spin" style="margin-bottom:8px;display:block;font-size:20px;color:#7c3aed;"></i>
                            جاري تحميل المواد...
                        </div>
                    </div>
                </div>
            </div>

            <div id="subjectSearchResults"></div>
        </div>
    `;

    // ================================================================
    // Group Search — Render Helpers
    // ================================================================
    const showSkeleton = (container) => {
        container.style.display = 'flex';
        container.innerHTML = `<div style="padding:16px 0 8px;">${Array(5).fill('<div class="gs-skeleton-row"></div>').join('')}</div>`;
    };

    const renderSubjectSelector = (groupCode, targetDate, masterList, subjectsMap) => {
        const container = document.getElementById('groupSearchResults');
        if (!container) return;
        const subjects = Object.keys(subjectsMap);
        const totalPresent = subjects.reduce((s, subj) => s + subjectsMap[subj].attendanceMap.size, 0);
        let tabsHTML = '';
        subjects.forEach(subj => {
            const info = subjectsMap[subj];
            tabsHTML += `
                <div class="gs-subject-tab" onclick="window._gsOpenSubject('${subj.replace(/'/g,"\\'")}')">
                    <div class="gs-subject-tab-name">${subj}</div>
                    <div class="gs-subject-tab-meta">
                        <div class="gs-subject-tab-count"><i class="fa-solid fa-circle-check" style="font-size:8px;"></i> ${info.attendanceMap.size} حاضر</div>
                        <div class="gs-subject-tab-doctor"><i class="fa-solid fa-chalkboard-user" style="font-size:8px;"></i> ${info.doctorName||'—'}</div>
                    </div>
                    <i class="fa-solid fa-chevron-left gs-subject-tab-arrow"></i>
                </div>`;
        });
        container.style.display = 'flex';
        container.innerHTML = `
            <div class="gs-results-header">
                <div>
                    <div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px;margin-left:6px;"></i>${groupCode.toUpperCase()}</div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:3px;direction:ltr;">${targetDate}</div>
                </div>
                <div class="gs-stats-row">
                    <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${totalPresent} حضور</div>
                    <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-book-open"></i> ${subjects.length} مادة</div>
                </div>
            </div>
            <div class="gs-subjects-list">
                <div class="gs-subjects-list-title"><i class="fa-solid fa-layer-group" style="color:#0ea5e9;"></i> اختر المادة لعرض تفاصيل الحضور</div>
                ${tabsHTML}
            </div>`;
    };

    const renderSingleSubject = (groupCode, targetDate, masterList, attendanceMap, subjectName, doctorName, multiSubject=false) => {
        const container = document.getElementById('groupSearchResults');
        if (!container) return;
        const presentCount = masterList.filter(s => attendanceMap.has(s.id)).length;
        const absentCount  = masterList.length - presentCount;
        const pct = masterList.length ? Math.round((presentCount/masterList.length)*100) : 0;
        const barColor = pct>=75?'#22c55e':pct>=50?'#f59e0b':'#ef4444';

        let rowsHTML = '';
        masterList.forEach(student => {
            const rec = attendanceMap.get(student.id);
            rowsHTML += `
                <div class="gs-student-row ${rec?'':'absent'}">
                    <div class="gs-status-badge ${rec?'present':'absent'}"><i class="fa-solid fa-${rec?'check':'xmark'}"></i></div>
                    <div class="gs-student-info">
                        <div class="gs-student-name">${student.name}</div>
                        <div class="gs-student-id">${student.id}</div>
                    </div>
                    <div class="gs-att-details">
                        ${rec
                            ?`<div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str||'--:--'}</div><div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall||'--'}</div>`
                            :`<div class="gs-absent-label">غائب</div>`}
                    </div>
                </div>`;
        });

        const extraAttendees = [...attendanceMap.entries()].filter(([id]) => !masterList.find(s=>s.id===id));
        extraAttendees.forEach(([id,rec]) => {
            rowsHTML += `
                <div class="gs-student-row" style="background:#fffbeb;border-left:3px solid #f59e0b;">
                    <div class="gs-status-badge present" style="background:#fef9c3;color:#ca8a04;"><i class="fa-solid fa-star" style="font-size:9px;"></i></div>
                    <div class="gs-student-info">
                        <div class="gs-student-name">${rec.name||id}</div>
                        <div class="gs-student-id">${id} <span style="color:#f59e0b;font-size:9px;font-weight:700;">(خارج النطاق)</span></div>
                    </div>
                    <div class="gs-att-details">
                        <div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${rec.time_str||'--:--'}</div>
                        <div class="gs-att-hall"><i class="fa-solid fa-building-columns" style="font-size:9px;"></i> ${rec.hall||'—'}</div>
                    </div>
                </div>`;
        });

        const backBtn = multiSubject ? `<button class="gs-back-btn" onclick="window._gsBackToSubjects()"><i class="fa-solid fa-chevron-right"></i> العودة للمواد</button>` : '';
        const detailHTML = `
            <div class="gs-detail-view">
                ${backBtn}
                <div class="gs-subject-header" style="margin-top:${multiSubject?'8px':'0'};">
                    <div class="gs-subject-name"><i class="fa-solid fa-book-open" style="color:#0ea5e9;margin-left:6px;"></i>${subjectName}</div>
                    <div class="gs-doctor-name"><i class="fa-solid fa-chalkboard-user" style="margin-left:4px;"></i>${doctorName||'—'}</div>
                </div>
                <div style="padding:10px 18px 4px;display:flex;align-items:center;gap:12px;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;">نسبة الحضور</div>
                    <div class="gs-percent-bar-wrap" style="flex:1;width:auto;"><div class="gs-percent-bar-fill" style="width:0%;background:${barColor};"></div></div>
                    <div style="font-size:13px;font-weight:900;color:${barColor};">${pct}%</div>
                </div>
                <div style="padding:4px 18px 8px;display:flex;gap:8px;">
                    <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                    <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                    <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${masterList.length+extraAttendees.length}</div>
                </div>
                ${rowsHTML||'<div class="gs-state-box"><i class="fa-solid fa-folder-open"></i>لا توجد بيانات طلاب</div>'}
                <div class="gs-download-bar">
                    <div class="gs-dl-info"><i class="fa-solid fa-circle-info" style="color:#0ea5e9;margin-left:4px;"></i> ${masterList.length} طالب · ${presentCount} حاضر · ${absentCount} غائب</div>
                    <button class="gs-btn-download gs-btn-csv" onclick="window.gsExportCSV('${groupCode}','${targetDate}','${subjectName.replace(/'/g,"\\'")}')"><i class="fa-solid fa-file-csv"></i> CSV</button>
                    <button class="gs-btn-download gs-btn-excel" onclick="window.gsExportExcel('${groupCode}','${targetDate}','${subjectName.replace(/'/g,"\\'")}')"><i class="fa-solid fa-file-excel"></i> تحميل Excel</button>
                </div>
            </div>`;

        if (multiSubject) {
            const existingHeader = container.querySelector('.gs-results-header');
            container.innerHTML = (existingHeader?existingHeader.outerHTML:'') + detailHTML;
        } else {
            container.style.display = 'flex';
            container.innerHTML = `
                <div class="gs-results-header">
                    <div>
                        <div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px;margin-left:6px;"></i>${groupCode.toUpperCase()}</div>
                        <div style="font-size:11px;color:#94a3b8;margin-top:3px;direction:ltr;">${targetDate}</div>
                    </div>
                    <div class="gs-stats-row">
                        <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                        <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                        <div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${masterList.length+extraAttendees.length}</div>
                    </div>
                </div>${detailHTML}`;
        }
        setTimeout(()=>{ container.querySelectorAll('.gs-percent-bar-fill').forEach(b=>b.style.width=pct+'%'); },50);
    };

    // ================================================================
    // Group Search — performSearch
    // ================================================================
    const performSearch = async () => {
        const input     = document.getElementById('groupCodeInput');
        const dateInput = document.getElementById('groupSearchDate');
        const btn       = document.getElementById('btnGroupSearch');
        const container = document.getElementById('groupSearchResults');

        const groupCode = (input?.value||'').trim().toUpperCase();
        const resolvedGroupCodes = window.resolveGroups ? window.resolveGroups(groupCode) : [groupCode];
        const targetDate = dateInput?.value ? fmtDate(dateInput.value) : todayStr();

        if (!groupCode) { showToast?.('⚠️ أدخل كود الجروب أولاً',2500,'#f59e0b'); input?.focus(); return; }

        const groupPattern = _buildGroupPattern();
        if (!groupPattern.test(groupCode)) {
            const ex = _collegeLetter ? `مثال صحيح: 1${_collegeLetter}2` : 'تحقق من كود الجروب';
            showToast?.(`⚠️ صيغة غير صحيحة. ${ex}`,3000,'#ef4444'); input?.focus(); return;
        }

        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        btn.disabled = true;
        showSkeleton(container);
        window._gsLastData = { groupCode, targetDate, masterList:[], subjectsMap:{} };

        try {
            const db = window.db;
            if (!db) throw new Error('قاعدة البيانات غير متاحة');
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            let masterList = [];
            const regConstraints = [where('registrationInfo.group','in',resolvedGroupCodes)];
            if (_doctorCollege) regConstraints.push(where('registrationInfo.college','==',_doctorCollege));
            const usersSnap = await getDocs(query(collection(db,'user_registrations'),...regConstraints));
            usersSnap.forEach(d => {
                const info = d.data().registrationInfo || d.data();
                if (info.studentID) masterList.push({ id:String(info.studentID).trim(), name:info.fullName||'غير معروف', uid:d.id });
            });

            if (masterList.length === 0) {
                const stConstraints = [where('group_code','in',resolvedGroupCodes)];
                if (_doctorCollege) stConstraints.push(where('college','==',_doctorCollege));
                const studentsSnap = await getDocs(query(collection(db,'students'),...stConstraints));
                studentsSnap.forEach(d => {
                    const data = d.data();
                    masterList.push({ id:String(data.id||d.id).trim(), name:data.name||'غير معروف', uid:d.id });
                });
            }

            masterList.sort((a,b) => a.name.localeCompare(b.name,'ar'));

            const attConstraints = [where('date','==',targetDate), where('group','in',resolvedGroupCodes)];
            if (_doctorCollege) attConstraints.push(where('college','==',_doctorCollege));
            const attSnap = await getDocs(query(collection(db,'attendance'),...attConstraints));

            const subjectsMap = {};
            attSnap.forEach(d => {
                const data = d.data();
                if (data.status === 'ABSENT') return; // تجاهل الغائبين
                const sid  = String(data.id||'').trim();
                const subj = (data.subject||'—').trim();
                const doctor = data.doctorName||'—';
                if (!subjectsMap[subj]) subjectsMap[subj] = { attendanceMap:new Map(), doctorName:doctor };
                if (sid) subjectsMap[subj].attendanceMap.set(sid, { name:data.name||'', subject:subj, doctorName:doctor, time_str:data.time_str||'--:--', hall:data.hall||'—', group:data.group||groupCode });
            });

            if (Object.keys(subjectsMap).length === 0 && masterList.length > 0) {
                const ids = masterList.map(s=>s.id);
                const chunks = [];
                for (let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
                for (const chunk of chunks) {
                    const fbC = [where('date','==',targetDate), where('id','in',chunk)];
                    if (_doctorCollege) fbC.push(where('college','==',_doctorCollege));
                    const chunkSnap = await getDocs(query(collection(db,'attendance'),...fbC));
                    chunkSnap.forEach(d => {
                        const data = d.data();
                        if (data.status === 'ABSENT') return;
                        const sid  = String(data.id||'').trim();
                        const subj = (data.subject||'—').trim();
                        const doctor = data.doctorName||'—';
                        if (!subjectsMap[subj]) subjectsMap[subj] = { attendanceMap:new Map(), doctorName:doctor };
                        if (sid) subjectsMap[subj].attendanceMap.set(sid, { name:data.name||'', subject:subj, doctorName:doctor, time_str:data.time_str||'--:--', hall:data.hall||'—', group:data.group||groupCode });
                    });
                }
            }

            window._gsLastData = { groupCode, targetDate, masterList, subjectsMap };
            const subjectNames = Object.keys(subjectsMap);

            if (masterList.length===0 && subjectNames.length===0) {
                container.style.display='flex';
                container.innerHTML=`<div class="gs-state-box"><i class="fa-solid fa-folder-open"></i>لم يُعثر على بيانات للجروب <strong>${groupCode}</strong><br><small style="color:#cbd5e1;font-size:11px;">تأكد من كود الجروب أو وجود طلاب مسجلين</small></div>`;
            } else if (subjectNames.length===1) {
                const subj = subjectNames[0];
                renderSingleSubject(groupCode, targetDate, masterList, subjectsMap[subj].attendanceMap, subj, subjectsMap[subj].doctorName, false);
            } else if (subjectNames.length===0 && masterList.length>0) {
                container.style.display='flex';
                container.innerHTML=`
                    <div class="gs-results-header">
                        <div><div class="gs-group-name"><i class="fa-solid fa-users" style="font-size:14px;margin-left:6px;"></i>${groupCode.toUpperCase()}</div><div style="font-size:11px;color:#94a3b8;margin-top:3px;direction:ltr;">${targetDate}</div></div>
                        <div class="gs-stats-row"><div class="gs-stat-pill gs-stat-total"><i class="fa-solid fa-users"></i> ${masterList.length} طالب</div></div>
                    </div>
                    <div class="gs-state-box"><i class="fa-solid fa-calendar-xmark"></i>لا يوجد حضور مسجل لهذا اليوم<br><small style="color:#cbd5e1;font-size:11px;">الجروب مسجل بـ ${masterList.length} طالب</small></div>`;
            } else {
                renderSubjectSelector(groupCode, targetDate, masterList, subjectsMap);
            }

        } catch (err) {
            console.error('Group Search Error:', err);
            container.style.display='flex';
            container.innerHTML=`<div class="gs-state-box error"><i class="fa-solid fa-triangle-exclamation"></i>حدث خطأ أثناء البحث<br><small style="font-size:10px;">${err.message}</small></div>`;
        } finally {
            btn.innerHTML = origText;
            btn.disabled  = false;
        }
    };

    window._gsOpenSubject = (subjectName) => {
        const data = window._gsLastData;
        if (!data) return;
        const info = data.subjectsMap[subjectName];
        if (!info) return;
        renderSingleSubject(data.groupCode, data.targetDate, data.masterList, info.attendanceMap, subjectName, info.doctorName, true);
        window._gsLastData._activeSubject = subjectName;
    };

    window._gsBackToSubjects = () => {
        const data = window._gsLastData;
        if (!data) return;
        renderSubjectSelector(data.groupCode, data.targetDate, data.masterList, data.subjectsMap);
        window._gsLastData._activeSubject = null;
    };

    // ================================================================
    // Subject Search
    // ================================================================
    window._gsToggleSubjectSearch = async () => {
        const panel = document.getElementById('subjectSearchPanel');
        const arrow = document.getElementById('subjectSearchArrow');
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        if (!isOpen) {
            const di = document.getElementById('subjectSearchDate');
            if (di && !di.value) di.value = todayISO();
            await _gsLoadSubjectsList();
        }
    };

    async function _gsLoadSubjectsList() {
        const listEl = document.getElementById('subjectsList');
        if (!listEl) return;

        const YEAR_LABELS = { first_year:'الفرقة الأولى', second_year:'الفرقة الثانية', third_year:'الفرقة الثالثة', fourth_year:'الفرقة الرابعة', fifth_year:'الفرقة الخامسة' };

        // ✅ المصدر: كل مواد الكلية من COLLEGE_SUBJECTS في config
        const collegeData = window.COLLEGE_SUBJECTS?.[_doctorCollege];

        if (collegeData && Object.keys(collegeData).length) {
            let html = '';
            Object.entries(collegeData).forEach(([year, subjects]) => {
                html += `<div class="gs-year-divider"><i class="fa-solid fa-layer-group"></i>${YEAR_LABELS[year]||year}</div>`;
                subjects.forEach(name => {
                    html += `<div class="gs-subject-item" onclick="window._gsSelectSubject('${name.replace(/'/g,"\\'")}')">
                        <div class="gs-subject-item-name">${name}</div>
                        <i class="fa-solid fa-chevron-left" style="color:#94a3b8;font-size:11px;"></i>
                    </div>`;
                });
            });
            listEl.innerHTML = html;
            const di = document.getElementById('subjectSearchDate');
            if (di) di.onchange = () => { if(window._gsLastSubject) window._gsSelectSubject(window._gsLastSubject); };
            return;
        }

        // Fallback: لو COLLEGE_SUBJECTS مش متاح → Firestore
        listEl.innerHTML = `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:12px;"><i class="fa-solid fa-circle-notch fa-spin" style="margin-bottom:8px;display:block;font-size:20px;color:#7c3aed;"></i>جاري تحميل المواد...</div>`;
        try {
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const db = window.db;
            const snap = await getDocs(query(collection(db,'subject_enrollments'), where('college','==',_doctorCollege)));
            const subjectsSet = new Set();
            snap.forEach(d => { if(d.data().subjectName) subjectsSet.add(d.data().subjectName); });

            if (!subjectsSet.size) {
                listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;"><i class="fa-solid fa-book-open" style="font-size:24px;margin-bottom:8px;display:block;"></i>لا توجد مواد للكلية</div>`;
                return;
            }

            let html = '';
            [...subjectsSet].sort().forEach(name => {
                html += `<div class="gs-subject-item" onclick="window._gsSelectSubject('${name.replace(/'/g,"\\'")}')">
                    <div class="gs-subject-item-name">${name}</div>
                    <i class="fa-solid fa-chevron-left" style="color:#94a3b8;font-size:11px;"></i>
                </div>`;
            });
            listEl.innerHTML = html;
            const di = document.getElementById('subjectSearchDate');
            if (di) di.onchange = () => { if(window._gsLastSubject) window._gsSelectSubject(window._gsLastSubject); };
        } catch(e) {
            console.error('_gsLoadSubjectsList:',e);
            listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:12px;"><i class="fa-solid fa-triangle-exclamation" style="font-size:24px;margin-bottom:8px;display:block;"></i>خطأ في تحميل المواد</div>`;
        }
    }

    window._gsSelectSubject = async (subjectName) => {
        window._gsLastSubject = subjectName;
        const di = document.getElementById('subjectSearchDate');
        const resultsEl = document.getElementById('subjectSearchResults');
        if (!resultsEl) return;
        const isoDate  = di?.value || todayISO();
        const [y,m,d]  = isoDate.split('-');
        const targetDate = `${d}/${m}/${y}`;

        resultsEl.style.display = 'flex';
        resultsEl.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;font-size:12px;font-weight:600;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px;color:#7c3aed;margin-bottom:10px;display:block;"></i>جاري البحث في "${subjectName}"...</div>`;
        document.getElementById('subjectSearchPanel').style.display = 'none';
        document.getElementById('subjectSearchArrow').style.transform = 'rotate(0deg)';

        try {
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const db = window.db;

            // ✅ الـ collection الصح هو 'attendance' مش 'attendance_PT'
            const attSnap = await getDocs(query(
                collection(db,'attendance'),
                where('subject','==',subjectName),
                where('date','==',targetDate),
                where('college','==',_doctorCollege),
                where('status','==','ATTENDED')
            ));

            if (attSnap.empty) {
                resultsEl.innerHTML = `
                    <div class="gs-results-header" style="background:linear-gradient(135deg,#4c1d95,#6d28d9);">
                        <div><div class="gs-group-name" style="color:#c4b5fd;">${subjectName}</div><div style="font-size:11px;color:#a78bfa;margin-top:3px;">${targetDate}</div></div>
                    </div>
                    <div class="gs-state-box"><i class="fa-solid fa-calendar-xmark"></i>لا يوجد حضور مسجل لهذه المادة في ${targetDate}</div>
                    <button class="gs-back-btn" style="margin:10px 18px;" onclick="window._gsBackToSubjectList()"><i class="fa-solid fa-chevron-right"></i> العودة لقائمة المواد</button>`;
                return;
            }

            // تجميع حسب الدكتور
            const doctorsMap = new Map();
            attSnap.forEach(d => {
                const data = d.data();
                const uid  = data.doctorUID || 'unknown';
                const name = data.doctorName || '—';
                if (!doctorsMap.has(uid)) doctorsMap.set(uid,{name,records:[]});
                doctorsMap.get(uid).records.push(data);
            });

            if (doctorsMap.size === 1) {
                const [uid,info] = [...doctorsMap.entries()][0];
                await _gsShowSubjectAttendance(subjectName, targetDate, info.records, info.name, uid);
            } else {
                _gsShowDoctorSelector(subjectName, targetDate, doctorsMap);
            }
        } catch(e) {
            console.error('_gsSelectSubject:',e);
            resultsEl.innerHTML = `<div class="gs-state-box error"><i class="fa-solid fa-triangle-exclamation"></i>خطأ: ${e.message}</div>`;
        }
    };

    function _gsShowDoctorSelector(subjectName, targetDate, doctorsMap) {
        const resultsEl = document.getElementById('subjectSearchResults');
        const escaped = subjectName.replace(/'/g,"\\'");
        let html = '';
        doctorsMap.forEach((info,uid) => {
            const initials = info.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
            html += `
                <div class="gs-doctor-card" onclick="window._gsSelectDoctor('${escaped}','${targetDate}','${uid}')">
                    <div class="gs-doctor-avatar">${initials}</div>
                    <div class="gs-doctor-info">
                        <div class="gs-doctor-name-text">${info.name}</div>
                        <div class="gs-doctor-count"><i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:9px;"></i> ${info.records.length} سجل حضور</div>
                    </div>
                    <i class="fa-solid fa-chevron-left" style="color:#94a3b8;font-size:12px;"></i>
                </div>`;
        });
        resultsEl.innerHTML = `
            <div class="gs-results-header" style="background:linear-gradient(135deg,#4c1d95,#6d28d9);">
                <div><div class="gs-group-name" style="color:#c4b5fd;"><i class="fa-solid fa-book-open" style="font-size:14px;margin-left:6px;"></i>${subjectName}</div><div style="font-size:11px;color:#a78bfa;margin-top:3px;">${targetDate}</div></div>
                <div class="gs-stat-pill" style="background:#6d28d920;color:#c4b5fd;"><i class="fa-solid fa-chalkboard-user"></i> ${doctorsMap.size} دكاترة</div>
            </div>
            <div style="padding:12px 16px 6px;">
                <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;"><i class="fa-solid fa-chalkboard-user" style="color:#7c3aed;"></i> اختر الدكتور لعرض الكشف</div>
                ${html}
            </div>
            <button class="gs-back-btn" style="margin:0 18px 12px;" onclick="window._gsBackToSubjectList()"><i class="fa-solid fa-chevron-right"></i> العودة لقائمة المواد</button>`;
        window._gsLastDoctorsMap = { subjectName, targetDate, doctorsMap };
    }

    window._gsSelectDoctor = async (subjectName, targetDate, docUID) => {
        const data = window._gsLastDoctorsMap;
        if (!data) return;
        const info = data.doctorsMap.get(docUID);
        if (!info) return;
        await _gsShowSubjectAttendance(subjectName, targetDate, info.records, info.name, docUID, true);
    };

    async function _gsShowSubjectAttendance(subjectName, targetDate, records, doctorName, docUID, multiDoctor=false) {
        const resultsEl = document.getElementById('subjectSearchResults');
        try {
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const db = window.db;

            let enrolledStudents = [];
            const [ownSnap, sharedSnap] = await Promise.all([
                getDocs(query(collection(db,'subject_enrollments'), where('doctorUID','==',docUID), where('subjectName','==',subjectName))),
                getDocs(query(collection(db,'subject_enrollments'), where('sharedWithAll','==',true), where('subjectName','==',subjectName), where('college','==',_doctorCollege)))
            ]);
            if (!ownSnap.empty) ownSnap.forEach(d => { if(Array.isArray(d.data().students)) enrolledStudents.push(...d.data().students); });
            else if (!sharedSnap.empty) sharedSnap.forEach(d => { if(Array.isArray(d.data().students)) enrolledStudents.push(...d.data().students); });

            const attendanceMap = new Map();
            records.forEach(rec => {
                const sid = String(rec.id||'').trim();
                if (sid) attendanceMap.set(sid, rec);
            });

            const masterMap = new Map();
            enrolledStudents.forEach(s => masterMap.set(String(s.id).trim(), {...s, status:'absent'}));
            attendanceMap.forEach((rec,sid) => {
                if (masterMap.has(sid)) { masterMap.get(sid).status='present'; masterMap.get(sid).rec=rec; }
                else masterMap.set(sid,{id:sid, name:rec.name||sid, status:'extra', rec});
            });

            // ترتيب: مسجلين بالـ ID تصاعدي، إضافيين في الآخر
            const rows = [...masterMap.values()].sort((a,b) => {
                const ae = a.status==='extra'?1:0, be = b.status==='extra'?1:0;
                if (ae!==be) return ae-be;
                return String(a.id).localeCompare(String(b.id),undefined,{numeric:true});
            });

            const presentCount = rows.filter(r=>r.status==='present').length;
            const absentCount  = rows.filter(r=>r.status==='absent').length;
            const extraCount   = rows.filter(r=>r.status==='extra').length;
            const base = rows.length - extraCount;
            const pct  = base ? Math.round((presentCount/base)*100) : 0;
            const barColor = pct>=75?'#22c55e':pct>=50?'#f59e0b':'#ef4444';

            const rowsHTML = rows.map(r => {
                if (r.status==='present') return `
                    <div class="gs-student-row">
                        <div class="gs-status-badge present"><i class="fa-solid fa-check"></i></div>
                        <div class="gs-student-info"><div class="gs-student-name">${r.name}</div><div class="gs-student-id">${r.id}</div></div>
                        <div class="gs-att-details">
                            <div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${r.rec?.time_str||'--:--'}</div>
                            <div class="gs-att-hall">${r.rec?.group||'--'}</div>
                        </div>
                    </div>`;
                if (r.status==='absent') return `
                    <div class="gs-student-row absent">
                        <div class="gs-status-badge absent"><i class="fa-solid fa-xmark"></i></div>
                        <div class="gs-student-info"><div class="gs-student-name">${r.name}</div><div class="gs-student-id">${r.id}</div></div>
                        <div class="gs-att-details"><div class="gs-absent-label">غائب</div></div>
                    </div>`;
                return `
                    <div class="gs-student-row" style="background:#fffbeb;border-left:3px solid #f59e0b;">
                        <div class="gs-status-badge present" style="background:#fef9c3;color:#ca8a04;"><i class="fa-solid fa-star" style="font-size:9px;"></i></div>
                        <div class="gs-student-info">
                            <div class="gs-student-name">${r.name}</div>
                            <div class="gs-student-id">${r.id} <span style="color:#f59e0b;font-size:9px;font-weight:700;">(إضافي)</span></div>
                        </div>
                        <div class="gs-att-details">
                            <div class="gs-att-time"><i class="fa-regular fa-clock" style="font-size:9px;"></i> ${r.rec?.time_str||'--:--'}</div>
                            <div class="gs-att-hall">${r.rec?.group||'--'}</div>
                        </div>
                    </div>`;
            }).join('');

            const backBtn = multiDoctor
                ? `<button class="gs-back-btn" onclick="window._gsBackToDoctors()"><i class="fa-solid fa-chevron-right"></i> العودة للدكاترة</button>`
                : `<button class="gs-back-btn" onclick="window._gsBackToSubjectList()"><i class="fa-solid fa-chevron-right"></i> العودة لقائمة المواد</button>`;

            const escaped = subjectName.replace(/'/g,"\\'");
            const docEsc  = doctorName.replace(/'/g,"\\'");

            resultsEl.innerHTML = `
                <div class="gs-results-header" style="background:linear-gradient(135deg,#4c1d95,#6d28d9);">
                    <div>
                        <div class="gs-group-name" style="color:#c4b5fd;"><i class="fa-solid fa-book-open" style="font-size:14px;margin-left:6px;"></i>${subjectName}</div>
                        <div style="font-size:11px;color:#a78bfa;margin-top:3px;">${targetDate} · ${doctorName}</div>
                    </div>
                    <div class="gs-stats-row">
                        <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                        <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                    </div>
                </div>
                ${backBtn}
                <div style="padding:10px 18px 4px;display:flex;align-items:center;gap:12px;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;">نسبة الحضور</div>
                    <div class="gs-percent-bar-wrap" style="flex:1;width:auto;"><div class="gs-percent-bar-fill" style="width:0%;background:${barColor};"></div></div>
                    <div style="font-size:13px;font-weight:900;color:${barColor};">${pct}%</div>
                </div>
                <div style="padding:4px 18px 8px;display:flex;gap:8px;">
                    <div class="gs-stat-pill gs-stat-present"><i class="fa-solid fa-circle-check"></i> ${presentCount} حاضر</div>
                    <div class="gs-stat-pill gs-stat-absent"><i class="fa-solid fa-circle-xmark"></i> ${absentCount} غائب</div>
                    ${extraCount?`<div class="gs-stat-pill" style="background:#fef9c3;color:#ca8a04;"><i class="fa-solid fa-star"></i> ${extraCount} إضافي</div>`:''}
                </div>
                ${rowsHTML||'<div class="gs-state-box"><i class="fa-solid fa-folder-open"></i>لا توجد بيانات</div>'}
                <div class="gs-download-bar">
                    <div class="gs-dl-info">${enrolledStudents.length} مسجل · ${presentCount} حاضر · ${absentCount} غائب${extraCount?` · ${extraCount} إضافي`:''}</div>
                    <button class="gs-btn-download gs-btn-excel" onclick="window._gsExportSubjectExcel('${escaped}','${targetDate}','${docEsc}')">
                        <i class="fa-solid fa-file-excel"></i> تحميل Excel
                    </button>
                </div>`;

            setTimeout(()=>{ resultsEl.querySelectorAll('.gs-percent-bar-fill').forEach(b=>b.style.width=pct+'%'); },50);
            window._gsLastSubjectData = { subjectName, targetDate, doctorName, rows, enrolledStudents };

        } catch(e) {
            console.error('_gsShowSubjectAttendance:',e);
            resultsEl.innerHTML = `<div class="gs-state-box error"><i class="fa-solid fa-triangle-exclamation"></i>خطأ: ${e.message}</div>`;
        }
    }

    window._gsBackToDoctors = () => {
        const data = window._gsLastDoctorsMap;
        if (data) _gsShowDoctorSelector(data.subjectName, data.targetDate, data.doctorsMap);
    };

    window._gsBackToSubjectList = () => {
        const el = document.getElementById('subjectSearchResults');
        if (el) { el.style.display='none'; el.innerHTML=''; }
        document.getElementById('subjectSearchPanel').style.display = 'block';
        document.getElementById('subjectSearchArrow').style.transform = 'rotate(180deg)';
    };

    window._gsExportSubjectExcel = (subjectName, targetDate, doctorName) => {
        const data = window._gsLastSubjectData;
        if (!data || typeof XLSX==='undefined') return;
        const wsData = [['م','الرقم الجامعي','اسم الطالب','الجروب','الحالة','وقت الحضور','المادة','الدكتور','التاريخ']];
        data.rows.forEach((r,i) => wsData.push([
            i+1, r.id, r.name, r.rec?.group||'--',
            r.status==='present'?'✅ حاضر':r.status==='extra'?'⭐ إضافي':'❌ غائب',
            r.rec?.time_str||'--', subjectName, doctorName, targetDate
        ]));
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{wch:5},{wch:14},{wch:32},{wch:10},{wch:12},{wch:12},{wch:30},{wch:25},{wch:12}];
        ws['!views'] = [{RTL:true}];
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C=range.s.c;C<=range.e.c;C++) {
            const ref = XLSX.utils.encode_cell({c:C,r:0});
            if(ws[ref]) ws[ref].s = {font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'4C1D95'}},alignment:{horizontal:'center'}};
        }
        for (let R=1;R<=range.e.r;R++) {
            const statusVal = ws[XLSX.utils.encode_cell({r:R,c:4})]?.v||'';
            const bg = statusVal.includes('غائب')?'FEE2E2':statusVal.includes('إضافي')?'FEFCE8':'F0FDF4';
            for (let C=range.s.c;C<=range.e.c;C++) {
                const ref = XLSX.utils.encode_cell({r:R,c:C});
                if(ws[ref]) ws[ref].s = {fill:{patternType:'solid',fgColor:{rgb:bg}},alignment:{horizontal:'center'}};
            }
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'كشف الحضور');
        XLSX.writeFile(wb, `حضور_${subjectName.replace(/[\s/\\?*[\]]/g,'_')}_${targetDate.replace(/\//g,'-')}.xlsx`);
        showToast?.('✅ تم التحميل بنجاح',3000,'#10b981');
    };

    // ================================================================
    // Group Search — Export
    // ================================================================
    const buildExportRows = (groupCode, targetDate, subjectFilter) => {
        const data = window._gsLastData;
        if (!data) return [];
        const { masterList, subjectsMap } = data;
        const subj = subjectFilter || Object.keys(subjectsMap)[0];
        const info = subjectsMap[subj];
        if (!info) return [];
        const { attendanceMap } = info;
        const rows = [];
        masterList.forEach((student,idx) => {
            const rec = attendanceMap.get(student.id);
            rows.push({'م':idx+1,'اسم الطالب':student.name,'الرقم الجامعي':student.id,'المجموعة':groupCode,'الكلية':_doctorCollege||'--','التاريخ':targetDate,'المادة':subj,'الحالة':rec?'✅ حاضر':'❌ غائب','وقت الحضور':rec?(rec.time_str||'--'):'--','القاعة':rec?(rec.hall||'--'):'--','المحاضر':rec?(rec.doctorName||'--'):'--','ملاحظات':rec?'منضبط':'لم يحضر'});
        });
        [...attendanceMap.entries()].forEach(([id,rec]) => {
            if (!masterList.find(s=>s.id===id)) rows.push({'م':rows.length+1,'اسم الطالب':rec.name||id,'الرقم الجامعي':id,'المجموعة':groupCode+' (إضافي)','الكلية':_doctorCollege||'--','التاريخ':targetDate,'المادة':subj,'الحالة':'✅ حاضر إضافي','وقت الحضور':rec.time_str||'--','القاعة':rec.hall||'--','المحاضر':rec.doctorName||'--','ملاحظات':'حضر من جروب آخر'});
        });
        return rows;
    };

    window.gsExportExcel = (groupCode, targetDate, subjectName) => {
        if (!window._gsLastData) return;
        if (typeof XLSX==='undefined') { showToast?.('⚠️ مكتبة Excel غير محملة',3000,'#ef4444'); return; }
        const subj = subjectName || window._gsLastData._activeSubject;
        const rows = buildExportRows(groupCode, targetDate, subj);
        if (!rows.length) { showToast?.('⚠️ لا توجد بيانات للتصدير',2500,'#f59e0b'); return; }
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{wch:5},{wch:32},{wch:15},{wch:10},{wch:10},{wch:12},{wch:30},{wch:14},{wch:12},{wch:10},{wch:25},{wch:15}];
        const range = XLSX.utils.decode_range(ws['!ref']);
        const hStyle = {font:{bold:true,color:{rgb:'FFFFFF'},sz:11},fill:{fgColor:{rgb:'0F172A'},patternType:'solid'},alignment:{horizontal:'center',vertical:'center',wrapText:true}};
        for (let C=range.s.c;C<=range.e.c;C++) { const hCell=XLSX.utils.encode_cell({r:0,c:C}); if(ws[hCell]) ws[hCell].s=hStyle; }
        for (let R=1;R<=range.e.r;R++) {
            const sv = ws[XLSX.utils.encode_cell({r:R,c:7})]?.v||'';
            const isAbsent=sv.includes('غائب'), isExtra=sv.includes('إضافي');
            const rowStyle={fill:{patternType:'solid',fgColor:{rgb:isAbsent?'FEE2E2':isExtra?'FEFCE8':'F0FDF4'}},alignment:{horizontal:'center'}};
            for(let C=range.s.c;C<=range.e.c;C++){const ref=XLSX.utils.encode_cell({r:R,c:C});if(ws[ref])ws[ref].s={...rowStyle};}
        }
        ws['!views'] = [{RTL:true}];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'كشف الحضور');
        XLSX.writeFile(wb,`حضور_${groupCode.replace(/[^a-zA-Z0-9]/g,'_')}${_doctorCollege?'_'+_doctorCollege:''}_${(subj||'').replace(/\s/g,'_').substring(0,20)}_${(targetDate||'').replace(/\//g,'-')}.xlsx`);
        showToast?.('✅ تم تحميل ملف Excel بنجاح',3000,'#10b981');
        if(navigator.vibrate) navigator.vibrate(50);
    };

    window.gsExportCSV = (groupCode, targetDate, subjectName) => {
        if (!window._gsLastData) return;
        const subj = subjectName || window._gsLastData._activeSubject;
        const rows = buildExportRows(groupCode, targetDate, subj);
        if (!rows.length) { showToast?.('⚠️ لا توجد بيانات',2500,'#f59e0b'); return; }
        const headers = Object.keys(rows[0]);
        let csv = '\uFEFF'+headers.join(',')+'\n';
        rows.forEach(row => { csv+=headers.map(h=>`"${(row[h]||'').toString().replace(/"/g,'""')}"`).join(',')+'\n'; });
        const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href=url; a.download=`حضور_${groupCode}_${(subj||'').replace(/\s/g,'_').substring(0,20)}_${(targetDate||'').replace(/\//g,'-')}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast?.('✅ تم تحميل CSV',2500,'#10b981');
    };

    // ================================================================
    // Init
    // ================================================================
    window.initGroupSearchModule = async () => {
        injectCSS();
        const target = document.getElementById('viewSubjects');
        if (!target) { console.warn('GroupSearchModule: #viewSubjects not found'); return; }

        const existing = document.getElementById(MODULE_ID);
        if (!existing) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildHTML();
            target.insertBefore(wrapper.firstElementChild, target.firstChild);
        }

        await _loadDoctorCollege();

        const badgeBox = document.getElementById('gsbCollegeBadge');
        if (badgeBox && _doctorCollege) {
            badgeBox.innerHTML = `<div class="gsb-college-badge"><i class="fa-solid fa-building-columns"></i> College: ${_doctorCollege}</div>`;
            const ci = document.getElementById('groupCodeInput');
            if (ci && _collegeLetter) ci.placeholder = `e.g. 1${_collegeLetter}2 or 1${_collegeLetter}1 GP`;
        }

        const dateInput = document.getElementById('groupSearchDate');
        if (dateInput) dateInput.value = todayISO();

        const codeInput = document.getElementById('groupCodeInput');
        if (codeInput) {
            codeInput.addEventListener('keydown', (e) => { if(e.key==='Enter') performSearch(); });
            codeInput.addEventListener('input', () => {
                const L = _collegeLetter || 'A-Z';
                const regex = new RegExp(`[^0-9${L}${L.toLowerCase()}Gg ]`,'g');
                codeInput.value = codeInput.value.replace(regex,'').toUpperCase();
            });
        }

        const btn = document.getElementById('btnGroupSearch');
        if (btn) btn.addEventListener('click', performSearch);

        console.log(`✅ GroupSearchModule mounted | College: ${_doctorCollege} | Letter: ${_collegeLetter}`);
    };

    const _originalOpenReportModal = window.openReportModal;
    if (typeof _originalOpenReportModal === 'function') {
        window.openReportModal = async function (...args) {
            await _originalOpenReportModal.apply(this, args);
            setTimeout(() => window.initGroupSearchModule(), 300);
        };
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const orig = window.openReportModal;
            if (typeof orig === 'function') {
                window.openReportModal = async function (...args) {
                    await orig.apply(this, args);
                    setTimeout(() => window.initGroupSearchModule(), 300);
                };
            }
        });
    }

})();