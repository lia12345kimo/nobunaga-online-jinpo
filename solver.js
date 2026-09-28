// 英傑陣法搜尋：六名英傑排成一圈，每相鄰三人各提供一個因子即成立一個因縁。
// 分支定界窮舉，旋轉與鏡像視為同一陣法。瀏覽器與 Node 共用。
(function (root) {
  'use strict';

  const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  // heroes: [{factors: [...], value: number}]；ennen: [[name, [f1, f2, f3]], ...]
  function makeTable(heroes, ennen) {
    const n = heroes.length;
    // mask[h][r]：英傑 h 能填規則 r 的哪幾個位置（3 位元）
    const mask = heroes.map(h => ennen.map(([, need]) =>
      need.reduce((m, f, k) => m | (h.factors.includes(f) ? 1 << k : 0), 0)));
    const rulesOf = mask.map(m => m.flatMap((v, r) => (v ? [r] : [])));

    function matched(a, b, c) {
      const out = [];
      for (const r of rulesOf[a]) {
        const ma = mask[a][r], mb = mask[b][r], mc = mask[c][r];
        if (!mb || !mc) continue;
        for (const p of PERMS)
          if ((ma >> p[0] & 1) && (mb >> p[1] & 1) && (mc >> p[2] & 1)) { out.push(r); break; }
      }
      return out;
    }

    // 快取：人數不多時用平面陣列，否則用 Map
    const flat = n <= 200 ? new Int8Array(n * n * n).fill(-1) : null;
    const map = flat ? null : new Map();
    function count(a, b, c) {
      let t;
      if (a > b) { t = a; a = b; b = t; }
      if (b > c) { t = b; b = c; c = t; }
      if (a > b) { t = a; a = b; b = t; }
      const key = (a * n + b) * n + c;
      let v = flat ? flat[key] : map.get(key);
      if (v === undefined || v < 0) {
        v = matched(a, b, c).length;
        if (flat) flat[key] = v; else map.set(key, v);
      }
      return v;
    }
    return { n, matched, count };
  }

  function makeBest(topK) {
    const bySet = new Map();
    let floor = -Infinity;
    return {
      get floor() { return floor; },
      offer(ring, score, e, s) {
        const key = [...ring].sort((a, b) => a - b).join(',');
        const old = bySet.get(key);
        if (old && old.score >= score) return;
        if (!old && bySet.size >= topK && score <= floor) return;
        bySet.set(key, { ring: [...ring], score, ennen: e, value: s });
        if (bySet.size > topK) {
          let worst = null;
          for (const [k, r] of bySet) if (!worst || r.score < worst[1].score) worst = [k, r];
          bySet.delete(worst[0]);
        }
        if (bySet.size >= topK) floor = Math.min(...[...bySet.values()].map(r => r.score));
      },
      list() { return [...bySet.values()].sort((a, b) => b.score - a.score); }
    };
  }

  // 一圈六人成立的因縁：[{slot, rule}]，slot i 表示 ring[i]、ring[i+1]、ring[i+2]
  function ringDetail(table, ring) {
    const out = [];
    for (let i = 0; i < 6; i++)
      for (const r of table.matched(ring[i], ring[(i + 1) % 6], ring[(i + 2) % 6])) out.push({ slot: i, rule: r });
    return out;
  }

  // options:
  //   mode      'ennen' 因縁最多（同數比數值）| 'value' 數值最高
  //   minEnnen  至少幾個因縁
  //   distinct  同名因縁只算一次
  //   required  一定要上的英傑（heroes 的索引）
  //   topK, timeLimit(ms)
  function solve(heroesIn, ennen, options) {
    const o = Object.assign({ mode: 'ennen', minEnnen: 0, distinct: true, required: [], topK: 20, timeLimit: 20000 }, options);
    const t0 = Date.now();
    const N = heroesIn.length;
    if (N < 6) return { results: [], complete: true, nodes: 0, ms: 0, error: '至少要選 6 名英傑' };
    if (new Set(o.required).size > 6) return { results: [], complete: true, nodes: 0, ms: 0, error: '鎖定的英傑超過 6 名' };

    // 先依「單人最多參與幾個因縁」排序，排前面的較強
    const pre = makeTable(heroesIn, ennen);
    const reach = new Int32Array(N);
    for (let a = 0; a < N; a++) {
      let best = 0;
      for (let b = 0; b < N; b++) {
        if (b === a) continue;
        for (let c = b + 1; c < N; c++) {
          if (c === a) continue;
          const v = pre.matched(a, b, c).length;
          if (v > best) best = v;
        }
      }
      reach[a] = best;
    }
    const order = [...Array(N).keys()].sort((x, y) => reach[y] - reach[x] || (heroesIn[y].value || 0) - (heroesIn[x].value || 0));
    const heroes = order.map(i => heroesIn[i]);
    const back = order;                       // 新索引 -> 原索引
    const pos = new Int32Array(N); order.forEach((v, i) => { pos[v] = i; });
    const required = new Set(o.required.map(i => pos[i]));
    const hmax = order.map(i => reach[i]);    // 遞減
    const table = makeTable(heroes, ennen);
    const n = N;
    const value = heroes.map(h => h.value || 0);
    const W = 1e7;
    const score = (e, s) => (o.mode === 'ennen' ? e * W + s : s);
    const best = makeBest(o.topK);
    const byValue = [...Array(n).keys()].sort((a, b) => value[b] - value[a]);
    const maxReq = required.size ? Math.min(...required) : n;

    const pairMaxCache = new Map();
    function pairMax(a, b, lo) {
      const key = (a * n + b) * n + lo;
      let v = pairMaxCache.get(key);
      if (v === undefined) {
        v = 0;
        for (let c = lo + 1; c < n; c++) if (c !== a && c !== b) { const t = table.count(a, b, c); if (t > v) v = t; }
        pairMaxCache.set(key, v);
      }
      return v;
    }

    const ring = new Int32Array(6);
    const used = new Uint8Array(n);
    let nodes = 0, complete = true;

    function valueBound(k, lo) {
      let s = 0, left = 6 - k;
      for (const h of byValue) { if (!left) break; if (h > lo && !used[h]) { s += value[h]; left--; } }
      return s;
    }
    function missingRequired() {
      let c = 0;
      for (const r of required) if (!used[r]) c++;
      return c;
    }
    function evaluate() {
      if (ring[1] > ring[5]) return;          // 鏡像只算一次
      const rules = ringDetail(table, ring).map(d => d.rule);
      const e = o.distinct ? new Set(rules).size : rules.length;
      if (e < o.minEnnen) return;
      let s = 0;
      for (let i = 0; i < 6; i++) s += value[ring[i]];
      best.offer(ring, score(e, s), e, s);
    }

    // k：要放第幾格；e：已確定三人組的因縁數（重複也算，作為上限）
    function dfs(k, e, s, cap) {
      if (!complete) return;
      if ((++nodes & 0x3fff) === 0 && Date.now() - t0 > o.timeLimit) { complete = false; return; }
      if (k === 6) { evaluate(); return; }
      if (missingRequired() > 6 - k) return;
      const lo = ring[0];
      const cands = [];
      for (let c = lo + 1; c < n; c++) {
        if (used[c]) continue;
        cands.push([c, k >= 2 ? table.count(ring[k - 2], ring[k - 1], c) : 0]);
      }
      cands.sort((x, y) => y[1] - x[1] || value[y[0]] - value[x[0]]);
      for (const [c, t] of cands) {
        used[c] = 1; ring[k] = c;
        const e2 = e + t, s2 = s + value[c];
        // 放完第 k 格後，t0..t(k-2) 已確定；其餘上限：
        let eb = e2;
        if (k < 5) {
          eb += pairMax(ring[k - 1], c, lo);                    // 下一組 (k-1, k, ?)
          eb += (6 - (k >= 2 ? k - 1 : 0) - 1 - 2) * cap;         // 中間未定的組
          eb += cap + (k >= 1 ? pairMax(ring[0], ring[1], lo) : cap); // 收尾 (4,5,0)、(5,0,1)
        } else {
          eb += table.count(ring[4], ring[5], ring[0]) + table.count(ring[5], ring[0], ring[1]);
        }
        const sb = s2 + valueBound(k + 1, lo);
        if (eb >= o.minEnnen && score(eb, sb) > best.floor) dfs(k + 1, e2, s2, cap);
        used[c] = 0;
        if (!complete) return;
      }
    }

    for (let a = 0; a <= n - 6 && complete; a++) {
      if (a > maxReq) break;                   // ring[0] 是圈中索引最小者
      const cap = hmax[a];                     // 圈中其他人索引都比 a 大，每組上限不超過 cap
      const topValue = byValue.filter(h => h >= a).slice(0, 6).reduce((x, h) => x + value[h], 0);
      if (6 * cap < o.minEnnen) break;
      if (score(6 * cap, topValue) <= best.floor) {
        if (o.mode === 'ennen') break; else continue;
      }
      ring[0] = a; used[a] = 1;
      dfs(1, 0, value[a], cap);
      used[a] = 0;
    }

    const results = best.list().map(r => {
      const ringOrig = [...r.ring].map(i => back[i]);
      const detail = ringDetail(table, r.ring).map(d => ({ slot: d.slot, ennen: ennen[d.rule][0] }));
      return { ring: ringOrig, ennen: r.ennen, value: r.value, detail };
    });
    return { results, complete, nodes, ms: Date.now() - t0 };
  }

  // 六人固定時的 60 種排法（旋轉、鏡像去重）：第 0 人固定在第 0 格，且 ring[1] < ring[5]
  const ARRANGE = (function () {
    const out = [];
    const rest = [1, 2, 3, 4, 5];
    (function perm(arr, k) {
      if (k === arr.length) { if (arr[0] < arr[4]) out.push([0, ...arr]); return; }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        perm(arr, k + 1);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    })(rest, 0);
    return out;
  })();

  // 選人用模擬退火，排位置用窮舉。人多時用這個。
  function search(heroes, ennen, options) {
    const o = Object.assign({ mode: 'ennen', minEnnen: 0, distinct: true, required: [], topK: 20, timeLimit: 4000, seed: 12345 }, options);
    const t0 = Date.now();
    const n = heroes.length;
    if (n < 6) return { results: [], complete: true, ms: 0, error: '至少要選 6 名英傑' };
    const required = [...new Set(o.required)];
    if (required.length > 6) return { results: [], complete: true, ms: 0, error: '鎖定的英傑超過 6 名' };
    const table = makeTable(heroes, ennen);
    const value = heroes.map(h => h.value || 0);
    const maxValue = Math.max(1, ...value) * 6;
    let rnd = o.seed >>> 0;
    const random = () => { // mulberry32
      rnd = (rnd + 0x6D2B79F5) >>> 0;
      let t = rnd;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // 三人組成立的規則，快取
    const triCache = new Map();
    function tri(a, b, c) {
      let t;
      if (a > b) { t = a; a = b; b = t; }
      if (b > c) { t = b; b = c; c = t; }
      if (a > b) { t = a; a = b; b = t; }
      const key = (a * n + b) * n + c;
      let v = triCache.get(key);
      if (v === undefined) { v = table.matched(a, b, c); triCache.set(key, v); }
      return v;
    }
    // 回傳 [因縁數, 連線組數]：連線組數是六組相鄰三人中至少成立一個因縁的組數
    function ringScore(ring) {
      let total = 0, links = 0;
      const seen = new Set();
      for (let i = 0; i < 6; i++) {
        const got = tri(ring[i], ring[(i + 1) % 6], ring[(i + 2) % 6]);
        if (got.length) links++;
        total += got.length;
        for (const r of got) seen.add(r);
      }
      return [o.distinct ? seen.size : total, links];
    }
    // 目標值：
    //   ennen  因縁數為主、數值為次
    //   links  連線組數為主、因縁數次之、數值再次之
    //   value  數值為主，因縁不足要扣分
    function objective(e, l, s) {
      if (o.mode === 'ennen') return e + 0.999 * s / maxValue;
      if (o.mode === 'links') return l * 30 + e + 0.999 * s / maxValue;
      return s / maxValue - Math.max(0, o.minEnnen - e) * 2;
    }
    function bestArrangement(set) {
      let s = 0;
      for (const h of set) s += value[h];
      let best = null;
      const ring = new Array(6);
      for (const p of ARRANGE) {
        for (let i = 0; i < 6; i++) ring[i] = set[p[i]];
        const [e, l] = ringScore(ring);
        const f = objective(e, l, s);
        if (!best || f > best.f) best = { e, l, s, f, ring: ring.slice() };
      }
      return best;
    }

    const found = new Map();
    let floor = -Infinity;
    function record(r) {
      if (r.e < o.minEnnen) return;
      const key = [...r.ring].sort((a, b) => a - b).join(',');
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
    // 起點：鎖定的人＋隨機補滿
    function startSet() {
      const set = [...required];
      const taken = new Set(set);
      while (set.length < 6) {
        const h = pool[Math.floor(random() * pool.length)];
        if (!taken.has(h)) { taken.add(h); set.push(h); }
      }
      return set;
    }

    let evals = 0, restarts = 0;
    const steps = 4000;
    while (Date.now() - t0 < o.timeLimit) {
      restarts++;
      let set = startSet();
      let cur = bestArrangement(set);
      record(cur);
      let temp = 1.0;
      for (let i = 0; i < steps; i++) {
        // 換掉一個未鎖定的人
        const slots = set.map((h, j) => j).filter(j => !locked.has(set[j]));
        if (!slots.length) break;
        const j = slots[Math.floor(random() * slots.length)];
        let h;
        do { h = pool[Math.floor(random() * pool.length)]; } while (set.includes(h));
        const next = set.slice(); next[j] = h;
        const cand = bestArrangement(next);
        evals++;
        record(cand);
        const d = cand.f - cur.f;
        if (d >= 0 || random() < Math.exp(d / temp)) { set = next; cur = cand; }
        temp = Math.max(0.02, temp * 0.999);
        if ((i & 255) === 0 && Date.now() - t0 > o.timeLimit) break;
      }
      // 收尾：逐一試換每個未鎖定的位置，直到換誰都不會更好
      for (let improved = true; improved && Date.now() - t0 < o.timeLimit;) {
        improved = false;
        for (let j = 0; j < 6 && !improved; j++) {
          if (locked.has(set[j])) continue;
          for (const h of pool) {
            if (set.includes(h)) continue;
            const next = set.slice(); next[j] = h;
            const cand = bestArrangement(next);
            evals++;
            record(cand);
            if (cand.f > cur.f + 1e-9) { set = next; cur = cand; improved = true; break; }
          }
        }
      }
    }

    const results = [...found.values()].sort((a, b) => b.f - a.f).map(r => ({
      ring: r.ring, ennen: r.e, links: r.l, value: r.s,
      detail: ringDetail(table, r.ring).map(d => ({ slot: d.slot, ennen: ennen[d.rule][0] }))
    }));
    return { results, complete: false, ms: Date.now() - t0, evals, restarts };
  }

  // 已知六人（依圈上順序）時直接計算
  function evaluateRing(heroes, ennen, ring, distinct) {
    const table = makeTable(heroes, ennen);
    const detail = ringDetail(table, ring).map(d => ({ slot: d.slot, ennen: ennen[d.rule][0] }));
    const e = distinct ? new Set(detail.map(d => d.ennen)).size : detail.length;
    return { ennen: e, detail };
  }

  const api = { solve, search, evaluateRing, makeTable };
  if (typeof module !== 'undefined') module.exports = api;
  else root.JinpoSolver = api;
})(typeof self !== 'undefined' ? self : this);
