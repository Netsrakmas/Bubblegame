# 🫧 Bubblegame

An **8-bit, old-school arcade** platformer in the spirit of *Bubble Bobble* — but
on **much bigger maps** with a twist: there's **no minimap**, and the goal isn't
to clear every enemy. **You have to explore and find the hidden exit.** Trap
enemies in bubbles and pop them for fruit — **chain pops for better fruit** — or
bounce off your own bubbles to reach high ledges and keep looking for the door.

**3 levels**, chiptune sound & music (all synthesized, zero assets), particles,
screen shake, combo chains, angry escaped enemies, high scores — everything in
vanilla JS.

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
| Drop through platform | `↓` + jump |
| Fire bubble | `Z` / `J` / `K` |
| Pause | `P` |
| Mute | `M` |
| Start / confirm | `Enter` |
| Restart | `R` |

On phones/tablets an on-screen pad appears automatically.

**How to play.** Shoot a bubble at an enemy to trap it, then **jump into the
bubble to pop it** — the enemy drops **fruit** (berry +100 → banana +300 →
gem +500: pop quickly in a row to chain up). Trapped enemies break free if you
wait too long, and they come back **angry and fast**. Stomp an **empty** bubble
to bounce off it — that's how you reach the really high ledges. You don't need
to beat every enemy — climb the caverns, poke around, and **find the exit door**
(the gold-framed door 🚪, it glimmers) to clear each of the 3 levels.

**Know your foes.** *Walkers* patrol and turn at ledges. *Flyers* (lavender
bats) ignore gravity and drift toward your altitude. *Chasers* (spiky orange
hotheads) patrol until they spot you — then they sprint, even straight off
ledges. All of them can be bubbled.

**Checkpoints.** Touch a lantern 🏮 to light it — if you lose a life you
respawn there instead of back at the start. Lanterns reset each level.

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
| `C` | checkpoint lantern |
| `P` | player start |
| `x` | walker spawn |
| `f` | flyer spawn (no gravity, drifts at you) |
| `c` | chaser spawn (sprints when it sees you) |

---

## 📁 Project layout

```
index.html              game shell + touch controls
js/palette.js           shared 16-colour palette + sprite→canvas baker
js/sprites.js           built-in kawaii sprites (string-grid art)
js/levels.js            level format + the 3 built-in levels (built from specs)
js/audio.js             synthesized chiptune SFX + music loop (WebAudio)
js/input.js             keyboard + virtual-button input
js/game.js              engine: physics, tiles, camera, bubbles, fruit, particles
tools/sprite-editor.html
tools/map-editor.html
```

Custom levels saved from the map editor play as a standalone level; delete the
saved level (or clear the browser's site data) to get the built-in campaign back.

## 🛠️ Ideas to extend

- More enemy behaviours — a kind is ~15 lines in `updateEnemies` + 2 sprites.
- More levels — append `buildLevel({...})` specs to `js/levels.js`.
- A 2nd player (Bub & Bob), or a fog-of-war minimap reward.
- Boss floors, water/wind currents that carry bubbles somewhere useful.

Made to be hacked on — open an editor and make it yours. 💚
