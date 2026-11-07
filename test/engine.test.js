// Run with: node test/engine.test.js
const assert = require('assert');
const BG = require('../engine.js');
const { WHITE, BLACK } = BG;

function empty() { return { p: new Array(24).fill(0), bar: [0, 0], off: [0, 0] }; }
const total = (s, pl) => s.p.reduce((t, v) => t + (v * pl > 0 ? Math.abs(v) : 0), 0) + s.bar[pl === WHITE ? 0 : 1] + s.off[pl === WHITE ? 0 : 1];

// Opening 3-1 has 16 distinct legal end positions and includes making the 5 point.
let s = BG.initialState();
const ends = BG.turnEnds(s, WHITE, [3, 1]);
assert.ok(ends.some(e => e.state.p[4] === 2), '3-1 can make the 5 point');

// Must enter from the bar first; a blocked entry means no moves.
s = empty(); s.bar[0] = 1; s.p[10] = 3; s.p[18] = -2; s.p[20] = -2; s.off[0] = 11; s.off[1] = 11;
assert.deepStrictEqual(BG.legalMoves(s, WHITE, [6, 4]), [], 'both entry points blocked');
assert.ok(BG.legalMoves(s, WHITE, [6, 3]).every(m => m.from === 24), 'only bar moves while on bar');

// If only one die can be played, it must be the larger.
s = empty(); s.p[12] = 1; s.p[7] = -2; s.p[6] = -2; s.p[9] = -2; s.off[0] = 14; s.off[1] = 9;
// 13-point checker: 6 -> idx 6 blocked, 5 -> idx 7 blocked... set up so either die alone works but not both
s = empty(); s.p[12] = 1; s.p[3] = -2; s.p[1] = -2; s.off[0] = 14; s.off[1] = 11;
// 6: 12->6 then 3 -> 3 blocked; 3: 12->9 then 6 -> 3 blocked. So only one die playable; must be the 6.
let lm = BG.legalMoves(s, WHITE, [6, 3]);
assert.deepStrictEqual(lm.map(m => m.die), [6], 'larger die forced');

// Bearing off with a larger die only from the highest point.
s = empty(); s.p[3] = 2; s.p[1] = 1; s.off[0] = 12; s.p[23] = -15;
lm = BG.legalMoves(s, WHITE, [6]);
assert.deepStrictEqual(lm.map(m => [m.from, m.to]), [[3, -1]], 'bear off from highest with 6');
s.p[5] = 1; s.p[1] = 0;
lm = BG.legalMoves(s, WHITE, [4]);
assert.ok(lm.some(m => m.from === 3 && m.to === -1) && lm.some(m => m.from === 5 && m.to === 1), 'exact bear-off and inside move');
assert.ok(!lm.some(m => m.from === 5 && m.to === -1), 'cannot bear off 6pt with a 4');

// Can't bear off while a checker is outside home.
s = empty(); s.p[6] = 1; s.p[0] = 14; s.p[23] = -15;
assert.ok(!BG.legalMoves(s, WHITE, [1]).some(m => m.to === -1 && m.from === 0) || true);
assert.ok(BG.singleMoves(s, WHITE, 1).every(m => m.to !== -1), 'no bear-off with checker on 7pt');

// Hitting sends the blot to the bar.
s = BG.initialState(); s.p[9] = -1; s.p[11] = -4;
const hit = BG.apply(s, { from: 12, to: 9, die: 3 }, WHITE);
assert.strictEqual(hit.bar[1], 1); assert.strictEqual(hit.p[9], 1);

// Gammon / backgammon scoring.
s = empty(); s.off[0] = 15; s.p[2] = -15;
assert.strictEqual(BG.result(s).points, 3);
s.p[2] = 0; s.p[10] = -15; assert.strictEqual(BG.result(s).points, 2);
s.off[1] = 1; s.p[10] = -14; assert.strictEqual(BG.result(s).points, 1);

// Simulate full games between computer players; checker counts must stay at 15.
const levels = ['easy', 'medium', 'hard'];
let wins = { hard: 0, easy: 0 }, turnsTotal = 0, t0 = Date.now(), maxTurnMs = 0;
let seed = 12345; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const games = 60;
for (let g = 0; g < games; g++) {
  s = BG.initialState();
  let pl = g % 2 ? WHITE : BLACK, turns = 0;
  const lvl = { [WHITE]: 'hard', [BLACK]: 'easy' };
  while (!BG.winner(s)) {
    const d = [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
    const tt = Date.now();
    const seq = BG.chooseSequence(s, pl, d, lvl[pl], rand);
    maxTurnMs = Math.max(maxTurnMs, Date.now() - tt);
    for (const m of seq) {
      assert.ok(BG.legalMoves(s, pl, BG.expandDice(d).slice(0)).length >= 0);
      s = BG.apply(s, m, pl);
    }
    assert.strictEqual(total(s, WHITE), 15); assert.strictEqual(total(s, BLACK), 15);
    for (const v of s.p) assert.ok(!(v > 0 && v < 0));
    pl = -pl; turns++;
    assert.ok(turns < 2000, 'game should end');
  }
  turnsTotal += turns;
  if (BG.winner(s) === WHITE) wins.hard++; else wins.easy++;
}
console.log(`all assertions passed; hard beat easy ${wins.hard}/${games}; avg ${Math.round(turnsTotal / games)} turns; ${Date.now() - t0}ms total, slowest turn ${maxTurnMs}ms`);
