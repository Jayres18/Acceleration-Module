# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (HTTPS, all network interfaces)
npm run build    # production build
npm run preview  # preview production build
```

The dev server runs on HTTPS (required for WebXR) using a self-signed cert via `@vitejs/plugin-basic-ssl`. The Vite base path is `/acceleration/`.

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
