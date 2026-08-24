# Rocket Perspective Camera — Design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan

## Summary

Add a rocket-mounted **chase camera** and a picture-in-picture "window"
showing its live view. The window appears the moment the rocket lifts off the
ground and hides when the flight ends or is reset. It is delivered in both
runtime modes:

- **Desktop (DOM):** a framed picture-in-picture inset rendered into a
  scissored sub-region of the main WebGL canvas, positioned directly **above**
  the flight-data HUD.
- **VR (3D panels):** a non-interactive "monitor" plane floating **above** the
  FLIGHT DATA panel, textured from a render target.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What does the camera show? | **Chase cam** — mounted below/behind the rocket, angled up at the body. Shows the rocket, exhaust plume, and starfield. |
| Which modes? | **Both** desktop and VR (preserves the project's desktop↔XR duality). |
| When does the window appear/disappear? | **On liftoff** (`isLaunched && altitude > 0`) → **hide on land or Reset/Next**. Failed launches (thrust ≤ weight, never leaves the ground) show nothing. |
| Desktop placement | **Above the HUD**, in a top-left column (HUD shifts down slightly). |

## Context / constraints discovered

- The scene environment (ground, pad, gantry) is **commented out** in
  `MainScene._initEnvironment`. The only scene contents are the starfield
  (radius ~450), the rocket GLTF, and exhaust particles. Therefore the chase
  view's sense of motion comes primarily from the **exhaust plume** streaming
  past the camera and slight star parallax — not from receding ground.
- The rocket only **translates straight up** (no rotation). A camera parented
  to `rocketGroup` keeps the rocket steady in frame automatically.
- Exhaust particles spawn at the rocket base each thrusting frame with a
  downward velocity and ~0.5 s lifetime — they stream downward, toward a
  camera placed below the rocket.
- Desktop and VR rendering are **mutually exclusive** at runtime
  (`renderer.xr.isPresenting`), so only one extra render pass runs per frame.
- The thrust/weight `ArrowHelper`s are children of `rocketGroup` and will be
  visible in the chase view. Kept by default (educational); can be excluded
  later via camera layers if undesired.

## Rejected approaches

- **Desktop via render-to-texture → 2D canvas blit:** requires per-frame CPU
  pixel readback (slow) or a second GL context (cannot share the scene).
  Rejected in favor of the scissored-viewport technique.
- **VR via scissor into the headset framebuffer:** not possible; the XR device
  controls that framebuffer. Render-to-texture on a panel mesh is the correct
  approach.

## Components

### 1. Chase camera — `scenes/MainScene.js`

- Add `this.chaseCamera = new THREE.PerspectiveCamera(60, aspect, 0.05, 1000)`.
- Add it as a **child of `rocketGroup`** with a local offset below/behind the
  rocket (≈ `(0.8, -1.2, 2.2)`), oriented to look at the rocket mid-body
  (≈ local `(0, 1.0, 0)`). Because `rocketGroup` only translates, the relative
  framing is preserved for the whole flight; no per-frame camera transform
  update is needed.
- Expose it as `this.chaseCamera`.
- Add `renderChaseInset(rect)` (see Component 2).

### 2. Desktop window — `index.html`, `styles/main.css`, `MainScene.renderChaseInset(rect)`

- **Markup:** a `#rocket-cam` element added **inside `#ui-container`** (so the
  existing XR hide of `#ui-container` also hides it). It contains a styled
  border and a "ROCKET CAM" label; its center is transparent so the WebGL
  pixels show through. Default `display: none`.
- **Layout:** `#rocket-cam` and `#hud` are stacked in a top-left column with
  the cam **above** the HUD. Roughly 16:9, modest size (e.g. ~240×135 CSS px).
- **Render:** `MainScene.renderChaseInset(rect)` runs each frame while active:
  1. Convert the element's `getBoundingClientRect()` to WebGL viewport coords
     (origin bottom-left), multiplying by `renderer.getPixelRatio()`:
     `x = rect.left * pr`, `y = (canvasCssHeight - rect.bottom) * pr`,
     `w = rect.width * pr`, `h = rect.height * pr`.
  2. `chaseCamera.aspect = w / h; chaseCamera.updateProjectionMatrix();`
  3. Enable scissor test, set scissor + viewport to that box,
     `renderer.render(scene, chaseCamera)` (autoClear clears only the scissor
     region to the transparent clear color, then draws the chase view).
  4. Restore full viewport + scissor and disable the scissor test so the next
     frame's main render is unaffected.
- Called **after** the main render in `_animate` so it overlays.

### 3. VR monitor — new `xr/VRCameraPanel.js`, `xr/XRHandler.js`

- **`VRCameraPanel`** (lightweight; does NOT extend the canvas-based
  `VRPanel`):
  - Owns a `THREE.WebGLRenderTarget` (~512×288, 16:9).
  - `mesh`: a `THREE.PlaneGeometry` with a `MeshBasicMaterial` whose `map` is
    the render target's texture, plus a thin border frame (a slightly larger
    dark backing plane) and an optional small "ROCKET CAM" title.
  - Exposes `renderTarget` and `mesh`.
- **`XRHandler`:**
  - Creates `this.cameraPanel = new VRCameraPanel()`, positioned above the HUD
    panel (≈ `(0, 0.35, -1.5)`), `mesh.visible = false`, added to the scene but
    **not** to `_panels` (non-interactive, excluded from raycasting).
  - `showCamera()` / `hideCamera()` toggle `cameraPanel.mesh.visible`.
  - `renderCameraView(scene, chaseCamera)`: sets the chase camera aspect to the
    RT's aspect, then
    `renderer.setRenderTarget(rt); renderer.render(scene, chaseCamera);
     renderer.setRenderTarget(null);`.
  - `resetPanels()` also hides the camera panel.

### 4. Lifecycle — `main.js`

- Add `this._rocketCamActive = false`.
- In `_animate`:
  - Compute `lifted = state.isLaunched && state.altitude > 0`.
  - If `lifted && !this._rocketCamActive` → `this._showRocketCam()`.
  - In the existing flight-end block (`wasLaunched && !state.isLaunched`) →
    `this._hideRocketCam()`.
  - **Render dispatch:**
    - `if (this._rocketCamActive && renderer.xr.isPresenting)
       this.xr.renderCameraView(scene, chaseCamera)` — **before** the main
      render.
    - `if (this._rocketCamActive && !renderer.xr.isPresenting)
       this.scene.renderChaseInset(rect)` — **after** the main render.
- `_showRocketCam()`: set flag true; set `#rocket-cam` display; call
  `this.xr.showCamera()`.
- `_hideRocketCam()`: set flag false; hide `#rocket-cam`; call
  `this.xr.hideCamera()`.
- `onReset` and `onNext` call `this._hideRocketCam()`.

## Data flow

```
PhysicsEngine.getState() ──altitude──> main._animate
                                         │ lifted? show/hide
                                         ▼
            ┌──────────── _rocketCamActive ────────────┐
   isPresenting?                                   isPresenting?
        no                                              yes
        ▼                                                ▼
MainScene.renderChaseInset(rect)            XRHandler.renderCameraView(scene, cam)
  scissor pass on main canvas                 render → WebGLRenderTarget
        │                                                │
        ▼                                                ▼
   #rocket-cam DOM frame                       VRCameraPanel plane (RT texture)
```

The chase camera itself is a child of `rocketGroup`; both render paths render
`scene` with `chaseCamera`.

## Edge cases / error handling

- **Window resize:** desktop reads the element rect every frame, so the inset
  follows layout automatically; the VR render target is fixed size.
- **Reset / Next:** hide the window, clear `_rocketCamActive`. The chase camera
  resets with `rocketGroup`.
- **Failed launch:** altitude never exceeds 0, so the window never appears.
- **Entering/leaving VR mid-flight:** the per-frame `isPresenting` check selects
  the correct render path; `#rocket-cam` is inside `#ui-container` (auto-hidden
  in XR) and the VR panel visibility mirrors `_rocketCamActive`.
- **Render-to-texture during an active XR frame:** standard technique, but
  cannot be validated without a headset — flagged for on-device testing.

## Verification

No automated test harness exists in this repo (vanilla JS, visual app), so
verification is a manual `npm run dev` session:

1. Launch with thrust > weight → window appears above the HUD on liftoff,
   showing the rocket + streaming exhaust against stars.
2. Flight ends (rocket lands) → window disappears.
3. Reset / Next → window disappears; relaunch re-shows it.
4. Failed launch (thrust ≤ weight) → no window appears.
5. VR (on-device): monitor panel appears above the FLIGHT DATA panel with the
   live chase view; hides on the same lifecycle.

## Files touched

- `scenes/MainScene.js` — chase camera + `renderChaseInset()`.
- `index.html` — `#rocket-cam` window markup inside `#ui-container`.
- `styles/main.css` — cam window styling + top-left column layout.
- `xr/VRCameraPanel.js` — **new** textured monitor panel.
- `xr/XRHandler.js` — create/show/hide camera panel + `renderCameraView()`.
- `main.js` — lifecycle flags, show/hide, per-frame render dispatch.

## Notes

- Per the user's standing instruction, **do not commit** — this spec is left
  uncommitted in the working tree.
