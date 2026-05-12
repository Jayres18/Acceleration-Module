import * as THREE from 'three';
import { MainScene } from './scenes/MainScene.js';
import { PhysicsEngine } from './physics/PhysicsEngine.js';
import { UIManager } from './ui/UIManager.js';
import { XRHandler } from './xr/XRHandler.js';
import { ParticleSystem } from './scripts/ParticleSystem.js';

class RocketApp {
    constructor() {
        this.physics = new PhysicsEngine();
        this.scene = new MainScene();
        this.xr = new XRHandler(this.scene.renderer, this.scene.scene);
        this.particles = new ParticleSystem(this.scene.scene);
        
        this.ui = new UIManager({
            onThrustChange: (val) => this.physics.setParameters(this.physics.mass, val),
            onMassChange: (val) => this.physics.setParameters(val, this.physics.thrust),
            onTimeChange: (val) => this.timeScale = val,
            onLaunch: () => this.physics.launch(),
            onReset: () => {
                this.physics.reset();
                this.ui.resetUI();
                this.scene.updateRocket(0);
                this.particles.reset();
            }
        });

        this.clock = new THREE.Clock();
        this.timeScale = 1.0;
        this.initVisualizers();
        
        // Initial setup
        this.physics.setParameters(10, 50);
        
        this.scene.render(() => this.animate());
    }

    initVisualizers() {
        // Force vector visualization
        const arrowDir = new THREE.Vector3(0, 1, 0);
        const arrowOrigin = new THREE.Vector3(0, 0, 0);
        this.thrustArrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, 0, 0x00ff00);
        this.weightArrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), arrowOrigin, 0, 0xff0000);
        
        this.scene.rocketGroup.add(this.thrustArrow);
        this.scene.rocketGroup.add(this.weightArrow);
    }

    animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.1) * this.timeScale;
        
        this.physics.update(deltaTime);
        const state = this.physics.getState();
        
        this.scene.updateRocket(state.altitude);
        this.ui.updateHUD(state);
        this.updateVisualizers(state);

        // Particle update
        const rocketPos = this.scene.rocketGroup.position.clone();
        this.particles.update(deltaTime, state.isLaunched && state.fuel > 0, rocketPos);
        
        this.scene.renderer.render(this.scene.scene, this.scene.camera);
    }

    updateVisualizers(state) {
        if (state.isLaunched && this.physics.fuel > 0) {
            this.thrustArrow.setLength(this.physics.thrust / 50);
            this.thrustArrow.visible = true;
        } else {
            this.thrustArrow.visible = false;
        }
        
        this.weightArrow.setLength((this.physics.mass * 9.81) / 50);
        this.weightArrow.position.y = 1.5; // Center of rocket
        this.thrustArrow.position.y = 0; // Bottom of rocket
    }
}

new RocketApp();
