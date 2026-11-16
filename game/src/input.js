// Dustline Protocol — keyboard and mouse input, pointer lock included.
// Owns no game logic: it only reports what the player is doing this frame.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since the last consume()
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let rightDown = false;
  let locked = false;
  let lockFailed = false;
  let lockAt = 0; // when lock last engaged: warps arrive in the first instants
  let lockRequestAt = 0; // a warp can also arrive before the change event

  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseMove = (e) => {
    // Pointer lock is the normal path; holding the left button and dragging
    // also turns the view (headless captures and trackpads have no lock).
    if (!locked && !mouseDown) return;
    // A single mousemove with a huge delta is a cursor warp (lock engaging,
    // or a synthetic jump), not a human flick: human look arrives as many
    // small events. Drop it instead of letting it spin the view.
    const rawDX = e.movementX || 0;
    const rawDY = e.movementY || 0;
    if (Math.abs(rawDX) > 120 || Math.abs(rawDY) > 120) return;
    const dx = Math.max(-250, Math.min(250, rawDX));
    const dy = Math.max(-250, Math.min(250, rawDY));
    mouseDX += dx;
    mouseDY += dy;
  };
  const onMouseDown = (e) => {
    if (e.button === 0) { mouseDown = true; mouseClicked = true; }
    if (e.button === 2) rightDown = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rightDown = false;
  };
  const onLockChange = () => {
    const was = locked;
    locked = document.pointerLockElement === canvas;
    if (locked && !was) lockAt = performance.now();
    if (!locked) mouseDown = false;
  };
  const onLockError = () => { lockFailed = true; };
  const onContext = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  canvas.addEventListener('contextmenu', onContext);

  return {
    down(code) { return keys.has(code); },
    // True once per physical press; the game consumes it each fixed step.
    wasPressed(code) { return pressed.has(code); },
    consume() { pressed.clear(); },
    moveAxis() {
      let x = 0;
      let z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      const len = Math.hypot(x, z);
      return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
    },
    crouch() { return keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'); },
    takeMouse() { const d = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return d; },
    firing() { return mouseDown; },
    clicked() { const c = mouseClicked; mouseClicked = false; return c; },
    aiming() { return rightDown; },
    isLocked() { return locked; },
    lockFailed() { return lockFailed; },
    requestLock() {
      lockFailed = false;
      lockRequestAt = performance.now();
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => { lockFailed = true; });
      } catch { lockFailed = true; }
    },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // Mouse look still works in headless captures where pointer lock is refused:
    // the game treats a held left button drag as look input when unlocked.
    dragLook(dx, dy) { mouseDX += dx; mouseDY += dy; },
  };
}
