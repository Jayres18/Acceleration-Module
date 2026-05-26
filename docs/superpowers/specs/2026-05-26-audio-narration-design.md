# Audio Narration & Sound Effects Design
**Date:** 2026-05-26  
**Module:** Acceleration Module (Newton's 2nd Law Rocket Sim)  
**Status:** Approved

---

## Overview

Add pre-recorded audio narration and sound effects to the Acceleration Module to improve student engagement and learning reinforcement. Narration is provided as pre-recorded audio files by the instructor. Sound effects are sourced from royalty-free libraries. Both desktop and VR (WebXR) modes are supported.

---

## Architecture

### New file: `audio/AudioManager.js`

A single class instantiated once in `RocketApp` and passed to no subsystems directly — `RocketApp` calls it from its own callbacks and animation loop.

**Responsibilities:**
- Preload all narration and SFX audio files at startup via `HTMLAudioElement`
- Expose `play(eventKey)` — stops current narration clip, plays new one
- Expose `playLoop(eventKey)` — starts a looping audio clip (engine rumble)
- Expose `stopLoop()` — stops the looping clip
- Expose `stopAll()` — silences all audio immediately
- Expose `hasPlayed(eventKey)` — returns true if this clip fired this flight
- Expose `reset()` — clears `_played` set, stops all audio

**Browser audio policy:**  
Browsers block audio before a user gesture. The LAUNCH button click serves as the first gesture. Intro/pre-launch narration is attempted on load; if blocked, it plays silently (no crash, no error shown to student).

**VR compatibility:**  
`AudioManager` is mode-agnostic. Web Audio API works inside WebXR sessions. No special handling needed.

---

## File & Folder Structure

```
audio/
  AudioManager.js          ← new class
  narration/
    intro.mp3
    pre-launch.mp3
    countdown.mp3
    liftoff.mp3
    milestone-100m.mp3
    milestone-500m.mp3
    milestone-1000m.mp3
    fuel-warning-50.mp3
    fuel-warning-25.mp3
    fuel-empty.mp3
  sfx/
    engine-loop.mp3
    engine-cutoff.mp3
    countdown-beep.mp3
    liftoff-rumble.mp3
    altitude-chime.mp3
    fuel-alarm.mp3
    launch-click.mp3
    reset-click.mp3
```

---

## Narration Event Keys & Scripts

| Event Key | Trigger | Script |
|---|---|---|
| `intro` | App loads | *"Welcome to the Acceleration Module. In this simulation, you will explore Newton's Second Law: Force equals mass times acceleration."* |
| `pre-launch` | After `intro` ends | *"Before launching, adjust the thrust and mass sliders. Notice how changing these values affects the expected acceleration."* |
| `countdown` | LAUNCH button pressed | *"Launch sequence initiated. Three… two… one…"* |
| `liftoff` | After `countdown` ends | *"Liftoff! The rocket is accelerating upward. Watch how the net force determines its rate of climb."* |
| `milestone-100m` | Altitude ≥ 100 m (once per flight) | *"One hundred meters. The rocket is gaining speed as thrust exceeds the force of gravity."* |
| `milestone-500m` | Altitude ≥ 500 m (once per flight) | *"Five hundred meters. Acceleration remains constant as long as thrust and mass are unchanged."* |
| `milestone-1000m` | Altitude ≥ 1000 m (once per flight) | *"One kilometer! Excellent flight. The relationship between force, mass, and acceleration is clearly demonstrated."* |
| `fuel-warning-50` | Fuel ≤ 50% (once per flight) | *"Fuel at fifty percent. Maintain observation of the acceleration values."* |
| `fuel-warning-25` | Fuel ≤ 25% (once per flight) | *"Warning — fuel at twenty-five percent. Engine cutoff approaching."* |
| `fuel-empty` | Fuel = 0% (once per flight) | *"Engine cutoff. The rocket is now in free flight. Observe how acceleration changes without thrust."* |

---

## Sound Effects

| SFX Key | Trigger | Description | Source |
|---|---|---|---|
| `sfx-engine-loop` | While thrusting (looped) | Deep rocket engine rumble, loops while fuel > 0 and rocket is launched | freesound.org — *"rocket engine loop"* |
| `sfx-engine-cutoff` | Fuel hits 0% | Sharp engine sputter/cutoff | freesound.org — *"engine stop"* |
| `sfx-countdown-beep` | Each count (3, 2, 1) | Short electronic beep, plays 3× during countdown | freesound.org — *"countdown beep"* |
| `sfx-liftoff-rumble` | At liftoff | Short low-frequency rumble + whoosh | freesound.org — *"rocket liftoff"* |
| `sfx-altitude-chime` | Each altitude milestone | Soft ascending chime or ping | freesound.org — *"notification chime"* |
| `sfx-fuel-alarm` | Fuel ≤ 25% | Short warning beep, plays once | freesound.org — *"warning beep"* |
| `sfx-launch-click` | LAUNCH button pressed | Satisfying mechanical click | freesound.org — *"button click"* |
| `sfx-reset-click` | RESET button pressed | Lighter click or swoosh | freesound.org — *"ui click"* |

**Note:** SFX and narration play on separate channels — they do not interrupt each other. The engine loop runs independently from all narration clips.

---

## Integration Points in Existing Code

### `main.js` — `RocketApp`

| Location | Change |
|---|---|
| Constructor | Instantiate `AudioManager`; attempt `play('intro')`, chain `pre-launch` via `audio.onended` |
| `onLaunch` callback | Play `sfx-launch-click`, then `play('countdown')`; on `countdown.onended` → `play('liftoff')` + `playLoop('sfx-engine-loop')` + play `sfx-liftoff-rumble` |
| `onReset` callback | Call `audioManager.reset()`; play `sfx-reset-click`; replay `pre-launch` |
| `_animate()` loop | Check physics state each frame against milestone thresholds; use `hasPlayed()` guard so each fires once per flight |

### `_animate()` milestone check logic

```js
const { altitude, fuel, isLaunched } = this._physics.getState();

if (isLaunched) {
  if (altitude >= 100  && !this._audio.hasPlayed('milestone-100m'))  { this._audio.play('milestone-100m');  this._audio.playSfx('sfx-altitude-chime'); }
  if (altitude >= 500  && !this._audio.hasPlayed('milestone-500m'))  { this._audio.play('milestone-500m');  this._audio.playSfx('sfx-altitude-chime'); }
  if (altitude >= 1000 && !this._audio.hasPlayed('milestone-1000m')) { this._audio.play('milestone-1000m'); this._audio.playSfx('sfx-altitude-chime'); }
  if (fuel <= 50 && !this._audio.hasPlayed('fuel-warning-50')) { this._audio.play('fuel-warning-50'); }
  if (fuel <= 25 && !this._audio.hasPlayed('fuel-warning-25')) { this._audio.play('fuel-warning-25'); this._audio.playSfx('sfx-fuel-alarm'); }
  if (fuel <= 0  && !this._audio.hasPlayed('fuel-empty'))      { this._audio.play('fuel-empty'); this._audio.stopLoop(); this._audio.playSfx('sfx-engine-cutoff'); }
}
```

### Files NOT modified
- `PhysicsEngine.js` — no changes
- `UIManager.js` — no changes
- `XRHandler.js` / VR panels — no changes
- `index.html` — no changes

---

## AudioManager API Summary

```js
class AudioManager {
  constructor()                  // preloads all audio files
  play(eventKey)                 // stop current narration, play new clip
  playSfx(eventKey)              // play a one-shot SFX (does not interrupt narration)
  playLoop(eventKey)             // start looping SFX (engine rumble)
  stopLoop()                     // stop looping SFX
  stopAll()                      // stop all audio
  hasPlayed(eventKey)            // true if this key fired this flight
  reset()                        // clear _played set, stop all audio
}
```

---

## Out of Scope (this version)
- Quiz answer narration
- Flight results narration
- Challenge mode narration
- Volume controls / mute button (can be added later)
- Narration in languages other than English
