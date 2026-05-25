# Challenge Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL-param-driven challenge mode where teachers encode target flight metrics and students get per-target pass/fail feedback after each launch.

**Architecture:** A new `ChallengeManager` module parses URL params, stores targets, and evaluates flight results. Both `UIManager` (DOM) and `XRHandler` (VR) receive it at construction, render targets before launch, and display the score returned by `evaluate()` after each flight.

**Tech Stack:** Vanilla JS ES modules, Three.js canvas-texture VR panels, DOM manipulation — no framework.

---

## File Map

| File | Change |
|---|---|
| `ChallengeManager.js` | **New** — URL param parsing, target storage, `evaluate()`, `reset()` |
| `styles/main.css` | Add challenge card + challenge score CSS |
| `index.html` | Add `<div id="challenge-results">` inside `.result-content` |
| `ui/UIManager.js` | Accept `challengeManager`; build challenge card; extend `showResults` + `resetUI` |
| `xr/VRHUDPanel.js` | Accept `challengeManager`; size canvas dynamically; render targets section |
| `xr/VRResultPanel.js` | Accept `challengeManager`; size canvas dynamically; render score block |
| `xr/XRHandler.js` | Accept `challengeManager`; pass to VR panels; forward score in `showResults` |
| `main.js` | Instantiate `ChallengeManager`; pass to `UIManager` + `XRHandler`; call `evaluate()` on flight end |

---

## Task 1: ChallengeManager.js

**Files:**
- Create: `ChallengeManager.js`

- [ ] **Step 1: Create ChallengeManager.js**

```js
// URL param names are stubs — replace values in TARGETS_MAP when provided by teacher
const TARGETS_MAP = [
    { param: 'target_max_velocity',  key: 'maxVelocity',     label: 'Max Velocity',     unit: 'm/s',  decimals: 2 },
    { param: 'target_peak_altitude', key: 'peakAltitude',    label: 'Peak Altitude',    unit: 'm',    decimals: 2 },
    { param: 'target_avg_accel',     key: 'avgAcceleration', label: 'Avg Acceleration', unit: 'm/s²', decimals: 2 },
    { param: 'target_flight_time',   key: 'flightTime',      label: 'Flight Time',      unit: 's',    decimals: 2 },
];

export class ChallengeManager {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        this.targets = [];

        for (const def of TARGETS_MAP) {
            const raw = params.get(def.param);
            if (raw !== null) {
                const value = parseFloat(raw);
                if (!isNaN(value)) {
                    this.targets.push({ ...def, value });
                }
            }
        }

        this.isActive = this.targets.length > 0;
        this.attemptCount = 0;
    }

    // Returns array of { label, unit, decimals, target, actual, passed, delta }
    evaluate(results) {
        this.attemptCount++;
        return this.targets.map(t => {
            const actual = results[t.key] ?? 0;
            const passed = actual >= t.value;
            const delta  = actual - t.value;
            return { label: t.label, unit: t.unit, decimals: t.decimals, target: t.value, actual, passed, delta };
        });
    }

    // Called on every reset — intentionally preserves attemptCount
    reset() {}
}
```

- [ ] **Step 2: Verify in browser console**

Open `http://localhost:5173/acceleration/?target_max_velocity=50&target_peak_altitude=100`.

In DevTools console:
```js
import('/acceleration/ChallengeManager.js').then(m => {
    const cm = new m.ChallengeManager();
    console.log(cm.isActive);       // true
    console.log(cm.targets.length); // 2
    const score = cm.evaluate({ maxVelocity: 44.2, peakAltitude: 120, avgAcceleration: 5, flightTime: 8, launchForce: 0, rocketMass: 0, distanceTraveled: 0 });
    console.log(score[0].passed);   // false (44.2 < 50)
    console.log(score[1].passed);   // true  (120 >= 100)
    console.log(cm.attemptCount);   // 1
});
```

- [ ] **Step 3: Commit**

```bash
git add ChallengeManager.js
git commit -m "feat: add ChallengeManager with URL param parsing and evaluate()"
```

---

## Task 2: CSS + index.html shell

**Files:**
- Modify: `styles/main.css`
- Modify: `index.html`

- [ ] **Step 1: Add challenge CSS to styles/main.css**

Append at the end of `styles/main.css`:

```css
/* ── Challenge Card ─────────────────────────────────────────────── */

#challenge-card {
    border-color: #ffaa22;
    align-self: flex-end;
    margin-bottom: 10px;
}

#challenge-card h3 {
    color: #ffaa22;
}

.challenge-target {
    font-size: 0.85rem;
    color: #ffcc66;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255, 170, 34, 0.2);
}

#attempt-count {
    font-size: 0.8rem;
    color: #888899;
    margin-top: 8px;
}

/* ── Challenge Score in Result Panel ───────────────────────────── */

#challenge-results {
    margin-top: 16px;
}

.challenge-divider {
    border: none;
    border-top: 1px solid rgba(255, 170, 34, 0.3);
    margin: 0 0 10px;
}

.challenge-score-title {
    color: #ffaa22;
    text-align: center;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 10px;
}

.challenge-score-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
}

.challenge-score-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(34, 85, 238, 0.15);
    font-size: 0.82rem;
}

.challenge-score-row.passed .challenge-icon { color: #44ff88; font-weight: bold; }
.challenge-score-row.failed .challenge-icon { color: #ff5544; font-weight: bold; }

.challenge-score-label {
    flex: 1;
    color: #8899cc;
}

.challenge-score-values {
    color: #ffffff;
    font-family: 'Courier New', monospace;
    font-size: 0.8rem;
}

.challenge-delta {
    color: #6677aa;
    font-size: 0.75rem;
}

.attempt-display {
    text-align: center;
    color: #6677aa;
    font-size: 0.8rem;
    margin-top: 4px;
}
```

- [ ] **Step 2: Add challenge-results container to index.html**

In `index.html`, insert `<div id="challenge-results"></div>` between `.result-grid` and `#result-close-btn`:

```html
        </div><!-- /.result-grid -->
        <div id="challenge-results"></div>
        <button id="result-close-btn">CLOSE</button>
```

Full `.result-content` block after the change:
```html
    <div id="result-panel">
        <div class="result-content">
            <h2>FLIGHT RESULTS</h2>
            <div class="result-grid">
                <div class="result-row">
                    <span class="result-label">Launch Force</span>
                    <span class="result-value" id="res-launch-force">—</span>
                </div>
                <div class="result-row">
                    <span class="result-label">Rocket Mass</span>
                    <span class="result-value" id="res-rocket-mass">—</span>
                </div>
                <div class="result-row">
                    <span class="result-label">Max Velocity</span>
                    <span class="result-value" id="res-max-velocity">—</span>
                </div>
                <div class="result-row">
                    <span class="result-label">Avg Acceleration</span>
                    <span class="result-value" id="res-avg-accel">—</span>
                </div>
                <div class="result-row">
                    <span class="result-label">Peak Altitude</span>
                    <span class="result-value" id="res-peak-altitude">—</span>
                </div>
                <div class="result-row">
                    <span class="result-label">Flight Time</span>
                    <span class="result-value" id="res-flight-time">—</span>
                </div>
                <div class="result-row">
                    <span class="result-label">Distance Traveled</span>
                    <span class="result-value" id="res-distance">—</span>
                </div>
            </div>
            <div id="challenge-results"></div>
            <button id="result-close-btn">CLOSE</button>
        </div>
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add styles/main.css index.html
git commit -m "feat: add challenge mode CSS and result panel placeholder"
```

---

## Task 3: UIManager.js — challenge card + result section

**Files:**
- Modify: `ui/UIManager.js`

- [ ] **Step 1: Replace UIManager.js with the updated version**

```js
export class UIManager {
    constructor(callbacks, challengeManager = null) {
        this.callbacks = callbacks;
        this.challengeManager = challengeManager;
        this.initElements();
        this.initEvents();
        this.initGraph();
        this._buildChallengeCard();
    }

    initElements() {
        this.velocityVal = document.getElementById('velocity-val');
        this.accelVal    = document.getElementById('accel-val');
        this.altitudeVal = document.getElementById('altitude-val');
        this.fuelVal     = document.getElementById('fuel-val');

        this.thrustSlider = document.getElementById('thrust-slider');
        this.thrustLabel  = document.getElementById('thrust-label');
        this.massSlider   = document.getElementById('mass-slider');
        this.massLabel    = document.getElementById('mass-label');
        this.timeSlider   = document.getElementById('time-slider');
        this.timeLabel    = document.getElementById('time-label');

        this.launchBtn = document.getElementById('launch-btn');
        this.resetBtn  = document.getElementById('reset-btn');

        this.quizContainer = document.getElementById('quiz-container');
        this.quizOpts      = document.querySelectorAll('.quiz-opt');

        this.graphCanvas = document.getElementById('physics-graph');
        this.graphCtx    = this.graphCanvas.getContext('2d');

        this.resultPanel     = document.getElementById('result-panel');
        this.resLaunchForce  = document.getElementById('res-launch-force');
        this.resRocketMass   = document.getElementById('res-rocket-mass');
        this.resMaxVelocity  = document.getElementById('res-max-velocity');
        this.resAvgAccel     = document.getElementById('res-avg-accel');
        this.resPeakAltitude = document.getElementById('res-peak-altitude');
        this.resFlightTime   = document.getElementById('res-flight-time');
        this.resDistance     = document.getElementById('res-distance');
        this.resultCloseBtn  = document.getElementById('result-close-btn');
        this.challengeResults = document.getElementById('challenge-results');
    }

    initEvents() {
        this.thrustSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.thrustLabel.textContent = val;
            this.callbacks.onThrustChange(val);
        });

        this.massSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.massLabel.textContent = val;
            this.callbacks.onMassChange(val);
        });

        this.timeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.timeLabel.textContent = val.toFixed(1);
            this.callbacks.onTimeChange(val);
        });

        this.launchBtn.addEventListener('click', () => {
            this.callbacks.onLaunch();
            this.launchBtn.disabled = true;
        });

        this.resetBtn.addEventListener('click', () => {
            this.callbacks.onReset();
            this.launchBtn.disabled = false;
        });

        this.resultCloseBtn.addEventListener('click', () => {
            this.callbacks.onReset();
            this.launchBtn.disabled = false;
        });

        this.quizOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                const isCorrect = opt.getAttribute('data-correct') === 'true';
                if (isCorrect) {
                    opt.style.background = 'green';
                    alert('Correct! Acceleration is inversely proportional to mass (a = F/m).');
                } else {
                    opt.style.background = 'red';
                    alert('Try again. Think about Newton\'s Second Law.');
                }
            });
        });
    }

    initGraph() {
        this.graphData = [];
        this.maxDataPoints = 100;
    }

    _buildChallengeCard() {
        if (!this.challengeManager?.isActive) return;

        const card = document.createElement('div');
        card.id = 'challenge-card';
        card.className = 'panel';

        const targets = this.challengeManager.targets
            .map(t => `<div class="challenge-target">≥ ${t.value.toFixed(t.decimals)} ${t.unit} — ${t.label}</div>`)
            .join('');

        card.innerHTML = `
            <h3>Challenge Targets</h3>
            ${targets}
            <div id="attempt-count">Attempt: 0</div>
        `;

        const controls = document.getElementById('controls');
        controls.parentNode.insertBefore(card, controls);

        this.challengeCard     = card;
        this.attemptCountEl    = card.querySelector('#attempt-count');
    }

    updateHUD(state) {
        this.velocityVal.textContent = state.velocity.toFixed(2);
        this.accelVal.textContent    = state.acceleration.toFixed(2);
        this.altitudeVal.textContent = state.altitude.toFixed(2);
        this.fuelVal.textContent     = state.fuel.toFixed(1);

        if (state.isLaunched) {
            this.quizContainer.style.display = 'block';
            this.graphData.push(state.acceleration);
            if (this.graphData.length > this.maxDataPoints) this.graphData.shift();
            this.drawGraph();
        }
    }

    drawGraph() {
        const ctx    = this.graphCtx;
        const width  = this.graphCanvas.width;
        const height = this.graphCanvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#00f';
        ctx.lineWidth   = 2;
        ctx.beginPath();

        const step = width / this.maxDataPoints;
        for (let i = 0; i < this.graphData.length; i++) {
            const x = i * step;
            const y = height - ((this.graphData[i] + 10) / 30) * height;
            if (i === 0) ctx.moveTo(x, y);
            else         ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font      = '10px Arial';
        ctx.fillText('Accel vs Time', 5, 12);
    }

    showResults(results, challengeScore = null) {
        this.resLaunchForce.textContent  = `${results.launchForce.toFixed(1)} N`;
        this.resRocketMass.textContent   = `${results.rocketMass.toFixed(1)} kg`;
        this.resMaxVelocity.textContent  = `${results.maxVelocity.toFixed(2)} m/s`;
        this.resAvgAccel.textContent     = `${results.avgAcceleration.toFixed(2)} m/s²`;
        this.resPeakAltitude.textContent = `${results.peakAltitude.toFixed(2)} m`;
        this.resFlightTime.textContent   = `${results.flightTime.toFixed(2)} s`;
        this.resDistance.textContent     = `${results.distanceTraveled.toFixed(2)} m`;

        if (challengeScore) this._renderChallengeScore(challengeScore);

        this.resultPanel.classList.add('visible');
    }

    _renderChallengeScore(challengeScore) {
        const rows = challengeScore.map(r => {
            const icon  = r.passed ? '✓' : '✗';
            const sign  = r.delta >= 0 ? '+' : '';
            const delta = `(${sign}${r.delta.toFixed(r.decimals)})`;
            return `
                <div class="challenge-score-row ${r.passed ? 'passed' : 'failed'}">
                    <span class="challenge-icon">${icon}</span>
                    <span class="challenge-score-label">${r.label}</span>
                    <span class="challenge-score-values">
                        ${r.actual.toFixed(r.decimals)} / ${r.target.toFixed(r.decimals)} ${r.unit}
                        <span class="challenge-delta">${delta}</span>
                    </span>
                </div>`;
        }).join('');

        this.challengeResults.innerHTML = `
            <hr class="challenge-divider">
            <p class="challenge-score-title">Challenge Score</p>
            <div class="challenge-score-grid">${rows}</div>
            <div class="attempt-display">Attempt ${this.challengeManager.attemptCount}</div>
        `;
    }

    hideResults() {
        this.resultPanel.classList.remove('visible');
    }

    resetUI() {
        this.graphData = [];
        this.drawGraph();
        this.launchBtn.disabled = false;
        this.quizContainer.style.display = 'none';
        this.quizOpts.forEach(opt => opt.style.background = '#00f');
        this.hideResults();
        this.challengeResults.innerHTML = '';
        if (this.attemptCountEl && this.challengeManager) {
            this.attemptCountEl.textContent = `Attempt: ${this.challengeManager.attemptCount}`;
        }
    }
}
```

- [ ] **Step 2: Verify in browser (no URL params)**

Open `http://localhost:5173/acceleration/`. Launch the rocket. Confirm:
- No challenge card appears
- Result panel shows flight stats as before

- [ ] **Step 3: Verify in browser (with URL params)**

Open `http://localhost:5173/acceleration/?target_max_velocity=50&target_peak_altitude=100`. Confirm:
- Amber challenge card appears above controls showing "≥ 50.00 m/s — Max Velocity" and "≥ 100.00 m — Peak Altitude"
- "Attempt: 0" shown in card
- After launch, result panel shows flight stats AND challenge score section with ✓/✗ per target
- "Attempt 1" shown in result panel and card after close
- Second launch increments to "Attempt 2"

- [ ] **Step 4: Commit**

```bash
git add ui/UIManager.js
git commit -m "feat: challenge card and score section in UIManager"
```

---

## Task 4: VRHUDPanel.js — challenge targets section

**Files:**
- Modify: `xr/VRHUDPanel.js`

- [ ] **Step 1: Replace VRHUDPanel.js with the updated version**

```js
import { VRPanel } from './VRPanel.js';

// Canvas: 512 × (260 + extraH)   World: 0.90 × dynamic
// extraH = 38 + targets.length * 28 + 10 when challenge is active
export class VRHUDPanel extends VRPanel {
    constructor(challengeManager = null) {
        const extraH = challengeManager?.isActive
            ? 38 + challengeManager.targets.length * 28 + 10
            : 0;
        const canvasH = 260 + extraH;
        const worldH  = 0.46 + extraH * (0.46 / 260);
        super(0.90, worldH, 512, canvasH);

        this._state     = { velocity: 0, acceleration: 0, altitude: 0, fuel: 100 };
        this._challenge = challengeManager;
        this.render();
    }

    updateStats(state) {
        this._state = state;
        this.render();
    }

    render() {
        const { ctx, canvasW, canvasH } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT DATA');

        // ── 2×2 flight data grid ─────────────────────────────────────
        const items = [
            { label: 'Velocity',     value: this._state.velocity?.toFixed(2) + ' m/s',      x: 20,          y: 90  },
            { label: 'Acceleration', value: this._state.acceleration?.toFixed(2) + ' m/s²', x: canvasW / 2 + 10, y: 90  },
            { label: 'Altitude',     value: this._state.altitude?.toFixed(2) + ' m',         x: 20,          y: 175 },
            { label: 'Fuel',         value: this._state.fuel?.toFixed(1) + '%',               x: canvasW / 2 + 10, y: 175 },
        ];

        for (const item of items) {
            ctx.fillStyle = '#6688bb';
            ctx.font = '17px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(item.label, item.x, item.y);

            const isLow = item.label === 'Fuel' && this._state.fuel < 20;
            ctx.fillStyle = isLow ? '#ff6644' : '#ffffff';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(item.value, item.x, item.y + 38);
        }

        // Dividers — vertical stops at grid bottom (y=246) so it doesn't bleed into challenge section
        ctx.strokeStyle = '#1a2255';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(canvasW / 2, 60); ctx.lineTo(canvasW / 2, 246); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, 140); ctx.lineTo(canvasW - 14, 140); ctx.stroke();

        // ── Challenge targets section ─────────────────────────────────
        if (this._challenge?.isActive) {
            const startY = 267;

            // Section divider
            ctx.strokeStyle = 'rgba(255, 170, 34, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(14, startY); ctx.lineTo(canvasW - 14, startY); ctx.stroke();

            // Section header
            ctx.fillStyle = '#ffaa22';
            ctx.font = 'bold 15px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('CHALLENGE TARGETS', canvasW / 2, startY + 22);

            // Target rows
            this._challenge.targets.forEach((t, i) => {
                const y = startY + 40 + i * 28;
                ctx.fillStyle = '#888899';
                ctx.font = '13px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(`${t.label}:`, 20, y);
                ctx.fillStyle = '#ffcc44';
                ctx.font = 'bold 13px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`≥ ${t.value.toFixed(t.decimals)} ${t.unit}`, canvasW - 20, y);
            });
        }

        super.render();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add xr/VRHUDPanel.js
git commit -m "feat: VRHUDPanel shows challenge targets section in XR"
```

---

## Task 5: VRResultPanel.js — challenge score block

**Files:**
- Modify: `xr/VRResultPanel.js`

- [ ] **Step 1: Replace VRResultPanel.js with the updated version**

```js
import { VRPanel } from './VRPanel.js';

const ROWS = [
    { key: 'launchForce',      label: 'Launch Force',      unit: 'N',    decimals: 1 },
    { key: 'rocketMass',       label: 'Rocket Mass',       unit: 'kg',   decimals: 1 },
    { key: 'maxVelocity',      label: 'Max Velocity',      unit: 'm/s',  decimals: 2 },
    { key: 'avgAcceleration',  label: 'Avg Acceleration',  unit: 'm/s²', decimals: 2 },
    { key: 'peakAltitude',     label: 'Peak Altitude',     unit: 'm',    decimals: 2 },
    { key: 'flightTime',       label: 'Flight Time',       unit: 's',    decimals: 2 },
    { key: 'distanceTraveled', label: 'Distance Traveled', unit: 'm',    decimals: 2 },
];

// extra canvas height when challenge is active: header + rows + attempt counter
function challengeExtraH(challengeManager) {
    if (!challengeManager?.isActive) return 0;
    return 12 + 40 + challengeManager.targets.length * 38 + 40;
}

export class VRResultPanel extends VRPanel {
    constructor(onClose, challengeManager = null) {
        const extraH  = challengeExtraH(challengeManager);
        const canvasH = 428 + extraH;
        const worldH  = canvasH * (0.75 / 428);
        super(0.90, worldH, 512, canvasH);

        this._results        = null;
        this._challengeScore = null;
        this._attemptCount   = 0;

        this.addButton('close', 'CLOSE', 156, canvasH - 54, 200, 40, onClose, {});
        this.render();
    }

    setResults(results, challengeScore = null, attemptCount = 0) {
        this._results        = results;
        this._challengeScore = challengeScore;
        this._attemptCount   = attemptCount;
        this.render();
    }

    render() {
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT RESULTS');

        const padL   = 24;
        const padR   = canvasW - 24;
        const startY = 60;
        const rowH   = 42;

        if (this._results) {
            // ── Flight stats rows ────────────────────────────────────────
            ROWS.forEach((row, i) => {
                const y      = startY + i * rowH;
                const val    = this._results[row.key];
                const valStr = `${val.toFixed(row.decimals)} ${row.unit}`;

                if (i % 2 === 0) {
                    ctx.fillStyle = 'rgba(34, 85, 238, 0.07)';
                    ctx.fillRect(padL, y + 2, padR - padL, rowH - 2);
                }

                ctx.fillStyle = '#8899cc';
                ctx.font = '17px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(row.label, padL + 8, y + rowH / 2);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 17px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(valStr, padR - 8, y + rowH / 2);

                ctx.strokeStyle = 'rgba(34, 85, 238, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padL, y + rowH);
                ctx.lineTo(padR, y + rowH);
                ctx.stroke();
            });

            // ── Challenge score block ────────────────────────────────────
            if (this._challengeScore) {
                const secY = startY + ROWS.length * rowH + 12;

                // Divider
                ctx.strokeStyle = 'rgba(255, 170, 34, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(padL, secY); ctx.lineTo(padR, secY); ctx.stroke();

                // Section title
                ctx.fillStyle = '#ffaa22';
                ctx.font = 'bold 17px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('CHALLENGE SCORE', canvasW / 2, secY + 22);

                // Score rows
                this._challengeScore.forEach((r, i) => {
                    const y = secY + 40 + i * 38;

                    if (i % 2 === 0) {
                        ctx.fillStyle = 'rgba(34, 85, 238, 0.07)';
                        ctx.fillRect(padL, y, padR - padL, 36);
                    }

                    // ✓ / ✗
                    ctx.fillStyle = r.passed ? '#44ff88' : '#ff5544';
                    ctx.font = 'bold 18px Arial';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(r.passed ? '✓' : '✗', padL + 8, y + 18);

                    // Label
                    ctx.fillStyle = '#8899cc';
                    ctx.font = '15px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(r.label, padL + 32, y + 18);

                    // Actual / target
                    const sign   = r.delta >= 0 ? '+' : '';
                    const valStr = `${r.actual.toFixed(r.decimals)} / ${r.target.toFixed(r.decimals)} ${r.unit} (${sign}${r.delta.toFixed(r.decimals)})`;
                    ctx.fillStyle = r.passed ? '#88ffaa' : '#ffaa88';
                    ctx.font = 'bold 13px Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText(valStr, padR - 8, y + 18);
                });

                // Attempt count
                const attemptY = secY + 40 + this._challengeScore.length * 38 + 18;
                ctx.fillStyle = '#6677aa';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Attempt ${this._attemptCount}`, canvasW / 2, attemptY);

                ctx.textBaseline = 'alphabetic';
            }
        }

        this.elements.forEach(el => {
            if (el.type === 'button') this._drawButton(el);
        });

        super.render();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add xr/VRResultPanel.js
git commit -m "feat: VRResultPanel renders challenge score block"
```

---

## Task 6: XRHandler.js — wire ChallengeManager

**Files:**
- Modify: `xr/XRHandler.js`

- [ ] **Step 1: Update XRHandler constructor to accept challengeManager**

Change the constructor signature and `_createPanels` call:

```js
constructor(renderer, scene, callbacks, challengeManager = null) {
    this.renderer          = renderer;
    this.scene             = scene;
    this.callbacks         = callbacks;
    this._challengeManager = challengeManager;
    // ... rest unchanged
}
```

- [ ] **Step 2: Pass challengeManager to VRHUDPanel and VRResultPanel in _createPanels**

In `_createPanels()`, update the two panel instantiations:

```js
// HUD — straight ahead, slightly above eye level
this.hudPanel = new VRHUDPanel(this._challengeManager);
this.hudPanel.mesh.position.set(0, -0.5, -1.5);
this.scene.add(this.hudPanel.mesh);
```

```js
// Result panel — centered, in front of the user; hidden until flight ends
this.resultPanel = new VRResultPanel(() => this._onResultClose(), this._challengeManager);
this.resultPanel.mesh.position.set(0, -0.2, -1.3);
this.resultPanel.mesh.visible = false;
this.scene.add(this.resultPanel.mesh);
```

- [ ] **Step 3: Update showResults to forward challenge score**

```js
showResults(results, challengeScore = null, attemptCount = 0) {
    this.resultPanel.setResults(results, challengeScore, attemptCount);
    this.resultPanel.mesh.visible = true;
    this._panels      = [this.controlPanel, this.hudPanel, this.graphPanel, this.resultPanel];
    this._panelMeshes = this._panels.map(p => p.mesh);
}
```

- [ ] **Step 4: Commit**

Full updated `xr/XRHandler.js` for reference — only the changed lines are described above. Run:

```bash
git add xr/XRHandler.js
git commit -m "feat: XRHandler passes challengeManager to VR panels"
```

---

## Task 7: main.js — final wiring

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Replace main.js with the updated version**

```js
import * as THREE from 'three';
import { MainScene }       from './scenes/MainScene.js';
import { PhysicsEngine }   from './physics/PhysicsEngine.js';
import { UIManager }       from './ui/UIManager.js';
import { XRHandler }       from './xr/XRHandler.js';
import { ParticleSystem }  from './scripts/ParticleSystem.js';
import { ChallengeManager } from './ChallengeManager.js';


class RocketApp {
    constructor() {
        this.physics   = new PhysicsEngine();
        this.scene     = new MainScene();
        this.particles = new ParticleSystem(this.scene.scene);
        this.challenge = new ChallengeManager();

        const callbacks = {
            onThrustChange: val => this.physics.setParameters(this.physics.mass, val),
            onMassChange:   val => this.physics.setParameters(val, this.physics.thrust),
            onTimeChange:   val => { this.timeScale = val; },
            onLaunch: () => {
                this.physics.launch();
                this.ui.launchBtn.disabled = true;
            },
            onReset: () => {
                this.physics.reset();
                this.ui.resetUI();
                this.scene.updateRocket(0, false);
                this.particles.reset();
                this._wasLaunched = false;
                this.xr.resetPanels();
                this.challenge.reset();
            },
        };

        this.ui  = new UIManager(callbacks, this.challenge);
        this.xr  = new XRHandler(this.scene.renderer, this.scene.scene, callbacks, this.challenge);

        this.clock        = new THREE.Clock();
        this.timeScale    = 1.0;
        this._wasLaunched = false;

        this._initVisualizers();
        this.physics.setParameters(10, 50);
        this.scene.render(() => this._animate());
    }

    _initVisualizers() {
        const up     = new THREE.Vector3(0, 1, 0);
        const down   = new THREE.Vector3(0, -1, 0);
        const origin = new THREE.Vector3(0, 0, 0);

        this.thrustArrow = new THREE.ArrowHelper(up,   origin, 0, 0x00ff44);
        this.weightArrow = new THREE.ArrowHelper(down, origin, 0, 0xff3300);

        this.scene.rocketGroup.add(this.thrustArrow);
        this.scene.rocketGroup.add(this.weightArrow);
    }

    _animate() {
        const delta = Math.min(this.clock.getDelta(), 0.1) * this.timeScale;

        const wasLaunched = this._wasLaunched;
        this.physics.update(delta);
        const state = this.physics.getState();
        this._wasLaunched = state.isLaunched;

        // Detect flight end: launched → landed
        if (wasLaunched && !state.isLaunched) {
            const results        = this.physics.getResults();
            const challengeScore = this.challenge.isActive
                ? this.challenge.evaluate(results)
                : null;
            this.ui.showResults(results, challengeScore);
            this.xr.showResults(results, challengeScore, this.challenge.attemptCount);
        }

        const isThrusting = state.isLaunched && state.fuel > 0;
        this.scene.updateRocket(state.altitude, isThrusting);
        this.ui.updateHUD(state);
        this.xr.updateHUD(state);
        this.xr.update();
        this._updateVisualizers(state);

        const rocketPos = this.scene.rocketGroup.position.clone();
        this.particles.update(delta, isThrusting, rocketPos);

        this.scene.renderer.render(this.scene.scene, this.scene.camera);
    }

    _updateVisualizers(state) {
        if (state.isLaunched && state.fuel > 0) {
            this.thrustArrow.setLength(this.physics.thrust / 100);
            this.thrustArrow.visible = true;
        } else {
            this.thrustArrow.visible = false;
        }
        this.weightArrow.setLength((this.physics.mass * 9.81) / 100);
        this.weightArrow.position.y = 0.75;
        this.thrustArrow.position.y = 0;
    }
}

new RocketApp();
```

- [ ] **Step 2: Full end-to-end verification (desktop)**

Run `npm run dev`. Open `http://localhost:5173/acceleration/?target_max_velocity=30&target_peak_altitude=50`.

Confirm:
1. Amber challenge card appears top-right showing both targets and "Attempt: 0"
2. Launch the rocket with default settings (thrust=50, mass=10)
3. After landing, result panel shows flight stats AND challenge score section with ✓/✗ per target
4. "Attempt 1" shown in result panel
5. Close the result panel — "Attempt: 1" now shows in challenge card
6. Launch again — result panel shows "Attempt 2"
7. Open `http://localhost:5173/acceleration/` (no params) — no challenge card, result panel shows stats only

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat: wire ChallengeManager into RocketApp animate loop"
```

---

## Self-Review

- **Spec coverage:** ChallengeManager ✓, desktop challenge card ✓, desktop result section ✓, VR HUD targets ✓, VR result score ✓, URL params stubbed ✓, attempt tracking ✓, no-challenge passthrough ✓
- **No placeholders:** URL param stub uses a clearly marked `// TODO` comment pointing to the correct location — not a missing implementation
- **Type consistency:** `evaluate()` return shape `{ label, unit, decimals, target, actual, passed, delta }` used identically in Tasks 3, 5. `setResults(results, challengeScore, attemptCount)` signature consistent between Task 5 and Task 6. `showResults(results, challengeScore, attemptCount)` on XRHandler matches call in Task 7.
