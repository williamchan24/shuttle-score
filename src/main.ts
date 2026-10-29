import './style.css';
import {
  call, isDecider, newMatch, other, pointFor, rally, receiverName, serverName, serviceCourt, sideName,
  type Config, type MatchState, type Side,
} from './lib/rules';
import { addToHistory, loadCurrent, loadHistory, loadVoice, saveCurrent, saveVoice, type Finished } from './store';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = { setup: $('setup'), match: $('match'), done: $('done') };
const halves = { A: document.querySelector<HTMLButtonElement>('.side-a')!, B: document.querySelector<HTMLButtonElement>('.side-b')! };
const form = $<HTMLFormElement>('setup-form');
const court = $('court');
const banner = $('banner');

let state: MatchState | null = null;
let undo: MatchState[] = [];
let voice = loadVoice();
let lastConfig: Config | null = null;

// ---------- Screens ----------
function show(name: keyof typeof screens) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  document.body.dataset.screen = name;
  if (name === 'match') keepAwake();
  else releaseAwake();
}

// ---------- Setup ----------
function syncDoublesInputs() {
  const doubles = (form.elements.namedItem('mode') as RadioNodeList).value === 'doubles';
  form.querySelectorAll<HTMLInputElement>('.dbl').forEach((i) => (i.hidden = !doubles));
}
form.addEventListener('change', syncDoublesInputs);

function readConfig(): Config {
  const f = new FormData(form);
  const v = (k: string, fallback: string) => (String(f.get(k) ?? '').trim() || fallback);
  return {
    mode: f.get('mode') === 'doubles' ? 'doubles' : 'singles',
    bestOf: f.get('bestOf') === '1' ? 1 : 3,
    names: { A: [v('a0', 'Side A'), v('a1', 'Partner A')], B: [v('b0', 'Side B'), v('b1', 'Partner B')] },
    firstServer: f.get('first') === 'B' ? 'B' : 'A',
  };
}

function start(config: Config) {
  lastConfig = config;
  state = newMatch(config);
  undo = [];
  saveCurrent(state, undo);
  show('match');
  render(null);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  start(readConfig());
});

function renderSetup() {
  syncDoublesInputs();
  const saved = loadCurrent();
  $('resume').hidden = !saved;
  if (saved) {
    const s = saved.state;
    $('resume-text').textContent = `${sideName(s.config, 'A')} vs ${sideName(s.config, 'B')}, ${s.score.A}–${s.score.B}`;
  }
  const list = loadHistory();
  $('history').hidden = list.length === 0;
  const ol = $('history-list');
  ol.replaceChildren(
    ...list.map((m) => {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.textContent = `${m.winnerName} beat ${m.loserName}`;
      const games = document.createElement('span');
      games.className = 'muted';
      games.textContent = m.games;
      const when = document.createElement('time');
      when.className = 'muted';
      when.dateTime = m.date;
      when.textContent = new Date(m.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      li.append(who, games, when);
      return li;
    }),
  );
}

$('resume-btn').addEventListener('click', () => {
  const saved = loadCurrent();
  if (!saved) return;
  state = saved.state;
  undo = saved.undo;
  lastConfig = state.config;
  show('match');
  render(null, false);
});

// ---------- Match ----------
function point(side: Side) {
  if (!state || state.winner) return;
  const prev = state;
  undo.push(prev);
  if (undo.length > 300) undo.shift();
  state = rally(prev, side);
  saveCurrent(state, undo);
  navigator.vibrate?.(12);
  render(prev);
  if (state.winner) setTimeout(finish, 1600);
}

function undoPoint() {
  const prev = undo.pop();
  if (!prev || !state) return;
  state = prev;
  saveCurrent(state, undo);
  hideBanner();
  render(null, false);
}

Object.values(halves).forEach((h) => h.addEventListener('click', () => point(h.dataset.side as Side)));
$('undo-btn').addEventListener('click', undoPoint);
$('end-btn').addEventListener('click', () => {
  if (state && (state.score.A + state.score.B > 0 || state.games.length) && !confirm('End this match? It won’t be saved to your history.')) return;
  state = null;
  undo = [];
  saveCurrent(null, []);
  show('setup');
  renderSetup();
});
$('voice-btn').addEventListener('click', () => {
  voice = !voice;
  saveVoice(voice);
  syncVoiceBtn();
  if (voice && state) speak(call(undo[undo.length - 1] ?? null, state));
});

// Keyboard, for scoring from a laptop: left / right arrow score the side shown there, Z or Backspace undoes
document.addEventListener('keydown', (e) => {
  if (screens.match.hidden || !state) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const leftSide: Side = state.endsSwapped ? 'B' : 'A';
    point(e.key === 'ArrowLeft' ? leftSide : other(leftSide));
  } else if (e.key === 'z' || e.key === 'Backspace') {
    undoPoint();
  }
});

function syncVoiceBtn() {
  $('voice-btn').setAttribute('aria-pressed', String(voice));
}

function render(prev: MatchState | null, announce = true) {
  if (!state) return;
  const s = state;
  court.classList.toggle('swapped', s.endsSwapped);
  const gp = pointFor(s);
  (['A', 'B'] as Side[]).forEach((side) => {
    const h = halves[side];
    h.querySelector('[data-names]')!.textContent = sideName(s.config, side);
    const scoreEl = h.querySelector<HTMLElement>('[data-score]')!;
    if (scoreEl.textContent !== String(s.score[side])) {
      scoreEl.textContent = String(s.score[side]);
      if (prev) bump(scoreEl);
    }
    h.querySelector('[data-games]')!.textContent = s.config.bestOf === 3 ? `Games ${s.gamesWon[side]}` : '';
    h.classList.toggle('serving', s.server === side && !s.winner);
    h.dataset.point = gp && gp.side === side ? gp.kind : '';
    h.setAttribute('aria-label', `Point to ${sideName(s.config, side)}, now ${s.score[side]}`);
  });

  const gameNo = s.games.length + (s.winner ? 0 : 1);
  $('game-label').textContent = s.winner ? 'Match over' : `Game ${gameNo}${s.config.bestOf === 3 && isDecider(s) && s.games.length ? ', decider' : ''}`;
  $<HTMLButtonElement>('undo-btn').disabled = undo.length === 0;
  syncVoiceBtn();

  const court_ = serviceCourt(s);
  $('status').textContent = s.winner
    ? ''
    : `${serverName(s)} serves from the ${court_} court to ${receiverName(s)}`;

  if (s.event === 'interval') flash('Interval');
  else if (s.event === 'change-ends') flash('Interval, change ends');
  else if (s.event === 'game') flash(`Game to ${sideName(s.config, s.games[s.games.length - 1].A > s.games[s.games.length - 1].B ? 'A' : 'B')}`);
  else if (s.event === 'match') flash(`Match to ${sideName(s.config, s.winner!)}`);

  if (announce) speak(call(prev, s));
}

/** The score drops in from slightly above, so a change is noticed without being loud. */
function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth; // restart the animation
  el.classList.add('bump');
}

let bannerTimer = 0;
function flash(text: string) {
  banner.textContent = text;
  banner.hidden = false;
  requestAnimationFrame(() => banner.classList.add('on'));
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(hideBanner, 2600);
}
function hideBanner() {
  banner.classList.remove('on');
  clearTimeout(bannerTimer);
}
banner.addEventListener('click', hideBanner);
banner.addEventListener('transitionend', () => { if (!banner.classList.contains('on')) banner.hidden = true; });

// ---------- Result ----------
function finish() {
  if (!state || !state.winner) return;
  const s = state;
  const loser = other(s.winner!);
  const entry: Finished = {
    date: new Date().toISOString(),
    winnerName: sideName(s.config, s.winner!),
    loserName: sideName(s.config, loser),
    games: s.games.map((g) => `${g[s.winner!]}–${g[loser]}`).join(', '),
  };
  addToHistory(entry);
  saveCurrent(null, []);
  $('winner').textContent = entry.winnerName;
  $('th-a').textContent = sideName(s.config, 'A');
  $('th-b').textContent = sideName(s.config, 'B');
  $('games-body').replaceChildren(
    ...s.games.map((g, i) => {
      const tr = document.createElement('tr');
      for (const v of [`${i + 1}`, String(g.A), String(g.B)]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      }
      return tr;
    }),
  );
  show('done');
}

$('rematch-btn').addEventListener('click', () => {
  if (!lastConfig) return;
  // Swap who serves first for the rematch
  start({ ...lastConfig, firstServer: other(lastConfig.firstServer) });
});
$('new-btn').addEventListener('click', () => {
  state = null;
  show('setup');
  renderSetup();
});

// ---------- Voice calls ----------
function speak(text: string) {
  if (!voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

// ---------- Keep the screen on during a match ----------
let wakeLock: WakeLockSentinel | null = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* not supported or not allowed: the screen may dim, nothing else breaks */
  }
}
function releaseAwake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !screens.match.hidden) keepAwake();
});

// ---------- Boot ----------
show('setup');
renderSetup();

// Offline support once built (the dev server doesn't need it)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
