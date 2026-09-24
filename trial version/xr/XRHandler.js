import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OculusHandModel } from 'three/examples/jsm/webxr/OculusHandModel.js';
import { VRControlPanel } from './VRControlPanel.js';
import { VRHUDPanel } from './VRHUDPanel.js';
import { VRGraphPanel } from './VRGraphPanel.js';
import { VRInstructionPanel } from './VRInstructionPanel.js';
import { VRResultPanel } from './VRResultPanel.js';
import { VRCameraPanel } from './VRCameraPanel.js';
import { asset } from '../assetPath.js';

export class XRHandler {
    /**
     * @param {object?} trial  `{ ranges }` in the trial build, null otherwise.
     *                         Only the trial build ever passes it, so the full
     *                         module cannot be talked into trial behaviour.
     */
    constructor(renderer, scene, callbacks, challengeManager = null, trial = null) {
        this._trial = trial;
        this.renderer          = renderer;
        this.scene             = scene;
        this.callbacks         = callbacks;
        this._challengeManager = challengeManager;

        this._raycaster = new THREE.Raycaster();
        this._tempMat = new THREE.Matrix4();
        this._panels = [];
        this._activeCtrl = null;   // controller currently holding select
        this._instructionVisible = false;

        this._initVRButton();
        this._initControllers();
        this._initCursor();
        this._createPanels();
        this._listenForSession();
    }

    // ── Setup ──────────────────────────────────────────────────────────

    _initVRButton() {
        // immersive-vr, not immersive-ar. This module renders its own world —
        // star field, ground plane, rocket — and an AR session would composite
        // all of it over a passthrough view of the classroom. ARButton also
        // labels itself "AR NOT SUPPORTED" on every desktop browser, which
        // reads as the VR entry point having gone missing rather than as the
        // wrong session type having been asked for.
        //
        // hand-tracking is optional, never required: requestSession rejects
        // outright on a required feature the runtime does not implement, so
        // requiring it costs every controller-only student the session itself.
        // Controllers and hands both arrive as the same select event anyway.
        //
        // local-floor, bounded-floor and layers are not listed — VRButton
        // already requests all three as optional features.
        //
        // Origin at the head, not the floor. Every panel position in this file
        // is written as an offset from the viewer's eye — the HUD half a metre
        // below it, the monitor slightly above — but three.js defaults to
        // local-floor, where y = 0 is the physical floor and the eye is ~1.6 m
        // above it. That drops the entire layout to around the student's feet,
        // 50-57° below horizontal and outside the headset's ~±45° vertical
        // field of view: entering VR shows a completely black scene, because
        // the star dome is erased by fog and there is no ground or background
        // to see either. None of it shows on desktop, where the camera sits
        // 5 m back and the same offsets subtend a comfortable ~22°.
        //
        // 'local' needs no feature request — it is always available to an
        // immersive session — and it must be set before the session starts.
        this.renderer.xr.setReferenceSpaceType('local');

        const vrButton = VRButton.createButton(this.renderer, {
            optionalFeatures: ['hand-tracking'],
        });
        if (vrButton) {
            document.body.appendChild(vrButton);
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

        // Hand tracking models. `path` must be set explicitly: left null,
        // XRHandMeshModel falls back to its jsDelivr URL and fetches the
        // meshes from the public internet every session, so hand tracking
        // renders nothing on a classroom LAN with no route out. The assets are
        // vendored under public/hand-profiles/ instead.
        //
        // It is assigned after construction rather than passed in — the
        // constructor's second parameter is a Loader, not a path, and `path`
        // is only read later, when the 'connected' event builds the mesh model.
        [0, 1].forEach(i => {
            const hand = this.renderer.xr.getHand(i);
            const handModel = new OculusHandModel(hand);
            handModel.path = asset('hand-profiles/generic-hand/');
            hand.add(handModel);
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
        this.controlPanel = new VRControlPanel(this.callbacks, this._trial?.ranges ?? null);
        this.controlPanel.mesh.position.set(1.1, -0.5, -1.3);
        this.controlPanel.mesh.rotation.y = -0.15;
        this.scene.add(this.controlPanel.mesh);

        // HUD — straight ahead, slightly above eye level
        this.hudPanel = new VRHUDPanel(this._challengeManager, Boolean(this._trial));
        this.hudPanel.mesh.position.set(0, -0.5, -1.5);
        this.scene.add(this.hudPanel.mesh);

        // Rocket camera monitor — above the HUD; non-interactive, so it is
        // deliberately NOT added to _panels (excluded from raycasting).
        this.cameraPanel = new VRCameraPanel();
        this.cameraPanel.mesh.position.set(0, 0.35, -1.5);
        this.scene.add(this.cameraPanel.mesh);

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
            () => this._onResultReset(),
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

    /** Relay the sitting's save state to the VR result panel. */
    showSaveStatus(status, message = '') {
        this.resultPanel.showSaveStatus(status, message);
    }

    /** Re-render the HUD panel after question targets change (called by onNext). */
    refreshHUD() {
        this.hudPanel.render();
    }

    // ── Rocket camera monitor ──────────────────────────────────────────

    showCamera() { this.cameraPanel.mesh.visible = true; }
    hideCamera() { this.cameraPanel.mesh.visible = false; }

    /** Render the chase-camera view into the monitor panel's texture. */
    renderCameraView(scene, chaseCamera) {
        const rt = this.cameraPanel.renderTarget;
        chaseCamera.aspect = rt.width / rt.height;
        chaseCamera.updateProjectionMatrix();
        // Restore whatever was bound, rather than assuming null. Inside an XR
        // frame three.js has the session's own framebuffer bound — WebXRManager
        // binds it before invoking the animation callback — so
        // setRenderTarget(null) does not mean "back to normal", it means the
        // canvas. Every later draw in the frame, the main render included, then
        // goes somewhere the headset compositor never reads: the view freezes on
        // the last good frame while the loop keeps running and the audio keeps
        // playing. It begins the instant the chase cam switches on, one frame
        // after liftoff. Verified on a Quest 3 on 2026-09-22.
        // Opt this one pass out of XR. While a session is presenting,
        // WebGLRenderer.render() throws away the camera it is given and
        // substitutes the headset's ArrayCamera — so this drew the student's own
        // view into the monitor instead of the chase view, with the XR camera's
        // per-eye viewports applied to a 768x432 target, which reads as a
        // fragment of the scene. Turning xr.enabled off for the call is the
        // supported way to render a secondary view mid-frame.
        //
        // It also stops updateCamera() reading this camera's near/far (0.05 vs
        // the main camera's 0.1) and calling session.updateRenderState twice a
        // frame to thrash the session's depth range.
        //
        // None of this shows on desktop, where the inset renders through a
        // different path that only runs when NOT presenting.
        const wasXrEnabled = this.renderer.xr.enabled;
        this.renderer.xr.enabled = false;

        const previousTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(rt);
        this.renderer.render(scene, chaseCamera);
        this.renderer.setRenderTarget(previousTarget);

        this.renderer.xr.enabled = wasXrEnabled;
    }

    // Dismiss the panel only. The rocket is still coasting when the results
    // appear, so closing them is how a student gets an unobstructed view of it.
    _onResultClose() {
        this.hideResults();
    }

    // What closing used to do: back to the pad, ready to fly again.
    _onResultReset() {
        this.callbacks.onReset();
    }

    resetPanels() {
        this.graphPanel.reset();
        this.controlPanel.setDisabled('launch', false);
        this.controlPanel.render();
        this.hideResults();
        this.hideCamera();
    }

    /**
     * Trial quota spent: lock LAUNCH and say why.
     *
     * Called again after every reset, because resetPanels() re-enables LAUNCH
     * unconditionally — without this, RESET would hand back a sixth flight.
     */
    lockForTrialEnd() {
        this.controlPanel.setDisabled('launch', true);
        this.controlPanel.setLabel('launch', 'TRIAL ENDED');
        this.controlPanel.render();
        this.hudPanel.setTrialEnded(true);
    }
}
