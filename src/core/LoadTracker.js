// Knows when every model and texture the game asked for has arrived.
//
// Every GLTFLoader and TextureLoader in the game reports to three.js's shared
// DefaultLoadingManager, so it already knows when nothing is left in flight;
// this just turns that into something the loading screen can await.
//
// WHY THE LOADING SCREEN NEEDS IT. The warm-up builds each room's shaders by
// drawing it once, and a shader is built for one exact lighting setup. Models
// that land AFTER that draw can bring lights with them -- the bedroom's two
// candle glows arrive with the vanity candlestick and the bed -- and a room
// whose light count changes needs every one of its shaders built again. They
// were then built mid-game, the first time each thing was seen, which is where
// the freezes came from.

import * as THREE from 'three';

/**
 * The longest the loading screen will wait for downloads. A request that never
 * settles must cost a few stalls later, never a game that cannot start.
 */
const MAX_WAIT_MILLISECONDS = 20000;

const manager = THREE.DefaultLoadingManager;
let isLoading = false;
const idleResolvers = [];

/** Resolves everyone waiting for the loads to finish. */
function resolveIdleWaiters() {
  while (idleResolvers.length) idleResolvers.shift()();
}

/**
 * Starts listening to the shared loading manager. It has to be listening before
 * the first load starts, so it runs as soon as this module is evaluated -- and
 * main.js imports this module first, before anything that loads.
 *
 * Chains onto any handlers already set rather than replacing them.
 */
function startLoadTracking() {
  const previousOnStart = manager.onStart;
  const previousOnLoad = manager.onLoad;
  manager.onStart = (...args) => {
    isLoading = true;
    previousOnStart?.(...args);
  };
  manager.onLoad = (...args) => {
    isLoading = false;
    previousOnLoad?.(...args);
    resolveIdleWaiters();
  };
}

startLoadTracking();

/**
 * Waits until no model or texture is loading, then one more task so the code
 * that handles each load (adding a model, and its lights, to its room) has run.
 * A load that starts another load (a model whose textures load separately) is
 * waited for too: the manager only goes idle when the last of them is done.
 *
 * @returns {Promise<void>} resolves when everything has arrived, or after
 *   MAX_WAIT_MILLISECONDS, whichever is first.
 */
export async function waitForAllLoads({ timeoutMilliseconds = MAX_WAIT_MILLISECONDS } = {}) {
  const deadline = performance.now() + timeoutMilliseconds;
  // A loop, because handling one load can start the next (a model loaded in a
  // .then() of another): the manager goes idle for a moment in between.
  while (performance.now() < deadline) {
    const loadsFinished = new Promise((resolve) => {
      if (!isLoading) resolve();
      else idleResolvers.push(resolve);
    });
    if (Number.isFinite(deadline)) {
      let timeout;
      const timedOut = new Promise((resolve) => { timeout = setTimeout(resolve, deadline - performance.now()); });
      await Promise.race([loadsFinished, timedOut]);
      clearTimeout(timeout);
    } else await loadsFinished;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!isLoading) return;
  }
}
