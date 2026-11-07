/* Backgammon rules engine and computer opponent. No DOM, so it also runs in Node for tests.
 *
 * Board: p[0..23], positive = White (human) checkers, negative = Black (computer).
 * White moves 23 -> 0 and bears off from 0..5; Black moves 0 -> 23 and bears off from 18..23.
 * A move is {from, to, die}. White enters from 24 and bears off to -1; Black enters from -1 and bears off to 24.
 */
(function (root) {
  'use strict';

  const WHITE = 1, BLACK = -1;
  const ki = pl => (pl === WHITE ? 0 : 1);
  const barFrom = pl => (pl === WHITE ? 24 : -1);
  const offTo = pl => (pl === WHITE ? -1 : 24);

  function initialState() {
    const p = new Array(24).fill(0);
    p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5;
    p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5;
    return { p, bar: [0, 0], off: [0, 0] };
  }

  const clone = s => ({ p: s.p.slice(), bar: s.bar.slice(), off: s.off.slice() });
  const stateKey = s => s.p.join(',') + '|' + s.bar.join(',') + '|' + s.off.join(',');
  const expandDice = d => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

  function removeDie(rem, die) {
    const i = rem.indexOf(die);
    return rem.slice(0, i).concat(rem.slice(i + 1));
  }

  function allHome(s, pl) {
    if (s.bar[ki(pl)] > 0) return false;
    for (let i = 0; i < 24; i++) {
      if (s.p[i] * pl > 0 && (pl === WHITE ? i >= 6 : i <= 17)) return false;
    }
    return true;
  }

  // True when pl has no checker further from home than point i (allows bearing off with a larger die).
  function noneFurther(s, pl, i) {
    if (pl === WHITE) { for (let j = i + 1; j < 6; j++) if (s.p[j] > 0) return false; }
    else { for (let j = 18; j < i; j++) if (s.p[j] < 0) return false; }
    return true;
  }

  function singleMoves(s, pl, die) {
    const res = [];
    const blocked = i => s.p[i] * pl <= -2;
    if (s.bar[ki(pl)] > 0) {
      const to = pl === WHITE ? 24 - die : die - 1;
      if (!blocked(to)) res.push({ from: barFrom(pl), to, die });
      return res;
    }
    const home = allHome(s, pl);
    for (let i = 0; i < 24; i++) {
      if (s.p[i] * pl <= 0) continue;
      const to = i - pl * die;
      if (to >= 0 && to <= 23) {
        if (!blocked(to)) res.push({ from: i, to, die });
      } else if (home) {
        const exact = pl === WHITE ? i + 1 === die : 24 - i === die;
        if (exact || noneFurther(s, pl, i)) res.push({ from: i, to: offTo(pl), die });
      }
    }
    return res;
  }

  function apply(s, m, pl) {
    const n = clone(s), k = ki(pl);
    if (m.from === barFrom(pl)) n.bar[k]--; else n.p[m.from] -= pl;
    if (m.to < 0 || m.to > 23) n.off[k]++;
    else {
      if (n.p[m.to] === -pl) { n.p[m.to] = 0; n.bar[1 - k]++; }
      n.p[m.to] += pl;
    }
    return n;
  }

  // Most dice that can still be played from this position (stops early once all can be).
  function maxPlayable(s, pl, rem) {
    if (!rem.length) return 0;
    let best = 0;
    const tried = new Set();
    for (const d of rem) {
      if (tried.has(d)) continue;
      tried.add(d);
      const rest = removeDie(rem, d);
      for (const m of singleMoves(s, pl, d)) {
        const v = 1 + maxPlayable(apply(s, m, pl), pl, rest);
        if (v > best) { best = v; if (best === rem.length) return best; }
      }
    }
    return best;
  }

  // Single moves that are legal right now: you must play as many dice as possible,
  // and if only one of two different dice can be played, it must be the larger one when possible.
  function legalMoves(s, pl, rem) {
    const max = maxPlayable(s, pl, rem);
    if (!max) return [];
    let res = [];
    const tried = new Set();
    for (const d of rem) {
      if (tried.has(d)) continue;
      tried.add(d);
      const rest = removeDie(rem, d);
      for (const m of singleMoves(s, pl, d)) {
        if (1 + maxPlayable(apply(s, m, pl), pl, rest) === max) res.push(m);
      }
    }
    if (max === 1 && rem.length === 2 && rem[0] !== rem[1]) {
      const hi = Math.max(rem[0], rem[1]);
      if (res.some(m => m.die === hi)) res = res.filter(m => m.die === hi);
    }
    return res;
  }

  // Every distinct position a full turn can end in, with one move sequence that reaches it.
  function turnEnds(s, pl, dice) {
    const out = [], seen = new Set();
    (function rec(st, rem, seq) {
      const key = stateKey(st) + '#' + rem.join('');
      if (seen.has(key)) return;
      seen.add(key);
      const moves = legalMoves(st, pl, rem);
      if (!moves.length) { out.push({ seq, state: st }); return; }
      for (const m of moves) rec(apply(st, m, pl), removeDie(rem, m.die), seq.concat([m]));
    })(s, expandDice(dice), []);
    return out;
  }

  function pips(s, pl) {
    let t = s.bar[ki(pl)] * 25;
    for (let i = 0; i < 24; i++) if (s.p[i] * pl > 0) t += Math.abs(s.p[i]) * (pl === WHITE ? i + 1 : 24 - i);
    return t;
  }

  function isContact(s) {
    let wBack = s.bar[0] ? 24 : -1, bBack = s.bar[1] ? -1 : 24;
    for (let i = 0; i < 24; i++) {
      if (s.p[i] > 0) wBack = Math.max(wBack, i);
      if (s.p[i] < 0) bBack = Math.min(bBack, i);
    }
    return wBack > bBack;
  }

  function winner(s) {
    if (s.off[0] === 15) return WHITE;
    if (s.off[1] === 15) return BLACK;
    return 0;
  }

  // Single game (1), gammon (2) or backgammon (3).
  function result(s) {
    const w = winner(s);
    if (!w) return null;
    const L = -w;
    if (s.off[ki(L)] > 0) return { winner: w, points: 1, kind: 'single' };
    let stuck = s.bar[ki(L)] > 0;
    for (let i = 0; i < 24; i++) {
      if (s.p[i] * L > 0 && (w === WHITE ? i <= 5 : i >= 18)) stuck = true;
    }
    return stuck ? { winner: w, points: 3, kind: 'backgammon' } : { winner: w, points: 2, kind: 'gammon' };
  }

  // ---------- Computer opponent ----------

  // Bitmask of distances each of the 36 rolls can cover with one checker.
  const ROLL_MASKS = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      ROLL_MASKS.push(a === b
        ? (1 << a) | (1 << 2 * a) | (1 << 3 * a) | (1 << 4 * a)
        : (1 << a) | (1 << b) | (1 << (a + b)));
    }
  }

  // Expected pips lost to the opponent hitting one of pl's blots on their next roll.
  function expectedHitLoss(s, pl) {
    const O = -pl, att = [], info = [];
    for (let j = 0; j < 24; j++) if (s.p[j] * O > 0) att.push(j);
    if (s.bar[ki(O)] > 0) att.push(barFrom(O));
    for (let i = 0; i < 24; i++) {
      if (s.p[i] !== pl) continue;
      let mask = 0;
      for (const j of att) {
        const d = O === WHITE ? j - i : i - j;
        if (d >= 1 && d <= 24) mask |= 1 << d;
      }
      if (mask) info.push({ mask, loss: (pl === WHITE ? 24 - i : i + 1) + 4 });
    }
    if (!info.length) return 0;
    let total = 0;
    for (const r of ROLL_MASKS) {
      let worst = 0;
      for (const b of info) if (b.mask & r && b.loss > worst) worst = b.loss;
      total += worst;
    }
    return total / 36;
  }

  function evaluate(s, pl) {
    const O = -pl, k = ki(pl), ok = 1 - k;
    if (s.off[k] === 15) return 1000;
    let score = pips(s, O) - pips(s, pl);
    if (!isContact(s)) return score + (s.off[k] - s.off[ok]) * 0.5;

    const own = i => s.p[i] * pl >= 2;
    const theirs = i => s.p[i] * O >= 2;
    const homeIdx = pl === WHITE ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23];
    const oppHomeIdx = pl === WHITE ? [18, 19, 20, 21, 22, 23] : [0, 1, 2, 3, 4, 5];
    const homePts = homeIdx.filter(own).length;
    const oppHomePts = oppHomeIdx.filter(theirs).length;
    const anchors = oppHomeIdx.filter(own).length;

    score += homePts * 2.5;
    if (own(pl === WHITE ? 6 : 17)) score += 2; // bar point
    score += Math.min(anchors, 2) * 1.5;

    let run = 0, best = 0;
    for (let i = 0; i < 24; i++) { run = own(i) ? run + 1 : 0; best = Math.max(best, run); }
    if (best >= 3) score += (best - 2) * 3;

    score -= expectedHitLoss(s, pl);
    score += s.bar[ok] * (1 + homePts * 0.8);
    score -= s.bar[k] * (1 + oppHomePts * 0.8);
    for (let i = 0; i < 24; i++) {
      const c = s.p[i] * pl;
      if (c > 4) score -= (c - 4) * 0.4;
    }
    return score;
  }

  // level: 'easy' | 'medium' | 'hard'. Returns the move sequence to play (possibly empty).
  function chooseSequence(s, pl, dice, level, rand = Math.random) {
    const ends = turnEnds(s, pl, dice);
    if (ends.length === 1) return ends[0].seq;
    if (level === 'easy' && rand() < 0.6) return ends[Math.floor(rand() * ends.length)].seq;
    const noise = level === 'hard' ? 0 : 4;
    let best = null, bestScore = -Infinity;
    for (const e of ends) {
      const v = evaluate(e.state, pl) + (noise ? (rand() - 0.5) * 2 * noise : 0);
      if (v > bestScore) { bestScore = v; best = e; }
    }
    return best.seq;
  }

  const BG = {
    WHITE, BLACK, initialState, clone, expandDice, removeDie, singleMoves, apply,
    legalMoves, turnEnds, pips, winner, result, evaluate, chooseSequence, isContact,
  };
  root.BG = BG;
  if (typeof module !== 'undefined' && module.exports) module.exports = BG;
})(typeof window !== 'undefined' ? window : globalThis);
