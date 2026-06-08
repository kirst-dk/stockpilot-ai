---
name: testing-landing-3d
description: Runtime-test the premium Three.js WebGL 3D hero and infinite xStock marquee on the static landing site (stockpilotai.xyz). Use when verifying landing/index.html hero/marquee changes end-to-end in the browser.
---

# Testing the 3D landing hero (stockpilotai.xyz)

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
1. **Hero renders (not black, not flat fallback):** a glowing mint **portal ring** (torus) with bloom + an abstract glass blob, with **depth-of-field** background blur and studio lighting. Console `GL_CONTEXT` should report `WebGL 2.0`. A broken deploy shows a solid black canvas or only the static `.hero-fallback .ring` outline.
2. **Coin → portal → token cascade:** USDC discs fall from top, shrink into the portal center; glassy/metallic xStock cards (ticker logos AAPLx/NVDAx/SPYx) drift outward and fade. Watch ~6-8s.
3. **Cursor parallax:** moving the mouse offsets the camera; compare left-cursor vs right-cursor frames — the portal's horizontal position must visibly differ.
4. **Scroll-driven camera dolly:** scrolling down zooms/reframes the camera over the hero (`camera.z = 15 - p*4.8`) before the hero scrolls away — it is not a fixed image.
5. **Block-2 marquee (regression):** two rows of xStock logos scroll in opposite directions with edge fade masks; no broken-image icons.

## Gotcha: WebGL canvas brightness reads as 0 (false alarm)
Probing the canvas with `gl.readPixels`/`getImageData` from the console **after the frame is cleared** returns all-black (avg brightness 0) because the renderer is created without `preserveDrawingBuffer`. This does NOT mean the scene is black — trust the screenshots/recording instead. Don't use a brightness probe as a pass/fail signal.

## Console expectations
The committed page has **zero** `console.log` statements. Verify with `grep -nE "console\.(log|debug|info)" landing/index.html` (expect 0). Any `HERO_STATE`/`GL_CONTEXT`/`CANVAS_BRIGHTNESS` lines in the console come from manually injected diagnostic probes, not the page.

## Reporting
Post ONE consolidated comment on the landing PR with a results table, the recording (convert mp4 -> animated webp for GitHub embedding), key screenshots in <details> blocks, and a link to the Devin session.

## Devin Secrets Needed
None for read-only/visual testing of the live landing page. (Server SSH/root password is only needed for deploys — see the `deploy` skill.)
