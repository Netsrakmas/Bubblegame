/*
 * palette.js  —  shared by the game, the sprite editor and the map editor.
 *
 * Every sprite in Bubblegame is a 16x16 (or any WxH) grid of single
 * characters.  Each character is an index into the PALETTE below:
 *
 *   '.'  = transparent
 *   '0'..'9','a'..'f' = palette colour 0..15
 *
 * Storing art as arrays of strings keeps it human-readable, diff-able in
 * git, and trivial to copy/paste between the editor and the data files.
 */

// 16-colour "kawaii 8-bit" palette. Index 0 is unused (transparent is '.').
const PALETTE = [
  '#00000000', // 0 transparent (kept so hex chars line up; '.' is the real one)
  '#2b2b3c',   // 1 ink / outline (near-black)
  '#ffffff',   // 2 white
  '#ffb3d1',   // 3 pink
  '#ff5d8f',   // 4 hot pink
  '#fff1a6',   // 5 cream
  '#ffd23f',   // 6 gold
  '#a8f0c6',   // 7 mint
  '#36c98f',   // 8 green
  '#bfe3ff',   // 9 sky
  '#4f9dde',   // a blue
  '#d9c2ff',   // b lavender
  '#9b5de5',   // c purple
  '#ffc69e',   // d peach
  '#ff6b6b',   // e red
  '#3a3a5c',   // f shadow
];

// Map a sprite character to a CSS colour, or null for transparent.
function charToColor(ch) {
  if (ch === '.' || ch === ' ' || ch === undefined) return null;
  const idx = parseInt(ch, 16);
  if (Number.isNaN(idx) || idx <= 0 || idx >= PALETTE.length) return null;
  return PALETTE[idx];
}

/*
 * Bake a sprite (array of equal-length strings) onto an offscreen canvas at
 * `scale` device pixels per art pixel. Returns a <canvas> ready to drawImage.
 * Baking once and blitting is far faster than per-pixel fillRect each frame.
 */
function bakeSprite(rows, scale = 1) {
  const h = rows.length;
  const w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = charToColor(rows[y][x]);
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

// Return a horizontally mirrored copy of a sprite (for left/right facing).
function flipRows(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}

// Expose globally (classic scripts, no bundler, works from file://).
window.PALETTE = PALETTE;
window.charToColor = charToColor;
window.bakeSprite = bakeSprite;
window.flipRows = flipRows;
