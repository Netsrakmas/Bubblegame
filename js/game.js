/*
 * game.js  —  Bubblegame engine.
 *
 *  A side-scrolling, Bubble-Bobble-style platformer on a large map. The goal
 *  isn't to clear every enemy — it's to FIND THE EXIT. There is no minimap;
 *  you explore. Trap enemies in bubbles and jump into the bubble to pop them,
 *  or just bubble-bounce past and keep looking for the door.
 *
 *  Controls:  ←/→ move   ↑ / Space / W jump   Z / J fire bubble   R restart
 *
 *  The game reads custom art from localStorage 'bubblegame.sprites' and a
 *  custom level from 'bubblegame.level' if present, so the sprite editor and
 *  map editor feed straight into the game.
 */
(() => {
  'use strict';

  const VIEW_W = 256, VIEW_H = 224, T = 16;

  // ---- physics tuning (units: pixels & pixels/frame at 60fps) ----
  const GRAVITY = 0.4;
  const MOVE_SPEED = 1.5;
  const ACCEL = 0.4;
  const FRICTION = 0.55;
  const JUMP_V = 7.3;        // ~4 tiles of jump height
  const ENEMY_SPEED = 0.5;
  const BUBBLE_SHOT_SPEED = 4;
  const BUBBLE_SHOT_FRAMES = 16;
  const BUBBLE_RISE = -0.45;
  const BUBBLE_LIFE = 360;   // frames before an empty bubble pops
  const TRAP_LIFE = 300;     // frames a trapped enemy stays caught
  const INVULN = 100;

  // ---- canvas ----
  const canvas = document.getElementById('game');
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---- baked sprite cache: name -> {r: canvas, l: canvas} ----
  let baked = {};
  function loadSprites() {
    let set = Object.assign({}, window.SPRITES);
    try {
      const custom = JSON.parse(localStorage.getItem('bubblegame.sprites') || 'null');
      if (custom && typeof custom === 'object') set = Object.assign(set, custom);
    } catch (e) { /* ignore bad data */ }
    baked = {};
    for (const name in set) {
      const rows = set[name];
      if (!Array.isArray(rows)) continue;
      baked[name] = { r: bakeSprite(rows, 1), l: bakeSprite(flipRows(rows), 1) };
    }
  }
  function drawSprite(name, x, y, faceLeft) {
    const b = baked[name];
    if (!b) return;
    ctx.drawImage(faceLeft ? b.l : b.r, Math.round(x), Math.round(y));
  }

  // ---- level ----
  let level, rows, LW, LH, levelPxW, levelPxH;
  let playerSpawn, enemySpawns;
  function loadLevel() {
    let lv = null;
    try { lv = JSON.parse(localStorage.getItem('bubblegame.level') || 'null'); } catch (e) {}
    level = (lv && lv.rows) ? lv : window.LEVELS[0];
    rows = level.rows;
    LH = rows.length; LW = rows[0].length;
    levelPxW = LW * T; levelPxH = LH * T;
    playerSpawn = { x: T, y: T };
    enemySpawns = [];
    for (let ty = 0; ty < LH; ty++) {
      for (let tx = 0; tx < LW; tx++) {
        const ch = rows[ty][tx];
        if (ch === 'P') playerSpawn = { x: tx * T + 2, y: ty * T };
        else if (ch === 'x') enemySpawns.push({ x: tx * T + 2, y: ty * T });
      }
    }
  }
  const tileChar = (tx, ty) => (rows[ty] && rows[ty][tx]) || '#'; // OOB = wall
  const isSolid = (tx, ty) => tileChar(tx, ty) === '#';
  const isPlatform = (tx, ty) => tileChar(tx, ty) === '=';
  const isExit = (tx, ty) => tileChar(tx, ty) === 'E';

  // ---- collision helpers (AABB vs tile grid) ----
  function moveX(e) {
    e.x += e.vx;
    const top = Math.floor(e.y / T), bot = Math.floor((e.y + e.h - 1) / T);
    if (e.vx > 0) {
      const col = Math.floor((e.x + e.w - 1) / T);
      for (let ty = top; ty <= bot; ty++) if (isSolid(col, ty)) { e.x = col * T - e.w; e.vx = 0; e.hitWall = true; return; }
    } else if (e.vx < 0) {
      const col = Math.floor(e.x / T);
      for (let ty = top; ty <= bot; ty++) if (isSolid(col, ty)) { e.x = (col + 1) * T; e.vx = 0; e.hitWall = true; return; }
    }
  }
  function moveY(e) {
    const oldBottom = e.y + e.h;
    e.y += e.vy;
    e.onGround = false;
    const left = Math.floor(e.x / T), right = Math.floor((e.x + e.w - 1) / T);
    if (e.vy > 0) {
      const row = Math.floor((e.y + e.h - 1) / T);
      for (let tx = left; tx <= right; tx++) {
        const landSolid = isSolid(tx, row);
        const landPlat = isPlatform(tx, row) && oldBottom <= row * T + 1;
        if (landSolid || landPlat) { e.y = row * T - e.h; e.vy = 0; e.onGround = true; return; }
      }
    } else if (e.vy < 0) {
      const row = Math.floor(e.y / T);
      for (let tx = left; tx <= right; tx++) if (isSolid(tx, row)) { e.y = (row + 1) * T; e.vy = 0; return; }
    }
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---- entities ----
  let player, enemies, bubbles, state, lives, score, anim, msgTimer;

  function makePlayer() {
    return { x: playerSpawn.x, y: playerSpawn.y, w: 12, h: 14, vx: 0, vy: 0,
      face: 1, onGround: false, invuln: 0, fireCd: 0 };
  }
  function makeEnemy(s) {
    return { x: s.x, y: s.y, w: 12, h: 12, vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1, onGround: false };
  }
  function spawnEnemies() { enemies = enemySpawns.map(makeEnemy); }

  function resetGame() {
    loadLevel();
    player = makePlayer();
    spawnEnemies();
    bubbles = [];
    lives = 3; score = 0; anim = 0; msgTimer = 150;
  }
  function respawn() {
    player = makePlayer();
    player.invuln = INVULN;
  }

  // ---- update ----
  function update() {
    anim++;
    if (state === 'title') { if (Input.pressed('start') || Input.pressed('jump')) { state = 'play'; } return; }
    if (state === 'win' || state === 'over') { if (Input.pressed('start') || Input.pressed('restart')) { resetGame(); state = 'title'; } return; }
    if (Input.pressed('restart')) { resetGame(); state = 'title'; return; }

    updatePlayer();
    updateEnemies();
    updateBubbles();
    if (msgTimer > 0) msgTimer--;
  }

  function updatePlayer() {
    const p = player;
    // horizontal
    let tgt = 0;
    if (Input.left) { tgt = -MOVE_SPEED; p.face = -1; }
    if (Input.right) { tgt = MOVE_SPEED; p.face = 1; }
    if (tgt !== 0) p.vx += Math.sign(tgt - p.vx) * ACCEL;
    else p.vx *= FRICTION;
    if (Math.abs(p.vx) < 0.05) p.vx = 0;
    p.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, p.vx));

    // jump (variable height)
    if (Input.pressed('jump') && p.onGround) p.vy = -JUMP_V;
    if (!Input.jump && p.vy < -2) p.vy = -2; // cut jump when released

    // gravity
    p.vy = Math.min(p.vy + GRAVITY, 9);

    p.hitWall = false;
    moveX(p);
    moveY(p);

    // fire bubble
    if (p.fireCd > 0) p.fireCd--;
    if (Input.pressed('fire') && p.fireCd === 0) {
      bubbles.push({ x: p.x + (p.face > 0 ? p.w : -12), y: p.y, w: 14, h: 14,
        vx: p.face * BUBBLE_SHOT_SPEED, vy: 0, state: 'empty', shot: BUBBLE_SHOT_FRAMES,
        life: BUBBLE_LIFE, enemy: null, wob: Math.random() * 6.28 });
      p.fireCd = 12;
    }

    if (p.invuln > 0) p.invuln--;

    // exit check
    const cx = Math.floor((p.x + p.w / 2) / T), cy = Math.floor((p.y + p.h / 2) / T);
    if (isExit(cx, cy)) { state = 'win'; }
  }

  function updateEnemies() {
    for (const e of enemies) {
      e.vy = Math.min(e.vy + GRAVITY, 9);
      moveY(e);
      // patrol: turn at walls and ledges
      e.vx = e.dir * ENEMY_SPEED;
      if (e.onGround) {
        const frontX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
        const ftx = Math.floor(frontX / T), fty = Math.floor((e.y + e.h) / T);
        if (!isSolid(ftx, fty) && !isPlatform(ftx, fty)) e.dir *= -1; // ledge
      }
      e.hitWall = false;
      moveX(e);
      if (e.hitWall) e.dir *= -1;

      // hit player
      if (player.invuln === 0 && overlap(e, player)) {
        lives--;
        if (lives <= 0) { state = 'over'; }
        else respawn();
        return;
      }
    }
  }

  function updateBubbles() {
    for (const b of bubbles) {
      if (b.shot > 0) {            // travelling phase
        b.shot--; b.x += b.vx;
        // wall stops a shot bubble
        const tx = Math.floor((b.x + (b.vx > 0 ? b.w : 0)) / T), ty = Math.floor((b.y + b.h / 2) / T);
        if (isSolid(tx, ty)) { b.shot = 0; b.vx = 0; }
        if (b.shot === 0) b.vx = 0;
      } else {                      // floating phase
        b.wob += 0.12;
        b.x += Math.sin(b.wob) * 0.3;
        b.vy = BUBBLE_RISE;
        b.y += b.vy;
        const ty = Math.floor(b.y / T), tx = Math.floor((b.x + b.w / 2) / T);
        if (isSolid(tx, ty)) { b.y = (ty + 1) * T; } // bonk ceiling, keep drifting
      }
      b.life--;

      // capture a free enemy
      if (b.state === 'empty') {
        for (let i = 0; i < enemies.length; i++) {
          if (overlap(b, enemies[i])) {
            b.state = 'enemy'; b.enemy = enemies[i]; b.life = TRAP_LIFE; b.shot = 0; b.vx = 0;
            enemies.splice(i, 1); break;
          }
        }
      }

      // player pops a trapped bubble
      if (b.state === 'enemy' && overlap(b, player)) {
        score += 100; b.dead = true;
      }
    }
    // resolve dead/expired bubbles
    const next = [];
    for (const b of bubbles) {
      if (b.dead) continue;
      if (b.life <= 0) {
        if (b.state === 'enemy' && b.enemy) {       // trapped enemy escapes!
          b.enemy.x = b.x; b.enemy.y = b.y; b.enemy.vy = 0; enemies.push(b.enemy);
        }
        continue; // bubble gone
      }
      next.push(b);
    }
    bubbles = next;
  }

  // ---- render ----
  let camX = 0, camY = 0;
  function render() {
    // camera centred on player, clamped to level
    const p = player;
    camX = Math.max(0, Math.min(levelPxW - VIEW_W, (p.x + p.w / 2) - VIEW_W / 2));
    camY = Math.max(0, Math.min(levelPxH - VIEW_H, (p.y + p.h / 2) - VIEW_H / 2));
    camX = Math.round(camX); camY = Math.round(camY);

    // solid cavern sky (no gradient -> every pixel is a flat colour)
    ctx.fillStyle = '#1a0f33'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // solid parallax stars
    ctx.fillStyle = '#3a2e6e';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 71 - camX * 0.3) % VIEW_W, sy = (i * 53) % VIEW_H;
      ctx.fillRect((sx + VIEW_W) % VIEW_W, sy, 1, 1);
    }

    ctx.save();
    ctx.translate(-camX, -camY);

    // tiles (only those in view)
    const tx0 = Math.floor(camX / T), tx1 = Math.ceil((camX + VIEW_W) / T);
    const ty0 = Math.floor(camY / T), ty1 = Math.ceil((camY + VIEW_H) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ch = tileChar(tx, ty);
        if (ch === '#') drawSprite('tile_block', tx * T, ty * T, false);
        else if (ch === '=') drawSprite('tile_platform', tx * T, ty * T, false);
        else if (ch === 'E') drawSprite('tile_exit', tx * T, ty * T, false);
      }
    }

    // bubbles
    for (const b of bubbles) {
      drawSprite('bubble', b.x - 1, b.y - 1, false);
      if (b.state === 'enemy') {
        // shrink the trapped critter inside the bubble
        const e = b.enemy;
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.scale(0.5, 0.5); // clean half-size -> stays solid pixels
        drawSprite('enemy_a', -8, -8, e.dir < 0);
        ctx.restore();
      }
    }

    // enemies
    for (const e of enemies) {
      const frame = (Math.floor(anim / 14) % 2) ? 'enemy_b' : 'enemy_a';
      drawSprite(frame, e.x - 2, e.y - 4, e.dir < 0);
    }

    // player (blink while invulnerable)
    if (!(player.invuln > 0 && Math.floor(anim / 4) % 2)) {
      const name = player.onGround ? 'player_idle' : 'player_jump';
      const bob = (player.onGround && Math.abs(player.vx) > 0.2 && Math.floor(anim / 8) % 2) ? 1 : 0;
      drawSprite(name, player.x - 2, player.y - 2 + bob, player.face < 0);
    }

    ctx.restore();

    drawHUD();
    if (state === 'title') drawTitle();
    if (state === 'win') drawCenter('YOU FOUND THE EXIT!', '#a8f0c6', 'ENTER / TAP - PLAY AGAIN');
    if (state === 'over') drawCenter('GAME OVER', '#ff6b6b', 'ENTER / TAP - RETRY');
  }

  // ---- solid-pixel bitmap text (font.js) ----
  function glyphBlit(ch, x, y, scale, color) {
    const g = FONT[ch]; if (!g) return;
    ctx.fillStyle = color;
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let c = 0; c < 5; c++) if (row[c] === '#') ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
  function textW(str, scale) { return str.length ? str.length * 6 * scale - scale : 0; }
  function text(str, x, y, color, scale = 1, align = 'left') {
    str = String(str).toUpperCase();
    let sx = x;
    if (align === 'center') sx = x - textW(str, scale) / 2;
    else if (align === 'right') sx = x - textW(str, scale);
    sx = Math.round(sx); y = Math.round(y);
    for (let i = 0; i < str.length; i++) {
      const gx = sx + i * 6 * scale;
      glyphBlit(str[i], gx + scale, y + scale, scale, '#0d0820'); // drop shadow
      glyphBlit(str[i], gx, y, scale, color);
    }
  }
  function drawHUD() {
    ctx.fillStyle = '#140a28'; ctx.fillRect(0, 0, VIEW_W, 11); // opaque HUD bar
    ctx.fillStyle = '#140a28'; ctx.fillRect(0, VIEW_H - 11, VIEW_W, 11);
    text('LIVES ' + '*'.repeat(Math.max(0, lives)), 4, 2, '#ff8fb1', 1);
    text('SCORE ' + String(score).padStart(5, '0'), VIEW_W - 4, 2, '#fff1a6', 1, 'right');
    text('ENEMIES LEFT ' + enemies.length, 4, VIEW_H - 9, '#bfe3ff', 1);
    if (msgTimer > 0) text('FIND THE EXIT >', VIEW_W / 2, 16, '#ffd23f', 1, 'center');
  }
  function drawTitle() {
    ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); // solid overlay
    text('BUBBLEGAME', VIEW_W / 2, 44, '#a8f0c6', 3, 'center');
    text('EXPLORE - FIND THE HIDDEN EXIT', VIEW_W / 2, 86, '#ffffff', 1, 'center');
    text('ARROWS MOVE   UP JUMP   Z FIRE BUBBLE', VIEW_W / 2, 108, '#bfe3ff', 1, 'center');
    text('TRAP ENEMIES - JUMP IN BUBBLE TO POP', VIEW_W / 2, 122, '#ff8fb1', 1, 'center');
    if (Math.floor(anim / 24) % 2) text('PRESS ENTER OR TAP', VIEW_W / 2, 158, '#ffd23f', 2, 'center');
  }
  function drawCenter(title, color, sub) {
    ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(title, VIEW_W / 2, 80, color, 3, 'center');
    text('SCORE ' + score, VIEW_W / 2, 116, '#ffffff', 1, 'center');
    if (Math.floor(anim / 24) % 2) text(sub, VIEW_W / 2, 146, '#ffd23f', 1, 'center');
  }

  // ---- main loop (fixed 60Hz step) ----
  let acc = 0, last = 0;
  function frame(now) {
    if (!last) last = now;
    acc += Math.min(now - last, 100); last = now;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    render();
    requestAnimationFrame(frame);
  }

  // ---- boot ----
  function boot() {
    loadSprites();
    resetGame();
    state = 'title';
    requestAnimationFrame(frame);
  }
  // expose a reload hook so editors-in-another-tab changes can be picked up
  window.BubblegameReload = () => { loadSprites(); resetGame(); state = 'title'; };
  window.addEventListener('storage', (e) => {
    if (e.key === 'bubblegame.sprites' || e.key === 'bubblegame.level') window.BubblegameReload();
  });

  boot();
})();
