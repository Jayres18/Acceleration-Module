# Divergence from the main module

Forked from the Acceleration Module at commit `84822f9` (2026-09-24), with every
fix current as of that date.

## Intentional differences

- **No exam mode.** `api/ExamService.js` and `examLink.js` are not present, and
  `RocketApp.create()` simply builds a `ChallengeManager` and the app. There is
  no portal behind the server this is uploaded to. `target_*` URL parameters
  still work — they need no backend.
- **No trial flag.** The module gated this behind a compile-time `IS_TRIAL`.
  Here the project *is* the trial, so the quota, badge and ranges are simply how
  it behaves.
- **Relative base** (`./`) and output to `site/` rather than `dist/`, because a
  bare `dist/` in the parent's `.gitignore` matches at any depth and would
  silently untrack the committed build.
- **No `/api` proxy** in `vite.config.js`, and no `BASE_PATH` handling.
- **Not copied:** `dev/checkExamTargets.js`, `dev/xr-smoke.html`,
  `dev/xrDiagnostics.js`, `HANDOFF.md`, `CLAUDE.md`.

## Fixes this copy must never lose

All three are XR-only: they cannot be reproduced on a desktop, and getting any
of them wrong produces a headset that looks broken in a way nothing else
explains. Two are guarded by tests that fail loudly — keep those tests.

1. **Do not `delete window.XRWebGLBinding`** (`scenes/MainScene.js`). VRButton
   requests the `layers` feature and a Quest 3 grants it; without the binding
   three.js calls `updateRenderState({ baseLayer })`, which the spec forbids on
   such a session. The frame loop never starts and the headset shows pure black.
   Guarded by `scenes/MainScene.test.js`.
2. **`renderCameraView` must restore the previous render target, never `null`,
   and must disable `xr.enabled` around its render** (`xr/XRHandler.js`).
   `null` sends the rest of the frame to the canvas and freezes the headset on
   the last image; leaving `xr.enabled` on makes three.js substitute the headset
   camera, so the monitor shows the viewer's own view instead of the chase view.
   Both guarded by `xr/XRHandler.test.js`.
3. **The XR reference space must be `local`** (`xr/XRHandler.js`). Every panel
   position is an offset from the eye; with the default `local-floor` the whole
   layout lands at the student's feet, outside the field of view.

## Porting changes from the module

There is no automatic sync. When the module changes something shared — physics,
scene, panels, audio — bring it across by hand and re-run `npm test` here.
