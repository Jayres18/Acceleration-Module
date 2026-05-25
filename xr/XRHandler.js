import * as THREE from 'three';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { VRControlPanel } from './VRControlPanel.js';
import { VRHUDPanel } from './VRHUDPanel.js';
import { VRGraphPanel } from './VRGraphPanel.js';
import { VRInstructionPanel } from './VRInstructionPanel.js';
import { VRResultPanel } from './VRResultPanel.js';

export class XRHandler {
    constructor(renderer, scene, callbacks, challengeManager = null) {
        this.renderer          = renderer;
        this.scene             = scene;
        this.callbacks         = callbacks;
        this._challengeManager = challengeManager;

        this._raycaster = new THREE.Raycaster();
        this._tempMat = new THREE.Matrix4();
        this._panels = [];
        this._activeCtrl = null;   // controller currently holding select
        this._instructionVisible = false;

        this._handModelFactory = new XRHandModelFactory();

        this._initVRButton();
        this._initControllers();
        this._initCursor();
        this._createPanels();
        this._listenForSession();
    }

    // ── Setup ──────────────────────────────────────────────────────────

    _initVRButton() {
            const arButton = ARButton.createButton(this.renderer, {
                requiredFeatures: ["hand-tracking"],
                optionalFeatures: ["dom-overlay", "local-floor", "bounded-floor"],
            });
        if (arButton) {
            document.body.appendChild(arButton);
        }
    }

    _initControllers() {
        this._controllers = [0, 1].map(i => {
            const ctrl = this.renderer.xr.getController(i);
            ctrl.addEventListener('selectstart', e => this._onSelectStart(e));
            ctrl.addEventListener('selectend',   e => this._onSelectEnd(e));
            this.scene.add(ctrl);

            // Ray line
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1),
            ]);
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
                color: 0x4499ff,
                transparent: true,
                opacity: 0.55,
            }));
            line.name = 'ray';
            line.scale.z = 4;
            ctrl.add(line);
            return ctrl;
        });

        // Hand tracking models
        [0, 1].forEach(i => {
            const hand = this.renderer.xr.getHand(i);
            hand.add(this._handModelFactory.createHandModel(hand));
            this.scene.add(hand);
        });
    }

    _initCursor() {
        this._cursor = new THREE.Mesh(
            new THREE.SphereGeometry(0.008, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        this._cursor.visible = false;
        this.scene.add(this._cursor);
    }

    _createPanels() {
        // Control panel — right of the user, slightly angled in
        this.controlPanel = new VRControlPanel(this.callbacks);
        this.controlPanel.mesh.position.set(1.1, -0.5, -1.3);
        this.controlPanel.mesh.rotation.y = -0.15;
        this.scene.add(this.controlPanel.mesh);

        // HUD — straight ahead, slightly above eye level
        this.hudPanel = new VRHUDPanel(this._challengeManager);
        this.hudPanel.mesh.position.set(0, -0.5, -1.5);
        this.scene.add(this.hudPanel.mesh);

        // Graph panel — left of the user, mirrored angle
        this.graphPanel = new VRGraphPanel();
        this.graphPanel.mesh.position.set(-1.1, -0.5, -1.3);
        this.graphPanel.mesh.rotation.y = 0.15;
        this.scene.add(this.graphPanel.mesh);

        // Instruction panel — centered, closer, higher than other panels; NOT in _panels[]
        this.instructionPanel = new VRInstructionPanel();
        this.instructionPanel.mesh.position.set(0, -0.25, -1.2);
        this.instructionPanel.mesh.visible = false;
        this.scene.add(this.instructionPanel.mesh);

        // Result panel — centered, in front of the user; hidden until flight ends
        this.resultPanel = new VRResultPanel(
            () => this._onResultClose(),
            this._challengeManager,
            this.callbacks.onNext,
            this.callbacks.onSubmit,
        );
        this.resultPanel.mesh.position.set(0, -0.2, -1.3);
        this.resultPanel.mesh.visible = false;
        this.scene.add(this.resultPanel.mesh);

        this._panels = [this.controlPanel, this.hudPanel, this.graphPanel];
        this._panelMeshes = this._panels.map(p => p.mesh);
    }

    _listenForSession() {
        this.renderer.xr.addEventListener('sessionstart', () => {
            document.getElementById('ui-container').style.display = 'none';
            this.instructionPanel.mesh.visible = true;
            this._instructionVisible = true;
        });
        this.renderer.xr.addEventListener('sessionend', () => {
            document.getElementById('ui-container').style.display = '';
            this.instructionPanel.mesh.visible = false;
            this._instructionVisible = false;
        });
    }

    // ── Controller events ──────────────────────────────────────────────

    _onSelectStart(e) {
        if (this._instructionVisible) {
            this.instructionPanel.mesh.visible = false;
            this._instructionVisible = false;
            return;  // consume the pinch; no panel interaction fires
        }
        this._activeCtrl = e.target;
        const hit = this._castRay(this._activeCtrl);
        if (hit) hit.panel.onSelectStart(hit.uv);
    }

    _onSelectEnd(e) {
        this._panels.forEach(p => p.onSelectEnd());
        this._activeCtrl = null;
    }

    // ── Raycasting ─────────────────────────────────────────────────────

    _castRay(ctrl) {
        this._tempMat.identity().extractRotation(ctrl.matrixWorld);
        this._raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMat);

        const hits = this._raycaster.intersectObjects(this._panelMeshes);
        if (hits.length > 0 && hits[0].uv) {
            return { panel: hits[0].object.userData.vrPanel, uv: hits[0].uv, point: hits[0].point };
        }
        return null;
    }

    // ── Per-frame update ───────────────────────────────────────────────

    update() {
        if (!this.renderer.xr.isPresenting) return;

        // Reset all hover states
        this._panels.forEach(p => p.onHoverEnd());
        this._cursor.visible = false;

        // Check each controller for hover / active drag
        let found = false;
        for (const ctrl of this._controllers) {
            const hit = this._castRay(ctrl);
            if (hit) {
                found = true;
                hit.panel.onHover(hit.uv);

                // Shorten ray line to the intersection
                const ray = ctrl.getObjectByName('ray');
                if (ray) ray.scale.z = hit.point.distanceTo(
                    new THREE.Vector3().setFromMatrixPosition(ctrl.matrixWorld)
                );

                // Move cursor to intersection
                this._cursor.position.copy(hit.point);
                this._cursor.visible = true;

                // Continue active drag
                if (this._activeCtrl === ctrl) hit.panel.onSelectMove(hit.uv);
                break;
            }
        }

        if (!found) {
            this._controllers.forEach(c => {
                const ray = c.getObjectByName('ray');
                if (ray) ray.scale.z = 4;
            });
        }
    }

    // ── State updates (called from animate loop) ───────────────────────

    updateHUD(state) {
        this.hudPanel.updateStats(state);
        this.graphPanel.pushData(state);
    }

    showResults(results, challengeScore = null, attemptCount = 0) {
        this.resultPanel.setResults(results, challengeScore, attemptCount);
        this.resultPanel.mesh.visible = true;
        this._panels = [this.controlPanel, this.hudPanel, this.graphPanel, this.resultPanel];
        this._panelMeshes = this._panels.map(p => p.mesh);
    }

    hideResults() {
        this.resultPanel.mesh.visible = false;
        this._panels = [this.controlPanel, this.hudPanel, this.graphPanel];
        this._panelMeshes = this._panels.map(p => p.mesh);
    }

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

    _onResultClose() {
        this.callbacks.onReset();
    }

    resetPanels() {
        this.graphPanel.reset();
        this.controlPanel.setDisabled('launch', false);
        this.controlPanel.render();
        this.hideResults();
    }
}
