# 🫧 Bubblegame

An **8-bit, old-school arcade** platformer in the spirit of *Bubble Bobble* — but
on a **much bigger map** with a twist: there's **no minimap**, and the goal isn't
to clear every enemy. **You have to explore and find the hidden exit.** Trap
enemies in bubbles and pop them if they're in your way… or just bubble past them
and keep looking for the door.

Everything is **vanilla HTML5 Canvas + JavaScript** — no build step, no
dependencies. It also ships with two tiny tools so the cute pixel art and the
maps are **easy to build yourself**.

```
index.html              ← the game (just open it)
tools/sprite-editor.html ← draw / edit the kawaii sprites
tools/map-editor.html    ← build big Bubble-Bobble-style maps
```

---

## ▶️ Play

Open `index.html` in a browser. That's it.

> Tip: some browsers block `file://` scripts. If the page is blank, run a tiny
> local server from the project folder and visit <http://localhost:8000>:
> ```bash
> python3 -m http.server 8000
> ```

**Controls**

| Action | Keys |
| --- | --- |
| Move | `←` `→` or `A` `D` |
| Jump | `↑` / `Space` / `W` |
| Fire bubble | `Z` / `J` |
| Start / confirm | `Enter` |
| Restart | `R` |

**How to play.** Shoot a bubble at an enemy to trap it, then **jump into the
bubble to pop it** (+100). Trapped enemies break free if you wait too long. You
don't need to beat them all — climb the caverns, poke around, and **find the
exit door** (the gold-framed door 🚪) to win.

---

## 🎨 Sprite Editor — `tools/sprite-editor.html`

A 16×16 pixel editor that shares the game's palette.

- Pick a colour, **pencil / fill / pick**, flip, and nudge.
- **Load built-in** to start from any game sprite (`player_idle`, `enemy_a`,
  `bubble`, `tile_block`, …).
- **💾 save to game** stores it in your browser. The game tab picks it up **live**
  (or press `R`). Use a built-in's name to replace that art.
- **Export** the rows to paste permanently into `js/sprites.js`, or share them.

## 🗺️ Map Editor — `tools/map-editor.html`

Paint big maps with the real tile sprites.

- Tiles: **solid `#`**, **platform `=`** (one-way), **exit `E`**, **player `P`**,
  **enemy `x`**, **air `.`**. Player start and exit are unique.
- Resize up to large maps, **add border**, **clear**, or **load built-in**.
- **💾 save to game**, then refresh/`R` the game to play your level.
- **Export** the rows to paste into `js/levels.js`, or share them.

Both editors talk to the game through `localStorage`, so editing and playing is a
tight loop — no rebuild, no export/import needed for quick iteration.

---

## 🧩 Data formats (so art & maps are easy to build / hand-edit)

**Sprite** — array of 16 strings, each 16 chars. Each char is a palette index
(`.` = transparent, `1`–`f` = colours from `js/palette.js`):

```js
player_idle: [
  '................',
  '.....111111.....',
  '....17888871....',
  // …16 rows total
],
```

**Level** — `rows` of single-char tiles:

```js
{ name: 'My Cavern', tileSize: 16, rows: [
  '########',
  '#P....E#',
  '#..==..#',
  '########',
] }
```

| char | tile |
| --- | --- |
| `.` | air |
| `#` | solid block |
| `=` | one-way platform |
| `E` | exit |
| `P` | player start |
| `x` | enemy spawn |

---

## 📁 Project layout

```
index.html              game shell
js/palette.js           shared 16-colour palette + sprite→canvas baker
js/sprites.js           built-in kawaii sprites (string-grid art)
js/levels.js            level format + the starter level (built from a spec)
js/input.js             keyboard
js/game.js              engine: physics, tile collision, camera, bubbles, enemies
tools/sprite-editor.html
tools/map-editor.html
```

## 🛠️ Ideas to extend

- More enemy types (flyers, chasers) — they're just `x` spawns + a behaviour.
- Multiple levels / a level-select that reads several entries from `js/levels.js`.
- Sound effects, a 2nd player (Bub & Bob), collectible fruit for score.
- Drop-through platforms (hold `↓`), checkpoints, or a fog-of-war minimap reward.

Made to be hacked on — open an editor and make it yours. 💚
