/*
 * game.js  —  Bubblegame engine.
 *
 *  A side-scrolling, Bubble-Bobble-style platformer on a large map. The goal
 *  isn't to clear every enemy — it's to FIND THE EXIT. There is no minimap;
 *  you explore. Trap enemies in bubbles and jump into the bubble to pop them
 *  (they drop fruit — chain pops for better fruit!), bounce on empty bubbles
 *  to reach high places, or just drift past and keep looking for the door.
 *
 *  Controls: ←/→ move  ↑/Space/W jump  ↓+jump drop through  Z/J fire bubble
 *            P pause   M mute   R restart
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
  const MOVE_SPEED = 1.6;
  const ACCEL = 0.7;         // snappier: reach top speed / flip direction fast
  const FRICTION = 0.5;
  const JUMP_V = 7.3;        // ~4 tiles of jump height
  const COYOTE = 6;          // frames you can still jump after leaving a ledge
  const JUMP_BUFFER = 7;     // frames a jump press is remembered before landing
  const ENEMY_SPEED = 0.5;
  const ANGRY_MULT = 1.9;    // escaped enemies are furious and fast
  const FLY_SPEED = 0.55;    // flyers drift, ignoring gravity
  const FLY_HOME = 0.22;     // how hard a flyer homes toward your altitude
  const CHASE_SPEED = 1.05;  // chasers sprint when they spot you
  const CHASE_RANGE_X = 90, CHASE_RANGE_Y = 28;
  const BUBBLE_SHOT_SPEED = 4;
  const BUBBLE_SHOT_FRAMES = 16;
  const BUBBLE_RISE = -0.45;
  const BUBBLE_LIFE = 360;   // frames before an empty bubble pops
  const TRAP_LIFE = 300;     // frames a trapped enemy stays caught
  const INVULN = 100;
  const BOUNCE_V = 6.4;      // stomping an empty bubble
  const CHAIN_WINDOW = 240;  // frames to keep a pop-chain alive
  const CLEAR_BONUS = 500;
  const FRUIT = [            // chain 1, 2, 3+ drops
    { sprite: 'fruit_berry',  val: 100 },
    { sprite: 'fruit_banana', val: 300 },
    { sprite: 'fruit_gem',    val: 500 },
  ];

  // ---- canvas ----
  const canvas = document.getElementById('game');
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const sfx = (name) => { try { if (window.Sfx && window.Sfx[name]) window.Sfx[name](); } catch (e) {} };

  // ---- baked sprite cache: name -> {r: canvas, l: canvas} ----
  let baked = {};
  function loadSprites() {
    let set = Object.assign({}, window.SPRITES);
    try {
      const custom = JSON.parse(localStorage.getItem('bubblegame.sprites') || 'null');
      if (custom && typeof custom === 'object') set = Object.assign(set, custom);
    } catch (e) { /* ignore bad data */ }
    // angry (escaped) enemy variants: recolour each body colour -> red
    const ANGRY_BODY = { enemy_a: 'c', enemy_b: 'c', flyer_a: 'b', flyer_b: 'b', chaser_a: 'd', chaser_b: 'd' };
    for (const n in ANGRY_BODY) {
      if (Array.isArray(set[n])) set[n + '_angry'] = set[n].map((r) => r.split(ANGRY_BODY[n]).join('e'));
    }
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
  let playerSpawn, respawnPoint, enemySpawns, exitTiles, checkpointsLit;
  let levelIndex = 0, customOnly = false;
  function levelList() {
    let custom = null;
    try { custom = JSON.parse(localStorage.getItem('bubblegame.level') || 'null'); } catch (e) {}
    if (custom && custom.rows) { customOnly = true; return [custom]; }
    customOnly = false;
    return window.LEVELS;
  }
  function loadLevel() {
    const list = levelList();
    level = list[Math.min(levelIndex, list.length - 1)];
    rows = level.rows;
    LH = rows.length; LW = rows[0].length;
    levelPxW = LW * T; levelPxH = LH * T;
    playerSpawn = { x: T, y: T };
    enemySpawns = [];
    exitTiles = [];
    checkpointsLit = new Set();
    for (let ty = 0; ty < LH; ty++) {
      for (let tx = 0; tx < LW; tx++) {
        const ch = rows[ty][tx];
        if (ch === 'P') playerSpawn = { x: tx * T + 2, y: ty * T };
        else if (ch === 'x') enemySpawns.push({ x: tx * T + 2, y: ty * T, kind: 'walk' });
        else if (ch === 'f') enemySpawns.push({ x: tx * T + 2, y: ty * T, kind: 'fly' });
        else if (ch === 'c') enemySpawns.push({ x: tx * T + 2, y: ty * T, kind: 'chase' });
        else if (ch === 'E') exitTiles.push({ x: tx, y: ty });
      }
    }
    respawnPoint = playerSpawn;
  }
  const tileChar = (tx, ty) => (rows[ty] && rows[ty][tx]) || '#'; // OOB = wall
  const isSolid = (tx, ty) => tileChar(tx, ty) === '#';
  const isPlatform = (tx, ty) => tileChar(tx, ty) === '=';
  const isExit = (tx, ty) => tileChar(tx, ty) === 'E';
  const isCheckpoint = (tx, ty) => tileChar(tx, ty) === 'C';

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
        const landPlat = isPlatform(tx, row) && oldBottom <= row * T + 1 && !e.dropThru;
        if (landSolid || landPlat) { e.y = row * T - e.h; e.vy = 0; e.onGround = true; return; }
      }
    } else if (e.vy < 0) {
      const row = Math.floor(e.y / T);
      for (let tx = left; tx <= right; tx++) if (isSolid(tx, row)) { e.y = (row + 1) * T; e.vy = 0; return; }
    }
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---- entities & game state ----
  let player, enemies, bubbles, fruits, particles, floaters;
  let state, paused, lives, score, hi, anim, msgTimer, hudMsgText = '', hudMsgT = 0;
  let chain = 0, chainT = 0, deadT = 0, clearT = 0, shake = 0;
  try { hi = +localStorage.getItem('bubblegame.hi') || 0; } catch (e) { hi = 0; }

  function makePlayer(at = respawnPoint) {
    return { x: at.x, y: at.y, w: 12, h: 14, vx: 0, vy: 0,
      face: 1, onGround: false, invuln: 0, fireCd: 0, coyote: 0, jumpBuf: 0, dropThru: 0 };
  }
  function makeEnemy(s) {
    return { x: s.x, y: s.y, w: 12, h: 12, vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1,
      onGround: false, angry: false, kind: s.kind || 'walk',
      wob: Math.random() * 6.28, chasing: false };
  }
  function spawnEnemies() { enemies = enemySpawns.map(makeEnemy); }

  function enterLevel() {
    loadLevel();
    player = makePlayer(playerSpawn);
    spawnEnemies();
    bubbles = []; fruits = [];
    chain = 0; chainT = 0;
    msgTimer = 170;
    snapCamera();
  }
  function resetGame() {
    levelIndex = 0;
    particles = []; floaters = [];
    enterLevel();
    lives = 3; score = 0; anim = anim || 0;
  }
  function respawn() {
    player = makePlayer();
    player.invuln = INVULN;
    snapCamera();
  }
  function saveHi() {
    if (score > hi) { hi = score; try { localStorage.setItem('bubblegame.hi', String(hi)); } catch (e) {} }
  }

  // ---- juice helpers ----
  function puff(x, y, color, n = 8, spread = 1.6) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * spread * 2,
        vy: (Math.random() - 0.5) * spread * 2 - 0.4, life: 18 + Math.random() * 14,
        color, size: Math.random() < 0.4 ? 2 : 1, grav: 0.04 });
    }
  }
  function sparkle(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      particles.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
        vx: 0, vy: -0.4 - Math.random() * 0.4, life: 20 + Math.random() * 12,
        color, size: 1, grav: 0 });
    }
  }
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 45 });
  }
  function hudMsg(text) { hudMsgText = text; hudMsgT = 90; }

  function updateParticles() {
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--; }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) { f.y -= 0.45; f.life--; }
    floaters = floaters.filter((f) => f.life > 0);
    if (shake > 0) shake--;
  }

  // ---- update ----
  function update() {
    anim++;
    if (Input.pressed('mute')) {
      const m = window.Sfx ? window.Sfx.toggle() : true;
      hudMsg('SOUND ' + (m ? 'OFF' : 'ON'));
    }

    if (state === 'title') {
      if (Input.pressed('start') || Input.pressed('jump')) { resetGame(); state = 'play'; sfx('collect'); }
      return;
    }
    if (state === 'win' || state === 'over') {
      updateParticles();
      if (Input.pressed('start') || Input.pressed('restart')) { state = 'title'; }
      return;
    }
    if (state === 'clear') {
      updateParticles();
      clearT--;
      if (clearT <= 0) {
        levelIndex++;
        const list = levelList();
        if (levelIndex >= list.length) { state = 'win'; saveHi(); sfx('win'); }
        else { enterLevel(); state = 'play'; }
      }
      return;
    }
    if (state === 'dead') {
      // player tumbles off; world holds its breath
      player.vy = Math.min(player.vy + GRAVITY, 9);
      player.y += player.vy;
      updateParticles();
      deadT--;
      if (deadT <= 0) { respawn(); state = 'play'; }
      return;
    }

    // ---- state === 'play' ----
    if (Input.pressed('pause')) { paused = !paused; }
    if (paused) return;
    if (Input.pressed('restart')) { state = 'title'; saveHi(); return; }

    updatePlayer();
    if (state !== 'play') { updateParticles(); return; } // reached the exit this frame
    updateEnemies();
    if (state !== 'play') { updateParticles(); return; } // got hit this frame
    updateBubbles();
    updateFruits();
    updateParticles();
    if (msgTimer > 0) msgTimer--;
    if (hudMsgT > 0) hudMsgT--;
    if (chainT > 0) { chainT--; if (chainT === 0) chain = 0; }

    // the exit glimmers so explorers spot it
    if (exitTiles.length && anim % 16 === 0) {
      const e = exitTiles[Math.floor(Math.random() * exitTiles.length)];
      sparkle(e.x * T + 8, e.y * T + 6, '#ffd23f', 1);
    }
  }

  function standingOnPlatformOnly(p) {
    const row = Math.floor((p.y + p.h) / T);
    const left = Math.floor(p.x / T), right = Math.floor((p.x + p.w - 1) / T);
    let plat = false;
    for (let tx = left; tx <= right; tx++) {
      if (isSolid(tx, row)) return false;
      if (isPlatform(tx, row)) plat = true;
    }
    return plat;
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

    // jump with coyote-time + input buffering; ↓+jump drops through platforms
    const jp = Input.pressed('jump');
    if (jp && Input.down && p.onGround && standingOnPlatformOnly(p)) {
      p.dropThru = 8; p.vy = 1; p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
      sfx('drop');
    } else if (jp) p.jumpBuf = JUMP_BUFFER;
    if (p.dropThru > 0) p.dropThru--;
    if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.coyote > 0) p.coyote--;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -JUMP_V; p.jumpBuf = 0; p.coyote = 0;
      sfx('jump');
    }
    if (!Input.jump && p.vy < -2) p.vy = -2; // variable height: cut when released

    // gravity
    p.vy = Math.min(p.vy + GRAVITY, 9);

    p.hitWall = false;
    const wasAir = !p.onGround;
    moveX(p);
    moveY(p);
    if (p.onGround) {
      p.coyote = COYOTE; // refresh the moment we're grounded
      if (wasAir && p.vy === 0) puff(p.x + p.w / 2, p.y + p.h, '#3a3a5c', 3, 0.8); // landing dust
    }

    // fire bubble
    if (p.fireCd > 0) p.fireCd--;
    if (Input.pressed('fire') && p.fireCd === 0) {
      bubbles.push({ x: p.x + (p.face > 0 ? p.w : -12), y: p.y, w: 14, h: 14,
        vx: p.face * BUBBLE_SHOT_SPEED, vy: 0, state: 'empty', shot: BUBBLE_SHOT_FRAMES,
        life: BUBBLE_LIFE, enemy: null, wob: Math.random() * 6.28 });
      p.fireCd = 12;
      sfx('fire');
    }

    if (p.invuln > 0) p.invuln--;

    // checkpoint + exit checks
    const cx = Math.floor((p.x + p.w / 2) / T), cy = Math.floor((p.y + p.h / 2) / T);
    if (isCheckpoint(cx, cy)) {
      const key = cx + ',' + cy;
      if (!checkpointsLit.has(key)) {
        checkpointsLit.add(key);
        respawnPoint = { x: cx * T + 2, y: cy * T };
        addFloater(cx * T - 8, cy * T - 12, 'CHECKPOINT!', '#a8f0c6');
        sparkle(cx * T + 8, cy * T + 4, '#ffd23f', 10);
        sfx('checkpoint');
      }
    }
    if (isExit(cx, cy)) {
      state = 'clear'; clearT = 130;
      score += CLEAR_BONUS;
      addFloater(p.x - 6, p.y - 10, '+' + CLEAR_BONUS, '#ffd23f');
      sparkle(p.x + p.w / 2, p.y, '#ffd23f', 14);
      saveHi();
      sfx('clear');
    }
  }

  function hitPlayer() {
    lives--;
    shake = 14;
    puff(player.x + player.w / 2, player.y + player.h / 2, '#ff6b6b', 12, 2.2);
    saveHi();
    if (lives <= 0) { state = 'over'; sfx('lose'); }
    else { state = 'dead'; deadT = 55; player.vy = -5; sfx('hurt'); }
  }

  function updateEnemies() {
    for (const e of enemies) {
      const rage = e.angry ? ANGRY_MULT : 1;
      if (e.kind === 'fly') {
        // no gravity: bob on a sine wave, drift, and slowly home to your altitude
        e.wob += 0.07;
        const dy = (player.y + player.h / 2) - (e.y + e.h / 2);
        e.vy = Math.sin(e.wob) * 0.5 + Math.sign(dy) * Math.min(Math.abs(dy) * 0.02, FLY_HOME) * rage;
        moveY(e);
        e.vx = e.dir * FLY_SPEED * rage;
        e.hitWall = false;
        moveX(e);
        if (e.hitWall) e.dir *= -1;
      } else {
        // grounded kinds fall, patrol, turn at walls
        let spd = ENEMY_SPEED * rage;
        let ledgeTurn = true;
        if (e.kind === 'chase') {
          const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
          const dy = (player.y + player.h / 2) - (e.y + e.h / 2);
          const spotted = Math.abs(dx) < CHASE_RANGE_X && Math.abs(dy) < CHASE_RANGE_Y;
          if (spotted && !e.chasing) addFloater(e.x + 2, e.y - 12, '!', '#ff6b6b');
          e.chasing = spotted;
          if (spotted) {
            e.dir = dx < 0 ? -1 : 1;
            spd = CHASE_SPEED * rage;
            ledgeTurn = false;      // hotheads sprint right off ledges
          }
        }
        e.vy = Math.min(e.vy + GRAVITY, 9);
        moveY(e);
        e.vx = e.dir * spd;
        if (e.onGround && ledgeTurn) {
          const frontX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
          const ftx = Math.floor(frontX / T), fty = Math.floor((e.y + e.h) / T);
          if (!isSolid(ftx, fty) && !isPlatform(ftx, fty)) e.dir *= -1; // ledge
        }
        e.hitWall = false;
        moveX(e);
        if (e.hitWall) e.dir *= -1;
      }

      // hit player
      if (player.invuln === 0 && overlap(e, player)) { hitPlayer(); return; }
    }
  }

  function popTrappedBubble(b) {
    b.dead = true;
    chain = chainT > 0 ? chain + 1 : 1;
    chainT = CHAIN_WINDOW;
    score += 50;
    const type = Math.min(chain - 1, FRUIT.length - 1);
    fruits.push({ x: b.x + 2, y: b.y + 2, w: 10, h: 10,
      vx: (Math.random() - 0.5) * 1.6, vy: -2.5, type, life: 700, onGround: false });
    puff(b.x + b.w / 2, b.y + b.h / 2, b.enemy && b.enemy.angry ? '#ff6b6b' : '#9b5de5', 10, 1.8);
    addFloater(b.x, b.y - 8, chain > 1 ? chain + ' CHAIN!' : '+50', chain > 1 ? '#ffd23f' : '#ffffff');
    shake = Math.min(shake + 3, 6);
    sfx('pop');
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
            enemies.splice(i, 1);
            sfx('capture');
            break;
          }
        }
      }

      if (b.state === 'enemy') {
        // player pops a trapped bubble
        if (overlap(b, player)) popTrappedBubble(b);
      } else if (b.shot <= 0 && player.vy > 0.5 && overlap(b, player) &&
                 player.y + player.h < b.y + b.h * 0.7) {
        // stomp an empty bubble to bounce — a way UP
        b.dead = true;
        player.vy = Input.jump ? -JUMP_V * 0.95 : -BOUNCE_V;
        score += 10;
        addFloater(b.x + 3, b.y - 6, '+10', '#bfe3ff');
        puff(b.x + b.w / 2, b.y + b.h / 2, '#bfe3ff', 6, 1.2);
        sfx('bounce');
      }
    }
    // resolve dead/expired bubbles
    const next = [];
    for (const b of bubbles) {
      if (b.dead) continue;
      if (b.life <= 0) {
        if (b.state === 'enemy' && b.enemy) {       // trapped enemy escapes — ANGRY!
          b.enemy.x = b.x; b.enemy.y = b.y; b.enemy.vy = 0; b.enemy.angry = true;
          enemies.push(b.enemy);
          puff(b.x + b.w / 2, b.y + b.h / 2, '#ff6b6b', 6, 1.4);
        } else {
          puff(b.x + b.w / 2, b.y + b.h / 2, '#bfe3ff', 4, 1);
        }
        continue; // bubble gone
      }
      next.push(b);
    }
    bubbles = next;
  }

  function updateFruits() {
    for (const f of fruits) {
      f.vy = Math.min(f.vy + GRAVITY, 8);
      if (f.onGround) f.vx *= 0.8;
      moveX(f);
      moveY(f);
      f.life--;
      if (overlap(f, player)) {
        f.dead = true;
        const v = FRUIT[f.type].val;
        score += v;
        addFloater(f.x - 2, f.y - 8, '+' + v, '#fff1a6');
        sparkle(f.x + f.w / 2, f.y + f.h / 2, '#fff1a6', 6);
        sfx('collect');
      }
    }
    fruits = fruits.filter((f) => !f.dead && f.life > 0);
  }

  // ---- render ----
  const KIND_SPRITE = { walk: 'enemy', fly: 'flyer', chase: 'chaser' };
  let camX = 0, camY = 0;
  function camTarget() {
    const p = player;
    const tx = Math.max(0, Math.min(levelPxW - VIEW_W, (p.x + p.w / 2 + p.face * 18) - VIEW_W / 2));
    const ty = Math.max(0, Math.min(levelPxH - VIEW_H, (p.y + p.h / 2) - VIEW_H / 2));
    return { tx, ty };
  }
  function snapCamera() {
    if (!player) return;
    const { tx, ty } = camTarget();
    camX = tx; camY = ty;
  }
  function render() {
    // smoothed camera with a little lookahead, clamped to level
    if (state !== 'title') {
      const { tx, ty } = camTarget();
      camX += (tx - camX) * 0.12;
      camY += (ty - camY) * 0.16;
    }
    let ox = 0, oy = 0;
    if (shake > 0) {
      const s = Math.min(shake, 3);
      ox = Math.round((Math.random() - 0.5) * 2 * s);
      oy = Math.round((Math.random() - 0.5) * 2 * s);
    }
    const cx = Math.round(camX) + ox, cy = Math.round(camY) + oy;

    // solid cavern sky (no gradient -> every pixel is a flat colour)
    ctx.fillStyle = '#1a0f33'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // solid parallax stars
    ctx.fillStyle = '#3a2e6e';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 71 - cx * 0.3) % VIEW_W, sy = (i * 53) % VIEW_H;
      ctx.fillRect((sx + VIEW_W) % VIEW_W, sy, 1, 1);
    }

    if (state === 'title') { drawTitle(); return; }

    ctx.save();
    ctx.translate(-cx, -cy);

    // tiles (only those in view)
    const tx0 = Math.floor(cx / T), tx1 = Math.ceil((cx + VIEW_W) / T);
    const ty0 = Math.floor(cy / T), ty1 = Math.ceil((cy + VIEW_H) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ch = tileChar(tx, ty);
        if (ch === '#') drawSprite('tile_block', tx * T, ty * T, false);
        else if (ch === '=') drawSprite('tile_platform', tx * T, ty * T, false);
        else if (ch === 'E') drawSprite('tile_exit', tx * T, ty * T, false);
        else if (ch === 'C') drawSprite(checkpointsLit.has(tx + ',' + ty) ? 'checkpoint_on' : 'checkpoint_off', tx * T, ty * T, false);
      }
    }

    // fruit (blink when about to vanish)
    for (const f of fruits) {
      if (f.life < 120 && Math.floor(anim / 4) % 2) continue;
      drawSprite(FRUIT[f.type].sprite, f.x - 1, f.y - 1, false);
    }

    // bubbles (blink when about to pop / release)
    for (const b of bubbles) {
      if (b.life < 60 && Math.floor(anim / 5) % 2) { /* flicker */ } else {
        drawSprite('bubble', b.x - 1, b.y - 1, false);
      }
      if (b.state === 'enemy') {
        // shrink the trapped critter inside the bubble
        const e = b.enemy;
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.scale(0.5, 0.5); // clean half-size -> stays solid pixels
        const trapped = KIND_SPRITE[e.kind] || 'enemy';
        drawSprite(e.angry ? trapped + '_a_angry' : trapped + '_a', -8, -8, e.dir < 0);
        ctx.restore();
      }
    }

    // enemies
    for (const e of enemies) {
      const kind = KIND_SPRITE[e.kind] || 'enemy';
      const rate = e.kind === 'fly' ? 8 : (e.chasing || e.angry) ? 8 : 14;
      const base = kind + ((Math.floor(anim / rate) % 2) ? '_b' : '_a');
      drawSprite(e.angry ? base + '_angry' : base, e.x - 2, e.y - 4, e.dir < 0);
    }

    // player (blink while invulnerable; tumble while dead)
    if (state === 'dead') {
      drawSprite('player_jump', player.x - 2, player.y - 2, Math.floor(anim / 6) % 2 === 0);
    } else if (!(player.invuln > 0 && Math.floor(anim / 4) % 2)) {
      const walking = player.onGround && Math.abs(player.vx) > 0.2;
      const name = !player.onGround ? 'player_jump'
        : (walking && Math.floor(anim / 7) % 2) ? 'player_walk' : 'player_idle';
      drawSprite(name, player.x - 2, player.y - 2, player.face < 0);
    }

    // particles
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    // score floaters
    for (const f of floaters) text(f.text, f.x, f.y, f.color, 1);

    ctx.restore();

    drawHUD();
    if (paused) drawBanner('PAUSED', '#bfe3ff', 'P - RESUME');
    if (state === 'clear') drawBanner(customOnly ? 'LEVEL CLEAR!' : 'LEVEL ' + (levelIndex + 1) + ' CLEAR!', '#a8f0c6', '');
    if (state === 'win') drawCenter('YOU ESCAPED!', '#a8f0c6', 'ENTER / TAP - PLAY AGAIN');
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
    text('*'.repeat(Math.max(0, lives)), 4, 2, '#ff8fb1', 1);
    text('HI ' + String(hi).padStart(5, '0'), VIEW_W / 2, 2, '#a8f0c6', 1, 'center');
    text(String(score).padStart(5, '0'), VIEW_W - 4, 2, '#fff1a6', 1, 'right');
    const lvName = customOnly ? level.name || 'CUSTOM' : 'L' + (levelIndex + 1) + ' ' + (level.name || '');
    text(lvName.slice(0, 26), 4, VIEW_H - 9, '#bfe3ff', 1);
    text('FOES ' + enemies.length, VIEW_W - 4, VIEW_H - 9, '#d9c2ff', 1, 'right');
    if (msgTimer > 0 && state === 'play') text('FIND THE EXIT >', VIEW_W / 2, 16, '#ffd23f', 1, 'center');
    if (hudMsgT > 0) text(hudMsgText, VIEW_W / 2, 28, '#bfe3ff', 1, 'center');
    if (chain > 1 && chainT > 0) text('CHAIN X' + chain, VIEW_W / 2, VIEW_H - 22, '#ffd23f', 1, 'center');
  }
  // decorative title bubbles
  const deco = Array.from({ length: 8 }, (_, i) => ({
    x: (i * 37 + 14) % (VIEW_W - 24), spd: 0.25 + (i % 4) * 0.12, off: i * 47,
  }));
  function drawTitle() {
    ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); // solid overlay
    ctx.fillStyle = '#3a2e6e';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 71) % VIEW_W, (i * 53) % VIEW_H, 1, 1);
    for (const d of deco) {
      const y = VIEW_H + 20 - ((anim * d.spd + d.off) % (VIEW_H + 40));
      drawSprite('bubble', d.x + Math.sin((anim + d.off) / 40) * 4, y, false);
    }
    text('BUBBLEGAME', VIEW_W / 2, 40, '#a8f0c6', 3, 'center');
    text('EXPLORE - FIND THE HIDDEN EXIT', VIEW_W / 2, 78, '#ffffff', 1, 'center');
    text('TRAP FOES - POP FOR FRUIT - CHAIN!', VIEW_W / 2, 92, '#ff8fb1', 1, 'center');
    text('BOUNCE ON BUBBLES TO CLIMB', VIEW_W / 2, 106, '#bfe3ff', 1, 'center');
    text('ARROWS MOVE  UP JUMP  Z BUBBLE', VIEW_W / 2, 128, '#d9c2ff', 1, 'center');
    text('DOWN,JUMP DROP  P PAUSE  M MUTE', VIEW_W / 2, 140, '#d9c2ff', 1, 'center');
    if (hi > 0) text('HI SCORE ' + hi, VIEW_W / 2, 162, '#fff1a6', 1, 'center');
    if (Math.floor(anim / 24) % 2) text('PRESS ENTER OR TAP', VIEW_W / 2, 182, '#ffd23f', 2, 'center');
  }
  function drawBanner(title, color, sub) {
    ctx.fillStyle = '#140a28'; ctx.fillRect(0, VIEW_H / 2 - 22, VIEW_W, 44);
    text(title, VIEW_W / 2, VIEW_H / 2 - 12, color, 2, 'center');
    if (sub) text(sub, VIEW_W / 2, VIEW_H / 2 + 6, '#ffd23f', 1, 'center');
  }
  function drawCenter(title, color, sub) {
    ctx.fillStyle = '#0d0820'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(title, VIEW_W / 2, 74, color, 2, 'center');
    text('SCORE ' + score, VIEW_W / 2, 108, '#ffffff', 1, 'center');
    text('HI SCORE ' + hi, VIEW_W / 2, 122, '#fff1a6', 1, 'center');
    if (Math.floor(anim / 24) % 2) text(sub, VIEW_W / 2, 150, '#ffd23f', 1, 'center');
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
    paused = false;
    requestAnimationFrame(frame);
  }
  // expose a reload hook so editors-in-another-tab changes can be picked up
  window.BubblegameReload = () => { loadSprites(); resetGame(); state = 'title'; paused = false; };
  // tiny debug handle for automated tests / poking at the game from the console
  window.BubblegameDebug = {
    get state() { return state; }, set state(s) { state = s; },
    get player() { return player; },
    get enemies() { return enemies; },
    get bubbles() { return bubbles; },
    get fruits() { return fruits; },
    get score() { return score; },
    get lives() { return lives; },
    get levelIndex() { return levelIndex; },
    teleport(x, y) { player.x = x; player.y = y; player.vx = 0; player.vy = 0; },
  };
  window.addEventListener('storage', (e) => {
    if (e.key === 'bubblegame.sprites' || e.key === 'bubblegame.level') window.BubblegameReload();
  });

  boot();
})();
