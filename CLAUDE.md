# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (HTTPS, all network interfaces)
npm run build    # production build
npm run preview  # preview production build (serves dist/ with the /api proxy)
npm test         # node --test — examLink + ChallengeManager
```

The dev server runs on HTTPS because **WebXR only starts in a secure context** — over plain HTTP a headset gets no `navigator.xr` at all, while `http://localhost` is secure by browser exception, so a broken setup looks fine on a laptop.

`dev/lanCert.js` issues that certificate via OpenSSL, naming `localhost`, this machine's hostname and `.local` mDNS name, and every LAN IP. The load-bearing detail: **a bare IP in the address bar is matched only against an `iPAddress` SAN, never a `DNS` one**, so both forms are emitted. `@vitejs/plugin-basic-ssl` cannot name a LAN address and is only the fallback when OpenSSL is missing. Certs live in `dev/certs/` (gitignored) and are reissued when the address set changes.

## Deployment

The module is deployed by handing over **a zip of the contents of `dist/`**, extracted into `/var/www/html/acceleration/` on the portal server. No build step, no source, no fixes at deploy time. Most ways this goes wrong are **invisible in development** and only appear on a headset in a classroom.

- **Base path.** `vite.config.js` drives `base` from `BASE_PATH`, defaulting to `/acceleration/`, applied to `build` and `preview` only — the dev server stays at the root of its port. A malformed value throws rather than warning. On Windows, note that Git Bash rewrites `BASE_PATH=/acceleration/` into a filesystem path; set it in `.env`, use PowerShell, or just take the default.
- **Runtime asset paths.** The bundler rewrites `import` statements and `src=` attributes but never a path built as a string at runtime. Anything under `public/` must go through `asset()` from `assetPath.js`. This covers `GLTFLoader`, the `Audio` constructor, and the vendored hand-tracking profiles.
- **Hand-tracking meshes are vendored** in `public/hand-profiles/generic-hand/`. Left unset, `OculusHandModel` fetches them from jsDelivr at runtime and renders nothing on a classroom LAN with no route out. `XRHandler` assigns `handModel.path` after construction — that is correct, because `path` is read when the `connected` event fires, not in the constructor.
- **The Draco decoder is vendored** in `public/draco/`, and `MainScene` points `DRACOLoader.setDecoderPath()` at it through `asset()`. The rocket model (`public/models/rocket/Rocketv2.glb`) lists `KHR_draco_mesh_compression` in `extensionsRequired`, so `GLTFLoader` throws on it without a decoder — and the stock decoder path is a CDN, which is the hand-profiles failure again: an empty launch pad on a classroom LAN. Copied from `three/examples/jsm/libs/draco/gltf/`; re-copy it when three.js is upgraded, since the decoder and the loader are versioned together.
- **The API is the root-relative string `/api`** and must stay that way. It is proxied at the server root and shared by every module, so it inherits the page's scheme and host. An absolute `http://` URL to a LAN IP is active mixed content on an HTTPS page and Chromium blocks it *silently*; `127.0.0.1` on a headset is the headset. `LMS_ORIGIN` (server-side, `vite.config.js`) is the only place an absolute URL is safe.
- **Nothing at the web root.** The portal owns `/`; this module owns `/acceleration/` and nothing else.

Static checks to run against a built `dist/` are in `MODULE_BUILD_HANDOFF.md` §7. `cdn.jsdelivr.net`, `immersiveweb.dev`, `jcgt.org` and `www.w3.org` appear in the bundle as dead string constants inside three.js and are never fetched.

## Architecture

This is a vanilla JS + Three.js educational simulation of Newton's Second Law (F = ma) via a rocket launch. No framework, no bundler-side state management — just ES modules wired together in `main.js`.

### Entry point: `main.js` → `RocketApp`

`RocketApp` is the top-level orchestrator. It instantiates all subsystems, builds a shared `callbacks` object (`onThrustChange`, `onMassChange`, `onTimeChange`, `onLaunch`, `onReset`), and passes it to both UI layers. The animation loop (`_animate`) drives physics, scene, particle, and UI updates every frame. `RocketApp` also owns two `THREE.ArrowHelper` instances (thrust up, weight down) attached to `rocketGroup` that visualize forces in real time via `_updateVisualizers`.

### Subsystems

| File | Responsibility |
|---|---|
| `scenes/MainScene.js` | Three.js renderer, camera, lights, star field, GLTF rocket. Exposes `rocketGroup`, `scene`, `renderer`, `camera`, and `updateRocket(altitude, isThrusting)`. |
| `physics/PhysicsEngine.js` | Kinematic sim: `F_net = thrust + mass×gravity`, Euler integration, fuel burn at constant rate. Parameters locked during flight (`setParameters` is a no-op while `isLaunched`). |
| `ui/UIManager.js` | DOM-based HUD + controls (desktop mode). Reads `#velocity-val`, `#accel-val`, etc. from `index.html`. Also owns the `<canvas>` acceleration graph. |
| `xr/XRHandler.js` | WebXR session management, two controllers with ray-line visuals, raycasting against VR panel meshes, hand-tracking models. Hides `#ui-container` in XR and restores it on session end. |
| `xr/VRPanel.js` | **Base class** for all VR panels. Each panel is a `THREE.PlaneGeometry` with a `CanvasTexture`. Registers buttons/sliders in canvas-pixel coordinates; converts UV hit from raycaster to canvas px to dispatch interactions. Subclasses override `render()` and call `super.render()` to mark the texture dirty. |
| `xr/VRControlPanel.js` | VR sliders (thrust, mass, time scale) and LAUNCH/RESET buttons. Delegates to `callbacks`. |
| `xr/VRHUDPanel.js` | 2×2 flight data grid (velocity, acceleration, altitude, fuel). |
| `xr/VRGraphPanel.js` | Live acceleration graph + inline quiz. Quiz buttons are `disabled` until first launch. |
| `scripts/ParticleSystem.js` | Exhaust particles: 5 mesh clones per frame while thrusting, faded and removed by lifetime. |
| `assetPath.js` | `asset(path)` — prefixes `import.meta.env.BASE_URL` onto anything loaded from `public/` at runtime. |
| `examLink.js` | Captures `?user_id`/`?exam_id` into `sessionStorage` and strips them from the address bar; handles `?mode=explore`. Dependency-free and injectable, so it is tested under Node. |
| `api/ExamService.js` | `GET /api/questions/exam/:id` and the single `POST /api/scores/submit`. Treats an empty 200 body as "exam not found" and carries the server's message into the thrown error. |
| `ChallengeManager.js` | Targets from URL params or an exam. Coerces string properties, tolerates `question_properties_values` arriving as a JSON string or null, accepts `id` for `question_id`. |
| `audio/AudioManager.js` | Narration + SFX elements, all resolved through `asset()`. |

### Exam mode

Driven by `?user_id=&exam_id=` from the portal. `examLink.captureExamLink()` reads those ids and removes them from the URL on load — on a shared headset the next student must not be able to read, or edit, the last one's identity. They persist in `sessionStorage` so a mid-exam reload resumes, and are cleared by `clearExamLink()` at the one place a save is confirmed.

Scores are collected locally and sent **once** at the end of the sitting. `POST /api/scores/submit` records a sitting once and rejects a second submission for the same `(student_id, exam_id)` with a 400, so `RocketApp._submitScores` guards on `SAVE.SUBMITTING` and `SAVE.SAVED`, and `ChallengeManager.getScores()` returns *every* question — one omitted is absent from the record, not "unanswered".

Because the results panel is drawn from local state it renders identically whether or not the POST landed, so `_setSaveStatus` pushes `submitting` / `saved` / `unsaved` to both `UIManager.showSaveStatus` and `VRResultPanel.showSaveStatus`. A failure shows "SCORES NOT SAVED" and reopens the action button as RETRY SAVE — reachable by controller ray and hand pinch, which arrive as the same select event.

A question whose properties yield no usable target **cannot be passed**: `[].every()` is `true`, so the naive reading awards a mark to anyone who launches at all. Exam 41 on the live backend is exactly this shape.

### VR panel interaction model

`XRHandler` raycasts against the flat panel meshes each frame. The UV of the intersection is passed to the hit panel's `onHover`, `onSelectStart`, `onSelectMove`, or `onSelectEnd`. `VRPanel._uvToCanvas(uv)` converts the Three.js UV (bottom-left origin) to canvas pixels (top-left origin). Elements are registered as axis-aligned rectangles and checked in order — first match wins.

### Physics model

```
net_force = thrust - mass * 9.81   (both in N; gravity always acts down)
acceleration = net_force / mass
velocity += acceleration * deltaTime
altitude += velocity * deltaTime
fuel -= burnRate * frame            (burnRate = 0.5 %/frame, not per-second)
```

`deltaTime` is capped at 0.1 s in the animate loop to avoid tunnelling on slow frames. Parameters (mass, thrust) can only be changed before launch.

### Desktop ↔ XR duality

Both `UIManager` (DOM) and `XRHandler` (3D panels) receive the same `callbacks` object. `XRHandler.updateHUD(state)` mirrors `UIManager.updateHUD(state)`. When an XR session is active, the DOM `#ui-container` is hidden; when it ends, it is restored. Camera follow-logic in `MainScene.updateRocket` is skipped while `renderer.xr.isPresenting`.
