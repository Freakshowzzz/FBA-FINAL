/**
 * Exact transportation-problem solver (no external dependencies).
 *
 *   1. Initial basic feasible solution: Vogel's Approximation Method (VAM).
 *   2. Optimality: MODI (u-v) method. Iterate until every non-basic cell has a
 *      reduced cost c_ij - u_i - v_j >= 0, which proves the solution is a global minimum.
 *
 * Unbalanced problems are balanced with a zero-cost dummy row/column:
 *   - supply > demand: dummy destination absorbs the unused inventory
 *   - supply < demand: dummy origin supplies the shortfall (reported as unmet demand)
 */

function vogel(supply, demand, cost) {
  const m = supply.length;
  const n = demand.length;
  const s = supply.slice();
  const d = demand.slice();
  const alloc = Array.from({ length: m }, () => Array(n).fill(0));
  const basic = Array.from({ length: m }, () => Array(n).fill(false));
  const rowDone = Array(m).fill(false);
  const colDone = Array(n).fill(false);

  // Penalty = difference between the two cheapest open cells in a line
  const penalty = (costs) => {
    if (costs.length === 0) return -1;
    if (costs.length === 1) return costs[0];
    const sorted = costs.slice().sort((a, b) => a - b);
    return sorted[1] - sorted[0];
  };

  let remaining = m + n - 1;
  while (remaining > 0) {
    let best = { pen: -1, type: null, idx: -1 };
    for (let i = 0; i < m; i++) {
      if (rowDone[i]) continue;
      const cs = [];
      for (let j = 0; j < n; j++) if (!colDone[j]) cs.push(cost[i][j]);
      const p = penalty(cs);
      if (p > best.pen) best = { pen: p, type: 'row', idx: i };
    }
    for (let j = 0; j < n; j++) {
      if (colDone[j]) continue;
      const cs = [];
      for (let i = 0; i < m; i++) if (!rowDone[i]) cs.push(cost[i][j]);
      const p = penalty(cs);
      if (p > best.pen) best = { pen: p, type: 'col', idx: j };
    }
    if (best.type === null) break;

    // Cheapest open cell in the line with the biggest penalty
    let ci = -1;
    let cj = -1;
    if (best.type === 'row') {
      ci = best.idx;
      for (let j = 0; j < n; j++) {
        if (!colDone[j] && (cj === -1 || cost[ci][j] < cost[ci][cj])) cj = j;
      }
    } else {
      cj = best.idx;
      for (let i = 0; i < m; i++) {
        if (!rowDone[i] && (ci === -1 || cost[i][cj] < cost[ci][cj])) ci = i;
      }
    }

    const q = Math.min(s[ci], d[cj]);
    alloc[ci][cj] = q;
    basic[ci][cj] = true;
    s[ci] -= q;
    d[cj] -= q;
    remaining--;
    // Close one line per allocation (the row if both hit zero, unless it is the last open row);
    // any missing basic cells from degeneracy are added later by completeBasis().
    const openRows = rowDone.filter(x => !x).length;
    if (s[ci] === 0 && (d[cj] > 0 || openRows > 1)) {
      rowDone[ci] = true;
    } else {
      colDone[cj] = true;
    }
    if (rowDone.every(Boolean) || colDone.every(Boolean)) break;
  }
  return { alloc, basic };
}

/** Make the basis a spanning tree of the m+n bipartite nodes (handles degeneracy). */
function completeBasis(basic, cost) {
  const m = basic.length;
  const n = basic[0].length;
  const parent = Array.from({ length: m + n }, (_, k) => k);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  let edges = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (basic[i][j]) {
        parent[find(i)] = find(m + j);
        edges++;
      }
    }
  }
  if (edges < m + n - 1) {
    const cells = [];
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (!basic[i][j]) cells.push({ i, j, c: cost[i][j] });
    cells.sort((a, b) => a.c - b.c);
    for (const { i, j } of cells) {
      if (edges >= m + n - 1) break;
      if (find(i) !== find(m + j)) {
        parent[find(i)] = find(m + j);
        basic[i][j] = true; // zero-valued basic cell
        edges++;
      }
    }
  }
}

function totalCost(alloc, cost) {
  let z = 0;
  for (let i = 0; i < alloc.length; i++) for (let j = 0; j < alloc[0].length; j++) z += alloc[i][j] * cost[i][j];
  return z;
}

function modi(alloc, basic, cost) {
  const m = alloc.length;
  const n = alloc[0].length;
  let iterations = 0;
  const MAX_ITER = 20000;
  const BLAND_AFTER = 1000; // switch to first-improving-cell rule to rule out cycling

  while (iterations < MAX_ITER) {
    // Adjacency of the basis tree
    const adj = Array.from({ length: m + n }, () => []);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (basic[i][j]) {
      adj[i].push(m + j);
      adj[m + j].push(i);
    }

    // Dual variables: u_i + v_j = c_ij on basic cells (u_0 = 0)
    const pot = Array(m + n).fill(null);
    pot[0] = 0;
    const stack = [0];
    while (stack.length) {
      const x = stack.pop();
      for (const y of adj[x]) {
        if (pot[y] !== null) continue;
        pot[y] = x < m ? cost[x][y - m] - pot[x] : cost[y][x - m] - pot[x];
        stack.push(y);
      }
    }

    // Entering cell: most negative reduced cost (or first negative under Bland's rule)
    let enter = null;
    let minRc = 0;
    for (let i = 0; i < m && !(enter && iterations >= BLAND_AFTER); i++) {
      for (let j = 0; j < n; j++) {
        if (basic[i][j]) continue;
        const rc = cost[i][j] - pot[i] - pot[m + j];
        if (rc < minRc) {
          minRc = rc;
          enter = { i, j };
          if (iterations >= BLAND_AFTER) break;
        }
      }
    }
    if (!enter) break; // all reduced costs >= 0 -> optimal

    // Tree path from row i to column j
    const prev = Array(m + n).fill(-1);
    const queue = [enter.i];
    prev[enter.i] = enter.i;
    while (queue.length && prev[m + enter.j] === -1) {
      const x = queue.shift();
      for (const y of adj[x]) {
        if (prev[y] === -1) {
          prev[y] = x;
          queue.push(y);
        }
      }
    }
    const path = [];
    for (let x = m + enter.j; x !== enter.i; x = prev[x]) path.push(x);
    path.push(enter.i);
    path.reverse(); // row i, col, row, ..., col j

    // Edges along the path alternate -, +, -, ... starting at row i
    const cycle = [];
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k];
      const b = path[k + 1];
      const cell = a < m ? { i: a, j: b - m } : { i: b, j: a - m };
      cycle.push({ ...cell, sign: k % 2 === 0 ? -1 : 1 });
    }

    let theta = Infinity;
    let leave = null;
    for (const c of cycle) {
      if (c.sign === -1 && alloc[c.i][c.j] < theta) {
        theta = alloc[c.i][c.j];
        leave = c;
      }
    }
    for (const c of cycle) alloc[c.i][c.j] += c.sign * theta;
    alloc[enter.i][enter.j] += theta;
    basic[enter.i][enter.j] = true;
    basic[leave.i][leave.j] = false;
    iterations++;
  }
  return iterations;
}

/**
 * @param {number[]} supply   units available at each origin (upper bound)
 * @param {number[]} demand   units required at each destination
 * @param {number[][]} cost   unit cost matrix [origin][destination]
 */
function solveTransportation(supply, demand, cost) {
  const m = supply.length;
  const n = demand.length;
  const totalSupply = supply.reduce((a, b) => a + b, 0);
  const totalDemand = demand.reduce((a, b) => a + b, 0);

  // Balance the problem with a zero-cost dummy line
  const S = supply.slice();
  const D = demand.slice();
  const C = cost.map(r => r.slice());
  if (totalSupply > totalDemand) {
    D.push(totalSupply - totalDemand);
    C.forEach(r => r.push(0));
  } else if (totalSupply < totalDemand) {
    S.push(totalDemand - totalSupply);
    C.push(Array(D.length).fill(0));
  }

  const { alloc, basic } = vogel(S, D, C);
  completeBasis(basic, C);
  const initialCost = totalCost(alloc.slice(0, m).map(r => r.slice(0, n)), cost);
  const iterations = modi(alloc, basic, C);

  const allocation = alloc.slice(0, m).map(r => r.slice(0, n));
  const unmet = demand.map((dj, j) => dj - allocation.reduce((sum, row) => sum + row[j], 0));
  return {
    allocation,
    unmet,
    totalCost: totalCost(allocation, cost),
    initialCost, // cost of the Vogel starting solution, before MODI improvement
    iterations   // number of MODI pivots
  };
}

module.exports = { solveTransportation };
