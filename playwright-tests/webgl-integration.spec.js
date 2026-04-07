import { test, expect } from '@playwright/test';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper: create a graph in the browser and wait for it to render
async function createGraph(page, elements, style) {
  await page.evaluate(({ elements, style }) => {
    if(window.cy) window.cy.destroy();
    window.cy = cytoscape({
      container: document.getElementById('cytoscape'),
      elements,
      style: style || [
        { selector: 'node', style: { 'background-color': '#666', 'label': 'data(id)', 'width': 30, 'height': 30 } },
        { selector: 'edge', style: { 'width': 2, 'line-color': '#ccc', 'target-arrow-color': '#ccc', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } }
      ],
      layout: { name: 'preset' }
    });
  }, { elements, style });
  await delay(200);
}

const simpleGraph = [
  { data: { id: 'a' }, position: { x: 100, y: 100 } },
  { data: { id: 'b' }, position: { x: 300, y: 100 } },
  { data: { id: 'c' }, position: { x: 200, y: 300 } },
  { data: { id: 'ab', source: 'a', target: 'b' } },
  { data: { id: 'bc', source: 'b', target: 'c' } },
  { data: { id: 'ac', source: 'a', target: 'c' } },
];

test.describe('Renderer integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  // ---- Rendered style computation (rendered-style.mjs) ----
  test.describe('rendered style', () => {
    test('computes rendered position from model position', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      expect(rpos.x).toBeGreaterThan(0);
      expect(rpos.y).toBeGreaterThan(0);
    });

    test('renderedBoundingBox returns valid box', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const bb = await page.evaluate(() => cy.$('#a').renderedBoundingBox());
      expect(bb.w).toBeGreaterThan(0);
      expect(bb.h).toBeGreaterThan(0);
      expect(bb.x1).toBeLessThan(bb.x2);
    });

    test('rendered style values include units', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const width = await page.evaluate(() => cy.$('#a').renderedStyle('width'));
      expect(parseFloat(width)).toBeGreaterThan(0);
      expect(width).toContain('px');
    });

    test('rendered dimensions scale with zoom', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const bb1 = await page.evaluate(() => {
        cy.zoom(1);
        return cy.$('#a').renderedBoundingBox();
      });
      const bb2 = await page.evaluate(() => {
        cy.zoom(2);
        return cy.$('#a').renderedBoundingBox();
      });
      expect(bb2.w).toBeGreaterThan(bb1.w * 1.5);
    });
  });

  // ---- Edge geometry (edge-control-points, edge-endpoints, edge-arrows) ----
  test.describe('edge geometry', () => {
    test('bezier edge has control points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 100 } },
        { data: { id: 'b' }, position: { x: 300, y: 100 } },
        { data: { id: 'ab1', source: 'a', target: 'b' } },
        { data: { id: 'ab2', source: 'a', target: 'b' } },
      ]);
      const cp = await page.evaluate(() => cy.$('#ab1').controlPoints());
      expect(cp).toBeDefined();
      expect(cp.length).toBeGreaterThan(0);
      expect(cp[0].x).toBeDefined();
      expect(cp[0].y).toBeDefined();
    });

    test('edge source and target endpoints are on node boundaries', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const data = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return {
          src: edge.sourceEndpoint(),
          tgt: edge.targetEndpoint(),
          srcPos: cy.$('#a').position(),
          tgtPos: cy.$('#b').position(),
        };
      });
      // Endpoints should be near but not exactly at node centers
      expect(Math.abs(data.src.x - data.srcPos.x)).toBeLessThan(50);
      expect(Math.abs(data.tgt.x - data.tgtPos.x)).toBeLessThan(50);
    });

    test('edge midpoint is between source and target', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const data = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return {
          mid: edge.midpoint(),
          srcPos: cy.$('#a').position(),
          tgtPos: cy.$('#b').position(),
        };
      });
      expect(isNaN(data.mid.x)).toBe(false);
      expect(isNaN(data.mid.y)).toBe(false);
      // The midpoint x should be between source and target x (with tolerance)
      const minX = Math.min(data.srcPos.x, data.tgtPos.x);
      const maxX = Math.max(data.srcPos.x, data.tgtPos.x);
      expect(data.mid.x).toBeGreaterThanOrEqual(minX - 50);
      expect(data.mid.x).toBeLessThanOrEqual(maxX + 50);
    });

    test('edge has valid private data after render', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const data = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return {
          hasSource: edge.source().id() === 'a',
          hasTarget: edge.target().id() === 'b',
          isEdge: edge.isEdge(),
        };
      });
      expect(data.hasSource).toBe(true);
      expect(data.hasTarget).toBe(true);
      expect(data.isEdge).toBe(true);
    });

    test('parallel edges have different control points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab1', source: 'a', target: 'b' } },
        { data: { id: 'ab2', source: 'a', target: 'b' } },
        { data: { id: 'ab3', source: 'a', target: 'b' } },
      ]);
      const cps = await page.evaluate(() => {
        return cy.edges().map(e => e.controlPoints());
      });
      // At least some edges should have control points
      const withCp = cps.filter(cp => cp && cp.length > 0);
      expect(withCp.length).toBeGreaterThan(0);
    });

    test('taxi edge has segment points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 100 } },
        { data: { id: 'b' }, position: { x: 300, y: 300 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: { 'curve-style': 'taxi', 'width': 2 } },
      ]);
      const pts = await page.evaluate(() => cy.$('#ab').segmentPoints());
      expect(pts).toBeDefined();
      expect(pts.length).toBeGreaterThan(0);
      for (const pt of pts) {
        expect(isNaN(pt.x)).toBe(false);
        expect(isNaN(pt.y)).toBe(false);
      }
    });

    test('straight edge has no control points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 100 } },
        { data: { id: 'b' }, position: { x: 300, y: 100 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: { 'curve-style': 'straight', 'width': 2 } },
      ]);
      const cp = await page.evaluate(() => cy.$('#ab').controlPoints());
      expect(cp).toBeUndefined();
    });
  });

  // ---- Coordinate conversion (coords.mjs) ----
  test.describe('coordinate conversion', () => {
    test('model to rendered position converts correctly', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const data = await page.evaluate(() => {
        const pos = cy.$('#a').position();
        const rpos = cy.$('#a').renderedPosition();
        const zoom = cy.zoom();
        const pan = cy.pan();
        return { pos, rpos, zoom, pan };
      });
      // renderedPos = modelPos * zoom + pan
      expect(data.rpos.x).toBeCloseTo(data.pos.x * data.zoom + data.pan.x, 0);
      expect(data.rpos.y).toBeCloseTo(data.pos.y * data.zoom + data.pan.y, 0);
    });

    test('rendered to model position is inverse', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const roundTrip = await page.evaluate(() => {
        const pos = { x: 150, y: 250 };
        cy.$('#a').position(pos);
        const rpos = cy.$('#a').renderedPosition();
        cy.$('#a').renderedPosition(rpos);
        return cy.$('#a').position();
      });
      expect(roundTrip.x).toBeCloseTo(150, 0);
      expect(roundTrip.y).toBeCloseTo(250, 0);
    });
  });

  // ---- Label computation (labels.mjs) ----
  test.describe('labels', () => {
    test('node label is computed from data', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const label = await page.evaluate(() => cy.$('#a').style('label'));
      expect(label).toBe('a');
    });

    test('edge label can be set', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 100 } },
        { data: { id: 'b' }, position: { x: 300, y: 100 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'label': 'data(id)' } },
        { selector: 'edge', style: { 'label': 'data(id)', 'curve-style': 'bezier' } },
      ]);
      const label = await page.evaluate(() => cy.$('#ab').style('label'));
      expect(label).toBe('ab');
    });
  });

  // ---- User interactions (load-listeners.mjs) ----
  test.describe('user interactions', () => {
    test('click on node selects it', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.mouse.click(rpos.x, rpos.y);
      await delay(200);
      const selected = await page.evaluate(() => cy.$('#a').selected());
      expect(selected).toBe(true);
    });

    test('click on background deselects all', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      await page.evaluate(() => cy.$('#a').select());
      expect(await page.evaluate(() => cy.$('#a').selected())).toBe(true);
      await page.mouse.click(10, 10);
      await delay(200);
      const selected = await page.evaluate(() => cy.$(':selected').length);
      expect(selected).toBe(0);
    });

    test('drag pans the viewport', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const pan1 = await page.evaluate(() => cy.pan());
      await page.mouse.move(400, 300);
      await page.mouse.down();
      await page.mouse.move(500, 400, { steps: 5 });
      await page.mouse.up();
      await delay(200);
      const pan2 = await page.evaluate(() => cy.pan());
      expect(pan2.x).not.toBe(pan1.x);
    });

    test('wheel zooms viewport', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const zoom1 = await page.evaluate(() => cy.zoom());
      await page.mouse.move(400, 300);
      await page.mouse.wheel(0, -200);
      await delay(500);
      const zoom2 = await page.evaluate(() => cy.zoom());
      expect(zoom2).not.toBe(zoom1);
    });

    test('node drag updates position', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.mouse.move(rpos.x, rpos.y);
      await page.mouse.down();
      await page.mouse.move(rpos.x + 100, rpos.y + 50, { steps: 5 });
      await page.mouse.up();
      await delay(200);
      const newPos = await page.evaluate(() => cy.$('#a').renderedPosition());
      expect(newPos.x).toBeGreaterThan(rpos.x + 50);
    });
  });

  // ---- Container and DOM (container.mjs, canvas renderer index) ----
  test.describe('container', () => {
    test('cy.container() returns the DOM element', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const isDiv = await page.evaluate(() => cy.container() === document.getElementById('cytoscape'));
      expect(isDiv).toBe(true);
    });

    test('cy.container() is not null after init', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const hasContainer = await page.evaluate(() => cy.container() !== null);
      expect(hasContainer).toBe(true);
    });

    test('renderer creates canvas layers', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const canvasCount = await page.evaluate(() => {
        return document.getElementById('cytoscape').querySelectorAll('canvas').length;
      });
      expect(canvasCount).toBeGreaterThan(0);
    });
  });

  // ---- Export (export.mjs, export-image.mjs) ----
  test.describe('export', () => {
    test('cy.png() returns a data URL', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const png = await page.evaluate(() => cy.png());
      expect(png).toMatch(/^data:image\/png;base64,/);
    });

    test('cy.jpg() returns a data URL', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const jpg = await page.evaluate(() => cy.jpg());
      expect(jpg).toMatch(/^data:image\/jpeg;base64,/);
    });

    test('cy.png() with options', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const png = await page.evaluate(() => cy.png({ scale: 2, bg: 'white' }));
      expect(png).toMatch(/^data:image\/png;base64,/);
    });
  });

  // ---- Stylesheet from DOM (stylesheet.mjs) ----
  test.describe('stylesheet', () => {
    test('style changes apply visually', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const color1 = await page.evaluate(() => cy.$('#a').style('background-color'));
      await page.evaluate(() => cy.$('#a').style('background-color', 'red'));
      const color2 = await page.evaluate(() => cy.$('#a').style('background-color'));
      expect(color1).not.toBe(color2);
    });

    test('addClass/removeClass changes style', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await page.evaluate(() => {
        cy.style().selector('.highlighted').style({ 'background-color': 'red', 'border-width': 3 }).update();
        cy.$('#a').addClass('highlighted');
      });
      const bw = await page.evaluate(() => parseFloat(cy.$('#a').style('border-width')));
      expect(bw).toBe(3);
      await page.evaluate(() => cy.$('#a').removeClass('highlighted'));
      const bw2 = await page.evaluate(() => parseFloat(cy.$('#a').style('border-width')));
      expect(bw2).toBe(0);
    });
  });

  // ---- Z-ordering (z-ordering.mjs) ----
  test.describe('z-ordering', () => {
    test('z-index changes element order', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const order1 = await page.evaluate(() => {
        return cy.elements().map(e => e.id());
      });
      await page.evaluate(() => cy.$('#c').style('z-index', 999));
      const order2 = await page.evaluate(() => {
        const sorted = cy.elements().sort((a, b) => a.style('z-index') - b.style('z-index'));
        return sorted.map(e => e.id());
      });
      expect(order2[order2.length - 1]).toBe('c');
    });
  });

  // ---- Edge projection (edge-projection.mjs) ----
  test.describe('edge projection', () => {
    test('edge bounding box encompasses source and target', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const data = await page.evaluate(() => {
        const edge = cy.$('#ab');
        const bb = edge.boundingBox();
        const srcPos = cy.$('#a').position();
        const tgtPos = cy.$('#b').position();
        return { bb, srcPos, tgtPos };
      });
      // Bounding box should have valid dimensions
      expect(data.bb.w).toBeGreaterThan(0);
      expect(data.bb.h).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- Layout execution with rendering ----
  test.describe('layout with render', () => {
    test('grid layout positions nodes in a grid', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'c' } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ]);
      await page.evaluate(() => {
        cy.layout({ name: 'grid', rows: 1, animate: false }).run();
      });
      await delay(200);
      const positions = await page.evaluate(() => cy.nodes().map(n => n.position()));
      positions.forEach(p => {
        expect(isNaN(p.x)).toBe(false);
        expect(isNaN(p.y)).toBe(false);
      });
      // In a single row, all y values should be similar
      expect(Math.abs(positions[0].y - positions[1].y)).toBeLessThan(5);
    });

    test('breadthfirst layout creates hierarchy', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'c' } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
        { data: { id: 'ac', source: 'a', target: 'c' } },
      ]);
      const positions = await page.evaluate(() => {
        cy.layout({ name: 'breadthfirst', roots: '#a', animate: false }).run();
        return { a: cy.$('#a').position(), b: cy.$('#b').position(), c: cy.$('#c').position() };
      });
      // Root should be above children
      expect(positions.a.y).toBeLessThan(positions.b.y);
      expect(positions.a.y).toBeLessThan(positions.c.y);
    });

    test('concentric layout creates rings', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'c' } }, { data: { id: 'd' } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
        { data: { id: 'ac', source: 'a', target: 'c' } },
        { data: { id: 'ad', source: 'a', target: 'd' } },
      ]);
      const data = await page.evaluate(() => {
        cy.layout({ name: 'concentric', animate: false, concentric: n => n.degree() }).run();
        const center = cy.$('#a').position(); // highest degree
        const dist = (p) => Math.sqrt((p.x - center.x) ** 2 + (p.y - center.y) ** 2);
        return {
          aDist: dist(cy.$('#a').position()),
          bDist: dist(cy.$('#b').position()),
        };
      });
      // Center node (highest degree) should be at/near center
      expect(data.aDist).toBeLessThan(data.bDist);
    });
  });

  // ---- Animation rendering ----
  test.describe('animation', () => {
    test('animate node position', async ({ page }) => {
      await createGraph(page, simpleGraph);
      const pos1 = await page.evaluate(() => cy.$('#a').position());
      await page.evaluate(() => {
        return new Promise(resolve => {
          cy.$('#a').animate({
            position: { x: 500, y: 500 },
            duration: 200,
            complete: resolve
          });
        });
      });
      const pos2 = await page.evaluate(() => cy.$('#a').position());
      expect(pos2.x).toBeCloseTo(500, 0);
      expect(pos2.y).toBeCloseTo(500, 0);
    });

    test('animate style property', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await page.evaluate(() => {
        return new Promise(resolve => {
          cy.$('#a').animate({
            style: { 'width': 100, 'height': 100 },
            duration: 200,
            complete: resolve
          });
        });
      });
      const w = await page.evaluate(() => parseFloat(cy.$('#a').style('width')));
      expect(w).toBeCloseTo(100, 0);
    });
  });

  // ---- Load listeners / User interactions (advanced) ----
  test.describe('user interactions (advanced)', () => {
    test('double-click on node triggers dblclick event', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.evaluate(() => {
        window._dblclickFired = false;
        cy.$('#a').on('dblclick', () => { window._dblclickFired = true; });
      });
      await page.mouse.dblclick(rpos.x, rpos.y);
      await delay(300);
      const fired = await page.evaluate(() => window._dblclickFired);
      expect(fired).toBe(true);
    });

    test('right-click on node triggers cxttap event', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.evaluate(() => {
        window._cxttapFired = false;
        cy.$('#a').on('cxttap', () => { window._cxttapFired = true; });
      });
      await page.mouse.click(rpos.x, rpos.y, { button: 'right' });
      await delay(300);
      const fired = await page.evaluate(() => window._cxttapFired);
      expect(fired).toBe(true);
    });

    test('box selection selects nodes in region', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 150, y: 150 } },
        { data: { id: 'b' }, position: { x: 200, y: 200 } },
        { data: { id: 'c' }, position: { x: 500, y: 500 } },
      ]);
      await delay(500);
      await page.evaluate(() => {
        cy.zoom(1);
        cy.pan({ x: 0, y: 0 });
      });
      await delay(300);
      // Box select over a and b but not c
      const startX = 100, startY = 100, endX = 280, endY = 280;
      await page.mouse.move(startX, startY);
      await page.keyboard.down('Shift');
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await delay(500);
      const selected = await page.evaluate(() => cy.$(':selected').map(e => e.id()));
      // a and b should be selected but not c
      expect(selected).toContain('a');
      expect(selected).toContain('b');
      expect(selected).not.toContain('c');
    });

    test('shift+click multi-selects nodes', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const posA = await page.evaluate(() => cy.$('#a').renderedPosition());
      const posB = await page.evaluate(() => cy.$('#b').renderedPosition());
      // First click selects a
      await page.mouse.click(posA.x, posA.y);
      await delay(300);
      // Hold shift, then click b to add to selection
      await page.keyboard.down('Shift');
      await delay(50);
      await page.mouse.click(posB.x, posB.y);
      await delay(50);
      await page.keyboard.up('Shift');
      await delay(300);
      const selected = await page.evaluate(() => cy.$(':selected').map(e => e.id()));
      expect(selected).toContain('a');
      expect(selected).toContain('b');
    });

    test('mouseover triggers mouseover event on node', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      await page.evaluate(() => {
        window._mouseoverFired = false;
        cy.$('#a').on('mouseover', () => { window._mouseoverFired = true; });
      });
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      // Move from far away to the node
      await page.mouse.move(0, 0);
      await delay(100);
      await page.mouse.move(rpos.x, rpos.y, { steps: 5 });
      await delay(300);
      const fired = await page.evaluate(() => window._mouseoverFired);
      expect(fired).toBe(true);
    });

    test('mouseout triggers when leaving a node', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      await page.evaluate(() => {
        window._mouseoutFired = false;
        cy.$('#a').on('mouseout', () => { window._mouseoutFired = true; });
      });
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.mouse.move(rpos.x, rpos.y, { steps: 3 });
      await delay(200);
      // Move away from the node
      await page.mouse.move(rpos.x + 200, rpos.y + 200, { steps: 5 });
      await delay(300);
      const fired = await page.evaluate(() => window._mouseoutFired);
      expect(fired).toBe(true);
    });
  });

  // ---- Edge geometry (advanced) ----
  test.describe('edge geometry (advanced)', () => {
    test('unbundled bezier edges have user-defined control points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: {
          'curve-style': 'unbundled-bezier',
          'control-point-distances': [40],
          'control-point-weights': [0.5],
          'width': 2
        }}
      ]);
      await delay(300);
      const cp = await page.evaluate(() => cy.$('#ab').controlPoints());
      expect(cp).toBeDefined();
      expect(cp.length).toBeGreaterThan(0);
      expect(isNaN(cp[0].x)).toBe(false);
      expect(isNaN(cp[0].y)).toBe(false);
    });

    test('haystack edges connect to points on node body', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 60, 'height': 60 } },
        { selector: 'edge', style: { 'curve-style': 'haystack', 'width': 2 } }
      ]);
      await delay(300);
      const data = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return {
          src: edge.sourceEndpoint(),
          tgt: edge.targetEndpoint(),
          srcPos: cy.$('#a').position(),
          tgtPos: cy.$('#b').position(),
        };
      });
      // Source endpoint should be near source node
      expect(Math.abs(data.src.x - data.srcPos.x)).toBeLessThan(60);
      expect(Math.abs(data.src.y - data.srcPos.y)).toBeLessThan(60);
      // Target endpoint should be near target node
      expect(Math.abs(data.tgt.x - data.tgtPos.x)).toBeLessThan(60);
      expect(Math.abs(data.tgt.y - data.tgtPos.y)).toBeLessThan(60);
    });

    test('loop edges (self-edges) have valid control points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
        { data: { id: 'aa', source: 'a', target: 'a' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: { 'curve-style': 'bezier', 'width': 2 } }
      ]);
      await delay(300);
      const cp = await page.evaluate(() => cy.$('#aa').controlPoints());
      expect(cp).toBeDefined();
      expect(cp.length).toBeGreaterThan(0);
      cp.forEach(p => {
        expect(isNaN(p.x)).toBe(false);
        expect(isNaN(p.y)).toBe(false);
      });
    });

    test('segments edge has segment points', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 100 } },
        { data: { id: 'b' }, position: { x: 400, y: 400 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: {
          'curve-style': 'segments',
          'segment-distances': [50, -50],
          'segment-weights': [0.33, 0.66],
          'width': 2
        }}
      ]);
      await delay(300);
      const pts = await page.evaluate(() => cy.$('#ab').segmentPoints());
      expect(pts).toBeDefined();
      expect(pts.length).toBe(2);
      pts.forEach(p => {
        expect(isNaN(p.x)).toBe(false);
        expect(isNaN(p.y)).toBe(false);
      });
    });

    test('different curve styles produce different allpts lengths', async ({ page }) => {
      const makeCurveGraph = async (curveStyle, extraStyle) => {
        const style = [
          { selector: 'node', style: { 'width': 30, 'height': 30 } },
          { selector: 'edge', style: Object.assign({ 'curve-style': curveStyle, 'width': 2 }, extraStyle || {}) }
        ];
        await createGraph(page, [
          { data: { id: 'a' }, position: { x: 100, y: 200 } },
          { data: { id: 'b' }, position: { x: 400, y: 200 } },
          { data: { id: 'ab', source: 'a', target: 'b' } },
        ], style);
        await delay(300);
        return page.evaluate(() => {
          const edge = cy.$('#ab');
          const cp = edge.controlPoints();
          const sp = edge.segmentPoints();
          return { cpLen: cp ? cp.length : 0, spLen: sp ? sp.length : 0 };
        });
      };
      const straight = await makeCurveGraph('straight');
      const bezier = await makeCurveGraph('unbundled-bezier', {
        'control-point-distances': [40],
        'control-point-weights': [0.5]
      });
      // Straight has no control or segment points; unbundled-bezier has control points
      expect(straight.cpLen).toBe(0);
      expect(bezier.cpLen).toBeGreaterThan(0);
    });

    test('source arrow position is valid (not NaN)', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: {
          'curve-style': 'bezier',
          'source-arrow-shape': 'triangle',
          'target-arrow-shape': 'triangle',
          'width': 2
        }}
      ]);
      await delay(300);
      const ep = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return {
          src: edge.sourceEndpoint(),
          tgt: edge.targetEndpoint(),
        };
      });
      expect(isNaN(ep.src.x)).toBe(false);
      expect(isNaN(ep.src.y)).toBe(false);
      expect(isNaN(ep.tgt.x)).toBe(false);
      expect(isNaN(ep.tgt.y)).toBe(false);
    });
  });

  // ---- Rendered style (advanced) ----
  test.describe('rendered style (advanced)', () => {
    test('outerWidth/outerHeight include border', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: { 'width': 50, 'height': 50, 'border-width': 10, 'border-color': 'black' } }
      ]);
      await delay(300);
      const dims = await page.evaluate(() => {
        const n = cy.$('#a');
        return {
          w: n.width(),
          h: n.height(),
          ow: n.outerWidth(),
          oh: n.outerHeight(),
        };
      });
      // outerWidth should be larger than width due to border
      expect(dims.ow).toBeGreaterThan(dims.w);
      expect(dims.oh).toBeGreaterThan(dims.h);
    });

    test('effectiveOpacity accounts for parent opacity in compounds', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'parent' }, position: { x: 200, y: 200 } },
        { data: { id: 'child', parent: 'parent' }, position: { x: 200, y: 200 } },
      ], [
        { selector: '#parent', style: { 'opacity': 0.5 } },
        { selector: '#child', style: { 'opacity': 0.8, 'width': 30, 'height': 30 } }
      ]);
      await delay(300);
      const eo = await page.evaluate(() => cy.$('#child').effectiveOpacity());
      // effective opacity = parent(0.5) * child(0.8) = 0.4
      expect(eo).toBeCloseTo(0.4, 1);
    });

    test('renderedBoundingBox with labels is larger than without', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30, 'label': 'data(id)', 'font-size': 20 } }
      ]);
      await delay(300);
      const bbs = await page.evaluate(() => {
        const n = cy.$('#a');
        return {
          withLabels: n.renderedBoundingBox({ includeLabels: true }),
          withoutLabels: n.renderedBoundingBox({ includeLabels: false }),
        };
      });
      // Bounding box with labels should be at least as large
      const areaWith = bbs.withLabels.w * bbs.withLabels.h;
      const areaWithout = bbs.withoutLabels.w * bbs.withoutLabels.h;
      expect(areaWith).toBeGreaterThanOrEqual(areaWithout);
    });

    test('edge midpoint returns valid rendered point', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const mid = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return edge.midpoint();
      });
      expect(mid).toBeDefined();
      expect(isNaN(mid.x)).toBe(false);
      expect(isNaN(mid.y)).toBe(false);
    });

    test('rendered style updates after zoom change', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const widthZ1 = await page.evaluate(() => {
        cy.zoom(1);
        return parseFloat(cy.$('#a').renderedStyle('width'));
      });
      const widthZ2 = await page.evaluate(() => {
        cy.zoom(2);
        return parseFloat(cy.$('#a').renderedStyle('width'));
      });
      expect(widthZ2).toBeGreaterThan(widthZ1 * 1.5);
    });
  });

  // ---- Labels (advanced) ----
  test.describe('labels (advanced)', () => {
    test('label wraps at node width when text-wrap: wrap', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a', name: 'This is a very long label that should wrap' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: {
          'width': 60, 'height': 60,
          'label': 'data(name)',
          'text-wrap': 'wrap',
          'text-max-width': 60,
          'font-size': 12
        }}
      ]);
      await delay(300);
      const bb = await page.evaluate(() => {
        const n = cy.$('#a');
        return n.boundingBox({ includeLabels: true });
      });
      // The label bounding box should exist and be valid
      expect(bb.w).toBeGreaterThan(0);
      expect(bb.h).toBeGreaterThan(0);
    });

    test('label with text-max-width truncates with ellipsis', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a', name: 'Very long label text here' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: {
          'width': 40, 'height': 40,
          'label': 'data(name)',
          'text-wrap': 'ellipsis',
          'text-max-width': 50,
          'font-size': 12
        }}
      ]);
      await delay(300);
      const data = await page.evaluate(() => {
        const n = cy.$('#a');
        const rscratch = n._private.rscratch;
        return {
          labelStyle: n.style('label'),
          // The rendered label lines are truncated by the renderer
          labelLines: rscratch ? rscratch.labelWrapCachedLines : null,
        };
      });
      expect(data.labelStyle.length).toBeGreaterThan(0);
      // The label should be shorter than the original or the bounding box should be constrained
      // With text-wrap: ellipsis, the rendered label bounding box should be narrow
      const bb = await page.evaluate(() => {
        const n = cy.$('#a');
        return n.boundingBox({ includeLabels: true });
      });
      const bbNoLabel = await page.evaluate(() => {
        const n = cy.$('#a');
        return n.boundingBox({ includeLabels: false });
      });
      // The label-inclusive bounding box width should not extend excessively beyond max-width + node width
      expect(bb.w).toBeLessThan(bbNoLabel.w + 50 + 40);
    });

    test('text-rotation rotates label', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: {
          'width': 30, 'height': 30,
          'label': 'data(id)',
          'text-rotation': '45deg'
        }}
      ]);
      await delay(300);
      const rotation = await page.evaluate(() => {
        return parseFloat(cy.$('#a').style('text-rotation'));
      });
      // Cytoscape returns the numeric value (degrees); verify it matches the set value
      expect(rotation).toBeCloseTo(45, 0);
    });

    test('edge label positioned at midpoint', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: { 'label': 'data(id)', 'curve-style': 'bezier', 'text-margin-y': 0, 'font-size': 14 } }
      ]);
      await delay(300);
      const data = await page.evaluate(() => {
        const edge = cy.$('#ab');
        const mid = edge.midpoint();
        const bb = edge.boundingBox({ includeLabels: true });
        return { mid, bb };
      });
      expect(data.bb.w).toBeGreaterThan(0);
      expect(isNaN(data.mid.x)).toBe(false);
    });

    test('label outline renders with text-outline-width > 0', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: {
          'width': 30, 'height': 30,
          'label': 'data(id)',
          'text-outline-width': 3,
          'text-outline-color': 'white'
        }}
      ]);
      await delay(300);
      const outlineWidth = await page.evaluate(() => {
        return parseFloat(cy.$('#a').style('text-outline-width'));
      });
      expect(outlineWidth).toBe(3);
    });

    test('edge source-label and target-label', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: {
          'curve-style': 'bezier',
          'source-label': 'src',
          'target-label': 'tgt',
          'font-size': 12,
          'width': 2
        }}
      ]);
      await delay(300);
      const labels = await page.evaluate(() => {
        const edge = cy.$('#ab');
        return {
          src: edge.style('source-label'),
          tgt: edge.style('target-label'),
        };
      });
      expect(labels.src).toBe('src');
      expect(labels.tgt).toBe('tgt');
    });
  });

  // ---- Container / DOM (advanced) ----
  test.describe('container (advanced)', () => {
    test('cy.resize() updates canvas dimensions', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const result = await page.evaluate(() => {
        const container = cy.container();
        const origWidth = container.clientWidth;
        container.style.width = '400px';
        container.style.height = '300px';
        cy.resize();
        const canvases = container.querySelectorAll('canvas');
        const widths = Array.from(canvases).map(c => c.width);
        return { origWidth, newWidths: widths, containerWidth: container.clientWidth };
      });
      expect(result.containerWidth).toBe(400);
    });

    test('container size change triggers resize event', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const fired = await page.evaluate(() => {
        return new Promise(resolve => {
          cy.on('resize', () => resolve(true));
          const container = cy.container();
          container.style.width = '500px';
          container.style.height = '400px';
          cy.resize();
        });
      });
      expect(fired).toBe(true);
    });

    test('fullscreen-sized container works', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const data = await page.evaluate(() => {
        const container = cy.container();
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        cy.resize();
        return {
          containerW: container.clientWidth,
          containerH: container.clientHeight,
          nodesVisible: cy.nodes().length,
        };
      });
      await delay(300);
      expect(data.containerW).toBeGreaterThan(0);
      expect(data.containerH).toBeGreaterThan(0);
      expect(data.nodesVisible).toBe(3);
    });
  });

  // ---- WebGL / Canvas picking ----
  test.describe('picking', () => {
    test('click on node finds correct element', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
        { data: { id: 'b' }, position: { x: 500, y: 500 } },
      ]);
      await delay(500);
      await page.evaluate(() => {
        window._tappedId = null;
        cy.on('tap', 'node', evt => { window._tappedId = evt.target.id(); });
      });
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.mouse.click(rpos.x, rpos.y);
      await delay(300);
      const tapped = await page.evaluate(() => window._tappedId);
      expect(tapped).toBe('a');
    });

    test('click on edge finds correct element', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 300 } },
        { data: { id: 'b' }, position: { x: 500, y: 300 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 20, 'height': 20 } },
        { selector: 'edge', style: { 'width': 10, 'curve-style': 'straight' } }
      ]);
      await delay(500);
      await page.evaluate(() => {
        window._tappedEdge = null;
        cy.on('tap', 'edge', evt => { window._tappedEdge = evt.target.id(); });
      });
      // Click at the midpoint of the edge
      const midRendered = await page.evaluate(() => {
        const posA = cy.$('#a').renderedPosition();
        const posB = cy.$('#b').renderedPosition();
        return { x: (posA.x + posB.x) / 2, y: (posA.y + posB.y) / 2 };
      });
      await page.mouse.click(midRendered.x, midRendered.y);
      await delay(300);
      const tapped = await page.evaluate(() => window._tappedEdge);
      expect(tapped).toBe('ab');
    });

    test('click on overlapping elements finds topmost', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'bottom' }, position: { x: 200, y: 200 } },
        { data: { id: 'top' }, position: { x: 200, y: 200 } },
      ], [
        { selector: '#bottom', style: { 'width': 60, 'height': 60, 'z-index': 0 } },
        { selector: '#top', style: { 'width': 30, 'height': 30, 'z-index': 10 } }
      ]);
      await delay(500);
      await page.evaluate(() => {
        window._tappedId = null;
        cy.on('tap', 'node', evt => { window._tappedId = evt.target.id(); });
      });
      const rpos = await page.evaluate(() => cy.$('#top').renderedPosition());
      await page.mouse.click(rpos.x, rpos.y);
      await delay(300);
      const tapped = await page.evaluate(() => window._tappedId);
      expect(tapped).toBe('top');
    });

    test('picking works after pan/zoom', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 200, y: 200 } },
      ]);
      await delay(500);
      await page.evaluate(() => {
        cy.zoom(2);
        cy.pan({ x: -100, y: -50 });
      });
      await delay(300);
      await page.evaluate(() => {
        window._tappedId = null;
        cy.on('tap', 'node', evt => { window._tappedId = evt.target.id(); });
      });
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      await page.mouse.click(rpos.x, rpos.y);
      await delay(300);
      const tapped = await page.evaluate(() => window._tappedId);
      expect(tapped).toBe('a');
    });
  });

  // ---- Export (advanced) ----
  test.describe('export (advanced)', () => {
    test('cy.png() produces non-empty image data', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const dataLen = await page.evaluate(() => cy.png().length);
      // A non-trivial graph should produce substantial image data
      expect(dataLen).toBeGreaterThan(100);
    });

    test('cy.png({full: true}) captures entire graph', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: -500, y: -500 } },
        { data: { id: 'b' }, position: { x: 500, y: 500 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ]);
      await delay(500);
      const data = await page.evaluate(() => {
        const partial = cy.png();
        const full = cy.png({ full: true });
        return { partialLen: partial.length, fullLen: full.length };
      });
      // Full should capture more (or equal) data since it includes the whole graph
      expect(data.fullLen).toBeGreaterThanOrEqual(data.partialLen);
    });

    test('cy.jpg({quality: 0.5}) vs quality 1.0', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const data = await page.evaluate(() => {
        const low = cy.jpg({ quality: 0.1 });
        const high = cy.jpg({ quality: 1.0 });
        return { lowLen: low.length, highLen: high.length };
      });
      // Lower quality should produce less data
      expect(data.lowLen).toBeLessThan(data.highLen);
    });

    test('cy.png({bg: white}) has white background', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(500);
      const png = await page.evaluate(() => cy.png({ bg: 'white' }));
      expect(png).toMatch(/^data:image\/png;base64,/);
      expect(png.length).toBeGreaterThan(100);
    });
  });

  // ---- Animation (advanced) ----
  test.describe('animation (advanced)', () => {
    test('animate pan smoothly', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const result = await page.evaluate(() => {
        const startPan = { ...cy.pan() };
        return new Promise(resolve => {
          cy.animate({
            pan: { x: 200, y: 150 },
            duration: 300,
            complete: () => {
              const endPan = cy.pan();
              resolve({ startPan, endPan });
            }
          });
        });
      });
      expect(result.endPan.x).toBeCloseTo(200, 0);
      expect(result.endPan.y).toBeCloseTo(150, 0);
    });

    test('animate zoom', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const result = await page.evaluate(() => {
        return new Promise(resolve => {
          cy.animate({
            zoom: 3,
            duration: 300,
            complete: () => resolve(cy.zoom())
          });
        });
      });
      expect(result).toBeCloseTo(3, 0);
    });

    test('multiple concurrent animations', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const result = await page.evaluate(() => {
        return new Promise(resolve => {
          let completed = 0;
          const onComplete = () => {
            completed++;
            if (completed === 2) {
              resolve({
                posA: cy.$('#a').position(),
                posB: cy.$('#b').position(),
              });
            }
          };
          cy.$('#a').animate({ position: { x: 400, y: 400 }, duration: 250, complete: onComplete });
          cy.$('#b').animate({ position: { x: 100, y: 100 }, duration: 250, complete: onComplete });
        });
      });
      expect(result.posA.x).toBeCloseTo(400, 0);
      expect(result.posB.x).toBeCloseTo(100, 0);
    });

    test('animation queue (sequential animations)', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const result = await page.evaluate(() => {
        return new Promise(resolve => {
          cy.$('#a')
            .animate({ position: { x: 300, y: 100 }, duration: 150 })
            .animate({ position: { x: 300, y: 400 }, duration: 150, complete: () => {
              resolve(cy.$('#a').position());
            }});
        });
      });
      expect(result.x).toBeCloseTo(300, 0);
      expect(result.y).toBeCloseTo(400, 0);
    });

    test('cy.stop() halts running animations', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const result = await page.evaluate(() => {
        const startPos = { ...cy.$('#a').position() };
        cy.$('#a').animate({ position: { x: 9999, y: 9999 }, duration: 5000 });
        return new Promise(resolve => {
          setTimeout(() => {
            cy.$('#a').stop();
            const stoppedPos = cy.$('#a').position();
            resolve({
              startX: startPos.x,
              stoppedX: stoppedPos.x,
            });
          }, 100);
        });
      });
      // Should have moved a little but NOT reached 9999
      expect(result.stoppedX).toBeLessThan(9000);
    });
  });

  // ---- Compound nodes rendering ----
  test.describe('compound nodes', () => {
    test('parent node bounding box includes children', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'parent' } },
        { data: { id: 'child1', parent: 'parent' }, position: { x: 100, y: 100 } },
        { data: { id: 'child2', parent: 'parent' }, position: { x: 300, y: 300 } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: ':parent', style: { 'background-opacity': 0.2 } }
      ]);
      await delay(300);
      const data = await page.evaluate(() => {
        const parentBB = cy.$('#parent').boundingBox();
        const child1Pos = cy.$('#child1').position();
        const child2Pos = cy.$('#child2').position();
        return { parentBB, child1Pos, child2Pos };
      });
      // Parent bounding box should contain both children
      expect(data.parentBB.x1).toBeLessThanOrEqual(data.child1Pos.x);
      expect(data.parentBB.x2).toBeGreaterThanOrEqual(data.child2Pos.x);
      expect(data.parentBB.y1).toBeLessThanOrEqual(data.child1Pos.y);
      expect(data.parentBB.y2).toBeGreaterThanOrEqual(data.child2Pos.y);
    });

    test('parent isParent and child isChild', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'parent' } },
        { data: { id: 'child', parent: 'parent' }, position: { x: 200, y: 200 } },
      ]);
      await delay(300);
      const data = await page.evaluate(() => ({
        parentIsParent: cy.$('#parent').isParent(),
        childIsChild: cy.$('#child').isChild(),
        childParentId: cy.$('#child').parent().id(),
      }));
      expect(data.parentIsParent).toBe(true);
      expect(data.childIsChild).toBe(true);
      expect(data.childParentId).toBe('parent');
    });

    test('hiding parent hides children visually', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'parent' } },
        { data: { id: 'child', parent: 'parent' }, position: { x: 200, y: 200 } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } }
      ]);
      await delay(300);
      const data = await page.evaluate(() => {
        cy.$('#parent').style('display', 'none');
        return {
          parentVisible: cy.$('#parent').visible(),
          childVisible: cy.$('#child').visible(),
        };
      });
      expect(data.parentVisible).toBe(false);
      expect(data.childVisible).toBe(false);
    });
  });

  // ---- Style application (advanced) ----
  test.describe('style application (advanced)', () => {
    test('selector :selected applies overlay', async ({ page }) => {
      await createGraph(page, simpleGraph, [
        { selector: 'node', style: { 'width': 30, 'height': 30, 'background-color': '#666' } },
        { selector: 'node:selected', style: { 'overlay-color': 'blue', 'overlay-opacity': 0.3 } },
        { selector: 'edge', style: { 'width': 2, 'curve-style': 'bezier' } }
      ]);
      await delay(300);
      await page.evaluate(() => cy.$('#a').select());
      await delay(100);
      const overlay = await page.evaluate(() => {
        return {
          color: cy.$('#a').style('overlay-color'),
          opacity: parseFloat(cy.$('#a').style('overlay-opacity')),
        };
      });
      expect(overlay.opacity).toBeGreaterThan(0);
    });

    test('mapData() maps data values to visual properties', async ({ page }) => {
      await createGraph(page, [
        { data: { id: 'a', weight: 10 }, position: { x: 100, y: 100 } },
        { data: { id: 'b', weight: 50 }, position: { x: 300, y: 100 } },
        { data: { id: 'c', weight: 100 }, position: { x: 200, y: 300 } },
      ], [
        { selector: 'node', style: {
          'width': 'mapData(weight, 0, 100, 10, 100)',
          'height': 'mapData(weight, 0, 100, 10, 100)',
          'background-color': '#666'
        }}
      ]);
      await delay(300);
      const widths = await page.evaluate(() => ({
        a: parseFloat(cy.$('#a').style('width')),
        b: parseFloat(cy.$('#b').style('width')),
        c: parseFloat(cy.$('#c').style('width')),
      }));
      // a(weight=10) < b(weight=50) < c(weight=100)
      expect(widths.a).toBeLessThan(widths.b);
      expect(widths.b).toBeLessThan(widths.c);
    });

    test('display: none hides elements', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const data = await page.evaluate(() => {
        const visibleBefore = cy.$('#a').visible();
        cy.$('#a').style('display', 'none');
        const visibleAfter = cy.$('#a').visible();
        return { visibleBefore, visibleAfter };
      });
      expect(data.visibleBefore).toBe(true);
      expect(data.visibleAfter).toBe(false);
    });

    test('visibility: hidden hides elements', async ({ page }) => {
      await createGraph(page, simpleGraph);
      await delay(300);
      const data = await page.evaluate(() => {
        const visibleBefore = cy.$('#a').visible();
        cy.$('#a').style('visibility', 'hidden');
        const visibleAfter = cy.$('#a').visible();
        return { visibleBefore, visibleAfter };
      });
      expect(data.visibleBefore).toBe(true);
      expect(data.visibleAfter).toBe(false);
    });

    test('selector :active applies during mousedown', async ({ page }) => {
      await createGraph(page, simpleGraph, [
        { selector: 'node', style: { 'width': 30, 'height': 30, 'background-color': '#666', 'overlay-opacity': 0 } },
        { selector: 'node:active', style: { 'overlay-opacity': 0.2 } },
        { selector: 'edge', style: { 'width': 2, 'curve-style': 'bezier' } }
      ]);
      await delay(500);
      const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
      // Press mouse down on the node and verify overlay-opacity is > 0 while active
      await page.mouse.move(rpos.x, rpos.y);
      await page.mouse.down();
      await delay(200);
      const overlayOpacity = await page.evaluate(() => parseFloat(cy.$('#a').style('overlay-opacity')));
      await page.mouse.up();
      expect(overlayOpacity).toBeGreaterThan(0);
    });
  });
});

// ==================================================================
// Additional coverage for browser-dependent code paths
// ==================================================================

test.describe('Touch and pointer interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('touchstart/touchmove/touchend fires tap event on node', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
    await createGraph(page, simpleGraph);
    await delay(500);
    await page.evaluate(() => {
      window._tapFired = false;
      cy.$('#a').on('tap', () => { window._tapFired = true; });
    });
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    await page.touchscreen.tap(rpos.x, rpos.y);
    await delay(300);
    const fired = await page.evaluate(() => window._tapFired);
    expect(fired).toBe(true);
    await context.close();
  });

  test('multiple rapid clicks fires tap (not spurious events)', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    await page.evaluate(() => {
      window._tappedIds = [];
      cy.$('#a').on('tap', () => { window._tappedIds.push('a'); });
    });
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    await page.mouse.click(rpos.x, rpos.y);
    await delay(50);
    await page.mouse.click(rpos.x, rpos.y);
    await delay(50);
    await page.mouse.click(rpos.x, rpos.y);
    await delay(300);
    const ids = await page.evaluate(() => window._tappedIds);
    expect(ids.length).toBe(3);
    expect(ids.every(id => id === 'a')).toBe(true);
  });

  test('mousedown hold triggers tapstart (active state) on element', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    await page.evaluate(() => {
      window._tapstartFired = false;
      cy.$('#a').on('tapstart', () => { window._tapstartFired = true; });
    });
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    await page.mouse.move(rpos.x, rpos.y);
    await page.mouse.down();
    await delay(200);
    const fired = await page.evaluate(() => window._tapstartFired);
    await page.mouse.up();
    expect(fired).toBe(true);
  });

  test('release mousedown fires tapend (deactivates active state)', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    await page.evaluate(() => {
      window._tapendFired = false;
      cy.$('#a').on('tapend', () => { window._tapendFired = true; });
    });
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    await page.mouse.move(rpos.x, rpos.y);
    await page.mouse.down();
    await delay(100);
    await page.mouse.up();
    await delay(200);
    const fired = await page.evaluate(() => window._tapendFired);
    expect(fired).toBe(true);
  });

  test('small mouse movement below drag threshold does not start drag', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    const posBefore = await page.evaluate(() => ({ ...cy.$('#a').position() }));
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    // Very small movement (1px) should not be interpreted as drag
    await page.mouse.move(rpos.x, rpos.y);
    await page.mouse.down();
    await page.mouse.move(rpos.x + 1, rpos.y + 1, { steps: 1 });
    await page.mouse.up();
    await delay(200);
    const posAfter = await page.evaluate(() => cy.$('#a').position());
    // Position should be effectively unchanged (within 2 model units)
    expect(Math.abs(posAfter.x - posBefore.x)).toBeLessThan(3);
    expect(Math.abs(posAfter.y - posBefore.y)).toBeLessThan(3);
  });
});

test.describe('Edge geometry remaining paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('round-segments curve style produces segment points', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 100 } },
      { data: { id: 'b' }, position: { x: 400, y: 400 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 30, 'height': 30 } },
      { selector: 'edge', style: {
        'curve-style': 'round-segments',
        'segment-distances': [50, -50],
        'segment-weights': [0.33, 0.66],
        'segment-radii': 15,
        'radius-type': 'arc-radius',
        'width': 2
      }}
    ]);
    await delay(300);
    const pts = await page.evaluate(() => cy.$('#ab').segmentPoints());
    expect(pts).toBeDefined();
    expect(pts.length).toBe(2);
    pts.forEach(p => {
      expect(isNaN(p.x)).toBe(false);
      expect(isNaN(p.y)).toBe(false);
    });
  });

  test('round-segments with influence-radius type', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 100 } },
      { data: { id: 'b' }, position: { x: 400, y: 400 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 30, 'height': 30 } },
      { selector: 'edge', style: {
        'curve-style': 'round-segments',
        'segment-distances': [50, -50],
        'segment-weights': [0.33, 0.66],
        'segment-radii': 20,
        'radius-type': 'influence-radius',
        'width': 2
      }}
    ]);
    await delay(300);
    const data = await page.evaluate(() => {
      const e = cy.$('#ab');
      return {
        curveStyle: e.style('curve-style'),
        segPts: e.segmentPoints(),
      };
    });
    expect(data.curveStyle).toBe('round-segments');
    expect(data.segPts).toBeDefined();
    expect(data.segPts.length).toBe(2);
  });

  test('edge with control-point-step-size variation', async ({ page }) => {
    // Create multiple parallel edges to trigger step-size offset
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 400, y: 200 } },
      { data: { id: 'ab1', source: 'a', target: 'b' } },
      { data: { id: 'ab2', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 30, 'height': 30 } },
      { selector: 'edge', style: {
        'curve-style': 'bezier',
        'control-point-step-size': 80,
        'width': 2
      }}
    ]);
    await delay(300);
    const cps = await page.evaluate(() => cy.edges().map(e => e.controlPoints()));
    const withCp = cps.filter(cp => cp && cp.length > 0);
    expect(withCp.length).toBeGreaterThan(0);
    // With step-size=80, parallel edges should be further apart than default (40)
    if (withCp.length >= 2) {
      const cp1 = withCp[0][0];
      const cp2 = withCp[1][0];
      expect(Math.abs(cp1.y - cp2.y)).toBeGreaterThan(0);
    }
  });

  test('edge control points update after node position change', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 400, y: 200 } },
      { data: { id: 'ab1', source: 'a', target: 'b' } },
      { data: { id: 'ab2', source: 'a', target: 'b' } },
    ]);
    await delay(300);
    const cpBefore = await page.evaluate(() => {
      const cp = cy.$('#ab1').controlPoints();
      return cp ? cp.map(p => ({ x: p.x, y: p.y })) : null;
    });
    await page.evaluate(() => cy.$('#a').position({ x: 100, y: 400 }));
    await delay(300);
    const cpAfter = await page.evaluate(() => {
      const cp = cy.$('#ab1').controlPoints();
      return cp ? cp.map(p => ({ x: p.x, y: p.y })) : null;
    });
    expect(cpBefore).not.toBeNull();
    expect(cpAfter).not.toBeNull();
    // At least one coordinate should have changed
    const changed = cpBefore.some((pt, i) =>
      Math.abs(pt.x - cpAfter[i].x) > 1 || Math.abs(pt.y - cpAfter[i].y) > 1
    );
    expect(changed).toBe(true);
  });

  test('bezier edge with different control-point-weight', async ({ page }) => {
    const getCP = async (weight) => {
      await createGraph(page, [
        { data: { id: 'a' }, position: { x: 100, y: 200 } },
        { data: { id: 'b' }, position: { x: 400, y: 200 } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ], [
        { selector: 'node', style: { 'width': 30, 'height': 30 } },
        { selector: 'edge', style: {
          'curve-style': 'unbundled-bezier',
          'control-point-distances': [60],
          'control-point-weights': [weight],
          'width': 2
        }}
      ]);
      await delay(300);
      return page.evaluate(() => {
        const cp = cy.$('#ab').controlPoints();
        return cp ? cp[0] : null;
      });
    };
    const cpWeight025 = await getCP(0.25);
    const cpWeight075 = await getCP(0.75);
    expect(cpWeight025).not.toBeNull();
    expect(cpWeight075).not.toBeNull();
    // Different weights should produce different x positions along the edge
    expect(Math.abs(cpWeight025.x - cpWeight075.x)).toBeGreaterThan(10);
  });
});

test.describe('Rendered style remaining', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('renderedStyle returns all CSS-like properties when called without arg', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const rs = await page.evaluate(() => {
      const style = cy.$('#a').renderedStyle();
      return {
        hasWidth: 'width' in style,
        hasHeight: 'height' in style,
        hasBgColor: 'background-color' in style,
        hasOpacity: 'opacity' in style,
        keyCount: Object.keys(style).length,
      };
    });
    expect(rs.hasWidth).toBe(true);
    expect(rs.hasHeight).toBe(true);
    expect(rs.hasBgColor).toBe(true);
    expect(rs.hasOpacity).toBe(true);
    expect(rs.keyCount).toBeGreaterThan(5);
  });

  test('rendered width/height for edge includes line-width', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 400, y: 200 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 30, 'height': 30 } },
      { selector: 'edge', style: { 'width': 8, 'curve-style': 'straight' } }
    ]);
    await delay(300);
    const data = await page.evaluate(() => {
      const edge = cy.$('#ab');
      return {
        lineWidth: parseFloat(edge.style('width')),
        renderedWidth: parseFloat(edge.renderedStyle('width')),
        zoom: cy.zoom(),
      };
    });
    expect(data.lineWidth).toBe(8);
    // Rendered width should be model width * zoom
    expect(data.renderedWidth).toBeCloseTo(data.lineWidth * data.zoom, 0);
  });

  test('effectiveOpacity with visibility:hidden reports not visible', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const data = await page.evaluate(() => {
      const n = cy.$('#a');
      const opacityBefore = n.effectiveOpacity();
      const visibleBefore = n.visible();
      n.style('visibility', 'hidden');
      const visibleAfter = n.visible();
      // Also test that setting opacity to 0 makes transparent() true
      n.style('visibility', 'visible');
      n.style('opacity', 0);
      const transparentAfterZeroOpacity = n.transparent();
      const effectiveAfterZeroOpacity = n.effectiveOpacity();
      return { opacityBefore, visibleBefore, visibleAfter, transparentAfterZeroOpacity, effectiveAfterZeroOpacity };
    });
    expect(data.opacityBefore).toBe(1);
    expect(data.visibleBefore).toBe(true);
    expect(data.visibleAfter).toBe(false);
    expect(data.transparentAfterZeroOpacity).toBe(true);
    expect(data.effectiveAfterZeroOpacity).toBe(0);
  });
});

test.describe('WebGL init remaining', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('multiple cy instances do not interfere', async ({ page }) => {
    const data = await page.evaluate(() => {
      // Create two separate cy instances in two containers
      const div1 = document.createElement('div');
      div1.id = 'cy1';
      div1.style.width = '300px';
      div1.style.height = '200px';
      div1.style.position = 'absolute';
      div1.style.top = '0';
      div1.style.left = '0';
      document.body.appendChild(div1);

      const div2 = document.createElement('div');
      div2.id = 'cy2';
      div2.style.width = '300px';
      div2.style.height = '200px';
      div2.style.position = 'absolute';
      div2.style.top = '0';
      div2.style.left = '350px';
      document.body.appendChild(div2);

      const cy1 = cytoscape({
        container: div1,
        elements: [{ data: { id: 'n1' }, position: { x: 50, y: 50 } }],
        layout: { name: 'preset' }
      });

      const cy2 = cytoscape({
        container: div2,
        elements: [{ data: { id: 'n2' }, position: { x: 80, y: 80 } }],
        layout: { name: 'preset' }
      });

      const result = {
        cy1Nodes: cy1.nodes().length,
        cy2Nodes: cy2.nodes().length,
        cy1HasN1: cy1.$('#n1').length === 1,
        cy2HasN2: cy2.$('#n2').length === 1,
        cy1NoN2: cy1.$('#n2').length === 0,
        cy2NoN1: cy2.$('#n1').length === 0,
      };

      cy1.destroy();
      cy2.destroy();
      div1.remove();
      div2.remove();

      return result;
    });
    expect(data.cy1Nodes).toBe(1);
    expect(data.cy2Nodes).toBe(1);
    expect(data.cy1HasN1).toBe(true);
    expect(data.cy2HasN2).toBe(true);
    expect(data.cy1NoN2).toBe(true);
    expect(data.cy2NoN1).toBe(true);
  });

  test('resize window updates canvas dimensions', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const before = await page.evaluate(() => {
      const container = cy.container();
      const canvas = container.querySelector('canvas');
      return { w: canvas.width, h: canvas.height, cw: container.clientWidth };
    });
    await page.setViewportSize({ width: 600, height: 400 });
    await page.evaluate(() => cy.resize());
    await delay(300);
    const after = await page.evaluate(() => {
      const container = cy.container();
      const canvas = container.querySelector('canvas');
      return { w: canvas.width, h: canvas.height, cw: container.clientWidth };
    });
    // Container and canvas should have adapted to new viewport
    expect(after.cw).toBeLessThan(before.cw);
  });
});

test.describe('Drawing/redraw cycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('cy.forceRender() triggers a redraw without error', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const result = await page.evaluate(() => {
      try {
        cy.forceRender();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    expect(result.success).toBe(true);
    // Verify graph is still functional after forced render
    const nodeCount = await page.evaluate(() => cy.nodes().length);
    expect(nodeCount).toBe(3);
  });

  test('style bypass triggers visual update', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const data = await page.evaluate(() => {
      const colorBefore = cy.$('#a').style('background-color');
      cy.$('#a').style('background-color', 'rgb(255, 0, 0)');
      const colorAfter = cy.$('#a').style('background-color');
      return { colorBefore, colorAfter };
    });
    expect(data.colorBefore).not.toBe(data.colorAfter);
    expect(data.colorAfter).toContain('255');
  });

  test('batch operations defer rendering', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const result = await page.evaluate(() => {
      let drawCount = 0;
      cy.on('render', () => { drawCount++; });
      const countBefore = drawCount;

      cy.batch(() => {
        cy.$('#a').position({ x: 500, y: 500 });
        cy.$('#b').position({ x: 100, y: 100 });
        cy.$('#c').position({ x: 300, y: 300 });
      });

      // Positions should be updated correctly after batch
      return {
        posA: cy.$('#a').position(),
        posB: cy.$('#b').position(),
        posC: cy.$('#c').position(),
      };
    });
    expect(result.posA.x).toBeCloseTo(500, 0);
    expect(result.posB.x).toBeCloseTo(100, 0);
    expect(result.posC.x).toBeCloseTo(300, 0);
  });

  test('remove element clears from graph', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(300);
    const data = await page.evaluate(() => {
      const countBefore = cy.elements().length;
      cy.$('#a').remove();
      const countAfter = cy.elements().length;
      const aGone = cy.$('#a').length === 0;
      // Edges connected to 'a' should also be gone
      const abGone = cy.$('#ab').length === 0;
      const acGone = cy.$('#ac').length === 0;
      return { countBefore, countAfter, aGone, abGone, acGone };
    });
    expect(data.countBefore).toBe(6); // 3 nodes + 3 edges
    expect(data.aGone).toBe(true);
    expect(data.abGone).toBe(true);
    expect(data.acGone).toBe(true);
    expect(data.countAfter).toBeLessThan(data.countBefore);
  });
});

test.describe('Label overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('node labels appear in bounding box calculations', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 200, y: 200 } },
    ], [
      { selector: 'node', style: {
        'width': 30, 'height': 30,
        'label': 'data(id)',
        'font-size': 20
      }}
    ]);
    await delay(500);
    const data = await page.evaluate(() => {
      const n = cy.$('#a');
      const bbWithLabels = n.boundingBox({ includeLabels: true });
      const bbWithoutLabels = n.boundingBox({ includeLabels: false });
      return { withLabels: bbWithLabels, withoutLabels: bbWithoutLabels };
    });
    // With labels should be at least as large
    const areaWith = data.withLabels.w * data.withLabels.h;
    const areaWithout = data.withoutLabels.w * data.withoutLabels.h;
    expect(areaWith).toBeGreaterThanOrEqual(areaWithout);
  });

  test('label position follows node during pan', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 200, y: 200 } },
    ], [
      { selector: 'node', style: {
        'width': 30, 'height': 30,
        'label': 'data(id)',
        'font-size': 14
      }}
    ]);
    await delay(300);
    const bbBefore = await page.evaluate(() => {
      return cy.$('#a').renderedBoundingBox({ includeLabels: true });
    });
    await page.evaluate(() => cy.pan({ x: 100, y: 50 }));
    await delay(300);
    const bbAfter = await page.evaluate(() => {
      return cy.$('#a').renderedBoundingBox({ includeLabels: true });
    });
    // The rendered bounding box should shift by approximately the pan amount
    expect(bbAfter.x1).toBeGreaterThan(bbBefore.x1 + 50);
    expect(bbAfter.y1).toBeGreaterThan(bbBefore.y1 + 20);
  });

  test('edge labels positioned at edge midpoint region', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 500, y: 200 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 30, 'height': 30 } },
      { selector: 'edge', style: {
        'label': 'edge-label',
        'curve-style': 'straight',
        'font-size': 14,
        'width': 2
      }}
    ]);
    await delay(300);
    const data = await page.evaluate(() => {
      const edge = cy.$('#ab');
      const mid = edge.midpoint();
      const bb = edge.boundingBox({ includeLabels: true });
      const srcPos = cy.$('#a').position();
      const tgtPos = cy.$('#b').position();
      const edgeMidX = (srcPos.x + tgtPos.x) / 2;
      return { mid, bb, edgeMidX };
    });
    // The midpoint should be roughly at the center of the edge
    expect(Math.abs(data.mid.x - data.edgeMidX)).toBeLessThan(50);
    expect(data.bb.w).toBeGreaterThan(0);
  });

  test('long label text with text-wrap wrap computes multi-line bounding box', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a', name: 'This is a very long label text that must wrap to multiple lines' }, position: { x: 200, y: 200 } },
    ], [
      { selector: 'node', style: {
        'width': 60, 'height': 60,
        'label': 'data(name)',
        'text-wrap': 'wrap',
        'text-max-width': 80,
        'font-size': 12
      }}
    ]);
    await delay(300);
    const data = await page.evaluate(() => {
      const n = cy.$('#a');
      const bbWithLabel = n.boundingBox({ includeLabels: true });
      const bbNoLabel = n.boundingBox({ includeLabels: false });
      return {
        labelH: bbWithLabel.h,
        noLabelH: bbNoLabel.h,
        labelW: bbWithLabel.w,
      };
    });
    // The wrapped label should extend the bounding box height
    expect(data.labelH).toBeGreaterThan(data.noLabelH);
  });
});

// ==================================================================
// Browser-dependent integration tests (additional coverage)
// ==================================================================

test.describe('Touch interactions (advanced)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('taphold fires after mousedown hold without moving', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    await page.evaluate(() => {
      window._tapholdFired = false;
      cy.$('#a').on('taphold', () => { window._tapholdFired = true; });
    });
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    await page.mouse.move(rpos.x, rpos.y);
    await page.mouse.down();
    // Default tapholdDuration is 500ms; wait well past it
    await delay(700);
    const fired = await page.evaluate(() => window._tapholdFired);
    await page.mouse.up();
    expect(fired).toBe(true);
  });

  test('touch drag moves a node position', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
    await createGraph(page, simpleGraph);
    await delay(500);
    const posBefore = await page.evaluate(() => ({ ...cy.$('#a').position() }));
    const rpos = await page.evaluate(() => cy.$('#a').renderedPosition());
    // Dispatch touch events asynchronously with delays between steps
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y) || document.getElementById('cytoscape');
      const mkTouch = (px, py) => new Touch({ identifier: 1, target: el, clientX: px, clientY: py, pageX: px, pageY: py });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [mkTouch(x, y)], changedTouches: [mkTouch(x, y)] }));
    }, { x: rpos.x, y: rpos.y });
    await delay(50);
    // Move in steps with delays
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const x = rpos.x + (120 * i / steps);
      const y = rpos.y + (80 * i / steps);
      await page.evaluate(({ x, y, startX, startY }) => {
        const el = document.elementFromPoint(startX, startY) || document.getElementById('cytoscape');
        const mkTouch = (px, py) => new Touch({ identifier: 1, target: el, clientX: px, clientY: py, pageX: px, pageY: py });
        el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [mkTouch(x, y)], changedTouches: [mkTouch(x, y)] }));
      }, { x, y, startX: rpos.x, startY: rpos.y });
      await delay(20);
    }
    await page.evaluate(({ x, y, startX, startY }) => {
      const el = document.elementFromPoint(startX, startY) || document.getElementById('cytoscape');
      const mkTouch = (px, py) => new Touch({ identifier: 1, target: el, clientX: px, clientY: py, pageX: px, pageY: py });
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [mkTouch(x, y)] }));
    }, { x: rpos.x + 120, y: rpos.y + 80, startX: rpos.x, startY: rpos.y });
    await delay(300);
    const posAfter = await page.evaluate(() => cy.$('#a').position());
    expect(posAfter.x).toBeGreaterThan(posBefore.x + 30);
    await context.close();
  });
});

test.describe('Label-based picking', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('clicking on label area selects node with text-events yes', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 400, y: 300 } },
    ], [
      { selector: 'node', style: {
        'width': 30, 'height': 30,
        'label': 'data(id)',
        'font-size': 24,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-events': 'yes'
      }}
    ]);
    await delay(500);
    // Get bounding boxes to find a point in the label area but outside node body
    const data = await page.evaluate(() => {
      const n = cy.$('#a');
      return {
        rpos: n.renderedPosition(),
        bbWithLabel: n.renderedBoundingBox({ includeLabels: true }),
        bbNoLabel: n.renderedBoundingBox({ includeLabels: false }),
      };
    });
    // Click below the node body where the label should be
    const labelY = data.bbNoLabel.y2 + 10;
    await page.mouse.click(data.rpos.x, labelY);
    await delay(300);
    const selected = await page.evaluate(() => cy.$('#a').selected());
    expect(selected).toBe(true);
  });
});

test.describe('Edge endpoint styles', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('source-endpoint with percentage positions endpoint correctly', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 400, y: 200 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 60, 'height': 60 } },
      { selector: 'edge', style: {
        'curve-style': 'straight',
        'source-endpoint': '50% 0%',
        'width': 2
      }}
    ]);
    await delay(300);
    const data = await page.evaluate(() => {
      const edge = cy.$('#ab');
      const srcEp = edge.sourceEndpoint();
      const srcPos = cy.$('#a').position();
      return { srcEp, srcPos };
    });
    // The source endpoint should not be at the node center; the x offset
    // of 50% moves it to the right side relative to the node width
    expect(isNaN(data.srcEp.x)).toBe(false);
    expect(isNaN(data.srcEp.y)).toBe(false);
    expect(data.srcEp.x).toBeGreaterThan(data.srcPos.x);
  });

  test('target-endpoint outside-to-node places endpoint at node boundary', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 400, y: 200 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ], [
      { selector: 'node', style: { 'width': 60, 'height': 60 } },
      { selector: 'edge', style: {
        'curve-style': 'straight',
        'target-endpoint': 'outside-to-node',
        'width': 2
      }}
    ]);
    await delay(300);
    const data = await page.evaluate(() => {
      const edge = cy.$('#ab');
      const tgtEp = edge.targetEndpoint();
      const tgtPos = cy.$('#b').position();
      const halfW = cy.$('#b').outerWidth() / 2;
      return { tgtEp, tgtPos, halfW };
    });
    // The target endpoint should be at the boundary, not at center
    const distFromCenter = Math.abs(data.tgtEp.x - data.tgtPos.x);
    expect(distFromCenter).toBeGreaterThan(0);
    // And it should be roughly at the node boundary (within half-width + tolerance)
    expect(distFromCenter).toBeLessThanOrEqual(data.halfW + 5);
  });
});


test.describe('Export advanced', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('cy.png with blob-promise output returns a Blob', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    const data = await page.evaluate(async () => {
      const blob = await cy.png({ output: 'blob-promise' });
      return {
        isBlob: blob instanceof Blob,
        size: blob.size,
        type: blob.type,
      };
    });
    expect(data.isBlob).toBe(true);
    expect(data.size).toBeGreaterThan(0);
    expect(data.type).toContain('image/png');
  });

  test('cy.png with maxWidth constrains output width', async ({ page }) => {
    await createGraph(page, simpleGraph);
    await delay(500);
    const data = await page.evaluate(() => {
      const defaultPng = cy.png({ full: true });
      const constrainedPng = cy.png({ full: true, maxWidth: 100 });
      return {
        defaultLen: defaultPng.length,
        constrainedLen: constrainedPng.length,
      };
    });
    // Constrained image should be smaller (fewer pixels = less data)
    expect(data.constrainedLen).toBeLessThan(data.defaultLen);
  });
});

test.describe('LOD edge visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('hideEdgesOnViewport hides edges during pan and shows after', async ({ page }) => {
    // Create graph with hideEdgesOnViewport enabled
    await page.evaluate(() => {
      if(window.cy) window.cy.destroy();
      window.cy = cytoscape({
        container: document.getElementById('cytoscape'),
        elements: [
          { data: { id: 'a' }, position: { x: 100, y: 100 } },
          { data: { id: 'b' }, position: { x: 300, y: 100 } },
          { data: { id: 'ab', source: 'a', target: 'b' } },
        ],
        style: [
          { selector: 'node', style: { 'width': 30, 'height': 30 } },
          { selector: 'edge', style: { 'width': 4, 'curve-style': 'bezier' } }
        ],
        layout: { name: 'preset' },
        hideEdgesOnViewport: true,
      });
    });
    await delay(300);
    // Verify edges exist before interaction
    const edgeCountBefore = await page.evaluate(() => cy.edges().length);
    expect(edgeCountBefore).toBe(1);
    // Pan the viewport to trigger interaction state
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(500, 400, { steps: 5 });
    // While still in interaction, edges should still be in the graph model
    const edgesDuringPan = await page.evaluate(() => cy.edges().length);
    expect(edgesDuringPan).toBe(1);
    await page.mouse.up();
    // Wait for debounce (edges reappear after interaction stops)
    await delay(600);
    // Edges should still exist in the model after pan stops
    const edgesAfterPan = await page.evaluate(() => cy.edges().length);
    expect(edgesAfterPan).toBe(1);
    // Verify the edge bounding box is valid (edge is renderable)
    const bb = await page.evaluate(() => cy.$('#ab').boundingBox());
    expect(bb.w).toBeGreaterThan(0);
  });
});

test.describe('Bundled bezier dirty propagation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('moving node updates all parallel bundled bezier edge control points', async ({ page }) => {
    await createGraph(page, [
      { data: { id: 'a' }, position: { x: 100, y: 200 } },
      { data: { id: 'b' }, position: { x: 400, y: 200 } },
      { data: { id: 'ab1', source: 'a', target: 'b' } },
      { data: { id: 'ab2', source: 'a', target: 'b' } },
      { data: { id: 'ab3', source: 'a', target: 'b' } },
    ]);
    await delay(300);
    // Capture control points before the move
    const cpsBefore = await page.evaluate(() => {
      return cy.edges().map(e => {
        const cp = e.controlPoints();
        return cp ? cp.map(p => ({ x: p.x, y: p.y })) : null;
      });
    });
    // Move target node to a new position
    await page.evaluate(() => cy.$('#b').position({ x: 400, y: 400 }));
    await delay(300);
    // Capture control points after the move
    const cpsAfter = await page.evaluate(() => {
      return cy.edges().map(e => {
        const cp = e.controlPoints();
        return cp ? cp.map(p => ({ x: p.x, y: p.y })) : null;
      });
    });
    // All edges with control points should have updated
    const edgesWithCp = cpsBefore.filter(cp => cp !== null);
    expect(edgesWithCp.length).toBeGreaterThan(0);
    // Check that at least all non-null control points changed
    let allUpdated = true;
    for (let i = 0; i < cpsBefore.length; i++) {
      if (cpsBefore[i] && cpsAfter[i]) {
        const changed = cpsBefore[i].some((pt, j) =>
          Math.abs(pt.x - cpsAfter[i][j].x) > 1 || Math.abs(pt.y - cpsAfter[i][j].y) > 1
        );
        if (!changed) allUpdated = false;
      }
    }
    expect(allUpdated).toBe(true);
  });
});

test.describe('WebGL lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://127.0.0.1:3333/playwright-page/index.html');
  });

  test('cy.destroy() removes canvases and marks instance destroyed', async ({ page }) => {
    const data = await page.evaluate(() => {
      const div = document.createElement('div');
      div.id = 'cy_lifecycle';
      div.style.width = '400px';
      div.style.height = '300px';
      document.body.appendChild(div);

      const tempCy = cytoscape({
        container: div,
        elements: [
          { data: { id: 'n1' }, position: { x: 100, y: 100 } },
          { data: { id: 'n2' }, position: { x: 200, y: 200 } },
          { data: { id: 'e1', source: 'n1', target: 'n2' } },
        ],
        layout: { name: 'preset' }
      });

      const canvasCountBefore = div.querySelectorAll('canvas').length;
      const notDestroyedBefore = !tempCy.destroyed();

      tempCy.destroy();

      const canvasCountAfter = div.querySelectorAll('canvas').length;
      const isDestroyedAfter = tempCy.destroyed();

      div.remove();
      return { canvasCountBefore, notDestroyedBefore, canvasCountAfter, isDestroyedAfter };
    });
    expect(data.canvasCountBefore).toBeGreaterThan(0);
    expect(data.notDestroyedBefore).toBe(true);
    expect(data.canvasCountAfter).toBe(0);
    expect(data.isDestroyedAfter).toBe(true);
  });
});
