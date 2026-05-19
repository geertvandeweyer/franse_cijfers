'use strict';

// ── globals ────────────────────────────────────────────────────────────────
const tracker = new RepetitionTracker();
const speech  = new SpeechChecker();

let currentNumber = null;
let mode          = 'speech';   // 'spelling' | 'speech'
let rangeMin      = 1;
let rangeMax      = 1000;
let isListening   = false;
let awaitingNext  = false;
let sessionCorrect    = 0;
let sessionAttempts   = 0;
let streak            = 0;
let sessionBestStreakSpelling  = 0;  // highest streak this session – spelling
let sessionBestStreakSpeech    = 0;  // highest streak this session – speech
let sessionBestStreakListening = 0;  // highest streak this session – listening
let nextTimer         = null;
let retryCount      = 0;   // resets per question; >0 → use relaxed audio constraints
let listenTimeout   = 5;   // seconds; configurable via #listen-timeout
const MIN_STREAK    = 5;   // minimum streak to qualify for ranking
let listenTimer     = null; // setTimeout handle for hard abort
let speechReady     = false; // true after first Start click in speech mode

// ── DOM refs ───────────────────────────────────────────────────────────────
const numberDisplay    = document.getElementById('number-display');
const feedbackEl       = document.getElementById('feedback');
const micBtn           = document.getElementById('mic-btn');
const spellingInput    = document.getElementById('spelling-input');
const spellingForm     = document.getElementById('spelling-form');
const modeSpeechBtn    = document.getElementById('mode-speech');
const modeSpellingBtn  = document.getElementById('mode-spelling');
const rangeMinEl       = document.getElementById('range-min');
const rangeMaxEl       = document.getElementById('range-max');
const statsEl          = document.getElementById('stats');
const streakEl         = document.getElementById('streak');
const hardestSection   = document.getElementById('hardest-section');
const hardestList      = document.getElementById('hardest-list');
const resetBtn          = document.getElementById('reset-btn');
const leaderboardBtn    = document.getElementById('leaderboard-btn');
const namePromptEl      = document.getElementById('name-prompt');
const namePromptMsgEl   = document.getElementById('name-prompt-msg');
const namePromptInputEl = document.getElementById('name-prompt-input');
const namePromptSaveEl  = document.getElementById('name-prompt-save');
const namePromptErrorEl = document.getElementById('name-prompt-error');
const browserWarning    = document.getElementById('browser-warning');
const replayBtn        = document.getElementById('replay-btn');
const nextBtn          = document.getElementById('next-btn');
const retryBtn         = document.getElementById('retry-btn');
const listenTimeoutEl  = document.getElementById('listen-timeout');
const modListeningBtn    = document.getElementById('mode-listening');
const listeningForm      = document.getElementById('listening-form');
const listeningInput     = document.getElementById('listening-input');
const listeningReplayBtn = document.getElementById('listening-replay-btn');

// ── preferences (localStorage) ────────────────────────────────────────────
function loadPrefs() {
  mode          = localStorage.getItem('fc_mode')     || 'spelling';
  rangeMin      = parseInt(localStorage.getItem('fc_rangeMin'))     || 1;
  rangeMax      = parseInt(localStorage.getItem('fc_rangeMax'))     || 1000;
  listenTimeout = parseInt(localStorage.getItem('fc_listenTimeout')) || 5;
  rangeMinEl.value        = rangeMin;
  rangeMaxEl.value        = rangeMax;
  listenTimeoutEl.value   = listenTimeout;
  applyMode(false);
}

function savePrefs() {
  localStorage.setItem('fc_mode',           mode);
  localStorage.setItem('fc_rangeMin',       rangeMin);
  localStorage.setItem('fc_rangeMax',       rangeMax);
  localStorage.setItem('fc_listenTimeout',  listenTimeout);
}

// ── mode switching ─────────────────────────────────────────────────────────
function applyMode(save = true) {
  const isSpeech    = mode === 'speech';
  const isListening = mode === 'listening';
  modeSpeechBtn.classList.toggle('active',    isSpeech);
  modeSpellingBtn.classList.toggle('active',  mode === 'spelling');
  modListeningBtn.classList.toggle('active',  isListening);
  document.getElementById('speech-area').hidden    = !isSpeech;
  document.getElementById('spelling-area').hidden  = (mode !== 'spelling');
  document.getElementById('listening-area').hidden = !isListening;
  document.body.classList.toggle('mode-speech',    isSpeech);
  document.body.classList.toggle('mode-listening', isListening);

  if (isSpeech && !speech.supported) {
    browserWarning.hidden = false;
  } else {
    browserWarning.hidden = true;
  }
  if (!isSpeech) speech.abort();  // stop any in-progress recording when leaving speech mode
  if (save) { streak = 0; savePrefs(); updateStats(); }
}

modeSpeechBtn.addEventListener('click', () => {
  if (mode === 'speech') return;
  mode = 'speech';
  speechReady = false;
  applyMode();
  nextQuestion();
});

modeSpellingBtn.addEventListener('click', () => {
  if (mode === 'spelling') return;
  mode = 'spelling';
  applyMode();
  nextQuestion();
});

modListeningBtn.addEventListener('click', () => {
  if (mode === 'listening') return;
  mode = 'listening';
  applyMode();
  nextQuestion();
});

// ── range inputs ───────────────────────────────────────────────────────────
function applyRange() {
  let lo = parseInt(rangeMinEl.value) || 1;
  let hi = parseInt(rangeMaxEl.value) || 1000;
  lo = Math.max(1,    Math.min(lo, 999));
  hi = Math.min(1000, Math.max(hi, lo + 1));
  rangeMin = lo;
  rangeMax = hi;
  rangeMinEl.value = lo;
  rangeMaxEl.value = hi;
  savePrefs();
  nextQuestion();
}

rangeMinEl.addEventListener('change', applyRange);
rangeMaxEl.addEventListener('change', applyRange);

listenTimeoutEl.addEventListener('change', () => {
  const v = parseInt(listenTimeoutEl.value);
  listenTimeout = Math.max(2, Math.min(15, isNaN(v) ? 5 : v));
  listenTimeoutEl.value = listenTimeout;
  savePrefs();
});

// ── question flow ──────────────────────────────────────────────────────────
function nextQuestion() {
  clearTimeout(nextTimer);
  awaitingNext = false;
  if (isListening) { speech.abort(); isListening = false; }

  currentNumber = tracker.nextNumber(rangeMin, rangeMax);
  numberDisplay.classList.remove('pop');

  feedbackEl.textContent = '';
  feedbackEl.className   = 'feedback';
  spellingInput.value    = '';
  replayBtn.hidden = true;
  nextBtn.hidden   = true;
  retryBtn.hidden  = true;
  retryCount       = 0;
  micBtn.disabled  = false;

  if (mode === 'speech' && !speechReady) {
    // Show "Start" screen: number stays hidden until user clicks Start
    numberDisplay.textContent = '—';
    micBtn.textContent = '▶ Start';
    micBtn.hidden      = false;
  } else if (mode === 'listening') {
    numberDisplay.textContent = '🔊';
    listeningInput.value = '';
    listeningInput.disabled = false;
    listeningReplayBtn.disabled = false;
    speech.speak(toFrenchBelgian(currentNumber));
    listeningInput.focus();
  } else {
    numberDisplay.textContent = currentNumber;
    void numberDisplay.offsetWidth;
    numberDisplay.classList.add('pop');
    if (mode === 'speech') {
      micBtn.hidden = true;
      requestAnimationFrame(() => doListen());
    } else {
      focusInput();
    }
  }
  updateStats();
}

function focusInput() {
  if (mode === 'spelling')  spellingInput.focus();
  if (mode === 'listening') listeningInput.focus();
}

// ── result handling ────────────────────────────────────────────────────────
// debugInfo = { transcript: string, similarity: number } — only in speech mode
function handleResult(isCorrect, debugInfo = null) {
  if (awaitingNext) return;

  tracker.recordResult(currentNumber, isCorrect);
  sessionAttempts++;
  const expected = toFrenchBelgian(currentNumber);

  let html = '';
  if (isCorrect) {
    sessionCorrect++;
    if (retryCount > 0) {
      // Correct after retry: record as correct but don't advance streak
      html = `✅ Correct! <em>${expected}</em><div class="retry-note">🔄 Na herpoging — reeks blijft staan</div>`;
    } else {
      streak++;
      const prevBest = mode === 'spelling' ? sessionBestStreakSpelling
                     : mode === 'speech'   ? sessionBestStreakSpeech
                     :                      sessionBestStreakListening;
      if (streak > prevBest) {
        if (mode === 'spelling')       sessionBestStreakSpelling  = streak;
        else if (mode === 'speech')    sessionBestStreakSpeech    = streak;
        else                           sessionBestStreakListening = streak;
        checkLeaderboardPrompt();
      }
      html = `✅ Correct! <em>${expected}</em>`;
    }
    feedbackEl.className = 'feedback correct';
  } else {
    streak = 0;
    html = `❌ Fout &mdash; juist antwoord: <strong>${expected}</strong>`;
    feedbackEl.className = 'feedback wrong';
    if (mode === 'speech') speech.speak(expected);
    tracker.boostSimilar(currentNumber, rangeMin, rangeMax);
  }

  // Debug: show what was heard + similarity score
  if (debugInfo) {
    const pct   = Math.round(debugInfo.similarity * 100);
    const color = pct >= 80 ? '#166534' : pct >= 50 ? '#92400E' : '#991B1B';
    // Strip digit-hyphen-digit patterns ("8-18" → "818") for cleaner display
    const displayTranscript = escHtml(debugInfo.transcript.replace(/(\d)-(\d)/g, '$1$2'));
    html += `<div class="debug-info">Gehoord: "<em>${displayTranscript}</em>" &nbsp;&mdash;&nbsp; match: <span style="color:${color};font-weight:700">${pct}%</span></div>`;
  }
  feedbackEl.innerHTML = html;

  updateStats();
  awaitingNext = true;

  if (mode === 'speech') {
    micBtn.hidden   = true;   // hide until next question
    nextBtn.hidden  = false;
    retryBtn.hidden = true;
  } else {
    if (mode === 'listening') {
      listeningInput.disabled = true;
      listeningReplayBtn.disabled = true;
    }
    nextTimer = setTimeout(nextQuestion, isCorrect ? 1300 : 2800);
  }
}

// ── spelling mode ──────────────────────────────────────────────────────────
spellingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (awaitingNext) { nextQuestion(); return; }

  const raw      = spellingInput.value.trim().toLowerCase();
  if (!raw) return;
  const expected = toFrenchBelgian(currentNumber).toLowerCase();
  // Exact match: normalise only whitespace (hyphens are part of correct spelling)
  const normInput    = raw.replace(/\s+/g, ' ');
  const normExpected = expected.replace(/\s+/g, ' ');
  handleResult(normInput === normExpected);
});

// Allow tapping Enter when feedback is showing to go faster
spellingInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && awaitingNext) {
    e.preventDefault();
    clearTimeout(nextTimer);
    nextQuestion();
  }
});

// ── listening mode ───────────────────────────────────────────────────────
listeningForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (awaitingNext) { nextQuestion(); return; }
  const raw = (listeningInput.value || '').trim();
  if (!raw) return;
  handleResult(parseInt(raw, 10) === currentNumber);
});

listeningInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && awaitingNext) {
    e.preventDefault();
    clearTimeout(nextTimer);
    nextQuestion();
  }
});

listeningReplayBtn.addEventListener('click', () => {
  speech.speak(toFrenchBelgian(currentNumber));
});

// ── speech mode ────────────────────────────────────────────────────────────
nextBtn.addEventListener('click', nextQuestion);

function startListenAnimation() {
  feedbackEl.classList.remove('listen-active');
  void feedbackEl.offsetWidth;                          // restart animation
  feedbackEl.style.setProperty('--listen-dur', listenTimeout + 's');
  feedbackEl.classList.add('listen-active');
  // Hard abort after timeout so recognition actually stops
  listenTimer = setTimeout(() => speech.abort(), listenTimeout * 1000);
}

function stopListenAnimation() {
  clearTimeout(listenTimer);
  listenTimer = null;
  feedbackEl.classList.remove('listen-active');
}

async function doListen() {
  isListening = true;
  replayBtn.hidden = true;
  micBtn.classList.add('recording');
  micBtn.textContent = '⏹ Luisteren…';
  micBtn.hidden      = false;  // visible as stop button while recording
  feedbackEl.textContent = '🎤 Spreek nu…';
  feedbackEl.className   = 'feedback listening';
  startListenAnimation();

  try {
    const transcripts = await speech.listen();
    const expected    = toFrenchBelgian(currentNumber);
    const result      = speech.check(transcripts, expected);
    if (speech.getLastRecordingUrl()) replayBtn.hidden = false;
    handleResult(result.ok, { transcript: result.best || transcripts[0] || '(niets)', similarity: result.similarity });
  } catch (err) {
    if (speech.getLastRecordingUrl()) replayBtn.hidden = false;
    feedbackEl.className = 'feedback warning';
    if (err.message === 'not_supported') {
      feedbackEl.textContent = '⚠️ Spraakherkenning niet ondersteund. Gebruik Chrome of Edge.';
    } else if (err.message === 'audio-capture') {
      feedbackEl.innerHTML =
        '🎧 Microfoon niet beschikbaar. '        + '<strong>Bluetooth-conflict?</strong> Pauzeer Spotify even, '
        + 'of gebruik de ingebouwde microfoon.';
      retryBtn.hidden = false;
    } else if (err.message === 'no_speech') {
      feedbackEl.textContent = '🔇 Geen spraak gedetecteerd.';
      retryBtn.hidden = false;
    } else if (err.message === 'aborted') {
      feedbackEl.textContent = '';
      feedbackEl.className   = 'feedback';
      retryBtn.hidden = false;
    } else if (err.message !== '_suppress') {
      feedbackEl.textContent = `Fout bij opname (${err.message}).`;
      retryBtn.hidden = false;
    }
  } finally {
    stopListenAnimation();
    isListening = false;
    micBtn.classList.remove('recording');
    micBtn.textContent = '▶ Start';
    micBtn.hidden = true;
  }
}

micBtn.addEventListener('click', async () => {
  // While recording — act as stop button
  if (isListening) { speech.abort(); return; }
  if (awaitingNext) return;


  // First click: "Start" — reveal the number, then begin recording
  if (!speechReady) {
    speechReady = true;
    numberDisplay.textContent = currentNumber;
    numberDisplay.classList.remove('pop');
    void numberDisplay.offsetWidth;
    numberDisplay.classList.add('pop');
  }

  await doListen();
});

// ── retry button (no score impact) ────────────────────────────────────────
retryBtn.addEventListener('click', () => {
  retryCount++;
  retryBtn.hidden  = true;
  replayBtn.hidden = true;
  micBtn.hidden    = false;
  micBtn.disabled  = false;
  feedbackEl.textContent = '';
  feedbackEl.className   = 'feedback';
  micBtn.click();
});

// ── replay button ──────────────────────────────────────────────────────────
let replayAudio = null;
replayBtn.addEventListener('click', () => {
  const url = speech.getLastRecordingUrl();
  if (!url) return;
  if (replayAudio) { replayAudio.pause(); replayAudio = null; }
  replayAudio = new Audio(url);
  replayBtn.classList.add('playing');
  replayBtn.textContent = '⏹ Bezig…';
  replayAudio.onended = () => {
    replayBtn.classList.remove('playing');
    replayBtn.textContent = '▶ Replay';
    replayAudio = null;
  };
  replayAudio.play().catch(() => {
    replayBtn.classList.remove('playing');
    replayBtn.textContent = '▶ Replay';
  });
});

// ── stats & hardest list ───────────────────────────────────────────────────
function updateStats() {
  const pct = sessionAttempts > 0
    ? Math.round((sessionCorrect / sessionAttempts) * 100)
    : 0;
  statsEl.textContent  = `✓ ${sessionCorrect} / ${sessionAttempts}  (${pct}%)`;
  streakEl.textContent = streak >= 3 ? `🔥 ${streak}` : streak > 1 ? `⚡ ${streak}` : '';
  // Badge on leaderboard button when session qualifies for top 10
  leaderboardBtn.classList.toggle('has-badge',
    (qualifiesForTop10('spelling') || qualifiesForTop10('speech') || qualifiesForTop10('listening')) && !savedName);

  const { hardest } = tracker.getStats(rangeMin, rangeMax);
  if (hardest.length > 0) {
    hardestSection.hidden = false;
    hardestList.innerHTML = hardest.map(h => {
      const p = h.attempts > 0 ? Math.round((h.correct / h.attempts) * 100) : 0;
      return `<li>
        <span class="hard-num">${h.n}</span>
        <span class="hard-word">${toFrenchBelgian(h.n)}</span>
        <span class="hard-pct">${p}% goed</span>
      </li>`;
    }).join('');
  } else {
    hardestSection.hidden = true;
  }
}

// ── reset ──────────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  if (!confirm('Voortgang wissen voor de hele reeks 1–1000?')) return;
  tracker.reset(1, 1000);
  sessionCorrect             = 0;
  sessionAttempts            = 0;
  streak                     = 0;
  sessionBestStreakSpelling   = 0;
  sessionBestStreakSpeech     = 0;
  sessionBestStreakListening  = 0;
  savedName                  = '';
  speechReady              = false;
  namePromptEl.hidden      = true;
  nextQuestion();
});

// ── init ───────────────────────────────────────────────────────────────────
loadPrefs();
nextQuestion();

// ── disclaimer modal ───────────────────────────────────────────────────────
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalBody    = document.getElementById('modal-body');
const modalClose   = document.getElementById('modal-close');

const modalContents = {
  data: {
    title: 'ℹ️ Gegevensgebruik',
    html: `
      <p><strong>Spraakopnames</strong> worden <em>niet</em> lokaal bewaard na het sluiten van de pagina.</p>
      <p style="margin-top:10px">Bij gebruik van de <strong>Spraak-modus</strong> stuurt de browser je audiofragment naar de servers van
      <strong>Google</strong> (Web Speech API) voor herkenning. Dit is een service van Google Chrome/Edge;
      er is geen aparte account vereist.</p>
      <p style="margin-top:10px">In de <strong>Spelling-</strong> en <strong>Luisteren-modus</strong> verlaat er geen audio de browser.</p>
      <p style="margin-top:10px">Oefenvoortgang (gewichten) wordt opgeslagen in
      <strong>localStorage</strong> van je eigen browser — enkel op dit apparaat, niet in de cloud.</p>
      <p style="margin-top:10px">Bij het opslaan van een <strong>topscore</strong> worden je <strong>naam en reekslengte</strong>
      verstuurd naar en bewaard op de server van deze website (<code>api/stats.txt</code>).
      Gebruik geen echte naam als je dat liever niet hebt.</p>
      <p style="margin-top:10px">Daarnaast worden <strong>anonieme gebruiksstatistieken</strong> verzameld via
      <strong>Cloudflare Web Analytics</strong>: er worden <strong>geen cookies</strong> geplaatst en
      <strong>geen persoonlijke gegevens</strong> opgeslagen. Dit dient enkel om een algemeen
      overzicht te krijgen van het gebruik van de app.</p>
    `
  },
  auteur: {
    title: '✉️ Auteur',
    html: `
      <p><strong>Geert Vandeweyer</strong><br>
      <a href="mailto:geertvandeweyer@gmail.com">geertvandeweyer@gmail.com</a></p>
      <p style="margin-top:10px">Gemaakt in mei 2026</p>
      <p style="margin-top:10px">Disclaimer: Ontwikkeld met behulp van claude sonnet 4.6</p>
    `
  },
  koffie: {
    title: '☕ Buy me a coffee',
    html: `
      <p style="text-align:center">
        <a href="https://buymeacoffee.com/geertvandeweyer" target="_blank" rel="noopener">
          <img src="assets/img/qr-code.png" alt="QR-code Buy Me a Coffee" style="width:220px;height:220px;border-radius:8px">
        </a>
      </p>
      <p style="text-align:center;margin-top:12px">
        <a href="https://buymeacoffee.com/geertvandeweyer" target="_blank" rel="noopener" style="font-weight:bold">
          buymeacoffee.com/geertvandeweyer
        </a>
      </p>
      <p style="margin-top:12px;font-size:0.9em;color:#555">
        <strong>Buy Me a Coffee</strong> is een platform waarmee je een kleine bijdrage kunt geven
        aan de maker van een app of project — als bedankje, zonder verplichtingen.
        Scan de QR-code of klik de link hierboven.
      </p>
    `
  },
  licentie: {
    title: '📄 Licentie',
    html: `
      <p>Deze app is <strong>vrij te gebruiken, te kopiëren en aan te passen</strong>.</p>
      <p style="margin-top:10px">Gepubliceerd onder de
      <strong><a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT-licentie</a></strong>:
      je mag de broncode vrij hergebruiken, ook voor commerciële doeleinden, zolang de
      oorspronkelijke auteursnaam vermeld blijft.</p>
      <p style="margin-top:10px">Geen garanties van welke aard dan ook.</p>
    `
  }
};

function openModal(key) {
  if (key === 'leaderboard') { openLeaderboardModal(); return; }
  const content = modalContents[key];
  if (!content) return;
  modalTitle.textContent = content.title;
  modalBody.innerHTML    = content.html;
  modalOverlay.hidden    = false;
  modalClose.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
}

document.querySelectorAll('.disc-btn').forEach(btn => {
  btn.addEventListener('click', () => openModal(btn.dataset.modal));
});

modalClose.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
});

// ── leaderboard ────────────────────────────────────────────────────────────
let topEntries = { spelling: [], speech: [], listening: [] };  // fetched from server
let savedName  = '';

function qualifiesForTop10(m) {
  m = m || mode;
  const best = m === 'spelling' ? sessionBestStreakSpelling
             : m === 'speech'   ? sessionBestStreakSpeech
             :                   sessionBestStreakListening;
  if (best < MIN_STREAK) return false;
  const list = topEntries[m] || [];
  if (list.length < 10) return true;
  return best > list[list.length - 1].streak;
}

function validateName(name) {
  name = (name || '').trim();
  if (name.length < 2)  return 'Naam moet minstens 2 tekens zijn';
  if (name.length > 30) return 'Naam mag max. 30 tekens zijn';
  if (name.includes('@')) return 'Geen e-mailadressen toegestaan';
  // Block emojis / symbols outside Basic Latin + Latin Extended
  if (/[\u0250-\uFFFF]/u.test(name.replace(/[À-ÖØ-öø-ÿ]/g, ''))) {
    return 'Geen emoji\'s of speciale symbolen';
  }
  // Only letters (incl. accented), spaces, hyphens, apostrophes; start & end must be a letter
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' \-]*[A-Za-zÀ-ÖØ-öø-ÿ]$/u.test(name)) {
    return 'Alleen letters, spaties, koppeltekens en apostrofs';
  }
  return null;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  try {
    const [y, m, d] = iso.split('-');
    const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    return `${+d} ${months[+m - 1]} ${y}`;
  } catch (_) { return iso || ''; }
}

async function openLeaderboardModal() {
  modalTitle.textContent = '🏆 Toplijst';
  modalBody.innerHTML    = '<p style="text-align:center;padding:16px 0">Laden…</p>';
  modalOverlay.hidden    = false;

  try {
    const res = await fetch('api/stats.php');
    if (res.ok) {
      const data = await res.json();
      topEntries = (data && !Array.isArray(data)) ? data : { spelling: data || [], speech: [], listening: [] };
    }
  } catch (_) { /* offline — show cached */ }

  renderLeaderboardModal();
  modalClose.focus();
}

function renderLeaderboardModal() {
  const qualifies = qualifiesForTop10();
  let html = '';

  // ── save-score form (fallback als inline prompt niet gebruikt werd) ───────
  if (qualifies && !savedName) {
    const best = mode === 'spelling' ? sessionBestStreakSpelling
               : mode === 'speech'   ? sessionBestStreakSpeech
               :                      sessionBestStreakListening;
    const modeLabel = mode === 'spelling' ? 'spelling' : mode === 'speech' ? 'spraak' : 'luisteren';
    html += `
      <div id="lb-save-form">
        <p class="lb-intro">🎉 Je beste ${modeLabel}-reeks van <strong>${best}</strong>
          staat in de top&nbsp;10! Geef je naam in om hem op te slaan.</p>
        <div class="lb-name-row">
          <input type="text" id="lb-name-input" maxlength="30"
                 placeholder="Jouw naam…"
                 autocomplete="off" autocorrect="off"
                 autocapitalize="words" spellcheck="false">
          <button id="lb-save-btn" class="btn-primary">Opslaan</button>
        </div>
        <div id="lb-save-error" class="lb-error" aria-live="polite"></div>
      </div>`;
  }

  // ── spelling + spraak tabellen ───────────────────────────────────────────
  [['spelling', '⌨️ Spelling'], ['speech', '🎤 Spraak'], ['listening', '🔊 Luisteren']].forEach(([m, label]) => {
    html += `<div class="lb-mode-section"><h3 class="lb-mode-title">${label}</h3>`;
    const list = topEntries[m] || [];
    if (list.length === 0) {
      html += '<p class="lb-empty">Nog geen scores.</p>';
    } else {
      const medals = ['🥇','🥈','🥉'];
      const myBest = m === 'spelling' ? sessionBestStreakSpelling
                   : m === 'speech'   ? sessionBestStreakSpeech
                   :                   sessionBestStreakListening;
      html += '<table class="lb-table"><thead><tr>'
            + '<th>#</th><th>Naam</th><th>Reeks</th><th>Datum</th>'
            + '</tr></thead><tbody>';
      list.forEach((e, i) => {
        const isMe = savedName && e.name === savedName && e.streak === myBest;
        html += `<tr${isMe ? ' class="lb-me"' : ''}>
          <td class="lb-rank">${medals[i] ?? (i + 1)}</td>
          <td>${escHtml(e.name)}</td>
          <td class="lb-score">${e.streak}</td>
          <td class="lb-date">${escHtml(fmtDate(e.date))}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';
  });

  modalBody.innerHTML = html;

  // Wire save button (fallback)
  const saveBtn   = document.getElementById('lb-save-btn');
  const nameInput = document.getElementById('lb-name-input');
  const saveError = document.getElementById('lb-save-error');

  if (saveBtn) {
    nameInput.focus();
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
    saveBtn.addEventListener('click', async () => {
      const name = (nameInput.value || '').trim();
      const err  = validateName(name);
      if (err) { saveError.textContent = err; return; }
      saveError.textContent = '';
      saveBtn.disabled    = true;
      saveBtn.textContent = '…';
      await doSave(name);
      renderLeaderboardModal();
    });
  }
}

// ── leaderboard helpers ────────────────────────────────────────────────────
async function pushScore(m) {
  m = m || mode;
  if (!savedName) return;
  const best = m === 'spelling' ? sessionBestStreakSpelling
             : m === 'speech'   ? sessionBestStreakSpeech
             :                   sessionBestStreakListening;
  if (!qualifiesForTop10(m)) return;
  try {
    const res = await fetch('api/stats.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: savedName, streak: best, mode: m }),
    });
    if (res.ok) {
      const data = await res.json();
      topEntries = (data && !Array.isArray(data)) ? data : { spelling: data || [], speech: [], listening: [] };
      updateStats();
    }
  } catch (_) { /* silent */ }
}

async function doSave(name) {
  savedName = name;
  namePromptEl.hidden = true;
  if (qualifiesForTop10('spelling'))  await pushScore('spelling');
  if (qualifiesForTop10('speech'))    await pushScore('speech');
  if (qualifiesForTop10('listening')) await pushScore('listening');
  updateStats();
}

function checkLeaderboardPrompt() {
  if (!qualifiesForTop10()) return;
  if (savedName) { pushScore(); return; }
  const best = mode === 'spelling' ? sessionBestStreakSpelling
             : mode === 'speech'   ? sessionBestStreakSpeech
             :                      sessionBestStreakListening;
  const modeLabel = mode === 'spelling' ? 'spelling' : mode === 'speech' ? 'spraak' : 'luisteren';
  namePromptMsgEl.textContent =
    `🏆 Top-10 ${modeLabel}-reeks: ${best} op rij! Geef je naam:`;
  namePromptEl.hidden = false;
}

namePromptSaveEl.addEventListener('click', async () => {
  const name = (namePromptInputEl.value || '').trim();
  const err  = validateName(name);
  if (err) { namePromptErrorEl.textContent = err; return; }
  namePromptErrorEl.textContent = '';
  namePromptSaveEl.disabled    = true;
  namePromptSaveEl.textContent = '…';
  await doSave(name);
  namePromptSaveEl.disabled    = false;
  namePromptSaveEl.textContent = 'Opslaan';
});

namePromptInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') namePromptSaveEl.click();
});

leaderboardBtn.addEventListener('click', () => openLeaderboardModal());

// Warn user before leaving if they have an unsaved top-10 score
window.addEventListener('beforeunload', (e) => {
  if ((qualifiesForTop10('spelling') || qualifiesForTop10('speech') || qualifiesForTop10('listening')) && !savedName) {
    e.preventDefault();
    e.returnValue = '';  // triggers browser "Leave site?" dialog
  }
});

// Load initial leaderboard data silently on page load
(async () => {
  try {
    const res = await fetch('api/stats.php');
    if (res.ok) {
      const data = await res.json();
      topEntries = (data && !Array.isArray(data)) ? data : { spelling: data || [], speech: [], listening: [] };
    }
  } catch (_) { /* server may not be running yet */ }
})();
