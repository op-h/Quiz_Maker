(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────
  let localChallenges = [];
  let aiGeneratedQuestions = [];

  const AI_SETTINGS_KEY = '__quiz_maker_ai_settings';
  const AI_FEATURE_STATE_KEY = '__quiz_maker_ai_enabled';
  const EXAM_SETTINGS_KEY = '__ctf_exam_settings';
  // Named-exam library: teachers save/organize multiple question sets without JSON files.
  const LIBRARY_KEY = '__ctf_exam_library';
  // Exam settings were previously read only at export time, so they silently reset on reload.
  // These fields are persisted on every edit and restored on init.
  const EXAM_SETTING_FIELDS = [
    { id: 'exam-title', kind: 'value' },
    { id: 'exam-password', kind: 'value' },
    { id: 'teacher-password', kind: 'value' },
    { id: 'lock-copy-paste', kind: 'checked' },
    { id: 'exam-mode', kind: 'checked' },
    { id: 'enable-timer', kind: 'checked' },
    { id: 'exam-timer-minutes', kind: 'value' },
    { id: 'allow-retake', kind: 'checked' },
    { id: 'offline-question-limit', kind: 'value' }
  ];
  const AI_DEFAULT_SETTINGS = {
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434/api/chat',
    model: 'llama3.2',
    apiKey: ''
  };
  let aiFeaturesEnabled = true;
  const AI_PROVIDER_PRESETS = {
    ollama: {
      endpoint: 'http://127.0.0.1:11434/api/chat',
      model: 'llama3.2',
      apiKey: ''
    },
    openrouter: {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4o-mini',
      apiKey: ''
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'gpt-4o-mini',
      apiKey: ''
    },
    custom: {
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'gpt-4o-mini',
      apiKey: ''
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function showAlert(msg, ok) {
    const el = $('admin-alert');
    el.textContent = msg;
    el.className = 'alert-bar ' + (ok ? 'success' : 'error');
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  window.thmConfirm = function(message, onConfirm) {
    const modal = $('htb-modal');
    if (!modal) {
      if (confirm(message)) onConfirm();
      return;
    }
    const body = $('htb-modal-body');
    const btnCancel = $('htb-modal-cancel');
    const btnConfirm = $('htb-modal-confirm');
    
    body.textContent = message;
    modal.classList.add('active');
    
    const newCancel = btnCancel.cloneNode(true);
    const newConfirm = btnConfirm.cloneNode(true);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);

    newCancel.addEventListener('click', () => { modal.classList.remove('active'); });
    newConfirm.addEventListener('click', () => {
      modal.classList.remove('active');
      if (onConfirm) onConfirm();
    });
  };

  // ─── Init ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('__ctf_exam_builder');
    if (saved) {
      try { localChallenges = JSON.parse(saved); } catch (e) { localChallenges = []; }
    }
    applyAiSettingsToForm();
    bindAiSettingsInputs();
    applyAiFeatureState(loadAiFeatureState());
    updateAiSourceFileStatus();
    renderAiGeneratedPreview();
    if ($('btn-ai-openrouter-signin')) $('btn-ai-openrouter-signin').addEventListener('click', startOpenRouterSignIn);
    completeOpenRouterOAuth();

    // Restore exam settings before the first renderTable so the stats dashboard reflects them.
    const examSettingsRestored = restoreExamSettings();
    bindExamSettingsInputs();
    showFileProtocolAiNote();

    renderTable();
    showSection('list-section');

    if (examSettingsRestored) showAlert('Your saved exam settings were restored.', true);

    if ($('btn-preview-quiz')) $('btn-preview-quiz').addEventListener('click', () => generateExam(true));

    if ($('btn-toggle-ai')) {
      $('btn-toggle-ai').addEventListener('click', () => {
        const nextState = !aiFeaturesEnabled;
        persistAiFeatureState(nextState);
        showAlert('Instructor AI tools ' + (nextState ? 'enabled.' : 'disabled.'), true);
      });
    }
    
    // Attach listener to update timer stats live
    if($('enable-timer')) $('enable-timer').addEventListener('change', updateStatsDashboard);
    if($('exam-timer-minutes')) $('exam-timer-minutes').addEventListener('input', updateStatsDashboard);

    // Save/Load library + backend-free Share. Buttons live in index.html (owned by GRANITE);
    // guard so the builder still works if the markup hasn't shipped yet.
    if ($('btn-exam-library')) $('btn-exam-library').addEventListener('click', openLibraryModal);
    if ($('btn-share-exam')) $('btn-share-exam').addEventListener('click', openShareModal);

    // A "#exam=…" hash means the page was opened from a share link: offer to import it.
    maybeImportFromShareHash();
  });

  // ─── Navigation ──────────────────────────────────────────────
  function showSection(id) {
    ['list-section', 'editor-section', 'settings-section', 'ai-section'].forEach(s => {
      const el = $(s);
      if (el) el.style.display = s === id ? 'block' : 'none';
    });
  }

  document.querySelectorAll('.admin-sidebar-nav button').forEach(btn => {
    btn.addEventListener('click', e => {
      let targetBtn = e.target.closest('button');
      if(!targetBtn) return;
      document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      
      const btnId = targetBtn.id;
      if (btnId === 'nav-add') {
        openEditor(null);
        showSection('editor-section');
      } else if (btnId === 'nav-ai') {
        showSection('ai-section');
      } else if (btnId === 'nav-settings') {
        showSection('settings-section');
      } else {
        renderTable();
        showSection('list-section');
      }
    });
  });

  // ─── Table ───────────────────────────────────────────────────
  function updateStatsDashboard() {
    const totalQ = localChallenges.length;
    let totalPts = 0;
    const types = new Set();
    localChallenges.forEach(ch => {
      totalPts += Number(ch.points || 10);
      types.add(ch.type === 'mcq' ? 'MCQ' : (ch.type === 'code' ? 'Code' : 'Text'));
    });
    
    if($('stat-total')) $('stat-total').textContent = totalQ;
    if($('stat-points')) $('stat-points').textContent = totalPts;
    if($('stat-types')) $('stat-types').textContent = totalQ > 0 ? types.size : '—';
    if($('stat-types-detail')) $('stat-types-detail').textContent = totalQ > 0 ? Array.from(types).join(', ') : 'no questions yet';
    if($('nav-count-questions')) $('nav-count-questions').textContent = totalQ;
    
    const timerOn = $('enable-timer') && $('enable-timer').checked;
    const mins = $('exam-timer-minutes') ? $('exam-timer-minutes').value : 60;
    if($('stat-timer')) {
      $('stat-timer').textContent = timerOn ? mins + 'm' : 'OFF';
      $('stat-timer').parentElement.className = timerOn ? 'stat-card' : 'stat-card accent-warning';
    }
    if($('stat-timer-detail')) $('stat-timer-detail').textContent = timerOn ? 'auto-submit active' : 'no time limit';
  }

  function renderTable() {
    updateStatsDashboard();
    const tbody = $('challenges-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const selectAll = $('select-all-q');
    if (selectAll) selectAll.checked = false;

    if (localChallenges.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6; // full table width: checkbox, ID, topic, question, hash, actions
      td.innerHTML = `
        <div style="text-align:center;padding:48px 24px;color:var(--text-muted);">
          <div style="font-size:16px;font-weight:600;color:var(--text-bright);margin-bottom:8px;">No questions yet</div>
          <div style="margin-bottom:20px;">Add questions &rarr; set exam options &rarr; preview &rarr; export the offline HTML.</div>
          <button type="button" id="empty-add-first" class="success">Add your first question</button>
        </div>`;
      tr.appendChild(td);
      tbody.appendChild(tr);
      const addFirst = $('empty-add-first');
      if (addFirst) addFirst.addEventListener('click', () => {
        document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
        if ($('nav-add')) $('nav-add').classList.add('active');
        openEditor(null);
        showSection('editor-section');
      });
      return;
    }

    [...localChallenges].sort((a, b) => a.id - b.id).forEach(ch => {
      const tr = document.createElement('tr');
      const typeLabel = ch.type === 'mcq' ? 'MCQ' : (ch.type === 'code' ? 'Code' : 'Text');
      const typeClass = ch.type === 'mcq' ? 'mcq' : (ch.type === 'code' ? 'code' : '');
      const hashDisplay = ch.type === 'code' ? '<i style="color:var(--text-muted)">Verifier Script Attached</i>' : `<span style="color:var(--text-muted);font-size:12px">Hashed: ${ch.hash ? escHtml(String(ch.hash).substring(0, 8)) : 'none'}...</span>`;
      const questionText = String(ch.q || '');
      const questionMeta = [
        `${questionText.length} chars`,
        ch.qAr ? 'Arabic' : '',
        ch.hint ? 'Hint' : '',
        ch.attachment ? 'File' : ''
      ].filter(Boolean).map(item => `<span>${escHtml(item)}</span>`).join('');
      
      tr.innerHTML = `
        <td><input type="checkbox" class="q-select" data-id="${escHtml(String(ch.id))}" style="width:16px;height:16px;cursor:pointer;"></td>
        <td>${escHtml(String(ch.id))}</td>
        <td>
          <div style="font-weight:600;color:var(--text-bright);margin-bottom:4px;">${escHtml(ch.topic)}</div>
          <span class="type-badge ${typeClass}">${typeLabel}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(${escHtml(String(ch.points == null ? 10 : ch.points))} pts)</span>
        </td>
        <td>
          <div class="question-preview" title="${escHtml(questionText)}">${escHtml(questionText)}</div>
          <div class="question-preview-meta">${questionMeta}</div>
        </td>
        <td>${hashDisplay}</td>
        <td>
          <div class="actions-row">
            <button class="btn-action-icon edit-btn" title="Edit Question" aria-label="Edit question" onclick="window._editCh(${Number(ch.id)})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn-action-icon del-btn" title="Delete Question" aria-label="Delete question" onclick="window._delCh(${Number(ch.id)})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // Select-all checkbox
  document.addEventListener('change', e => {
    if (e.target.id === 'select-all-q') {
      document.querySelectorAll('.q-select').forEach(cb => cb.checked = e.target.checked);
    }
  });

  // Get selected question IDs (returns all if none selected)
  function getSelectedChallenges() {
    const checked = [...document.querySelectorAll('.q-select:checked')].map(cb => Number(cb.dataset.id));
    if (checked.length === 0) return localChallenges; // none selected = export all
    return localChallenges.filter(c => checked.includes(c.id));
  }

  // ─── Editor Logic & Dynamic Forms ────────────────────────────
  
  function updateDynamicForm() {
    const type = $('edit-type').value;
    ['part-text', 'part-mcq', 'part-code'].forEach(id => $(id).style.display = 'none');
    $('part-' + type).style.display = 'flex';
  }
  if($('edit-type')) $('edit-type').addEventListener('change', updateDynamicForm);

  // Auto-scoring config for code questions: reveal only the fields relevant to the chosen mode.
  function _syncCodeGradeMode() {
    const sel = $('edit-code-grade-mode');
    if (!sel) return;
    const mode = sel.value;
    if ($('code-grade-output')) $('code-grade-output').style.display = mode === 'output' ? 'flex' : 'none';
    if ($('code-grade-tests')) $('code-grade-tests').style.display = mode === 'tests' ? 'flex' : 'none';
    if ($('code-grade-similarity')) $('code-grade-similarity').style.display = mode === 'similarity' ? 'flex' : 'none';
  }
  if ($('edit-code-grade-mode')) $('edit-code-grade-mode').addEventListener('change', _syncCodeGradeMode);

  function addMcqOption(val = '', isCorrect = false) {
    const container = $('mcq-options-list');
    const row = document.createElement('div');
    row.className = 'mcq-option-row';
    const rId = Math.random().toString(36).slice(2, 7);
    row.innerHTML = `
      <input type="radio" name="mcq-correct" value="${rId}" ${isCorrect ? 'checked' : ''} title="Mark as correct answer">
      <input type="text" class="mcq-val" placeholder="Option text" value="${escHtml(val)}">
      <button class="mcq-remove-btn" type="button" title="Remove Option" aria-label="Remove option">✕</button>
    `;
    row.querySelector('.mcq-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  if($('btn-add-mcq-option')) {
    $('btn-add-mcq-option').addEventListener('click', () => addMcqOption());
  }

  function renderMcqOptions(options) {
    $('mcq-options-list').innerHTML = '';
    if(!options || options.length === 0) {
      addMcqOption('Option A', true);
      addMcqOption('Option B', false);
    } else {
      options.forEach(o => addMcqOption(o.text, o.isCorrect));
    }
  }

  function openEditor(id) {
    $('edit-id').value = (id !== null) ? id : '';
    const titleEl = $('editor-title');
    titleEl.innerHTML = (id !== null) 
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Edit Question #${id}` 
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add New Question`;

    if (id !== null) {
      const ch = localChallenges.find(x => x.id === id);
      if (!ch) return;
      $('edit-order').value = ch.id;
      $('edit-points').value = ch.points || 10;
      $('edit-topic').value = ch.topic;
      $('edit-type').value = ch.type || 'text';
      $('edit-q-en').value = ch.q;
      $('edit-q-ar').value = ch.qAr || '';
      if($('edit-hint')) $('edit-hint').value = ch.hint || '';
      
      // Load specific fields
      if (ch.type === 'mcq') {
        renderMcqOptions(ch.options);
      } else if (ch.type === 'code') {
        $('edit-code-lang').value = ch.codeLang || 'html';
        const cg = ch.codeGrade || {};
        if ($('edit-code-grade-mode')) $('edit-code-grade-mode').value = cg.mode || 'manual';
        if ($('edit-code-expected')) $('edit-code-expected').value = cg.expected || '';
        if ($('edit-code-match')) $('edit-code-match').value = cg.match || 'contains';
        if ($('edit-code-normalize')) $('edit-code-normalize').checked = !!cg.normalize;
        if ($('edit-code-tests')) $('edit-code-tests').value = cg.tests || '';
        if ($('edit-code-reference')) $('edit-code-reference').value = cg.reference || '';
        _syncCodeGradeMode();
      } else {
        $('edit-answer-text').value = '';
        $('edit-answer-text').placeholder = 'Leave blank to keep current answer';
        // Show note if existing question has an attachment
        const existNote = $('attachment-existing-note');
        const areaBox = $('file-upload-area');
        if (existNote && areaBox) {
          if (ch.attachment) {
            existNote.style.display = 'block';
            areaBox.style.borderColor = 'var(--accent-warning)';
          } else {
            existNote.style.display = 'none';
            areaBox.style.borderColor = 'var(--border-color)';
          }
        }
        _resetAttachmentUI();
      }
    } else {
      const nextId = localChallenges.length > 0
        ? Math.max(...localChallenges.map(x => x.id)) + 1 : 1;
      $('edit-order').value = nextId;
      $('edit-points').value = 10;
      $('edit-topic').value = '';
      $('edit-type').value = 'text';
      $('edit-q-en').value = '';
      $('edit-q-ar').value = '';
      if($('edit-hint')) $('edit-hint').value = '';
      $('edit-answer-text').value = '';
      $('edit-answer-text').placeholder = 'Required for new text questions';
      renderMcqOptions([]);
      $('edit-code-lang').value = 'html';
      if ($('edit-code-grade-mode')) $('edit-code-grade-mode').value = 'manual';
      if ($('edit-code-expected')) $('edit-code-expected').value = '';
      if ($('edit-code-match')) $('edit-code-match').value = 'contains';
      if ($('edit-code-normalize')) $('edit-code-normalize').checked = false;
      if ($('edit-code-tests')) $('edit-code-tests').value = '';
      _syncCodeGradeMode();
      _resetAttachmentUI();
      if($('attachment-existing-note')) $('attachment-existing-note').style.display = 'none';
      if($('file-upload-area')) $('file-upload-area').style.borderColor = 'var(--border-color)';
    }
    updateDynamicForm();
  }

  window._editCh = function (id) {
    openEditor(id);
    showSection('editor-section');
    document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
    $('nav-add').classList.add('active');
  };

  window._delCh = function (id) {
    window.thmConfirm('Delete Question #' + id + '?', () => {
      localChallenges = localChallenges.filter(c => c.id !== id);
      saveToStorage();
      renderTable();
      showAlert('Question #' + id + ' deleted.', true);
    });
  };

  $('btn-cancel-edit').addEventListener('click', () => {
    showSection('list-section');
    renderTable();
    document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
    $('nav-list').classList.add('active');
  });

  // ─── Attachment UI helpers ─────────────────────────────────────
  var _pendingAttachment = null; // { name, type, data: base64string }

  function _resetAttachmentUI() {
    _pendingAttachment = null;
    const fi = $('edit-attachment');
    if (fi) fi.value = '';
    const ph = $('file-upload-placeholder');
    const pv = $('file-upload-preview');
    if (ph) ph.style.display = 'block';
    if (pv) pv.style.display = 'none';
  }

  function _showAttachmentPreview(name) {
    const ph = $('file-upload-placeholder');
    const pv = $('file-upload-preview');
    const nm = $('file-upload-name');
    if (!ph || !pv || !nm) return;
    ph.style.display = 'none';
    pv.style.display = 'flex';
    nm.textContent = '📎 ' + name;
    if ($('file-upload-area')) $('file-upload-area').style.borderColor = 'var(--accent-primary)';
  }

  const _attachInput = $('edit-attachment');
  if (_attachInput) {
    _attachInput.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const MAX_MB = 2;
      if (file.size > MAX_MB * 1024 * 1024) {
        alert('File is too large. Maximum size is ' + MAX_MB + 'MB.');
        this.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        _pendingAttachment = { name: file.name, type: file.type, data: e.target.result };
        _showAttachmentPreview(file.name);
      };
      reader.readAsDataURL(file);
    });
  }

  const _removeBtn = $('btn-remove-attachment');
  if (_removeBtn) {
    _removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _resetAttachmentUI();
      if ($('file-upload-area')) $('file-upload-area').style.borderColor = 'var(--border-color)';
    });
  }

  // Drag-over style feedback
  const _uploadArea = $('file-upload-area');
  if (_uploadArea) {
    _uploadArea.addEventListener('dragover', function(e) { e.preventDefault(); this.style.borderColor = 'var(--accent-primary)'; this.style.background = 'rgba(88,166,255,.05)'; });
    _uploadArea.addEventListener('dragleave', function() { this.style.background = 'var(--input-bg)'; if (!_pendingAttachment) this.style.borderColor = 'var(--border-color)'; });
    _uploadArea.addEventListener('drop', function(e) {
      e.preventDefault();
      this.style.background = 'var(--input-bg)';
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const inp = $('edit-attachment');
      // Trigger the change handler manually via DataTransfer
      const dt = new DataTransfer();
      dt.items.add(file);
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change'));
    });
  }

  $('btn-save-challenge').addEventListener('click', () => {
    const editIdRaw = $('edit-id').value;
    const editId = editIdRaw !== '' ? parseInt(editIdRaw) : null;
    const newId = parseInt($('edit-order').value);
    const points = parseFloat($('edit-points').value) || 10;
    const topic = $('edit-topic').value.trim();
    const qType = $('edit-type').value;
    const qEn = $('edit-q-en').value.trim();
    const qAr = $('edit-q-ar').value.trim();
    const hint = $('edit-hint') ? $('edit-hint').value.trim() : '';
    
    if (!newId || !topic || !qEn) {
      return alert('Please fill in all required core fields (ID, Topic, Question).');
    }

    const existing = (editId !== null) ? localChallenges.find(c => c.id === editId) : null;

    // Order/ID is the primary key — block collisions that would overwrite or duplicate another question.
    const conflict = localChallenges.find(c => c.id === newId && (!existing || c.id !== existing.id));
    if (conflict) {
      return alert('Order/ID ' + newId + ' is already used by another question ("' + (conflict.topic || 'untitled') + '"). Choose a different Order value.');
    }

    let newHash = existing ? existing.hash : null;
    let newAnsLen = existing ? (existing.ansLen || 1) : 1;
    // answerMask is a length/word-shape hint for the slotted answer box (text questions only).
    // Seed from the existing question so the keep-hash edit path (blank answer field) preserves it.
    let newAnswerMask = existing ? existing.answerMask : undefined;
    let format = '';
    let optionsData = [];
    let codeLang = '';

    if (qType === 'text') {
      const ans = $('edit-answer-text').value.trim();
      if (!existing && !ans) return alert('An answer is required for new Text questions.');
      if (ans) {
        newHash = window.CTF_DATA.encodeInput(ans);
        // Replace non-space characters with dash
        format = ans.split('').map(c => c === ' ' ? ' ' : '-').join('');
        newAnsLen = ans.length;
        // Mask uses the SAME normalize as the hash (lowercase+trim) so the slot count matches
        // what the runtime verifies; every non-space char becomes '_', spaces stay as word gaps.
        newAnswerMask = window.CTF_DATA.normalizeInput(ans).replace(/[^ ]/g, '_');
      } else if (existing) {
        format = existing.format || '';
      }
    } else if (qType === 'mcq') {
      const optionRows = document.querySelectorAll('.mcq-option-row');
      if(optionRows.length < 2) return alert('MCQ must have at least 2 options.');
      
      let correctSelected = false;
      let correctText = '';
      
      optionRows.forEach(row => {
        const isChecked = row.querySelector('input[type="radio"]').checked;
        const textVal = row.querySelector('input[type="text"]').value.trim();
        if(!textVal) return;
        
        optionsData.push({ text: textVal, isCorrect: isChecked });
        if(isChecked) {
          correctSelected = true;
          correctText = textVal;
        }
      });
      
      if(!correctSelected) return alert('Please select a correct answer for the MCQ.');
      newHash = window.CTF_DATA.encodeInput(correctText);
      newAnsLen = correctText.length;
      format = 'Multiple Choice';
    } else if (qType === 'code') {
      codeLang = $('edit-code-lang').value;
      newHash = 'code_challenge_manual_verify';
      newAnsLen = 0;
      format = 'Code Execution / Sandbox';
    }

    // Handle file attachment for text questions
    let attachmentData = undefined;
    if (qType === 'text') {
      if (_pendingAttachment) {
        // New file uploaded — use it
        attachmentData = _pendingAttachment;
      } else if (existing && existing.attachment) {
        // No new file, keep existing attachment
        attachmentData = existing.attachment;
      }
    }

    const updated = { 
      id: newId, points, topic, type: qType, q: qEn, qAr, 
      format, hint, hash: newHash, ansLen: newAnsLen
    };
    if (qType === 'text' && newAnswerMask) updated.answerMask = newAnswerMask;
    if (qType === 'mcq') updated.options = optionsData;
    if (qType === 'code') {
      updated.codeLang = codeLang;
      // Auto-scoring config. Absent controls default to manual so old builders keep working.
      updated.codeGrade = {
        mode: $('edit-code-grade-mode') ? $('edit-code-grade-mode').value : 'manual',
        expected: $('edit-code-expected') ? $('edit-code-expected').value : '',
        match: $('edit-code-match') ? $('edit-code-match').value : 'contains',
        normalize: $('edit-code-normalize') ? $('edit-code-normalize').checked : false,
        tests: $('edit-code-tests') ? $('edit-code-tests').value : '',
        reference: $('edit-code-reference') ? $('edit-code-reference').value : ''
      };
    }
    if (attachmentData) updated.attachment = attachmentData;

    _resetAttachmentUI();

    if (existing) {
      localChallenges = localChallenges.map(c => c.id === existing.id ? updated : c);
      showAlert('Question updated successfully.', true);
    } else {
      localChallenges = localChallenges.filter(c => c.id !== newId);
      localChallenges.push(updated);
      showAlert('Question added.', true);
    }

    saveToStorage();
    renderTable();
    showSection('list-section');
    document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
    $('nav-list').classList.add('active');
  });

  // ─── Storage ─────────────────────────────────────────────────
  function saveToStorage() {
    localChallenges.sort((a, b) => a.id - b.id);
    try {
      localStorage.setItem('__ctf_exam_builder', JSON.stringify(localChallenges));
    } catch (e) {
      showAlert('Could not save — browser storage is full. Remove large file attachments, or export your questions to JSON and clear space.', false);
    }
  }

  // ─── Exam settings persistence ───────────────────────────────
  // Snapshot the raw form fields keyed by element id. This is the shape restoreExamSettings()
  // consumes, so library/share reuse it (not readExamSettings(), whose passwords are one-way
  // hashed and could never be written back into the password inputs).
  function collectExamSettings() {
    const data = {};
    EXAM_SETTING_FIELDS.forEach(f => {
      const el = $(f.id);
      if (!el) return;
      data[f.id] = f.kind === 'checked' ? el.checked : el.value;
    });
    return data;
  }

  function saveExamSettings() {
    try {
      localStorage.setItem(EXAM_SETTINGS_KEY, JSON.stringify(collectExamSettings()));
    } catch (e) { /* quota or file:// with storage disabled — settings just won't persist */ }
  }

  function restoreExamSettings() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(EXAM_SETTINGS_KEY) || 'null');
    } catch (e) { data = null; }
    if (!data || typeof data !== 'object') return false;
    let restored = false;
    EXAM_SETTING_FIELDS.forEach(f => {
      const el = $(f.id);
      if (!el || !(f.id in data)) return;
      if (f.kind === 'checked') el.checked = !!data[f.id];
      else el.value = data[f.id];
      restored = true;
    });
    return restored;
  }

  function bindExamSettingsInputs() {
    EXAM_SETTING_FIELDS.forEach(f => {
      const el = $(f.id);
      if (el) el.addEventListener(f.kind === 'checked' ? 'change' : 'input', saveExamSettings);
    });
  }

  // Local Ollama and OpenRouter sign-in need http; from file:// they can't work. Non-blocking hint.
  function showFileProtocolAiNote() {
    if (window.location.protocol !== 'file:') return;
    const section = $('ai-section');
    if (!section || $('ai-file-note')) return;
    const note = document.createElement('div');
    note.id = 'ai-file-note';
    note.className = 'ai-callout';
    note.innerHTML = '<strong>Heads up:</strong> this builder is open from a <code>file://</code> page. Local Ollama and OpenRouter sign-in only work when the builder is served over http — run <code>python3 -m http.server 5500</code> in this folder, then open <code>http://127.0.0.1:5500/index.html</code>.';
    const header = section.querySelector('.admin-card-header');
    if (header && header.nextSibling) section.insertBefore(note, header.nextSibling);
    else section.insertBefore(note, section.firstChild);
  }

  function loadAiFeatureState() {
    try {
      const raw = localStorage.getItem(AI_FEATURE_STATE_KEY);
      return raw === null ? true : raw !== 'false';
    } catch (err) {
      return true;
    }
  }

  function applyAiFeatureState(enabled) {
    aiFeaturesEnabled = !!enabled;
    document.body.classList.toggle('ai-disabled', !aiFeaturesEnabled);

    const toggleBtn = $('btn-toggle-ai');
    if (toggleBtn) {
      toggleBtn.innerHTML = aiFeaturesEnabled
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.76 5.24H19l-4.25 3.09 1.62 5.22L12 12.4 7.63 15.55l1.62-5.22L5 7.24h5.24L12 2z"></path></svg>AI Tools: On'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.76 5.24H19l-4.25 3.09 1.62 5.22L12 12.4 7.63 15.55l1.62-5.22L5 7.24h5.24L12 2z"></path><line x1="4" y1="20" x2="20" y2="4"></line></svg>AI Tools: Off';
      toggleBtn.title = aiFeaturesEnabled ? 'Disable all instructor AI tools' : 'Enable all instructor AI tools';
    }

    const navAi = $('nav-ai');
    if (navAi) {
      navAi.disabled = !aiFeaturesEnabled;
      navAi.title = aiFeaturesEnabled ? 'Open AI Studio' : 'AI tools are disabled';
    }

    const editorAiButtons = [
      'btn-ai-improve-en',
      'btn-ai-generate-ar',
      'btn-ai-improve-ar',
      'btn-ai-generate-en',
      'btn-ai-generate-distractors'
    ];
    editorAiButtons.forEach(id => {
      const el = $(id);
      if (el) el.disabled = !aiFeaturesEnabled;
    });

    const aiSection = $('ai-section');
    if (aiSection) {
      aiSection.querySelectorAll('input, textarea, select, button').forEach(el => {
        el.disabled = !aiFeaturesEnabled;
      });
    }

    if (!aiFeaturesEnabled && aiSection && aiSection.style.display !== 'none') {
      showSection('list-section');
      document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
      if ($('nav-list')) $('nav-list').classList.add('active');
    }
  }

  function persistAiFeatureState(enabled) {
    localStorage.setItem(AI_FEATURE_STATE_KEY, enabled ? 'true' : 'false');
    applyAiFeatureState(enabled);
  }

  function loadAiSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || '{}') || {};
      const settings = Object.assign({}, AI_DEFAULT_SETTINGS, parsed);
      if (!parsed.provider) {
        if (/127\.0\.0\.1:11434|localhost:11434/i.test(settings.endpoint || '')) settings.provider = 'ollama';
        else if (/api\.openai\.com/i.test(settings.endpoint || '')) settings.provider = 'openai';
        else settings.provider = 'custom';
      }
      return settings;
    } catch (err) {
      return Object.assign({}, AI_DEFAULT_SETTINGS);
    }
  }

  function getAiSettingsFromForm() {
    return {
      provider: (($('ai-provider') && $('ai-provider').value) || AI_DEFAULT_SETTINGS.provider).trim(),
      endpoint: (($('ai-endpoint') && $('ai-endpoint').value) || AI_DEFAULT_SETTINGS.endpoint).trim(),
      model: (($('ai-model') && $('ai-model').value) || AI_DEFAULT_SETTINGS.model).trim(),
      apiKey: (($('ai-api-key') && $('ai-api-key').value) || '').trim()
    };
  }

  function applyAiSettingsToForm() {
    const settings = loadAiSettings();
    if ($('ai-provider')) $('ai-provider').value = settings.provider || AI_DEFAULT_SETTINGS.provider;
    if ($('ai-endpoint')) $('ai-endpoint').value = settings.endpoint;
    if ($('ai-model')) $('ai-model').value = settings.model;
    if ($('ai-api-key')) $('ai-api-key').value = settings.apiKey;
    syncAiProviderUi();
  }

  function persistAiSettings() {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(getAiSettingsFromForm()));
  }

  function bindAiSettingsInputs() {
    ['ai-endpoint', 'ai-model', 'ai-api-key'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', persistAiSettings);
    });
    if ($('ai-provider')) {
      $('ai-provider').addEventListener('change', function() {
        applyAiProviderPreset(this.value);
      });
    }
    if ($('ai-source-file')) $('ai-source-file').addEventListener('change', updateAiSourceFileStatus);
  }

  function ensureAiSettings() {
    if (!aiFeaturesEnabled) {
      throw new Error('AI tools are disabled in the instructor dashboard. Use the AI Tools button in the sidebar to enable them.');
    }
    const settings = getAiSettingsFromForm();
    if (!settings.endpoint) throw new Error('Set an AI endpoint in AI Studio first.');
    if (!settings.model) throw new Error('Set an AI model in AI Studio first.');
    if (settings.provider === 'ollama' && window.location.protocol === 'file:') {
      throw new Error('Ollama cannot be called from a file:// page. Start a local server in this folder, then open http://127.0.0.1:5500/index.html. On Windows, run: py -m http.server 5500');
    }
    if (settings.provider !== 'ollama' && !settings.apiKey && /api\.openai\.com/i.test(settings.endpoint)) {
      throw new Error('Enter an API key for the default OpenAI endpoint, or switch the endpoint to your own proxy.');
    }
    if (settings.provider === 'openrouter' && !settings.apiKey) {
      throw new Error('Sign in with OpenRouter (or paste an OpenRouter API key) in AI Studio first.');
    }
    return settings;
  }

  function syncAiProviderUi() {
    const provider = (($('ai-provider') && $('ai-provider').value) || AI_DEFAULT_SETTINGS.provider).trim();
    const endpointHelp = $('ai-endpoint-help');
    const modelHelp = $('ai-model-help');
    const authHelp = $('ai-auth-help');

    if (provider === 'ollama') {
      if (endpointHelp) endpointHelp.textContent = window.location.protocol === 'file:'
        ? 'Ollama is local and free, but this page is opened with file://. Start a local web server and reopen the builder from http://127.0.0.1:5500.'
        : 'Free local endpoint. Make sure Ollama is running on your machine.';
      if (modelHelp) modelHelp.textContent = 'Default local model is llama3.2. For stronger results on capable hardware, try qwen2.5:14b or gpt-oss:20b.';
      if (authHelp) authHelp.textContent = window.location.protocol === 'file:'
        ? 'No API key needed. First run a local server for this folder: py -m http.server 5500. Then open http://127.0.0.1:5500/index.html'
        : 'No API key needed for local Ollama. Example: ollama pull llama3.2 or ollama pull qwen2.5:14b';
      return;
    }

    if (provider === 'openrouter') {
      if (endpointHelp) endpointHelp.textContent = 'OpenRouter: one login for GPT, Claude, Gemini, Llama and more.';
      if (modelHelp) modelHelp.textContent = 'Use an OpenRouter model id, e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet, google/gemini-flash-1.5.';
      if (authHelp) authHelp.textContent = 'Click "Sign in with OpenRouter" to fetch a key automatically, or paste an existing OpenRouter key. Stored only in this browser.';
      return;
    }

    if (provider === 'openai') {
      if (endpointHelp) endpointHelp.textContent = 'Official OpenAI Responses API endpoint.';
      if (modelHelp) modelHelp.textContent = 'Supports structured JSON output and direct PDF input.';
      if (authHelp) authHelp.textContent = 'Stored only in this browser. For production or shared machines, use your own backend/proxy instead of exposing a real secret in the browser.';
      return;
    }

    if (endpointHelp) endpointHelp.textContent = 'Use your own OpenAI-compatible proxy or hosted provider endpoint.';
    if (modelHelp) modelHelp.textContent = 'Choose a model that supports strong instruction following and JSON-style outputs.';
    if (authHelp) authHelp.textContent = 'Leave blank only if your custom endpoint handles authentication upstream.';
  }

  function applyAiProviderPreset(provider) {
    const preset = AI_PROVIDER_PRESETS[provider] || AI_PROVIDER_PRESETS.custom;
    if ($('ai-provider')) $('ai-provider').value = provider;
    if ($('ai-endpoint')) $('ai-endpoint').value = preset.endpoint;
    if ($('ai-model')) $('ai-model').value = preset.model;
    if ($('ai-api-key') && provider === 'ollama') $('ai-api-key').value = '';
    syncAiProviderUi();
    persistAiSettings();
    updateAiSourceFileStatus();
  }

  function updateAiSourceFileStatus() {
    const label = $('ai-source-file-status');
    const input = $('ai-source-file');
    if (!label || !input) return;
    const file = input.files && input.files[0];
    const provider = (($('ai-provider') && $('ai-provider').value) || AI_DEFAULT_SETTINGS.provider).trim();
    const textOnly = provider === 'ollama' || provider === 'openrouter' || provider === 'groq';
    if (!file) {
      label.textContent = textOnly
        ? 'Supported directly: TXT, MD. PDFs should be pasted as text (only the OpenAI provider reads PDFs directly).'
        : 'Supported: PDF, TXT, MD.';
      return;
    }
    if (textOnly && (/pdf$/i.test(file.name) || file.type === 'application/pdf')) {
      label.textContent = 'Selected PDF: ' + file.name + '. This provider cannot read PDFs directly; paste the extracted text instead.';
      return;
    }
    label.textContent = 'Selected: ' + file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB)';
  }

  function setBusyState(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = busyText;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
      }
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file: ' + file.name));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file: ' + file.name));
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(file);
    });
  }

  function extractResponseText(payload) {
    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
      return payload.output_text.trim();
    }
    const refusal = [];
    const textParts = [];
    (payload.output || []).forEach(item => {
      (item.content || []).forEach(part => {
        if (part.type === 'refusal' && part.refusal) refusal.push(part.refusal);
        if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
          textParts.push(part.text);
        }
      });
    });
    if (refusal.length) throw new Error(refusal.join('\n'));
    const text = textParts.join('\n').trim();
    if (!text) throw new Error('AI returned no text output.');
    return text;
  }

  function flattenAiUserContentToText(userContent, provider) {
    const parts = [];
    (userContent || []).forEach(part => {
      if (part.type === 'input_text' && typeof part.text === 'string') {
        parts.push(part.text);
        return;
      }
      if (part.type === 'input_file') {
        if (provider === 'ollama') {
          throw new Error('PDF/file upload is not sent directly to Ollama. Paste the notes or convert the PDF to text first.');
        }
      }
    });
    return parts.join('\n\n').trim();
  }

  async function callOpenAiCompatibleJson(settings, options) {
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = 'Bearer ' + settings.apiKey;

    const body = {
      model: settings.model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: options.systemPrompt }]
        },
        {
          role: 'user',
          content: options.userContent
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: options.schemaName,
          strict: true,
          schema: options.schema
        }
      }
    };

    let response;
    try {
      response = await fetch(settings.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new Error('AI request failed: ' + err.message);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      throw new Error('AI endpoint returned invalid JSON.');
    }

    if (!response.ok) {
      const message = payload && payload.error && payload.error.message
        ? payload.error.message
        : 'HTTP ' + response.status;
      throw new Error(message);
    }

    return JSON.parse(extractResponseText(payload));
  }

  async function callOllamaJson(settings, options) {
    const promptText = flattenAiUserContentToText(options.userContent, 'ollama');
    const body = {
      model: settings.model,
      stream: false,
      format: options.schema,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: promptText }
      ]
    };

    let response;
    try {
      response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new Error('Ollama request failed: ' + err.message);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      throw new Error('Ollama returned invalid JSON.');
    }

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : ('HTTP ' + response.status);
      throw new Error(message);
    }

    const text = payload && payload.message && typeof payload.message.content === 'string'
      ? payload.message.content.trim()
      : '';
    if (!text) throw new Error('Ollama returned no message content.');

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error('Ollama did not return valid JSON. Try a stronger model or a smaller prompt.');
    }
  }

  // OpenAI-compatible Chat Completions (OpenRouter, Groq, most proxies).
  async function callChatCompletionsJson(settings, options) {
    if ((options.userContent || []).some(p => p && p.type === 'input_file')) {
      throw new Error('Direct PDF upload works only with the OpenAI provider. For OpenRouter, paste the notes as text.');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) headers.Authorization = 'Bearer ' + settings.apiKey;
    if (/openrouter\.ai/i.test(settings.endpoint)) {
      try { headers['HTTP-Referer'] = window.location.origin; headers['X-Title'] = 'Quiz Maker'; } catch (e) {}
    }

    const promptText = flattenAiUserContentToText(options.userContent, settings.provider);
    const systemPrompt = options.systemPrompt +
      '\n\nReturn ONLY a single minified JSON object (no markdown fences, no prose) that matches this JSON schema:\n' +
      JSON.stringify(options.schema);

    const body = {
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4
    };

    let response;
    try {
      response = await fetch(settings.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (err) {
      throw new Error('AI request failed: ' + err.message);
    }

    let payload = null;
    try { payload = await response.json(); } catch (err) { throw new Error('AI endpoint returned invalid JSON.'); }

    if (!response.ok) {
      const raw = payload && payload.error ? (payload.error.message || payload.error) : ('HTTP ' + response.status);
      throw new Error(typeof raw === 'string' ? raw : JSON.stringify(raw));
    }

    const choice = payload && payload.choices && payload.choices[0];
    let text = choice && choice.message ? String(choice.message.content || '').trim() : '';
    if (!text) throw new Error('AI returned no message content.');
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      return JSON.parse(text);
    } catch (err) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
      throw new Error('AI did not return valid JSON. Try a different model.');
    }
  }

  // ─── OpenRouter OAuth (PKCE) — "sign in with a famous LLM account" ───
  const OPENROUTER_VERIFIER_KEY = '__quiz_maker_or_verifier';
  const OPENROUTER_STATE_KEY = '__quiz_maker_or_state';

  function base64UrlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function sha256Base64Url(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return base64UrlFromBytes(new Uint8Array(digest));
  }

  function makeCodeVerifier() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return base64UrlFromBytes(arr);
  }

  async function startOpenRouterSignIn() {
    if (window.location.protocol === 'file:') {
      return showAlert('Sign-in needs the builder served over http. Run: py -m http.server 5500, then open http://127.0.0.1:5500/index.html', false);
    }
    if (!(window.crypto && crypto.subtle)) {
      return showAlert('This browser context cannot do a secure sign-in. Use https or localhost, or paste an API key instead.', false);
    }
    try {
      const verifier = makeCodeVerifier();
      sessionStorage.setItem(OPENROUTER_VERIFIER_KEY, verifier);
      const stateTok = makeCodeVerifier(); // random anti-CSRF state, echoed back on callback
      sessionStorage.setItem(OPENROUTER_STATE_KEY, stateTok);
      const challenge = await sha256Base64Url(verifier);
      const callback = window.location.origin + window.location.pathname;
      window.location.href = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(callback) +
        '&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=S256' +
        '&state=' + encodeURIComponent(stateTok);
    } catch (err) {
      showAlert('Could not start OpenRouter sign-in: ' + err.message, false);
    }
  }

  async function completeOpenRouterOAuth() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    const code = params.get('code');
    if (!code) return;
    const verifier = sessionStorage.getItem(OPENROUTER_VERIFIER_KEY) || '';
    const savedState = sessionStorage.getItem(OPENROUTER_STATE_KEY) || '';
    const returnedState = params.get('state');
    const cleanUrl = window.location.origin + window.location.pathname;
    // One-time secrets: clear immediately so a refresh/replay can't reuse them.
    sessionStorage.removeItem(OPENROUTER_VERIFIER_KEY);
    sessionStorage.removeItem(OPENROUTER_STATE_KEY);
    // CSRF / login-fixation defense: only finish a sign-in THIS browser started (a PKCE verifier is
    // present), and if the provider echoed a state it must match. Never exchange a bare, unsolicited code.
    if (!verifier) {
      try { window.history.replaceState({}, document.title, cleanUrl); } catch (e) {}
      return showAlert('Ignored an OpenRouter sign-in this browser did not start.', false);
    }
    if (returnedState && savedState && returnedState !== savedState) {
      try { window.history.replaceState({}, document.title, cleanUrl); } catch (e) {}
      return showAlert('OpenRouter sign-in blocked: state mismatch (possible CSRF).', false);
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.key) {
        throw new Error((data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status));
      }
      applyAiProviderPreset('openrouter');
      if ($('ai-api-key')) $('ai-api-key').value = data.key;
      persistAiSettings();
      showAlert('Signed in with OpenRouter — key saved in this browser. You can generate questions now.', true);
      showSection('ai-section');
      document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
      if ($('nav-ai')) $('nav-ai').classList.add('active');
    } catch (err) {
      showAlert('OpenRouter sign-in failed: ' + err.message, false);
    } finally {
      sessionStorage.removeItem(OPENROUTER_VERIFIER_KEY);
      try { window.history.replaceState({}, document.title, cleanUrl); } catch (e) {}
    }
  }

  async function callAiJson(options) {
    const settings = ensureAiSettings();
    if (settings.provider === 'ollama') {
      return callOllamaJson(settings, options);
    }
    if (settings.provider === 'openrouter' || settings.provider === 'groq') {
      return callChatCompletionsJson(settings, options);
    }
    return callOpenAiCompatibleJson(settings, options);
  }

  function buildTextAnswerFormat(answer) {
    return answer.split('').map(c => c === ' ' ? ' ' : '-').join('');
  }

  function dedupeOptions(options) {
    const seen = new Set();
    const out = [];
    options.forEach(opt => {
      const text = String((opt && opt.text) || '').trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ text, isCorrect: !!opt.isCorrect });
    });
    return out;
  }

  function normalizeAiQuestions(items) {
    if (!Array.isArray(items)) return [];

    return items.map((item, idx) => {
      const type = item && item.type === 'mcq' ? 'mcq' : 'text';
      const topic = String((item && item.topic) || '').trim() || ('AI Generated Topic ' + (idx + 1));
      const q = String((item && item.question_en) || '').trim();
      const qAr = String((item && item.question_ar) || '').trim();
      const hint = String((item && item.hint) || '').trim();
      const answerText = String((item && item.answer_text) || '').trim();

      if (!q) return null;

      if (type === 'mcq') {
        let options = Array.isArray(item.options)
          ? item.options.map(opt => ({
              text: String((opt && opt.text) || '').trim(),
              isCorrect: !!(opt && opt.is_correct)
            }))
          : [];

        if (answerText && !options.some(opt => opt.text.toLowerCase() === answerText.toLowerCase())) {
          options.unshift({ text: answerText, isCorrect: true });
        }

        options = dedupeOptions(options.map(opt => ({
          text: opt.text,
          isCorrect: opt.isCorrect || (!!answerText && opt.text.toLowerCase() === answerText.toLowerCase())
        })));

        const correct = options.filter(opt => opt.isCorrect);
        if (options.length < 2 || correct.length !== 1) return null;

        const correctText = correct[0].text;
        return {
          points: 10,
          topic,
          type: 'mcq',
          q,
          qAr,
          hint,
          options,
          hash: window.CTF_DATA.encodeInput(correctText),
          ansLen: correctText.length,
          format: 'Multiple Choice'
        };
      }

      if (!answerText) return null;
      return {
        points: 10,
        topic,
        type: 'text',
        q,
        qAr,
        hint,
        hash: window.CTF_DATA.encodeInput(answerText),
        ansLen: answerText.length,
        format: buildTextAnswerFormat(answerText)
      };
    }).filter(Boolean);
  }

  function renderAiGeneratedPreview() {
    const container = $('ai-generated-preview');
    const importBtn = $('btn-ai-import-generated');
    const clearBtn = $('btn-ai-clear-generated');
    if (!container) return;

    if (!aiGeneratedQuestions.length) {
      container.className = 'ai-preview-empty';
      container.textContent = 'No AI-generated questions yet.';
      if (importBtn) importBtn.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    container.className = 'ai-preview-list';
    container.innerHTML = aiGeneratedQuestions.map((q, idx) => {
      const optionsHtml = q.type === 'mcq'
        ? '<div class="ai-preview-options">' + q.options.map(opt => (
            '<div class="ai-preview-option' + (opt.isCorrect ? ' correct' : '') + '">' +
            escHtml(opt.text) +
            (opt.isCorrect ? ' <strong>(Correct)</strong>' : '') +
            '</div>'
          )).join('') + '</div>'
        : '';

      return (
        '<div class="ai-preview-card">' +
          '<div class="ai-preview-head">' +
            '<div class="ai-preview-title">' + (idx + 1) + '. ' + escHtml(q.topic) + '</div>' +
            '<div class="ai-preview-badges">' +
              '<span class="ai-preview-badge">' + escHtml(q.type.toUpperCase()) + '</span>' +
              (q.qAr ? '<span class="ai-preview-badge">Bilingual</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="ai-preview-text">' + escHtml(q.q) + '</div>' +
          (q.qAr ? '<div class="ai-preview-text ai-preview-ar">' + escHtml(q.qAr) + '</div>' : '') +
          optionsHtml +
        '</div>'
      );
    }).join('');

    if (importBtn) importBtn.style.display = 'inline-flex';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  }

  function importAiGeneratedQuestions() {
    if (!aiGeneratedQuestions.length) return showAlert('No AI-generated questions to import.', false);
    let nextId = localChallenges.length > 0 ? Math.max(...localChallenges.map(x => x.id)) + 1 : 1;
    aiGeneratedQuestions.forEach(q => {
      localChallenges.push(Object.assign({ id: nextId++ }, q));
    });
    saveToStorage();
    renderTable();
    showAlert('Imported ' + aiGeneratedQuestions.length + ' AI-generated question(s).', true);
    aiGeneratedQuestions = [];
    renderAiGeneratedPreview();
    showSection('list-section');
    document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
    if ($('nav-list')) $('nav-list').classList.add('active');
  }

  async function buildAiSourceContent(notes, file, options) {
    const content = [];
    const requestSummary = [
      'Create ' + options.count + ' classroom-ready quiz questions.',
      'Difficulty: ' + options.difficulty + '.',
      'Question mix: ' + options.mode + '.',
      options.includeArabic ? 'Provide Arabic translations in question_ar.' : 'Set question_ar to an empty string.',
      'Use only facts supported by the provided material.'
    ].join(' ');

    content.push({ type: 'input_text', text: requestSummary });

    const trimmedNotes = notes.trim();
    if (trimmedNotes) {
      content.push({ type: 'input_text', text: 'Teacher notes:\n' + trimmedNotes });
    }

    if (file) {
      if (/pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
        content.push({
          type: 'input_file',
          filename: file.name,
          file_data: encodeBytesToBase64(bytes)
        });
      } else {
        const text = await readFileAsText(file);
        content.push({
          type: 'input_text',
          text: 'File content from ' + file.name + ':\n' + text
        });
      }
    }

    return content;
  }

  async function generateQuizFromAi() {
    const notes = ($('ai-source-notes').value || '').trim();
    const sourceFile = $('ai-source-file').files && $('ai-source-file').files[0];
    const btn = $('btn-ai-generate-quiz');
    const options = {
      count: Math.max(1, Math.min(20, parseInt($('ai-question-count').value, 10) || 5)),
      difficulty: $('ai-difficulty').value || 'medium',
      mode: $('ai-output-mode').value || 'mixed',
      includeArabic: !!$('ai-include-arabic').checked
    };

    if (!notes && !sourceFile) {
      showSection('ai-section');
      return showAlert('Paste notes or choose a source file before generating AI questions.', false);
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        title_suggestion: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              topic: { type: 'string' },
              type: { type: 'string', enum: ['mcq', 'text'] },
              question_en: { type: 'string' },
              question_ar: { type: 'string' },
              hint: { type: 'string' },
              answer_text: { type: 'string' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    text: { type: 'string' },
                    is_correct: { type: 'boolean' }
                  },
                  required: ['text', 'is_correct']
                }
              }
            },
            required: ['topic', 'type', 'question_en', 'question_ar', 'hint', 'answer_text', 'options']
          }
        }
      },
      required: ['title_suggestion', 'questions']
    };

    const systemPrompt = [
      'You are an assessment design assistant for a secure classroom quiz builder.',
      'Create accurate questions based only on the provided notes or PDF.',
      'Do not invent unsupported facts.',
      'Use concise exam wording.',
      'For mcq questions, produce exactly 4 options with exactly 1 correct answer.',
      'For text questions, answer_text must be a short exact answer suitable for hashing.',
      'If Arabic is not requested, set question_ar to an empty string.'
    ].join(' ');

    setBusyState(btn, true, 'Generating...');
    try {
      const payload = await callAiJson({
        systemPrompt,
        userContent: await buildAiSourceContent(notes, sourceFile, options),
        schemaName: 'quiz_generation',
        schema
      });

      aiGeneratedQuestions = normalizeAiQuestions(payload.questions);
      if (!aiGeneratedQuestions.length) throw new Error('AI returned questions, but none could be converted into valid quiz items.');

      const titleInput = $('exam-title');
      const titleSuggestion = String((payload && payload.title_suggestion) || '').trim();
      if (titleInput && titleSuggestion && (!titleInput.value.trim() || titleInput.value.trim() === 'Custom Exam')) {
        titleInput.value = titleSuggestion;
      }

      renderAiGeneratedPreview();
      showAlert('AI generated ' + aiGeneratedQuestions.length + ' question(s). Review and import when ready.', true);
    } catch (err) {
      showAlert('AI generation failed: ' + err.message, false);
    } finally {
      setBusyState(btn, false);
    }
  }

  async function updateQuestionWithAi(action) {
    const btnMap = {
      improve_en: 'btn-ai-improve-en',
      generate_ar: 'btn-ai-generate-ar',
      improve_ar: 'btn-ai-improve-ar',
      generate_en: 'btn-ai-generate-en'
    };
    const targetMap = {
      improve_en: 'edit-q-en',
      generate_ar: 'edit-q-ar',
      improve_ar: 'edit-q-ar',
      generate_en: 'edit-q-en'
    };
    const btn = $(btnMap[action]);
    const topic = ($('edit-topic').value || '').trim();
    const questionEn = ($('edit-q-en').value || '').trim();
    const questionAr = ($('edit-q-ar').value || '').trim();
    const hint = ($('edit-hint').value || '').trim();

    const hasSource = action === 'generate_ar' || action === 'improve_en'
      ? questionEn
      : questionAr;
    if (!topic || !hasSource) {
      return showAlert('Enter the topic and source question text before using AI wording tools.', false);
    }

    const instructions = {
      improve_en: 'Improve the English quiz question for clarity, correctness, and exam tone without changing what is being tested.',
      generate_ar: 'Translate the English quiz question into clear Modern Standard Arabic suitable for students.',
      improve_ar: 'Improve the Arabic quiz question for clarity and natural Modern Standard Arabic without changing what is being tested.',
      generate_en: 'Translate the Arabic quiz question into clear, natural English suitable for students.'
    };

    const systemPrompt = [
      'You rewrite quiz questions while preserving the exact skill and intended answer.',
      'Do not add new facts.',
      'Return only the rewritten question in the requested target language.'
    ].join(' ');

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        result: { type: 'string' }
      },
      required: ['result']
    };

    setBusyState(btn, true, 'Working...');
    try {
      const payload = await callAiJson({
        systemPrompt,
        userContent: [{
          type: 'input_text',
          text: [
            instructions[action],
            'Topic: ' + topic,
            'English question: ' + (questionEn || '(empty)'),
            'Arabic question: ' + (questionAr || '(empty)'),
            'Hint: ' + (hint || '(empty)')
          ].join('\n')
        }],
        schemaName: 'question_language_edit',
        schema
      });

      const target = $(targetMap[action]);
      if (target) target.value = String(payload.result || '').trim();
      showAlert('Question text updated with AI.', true);
    } catch (err) {
      showAlert('AI wording failed: ' + err.message, false);
    } finally {
      setBusyState(btn, false);
    }
  }

  async function generateDistractorsWithAi() {
    if ($('edit-type').value !== 'mcq') {
      return showAlert('Switch the question type to Multiple Choice first.', false);
    }

    const rows = [...document.querySelectorAll('.mcq-option-row')];
    const correctRow = rows.find(row => row.querySelector('input[type="radio"]').checked);
    if (!correctRow) return showAlert('Select the correct option first.', false);

    const correctText = correctRow.querySelector('.mcq-val').value.trim();
    if (!correctText) return showAlert('Fill in the correct option text first.', false);

    const question = ($('edit-q-en').value || '').trim();
    const topic = ($('edit-topic').value || '').trim();
    if (!question || !topic) return showAlert('Add the topic and English question text first.', false);

    const existingOptions = rows
      .map(row => row.querySelector('.mcq-val').value.trim())
      .filter(Boolean);

    const btn = $('btn-ai-generate-distractors');
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        distractors: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['distractors']
    };

    setBusyState(btn, true, 'Generating...');
    try {
      const payload = await callAiJson({
        systemPrompt: [
          'You generate plausible but incorrect multiple-choice distractors.',
          'They must be clearly wrong, not duplicates of the correct answer, and similar in style and length.',
          'Do not use "all of the above" or "none of the above".',
          'Return exactly 3 distractors.'
        ].join(' '),
        userContent: [{
          type: 'input_text',
          text: [
            'Topic: ' + topic,
            'Question: ' + question,
            'Correct answer: ' + correctText,
            'Existing options: ' + (existingOptions.join(' | ') || '(none)')
          ].join('\n')
        }],
        schemaName: 'mcq_distractors',
        schema
      });

      let added = 0;
      const seen = new Set(existingOptions.map(opt => opt.toLowerCase()));
      (payload.distractors || []).forEach(text => {
        const value = String(text || '').trim();
        if (!value) return;
        const key = value.toLowerCase();
        if (seen.has(key) || key === correctText.toLowerCase()) return;
        seen.add(key);
        addMcqOption(value, false);
        added++;
      });

      if (!added) return showAlert('AI did not return any new distractors to add.', false);
      showAlert('Added ' + added + ' AI distractor option(s).', true);
    } catch (err) {
      showAlert('Distractor generation failed: ' + err.message, false);
    } finally {
      setBusyState(btn, false);
    }
  }

  if ($('btn-ai-generate-quiz')) $('btn-ai-generate-quiz').addEventListener('click', generateQuizFromAi);
  if ($('btn-ai-import-generated')) $('btn-ai-import-generated').addEventListener('click', importAiGeneratedQuestions);
  if ($('btn-ai-clear-generated')) $('btn-ai-clear-generated').addEventListener('click', () => {
    aiGeneratedQuestions = [];
    renderAiGeneratedPreview();
    showAlert('AI preview cleared.', true);
  });
  if ($('btn-ai-improve-en')) $('btn-ai-improve-en').addEventListener('click', () => updateQuestionWithAi('improve_en'));
  if ($('btn-ai-generate-ar')) $('btn-ai-generate-ar').addEventListener('click', () => updateQuestionWithAi('generate_ar'));
  if ($('btn-ai-improve-ar')) $('btn-ai-improve-ar').addEventListener('click', () => updateQuestionWithAi('improve_ar'));
  if ($('btn-ai-generate-en')) $('btn-ai-generate-en').addEventListener('click', () => updateQuestionWithAi('generate_en'));
  if ($('btn-ai-generate-distractors')) $('btn-ai-generate-distractors').addEventListener('click', generateDistractorsWithAi);

  // ─── Reset ───────────────────────────────────────────────────
  $('btn-reset-default').addEventListener('click', () => {
    window.thmConfirm('Clear ALL questions from the builder? This cannot be undone.', () => {
      localStorage.removeItem('__ctf_exam_builder');
      localChallenges = [];
      renderTable();
      showAlert('Builder cleared.', true);
    });
  });

  // ─── JSON Export ────────────────────────────────────────────
  $('btn-export-json').addEventListener('click', () => {
    const toExport = getSelectedChallenges();
    if (toExport.length === 0) return showAlert('No questions to export.', false);
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'question_bank_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showAlert('Exported ' + toExport.length + ' question(s) as JSON.', true);
  });

  // ─── JSON Import ────────────────────────────────────────────
  // Security: sanitize every question that enters the builder from an untrusted source (JSON import,
  // shared exam code / #exam= link, library). Coerce id/points to finite NUMBERS (so they can never
  // carry markup into the table's data-id/onclick/text sinks), string-coerce text fields (escaping
  // still happens at each render sink), allowlist type/codeGrade.mode, and drop unsafe attachment URLs.
  function normalizeImportedQuestion(q, idx) {
    q = (q && typeof q === 'object') ? q : {};
    const out = {};
    const id = Number(q.id);
    out.id = Number.isFinite(id) ? id : ((idx | 0) + 1);
    const pts = Number(q.points);
    out.points = (Number.isFinite(pts) && pts > 0) ? pts : 10;
    out.type = (q.type === 'mcq' || q.type === 'code') ? q.type : 'text';
    ['topic', 'q', 'qAr', 'hint', 'format', 'hash', 'answerMask', 'codeLang'].forEach(k => {
      if (q[k] != null) out[k] = String(q[k]);
    });
    if (Array.isArray(q.options)) {
      out.options = q.options.map(o => ({ text: String(o && o.text != null ? o.text : ''), isCorrect: !!(o && o.isCorrect) }));
    }
    if (q.codeGrade && typeof q.codeGrade === 'object') {
      const cg = q.codeGrade, modes = { manual: 1, output: 1, tests: 1, similarity: 1 };
      out.codeGrade = {
        mode: modes[cg.mode] ? cg.mode : 'manual',
        expected: String(cg.expected || ''),
        match: (cg.match === 'exact' || cg.match === 'regex') ? cg.match : 'contains',
        normalize: !!cg.normalize,
        tests: String(cg.tests || ''),
        reference: String(cg.reference || '')
      };
    }
    if (q.attachment && typeof q.attachment === 'object' && typeof q.attachment.data === 'string' &&
        /^(data:|blob:)/i.test(q.attachment.data)) {
      out.attachment = { name: String(q.attachment.name || 'file'), type: String(q.attachment.type || ''), data: q.attachment.data };
    }
    return out;
  }

  $('btn-import-json').addEventListener('click', () => { $('json-file-input').click(); });
  $('json-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('File must contain a JSON array of questions.');
        let added = 0;
        imported.forEach((raw, idx) => {
          if (!raw || raw.topic == null || raw.q == null) return; // skip invalid
          const q = normalizeImportedQuestion(raw, localChallenges.length + idx);
          // Avoid ID collisions: if ID exists, assign a new one
          if (localChallenges.some(c => c.id === q.id)) {
            q.id = localChallenges.length > 0 ? Math.max(...localChallenges.map(x => x.id)) + 1 : 1;
          }
          localChallenges.push(q);
          added++;
        });
        saveToStorage();
        renderTable();
        showAlert('Imported ' + added + ' question(s) from file.', true);
      } catch (err) {
        showAlert('Import failed: ' + err.message, false);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset file input
  });

  // ─── Generate exam file ───────────────────────────────────────

  // Resolve which questions ship. getSelectedChallenges hides the difference between "none
  // checked (= all)" and "a real subset checked"; here the scope is explicit so a stray
  // selection can be confirmed instead of silently shipping a tiny exam.
  function getExportScope() {
    const checked = [...document.querySelectorAll('.q-select:checked')].map(cb => Number(cb.dataset.id));
    const total = localChallenges.length;
    if (checked.length === 0 || checked.length >= total) {
      return { list: localChallenges, isSubset: false, count: total, total };
    }
    const list = localChallenges.filter(c => checked.includes(c.id));
    return { list, isSubset: true, count: list.length, total };
  }

  function readExamSettings() {
    const examPass = ($('exam-password').value || '').trim();
    const teacherPass = ($('teacher-password').value || '').trim();
    const rawQuestionLimit = $('offline-question-limit') ? parseInt($('offline-question-limit').value, 10) : NaN;
    return {
      examTitle: ($('exam-title').value || 'Custom Exam').trim(),
      passHash: examPass ? window.CTF_DATA.encodeInput(examPass) : null,
      teacherPassHash: teacherPass ? window.CTF_DATA.encodeInput(teacherPass) : null,
      lockCopyPaste: $('lock-copy-paste').checked,
      examMode: $('exam-mode').checked,
      enableTimer: $('enable-timer').checked,
      timerMinutes: parseInt($('exam-timer-minutes').value, 10) || 60,
      allowRetake: $('allow-retake') ? $('allow-retake').checked : true,
      offlineQuestionLimit: Number.isFinite(rawQuestionLimit) && rawQuestionLimit > 0 ? rawQuestionLimit : null
    };
  }

  // Shared build pipeline for both Export (download) and Preview (open in a new tab).
  async function generateExam(preview) {
    const btn = preview ? $('btn-preview-quiz') : $('btn-create-quiz');
    const scope = getExportScope();
    if (scope.count === 0) {
      return showAlert('Add at least one question before ' + (preview ? 'previewing' : 'generating') + ' the exam.', false);
    }
    const scopeText = scope.isSubset ? scope.count + ' selected of ' + scope.total : 'all ' + scope.total;

    const run = async () => {
      const s = readExamSettings();
      const origLabel = btn.textContent;
      btn.textContent = preview ? 'Building preview…' : 'Generating... (Fetching dependencies if needed)';
      btn.disabled = true;
      try {
        const html = await buildExamHtml(s.examTitle, s.passHash, s.lockCopyPaste, s.examMode, s.enableTimer, s.timerMinutes, s.teacherPassHash, scope.list, s.allowRetake, s.offlineQuestionLimit);
        const packedHtml = packStandaloneHtml(html);
        const blob = new Blob([packedHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        if (preview) {
          // In-app modal instead of window.open: an awaited build consumes the
          // user-activation, so pop-ups get blocked (and file:// blocks them outright).
          openPreviewModal(url, scopeText, btn);
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = s.examTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showAlert('Exam file downloaded: ' + a.download + ' (' + scopeText + ' questions).', true);
        }
      } catch (err) {
        showAlert('Failed to ' + (preview ? 'build preview' : 'generate exam') + ': ' + err.message, false);
        console.error(err);
      }
      btn.textContent = origLabel;
      btn.disabled = false;
    };

    // Only interrupt with a confirm when a real subset is selected.
    if (scope.isSubset) {
      window.thmConfirm((preview ? 'Preview ' : 'Export ') + scope.count + ' selected of ' + scope.total + ' questions?', run);
    } else {
      run();
    }
  }

  // In-app exam preview. Built once, reused; owns the blob URL lifetime so we can
  // revoke it on close (the old new-tab path leaked/guessed with a setTimeout).
  const previewModal = {
    overlay: null,
    iframe: null,
    title: null,
    openTab: null,
    blobUrl: null,
    returnFocus: null
  };

  function buildPreviewModal() {
    if (previewModal.overlay) return;

    // One-time style block. Scoped by the modal id so it cannot collide with PRISM's CSS.
    if (!document.getElementById('exam-preview-modal-style')) {
      const style = document.createElement('style');
      style.id = 'exam-preview-modal-style';
      style.textContent = [
        '#exam-preview-modal{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:rgba(0,0,0,0.7);}',
        '#exam-preview-modal[hidden]{display:none;}',
        '#exam-preview-modal .epm-panel{display:flex;flex-direction:column;flex:1;min-height:0;margin:2vh 2vw;border:1px solid var(--border-color,#1f2b3a);border-radius:8px;overflow:hidden;background:var(--panel-bg,#111927);box-shadow:0 10px 40px rgba(0,0,0,0.6);}',
        '#exam-preview-modal .epm-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border-color,#1f2b3a);background:var(--panel-bg,#111927);color:var(--text-main,#e6edf3);}',
        '#exam-preview-modal .epm-title{font-weight:600;margin-right:auto;font-size:0.95rem;color:var(--text-main,#e6edf3);}',
        '#exam-preview-modal .epm-btn{display:inline-flex;align-items:center;min-height:24px;padding:6px 12px;border:1px solid var(--border-color,#1f2b3a);border-radius:6px;background:transparent;color:var(--text-main,#e6edf3);font:inherit;font-size:0.85rem;cursor:pointer;text-decoration:none;}',
        '#exam-preview-modal .epm-btn:hover{border-color:var(--accent-primary,#9fef00);color:var(--accent-primary,#9fef00);}',
        '#exam-preview-modal .epm-btn:focus-visible{outline:2px solid var(--accent-primary,#9fef00);outline-offset:2px;}',
        '#exam-preview-modal .epm-close{border-color:var(--accent-primary,#9fef00);}',
        '#exam-preview-modal iframe{flex:1;width:100%;min-height:0;border:0;background:#fff;}',
        '@media (prefers-reduced-motion: no-preference){#exam-preview-modal{animation:epm-fade 0.15s ease-out;}@keyframes epm-fade{from{opacity:0;}to{opacity:1;}}}'
      ].join('\n');
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'exam-preview-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Exam preview');
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'epm-panel';

    const bar = document.createElement('div');
    bar.className = 'epm-bar';

    const title = document.createElement('span');
    title.className = 'epm-title';

    const openTab = document.createElement('a');
    openTab.className = 'epm-btn';
    openTab.textContent = 'Open in new tab';
    openTab.target = '_blank';
    openTab.rel = 'noopener';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'epm-btn epm-close';
    closeBtn.textContent = 'Close';

    const iframe = document.createElement('iframe');
    iframe.title = 'Exam preview';
    // No sandbox on purpose: this is the teacher's own trusted exam and it needs
    // localStorage / document.write to run.
    iframe.setAttribute('allow', 'fullscreen');

    bar.appendChild(title);
    bar.appendChild(openTab);
    bar.appendChild(closeBtn);
    panel.appendChild(bar);
    panel.appendChild(iframe);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Backdrop click (outside the panel) closes; clicks inside the panel do not.
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePreviewModal();
    });
    closeBtn.addEventListener('click', closePreviewModal);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreviewModal();
      }
    });

    previewModal.overlay = overlay;
    previewModal.iframe = iframe;
    previewModal.title = title;
    previewModal.openTab = openTab;
    previewModal.closeBtn = closeBtn;
  }

  function openPreviewModal(blobUrl, scopeText, returnFocusEl) {
    buildPreviewModal();
    previewModal.blobUrl = blobUrl;
    previewModal.returnFocus = returnFocusEl || null;
    previewModal.title.textContent = 'Exam Preview — ' + scopeText + ' questions';
    previewModal.openTab.href = blobUrl;
    // Preview runs inside an iframe that rarely holds window focus, so the exam-mode
    // focus-loss overlay would fire on the first blur and cover the exam. The #preview
    // fragment lets the runtime detect preview and stand that monitoring down. The
    // "Open in new tab" link deliberately keeps the plain url so teachers can still see
    // the real gated (name/password/focus) flow.
    previewModal.iframe.src = blobUrl + '#preview';
    previewModal.overlay.hidden = false;
    previewModal.closeBtn.focus();
  }

  function closePreviewModal() {
    if (!previewModal.overlay || previewModal.overlay.hidden) return;
    previewModal.overlay.hidden = true;
    // Drop the exam out of memory and release the object URL we own.
    previewModal.iframe.src = 'about:blank';
    if (previewModal.blobUrl) {
      URL.revokeObjectURL(previewModal.blobUrl);
      previewModal.blobUrl = null;
    }
    const back = previewModal.returnFocus;
    previewModal.returnFocus = null;
    if (back && typeof back.focus === 'function') back.focus();
  }

  $('btn-create-quiz').addEventListener('click', () => generateExam(false));

  // ═══════════════════════════════════════════════════════════════
  //  EXAM LIBRARY + BACKEND-FREE SHARE
  //  Two builder-side utilities. Neither touches the exam template literal below.
  // ═══════════════════════════════════════════════════════════════

  // ─── Shared low-level helpers ────────────────────────────────
  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return base64UrlFromBytes(a); // hoisted from the OAuth section
  }

  function formatSavedDate(iso) {
    try { const d = new Date(iso); if (!isNaN(d.getTime())) return d.toLocaleString(); } catch (e) {}
    return String(iso || 'unknown');
  }

  // Small factory keeps the modal builders from repeating the same button boilerplate.
  function mkBtn(label, extraClass, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eum-btn' + (extraClass ? ' ' + extraClass : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // One dark style block shared by both modals; scoped by .exam-util-modal so it can't
  // collide with PRISM's CSS. Same var-with-fallback approach as the preview modal.
  function injectExamUtilStyle() {
    if (document.getElementById('exam-util-modal-style')) return;
    const style = document.createElement('style');
    style.id = 'exam-util-modal-style';
    style.textContent = [
      '.exam-util-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 2vw;overflow:auto;background:rgba(0,0,0,0.7);}',
      '.exam-util-modal[hidden]{display:none;}',
      '.exam-util-modal .eum-panel{display:flex;flex-direction:column;width:min(720px,100%);max-height:92vh;border:1px solid var(--border-color,#1f2b3a);border-radius:8px;overflow:hidden;background:var(--panel-bg,#111927);color:var(--text-main,#e6edf3);box-shadow:0 10px 40px rgba(0,0,0,0.6);}',
      '.exam-util-modal .eum-bar{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color,#1f2b3a);}',
      '.exam-util-modal .eum-title{font-weight:600;margin-right:auto;font-size:1rem;color:var(--text-main,#e6edf3);}',
      '.exam-util-modal .eum-body{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:16px;}',
      '.exam-util-modal .eum-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;min-width:32px;padding:6px 12px;border:1px solid var(--border-color,#1f2b3a);border-radius:6px;background:transparent;color:var(--text-main,#e6edf3);font:inherit;font-size:0.85rem;cursor:pointer;text-decoration:none;}',
      '.exam-util-modal .eum-btn:hover{border-color:var(--accent-primary,#9fef00);color:var(--accent-primary,#9fef00);}',
      '.exam-util-modal .eum-btn:focus-visible{outline:2px solid var(--accent-primary,#9fef00);outline-offset:2px;}',
      '.exam-util-modal .eum-btn-primary{border-color:var(--accent-primary,#9fef00);color:var(--accent-primary,#9fef00);}',
      '.exam-util-modal .eum-btn-danger:hover{border-color:#ff6b6b;color:#ff6b6b;}',
      '.exam-util-modal .eum-input,.exam-util-modal textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-color,#1f2b3a);border-radius:6px;background:var(--input-bg,#0d1420);color:var(--text-main,#e6edf3);font:inherit;font-size:0.85rem;}',
      '.exam-util-modal textarea{resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;}',
      '.exam-util-modal .eum-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
      '.exam-util-modal .eum-list{display:flex;flex-direction:column;gap:8px;}',
      '.exam-util-modal .eum-item{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--border-color,#1f2b3a);border-radius:6px;}',
      '.exam-util-modal .eum-item-main{margin-right:auto;min-width:180px;flex:1;}',
      '.exam-util-modal .eum-item-name{font-weight:600;color:var(--text-main,#e6edf3);}',
      '.exam-util-modal .eum-item-meta{font-size:0.78rem;color:var(--text-muted,#8b98a5);}',
      '.exam-util-modal .eum-empty{color:var(--text-muted,#8b98a5);text-align:center;padding:24px;}',
      '.exam-util-modal .eum-note{font-size:0.78rem;color:var(--text-muted,#8b98a5);}',
      '.exam-util-modal .eum-section-title{font-weight:600;font-size:0.9rem;color:var(--text-main,#e6edf3);}',
      '@media (prefers-reduced-motion: no-preference){.exam-util-modal{animation:eum-fade 0.15s ease-out;}@keyframes eum-fade{from{opacity:0;}to{opacity:1;}}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Clipboard write with an execCommand fallback (file:// and older Safari block the async API).
  function copyText(text, okMsg) {
    if (!text) { showAlert('Nothing to copy yet.', false); return; }
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      showAlert(ok ? okMsg : 'Copy failed — select the text and copy manually.', ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showAlert(okMsg, true)).catch(fallback);
    } else {
      fallback();
    }
  }

  // ─── Library storage + working-set swap ──────────────────────
  function readLibrary() {
    try {
      const arr = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeLibrary(arr) {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      showAlert('Could not save to the library — browser storage is full. Delete old saved exams or remove large file attachments, then try again.', false);
      return false;
    }
  }

  // Replace the working set from a saved/imported exam, then refresh the whole UI the same
  // way init does: persist questions + settings, restore the form, re-render the table.
  function applyLoadedExam(questions, settings) {
    localChallenges = Array.isArray(questions) ? questions.map((q, i) => normalizeImportedQuestion(q, i)) : [];
    saveToStorage();
    if (settings && typeof settings === 'object') {
      try { localStorage.setItem(EXAM_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
    }
    restoreExamSettings(); // before renderTable so the stats dashboard reflects the new timer/mode
    renderTable();
  }

  // ─── Library modal ───────────────────────────────────────────
  const libraryModal = { overlay: null, listEl: null, nameInput: null, closeBtn: null, returnFocus: null, editingId: null };

  function buildLibraryModal() {
    if (libraryModal.overlay) return;
    injectExamUtilStyle();

    const overlay = document.createElement('div');
    overlay.id = 'exam-library-modal';
    overlay.className = 'exam-util-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Exam library');
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'eum-panel';

    const bar = document.createElement('div');
    bar.className = 'eum-bar';
    const title = document.createElement('span');
    title.className = 'eum-title';
    title.textContent = 'Exam Library';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'eum-btn eum-btn-primary';
    closeBtn.textContent = 'Close';
    bar.appendChild(title);
    bar.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'eum-body';

    const saveTitle = document.createElement('div');
    saveTitle.className = 'eum-section-title';
    saveTitle.textContent = 'Save current questions as…';
    const saveRow = document.createElement('div');
    saveRow.className = 'eum-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'eum-input';
    nameInput.placeholder = 'Exam name';
    nameInput.style.flex = '1';
    nameInput.setAttribute('aria-label', 'Name for the saved exam');
    const saveBtn = mkBtn('Save', 'eum-btn-primary', () => saveCurrentToLibrary(nameInput));
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCurrentToLibrary(nameInput); } });
    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);

    const listTitle = document.createElement('div');
    listTitle.className = 'eum-section-title';
    listTitle.textContent = 'Saved exams';
    const listEl = document.createElement('div');
    listEl.className = 'eum-list';

    body.appendChild(saveTitle);
    body.appendChild(saveRow);
    body.appendChild(listTitle);
    body.appendChild(listEl);
    panel.appendChild(bar);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) closeLibraryModal(); });
    closeBtn.addEventListener('click', closeLibraryModal);
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeLibraryModal(); } });

    libraryModal.overlay = overlay;
    libraryModal.listEl = listEl;
    libraryModal.nameInput = nameInput;
    libraryModal.closeBtn = closeBtn;
  }

  function renderLibraryList() {
    const listEl = libraryModal.listEl;
    if (!listEl) return;
    listEl.innerHTML = '';
    const lib = readLibrary();
    if (lib.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'eum-empty';
      empty.textContent = 'No saved exams yet. Save your current questions above to get started.';
      listEl.appendChild(empty);
      return;
    }
    // Newest first — teachers usually want what they just saved.
    lib.slice().reverse().forEach(entry => {
      const item = document.createElement('div');
      item.className = 'eum-item';
      const main = document.createElement('div');
      main.className = 'eum-item-main';

      if (libraryModal.editingId === entry.id) {
        const nameEdit = document.createElement('input');
        nameEdit.type = 'text';
        nameEdit.className = 'eum-input';
        nameEdit.value = entry.name;
        nameEdit.setAttribute('aria-label', 'Rename saved exam');
        nameEdit.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(entry.id, nameEdit.value); } });
        main.appendChild(nameEdit);
        item.appendChild(main);
        item.appendChild(mkBtn('Save', 'eum-btn-primary', () => commitRename(entry.id, nameEdit.value)));
        item.appendChild(mkBtn('Cancel', '', () => { libraryModal.editingId = null; renderLibraryList(); }));
        listEl.appendChild(item);
        // Focus after the node is in the DOM.
        setTimeout(() => nameEdit.focus(), 0);
        return;
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'eum-item-name';
      nameEl.textContent = entry.name;
      const metaEl = document.createElement('div');
      metaEl.className = 'eum-item-meta';
      const count = Array.isArray(entry.questions) ? entry.questions.length : 0;
      metaEl.textContent = count + ' question' + (count === 1 ? '' : 's') + ' · saved ' + formatSavedDate(entry.savedAt);
      main.appendChild(nameEl);
      main.appendChild(metaEl);
      item.appendChild(main);

      item.appendChild(mkBtn('Load', 'eum-btn-primary', () => loadFromLibrary(entry.id)));
      item.appendChild(mkBtn('Rename', '', () => { libraryModal.editingId = entry.id; renderLibraryList(); }));
      item.appendChild(mkBtn('Duplicate', '', () => duplicateInLibrary(entry.id)));
      item.appendChild(mkBtn('Delete', 'eum-btn-danger', () => deleteFromLibrary(entry.id, entry.name)));
      listEl.appendChild(item);
    });
  }

  function saveCurrentToLibrary(input) {
    const name = (input.value || '').trim();
    if (!name) { input.focus(); showAlert('Enter a name for the saved exam.', false); return; }
    if (localChallenges.length === 0) { showAlert('Add at least one question before saving to the library.', false); return; }
    const lib = readLibrary();
    lib.push({
      id: randomId(),
      name: name,
      savedAt: new Date().toISOString(),
      questions: localChallenges.map(q => ({ ...q })), // includes attachments — this is local storage, not a share code
      settings: collectExamSettings()
    });
    if (writeLibrary(lib)) {
      input.value = '';
      renderLibraryList();
      showAlert('Saved "' + name + '" to the library.', true);
    }
  }

  function commitRename(id, newName) {
    const name = (newName || '').trim();
    if (!name) { showAlert('Enter a name.', false); return; }
    const lib = readLibrary();
    const entry = lib.find(x => x.id === id);
    if (entry) entry.name = name;
    if (writeLibrary(lib)) {
      libraryModal.editingId = null;
      renderLibraryList();
      showAlert('Renamed to "' + name + '".', true);
    }
  }

  function duplicateInLibrary(id) {
    const lib = readLibrary();
    const entry = lib.find(x => x.id === id);
    if (!entry) return;
    lib.push({
      id: randomId(),
      name: entry.name + ' (copy)',
      savedAt: new Date().toISOString(),
      questions: (entry.questions || []).map(q => ({ ...q })),
      settings: { ...(entry.settings || {}) }
    });
    if (writeLibrary(lib)) {
      renderLibraryList();
      showAlert('Duplicated "' + entry.name + '".', true);
    }
  }

  function deleteFromLibrary(id, name) {
    window.thmConfirm('Delete "' + name + '" from the library? This cannot be undone.', () => {
      const lib = readLibrary().filter(x => x.id !== id);
      if (writeLibrary(lib)) {
        if (libraryModal.editingId === id) libraryModal.editingId = null;
        renderLibraryList();
        showAlert('Deleted "' + name + '".', true);
      }
    });
  }

  function loadFromLibrary(id) {
    const lib = readLibrary();
    const entry = lib.find(x => x.id === id);
    if (!entry) return;
    const doLoad = () => {
      applyLoadedExam(entry.questions || [], entry.settings || null);
      closeLibraryModal();
      showAlert('Loaded "' + entry.name + '".', true);
    };
    // Only interrupt when there is real work to lose.
    if (localChallenges.length > 0) window.thmConfirm('Load "' + entry.name + '"? This replaces your current questions.', doLoad);
    else doLoad();
  }

  function openLibraryModal() {
    buildLibraryModal();
    libraryModal.returnFocus = document.activeElement;
    libraryModal.editingId = null;
    renderLibraryList();
    libraryModal.overlay.hidden = false;
    libraryModal.closeBtn.focus();
  }

  function closeLibraryModal() {
    if (!libraryModal.overlay || libraryModal.overlay.hidden) return;
    libraryModal.overlay.hidden = true;
    const back = libraryModal.returnFocus;
    libraryModal.returnFocus = null;
    if (back && typeof back.focus === 'function') back.focus();
  }

  // ─── Share: encode / decode ──────────────────────────────────
  function bytesFromBase64Url(str) {
    let b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function bytesThroughStream(stream, bytes, maxBytes) {
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    if (!maxBytes) {
      return new Uint8Array(await new Response(stream.readable).arrayBuffer());
    }
    // Bounded read: stop a decompression bomb (few-KB code -> multi-GB output) before it OOMs the tab.
    const reader = stream.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { try { await reader.cancel(); } catch (e) {} throw new Error('Share code is too large to import safely.'); }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  // Prefix tells decode which path was used: 'H' = gzip, 'J' = plain JSON.
  async function encodeExamPayload(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (typeof CompressionStream === 'function') {
      try {
        const gz = await bytesThroughStream(new CompressionStream('gzip'), bytes);
        return 'H' + base64UrlFromBytes(gz);
      } catch (e) { /* fall back to plain base64 below */ }
    }
    return 'J' + base64UrlFromBytes(bytes);
  }

  async function decodeExamPayload(code) {
    const trimmed = (code || '').trim();
    if (!trimmed) throw new Error('The share code is empty.');
    if (trimmed.length > 6000000) throw new Error('Share code is too large to import safely.');
    const prefix = trimmed[0];
    const bytes = bytesFromBase64Url(trimmed.slice(1));
    let jsonBytes;
    if (prefix === 'H') {
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read compressed share codes — open the link in an up-to-date browser.');
      jsonBytes = await bytesThroughStream(new DecompressionStream('gzip'), bytes, 8 * 1024 * 1024);
    } else if (prefix === 'J') {
      jsonBytes = bytes;
    } else {
      throw new Error('Unrecognized share code format.');
    }
    const payload = JSON.parse(new TextDecoder().decode(jsonBytes));
    if (!payload || !Array.isArray(payload.questions)) throw new Error('The share code did not contain a valid question list.');
    return payload;
  }

  // Base64 blows up binary attachments and would make codes huge, so strip them; teachers
  // are told to use JSON export / the Library for exams that carry files.
  function stripAttachments(questions) {
    return questions.map(q => {
      const clone = { ...q };
      delete clone.attachment;
      delete clone.file;
      delete clone.fileData;
      return clone;
    });
  }

  function buildSharePayload() {
    const scope = getExportScope(); // respects a checked subset, else all
    // Share codes are base64 (not encrypted); never embed credentials in them.
    const settings = { ...collectExamSettings() };
    delete settings['exam-password'];
    delete settings['teacher-password'];
    return {
      v: 1,
      title: (($('exam-title') && $('exam-title').value) || 'Custom Exam').trim(),
      questions: stripAttachments(scope.list),
      settings: settings
    };
  }

  // Accept either a bare code or a full share link pasted into the import box.
  function extractShareCode(text) {
    const t = (text || '').trim();
    if (!t) return '';
    const marker = '#exam=';
    const idx = t.indexOf(marker);
    return idx !== -1 ? t.slice(idx + marker.length).trim() : t;
  }

  // ─── Share modal ─────────────────────────────────────────────
  const shareModal = { overlay: null, codeArea: null, importArea: null, resultEl: null, linkLabel: null, closeBtn: null, returnFocus: null, shareLink: '' };

  function buildShareModal() {
    if (shareModal.overlay) return;
    injectExamUtilStyle();

    const overlay = document.createElement('div');
    overlay.id = 'exam-share-modal';
    overlay.className = 'exam-util-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Share exam');
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'eum-panel';

    const bar = document.createElement('div');
    bar.className = 'eum-bar';
    const title = document.createElement('span');
    title.className = 'eum-title';
    title.textContent = 'Share Exam';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'eum-btn eum-btn-primary';
    closeBtn.textContent = 'Close';
    bar.appendChild(title);
    bar.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'eum-body';

    const note = document.createElement('div');
    note.className = 'eum-note';
    note.textContent = 'File attachments are NOT included in share codes (to keep them small). Use JSON export or the Library to move exams that have attached files.';

    const exportTitle = document.createElement('div');
    exportTitle.className = 'eum-section-title';
    exportTitle.textContent = 'Share code';
    const codeArea = document.createElement('textarea');
    codeArea.readOnly = true;
    codeArea.rows = 4;
    codeArea.setAttribute('aria-label', 'Share code');
    const linkLabel = document.createElement('div');
    linkLabel.className = 'eum-note';
    linkLabel.setAttribute('aria-live', 'polite');
    const copyRow = document.createElement('div');
    copyRow.className = 'eum-row';
    copyRow.appendChild(mkBtn('Copy code', 'eum-btn-primary', () => copyText(shareModal.codeArea.value, 'Share code copied.')));
    copyRow.appendChild(mkBtn('Copy link', '', () => copyText(shareModal.shareLink, 'Share link copied.')));

    const importTitle = document.createElement('div');
    importTitle.className = 'eum-section-title';
    importTitle.textContent = 'Import a shared exam';
    const importArea = document.createElement('textarea');
    importArea.rows = 4;
    importArea.setAttribute('aria-label', 'Paste a share code or link');
    importArea.placeholder = 'Paste a share code or a full share link here…';
    const importRow = document.createElement('div');
    importRow.className = 'eum-row';
    importRow.appendChild(mkBtn('Import', 'eum-btn-primary', handleImportFromArea));
    const resultEl = document.createElement('div');

    body.appendChild(note);
    body.appendChild(exportTitle);
    body.appendChild(codeArea);
    body.appendChild(linkLabel);
    body.appendChild(copyRow);
    body.appendChild(importTitle);
    body.appendChild(importArea);
    body.appendChild(importRow);
    body.appendChild(resultEl);
    panel.appendChild(bar);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) closeShareModal(); });
    closeBtn.addEventListener('click', closeShareModal);
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeShareModal(); } });

    shareModal.overlay = overlay;
    shareModal.codeArea = codeArea;
    shareModal.importArea = importArea;
    shareModal.resultEl = resultEl;
    shareModal.linkLabel = linkLabel;
    shareModal.closeBtn = closeBtn;
  }

  function openShareModal() {
    buildShareModal();
    shareModal.returnFocus = document.activeElement;
    shareModal.resultEl.innerHTML = '';
    shareModal.importArea.value = '';
    shareModal.linkLabel.textContent = '';
    shareModal.shareLink = '';
    shareModal.overlay.hidden = false;
    shareModal.closeBtn.focus();

    const payload = buildSharePayload();
    if (payload.questions.length === 0) {
      shareModal.codeArea.value = '';
      shareModal.codeArea.placeholder = 'Add at least one question to generate a share code.';
      return;
    }
    shareModal.codeArea.value = 'Generating…';
    encodeExamPayload(payload).then(code => {
      shareModal.codeArea.value = code;
      // file:// yields origin "null"; fall back to the current href without its hash.
      const base = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin + window.location.pathname
        : window.location.href.split('#')[0];
      shareModal.shareLink = base + '#exam=' + code;
      shareModal.linkLabel.textContent = 'Share link is ' + shareModal.shareLink.length + ' characters. Very long links can be truncated by chat apps — send the code instead if in doubt.';
    }).catch(err => {
      shareModal.codeArea.value = '';
      showAlert('Could not build the share code: ' + err.message, false);
    });
  }

  function closeShareModal() {
    if (!shareModal.overlay || shareModal.overlay.hidden) return;
    shareModal.overlay.hidden = true;
    const back = shareModal.returnFocus;
    shareModal.returnFocus = null;
    if (back && typeof back.focus === 'function') back.focus();
  }

  function handleImportFromArea() {
    const code = extractShareCode(shareModal.importArea.value);
    if (!code) { showAlert('Paste a share code or link first.', false); return; }
    decodeExamPayload(code)
      .then(presentImportResult)
      .catch(err => showAlert('Could not read that share code: ' + err.message, false));
  }

  // Give the teacher an explicit choice rather than silently overwriting: add to the
  // library and/or load into the builder.
  function presentImportResult(payload) {
    buildShareModal();
    if (shareModal.overlay.hidden) {
      // Reached from a shared link (not the Import button) — the modal isn't open yet.
      shareModal.returnFocus = document.activeElement;
      shareModal.overlay.hidden = false;
    }
    const res = shareModal.resultEl;
    res.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'eum-item';
    const main = document.createElement('div');
    main.className = 'eum-item-main';
    const nameEl = document.createElement('div');
    nameEl.className = 'eum-item-name';
    nameEl.textContent = payload.title || 'Untitled exam';
    const metaEl = document.createElement('div');
    metaEl.className = 'eum-item-meta';
    const count = payload.questions.length;
    metaEl.textContent = 'Decoded ' + count + ' question' + (count === 1 ? '' : 's') + '. Attachments are not included in shares.';
    main.appendChild(nameEl);
    main.appendChild(metaEl);
    box.appendChild(main);

    const addBtn = mkBtn('Add to Library', 'eum-btn-primary', () => addImportedToLibrary(payload));
    const loadBtn = mkBtn('Load into builder', '', () => loadImportedIntoBank(payload));
    box.appendChild(addBtn);
    box.appendChild(loadBtn);
    res.appendChild(box);
    addBtn.focus();
  }

  function addImportedToLibrary(payload) {
    const name = payload.title || 'Imported exam';
    const lib = readLibrary();
    lib.push({
      id: randomId(),
      name: name,
      savedAt: new Date().toISOString(),
      questions: payload.questions.map(q => ({ ...q })),
      settings: payload.settings || {}
    });
    if (writeLibrary(lib)) {
      if (libraryModal.overlay && !libraryModal.overlay.hidden) renderLibraryList();
      showAlert('Added "' + name + '" to the library.', true);
    }
  }

  function loadImportedIntoBank(payload) {
    const doLoad = () => {
      applyLoadedExam(payload.questions, payload.settings || null);
      closeShareModal();
      showAlert('Loaded the shared exam into the builder.', true);
    };
    if (localChallenges.length > 0) window.thmConfirm('Load this shared exam? This replaces your current questions.', doLoad);
    else doLoad();
  }

  function maybeImportFromShareHash() {
    const hash = window.location.hash || '';
    if (hash.indexOf('#exam=') !== 0) return;
    const code = hash.slice('#exam='.length);
    // Clear the hash up front so a reload never re-prompts, whatever the teacher chooses.
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
    decodeExamPayload(code).then(payload => {
      window.thmConfirm('This link contains a shared exam "' + (payload.title || 'Untitled') + '" (' + payload.questions.length + ' questions). Show the import options?', () => presentImportResult(payload));
    }).catch(err => {
      showAlert('The shared exam link could not be read: ' + err.message, false);
    });
  }

  // (Online "Host Live Exam" feature removed — this build produces offline exam files only.)

  // ─── JS Obfuscation Engine ──────────────────────────────────
  function obfuscatePayload(jsCode) {
    // Layer 1: Convert to UTF-8 bytes so Unicode content survives encoding
    const encoded = new TextEncoder().encode(jsCode);
    // Layer 2: XOR with rotating key
    const key = [0x4F, 0x50, 0x48, 0x5F, 0x53, 0x45, 0x43]; // "OPH_SEC"
    const xored = Array.from(encoded, (b, i) => b ^ key[i % key.length]);
    // Layer 3: Base64 the result
    const b64 = encodeBytesToBase64(xored);
    // Layer 4: Split into random chunks and scatter
    const scatterChunkSize = 76;
    const chunks = [];
    for (let i = 0; i < b64.length; i += scatterChunkSize) {
      chunks.push(b64.slice(i, i + scatterChunkSize));
    }
    // Generate cryptic variable names
    const varNames = chunks.map((_, i) => '_0x' + (0xa3f0 + i * 7).toString(16));
    // Build the decoy + loader
    let out = '/* [SecureLab Examiner] Integrity-Protected Payload — DO NOT MODIFY */\n';
    out += '(function(){';
    // Scatter the chunks as separate variables
    chunks.forEach((chunk, i) => {
      out += 'var ' + varNames[i] + '="' + chunk + '";';
    });
    // Reassemble
    out += 'var _0xp=' + varNames.join('+') + ';';
    // Decoder
    out += 'var _0xk=[0x4F,0x50,0x48,0x5F,0x53,0x45,0x43];';
    out += 'var _0xd=atob(_0xp);';
    out += 'var _0xb=[];';
    out += 'for(var _0xi=0;_0xi<_0xd.length;_0xi++){';
    out += '_0xb.push(_0xd.charCodeAt(_0xi)^_0xk[_0xi%_0xk.length]);';
    out += '}';
    out += 'var _0xr=new TextDecoder().decode(new Uint8Array(_0xb));';
    // Execute the decoded payload
    out += 'Function(_0xr)();';
    out += '})();';
    return out;
  }

  function encodeBytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      let piece = '';
      const limit = Math.min(i + chunkSize, bytes.length);
      for (let j = i; j < limit; j++) {
        piece += String.fromCharCode(bytes[j]);
      }
      binary += piece;
    }

    return btoa(binary);
  }

  function encodeUtf8ToBase64(text) {
    return encodeBytesToBase64(new TextEncoder().encode(text));
  }

  function chunkPackedPayload(text, chunkSize) {
    const b64 = encodeUtf8ToBase64(text);
    const size = chunkSize || 120;
    const chunks = [];

    for (let i = 0; i < b64.length; i += size) {
      chunks.push(JSON.stringify(b64.slice(i, i + size)));
    }

    chunks.reverse();
    return '[' + chunks.join(',') + ']';
  }

  function packStandaloneHtml(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const packed = chunkPackedPayload(html, 120);
    const title = escHtml(parsed.title || 'Offline Exam');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="icon" href="data:,"><title>${title}</title></head><body><script>(()=>{const _0x6b3f=_=>new TextDecoder().decode(Uint8Array.from(atob(_.reverse().join('')),c=>c.charCodeAt(0)));document.open();document.write(_0x6b3f(${packed}));document.close();})();<\/script></body></html>`;
  }

  // ─── Build standalone HTML ────────────────────────────────────
  async function buildExamHtml(examTitle, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes, teacherPassHash, challengeSet, allowRetake, questionLimit) {
    const exportChallenges = challengeSet || localChallenges;
    const quizID = Math.random().toString(36).slice(2, 11);
    
    // Only embed the Python engine when a question in THIS export actually needs it.
    const hasPython = exportChallenges.some(c => c.type === 'code' && c.codeLang === 'python');
    let pythonEngine = '';
    if (hasPython) {
      const [skCode, stdCode] = await loadSkulptEngine();
      pythonEngine = `<script id="skulpt-engine">${skCode}</scr` + `ipt>\n<script id="skulpt-stdlib">${stdCode}</scr` + `ipt>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <link rel="icon" href="data:,">
  <title>${escHtml(examTitle)}</title>
  ${pythonEngine}
  <style>${getEmbeddedCss(lockCopyPaste, examMode, enableTimer)}</style>
</head>
<body>

  <!-- START SCREEN -->
  <div id="start-screen" class="screen active">
    <div class="modal-box">
      <h1>${escHtml(examTitle)}</h1>
      <p>Enter your name to begin the exam.</p>
      ${examMode ? `<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Please stay in this window during the exam. Leaving it is logged for your instructor.</p>` : ''}
      <div class="input-group">
        <label for="player-name">Student Name</label>
        <input type="text" id="player-name" autocomplete="off" spellcheck="false" placeholder="Your full name">
      </div>
      ${passHash ? `
      <div class="input-group">
        <label for="exam-pass">Exam Password</label>
        <input type="password" id="exam-pass" placeholder="Enter password to unlock">
      </div>
      ` : ''}
      <button class="primary" id="btn-start" style="width:100%;margin-top:4px">Start Exam</button>
    </div>
  </div>

  <!-- INSTRUCTIONS / CONSENT SCREEN (shown after a valid Start; the timer only arms on "begin") -->
  <div id="instructions-screen" class="screen">
    <div class="modal-box">
      <h1>Before you begin</h1>
      <div id="instructions-body" tabindex="-1">
        <p style="color:var(--text-muted);font-size:14px;margin-bottom:12px;">Please read this, then start when you are ready.</p>
        <ul id="instructions-list" style="text-align:left;margin:0;padding-left:20px;color:var(--text-main);font-size:14px;"></ul>
      </div>
      <button class="primary" id="btn-begin" style="width:100%;margin-top:16px">I understand — begin</button>
    </div>
  </div>

  <!-- RESUME PROMPT (offered on load when an unfinished attempt for this quiz is saved) -->
  <div id="resume-modal" role="dialog" aria-modal="true" aria-labelledby="resume-title" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(13,17,23,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);align-items:center;justify-content:center;">
    <div style="background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);max-width:380px;width:90%;padding:32px;text-align:center;">
      <h2 id="resume-title" style="font-size:18px;margin-bottom:12px;color:var(--text-bright);">Resume your previous attempt?</h2>
      <p id="resume-info" style="color:var(--text-muted);font-size:14px;margin-bottom:24px;"></p>
      <div style="display:flex;gap:12px;">
        <button class="primary" id="btn-resume-yes" style="flex:1;">Resume</button>
        <button id="btn-resume-no" style="flex:1;background:var(--panel-hover);color:var(--text-main);">Start over</button>
      </div>
    </div>
  </div>

  <!-- CONFIRM MODAL -->
  <div id="confirm-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(13,17,23,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);align-items:center;justify-content:center;">
    <div style="background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);max-width:340px;width:90%;padding:32px;text-align:center;">
      <h2 style="font-size:18px;margin-bottom:12px;color:var(--text-bright);">Finish Exam?</h2>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px;">Are you sure you want to finish the exam and submit all answers? This action cannot be undone.</p>
      <div style="display:flex;gap:12px;">
        <button class="primary" id="btn-confirm-yes" style="flex:1;">Yes, Submit</button>
        <button id="btn-confirm-no" style="flex:1;background:var(--panel-hover);color:var(--text-main);">Cancel</button>
      </div>
    </div>
  </div>

  <!-- ERROR MODAL -->
  <div id="error-modal" style="display:none;position:fixed;inset:0;z-index:10001;background:rgba(13,17,23,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);align-items:center;justify-content:center;">
    <div style="background:var(--panel-bg);border:1px solid var(--accent-danger);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);max-width:340px;width:90%;padding:32px;text-align:center;">
      <h2 style="font-size:18px;margin-bottom:12px;color:var(--accent-danger);">Error</h2>
      <p id="error-msg" style="color:var(--text-muted);font-size:14px;margin-bottom:24px;"></p>
      <button class="primary" id="btn-error-close" style="width:100%;">Close</button>
    </div>
  </div>

  ${examMode ? `
  <!-- FOCUS NOTICE (humane: a dismissable reminder, never a black-out or key trap) -->
  <div id="focus-notice-overlay" role="alertdialog" aria-modal="false" aria-labelledby="focus-notice-title" aria-describedby="focus-notice-desc" tabindex="-1" style="display:none;position:fixed;inset:0;z-index:9998;background:rgba(13,17,23,0.5);align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:20px;">
    <div style="background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);max-width:420px;width:90%;padding:32px;">
      <h2 id="focus-notice-title" style="font-family:var(--font-mono);font-size:20px;margin-bottom:12px;color:var(--text-bright);">You left the exam window</h2>
      <p id="focus-notice-desc" style="font-size:14px;line-height:1.6;color:var(--text-muted);margin-bottom:8px;">Leaving this window is logged for your instructor. Return here to continue your exam.</p>
      <p id="focus-notice-count" style="font-size:13px;color:var(--text-muted);margin-bottom:20px;"></p>
      <button class="primary" id="btn-focus-resume" style="width:100%;">Resume Exam</button>
    </div>
  </div>
  ` : ''}

  <!-- Faint tiled student-name watermark; text is set by JS once the name is known. -->
  <div id="name-watermark" class="name-watermark" aria-hidden="true"></div>

  <!-- GAME SCREEN -->
  <div id="game-screen" class="screen">
    <div class="top-bar">
      <div class="brand">${escHtml(examTitle)}</div>
      <div class="player-info" id="display-name">Student: &mdash;</div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${enableTimer ? `<span id="timer-cue" style="display:none;font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--accent-danger);"></span>` : ''}
        ${enableTimer ? `<div id="exam-timer" class="timer-display" role="timer" aria-live="polite" aria-atomic="true">--:--</div>` : ''}
        <button class="theme-toggle" id="btn-theme">Light Mode</button>
        <button class="success" id="btn-early-finish">Submit All Answers</button>
      </div>
    </div>
    <div id="timer-announce" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <!-- Question navigation: horizontal glass pill rail, full width under the top bar -->
    <nav class="qnav" id="sidebar-levels" aria-label="Questions"></nav>
    <div class="game-layout">
      <div class="workspace">
        <div class="challenge-card">
          <div class="topic-badge" id="card-topic">Topic</div>
          <button id="btn-translate" class="translate-btn">Translate to Arabic</button>
          <h2 class="challenge-text" id="card-text" tabindex="-1">Loading question...</h2>
          <div id="answer-area" style="margin-bottom: 26px;">
            <!-- Injected dynamically by JS based on type -->
          </div>
          <div class="action-buttons">
            <button class="primary" id="btn-submit">Submit Answer</button>
          </div>
          <div id="alert-box" class="alert-msg" role="status" aria-live="polite"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- RESULT SCREEN -->
  <div id="result-screen" class="screen">
      <div class="modal-box text-center">
        <!-- Results injected dynamically -->
      </div>
  </div>

  <!-- DATA LOGIC -->
  <script>
// NOTE: The obfuscated exam runtime (injected below) carries its own encode/verifyHash.
// A duplicate window.CTF_DATA SHA-256 block used to live here but was dead weight in every
// student file (and a mis-grade drift risk), so it was removed.
${lockCopyPaste ? `
document.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('copy',function(e){e.preventDefault();});
document.addEventListener('cut',function(e){e.preventDefault();});
document.addEventListener('paste',function(e){e.preventDefault();});
` : ''}
document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key)))e.preventDefault();});
</script>
  <script>${obfuscatePayload(getEmbeddedScript(JSON.stringify(sanitizeChallengesForStudent(exportChallenges)).replace(/</g, '\\u003c'), quizID, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes, teacherPassHash, allowRetake, questionLimit))}<\/script>
</body>
</html>`;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Supply-chain integrity for the Skulpt engine that gets inlined into student exams.
  // Pin these to the hex SHA-256 of the exact engine/stdlib you trust. While empty, the builder
  // does NOT block — it console.warns the computed hash so you can paste it here to enable
  // enforcement. Once set to a non-empty hex string, a mismatch aborts the export.
  const SKULPT_SHA256 = '';        // SHA-256 of skulpt.min.js
  const SKULPT_STDLIB_SHA256 = ''; // SHA-256 of skulpt-stdlib.js

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Enforce when a hash is pinned; otherwise surface the computed hash so it can be pinned later.
  async function verifySkulptIntegrity(engine, stdlib) {
    // crypto.subtle only exists in a secure context. file:// and localhost qualify in modern
    // browsers, but never let a missing digest API block an offline Python export.
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      if (SKULPT_SHA256 || SKULPT_STDLIB_SHA256) {
        console.warn('[Skulpt integrity] crypto.subtle unavailable here — cannot verify pinned hashes; proceeding.');
      }
      return;
    }
    const [engHash, stdHash] = await Promise.all([sha256Hex(engine), sha256Hex(stdlib)]);
    const check = (label, expected, actual) => {
      if (!expected) { console.warn('[Skulpt integrity] ' + label + ' not pinned. Computed SHA-256: ' + actual); return; }
      if (String(expected).toLowerCase() !== actual) {
        throw new Error('Skulpt ' + label + ' integrity check failed — export aborted. Expected ' + expected + ', got ' + actual + '.');
      }
    };
    check('engine', SKULPT_SHA256, engHash);
    check('stdlib', SKULPT_STDLIB_SHA256, stdHash);
  }

  // Fetch the Skulpt (Python) engine once, then reuse it so repeat exports don't need the network.
  let _skulptEngineCache = null;
  const SKULPT_CACHE_KEY = '__quiz_maker_skulpt_cache_v1';
  const SKULPT_SOURCES = [
    ['https://skulpt.org/js/skulpt.min.js', 'https://skulpt.org/js/skulpt-stdlib.js'],
    ['https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js', 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js']
  ];
  async function loadSkulptEngine() {
    if (_skulptEngineCache) return _skulptEngineCache;
    // Best-effort persistent cache: after one online export, a teacher can export Python exams offline.
    try {
      const cached = JSON.parse(localStorage.getItem(SKULPT_CACHE_KEY) || 'null');
      if (cached && cached.engine && cached.stdlib) {
        // Verify even the local cache: a pinned hash must not be bypassed by a tampered entry.
        await verifySkulptIntegrity(cached.engine, cached.stdlib);
        _skulptEngineCache = [cached.engine, cached.stdlib];
        return _skulptEngineCache;
      }
    } catch (e) {
      if (/integrity check failed/.test(e && e.message)) throw e; // never silently fall through a mismatch
      /* otherwise ignore corrupt/oversized cache */
    }

    let lastErr = null;
    for (const [engineUrl, stdlibUrl] of SKULPT_SOURCES) {
      try {
        const [skRes, stdRes] = await Promise.all([fetch(engineUrl), fetch(stdlibUrl)]);
        if (!skRes.ok || !stdRes.ok) throw new Error('HTTP ' + skRes.status + ' / ' + stdRes.status);
        const [engine, stdlib] = await Promise.all([skRes.text(), stdRes.text()]);
        await verifySkulptIntegrity(engine, stdlib); // gate before caching or inlining
        _skulptEngineCache = [engine, stdlib];
        try { localStorage.setItem(SKULPT_CACHE_KEY, JSON.stringify({ engine, stdlib })); } catch (e) { /* storage full — still fine for this session */ }
        return _skulptEngineCache;
      } catch (err) { lastErr = err; }
    }
    throw new Error('Could not download the Python (Skulpt) engine, and no cached copy exists. Connect to the internet once so it can be cached, then Python exams can be exported offline. (' + (lastErr ? lastErr.message : 'network error') + ')');
  }

  // Strip instructor-only fields (which MCQ option is correct) before questions reach students.
  function sanitizeChallengesForStudent(list) {
    return list.map(function (c) {
      const copy = Object.assign({}, c);
      if (copy.type === 'mcq' && Array.isArray(copy.options)) {
        copy.options = copy.options.map(function (o) { return { text: o.text }; });
      }
      return copy;
    });
  }

  // ─── Embedded CSS (dark + light theme in one) ─────────────────
  function getEmbeddedCss(lockCopyPaste, examMode, enableTimer) {
    return `:root{--bg-color:#0a0e13;--panel-bg:rgba(17,22,32,0.65);--panel-hover:rgba(26,32,48,0.7);--border-color:rgba(42,52,72,0.6);--border-glow:#3d5a80;--text-main:#c9d1d9;--text-muted:#6e7f94;--text-bright:#e8f0fe;--accent-primary:#58a6ff;--accent-primary-hover:#388bfd;--accent-success:#39d353;--accent-success-hover:#2ea043;--accent-danger:#ff4444;--accent-warning:#e3b341;--htb-green:#9fef00;--font-main:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--font-mono:'JetBrains Mono','Fira Code','Courier New',monospace;--shadow-md:0 4px 16px rgba(0,0,0,.7);--shadow-lg:0 16px 48px rgba(0,0,0,.8);--glow-blue:0 0 20px rgba(88,166,255,.15);--radius-md:6px;--radius-lg:10px;--input-bg:rgba(6,10,15,0.8);--sidebar-bg:rgba(13,18,25,0.7);--workspace-bg:transparent;--level-btn-hover:rgba(88,166,255,.08)}
body.light{--bg-color:#f0f2f5;--panel-bg:#fff;--panel-hover:#f0f3f7;--border-color:#9eaab8;--border-glow:#6b8cba;--text-main:#1f2328;--text-muted:#656d76;--text-bright:#1f2328;--accent-primary:#0969da;--accent-primary-hover:#0752b0;--accent-success:#1a7f37;--accent-danger:#cf222e;--accent-warning:#9a6700;--htb-green:#2da44e;--shadow-md:0 4px 12px rgba(0,0,0,.1);--shadow-lg:0 12px 32px rgba(0,0,0,.14);--glow-blue:none;--input-bg:#fff;--sidebar-bg:#f5f7fa;--workspace-bg:#eaeef2;--level-btn-hover:rgba(31,35,40,.06)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg-color);background-image:linear-gradient(rgba(88,166,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(88,166,255,.03) 1px,transparent 1px);background-size:40px 40px;color:var(--text-main);font-family:var(--font-main);display:flex;flex-direction:column;min-height:100vh;height:100vh;overflow:hidden;user-select:${lockCopyPaste ? 'none' : 'auto'};-webkit-font-smoothing:antialiased;transition:background .2s,color .2s}
.modal-box,.challenge-card,.qnav,.top-bar{backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
input,textarea{user-select:auto}
h1,h2,h3{color:var(--text-bright);font-weight:700}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border-color);border-radius:8px}::-webkit-scrollbar-thumb:hover{background:var(--border-glow)}
button{font-family:var(--font-main);font-size:12px;font-weight:700;cursor:pointer;border:1px solid var(--border-color);background:var(--panel-hover);color:var(--text-muted);padding:9px 18px;border-radius:var(--radius-md);transition:all .18s ease;display:inline-flex;align-items:center;gap:6px;letter-spacing:.3px;text-transform:uppercase}
button:hover{border-color:var(--accent-primary);color:var(--accent-primary);background:rgba(88,166,255,.06);transform:translateY(-1px);box-shadow:0 4px 16px rgba(88,166,255,.15)}
button.primary{background:var(--accent-primary);border-color:var(--accent-primary);color:#fff;font-weight:700;box-shadow:0 0 20px rgba(88,166,255,.25)}
button.primary:hover{background:var(--accent-primary-hover);border-color:var(--accent-primary-hover);box-shadow:0 0 30px rgba(88,166,255,.5);transform:translateY(-2px)}
button.success{background:var(--accent-success);border-color:var(--accent-success);color:#000;font-weight:700;box-shadow:0 0 18px rgba(57,211,83,.25)}
button.success:hover{box-shadow:0 0 28px rgba(57,211,83,.45);transform:translateY(-1px);color:#fff}
button.warning{background:var(--accent-warning);border-color:var(--accent-warning);color:#000;font-weight:700}
button.theme-toggle{background:transparent;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 14px;border-radius:20px;text-transform:none;font-size:12px}
button.theme-toggle:hover{color:var(--text-bright);border-color:var(--border-glow);transform:none;box-shadow:none}
button:disabled{opacity:.4;cursor:not-allowed;pointer-events:none;transform:none;box-shadow:none}
.input-group{margin-bottom:18px}
.input-group label{display:block;margin-bottom:6px;color:var(--text-muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;font-family:var(--font-mono)}
.input-group input{width:100%;padding:11px 14px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-main);font-family:var(--font-mono);font-size:14px;transition:all .2s ease}
.input-group input:focus{border-color:var(--accent-primary);outline:none;box-shadow:0 0 0 3px rgba(88,166,255,.15)}
.input-group input::placeholder{color:var(--text-muted);font-family:var(--font-mono)}
.screen{display:none;flex:1;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.screen.active{display:flex;animation:fadeUp .3s ease-out}
#result-screen.active,#start-screen.active{overflow-y:auto;height:100vh;align-items:center;justify-content:flex-start;padding:24px 20px}
#result-screen.active .modal-box,#start-screen.active .modal-box{margin:auto 0;flex-shrink:0}
#game-screen{overflow:hidden}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.modal-box{background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:44px;width:100%;max-width:480px;box-shadow:var(--shadow-lg);text-align:center;position:relative;overflow:hidden}
.modal-box::before{content:'';position:absolute;top:0;left:0;width:60px;height:2px;background:linear-gradient(90deg,var(--accent-primary),transparent)}
.modal-box::after{content:'';position:absolute;top:0;left:0;width:2px;height:60px;background:linear-gradient(180deg,var(--accent-primary),transparent)}
.modal-box h1{color:var(--accent-primary);font-size:24px;font-family:var(--font-mono);margin-bottom:10px;letter-spacing:-.5px}
.modal-box>p{color:var(--text-muted);font-size:14px;line-height:1.6;margin-bottom:28px}
.top-bar{width:100%;height:54px;background:var(--panel-bg);border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;padding:0 22px;flex-shrink:0;z-index:10}
.brand{color:var(--accent-primary);font-weight:700;font-size:13px;font-family:var(--font-mono);letter-spacing:.5px;text-transform:uppercase}
.player-info{color:var(--text-muted);font-size:13px;font-family:var(--font-mono)}
${enableTimer ? '.timer-display { font-family: var(--font-mono); font-size: 16px; font-weight: 700; color: var(--accent-warning); background: rgba(227, 179, 65, 0.1); padding: 4px 12px; border-radius: 4px; border: 1px solid var(--accent-warning); letter-spacing: 1px; } .timer-display.danger { color: var(--accent-danger); border-color: var(--accent-danger); background: rgba(255, 68, 68, 0.1); animation: pulse 1s infinite; } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }' : ''}
#game-screen{flex-direction:column;justify-content:flex-start;align-items:stretch;padding:0;height:100%;width:100%}
.game-layout{display:flex;flex:1;overflow:hidden;width:100%}
/* ── Question navigation: horizontal glass "pill rail" (replaces the old left .sidebar) ── */
.qnav{flex-shrink:0;width:100%;display:flex;align-items:center;gap:14px;padding:10px 22px;overflow-x:auto;overflow-y:hidden;background:var(--panel-bg);border-bottom:1px solid var(--border-color);scrollbar-width:thin;scroll-snap-type:x proximity;z-index:9}
.qnav::before{content:'QUESTIONS';flex-shrink:0;font:700 10px/1 var(--font-mono);letter-spacing:1.5px;color:var(--text-muted)}
.qnav-track{display:flex;gap:8px;align-items:center}
.qpill{flex:0 0 auto;scroll-snap-align:start;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:34px;min-height:34px;padding:4px 8px;border:1px solid var(--border-color);border-radius:var(--radius-md);background:transparent;color:var(--text-muted);font:600 12px/1 var(--font-mono);text-transform:none;letter-spacing:0;transition:border-color .15s ease,color .15s ease,background .15s ease}
.qpill .qpill-mark{font-size:10px;line-height:1;height:10px}
.qpill:hover{border-color:var(--border-glow);color:var(--text-bright);background:var(--panel-hover)}
.qpill:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
.qpill[data-state="answered"]{color:var(--accent-success);border-color:color-mix(in oklab,var(--accent-success) 45%,transparent)}
.qpill[data-state="pending"]{color:var(--accent-warning);border-color:color-mix(in oklab,var(--accent-warning) 45%,transparent)}
.qpill[data-state="flagged"]{color:var(--accent-danger);border-color:color-mix(in oklab,var(--accent-danger) 45%,transparent)}
.qpill[aria-current="true"]{color:var(--accent-primary);border-color:var(--accent-primary);background:color-mix(in oklab,var(--accent-primary) 10%,transparent);box-shadow:0 0 10px color-mix(in oklab,var(--accent-primary) 40%,transparent)}
.qnav-progress{margin-left:auto;flex-shrink:0;display:flex;align-items:center;gap:10px;position:relative;font:500 10px/1 var(--font-mono);color:var(--text-muted)}
.qnav-fill{display:block;height:3px;width:0;min-width:80px;border-radius:2px;background:linear-gradient(90deg,var(--accent-primary),var(--accent-success));background-clip:padding-box;transition:width .4s ease}
@media (max-width:480px){.qnav::before{display:none}}
.workspace{flex:1;padding:40px 32px;overflow-y:auto;scroll-behavior:smooth;display:flex;flex-direction:column;align-items:center;background:var(--workspace-bg)}
.challenge-card{background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);width:100%;max-width:800px;padding:40px;position:relative;box-shadow:var(--shadow-md);transition:border-color .25s ease,box-shadow .25s ease;overflow:hidden}
.challenge-card::before{content:'';position:absolute;top:0;left:0;width:50px;height:2px;background:linear-gradient(90deg,var(--accent-primary),transparent)}
.challenge-card:hover{border-color:var(--border-glow);box-shadow:var(--shadow-lg)}
.topic-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(88,166,255,.07);color:var(--accent-primary);padding:5px 14px;border-radius:4px;font-size:10px;font-weight:700;margin-bottom:22px;border:1px solid rgba(88,166,255,.18);text-transform:uppercase;letter-spacing:1px;font-family:var(--font-mono)}
.topic-badge::before{content:'▣';font-size:10px;opacity:.7}
.challenge-text{font-size:15px;font-weight:400;line-height:1.8;color:var(--text-main);margin-bottom:28px;white-space:pre-wrap}
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#card-text:focus-visible{outline:2px solid var(--accent-primary);outline-offset:4px;border-radius:var(--radius-md)}
.format-req{background:rgba(227,179,65,.07);border-left:2px solid var(--accent-warning);border-radius:0 var(--radius-md) var(--radius-md) 0;padding:12px 16px;color:var(--accent-warning);font-size:13px;font-weight:500;margin-bottom:28px;font-family:var(--font-mono)}
.flag-input-wrapper{display:flex;align-items:center;background:var(--input-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:6px 18px;margin-bottom:28px;transition:all .2s ease;position:relative}
.flag-input-wrapper::before{content:'>';color:var(--accent-success);font-family:var(--font-mono);font-size:16px;font-weight:700;margin-right:12px;flex-shrink:0}
.flag-input-wrapper:hover{border-color:var(--border-glow)}
/* Input clears its own outline, so the focus ring lives on the wrapper. Solid 2px accent
   outline guarantees >=3:1 UI contrast against both themes; the wider soft ring is decorative.
   Also covers .is-slotted (same element). No transition/animation, so reduced-motion safe. */
.flag-input-wrapper:focus-within{border-color:var(--accent-primary);outline:2px solid var(--accent-primary);outline-offset:2px;box-shadow:0 0 0 4px color-mix(in oklab,var(--accent-primary) 40%,transparent)}
.flag-input-wrapper:focus-within::before{color:var(--accent-primary)}
.flag-input-wrapper input{flex:1;background:transparent;border:none;color:var(--htb-green);font-family:var(--font-mono);font-size:16px;font-weight:500;padding:12px 0;outline:none;box-shadow:none;letter-spacing:.5px}
.flag-input-wrapper input::placeholder{color:var(--text-muted);font-family:var(--font-mono)}
.action-buttons{display:flex;gap:10px;flex-wrap:wrap}
.alert-msg{margin-top:18px;padding:12px 20px;border-radius:var(--radius-md);display:none;font-size:12px;font-weight:700;text-align:center;animation:slideIn .2s ease;font-family:var(--font-mono)}
@keyframes slideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.alert-msg.error{display:block;color:var(--accent-danger);background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.25)}
.alert-msg.success{display:block;color:var(--accent-success);background:rgba(57,211,83,.08);border:1px solid rgba(57,211,83,.25)}
.translate-btn{position:absolute;top:28px;right:28px;background:transparent;border:1px solid var(--border-color);color:var(--text-muted);padding:5px 12px;font-size:11px;border-radius:4px;text-transform:none}
.translate-btn:hover{color:var(--text-bright);border-color:var(--border-glow);transform:none;box-shadow:none}
.rtl-text{direction:rtl;text-align:right;font-size:17px;line-height:1.9}
/* Read-aloud button: sits above the question text so it's clearly associated and never
   collides with the absolutely-positioned translate button. Min target >=24px (DoD). */
.listen-btn{background:transparent;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 12px;min-height:26px;font-size:11px;border-radius:4px;text-transform:none;margin-bottom:14px}
.listen-btn:hover{color:var(--text-bright);border-color:var(--border-glow);transform:none;box-shadow:none}
/* Student-name watermark: honest deterrent / traceability. z-index:-1 keeps it behind ALL
   content but above the body background; pointer-events:none + very low, theme-aware opacity
   so it never touches foreground readability or contrast. No animation => reduced-motion safe. */
.name-watermark{position:fixed;inset:0;z-index:-1;pointer-events:none;user-select:none;display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--text-main);opacity:.045;font-family:var(--font-mono);font-weight:800;text-transform:uppercase;letter-spacing:.12em;white-space:nowrap;font-size:9vw;transform:rotate(-24deg)}
.stats-table{width:100%;margin:26px 0;border-collapse:collapse;font-family:var(--font-mono)}
.stats-table th,.stats-table td{padding:13px 10px;border-bottom:1px solid var(--border-color);text-align:left;font-size:13px}
.stats-table th{color:var(--text-muted);font-weight:500;width:45%;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
.stats-table td{color:var(--text-bright);font-weight:600}
.stats-table tr:last-child th,.stats-table tr:last-child td{border-bottom:none}
.score-circle{margin:20px auto;width:120px;height:120px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center}
.score-circle .score-val{font-size:28px;font-weight:800;font-family:var(--font-mono)}
.score-circle .score-lbl{font-size:9px;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:1px}
/* ── Fluid typography + full-device responsiveness ── */
html{-webkit-text-size-adjust:100%}
body{min-height:100dvh}
img,svg,table{max-width:100%}
.modal-box{max-width:min(480px,92vw);padding:clamp(26px,4vw,44px)}
.modal-box h1{font-size:clamp(20px,5vw,24px)}
.workspace{padding:clamp(18px,3vw,40px) clamp(14px,3vw,32px)}
.challenge-card{padding:clamp(20px,3.5vw,40px)}
.challenge-text{font-size:clamp(14px,2.6vw,15px)}
@media (max-width:820px){
  .top-bar{height:auto;min-height:54px;flex-wrap:wrap;gap:8px 12px;padding:10px 16px}
  .brand{flex:1 1 auto}
  .game-layout{flex-direction:column}
  .translate-btn{position:static;display:inline-flex;margin:0 0 18px}
}
@media (max-width:480px){
  .top-bar{padding:10px 12px}
  .player-info{width:100%;order:3;font-size:12px}
  .action-buttons{flex-direction:column}
  .action-buttons button{width:100%;justify-content:center}
  .score-circle{width:104px;height:104px}
}
/* ── Design Refresh v3 (exam) — matches the builder ── */
:root{--bg-color:#0a0c12;--panel-bg:rgba(19,24,33,0.72);--panel-hover:rgba(30,37,51,0.85);--border-color:rgba(150,168,194,0.14);--border-glow:#3f7fe0;--text-main:#c6cfda;--text-muted:#7a8592;--text-bright:#f2f6fb;--accent-primary:#4d9dff;--accent-primary-hover:#6fb0ff;--accent-success:#3fd06a;--accent-success-hover:#34b85c;--accent-danger:#ff5b6e;--accent-warning:#f0b429;--htb-green:#9fef00;--radius-md:10px;--radius-lg:14px;--input-bg:rgba(9,13,19,0.72);--sidebar-bg:rgba(12,16,23,0.6);--fx-glow-a:color-mix(in oklab,var(--accent-primary) 20%,transparent);--fx-glow-b:color-mix(in oklab,var(--htb-green) 12%,transparent);--fx-opacity:.42;--fx-drift:52s}
body.light{--bg-color:#eef1f6;--panel-bg:#fff;--panel-hover:#f2f5f9;--border-color:rgba(20,30,50,.12);--border-glow:#5b8def;--text-main:#2b333d;--text-muted:#5c6874;--text-bright:#131820;--accent-primary:#2f6fe0;--accent-primary-hover:#245bc0;--accent-success:#1f9d4d;--accent-danger:#d83a4e;--accent-warning:#b5820c;--htb-green:#2da44e;--input-bg:#fff;--sidebar-bg:#f5f7fb;--workspace-bg:#e9edf3;--fx-glow-a:color-mix(in oklab,var(--accent-primary) 10%,transparent);--fx-glow-b:color-mix(in oklab,var(--htb-green) 7%,transparent);--fx-opacity:.22}
body{background-image:linear-gradient(rgba(120,140,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,140,175,.05) 1px,transparent 1px);background-size:46px 46px}
button{border-radius:8px;letter-spacing:.2px}
button.primary{background:linear-gradient(180deg,var(--accent-primary),var(--accent-primary-hover));border-color:transparent;color:#fff;box-shadow:0 2px 12px rgba(77,157,255,.28)}
button.success{background:linear-gradient(180deg,var(--accent-success),var(--accent-success-hover));border-color:transparent;color:#06140b}
.modal-box,.challenge-card{border-radius:14px}
.challenge-card{box-shadow:0 8px 28px rgba(0,0,0,.42)}
.flag-input-wrapper,.input-group input{border-radius:8px}
.modal-box h1{letter-spacing:-.4px}
/* ── Long-text safety: never let a huge word/answer break layout ── */
.brand{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.challenge-text{overflow-wrap:anywhere;word-break:break-word}
.topic-badge{max-width:100%;overflow-wrap:anywhere;white-space:normal;text-align:left;line-height:1.4}
.flag-input-wrapper{min-width:0}.flag-input-wrapper input{min-width:0}
#answer-area label{min-width:0}
#answer-area label span{overflow-wrap:anywhere;word-break:break-word;min-width:0}
#result-screen td{overflow-wrap:anywhere;word-break:break-word}
/* "Monitor glow": one oversized fixed layer, two soft radial blobs, drifting on the compositor.
   z-index:-1 keeps it behind all content but above body bg+grid; transform/opacity only, no paint. */
body::before{content:'';position:fixed;inset:-20%;z-index:-1;pointer-events:none;opacity:var(--fx-opacity);background:radial-gradient(38vmax 38vmax at 22% 18%,var(--fx-glow-a),transparent 60%),radial-gradient(30vmax 30vmax at 82% 86%,var(--fx-glow-b),transparent 62%);filter:blur(8px);will-change:transform;transform:translateZ(0);transition:opacity .2s}
@media (prefers-reduced-motion:no-preference){body::before{animation:fx-drift var(--fx-drift) ease-in-out infinite alternate}}
@keyframes fx-drift{from{transform:translate3d(-1.5%,-1%,0) scale(1)}to{transform:translate3d(2%,2%,0) scale(1.05)}}
/* Pointer-reactive: when JS drives the glow (no-preference only), swap the loop for an eased lean toward the cursor. Same promoted layer, transform-only. */
@media (prefers-reduced-motion:no-preference){body.fx-pointer::before{animation:none;transform:translate3d(calc(var(--gx,0) * 1px),calc(var(--gy,0) * 1px),0) scale(1.04)}}
/* THM-style caret: hide native caret; letter-spacing MUST be 0 so 1char==1ch for the offset math (v3 sets .5px above). */
.flag-input-wrapper #flag-input{caret-color:transparent;letter-spacing:0}
.flag-caret{position:absolute;top:0;bottom:0;display:flex;align-items:center;left:calc(var(--caret-x,0) * 1px + var(--caret-len,0) * 1ch);font-family:var(--font-mono);font-size:16px;line-height:1;color:var(--htb-green);pointer-events:none;transform:translateX(-.05ch)}
.flag-input-wrapper:not(:focus-within) .flag-caret{display:none}
/* Once the value scrolls the field, ch math is wrong: hand the caret back to the browser, hide the fake one. */
.flag-input-wrapper.is-overflowing #flag-input{caret-color:var(--htb-green)}
.flag-input-wrapper.is-overflowing .flag-caret{display:none}
@media (prefers-reduced-motion:no-preference){.flag-caret{animation:flag-blink 1.06s step-end infinite}}
@keyframes flag-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
/* Slotted answer box (text questions carrying answerMask): input keeps the true value but goes
   invisible; the decorative .slot-row draws one span per mask position. */
.flag-input-wrapper.is-slotted{position:relative}
.flag-input-wrapper.is-slotted #flag-input{position:absolute;inset:0;margin:0;padding:12px 18px 12px 42px;color:transparent;caret-color:transparent;background:transparent;-webkit-text-fill-color:transparent;letter-spacing:0;z-index:2}
.flag-input-wrapper.is-slotted #flag-input::selection{background:transparent}
.slot-row{display:inline-flex;flex-wrap:wrap;align-items:center;gap:7px 9px;min-height:24px;padding:12px 0;font-family:var(--font-mono);font-size:16px;line-height:1;pointer-events:none;z-index:1}
.slot{width:1ch;text-align:center;flex:0 0 auto}
.slot--space{width:14px}
.slot--empty{color:var(--text-muted)}
.slot--filled{color:var(--htb-green);font-weight:500}
.slot--current{color:var(--htb-green)}
@media (prefers-reduced-motion:no-preference){.flag-input-wrapper.is-slotted:focus-within .slot--current{animation:flag-blink 1.06s step-end infinite}}
.flag-input-wrapper.is-slotted:has(#flag-input:disabled)::before{opacity:.5}
/* Respect users who ask for less motion: neutralize animations/transitions and keep the timer static */
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}.timer-display.danger{animation:none !important}}`;
  }

  // ─── Embedded game script ─────────────────────────────────────
  function getEmbeddedScript(challengesData, quizID, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes, teacherPassHash, allowRetake, questionLimit) {
    return `(function(CHALLENGES){
  var QUIZ_ID = "${quizID}";
  var PASS_HASH = ${passHash ? JSON.stringify(passHash) : 'null'};
  var TEACHER_PASS_HASH = ${teacherPassHash ? JSON.stringify(teacherPassHash) : 'null'};
  var ALLOW_RETAKE = ${allowRetake ? 'true' : 'false'};
  var QUESTION_LIMIT = ${Number.isFinite(Number(questionLimit)) && Number(questionLimit) > 0 ? Math.max(1, Number(questionLimit)) : 'null'};
  // Runtime feature flags mirror the build-time toggles so the attempt-lifecycle code (instructions,
  // autosave/resume, timer) can branch on plain booleans instead of nested template blocks.
  var ENABLE_TIMER = ${enableTimer ? 'true' : 'false'};
  var TIMER_MINUTES = ${enableTimer && Number.isFinite(Number(timerMinutes)) && Number(timerMinutes) > 0 ? Number(timerMinutes) : 'null'};
  var EXAM_MODE = ${examMode ? 'true' : 'false'};
  // Teacher preview runs in an iframe with the '#preview' fragment. In preview we relax the
  // name/password gate and never arm the focus-loss overlay, so Start always enters the exam.
  var PREVIEW = (window.location.hash.indexOf('preview') !== -1);
  if (PREVIEW && document.body) {
    var _pvBadge = document.createElement('div');
    _pvBadge.textContent = 'PREVIEW';
    _pvBadge.setAttribute('aria-hidden', 'true');
    _pvBadge.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;pointer-events:none;font-family:var(--font-mono,monospace);font-size:10px;font-weight:700;letter-spacing:1.5px;padding:3px 8px;border-radius:6px;background:rgba(88,166,255,.15);color:var(--accent-primary,#4d9dff);border:1px solid var(--accent-primary,#4d9dff)';
    document.body.appendChild(_pvBadge);
  }
  // Copy/paste + devtools locks are single-sourced in the inline document-level script above
  // (gated on lockCopyPaste), plus the input-level paste guard on the answer box. No duplicate here.

  // Pointer-reactive monitor glow: ease the background --gx/--gy toward the cursor.
  // Compositor-only (translate on the promoted body::before layer). Fully behind content,
  // pointer-events:none. Disabled under reduced motion so the CSS slow-drift stays as fallback.
  (function(){
    var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if ((rm && rm.matches) || !document.body) return;
    document.body.classList.add('fx-pointer');
    var MAX = 26, EASE = 0.06;                 // px lean; the glow leans, it does not track 1:1
    var tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    function frame(){
      cx += (tx - cx) * EASE;
      cy += (ty - cy) * EASE;
      document.body.style.setProperty('--gx', cx.toFixed(2));
      document.body.style.setProperty('--gy', cy.toFixed(2));
      if (Math.abs(tx - cx) < 0.1 && Math.abs(ty - cy) < 0.1) { running = false; return; }
      requestAnimationFrame(frame);
    }
    function kick(){ if (!running) { running = true; requestAnimationFrame(frame); } }
    window.addEventListener('pointermove', function(e){
      tx = (e.clientX / window.innerWidth - 0.5) * MAX;
      ty = (e.clientY / window.innerHeight - 0.5) * MAX;
      kick();
    }, { passive: true });
  })();

  function normalizeInput(str) {
    return String(str).toLowerCase().trim();
  }
  function legacyEncode(str) {
    var h = 0x811c9dc5;
    var s = normalizeInput(str);
    for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  function encode(str) {
    var s = normalizeInput(str);
    var bytes = Array.from(new TextEncoder().encode(s));
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    function rotateRight(value, bits) {
      return (value >>> bits) | (value << (32 - bits));
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    var high = Math.floor(bitLen / 0x100000000);
    var low = bitLen >>> 0;
    bytes.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255);
    bytes.push((low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);
    for (var offset = 0; offset < bytes.length; offset += 64) {
      var W = new Array(64);
      for (var j = 0; j < 16; j++) {
        var base = offset + (j * 4);
        W[j] = (((bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3]) >>> 0);
      }
      for (var k = 16; k < 64; k++) {
        var s0 = (rotateRight(W[k - 15], 7) ^ rotateRight(W[k - 15], 18) ^ (W[k - 15] >>> 3)) >>> 0;
        var s1 = (rotateRight(W[k - 2], 17) ^ rotateRight(W[k - 2], 19) ^ (W[k - 2] >>> 10)) >>> 0;
        W[k] = (W[k - 16] + s0 + W[k - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h2 = H[7];
      for (var n = 0; n < 64; n++) {
        var S1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var temp1 = (h2 + S1 + ch + K[n] + W[n]) >>> 0;
        var S0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (S0 + maj) >>> 0;
        h2 = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h2) >>> 0;
    }
    return H.map(function(value) { return value.toString(16).padStart(8, '0'); }).join('');
  }
  function verifyHash(str, expectedHash) {
    var hash = String(expectedHash || '').toLowerCase().trim();
    if (!hash) return false;
    if (/^[0-9a-f]{64}$/.test(hash)) return encode(str) === hash;
    if (/^[0-9a-f]{8}$/.test(hash)) return legacyEncode(str) === hash;
    return false;
  }
  
  var master=${challengesData};
  master.forEach(function(c) { Object.freeze(c); });
  
  var escHtml = function(unsafe) {
    return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  };

var state={playerName:'',startTime:0,gameChallenges:[],currentIndex:0,totalScore:0,maxScore:0,isArabic:false,focusLossCount:0,examActive:false};
var screens={start:document.getElementById('start-screen'),instructions:document.getElementById('instructions-screen'),game:document.getElementById('game-screen'),result:document.getElementById('result-screen'),confirm:document.getElementById('confirm-modal')};
var els={nameInput:document.getElementById('player-name'),sidebar:document.getElementById('sidebar-levels'),cardTopic:document.getElementById('card-topic'),cardText:document.getElementById('card-text'),answerArea:document.getElementById('answer-area'),alertBox:document.getElementById('alert-box')};

// Exam Settings & State — always declared so the timer/focus helpers can be plain functions
// guarded by ENABLE_TIMER / EXAM_MODE (harmless and never called when those features are off).
var _focusNotice = null;
var _examTimerInterval = null;
var _autosaveInterval = null;
var _examEndTime = 0;

// Safe localStorage: in a preview iframe (blob/opaque origin) or private mode, ANY localStorage
// access throws SecurityError. Unguarded access here would abort the whole exam script (Start dies).
function _lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function _lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}

// Setup Theme Toggle
var btnTheme=document.getElementById('btn-theme');
if(btnTheme){
  // With no saved choice, honor the OS color-scheme preference (DoD #5); matchMedia guarded for old browsers.
  var savedTheme=_lsGet('__theme');
  var prefersLight=savedTheme===null&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches;
  if(savedTheme==='light'||prefersLight){document.body.classList.add('light');btnTheme.textContent='Dark Mode';}
  btnTheme.addEventListener('click',function(){
    document.body.classList.toggle('light');
    var isLight=document.body.classList.contains('light');
    btnTheme.textContent=isLight?'Dark Mode':'Light Mode';
    _lsSet('__theme',isLight?'light':'dark');
  });
}


// Deterministic per-student exam (anti-copy, reproducible): a name-derived seed drives BOTH the
// random subset and every shuffle, so the same name always yields the same questions in the same
// order and different names differ. FNV-1a for the seed, mulberry32 for the PRNG stream.
function _seedFromString(str){var h=2166136261>>>0;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(seed){var a=seed>>>0;return function(){a=(a+1831565813)>>>0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function seededShuffle(arr,rnd){var c=arr.length,t,r;while(c){r=Math.floor(rnd()*c--);t=arr[c];arr[c]=arr[r];arr[r]=t;}return arr;}
function showScreen(n){Object.values(screens).forEach(function(s){s.classList.remove('active');});screens[n].classList.add('active');}
function formatTime(ms){var s=Math.floor((ms/1000)%60),m=Math.floor(ms/60000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function showAlert(msg,ok){els.alertBox.textContent=msg;els.alertBox.className='alert-msg '+(ok?'success':'error');clearTimeout(els.alertBox._t);els.alertBox._t=setTimeout(function(){els.alertBox.className='alert-msg';},2200);}
function updateQuestionText(){var ch=state.gameChallenges[state.currentIndex];if(!ch)return;var btn=document.getElementById('btn-translate');if(state.isArabic&&ch.qAr){els.cardText.textContent=ch.qAr;els.cardText.classList.add('rtl-text');btn.textContent='English';}else{els.cardText.textContent=ch.q;els.cardText.classList.remove('rtl-text');btn.textContent='Translate to Arabic';}}
document.getElementById('btn-translate').addEventListener('click',function(){state.isArabic=!state.isArabic;updateQuestionText();});

// Read-aloud (accessibility). Progressive enhancement: only build the button when the browser
// actually exposes speech synthesis, so a broken control is never shown. Speech is cancelled on
// every question change (see loadChallenge) and naturally stops when the utterance finishes.
var _speech = window.speechSynthesis;
function _cancelSpeech(){ if(_speech){ try{ _speech.cancel(); }catch(e){} } }
// Populate the background watermark once the student name is known (textContent = safe, no HTML).
function setWatermark(name){ var wm=document.getElementById('name-watermark'); if(wm) wm.textContent = name || ''; }
if(_speech){
  var _listenBtn=document.createElement('button');
  _listenBtn.type='button';
  _listenBtn.id='btn-listen';
  _listenBtn.className='listen-btn';
  _listenBtn.setAttribute('aria-label','Read the question aloud');
  // HTML entity for the speaker glyph avoids adding any backslash escapes to this literal.
  _listenBtn.innerHTML='<span aria-hidden="true">&#128266;</span> Listen';
  els.cardText.parentNode.insertBefore(_listenBtn, els.cardText);
  _listenBtn.addEventListener('click',function(){
    var ch=state.gameChallenges[state.currentIndex];
    if(!ch)return;
    _cancelSpeech();
    // Speak exactly the text on screen; use Arabic voice only when the Arabic text is shown.
    var useAr = state.isArabic && ch.qAr;
    var u=new SpeechSynthesisUtterance(useAr ? ch.qAr : ch.q);
    u.lang = useAr ? 'ar' : 'en';
    try{ _speech.speak(u); }catch(e){}
  });
}
function prepareAttemptChallenges(){
  // Seed from the student's name so ordering is reproducible per student (fallback keeps a stable
  // seed when no name is entered, e.g. preview). state.attempts is folded in so a retake reshuffles
  // yet stays reproducible for that student. This replaces Math.random on the subset/shuffle path.
  var seedStr = (state.playerName || 'anonymous') + '#' + (state.attempts || 1);
  var rnd = mulberry32(_seedFromString(seedStr));
  var shuffled = seededShuffle(master.slice(), rnd);
  var attemptCount = QUESTION_LIMIT ? Math.max(1, Math.min(QUESTION_LIMIT, shuffled.length)) : shuffled.length;
  var attemptPool = shuffled.slice(0, attemptCount);
  state.maxScore = attemptPool.reduce(function(s,c){return s+(c.points||10);},0);
  state.gameChallenges = attemptPool.map(function(c,i){
    var copy = Object.assign({},c,{displayLevel:i+1,status:'open',pointsPotential:c.points||10,studentAnswer:''});
    // Pre-shuffle MCQ options here (own per-question seeded stream) so option order is both
    // deterministic per student AND stable across navigation. Grading compares answer text, not
    // position, so this never affects scoring.
    if(copy.type==='mcq' && copy.options){
      copy.options = seededShuffle(copy.options.slice(), mulberry32(_seedFromString(seedStr+'#opt#'+i)));
    }
    return copy;
  });
}
function resetToStart(){
  var passInput = document.getElementById('exam-pass');
  els.nameInput.value = state.playerName || '';
  if (passInput) passInput.value = '';
  state.isArabic = false;
  showScreen('start');
  setTimeout(function(){
    if (passInput && PASS_HASH) passInput.focus();
    else els.nameInput.focus();
  }, 0);
}
function bindStartEnter(id){
  var field = document.getElementById(id);
  if (!field) return;
  field.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-start').click();
    }
  });
}
bindStartEnter('player-name');
bindStartEnter('exam-pass');

  function showError(msg){
    document.getElementById('error-msg').textContent=msg;
    document.getElementById('error-modal').style.display='flex';
  }
  document.getElementById('btn-error-close').addEventListener('click',function(){
    document.getElementById('error-modal').style.display='none';
  });

  document.getElementById('btn-start').addEventListener('click',function(){
  var name=els.nameInput.value.trim();
  if(!name){ if(PREVIEW){ name='Preview'; } else { return showError('Please enter your name to begin.'); } }
  if(PASS_HASH && !PREVIEW){
    var pInput=document.getElementById('exam-pass');
    if(!pInput || !verifyHash(pInput.value, PASS_HASH)) return showError('Incorrect exam password.');
  }
  state.attempts = (state.attempts || 0) + 1;
  state.playerName=name;document.getElementById('display-name').textContent='Student: '+name;
  setWatermark(name);
  prepareAttemptChallenges();
  state.totalScore=0;state.isArabic=false;state.focusLossCount=0;
  if (state.gameChallenges.length === 0) {
    return showError('This exam contains no questions! Please contact the instructor.');
  }
  // A successful Start no longer drops straight into Q1: it lands on the consent/instructions
  // screen. The timer and examActive only arm once the student presses "begin".
  showInstructions();
});

// ── Instructions / consent screen ───────────────────────────────
// Populated at runtime because question count and duration depend on the prepared attempt.
function showInstructions(){
  var n = state.gameChallenges.length;
  var items = [];
  items.push('This exam has ' + n + ' question' + (n === 1 ? '' : 's') + '.');
  if (ENABLE_TIMER && TIMER_MINUTES) {
    items.push('You have ' + TIMER_MINUTES + ' minute' + (TIMER_MINUTES === 1 ? '' : 's') + '. The countdown starts the moment you press begin, and the exam is submitted automatically when the time runs out.');
  } else {
    items.push('There is no time limit — take the time you need.');
  }
  items.push('You can move between questions and change your answers freely before the final submit.');
  items.push('Multiple-choice and short-answer questions are graded automatically; code answers are reviewed by your instructor.');
  if (EXAM_MODE) {
    items.push('This runs in exam mode: leaving the exam window is logged for your instructor.');
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += '<li style="margin-bottom:10px;line-height:1.5;">' + escHtml(items[i]) + '</li>';
  }
  document.getElementById('instructions-list').innerHTML = html;
  showScreen('instructions');
  // Move focus to the panel so screen-reader and keyboard users land on the new content.
  var panel = document.getElementById('instructions-body');
  setTimeout(function(){ if (panel && panel.focus) { try { panel.focus(); } catch (e) {} } }, 0);
}

var _beginBtn = document.getElementById('btn-begin');
if (_beginBtn) _beginBtn.addEventListener('click', function(){ beginExam(true); });

// ── Enter the exam proper ───────────────────────────────────────
// freshStart=true begins a brand-new attempt (new deadline, index 0, new start time). On resume we
// pass false and keep the restored deadline/index so the remaining time stays honest across reloads.
function beginExam(freshStart){
  if (freshStart) { state.startTime = Date.now(); }
  showScreen('game');
  state.examActive = true;
  if (EXAM_MODE) { setupFocusNotice(); }
  if (ENABLE_TIMER) {
    var durationMs = (TIMER_MINUTES || 0) * 60 * 1000;
    if (freshStart || !_examEndTime) { _examEndTime = Date.now() + durationMs; }
    startTimer();
  }
  // A resumed-but-expired attempt is auto-submitted synchronously by startTimer; don't load a card over it.
  if (!state.examActive) return;
  loadChallenge(freshStart ? 0 : (state.currentIndex || 0));
  // Persist immediately so a crash seconds after starting still resumes with the right deadline.
  saveAttempt();
}

// ── Humane exam-mode focus notice ───────────────────────────────
// Log each leave, remind the student to return; never black out, poll, trap keys, or grab fullscreen.
var _focusWired = false;
function setupFocusNotice(){
  _focusNotice = document.getElementById('focus-notice-overlay');
  var _noticeCount = document.getElementById('focus-notice-count');
  var _resumeBtn = document.getElementById('btn-focus-resume');
  function _showFocusNotice(){
    // The overlay must never appear in preview (an iframe rarely holds window focus).
    if (PREVIEW || !state.examActive || !_focusNotice) return;
    if (_noticeCount) _noticeCount.textContent = 'You have left this window ' + state.focusLossCount + ' time(s).';
    _focusNotice.style.display = 'flex';
    if (_resumeBtn) { try { _resumeBtn.focus(); } catch (e) {} }
  }
  function _hideFocusNotice(){
    if (_focusNotice) _focusNotice.style.display = 'none';
  }
  function _registerLeave(){
    if (PREVIEW || !state.examActive) return;
    state.focusLossCount++;
    saveAttempt(); // keep the durable leave count in sync
    _showFocusNotice();
  }
  // Wire the global listeners exactly once, even across retakes, to avoid stacking handlers.
  if (!_focusWired && !PREVIEW) {
    _focusWired = true;
    document.addEventListener('visibilitychange', function(){ if (document.hidden) _registerLeave(); else _hideFocusNotice(); });
    window.addEventListener('blur', function(){ _registerLeave(); });
    window.addEventListener('focus', function(){ _hideFocusNotice(); });
    if (_resumeBtn) _resumeBtn.addEventListener('click', _hideFocusNotice);
    if (_focusNotice) {
      _focusNotice.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); _hideFocusNotice(); } });
    }
  }
}

// ── Timer ───────────────────────────────────────────────────────
// Driven entirely by the absolute _examEndTime (epoch ms), so a resume computes the true remaining.
function startTimer(){
  var timerEl = document.getElementById('exam-timer');
  if (timerEl) { timerEl.classList.remove('danger'); timerEl._warned10 = false; }
  var _cueReset = document.getElementById('timer-cue');
  if (_cueReset) { _cueReset.textContent = ''; _cueReset.style.display = 'none'; }
  var _annReset = document.getElementById('timer-announce');
  if (_annReset) _annReset.textContent = '';
  function updateTimer(){
    var remaining = _examEndTime - Date.now();
    if (remaining <= 0) {
      clearInterval(_examTimerInterval);
      _examTimerInterval = null;
      if (timerEl) timerEl.textContent = '00:00';
      finishTest(); // Auto-submit!
      return;
    }
    var totalSecs = Math.floor(remaining / 1000);
    var m = Math.floor(totalSecs / 60);
    var s = totalSecs % 60;
    if (timerEl) timerEl.textContent = (m < 10 ? '0'+m : m) + ':' + (s < 10 ? '0'+s : s);
    var cueEl = document.getElementById('timer-cue');
    var announceEl = document.getElementById('timer-announce');
    // Warning must not be color-only: add a visible text cue plus an announced message.
    if (remaining <= 60000 && timerEl && !timerEl.classList.contains('danger')) {
      timerEl.classList.add('danger'); // Make it red and pulse at 1 minute
      if (cueEl) { cueEl.textContent = 'Time almost up'; cueEl.style.display = 'inline'; }
      if (announceEl) announceEl.textContent = 'One minute remaining.';
    }
    if (remaining <= 10000 && timerEl && !timerEl._warned10) {
      timerEl._warned10 = true;
      if (cueEl) cueEl.textContent = '10 seconds left';
      if (announceEl) announceEl.textContent = 'Ten seconds remaining.';
    }
  }
  if (_examTimerInterval) { clearInterval(_examTimerInterval); }
  // Register the interval BEFORE the first tick: if a resumed attempt is already past its deadline,
  // the initial updateTimer finishes the exam and needs a live interval id to clear.
  _examTimerInterval = setInterval(updateTimer, 1000);
  updateTimer(); // Initial call
}

// ── Autosave / resume ───────────────────────────────────────────
// Persist the in-progress attempt so a refresh or crash never loses answers. NEVER persist in
// preview. All storage is wrapped in try/catch: localStorage throws under file:// and in private
// mode / over quota. We store the ABSOLUTE deadline, not remaining seconds, so time stays honest.
var ATTEMPT_KEY = '__ctf_attempt_' + QUIZ_ID;
var ATTEMPT_SCHEMA = 1;
function saveAttempt(){
  if (PREVIEW || !state.examActive) return;
  try {
    var payload = {
      v: ATTEMPT_SCHEMA,
      playerName: state.playerName,
      currentIndex: state.currentIndex,
      attempts: state.attempts || 1,
      focusLossCount: state.focusLossCount || 0,
      startTime: state.startTime || Date.now(),
      deadline: (ENABLE_TIMER && _examEndTime) ? _examEndTime : null,
      questions: state.gameChallenges.map(function(ch){
        return { id: ch.id, status: ch.status, studentAnswer: ch.studentAnswer, displayLevel: ch.displayLevel, earnedScore: ch.earnedScore };
      })
    };
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(payload));
  } catch (e) {}
}
function clearAttempt(){
  try { localStorage.removeItem(ATTEMPT_KEY); } catch (e) {}
}
function loadSavedAttempt(){
  if (PREVIEW) return null;
  try {
    var raw = localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    // Any stored attempt is unfinished by construction (we clear on finish); still schema-check it.
    if (!data || data.v !== ATTEMPT_SCHEMA || !data.questions || !data.questions.length) return null;
    return data;
  } catch (e) { return null; }
}
function resumeAttempt(data){
  var byId = {};
  master.forEach(function(c){ byId[c.id] = c; });
  var rebuilt = [];
  for (var i = 0; i < data.questions.length; i++){
    var q = data.questions[i];
    var base = byId[q.id];
    if (!base) continue; // question removed since the attempt was saved: skip it gracefully
    var resumed = Object.assign({}, base, {
      displayLevel: q.displayLevel || (i + 1),
      status: q.status || 'open',
      pointsPotential: base.points || 10,
      studentAnswer: q.studentAnswer || ''
    });
    // Restore an auto-graded code score so the lock and final tally survive a resume.
    if (typeof q.earnedScore === 'number') resumed.earnedScore = q.earnedScore;
    rebuilt.push(resumed);
  }
  if (!rebuilt.length) { clearAttempt(); return false; }
  state.gameChallenges = rebuilt;
  state.maxScore = rebuilt.reduce(function(s,c){ return s + (c.pointsPotential || 10); }, 0);
  state.playerName = data.playerName || '';
  state.attempts = data.attempts || 1;
  state.focusLossCount = data.focusLossCount || 0;
  state.startTime = data.startTime || Date.now();
  state.currentIndex = Math.min(data.currentIndex || 0, rebuilt.length - 1);
  state.totalScore = 0;
  state.isArabic = false;
  document.getElementById('display-name').textContent = 'Student: ' + state.playerName;
  setWatermark(state.playerName);
  // Restore the absolute deadline so remaining time is correct; fall back to a fresh one if missing.
  if (ENABLE_TIMER) { _examEndTime = data.deadline || (Date.now() + (TIMER_MINUTES || 0) * 60 * 1000); }
  beginExam(false);
  return true;
}
function maybePromptResume(){
  if (PREVIEW) return;
  var data = loadSavedAttempt();
  if (!data) return;
  var modal = document.getElementById('resume-modal');
  if (!modal) return;
  var info = document.getElementById('resume-info');
  if (info) {
    var answered = 0;
    data.questions.forEach(function(q){ if (q.status && q.status !== 'open') answered++; });
    info.textContent = 'We found an unfinished attempt' + (data.playerName ? ' for ' + data.playerName : '') + ' — ' + answered + ' of ' + data.questions.length + ' answered.';
  }
  modal.style.display = 'flex';
  var yes = document.getElementById('btn-resume-yes');
  var no = document.getElementById('btn-resume-no');
  if (yes) {
    try { yes.focus(); } catch (e) {}
    yes.addEventListener('click', function(){
      modal.style.display = 'none';
      if (!resumeAttempt(data)) { showError('Your previous attempt could not be restored. Please start again.'); }
    });
  }
  if (no) {
    no.addEventListener('click', function(){
      clearAttempt();
      modal.style.display = 'none';
      try { els.nameInput.focus(); } catch (e) {}
    });
  }
}

// ── Download my answers ─────────────────────────────────────────
// A durable receipt the student always gets, even when detailed results are gated behind a teacher
// password. It contains only the student's OWN submitted answers — never the correct answers.
function downloadAnswers(){
  try {
    var statusLabel = function(s){
      if (s === 'solved') return 'Correct';
      if (s === 'partial') return 'Partially correct';
      if (s === 'incorrect' || s === 'answered') return 'Incorrect';
      if (s === 'pending') return 'Pending instructor review';
      return 'Not answered';
    };
    var receipt = {
      quiz: document.title,
      student: state.playerName,
      timestamp: new Date().toISOString(),
      totalScore: Number(state.totalScore.toFixed(2)),
      maxScore: Number(state.maxScore.toFixed(2)),
      questions: state.gameChallenges.map(function(ch){
        return {
          number: ch.displayLevel,
          topic: ch.topic,
          yourAnswer: ch.studentAnswer || '',
          status: statusLabel(ch.status),
          score: (typeof ch.earnedScore === 'number') ? Number(ch.earnedScore.toFixed(2)) : (ch.status === 'solved' ? ch.pointsPotential : 0)
        };
      })
    };
    var blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var safe = (state.playerName || 'student').replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'student';
    var a = document.createElement('a');
    a.href = url;
    a.download = 'exam-answers-' + safe + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  } catch (e) {
    showAlert('Sorry, the download could not be created.', false);
  }
}

function renderSidebar(){
  els.sidebar.innerHTML='';
  var solvedCount = 0;
  var totalCount = state.gameChallenges.length;
  var track = document.createElement('div');
  track.className = 'qnav-track';
  var currentPill = null;
  state.gameChallenges.forEach(function(ch,idx){
    var answered = (ch.status === 'solved' || ch.status === 'answered' || ch.status === 'pending' || ch.status === 'partial');
    if (answered) solvedCount++;
    var isCurrent = (idx === state.currentIndex);
    // State conveyed by BOTH data-state colour AND a non-colour glyph + aria-label suffix.
    var dstate, glyph, label;
    if (ch.status === 'solved') { dstate = 'answered'; glyph = '✓'; label = 'answered'; }
    else if (ch.status === 'answered' || ch.status === 'pending' || ch.status === 'partial') { dstate = 'pending'; glyph = '…'; label = 'pending review'; }
    else { dstate = 'open'; glyph = isCurrent ? '•' : ''; label = 'not answered'; }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qpill';
    btn.setAttribute('data-state', dstate);
    if (isCurrent) { btn.setAttribute('aria-current', 'true'); currentPill = btn; }
    btn.setAttribute('aria-label', 'Question ' + ch.displayLevel + ' — ' + (isCurrent ? 'current, ' + label : label));
    btn.innerHTML = '<span class="qpill-num">' + ch.displayLevel + '</span><span class="qpill-mark" aria-hidden="true">' + glyph + '</span>';
    btn.addEventListener('click', function(){ loadChallenge(idx); });
    track.appendChild(btn);
  });
  els.sidebar.appendChild(track);
  var pct = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
  var prog = document.createElement('p');
  prog.className = 'qnav-progress';
  prog.innerHTML = '<span class="qnav-fill" style="width:' + pct + '%"></span><span class="qnav-count">' + solvedCount + ' / ' + totalCount + ' answered</span>';
  els.sidebar.appendChild(prog);
  // On narrow, scroll-snapped rails keep the active question visible without stealing focus.
  if (currentPill && currentPill.scrollIntoView) {
    try { currentPill.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { currentPill.scrollIntoView(); }
  }
}

function loadChallenge(index){
  _cancelSpeech(); // stop any read-aloud from the previous question
  state.currentIndex=index;var ch=state.gameChallenges[index];
  els.cardTopic.textContent=ch.topic;updateQuestionText();
  
  // Auto-graded code carries a numeric earnedScore; lock it like a solved question so the
  // student can't grind repeated submissions after it has been scored.
  var isSolved = ch.status === 'solved' || (ch.type === 'code' && typeof ch.earnedScore === 'number');
  document.getElementById('btn-submit').disabled = isSolved;
  
  els.answerArea.innerHTML = '';
  if (ch.type === 'mcq') {
    var mcqContainer = document.createElement('div');
    mcqContainer.style = 'display:flex;flex-direction:column;gap:12px;';
    var opts = ch.options || [];
    // Options were deterministically ordered once in prepareAttemptChallenges (per-student,
    // stable across navigation); render them as-is rather than re-shuffling on every visit.
    var shuffledOpts = opts.slice();
    shuffledOpts.forEach(function(o){
      var lbl = document.createElement('label');
      lbl.style = 'display:flex;align-items:center;padding:12px 16px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:var(--radius-md);cursor:' + (isSolved ? 'default' : 'pointer') + ';transition:background 0.2s;';
      var r = document.createElement('input');
      r.type = 'radio';
      r.name = 'student-mcq';
      r.value = o.text;
      r.style = 'margin-right:12px;width:18px;height:18px;accent-color:var(--accent-primary);';
      if (isSolved) r.disabled = true;
      if (ch.studentAnswer === o.text) r.checked = true;
      lbl.appendChild(r);
      var spn = document.createElement('span');
      spn.style = 'font-size:15px;color:var(--text-bright);';
      spn.textContent = o.text;
      lbl.appendChild(spn);
      mcqContainer.appendChild(lbl);
    });
    els.answerArea.appendChild(mcqContainer);
  } else if (ch.type === 'code') {
    var container = document.createElement('div');
    container.style = "display:flex; flex-direction:column; gap:10px;";
    
    var editor = document.createElement('textarea');
    editor.style = "width:100%; height:180px; font-family:var(--font-mono); background:rgba(0,0,0,0.1); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px; resize:vertical;";
    editor.placeholder = "Write your " + ch.codeLang + " code here...";
    if (ch.studentAnswer) editor.value = ch.studentAnswer;
    editor.disabled = isSolved;

    var runBtn = document.createElement('button');
    runBtn.textContent = "Run Code";
    runBtn.className = "warning";
    runBtn.style.alignSelf = "flex-start";
    runBtn.disabled = isSolved;

    var outArea;
    if (ch.codeLang === 'html') {
      outArea = document.createElement('iframe');
      // Sandbox the live HTML preview (opaque origin) so a student's markup/scripts run isolated and
      // cannot reach the exam page to read answer hashes or tamper with the score.
      outArea.setAttribute('sandbox', 'allow-scripts');
      outArea.style = "background:#fff; border:1px solid var(--border-color); min-height:200px; border-radius:var(--radius-md); width:100%;";
      if(ch.studentAnswer) outArea.srcdoc = ch.studentAnswer;
    } else {
      outArea = document.createElement('div');
      outArea.style = "background:#050505; color:#a2ca98; padding:12px; font-family:var(--font-mono); border:1px solid var(--border-color); min-height:60px; border-radius:var(--radius-md); font-size:13px; white-space:pre-wrap; max-height:200px; overflow-y:auto;";
      outArea.textContent = isSolved ? "> Code submitted!" : "> Ready to execute.";
    }

    container.appendChild(editor);
    container.appendChild(runBtn);
    container.appendChild(outArea);
    els.answerArea.appendChild(container);

    runBtn.addEventListener('click', function() {
      var code = editor.value;
      try {
        if (ch.codeLang === 'html') {
          outArea.srcdoc = code;
        } else if (ch.codeLang === 'javascript') {
          outArea.textContent = "> Running...";
          var logOutput = [];
          var mockConsole = { log: function() { logOutput.push(Array.from(arguments).join(' ')); } };
          var exec = new Function('console', code);
          exec(mockConsole);
          outArea.textContent = logOutput.length ? "> Console output:\\n" + logOutput.join('\\n') : "> (No console output)";
        } else if (ch.codeLang === 'python') {
          outArea.textContent = "> Running...";
          if (typeof Sk === 'undefined') {
            outArea.textContent = "> Error: Python engine (Skulpt) not loaded.";
            return;
          }
          var output = [];
          Sk.configure({
            output: function(text) { output.push(text); },
            read: function(x) {
              if (Sk.builtinFiles && Sk.builtinFiles['files'][x]) return Sk.builtinFiles['files'][x];
              throw "File not found: '" + x + "'";
            }
          });
          Sk.misceval.asyncToPromise(function() {
            return Sk.importMainWithBody('<stdin>', false, code, true);
          }).then(function() {
            var result = output.join('').trim();
            outArea.textContent = result ? '> ' + result : '> (No output)';
          }).catch(function(err) {
            outArea.textContent = '> Error: ' + (err.toString ? err.toString() : JSON.stringify(err));
          });
        }
      } catch(e) {
        if (ch.codeLang !== 'html') {
          outArea.textContent = "> Execution Error:\\n" + e.toString();
        }
      }
    });
  } else {
    var p = ch.format || 'Enter your exact answer...';
    
    var attachmentHtml = '';
    if (ch.attachment && ch.attachment.data && /^(data:|blob:)/i.test(String(ch.attachment.data))) {
      attachmentHtml = '<div style="margin-bottom:20px;padding:16px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:12px;overflow:hidden;">' +
        '<div style="width:36px;height:36px;flex-shrink:0;border-radius:8px;background:rgba(88,166,255,.1);display:flex;align-items:center;justify-content:center;color:var(--accent-primary);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></div>' +
        '<div style="overflow:hidden;"><div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text-bright);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(ch.attachment.name) + '</div><div style="font-size:10px;color:var(--text-muted);">' + escHtml(ch.attachment.type || 'Attached File') + '</div></div>' +
        '</div>' +
        '<a href="' + escHtml(ch.attachment.data) + '" download="' + escHtml(ch.attachment.name) + '" style="flex-shrink:0;padding:8px 14px;background:var(--accent-primary);color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-weight:700;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:6px;transition:all .2s;box-shadow:0 0 15px rgba(88,166,255,.2);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download</a>' +
        '</div>';
    }

    // Slotted mode only when this question carries an answerMask; otherwise byte-identical to the
    // legacy wrapper so the trailing-underscore caret path is untouched.
    var slotted = !!ch.answerMask;
    var inputHtml = '<input type="text" id="flag-input" autocomplete="off" spellcheck="false" placeholder="'+escHtml(p)+'">';
    var wrapperHtml = slotted
      ? '<div class="flag-input-wrapper is-slotted">' + inputHtml + '<span class="slot-row" id="slot-row" aria-hidden="true"></span></div>'
      : '<div class="flag-input-wrapper">' + inputHtml + '<span class="flag-caret" aria-hidden="true">_</span></div>';
    els.answerArea.innerHTML = attachmentHtml + wrapperHtml +
      (ch.hint ? '<div style="margin-top:12px;text-align:center;"><span style="font-size:13px;padding:6px 14px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:6px;color:var(--text-bright);box-shadow:inset 0 1px 3px rgba(0,0,0,0.2);">💡 Hint: ' + escHtml(ch.hint) + '</span></div>' : '');
    var fi = document.getElementById('flag-input');
    if (isSolved) {
      // Slotted keeps the real submitted characters visible in the slots; legacy shows the marker.
      fi.value = slotted ? (ch.studentAnswer || '') : '[Already Solved]';
      fi.disabled = true;
    } else { fi.value = ch.studentAnswer || ''; fi.focus(); }
    ${lockCopyPaste ? "fi.addEventListener('paste',function(e){e.preventDefault();});" : ""}
    fi.addEventListener('keypress',function(e){if(e.key==='Enter')document.getElementById('btn-submit').click();});
    if (slotted) {
      // The real input holds the true value (grading/a11y unchanged); the aria-hidden .slot-row
      // draws one span per mask position: typed char, waiting '_', wider word gap, or the blinking
      // current '_'. maxLength hard-caps typing to the shape so it can never overflow.
      var mask = ch.answerMask;
      var slotRow = document.getElementById('slot-row');
      fi.maxLength = mask.length;
      var renderSlots = function(){
        var val = fi.value;
        slotRow.textContent = '';
        // "current" = first index at/after the typed length that is not a space
        var cur = val.length;
        while (cur < mask.length && mask.charAt(cur) === ' ') cur++;
        for (var i = 0; i < mask.length; i++){
          var s = document.createElement('span');
          s.className = 'slot';
          if (mask.charAt(i) === ' ') { s.className += ' slot--space'; }
          else if (i < val.length) { s.className += ' slot--filled'; s.textContent = val.charAt(i); }
          else if (i === cur) { s.className += ' slot--current'; s.textContent = '_'; }
          else { s.className += ' slot--empty'; s.textContent = '_'; }
          slotRow.appendChild(s);
        }
      };
      fi.addEventListener('input', renderSlots);
      fi.addEventListener('focus', renderSlots);
      fi.addEventListener('blur', renderSlots);
      renderSlots(); // seed for restored studentAnswer / disabled-solved state
    } else {
      // Drive the decorative underscore caret: --caret-x is the input's left offset (captures the '>' prompt
      // width + gap for free), --caret-len is the char count. CSS turns these into a 1ch-stepped position.
      var caretWrap = fi.parentElement;
      var syncCaret = function(){
        caretWrap.style.setProperty('--caret-x', fi.offsetLeft);
        caretWrap.style.setProperty('--caret-len', fi.value.length);
        // Once the typed value scrolls the field, the ch math drifts; fall back to the native caret.
        caretWrap.classList.toggle('is-overflowing', fi.scrollWidth > fi.clientWidth + 1);
      };
      fi.addEventListener('input', syncCaret);
      fi.addEventListener('focus', syncCaret);
      fi.addEventListener('blur', syncCaret);
      fi.addEventListener('keyup', syncCaret);
      syncCaret(); // seed position for the restored/placeholder value before first input
    }
  }

  renderSidebar();
  // Orient screen-reader users: move focus to the question heading whenever it changes.
  if (els.cardText && els.cardText.focus) { try { els.cardText.focus(); } catch (e) {} }
  saveAttempt(); // persist the new current index so a resume lands on the right question
}

// Auto-scoring for code answers. Resolves to a number of points in [0, pointsPotential],
// or null when the question is manual/unconfigured (caller falls back to instructor review).
// Grading must never throw out of here: any failure resolves 0 so a broken submission still
// completes the flow. Python "tests" mode relies on teachers calling check(cond, msg); the
// harness reads the resulting _qm_passed / _qm_total from Sk.globals (best-effort).
function runAndGradeCode(ch, code) {
  return new Promise(function(resolve){
    try {
      var cg = ch.codeGrade;
      if (!cg || !cg.mode || cg.mode === 'manual') { resolve(null); return; }
      var lang = ch.codeLang;
      var points = ch.pointsPotential || 0;

      // ── Sandboxed JS execution ───────────────────────────────────
      // Author tests/reference and student JS run in a Web Worker: a separate thread with NO DOM,
      // NO localStorage/cookies, and NO access to this page — so a malicious shared exam cannot read
      // the student's data or phish, and an infinite loop is killed by terminate() on timeout.
      // (Only the two newline literals need double-backslashes for the outer exam template.)
      function _workerBody(){
        self.onmessage = function(e){
          var d = e.data || {}, r = {};
          try {
            if (d.op === 'output') {
              var L = [];
              var mc = { log: function(){ L.push(Array.prototype.slice.call(arguments).join(' ')); } };
              (new Function('console', d.code))(mc);
              r.output = L.join('\\n');
            } else if (d.op === 'tests') {
              var t = 0, p = 0, assert = function(c){ t++; if (c) p++; };
              (new Function('assert', d.code + '\\n;\\n' + d.tests))(assert);
              r.passed = p; r.total = t;
            }
          } catch (err) { r.error = String(err); }
          self.postMessage(r);
        };
      }
      function _runJs(op, data, timeoutMs){
        return new Promise(function(resolve){
          var worker = null, url = null, timer = null, done = false;
          function fin(res){ if (done) return; done = true; try { clearTimeout(timer); } catch(e){} if (worker){ try { worker.terminate(); } catch(e){} } if (url){ try { URL.revokeObjectURL(url); } catch(e){} } resolve(res); }
          try {
            if (typeof Worker === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) { fin({ error: 'no-worker' }); return; }
            url = URL.createObjectURL(new Blob(['(' + _workerBody.toString() + ')()'], { type: 'application/javascript' }));
            worker = new Worker(url);
            worker.onmessage = function(e){ fin(e.data || {}); };
            worker.onerror = function(){ fin({ error: 'no-worker' }); }; // e.g. some file:// contexts block blob workers
            timer = setTimeout(function(){ fin({ error: 'timeout' }); }, timeoutMs);
            data = data || {}; data.op = op;
            worker.postMessage(data);
          } catch (e) { fin({ error: 'no-worker' }); }
        });
      }

      // Sandboxed HTML grading: render student/reference HTML in a sandbox="allow-scripts" iframe
      // (opaque origin — its scripts and the author's assertions cannot reach this page), read the
      // rendered text and run the tests INSIDE it, results returned via postMessage; timeout removes it.
      function _htmlHarness(){
        window.addEventListener('message', function(ev){
          var d = ev.data || {};
          if (!d || !d.__qmRun) return;
          var out = '';
          try { out = document.body ? (document.body.innerText || document.body.textContent || '') : ''; } catch(e) {}
          var t = 0, p = 0;
          try {
            if (d.tests) { var assert = function(c){ t++; if (c) p++; }; (new Function('doc', 'assert', d.tests))(document, assert); }
          } catch(e) {}
          try { (ev.source || parent).postMessage({ __qmHtml: 1, output: out, passed: p, total: t }, '*'); } catch(e) {}
        });
        try { parent.postMessage({ __qmReady: 1 }, '*'); } catch(e) {}
      }
      function _runHtml(htmlCode, htmlTests, timeoutMs){
        return new Promise(function(resolve){
          var iframe = null, timer = null, onMsg = null, done = false;
          function fin(res){ if (done) return; done = true; try { clearTimeout(timer); } catch(e){} if (onMsg){ try { window.removeEventListener('message', onMsg); } catch(e){} } if (iframe){ try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch(e){} } resolve(res || {}); }
          try {
            iframe = document.createElement('iframe');
            iframe.setAttribute('sandbox', 'allow-scripts'); // no allow-same-origin -> opaque origin
            iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:-9999px;';
            onMsg = function(ev){
              if (!iframe || ev.source !== iframe.contentWindow) return;
              var d = ev.data || {};
              if (d.__qmReady) { try { iframe.contentWindow.postMessage({ __qmRun: 1, tests: htmlTests || '' }, '*'); } catch(e){} return; }
              if (d.__qmHtml) { fin({ output: d.output, passed: d.passed, total: d.total }); }
            };
            window.addEventListener('message', onMsg);
            timer = setTimeout(function(){ fin({ error: 'timeout' }); }, timeoutMs);
            // Close tag built as '<' + '/script>' so no literal </script> can truncate this string.
            iframe.srcdoc = String(htmlCode == null ? '' : htmlCode) + '<script>(' + _htmlHarness.toString() + ')()<' + '/script>';
            document.body.appendChild(iframe);
          } catch(e){ fin({ error: String(e) }); }
        });
      }

      var normalize = function(s){
        s = String(s == null ? '' : s);
        if (cg.normalize) { s = s.toLowerCase().replace(/\\s+/g, ' ').trim(); }
        return s;
      };

      // Capture stdout/rendered text per language as a Promise<string>.
      var captureOutput = function(src){
        src = (src == null ? code : src);
        return new Promise(function(res, rej){
          try {
            if (lang === 'javascript') {
              _runJs('output', { code: src }, 4000).then(function(rr){
                if (rr && rr.error === 'no-worker') {
                  try {
                    var logOutput = [];
                    var mockConsole = { log: function(){ logOutput.push(Array.from(arguments).join(' ')); } };
                    (new Function('console', src))(mockConsole);
                    res(logOutput.join('\\n'));
                  } catch (e) { rej(e); }
                  return;
                }
                res((rr && typeof rr.output === 'string') ? rr.output : '');
              });
            } else if (lang === 'python') {
              if (typeof Sk === 'undefined') { rej(new Error('Skulpt not loaded')); return; }
              var out = [];
              Sk.configure({
                output: function(t){ out.push(t); },
                read: function(x){
                  if (Sk.builtinFiles && Sk.builtinFiles['files'][x]) return Sk.builtinFiles['files'][x];
                  throw "File not found: '" + x + "'";
                }
              });
              Sk.execLimit = 5000; // bound Python execution so an infinite loop can't freeze the exam
              Sk.misceval.asyncToPromise(function(){
                return Sk.importMainWithBody('<stdin>', false, src, true);
              }).then(function(){ res(out.join('')); }).catch(function(e){ rej(e); });
            } else {
              // HTML: render in a sandboxed (opaque-origin) iframe and read its text via postMessage.
              _runHtml(src, '', 4000).then(function(rr){ res((rr && typeof rr.output === 'string') ? rr.output : ''); });
            }
          } catch(e) { rej(e); }
        });
      };

      // ── Reference-similarity grading (offline "ML-lite") ─────────
      // Blend token cosine + normalized edit-distance + gzip normalized-compression-distance of the
      // student's code AND its output against a teacher reference. No backslash escapes below (the
      // [a-z0-9_] class avoids needing \\w) so nothing corrupts the outer exam template literal.
      var _tok = function(s){ return (String(s == null ? '' : s).toLowerCase().match(/[a-z0-9_]+/g)) || []; };
      var _cosine = function(a, b){
        var A = _tok(a), B = _tok(b), k;
        if (!A.length && !B.length) return 1;
        if (!A.length || !B.length) return 0;
        var fa = {}, fb = {};
        A.forEach(function(t){ fa[t] = (fa[t] || 0) + 1; });
        B.forEach(function(t){ fb[t] = (fb[t] || 0) + 1; });
        var dot = 0, na = 0, nb = 0;
        for (k in fa){ na += fa[k] * fa[k]; if (fb[k]) dot += fa[k] * fb[k]; }
        for (k in fb){ nb += fb[k] * fb[k]; }
        return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      };
      var _normLev = function(a, b){
        a = String(a == null ? '' : a).slice(0, 400);
        b = String(b == null ? '' : b).slice(0, 400);
        if (a === b) return 1;
        var m = a.length, n = b.length;
        if (!m || !n) return (!m && !n) ? 1 : 0;
        var prev = [], cur = [], i, j;
        for (j = 0; j <= n; j++) prev[j] = j;
        for (i = 1; i <= m; i++){
          cur[0] = i;
          for (j = 1; j <= n; j++){
            var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
          }
          for (j = 0; j <= n; j++) prev[j] = cur[j];
        }
        return 1 - (prev[n] / Math.max(m, n));
      };
      var _gzipLen = function(str){
        return new Promise(function(res){
          try {
            if (typeof CompressionStream === 'undefined') { res(null); return; }
            var stream = new Blob([String(str)]).stream().pipeThrough(new CompressionStream('gzip'));
            new Response(stream).arrayBuffer().then(function(buf){ res(buf.byteLength); }).catch(function(){ res(null); });
          } catch (e) { res(null); }
        });
      };
      var _ncdSim = function(a, b){
        return Promise.all([_gzipLen(a), _gzipLen(b), _gzipLen(String(a) + String(b))]).then(function(v){
          var ca = v[0], cb = v[1], cab = v[2];
          if (ca == null || cb == null || cab == null) return null; // gzip unavailable: skip this metric
          var ncd = (cab - Math.min(ca, cb)) / Math.max(ca, cb);
          return Math.max(0, Math.min(1, 1 - ncd));
        });
      };
      var _similarity = function(a, b){
        var cos = _cosine(a, b), lev = _normLev(a, b);
        return _ncdSim(a, b).then(function(ncd){
          var parts = [cos, lev];
          if (ncd != null) parts.push(ncd);
          var sum = 0; parts.forEach(function(p){ sum += p; });
          return sum / parts.length;
        });
      };

      if (cg.mode === 'similarity') {
        var reference = cg.reference || '';
        if (!reference) { resolve(0); return; }
        Promise.all([
          captureOutput(code).catch(function(){ return ''; }),
          captureOutput(reference).catch(function(){ return ''; })
        ]).then(function(outs){
          var rOut = outs[1];
          var hasOut = !!(rOut && String(rOut).trim().length);
          _similarity(outs[0], rOut).then(function(outSim){
            _similarity(code, reference).then(function(codeSim){
              // Output similarity dominates when the reference produced output; else fall back to code.
              var sim = hasOut ? (0.7 * outSim + 0.3 * codeSim) : codeSim;
              sim = Math.max(0, Math.min(1, sim));
              var earned = sim >= 0.98 ? points : (sim <= 0.4 ? 0 : points * sim);
              resolve(Math.round(earned * 100) / 100);
            });
          });
        }).catch(function(){ resolve(0); });
        return;
      }

      if (cg.mode === 'output') {
        captureOutput().then(function(rawOut){
          var got = normalize(rawOut);
          var exp = normalize(cg.expected);
          var pass = false;
          if (cg.match === 'exact') { pass = got === exp; }
          else if (cg.match === 'regex') {
            try { var _pat = String(cg.expected || ''); pass = _pat.length <= 1000 && new RegExp(_pat).test(String(rawOut == null ? '' : rawOut).slice(0, 20000)); }
            catch(e) { pass = false; } // invalid teacher regex never crashes grading
          } else { pass = got.indexOf(exp) > -1; } // 'contains' is the default
          resolve(pass ? points : 0);
        }).catch(function(){ resolve(0); });
        return;
      }

      // ── tests mode ──────────────────────────────────────────────
      var tests = cg.tests || '';

      if (lang === 'javascript') {
        // student code + teacher assertions run in a Worker (sandboxed, timeout-terminated).
        _runJs('tests', { code: code, tests: tests }, 4000).then(function(rr){
          if (rr && rr.error === 'no-worker') {
            var total = 0, passed = 0, assert = function(cond){ total++; if (cond) passed++; };
            try { (new Function('assert', code + '\\n;\\n' + tests))(assert); } catch(e) {}
            resolve(total > 0 ? (passed / total) * points : 0);
            return;
          }
          var t = (rr && rr.total) || 0, p = (rr && rr.passed) || 0;
          resolve(t > 0 ? (p / t) * points : 0);
        });
        return;
      }

      if (lang === 'html') {
        // Student HTML + author assertions run INSIDE the sandboxed opaque-origin iframe.
        _runHtml(code, tests, 4000).then(function(rr){
          var t = (rr && rr.total) || 0, p = (rr && rr.passed) || 0;
          resolve(t > 0 ? (p / t) * points : 0);
        });
        return;
      }

      if (lang === 'python') {
        if (typeof Sk === 'undefined') { resolve(0); return; }
        // assert is a Python keyword, so teachers use check(cond, msg); counters live in module
        // globals we read back from Sk.globals after the run.
        var preamble = '_qm_passed = 0\\n_qm_total = 0\\n' +
          'def check(cond, msg=""):\\n' +
          '    global _qm_passed, _qm_total\\n' +
          '    _qm_total += 1\\n' +
          '    if cond:\\n' +
          '        _qm_passed += 1\\n';
        var full = preamble + '\\n' + code + '\\n' + tests + '\\n';
        Sk.configure({
          output: function(){},
          read: function(x){
            if (Sk.builtinFiles && Sk.builtinFiles['files'][x]) return Sk.builtinFiles['files'][x];
            throw "File not found: '" + x + "'";
          }
        });
        Sk.execLimit = 5000; // bound Python execution so an infinite loop can't freeze the exam
        Sk.misceval.asyncToPromise(function(){
          return Sk.importMainWithBody('<stdin>', false, full, true);
        }).then(function(){
          var t = 0, p = 0;
          try {
            var g = Sk.globals || {};
            if (g['_qm_total'] && typeof g['_qm_total'].v !== 'undefined') t = Number(g['_qm_total'].v);
            if (g['_qm_passed'] && typeof g['_qm_passed'].v !== 'undefined') p = Number(g['_qm_passed'].v);
          } catch(e) {}
          resolve(t > 0 ? (p / t) * points : 0);
        }).catch(function(){ resolve(0); });
        return;
      }

      resolve(0);
    } catch(e) { resolve(0); }
  });
}

function proceedToNext(){
  var nextIdx=state.gameChallenges.findIndex(function(c,i){return i>state.currentIndex&&c.status!=='solved';});
  if(nextIdx!==-1){loadChallenge(nextIdx);}
  else{loadChallenge(state.currentIndex);}
}

document.getElementById('btn-submit').addEventListener('click',function(){
  var ch=state.gameChallenges[state.currentIndex];
  if(ch.status==='solved') return showAlert('Already solved.', true);
  
  var ans = '';
  if (ch.type === 'mcq') {
    var selected = document.querySelector('input[name="student-mcq"]:checked');
    if (!selected) return showAlert('Please select an option.', false);
    ans = selected.value;
    ch.studentAnswer = ans;
    ch.status = 'answered'; // Manual/Deferred Grading
    showAlert('Answer recorded.', true);
    document.getElementById('btn-submit').disabled = true;
    saveAttempt();
    setTimeout(proceedToNext, 800);
  } else if (ch.type === 'code') {
    var editor = document.querySelector('textarea');
    if (!editor || !editor.value.trim()) return showAlert('Please write some code before submitting.', false);
    ans = editor.value;
    ch.studentAnswer = ans;
    if (ch.codeGrade && ch.codeGrade.mode && ch.codeGrade.mode !== 'manual') {
      // Auto-graded: block re-submission while grading, keep the message neutral so pass/fail
      // is never leaked mid-exam.
      document.getElementById('btn-submit').disabled = true;
      runAndGradeCode(ch, ans).then(function(earned){
        var pts = (typeof earned === 'number') ? earned : 0;
        ch.earnedScore = pts;
        ch.status = pts >= ch.pointsPotential ? 'solved' : (pts > 0 ? 'partial' : 'incorrect');
        showAlert('Code submitted and evaluated.', true);
        saveAttempt();
        setTimeout(proceedToNext, 800);
      });
    } else {
      ch.status = 'pending'; // Manual Grading
      showAlert('Code saved for review.', true);
      document.getElementById('btn-submit').disabled = true;
      saveAttempt();
      setTimeout(proceedToNext, 800);
    }
  } else {
    ans = document.getElementById('flag-input').value;
    ch.studentAnswer = ans;
    if(verifyHash(ans, ch.hash)) {
      state.totalScore+=ch.pointsPotential;
      ch.status='solved';
      showAlert('Answer accepted.',true);
      saveAttempt();
      setTimeout(proceedToNext,800);
      document.getElementById('btn-submit').disabled = true;
      document.getElementById('flag-input').disabled = true;
    }
    else {
      showAlert('Incorrect answer. Try again.',false);
    }
  }
});

function finishTest(){
  var elapsed=Date.now()-state.startTime;
  state.examActive = false; // attempt is over: releases the beforeunload guard
  clearAttempt(); // the attempt is complete: drop the saved resume state

  // 1. Calculate Score BEFORE rendering
  state.totalScore = 0;
  state.gameChallenges.forEach(function(ch){
    if (ch.type === 'mcq' && ch.status === 'answered') {
      if (verifyHash(ch.studentAnswer, ch.hash)) {
        ch.status = 'solved';
        state.totalScore += ch.pointsPotential;
      } else {
        ch.status = 'incorrect';
      }
    } else if (typeof ch.earnedScore === 'number') {
      // Auto-graded code: use the exact points awarded (covers solved/partial/incorrect).
      state.totalScore += ch.earnedScore;
    } else if (ch.status === 'solved') {
      state.totalScore += ch.pointsPotential;
    }
  });

  // 2. Build Results HTML with score circle + details
  var scorePercent = state.maxScore > 0 ? Math.round((state.totalScore / state.maxScore) * 100) : 0;
  var gradeColor = scorePercent >= 80 ? 'var(--accent-success)' : scorePercent >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)';

  // Report how many times the student left the exam window (exam mode only) so the instructor can see it.
  var showFocusRow = ${examMode ? 'true' : 'false'};
  var focusRowHtml = '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Left Exam Window</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">' + state.focusLossCount + ' time(s)</td></tr>';

  var resHTML = '<div class="score-circle" style="border:3px solid ' + gradeColor + ';box-shadow:0 0 30px rgba(0,0,0,.3);">' +
    '<span class="score-val" style="color:' + gradeColor + ';">' + scorePercent + '%</span>' +
    '<span class="score-lbl">Score</span></div>';

  resHTML += '<div style="display:flex;justify-content:center;margin-bottom:24px;">' +
    '<table style="width:100%;max-width:450px;border-collapse:collapse;background:var(--panel-hover);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md);">' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;width:50%;">Student</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">'+escHtml(state.playerName)+'</td></tr>' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Attempts</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">'+(state.attempts||1)+'</td></tr>' +
    (showFocusRow ? focusRowHtml : '') +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Time Elapsed</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">'+formatTime(elapsed)+'</td></tr>' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Final Score</th><td id="final-score-display" style="padding:14px 20px;text-align:right;font-weight:600;color:' + gradeColor + ';font-size:16px;">'+Number(state.totalScore.toFixed(2))+' / '+Number(state.maxScore.toFixed(2))+' pts</td></tr>' +
    '</table></div>';

  resHTML += '<div style="margin-top:24px;text-align:left;"><h3 style="font-size:18px;margin-bottom:12px;color:var(--text-bright);border-bottom:1px solid var(--border-color);padding-bottom:8px;">Detailed Results</h3>' +
    '<div style="max-height:400px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-md);box-shadow:0 10px 30px rgba(0,0,0,0.2);background:var(--panel-hover);">' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;text-align:left;">' +
    '<thead style="position:sticky;top:0;background:var(--panel-bg);box-shadow:0 1px 0 var(--border-color);z-index:10;">' +
      '<tr><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:8%">#</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:27%">Topic</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:45%">Your Answer</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:20%">Status</th></tr>' +
    '</thead><tbody>';
  
  // 3. Define Grading Logic in global scope (for onclick)
  // Event is passed explicitly: the implicit global event is non-standard and undefined in Firefox/Safari.
  window._markCorrect = function(ev, id) {
    var c = state.gameChallenges.find(function(x){return x.id === id;});
    if(c && c.status === 'pending'){
      c.status='solved'; state.totalScore+=c.pointsPotential;
      var scoreEl = document.getElementById('final-score-display');
      if(scoreEl) scoreEl.textContent = Number(state.totalScore.toFixed(2)) + ' pts';
      var txt = document.getElementById('status-text-'+id);
      if(txt) txt.outerHTML = '<span style="color:var(--accent-success)">● Correct</span>';
      var evTarget = ev.target || ev.srcElement;
      if(evTarget && evTarget.closest('div')) evTarget.closest('div').style.display='none';
    }
  };
  window._markWrong = function(ev, id) {
    var c = state.gameChallenges.find(function(x){return x.id === id;});
    if(c && c.status === 'pending'){
      c.status='incorrect';
      var txt = document.getElementById('status-text-'+id);
      if(txt) txt.outerHTML = '<span style="color:var(--accent-danger)">○ Incorrect</span>';
      var evTarget = ev.target || ev.srcElement;
      if(evTarget && evTarget.closest('div')) evTarget.closest('div').style.display='none';
    }
  };

  state.gameChallenges.forEach(function(ch){
    var statusIcon;
    var gradingActions = '';
    if (ch.status === 'solved') {
      statusIcon = '<span style="color:var(--accent-success)">● Correct</span>';
    } else if (ch.status === 'pending') {
      statusIcon = '<span style="color:var(--accent-warning)" id="status-text-'+Number(ch.id)+'">● Pending Grading</span>';
      // Grading controls are instructor-only. Never expose them to the student; they render
      // only when a teacher password is set (and then only inside the unlocked results view).
      gradingActions = TEACHER_PASS_HASH ? '<div style="margin-top:6px;display:flex;gap:4px;"><button class="success" style="padding:2px 6px;font-size:11px;" onclick="window._markCorrect(event, '+Number(ch.id)+')">✔</button><button class="danger" style="padding:2px 6px;font-size:11px;" onclick="window._markWrong(event, '+Number(ch.id)+')">✖</button></div>' : '';
    } else if (ch.status === 'partial') {
      statusIcon = '<span style="color:var(--accent-warning)">◐ Partial (' + Number((ch.earnedScore || 0).toFixed(2)) + ' / ' + Number((ch.pointsPotential || 0).toFixed(2)) + ' pts)</span>';
    } else if (ch.status === 'incorrect' || ch.status === 'answered') {
      statusIcon = '<span style="color:var(--accent-danger)">○ Incorrect</span>';
    } else {
      statusIcon = '<span style="color:var(--text-muted)">○ Unsolved</span>';
    }
    
    resHTML += '<tr style="border-bottom:1px solid var(--border-color);">' +
      '<td style="padding:12px 16px;font-weight:600;color:var(--text-bright);">' + ch.displayLevel + '</td>' +
      '<td style="padding:12px 16px;">' + escHtml(ch.topic) + '</td>' +
      '<td style="padding:12px 16px;"><div style="font-family:var(--font-mono);font-size:12px;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;white-space:pre-wrap;max-height:120px;overflow-y:auto;">' + (ch.studentAnswer ? escHtml(ch.studentAnswer) : '<i style="color:var(--text-muted)">No Answer Provided</i>') + '</div></td>' +
      '<td style="padding:12px 16px;">' + statusIcon + gradingActions + '</td>' +
      '</tr>';
  });
  
  resHTML += '</tbody></table></div></div>';
  if (ALLOW_RETAKE) {
    resHTML += '<button class="primary" id="btn-reset" style="width:100%;margin-top:16px">Retake Exam</button>';
  }
    
  var resultModal = document.querySelector('#result-screen .modal-box');

  // Always offered, and placed OUTSIDE the teacher-gated container so the student can save their
  // own receipt even when detailed results stay locked behind the instructor password.
  var downloadBtnHtml = '<div style="margin:14px 0;"><button id="btn-download-answers" style="background:var(--panel-hover);color:var(--text-bright);border:1px solid var(--border-color);">Download my answers</button></div>';

  if (TEACHER_PASS_HASH) {
    resultModal.innerHTML = '<h1>Exam Complete</h1>' + downloadBtnHtml +
      '<div id="teacher-auth-area" style="margin-top:20px;padding:24px;background:var(--workspace-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);">' +
      '<h3 style="color:var(--text-bright);margin-bottom:8px;">Instructor Review Required</h3>' +
      '<p style="color:var(--text-muted);margin-bottom:16px;font-size:14px;">Please ask your instructor to unlock the detailed results and grading controls.</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<input type="password" id="teacher-unlock-pass" placeholder="Teacher Password" style="padding:10px 14px;background:var(--input-bg);border:1px solid var(--border-color);color:var(--text-main);border-radius:4px;width:220px;font-family:var(--font-mono);">' +
      '<button class="primary" id="btn-unlock-results">Unlock Results</button>' +
      '</div><div id="teacher-unlock-error" style="color:var(--accent-danger);font-size:12px;margin-top:10px;display:none;">Incorrect password.</div></div>' +
      '<div id="detailed-results-container" style="display:none;width:100%;">' + resHTML + '</div>';
      
    document.getElementById('btn-unlock-results').addEventListener('click', function() {
      var p = document.getElementById('teacher-unlock-pass').value;
      if (verifyHash(p, TEACHER_PASS_HASH)) {
        document.getElementById('teacher-auth-area').style.display = 'none';
        document.getElementById('detailed-results-container').style.display = 'block';
        var resetBtn = document.getElementById('btn-reset');
        if (resetBtn) resetBtn.addEventListener('click', resetToStart);
      } else {
        document.getElementById('teacher-unlock-error').style.display = 'block';
        document.getElementById('teacher-unlock-pass').value = '';
      }
    });
    
    // Allow pressing enter on password field
    document.getElementById('teacher-unlock-pass').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') document.getElementById('btn-unlock-results').click();
    });

  } else {
    resultModal.innerHTML = '<h1>Exam Complete</h1>' + downloadBtnHtml + resHTML;
    var resetBtn = document.getElementById('btn-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetToStart);
  }

  // Wire the receipt button (present in both branches, visible before any teacher unlock).
  var dlBtn = document.getElementById('btn-download-answers');
  if (dlBtn) dlBtn.addEventListener('click', downloadAnswers);

  document.getElementById('confirm-modal').style.display='none';
  showScreen('result');
  if (_autosaveInterval) {
    clearInterval(_autosaveInterval);
    _autosaveInterval = null;
  }
  ${enableTimer ? `
  if (_examTimerInterval) {
    clearInterval(_examTimerInterval);
    _examTimerInterval = null;
  }
  ` : ''}
  
  // Dismiss the focus reminder now that the attempt is over.
  ${examMode ? `
  if (_focusNotice) { _focusNotice.style.display = 'none'; }
  ` : ''}
}

document.getElementById('btn-early-finish').addEventListener('click',function(){
  var m=document.getElementById('confirm-modal');
  m.style.display='flex';
});
document.getElementById('btn-confirm-no').addEventListener('click',function(){
  document.getElementById('confirm-modal').style.display='none';
});
document.getElementById('btn-confirm-yes').addEventListener('click',finishTest);

// Guard against accidental loss: warn on reload/close only while an attempt is in progress.
window.addEventListener('beforeunload', function(e) {
  if (state.examActive) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

// Periodic save captures in-progress typing that has not been submitted yet. Never runs in the
// teacher preview iframe, and its id is cleared in finishTest so it does not outlive the attempt.
if (!PREVIEW) {
  _autosaveInterval = setInterval(function(){ saveAttempt(); }, 5000);
}

// On load, offer to resume an unfinished attempt for this quiz (never in preview).
maybePromptResume();
})();`;
  }

})();
