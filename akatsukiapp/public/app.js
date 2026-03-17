// ===================== EXAM CONFIG =====================
const EXAM_CONFIG = {
  IELTS: {
    label: 'IELTS Listening', icon: 'school',
    types: [
      { id: 'mcq', label: 'Multiple Choice', icon: 'radio_button_checked' },
      { id: 'table_completion', label: 'Table / Form Completion', icon: 'table_chart' },
      { id: 'note_completion', label: 'Note Completion', icon: 'sticky_note_2' },
      { id: 'sentence_completion', label: 'Sentence Completion', icon: 'short_text' },
      { id: 'matching', label: 'Matching', icon: 'compare_arrows' },
      { id: 'true_false_ng', label: 'True / False / Not Given', icon: 'fact_check' },
      { id: 'short_answer', label: 'Short Answer', icon: 'question_answer' },
    ]
  },
  TOEIC: {
    label: 'TOEIC Listening', icon: 'business_center',
    types: [
      { id: 'mcq', label: 'Multiple Choice', icon: 'radio_button_checked' },
      { id: 'true_false', label: 'True / False', icon: 'fact_check' },
      { id: 'fill_blank', label: 'Fill in the Blank', icon: 'edit_note' },
      { id: 'table_completion', label: 'Table Completion', icon: 'table_chart' },
      { id: 'short_answer', label: 'Short Answer', icon: 'question_answer' },
    ]
  },
  VSTEP: {
    label: 'VSTEP Listening', icon: 'verified',
    types: [
      { id: 'mcq', label: 'Multiple Choice', icon: 'radio_button_checked' },
      { id: 'true_false', label: 'True / False', icon: 'fact_check' },
      { id: 'fill_blank', label: 'Fill in the Blank', icon: 'edit_note' },
      { id: 'table_completion', label: 'Table Completion', icon: 'table_chart' },
      { id: 'note_completion', label: 'Note Completion', icon: 'sticky_note_2' },
      { id: 'short_answer', label: 'Short Answer', icon: 'question_answer' },
    ]
  },
  GENERAL: {
    label: 'University Exam', icon: 'apartment',
    types: [
      { id: 'mcq', label: 'Multiple Choice', icon: 'radio_button_checked' },
      { id: 'true_false', label: 'True / False', icon: 'fact_check' },
      { id: 'fill_blank', label: 'Fill in the Blank', icon: 'edit_note' },
      { id: 'table_completion', label: 'Table / Form Completion', icon: 'table_chart' },
      { id: 'note_completion', label: 'Note Completion', icon: 'sticky_note_2' },
      { id: 'sentence_completion', label: 'Sentence Completion', icon: 'short_text' },
      { id: 'short_answer', label: 'Short Answer', icon: 'question_answer' },
      { id: 'matching', label: 'Matching', icon: 'compare_arrows' },
    ]
  }
};

const TYPE_LABELS = {
  mcq: 'Multiple Choice', matching: 'Matching',
  true_false: 'True/False', true_false_ng: 'T/F/Not Given',
  fill_blank: 'Fill in Blank', sentence_completion: 'Sentence Completion',
  short_answer: 'Short Answer', form_completion: 'Form Completion',
  note_completion: 'Note Completion', table_completion: 'Table/Form Completion'
};

// ===================== STATE =====================
const state = {
  user: null, activeTab: 'library', selectedBankId: null,
  createStep: 1, audioFile: null, audioUrl: '', audioFilename: '',
  examType: 'IELTS',
  selectedQuestionTypes: ['mcq', 'table_completion', 'note_completion', 'sentence_completion', 'matching', 'true_false_ng', 'short_answer'],
  questionCount: 10,
  bankName: '', isPublic: false, generatedData: null,
  transcript: '', startTime: 0, endTime: 0, audioDuration: 0,
  selectedBank: null,
  testBank: null, answers: {}, isSubmitted: false, testScore: 0,
  isPlaying: false, currentTime: 0, duration: 0, savedQuestionIds: new Set(),
  // Practice mode
  practiceStep: 1, practiceAudioFile: null, practiceAudioUrl: '', practiceAudioFilename: '',
  practiceTranscript: '', practiceExamType: 'IELTS',
  practiceQuestionTypes: ['mcq', 'true_false'],
  practiceQuestionsPerType: 5, practiceTimer: 10,
  practiceTimeLeft: null, practiceTimerInterval: null,
  practiceQuestions: [], practiceAnswers: {},
  practiceScore: null, practiceSubmitted: false,
  practiceAudioDuration: 0, practiceStartTime: 0, practiceEndTime: 0,
  // AI Agent custom instructions per question type
  customInstructions: {},
};

// ===================== API =====================
const api = {
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
    return data;
  },
  async get(url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  },
  async patch(url, body) {
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }
};

// ===================== HELPERS =====================
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
function icon(name, cls = '') {
  return `<span class="material-symbols-outlined${cls ? ' ' + cls : ''}">${name}</span>`;
}
function roleLabel(r) { return r === 0 ? 'Admin' : r === 1 ? 'Lecturer' : 'Student'; }
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function normalizeQType(type) {
  return ({ form_completion: 'table_completion' })[type] || type || 'fill_blank';
}
function isAnswerCorrect(ua, ca, qType) {
  if (!ua || !ca) return false;
  const a = ua.trim(), b = ca.trim(), t = normalizeQType(qType);
  if (['mcq', 'matching'].includes(t)) return a.toUpperCase().charAt(0) === b.toUpperCase().charAt(0);
  if (['true_false', 'true_false_ng'].includes(t)) return a.toLowerCase() === b.toLowerCase();
  return a.toLowerCase().replace(/\s+/g, ' ') === b.toLowerCase().replace(/\s+/g, ' ');
}
function groupQuestionsByType(questions) {
  const groups = [];
  const seen = new Map();
  questions.forEach((q, idx) => {
    const t = normalizeQType(q.type);
    if (!seen.has(t)) { seen.set(t, groups.length); groups.push({ type: t, questions: [] }); }
    groups[seen.get(t)].questions.push({ q, idx });
  });
  return groups;
}
function getOptionText(options, letter) {
  if (!options || !letter) return letter || '';
  const opts = typeof options === 'string' ? JSON.parse(options) : options;
  return opts.find(o => o.charAt(0).toUpperCase() === letter.toUpperCase().charAt(0)) || letter;
}

// ===================== RENDER =====================
function render() {
  const app = document.getElementById('app');
  if (!state.user) { app.innerHTML = renderAuth(); return; }
  app.innerHTML = `${renderNavbar()}<main class="page-wrap">${state.selectedBankId ? renderTestEngine() : (state.practiceStep >= 3 ? renderPractice() : renderView())}</main>`;
  attachAudioEvents(); attachPracticeTimerUI();
}
function rerender() {
  if (!state.user) { render(); return; }
  const oldNav = document.querySelector('header.navbar');
  if (oldNav) { const t = document.createElement('div'); t.innerHTML = renderNavbar(); oldNav.replaceWith(t.firstElementChild); }
  const main = document.querySelector('main.page-wrap');
  if (main) { main.innerHTML = state.selectedBankId ? renderTestEngine() : (state.practiceStep >= 3 ? renderPractice() : renderView()); attachAudioEvents(); attachPracticeTimerUI(); }
}

function renderNavbar() {
  const tabs = [
    { id: 'library', label: 'Library', icon: 'grid_view', roles: null },
    { id: 'practice', label: 'Practice', icon: 'fitness_center', roles: [2] },
    { id: 'create', label: 'Create Test', icon: 'add_circle', roles: [0, 1] },
    { id: 'banks', label: 'Question Bank', icon: 'folder_open', roles: [0, 1] },
    { id: 'saved', label: 'Saved', icon: 'bookmark', roles: null },
    { id: 'results', label: 'My Progress', icon: 'analytics', roles: null },
  ].filter(t => !t.roles || t.roles.includes(state.user.role));
  return `
    <header class="navbar"><div class="navbar-inner">
      <div class="navbar-left">
        <div class="logo" data-action="goto" data-tab="library">
          <div class="logo-icon">${icon('token')}</div>
          <h2 class="logo-text">Akatsuki<span>App</span></h2>
        </div>
        <nav class="nav-links">${tabs.map(t => `
          <button class="nav-btn${state.activeTab === t.id ? ' active' : ''}" data-action="goto" data-tab="${t.id}">${icon(t.icon)} ${t.label}</button>
        `).join('')}</nav>
      </div>
      <div class="navbar-right"><div class="user-section">
        <div class="user-info"><p class="user-name">${esc(state.user.username)}</p><p class="user-role">${roleLabel(state.user.role)}</p></div>
        <div class="user-avatar">${icon('person')}</div>
        <button class="btn-logout" data-action="logout" title="Logout">${icon('logout')}</button>
      </div></div>
    </div></header>`;
}

function renderView() {
  switch (state.activeTab) {
    case 'library': return renderLibrary();
    case 'practice': return renderPractice();
    case 'create': return renderCreateTest();
    case 'banks': return renderQuestionBank();
    case 'saved': return renderSavedQuestions();
    case 'results': return renderResults();
    default: return '';
  }
}

// ===================== AUTH =====================
function renderAuth() {
  return `
    <div class="auth-page"><div class="auth-card">
      <div class="auth-logo">${icon('token')} <h1>AkatsukiApp</h1></div>
      <h2 class="auth-title" id="auth-title">Welcome Back</h2>
      <form id="auth-form">
        <div class="form-group"><label class="form-label">Username</label>
          <input class="form-input" type="text" id="auth-username" placeholder="Enter your username" required /></div>
        <div class="form-group"><label class="form-label">Password</label>
          <input class="form-input" type="password" id="auth-password" placeholder="••••••••" required /></div>
        <div class="form-group hidden" id="role-group"><label class="form-label">Role</label>
          <select class="form-input" id="auth-role"><option value="2">Student</option><option value="1">Lecturer</option><option value="0">Admin</option></select></div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top:16px" id="auth-submit">Sign In</button>
      </form>
      <p class="auth-footer"><span id="auth-switch-text">Don't have an account? </span><button id="auth-toggle">Sign Up</button></p>
    </div></div>`;
}

// ===================== LIBRARY =====================
function renderLibrary() {
  const filters = [{ v: 'All', l: 'All' }, { v: 'IELTS', l: 'IELTS' }, { v: 'TOEIC', l: 'TOEIC' }, { v: 'VSTEP', l: 'VSTEP' }, { v: 'GENERAL', l: 'General' }];
  setTimeout(async () => { renderBankGrid(await api.get(`/api/banks?userId=${state.user.id}`), 'library-grid'); }, 0);
  return `
    <div class="library-header">
      <div><h2 style="font-size:30px;font-weight:700;margin-bottom:8px">Test Library</h2>
        <p style="color:var(--slate-500)">Choose a test to start your practice session.</p></div>
      <div class="filter-tabs">${filters.map((f, i) => `
        <button class="filter-tab${i === 0 ? ' active' : ''}" data-filter="${f.v}">${f.l}</button>`).join('')}</div>
    </div>
    <div id="library-grid" class="bank-grid"><div class="loading">${icon('sync')} Loading...</div></div>`;
}

function renderBankGrid(banks, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!banks.length) { grid.innerHTML = `<div class="empty-state">${icon('grid_view')}<p>No tests available yet.</p></div>`; return; }
  grid.innerHTML = banks.map(b => `
    <div class="bank-card" data-action="start-test" data-id="${b.id}">
      <div class="bank-card-img">
        <img src="https://picsum.photos/seed/${b.id}/800/450" alt="${esc(b.bank_name)}" referrerpolicy="no-referrer" />
        <span class="badge" style="position:absolute;top:16px;left:16px;background:rgba(255,255,255,.92);backdrop-filter:blur(4px);color:var(--primary)">${esc(b.exam_type)}</span>
      </div>
      <div class="bank-card-body">
        <h3>${esc(b.bank_name)}</h3>
        <div class="bank-card-meta"><span>${icon('help')} ${b.question_count || 0} Qs</span><span>${icon('person')} ${esc(b.creator_name)}</span></div>
        <button class="btn btn-dark" style="width:100%;gap:8px" data-action="start-test" data-id="${b.id}">Start Test ${icon('play_arrow')}</button>
      </div>
    </div>`).join('');
}

// ===================== QUESTION BANK =====================
function renderQuestionBank() {
  if (state.selectedBank) return renderBankDetail();
  setTimeout(async () => {
    const banks = await api.get(`/api/banks?userId=${state.user.id}`);
    const grid = document.getElementById('bank-list-grid');
    if (!grid) return;
    if (!banks.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${icon('folder_open')}<p>No question banks yet.</p></div>`; return; }
    grid.innerHTML = banks.map(b => `
      <div class="bank-list-card" data-action="open-bank" data-id="${b.id}">
        <div class="card-top"><span class="badge badge-primary">${esc(b.exam_type)}</span>${icon('visibility', 'text-slate-300')}</div>
        <h3>${esc(b.bank_name)}</h3>
        <div class="card-footer"><span>${b.question_count || 0} questions</span><span>${new Date(b.created_at).toLocaleDateString()}</span></div>
      </div>`).join('');
  }, 0);
  return `<div class="page-header"><h2>My Question Banks</h2><p>Manage and review your saved listening tests.</p></div>
    <div id="bank-list-grid" class="bank-list-grid"><div class="loading">${icon('sync')} Loading...</div></div>`;
}

function renderBankDetail() {
  const b = state.selectedBank;
  const allQ = (b.sections || []).flatMap(s => s.questions);
  const hasAudio = b.audio_url && b.audio_url !== 'placeholder_url';
  return `
    <button class="back-btn" data-action="close-bank">${icon('arrow_back')} Back to Banks</button>
    <div class="card"><div class="card-body">
      <div class="bank-detail-header">
        <div><h2>${esc(b.bank_name)}</h2><p>${esc(b.exam_type)} • ${allQ.length} questions • ${new Date(b.created_at).toLocaleDateString()}</p></div>
        <div class="bank-detail-actions">
          <button class="visibility-btn ${b.is_public ? 'public' : 'private'}" data-action="toggle-visibility" data-id="${b.id}">
            ${icon(b.is_public ? 'public' : 'lock')} ${b.is_public ? 'Public' : 'Private'}</button>
          <button class="btn btn-danger" data-action="delete-bank" data-id="${b.id}">${icon('delete')}</button>
        </div>
      </div>
      <div class="audio-preview">${hasAudio
        ? `<audio src="${esc(b.audio_url)}" controls style="width:100%" preload="metadata"></audio>`
        : `<div class="audio-error">${icon('error')}<p style="font-size:14px;font-weight:500;margin-top:8px">Audio file not found.</p></div>`}</div>
      <h3 style="font-weight:700;font-size:18px;margin-bottom:16px">Questions (${allQ.length})</h3>
      <div class="questions-list">${allQ.map(q => {
        const t = normalizeQType(q.question_type);
        const opts = q.options || [];
        return `<div class="question-item"><div class="question-item-inner">
          <div class="question-num">${q.question_number}</div>
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <span class="badge badge-slate">${TYPE_LABELS[t] || t}</span>
            </div>
            <p style="font-weight:500">${esc(q.question_text)}</p>
            ${['mcq', 'matching'].includes(t) && opts.length ? `<div style="margin-top:8px;padding-left:8px;font-size:13px;color:var(--slate-600)">${opts.map(o => `<div style="margin-bottom:2px">${esc(o)}</div>`).join('')}</div>` : ''}
            <div class="question-meta">
              <span style="color:var(--emerald-600);font-weight:700">Answer: ${esc(q.correct_answer)}</span>
            </div>
            ${q.explanation ? `<p style="font-size:12px;color:var(--slate-500);font-style:italic;margin-top:4px">${esc(q.explanation)}</p>` : ''}
          </div>
        </div></div>`;
      }).join('')}</div>
    </div></div>`;
}

// ===================== CREATE TEST =====================
function renderCreateTest() {
  const steps = [{ n: 1, label: 'Upload' }, { n: 2, label: 'Configure' }, { n: 3, label: 'Review' }];
  return `<div style="max-width:896px;margin:0 auto">
    <div class="page-header">
      <h2>Create New Test</h2><p>Upload audio, configure question types, and generate AI-powered questions.</p>
      <div class="steps">${steps.map((s, i) => `
        <div class="step-item">
          <div class="step-circle${state.createStep >= s.n ? ' active' : ''}">${s.n}</div>
          <span class="step-label${state.createStep >= s.n ? ' active' : ''}">${s.label}</span>
          ${i < 2 ? '<div class="step-line"></div>' : ''}
        </div>`).join('')}</div>
    </div>
    ${state.createStep === 1 ? renderStep1() : state.createStep === 2 ? renderStep2() : renderStep3()}
  </div>`;
}

function renderStep1() {
  return `<div class="upload-zone" id="upload-zone">
    <div class="upload-icon">${icon('cloud_upload')}</div>
    <h3>Upload Audio File</h3><p>Supported formats: MP3, WAV, M4A, OGG. Max size: 20MB.</p>
    <input type="file" accept="audio/*" id="audio-file-input" style="display:none" />
    <label for="audio-file-input" class="btn-file" id="file-label">${state.audioFile ? esc(state.audioFile.name) : 'Select File'}</label>
    ${state.audioFile ? `<button class="btn btn-primary" data-action="next-step">Continue ${icon('arrow_forward')}</button>` : ''}
  </div>`;
}

function renderStep2() {
  const config = EXAM_CONFIG[state.examType] || EXAM_CONFIG.IELTS;
  const allChecked = state.selectedQuestionTypes.length === config.types.length;
  const canGenerate = state.transcript && state.selectedQuestionTypes.length > 0;
  return `<div class="create-step">
    <div class="card card-sm"><div class="card-body">
      <div class="card-header"><h4>${icon('audio_file', 'text-primary')} Audio Preview</h4></div>
      <audio id="create-audio" src="${esc(state.audioUrl)}" controls style="width:100%;margin-bottom:24px"></audio>
      <div class="time-grid">
        <div class="time-card">
          <div class="time-card-head"><label class="form-label" style="margin-bottom:0">Start Time</label><span class="time-val" id="start-val">${fmtTime(state.startTime)}</span></div>
          <div class="time-row"><input type="number" id="start-time-input" value="${state.startTime}" step="0.1" min="0" /><button class="btn-flag" data-action="set-start-time">${icon('flag')}</button></div>
        </div>
        <div class="time-card">
          <div class="time-card-head"><label class="form-label" style="margin-bottom:0">End Time</label><span class="time-val" id="end-val">${fmtTime(state.endTime)}</span></div>
          <div class="time-row"><input type="number" id="end-time-input" value="${state.endTime}" step="0.1" min="0" /><button class="btn-flag" data-action="set-end-time">${icon('stop_circle')}</button></div>
        </div>
      </div>
    </div></div>

    <div class="card card-sm"><div class="card-body">
      <div class="card-header"><h4>${icon('description', 'text-primary')} Transcript</h4>
        <button class="btn-auto" data-action="transcribe" id="transcribe-btn">${icon('auto_fix')} Auto-Transcribe</button></div>
      <textarea class="transcript-area" id="transcript-input" placeholder="Paste or auto-generate transcript...">${esc(state.transcript)}</textarea>
    </div></div>

    <div class="card card-sm"><div class="card-body">
      <div class="card-header"><h4>${icon('tune', 'text-primary')} Exam Configuration</h4></div>
      <label class="form-label">Exam Module</label>
      <div class="exam-tabs">${Object.entries(EXAM_CONFIG).map(([key, cfg]) => `
        <button class="exam-tab${state.examType === key ? ' active' : ''}" data-action="set-exam-type" data-exam="${key}">${icon(cfg.icon)} ${cfg.label}</button>`).join('')}</div>

      <div style="margin-top:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <label class="form-label" style="margin-bottom:0">Question Types</label>
          <button class="btn-auto" data-action="toggle-all-types">${allChecked ? 'Deselect All' : 'Select All'}</button>
        </div>
        <div class="qtype-grid">${config.types.map(t => `
          <label class="qtype-card${state.selectedQuestionTypes.includes(t.id) ? ' selected' : ''}">
            <input type="checkbox" class="qtype-checkbox" data-type-id="${t.id}" ${state.selectedQuestionTypes.includes(t.id) ? 'checked' : ''} />
            <div class="qtype-icon">${icon(t.icon)}</div><span class="qtype-label">${t.label}</span>
          </label>`).join('')}</div>
      </div>

      <div style="margin-top:24px">
        <label class="form-label">Questions Per Type</label>
        <div class="count-control">
          <button class="count-btn" data-action="dec-count">&minus;</button>
          <input type="number" class="count-input" id="question-count" value="${state.questionCount}" min="5" max="50" />
          <button class="count-btn" data-action="inc-count">+</button>
          <span class="count-hint">${state.selectedQuestionTypes.length} types × ${state.questionCount} = <strong>${state.selectedQuestionTypes.length * state.questionCount}</strong> total</span>
        </div>
      </div>
    </div></div>

    <div class="card card-sm"><div class="card-body">
      <div class="card-header">
        <h4>${icon('smart_toy', 'text-primary')} AI Agent — Custom Instructions</h4>
        <button class="btn-auto" data-action="toggle-ai-agent" id="ai-agent-toggle">${icon('expand_more')} ${Object.values(state.customInstructions).some(v => v) ? 'Edit' : 'Open'}</button>
      </div>
      <p style="font-size:13px;color:var(--slate-500);margin-bottom:12px">Tell the AI exactly how to create questions. You can give instructions per question type or for all types at once.</p>
      <div id="ai-agent-panel" class="ai-agent-panel" style="display:none">
        <div style="margin-bottom:16px">
          <label class="form-label">Instructions for ALL question types (global)</label>
          <textarea class="form-input ai-instruction-input" id="ci-global" rows="2" placeholder="e.g., Focus on vocabulary related to travel and tourism...">${esc(state.customInstructions._global || '')}</textarea>
        </div>
        ${state.selectedQuestionTypes.map(tid => {
          const tl = TYPE_LABELS[tid] || tid;
          return `<div style="margin-bottom:12px">
            <label class="form-label">${icon(config.types.find(t => t.id === tid)?.icon || 'help')} ${tl}</label>
            <textarea class="form-input ai-instruction-input" id="ci-${tid}" rows="2" placeholder="e.g., For ${tl}: create questions focusing on...">${esc(state.customInstructions[tid] || '')}</textarea>
          </div>`;
        }).join('')}
      </div>
    </div></div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px">
      <button class="btn btn-ghost" data-action="back-to-step1">${icon('arrow_back')} Back</button>
      <button class="btn btn-primary btn-lg" data-action="generate-questions" id="generate-btn" ${canGenerate ? '' : 'disabled'}>
        Generate ${state.selectedQuestionTypes.length * state.questionCount} Questions ${icon('bolt')}</button>
    </div>
  </div>`;
}

function renderStep3() {
  const g = state.generatedData;
  if (!g) return '';
  return `<div class="create-step">
    <div class="card card-sm"><div class="card-body">
      <div class="test-name-row">
        <div><label class="form-label">Test Name</label>
          <input type="text" class="test-name-input" id="bank-name-input" value="${esc(state.bankName)}" placeholder="e.g., IELTS Listening Practice 01" /></div>
        <div><label class="form-label">Visibility</label>
          <button class="visibility-toggle ${state.isPublic ? 'public' : 'private'}" data-action="toggle-public">
            ${icon(state.isPublic ? 'public' : 'lock')} ${state.isPublic ? 'Public' : 'Private'}</button></div>
      </div>
    </div></div>

    <div class="card" style="margin-top:24px"><div class="card-body">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h4 style="font-size:20px;font-weight:700">Review Questions <span style="color:var(--slate-400);font-size:14px;font-weight:500">(${g.questions.length} total)</span></h4>
      </div>
      ${(() => {
        const groups = groupQuestionsByType(g.questions);
        return `
          <div class="type-tab-bar" id="review-tab-bar">
            ${groups.map((gr, gi) => `<button class="type-tab${gi === 0 ? ' active' : ''}" data-action="switch-type-tab" data-type="${gr.type}" data-target="review-panels">
              ${icon(EXAM_CONFIG[state.examType]?.types.find(t => t.id === gr.type)?.icon || 'help')}
              ${TYPE_LABELS[gr.type] || gr.type} <span class="type-tab-count">${gr.questions.length}</span>
            </button>`).join('')}
          </div>
          <div id="review-panels">
            ${groups.map((gr, gi) => `<div class="type-panel" data-type-panel="${gr.type}" style="display:${gi === 0 ? 'block' : 'none'}">
              <div class="type-panel-header">
                <span>${TYPE_LABELS[gr.type] || gr.type}${gr.questions[0]?.q?.part_label ? ` (${gr.questions[0].q.part_label})` : ''} — ${gr.questions.length} questions</span>
                <button class="btn btn-ghost btn-sm" data-action="regenerate-type" data-rtype="${gr.type}">${icon('refresh')} Regenerate this section</button>
              </div>
              ${gr.questions.map(({ q, idx }) => renderReviewQuestion(q, idx)).join('')}
            </div>`).join('')}
          </div>`;
      })()}
    </div></div>

    <div style="display:flex;justify-content:space-between;padding-top:24px">
      <button class="btn btn-ghost" data-action="back-to-step2">${icon('arrow_back')} Back to Configure</button>
      <button class="btn btn-primary btn-lg" data-action="save-bank">Save to Question Bank ${icon('save')}</button>
    </div>
  </div>`;
}

function renderReviewQuestion(q, idx) {
  const t = normalizeQType(q.type);
  const hasOptions = ['mcq', 'matching'].includes(t);
  const isTF = ['true_false', 'true_false_ng'].includes(t);
  return `<div class="review-card">
    <div class="review-card-header">
      <div class="q-num-badge">${q.number}</div>
      <span class="badge badge-primary">${TYPE_LABELS[t] || t}</span>
      ${q.part_label ? `<span class="badge badge-slate">${esc(q.part_label)}</span>` : ''}
    </div>
    <input type="text" class="review-input" data-q-idx="${idx}" data-q-field="text" value="${esc(q.text)}" />
    ${hasOptions ? `<div class="review-options">${(q.options || []).map((opt, oi) => `
      <div class="review-option-row"><input type="text" class="form-input" data-q-idx="${idx}" data-q-opt="${oi}" value="${esc(opt)}" /></div>`).join('')}</div>` : ''}
    <div class="review-answer-row">
      <div><label class="form-label">Correct Answer</label>
        ${isTF ? `<select class="form-input" data-q-idx="${idx}" data-q-field="answer">${(t === 'true_false_ng' ? ['True', 'False', 'Not Given'] : ['True', 'False']).map(o =>
          `<option${q.answer === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input type="text" class="form-input" data-q-idx="${idx}" data-q-field="answer" value="${esc(q.answer)}" />`}</div>
    </div>
    <div style="margin-top:12px"><label class="form-label">Explanation</label>
      <textarea class="form-input review-explanation" data-q-idx="${idx}" data-q-field="explanation" rows="3">${esc(q.explanation || '')}</textarea></div>
  </div>`;
}

// ===================== TEST ENGINE =====================
function renderTestEngine() {
  if (!state.testBank) {
    setTimeout(async () => {
      try {
        const [bank, saved] = await Promise.all([
          api.get(`/api/banks/${state.selectedBankId}`),
          api.get(`/api/saved-questions/${state.user.id}`)
        ]);
        state.testBank = bank;
        state.savedQuestionIds = new Set(saved.map(q => q.id));
        state.answers = {};
        state.isSubmitted = false;
        rerender();
      } catch (e) { alert('Failed to load test: ' + e.message); }
    }, 0);
    return `<div class="loading">${icon('sync')} Loading test...</div>`;
  }
  if (state.isSubmitted) return renderTestResults();

  const bank = state.testBank;
  const allQ = (bank.sections || []).flatMap(s => s.questions);
  const answered = Object.keys(state.answers).length;
  const hasAudio = bank.audio_url && bank.audio_url !== 'placeholder_url';

  return `<div>
    <div class="test-header">
      <div><div class="test-tag">${icon('timer')} Test in Progress</div><h2>${esc(bank.bank_name)}</h2></div>
      <div class="test-stats">
        <div class="test-stat"><p class="stat-label">Questions</p><p class="stat-val" id="q-counter">${answered} / ${allQ.length}</p></div>
        <div class="stat-divider"></div>
        <div class="test-stat"><p class="stat-label">Type</p><p class="stat-val primary">${esc(bank.exam_type)}</p></div>
      </div>
    </div>
    <div class="test-grid">
      <div>
        <div class="audio-player">${hasAudio ? `
          <button class="play-btn" data-action="toggle-play">${icon(state.isPlaying ? 'pause' : 'play_arrow')}</button>
          <div class="player-track">
            <div class="player-time"><span id="cur-time">${fmtTime(state.currentTime)}</span><span id="dur-time">${fmtTime(state.duration)}</span></div>
            <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:${state.duration ? (state.currentTime / state.duration * 100) : 0}%"></div></div>
          </div>
          <audio id="test-audio" src="${esc(bank.audio_url)}" preload="auto" style="display:none"></audio>
        ` : `<div class="audio-error-msg">${icon('error')} Audio file not found.</div>`}</div>

        ${(() => {
          const allQs = (bank.sections || []).flatMap(s => s.questions);
          const groups = groupQuestionsByType(allQs);
          return `
            <div class="type-tab-bar" id="test-tab-bar">
              ${groups.map((gr, gi) => `<button class="type-tab${gi === 0 ? ' active' : ''}" data-action="switch-type-tab" data-type="${gr.type}" data-target="test-panels">
                ${TYPE_LABELS[gr.type] || gr.type} <span class="type-tab-count">${gr.questions.length}</span>
              </button>`).join('')}
            </div>
            <div id="test-panels">
              ${groups.map((gr, gi) => `<div class="type-panel" data-type-panel="${gr.type}" style="display:${gi === 0 ? 'block' : 'none'}">
                <div class="section-card">
                  <div class="section-head">
                    <span class="badge badge-primary">${TYPE_LABELS[gr.type] || gr.type}</span>
                    <h3>${gr.questions.length} Questions</h3>
                  </div>
                  ${gr.questions.map(({ q }) => renderTestQuestion(q)).join('')}
                </div>
              </div>`).join('')}
            </div>`;
        })()}
      </div>
      <div class="sidebar-sticky">
        <div class="navigator-card">
          <h4>${icon('grid_view', 'text-primary')} Question Navigator</h4>
          <div class="q-grid" id="q-navigator">${allQ.map((q, idx) => `
            <div class="q-dot${state.answers[q.id] ? ' answered' : ''}">${idx + 1}</div>`).join('')}</div>
          <div class="submit-area">
            <button class="btn-submit" data-action="submit-test">Submit Test</button>
            <p class="submit-note">Make sure to review all answers</p>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderTestQuestion(q) {
  const t = normalizeQType(q.question_type);
  const opts = typeof q.options === 'string' ? JSON.parse(q.options || '[]') : (q.options || []);
  const sel = state.answers[q.id] || '';

  let inputHtml = '';
  if (['mcq', 'matching'].includes(t) && opts.length) {
    inputHtml = `<div class="mcq-options">${opts.map(opt => {
      const letter = opt.charAt(0);
      const text = opt.length > 2 ? opt.slice(opt.indexOf('.') + 1).trim() : opt;
      return `<label class="mcq-option${sel === letter ? ' selected' : ''}">
        <input type="radio" name="q-${q.id}" value="${letter}" ${sel === letter ? 'checked' : ''} data-q-id="${q.id}" />
        <span class="mcq-letter">${letter}</span><span class="mcq-text">${esc(text)}</span>
      </label>`;
    }).join('')}</div>`;
  } else if (['true_false', 'true_false_ng'].includes(t)) {
    const tfOpts = t === 'true_false_ng' ? ['True', 'False', 'Not Given'] : ['True', 'False'];
    inputHtml = `<div class="tf-options">${tfOpts.map(o => `
      <label class="tf-option${sel === o ? ' selected' : ''}">
        <input type="radio" name="q-${q.id}" value="${o}" ${sel === o ? 'checked' : ''} data-q-id="${q.id}" /><span>${o}</span>
      </label>`).join('')}</div>`;
  } else {
    inputHtml = `<div class="q-answer"><input type="text" class="q-input" placeholder="Type your answer here..."
      data-q-id="${q.id}" value="${esc(sel)}" data-action="answer-input" /></div>`;
  }

  return `<div class="question-block">
    <div class="q-label"><div class="q-label-num">${q.question_number}</div>
      <div style="flex:1"><p>${esc(q.question_text)}</p>
        <span class="badge badge-slate" style="margin-top:6px;font-size:9px">${TYPE_LABELS[t] || t}</span></div></div>
    ${inputHtml}
  </div>`;
}

function renderTestResults() {
  const bank = state.testBank;
  const allQ = (bank.sections || []).flatMap(s => s.questions);
  return `<div>
    <div class="results-header">
      <div><div class="result-tag">${icon('check_circle')} Test Completed</div><h2 style="font-size:30px;font-weight:700">Review Results</h2></div>
      <div style="display:flex;align-items:center;gap:24px">
        <div class="score-display"><p class="score-label">Final Score</p>
          <p class="score-val">${state.testScore.toFixed(1)}<span class="score-max">/ 10.0</span></p></div>
        <button class="btn btn-dark" data-action="finish-test">Finish Review ${icon('arrow_forward')}</button>
      </div>
    </div>
    <div class="result-grid">
      <div class="transcript-panel">
        <div class="panel-header"><h4>${icon('description', 'text-primary')} Audio Transcript</h4></div>
        <div class="panel-body">${esc(bank.transcript || '(No transcript available)')}</div>
      </div>
      <div class="analysis-panel">
        <div class="analysis-header"><h4>${icon('analytics', 'text-primary')} Question Analysis</h4></div>
        <div class="analysis-body">${allQ.map((q, idx) => {
          const t = normalizeQType(q.question_type);
          const opts = typeof q.options === 'string' ? JSON.parse(q.options || '[]') : (q.options || []);
          const correct = isAnswerCorrect(state.answers[q.id], q.correct_answer, q.question_type);
          const isSaved = state.savedQuestionIds.has(q.id);
          const userAns = state.answers[q.id] || '';
          const displayUser = ['mcq', 'matching'].includes(t) ? getOptionText(opts, userAns) : userAns;
          const displayCorrect = ['mcq', 'matching'].includes(t) ? getOptionText(opts, q.correct_answer) : q.correct_answer;
          return `<div class="result-card ${correct ? 'correct' : 'wrong'}">
            <div class="result-card-header">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="result-num ${correct ? 'correct' : 'wrong'}">${idx + 1}</div>
                <h5 class="result-status ${correct ? 'correct' : 'wrong'}">${correct ? 'Correct' : 'Incorrect'}</h5>
                <span class="badge badge-slate" style="font-size:9px">${TYPE_LABELS[t] || t}</span>
              </div>
              <button class="btn-bookmark${isSaved ? ' saved' : ''}" data-action="toggle-save" data-q-id="${q.id}">${icon('bookmark')}</button>
            </div>
            <p class="result-q-text">${esc(q.question_text)}</p>
            <div class="answer-boxes">
              <div class="answer-box ${correct ? 'your-correct' : 'your-wrong'}">
                <p class="answer-box-label">Your Answer</p><p class="answer-box-val">${esc(displayUser || '(No answer)')}</p></div>
              ${!correct ? `<div class="answer-box right">
                <p class="answer-box-label">Correct Answer</p><p class="answer-box-val">${esc(displayCorrect)}</p></div>` : ''}
            </div>
            <div class="explanation-area">
              <div class="explanation-label">${icon('lightbulb')}<span class="lbl">Explanation</span></div>
              <p class="explanation-text">${esc(q.explanation || '')}</p>
            </div>
          </div>`;
        }).join('')}</div>
      </div>
    </div>
  </div>`;
}

// ===================== RESULTS HISTORY =====================
function renderResults() {
  setTimeout(async () => {
    const results = await api.get(`/api/results/${state.user.id}`);
    const tbody = document.getElementById('results-tbody');
    if (!tbody) return;
    if (!results.length) { tbody.innerHTML = ''; document.getElementById('no-results')?.classList.remove('hidden'); return; }
    tbody.innerHTML = results.map(r => `<tr>
      <td><div class="result-test-name"><div class="result-icon">${icon('assignment')}</div>
        <span style="font-weight:700;color:var(--slate-700)">${esc(r.bank_name)}</span></div></td>
      <td><span class="badge badge-slate">${esc(r.exam_type)}</span></td>
      <td style="font-size:14px;color:var(--slate-500)">${new Date(r.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td style="text-align:right">
        <span class="result-score ${r.score >= 7 ? 'good' : 'normal'}">${r.score.toFixed(1)}</span><span style="color:var(--slate-400);font-size:12px">/10</span>
        ${r.correct_count ? `<div style="font-size:11px;color:var(--slate-400)">${r.correct_count}/${r.total_questions} correct</div>` : ''}
      </td></tr>`).join('');
  }, 0);
  return `<div class="page-header"><h2>My Progress</h2><p>Track your performance over time.</p></div>
    <div class="results-table-wrap"><table class="results-table">
      <thead><tr><th>Test Name</th><th>Exam Type</th><th>Date</th><th style="text-align:right">Score</th></tr></thead>
      <tbody id="results-tbody"><tr><td colspan="4"><div class="loading">${icon('sync')} Loading...</div></td></tr></tbody>
    </table>
    <div id="no-results" class="no-results hidden">${icon('analytics')}<p style="color:var(--slate-400);font-weight:500;margin-top:16px">No results yet.</p></div></div>`;
}

// ===================== SAVED QUESTIONS =====================
function renderSavedQuestions() {
  setTimeout(async () => {
    const questions = await api.get(`/api/saved-questions/${state.user.id}`);
    const list = document.getElementById('saved-list');
    if (!list) return;
    if (!questions.length) { list.innerHTML = `<div class="empty-state">${icon('bookmark_border')}<p>No questions saved yet.</p></div>`; return; }
    list.innerHTML = questions.map((q, idx) => {
      const t = normalizeQType(q.question_type);
      return `<div class="saved-card">
        <div class="saved-card-header">
          <div class="saved-card-tags"><span class="badge badge-primary">${esc(q.exam_type)}</span><span class="badge badge-slate">${TYPE_LABELS[t] || t}</span>
            <span class="saved-card-from">From: ${esc(q.bank_name)}</span></div>
          <button class="btn btn-danger" data-action="unsave-question" data-q-id="${q.id}">${icon('bookmark_remove')}</button>
        </div>
        <div class="saved-inner"><div class="saved-idx">${idx + 1}</div><div style="flex:1">
          <p class="saved-q-text">${esc(q.question_text)}</p>
          <div class="saved-answer-row">
            <div class="answer-field emerald"><p class="answer-field-label">Correct Answer</p><p class="answer-field-val">${esc(q.correct_answer)}</p></div>
          </div>
          ${q.explanation ? `<div class="explanation-area"><div class="explanation-label">${icon('lightbulb')}<span class="lbl">Explanation</span></div>
            <p class="explanation-text">${esc(q.explanation || '')}</p></div>` : ''}
        </div></div>
      </div>`;
    }).join('');
  }, 0);
  return `<div class="page-header"><h2>Saved Questions</h2><p>Review questions you've saved for further study.</p></div>
    <div id="saved-list" class="saved-list"><div class="loading">${icon('sync')} Loading...</div></div>`;
}

// ===================== PRACTICE MODE =====================
function renderPractice() {
  if (state.practiceStep === 1) return renderPracticeStep1();
  if (state.practiceStep === 2) return renderPracticeStep2();
  if (state.practiceStep === 3) return renderPracticeTest();
  if (state.practiceStep === 4) return renderPracticeResults();
  return '';
}

function renderPracticeStep1() {
  return `<div class="page-header"><h2>${icon('fitness_center')} Self-Study Practice</h2>
    <p>Upload an audio file and the system will generate a practice test for you.</p></div>
    <div class="upload-zone" id="practice-upload-zone">
      <div class="upload-icon">${icon('cloud_upload')}</div>
      <h3>Upload Audio File</h3><p>Supported: MP3, WAV, M4A, OGG. Max 20MB.</p>
      <input type="file" accept="audio/*" id="practice-audio-input" style="display:none" />
      <label for="practice-audio-input" class="btn-file" id="practice-file-label">${state.practiceAudioFile ? esc(state.practiceAudioFile.name) : 'Select File'}</label>
      ${state.practiceAudioFile ? `<button class="btn btn-primary" data-action="practice-next">Continue ${icon('arrow_forward')}</button>` : ''}
    </div>`;
}

function renderPracticeStep2() {
  const config = EXAM_CONFIG[state.practiceExamType] || EXAM_CONFIG.IELTS;
  const allChecked = state.practiceQuestionTypes.length === config.types.length;
  const total = state.practiceQuestionTypes.length * state.practiceQuestionsPerType;
  const canGenerate = state.practiceTranscript && state.practiceQuestionTypes.length > 0;
  return `<div class="create-step">
    <div class="card card-sm"><div class="card-body">
      <div class="card-header"><h4>${icon('audio_file', 'text-primary')} Audio Preview</h4></div>
      <audio id="practice-audio-preview" src="${esc(state.practiceAudioUrl)}" controls style="width:100%;margin-bottom:24px"></audio>
    </div></div>

    <div class="card card-sm"><div class="card-body">
      <div class="card-header"><h4>${icon('description', 'text-primary')} Transcript</h4>
        <button class="btn-auto" data-action="practice-transcribe" id="practice-transcribe-btn">${icon('auto_fix')} Auto-Transcribe</button></div>
      <textarea class="transcript-area" id="practice-transcript-input" placeholder="Paste or auto-generate transcript...">${esc(state.practiceTranscript)}</textarea>
    </div></div>

    <div class="card card-sm"><div class="card-body">
      <div class="card-header"><h4>${icon('tune', 'text-primary')} Practice Configuration</h4></div>
      <label class="form-label">Exam Module</label>
      <div class="exam-tabs">${Object.entries(EXAM_CONFIG).map(([key, cfg]) => `
        <button class="exam-tab${state.practiceExamType === key ? ' active' : ''}" data-action="practice-set-exam" data-exam="${key}">${icon(cfg.icon)} ${cfg.label}</button>`).join('')}</div>

      <div style="margin-top:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <label class="form-label" style="margin-bottom:0">Question Types</label>
          <button class="btn-auto" data-action="practice-toggle-all">${allChecked ? 'Deselect All' : 'Select All'}</button>
        </div>
        <div class="qtype-grid">${config.types.map(t => `
          <label class="qtype-card${state.practiceQuestionTypes.includes(t.id) ? ' selected' : ''}">
            <input type="checkbox" class="practice-qtype-checkbox" data-type-id="${t.id}" ${state.practiceQuestionTypes.includes(t.id) ? 'checked' : ''} />
            <div class="qtype-icon">${icon(t.icon)}</div><span class="qtype-label">${t.label}</span>
          </label>`).join('')}</div>
      </div>

      <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <label class="form-label">Questions Per Type</label>
          <div class="count-control">
            <button class="count-btn" data-action="practice-dec-count">&minus;</button>
            <input type="number" class="count-input" id="practice-count" value="${state.practiceQuestionsPerType}" min="3" max="50" />
            <button class="count-btn" data-action="practice-inc-count">+</button>
          </div>
          <div class="count-hint" style="margin-top:6px">${state.practiceQuestionTypes.length} types &times; ${state.practiceQuestionsPerType} = <strong>${total}</strong> total</div>
        </div>
        <div>
          <label class="form-label">Timer (minutes after audio)</label>
          <div class="count-control">
            <button class="count-btn" data-action="practice-dec-timer">&minus;</button>
            <input type="number" class="count-input" id="practice-timer" value="${state.practiceTimer}" min="1" max="120" />
            <button class="count-btn" data-action="practice-inc-timer">+</button>
          </div>
          <div class="count-hint" style="margin-top:6px">${icon('timer')} ${state.practiceTimer} min to answer after listening</div>
        </div>
      </div>
    </div></div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px">
      <button class="btn btn-ghost" data-action="practice-back-step1">${icon('arrow_back')} Back</button>
      <button class="btn btn-primary btn-lg" data-action="practice-generate" id="practice-generate-btn" ${canGenerate ? '' : 'disabled'}>
        Start Practice (${total} Qs) ${icon('bolt')}</button>
    </div>
  </div>`;
}

function renderPracticeTest() {
  const qs = state.practiceQuestions;
  const answered = Object.keys(state.practiceAnswers).length;
  const groups = groupQuestionsByType(qs);
  const timerText = state.practiceTimeLeft != null ? fmtTime(state.practiceTimeLeft) : '--:--';
  const timerWarn = state.practiceTimeLeft != null && state.practiceTimeLeft <= 60;

  return `<div>
    <div class="test-header practice-test-header">
      <div><div class="test-tag">${icon('fitness_center')} Practice Session</div><h2>Self-Study Practice</h2></div>
      <div class="test-stats">
        <div class="test-stat"><p class="stat-label">Answered</p><p class="stat-val" id="practice-q-counter">${answered} / ${qs.length}</p></div>
        <div class="stat-divider"></div>
        <div class="test-stat"><p class="stat-label">Timer</p><p class="stat-val ${timerWarn ? 'timer-warn' : ''}" id="practice-timer-display">${timerText}</p>
          ${state.practiceTimeLeft == null ? `<button class="btn-auto" data-action="practice-start-timer" style="font-size:10px;margin-top:4px">Start Timer</button>` : ''}</div>
      </div>
    </div>
    <div class="test-grid">
      <div>
        <div class="audio-player practice-audio-player">
          <button class="play-btn" data-action="practice-toggle-play">${icon(state.isPlaying ? 'pause' : 'play_arrow')}</button>
          <div class="player-track">
            <div class="player-time"><span id="practice-cur-time">${fmtTime(state.currentTime)}</span><span id="practice-dur-time">${fmtTime(state.practiceAudioDuration)}</span></div>
            <div class="progress-bar"><div class="progress-fill" id="practice-progress-fill" style="width:${state.practiceAudioDuration ? (state.currentTime / state.practiceAudioDuration * 100) : 0}%"></div></div>
          </div>
          <audio id="practice-test-audio" src="${esc(state.practiceAudioUrl)}" preload="auto" style="display:none"></audio>
        </div>

        <div class="type-tab-bar" id="practice-tab-bar">
          ${groups.map((gr, gi) => `<button class="type-tab${gi === 0 ? ' active' : ''}" data-action="switch-type-tab" data-type="${gr.type}" data-target="practice-panels">
            ${TYPE_LABELS[gr.type] || gr.type} <span class="type-tab-count">${gr.questions.length}</span>
          </button>`).join('')}
        </div>
        <div id="practice-panels">
          ${groups.map((gr, gi) => `<div class="type-panel" data-type-panel="${gr.type}" style="display:${gi === 0 ? 'block' : 'none'}">
            <div class="section-card">
              <div class="section-head"><span class="badge badge-primary">${TYPE_LABELS[gr.type] || gr.type}</span><h3>${gr.questions.length} Questions</h3></div>
              ${gr.questions.map(({ q }) => renderPracticeQuestion(q)).join('')}
            </div>
          </div>`).join('')}
        </div>
      </div>
      <div class="sidebar-sticky">
        <div class="navigator-card">
          <h4>${icon('grid_view', 'text-primary')} Question Navigator</h4>
          <div class="q-grid" id="practice-navigator">${qs.map((q, idx) => `
            <div class="q-dot${state.practiceAnswers[idx] ? ' answered' : ''}">${idx + 1}</div>`).join('')}</div>
          <div class="submit-area">
            <button class="btn-submit" data-action="practice-submit">Submit Practice</button>
            <p class="submit-note">Make sure to review all answers</p>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderPracticeQuestion(q) {
  const t = normalizeQType(q.type);
  const opts = q.options || [];
  const sel = state.practiceAnswers[q._idx] || '';

  let inputHtml = '';
  if (['mcq', 'matching'].includes(t) && opts.length) {
    inputHtml = `<div class="mcq-options">${opts.map(opt => {
      const letter = opt.charAt(0);
      const text = opt.length > 2 ? opt.slice(opt.indexOf('.') + 1).trim() : opt;
      return `<label class="mcq-option${sel === letter ? ' selected' : ''}">
        <input type="radio" name="pq-${q._idx}" value="${letter}" ${sel === letter ? 'checked' : ''} data-practice-q="${q._idx}" />
        <span class="mcq-letter">${letter}</span><span class="mcq-text">${esc(text)}</span>
      </label>`;
    }).join('')}</div>`;
  } else if (['true_false', 'true_false_ng'].includes(t)) {
    const tfOpts = t === 'true_false_ng' ? ['True', 'False', 'Not Given'] : ['True', 'False'];
    inputHtml = `<div class="tf-options">${tfOpts.map(o => `
      <label class="tf-option${sel === o ? ' selected' : ''}">
        <input type="radio" name="pq-${q._idx}" value="${o}" ${sel === o ? 'checked' : ''} data-practice-q="${q._idx}" /><span>${o}</span>
      </label>`).join('')}</div>`;
  } else {
    inputHtml = `<div class="q-answer"><input type="text" class="q-input" placeholder="Type your answer..."
      data-practice-q="${q._idx}" value="${esc(sel)}" data-action="practice-answer-input" /></div>`;
  }

  return `<div class="question-block">
    <div class="q-label"><div class="q-label-num">${q.number}</div>
      <div style="flex:1"><p>${esc(q.text)}</p>
        <span class="badge badge-slate" style="margin-top:6px;font-size:9px">${TYPE_LABELS[t] || t}</span></div></div>
    ${inputHtml}
  </div>`;
}

function renderPracticeResults() {
  const qs = state.practiceQuestions;
  let correct = 0;
  qs.forEach((q, idx) => { if (isAnswerCorrect(state.practiceAnswers[idx], q.answer, q.type)) correct++; });
  const score = qs.length ? (correct / qs.length * 10) : 0;
  const pct = qs.length ? Math.round(correct / qs.length * 100) : 0;

  return `<div>
    <div class="practice-results-header">
      <div class="practice-score-card">
        <div class="practice-score-circle ${pct >= 70 ? 'good' : pct >= 40 ? 'ok' : 'poor'}">
          <span class="practice-score-pct">${pct}%</span>
          <span class="practice-score-sub">${correct}/${qs.length}</span>
        </div>
        <div class="practice-score-info">
          <h2>Practice Complete!</h2>
          <p>Score: <strong>${score.toFixed(1)}/10.0</strong></p>
          <p>${correct} correct out of ${qs.length} questions</p>
          <div class="practice-results-actions">
            <button class="btn btn-primary" data-action="practice-view-details">${icon('visibility')} View Detailed Explanations</button>
            <button class="btn btn-ghost" data-action="practice-restart">${icon('refresh')} New Practice</button>
          </div>
        </div>
      </div>
    </div>
    <div id="practice-details" class="practice-details hidden">
      <div class="result-grid">
        <div class="transcript-panel">
          <div class="panel-header"><h4>${icon('description', 'text-primary')} Audio Transcript</h4></div>
          <div class="panel-body" id="practice-transcript-body">${esc(state.practiceTranscript)}</div>
        </div>
        <div class="analysis-panel">
          <div class="analysis-header"><h4>${icon('analytics', 'text-primary')} Question Analysis</h4></div>
          <div class="analysis-body">${qs.map((q, idx) => {
            const t = normalizeQType(q.type);
            const opts = q.options || [];
            const isCorrect = isAnswerCorrect(state.practiceAnswers[idx], q.answer, q.type);
            const userAns = state.practiceAnswers[idx] || '';
            const displayUser = ['mcq', 'matching'].includes(t) ? getOptionText(opts, userAns) : userAns;
            const displayCorrect = ['mcq', 'matching'].includes(t) ? getOptionText(opts, q.answer) : q.answer;
            return `<div class="result-card ${isCorrect ? 'correct' : 'wrong'}">
              <div class="result-card-header">
                <div style="display:flex;align-items:center;gap:12px">
                  <div class="result-num ${isCorrect ? 'correct' : 'wrong'}">${idx + 1}</div>
                  <h5 class="result-status ${isCorrect ? 'correct' : 'wrong'}">${isCorrect ? 'Correct' : 'Incorrect'}</h5>
                  <span class="badge badge-slate" style="font-size:9px">${TYPE_LABELS[t] || t}</span>
                </div>
              </div>
              <p class="result-q-text">${esc(q.text)}</p>
              <div class="answer-boxes">
                <div class="answer-box ${isCorrect ? 'your-correct' : 'your-wrong'}">
                  <p class="answer-box-label">Your Answer</p><p class="answer-box-val">${esc(displayUser || '(No answer)')}</p></div>
                ${!isCorrect ? `<div class="answer-box right">
                  <p class="answer-box-label">Correct Answer</p><p class="answer-box-val">${esc(displayCorrect)}</p></div>` : ''}
              </div>
              <button class="btn btn-ghost btn-sm practice-explain-btn" data-action="practice-explain" data-pidx="${idx}">
                ${icon('lightbulb')} Detailed Explanation</button>
              <div class="practice-explanation-detail hidden" id="practice-expl-${idx}">
                <div class="explanation-area">
                  <div class="explanation-label">${icon('lightbulb')}<span class="lbl">Explanation</span></div>
                  <p class="explanation-text">${esc(q.explanation || '')}</p>
                </div>
                ${q.transcript_quote ? `<div class="transcript-quote-box">
                  <div class="transcript-quote-label">${icon('format_quote')} Relevant Transcript Passage</div>
                  <p class="transcript-quote-text">"${esc(q.transcript_quote)}"</p>
                </div>` : ''}
              </div>
            </div>`;
          }).join('')}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function attachPracticeTimerUI() {
  const audio = document.getElementById('practice-test-audio');
  if (audio) {
    audio.ontimeupdate = () => {
      state.currentTime = audio.currentTime;
      const fill = document.getElementById('practice-progress-fill');
      const cur = document.getElementById('practice-cur-time');
      if (fill && state.practiceAudioDuration) fill.style.width = (state.currentTime / state.practiceAudioDuration * 100) + '%';
      if (cur) cur.textContent = fmtTime(state.currentTime);
    };
    audio.onloadedmetadata = () => {
      state.practiceAudioDuration = audio.duration;
      const dur = document.getElementById('practice-dur-time');
      if (dur) dur.textContent = fmtTime(audio.duration);
    };
    audio.onended = () => {
      state.isPlaying = false;
      const btn = document.querySelector('[data-action="practice-toggle-play"]');
      if (btn) btn.innerHTML = icon('play_arrow');
      if (state.practiceStep === 3 && state.practiceTimeLeft == null) {
        state.practiceTimeLeft = state.practiceTimer * 60;
        startPracticeCountdown();
      }
    };
  }
  const previewAudio = document.getElementById('practice-audio-preview');
  if (previewAudio) {
    previewAudio.onloadedmetadata = () => { state.practiceAudioDuration = previewAudio.duration; };
  }
}

function startPracticeCountdown() {
  if (state.practiceTimerInterval) clearInterval(state.practiceTimerInterval);
  state.practiceTimerInterval = setInterval(() => {
    if (state.practiceTimeLeft <= 0) {
      clearInterval(state.practiceTimerInterval);
      state.practiceTimerInterval = null;
      alert('Time is up! Your practice will be submitted automatically.');
      submitPractice();
      return;
    }
    state.practiceTimeLeft--;
    const display = document.getElementById('practice-timer-display');
    if (display) {
      display.textContent = fmtTime(state.practiceTimeLeft);
      display.classList.toggle('timer-warn', state.practiceTimeLeft <= 60);
    }
  }, 1000);
}

function submitPractice() {
  if (state.practiceTimerInterval) { clearInterval(state.practiceTimerInterval); state.practiceTimerInterval = null; }
  const qs = state.practiceQuestions;
  let correct = 0;
  qs.forEach((q, idx) => { if (isAnswerCorrect(state.practiceAnswers[idx], q.answer, q.type)) correct++; });
  state.practiceScore = qs.length ? (correct / qs.length * 10) : 0;
  state.practiceSubmitted = true;
  state.practiceStep = 4;
  api.post('/api/results', { user_id: state.user.id, bank_id: null, score: state.practiceScore, total_questions: qs.length, correct_count: correct }).catch(() => {});
  rerender();
}

function updatePracticeNavigator() {
  document.querySelectorAll('#practice-navigator .q-dot').forEach((dot, idx) => {
    dot.className = `q-dot${state.practiceAnswers[idx] ? ' answered' : ''}`;
  });
  const c = document.getElementById('practice-q-counter');
  if (c) c.textContent = `${Object.keys(state.practiceAnswers).length} / ${state.practiceQuestions.length}`;
}

function highlightTranscriptQuote(quote) {
  const body = document.getElementById('practice-transcript-body');
  if (!body || !quote) return;
  body.innerHTML = esc(state.practiceTranscript);
  const text = body.textContent;
  const idx = text.toLowerCase().indexOf(quote.toLowerCase());
  if (idx === -1) return;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + quote.length);
  const after = text.slice(idx + quote.length);
  body.innerHTML = `${esc(before)}<mark class="transcript-highlight">${esc(match)}</mark>${esc(after)}`;
  body.querySelector('.transcript-highlight')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===================== AUDIO EVENTS =====================
function attachAudioEvents() {
  const testAudio = document.getElementById('test-audio');
  if (testAudio) {
    testAudio.ontimeupdate = () => {
      state.currentTime = testAudio.currentTime;
      const fill = document.getElementById('progress-fill');
      const cur = document.getElementById('cur-time');
      if (fill && state.duration) fill.style.width = (state.currentTime / state.duration * 100) + '%';
      if (cur) cur.textContent = fmtTime(state.currentTime);
    };
    testAudio.onloadedmetadata = () => {
      state.duration = testAudio.duration;
      const dur = document.getElementById('dur-time');
      if (dur) dur.textContent = fmtTime(state.duration);
    };
    testAudio.onended = () => {
      state.isPlaying = false;
      const btn = document.querySelector('.play-btn');
      if (btn) btn.innerHTML = icon('play_arrow');
    };
  }
  const createAudio = document.getElementById('create-audio');
  if (createAudio) {
    createAudio.onloadedmetadata = () => {
      state.audioDuration = createAudio.duration;
      if (!state.endTime) {
        state.endTime = createAudio.duration;
        const ei = document.getElementById('end-time-input'), ev = document.getElementById('end-val');
        if (ei) ei.value = createAudio.duration.toFixed(1);
        if (ev) ev.textContent = fmtTime(createAudio.duration);
      }
    };
  }
}

// ===================== EVENTS =====================
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'logout') {
    Object.assign(state, { user: null, activeTab: 'library', selectedBankId: null, testBank: null, selectedBank: null });
    render();
  }
  if (action === 'goto') {
    state.activeTab = el.dataset.tab;
    state.selectedBankId = null; state.testBank = null; state.selectedBank = null;
    if (state.practiceStep >= 3 && el.dataset.tab !== 'practice') {
      if (state.practiceTimerInterval) { clearInterval(state.practiceTimerInterval); state.practiceTimerInterval = null; }
      state.practiceStep = 1; state.practiceTimeLeft = null;
    }
    rerender();
  }
  if (action === 'start-test') {
    state.selectedBankId = Number(el.dataset.id);
    state.testBank = null; state.answers = {}; state.isSubmitted = false; state.isPlaying = false; state.currentTime = 0; state.duration = 0;
    rerender();
  }
  if (action === 'open-bank') {
    state.selectedBank = await api.get(`/api/banks/${el.dataset.id}`);
    rerender();
  }
  if (action === 'close-bank') { state.selectedBank = null; rerender(); }
  if (action === 'delete-bank') {
    if (!confirm('Delete this question bank permanently?')) return;
    const r = await fetch(`/api/banks/${el.dataset.id}?userId=${state.user.id}`, { method: 'DELETE' });
    if (r.ok) { state.selectedBank = null; rerender(); }
  }
  if (action === 'toggle-visibility') {
    const cur = !!state.selectedBank?.is_public;
    await api.patch(`/api/banks/${el.dataset.id}/visibility`, { userId: state.user.id, isPublic: !cur });
    if (state.selectedBank) { state.selectedBank.is_public = !cur; rerender(); }
  }
  if (action === 'next-step') { state.createStep = 2; rerender(); }
  if (action === 'back-to-step1') { state.createStep = 1; rerender(); }
  if (action === 'back-to-step2') { state.createStep = 2; rerender(); }
  if (action === 'set-start-time') {
    const a = document.getElementById('create-audio'); if (!a) return;
    state.startTime = a.currentTime;
    const i = document.getElementById('start-time-input'), v = document.getElementById('start-val');
    if (i) i.value = a.currentTime.toFixed(1); if (v) v.textContent = fmtTime(a.currentTime);
  }
  if (action === 'set-end-time') {
    const a = document.getElementById('create-audio'); if (!a) return;
    state.endTime = a.currentTime;
    const i = document.getElementById('end-time-input'), v = document.getElementById('end-val');
    if (i) i.value = a.currentTime.toFixed(1); if (v) v.textContent = fmtTime(a.currentTime);
  }
  if (action === 'set-exam-type') {
    state.examType = el.dataset.exam;
    const cfg = EXAM_CONFIG[state.examType];
    state.selectedQuestionTypes = cfg ? cfg.types.map(t => t.id) : ['mcq'];
    rerender();
  }
  if (action === 'toggle-all-types') {
    const cfg = EXAM_CONFIG[state.examType];
    state.selectedQuestionTypes = state.selectedQuestionTypes.length === cfg.types.length ? [] : cfg.types.map(t => t.id);
    rerender();
  }
  if (action === 'inc-count') {
    state.questionCount = Math.min(50, state.questionCount + 5);
    const i = document.getElementById('question-count'); if (i) i.value = state.questionCount;
  }
  if (action === 'dec-count') {
    state.questionCount = Math.max(5, state.questionCount - 5);
    const i = document.getElementById('question-count'); if (i) i.value = state.questionCount;
  }
  if (action === 'transcribe') {
    if (!state.audioFilename) { alert('Please upload an audio file first.'); return; }
    el.textContent = 'Transcribing...'; el.disabled = true;
    try {
      const res = await api.post('/api/transcribe', { filename: state.audioFilename });
      state.transcript = res.text || '';
      const ta = document.getElementById('transcript-input'); if (ta) ta.value = state.transcript;
      const gb = document.getElementById('generate-btn'); if (gb) gb.disabled = !state.transcript || !state.selectedQuestionTypes.length;
    } catch (err) { alert('Transcribe failed: ' + err.message); }
    el.innerHTML = `${icon('auto_fix')} Auto-Transcribe`; el.disabled = false;
  }
  if (action === 'toggle-ai-agent') {
    const panel = document.getElementById('ai-agent-panel');
    if (panel) { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; }
  }
  if (action === 'generate-questions') {
    const ta = document.getElementById('transcript-input');
    if (ta) state.transcript = ta.value;
    if (!state.transcript) { alert('Please add a transcript first.'); return; }
    if (!state.selectedQuestionTypes.length) { alert('Please select at least one question type.'); return; }
    // Collect AI Agent custom instructions
    const ci = {};
    const globalEl = document.getElementById('ci-global');
    if (globalEl?.value?.trim()) ci._global = globalEl.value.trim();
    state.selectedQuestionTypes.forEach(tid => {
      const el2 = document.getElementById(`ci-${tid}`);
      if (el2?.value?.trim()) ci[tid] = el2.value.trim();
    });
    state.customInstructions = ci;
    const btn = document.getElementById('generate-btn');
    const origHTML = btn.innerHTML;
    btn.textContent = 'Generating...'; btn.disabled = true;
    try {
      const section = await api.post('/api/generate-questions', {
        transcript: state.transcript, examType: state.examType,
        questionTypes: state.selectedQuestionTypes, questionsPerType: state.questionCount,
        customInstructions: Object.keys(ci).length ? ci : undefined
      });
      if (!section.questions?.length) throw new Error('AI returned no questions. Try a longer transcript.');
      state.generatedData = section;
      state.createStep = 3;
      rerender();
    } catch (err) {
      alert('Generate failed: ' + err.message);
      btn.innerHTML = origHTML; btn.disabled = false;
    }
  }
  if (action === 'regenerate-type') {
    const rtype = el.dataset.rtype;
    if (!state.transcript || !state.generatedData) return;
    const origHTML = el.innerHTML;
    el.textContent = 'Regenerating...'; el.disabled = true;
    try {
      const res = await api.post('/api/regenerate-type', {
        transcript: state.transcript, examType: state.examType,
        questionType: rtype, count: state.questionCount
      });
      if (!res.questions?.length) throw new Error('No questions returned');
      const oldQuestions = state.generatedData.questions.filter(q => normalizeQType(q.type) !== rtype);
      let num = 1;
      const newAll = [];
      const groups = groupQuestionsByType([...oldQuestions, ...res.questions.map(q => ({ ...q, type: rtype }))]);
      for (const gr of groups) { for (const { q } of gr.questions) { q.number = num++; newAll.push(q); } }
      state.generatedData.questions = newAll;
      rerender();
    } catch (err) {
      alert('Regenerate failed: ' + err.message);
      el.innerHTML = origHTML; el.disabled = false;
    }
  }
  if (action === 'switch-type-tab') {
    const type = el.dataset.type, targetId = el.dataset.target;
    el.parentElement.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    const panels = document.getElementById(targetId);
    if (panels) {
      panels.querySelectorAll('.type-panel').forEach(p => p.style.display = 'none');
      const panel = panels.querySelector(`[data-type-panel="${type}"]`);
      if (panel) panel.style.display = 'block';
    }
  }
  if (action === 'toggle-public') {
    state.isPublic = !state.isPublic;
    el.className = `visibility-toggle ${state.isPublic ? 'public' : 'private'}`;
    el.innerHTML = `${icon(state.isPublic ? 'public' : 'lock')} ${state.isPublic ? 'Public' : 'Private'}`;
  }
  if (action === 'save-bank') {
    const ni = document.getElementById('bank-name-input'); if (ni) state.bankName = ni.value;
    if (!state.generatedData) return;
    if (!state.audioUrl) { alert('Please upload an audio file first.'); return; }
    document.querySelectorAll('[data-q-idx]').forEach(inp => {
      const idx = Number(inp.dataset.qIdx), field = inp.dataset.qField;
      if (field && state.generatedData?.questions[idx]) state.generatedData.questions[idx][field] = inp.value;
      if (inp.dataset.qOpt !== undefined) {
        const oi = Number(inp.dataset.qOpt);
        if (state.generatedData?.questions[idx]?.options) state.generatedData.questions[idx].options[oi] = inp.value;
      }
    });
    el.textContent = 'Saving...'; el.disabled = true;
    try {
      const res = await api.post('/api/banks', {
        bank_name: state.bankName || `${state.examType} Test - ${new Date().toLocaleDateString()}`,
        created_by: state.user.id, exam_type: state.examType, is_public: state.isPublic ? 1 : 0,
        audio_url: state.audioUrl, transcript: state.transcript,
        start_time: state.startTime, end_time: state.endTime,
        sections: [state.generatedData]
      });
      if (res.success) {
        alert('Test saved successfully!');
        Object.assign(state, { createStep: 1, generatedData: null, audioFile: null, audioUrl: '', audioFilename: '', transcript: '', bankName: '', questionCount: 10 });
        rerender();
      }
    } catch (err) {
      alert('Save failed: ' + err.message);
      el.textContent = 'Save to Question Bank'; el.disabled = false;
    }
  }
  // ---- Practice mode actions ----
  if (action === 'practice-next') { state.practiceStep = 2; rerender(); }
  if (action === 'practice-back-step1') { state.practiceStep = 1; rerender(); }
  if (action === 'practice-set-exam') {
    state.practiceExamType = el.dataset.exam;
    const cfg = EXAM_CONFIG[state.practiceExamType];
    state.practiceQuestionTypes = cfg ? cfg.types.map(t => t.id) : ['mcq'];
    rerender();
  }
  if (action === 'practice-toggle-all') {
    const cfg = EXAM_CONFIG[state.practiceExamType];
    state.practiceQuestionTypes = state.practiceQuestionTypes.length === cfg.types.length ? [] : cfg.types.map(t => t.id);
    rerender();
  }
  if (action === 'practice-inc-count') {
    state.practiceQuestionsPerType = Math.min(50, state.practiceQuestionsPerType + 1);
    const i = document.getElementById('practice-count'); if (i) i.value = state.practiceQuestionsPerType;
    rerender();
  }
  if (action === 'practice-dec-count') {
    state.practiceQuestionsPerType = Math.max(3, state.practiceQuestionsPerType - 1);
    const i = document.getElementById('practice-count'); if (i) i.value = state.practiceQuestionsPerType;
    rerender();
  }
  if (action === 'practice-inc-timer') {
    state.practiceTimer = Math.min(120, state.practiceTimer + 1);
    const i = document.getElementById('practice-timer'); if (i) i.value = state.practiceTimer;
    rerender();
  }
  if (action === 'practice-dec-timer') {
    state.practiceTimer = Math.max(1, state.practiceTimer - 1);
    const i = document.getElementById('practice-timer'); if (i) i.value = state.practiceTimer;
    rerender();
  }
  if (action === 'practice-transcribe') {
    if (!state.practiceAudioFilename) { alert('Please upload an audio file first.'); return; }
    el.textContent = 'Transcribing...'; el.disabled = true;
    try {
      const res = await api.post('/api/transcribe', { filename: state.practiceAudioFilename });
      state.practiceTranscript = res.text || '';
      const ta = document.getElementById('practice-transcript-input'); if (ta) ta.value = state.practiceTranscript;
    } catch (err) { alert('Transcribe failed: ' + err.message); }
    el.innerHTML = `${icon('auto_fix')} Auto-Transcribe`; el.disabled = false;
  }
  if (action === 'practice-generate') {
    const ta = document.getElementById('practice-transcript-input');
    if (ta) state.practiceTranscript = ta.value;
    if (!state.practiceTranscript) { alert('Please add a transcript first.'); return; }
    if (!state.practiceQuestionTypes.length) { alert('Select at least one question type.'); return; }
    el.textContent = 'Generating...'; el.disabled = true;
    try {
      const section = await api.post('/api/generate-questions', {
        transcript: state.practiceTranscript, examType: state.practiceExamType,
        questionTypes: state.practiceQuestionTypes, questionsPerType: state.practiceQuestionsPerType
      });
      if (!section.questions?.length) throw new Error('AI returned no questions.');
      state.practiceQuestions = section.questions.map((q, i) => ({ ...q, _idx: i }));
      state.practiceAnswers = {};
      state.practiceSubmitted = false;
      state.practiceScore = null;
      state.practiceTimeLeft = null;
      state.isPlaying = false;
      state.currentTime = 0;
      state.practiceStep = 3;
      rerender();
    } catch (err) {
      alert('Generate failed: ' + err.message);
      el.textContent = `Start Practice (${state.practiceQuestionTypes.length * state.practiceQuestionsPerType} Qs)`;
      el.disabled = false;
    }
  }
  if (action === 'practice-toggle-play') {
    const audio = document.getElementById('practice-test-audio'); if (!audio) return;
    if (state.isPlaying) { audio.pause(); state.isPlaying = false; }
    else { audio.play(); state.isPlaying = true; }
    el.innerHTML = icon(state.isPlaying ? 'pause' : 'play_arrow');
  }
  if (action === 'practice-start-timer') {
    if (state.practiceTimeLeft == null) {
      state.practiceTimeLeft = state.practiceTimer * 60;
      startPracticeCountdown();
      rerender();
    }
  }
  if (action === 'practice-submit') {
    const unanswered = state.practiceQuestions.length - Object.keys(state.practiceAnswers).length;
    if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    if (!confirm('Are you sure you want to submit your practice?')) return;
    submitPractice();
  }
  if (action === 'practice-view-details') {
    const details = document.getElementById('practice-details');
    if (details) details.classList.toggle('hidden');
  }
  if (action === 'practice-explain') {
    const idx = Number(el.dataset.pidx);
    const detail = document.getElementById(`practice-expl-${idx}`);
    if (detail) detail.classList.toggle('hidden');
    const q = state.practiceQuestions[idx];
    if (q?.transcript_quote && detail && !detail.classList.contains('hidden')) {
      highlightTranscriptQuote(q.transcript_quote);
    }
  }
  if (action === 'practice-restart') {
    if (state.practiceTimerInterval) { clearInterval(state.practiceTimerInterval); state.practiceTimerInterval = null; }
    Object.assign(state, {
      practiceStep: 1, practiceAudioFile: null, practiceAudioUrl: '', practiceAudioFilename: '',
      practiceTranscript: '', practiceQuestions: [], practiceAnswers: {},
      practiceScore: null, practiceSubmitted: false, practiceTimeLeft: null,
      isPlaying: false, currentTime: 0
    });
    rerender();
  }
  if (action === 'toggle-play') {
    const audio = document.getElementById('test-audio'); if (!audio) return;
    if (state.isPlaying) { audio.pause(); state.isPlaying = false; }
    else { audio.play(); state.isPlaying = true; }
    el.innerHTML = icon(state.isPlaying ? 'pause' : 'play_arrow');
  }
  if (action === 'submit-test') {
    const bank = state.testBank; if (!bank) return;
    const allQ = (bank.sections || []).flatMap(s => s.questions);
    const unanswered = allQ.length - Object.keys(state.answers).length;
    if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    let correct = 0;
    allQ.forEach(q => { if (isAnswerCorrect(state.answers[q.id], q.correct_answer, q.question_type)) correct++; });
    state.testScore = allQ.length ? (correct / allQ.length) * 10 : 0;
    state.isSubmitted = true;
    api.post('/api/results', { user_id: state.user.id, bank_id: state.selectedBankId, score: state.testScore, total_questions: allQ.length, correct_count: correct });
    rerender();
  }
  if (action === 'finish-test') {
    Object.assign(state, { selectedBankId: null, testBank: null, isSubmitted: false, activeTab: 'library' });
    rerender();
  }
  if (action === 'toggle-save') {
    const qId = Number(el.dataset.qId), isSaved = state.savedQuestionIds.has(qId);
    const r = await fetch('/api/saved-questions', {
      method: isSaved ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: state.user.id, question_id: qId })
    });
    if (r.ok) { isSaved ? state.savedQuestionIds.delete(qId) : state.savedQuestionIds.add(qId); el.className = `btn-bookmark${state.savedQuestionIds.has(qId) ? ' saved' : ''}`; }
  }
  if (action === 'unsave-question') {
    const qId = Number(el.dataset.qId);
    await fetch('/api/saved-questions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: state.user.id, question_id: qId }) });
    el.closest('.saved-card')?.remove();
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.action === 'practice-answer-input') {
    const idx = Number(el.dataset.practiceQ);
    if (el.value) state.practiceAnswers[idx] = el.value; else delete state.practiceAnswers[idx];
    updatePracticeNavigator();
  }
  if (el.dataset.action === 'answer-input') {
    const qId = Number(el.dataset.qId);
    if (el.value) state.answers[qId] = el.value; else delete state.answers[qId];
    updateNavigator();
  }
  if (el.id === 'transcript-input') {
    state.transcript = el.value;
    const gb = document.getElementById('generate-btn'); if (gb) gb.disabled = !el.value || !state.selectedQuestionTypes.length;
  }
  if (el.id === 'start-time-input') { state.startTime = Number(el.value); const v = document.getElementById('start-val'); if (v) v.textContent = fmtTime(state.startTime); }
  if (el.id === 'end-time-input') { state.endTime = Number(el.value); const v = document.getElementById('end-val'); if (v) v.textContent = fmtTime(state.endTime); }
  if (el.id === 'question-count') { const v = Number(el.value); if (v >= 5 && v <= 50) state.questionCount = v; }
  if (el.id === 'practice-transcript-input') {
    state.practiceTranscript = el.value;
    const gb = document.getElementById('practice-generate-btn'); if (gb) gb.disabled = !el.value || !state.practiceQuestionTypes.length;
  }
  if (el.id === 'practice-count') { const v = Number(el.value); if (v >= 3 && v <= 50) state.practiceQuestionsPerType = v; }
  if (el.id === 'practice-timer') { const v = Number(el.value); if (v >= 1 && v <= 120) state.practiceTimer = v; }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'practice-audio-input') {
    const file = el.files[0]; if (!file) return;
    state.practiceAudioFile = file;
    const label = document.getElementById('practice-file-label'); if (label) label.textContent = file.name;
    const fd = new FormData(); fd.append('audio', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    state.practiceAudioUrl = data.url; state.practiceAudioFilename = data.filename || '';
    const zone = document.getElementById('practice-upload-zone');
    if (zone && !zone.querySelector('[data-action="practice-next"]')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary'; btn.dataset.action = 'practice-next';
      btn.innerHTML = `Continue ${icon('arrow_forward')}`; zone.appendChild(btn);
    }
  }
  if (el.id === 'audio-file-input') {
    const file = el.files[0]; if (!file) return;
    state.audioFile = file;
    const label = document.getElementById('file-label'); if (label) label.textContent = file.name;
    const fd = new FormData(); fd.append('audio', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    state.audioUrl = data.url; state.audioFilename = data.filename || '';
    const zone = document.getElementById('upload-zone');
    if (zone && !zone.querySelector('[data-action="next-step"]')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary'; btn.dataset.action = 'next-step';
      btn.innerHTML = `Continue ${icon('arrow_forward')}`; zone.appendChild(btn);
    }
  }
  if (el.type === 'radio' && el.dataset.practiceQ !== undefined) {
    const idx = Number(el.dataset.practiceQ);
    state.practiceAnswers[idx] = el.value;
    const container = el.closest('.mcq-options, .tf-options');
    if (container) { container.querySelectorAll('.mcq-option, .tf-option').forEach(o => o.classList.remove('selected')); el.closest('.mcq-option, .tf-option')?.classList.add('selected'); }
    updatePracticeNavigator();
  }
  if (el.type === 'radio' && el.dataset.qId) {
    const qId = Number(el.dataset.qId);
    state.answers[qId] = el.value;
    const container = el.closest('.mcq-options, .tf-options');
    if (container) { container.querySelectorAll('.mcq-option, .tf-option').forEach(o => o.classList.remove('selected')); el.closest('.mcq-option, .tf-option')?.classList.add('selected'); }
    updateNavigator();
  }
  if (el.classList.contains('practice-qtype-checkbox')) {
    const tid = el.dataset.typeId;
    if (el.checked) { if (!state.practiceQuestionTypes.includes(tid)) state.practiceQuestionTypes.push(tid); }
    else { state.practiceQuestionTypes = state.practiceQuestionTypes.filter(t => t !== tid); }
    rerender();
  }
  if (el.classList.contains('qtype-checkbox')) {
    const tid = el.dataset.typeId;
    if (el.checked) { if (!state.selectedQuestionTypes.includes(tid)) state.selectedQuestionTypes.push(tid); }
    else { state.selectedQuestionTypes = state.selectedQuestionTypes.filter(t => t !== tid); }
    rerender();
  }
});

function updateNavigator() {
  const allQ = (state.testBank?.sections || []).flatMap(s => s.questions);
  document.querySelectorAll('.q-dot').forEach((dot, idx) => { dot.className = `q-dot${state.answers[allQ[idx]?.id] ? ' answered' : ''}`; });
  const c = document.getElementById('q-counter'); if (c) c.textContent = `${Object.keys(state.answers).length} / ${allQ.length}`;
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  const username = document.getElementById('auth-username').value;
  const password = document.getElementById('auth-password').value;
  const roleGroup = document.getElementById('role-group');
  const isLogin = roleGroup.classList.contains('hidden');
  const submit = document.getElementById('auth-submit');
  submit.disabled = true; submit.textContent = 'Please wait...';
  try {
    const body = isLogin ? { username, password } : { username, password, role: Number(document.getElementById('auth-role').value) };
    const data = await api.post(isLogin ? '/api/auth/login' : '/api/auth/register', body);
    if (data.success) {
      if (isLogin) { state.user = data.user; render(); }
      else {
        roleGroup.classList.add('hidden');
        document.getElementById('auth-title').textContent = 'Welcome Back';
        submit.textContent = 'Sign In';
        document.getElementById('auth-toggle').textContent = 'Sign Up';
        document.getElementById('auth-switch-text').textContent = "Don't have an account? ";
        alert('Account created! Please sign in.');
      }
    }
  } catch (err) { alert(err.message); }
  submit.disabled = false; if (!state.user) submit.textContent = isLogin ? 'Sign In' : 'Sign Up';
});

document.addEventListener('click', (e) => {
  if (e.target.id !== 'auth-toggle') return;
  const rg = document.getElementById('role-group'), isLogin = rg.classList.contains('hidden');
  if (isLogin) {
    rg.classList.remove('hidden'); document.getElementById('auth-title').textContent = 'Create Account';
    document.getElementById('auth-submit').textContent = 'Sign Up'; e.target.textContent = 'Sign In';
    document.getElementById('auth-switch-text').textContent = 'Already have an account? ';
  } else {
    rg.classList.add('hidden'); document.getElementById('auth-title').textContent = 'Welcome Back';
    document.getElementById('auth-submit').textContent = 'Sign In'; e.target.textContent = 'Sign Up';
    document.getElementById('auth-switch-text').textContent = "Don't have an account? ";
  }
});

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-filter]'); if (!tab) return;
  document.querySelectorAll('[data-filter]').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const filter = tab.dataset.filter;
  const grid = document.getElementById('library-grid'); if (!grid) return;
  grid.innerHTML = `<div class="loading">${icon('sync')} Loading...</div>`;
  const banks = await api.get(`/api/banks?userId=${state.user.id}`);
  const filtered = filter === 'All' ? banks : banks.filter(b => b.exam_type === filter);
  renderBankGrid(filtered, 'library-grid');
  if (!filtered.length) grid.innerHTML = `<div class="empty-state">${icon('search')}<p>No tests found for ${filter}.</p></div>`;
});

render();
