# Rocket Perspective Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rocket-mounted chase camera whose live view appears in a picture-in-picture window above the flight-data panel on liftoff, in both desktop (DOM) and VR (3D panel) modes.

**Architecture:** A `THREE.PerspectiveCamera` parented to `rocketGroup` (the "chase camera"). Desktop renders it as a second, scissored viewport pass on the main canvas behind a framed DOM window. VR renders it into a `WebGLRenderTarget` mapped onto a non-interactive monitor plane above the FLIGHT DATA panel. Desktop and VR are mutually exclusive at runtime (`renderer.xr.isPresenting`), so only one extra render pass runs per frame. `main.js` owns the show/hide lifecycle (liftoff → land/reset) and per-frame render dispatch.

**Tech Stack:** Vanilla ES modules, Three.js, Vite. No framework, no test runner.

## Global Constraints

- **No automated tests exist** — per-task gate is `npm run build` (must exit 0); visible behavior is verified manually with `npm run dev`.
- **Never run `git commit`** — leave all changes uncommitted for the user (standing project instruction).
- **Three.js APIs:** `renderer.setViewport(x,y,w,h)` and `renderer.setScissor(x,y,w,h)` take **CSS-pixel** values (Three multiplies by `pixelRatio` internally) — do **not** pre-multiply by `devicePixelRatio`.
- Follow existing code style: `import * as THREE from 'three'`, 4-space indent, section banner comments (`// ── Name ──`).
- Window appears only on genuine liftoff (`isLaunched && altitude > 0`); failed launches (thrust ≤ weight, altitude stays 0) show nothing.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scenes/MainScene.js` | modify | Owns `chaseCamera` (child of `rocketGroup`) and `renderChaseInset(rect)` (desktop scissor pass). |
| `index.html` | modify | `#rocket-cam` framed window stacked above `#hud`, inside `#ui-container`. |
| `styles/main.css` | modify | Top-left column layout + `#rocket-cam` styling. |
| `xr/VRCameraPanel.js` | create | Non-interactive monitor: a `WebGLRenderTarget` + plane group. |
| `xr/XRHandler.js` | modify | Creates the monitor panel; `showCamera()`/`hideCamera()`/`renderCameraView()`. |
| `main.js` | modify | Lifecycle flags, `_showRocketCam()`/`_hideRocketCam()`, per-frame render dispatch. |

---

### Task 1: Chase camera + desktop inset render (MainScene)

**Files:**
- Modify: `scenes/MainScene.js` (add chase camera in `_initRocket`; add `renderChaseInset` method)

**Interfaces:**
- Consumes: nothing (foundational).
- Produces:
  - `mainScene.chaseCamera` — `THREE.PerspectiveCamera`, child of `rocketGroup`.
  - `mainScene.renderChaseInset(rect)` — `rect` is a `DOMRect` from `getBoundingClientRect()`; renders the chase view into that screen rectangle of the main canvas. Returns nothing.

- [ ] **Step 1: Add the chase camera as a child of `rocketGroup`**

In `scenes/MainScene.js`, in `_initRocket()`, immediately after `this.scene.add(this.rocketGroup);` (currently line ~179), insert:

```js
        // Chase camera — mounted below/behind the rocket, angled up at its
        // body. Parented to rocketGroup so it tracks the rocket automatically;
        // the rocket only translates, so the framing stays fixed for the whole
        // flight (exhaust + star parallax convey motion).
        this.chaseCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 1000);
        this.chaseCamera.position.set(0.8, -1.2, 2.2);
        this.rocketGroup.add(this.chaseCamera);
        this.rocketGroup.updateMatrixWorld(true);
        this.chaseCamera.lookAt(
            this.rocketGroup.localToWorld(new THREE.Vector3(0, 1.0, 0))
        );
```

- [ ] **Step 2: Add the `renderChaseInset` method**

In `scenes/MainScene.js`, in the `// ── Runtime updates ──` section, after `updateRocket(...)` and before `_onResize()`, add:

```js
    /**
     * Render the chase-camera view into a screen-space rectangle of the main
     * canvas (desktop picture-in-picture). `rect` is a getBoundingClientRect()
     * result — CSS pixels, top-left origin. Must be called AFTER the main
     * scene render so it overlays.
     */
    renderChaseInset(rect) {
        const w = rect.width;
        const h = rect.height;
        if (w <= 0 || h <= 0) return;

        // WebGL viewport origin is bottom-left; flip Y from the CSS rect.
        const canvasCssH = this.renderer.domElement.clientHeight;
        const x = rect.left;
        const y = canvasCssH - rect.bottom;

        this.chaseCamera.aspect = w / h;
        this.chaseCamera.updateProjectionMatrix();

        const r = this.renderer;
        r.setScissorTest(true);
        r.setScissor(x, y, w, h);
        r.setViewport(x, y, w, h);
        r.render(this.scene, this.chaseCamera);

        // Restore the full-frame viewport/scissor for the next main render.
        r.setScissorTest(false);
        const size = r.getSize(new THREE.Vector2());
        r.setViewport(0, 0, size.x, size.y);
        r.setScissor(0, 0, size.x, size.y);
    }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0 with no errors. (Visible behavior is verified in Task 3, which wires the lifecycle.)

---

### Task 2: Desktop window markup + styling

**Files:**
- Modify: `index.html` (wrap `#hud` in a stack with `#rocket-cam` above it)
- Modify: `styles/main.css` (stack layout + window styling)

**Interfaces:**
- Consumes: nothing.
- Produces: DOM element `#rocket-cam` (default `display: none`), positioned above `#hud`, inside `#ui-container` so the existing XR hide of `#ui-container` also hides it.

- [ ] **Step 1: Wrap the HUD in a top-left stack with the cam above it**

In `index.html`, replace this block (currently lines ~12–17):

```html
            <div id="hud">
                <div class="hud-item">Velocity: <span id="velocity-val">0</span> m/s</div>
                <div class="hud-item">Acceleration: <span id="accel-val">0</span> m/s²</div>
                <div class="hud-item">Altitude: <span id="altitude-val">0</span> m</div>
                <div class="hud-item">Fuel: <span id="fuel-val">100</span>%</div>
            </div>
```

with:

```html
            <div id="top-left-stack">
                <div id="rocket-cam">
                    <span id="rocket-cam-label">ROCKET CAM</span>
                </div>
                <div id="hud">
                    <div class="hud-item">Velocity: <span id="velocity-val">0</span> m/s</div>
                    <div class="hud-item">Acceleration: <span id="accel-val">0</span> m/s²</div>
                    <div class="hud-item">Altitude: <span id="altitude-val">0</span> m</div>
                    <div class="hud-item">Fuel: <span id="fuel-val">100</span>%</div>
                </div>
            </div>
```

- [ ] **Step 2: Add the stack + window CSS**

In `styles/main.css`, immediately after the `#hud { ... }` rule (currently ends ~line 33), add:

```css
#top-left-stack {
    align-self: flex-start;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

#rocket-cam {
    display: none;            /* shown on liftoff */
    width: 240px;
    height: 135px;           /* 16:9 */
    border: 1px solid #00f;
    border-radius: 10px;
    background: transparent;  /* the WebGL chase view shows through */
    box-sizing: border-box;
    position: relative;
    pointer-events: none;
}

#rocket-cam-label {
    position: absolute;
    top: 4px;
    left: 8px;
    font-size: 0.7rem;
    font-weight: bold;
    color: #00f;
    letter-spacing: 0.1em;
    text-shadow: 0 0 4px #000;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Verify placement manually**

Run: `npm run dev`, open the HTTPS URL, accept the self-signed cert. In DevTools, select `#rocket-cam` and temporarily set `display: block`.
Expected: a 240×135 bordered box labelled "ROCKET CAM" sits at the top-left, directly **above** the velocity/accel/altitude/fuel HUD. Remove the override (default is `display: none`).

---

### Task 3: Desktop lifecycle wiring (main.js)

**Files:**
- Modify: `main.js` (constructor flags, `onReset`/`onNext` callbacks, `_animate`, new show/hide helpers)

**Interfaces:**
- Consumes: `this.scene.chaseCamera` and `this.scene.renderChaseInset(rect)` (Task 1); `#rocket-cam` element (Task 2).
- Produces: `this._rocketCamActive` (bool), `this._rocketCamEl` (HTMLElement), `this._showRocketCam()`, `this._hideRocketCam()`. (Task 6 extends the two helpers to also drive VR.)

- [ ] **Step 1: Add lifecycle state in the constructor**

In `main.js`, in the `RocketApp` constructor, after the line `this._countdownSfx  = null;  // the in-progress countdown beep element` (currently ~line 125), add:

```js
        this._rocketCamActive = false;
        this._rocketCamEl = document.getElementById('rocket-cam');
```

- [ ] **Step 2: Hide the cam on reset and next**

In `main.js`, inside the `onReset` callback, after `this._wasLaunched = false;` (currently ~line 72), add:

```js
                this._hideRocketCam();
```

In the `onNext` callback, after its `this._wasLaunched = false;` (currently ~line 88), add:

```js
                this._hideRocketCam();
```

- [ ] **Step 3: Show on liftoff, hide on flight-end, dispatch the inset render**

In `main.js` `_animate()`, after `this._wasLaunched = state.isLaunched;` (currently ~line 219), add:

```js
        // Rocket-cam: show once the rocket is actually airborne.
        if (state.isLaunched && state.altitude > 0 && !this._rocketCamActive) {
            this._showRocketCam();
        }
```

In the existing flight-end block `if (wasLaunched && !state.isLaunched) { ... }`, after `this.audio.stopLoop();` (currently ~line 230), add:

```js
            this._hideRocketCam();
```

Then replace the final render line of `_animate()` (currently `this.scene.renderer.render(this.scene.scene, this.scene.camera);`, ~line 278) with:

```js
        this.scene.renderer.render(this.scene.scene, this.scene.camera);

        // Desktop picture-in-picture: overlay the chase view after the main
        // render. (VR uses a render-target pass instead — added in Task 6.)
        if (this._rocketCamActive && !this.scene.renderer.xr.isPresenting) {
            this.scene.renderChaseInset(this._rocketCamEl.getBoundingClientRect());
        }
```

- [ ] **Step 4: Add the show/hide helpers**

In `main.js`, after the `_cancelCountdown()` method (in the `// ── Countdown ──` section, ~line 195), add a new section:

```js
    // ── Rocket camera ─────────────────────────────────────────────────────

    _showRocketCam() {
        if (this._rocketCamActive) return;
        this._rocketCamActive = true;
        if (this._rocketCamEl) this._rocketCamEl.style.display = 'block';
    }

    _hideRocketCam() {
        this._rocketCamActive = false;
        if (this._rocketCamEl) this._rocketCamEl.style.display = 'none';
    }
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Verify desktop end-to-end manually**

Run: `npm run dev`. In the app, drag **Thrust** high and **Mass** low so thrust clearly exceeds `mass × 9.81` (e.g. thrust ≈ 180, mass = 10 → weight 98 N). Click **LAUNCH** and wait for the countdown.
Expected:
1. On liftoff the window appears above the HUD showing the rocket with exhaust streaming past against the stars.
2. When the rocket falls back and the flight ends, the window disappears.
3. **RESET** hides the window; relaunching re-shows it.
4. A failed launch (e.g. thrust 50, mass 10 → never leaves the ground) shows **no** window.

---

### Task 4: VR camera monitor panel (new file)

**Files:**
- Create: `xr/VRCameraPanel.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `VRCameraPanel` class with:
  - `.mesh` — a `THREE.Group` (frame + screen planes), `.visible = false` by default.
  - `.renderTarget` — a `THREE.WebGLRenderTarget` (512×288); its `.texture` maps onto the screen plane.

- [ ] **Step 1: Create the panel class**

Create `xr/VRCameraPanel.js`:

```js
// xr/VRCameraPanel.js
import * as THREE from 'three';

// A non-interactive "monitor" panel that displays the rocket chase camera.
// Unlike VRPanel (canvas-backed), it is backed by a WebGLRenderTarget that the
// XRHandler renders the chase view into each frame. Not registered for
// raycasting — it has no interactive elements.
export class VRCameraPanel {
    constructor(worldW = 0.70, worldH = 0.394) {   // ~16:9
        this.renderTarget = new THREE.WebGLRenderTarget(512, 288);
        this.renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
        this.renderTarget.texture.minFilter = THREE.LinearFilter;
        this.renderTarget.texture.magFilter = THREE.LinearFilter;

        // Border frame — a slightly larger dark plane behind the live view.
        const frame = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW + 0.03, worldH + 0.03),
            new THREE.MeshBasicMaterial({ color: 0x0a1030, side: THREE.DoubleSide })
        );

        // Live view — plane textured from the render target.
        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW, worldH),
            new THREE.MeshBasicMaterial({
                map: this.renderTarget.texture,
                side: THREE.DoubleSide,
            })
        );
        screen.position.z = 0.001;   // avoid z-fighting with the frame

        this.mesh = new THREE.Group();
        this.mesh.add(frame);
        this.mesh.add(screen);
        this.mesh.visible = false;
    }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0. (Usage is wired in Task 5.)

---

### Task 5: XRHandler integration

**Files:**
- Modify: `xr/XRHandler.js` (import + create panel in `_createPanels`; add render/show/hide methods; hide in `resetPanels`)

**Interfaces:**
- Consumes: `VRCameraPanel` (Task 4) — `.mesh`, `.renderTarget`.
- Produces:
  - `xrHandler.cameraPanel` — the `VRCameraPanel` instance.
  - `xrHandler.showCamera()` / `xrHandler.hideCamera()` — toggle the monitor's visibility.
  - `xrHandler.renderCameraView(scene, chaseCamera)` — renders `scene` with `chaseCamera` into the monitor's render target.

- [ ] **Step 1: Import the panel**

In `xr/XRHandler.js`, after `import { VRResultPanel } from './VRResultPanel.js';` (currently line 8), add:

```js
import { VRCameraPanel } from './VRCameraPanel.js';
```

- [ ] **Step 2: Create the monitor panel above the HUD**

In `xr/XRHandler.js` `_createPanels()`, after the HUD panel block (after `this.scene.add(this.hudPanel.mesh);`, currently ~line 92), add:

```js
        // Rocket camera monitor — above the HUD; non-interactive, so it is
        // deliberately NOT added to _panels (excluded from raycasting).
        this.cameraPanel = new VRCameraPanel();
        this.cameraPanel.mesh.position.set(0, 0.35, -1.5);
        this.scene.add(this.cameraPanel.mesh);
```

- [ ] **Step 3: Add show/hide/render methods**

In `xr/XRHandler.js`, in the `// ── State updates ──` section, after `refreshHUD()` (currently ~line 240), add:

```js
    // ── Rocket camera monitor ──────────────────────────────────────────

    showCamera() { this.cameraPanel.mesh.visible = true; }
    hideCamera() { this.cameraPanel.mesh.visible = false; }

    /** Render the chase-camera view into the monitor panel's texture. */
    renderCameraView(scene, chaseCamera) {
        const rt = this.cameraPanel.renderTarget;
        chaseCamera.aspect = rt.width / rt.height;
        chaseCamera.updateProjectionMatrix();
        this.renderer.setRenderTarget(rt);
        this.renderer.render(scene, chaseCamera);
        this.renderer.setRenderTarget(null);
    }
```

- [ ] **Step 4: Hide the monitor on reset**

In `xr/XRHandler.js` `resetPanels()` (currently ~line 246), after `this.hideResults();`, add:

```js
        this.hideCamera();
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exits 0. (On-device behavior is verified in Task 6.)

---

### Task 6: VR render dispatch (main.js)

**Files:**
- Modify: `main.js` (extend `_showRocketCam`/`_hideRocketCam` to drive VR; add the render-target pass in `_animate`)

**Interfaces:**
- Consumes: `this.xr.showCamera()`, `this.xr.hideCamera()`, `this.xr.renderCameraView(scene, chaseCamera)` (Task 5); `this.scene.chaseCamera` (Task 1); the helpers from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Drive the VR monitor from the show/hide helpers**

In `main.js`, replace the `_showRocketCam()` and `_hideRocketCam()` methods (added in Task 3) with:

```js
    _showRocketCam() {
        if (this._rocketCamActive) return;
        this._rocketCamActive = true;
        if (this._rocketCamEl) this._rocketCamEl.style.display = 'block';
        this.xr.showCamera();
    }

    _hideRocketCam() {
        this._rocketCamActive = false;
        if (this._rocketCamEl) this._rocketCamEl.style.display = 'none';
        this.xr.hideCamera();
    }
```

- [ ] **Step 2: Add the render-target pass before the main render**

In `main.js` `_animate()`, locate the main render line `this.scene.renderer.render(this.scene.scene, this.scene.camera);` (the desktop inset block from Task 3 follows it). Immediately **before** that line, insert:

```js
        // VR monitor: render the chase view into its texture before the main
        // (headset) render. Desktop uses the scissor inset below instead.
        if (this._rocketCamActive && this.scene.renderer.xr.isPresenting) {
            this.xr.renderCameraView(this.scene.scene, this.scene.chaseCamera);
        }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Verify VR on-device (manual, headset required)**

Run: `npm run dev`, open on a WebXR headset, enter the immersive session. Set thrust > weight and launch.
Expected: on liftoff a monitor panel appears above the FLIGHT DATA panel showing the live chase view; it hides when the flight ends and on Reset/Next. (This render-to-texture-during-XR path cannot be validated without a headset — confirm here.)

---

## Self-Review

**Spec coverage:**
- Chase camera (child of `rocketGroup`, below/behind, looks up) → Task 1 Step 1. ✓
- Desktop scissor inset + CSS-px viewport caveat → Task 1 Step 2 (Global Constraints note). ✓
- `#rocket-cam` inside `#ui-container`, above HUD, default hidden → Task 2. ✓
- Lifecycle: show on `isLaunched && altitude > 0`, hide on flight-end + Reset/Next, failed launch shows nothing → Task 3 Steps 2–3, Step 6 verification. ✓
- VRCameraPanel (RT + plane, non-interactive) → Task 4. ✓
- XRHandler create/show/hide/render + hide on reset → Task 5. ✓
- Per-frame mode dispatch (RT before main render in XR; inset after in desktop) → Task 3 Step 3 + Task 6 Step 2. ✓
- Verification = manual run (no test harness) → each task's build gate + Tasks 3/6 manual steps. ✓

**Placeholder scan:** No TBD/TODO; all steps contain concrete code and exact insertion points. ✓

**Type consistency:** `chaseCamera`, `renderChaseInset(rect)`, `cameraPanel`, `renderTarget`, `showCamera()`, `hideCamera()`, `renderCameraView(scene, chaseCamera)`, `_rocketCamActive`, `_rocketCamEl`, `_showRocketCam()`, `_hideRocketCam()` — names match across producing and consuming tasks. ✓

**Note:** Per the standing instruction, no task commits; all changes are left uncommitted for the user.
