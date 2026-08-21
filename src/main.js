// Entry point. Boots the game once the page and the canvas are ready.
//
// Audio cannot start without a user gesture — on iOS especially — so the first
// tap or key press initialises the AudioContext and then gets out of the way.

import { Game } from './game/Game.js';
import { audio } from './audio/AudioEngine.js';

function boot() {
  const canvas = document.getElementById('gl');
  const ui = document.getElementById('ui');
  const loading = document.getElementById('loading');

  let game;
  try {
    game = new Game(canvas, ui);
  } catch (err) {
    loading.innerHTML = `<div class="boot-error">
      <h2>The game could not start</h2>
      <pre>${String(err && err.stack || err)}</pre>
      <p>This needs WebGL. If you are on a very old browser, that is the likely cause.</p>
    </div>`;
    throw err;
  }

  window.__tiger = game;   // for debugging from the console

  const startAudio = async () => {
    await audio.init();
    window.removeEventListener('pointerdown', startAudio);
    window.removeEventListener('keydown', startAudio);
    window.removeEventListener('touchstart', startAudio);
  };
  window.addEventListener('pointerdown', startAudio, { once: false });
  window.addEventListener('keydown', startAudio, { once: false });
  window.addEventListener('touchstart', startAudio, { once: false });

  // iOS suspends the context when the tab goes to the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend();
    else if (!game.paused) audio.resume();
  });

  // Author the material textures before the first frame. A 512px PBR set costs
  // a few hundred milliseconds to generate, and there are seventeen of them, so
  // this yields between each and drives the loading bar rather than freezing
  // the tab for several seconds.
  const bar = loading.querySelector('.boot-bar i');
  const note = loading.querySelector('.boot-note');
  const originalNote = note?.textContent || '';
  if (bar) bar.style.animation = 'none';

  game.renderer.warmupTextures((done, total, name) => {
    if (bar) {
      bar.style.width = `${Math.round((done / total) * 100)}%`;
      bar.style.transform = 'none';
    }
    if (note) note.textContent = `Preparing materials — ${name} (${done}/${total})`;
  }).then(() => {
    if (note) note.textContent = originalNote;
    loading.style.display = 'none';
    game.start();
  }).catch((err) => {
    // A texture failure must not stop the game starting; the materials will
    // simply be untextured.
    console.error('texture warm-up failed', err);
    loading.style.display = 'none';
    game.start();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
