/*
 * levels.js  —  level data + the shared level format.
 *
 * A level is: { name, tileSize, rows: [ "....#=E..", ... ] }
 * where each character in `rows` is a tile:
 *
 *   '.'  empty / air
 *   '#'  solid block   (collides on all sides)
 *   '='  platform      (one-way: land on top, jump up through)
 *   'E'  exit          (touch it to clear the level)
 *   'C'  checkpoint    (touch to light it — you respawn there)
 *   'P'  player spawn  (air tile, marks where the player starts)
 *   'x'  enemy spawn   (air tile, a walker patrols here)
 *   'f'  flyer spawn   (a bat that ignores gravity and drifts at you)
 *   'c'  chaser spawn  (a hothead that sprints when it spots you)
 *
 * The map editor (tools/map-editor.html) reads and writes exactly this.
 * Below we *build* the starter level from a compact spec so the grid
 * dimensions are always correct; the result is plain `rows` strings.
 */

const TILE = 16;

// Build a rows[] grid from a spec of rectangles + points.
function buildLevel(spec) {
  const { w, h } = spec;
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));

  // Outer border = solid.
  for (let x = 0; x < w; x++) { grid[0][x] = '#'; grid[h - 1][x] = '#'; }
  for (let y = 0; y < h; y++) { grid[y][0] = '#'; grid[y][w - 1] = '#'; }

  // Rectangles: { ch, x, y, w, h }  (h defaults to 1)
  for (const r of spec.rects || []) {
    for (let yy = r.y; yy < r.y + (r.h || 1); yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        if (grid[yy] && grid[yy][xx] !== undefined) grid[yy][xx] = r.ch;
      }
    }
  }

  // Single-cell markers.
  const put = (p, ch) => { if (p && grid[p.y]) grid[p.y][p.x] = ch; };
  put(spec.player, 'P');
  put(spec.exit, 'E');
  for (const e of spec.enemies || []) put(e, 'x');
  for (const e of spec.flyers || []) put(e, 'f');
  for (const e of spec.chasers || []) put(e, 'c');
  for (const c of spec.checkpoints || []) put(c, 'C');

  return {
    name: spec.name,
    tileSize: TILE,
    rows: grid.map((row) => row.join('')),
  };
}

const LEVELS = [
  buildLevel({
    name: 'The Bubblewood Caverns',
    w: 40,
    h: 24,
    rects: [
      { ch: '=', x: 4, y: 5, w: 10 },
      { ch: '=', x: 26, y: 5, w: 11 },
      { ch: '=', x: 3, y: 9, w: 7 },
      { ch: '=', x: 20, y: 9, w: 12 },
      { ch: '=', x: 6, y: 13, w: 10 },
      { ch: '=', x: 24, y: 13, w: 10 },
      { ch: '=', x: 14, y: 17, w: 12 },
      { ch: '=', x: 31, y: 3, w: 7 }, // exit perch
      { ch: '#', x: 18, y: 20, w: 4, h: 3 }, // a little solid mound
    ],
    player: { x: 3, y: 22 },
    exit: { x: 34, y: 2 },
    enemies: [
      { x: 8, y: 4 },
      { x: 30, y: 4 },
      { x: 24, y: 8 },
      { x: 18, y: 16 },
      { x: 30, y: 22 },
    ],
    flyers: [{ x: 20, y: 7 }],
    checkpoints: [{ x: 15, y: 16 }], // on the long mid platform
  }),

  buildLevel({
    name: 'Neon Depths',
    w: 44,
    h: 30,
    rects: [
      { ch: '=', x: 1, y: 4, w: 8 },
      { ch: '=', x: 12, y: 6, w: 10 },
      { ch: '=', x: 26, y: 4, w: 10 },
      { ch: '=', x: 34, y: 8, w: 8 },
      { ch: '=', x: 4, y: 10, w: 12 },
      { ch: '=', x: 20, y: 12, w: 12 },
      { ch: '=', x: 36, y: 12, w: 6 },
      { ch: '=', x: 2, y: 16, w: 8 },
      { ch: '=', x: 14, y: 16, w: 10 },
      { ch: '=', x: 28, y: 18, w: 10 },
      { ch: '=', x: 6, y: 20, w: 10 },
      { ch: '=', x: 20, y: 22, w: 10 },
      { ch: '=', x: 34, y: 22, w: 8 },
      { ch: '#', x: 16, y: 26, w: 6, h: 3 }, // central mound near the floor
      { ch: '=', x: 26, y: 26, w: 6 },
    ],
    player: { x: 2, y: 3 },       // start at the top — descend into the depths
    exit: { x: 3, y: 28 },        // exit hides at the very bottom left
    enemies: [
      { x: 14, y: 5 },
      { x: 30, y: 3 },
      { x: 8, y: 9 },
      { x: 24, y: 11 },
      { x: 16, y: 15 },
      { x: 32, y: 17 },
      { x: 10, y: 19 },
      { x: 24, y: 21 },
      { x: 36, y: 28 },
    ],
    flyers: [{ x: 22, y: 8 }, { x: 12, y: 24 }],
    chasers: [{ x: 26, y: 28 }],           // guards the exit run at the bottom
    checkpoints: [{ x: 8, y: 15 }],        // halfway down the descent
  }),

  buildLevel({
    name: 'Sky Fortress',
    w: 56,
    h: 24,
    rects: [
      { ch: '=', x: 4, y: 18, w: 10 },
      { ch: '=', x: 18, y: 18, w: 8 },
      { ch: '=', x: 30, y: 19, w: 8 },
      { ch: '=', x: 42, y: 18, w: 8 },
      { ch: '=', x: 10, y: 14, w: 8 },
      { ch: '=', x: 24, y: 14, w: 10 },
      { ch: '=', x: 40, y: 14, w: 8 },
      { ch: '=', x: 4, y: 10, w: 8 },
      { ch: '=', x: 16, y: 10, w: 8 },
      { ch: '=', x: 30, y: 10, w: 10 },
      { ch: '=', x: 46, y: 10, w: 8 },
      { ch: '=', x: 8, y: 6, w: 10 },
      { ch: '=', x: 24, y: 6, w: 8 },
      { ch: '=', x: 38, y: 6, w: 8 },
      { ch: '=', x: 48, y: 5, w: 7 },       // exit perch, top right
      { ch: '#', x: 14, y: 20, w: 3, h: 3 }, // watchtowers on the ground
      { ch: '#', x: 36, y: 21, w: 4, h: 2 },
    ],
    player: { x: 2, y: 21 },
    exit: { x: 52, y: 4 },
    enemies: [
      { x: 6, y: 17 },
      { x: 20, y: 17 },
      { x: 44, y: 17 },
      { x: 12, y: 13 },
      { x: 28, y: 13 },
      { x: 42, y: 13 },
      { x: 8, y: 9 },
      { x: 34, y: 9 },
      { x: 26, y: 5 },
      { x: 40, y: 5 },
      { x: 50, y: 4 },
    ],
    flyers: [{ x: 20, y: 8 }, { x: 44, y: 8 }],
    chasers: [{ x: 10, y: 21 }, { x: 30, y: 21 }], // ground-floor sprinters
    checkpoints: [{ x: 27, y: 13 }],               // mid-climb rest stop
  }),
];

window.TILE = TILE;
window.buildLevel = buildLevel;
window.LEVELS = LEVELS;
