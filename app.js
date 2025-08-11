const API_BASE = '/api';
const MOCK_MODE = false;

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

const elAnalyze = qs('#analyze-btn');
const elInput = qs('#mood-input');
const elStatus = qs('#status-pill');
const elConfBar = qs('#confidence-bar');
const elConfFill = qs('#confidence-fill');
const elMoodBadge = qs('#mood-badge');
const elResults = qs('#results');
const elSongsList = qs('#songs-list');
const elBookTip = qs('#book-tip');
const elPuzzleLink = qs('#puzzle-link');
const elLogPuzzle = qs('#log-puzzle-btn');
const elStreakInfo = qs('#streak-info');
const elLeaderboardBody = qs('#leaderboard-table tbody');
const elTimelineBody = qs('#timeline-table tbody');
const elTheme = qs('#toggle-theme');

let cachedMood = null;
let chart = null;

function setLoading(isLoading) {
  elAnalyze.classList.toggle('loading', isLoading);
  elAnalyze.disabled = isLoading;
}
function setStatus(text, kind = 'info') {
  elStatus.textContent = text;
  elStatus.classList.remove('ok','err','info');
  elStatus.classList.add(kind);
  elStatus.hidden = false;
}
function setConfidence(pct) {
  elConfBar.hidden = false;
  elConfFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}
function setMoodBadge(mood, confidence) {
  elMoodBadge.hidden = false;
  elMoodBadge.textContent = `Mood: ${mood} (${Math.round(confidence * 100)}%)`;
}

async function fetchJSON(path, opts = {}) {
  if (MOCK_MODE) return mockFetch(path, opts);
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${res.status} ${msg}`);
  }
  return res.json();
}

function mockFetch(path, opts) {
  if (path === '/analyze' && opts.method === 'POST') {
    return Promise.resolve({ mood: 'anxious', confidence: 0.83 });
  }
  if (path.startsWith('/songs')) {
    return Promise.resolve({
      tracks: [
        { name: 'Breathe', artist: 'Telepopmusik', url: 'https://open.spotify.com/track/0' },
        { name: 'Weightless', artist: 'Marconi Union', url: 'https://open.spotify.com/track/1' },
        { name: 'Sunrise', artist: 'Norah Jones', url: 'https://open.spotify.com/track/2' },
      ],
    });
  }
  if (path.startsWith('/book')) {
    return Promise.resolve({ tip: 'The Power of Now — Eckhart Tolle' });
  }
  if (path.startsWith('/puzzle')) {
    return Promise.resolve({ url: 'https://www.wordgames.com' });
  }
  if (path === '/journal' && opts.method === 'POST') {
    return Promise.resolve({ ok: true });
  }
  if (path.startsWith('/mood-timeline')) {
    return Promise.resolve({
      entries: [
        { date: '2025-08-08', mood: 'joy', text: 'Had a great walk!' },
        { date: '2025-08-09', mood: 'fear', text: 'Feeling anxious\nabout work' },
      ],
    });
  }
  if (path === '/streak/log' && opts.method === 'POST') {
    return Promise.resolve({ ok: true });
  }
  if (path.startsWith('/streak')) {
    return Promise.resolve({ streak: 4 });
  }
  if (path.startsWith('/leaderboard')) {
    return Promise.resolve({
      rows: [
        { user: 'player-02', streakDays: 5 },
        { user: 'User', streakDays: 4 },
        { user: 'player-01', streakDays: 2 },
      ],
    });
  }
  return Promise.reject(new Error('Mock path not found: ' + path));
}

async function analyzeMood(text) {
  return fetchJSON('/analyze', { method: 'POST', body: { text } });
}
async function getSongs(mood) {
  const q = new URLSearchParams({ mood });
  return fetchJSON('/songs?' + q.toString());
}
async function getBook(mood) {
  const q = new URLSearchParams({ mood });
  return fetchJSON('/book?' + q.toString());
}
async function getPuzzle(mood) {
  const q = new URLSearchParams({ mood });
  return fetchJSON('/puzzle?' + q.toString());
}
async function saveJournal(text, mood) {
  return fetchJSON('/journal', { method: 'POST', body: { text, mood } });
}
async function getTimeline() {
  return fetchJSON('/mood-timeline');
}
async function logStreak() {
  return fetchJSON('/streak/log', { method: 'POST', body: {} });
}
async function getStreak() {
  return fetchJSON('/streak');
}
async function getLeaderboard() {
  return fetchJSON('/leaderboard');
}

function renderSongs(tracks) {
  elSongsList.innerHTML = '';
  tracks.forEach((t) => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${t.url}" target="_blank" rel="noopener">${escapeHtml(t.name)} — ${escapeHtml(t.artist)}</a>`;
    elSongsList.appendChild(li);
  });
}
function renderBook(tip) {
  elBookTip.textContent = tip || 'No suggestion available.';
}
function renderPuzzle(url) {
  elPuzzleLink.href = url;
}
function renderStreak(streak) {
  elStreakInfo.textContent = `Current streak: ${streak} day${streak === 1 ? '' : 's'}`;
}
function renderLeaderboard(rows) {
  elLeaderboardBody.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(r.user)}</td><td>${r.streakDays}</td>`;
    elLeaderboardBody.appendChild(tr);
  });
}
function renderTimeline(entries) {
  elTimelineBody.innerHTML = '';
  entries.forEach((e) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(e.date)}</td><td>${escapeHtml(e.mood)}</td><td>${escapeHtml(e.text)}</td>`;
    elTimelineBody.appendChild(tr);
  });
  renderChart(entries);
}
function renderChart(entries) {
  const byDate = {};
  entries.forEach((e) => {
    byDate[e.date] = (byDate[e.date] || 0) + 1;
  });
  const labels = Object.keys(byDate).sort();
  const values = labels.map((d) => byDate[d]);
  const ctx = document.getElementById('mood-chart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Entries per day',
        data: values,
        fill: true,
        tension: 0.35,
        borderColor: '#7c9cff',
        backgroundColor: 'rgba(124,156,255,.18)',
        pointRadius: 3,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#a6b0d8' }, grid: { color: 'rgba(255,255,255,.06)' } },
        y: { ticks: { color: '#a6b0d8' }, grid: { color: 'rgba(255,255,255,.06)' }, beginAtZero: true, precision: 0 },
      },
    },
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function handleAnalyze() {
  const text = elInput.value.trim();
  if (!text) {
    setStatus('Please enter how you feel first.', 'err');
    return;
  }
  setLoading(true);
  setStatus('Analyzing mood...');
  elResults.hidden = true;
  try {
    const { mood, confidence } = await analyzeMood(text);
    cachedMood = mood;
    setConfidence((confidence || 0) * 100);
    setMoodBadge(mood, confidence || 0);
    setStatus('Mood detected', 'ok');

    const [songsRes, bookRes, puzzleRes] = await Promise.all([
      getSongs(mood),
      getBook(mood),
      getPuzzle(mood),
    ]);

    renderSongs(songsRes.tracks || []);
    renderBook(bookRes.tip || '');
    renderPuzzle(puzzleRes.url || '#');

    await saveJournal(text, mood);

    const [timelineRes, streakRes, lbRes] = await Promise.all([
      getTimeline(),
      getStreak(),
      getLeaderboard(),
    ]);

    renderTimeline(timelineRes.entries || []);
    renderStreak(streakRes.streak || 0);
    renderLeaderboard(lbRes.rows || []);

    elResults.hidden = false;
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, 'err');
  } finally {
    setLoading(false);
  }
}

async function handleLogPuzzle() {
  try {
    await logStreak();
    const { streak } = await getStreak();
    renderStreak(streak || 0);
    setStatus('Puzzle logged. Streak updated!', 'ok');
  } catch (e) {
    setStatus(`Could not log puzzle: ${e.message}`, 'err');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme !== 'light';
  if (isDark) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.setProperty('--bg', '#f7f8fc');
    document.documentElement.style.setProperty('--bg-soft', '#f0f2fa');
    document.documentElement.style.setProperty('--card', '#ffffff');
    document.documentElement.style.setProperty('--text', '#151a2d');
    document.documentElement.style.setProperty('--muted', '#5b6aa1');
    document.documentElement.style.setProperty('--shadow', '0 10px 24px rgba(33,43,71,.15), 0 2px 10px rgba(33,43,71,.08)');
  } else {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.setProperty('--bg', '#0b1020');
    document.documentElement.style.setProperty('--bg-soft', '#0f152b');
    document.documentElement.style.setProperty('--card', '#111936');
    document.documentElement.style.setProperty('--text', '#e9eefc');
    document.documentElement.style.setProperty('--muted', '#a6b0d8');
    document.documentElement.style.setProperty('--shadow', '0 10px 30px rgba(0,0,0,.35), 0 2px 10px rgba(0,0,0,.18)');
  }
}

elAnalyze.addEventListener('click', handleAnalyze);
elLogPuzzle.addEventListener('click', handleLogPuzzle);
elTheme.addEventListener('click', toggleTheme);

(async function init() {
  try {
    const timelineRes = await getTimeline();
    renderTimeline(timelineRes.entries || []);
    const streakRes = await getStreak();
    renderStreak(streakRes.streak || 0);
    const lbRes = await getLeaderboard();
    renderLeaderboard(lbRes.rows || []);
  } catch (e) {
    setStatus('Load partial data in mock mode or connect API.', 'info');
  }
})();