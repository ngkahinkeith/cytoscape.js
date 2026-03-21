/**
 * Deterministic large graph generators for benchmarking and testing.
 *
 * Each generator returns { nodes: [...], edges: [...] } suitable for cy.add().
 * All generators use a seeded PRNG for deterministic output.
 */

function seededRandom(seed = 12345) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Generate a random graph with the given number of nodes and edges.
 * @param {number} nodeCount - Number of nodes to generate
 * @param {number} edgeFactor - Multiplier for edge count (edges = nodeCount * edgeFactor)
 * @returns {{ nodes: Array, edges: Array }}
 */
export function generateRandom(nodeCount, edgeFactor = 1.5) {
  const rand = seededRandom(12345);
  const nodes = [];
  const edges = [];
  const edgeCount = Math.floor(nodeCount * edgeFactor);

  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ data: { id: 'n' + i } });
  }

  for (let i = 0; i < edgeCount; i++) {
    const src = Math.floor(rand() * nodeCount);
    const tgt = Math.floor(rand() * nodeCount);
    edges.push({ data: { id: 'e' + i, source: 'n' + src, target: 'n' + tgt } });
  }

  return { nodes, edges };
}

/**
 * Generate a grid graph with 4-connectivity.
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @returns {{ nodes: Array, edges: Array }}
 */
export function generateGrid(cols, rows) {
  const nodes = [];
  const edges = [];
  let edgeId = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      nodes.push({ data: { id: 'n' + id } });

      // Connect to the node to the left
      if (c > 0) {
        const leftId = r * cols + (c - 1);
        edges.push({ data: { id: 'e' + edgeId++, source: 'n' + id, target: 'n' + leftId } });
      }

      // Connect to the node above
      if (r > 0) {
        const aboveId = (r - 1) * cols + c;
        edges.push({ data: { id: 'e' + edgeId++, source: 'n' + id, target: 'n' + aboveId } });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Generate a tree with given depth and branching factor.
 * @param {number} depth - Depth of the tree (root is depth 1)
 * @param {number} branching - Number of children per node
 * @returns {{ nodes: Array, edges: Array }}
 */
export function generateTree(depth, branching = 2) {
  const nodes = [];
  const edges = [];
  let nodeId = 0;
  let edgeId = 0;

  function addNode(currentDepth, parentId) {
    const id = nodeId++;
    nodes.push({ data: { id: 'n' + id } });

    if (parentId !== null) {
      edges.push({ data: { id: 'e' + edgeId++, source: 'n' + parentId, target: 'n' + id } });
    }

    if (currentDepth < depth) {
      for (let i = 0; i < branching; i++) {
        addNode(currentDepth + 1, id);
      }
    }
  }

  addNode(1, null);
  return { nodes, edges };
}

/**
 * Generate a scale-free graph using the Barabasi-Albert preferential attachment model.
 * Starts with an initial connected set of (m+1) nodes, then adds nodes one at a time,
 * each connecting to m existing nodes with probability proportional to their degree.
 * @param {number} nodeCount - Total number of nodes
 * @param {number} m - Number of edges each new node adds
 * @returns {{ nodes: Array, edges: Array }}
 */
export function generateScaleFree(nodeCount, m = 2) {
  const rand = seededRandom(12345);
  const nodes = [];
  const edges = [];
  let edgeId = 0;

  // Degree tracking for preferential attachment
  const degree = new Array(nodeCount).fill(0);

  // Start with m+1 fully connected nodes
  const initialCount = Math.min(m + 1, nodeCount);
  for (let i = 0; i < initialCount; i++) {
    nodes.push({ data: { id: 'n' + i } });
  }

  // Connect initial nodes in a chain to ensure connectivity
  for (let i = 1; i < initialCount; i++) {
    edges.push({ data: { id: 'e' + edgeId++, source: 'n' + (i - 1), target: 'n' + i } });
    degree[i - 1]++;
    degree[i]++;
  }

  // Add remaining nodes with preferential attachment
  for (let i = initialCount; i < nodeCount; i++) {
    nodes.push({ data: { id: 'n' + i } });

    // Calculate total degree for probability distribution
    const targets = new Set();
    let attempts = 0;
    const maxAttempts = m * 10;

    while (targets.size < m && attempts < maxAttempts) {
      attempts++;

      // Sum of all degrees (with minimum 1 for each node to avoid zero-probability)
      let totalDegree = 0;
      for (let j = 0; j < i; j++) {
        totalDegree += degree[j] + 1; // +1 so isolated nodes still have a chance
      }

      // Pick a target proportional to degree
      let r = rand() * totalDegree;
      for (let j = 0; j < i; j++) {
        r -= (degree[j] + 1);
        if (r <= 0) {
          targets.add(j);
          break;
        }
      }
    }

    // Create edges to selected targets
    for (const target of targets) {
      edges.push({ data: { id: 'e' + edgeId++, source: 'n' + i, target: 'n' + target } });
      degree[i]++;
      degree[target]++;
    }
  }

  return { nodes, edges };
}
