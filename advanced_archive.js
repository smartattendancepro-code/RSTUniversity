import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getAllSubjectsByCollege } from './config.js';

export class AdvancedArchiveManager {

    constructor() {
        this.isOpen = false;
        this.selectedGroups = new Set();
        this.doctorCollege = null;
        this.doctorName    = null;
        this.isAdmin       = false;
        this._mode         = 'subject';
        this.injectStyles();
        this.injectModal();
        this.setupListeners();
        this._loadDoctorInfo();
    }

    // ============================================
    // حرف الكلية
    // ============================================
    _getCollegeLetter() {
        const map = {
            "NURS": "G", "PT": "P", "PHARM": "C",
            "DENT": "D", "CS": "T", "BA": "B", "HS": "H"
        };
        return map[this.doctorCollege] || "G";
    }

    async _loadDoctorInfo() {
        try {
            const db   = window.db;
            const auth = window.auth;
            const user = auth?.currentUser;
            if (!user) return;

            const snap = await getDoc(doc(db, "faculty_members", user.uid));
            if (snap.exists()) {
                const data          = snap.data();
                this.doctorCollege  = data.college        || "NURS";
                this.doctorName     = data.fullName        || data.name || null;
                this.isAdmin        = data.isAdminDoctor   === true;
                console.log("🏫 Archive: College =", this.doctorCollege,
                            "| Admin =", this.isAdmin,
                            "| Name =",  this.doctorName);
            }
        } catch (e) {
            console.warn("Archive: Info fetch failed", e);
        }
    }

    // ============================================
    // STYLES
    // ============================================
    injectStyles() {
        const styleId = 'archive-modern-css';
        if (document.getElementById(styleId)) return;

        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');

            .adv-modal-overlay {
                position:fixed; top:0; left:0; width:100%; height:100%;
                background:rgba(2,6,23,0.75); backdrop-filter:blur(12px);
                z-index:99999; display:flex; align-items:center; justify-content:center;
                opacity:0; animation:advFadeIn 0.3s forwards;
            }
            .adv-modal-card {
                background:#fff; width:95%; max-width:520px;
                border-radius:28px; padding:0;
                box-shadow:0 0 0 1px rgba(0,0,0,0.06),0 32px 64px -12px rgba(0,0,0,0.18);
                font-family:'Outfit',sans-serif;
                transform:translateY(20px) scale(0.97);
                animation:advZoomIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
                max-height:92vh; overflow-y:auto; overflow-x:hidden;
            }
            .adv-modal-card::-webkit-scrollbar{width:4px}
            .adv-modal-card::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:4px}

            .adv-modal-header{padding:28px 28px 0;display:flex;justify-content:space-between;align-items:flex-start;}
            .adv-title{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;display:flex;align-items:center;gap:8px;}
            .adv-subtitle{font-size:12px;color:#94a3b8;margin-top:3px;font-weight:500;}
            .adv-close-btn{
                background:#f8fafc;border:1px solid #e2e8f0;width:34px;height:34px;
                border-radius:10px;color:#64748b;cursor:pointer;transition:all 0.2s;
                display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;
            }
            .adv-close-btn:hover{background:#fee2e2;border-color:#fca5a5;color:#dc2626;transform:rotate(90deg);}

            .adv-modal-body{padding:20px 28px 28px;}

            .adv-badge-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;}

            .adv-college-badge{
                display:inline-flex;align-items:center;gap:6px;
                background:linear-gradient(135deg,#e0f2fe,#dbeafe);
                color:#1d4ed8;padding:5px 12px;border-radius:20px;
                font-size:11px;font-weight:800;letter-spacing:0.5px;
                border:1px solid #bfdbfe;
                font-family:'JetBrains Mono',monospace;
            }
            .adv-admin-badge{
                display:inline-flex;align-items:center;gap:6px;
                background:linear-gradient(135deg,#fef3c7,#fde68a);
                color:#92400e;padding:5px 12px;border-radius:20px;
                font-size:11px;font-weight:800;letter-spacing:0.5px;
                border:1px solid #fcd34d;
                font-family:'JetBrains Mono',monospace;
            }

            .adv-label{
                font-size:11px;font-weight:800;color:#64748b;margin-bottom:8px;
                display:flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:0.6px;
            }
            .adv-input-group{margin-bottom:18px;}

            .adv-input{
                width:100%;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:12px;
                background:#f8fafc;color:#0f172a;font-size:13px;font-weight:600;
                font-family:'Outfit',sans-serif;transition:all 0.2s;box-sizing:border-box;
            }
            .adv-input:focus{outline:none;background:#fff;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.1);}
            .adv-input::placeholder{color:#cbd5e1;font-weight:500;}

            .adv-date-row{display:flex;gap:10px;}
            .adv-date-row .adv-input{flex:1;}

            .adv-mode-toggle{display:flex;gap:8px;margin-bottom:18px;}
            .adv-mode-btn{
                flex:1;padding:9px 12px;border-radius:10px;font-size:12px;font-weight:700;
                cursor:pointer;border:1.5px solid #e2e8f0;background:#f8fafc;color:#64748b;
                font-family:'Outfit',sans-serif;transition:all 0.2s;
                display:flex;align-items:center;justify-content:center;gap:6px;
            }
            .adv-mode-btn.active{background:linear-gradient(135deg,#ede9fe,#ddd6fe);border-color:#c4b5fd;color:#5b21b6;box-shadow:0 2px 8px rgba(99,102,241,0.15);}
            .adv-mode-btn:hover:not(.active){border-color:#c4b5fd;color:#5b21b6;}

            #advGroupSection{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:18px;}
            .adv-group-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
            .adv-group-label{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;display:flex;align-items:center;gap:6px;}
            .adv-optional-badge{background:#f1f5f9;color:#94a3b8;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;}
            .adv-group-container{
                border:1.5px solid #e2e8f0;border-radius:10px;background:#fff;padding:8px 10px;
                display:flex;flex-wrap:wrap;gap:6px;min-height:42px;align-items:center;
                cursor:pointer;transition:border-color 0.2s;
            }
            .adv-group-container:hover{border-color:#6366f1;}
            .adv-group-placeholder{color:#cbd5e1;font-size:12px;font-weight:600;}
            .adv-chip{
                background:linear-gradient(135deg,#ede9fe,#ddd6fe);color:#5b21b6;
                border-radius:8px;padding:3px 8px;font-size:11px;font-weight:800;
                display:flex;align-items:center;gap:5px;
                font-family:'JetBrains Mono',monospace;border:1px solid #c4b5fd;
            }
            .adv-chip-x{cursor:pointer;color:#7c3aed;opacity:0.6;font-size:14px;line-height:1;font-weight:900;transition:opacity 0.15s;}
            .adv-chip-x:hover{opacity:1;}
            .adv-group-dropdown{
                display:none;border:1.5px solid #e2e8f0;border-radius:12px;background:#fff;
                max-height:200px;overflow-y:auto;margin-top:8px;box-shadow:0 8px 24px rgba(0,0,0,0.1);
            }
            .adv-group-dropdown::-webkit-scrollbar{width:4px;}
            .adv-group-dropdown::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:4px;}
            .adv-group-dropdown.open{display:block;animation:advDropIn 0.2s ease;}
            .adv-group-option{
                padding:9px 12px;font-size:12px;font-weight:700;color:#334155;cursor:pointer;
                border-bottom:1px solid #f8fafc;display:flex;align-items:center;gap:8px;
                transition:background 0.12s;font-family:'JetBrains Mono',monospace;
            }
            .adv-group-option:last-child{border-bottom:none;}
            .adv-group-option:hover{background:#f5f3ff;color:#5b21b6;}
            .adv-group-option.selected{background:#ede9fe;color:#5b21b6;}
            .adv-chk{
                width:16px;height:16px;flex-shrink:0;border:2px solid #cbd5e1;border-radius:4px;
                display:flex;align-items:center;justify-content:center;font-size:10px;transition:all 0.15s;
            }
            .adv-group-option.selected .adv-chk{background:#7c3aed;border-color:#7c3aed;color:#fff;}
            .adv-clear-groups{
                background:none;border:none;cursor:pointer;font-size:11px;font-weight:700;
                color:#94a3b8;padding:2px 6px;border-radius:6px;transition:all 0.15s;
            }
            .adv-clear-groups:hover{background:#fee2e2;color:#dc2626;}

            /* Doctor scope toggle — admin only */
            #advScopeSection{margin-bottom:18px;}
            .adv-scope-toggle{display:flex;gap:8px;}
            .adv-scope-btn{
                flex:1;padding:9px 12px;border-radius:10px;font-size:12px;font-weight:700;
                cursor:pointer;border:1.5px solid #e2e8f0;background:#f8fafc;color:#64748b;
                font-family:'Outfit',sans-serif;transition:all 0.2s;
                display:flex;align-items:center;justify-content:center;gap:6px;
            }
            .adv-scope-btn.active{background:linear-gradient(135deg,#fef3c7,#fde68a);border-color:#fcd34d;color:#92400e;box-shadow:0 2px 8px rgba(251,191,36,0.2);}
            .adv-scope-btn:hover:not(.active){border-color:#fcd34d;color:#92400e;}

            .adv-btn-primary{
                width:100%;padding:14px;border:none;border-radius:14px;
                background:linear-gradient(135deg,#4f46e5,#6366f1);
                color:#fff;font-size:14px;font-weight:800;cursor:pointer;
                font-family:'Outfit',sans-serif;display:flex;align-items:center;
                justify-content:center;gap:10px;transition:all 0.2s;
                box-shadow:0 4px 14px rgba(99,102,241,0.35);letter-spacing:0.3px;
            }
            .adv-btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(99,102,241,0.45);background:linear-gradient(135deg,#4338ca,#4f46e5);}
            .adv-btn-primary:active{transform:translateY(0);}
            .adv-btn-primary:disabled{opacity:0.6;cursor:not-allowed;transform:none;}

            .adv-status{margin-top:14px;font-size:12px;color:#64748b;text-align:center;min-height:20px;font-weight:600;line-height:1.5;}
            .adv-divider{height:1px;background:#f1f5f9;margin:18px 0;}

            @keyframes advFadeIn  { to { opacity:1; } }
            @keyframes advZoomIn  { to { transform:translateY(0) scale(1); } }
            @keyframes advDropIn  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        `;
        const tag = document.createElement('style');
        tag.id = styleId;
        tag.textContent = css;
        document.head.appendChild(tag);
    }

    // ============================================
    // MODAL HTML
    // ============================================
    injectModal() {
        document.getElementById('advancedArchiveModal')?.remove();

        const html = `
        <div id="advancedArchiveModal" class="adv-modal-overlay" style="display:none;">
          <div class="adv-modal-card">

            <div class="adv-modal-header">
              <div>
                <div class="adv-title">
                  <i class="fa-solid fa-box-archive" style="color:#6366f1;font-size:16px;"></i>
                  Attendance Archive
                </div>
                <div class="adv-subtitle">Generate advanced Excel reports</div>
              </div>
              <button id="btnCloseArchive" class="adv-close-btn">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div class="adv-modal-body">

              <!-- Badges -->
              <div class="adv-badge-row" id="collegeBadgeBox"></div>

              <!-- Admin Scope Toggle (hidden for normal doctors) -->
              <div id="advScopeSection" style="display:none;">
                <label class="adv-label">
                  <i class="fa-solid fa-shield-halved" style="color:#f59e0b;"></i>
                  Admin Scope
                </label>
                <div class="adv-scope-toggle">
                  <button class="adv-scope-btn active" id="scopeMine"
                          onclick="window._advSetScope('mine')">
                    <i class="fa-solid fa-user"></i> My Sessions Only
                  </button>
                  <button class="adv-scope-btn" id="scopeAll"
                          onclick="window._advSetScope('all')">
                    <i class="fa-solid fa-users"></i> All Doctors
                  </button>
                </div>
              </div>

              <!-- Mode Toggle -->
              <div class="adv-mode-toggle" style="margin-top:14px;">
                <button class="adv-mode-btn active" id="modeBySubject"
                        onclick="window._advSetMode('subject')">
                  <i class="fa-solid fa-book-open"></i> بالمادة فقط
                </button>
                <button class="adv-mode-btn" id="modeByGroup"
                        onclick="window._advSetMode('group')">
                  <i class="fa-solid fa-users"></i> بالمادة + الجروب
                </button>
              </div>

              <!-- Date Range -->
              <div class="adv-input-group">
                <label class="adv-label">
                  <i class="fa-regular fa-calendar"></i> Date Range
                </label>
                <div class="adv-date-row">
                  <input type="date" id="advStartDate" class="adv-input">
                  <input type="date" id="advEndDate"   class="adv-input">
                </div>
              </div>

              <!-- Level + Subject -->
              <div class="adv-input-group">
                <label class="adv-label">
                  <i class="fa-solid fa-layer-group"></i> Academic Level & Subject
                </label>
                <select id="advLevelSelect" class="adv-input" style="margin-bottom:10px;cursor:pointer;">
                  <option value="" disabled selected>Select Level...</option>
                  <option value="1">Level 1 — First Year</option>
                  <option value="2">Level 2 — Second Year</option>
                  <option value="3">Level 3 — Third Year</option>
                  <option value="4">Level 4 — Fourth Year</option>
                  <option value="5">Level 5 — Fifth Year</option>
                </select>
                <input type="text" id="advSubjectInput" list="advSubjectList"
                       class="adv-input" placeholder="Type or select subject...">
                <datalist id="advSubjectList"></datalist>
              </div>

              <!-- Group Filter -->
              <div id="advGroupSection" style="display:none;">
                <div class="adv-group-header">
                  <div class="adv-group-label">
                    <i class="fa-solid fa-users" style="color:#7c3aed;"></i> Select Group(s)
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="adv-optional-badge">Optional</span>
                    <button class="adv-clear-groups" onclick="window._advClearGroups()">Clear</button>
                  </div>
                </div>
                <div class="adv-group-container" id="advGroupChipsContainer">
                  <span class="adv-group-placeholder" id="advGroupPlaceholder">
                    All groups — click to filter
                  </span>
                </div>
                <div class="adv-group-dropdown" id="advGroupDropdown"></div>
              </div>

              <div class="adv-divider"></div>

              <button id="btnGenerateExcel" class="adv-btn-primary">
                <i class="fa-solid fa-file-arrow-down"></i> Export Excel Report
              </button>

              <div id="advStatusLog" class="adv-status"></div>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    // ============================================
    // LISTENERS
    // ============================================
    setupListeners() {
        document.getElementById('btnCloseArchive').onclick = () => {
            document.getElementById('advancedArchiveModal').style.display = 'none';
            this.isOpen = false;
        };

        // Default dates
        const today        = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        document.getElementById('advEndDate').value   = today.toISOString().split('T')[0];
        document.getElementById('advStartDate').value = firstOfMonth.toISOString().split('T')[0];

        document.getElementById('advLevelSelect').addEventListener('change', (e) => {
            this._onLevelChange(e.target.value);
        });

        const subjectInput    = document.getElementById('advSubjectInput');
        const onSubjectChange = () => {
            const level   = document.getElementById('advLevelSelect').value;
            const subject = subjectInput.value.trim();
            if (level && subject && this._mode === 'group') {
                this._buildGroupDropdown(level);
                document.getElementById('advGroupSection').style.display = 'block';
            }
        };
        subjectInput.addEventListener('change', onSubjectChange);
        subjectInput.addEventListener('input',  onSubjectChange);

        document.getElementById('advGroupChipsContainer').addEventListener('click', () => {
            document.getElementById('advGroupDropdown').classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#advGroupSection'))
                document.getElementById('advGroupDropdown')?.classList.remove('open');
        });

        document.getElementById('btnGenerateExcel').addEventListener('click', () => {
            this.generateSmartReport();
        });

        // Global helpers
        window._advSetMode  = (mode)  => this._setMode(mode);
        window._advSetScope = (scope) => this._setScope(scope);
        window._advClearGroups = ()   => this._clearGroups();

        // Admin scope — default = mine
        this._scope = 'mine';
    }

    _setScope(scope) {
        this._scope = scope;
        document.getElementById('scopeMine').classList.toggle('active', scope === 'mine');
        document.getElementById('scopeAll' ).classList.toggle('active', scope === 'all');
    }

    _setMode(mode) {
        this._mode = mode;
        document.getElementById('modeBySubject').classList.toggle('active', mode === 'subject');
        document.getElementById('modeByGroup'  ).classList.toggle('active', mode === 'group');

        const groupSection = document.getElementById('advGroupSection');
        if (mode === 'subject') {
            groupSection.style.display = 'none';
            this._clearGroups();
        } else {
            const level   = document.getElementById('advLevelSelect').value;
            const subject = document.getElementById('advSubjectInput').value.trim();
            if (level && subject) {
                this._buildGroupDropdown(level);
                groupSection.style.display = 'block';
            }
        }
    }

    _onLevelChange(level) {
        const dl = document.getElementById('advSubjectList');
        dl.innerHTML = '';
        document.getElementById('advSubjectInput').value = '';
        this._clearGroups();
        document.getElementById('advGroupSection').style.display = 'none';

        const yearMap = {
            '1':'first_year','2':'second_year','3':'third_year',
            '4':'fourth_year','5':'fifth_year'
        };
        let subs = [];

        if (this.doctorCollege) {
            const allSubs = getAllSubjectsByCollege(this.doctorCollege);
            subs = Array.isArray(allSubs)
                ? allSubs
                : (allSubs[yearMap[level]] || allSubs[level] || []);
        } else {
            subs = (window.subjectsData || {})[yearMap[level]]
                || (window.subjectsData || {})[level] || [];
        }

        subs.forEach(s => {
            const o = document.createElement('option');
            o.value = s;
            dl.appendChild(o);
        });
    }

    _buildGroupDropdown(level) {
        const dropdown  = document.getElementById('advGroupDropdown');
        dropdown.innerHTML = '';
        const letter    = this._getCollegeLetter();
        const allGroups = [`${level}${letter}1 GP`];
        for (let i = 1; i <= 20; i++) allGroups.push(`${level}${letter}${i}`);

        allGroups.forEach(g => {
            const div = document.createElement('div');
            div.className     = 'adv-group-option';
            div.dataset.group = g;
            div.innerHTML     = `<div class="adv-chk"></div> ${g}`;
            div.addEventListener('click', (e) => { e.stopPropagation(); this._toggleGroup(g, div); });
            dropdown.appendChild(div);
        });
    }

    _toggleGroup(g, el) {
        if (this.selectedGroups.has(g)) {
            this.selectedGroups.delete(g);
            el.classList.remove('selected');
            el.querySelector('.adv-chk').textContent = '';
        } else {
            this.selectedGroups.add(g);
            el.classList.add('selected');
            el.querySelector('.adv-chk').textContent = '✓';
        }
        this._renderChips();
    }

    _renderChips() {
        const container = document.getElementById('advGroupChipsContainer');
        container.querySelectorAll('.adv-chip').forEach(c => c.remove());
        const ph = document.getElementById('advGroupPlaceholder');

        if (this.selectedGroups.size === 0) {
            ph.style.display = 'inline';
        } else {
            ph.style.display = 'none';
            this.selectedGroups.forEach(g => {
                const chip = document.createElement('span');
                chip.className = 'adv-chip';
                chip.innerHTML = `${g} <span class="adv-chip-x">×</span>`;
                chip.querySelector('.adv-chip-x').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectedGroups.delete(g);
                    const opt = document.querySelector(`#advGroupDropdown [data-group="${g}"]`);
                    if (opt) { opt.classList.remove('selected'); opt.querySelector('.adv-chk').textContent = ''; }
                    this._renderChips();
                });
                container.appendChild(chip);
            });
        }
    }

    _clearGroups() {
        this.selectedGroups = new Set();
        document.getElementById('advGroupChipsContainer')?.querySelectorAll('.adv-chip').forEach(x => x.remove());
        const ph = document.getElementById('advGroupPlaceholder');
        if (ph) ph.style.display = 'inline';
        const dd = document.getElementById('advGroupDropdown');
        if (dd) { dd.innerHTML = ''; dd.classList.remove('open'); }
    }

    // ============================================
    // OPEN
    // ============================================
    async open() {
        if (!this.doctorCollege) await this._loadDoctorInfo();

        const badgeBox = document.getElementById('collegeBadgeBox');
        if (badgeBox) {
            const letter = this._getCollegeLetter();
            let badges = `
                <div class="adv-college-badge">
                    <i class="fa-solid fa-building-columns"></i>
                    ${this.doctorCollege} · Groups: ${letter}xx
                </div>`;
            if (this.isAdmin) {
                badges += `
                <div class="adv-admin-badge">
                    <i class="fa-solid fa-crown"></i>
                    Admin
                </div>`;
            }
            badgeBox.innerHTML = badges;
        }

        // Show scope toggle only for admins
        document.getElementById('advScopeSection').style.display =
            this.isAdmin ? 'block' : 'none';

        this.isOpen = true;
        document.getElementById('advancedArchiveModal').style.display = 'flex';
    }

    // ============================================
    // GENERATE REPORT
    // ============================================
    async generateSmartReport() {
        const db   = window.db;
        const auth = window.auth;
        if (!db) { alert("Error: Database not initialized."); return; }

        const user = auth?.currentUser;
        if (!user) {
            document.getElementById('advStatusLog').innerHTML =
                '<span style="color:#ef4444;">⚠️ Not authenticated.</span>';
            return;
        }

        const startDateVal = document.getElementById('advStartDate').value;
        const endDateVal   = document.getElementById('advEndDate').value;
        const level        = document.getElementById('advLevelSelect').value;
        const subject      = document.getElementById('advSubjectInput').value.trim();
        const statusLog    = document.getElementById('advStatusLog');
        const btn          = document.getElementById('btnGenerateExcel');

        if (!startDateVal || !endDateVal || !subject) {
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ Please fill in: dates + subject.</span>';
            return;
        }

        const start = new Date(startDateVal); start.setHours(0,  0,  0,   0);
        const end   = new Date(endDateVal);   end.setHours(23, 59, 59, 999);

        if (start > end) {
            statusLog.innerHTML = '<span style="color:#ef4444;">⚠️ Start date cannot be after end date.</span>';
            return;
        }

        const college        = this.doctorCollege;
        const useGroupFilter = this._mode === 'group' && this.selectedGroups.size > 0;
        const filterGroups   = useGroupFilter ? new Set(this.selectedGroups) : null;

        // ── Admin scope ──
        // isAdmin + scopeAll  → جيب كل الدكاترة في نفس الكلية
        // isAdmin + scopeMine → جيب بتاعه بس
        // مش admin            → جيب بتاعه بس دايمًا
        const fetchAll = this.isAdmin && this._scope === 'all';

        const origBtn = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled  = true;
        statusLog.innerHTML = '';

        try {
            // ── 1. جيب الحضور ──
            statusLog.innerText = "⏳ Fetching attendance records...";

            const attConstraints = [
                where("subject", "==", subject),
                where("status",  "==", "ATTENDED")
            ];

            // لو مش fetchAll — فلتر بـ doctorUID بتاعه
            if (!fetchAll) {
                attConstraints.push(where("doctorUID", "==", user.uid));
            }

            const attSnap = await getDocs(
                query(collection(db, "attendance"), ...attConstraints)
            );

            if (attSnap.empty) {
                throw new Error(`No ATTENDED records found for "${subject}".`);
            }

            const activeDatesSet    = new Set();
            const attendanceRecords = [];
            const attendeesMap      = {};

            attSnap.forEach(docSnap => {
                const r = docSnap.data();

                // ── فلتر التاريخ ──
                const [dd, mm, yyyy] = r.date.split('/');
                const recDate = new Date(`${yyyy}-${mm}-${dd}`);
                if (recDate < start || recDate > end) return;

                // ── فلتر الكلية (كود — لأن مش كل الـ records فيها college field) ──
                // لو fetchAll → فلتر بكلية الأدمن بس (عشان مايجيبش كليات تانية)
                if (fetchAll && college) {
                    const recCollege = (r.college || '').toUpperCase().trim();
                    const myCollege  = college.toUpperCase().trim();
                    if (recCollege && recCollege !== myCollege) return;
                }

                // ── فلتر الجروب — اختياري ──
                const rg = (r.group || '').toUpperCase().trim();
                if (useGroupFilter && !filterGroups.has(rg)) return;

                activeDatesSet.add(r.date);
                attendanceRecords.push(r);

                if (!attendeesMap[r.id]) {
                    attendeesMap[r.id] = {
                        id: r.id,
                        name: r.name || '',
                        group: r.group || '--'
                    };
                }
            });

            const sortedDates = Array.from(activeDatesSet).sort((a, b) => {
                const toISO = s => s.split('/').reverse().join('');
                return toISO(a).localeCompare(toISO(b));
            });

            if (sortedDates.length === 0) {
                statusLog.innerHTML =
                    '<span style="color:#f59e0b;">⚠️ No sessions found in this date range.</span>';
                return;
            }

            // ── 2. جيب قائمة الطلاب ──
            statusLog.innerText = "⏳ Fetching student roster...";

            const masterMap = {};

            if (level) {
                const stConstraints = [where("academic_level", "==", level)];
                if (college) stConstraints.push(where("college", "==", college));

                const stSnap = await getDocs(
                    query(collection(db, "students"), ...stConstraints)
                );

                stSnap.forEach(docSnap => {
                    const s  = docSnap.data();
                    const rg = (s.group || s.group_code || s.groupCode || '--').toUpperCase().trim();
                    if (useGroupFilter && !filterGroups.has(rg)) return;

                    masterMap[s.id] = {
                        id: s.id, name: s.name, group: rg,
                        college: s.college || college || '--',
                        status: 'Regular', logs: {},
                        doctorsSeen: new Set(), presenceCount: 0
                    };
                });
            }

            // أضف الحاضرين اللي مش في students
            for (const [id, d] of Object.entries(attendeesMap)) {
                if (!masterMap[id]) {
                    masterMap[id] = {
                        id, name: d.name,
                        group: (d.group || '--').toUpperCase().trim(),
                        college: college || '--',
                        status: 'Carry-Over', logs: {},
                        doctorsSeen: new Set(), presenceCount: 0
                    };
                }
            }

            // ── 3. ربط الحضور ──
            statusLog.innerText = "⏳ Mapping attendance data...";

            attendanceRecords.forEach(r => {
                if (!masterMap[r.id]) return;
                masterMap[r.id].logs[r.date] = true;
                masterMap[r.id].presenceCount++;
                if (r.doctorName) masterMap[r.id].doctorsSeen.add(r.doctorName);
                if (r.group && r.group !== 'General' && r.group !== 'UNKNOWN') {
                    masterMap[r.id].group = r.group.toUpperCase().trim();
                }
            });

            const students = Object.values(masterMap).sort((a, b) => {
                const nA = parseInt(a.id), nB = parseInt(b.id);
                if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
                return String(a.id).localeCompare(String(b.id));
            });

            if (students.length === 0) {
                statusLog.innerHTML =
                    '<span style="color:#f59e0b;">⚠️ No students found for this selection.</span>';
                return;
            }

            // ── 4. بناء Excel ──
            statusLog.innerText = "⏳ Building Excel file...";

            const total = sortedDates.length;
            const rows  = [];

            students.forEach((st, idx) => {
                const present = st.presenceCount;
                const absent  = total - present;
                const pct     = total > 0 ? (present / total) * 100 : 0;
                const doctors = Array.from(st.doctorsSeen).join(', ') || '--';
                const rowRgb  = pct < 50 ? 'FEE2E2' : pct < 75 ? 'FEF3C7' : 'DCFCE7';

                const base = {
                    fill: { fgColor: { rgb: rowRgb } },
                    border: {
                        top:    { style:'thin', color:{ rgb:'E2E8F0' } },
                        bottom: { style:'thin', color:{ rgb:'E2E8F0' } },
                        left:   { style:'thin', color:{ rgb:'E2E8F0' } },
                        right:  { style:'thin', color:{ rgb:'E2E8F0' } }
                    },
                    alignment: { horizontal:'center', vertical:'center' },
                    font: { name:'Arial', sz:10 }
                };

                const row = {
                    '#':            { v: idx + 1,    s: base },
                    'Student ID':   { v: st.id,      s: base },
                    'Student Name': { v: st.name,    s: { ...base, alignment:{ horizontal:'right', vertical:'center' } } },
                    'Group':        { v: st.group,   s: base },
                    'College':      { v: st.college, s: base },
                    'Type':         { v: st.status,  s: st.status === 'Carry-Over'
                        ? { ...base, fill:{ fgColor:{ rgb:'FEF9C3' } }, font:{ name:'Arial', sz:9, italic:true, color:{ rgb:'92400E' } } }
                        : base },
                    'Attended':     { v: present,    s: { ...base, font:{ name:'Arial', sz:10, bold:true, color:{ rgb:'166534' } } } },
                    'Absent':       { v: absent,     s: { ...base, font:{ name:'Arial', sz:10, bold:true, color:{ rgb:'DC2626' } } } },
                    'Attendance%':  { v: `${Math.round(pct)}%`, s: { ...base, font:{ name:'Arial', sz:10, bold:true,
                        color:{ rgb: pct >= 75 ? '166534' : pct >= 50 ? '92400E' : 'DC2626' } } } },
                    'Instructor':   { v: doctors,    s: base },
                };

                sortedDates.forEach(d => {
                    const here = !!st.logs[d];
                    row[d] = {
                        v: here ? '✓' : '✗',
                        s: {
                            ...base,
                            fill: { fgColor:{ rgb: here ? 'DCFCE7' : 'FEE2E2' } },
                            font: { name:'Arial', sz:11, bold:true, color:{ rgb: here ? '166534' : 'DC2626' } }
                        }
                    };
                });

                rows.push(row);
            });

            const ws   = XLSX.utils.json_to_sheet(rows);
            const cols = [
                { wch:5  },{ wch:14 },{ wch:32 },{ wch:10 },
                { wch:8  },{ wch:10 },{ wch:9  },{ wch:8  },
                { wch:12 },{ wch:24 }
            ];
            sortedDates.forEach(() => cols.push({ wch:12 }));
            ws['!cols']  = cols;
            ws['!views'] = [{ RTL: false }];

            // Summary sheet
            const scopeLabel = fetchAll
                ? `All Doctors (${college})`
                : (this.doctorName || user.uid);

            const wsSummary = XLSX.utils.aoa_to_sheet([
                ['Field',           'Value'],
                ['Subject',         subject],
                ['College',         college    || 'All'],
                ['Level',           level      || 'All'],
                ['Groups',          useGroupFilter ? Array.from(filterGroups).join(', ') : 'All'],
                ['Scope',           scopeLabel],
                ['Date From',       startDateVal],
                ['Date To',         endDateVal],
                ['Total Sessions',  total],
                ['Total Students',  students.length],
                ['Regular',         students.filter(s => s.status === 'Regular').length],
                ['Carry-Over',      students.filter(s => s.status === 'Carry-Over').length],
            ]);
            wsSummary['!cols'] = [{ wch:22 },{ wch:40 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws,        'Attendance Report');
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

            const safeSubj  = subject.replace(/[/\\?*\[\]:?]/g,'_').substring(0,25);
            const colSuffix = college        ? `_${college}`                                    : '';
            const lvlSuffix = level          ? `_L${level}`                                     : '';
            const grpSuffix = useGroupFilter ? `_${Array.from(filterGroups).sort().join('-')}` : '';
            const scpSuffix = fetchAll       ? '_ALL'                                            : '';

            XLSX.writeFile(wb,
                `Archive${colSuffix}${lvlSuffix}_${safeSubj}${grpSuffix}${scpSuffix}_${startDateVal}_to_${endDateVal}.xlsx`
            );

            const carryOver = students.filter(s => s.status === 'Carry-Over').length;
            statusLog.innerHTML = `
                <span style="color:#10b981;">
                    ✅ Done!
                    <strong>${students.length}</strong> students ·
                    <strong>${total}</strong> sessions
                    ${carryOver > 0 ? ` · <span style="color:#f59e0b;">${carryOver} carry-over</span>` : ''}
                    ${fetchAll ? ` · <span style="color:#f59e0b;">All Doctors</span>` : ''}
                    ${college  ? ` · <strong>${college}</strong>` : ''}
                </span>`;

            if (window.playSuccess) window.playSuccess();

        } catch (err) {
            console.error('Archive Error:', err);
            statusLog.innerHTML = `<span style="color:#ef4444;">❌ ${err.message}</span>`;
        } finally {
            btn.innerHTML = origBtn;
            btn.disabled  = false;
        }
    }
}

if (!window.advancedArchiveSystem) {
    window.advancedArchiveSystem = new AdvancedArchiveManager();
}
console.log('Advanced Archive v6 Loaded 🚀');
