// 英傑陣法搜尋。陣型決定哪三格是一組；同組三人各提供一個因子即成立一個因縁。
// 人少時列舉所有六人組合，人多時以模擬退火選人；六人怎麼擺則一律逐一比較。
// 瀏覽器與 Node 共用。
(function (root) {
  'use strict';

  // 能力順序：生 氣 腕 耐 靈 智 魅 土 水 火 風（與 data.js 的 stats 相同；靈＝日版器用）
  // triples 的格子編號與畫面位置的對應見 index.html 的 SLOT_POS。
  const FORMATIONS = {
    '衡軛': { cap: 36, triples: [[0, 1, 2], [3, 4, 5]], bonus: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    '鶴翼': { cap: 30, triples: [[0, 1, 2], [3, 4, 5]], bonus: [10, 0, 0, 10, 0, 0, 10, 10, 10, 10, 10] },
    '魚鱗': { cap: 24, triples: [[0, 1, 3], [0, 2, 5], [3, 4, 5]], bonus: [0, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0] },
    '方圓': { cap: 24, triples: [[1, 0, 2], [1, 3, 5], [2, 4, 5]], bonus: [0, 10, 0, 0, 0, 10, 10, 10, 10, 10, 10] }
  };

  const PERMS3 = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  // 六人中取三人的 20 種組合，以及 (i,j,k) -> 組合索引
  const TRI6 = [];
  const TRI6_INDEX = {};
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) {
    TRI6_INDEX[`${i}${j}${k}`] = TRI6.length;
    TRI6.push([i, j, k]);
  }

  // 六人擺進六格的所有排法，只留下「分組結果」不同的那些
  const arrangeCache = new Map();
  function arrangements(name) {
    if (arrangeCache.has(name)) return arrangeCache.get(name);
    const triples = FORMATIONS[name].triples;
    const seen = new Map();
    (function perm(arr, k) {
      if (k === 6) {
        // slot i 放 set[arr[i]]
        const groups = triples.map(t => t.map(s => arr[s]).sort((a, b) => a - b));
        const key = groups.map(g => g.join('')).sort().join('|');
        if (!seen.has(key)) seen.set(key, { slots: arr.slice(), groups, tri: groups.map(g => TRI6_INDEX[g.join('')]) });
        return;
      }
      for (let i = k; i < 6; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        perm(arr, k + 1);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    })([0, 1, 2, 3, 4, 5], 0);
    const list = [...seen.values()];
    arrangeCache.set(name, list);
    return list;
  }

  // heroes: [{factors: [...], stats: [11 個], cost}]；ennen: [[name, [f1, f2, f3]], ...]
  function makeTable(heroes, ennen) {
    const n = heroes.length;
    const mask = heroes.map(h => ennen.map(([, need]) =>
      need.reduce((m, f, k) => m | (h.factors.includes(f) ? 1 << k : 0), 0)));
    const rulesOf = mask.map(m => m.flatMap((v, r) => (v ? [r] : [])));
    const cache = new Map();
    function compute(a, b, c) {
      const out = [];
      for (const r of rulesOf[a]) {
        const ma = mask[a][r], mb = mask[b][r], mc = mask[c][r];
        if (!mb || !mc) continue;
        for (const p of PERMS3)
          if ((ma >> p[0] & 1) && (mb >> p[1] & 1) && (mc >> p[2] & 1)) { out.push(r); break; }
      }
      return out;
    }
    // 三人組成立的規則（快取）
    function matched(a, b, c) {
      let t;
      if (a > b) { t = a; a = b; b = t; }
      if (b > c) { t = b; b = c; c = t; }
      if (a > b) { t = a; a = b; b = t; }
      const key = (a * n + b) * n + c;
      let v = cache.get(key);
      if (v === undefined) { v = compute(a, b, c); cache.set(key, v); }
      return v;
    }
    return { n, matched };
  }

  function binom(n, k) {
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }

  // 單一陣型的搜尋。options 見 solve()。
  function solveOne(heroes, ennen, table, o, formation, t0, timeLimit) {
    const n = heroes.length;
    const F = FORMATIONS[formation];
    const arr = arrangements(formation);
    const statIdx = o.stats;
    // 各英傑在此陣型下的數值：所選能力合計 ×（1＋陣型加成）
    const value = heroes.map(h => statIdx.reduce((s, i) => s + (h.stats[i] || 0) * (1 + F.bonus[i] / 100), 0));
    const maxValue = Math.max(1, ...heroes.map(h => statIdx.reduce((s, i) => s + (h.stats[i] || 0), 0))) * 6 * 1.1;
    const cost = heroes.map(h => h.cost || 0);
    const cap = o.useCap ? F.cap : 0;
    const required = [...new Set(o.required)];

    function objective(e, l, s) {
      if (o.mode === 'ennen') return e * 10 + l + 0.999 * s / maxValue;
      if (o.mode === 'links') return l * 100 + e + 0.999 * s / maxValue;
      return s / maxValue - Math.max(0, o.minEnnen - e) * 2;
    }
    // 六人之中的 20 種三人組先各算一次，排法只用索引去合併
    const triMask = new Array(20), triCount = new Int32Array(20);
    const words = Math.ceil(ennen.length / 32);
    for (let i = 0; i < 20; i++) triMask[i] = new Int32Array(words);
    function popcount(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
    const union = new Int32Array(words);
    // soft：超過價值上限時不直接淘汰，改依超出量扣分（隨機搜尋用，讓它能往上限內移動）
    function evaluate(set, soft) {
      let s = 0, c = 0;
      for (const h of set) { s += value[h]; c += cost[h]; }
      const over = cap ? Math.max(0, c - cap) : 0;
      if (over && !soft) return null;
      for (let i = 0; i < 20; i++) {
        const [a, b, d] = TRI6[i];
        const got = table.matched(set[a], set[b], set[d]);
        triCount[i] = got.length;
        const m = triMask[i]; m.fill(0);
        for (const r of got) m[r >> 5] |= 1 << (r & 31);
      }
      let best = null;
      for (const a of arr) {
        let total = 0, links = 0, e;
        for (const g of a.tri) { total += triCount[g]; if (triCount[g]) links++; }
        if (o.distinct) {
          union.fill(0);
          for (const g of a.tri) { const m = triMask[g]; for (let w = 0; w < words; w++) union[w] |= m[w]; }
          e = 0;
          for (let w = 0; w < words; w++) e += popcount(union[w]);
        } else e = total;
        const f = objective(e, links, s);
        if (!best || f > best.f) best = { f, e, l: links, s: Math.round(s), c, a };
      }
      best.slots = best.a.slots.map(i => set[i]);
      best.over = over;
      if (over) best.f -= 1000 + over * 100;
      return best;
    }

    const found = new Map();
    let floor = -Infinity;
    function record(r) {
      if (!r || r.over || r.e < o.minEnnen) return;
      const key = [...r.slots].sort((a, b) => a - b).join(',');
      if (found.has(key)) return;
      if (found.size >= o.topK && r.f <= floor) return;
      found.set(key, r);
      if (found.size > o.topK) {
        let worst = null;
        for (const [k, v] of found) if (!worst || v.f < worst[1].f) worst = [k, v];
        found.delete(worst[0]);
      }
      if (found.size >= o.topK) floor = Math.min(...[...found.values()].map(v => v.f));
    }

    const locked = new Set(required);
    const pool = [...Array(n).keys()].filter(h => !locked.has(h));
    const free = 6 - required.length;
    const exact = binom(pool.length, free) <= o.exactLimit;
    let complete = true, evals = 0;
    const deadline = t0 + (exact ? o.exactTimeLimit : timeLimit);

    if (exact) {
      const pick = new Array(free);
      (function choose(start, k) {
        if (!complete) return;
        if (k === free) {
          record(evaluate(required.concat(pick)));
          if ((++evals & 1023) === 0 && Date.now() > deadline) complete = false;
          return;
        }
        for (let i = start; i <= pool.length - (free - k); i++) { pick[k] = pool[i]; choose(i + 1, k + 1); }
      })(0, 0);
    } else {
      let rnd = o.seed >>> 0;
      const random = () => { // mulberry32
        rnd = (rnd + 0x6D2B79F5) >>> 0;
        let t = rnd;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const pickFree = set => { let h; do { h = pool[Math.floor(random() * pool.length)]; } while (set.includes(h)); return h; };
      complete = false;
      while (Date.now() < deadline) {
        let set = required.slice();
        while (set.length < 6) set.push(pickFree(set));
        let cur = evaluate(set, true);
        record(cur);
        let temp = 1.0;
        for (let i = 0; i < 3000; i++) {
          const j = required.length + Math.floor(random() * free);
          const next = set.slice(); next[j] = pickFree(set);
          const cand = evaluate(next, true);
          evals++;
          record(cand);
          const d = cand.f - cur.f;
          if (d >= 0 || random() < Math.exp(d / temp)) { set = next; cur = cand; }
          temp = Math.max(0.02, temp * 0.998);
          if ((i & 255) === 0 && Date.now() > deadline) break;
        }
        // 收尾：逐一試換，直到換誰都不會更好
        for (let improved = true; improved && Date.now() < deadline;) {
          improved = false;
          for (let j = required.length; j < 6 && !improved; j++) {
            for (const h of pool) {
              if (set.includes(h)) continue;
              const next = set.slice(); next[j] = h;
              const cand = evaluate(next, true);
              evals++;
              record(cand);
              if (cand.f > cur.f + 1e-9) { set = next; cur = cand; improved = true; break; }
            }
          }
        }
      }
    }

    const results = [...found.values()].map(r => ({
      formation, f: r.f, slots: r.slots, ennen: r.e, links: r.l, value: r.s, cost: r.c,
      groups: F.triples.map(t => table.matched(r.slots[t[0]], r.slots[t[1]], r.slots[t[2]]).map(x => ennen[x][0]))
    }));
    return { results, exact, complete, evals };
  }

  // options:
  //   formation 陣型名稱，或 'all' 四種都算再合併
  //   mode      'ennen' 因縁最多 | 'links' 連線組數最多 | 'value' 數值最高
  //   stats     要加總的能力索引（例如 [6] 魅力、[7,8,9,10] 四象）
  //   minEnnen  至少幾個因縁
  //   distinct  同名因縁只算一次
  //   useCap    套用陣型價值上限（英傑需帶 cost）
  //   required  一定要上的英傑（heroes 的索引）
  //   topK, seed
  //   timeLimit       隨機搜尋的總時間（ms）；組合數在 exactLimit 以內時改為列舉，最多 exactTimeLimit
  function solve(heroes, ennen, options) {
    const o = Object.assign({ formation: '方圓', mode: 'ennen', stats: [6], minEnnen: 0, distinct: true, useCap: false,
      required: [], topK: 10, timeLimit: 5000, seed: 12345, exactLimit: 200000, exactTimeLimit: 60000 }, options);
    const t0 = Date.now();
    const fail = error => ({ results: [], exact: true, complete: true, ms: 0, error });
    const names = o.formation === 'all' ? Object.keys(FORMATIONS) : [o.formation];
    if (names.some(f => !FORMATIONS[f])) return fail('未知的陣型');
    if (heroes.length < 6) return fail('至少要選 6 名英傑');
    if (new Set(o.required).size > 6) return fail('鎖定的英傑超過 6 名');
    const table = makeTable(heroes, ennen);
    let results = [], exact = true, complete = true, evals = 0;
    names.forEach((f, k) => {
      const share = Math.max(500, (o.timeLimit - (Date.now() - t0)) / (names.length - k));
      const r = solveOne(heroes, ennen, table, o, f, Date.now(), share);
      results = results.concat(r.results);
      exact = exact && r.exact; complete = complete && r.complete; evals += r.evals;
    });
    results.sort((a, b) => b.f - a.f);
    results = results.slice(0, o.topK);
    return { results, exact, complete, evals, ms: Date.now() - t0 };
  }

  const api = { FORMATIONS, arrangements, solve, makeTable };
  if (typeof module !== 'undefined') module.exports = api;
  else root.JinpoSolver = api;
})(typeof self !== 'undefined' ? self : this);
