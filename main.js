// main.js
import * as THREE from 'three';
import { MainScene }       from './scenes/MainScene.js';
import { PhysicsEngine }   from './physics/PhysicsEngine.js';
import { UIManager }       from './ui/UIManager.js';
import { XRHandler }       from './xr/XRHandler.js';
import { ParticleSystem }  from './scripts/ParticleSystem.js';
import { ChallengeManager } from './ChallengeManager.js';
import { ExamService }     from './api/ExamService.js';
import { AudioManager }    from './audio/AudioManager.js';

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
            onThrustChange: val => this.physics.setParameters(this.physics.mass, val),
            onMassChange:   val => this.physics.setParameters(val, this.physics.thrust),
            onTimeChange:   val => { this.timeScale = val; },
            onLaunch: () => {
                this.physics.launch();
                this.ui.launchBtn.disabled = true;
                // SFX: launch button click
                this.audio.playSfx('sfx-launch-click');
                // SFX: liftoff rumble + engine loop
                this.audio.playSfx('sfx-liftoff-rumble');
                this.audio.playLoop('sfx-engine-loop');
                // Narration: countdown → liftoff (chained)
                const countdownAudio = this.audio.play('countdown');
                if (countdownAudio) {
                    countdownAudio.onended = () => this.audio.play('liftoff');
                }
            },
            onReset: () => {
                this.physics.reset();
                this.ui.resetUI();
                this.scene.updateRocket(0, false);
                this.particles.reset();
                this._wasLaunched = false;
                this.xr.resetPanels();
                this.challenge.reset();
                // Audio: stop everything, replay pre-launch guidance
                this.audio.reset();
                this.audio.playSfx('sfx-reset-click');
                this.audio.play('pre-launch');
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
                // Audio: reset for next question
                this.audio.reset();
                this.audio.play('pre-launch');
            },
            onSubmit: async () => {
                if (!this._examService) {
                    console.error('[ExamMode] No exam service available — cannot submit scores.');
                    this.ui.showSubmitError();
                    this.xr.showSubmitError();
                    return;
                }
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

        // Narration: intro → pre-launch (chained; browser may block until first gesture)
        const introAudio = this.audio.play('intro');
        if (introAudio) {
            introAudio.onended = () => this.audio.play('pre-launch');
        }
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
            // Stop engine loop on landing
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
