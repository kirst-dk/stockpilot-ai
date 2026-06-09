---
name: testing-landing-3d
description: Runtime-test the premium Three.js WebGL 3D hero and infinite xStock token stream on the static landing site (stockpilotai.xyz). Use when verifying landing/index.html hero/Block-2 changes end-to-end in the browser.
---

# Testing the 3D landing hero + Block 2 token stream (stockpilotai.xyz)

The landing is a **single static `landing/index.html`** (vanilla Three.js from CDN, no bundler/Next.js). It is served by nginx from `/var/www/landing/` on the prod server and is the site at `https://stockpilotai.xyz` (NOT the Next.js app at `app.stockpilotai.xyz`). See the `deploy` skill for how it gets built/deployed.

## Confirm you are testing the right code (live == source)
Because it is one static file, you can prove the live site matches the PR branch with a checksum instead of guessing:
```bash
curl -s https://stockpilotai.xyz/ | md5sum
md5sum landing/index.html   # on the PR branch
```
If the two md5s match, testing the live URL is equivalent to testing the PR. This lets you record against the real production URL.

## What to test (golden path) and what each should look like
Record one continuous annotated screen recording, maximize the window first.
1. **Hero renders (not black, not flat fallback):** a glowing mint **portal ring** (torus) with bloom + abstract glass blobs, depth-of-field background blur, studio lighting. Console GL version should report `WebGL 2.0`. A broken deploy shows a solid black canvas or only the static `.hero-fallback .ring` outline.
2. **Coin -> portal -> token cascade:** USDC `$` discs fall from top, shrink into the portal center; glassy xStock cards (AAPLx/NVDAx/SPYx) drift outward and fade. Watch ~6-8s.
3. **Cursor parallax:** moving the mouse offsets the camera; compare left-cursor vs right-cursor frames — the portal's horizontal position must visibly differ.
4. **Block 1 -> Block 2 crossfade:** scrolling into `#stream` should show the portal still glowing while the first orbiting token cards fade in and the "155+ xStocks..." heading emerges — both visible at once (crossfade, NOT a hard cut).
5. **Block 2 infinite orbit:** a full ellipse of distinct xStock cards (TSLAx/MSFTx/AAPLx/NVDAx/SPYx/...) orbits the heading and bobs. The orbit uses `ang = base + t*speed`, so there is NO reset seam — compare two frames a few seconds apart: the ellipse should have rotated continuously with no teleport. Glassmorphism stat cards ($1.2B+, 24/7, 1:1, 12) render below.
6. **Stream fades out over lower sections (key behavior):** scrolling past `#stream` into Platform Overview, the orbiting tokens must fade to invisible (`streamExit` progress) — they must NOT overlap the feature cards or Tokenomics. Token overlap on lower sections = the bug `streamExit` fixes.

## Verify InstancedMesh (coins + tokens) via a draw-call probe
The brief requires coins/tokens render through **InstancedMesh** (one geometry/material + instances), not hundreds of separate `Mesh`es. Prove it by wrapping the WebGL2 context draw methods for ~1s and counting instanced vs non-instanced calls:
```js
(() => {
  const cv = document.querySelector('#scene3d canvas') || document.querySelector('canvas');
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  let inst=0, nonInst=0, frames=0, run=true;
  const di=gl.drawElementsInstanced.bind(gl), dai=gl.drawArraysInstanced.bind(gl), de=gl.drawElements.bind(gl), da=gl.drawArrays.bind(gl);
  gl.drawElementsInstanced=(...a)=>{inst++;return di(...a);};
  gl.drawArraysInstanced=(...a)=>{inst++;return dai(...a);};
  gl.drawElements=(...a)=>{nonInst++;return de(...a);};
  gl.drawArrays=(...a)=>{nonInst++;return da(...a);};
  (function tick(){frames++; if(run) requestAnimationFrame(tick);})();
  setTimeout(()=>{ run=false; gl.drawElementsInstanced=di;gl.drawArraysInstanced=dai;gl.drawElements=de;gl.drawArrays=da;
    window.__probe={glVersion:gl.getParameter(gl.VERSION),instPerFrame:+(inst/frames).toFixed(1),nonInstPerFrame:+(nonInst/frames).toFixed(1)};
  },1000);
  return 'ok';
})()
```
Then read `JSON.stringify(window.__probe)` in a SECOND console call.
- **Pass:** instanced draws/frame >= 1 (coins + hero + stream token systems), AND non-instanced draws/frame stays roughly constant even with 10+ token cards visible.
- The non-instanced count is NOT ~0 and is NOT a fail signal: the post-processing chain (UnrealBloom mip blur passes + Bokeh DoF + Output pass) plus a few primitives (portal torus, blobs) each issue a fullscreen-quad draw, so expect ~15-25 non-instanced/frame. The discriminator is: does non-instanced scale with the number of visible token cards? If yes -> separate meshes (fail). If it stays flat -> instanced (pass).

## Gotchas
- **Read async probe results via `window` globals, NOT a returned Promise.** The console tool does not await promises — returning `new Promise(...)` yields `{}`. Instead stash results on `window.__x` inside a `setTimeout`/rAF and read it in a follow-up `browser_console` call.
- **Lenis eases the scroll**, so a single scroll gesture moves the page slowly/partially. Scroll in several increments (e.g. amount 3-8 repeated) and wait ~1-2s between to let it settle, rather than one big jump.
- **WebGL canvas brightness reads as 0 (false alarm):** probing the canvas with `gl.readPixels`/`getImageData` after the frame is cleared returns all-black (renderer has no `preserveDrawingBuffer`). This does NOT mean the scene is black — trust the screenshots/recording. Don't use a brightness probe as pass/fail.

## Console expectations
The committed page has **zero** `console.log` statements. Verify with `grep -nE "console\.(log|debug|info)" landing/index.html` (expect 0). Any `PROBE_RESULT`/`HERO_STATE`/`GL_CONTEXT` lines come from manually injected diagnostic probes, not the page. Also confirm no logo 404s: count `performance.getEntriesByType('resource')` entries matching `logos/` and check none have `responseStatus >= 400`, and that no `img[src*=logos/]` has `naturalWidth === 0`.

## Reporting
Post ONE consolidated comment on the landing PR with a results table, the recording (convert mp4 -> animated webp for GitHub embedding), key screenshots in <details> blocks, and a link to the Devin session.

## Devin Secrets Needed
None for read-only/visual testing of the live landing page. (Server SSH/root password is only needed for deploys — see the `deploy` skill.)
