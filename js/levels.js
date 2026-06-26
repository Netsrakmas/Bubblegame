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
 *   'P'  player spawn  (air tile, marks where the player starts)
 *   'x'  enemy spawn   (air tile, an enemy drops in here)
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
  }),
];

window.TILE = TILE;
window.buildLevel = buildLevel;
window.LEVELS = LEVELS;
