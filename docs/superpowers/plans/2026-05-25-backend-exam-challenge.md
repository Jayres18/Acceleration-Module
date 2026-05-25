# Backend Exam Challenge Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch sequenced flight-challenge scenarios from a backend exam API, run one attempt per scenario, and submit pass/fail scores when the exam is complete — all wired into both the desktop and WebXR UIs.

**Architecture:** A new `api/ExamService.js` handles all network calls. `ChallengeManager` gains multi-question sequencing (`loadFromExam`, `nextQuestion`, `recordResult`). `main.js` becomes async via a static `create()` factory that fetches questions before constructing the UI, so all panels receive fully-populated challenge state at construction time. Two new callbacks (`onNext`, `onSubmit`) drive progression through the exam.

**Tech Stack:** Vanilla JS ES modules, Three.js, WebXR, Vite/HTTPS dev server (`npm run dev`)

---

## File Map

| Action | File | Change |
|---|---|---|
| **Create** | `api/ExamService.js` | GET questions, POST scores |
| **Modify** | `ChallengeManager.js` | Multi-question mode, score accumulation |
| **Modify** | `main.js` | Async factory, `onNext`/`onSubmit` callbacks |
| **Modify** | `xr/VRResultPanel.js` | Next / Submit exam action button |
| **Modify** | `xr/VRHUDPanel.js` | "Q X / N" progress indicator |
| **Modify** | `xr/XRHandler.js` | Pass new callbacks, expose `showExamSubmitted` / `showSubmitError` / `refreshHUD` |
| **Modify** | `ui/UIManager.js` | Next / Submit button in DOM result panel, `refreshChallengeCard` |

---

## Task 1 — Create `api/ExamService.js`

**Files:**
- Create: `api/ExamService.js`

- [ ] **Step 1: Create the file**

```javascript
// api/ExamService.js
const BASE_URL = 'http://192.168.102.62:5000/api';

export class ExamService {
    /**
     * Fetch all questions for an exam.
     * @param {number|string} examId
     * @returns {Promise<Array<{question_id: number, question_properties_values: object}>>}
     */
    async fetchQuestions(examId) {
        const resp = await fetch(`${BASE_URL}/questions/exam/${examId}`);
        if (!resp.ok) {
            throw new Error(`Failed to load exam questions (HTTP ${resp.status})`);
        }
        return resp.json();
    }

    /**
     * Submit per-question pass/fail scores.
     * @param {number} userId
     * @param {number} examId
     * @param {Array<{question_id: number, is_correct: boolean}>} scores
     */
    async submitScores(userId, examId, scores) {
        const resp = await fetch(`${BASE_URL}/scores/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: userId,
                exam_id: examId,
                scores,
            }),
        });
        if (!resp.ok) {
            throw new Error(`Score submission failed (HTTP ${resp.status})`);
        }
    }
}
```

---

## Task 2 — Extend `ChallengeManager.js` for multi-question mode

**Files:**
- Modify: `ChallengeManager.js`

- [ ] **Step 1: Replace the file content**

Keep all existing URL-param logic (backward compatibility). Add exam-mode state and methods below the constructor.

```javascript
// ChallengeManager.js
const TARGETS_MAP = [
    { param: 'target_max_velocity',  key: 'maxVelocity',     label: 'Max Velocity',     unit: 'm/s',  decimals: 2 },
    { param: 'target_peak_altitude', key: 'peakAltitude',    label: 'Peak Altitude',    unit: 'm',    decimals: 2 },
    { param: 'target_avg_accel',     key: 'avgAcceleration', label: 'Avg Acceleration', unit: 'm/s²', decimals: 2 },
    { param: 'target_flight_time',   key: 'flightTime',      label: 'Flight Time',      unit: 's',    decimals: 2 },
];

export class ChallengeManager {
    constructor() {
        // ── URL-param mode (single challenge, backward-compatible) ──────
        const params = new URLSearchParams(window.location.search);
        this.targets = [];

        for (const def of TARGETS_MAP) {
            const raw = params.get(def.param);
            if (raw !== null) {
                const value = parseFloat(raw);
                if (!isNaN(value)) this.targets.push({ ...def, value });
            }
        }

        this.isActive     = this.targets.length > 0;
        this.attemptCount = 0;

        // ── Exam-mode state (populated by loadFromExam) ─────────────────
        this._examMode          = false;
        this._questions         = [];
        this._currentIndex      = 0;
        this._currentQuestionId = null;
        this._scores            = [];
    }

    // ── Exam-mode API ────────────────────────────────────────────────────

    /**
     * Load an ordered array of API questions. Overwrites any URL-param targets.
     * @param {Array<{question_id: number, question_properties_values: object}>} questions
     */
    loadFromExam(questions) {
        this._questions    = questions;
        this._currentIndex = 0;
        this._scores       = [];
        this._examMode     = true;
        this.isActive      = true;
        this._loadCurrentQuestion();
    }

    /** Advance to the next question. Call only when !isLastQuestion. */
    nextQuestion() {
        this._currentIndex++;
        this._loadCurrentQuestion();
    }

    /**
     * Record whether the current question was passed.
     * Called automatically by evaluate() in exam mode.
     * @param {boolean} isCorrect
     */
    recordResult(isCorrect) {
        this._scores.push({ question_id: this._currentQuestionId, is_correct: isCorrect });
    }

    /** @returns {Array<{question_id: number, is_correct: boolean}>} */
    getScores() {
        return this._scores;
    }

    /** True when the current question is the last one in the exam. */
    get isLastQuestion() {
        return this._currentIndex >= this._questions.length - 1;
    }

    /** { current: 1-based index, total: question count } */
    get questionProgress() {
        return { current: this._currentIndex + 1, total: this._questions.length };
    }

    /** True when loaded from API (exam mode), false for URL-param mode. */
    get isExamMode() {
        return this._examMode;
    }

    // ── Shared API ───────────────────────────────────────────────────────

    /** Returns array of { label, unit, decimals, target, actual, passed, delta }. */
    evaluate(results) {
        this.attemptCount++;
        const score = this.targets.map(t => {
            const actual = results[t.key] ?? 0;
            const passed = actual >= t.value;
            const delta  = actual - t.value;
            return { label: t.label, unit: t.unit, decimals: t.decimals, target: t.value, actual, passed, delta };
        });

        // In exam mode, record pass/fail automatically
        if (this._examMode) {
            const isCorrect = score.every(r => r.passed);
            this.recordResult(isCorrect);
        }

        return score;
    }

    /** Called on every reset — intentionally preserves attemptCount. */
    reset() {}

    // ── Private ──────────────────────────────────────────────────────────

    _loadCurrentQuestion() {
        const q = this._questions[this._currentIndex];
        this._currentQuestionId = q.question_id;
        this.targets = [];
        for (const def of TARGETS_MAP) {
            const raw = q.question_properties_values[def.param];
            if (raw !== undefined && raw !== null) {
                const value = parseFloat(raw);
                if (!isNaN(value)) this.targets.push({ ...def, value });
            }
        }
    }
}
```

---

## Task 3 — Refactor `main.js`: async factory + `onNext`/`onSubmit` callbacks

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Replace `main.js` entirely**

The key change: `new RocketApp()` → `RocketApp.create()` (async). Questions are fetched and loaded into ChallengeManager **before** UIManager and XRHandler are constructed, so panels receive the correct canvas-height at build time.

```javascript
// main.js
import * as THREE from 'three';
import { MainScene }       from './scenes/MainScene.js';
import { PhysicsEngine }   from './physics/PhysicsEngine.js';
import { UIManager }       from './ui/UIManager.js';
import { XRHandler }       from './xr/XRHandler.js';
import { ParticleSystem }  from './scripts/ParticleSystem.js';
import { ChallengeManager } from './ChallengeManager.js';
import { ExamService }     from './api/ExamService.js';

class RocketApp {
    /**
     * @param {ChallengeManager} challenge  - already populated (URL-param or exam mode)
     * @param {ExamService|null} examService
     * @param {number|null} userId
     * @param {number|null} examId
     */
    constructor(challenge, examService = null, userId = null, examId = null) {
        this.physics      = new PhysicsEngine();
        this.scene        = new MainScene();
        this.particles    = new ParticleSystem(this.scene.scene);
        this.challenge    = challenge;
        this._examService = examService;
        this._userId      = userId;
        this._examId      = examId;

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
            onNext: () => {
                this.challenge.nextQuestion();
                this.physics.reset();
                this.ui.resetUI();
                this.ui.refreshChallengeCard();
                this.scene.updateRocket(0, false);
                this.particles.reset();
                this._wasLaunched = false;
                this.xr.resetPanels();
                this.xr.refreshHUD();
            },
            onSubmit: async () => {
                try {
                    await this._examService.submitScores(
                        this._userId,
                        this._examId,
                        this.challenge.getScores()
                    );
                    this.ui.showExamSubmitted();
                    this.xr.showExamSubmitted();
                } catch (err) {
                    console.error('Score submission error:', err.message);
                    this.ui.showSubmitError();
                    this.xr.showSubmitError();
                }
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

    // ── Static async factory ─────────────────────────────────────────────

    static async create() {
        const params = new URLSearchParams(window.location.search);
        const examIdRaw = params.get('exam_id');
        const userIdRaw = params.get('user_id');

        const challenge = new ChallengeManager(); // reads URL-param targets (backward compat)
        let examService = null;
        let userId = null;
        let examId = null;

        if (examIdRaw) {
            examId = parseInt(examIdRaw, 10);

            if (!userIdRaw) {
                console.warn('[ExamMode] Missing user_id — exam will not load.');
                // Challenge stays in URL-param mode (or inactive)
            } else {
                userId = parseInt(userIdRaw, 10);
                examService = new ExamService();
                try {
                    const questions = await examService.fetchQuestions(examId);
                    if (questions.length > 0) {
                        challenge.loadFromExam(questions);
                    } else {
                        console.warn('[ExamMode] Exam returned no questions — free-play mode.');
                    }
                } catch (err) {
                    console.error('[ExamMode] Failed to load exam:', err.message);
                    examService = null; // disable submission if fetch failed
                }
            }
        }

        return new RocketApp(challenge, examService, userId, examId);
    }

    // ── Visualizers ───────────────────────────────────────────────────────

    _initVisualizers() {
        const up   = new THREE.Vector3(0, 1, 0);
        const down = new THREE.Vector3(0, -1, 0);
        const origin = new THREE.Vector3(0, 0, 0);

        this.thrustArrow = new THREE.ArrowHelper(up,   origin, 0, 0x00ff44);
        this.weightArrow = new THREE.ArrowHelper(down, origin, 0, 0xff3300);

        this.scene.rocketGroup.add(this.thrustArrow);
        this.scene.rocketGroup.add(this.weightArrow);
    }

    // ── Animation loop ────────────────────────────────────────────────────

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

RocketApp.create();
```

---

## Task 4 — Update `xr/VRResultPanel.js`: exam action button

**Files:**
- Modify: `xr/VRResultPanel.js`

- [ ] **Step 1: Replace `VRResultPanel.js` entirely**

Adds a "Next Question →" / "Submit Exam ✓" button in exam mode. The CLOSE button is hidden in exam mode (one-attempt rule). After submit, the button becomes static green text.

```javascript
// xr/VRResultPanel.js
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

function challengeExtraH(challengeManager) {
    if (!challengeManager?.isActive) return 0;
    const base   = 12 + 40 + challengeManager.targets.length * 38 + 40;
    const examBtn = challengeManager.isExamMode ? 60 : 0;
    return base + examBtn;
}

export class VRResultPanel extends VRPanel {
    constructor(onClose, challengeManager = null, onNext = null, onSubmit = null) {
        const extraH  = challengeExtraH(challengeManager);
        const canvasH = 428 + extraH;
        const worldH  = canvasH * (0.75 / 428);
        super(0.90, worldH, 512, canvasH);

        this._results          = null;
        this._challengeScore   = null;
        this._attemptCount     = 0;
        this._challengeManager = challengeManager;
        this._onNext           = onNext;
        this._onSubmit         = onSubmit;
        this._examSubmitted    = false;

        const isExam = challengeManager?.isExamMode;

        if (isExam) {
            // Exam mode: action button (Next / Submit), no close button
            const label = challengeManager.isLastQuestion ? 'Submit Exam ✓' : 'Next Question →';
            this.addButton('exam-action', label, 106, canvasH - 54, 300, 40,
                () => this._handleExamAction(), {});
        } else {
            // Free-play / URL-param mode: normal close button
            this.addButton('close', 'CLOSE', 156, canvasH - 54, 200, 40, onClose, {});
        }

        this.render();
    }

    setResults(results, challengeScore = null, attemptCount = 0) {
        this._results        = results;
        this._challengeScore = challengeScore;
        this._attemptCount   = attemptCount;

        // Update exam action button label to reflect current question position
        if (this._challengeManager?.isExamMode && !this._examSubmitted) {
            const el = this.elements.find(e => e.id === 'exam-action');
            if (el) {
                el.label    = this._challengeManager.isLastQuestion ? 'Submit Exam ✓' : 'Next Question →';
                el.disabled = false;
            }
        }

        this.render();
    }

    /** Called by XRHandler after a successful score submission. */
    showExamSubmitted() {
        this._examSubmitted = true;
        const el = this.elements.find(e => e.id === 'exam-action');
        if (el) {
            el.label    = 'Exam Submitted ✓';
            el.disabled = true;
        }
        this.render();
    }

    /** Called by XRHandler when score submission fails. Re-enables the button. */
    showSubmitError() {
        const el = this.elements.find(e => e.id === 'exam-action');
        if (el) {
            el.label    = 'Retry Submit';
            el.disabled = false;
        }
        this.render();
    }

    render() {
        const { ctx, canvasW, canvasH } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT RESULTS');

        const padL   = 24;
        const padR   = canvasW - 24;
        const startY = 60;
        const rowH   = 42;

        if (this._results) {
            // ── Flight stats rows ─────────────────────────────────────────
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

            // ── Challenge score block ─────────────────────────────────────
            if (this._challengeScore) {
                const secY = startY + ROWS.length * rowH + 12;

                ctx.strokeStyle = 'rgba(255, 170, 34, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(padL, secY); ctx.lineTo(padR, secY); ctx.stroke();

                ctx.fillStyle = '#ffaa22';
                ctx.font = 'bold 17px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('CHALLENGE SCORE', canvasW / 2, secY + 22);

                this._challengeScore.forEach((r, i) => {
                    const y = secY + 40 + i * 38;

                    if (i % 2 === 0) {
                        ctx.fillStyle = 'rgba(34, 85, 238, 0.07)';
                        ctx.fillRect(padL, y, padR - padL, 36);
                    }

                    ctx.fillStyle = r.passed ? '#44ff88' : '#ff5544';
                    ctx.font = 'bold 18px Arial';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(r.passed ? '✓' : '✗', padL + 8, y + 18);

                    ctx.fillStyle = '#8899cc';
                    ctx.font = '15px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(r.label, padL + 32, y + 18);

                    const sign   = r.delta >= 0 ? '+' : '';
                    const valStr = `${r.actual.toFixed(r.decimals)} / ${r.target.toFixed(r.decimals)} ${r.unit} (${sign}${r.delta.toFixed(r.decimals)})`;
                    ctx.fillStyle = r.passed ? '#88ffaa' : '#ffaa88';
                    ctx.font = 'bold 13px Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText(valStr, padR - 8, y + 18);
                });

                // Attempt count (URL-param mode only; exam mode shows question progress instead)
                if (!this._challengeManager?.isExamMode) {
                    const attemptY = secY + 40 + this._challengeScore.length * 38 + 18;
                    ctx.fillStyle = '#6677aa';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`Attempt ${this._attemptCount}`, canvasW / 2, attemptY);
                }

                ctx.textBaseline = 'alphabetic';
            }

            // ── Exam submitted confirmation ────────────────────────────────
            if (this._examSubmitted) {
                const confirmY = canvasH - 80;
                ctx.fillStyle = '#44ff88';
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Exam Submitted ✓', canvasW / 2, confirmY);
                ctx.textBaseline = 'alphabetic';
            }
        }

        this.elements.forEach(el => {
            if (el.type === 'button') this._drawButton(el);
        });

        super.render();
    }

    _handleExamAction() {
        if (this._examSubmitted) return;
        if (this._challengeManager.isLastQuestion) {
            this._examSubmitted = true;
            // Disable button immediately to prevent double-tap
            const el = this.elements.find(e => e.id === 'exam-action');
            if (el) el.disabled = true;
            this.render();
            this._onSubmit && this._onSubmit();
        } else {
            this._onNext && this._onNext();
        }
    }
}
```

---

## Task 5 — Update `xr/VRHUDPanel.js`: question progress indicator

**Files:**
- Modify: `xr/VRHUDPanel.js`

- [ ] **Step 1: Replace `VRHUDPanel.js` entirely**

Adds "Q X / N" right-aligned next to the "CHALLENGE TARGETS" heading when in exam mode.

```javascript
// xr/VRHUDPanel.js
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
        const { ctx, canvasW } = this;
        this._drawBackground();
        this._drawTitle('FLIGHT DATA');

        // ── 2×2 flight data grid ──────────────────────────────────────────
        const items = [
            { label: 'Velocity',     value: this._state.velocity?.toFixed(2) + ' m/s',      x: 20,               y: 90  },
            { label: 'Acceleration', value: this._state.acceleration?.toFixed(2) + ' m/s²', x: canvasW / 2 + 10, y: 90  },
            { label: 'Altitude',     value: this._state.altitude?.toFixed(2) + ' m',         x: 20,               y: 175 },
            { label: 'Fuel',         value: this._state.fuel?.toFixed(1) + '%',              x: canvasW / 2 + 10, y: 175 },
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

        // Dividers
        ctx.strokeStyle = '#1a2255';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(canvasW / 2, 60); ctx.lineTo(canvasW / 2, 246); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, 140); ctx.lineTo(canvasW - 14, 140); ctx.stroke();

        // ── Challenge targets section ──────────────────────────────────────
        if (this._challenge?.isActive) {
            const startY = 267;

            ctx.strokeStyle = 'rgba(255, 170, 34, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(14, startY); ctx.lineTo(canvasW - 14, startY); ctx.stroke();

            // "CHALLENGE TARGETS" heading (left-aligned)
            ctx.fillStyle = '#ffaa22';
            ctx.font = 'bold 15px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('CHALLENGE TARGETS', 20, startY + 22);

            // "Q X / N" progress badge (right-aligned, exam mode only)
            if (this._challenge.isExamMode) {
                const { current, total } = this._challenge.questionProgress;
                ctx.fillStyle = '#aabbff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`Q ${current} / ${total}`, canvasW - 20, startY + 22);
            }

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

---

## Task 6 — Update `xr/XRHandler.js`: pass new callbacks, expose exam state helpers

**Files:**
- Modify: `xr/XRHandler.js`

- [ ] **Step 1: Update `_createPanels` to pass `onNext`/`onSubmit` to VRResultPanel**

Find this line in `_createPanels`:
```javascript
this.resultPanel = new VRResultPanel(() => this._onResultClose(), this._challengeManager);
```
Replace it with:
```javascript
this.resultPanel = new VRResultPanel(
    () => this._onResultClose(),
    this._challengeManager,
    this.callbacks.onNext,
    this.callbacks.onSubmit,
);
```

- [ ] **Step 2: Add `showExamSubmitted`, `showSubmitError`, and `refreshHUD` methods**

Add these three methods after the existing `hideResults()` method:

```javascript
/** Relay exam submission success to the VR result panel. */
showExamSubmitted() {
    this.resultPanel.showExamSubmitted();
}

/** Relay exam submission failure to the VR result panel (re-enables button). */
showSubmitError() {
    this.resultPanel.showSubmitError();
}

/** Re-render the HUD panel after question targets change (called by onNext). */
refreshHUD() {
    this.hudPanel.render();
}
```

---

## Task 7 — Update `ui/UIManager.js`: Next/Submit button + refresh support

**Files:**
- Modify: `ui/UIManager.js`

- [ ] **Step 1: Add exam action button to `showResults`**

Replace the existing `showResults` method:

```javascript
showResults(results, challengeScore = null) {
    this.resLaunchForce.textContent  = `${results.launchForce.toFixed(1)} N`;
    this.resRocketMass.textContent   = `${results.rocketMass.toFixed(1)} kg`;
    this.resMaxVelocity.textContent  = `${results.maxVelocity.toFixed(2)} m/s`;
    this.resAvgAccel.textContent     = `${results.avgAcceleration.toFixed(2)} m/s²`;
    this.resPeakAltitude.textContent = `${results.peakAltitude.toFixed(2)} m`;
    this.resFlightTime.textContent   = `${results.flightTime.toFixed(2)} s`;
    this.resDistance.textContent     = `${results.distanceTraveled.toFixed(2)} m`;

    if (challengeScore) this._renderChallengeScore(challengeScore);

    // Exam mode: show Next or Submit button instead of (or alongside) CLOSE
    if (this.challengeManager?.isExamMode) {
        const btn = this._getOrCreateExamActionBtn();
        btn.disabled    = false;
        btn.textContent = this.challengeManager.isLastQuestion ? 'Submit Exam' : 'Next Question →';
        btn.onclick = this.challengeManager.isLastQuestion
            ? () => { btn.disabled = true; this.callbacks.onSubmit(); }
            : () => this.callbacks.onNext();
    }

    this.resultPanel.classList.add('visible');
}
```

- [ ] **Step 2: Add helper methods for exam DOM state**

Add these methods after `showResults`:

```javascript
/** Returns the exam action button, creating it inside #result-panel if absent. */
_getOrCreateExamActionBtn() {
    let btn = document.getElementById('exam-action-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id        = 'exam-action-btn';
        btn.className = 'btn';
        btn.style.cssText = 'margin-top:12px;width:100%;padding:10px;font-size:1rem;';
        this.resultPanel.appendChild(btn);
    }
    return btn;
}

/** Called after successful score submission. */
showExamSubmitted() {
    const btn = document.getElementById('exam-action-btn');
    if (btn) {
        btn.textContent = 'Exam Submitted ✓';
        btn.disabled    = true;
        btn.style.color = '#44ff88';
    }
}

/** Called when score submission fails — re-enables retry. */
showSubmitError() {
    const btn = document.getElementById('exam-action-btn');
    if (btn) {
        btn.textContent = 'Retry Submit';
        btn.disabled    = false;
        btn.style.color = '';
    }
}

/**
 * Rebuilds the challenge card heading and targets after nextQuestion().
 * Called by onNext in main.js.
 */
refreshChallengeCard() {
    if (!this.challengeManager?.isActive || !this.challengeCard) return;

    // Update question progress heading
    if (this.challengeManager.isExamMode && this._questionProgressEl) {
        const { current, total } = this.challengeManager.questionProgress;
        this._questionProgressEl.textContent = `Question ${current} of ${total}`;
    }

    // Re-render target list
    if (this._challengeTargetsEl) {
        this._challengeTargetsEl.innerHTML = this.challengeManager.targets
            .map(t => `<div class="challenge-target">≥ ${t.value.toFixed(t.decimals)} ${t.unit} — ${t.label}</div>`)
            .join('');
    }
}
```

- [ ] **Step 3: Update `_buildChallengeCard` to store refs and show question progress**

Replace the existing `_buildChallengeCard` method:

```javascript
_buildChallengeCard() {
    if (!this.challengeManager?.isActive) return;

    const card = document.createElement('div');
    card.id = 'challenge-card';
    card.className = 'panel';

    const isExam = this.challengeManager.isExamMode;
    const progressHTML = isExam
        ? (() => {
              const { current, total } = this.challengeManager.questionProgress;
              return `<div id="question-progress">Question ${current} of ${total}</div>`;
          })()
        : '';

    const targets = this.challengeManager.targets
        .map(t => `<div class="challenge-target">≥ ${t.value.toFixed(t.decimals)} ${t.unit} — ${t.label}</div>`)
        .join('');

    card.innerHTML = `
        <h3>Challenge Targets</h3>
        ${progressHTML}
        <div id="challenge-targets-list">${targets}</div>
        <div id="attempt-count">Attempt: 0</div>
    `;

    const controls = document.getElementById('controls');
    controls.parentNode.insertBefore(card, controls);

    this.challengeCard        = card;
    this.attemptCountEl       = card.querySelector('#attempt-count');
    this._questionProgressEl  = card.querySelector('#question-progress');
    this._challengeTargetsEl  = card.querySelector('#challenge-targets-list');
}
```

---

## Verification

Manual testing steps (run `npm run dev`, open `https://localhost:5173/acceleration/`):

### 1. Exam mode loads correctly
- Open `https://localhost:5173/acceleration/?user_id=8&exam_id=42`
- Desktop: challenge card shows "Question 1 of N" and the first question's targets
- VR: VRHUDPanel shows "Q 1 / N" badge and targets

### 2. Flight + result panel
- Launch, wait for landing
- Desktop: result panel shows flight stats, challenge score, and "Next Question →" button
- VR: VRResultPanel shows same data and "Next Question →" button (no CLOSE button)

### 3. Advance to next question
- Click "Next Question →" (desktop or VR)
- Controls reset, result panel hides
- Desktop challenge card shows "Question 2 of N" with new targets
- VR HUD shows "Q 2 / N" with new targets

### 4. Last question → Submit
- Complete final question flight
- Button label changes to "Submit Exam ✓" (desktop and VR)
- Click submit → POST to `http://192.168.102.62:5000/api/scores/submit`
- Verify the backend receives `{ student_id: 8, exam_id: 42, scores: [{question_id, is_correct}, ...] }`
- Desktop button becomes "Exam Submitted ✓" (disabled, green); VR panel shows same

### 5. Submit failure → retry
- Temporarily change `BASE_URL` in `api/ExamService.js` to a bad URL
- Click Submit — button becomes "Retry Submit" and re-enables
- Restore `BASE_URL`, retry — submission succeeds

### 6. Backward compatibility (URL-param mode)
- Open with `?target_max_velocity=60&target_peak_altitude=250`
- Confirm existing challenge card and result behavior unchanged (no Next/Submit buttons)

### 7. Missing `user_id` guard
- Open with `?exam_id=42` (no `user_id`)
- Console shows `[ExamMode] Missing user_id — exam will not load.`
- App launches in free-play mode

### 8. Bad `exam_id` guard
- Open with `?user_id=8&exam_id=99999` (nonexistent exam)
- Console shows `[ExamMode] Failed to load exam: ...`
- App launches in free-play mode
