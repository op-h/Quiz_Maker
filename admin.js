(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────
  let localChallenges = [];

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

  // ─── Init ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('__ctf_exam_builder');
    if (saved) {
      try { localChallenges = JSON.parse(saved); } catch (e) { localChallenges = []; }
    }
    renderTable();
    showSection('list-section');
  });

  // ─── Navigation ──────────────────────────────────────────────
  function showSection(id) {
    ['list-section', 'editor-section', 'settings-section'].forEach(s => {
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
      } else if (btnId === 'nav-settings') {
        showSection('settings-section');
      } else {
        renderTable();
        showSection('list-section');
      }
    });
  });

  // ─── Table ───────────────────────────────────────────────────
  function renderTable() {
    const tbody = $('challenges-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    [...localChallenges].sort((a, b) => a.id - b.id).forEach(ch => {
      const tr = document.createElement('tr');
      const typeLabel = ch.type === 'mcq' ? 'MCQ' : (ch.type === 'code' ? 'Code' : 'Text');
      const typeClass = ch.type === 'mcq' ? 'mcq' : (ch.type === 'code' ? 'code' : '');
      const hashDisplay = ch.type === 'code' ? '<i style="color:var(--text-muted)">Verifier Script Attached</i>' : `<span style="color:var(--text-muted);font-size:12px">Hashed: ${ch.hash ? ch.hash.substring(0, 8) : 'none'}...</span>`;
      
      tr.innerHTML = `
        <td>${ch.id}</td>
        <td>
          <div style="font-weight:600;color:var(--text-bright);margin-bottom:4px;">${escHtml(ch.topic)}</div>
          <span class="type-badge ${typeClass}">${typeLabel}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(${ch.points || 10} pts)</span>
        </td>
        <td style="white-space: pre-wrap; font-size:13px; line-height:1.5;">${escHtml(ch.q)}</td>
        <td>${hashDisplay}</td>
        <td>
          <div class="actions">
            <button class="warning" style="font-size:11px;padding:6px 10px;justify-content:center;" onclick="window._editCh(${ch.id})">Edit</button>
            <button class="danger"  style="font-size:11px;padding:6px 10px;justify-content:center;" onclick="window._delCh(${ch.id})">Delete</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // ─── Editor Logic & Dynamic Forms ────────────────────────────
  
  function updateDynamicForm() {
    const type = $('edit-type').value;
    ['part-text', 'part-mcq', 'part-code'].forEach(id => $(id).style.display = 'none');
    $('part-' + type).style.display = 'flex';
  }
  if($('edit-type')) $('edit-type').addEventListener('change', updateDynamicForm);

  function addMcqOption(val = '', isCorrect = false) {
    const container = $('mcq-options-list');
    const row = document.createElement('div');
    row.className = 'mcq-option-row';
    const rId = Math.random().toString(36).substr(2, 5);
    row.innerHTML = `
      <input type="radio" name="mcq-correct" value="${rId}" ${isCorrect ? 'checked' : ''} title="Mark as correct answer">
      <input type="text" class="mcq-val" placeholder="Option text" value="${escHtml(val)}">
      <button class="mcq-remove-btn" type="button" title="Remove Option">✕</button>
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
        $('edit-code-verify').value = ch.codeVerify || '';
      } else {
        $('edit-answer-text').value = '';
        $('edit-answer-text').placeholder = 'Leave blank to keep current answer';
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
      $('edit-code-verify').value = '';
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
    if (!confirm('Delete Question #' + id + '?')) return;
    localChallenges = localChallenges.filter(c => c.id !== id);
    saveToStorage();
    renderTable();
    showAlert('Question #' + id + ' deleted.', true);
  };

  $('btn-cancel-edit').addEventListener('click', () => {
    showSection('list-section');
    renderTable();
    document.querySelectorAll('.admin-sidebar-nav button').forEach(b => b.classList.remove('active'));
    $('nav-list').classList.add('active');
  });

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
    let newHash = existing ? existing.hash : null;
    let newAnsLen = existing ? (existing.ansLen || 1) : 1;
    let format = '';
    let optionsData = [];
    let codeLang = '';
    let codeVerify = '';

    if (qType === 'text') {
      const ans = $('edit-answer-text').value.trim();
      if (!existing && !ans) return alert('An answer is required for new Text questions.');
      if (ans) {
        newHash = window.CTF_DATA.encodeInput(ans);
        // Replace non-space characters with dash
        format = ans.split('').map(c => c === ' ' ? ' ' : '-').join('');
        newAnsLen = ans.length;
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
      codeVerify = $('edit-code-verify').value.trim();
      // Verification script no longer strictly required for manual grading
      newHash = 'code_challenge_manual_verify';
      newAnsLen = 0;
      format = 'Code Execution / Sandbox';
    }

    const updated = { 
      id: newId, points, topic, type: qType, q: qEn, qAr, 
      format, hint, hash: newHash, ansLen: newAnsLen,
      options: qType === 'mcq' ? optionsData : undefined,
      codeLang: qType === 'code' ? codeLang : undefined,
      codeVerify: qType === 'code' ? codeVerify : undefined
    };

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
    localStorage.setItem('__ctf_exam_builder', JSON.stringify(localChallenges));
  }

  // ─── Reset ───────────────────────────────────────────────────
  $('btn-reset-default').addEventListener('click', () => {
    if (!confirm('Clear ALL questions from the builder? This cannot be undone.')) return;
    localStorage.removeItem('__ctf_exam_builder');
    localChallenges = [];
    renderTable();
    showAlert('Builder cleared.', true);
  });

  // ─── Generate exam file ───────────────────────────────────────
  $('btn-create-quiz').addEventListener('click', async () => {
    const btn = $('btn-create-quiz');
    if (localChallenges.length === 0) {
      return alert('Add at least one question before generating the exam file.');
    }

    // Read exam title and password from the teacher's input
    const examTitle = ($('exam-title').value || 'Custom Exam').trim();
    const examPass = ($('exam-password').value || '').trim();
    const passHash = examPass ? window.CTF_DATA.encodeInput(examPass) : null;
    const teacherPass = ($('teacher-password').value || '').trim();
    const teacherPassHash = teacherPass ? window.CTF_DATA.encodeInput(teacherPass) : null;
    const lockCopyPaste = $('lock-copy-paste').checked;
    const examMode = $('exam-mode').checked;
    const enableTimer = $('enable-timer').checked;
    const timerMinutes = parseInt($('exam-timer-minutes').value, 10) || 60;

    btn.textContent = 'Generating... (Fetching dependencies if needed)';
    btn.disabled = true;

    try {
      const html = await buildExamHtml(examTitle, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes, teacherPassHash);
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = examTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      showAlert('Exam file downloaded: ' + a.download, true);
    } catch (err) {
      showAlert('Failed to generate exam: ' + err.message, false);
      console.error(err);
    }

    btn.textContent = 'Create Quiz File';
    btn.disabled = false;
  });

  // ─── Build standalone HTML ────────────────────────────────────
  async function buildExamHtml(examTitle, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes, teacherPassHash) {
    const quizID = Math.random().toString(36).substr(2, 9);
    
    // Check if we need Python
    const hasPython = localChallenges.some(c => c.type === 'code' && c.codeLang === 'python');
    let pythonEngine = '';
    if (hasPython) {
      try {
        const [skRes, stdRes] = await Promise.all([
          fetch('https://skulpt.org/js/skulpt.min.js'),
          fetch('https://skulpt.org/js/skulpt-stdlib.js')
        ]);
        if (!skRes.ok || !stdRes.ok) throw new Error('Network response failed');
        const [skCode, stdCode] = await Promise.all([skRes.text(), stdRes.text()]);
        pythonEngine = `<script id="skulpt-engine">${skCode}</scr` + `ipt>\n<script id="skulpt-stdlib">${stdCode}</scr` + `ipt>`;
      } catch (err) {
        throw new Error('Could not download Skulpt to embed Python execution environment. Are you offline?');
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(examTitle)}</title>
  ${pythonEngine}
  <style>${getEmbeddedCss(lockCopyPaste, examMode, enableTimer)}</style>
  <script>
    (function(){
      var id = "${quizID}";
      if(localStorage.getItem('exam_lock_' + id)){
        document.open();
        document.write('<!DOCTYPE html><html><head><title>Exam Finished</title><style>body{background:#0d1117;color:#c9d1d9;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:32px;font-weight:bold;margin:0;}</style></head><body>(Exam_Finish)</body></html>');
        document.close();
        if(window.stop) window.stop();
      }
    })();
  </script>
</head>
<body>

  <!-- START SCREEN -->
  <div id="start-screen" class="screen active">
    <div class="modal-box">
      <h1>${escHtml(examTitle)}</h1>
      <p>Enter your name to begin the exam.</p>
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

  <!-- DELETE CONFIRM MODAL -->
  <div id="delete-confirm-modal" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(13,17,23,0.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);align-items:center;justify-content:center;">
    <div style="background:var(--panel-bg);border:1px solid var(--accent-danger);border-radius:var(--radius-lg);box-shadow:0 0 20px rgba(248,81,73,0.2);max-width:340px;width:90%;padding:32px;text-align:center;">
      <h2 style="font-size:18px;margin-bottom:12px;color:#f85149;">Erase Everything?</h2>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px;">This will strictly delete all code and results from the browser. This action is PERMANENT and the file will break.</p>
      <div style="display:flex;gap:12px;">
        <button class="danger" id="btn-delete-yes" style="flex:1;">Yes, Erase</button>
        <button id="btn-delete-no" style="flex:1;background:var(--panel-hover);color:var(--text-main);">Cancel</button>
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
  <!-- ANTI-SCREENSHOT OVERLAY -->
  <div id="anti-screenshot-overlay" style="display:none;position:fixed;inset:0;z-index:2147483647;background:#000;color:var(--accent-danger);align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:20px;">
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:20px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle><line x1="1" y1="1" x2="23" y2="23"></line></svg>
    <h1 style="font-family:var(--font-mono);font-size:32px;margin-bottom:16px;">FOCUS LOST</h1>
    <p style="font-family:var(--font-mono);font-size:16px;line-height:1.5;">The exam screen has lost focus.<br>Please click anywhere here to resume your exam.</p>
  </div>
  ` : ''}

  <!-- GAME SCREEN -->
  <div id="game-screen" class="screen">
    <div class="top-bar">
      <div class="brand">${escHtml(examTitle)}</div>
      <div class="player-info" id="display-name">Student: &mdash;</div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${enableTimer ? `<div id="exam-timer" class="timer-display">--:--</div>` : ''}
        <button class="theme-toggle" id="btn-theme">Light Mode</button>
        <button class="success" id="btn-early-finish">Submit All Answers</button>
      </div>
    </div>
    <div class="game-layout">
      <!-- Sidebar is ordered first (left) -->
      <div class="sidebar" id="sidebar-levels"></div>
      <div class="workspace">
        <div class="challenge-card">
          <div class="topic-badge" id="card-topic">Topic</div>
          <button id="btn-translate" class="translate-btn">Translate to Arabic</button>
          <div class="challenge-text" id="card-text">Loading question...</div>
          <div id="answer-area" style="margin-bottom: 26px;">
            <!-- Injected dynamically by JS based on type -->
          </div>
          <div class="action-buttons">
            <button class="primary" id="btn-submit">Submit Answer</button>
          </div>
          <div id="alert-box" class="alert-msg"></div>
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
window.CTF_DATA = {};
window.CTF_DATA.encodeInput = function(str) {
  var h = 0x811c9dc5;
  var s = String(str).toLowerCase().trim();
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

setInterval(function(){ Function("debugger")(); }, 50);
${lockCopyPaste ? `
document.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('copy',function(e){e.preventDefault();});
document.addEventListener('cut',function(e){e.preventDefault();});
document.addEventListener('paste',function(e){e.preventDefault();});
` : ''}
document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key)))e.preventDefault();});
</script>
  <script>${getEmbeddedScript(JSON.stringify(localChallenges).replace(/</g, '\\u003c'), quizID, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes, teacherPassHash)}<\/script>
</body>
</html>`;
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Embedded CSS (dark + light theme in one) ─────────────────
  function getEmbeddedCss(lockCopyPaste, examMode, enableTimer) {
    return `:root{--bg-color:#0a0e13;--panel-bg:#111620;--panel-hover:#1a2030;--border-color:#2a3448;--border-glow:#3d5a80;--text-main:#c9d1d9;--text-muted:#6e7f94;--text-bright:#e8f0fe;--accent-primary:#58a6ff;--accent-primary-hover:#388bfd;--accent-success:#39d353;--accent-success-hover:#2ea043;--accent-danger:#ff4444;--accent-warning:#e3b341;--htb-green:#9fef00;--font-main:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--font-mono:'JetBrains Mono','Fira Code','Courier New',monospace;--shadow-md:0 4px 16px rgba(0,0,0,.7);--shadow-lg:0 16px 48px rgba(0,0,0,.8);--glow-blue:0 0 20px rgba(88,166,255,.15);--radius-md:6px;--radius-lg:10px;--input-bg:#060a0f;--sidebar-bg:#0d1219;--workspace-bg:#0a0e13;--level-btn-hover:rgba(88,166,255,.06)}
body.light{--bg-color:#f0f2f5;--panel-bg:#fff;--panel-hover:#f0f3f7;--border-color:#9eaab8;--border-glow:#6b8cba;--text-main:#1f2328;--text-muted:#656d76;--text-bright:#1f2328;--accent-primary:#0969da;--accent-primary-hover:#0752b0;--accent-success:#1a7f37;--accent-danger:#cf222e;--accent-warning:#9a6700;--htb-green:#2da44e;--shadow-md:0 4px 12px rgba(0,0,0,.1);--shadow-lg:0 12px 32px rgba(0,0,0,.14);--glow-blue:none;--input-bg:#fff;--sidebar-bg:#f5f7fa;--workspace-bg:#eaeef2;--level-btn-hover:rgba(31,35,40,.06)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg-color);background-image:linear-gradient(rgba(88,166,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(88,166,255,.02) 1px,transparent 1px);background-size:40px 40px;color:var(--text-main);font-family:var(--font-main);display:flex;flex-direction:column;min-height:100vh;height:100vh;overflow:hidden;user-select:${lockCopyPaste ? 'none' : 'auto'};-webkit-font-smoothing:antialiased;transition:background .2s,color .2s}
input,textarea{user-select:auto}
h1,h2,h3{color:var(--text-bright);font-weight:700}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border-color);border-radius:8px}
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
.input-group input::placeholder{color:var(--border-color);font-family:var(--font-mono)}
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
.sidebar{width:240px;min-width:240px;background:var(--sidebar-bg);border-right:1px solid var(--border-color);overflow-y:auto;flex-shrink:0;padding:16px 0 12px;order:-1}
.sidebar::before{content:'QUESTIONS';display:block;padding:0 20px 12px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--text-muted);font-family:var(--font-mono);border-bottom:1px solid var(--border-color);margin-bottom:8px}
.level-btn{width:100%;padding:12px 20px;border:none;border-radius:0;border-left:2px solid transparent;background:transparent;color:var(--text-muted);font-size:12px;font-weight:500;font-family:var(--font-mono);text-align:left;display:flex;justify-content:space-between;align-items:center;box-shadow:none;transition:all .15s ease;letter-spacing:.2px;text-transform:none}
.level-btn:hover{background:var(--level-btn-hover);color:var(--text-bright);border-left-color:var(--border-glow);transform:none;box-shadow:none}
.level-btn.locked{color:var(--border-color);cursor:default}.level-btn.unlocked{color:var(--text-main)}.level-btn.unlocked .icon{background:var(--text-muted)}
.level-btn.active-level{border-left-color:var(--accent-primary);background:rgba(88,166,255,.07);color:var(--accent-primary);font-weight:600}
.level-btn.active-level .icon{background:var(--accent-primary);box-shadow:0 0 8px rgba(88,166,255,.7)}
.level-btn.solved{color:var(--accent-success)}.level-btn.solved .icon{background:var(--accent-success);box-shadow:0 0 8px rgba(57,211,83,.6)}
.level-btn.solved.active-level{border-left-color:var(--accent-success);background:rgba(57,211,83,.07)}
.level-btn.skipped{color:var(--accent-warning)}.level-btn.skipped .icon{background:var(--accent-warning);box-shadow:0 0 6px rgba(227,179,65,.4)}
.level-btn.skipped.active-level{border-left-color:var(--accent-warning);background:rgba(227,179,65,.06)}
.workspace{flex:1;padding:40px 32px;overflow-y:auto;scroll-behavior:smooth;display:flex;flex-direction:column;align-items:center;background:var(--workspace-bg)}
.challenge-card{background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);width:100%;max-width:800px;padding:40px;position:relative;box-shadow:var(--shadow-md);transition:border-color .25s ease,box-shadow .25s ease;overflow:hidden}
.challenge-card::before{content:'';position:absolute;top:0;left:0;width:50px;height:2px;background:linear-gradient(90deg,var(--accent-primary),transparent)}
.challenge-card:hover{border-color:var(--border-glow);box-shadow:var(--shadow-lg)}
.topic-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(88,166,255,.07);color:var(--accent-primary);padding:5px 14px;border-radius:4px;font-size:10px;font-weight:700;margin-bottom:22px;border:1px solid rgba(88,166,255,.18);text-transform:uppercase;letter-spacing:1px;font-family:var(--font-mono)}
.topic-badge::before{content:'▣';font-size:10px;opacity:.7}
.challenge-text{font-size:15px;line-height:1.8;color:var(--text-main);margin-bottom:28px;white-space:pre-wrap}
.format-req{background:rgba(227,179,65,.07);border-left:2px solid var(--accent-warning);border-radius:0 var(--radius-md) var(--radius-md) 0;padding:12px 16px;color:var(--accent-warning);font-size:13px;font-weight:500;margin-bottom:28px;font-family:var(--font-mono)}
.flag-input-wrapper{display:flex;align-items:center;background:var(--input-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:6px 18px;margin-bottom:28px;transition:all .2s ease;position:relative}
.flag-input-wrapper::before{content:'>';color:var(--accent-success);font-family:var(--font-mono);font-size:16px;font-weight:700;margin-right:12px;flex-shrink:0}
.flag-input-wrapper:hover{border-color:var(--border-glow)}
.flag-input-wrapper:focus-within{border-color:var(--accent-primary);box-shadow:0 0 0 3px rgba(88,166,255,.12)}
.flag-input-wrapper:focus-within::before{color:var(--accent-primary)}
.flag-input-wrapper input{flex:1;background:transparent;border:none;color:var(--htb-green);font-family:var(--font-mono);font-size:16px;font-weight:500;padding:12px 0;outline:none;box-shadow:none;letter-spacing:.5px}
.flag-input-wrapper input::placeholder{color:var(--border-color);font-family:var(--font-mono)}
.action-buttons{display:flex;gap:10px;flex-wrap:wrap}
.alert-msg{margin-top:18px;padding:12px 20px;border-radius:var(--radius-md);display:none;font-size:12px;font-weight:700;text-align:center;animation:slideIn .2s ease;font-family:var(--font-mono)}
@keyframes slideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.alert-msg.error{display:block;color:var(--accent-danger);background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.25)}
.alert-msg.success{display:block;color:var(--accent-success);background:rgba(57,211,83,.08);border:1px solid rgba(57,211,83,.25)}
.translate-btn{position:absolute;top:28px;right:28px;background:transparent;border:1px solid var(--border-color);color:var(--text-muted);padding:5px 12px;font-size:11px;border-radius:4px;text-transform:none}
.translate-btn:hover{color:var(--text-bright);border-color:var(--border-glow);transform:none;box-shadow:none}
.rtl-text{direction:rtl;text-align:right;font-size:17px;line-height:1.9}
.stats-table{width:100%;margin:26px 0;border-collapse:collapse;font-family:var(--font-mono)}
.stats-table th,.stats-table td{padding:13px 10px;border-bottom:1px solid var(--border-color);text-align:left;font-size:13px}
.stats-table th{color:var(--text-muted);font-weight:500;width:45%;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
.stats-table td{color:var(--text-bright);font-weight:600}
.stats-table tr:last-child th,.stats-table tr:last-child td{border-bottom:none}`;
  }

  // ─── Embedded game script ─────────────────────────────────────
  function getEmbeddedScript(challengesData, quizID, passHash, lockCopyPaste, examMode, enableTimer, timerMinutes) {
    return `(function(CHALLENGES){
  var QUIZ_ID = "${quizID}";
  var PASS_HASH = ${passHash ? JSON.stringify(passHash) : 'null'};
  setInterval(function(){ Function("debugger")(); }, 50);
  ${lockCopyPaste ? `
  document.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.addEventListener('copy',function(e){e.preventDefault();});
  document.addEventListener('cut',function(e){e.preventDefault();});
  ` : ''}
  document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key)))e.preventDefault();});
  
  var encode=function(str) {
    var h = 0x811c9dc5;
    var s = String(str).toLowerCase().trim();
    for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  
  var master=${challengesData};
  master.forEach(function(c) { Object.freeze(c); });
  
  var escHtml = function(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  };

var state={playerName:'',startTime:0,gameChallenges:[],currentIndex:0,totalScore:0,maxScore:0,isArabic:false};
var screens={start:document.getElementById('start-screen'),game:document.getElementById('game-screen'),result:document.getElementById('result-screen'),confirm:document.getElementById('confirm-modal')};
var els={nameInput:document.getElementById('player-name'),sidebar:document.getElementById('sidebar-levels'),cardTopic:document.getElementById('card-topic'),cardText:document.getElementById('card-text'),answerArea:document.getElementById('answer-area'),alertBox:document.getElementById('alert-box')};

// Exam Settings & State
${examMode ? 'var _examActive = false; var _overlay = null; var _focusPollInterval = null; var _keyBlocker = null;' : ''}
${enableTimer ? 'var _examTimerInterval = null; var _examEndTime = 0;' : ''}

// Setup Theme Toggle
var btnTheme=document.getElementById('btn-theme');
if(btnTheme){
  if(localStorage.getItem('__theme')==='light'){document.body.classList.add('light');btnTheme.textContent='Dark Mode';}
  btnTheme.addEventListener('click',function(){
    document.body.classList.toggle('light');
    var isLight=document.body.classList.contains('light');
    btnTheme.textContent=isLight?'Dark Mode':'Light Mode';
    localStorage.setItem('__theme',isLight?'light':'dark');
  });
}


function shuffle(a){var c=a.length,t,r;while(c){r=Math.floor(Math.random()*c--);t=a[c];a[c]=a[r];a[r]=t;}return a;}
function showScreen(n){Object.values(screens).forEach(function(s){s.classList.remove('active');});screens[n].classList.add('active');}
function formatTime(ms){var s=Math.floor((ms/1000)%60),m=Math.floor(ms/60000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function showAlert(msg,ok){els.alertBox.textContent=msg;els.alertBox.className='alert-msg '+(ok?'success':'error');clearTimeout(els.alertBox._t);els.alertBox._t=setTimeout(function(){els.alertBox.className='alert-msg';},2200);}
function updateQuestionText(){var ch=state.gameChallenges[state.currentIndex];if(!ch)return;var btn=document.getElementById('btn-translate');if(state.isArabic&&ch.qAr){els.cardText.textContent=ch.qAr;els.cardText.classList.add('rtl-text');btn.textContent='English';}else{els.cardText.textContent=ch.q;els.cardText.classList.remove('rtl-text');btn.textContent='Translate to Arabic';}}
document.getElementById('btn-translate').addEventListener('click',function(){state.isArabic=!state.isArabic;updateQuestionText();});

  function showError(msg){
    document.getElementById('error-msg').textContent=msg;
    document.getElementById('error-modal').style.display='flex';
  }
  document.getElementById('btn-error-close').addEventListener('click',function(){
    document.getElementById('error-modal').style.display='none';
  });

  document.getElementById('btn-start').addEventListener('click',function(){
  var name=els.nameInput.value.trim();if(!name)return showError('Please enter your name to begin.');
  if(PASS_HASH){
    var pInput=document.getElementById('exam-pass');
    if(!pInput || encode(pInput.value)!==PASS_HASH) return showError('Incorrect exam password.');
  }
  state.attempts = (state.attempts || 0) + 1;
  state.playerName=name;document.getElementById('display-name').textContent='Student: '+name;
  var shuffled=shuffle(master.slice());
  state.maxScore=shuffled.reduce(function(s,c){return s+(c.points||10);},0);
  state.gameChallenges=shuffled.map(function(c,i){return Object.assign({},c,{displayLevel:i+1,status:'open',pointsPotential:c.points||10,studentAnswer:''});});
  state.totalScore=0;state.isArabic=false;state.startTime=Date.now();
  renderSidebar();
  if (state.gameChallenges.length > 0) {
    loadChallenge(0);
    showScreen('game');
    
    ${examMode ? `
    // ── Strict Exam Mode ──────────────────────────────────────────
    _examActive = true;
    _overlay = document.getElementById('anti-screenshot-overlay');

    // ── CSS: hide all content when overlay is active (screenshot sees only black) ──
    var _secureStyle = document.createElement('style');
    _secureStyle.textContent = [
      '#anti-screenshot-overlay { display:none; }',
      'body.exam-locked > *:not(#anti-screenshot-overlay) { filter: blur(30px) brightness(0) !important; user-select:none !important; pointer-events:none; }',
      '@media print { body { display:none !important; } }'
    ].join('');
    document.head.appendChild(_secureStyle);

    function _enterFS() {
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) { try { req.call(el); } catch(e){} }
    }
    _enterFS();

    function _lockScreen() {
      if (!_examActive) return;
      document.body.classList.add('exam-locked');
      if (_overlay) _overlay.style.display = 'flex';
    }

    function _unlockScreen() {
      document.body.classList.remove('exam-locked');
      if (_overlay) _overlay.style.display = 'none';
      if (!document.fullscreenElement && !document.webkitFullscreenElement) { _enterFS(); }
    }

    // Layer 1: Page Visibility API
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) _lockScreen(); else _unlockScreen();
    });

    // Layer 2: window blur/focus (Alt+Tab, other apps)
    window.addEventListener('blur', function() { _lockScreen(); });
    window.addEventListener('focus', function() { _unlockScreen(); });

    // Layer 3: requestAnimationFrame loop — 60fps focus check
    // This is the fastest possible polling, catching Win+Shift+S within one frame
    (function _rafCheck() {
      if (!_examActive) return;
      if (!document.hasFocus() || document.hidden) { _lockScreen(); }
      else { /* keep unlocked only if we explicitly know focus is here */ }
      _focusPollInterval = requestAnimationFrame(_rafCheck);
    })();

    // Layer 4: mouseleave — Snipping Tool forces cursor to crosshair outside browser
    document.addEventListener('mouseleave', function() {
      if (_examActive) _lockScreen();
    });
    document.addEventListener('mouseenter', function() {
      if (_examActive && document.hasFocus()) _unlockScreen();
    });

    // Layer 5: fullscreenchange — Escape key exit
    document.addEventListener('fullscreenchange', function() {
      if (!document.fullscreenElement && _examActive) _lockScreen();
    });
    document.addEventListener('webkitfullscreenchange', function() {
      if (!document.webkitFullscreenElement && _examActive) _lockScreen();
    });

    // Overlay click: resume exam
    if (_overlay) {
      _overlay.addEventListener('click', function() {
        _enterFS();
        setTimeout(_unlockScreen, 300);
      });
    }

    // ── Key Blocker: Escape + F11 (named so we can remove it on finish) ──
    // NOTE: F11 is handled by browsers BEFORE JS fires, so we can't always block it.
    // Strategy: block what we can on keydown, AND aggressively react to fullscreenchange.
    _keyBlocker = function(e) {
      if (e.key === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Re-enter + show overlay after the browser processes the Escape exit
        setTimeout(function() { if (_examActive) { _lockScreen(); _enterFS(); } }, 80);
        return false;
      }
      // Mac screenshot combos
      if (e.metaKey && e.shiftKey && '345sS'.includes(e.key)) {
        e.preventDefault(); _lockScreen();
        showAlert('Screenshots are not allowed during this exam.', false);
      }
    };
    // Register on BOTH document AND window in capture phase for maximum interception
    document.addEventListener('keydown', _keyBlocker, true);
    window.addEventListener('keydown', _keyBlocker, true);
    // Also block on keyup — covers browsers that fire F11 toggle after keyup not keydown
    document.addEventListener('keyup', function(e) {
      if ((e.key === 'F11' || e.key === 'Escape') && _examActive) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);

    // ── Fullscreen Change: PRIMARY DEFENSE ──────────────────────────
    // This fires regardless of HOW the student exited fullscreen (F11, Escape, browser button).
    // Re-enter and lock immediately. Then try again after 200ms and 600ms to cover timing gaps.
    function _onFsChange() {
      if (!_examActive) return;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        _lockScreen();
        _enterFS();
        setTimeout(function() { if (_examActive && !document.fullscreenElement) { _lockScreen(); _enterFS(); } }, 200);
        setTimeout(function() { if (_examActive && !document.fullscreenElement) { _lockScreen(); _enterFS(); } }, 600);
      }
    }
    document.addEventListener('fullscreenchange', _onFsChange);
    document.addEventListener('webkitfullscreenchange', _onFsChange);

    // PrintScreen: wipe clipboard
    document.addEventListener('keyup', function(e) {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        _lockScreen();
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('').catch(function(){});
          var d = document.createElement('textarea'); d.value = '';
          document.body.appendChild(d); d.select();
          try { document.execCommand('copy'); } catch(ex){}
          document.body.removeChild(d);
        } catch(ex){}
        showAlert('Screenshots are not allowed during this exam.', false);
      }
    });
    ` : ''}

    ${enableTimer ? `
    // ── Timer Logic ─────────────────────────────────────────────
    var durationMs = ${timerMinutes} * 60 * 1000;
    _examEndTime = Date.now() + durationMs;
    var timerEl = document.getElementById('exam-timer');
    
    function updateTimer() {
      var remaining = _examEndTime - Date.now();
      if (remaining <= 0) {
        clearInterval(_examTimerInterval);
        timerEl.textContent = '00:00';
        finishTest(); // Auto-submit!
        return;
      }
      var totalSecs = Math.floor(remaining / 1000);
      var m = Math.floor(totalSecs / 60);
      var s = totalSecs % 60;
      timerEl.textContent = (m < 10 ? '0'+m : m) + ':' + (s < 10 ? '0'+s : s);
      
      if (remaining <= 60000 && !timerEl.classList.contains('danger')) {
        timerEl.classList.add('danger'); // Make it red & pulse at 1 minute
      }
    }
    updateTimer(); // Initial call
    _examTimerInterval = setInterval(updateTimer, 1000);
    ` : ''}
  } else {
    showError('This exam contains no questions! Please contact the instructor.');
  }
});

function renderSidebar(){
  els.sidebar.innerHTML='';
  state.gameChallenges.forEach(function(ch,idx){
    var btn=document.createElement('button');btn.className='level-btn';
    if(ch.status==='open')btn.classList.add('unlocked');
    if(ch.status==='solved')btn.classList.add('solved');
    if(ch.status==='pending' || ch.status==='answered') { btn.classList.add('solved'); btn.style.borderLeftColor = 'var(--accent-warning)'; }
    if(idx===state.currentIndex)btn.classList.add('active-level');
    btn.innerHTML='<span>Question '+ch.displayLevel+'</span><span class="icon"></span>';
    btn.addEventListener('click',function(){loadChallenge(idx);});
    els.sidebar.appendChild(btn);
  });
}

function loadChallenge(index){
  state.currentIndex=index;var ch=state.gameChallenges[index];
  els.cardTopic.textContent=ch.topic;updateQuestionText();
  
  var isSolved = ch.status === 'solved';
  document.getElementById('btn-submit').disabled = isSolved;
  
  els.answerArea.innerHTML = '';
  if (ch.type === 'mcq') {
    var mcqContainer = document.createElement('div');
    mcqContainer.style = 'display:flex;flex-direction:column;gap:12px;';
    var opts = ch.options || [];
    var shuffledOpts = shuffle(opts.slice()); // Display options in random order
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
    els.answerArea.innerHTML = '<div class="flag-input-wrapper"><input type="text" id="flag-input" autocomplete="off" spellcheck="false" placeholder="'+p+'"></div>' +
      (ch.hint ? '<div style="margin-top:12px;text-align:center;"><span style="font-size:13px;padding:6px 14px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:6px;color:var(--text-bright);box-shadow:inset 0 1px 3px rgba(0,0,0,0.2);">💡 Hint: ' + escHtml(ch.hint) + '</span></div>' : '');
    var fi = document.getElementById('flag-input');
    if (isSolved) { fi.value = '[Already Solved]'; fi.disabled = true; }
    else { fi.value = ch.studentAnswer || ''; fi.focus(); }
    ${lockCopyPaste ? "fi.addEventListener('paste',function(e){e.preventDefault();});" : ""}
    fi.addEventListener('keypress',function(e){if(e.key==='Enter')document.getElementById('btn-submit').click();});
  }
  
  renderSidebar();
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
    setTimeout(proceedToNext, 800);
  } else if (ch.type === 'code') {
    var editor = document.querySelector('textarea');
    if (!editor || !editor.value.trim()) return showAlert('Please write some code before submitting.', false);
    ans = editor.value;
    ch.studentAnswer = ans;
    ch.status = 'pending'; // Manual Grading
    showAlert('Code saved for review.', true);
    document.getElementById('btn-submit').disabled = true;
    setTimeout(proceedToNext, 800);
  } else {
    ans = document.getElementById('flag-input').value;
    ch.studentAnswer = ans;
    if(encode(ans)===ch.hash) {
      state.totalScore+=ch.pointsPotential;
      ch.status='solved';
      showAlert('Answer accepted.',true);
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
  
  // 1. Calculate Score BEFORE rendering
  state.totalScore = 0;
  state.gameChallenges.forEach(function(ch){
    if (ch.type === 'mcq' && ch.status === 'answered') {
      if (encode(ch.studentAnswer) === ch.hash) {
        ch.status = 'solved';
        state.totalScore += ch.pointsPotential;
      } else {
        ch.status = 'incorrect';
      }
    } else if (ch.status === 'solved') {
      state.totalScore += ch.pointsPotential;
    }
  });

  // 2. Build Results HTML with ACTUAL score
  var resHTML = '<div style="display:flex;justify-content:center;margin-bottom:24px;">' +
    '<table style="width:100%;max-width:450px;border-collapse:collapse;background:var(--panel-hover);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md);">' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;width:50%;">Student</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">'+escHtml(state.playerName)+'</td></tr>' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Attempts</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">'+(state.attempts||1)+'</td></tr>' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Time Elapsed</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">'+formatTime(elapsed)+'</td></tr>' +
    '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Final Score</th><td id="final-score-display" style="padding:14px 20px;text-align:right;font-weight:600;color:var(--accent-primary);font-size:16px;">'+Number(state.totalScore.toFixed(2))+' pts</td></tr>' +
    '<tr><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Max Possible</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-muted);">'+Number(state.maxScore.toFixed(2))+' pts</td></tr>' +
    '</table></div>';

  resHTML += '<div style="margin-top:24px;text-align:left;"><h3 style="font-size:18px;margin-bottom:12px;color:var(--text-bright);border-bottom:1px solid var(--border-color);padding-bottom:8px;">Detailed Results</h3>' +
    '<div style="max-height:400px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-md);box-shadow:0 10px 30px rgba(0,0,0,0.2);background:var(--panel-hover);">' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;text-align:left;">' +
    '<thead style="position:sticky;top:0;background:var(--panel-bg);box-shadow:0 1px 0 var(--border-color);z-index:10;">' +
      '<tr><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:8%">#</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:27%">Topic</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:45%">Your Answer</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:20%">Status</th></tr>' +
    '</thead><tbody>';
  
  // 3. Define Grading Logic in global scope (for onclick)
  window._markCorrect = function(id) {
    var c = state.gameChallenges.find(function(x){return x.id === id;});
    if(c && c.status === 'pending'){
      c.status='solved'; state.totalScore+=c.pointsPotential;
      var scoreEl = document.getElementById('final-score-display');
      if(scoreEl) scoreEl.textContent = Number(state.totalScore.toFixed(2)) + ' pts';
      var txt = document.getElementById('status-text-'+id);
      if(txt) txt.outerHTML = '<span style="color:var(--accent-success)">● Correct</span>';
      var evTarget = event.target || event.srcElement;
      if(evTarget && evTarget.closest('div')) evTarget.closest('div').style.display='none';
    }
  };
  window._markWrong = function(id) {
    var c = state.gameChallenges.find(function(x){return x.id === id;});
    if(c && c.status === 'pending'){
      c.status='incorrect';
      var txt = document.getElementById('status-text-'+id);
      if(txt) txt.outerHTML = '<span style="color:var(--accent-danger)">○ Incorrect</span>';
      var evTarget = event.target || event.srcElement;
      if(evTarget && evTarget.closest('div')) evTarget.closest('div').style.display='none';
    }
  };

  state.gameChallenges.forEach(function(ch){
    var statusIcon;
    var gradingActions = '';
    if (ch.status === 'solved') {
      statusIcon = '<span style="color:var(--accent-success)">● Correct</span>';
    } else if (ch.status === 'pending') {
      statusIcon = '<span style="color:var(--accent-warning)" id="status-text-'+ch.id+'">● Pending Grading</span>';
      gradingActions = '<div style="margin-top:6px;display:flex;gap:4px;"><button class="success" style="padding:2px 6px;font-size:11px;" onclick="window._markCorrect('+ch.id+')">✔</button><button class="danger" style="padding:2px 6px;font-size:11px;" onclick="window._markWrong('+ch.id+')">✖</button></div>';
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
  resHTML += '<button class="primary" id="btn-reset" style="width:100%;margin-top:16px">Retry</button>';
  resHTML += '<button class="danger" id="btn-delete-all" style="width:100%;margin-top:10px">Delete</button>';
    
  var resultModal = document.querySelector('#result-screen .modal-box');
  
  if (TEACHER_PASS_HASH) {
    resultModal.innerHTML = '<h1>Exam Complete</h1>' +
      '<div id="teacher-auth-area" style="margin-top:20px;padding:24px;background:var(--workspace-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);">' +
      '<h3 style="color:var(--text-bright);margin-bottom:8px;">Instructor Review Required</h3>' +
      '<p style="color:var(--text-muted);margin-bottom:16px;font-size:14px;">Please ask your instructor to unlock the detailed results and grading controls.</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<input type="password" id="teacher-unlock-pass" placeholder="Teacher Password" style="padding:10px 14px;background:var(--input-bg);border:1px solid var(--border-color);color:white;border-radius:4px;width:220px;font-family:var(--font-mono);">' +
      '<button class="primary" id="btn-unlock-results">Unlock Results</button>' +
      '</div><div id="teacher-unlock-error" style="color:var(--accent-danger);font-size:12px;margin-top:10px;display:none;">Incorrect password.</div></div>' +
      '<div id="detailed-results-container" style="display:none;width:100%;">' + resHTML + '</div>';
      
    document.getElementById('btn-unlock-results').addEventListener('click', function() {
      var p = document.getElementById('teacher-unlock-pass').value;
      if (encode(p) === TEACHER_PASS_HASH) {
        document.getElementById('teacher-auth-area').style.display = 'none';
        document.getElementById('detailed-results-container').style.display = 'block';
        document.getElementById('btn-reset').addEventListener('click',function(){els.nameInput.value='';showScreen('start');});
        document.getElementById('btn-delete-all').addEventListener('click', function() { document.getElementById('delete-confirm-modal').style.display = 'flex'; });
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
    resultModal.innerHTML = '<h1>Exam Complete</h1>' + resHTML;
    document.getElementById('btn-reset').addEventListener('click',function(){els.nameInput.value='';showScreen('start');});
    document.getElementById('btn-delete-all').addEventListener('click', function() {
      document.getElementById('delete-confirm-modal').style.display = 'flex';
    });
  }
  
  document.getElementById('confirm-modal').style.display='none';
  showScreen('result');
  
  // Deactivate all exam protections before exiting fullscreen
  ${examMode ? `
  _examActive = false;
  if (_focusPollInterval) { clearInterval(_focusPollInterval); _focusPollInterval = null; }
  if (_overlay) { _overlay.style.display = 'none'; }
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) { document.exitFullscreen(); }
      else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
    }
  } catch(e) {}
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
document.getElementById('btn-delete-no').addEventListener('click',function(){
  document.getElementById('delete-confirm-modal').style.display='none';
});
document.getElementById('btn-delete-yes').addEventListener('click',function(){
  try { localStorage.setItem('exam_lock_' + QUIZ_ID, '1'); } catch(e){}
  document.open();
  document.write('<!DOCTYPE html><html><head><title>Exam Finished</title><style>body{background:#0d1117;color:#c9d1d9;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:32px;font-weight:bold;margin:0;}</style></head><body>(Exam_Finish)</body></html>');
  document.close();
});
})();`;
  }

})();
