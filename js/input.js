/*
 * input.js  —  tiny keyboard manager. Exposes Input.left / .right / .jump /
 * .fire as booleans, plus edge-triggered pressed() for one-shot actions.
 */
const Input = (() => {
  const down = {};
  const justPressed = {};

  const MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    KeyJ: 'fire', KeyZ: 'fire', KeyK: 'fire',
    KeyR: 'restart',
    Enter: 'start',
  };

  window.addEventListener('keydown', (e) => {
    const a = MAP[e.code];
    if (!a) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
    if (!down[a]) justPressed[a] = true;
    down[a] = true;
  });
  window.addEventListener('keyup', (e) => {
    const a = MAP[e.code];
    if (a) down[a] = false;
  });

  return {
    get left() { return !!down.left; },
    get right() { return !!down.right; },
    get jump() { return !!down.jump; },
    get fire() { return !!down.fire; },
    // True exactly once per key press.
    pressed(a) { if (justPressed[a]) { justPressed[a] = false; return true; } return false; },
    clearFrame() { /* reserved */ },
  };
})();

window.Input = Input;
