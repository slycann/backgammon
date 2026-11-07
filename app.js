/* Board rendering and game flow. You are White (positive), the computer is Black. */
(function () {
  'use strict';
  const { WHITE, BLACK } = BG;
  const $ = id => document.getElementById(id);
  const svg = $('board');

  // ---------- Geometry (SVG units, viewBox 920 x 680) ----------
  const PW = 60, M = 20, BARW = 60, TRAYW = 80, H = 680, PH = 270, R = 27;
  const LEFT = M, BARX = M + 6 * PW, RIGHT = BARX + BARW, TRAYX = RIGHT + 6 * PW + M;
  const MID = H / 2;

  function pointX(i) {
    const p = i + 1;
    if (p <= 6) return RIGHT + (6 - p) * PW + PW / 2;
    if (p <= 12) return LEFT + (12 - p) * PW + PW / 2;
    if (p <= 18) return LEFT + (p - 13) * PW + PW / 2;
    return RIGHT + (p - 19) * PW + PW / 2;
  }
  const isTop = i => i >= 12;
  const stackY = (i, n) => (isTop(i) ? M + R + n * 2 * R : H - M - R - n * 2 * R);
  // White's bar checkers sit below the middle, Black's above.
  const barY = (pl, n) => (pl === WHITE ? MID + R + 8 + n * 2 * R : MID - R - 8 - n * 2 * R);

  // ---------- Game state ----------
  let state, phase, dice = [], rem = [], diceOwner = WHITE;
  let turnStart = null, remStart = null, movesMade = 0;
  let selected = null, targets = new Map(), sources = new Set();
  let lastAiTo = new Set(), message = '', gameToken = 0;
  let score = loadScore();

  function loadScore() {
    try { return JSON.parse(localStorage.getItem('bg-score')) || { you: 0, cpu: 0 }; }
    catch (e) { return { you: 0, cpu: 0 }; }
  }
  function saveScore() {
    try { localStorage.setItem('bg-score', JSON.stringify(score)); } catch (e) { /* storage unavailable */ }
  }
  try { const lv = localStorage.getItem('bg-level'); if (lv) $('level').value = lv; } catch (e) { /* ignore */ }

  const rollDie = () => 1 + Math.floor(Math.random() * 6);
  const later = (fn, ms) => { const t = gameToken; setTimeout(() => { if (t === gameToken) fn(); }, ms); };

  // ---------- Rendering ----------
  const PIPS = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };

  function dieSvg(x, y, v, cls, used) {
    let g = `<g class="die ${cls}${used ? ' used' : ''}"><rect x="${x - 22}" y="${y - 22}" width="44" height="44" rx="8"/>`;
    for (const [dx, dy] of PIPS[v]) g += `<circle cx="${x + dx * 11}" cy="${y + dy * 11}" r="4.3"/>`;
    return g + '</g>';
  }

  function checker(x, y, pl, label) {
    const c = pl === WHITE ? 'w' : 'b';
    let g = `<circle class="chk-${c}" cx="${x}" cy="${y}" r="${R - 1}"/><circle class="chk-inner" cx="${x}" cy="${y}" r="${R - 9}"/>`;
    if (label) g += `<text class="count count-${c}" x="${x}" y="${y}">${label}</text>`;
    return g;
  }

  // Where the top checker of a location is drawn (used for rings and target markers).
  function topSpot(pos, pl) {
    if (pos === 24 || pos === -1 && pl === BLACK) {
      const n = state.bar[pl === WHITE ? 0 : 1];
      return [BARX + BARW / 2, barY(pl, Math.min(n, 4) - 1)];
    }
    const n = Math.abs(state.p[pos]);
    return [pointX(pos), stackY(pos, Math.max(0, Math.min(n, 5) - 1))];
  }

  function render() {
    let s = '';
    s += `<rect class="frame" x="0" y="0" width="920" height="${H}" rx="14"/>`;
    s += `<rect class="field" x="${LEFT}" y="${M}" width="${6 * PW}" height="${H - 2 * M}"/>`;
    s += `<rect class="field" x="${RIGHT}" y="${M}" width="${6 * PW}" height="${H - 2 * M}"/>`;
    s += `<rect class="barstrip" x="${BARX}" y="0" width="${BARW}" height="${H}"/>`;
    s += `<rect class="tray" x="${TRAYX}" y="${M}" width="${TRAYW}" height="${MID - M - 6}" rx="6"/>`;
    s += `<rect class="tray" x="${TRAYX}" y="${MID + 6}" width="${TRAYW}" height="${MID - M - 6}" rx="6"/>`;

    for (let i = 0; i < 24; i++) {
      const x = pointX(i), cls = i % 2 ? 'tri-a' : 'tri-b';
      const pts = isTop(i)
        ? `${x - PW / 2},${M} ${x + PW / 2},${M} ${x},${M + PH}`
        : `${x - PW / 2},${H - M} ${x + PW / 2},${H - M} ${x},${H - M - PH}`;
      s += `<polygon class="${cls}" points="${pts}"/>`;
      s += `<text class="ptnum" x="${x}" y="${isTop(i) ? 14 : H - 5}">${i + 1}</text>`;
    }

    // Target zones under the checkers
    for (const [to] of targets) {
      if (to === -1) s += `<rect class="target-zone" x="${TRAYX}" y="${MID + 6}" width="${TRAYW}" height="${MID - M - 6}" rx="6"/>`;
      else {
        const x = pointX(to);
        s += `<rect class="target-zone" x="${x - PW / 2}" y="${isTop(to) ? M : H - M - PH}" width="${PW}" height="${PH}" opacity="0.35"/>`;
      }
    }

    // Checkers on points
    for (let i = 0; i < 24; i++) {
      const v = state.p[i];
      if (!v) continue;
      const pl = v > 0 ? WHITE : BLACK, n = Math.abs(v);
      for (let k = 0; k < Math.min(n, 5); k++) {
        s += checker(pointX(i), stackY(i, k), pl, k === 4 && n > 5 ? n : '');
      }
    }
    // Checkers on the bar
    for (const pl of [WHITE, BLACK]) {
      const n = state.bar[pl === WHITE ? 0 : 1];
      for (let k = 0; k < Math.min(n, 4); k++) s += checker(BARX + BARW / 2, barY(pl, k), pl, k === 3 && n > 4 ? n : '');
    }
    // Borne-off checkers
    for (let k = 0; k < state.off[0]; k++) s += `<rect class="off-w" x="${TRAYX + 8}" y="${H - M - 18 - k * 14}" width="${TRAYW - 16}" height="12" rx="3"/>`;
    for (let k = 0; k < state.off[1]; k++) s += `<rect class="off-b" x="${TRAYX + 8}" y="${M + 6 + k * 14}" width="${TRAYW - 16}" height="12" rx="3"/>`;

    // Rings: computer's last landing spots, your movable checkers, the selection
    for (const to of lastAiTo) {
      if (to >= 0 && to <= 23 && state.p[to] < 0) { const [x, y] = topSpot(to, BLACK); s += `<circle class="lastmove" cx="${x}" cy="${y}" r="${R + 2}"/>`; }
    }
    if (phase === 'move') {
      for (const from of sources) {
        const [x, y] = topSpot(from, WHITE);
        s += `<circle class="${from === selected ? 'selected' : 'movable'}" cx="${x}" cy="${y}" r="${R + 2}"/>`;
      }
    }
    for (const [to] of targets) {
      if (to === -1) continue;
      const n = Math.abs(state.p[to]), hitting = state.p[to] < 0;
      const [x, y] = [pointX(to), stackY(to, hitting ? 0 : Math.min(n, 4))];
      s += `<circle class="target" cx="${x}" cy="${y}" r="${R - 6}"/>`;
    }

    // Dice
    if (dice.length) {
      const all = BG.expandDice(dice);
      const usedCount = all.length - rem.length;
      const cx = diceOwner === WHITE ? RIGHT + 3 * PW : LEFT + 3 * PW;
      const cls = diceOwner === WHITE ? 'die-w' : 'die-b';
      const gap = 54, x0 = cx - ((all.length - 1) * gap) / 2;
      all.forEach((v, idx) => {
        const used = dice[0] === dice[1] ? idx < usedCount : !rem.includes(v);
        s += dieSvg(x0 + idx * gap, MID, v, cls, used);
      });
    }

    // Click areas on top of everything
    for (let i = 0; i < 24; i++) {
      const x = pointX(i);
      s += `<rect class="hit" data-loc="${i}" x="${x - PW / 2}" y="${isTop(i) ? M : MID}" width="${PW}" height="${MID - M}"/>`;
    }
    s += `<rect class="hit" data-loc="bar" x="${BARX}" y="0" width="${BARW}" height="${H}"/>`;
    s += `<rect class="hit" data-loc="off" x="${TRAYX}" y="${M}" width="${TRAYW}" height="${H - 2 * M}"/>`;

    svg.innerHTML = s;
    renderPanel();
  }

  function renderPanel() {
    $('msg').textContent = message;
    $('pips').textContent = `Pips — you ${BG.pips(state, WHITE)} · computer ${BG.pips(state, BLACK)}`;
    $('score').innerHTML = `You <b>${score.you}</b> · Computer <b>${score.cpu}</b>`;
    const primary = $('primary');
    if (phase === 'roll') { primary.textContent = 'Roll'; primary.disabled = false; }
    else if (phase === 'move') { primary.textContent = 'End turn'; primary.disabled = sources.size > 0; }
    else if (phase === 'over') { primary.textContent = 'Play again'; primary.disabled = false; }
    else { primary.textContent = 'Roll'; primary.disabled = true; }
    $('undo').disabled = !(phase === 'move' && movesMade > 0);
  }

  // ---------- Your turn ----------
  function refreshSources() {
    sources = new Set(BG.legalMoves(state, WHITE, rem).map(m => m.from));
    selected = null;
    targets = new Map();
    if (sources.size === 1) select([...sources][0]);
  }

  // Destinations for the checker at `from`, including spots reached by moving it with more than one die.
  function computeTargets(from) {
    const map = new Map();
    (function walk(st, r, pos, path) {
      for (const m of BG.legalMoves(st, WHITE, r)) {
        if (m.from !== pos) continue;
        const p2 = path.concat([m]);
        if (!map.has(m.to) || map.get(m.to).length > p2.length) map.set(m.to, p2);
        if (m.to >= 0 && r.length > 1) walk(BG.apply(st, m, WHITE), BG.removeDie(r, m.die), m.to, p2);
      }
    })(state, rem, from, []);
    return map;
  }

  function select(pos) {
    selected = pos;
    targets = computeTargets(pos);
  }

  function startHumanTurn() {
    phase = 'roll';
    message = 'Your turn — roll the dice.';
    render();
  }

  function humanRoll(preset) {
    diceOwner = WHITE;
    dice = preset || [rollDie(), rollDie()];
    rem = BG.expandDice(dice);
    turnStart = BG.clone(state);
    remStart = rem.slice();
    movesMade = 0;
    lastAiTo = new Set();
    phase = 'move';
    refreshSources();
    message = sources.size ? `You rolled ${dice[0]}–${dice[1]}. Pick a checker.` : `You rolled ${dice[0]}–${dice[1]} — no legal moves.`;
    render();
  }

  function playPath(path) {
    for (const m of path) {
      state = BG.apply(state, m, WHITE);
      rem = BG.removeDie(rem, m.die);
      movesMade++;
    }
    if (BG.winner(state)) return gameOver();
    refreshSources();
    message = sources.size ? 'Keep going…' : 'Done — end your turn (or undo).';
    render();
  }

  function onLoc(loc) {
    if (phase !== 'move') return;
    const pos = loc === 'bar' ? 24 : loc === 'off' ? -1 : +loc;
    if (selected !== null && targets.has(pos)) return playPath(targets.get(pos));
    if (sources.has(pos) && pos !== selected) select(pos);
    else if (sources.size !== 1) { selected = null; targets = new Map(); }
    render();
  }

  function undo() {
    if (phase !== 'move' || !movesMade) return;
    state = BG.clone(turnStart);
    rem = remStart.slice();
    movesMade = 0;
    refreshSources();
    message = `You rolled ${dice[0]}–${dice[1]}. Pick a checker.`;
    render();
  }

  // ---------- Computer's turn ----------
  function aiTurn(preset) {
    phase = 'ai';
    selected = null; targets = new Map(); sources = new Set();
    diceOwner = BLACK;
    dice = preset || [rollDie(), rollDie()];
    rem = BG.expandDice(dice);
    lastAiTo = new Set();
    message = `Computer rolled ${dice[0]}–${dice[1]}…`;
    render();
    later(() => {
      const seq = BG.chooseSequence(state, BLACK, dice, $('level').value);
      if (!seq.length) {
        message = `Computer rolled ${dice[0]}–${dice[1]} and can't move.`;
        render();
        return later(startHumanTurn, 1400);
      }
      let i = 0;
      const step = () => {
        const m = seq[i++];
        state = BG.apply(state, m, BLACK);
        rem = BG.removeDie(rem, m.die);
        lastAiTo.add(m.to);
        render();
        if (BG.winner(state)) return gameOver();
        if (i < seq.length) later(step, 550);
        else later(startHumanTurn, 600);
      };
      later(step, 350);
    }, 750);
  }

  // ---------- Game start / end ----------
  function newGame() {
    gameToken++;
    state = BG.initialState();
    selected = null; targets = new Map(); sources = new Set(); lastAiTo = new Set();
    dice = []; rem = [];
    phase = 'opening';
    let you, cpu;
    do { you = rollDie(); cpu = rollDie(); } while (you === cpu);
    message = `Opening roll: you ${you}, computer ${cpu} — ${you > cpu ? 'you go first' : 'computer goes first'}.`;
    render();
    // Show both opening dice side by side, then the winner plays them.
    svg.insertAdjacentHTML('beforeend', dieSvg(RIGHT + 3 * PW, MID, you, 'die-w', false) + dieSvg(LEFT + 3 * PW, MID, cpu, 'die-b', false));
    later(() => (you > cpu ? humanRoll([you, cpu]) : aiTurn([cpu, you])), 1600);
  }

  function gameOver() {
    phase = 'over';
    selected = null; targets = new Map(); sources = new Set();
    const r = BG.result(state);
    const kind = r.kind === 'single' ? '' : r.kind === 'gammon' ? ' with a gammon' : ' with a backgammon';
    const pts = `${r.points} point${r.points > 1 ? 's' : ''}`;
    if (r.winner === WHITE) { score.you += r.points; message = `You win${kind}! (${pts})`; }
    else { score.cpu += r.points; message = `Computer wins${kind}. (${pts})`; }
    saveScore();
    render();
  }

  // ---------- Wiring ----------
  svg.addEventListener('click', e => {
    const el = e.target.closest('[data-loc]');
    if (el) onLoc(el.dataset.loc);
  });
  function primaryAction() {
    if (phase === 'roll') humanRoll();
    else if (phase === 'move' && !sources.size) aiTurn();
    else if (phase === 'over') newGame();
  }
  $('primary').addEventListener('click', primaryAction);
  $('undo').addEventListener('click', undo);
  $('newgame').addEventListener('click', () => {
    if (phase === 'over' || phase === 'opening' || confirm('Start a new game? The current one will be abandoned.')) newGame();
  });
  $('level').addEventListener('change', e => { try { localStorage.setItem('bg-level', e.target.value); } catch (err) { /* ignore */ } });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); primaryAction(); }
    else if (e.key === 'u' || e.key === 'U') undo();
  });

  newGame();
})();
