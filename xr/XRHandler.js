import * as THREE from 'three';
import { OculusHandModel } from 'three/examples/jsm/webxr/OculusHandModel.js';
import { VRMainPanel } from './VRMainPanel.js';
import { VRHUDPanel } from './VRHUDPanel.js';
import { VRResultPanel } from './VRResultPanel.js';
import { VRCameraPanel } from './VRCameraPanel.js';
import { VRWristMenu } from './VRWristMenu.js';
import { VRPanel } from './VRPanel.js';
import { MenuNav } from './MenuNav.js';
import { LAYOUT, eyeY, COLOR } from '../ui/tokens.js';
import { portalReturnUrl } from '../examLink.js';
import { asset } from '../assetPath.js';

/** Main-panel screens that show the flight controls. */
const CONTROL_SCREENS = new Set(['explore', 'quiz']);

/** Palm-up hysteresis, as the palm normal's world-up component. */
const PALM_OPEN = 0.65;
const PALM_CLOSE = 0.45;

export class XRHandler {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {object} callbacks  RocketApp callbacks
     * @param {ChallengeManager} challengeManager
     * @param {object} app  hooks back into RocketApp:
     *   isExam (a sitting is loaded), cameFromExam (opened with an exam_id),
 *   ready (Promise), onModeChange(mode|null), toggleNarration() → bool,
     *   examUnsaved() → bool, setPadPosition(x, z), setPassthrough(bool)
     */
    constructor(renderer, scene, callbacks, challengeManager = null, app = {}) {
        this.renderer          = renderer;
        this.scene             = scene;
        this.callbacks         = callbacks;
        this._challengeManager = challengeManager;
        this._app              = app;

        this._raycaster = new THREE.Raycaster();
        this._tempMat = new THREE.Matrix4();
        this._tmpV = new THREE.Vector3();
        this._tmpQ = new THREE.Quaternion();
        this._press = null;          // { ctrl, panel } while a select is held
        this._resultsOpen = false;
        this._firstEntry = true;
        this._ready = false;
        this._wristOwner = -1;       // input index holding the wrist menu
        this._wristByButton = false; // opened with X / Y rather than a palm
        this._prevMenuBtn = [false, false];
        this._audioCtx = null;

        // Everything XR-only hangs off this root, hidden outside a session —
        // the desktop has its own DOM UI and must not also render these.
        this._root = new THREE.Group();
        this._root.visible = false;
        this.scene.add(this._root);

        this.nav = new MenuNav();
        this._navHandlers = {
            back:  () => this._navBack(),
            menu:  () => this._navMenu(),
            reset: () => this._navReset(),
            exit:  () => this._navExit(),
        };

        this._initXRButton();
        this._initControllers();
        this._createPanels();
        this._listenForSession();
        this._loadFonts();

        Promise.resolve(app.ready).then(() => {
            this._ready = true;
            if (this.mainPanel.screen === 'loading' && this.renderer.xr.isPresenting) this._enterFirstScreen();
        });
    }

    // ── Setup ──────────────────────────────────────────────────────────

    _initXRButton() {
        // Origin at the head, not the floor. Every panel position is computed
        // from the eye (see ui/tokens.js), but three.js defaults to local-floor,
        // where y = 0 is the physical floor. Laid out for one and run in the
        // other, the whole layout drops to around the student's feet — 50-57°
        // below horizontal and outside the headset's ~±45° vertical field of
        // view, so entering XR shows nothing at all. None of it shows on desktop.
        //
        // 'local' needs no feature request — it is always available to an
        // immersive session — and it must be set before the session starts.
        this.renderer.xr.setReferenceSpaceType('local');

        // One entry button, labelled START XR in every module (B72). It starts
        // passthrough (immersive-ar) when the headset offers it, like the other
        // modules — full VR showed the student a black void around the pad
        // (B24) — and falls back to immersive-vr where it does not.
        //
        // The optional features are what three's VRButton requested, kept
        // as-is: 'layers' must stay requested — see the XRWebGLBinding note in
        // MainScene. hand-tracking is optional, never required: requestSession
        // rejects outright on a required feature the runtime lacks, which would
        // cost every controller-only student the session itself.
        const sessionInit = {
            optionalFeatures: ['local-floor', 'bounded-floor', 'layers', 'hand-tracking'],
        };

        const button = document.createElement('button');
        button.id = 'xr-button';
        button.textContent = 'START XR';
        button.style.display = 'none';
        document.body.appendChild(button);

        const unavailable = document.createElement('div');
        unavailable.id = 'xr-unavailable';
        unavailable.textContent = 'Open this module on the Quest headset to start';
        unavailable.style.display = 'none';
        document.body.appendChild(unavailable);

        this._xrButton = button;
        this._xrUnavailable = unavailable;

        const showUnavailable = () => { unavailable.style.display = ''; };

        // navigator.xr is absent outright over plain HTTP — see CLAUDE.md.
        if (!navigator.xr) { showUnavailable(); return; }

        (async () => {
            let mode = null;
            try {
                if (await navigator.xr.isSessionSupported('immersive-ar')) mode = 'immersive-ar';
                else if (await navigator.xr.isSessionSupported('immersive-vr')) mode = 'immersive-vr';
            } catch { /* treated as unsupported */ }
            if (!mode) { showUnavailable(); return; }

            button.style.display = '';
            button.addEventListener('click', async () => {
                const current = this.renderer.xr.getSession();
                if (current) { current.end(); return; }
                try {
                    const session = await navigator.xr.requestSession(mode, sessionInit);
                    await this.renderer.xr.setSession(session);
                } catch (err) {
                    console.error('[XR] could not start the session', err);
                }
            });
        })();
    }

    _initControllers() {
        this._controllers = [0, 1].map(i => {
            const ctrl = this.renderer.xr.getController(i);
            ctrl.userData.index = i;
            ctrl.addEventListener('connected',    e => { ctrl.userData.inputSource = e.data; });
            ctrl.addEventListener('disconnected', () => { ctrl.userData.inputSource = null; });
            ctrl.addEventListener('selectstart', e => this._onSelectStart(e));
            ctrl.addEventListener('selectend',   e => this._onSelectEnd(e));
            this._root.add(ctrl);

            // Ray from the target-ray space, for hands and controllers alike.
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1),
            ]);
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
                color: COLOR.textPrimary,
                transparent: true,
                opacity: 0.5,
            }));
            line.name = 'ray';
            line.scale.z = 4;
            ctrl.add(line);

            // A dot cursor where that ray meets a panel — one per input.
            const cursor = new THREE.Mesh(
                new THREE.SphereGeometry(0.008, 12, 12),
                new THREE.MeshBasicMaterial({ color: COLOR.accent, toneMapped: false }),
            );
            cursor.visible = false;
            this._root.add(cursor);
            ctrl.userData.cursor = cursor;
            return ctrl;
        });

        // Grip spaces: where a controller wrist menu is anchored.
        this._grips = [0, 1].map(i => {
            const grip = this.renderer.xr.getControllerGrip(i);
            this._root.add(grip);
            return grip;
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
        this._hands = [0, 1].map(i => {
            const hand = this.renderer.xr.getHand(i);
            const handModel = new OculusHandModel(hand);
            handModel.path = asset('hand-profiles/generic-hand/');
            hand.add(handModel);
            this._root.add(hand);
            return hand;
        });
    }

    _createPanels() {
        const isExam = !!this._app.isExam;

        this.mainPanel = new VRMainPanel({
            callbacks: this.callbacks,
            nav: this._navHandlers,
            challenge: this._challengeManager,
            isExam,
            actions: {
                go:   screen => this._go(screen),
                back: () => this._navBack(),
                toggleNarration: () => this.mainPanel.setNarration(this._app.toggleNarration?.() ?? true),
                leave: () => this._leave(),
            },
        });
        this._placeTop(this.mainPanel, LAYOUT.main, LAYOUT.main.h);

        this.hudPanel = new VRHUDPanel(this._challengeManager);
        this._placeTop(this.hudPanel, LAYOUT.right, this.hudPanel.worldH);

        // Results take over the main panel's spot while they are open.
        this.resultPanel = new VRResultPanel({
            nav: this._navHandlers,
            challenge: this._challengeManager,
            onNext: this.callbacks.onNext,
            onSubmit: this.callbacks.onSubmit,
            onReset: () => this.callbacks.onReset(),
        });
        this._placeTop(this.resultPanel, LAYOUT.main, LAYOUT.main.h);
        this.resultPanel.visible = false;

        // Rocket camera monitor — non-interactive, so never raycast.
        const camH = LAYOUT.left.w * 9 / 16;
        this.cameraPanel = new VRCameraPanel(LAYOUT.left.w, camH);
        this._placeCentre(this.cameraPanel.mesh, LAYOUT.left);
        this._root.add(this.cameraPanel.mesh);

        this.wristMenu = new VRWristMenu(this._navHandlers);
        this._root.add(this.wristMenu.object);

        this._interactive = [this.mainPanel, this.hudPanel, this.resultPanel, this.wristMenu];
    }

    /** Place a panel by its top edge, from a spec placement whose centre is given for height h. */
    _placeTop(panel, spec, h) {
        const top = eyeY(spec.centreY) + h / 2;
        this._orient(panel.object, spec, top);
        this._root.add(panel.object);
    }

    _placeCentre(object, spec) {
        this._orient(object, spec, eyeY(spec.centreY));
    }

    _orient(object, spec, y) {
        object.position.set(Math.sin(spec.yaw) * spec.distance, y, -Math.cos(spec.yaw) * spec.distance);
        // Turn to face the student first, then tilt back about the panel's own X.
        object.rotation.set(spec.tilt ?? 0, -spec.yaw, 0, 'YXZ');
    }

    _loadFonts() {
        // Canvas text cannot wait on a CSS font the way the DOM does: drawn
        // before Inter arrives, it is drawn in the fallback and stays that way.
        // So redraw every panel once the weights in use have loaded.
        if (!document.fonts?.load) return;
        Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 30px Inter`)))
            .then(() => VRPanel.all.forEach(p => p.render()))
            .catch(() => { /* the fallback font is still legible */ });
    }

    _listenForSession() {
        this.renderer.xr.addEventListener('sessionstart', () => {
            document.getElementById('ui-container').style.display = 'none';
            this._xrButton.style.display = 'none';
            this._root.visible = true;

            const session = this.renderer.xr.getSession();
            this._app.setPassthrough?.(session?.environmentBlendMode && session.environmentBlendMode !== 'opaque');
            const pad = LAYOUT.pad;
            this._app.setPadPosition?.(Math.sin(pad.yaw) * pad.distance, -Math.cos(pad.yaw) * pad.distance);

            if (this._ready) this._enterFirstScreen();
            else {
                this.nav = new MenuNav('loading');
                this.mainPanel.show('loading', { canGoBack: false });
            }
        });
        this.renderer.xr.addEventListener('sessionend', () => {
            document.getElementById('ui-container').style.display = '';
            this._xrButton.style.display = '';
            this._root.visible = false;
            this._press = null;
            this._wristByButton = false;
            this.wristMenu.visible = false;
            this._app.setPassthrough?.(false);
            this._app.setPadPosition?.(null);
            this._app.onModeChange?.(null);
        });
    }

    /** Start panel — with How to Use over it on the first entry (spec §8). */
    _enterFirstScreen() {
        this.nav = new MenuNav();
        if (this._firstEntry) {
            this._firstEntry = false;
            this.nav.go('howto');
        }
        this._showCurrent();
    }

    // ── Navigation ─────────────────────────────────────────────────────

    _go(screen) {
        this.nav.go(screen);
        this._showCurrent();
    }

    _showCurrent() {
        const screen = this.nav.current;
        if (CONTROL_SCREENS.has(screen)) this._app.onModeChange?.(screen);
        else if (screen.startsWith('learn-')) this._app.onModeChange?.('learn');

        this.mainPanel.show(screen, { canGoBack: this.nav.canGoBack });
        this._syncSpot();
    }

    /** Results own the main spot while open and the controls are the current screen. */
    _syncSpot() {
        const resultsHere = this._resultsOpen && CONTROL_SCREENS.has(this.nav.current);
        this.resultPanel.visible = resultsHere;
        this.mainPanel.visible = !resultsHere;
        this.wristMenu.setEnabled({
            back: this._backEnabled(),
            menu: this.nav.current !== 'start' || resultsHere,
        });
    }

    _examFlightOpen() {
        return this.resultPanel.visible && this.resultPanel.getElement('exam-action') !== null;
    }

    _backEnabled() {
        if (this.resultPanel.visible) return !this._examFlightOpen();
        return this.nav.canGoBack && this.nav.current !== 'loading';
    }

    _navBack() {
        if (!this._backEnabled()) return;
        if (this.resultPanel.visible) { this.hideResults(); return; }
        if (this.nav.back()) this._showCurrent();
    }

    _navMenu() {
        if (this.nav.current === 'loading') return;
        this.nav.home();
        this._showCurrent();
    }

    _navReset() {
        if (this.nav.current === 'loading' || this._examFlightOpen()) return;
        this.callbacks.onReset();
    }

    _navExit() {
        this.mainPanel.setExamWarning(!!this._app.examUnsaved?.());
        this._go('exit');
    }

    /** End the session, then return to the portal page that opened the module. */
    _leave() {
        const url = portalReturnUrl({
            modulePath: import.meta.env.BASE_URL,
            isExam: !!(this._app.cameFromExam ?? this._app.isExam),
        });
        const go = () => window.location.assign(url);
        const session = this.renderer.xr.getSession();
        if (session) session.end().then(go, go);
        else go();
    }

    // ── Controller events ──────────────────────────────────────────────

    _onSelectStart(e) {
        const ctrl = e.target;
        if (this._press) return;      // one press at a time
        const hit = this._castRay(ctrl);
        if (!hit) return;
        const kind = hit.panel.onSelectStart(hit.uv);
        if (!kind) return;
        this._press = { ctrl, panel: hit.panel, kind };
        this._pulse(ctrl);
    }

    _onSelectEnd(e) {
        const press = this._press;
        if (!press || press.ctrl !== e.target) return;
        this._press = null;
        const hit = this._castRay(press.ctrl);
        press.panel.onSelectEnd(hit && hit.panel === press.panel ? hit.uv : null);
    }

    _pulse(ctrl) {
        // 10 ms haptic tick on a press (spec §4). Hands have no actuator.
        const actuator = ctrl.userData.inputSource?.gamepad?.hapticActuators?.[0];
        try { actuator?.pulse?.(0.4, 10); } catch { /* not supported */ }
    }

    /** A soft tick on hover (spec §4) — synthesised, so there is no file to ship. */
    _tick() {
        try {
            this._audioCtx ??= new AudioContext();
            const ctx = this._audioCtx;
            const t = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 1800;
            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.035);
        } catch { /* no audio — the visual hover state still shows */ }
    }

    // ── Raycasting ─────────────────────────────────────────────────────

    _castRay(ctrl) {
        this._tempMat.identity().extractRotation(ctrl.matrixWorld);
        this._raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMat);

        // Visible panels only — the raycaster does not skip hidden meshes, and
        // a hidden panel must not swallow a press meant for what is in front.
        // Only the nearest hit counts: no click-through. The hand holding the
        // wrist menu cannot press it; the other hand does.
        const meshes = this._interactive
            .filter(p => p.visible && !(p === this.wristMenu && ctrl.userData.index === this._wristOwner))
            .map(p => p.mesh);
        const hits = this._raycaster.intersectObjects(meshes, false);
        if (hits.length > 0 && hits[0].uv) {
            return { panel: hits[0].object.userData.vrPanel, uv: hits[0].uv, point: hits[0].point };
        }
        return null;
    }

    // ── Per-frame update ───────────────────────────────────────────────

    update() {
        if (!this.renderer.xr.isPresenting) return;

        this._updateWristMenu();

        const hovered = new Map();
        for (const ctrl of this._controllers) {
            const cursor = ctrl.userData.cursor;
            const ray = ctrl.getObjectByName('ray');
            const hit = ctrl.visible ? this._castRay(ctrl) : null;
            if (hit) {
                if (!hovered.has(hit.panel)) hovered.set(hit.panel, hit.uv);
                if (ray) ray.scale.z = hit.point.distanceTo(this._tmpV.setFromMatrixPosition(ctrl.matrixWorld));
                cursor.position.copy(hit.point);
                cursor.visible = true;
                if (this._press?.ctrl === ctrl && hit.panel === this._press.panel) hit.panel.onSelectMove(hit.uv);
            } else {
                if (ray) ray.scale.z = 4;
                cursor.visible = false;
            }
        }

        for (const panel of this._interactive) {
            const uv = hovered.get(panel);
            if (uv) {
                if (panel.onHover(uv)) this._tick();
            } else {
                panel.onHoverEnd();
            }
        }
    }

    /**
     * Palm up (hands) or X / Y on the left controller opens the wrist menu.
     *
     * The palm normal is the wrist joint's -Y axis: WebXR hand joints follow
     * OpenXR, where +Y points out of the back of the hand. The Quest browser
     * keeps the left controller's ≡ button for itself, so X and Y stand in for
     * the spec's "menu button".
     */
    _updateWristMenu() {
        const camPos = this.renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
        let anchor = null;
        let owner = -1;

        // Left-controller X / Y: toggle on the press edge.
        this._controllers.forEach((ctrl, i) => {
            const src = ctrl.userData.inputSource;
            const pressed = !!(src && !src.hand && src.handedness === 'left'
                && (src.gamepad?.buttons?.[4]?.pressed || src.gamepad?.buttons?.[5]?.pressed));
            if (pressed && !this._prevMenuBtn[i]) this._wristByButton = !this._wristByButton;
            this._prevMenuBtn[i] = pressed;
            if (this._wristByButton && src && !src.hand && src.handedness === 'left') {
                anchor = this._grips[i].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
                owner = i;
            }
        });
        if (this._wristByButton && owner < 0) this._wristByButton = false;   // controller went away

        // Palm up.
        if (!anchor) {
            this._hands.forEach((hand, i) => {
                if (anchor) return;
                const wrist = hand.joints?.wrist;
                if (!wrist || !wrist.visible || !this._controllers[i].userData.inputSource?.hand) return;
                const up = this._tmpV.set(0, -1, 0).applyQuaternion(wrist.getWorldQuaternion(this._tmpQ)).y;
                const open = this._wristOwner === i ? up > PALM_CLOSE : up > PALM_OPEN;
                if (open) {
                    anchor = wrist.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.16, 0));
                    owner = i;
                }
            });
        }

        this._wristOwner = owner;
        const menu = this.wristMenu;
        if (anchor) {
            menu.object.position.copy(anchor);
            menu.object.lookAt(camPos);
            if (!menu.visible) {
                menu.visible = true;
                this._syncSpot();
            }
        } else if (menu.visible) {
            menu.visible = false;
            if (this._press?.panel === menu) this._press = null;
            menu.onHoverEnd();
        }
    }

    // ── State updates (called from animate loop) ───────────────────────

    updateHUD(state) {
        this.hudPanel.updateStats(state);
    }

    /** Show the challenge targets on Flight Data — only while a flight is graded. */
    setShowTargets(show) {
        this.hudPanel.setShowTargets(show);
    }

    showResults(results, challengeScore = null, attemptCount = 0) {
        this.resultPanel.setResults(results, challengeScore, attemptCount);
        this._resultsOpen = true;
        this._syncSpot();
    }

    hideResults() {
        this._resultsOpen = false;
        this._syncSpot();
    }

    /** Relay the sitting's save state to the VR result panel. */
    showSaveStatus(status, message = '') {
        this.resultPanel.showSaveStatus(status, message);
        this._syncSpot();
    }

    /** Re-render after question targets change (called by onNext). */
    refreshHUD() {
        this.hudPanel.setShowTargets(this.hudPanel._showTargets);
        this.mainPanel.render();
    }

    setLaunchEnabled(enabled) {
        this.mainPanel.setLaunchEnabled(enabled);
    }

    showLaunchFailed(thrust, weight) {
        this.mainPanel.setStatus(
            `Not enough thrust: ${thrust.toFixed(0)} N cannot lift ${weight.toFixed(1)} N of weight. `
            + 'Raise thrust or lower the mass.',
        );
        this.mainPanel.setLaunchEnabled(true);
    }

    clearLaunchFailed() {
        this.mainPanel.setStatus(null);
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
        //
        // The panels, rays and hands are hidden for the pass: the chase camera
        // looks back past the student, and they are not part of the flight.
        const wasXrEnabled = this.renderer.xr.enabled;
        this.renderer.xr.enabled = false;
        this._root.visible = false;

        const previousTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(rt);
        this.renderer.render(scene, chaseCamera);
        this.renderer.setRenderTarget(previousTarget);

        this._root.visible = true;
        this.renderer.xr.enabled = wasXrEnabled;
    }

    resetPanels() {
        this.hudPanel.reset();
        this.mainPanel.setLaunchEnabled(true);
        this.mainPanel.setStatus(null);
        this.hideResults();
        this.hideCamera();
    }
}
