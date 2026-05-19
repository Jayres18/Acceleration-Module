import * as THREE from 'three';
import { MainScene } from './scenes/MainScene.js';
import { PhysicsEngine } from './physics/PhysicsEngine.js';
import { UIManager } from './ui/UIManager.js';
import { XRHandler } from './xr/XRHandler.js';
import { ParticleSystem } from './scripts/ParticleSystem.js';


class RocketApp {
    constructor() {
        this.physics = new PhysicsEngine();
        this.scene   = new MainScene();
        this.particles = new ParticleSystem(this.scene.scene);

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
            },
        };

        this.ui  = new UIManager(callbacks);
        this.xr  = new XRHandler(this.scene.renderer, this.scene.scene, callbacks);

        this.clock        = new THREE.Clock();
        this.timeScale    = 1.0;
        this._wasLaunched = false;

        this._initVisualizers();
        this.physics.setParameters(10, 50);
        this.scene.render(() => this._animate());
    }

    _initVisualizers() {
        const up   = new THREE.Vector3(0, 1, 0);
        const down = new THREE.Vector3(0, -1, 0);
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
            const results = this.physics.getResults();
            this.ui.showResults(results);
            this.xr.showResults(results);
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
        this.weightArrow.position.y = 0.75; // rocket body centre
        this.thrustArrow.position.y = 0;    // engine bell bottom
    }
}

new RocketApp();
