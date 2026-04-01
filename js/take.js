// ─── take.js — Live Online Exam Portal ────────────────────────
// Mirrors the offline quiz file exactly, connected to Firebase.
// Students are isolated — no access to builder interface.

(function() {
  // ─── Utilities ──────────────────────────────
  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatTime(ms) {
    var s = Math.floor((ms / 1000) % 60);
    var m = Math.floor(ms / 60000);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  var encode = function(str) {
    var h = 0x811c9dc5;
    var s = String(str).toLowerCase().trim();
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  function shuffle(a) {
    var c = a.length, t, r;
    while (c) {
      r = Math.floor(Math.random() * c--);
      t = a[c]; a[c] = a[r]; a[r] = t;
    }
    return a;
  }

  // ─── State ──────────────────────────────
  var EXAM_ID = new URLSearchParams(window.location.search).get('id');
  var db = null;
  var examMeta = null;
  var masterChallenges = [];

  var state = {
    playerName: '',
    startTime: 0,
    gameChallenges: [],
    currentIndex: 0,
    totalScore: 0,
    maxScore: 0,
    isArabic: false,
    ended: false,
    attempts: 0
  };

  var screens = {
    start: $('start-screen'),
    game: $('game-screen'),
    result: $('result-screen'),
    confirm: $('confirm-modal')
  };

  var els = {
    nameInput: $('player-name'),
    sidebar: $('sidebar-levels'),
    cardTopic: $('card-topic'),
    cardText: $('card-text'),
    answerArea: $('answer-area'),
    alertBox: $('alert-box')
  };

  // Exam mode variables
  var _examActive = false;
  var _overlay = null;
  var _focusPollInterval = null;
  var _keyBlocker = null;
  var _examTimerInterval = null;
  var _examEndTime = 0;

  // ─── Screen Management ──────────────────────────────
  function showScreen(n) {
    Object.values(screens).forEach(function(s) { if (s) s.classList.remove('active'); });
    if (screens[n]) screens[n].classList.add('active');
  }

  function showAlert(msg, ok) {
    els.alertBox.textContent = msg;
    els.alertBox.className = 'alert-msg ' + (ok ? 'success' : 'error');
    clearTimeout(els.alertBox._t);
    els.alertBox._t = setTimeout(function() { els.alertBox.className = 'alert-msg'; }, 2200);
  }

  function showError(msg) {
    $('error-msg').textContent = msg;
    $('error-modal').style.display = 'flex';
  }

  $('btn-error-close').addEventListener('click', function() {
    $('error-modal').style.display = 'none';
  });

  // ─── Theme Toggle ──────────────────────────────
  var btnTheme = $('btn-theme');
  if (btnTheme) {
    if (localStorage.getItem('__theme') === 'light') { document.body.classList.add('light'); btnTheme.textContent = 'Dark Mode'; }
    btnTheme.addEventListener('click', function() {
      document.body.classList.toggle('light');
      var isLight = document.body.classList.contains('light');
      btnTheme.textContent = isLight ? 'Dark Mode' : 'Light Mode';
      localStorage.setItem('__theme', isLight ? 'light' : 'dark');
    });
  }

  // ─── Translation ──────────────────────────────
  function updateQuestionText() {
    var ch = state.gameChallenges[state.currentIndex];
    if (!ch) return;
    var btn = $('btn-translate');
    if (state.isArabic && ch.qAr) {
      els.cardText.textContent = ch.qAr;
      els.cardText.classList.add('rtl-text');
      btn.textContent = 'English';
    } else {
      els.cardText.textContent = ch.q;
      els.cardText.classList.remove('rtl-text');
      btn.textContent = 'Translate to Arabic';
    }
  }

  $('btn-translate').addEventListener('click', function() {
    state.isArabic = !state.isArabic;
    updateQuestionText();
  });

  // ─── Initialization ───────────────────────
  window.addEventListener('DOMContentLoaded', async function() {
    if (!EXAM_ID) {
      showError("No Exam ID provided in the URL. Please use the link your instructor shared.");
      return;
    }
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      showError("Firebase is not configured. Please contact your instructor.");
      return;
    }

    db = firebase.database();

    try {
      var snapshot = await db.ref('exams/' + EXAM_ID).once('value');
      if (!snapshot.exists()) {
        showError("This exam session does not exist or has been deleted by the instructor.");
        return;
      }

      var payload = snapshot.val();
      if (payload.meta.status !== 'active') {
        showError("This exam session has ended and is no longer accepting students.");
        return;
      }

      examMeta = payload.meta;
      masterChallenges = payload.challenges || [];

      // Apply user-select lock
      if (examMeta.lockCopyPaste) {
        document.body.style.userSelect = 'none';
      }

      // Setup Join Screen
      $('join-title').textContent = examMeta.title || 'Live Exam';
      if (examMeta.passHash) {
        $('join-pass-container').style.display = 'block';
      }

      // Listen for instructor force-ending the exam
      db.ref('exams/' + EXAM_ID + '/meta/status').on('value', function(snap) {
        if (snap.val() === 'ended' && !state.ended && state.playerName) {
          finishTest(true);
        } else if (snap.val() === 'ended' && !state.playerName) {
          showError("This exam session has been ended by the instructor.");
        }
      });

    } catch (e) {
      showError("Network error: " + e.message);
    }
  });

  // ─── Start Exam (Join) ──────────────────────────────
  $('btn-start').addEventListener('click', async function() {
    var name = els.nameInput.value.trim();
    if (!name) return showError('Please enter your name to begin.');

    if (examMeta.passHash) {
      var pInput = $('exam-pass');
      if (!pInput || encode(pInput.value) !== examMeta.passHash) return showError('Incorrect exam password.');
    }

    // Disable button with loading state
    $('btn-start').disabled = true;
    $('btn-start').innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;margin:0;"></div> Connecting...';

    try {
      var userRef = db.ref('exams/' + EXAM_ID + '/students/' + name);
      var snap = await userRef.once('value');

      if (snap.exists()) {
        $('btn-start').disabled = false;
        $('btn-start').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Exam';
        return showError('The name "' + name + '" is already taken. Please use a different name or your full name.');
      }

      // Register in Firebase
      await userRef.set({
        status: 'active',
        score: 0,
        timeElapsed: 0,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (e) {
      $('btn-start').disabled = false;
      $('btn-start').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Exam';
      return showError('Connection error: ' + e.message);
    }

    // ─── Setup Game ──────────────────────────────
    state.attempts = (state.attempts || 0) + 1;
    state.playerName = name;
    $('display-name').textContent = 'Student: ' + name;
    $('brand-title').textContent = examMeta.title || 'EXAM';

    var shuffled = shuffle(masterChallenges.slice());
    state.maxScore = shuffled.reduce(function(s, c) { return s + (c.points || 10); }, 0);
    state.gameChallenges = shuffled.map(function(c, i) {
      return Object.assign({}, c, {
        displayLevel: i + 1,
        status: 'open',
        pointsPotential: c.points || 10,
        studentAnswer: ''
      });
    });
    state.totalScore = 0;
    state.isArabic = false;
    state.startTime = Date.now();

    renderSidebar();
    if (state.gameChallenges.length > 0) {
      loadChallenge(0);
      showScreen('game');
      setupSecurity();
      setupTimer();
    } else {
      showError('This exam contains no questions! Please contact the instructor.');
    }
  });

  // Allow pressing Enter on name/password field
  $('player-name').addEventListener('keypress', function(e) { if (e.key === 'Enter') $('btn-start').click(); });
  if ($('exam-pass')) $('exam-pass').addEventListener('keypress', function(e) { if (e.key === 'Enter') $('btn-start').click(); });

  // ─── Sidebar with Progress ──────────────────────────────
  function renderSidebar() {
    els.sidebar.innerHTML = '';
    var solvedCount = 0;
    var totalCount = state.gameChallenges.length;

    state.gameChallenges.forEach(function(ch, idx) {
      if (ch.status === 'solved' || ch.status === 'answered') solvedCount++;
      var btn = document.createElement('button');
      btn.className = 'level-btn';
      if (ch.status === 'open') btn.classList.add('unlocked');
      if (ch.status === 'solved') btn.classList.add('solved');
      if (ch.status === 'answered') { btn.classList.add('solved'); btn.style.borderLeftColor = 'var(--accent-warning)'; }
      if (idx === state.currentIndex) btn.classList.add('active-level');
      btn.innerHTML = '<span>Question ' + ch.displayLevel + '</span><span class="icon" style="width:6px;height:6px;border-radius:50%;display:inline-block;"></span>';
      btn.addEventListener('click', function() { loadChallenge(idx); });
      els.sidebar.appendChild(btn);
    });

    // Progress bar at the bottom of sidebar
    var progressDiv = document.createElement('div');
    progressDiv.className = 'sidebar-progress';
    var pct = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
    progressDiv.innerHTML = '<div class="sidebar-progress-bar"><div class="sidebar-progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<div class="sidebar-progress-text">' + solvedCount + ' / ' + totalCount + ' answered (' + pct + '%)</div>';
    els.sidebar.appendChild(progressDiv);
  }

  // ─── Load Challenge ──────────────────────────────
  function loadChallenge(index) {
    state.currentIndex = index;
    var ch = state.gameChallenges[index];
    els.cardTopic.textContent = ch.topic;
    updateQuestionText();

    var isSolved = ch.status === 'solved';
    $('btn-submit').disabled = isSolved;

    els.answerArea.innerHTML = '';
    if (ch.type === 'mcq') {
      var mcqContainer = document.createElement('div');
      mcqContainer.style = 'display:flex;flex-direction:column;gap:12px;';
      var opts = ch.options || [];
      var shuffledOpts = shuffle(opts.slice());
      shuffledOpts.forEach(function(o) {
        var lbl = document.createElement('label');
        lbl.style = 'display:flex;align-items:center;padding:12px 16px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:var(--radius-md);cursor:' + (isSolved ? 'default' : 'pointer') + ';transition:all 0.2s ease;';
        // Hover effect via JS
        if (!isSolved) {
          lbl.addEventListener('mouseenter', function() { lbl.style.borderColor = 'var(--border-glow)'; lbl.style.background = 'rgba(88,166,255,.04)'; });
          lbl.addEventListener('mouseleave', function() { lbl.style.borderColor = 'var(--border-color)'; lbl.style.background = 'var(--panel-hover)'; });
        }
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = 'student-mcq';
        r.value = o.text;
        r.style = 'margin-right:12px;width:18px;height:18px;accent-color:var(--accent-primary);flex-shrink:0;';
        if (isSolved) r.disabled = true;
        if (ch.studentAnswer === o.text) r.checked = true;
        lbl.appendChild(r);
        var spn = document.createElement('span');
        spn.style = 'font-size:15px;color:var(--text-bright);line-height:1.5;';
        spn.textContent = o.text;
        lbl.appendChild(spn);
        mcqContainer.appendChild(lbl);
      });
      els.answerArea.appendChild(mcqContainer);
    } else {
      // Flag / text type
      var p = ch.format || 'Enter your exact answer...';
      
      var attachmentHtml = '';
      if (ch.attachment && ch.attachment.data) {
        attachmentHtml = '<div style="margin-bottom:20px;padding:16px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:12px;overflow:hidden;">' +
          '<div style="width:36px;height:36px;flex-shrink:0;border-radius:8px;background:rgba(88,166,255,.1);display:flex;align-items:center;justify-content:center;color:var(--accent-primary);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></div>' +
          '<div style="overflow:hidden;"><div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text-bright);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(ch.attachment.name) + '</div><div style="font-size:10px;color:var(--text-muted);">' + escHtml(ch.attachment.type || 'Attached File') + '</div></div>' +
          '</div>' +
          '<a href="' + ch.attachment.data + '" download="' + escHtml(ch.attachment.name) + '" style="flex-shrink:0;padding:8px 14px;background:var(--accent-primary);color:#fff;text-decoration:none;border-radius:4px;font-size:11px;font-weight:700;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:6px;transition:all .2s;box-shadow:0 0 15px rgba(88,166,255,.2);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download</a>' +
          '</div>';
      }

      els.answerArea.innerHTML = attachmentHtml + '<div class="flag-input-wrapper"><input type="text" id="flag-input" autocomplete="off" spellcheck="false" placeholder="' + escHtml(p) + '"></div>' +
        (ch.hint ? '<div style="margin-top:12px;text-align:center;"><span style="font-size:13px;padding:6px 14px;background:var(--panel-hover);border:1px solid var(--border-color);border-radius:6px;color:var(--text-bright);box-shadow:inset 0 1px 3px rgba(0,0,0,0.2);">💡 Hint: ' + escHtml(ch.hint) + '</span></div>' : '');
      var fi = $('flag-input');
      if (isSolved) { fi.value = '[Already Solved]'; fi.disabled = true; }
      else { fi.value = ch.studentAnswer || ''; fi.focus(); }
      if (examMeta.lockCopyPaste) {
        fi.addEventListener('paste', function(e) { e.preventDefault(); });
      }
      fi.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') $('btn-submit').click();
      });
    }

    renderSidebar();
  }

  // ─── Proceed To Next ──────────────────────────────
  function proceedToNext() {
    var nextIdx = state.gameChallenges.findIndex(function(c, i) { return i > state.currentIndex && c.status !== 'solved'; });
    if (nextIdx !== -1) { loadChallenge(nextIdx); }
    else { loadChallenge(state.currentIndex); }
  }

  // ─── Submit Answer ──────────────────────────────
  $('btn-submit').addEventListener('click', function() {
    var ch = state.gameChallenges[state.currentIndex];
    if (ch.status === 'solved') return showAlert('Already solved.', true);

    var ans = '';
    if (ch.type === 'mcq') {
      var selected = document.querySelector('input[name="student-mcq"]:checked');
      if (!selected) return showAlert('Please select an option.', false);
      ans = selected.value;
      ch.studentAnswer = ans;
      ch.status = 'answered';
      showAlert('Answer recorded.', true);
      $('btn-submit').disabled = true;
      setTimeout(proceedToNext, 800);
    } else {
      ans = $('flag-input').value;
      if (!ans.trim()) return showAlert('Please enter an answer.', false);
      ch.studentAnswer = ans;
      if (encode(ans) === ch.hash) {
        state.totalScore += ch.pointsPotential;
        ch.status = 'solved';
        showAlert('Answer accepted.', true);
        $('btn-submit').disabled = true;
        $('flag-input').disabled = true;
        setTimeout(proceedToNext, 800);
      } else {
        showAlert('Incorrect answer. Try again.', false);
      }
    }

    syncToFirebase();
  });

  function syncToFirebase() {
    if (!db || !state.playerName) return;
    var elapsed = Date.now() - state.startTime;
    db.ref('exams/' + EXAM_ID + '/students/' + state.playerName).update({
      score: state.totalScore,
      timeElapsed: elapsed
    }).catch(function() {});
  }

  // ─── Finish Test ──────────────────────────────
  function finishTest(forced) {
    if (state.ended) return;
    state.ended = true;
    var elapsed = Date.now() - state.startTime;

    // Clear timer
    if (_examTimerInterval) { clearInterval(_examTimerInterval); _examTimerInterval = null; }

    // 1. Calculate final score
    state.totalScore = 0;
    state.gameChallenges.forEach(function(ch) {
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

    var scorePercent = state.maxScore > 0 ? Math.round((state.totalScore / state.maxScore) * 100) : 0;
    var gradeColor = scorePercent >= 80 ? 'var(--accent-success)' : scorePercent >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)';

    // 2. Build Results HTML — NO teacher password lock, NO builder link
    var resHTML = '';

    // Score circle
    resHTML += '<div style="margin:20px auto;width:120px;height:120px;border-radius:50%;border:3px solid ' + gradeColor + ';display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 30px ' + gradeColor.replace('var(', 'rgba(').replace(')', ',.2)') + ';">' +
      '<span style="font-size:28px;font-weight:800;color:' + gradeColor + ';font-family:var(--font-mono);">' + scorePercent + '%</span>' +
      '<span style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:1px;">Score</span>' +
      '</div>';

    resHTML += '<div style="display:flex;justify-content:center;margin-bottom:24px;">' +
      '<table style="width:100%;max-width:450px;border-collapse:collapse;background:var(--panel-hover);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md);">' +
      '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;width:50%;">Student</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">' + escHtml(state.playerName) + '</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Time Elapsed</th><td style="padding:14px 20px;text-align:right;font-weight:600;color:var(--text-bright);">' + formatTime(elapsed) + '</td></tr>' +
      '<tr style="border-bottom:1px solid var(--border-color);"><th style="padding:14px 20px;text-align:left;color:var(--text-muted);font-weight:500;">Final Score</th><td id="final-score-display" style="padding:14px 20px;text-align:right;font-weight:600;color:' + gradeColor + ';font-size:16px;">' + Number(state.totalScore.toFixed(2)) + ' / ' + Number(state.maxScore.toFixed(2)) + ' pts</td></tr>' +
      '</table></div>';

    // 3. Detailed Results
    resHTML += '<div style="margin-top:24px;text-align:left;"><h3 style="font-size:18px;margin-bottom:12px;color:var(--text-bright);border-bottom:1px solid var(--border-color);padding-bottom:8px;">Detailed Results</h3>' +
      '<div style="max-height:400px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-md);box-shadow:0 10px 30px rgba(0,0,0,0.2);background:var(--panel-hover);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;text-align:left;">' +
      '<thead style="position:sticky;top:0;background:var(--panel-bg);box-shadow:0 1px 0 var(--border-color);z-index:10;">' +
        '<tr><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:8%">#</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:27%">Topic</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:45%">Your Answer</th><th style="padding:12px 16px;color:var(--text-muted);font-weight:600;width:20%">Status</th></tr>' +
      '</thead><tbody>';

    state.gameChallenges.forEach(function(ch) {
      var statusIcon;
      if (ch.status === 'solved') {
        statusIcon = '<span style="color:var(--accent-success)">● Correct</span>';
      } else if (ch.status === 'incorrect' || ch.status === 'answered') {
        statusIcon = '<span style="color:var(--accent-danger)">○ Incorrect</span>';
      } else {
        statusIcon = '<span style="color:var(--text-muted)">○ Unsolved</span>';
      }

      resHTML += '<tr style="border-bottom:1px solid var(--border-color);">' +
        '<td style="padding:12px 16px;font-weight:600;color:var(--text-bright);">' + ch.displayLevel + '</td>' +
        '<td style="padding:12px 16px;">' + escHtml(ch.topic) + '</td>' +
        '<td style="padding:12px 16px;"><div style="font-family:var(--font-mono);font-size:12px;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;white-space:pre-wrap;max-height:120px;overflow-y:auto;">' + (ch.studentAnswer ? escHtml(ch.studentAnswer) : '<i style="color:var(--text-muted)">No Answer Provided</i>') + '</div></td>' +
        '<td style="padding:12px 16px;">' + statusIcon + '</td>' +
        '</tr>';
    });

    resHTML += '</tbody></table></div></div>';

    // Force-ended notice
    if (forced) {
      resHTML += '<div style="margin-top:20px;padding:14px 20px;background:rgba(227,179,65,.08);border:1px solid rgba(227,179,65,.25);border-radius:var(--radius-md);text-align:center;">' +
        '<span style="color:var(--accent-warning);font-size:13px;font-weight:600;">⚠ The instructor has ended the exam session. Your progress was automatically saved.</span></div>';
    }

    // Closed message — student is isolated from builder
    resHTML += '<p style="margin-top:20px;font-size:11px;color:var(--text-muted);text-align:center;font-family:var(--font-mono);">You may close this window. Your instructor will review the results.</p>';

    var resultModal = document.querySelector('#result-screen .modal-box');
    resultModal.innerHTML = '<h1>Exam Complete</h1>' + resHTML;

    $('confirm-modal').style.display = 'none';
    showScreen('result');

    // Final sync to Firebase
    if (db && state.playerName) {
      db.ref('exams/' + EXAM_ID + '/students/' + state.playerName).update({
        score: state.totalScore,
        timeElapsed: elapsed,
        status: 'finished'
      }).catch(function() {});
    }

    // Deactivate all exam protections
    _examActive = false;
    if (_focusPollInterval) { cancelAnimationFrame(_focusPollInterval); _focusPollInterval = null; }
    var ov = $('anti-screenshot-overlay');
    if (ov) ov.style.display = 'none';
    document.body.classList.remove('exam-locked');
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (e) {}
  }

  // ─── Early Finish / Confirm Modal ──────────────────────────────
  $('btn-early-finish').addEventListener('click', function() {
    $('confirm-modal').style.display = 'flex';
  });
  $('btn-confirm-no').addEventListener('click', function() {
    $('confirm-modal').style.display = 'none';
  });
  $('btn-confirm-yes').addEventListener('click', function() { finishTest(); });

  // ─── Security Setup ──────────────────────────────
  function setupSecurity() {
    // Anti-debugger
    setInterval(function() { Function("debugger")(); }, 50);

    // Lock copy/paste
    if (examMeta.lockCopyPaste) {
      document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
      document.addEventListener('copy', function(e) { e.preventDefault(); });
      document.addEventListener('cut', function(e) { e.preventDefault(); });
      document.addEventListener('paste', function(e) { e.preventDefault(); });
    }

    // Dev tools block
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && 'IJC'.includes(e.key))) e.preventDefault();
    });

    // Full exam mode (strict)
    if (examMeta.examMode) {
      _examActive = true;
      _overlay = $('anti-screenshot-overlay');

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
        if (req) { try { req.call(el); } catch (e) {} }
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

      // Layer 1: Visibility API
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) _lockScreen(); else _unlockScreen();
      });

      // Layer 2: blur/focus
      window.addEventListener('blur', function() { _lockScreen(); });
      window.addEventListener('focus', function() { _unlockScreen(); });

      // Layer 3: RAF loop (60fps focus check)
      (function _rafCheck() {
        if (!_examActive) return;
        if (!document.hasFocus() || document.hidden) { _lockScreen(); }
        _focusPollInterval = requestAnimationFrame(_rafCheck);
      })();

      // Layer 4: mouseleave (snipping tool detection)
      document.addEventListener('mouseleave', function() { if (_examActive) _lockScreen(); });
      document.addEventListener('mouseenter', function() { if (_examActive && document.hasFocus()) _unlockScreen(); });

      // Layer 5: fullscreenchange
      document.addEventListener('fullscreenchange', function() { if (!document.fullscreenElement && _examActive) _lockScreen(); });
      document.addEventListener('webkitfullscreenchange', function() { if (!document.webkitFullscreenElement && _examActive) _lockScreen(); });

      // Overlay click: resume
      if (_overlay) {
        _overlay.addEventListener('click', function() {
          _enterFS();
          setTimeout(_unlockScreen, 300);
        });
      }

      // Key Blocker: F11, Escape, Mac screenshots
      _keyBlocker = function(e) {
        if (e.key === 'F11') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false; }
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          setTimeout(function() { if (_examActive) { _lockScreen(); _enterFS(); } }, 80);
          return false;
        }
        if (e.metaKey && e.shiftKey && '345sS'.includes(e.key)) { e.preventDefault(); _lockScreen(); showAlert('Screenshots are not allowed during this exam.', false); }
      };
      document.addEventListener('keydown', _keyBlocker, true);
      window.addEventListener('keydown', _keyBlocker, true);
      document.addEventListener('keyup', function(e) {
        if ((e.key === 'F11' || e.key === 'Escape') && _examActive) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);

      // Fullscreen primary defense (fires no matter how student exited)
      function _onFsChange() {
        if (!_examActive) return;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          _lockScreen(); _enterFS();
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
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('').catch(function() {});
            var d = document.createElement('textarea'); d.value = '';
            document.body.appendChild(d); d.select();
            try { document.execCommand('copy'); } catch(ex) {}
            document.body.removeChild(d);
          } catch (ex) {}
          showAlert('Screenshots are not allowed during this exam.', false);
        }
      });
    }
  }

  // ─── Timer Setup ──────────────────────────────
  function setupTimer() {
    if (!examMeta.enableTimer) return;

    var durationMs = (examMeta.timerMinutes || 60) * 60 * 1000;
    _examEndTime = Date.now() + durationMs;
    var timerEl = $('exam-timer');
    timerEl.style.display = 'block';

    function updateTimer() {
      var remaining = _examEndTime - Date.now();
      if (remaining <= 0) {
        clearInterval(_examTimerInterval);
        timerEl.textContent = '00:00';
        finishTest();
        return;
      }
      var totalSecs = Math.floor(remaining / 1000);
      var m = Math.floor(totalSecs / 60);
      var s = totalSecs % 60;
      timerEl.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
      if (remaining <= 60000 && !timerEl.classList.contains('danger')) {
        timerEl.classList.add('danger');
      }
    }
    updateTimer();
    _examTimerInterval = setInterval(updateTimer, 1000);
  }

})();
