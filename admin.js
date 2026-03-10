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
    ['list-section', 'editor-section'].forEach(s => {
      $(s).style.display = s === id ? 'block' : 'none';
    });
  }

  document.querySelectorAll('.nav-links button').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      if (e.target.id === 'nav-add') {
        openEditor(null);
        showSection('editor-section');
      } else {
        renderTable();
        showSection('list-section');
      }
    });
  });

  // ─── Table ───────────────────────────────────────────────────
  function renderTable() {
    const tbody = $('challenges-tbody');
    tbody.innerHTML = '';
    [...localChallenges].sort((a, b) => a.id - b.id).forEach(ch => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ch.id}</td>
        <td>${ch.topic}<br><small style="color:var(--text-muted)">(${ch.points || 10} pts)</small></td>
        <td style="white-space: pre-wrap;">${ch.q}</td>
        <td><span style="color:var(--text-muted);font-size:12px">Hashed: ${ch.hash.substring(0, 8)}...</span></td>
        <td>
          <div class="actions">
            <button class="warning" style="font-size:11px;padding:4px 8px" onclick="window._editCh(${ch.id})">Edit</button>
            <button class="danger"  style="font-size:11px;padding:4px 8px" onclick="window._delCh(${ch.id})">Delete</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // ─── Editor ──────────────────────────────────────────────────
  function openEditor(id) {
    $('edit-id').value = (id !== null) ? id : '';
    $('editor-title').textContent = (id !== null) ? 'Edit Question #' + id : 'Add New Question';

    if (id !== null) {
      const ch = localChallenges.find(x => x.id === id);
      if (!ch) return;
      $('edit-order').value = ch.id;
      $('edit-points').value = ch.points || 10;
      $('edit-topic').value = ch.topic;
      $('edit-q-en').value = ch.q;
      $('edit-q-ar').value = ch.qAr || '';
      $('edit-format').value = ch.format;
      $('edit-answer').value = '';
      $('edit-answer').placeholder = 'Leave blank to keep current answer';
    } else {
      const nextId = localChallenges.length > 0
        ? Math.max(...localChallenges.map(x => x.id)) + 1 : 1;
      $('edit-order').value = nextId;
      $('edit-points').value = 10;
      $('edit-topic').value = '';
      $('edit-q-en').value = '';
      $('edit-q-ar').value = '';
      $('edit-answer').value = '';
      $('edit-answer').placeholder = 'Required for new questions';
      $('edit-format').value = '';
    }
  }

  window._editCh = function (id) {
    openEditor(id);
    showSection('editor-section');
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    $('nav-add').classList.add('active');
    $('editor-title').textContent = 'Edit Question #' + id;
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
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    $('nav-list').classList.add('active');
  });

  $('btn-save-challenge').addEventListener('click', () => {
    const editIdRaw = $('edit-id').value;
    const editId = editIdRaw !== '' ? parseInt(editIdRaw) : null;
    const newId = parseInt($('edit-order').value);
    const points = parseFloat($('edit-points').value) || 10;
    const topic = $('edit-topic').value.trim();
    const qEn = $('edit-q-en').value.trim();
    const qAr = $('edit-q-ar').value.trim();
    const ans = $('edit-answer').value.trim();
    const format = $('edit-format').value.trim();

    if (!newId || !topic || !qEn || !format) {
      return alert('Please fill in all required fields (ID, Topic, Question, Format).');
    }

    const existing = (editId !== null) ? localChallenges.find(c => c.id === editId) : null;
    if (!existing && !ans) return alert('An answer is required for new questions.');

    const newHash = ans ? window.CTF_DATA.encodeInput(ans) : existing.hash;
    const newAnsLen = ans ? ans.length : (existing.ansLen || 1);
    const updated = { id: newId, topic, points, q: qEn, qAr, format, hash: newHash, ansLen: newAnsLen };

    if (existing) {
      // Edit fix: replace in array, do not append
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
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
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
  $('btn-create-quiz').addEventListener('click', () => {
    const btn = $('btn-create-quiz');
    if (localChallenges.length === 0) {
      return alert('Add at least one question before generating the exam file.');
    }

    // Read exam title from the teacher's input
    const examTitle = ($('exam-title').value || 'Custom Exam').trim();

    btn.textContent = 'Generating...';
    btn.disabled = true;

    const html = buildExamHtml(examTitle);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = examTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showAlert('Exam file downloaded: ' + a.download, true);
    var title = document.getElementById('exam-title').value.trim() || 'Custom Exam';
    var themeValue = localStorage.getItem('__theme') || 'dark';

    // Grab latest styles
    var cssText = getEmbeddedCss();

    // Inject custom challenges directly into script enclosure
    btn.textContent = 'Create Quiz File';
    btn.disabled = false;
  });

  // ─── Build standalone HTML ────────────────────────────────────
  function buildExamHtml(examTitle) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(examTitle)}</title>
  <style>${getEmbeddedCss()}</style>
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

  <!-- GAME SCREEN -->
  <div id="game-screen" class="screen">
    <div class="top-bar">
      <div class="brand">${escHtml(examTitle)}</div>
      <div class="player-info" id="display-name">Student: &mdash;</div>
      <div style="display:flex;align-items:center;gap:10px;">
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
          <div class="format-req" id="card-format">Format requirement...</div>
          <div class="flag-input-wrapper">
            <input type="text" id="flag-input" autocomplete="off" spellcheck="false" placeholder="">
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
document.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('copy',function(e){e.preventDefault();});
document.addEventListener('cut',function(e){e.preventDefault();});
document.addEventListener('paste',function(e){e.preventDefault();});
document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key)))e.preventDefault();});
</script>
  <script>${getEmbeddedScript(JSON.stringify(localChallenges).replace(/</g, '\\u003c'))}<\/script>
  <script>
    // Theme toggle for student exam
    (function(){
      var btn=document.getElementById('btn-theme');
      if(!btn)return;
      if(localStorage.getItem('__theme')==='light'){document.body.classList.add('light');btn.textContent='Dark Mode';}
      btn.addEventListener('click',function(){
        document.body.classList.toggle('light');
        var isLight=document.body.classList.contains('light');
        btn.textContent=isLight?'Dark Mode':'Light Mode';
        localStorage.setItem('__theme',isLight?'light':'dark');
      });
    })();
  <\/script>
</body>
</html>`;
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Embedded CSS (dark + light theme in one) ─────────────────
  function getEmbeddedCss() {
    return `:root{--bg-color:#0d1117;--panel-bg:#161b22;--panel-hover:#21262d;--border-color:#444c56;--text-main:#c9d1d9;--text-muted:#8b949e;--text-bright:#f0f6fc;--accent-primary:#58a6ff;--accent-primary-hover:#388bfd;--accent-success:#3fb950;--accent-success-hover:#2ea043;--accent-danger:#f85149;--accent-warning:#e3b341;--font-main:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--font-mono:'Courier New',monospace;--shadow-md:0 4px 12px rgba(0,0,0,.5);--shadow-lg:0 12px 32px rgba(0,0,0,.6);--radius-md:6px;--radius-lg:10px;--input-bg:#0d1117;--sidebar-bg:#161b22;--workspace-bg:#0d1117;--level-btn-hover:rgba(139,148,158,.08)}
body.light{--bg-color:#f5f7fa;--panel-bg:#ffffff;--panel-hover:#f0f3f7;--border-color:#9eaab8;--text-main:#1f2328;--text-muted:#656d76;--text-bright:#1f2328;--accent-primary:#0969da;--accent-primary-hover:#0752b0;--accent-success:#1a7f37;--accent-success-hover:#14682e;--accent-danger:#cf222e;--accent-warning:#9a6700;--shadow-md:0 4px 12px rgba(0,0,0,.1);--input-bg:#fff;--sidebar-bg:#f5f7fa;--workspace-bg:#eaeef2;--level-btn-hover:rgba(31,35,40,.06)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg-color);color:var(--text-main);font-family:var(--font-main);display:flex;flex-direction:column;height:100vh;overflow:hidden;user-select:none;-webkit-font-smoothing:antialiased;transition:background .2s,color .2s}
input{user-select:auto}
h1,h2,h3{color:var(--text-bright);font-weight:600}
::-webkit-scrollbar{width:7px}::-webkit-scrollbar-track{background:var(--bg-color)}::-webkit-scrollbar-thumb{background:var(--border-color);border-radius:4px}
button{font-family:var(--font-main);font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--border-color);background:var(--panel-hover);color:var(--text-main);padding:8px 16px;border-radius:var(--radius-md);transition:background .15s,border-color .15s;display:inline-flex;align-items:center;gap:6px}
button:hover{border-color:var(--text-muted);color:var(--text-bright)}
button.primary{background:var(--accent-primary);border-color:var(--accent-primary);color:#fff;font-weight:600}
button.primary:hover{background:var(--accent-primary-hover);border-color:var(--accent-primary-hover)}
button.success{background:var(--accent-success);border-color:var(--accent-success);color:#fff;font-weight:600}
button.warning{background:var(--accent-warning);border-color:var(--accent-warning);color:#fff;font-weight:600}
button.theme-toggle{background:transparent;border:1px solid var(--border-color);color:var(--text-muted);padding:6px 12px;font-size:12px;border-radius:20px}
.input-group{margin-bottom:18px}
.input-group label{display:block;margin-bottom:6px;color:var(--text-muted);font-size:13px;font-weight:500}
.input-group input{width:100%;padding:10px 14px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);color:var(--text-main);font-size:14px;transition:border-color .15s,box-shadow .15s}
.input-group input:focus{border-color:var(--accent-primary);outline:none;box-shadow:0 0 0 3px rgba(88,166,255,.2)}
.input-group input::placeholder{color:var(--border-color)}
.screen{display:none;flex:1;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.screen.active{display:flex;animation:fadeUp .25s ease-out}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.modal-box{background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:44px;width:100%;max-width:480px;box-shadow:var(--shadow-lg);text-align:center}
.modal-box h1{color:var(--accent-primary);font-size:26px;margin-bottom:10px}
.modal-box>p{color:var(--text-muted);font-size:14px;line-height:1.6;margin-bottom:28px}
.top-bar{width:100%;height:58px;background:var(--panel-bg);border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;padding:0 22px;flex-shrink:0;z-index:10}
.brand{color:var(--text-bright);font-weight:700;font-size:16px}
.player-info{color:var(--text-muted);font-size:13px}
#game-screen{flex-direction:column;justify-content:flex-start;align-items:stretch;padding:0;height:100%;width:100%}
.game-layout{display:flex;flex:1;overflow:hidden;width:100%}
.sidebar{width:220px;min-width:220px;background:var(--sidebar-bg);border-right:2px solid var(--border-color);overflow-y:auto;flex-shrink:0;padding:10px 0}
.level-btn{width:100%;padding:12px 18px;border:none;border-radius:0;border-left:3px solid transparent;background:transparent;color:var(--text-muted);font-size:13px;font-weight:500;text-align:left;display:flex;justify-content:space-between;align-items:center;box-shadow:none;transition:background .15s}
.level-btn:hover{background:var(--level-btn-hover);color:var(--text-main)}
.level-btn .icon{width:8px;height:8px;border-radius:50%;background:var(--border-color);flex-shrink:0;transition:background .2s,box-shadow .2s}
.level-btn.locked{color:var(--border-color);cursor:default}
.level-btn.unlocked{color:var(--text-main)}.level-btn.unlocked .icon{background:var(--text-muted)}
.level-btn.active-level{border-left-color:var(--accent-primary);background:rgba(88,166,255,.08);color:var(--accent-primary);font-weight:600}
.level-btn.active-level .icon{background:var(--accent-primary);box-shadow:0 0 6px rgba(88,166,255,.5)}
.level-btn.solved{color:var(--accent-success)}.level-btn.solved .icon{background:var(--accent-success);box-shadow:0 0 6px rgba(63,185,80,.4)}
.level-btn.solved.active-level{border-left-color:var(--accent-success);background:rgba(63,185,80,.08)}
.level-btn.skipped{color:var(--accent-warning)}.level-btn.skipped .icon{background:var(--accent-warning);box-shadow:0 0 6px rgba(227,179,65,.4)}
.level-btn.skipped.active-level{border-left-color:var(--accent-warning);background:rgba(227,179,65,.08)}
.workspace{flex:1;padding:28px;overflow-y:auto;display:flex;flex-direction:column;align-items:center;background:var(--workspace-bg)}
.challenge-card{background:var(--panel-bg);border:1px solid var(--border-color);border-radius:var(--radius-lg);width:100%;max-width:760px;padding:36px;position:relative;box-shadow:var(--shadow-md)}
.topic-badge{display:inline-block;background:rgba(88,166,255,.1);color:var(--accent-primary);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:20px;border:1px solid rgba(88,166,255,.25)}
.challenge-text{font-size:16px;line-height:1.7;color:var(--text-main);margin-bottom:26px;white-space:pre-wrap}
.format-req{background:rgba(227,179,65,.08);border-left:3px solid var(--accent-warning);border-radius:0 var(--radius-md) var(--radius-md) 0;padding:12px 16px;color:var(--accent-warning);font-size:13px;font-weight:500;margin-bottom:26px}
.flag-input-wrapper{display:flex;align-items:center;background:var(--input-bg);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:6px 14px;margin-bottom:26px;transition:border-color .15s,box-shadow .15s}
.flag-input-wrapper:focus-within{border-color:var(--accent-primary);box-shadow:0 0 0 3px rgba(88,166,255,.2)}
.flag-input-wrapper input{flex:1;background:transparent;border:none;color:var(--accent-primary);font-family:var(--font-mono);font-size:18px;padding:10px 0;outline:none;box-shadow:none}
.flag-input-wrapper input::placeholder{color:var(--border-color)}
.action-buttons{display:flex;gap:10px;flex-wrap:wrap}
.alert-msg{margin-top:16px;padding:12px 16px;border-radius:var(--radius-md);display:none;font-size:13px;font-weight:600;text-align:center}
.alert-msg.error{display:block;color:var(--accent-danger);background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3)}
.alert-msg.success{display:block;color:var(--accent-success);background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3)}
.translate-btn{position:absolute;top:26px;right:26px;background:transparent;border:1px solid var(--border-color);color:var(--text-muted);padding:5px 12px;font-size:12px;border-radius:20px}
.translate-btn:hover{color:var(--text-bright);border-color:var(--text-muted)}
.rtl-text{direction:rtl;text-align:right;font-size:18px;line-height:1.9}
.stats-table{width:100%;margin:24px 0;border-collapse:collapse}
.stats-table th,.stats-table td{padding:12px 10px;border-bottom:1px solid var(--border-color);text-align:left;font-size:14px}
.stats-table th{color:var(--text-muted);font-weight:500;width:45%}
.stats-table td{color:var(--text-bright);font-weight:600}
.stats-table tr:last-child th,.stats-table tr:last-child td{border-bottom:none}`;
  }

  // ─── Embedded game script ─────────────────────────────────────
  function getEmbeddedScript(challengesData) {
    return `(function(CHALLENGES){
  setInterval(function(){ Function("debugger")(); }, 50);
  document.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.addEventListener('copy',function(e){e.preventDefault();});
  document.addEventListener('cut',function(e){e.preventDefault();});
  document.addEventListener('keydown',function(e){if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key)))e.preventDefault();});
  var fi=document.getElementById('flag-input');
  fi.addEventListener('paste',function(e){e.preventDefault();});
  
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
var els={nameInput:document.getElementById('player-name'),sidebar:document.getElementById('sidebar-levels'),cardTopic:document.getElementById('card-topic'),cardText:document.getElementById('card-text'),cardFormat:document.getElementById('card-format'),flagInput:fi,alertBox:document.getElementById('alert-box')};

function shuffle(a){var c=a.length,t,r;while(c){r=Math.floor(Math.random()*c--);t=a[c];a[c]=a[r];a[r]=t;}return a;}
function showScreen(n){Object.values(screens).forEach(function(s){s.classList.remove('active');});screens[n].classList.add('active');}
function formatTime(ms){var s=Math.floor((ms/1000)%60),m=Math.floor(ms/60000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function showAlert(msg,ok){els.alertBox.textContent=msg;els.alertBox.className='alert-msg '+(ok?'success':'error');clearTimeout(els.alertBox._t);els.alertBox._t=setTimeout(function(){els.alertBox.className='alert-msg';},2200);}
function updateQuestionText(){var ch=state.gameChallenges[state.currentIndex];if(!ch)return;var btn=document.getElementById('btn-translate');if(state.isArabic&&ch.qAr){els.cardText.textContent=ch.qAr;els.cardText.classList.add('rtl-text');btn.textContent='English';}else{els.cardText.textContent=ch.q;els.cardText.classList.remove('rtl-text');btn.textContent='Translate to Arabic';}}
document.getElementById('btn-translate').addEventListener('click',function(){state.isArabic=!state.isArabic;updateQuestionText();});

document.getElementById('btn-start').addEventListener('click',function(){
  var name=els.nameInput.value.trim();if(!name)return alert('Please enter your name to begin.');
  state.playerName=name;document.getElementById('display-name').textContent='Student: '+name;
  var shuffled=shuffle(master.slice());
  state.maxScore=shuffled.reduce(function(s,c){return s+(c.points||10);},0);
  state.gameChallenges=shuffled.map(function(c,i){return Object.assign({},c,{displayLevel:i+1,status:'open',pointsPotential:c.points||10,studentAnswer:''});});
  state.currentIndex=0;state.totalScore=0;state.isArabic=false;state.startTime=Date.now();
  renderSidebar();loadChallenge(0);showScreen('game');
});

function renderSidebar(){
  els.sidebar.innerHTML='';
  state.gameChallenges.forEach(function(ch,idx){
    var btn=document.createElement('button');btn.className='level-btn';
    if(ch.status==='open')btn.classList.add('unlocked');
    if(ch.status==='solved')btn.classList.add('solved');
    if(idx===state.currentIndex)btn.classList.add('active-level');
    btn.innerHTML='<span>Question '+ch.displayLevel+'</span><span class="icon"></span>';
    btn.addEventListener('click',function(){loadChallenge(idx);});
    els.sidebar.appendChild(btn);
  });
}

function loadChallenge(index){
  state.currentIndex=index;var ch=state.gameChallenges[index];
  els.cardTopic.textContent=ch.topic;updateQuestionText();
  var hint='*'.repeat(ch.ansLen||1);
  els.cardFormat.textContent='Required Format: '+ch.format+' ('+hint+')';
  
  var isSolved = ch.status === 'solved';
  els.flagInput.disabled = isSolved;
  document.getElementById('btn-submit').disabled = isSolved;
  
  if (isSolved) {
    els.flagInput.value='[Already Solved]';
  } else {
    els.flagInput.value='';els.flagInput.placeholder='';els.flagInput.focus();
  }
  
  renderSidebar();
}

function proceedToNext(){
  var nextIdx=state.gameChallenges.findIndex(function(c,i){return i>state.currentIndex&&c.status!=='solved';});
  if(nextIdx!==-1){loadChallenge(nextIdx);}
  else{loadChallenge(state.currentIndex);}
}

document.getElementById('btn-submit').addEventListener('click',function(){
  var ans=els.flagInput.value;var ch=state.gameChallenges[state.currentIndex];
  if(ch.status==='solved') return showAlert('Already solved.', true);
  ch.studentAnswer = ans;
  if(encode(ans)===ch.hash){state.totalScore+=ch.pointsPotential;ch.status='solved';showAlert('Answer accepted.',true);setTimeout(proceedToNext,800);}
  else{showAlert('Incorrect answer. Try again.',false);}
});
els.flagInput.addEventListener('keypress',function(e){if(e.key==='Enter')document.getElementById('btn-submit').click();});

function finishTest(){
  var elapsed=Date.now()-state.startTime;
  
  var resHTML = '<table class="stats-table">' +
    '<tr><th>Student</th><td>'+escHtml(state.playerName)+'</td></tr>' +
    '<tr><th>Time Elapsed</th><td>'+formatTime(elapsed)+'</td></tr>' +
    '<tr><th>Final Score</th><td>'+Number(state.totalScore.toFixed(2))+' pts</td></tr>' +
    '<tr><th>Max Possible</th><td>'+Number(state.maxScore.toFixed(2))+' pts</td></tr>' +
    '</table>';

  resHTML += '<div style="margin-top:24px;text-align:left;"><h3 style="font-size:16px;margin-bottom:12px;color:var(--text-bright);">Detailed Results</h3>' +
    '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-md);">' +
    '<table class="stats-table" style="width:100%;margin:0;">' +
    '<thead><tr><th style="width:10%">#</th><th style="width:40%">Topic</th><th style="width:30%">Your Answer</th><th style="width:20%">Status</th></tr></thead><tbody>';
  
  state.gameChallenges.forEach(function(ch){
    var statusIcon = ch.status === 'solved' ? '<span style="color:var(--accent-success)">● Correct</span>' : '<span style="color:var(--accent-danger)">○ Unsolved</span>';
    resHTML += '<tr>' +
      '<td>' + ch.displayLevel + '</td>' +
      '<td>' + escHtml(ch.topic) + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:12px;">' + (ch.studentAnswer ? escHtml(ch.studentAnswer) : '<i style="color:var(--text-muted)">None</i>') + '</td>' +
      '<td>' + statusIcon + '</td>' +
      '</tr>';
  });
  resHTML += '</tbody></table></div></div>';
  resHTML += '<button class="primary" id="btn-reset" style="width:100%;margin-top:16px">Retry</button>';
  resHTML += '<button class="danger" id="btn-delete-all" style="width:100%;margin-top:10px">Delete</button>';
    
  var resultModal = document.querySelector('#result-screen .modal-box');
  resultModal.innerHTML = '<h1>Exam Complete</h1>' + resHTML;
  document.getElementById('btn-reset').addEventListener('click',function(){els.nameInput.value='';showScreen('start');});
  document.getElementById('btn-delete-all').addEventListener('click', function() {
    document.getElementById('delete-confirm-modal').style.display = 'flex';
  });
  
  document.getElementById('confirm-modal').style.display='none';
  showScreen('result');
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
  document.open();
  document.write('<!DOCTYPE html><html><head><title>Exam Finished</title><style>body{background:#0d1117;color:#c9d1d9;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:32px;font-weight:bold;margin:0;}</style></head><body>(Exam_Finish)</body></html>');
  document.close();
});
})();`;
  }

})();
