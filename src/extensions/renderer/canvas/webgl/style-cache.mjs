/**
 * StyleSnapshotCache: Caches pstyle() values for WebGL rendering to avoid
 * redundant style lookups during steady-state pan/zoom.
 *
 * During pan/zoom (no style changes), this cache eliminates all pstyle() calls
 * in the render loop. Only elements whose style has actually changed trigger
 * pstyle() reads.
 *
 * The cache uses ele._private.styleKey to detect staleness. When the styleKey
 * changes, the element is marked dirty and its cached values are re-read on
 * the next frame.
 */

import { SHAPE_ENUM } from './programs/node-sdf.mjs';

// Use SHAPE_ENUM from the shader as the authoritative source.
// For shapes not supported by SDF, fall back to rectangle (0).
const SHAPE_MAP = Object.assign({}, SHAPE_ENUM, {
  'right-rhomboid': SHAPE_ENUM['rhomboid'] || 0,
  'round-triangle': SHAPE_ENUM['triangle'] || 0,
  'round-diamond': SHAPE_ENUM['diamond'] || 0,
  'round-pentagon': SHAPE_ENUM['pentagon'] || 0,
  'round-hexagon': SHAPE_ENUM['hexagon'] || 0,
  'round-heptagon': SHAPE_ENUM['heptagon'] || 0,
  'round-octagon': SHAPE_ENUM['octagon'] || 0,
  'round-tag': SHAPE_ENUM['tag'] || 0,
  'polygon': 0, // custom polygons unsupported by SDF, fallback to rectangle
});

// Fields per node: bg r,g,b, bgOpacity, borderWidth, border r,g,b,a, borderPosition(encoded), shape(int), cornerRadius, isSimple(int)
// = 13 floats
const NODE_FLOATS = 13;
// Fields per edge: line r,g,b, lineWidth, baseOpacity, lineOpacity, srcArrow r,g,b, tgtArrow r,g,b, arrowScale, srcArrowShape(int), tgtArrowShape(int)
// = 15 floats
const EDGE_FLOATS = 15;

const ARROW_SHAPE_NONE = 0;
const ARROW_SHAPE_OTHER = 1;

export class StyleSnapshotCache {
  constructor() {
    this.nodeIdToIndex = new Map();
    this.edgeIdToIndex = new Map();
    this.nodeStyleKeys = [];
    this.edgeStyleKeys = [];
    this.nodeData = null; // Float32Array
    this.edgeData = null; // Float32Array
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.nodeCapacity = 0;
    this.edgeCapacity = 0;
    this.dirtyCount = 0;
    this._freeNodeSlots = [];
    this._freeEdgeSlots = [];
  }

  removeNode(node) {
    const id = node._private.data.id;
    if(this.nodeIdToIndex.has(id)) {
      const idx = this.nodeIdToIndex.get(id);
      this._freeNodeSlots.push(idx);
      this.nodeIdToIndex.delete(id);
      node._private._wglIdx = undefined;
    }
  }

  removeEdge(edge) {
    const id = edge._private.data.id;
    if(this.edgeIdToIndex.has(id)) {
      const idx = this.edgeIdToIndex.get(id);
      this._freeEdgeSlots.push(idx);
      this.edgeIdToIndex.delete(id);
      edge._private._wglIdx = undefined;
    }
  }

  _ensureNodeCapacity(count) {
    if(count <= this.nodeCapacity) return;
    const newCap = Math.max(count, this.nodeCapacity * 2, 1024);
    const newData = new Float32Array(newCap * NODE_FLOATS);
    if(this.nodeData) {
      newData.set(this.nodeData);
    }
    this.nodeData = newData;
    while(this.nodeStyleKeys.length < newCap) {
      this.nodeStyleKeys.push(null);
    }
    this.nodeCapacity = newCap;
  }

  _ensureEdgeCapacity(count) {
    if(count <= this.edgeCapacity) return;
    const newCap = Math.max(count, this.edgeCapacity * 2, 1024);
    const newData = new Float32Array(newCap * EDGE_FLOATS);
    if(this.edgeData) {
      newData.set(this.edgeData);
    }
    this.edgeData = newData;
    while(this.edgeStyleKeys.length < newCap) {
      this.edgeStyleKeys.push(null);
    }
    this.edgeCapacity = newCap;
  }

  _getNodeIndex(node) {
    // Store index directly on element to avoid Map.get in hot path
    const _p = node._private;
    let index = _p._wglIdx;
    if(index === undefined) {
      if(this._freeNodeSlots.length > 0) {
        index = this._freeNodeSlots.pop();
      } else {
        index = this.nodeCount++;
        this._ensureNodeCapacity(this.nodeCount);
      }
      _p._wglIdx = index;
      this.nodeIdToIndex.set(_p.data.id, index);
    }
    return index;
  }

  _getEdgeIndex(edge) {
    const _p = edge._private;
    let index = _p._wglIdx;
    if(index === undefined) {
      if(this._freeEdgeSlots.length > 0) {
        index = this._freeEdgeSlots.pop();
      } else {
        index = this.edgeCount++;
        this._ensureEdgeCapacity(this.edgeCount);
      }
      _p._wglIdx = index;
      this.edgeIdToIndex.set(_p.data.id, index);
    }
    return index;
  }

  /**
   * Get the byte offset into nodeData for direct typed-array access.
   * Use in hot path to avoid per-property Map.get calls.
   * Caller must have called updateNode() first.
   */
  getNodeOffset(node) {
    return node._private._wglIdx * NODE_FLOATS;
  }

  /**
   * Get the byte offset into edgeData for direct typed-array access.
   */
  getEdgeOffset(edge) {
    return edge._private._wglIdx * EDGE_FLOATS;
  }

  /**
   * Get the current style key for an element.
   * Uses _private.styleKey which is a hash of all applied style property values.
   */
  _getStyleKey(ele) {
    return ele._private.styleKey || '';
  }

  /**
   * Check if a node's cached style is stale.
   */
  isNodeDirty(node) {
    const id = node._private.data.id;
    const index = this.nodeIdToIndex.get(id);
    if(index === undefined) return true;
    return this.nodeStyleKeys[index] !== this._getStyleKey(node);
  }

  /**
   * Check if an edge's cached style is stale.
   */
  isEdgeDirty(edge) {
    const id = edge._private.data.id;
    const index = this.edgeIdToIndex.get(id);
    if(index === undefined) return true;
    return this.edgeStyleKeys[index] !== this._getStyleKey(edge);
  }

  /**
   * Update a node's cached style values. Only reads pstyle() if dirty.
   * Returns true if the node was dirty and updated.
   */
  updateNode(node) {
    const index = this._getNodeIndex(node);
    const key = this._getStyleKey(node);
    if(this.nodeStyleKeys[index] === key) {
      return false;
    }
    this.nodeStyleKeys[index] = key;

    const offset = index * NODE_FLOATS;
    const data = this.nodeData;

    // background-color: [r, g, b] 0-255
    const bgColor = node.pstyle('background-color').value;
    data[offset + 0] = bgColor[0];
    data[offset + 1] = bgColor[1];
    data[offset + 2] = bgColor[2];

    // background-opacity
    data[offset + 3] = node.pstyle('background-opacity').value;

    // border-width
    data[offset + 4] = node.pstyle('border-width').value;

    // border-color + border-opacity
    const borderColor = node.pstyle('border-color').value;
    const borderOpacity = node.pstyle('border-opacity').value;
    data[offset + 5] = borderColor[0];
    data[offset + 6] = borderColor[1];
    data[offset + 7] = borderColor[2];
    data[offset + 8] = borderOpacity;

    // border-position encoded: 0=center, 1=inside, 2=outside
    const borderPos = node.pstyle('border-position').value;
    data[offset + 9] = borderPos === 'inside' ? 1 : (borderPos === 'outside' ? 2 : 0);

    // shape (as integer enum)
    const shape = node.pstyle('shape').value;
    data[offset + 10] = SHAPE_MAP[shape] !== undefined ? SHAPE_MAP[shape] : -1;

    // corner-radius (stored as raw value; 'auto' stored as -1)
    const crPstyle = node.pstyle('corner-radius');
    data[offset + 11] = crPstyle.value === 'auto' ? -1 : crPstyle.pfValue;

    // isSimple: can this node be rendered via SDF (no texture needed)?
    // Caching this avoids 3-5 pstyle() calls per node per frame.
    // 1 = simple (SDF), 0 = needs texture (bg-image, gradient, dashed border)
    let isSimple = 1;
    if(node.pstyle('background-fill').value !== 'solid') isSimple = 0;
    else if(node.pstyle('background-image').strValue !== 'none') isSimple = 0;
    else if(data[offset + 4] > 0 && data[offset + 8] > 0) { // border-width > 0 && border-opacity > 0
      if(node.pstyle('border-style').value !== 'solid') isSimple = 0;
    }
    data[offset + 12] = isSimple;

    this.dirtyCount++;
    return true;
  }

  /**
   * Update an edge's cached style values. Only reads pstyle() if dirty.
   * Returns true if the edge was dirty and updated.
   */
  updateEdge(edge) {
    const index = this._getEdgeIndex(edge);
    const key = this._getStyleKey(edge);
    if(this.edgeStyleKeys[index] === key) {
      return false;
    }
    this.edgeStyleKeys[index] = key;

    const offset = index * EDGE_FLOATS;
    const data = this.edgeData;

    // line-color: [r, g, b] 0-255
    const lineColor = edge.pstyle('line-color').value;
    data[offset + 0] = lineColor[0];
    data[offset + 1] = lineColor[1];
    data[offset + 2] = lineColor[2];

    // width
    data[offset + 3] = edge.pstyle('width').pfValue;

    // opacity
    data[offset + 4] = edge.pstyle('opacity').value;

    // line-opacity
    data[offset + 5] = edge.pstyle('line-opacity').value;

    // source-arrow-color
    const srcArrowColor = edge.pstyle('source-arrow-color').value;
    data[offset + 6] = srcArrowColor[0];
    data[offset + 7] = srcArrowColor[1];
    data[offset + 8] = srcArrowColor[2];

    // target-arrow-color
    const tgtArrowColor = edge.pstyle('target-arrow-color').value;
    data[offset + 9] = tgtArrowColor[0];
    data[offset + 10] = tgtArrowColor[1];
    data[offset + 11] = tgtArrowColor[2];

    // arrow-scale
    data[offset + 12] = edge.pstyle('arrow-scale').value;

    // source-arrow-shape: 0=none, 1=other
    const srcArrowShape = edge.pstyle('source-arrow-shape').value;
    data[offset + 13] = srcArrowShape === 'none' ? ARROW_SHAPE_NONE : ARROW_SHAPE_OTHER;

    // target-arrow-shape: 0=none, 1=other
    const tgtArrowShape = edge.pstyle('target-arrow-shape').value;
    data[offset + 14] = tgtArrowShape === 'none' ? ARROW_SHAPE_NONE : ARROW_SHAPE_OTHER;

    this.dirtyCount++;
    return true;
  }

  /**
   * Batch update all elements. Returns count of dirty elements updated.
   */
  batchUpdate(eles) {
    this.dirtyCount = 0;
    for(let i = 0; i < eles.length; i++) {
      const ele = eles[i];
      if(ele.isNode()) {
        this.updateNode(ele);
      } else {
        this.updateEdge(ele);
      }
    }
    return this.dirtyCount;
  }

  // --- Node property accessors ---

  getNodeBgColor(node) {
    const index = this._getNodeIndex(node);
    const offset = index * NODE_FLOATS;
    return [this.nodeData[offset], this.nodeData[offset + 1], this.nodeData[offset + 2]];
  }

  getNodeBgOpacity(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 3];
  }

  getNodeBorderWidth(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 4];
  }

  getNodeBorderColor(node) {
    const index = this._getNodeIndex(node);
    const offset = index * NODE_FLOATS + 5;
    return [this.nodeData[offset], this.nodeData[offset + 1], this.nodeData[offset + 2]];
  }

  getNodeBorderOpacity(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 8];
  }

  /** Returns 0=center, 1=inside, 2=outside */
  getNodeBorderPosition(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 9];
  }

  getNodeShapeEnum(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 10];
  }

  /** Returns -1 for 'auto', otherwise the pixel value */
  getNodeCornerRadius(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 11];
  }

  /** Returns 1 if node can use SDF (simple shape), 0 if needs texture */
  getNodeIsSimple(node) {
    const index = this._getNodeIndex(node);
    return this.nodeData[index * NODE_FLOATS + 12];
  }

  // --- Edge property accessors ---

  getEdgeLineColor(edge) {
    const index = this._getEdgeIndex(edge);
    const offset = index * EDGE_FLOATS;
    return [this.edgeData[offset], this.edgeData[offset + 1], this.edgeData[offset + 2]];
  }

  getEdgeWidth(edge) {
    const index = this._getEdgeIndex(edge);
    return this.edgeData[index * EDGE_FLOATS + 3];
  }

  getEdgeOpacity(edge) {
    const index = this._getEdgeIndex(edge);
    return this.edgeData[index * EDGE_FLOATS + 4];
  }

  getEdgeLineOpacity(edge) {
    const index = this._getEdgeIndex(edge);
    return this.edgeData[index * EDGE_FLOATS + 5];
  }

  getEdgeSourceArrowColor(edge) {
    const index = this._getEdgeIndex(edge);
    const offset = index * EDGE_FLOATS + 6;
    return [this.edgeData[offset], this.edgeData[offset + 1], this.edgeData[offset + 2]];
  }

  getEdgeTargetArrowColor(edge) {
    const index = this._getEdgeIndex(edge);
    const offset = index * EDGE_FLOATS + 9;
    return [this.edgeData[offset], this.edgeData[offset + 1], this.edgeData[offset + 2]];
  }

  getEdgeArrowScale(edge) {
    const index = this._getEdgeIndex(edge);
    return this.edgeData[index * EDGE_FLOATS + 12];
  }

  /** Returns 0 for 'none', 1 for any other shape */
  getEdgeSourceArrowShape(edge) {
    const index = this._getEdgeIndex(edge);
    return this.edgeData[index * EDGE_FLOATS + 13];
  }

  /** Returns 0 for 'none', 1 for any other shape */
  getEdgeTargetArrowShape(edge) {
    const index = this._getEdgeIndex(edge);
    return this.edgeData[index * EDGE_FLOATS + 14];
  }

  /**
   * Remove an element from the cache.
   */
  removeElement(ele) {
    if(ele.isNode()) {
      this.nodeIdToIndex.delete(ele._private.data.id);
    } else {
      this.edgeIdToIndex.delete(ele._private.data.id);
    }
  }

  /**
   * Clear all cached data.
   */
  clear() {
    this.nodeIdToIndex.clear();
    this.edgeIdToIndex.clear();
    this.nodeStyleKeys.length = 0;
    this.edgeStyleKeys.length = 0;
    this.nodeData = null;
    this.edgeData = null;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.nodeCapacity = 0;
    this.edgeCapacity = 0;
    this.dirtyCount = 0;
  }
}

export { SHAPE_MAP };
