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
