# Challenge Mode Design

**Date:** 2026-05-20
**Feature:** Interactive Quiz / Challenge Mode
**Status:** Approved

## Overview

When a teacher encodes challenge targets in the page URL, the sim enters "Challenge Mode." Students see their target metrics before launch, attempt to hit them by adjusting thrust and mass, then receive per-target pass/fail feedback after each flight. Attempt count is tracked across resets within the same session.

Challenge mode is entirely opt-in — when no URL params are present, the sim behaves exactly as before.

---

## Architecture

### New module: `ChallengeManager.js`

Single source of truth for all challenge state. Pure logic — no DOM, no Three.js.

```js
class ChallengeManager {
    constructor()        // parses URL params; sets this.isActive, this.targets, this.attemptCount
    evaluate(results)    // compares results vs targets, increments attemptCount, returns score array
    reset()              // called on each reset — preserves attemptCount
}
```

`this.targets` is an array of `{ label, key, value }` objects — one per URL param target.

`evaluate(results)` returns:
```js
[{ label, target, actual, passed, delta }]
```

`RocketApp` instantiates `ChallengeManager` once and passes it to both `UIManager` and `XRHandler`.

### URL Params (stub — names TBD)

Param parsing lives entirely in `ChallengeManager`. The actual param names will be supplied by the teacher/project owner and added to `ChallengeManager` constructor only — no other file needs to change when params are finalized.

Placeholder:
```js
// TODO: replace with actual param names when provided
// e.g. const targetVelocity = params.get('target_velocity');
```

### Data flow

1. **Page load** — `ChallengeManager` parses URL params. `UIManager` and `XRHandler` check `isActive` and render challenge card if true.
2. **Pre-launch** — Student reads target card, adjusts sliders, launches. Sim runs normally.
3. **Post-flight** — `RocketApp` calls `challengeManager.evaluate(results)`, passes the returned score array + `attemptCount` to both `UIManager.showResults()` and `vrResultPanel.showResults()`.
4. **Reset** — `onReset` fires → `ChallengeManager.reset()` called (attempt count preserved) → challenge card remains visible for next attempt.

---

## Desktop UI (`UIManager`)

### Challenge card (`#challenge-card`)

- Created dynamically by `UIManager` when `challengeManager.isActive` is true
- Injected above the controls inside `#ui-container`
- Remains visible during flight for reference
- Lists each target: e.g. *"Target Max Velocity: 50 m/s"*
- Removed from DOM when not in challenge mode — no impact on normal layout

### Result panel (`#result-panel`) extension

A "Challenge Results" section is appended below the existing flight stats when in challenge mode. Each target row shows:
- Green ✓ or red ✗
- Target value and actual value
- Delta: e.g. *"You reached 44.2 m/s — 5.8 short"*

Attempt count shown at the bottom: *"Attempt 3"*

The close button behavior is unchanged — triggers `onReset` as normal.

---

## VR UI

### VRHUDPanel extension

When in challenge mode, a "CHALLENGE" section is appended below the 2×2 flight data grid. Each target is listed in amber text for visual distinction from live flight data. Static during flight — for reference only.

### VRResultPanel extension

After a flight, the existing stats section is followed by a "CHALLENGE SCORE" block rendered on the canvas. Each target gets a ✓/✗ with actual vs. target values. Attempt count shown at the bottom.

`XRHandler` passes the same score array from `ChallengeManager.evaluate()` to `VRResultPanel.showResults()` — no duplication of comparison logic.

---

## Files Changed

| File | Change |
|---|---|
| `ChallengeManager.js` | **New** — URL param parsing, target storage, evaluation logic |
| `main.js` | Instantiate `ChallengeManager`; pass to `UIManager` + `XRHandler`; call `evaluate()` before `showResults()` |
| `ui/UIManager.js` | Render `#challenge-card`; extend `showResults()` with challenge score section |
| `xr/XRHandler.js` | Accept `ChallengeManager`; pass targets to `VRHUDPanel`; pass score to `VRResultPanel` |
| `xr/VRHUDPanel.js` | Render challenge targets section when in challenge mode |
| `xr/VRResultPanel.js` | Render challenge score block in `showResults()` |
| `index.html` | No changes required |

---

## Out of Scope

- Persistent scoring across page reloads (no backend, no localStorage)
- Hint system (deferred — needs real teacher param names first)
- Teacher portal UI (URL params are the input mechanism)
- Multiplayer or competitive features
