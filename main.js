// main.js
import * as THREE from 'three';
import { MainScene }       from './scenes/MainScene.js';
import { PhysicsEngine }   from './physics/PhysicsEngine.js';
import { UIManager }       from './ui/UIManager.js';
import { XRHandler }       from './xr/XRHandler.js';
import { ParticleSystem }  from './scripts/ParticleSystem.js';
import { ChallengeManager } from './ChallengeManager.js';
import { AudioManager }    from './audio/AudioManager.js';
import { ExamService }     from './api/ExamService.js';
import { captureExamLink, clearExamLink } from './examLink.js';

/**
 * Where the sitting stands with the server.
 *
 * The results panel is drawn from local state, so it renders a full scorecard
 * whether or not the POST landed — an exam that never reached the database
 * looks exactly like one that did. On a shared headset nobody is watching a
 * console, so the status has to appear on the panel itself.
 */
const SAVE = { SUBMITTING: 'submitting', SAVED: 'saved', UNSAVED: 'unsaved' };

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
        this.audio        = new AudioManager();

        const callbacks = {
            onThrustChange: val => { this._thrust = val; this._applyParameters(); },
            onMassChange:   val => { this._mass   = val; this._applyParameters(); },
            onTimeChange:   val => { this.timeScale = val; },
            onLaunch: () => {
                if (this._pendingLaunch) return; // countdown beep already running
                this._pendingLaunch = true;
                this.ui.launchBtn.disabled = true;
                this.ui.clearLaunchFailed();
                // SFX: launch button click (immediate press feedback)
                this.audio.playSfx('sfx-launch-click');
                // Play the countdown beep, then launch once it finishes.
                this._countdownSfx = this.audio.playSfxUntil('sfx-countdown-beep', () => {
                    this._countdownSfx = null;
                    if (!this._pendingLaunch) return; // cancelled by reset/next
                    this._pendingLaunch = false;

                    this.physics.launch();
                    // Decide liftoff once, now — fuel burns during the countdown
                    // narration, so re-checking later could misread a valid
                    // launch that has since run out of fuel (thrust → 0).
                    const liftsOff = this.physics.willLiftOff();
                    // SFX: liftoff rumble + engine loop. Skip the engine loop
                    // when thrust can't beat gravity — the rocket never leaves
                    // the ground, so a running-engine sound would be wrong.
                    this.audio.playSfx('sfx-liftoff-rumble');
                    if (liftsOff) {
                        this.audio.playLoop('sfx-engine-loop');
                    } else {
                        // Say so on screen, on both surfaces. launch-failed.mp3
                        // already explains this, but narration is silent on a
                        // muted laptop and inaudible in a noisy classroom, and
                        // the LAUNCH button is disabled until RESET — so the
                        // one case the module most wants to teach is the one
                        // that looks like a fault.
                        //
                        // launchForce/launchMass rather than thrust/mass: the
                        // engine zeroes thrust once fuel runs out, so the live
                        // values do not necessarily still describe this launch.
                        const weight = Math.abs(
                            this.physics.launchMass * this.physics.gravity,
                        );
                        this.ui.showLaunchFailed(this.physics.launchForce, weight);
                        this.xr.controlPanel.setDisabled('launch', false);
                        this.xr.controlPanel.render();
                    }
                    // Narration: countdown → liftoff, or the failed-launch
                    // explanation when thrust can't beat gravity.
                    const countdownAudio = this.audio.play('countdown');
                    if (countdownAudio) {
                        countdownAudio.onended = () =>
                            this.audio.play(liftsOff ? 'liftoff' : 'launch-failed');
                    }
                });
            },
            onReset: () => {
                this._cancelCountdown();
                this.physics.reset();
                this._applyParameters();
                this.ui.resetUI();
                this.ui.clearLaunchFailed();
                this.scene.updateRocket(0, false);
                this.particles.reset();
                this._wasCoasting = false;
                this._hideRocketCam();
                this.xr.resetPanels();
                this.challenge.reset();
                // Audio: stop everything, replay pre-launch guidance
                this.audio.reset();
                this.audio.playSfx('sfx-reset-click');
                this.audio.play('pre-launch');
            },
            onNext: () => {
                this._cancelCountdown();
                this.challenge.nextQuestion();
                this.physics.reset();
                this._applyParameters();
                this.ui.resetUI();
                this.ui.clearLaunchFailed();
                this.ui.refreshChallengeCard();
                this.scene.updateRocket(0, false);
                this.particles.reset();
                this._wasCoasting = false;
                this._hideRocketCam();
                this.xr.resetPanels();
                this.xr.refreshHUD();
                // Audio: reset for next question
                this.audio.reset();
                this.audio.play('pre-launch');
            },
            onSubmit: () => this._submitScores(),
        };

        this.ui  = new UIManager(callbacks, this.challenge);
        this.xr  = new XRHandler(this.scene.renderer, this.scene.scene, callbacks, this.challenge);

        this.clock        = new THREE.Clock();
        this.timeScale    = 1.0;
        this._wasCoasting = false;
        this._pendingLaunch = false; // true while the countdown beep is playing
        this._countdownSfx  = null;  // the in-progress countdown beep element
        this._rocketCamActive = false;
        this._rocketCamEl = document.getElementById('rocket-cam');

        this._saveStatus = null;   // null until a submission is attempted
        this._saveError  = '';

        this._initVisualizers();
        // 150 N against a 10 kg rocket: weight is 98.1 N, so the default
        // configuration clears the ground at 5.19 m/s2. A default below the
        // weight makes the module do nothing at all when a student presses
        // LAUNCH on a fresh page, which reads as broken rather than as
        // instructive. Must stay in step with the thrust slider defaults in
        // index.html and VRControlPanel.
        this._mass   = 10;
        this._thrust = 150;
        this._applyParameters();
        this.scene.render(() => this._animate());

        // TEMPORARY DIAGNOSTIC — remove with dev/xrDiagnostics.js once the
        // Quest 3 black screen is settled. Dynamically imported so it stays
        // out of the main bundle and can only run when explicitly asked for.
        if (new URLSearchParams(location.search).has('xrdebug')) {
            import('./dev/xrDiagnostics.js')
                .then(m => m.installXRDiagnostics(this.scene.renderer))
                .catch(err => console.error('[xrdebug] failed to load', err));
        }

        // Narration: intro → pre-launch (chained; browser may block until first gesture)
        this._playIntro();

        // Entering VR is a user gesture, so audio the browser blocked on the
        // initial load is allowed here — (re)play the intro once VR starts.
        this.scene.renderer.xr.addEventListener('sessionstart', () => this._playIntro());
    }

    // ── Narration ─────────────────────────────────────────────────────────

    /** Play the intro narration, then chain into pre-launch guidance. */
    _playIntro() {
        const introAudio = this.audio.play('intro');
        if (introAudio) {
            introAudio.onended = () => this.audio.play('pre-launch');
        }
    }

    // ── Score submission ─────────────────────────────────────────────────

    /**
     * Send the whole sitting in one request.
     *
     * `POST /api/scores/submit` records a sitting once and rejects a second
     * submission for the same (student, exam) with a 400, so this is the only
     * request the sitting gets — hence the guards, and hence
     * `challenge.getScores()` returning every question rather than only the
     * ones that were reached.
     */
    async _submitScores() {
        const scores = this.challenge.getScores();
        if (scores.length === 0) return;
        if (this._saveStatus === SAVE.SUBMITTING) return;
        // A sitting the server has already accepted must not be sent twice —
        // the second attempt is exactly what the endpoint rejects.
        if (this._saveStatus === SAVE.SAVED) return;

        if (!this._examService) {
            // The questions never loaded, so there is no sitting to record and
            // retrying cannot help. Say so rather than offering a dead button.
            console.error('[ExamMode] No exam service available — cannot submit scores.');
            this._setSaveStatus(SAVE.UNSAVED, 'No connection to the exam server.');
            return;
        }

        this._setSaveStatus(SAVE.SUBMITTING);
        try {
            await this._examService.submitScores(this._userId, this._examId, scores);
            // The one place a save is known to have succeeded. Clearing here
            // rather than at the call sites means a tab left open after a
            // finished exam cannot hand the next student this one's identity.
            clearExamLink();
            this._setSaveStatus(SAVE.SAVED);
        } catch (err) {
            console.error('Score submission error:', err.message);
            this._setSaveStatus(SAVE.UNSAVED, err.message);
        }
    }

    /** Push the save state to both the DOM panel and the VR panel. */
    _setSaveStatus(status, message = '') {
        this._saveStatus = status;
        this._saveError  = message;
        this.ui.showSaveStatus(status, message);
        this.xr.showSaveStatus(status, message);
    }

    // ── Static async factory ─────────────────────────────────────────────

    static async create() {
        // Reads the exam link and takes it out of the address bar in one step,
        // so the next student on this headset cannot read — or edit — the last
        // one's ids. Returns '' for a browse-only visit, which simply leaves
        // quiz mode inactive.
        const params = new URLSearchParams(captureExamLink());
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

    // ── Countdown ─────────────────────────────────────────────────────────

    /** Abort an in-progress countdown beep so it never launches the rocket. */
    _cancelCountdown() {
        this._pendingLaunch = false;
        if (this._countdownSfx) {
            this._countdownSfx.pause();
            this._countdownSfx = null;
        }
    }

    // ── Rocket camera ─────────────────────────────────────────────────────

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

    /**
     * Push the configured mass and thrust into the engine.
     *
     * The app holds these rather than reading them back off PhysicsEngine,
     * because `reset()` zeroes thrust and the engine also zeroes it at
     * burnout. Without re-applying them, RESET leaves the engine at 0 N while
     * the slider still reads 150, and the next launch dies on the pad with a
     * "not enough thrust" notice the student has no way to act on.
     */
    _applyParameters() {
        this.physics.setParameters(this._mass, this._thrust);
    }

    // ── Animation loop ────────────────────────────────────────────────────

    _animate() {
        const delta = Math.min(this.clock.getDelta(), 0.1) * this.timeScale;

        const wasCoasting = this._wasCoasting;
        this.physics.update(delta);
        const state = this.physics.getState();
        this._wasCoasting = state.isCoasting;

        // Rocket-cam: show once the rocket is actually airborne.
        if (state.isLaunched && state.altitude > 0 && !this._rocketCamActive) {
            this._showRocketCam();
        }

        // Detect flight end: the engine cutting out, not a landing. The rocket
        // coasts on into space from here, so this is the last moment its
        // numbers mean anything — PhysicsEngine freezes them on the same edge.
        if (!wasCoasting && state.isCoasting) {
            const results        = this.physics.getResults();
            const challengeScore = this.challenge.isActive
                ? this.challenge.evaluate(results)
                : null;
            this.ui.showResults(results, challengeScore);
            this.xr.showResults(results, challengeScore, this.challenge.attemptCount);
            // Stop engine loop at burnout. The chase cam deliberately stays
            // up: the rocket is still flying, and that is the point. RESET and
            // NEXT take it down.
            this.audio.stopLoop();
        }

        // ── Audio: in-flight milestone narration ───────────────────────────
        if (state.isLaunched) {
            const alt  = state.altitude;
            const fuel = state.fuel;

            // Altitude milestones (each fires once per flight)
            if (alt >= 100  && !this.audio.hasPlayed('milestone-100m'))  {
                this.audio.play('milestone-100m');
                this.audio.playSfx('sfx-altitude-chime');
            }
            if (alt >= 500  && !this.audio.hasPlayed('milestone-500m'))  {
                this.audio.play('milestone-500m');
                this.audio.playSfx('sfx-altitude-chime');
            }
            if (alt >= 1000 && !this.audio.hasPlayed('milestone-1000m')) {
                this.audio.play('milestone-1000m');
                this.audio.playSfx('sfx-altitude-chime');
            }

            // Fuel warnings (each fires once per flight)
            if (fuel <= 50 && !this.audio.hasPlayed('fuel-warning-50')) {
                this.audio.play('fuel-warning-50');
            }
            if (fuel <= 25 && !this.audio.hasPlayed('fuel-warning-25')) {
                this.audio.play('fuel-warning-25');
                this.audio.playSfx('sfx-fuel-alarm');
            }
            if (fuel <= 0  && !this.audio.hasPlayed('fuel-empty')) {
                this.audio.play('fuel-empty');
                this.audio.stopLoop();
                this.audio.playSfx('sfx-engine-cutoff');
            }
        }
        // ── End audio milestones ───────────────────────────────────────────

        const isThrusting = state.isLaunched && state.fuel > 0;
        this.scene.updateRocket(state.altitude, isThrusting);
        this.ui.updateHUD(state);
        this.xr.updateHUD(state);
        this.xr.update();
        this._updateVisualizers(state);

        const rocketPos = this.scene.rocketGroup.position.clone();
        this.particles.update(delta, isThrusting, rocketPos);

        // VR monitor: render the chase view into its texture before the main
        // (headset) render. Desktop uses the scissor inset below instead.
        if (this._rocketCamActive && this.scene.renderer.xr.isPresenting) {
            this.scene.setChaseLight(true);
            this.xr.renderCameraView(this.scene.scene, this.scene.chaseCamera);
            this.scene.setChaseLight(false);
        }

        this.scene.renderer.render(this.scene.scene, this.scene.camera);

        // Desktop picture-in-picture: overlay the chase view after the main
        // render. (VR uses the render-target pass above instead.)
        if (this._rocketCamActive && this._rocketCamEl && !this.scene.renderer.xr.isPresenting) {
            this.scene.renderChaseInset(this._rocketCamEl.getBoundingClientRect());
        }
    }

    _updateVisualizers(state) {
        if (state.isLaunched && state.fuel > 0) {
            this.thrustArrow.setLength(this.physics.thrust / 100);
            this.thrustArrow.visible = true;
        } else {
            this.thrustArrow.visible = false;
        }
        // Gravity stops acting once the rocket is coasting, so the weight
        // arrow goes with it — a downward force drawn next to an acceleration
        // of 0.00 teaches the opposite of what this module is for.
        this.weightArrow.visible = !state.isCoasting;
        this.weightArrow.setLength((this.physics.mass * 9.81) / 100);
        this.weightArrow.position.y = 0.75;
        this.thrustArrow.position.y = 0;
    }
}

RocketApp.create();
