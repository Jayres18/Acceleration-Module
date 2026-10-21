import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { asset } from '../assetPath.js';

// Space transition. Ground-level fog gives the pad its depth, but a rocket
// that coasts on after burnout would hang in flat blue with nothing moving,
// so the fog fades out as it climbs from SPACE_START to SPACE_START +
// SPACE_SPAN metres. The page background is #000, so the far end of that ramp
// is genuinely black sky.
//
// Burnout altitude is frame-rate dependent, because fuel burns per frame
// rather than per second: a default launch (10 kg, 150 N) cuts out around
// 29 m at 17 m/s on a 60 Hz display and around 13 m at 12 m/s on a 90 Hz one.
// These thresholds sit just above that, so the sky starts clearing shortly
// into the coast and is black within about ten seconds of it. A harder launch
// gets there mid-burn, which is as it should be.
const FOG_DENSITY = 0.008;
const SPACE_START = 30;
const SPACE_SPAN  = 170;

// Tone-mapping exposure for the main render, and for the chase view — see
// setChaseLight(). The chase view is a close-up of a near-black model against
// black, and needs roughly double the exposure of the wide shot to read.
const BASE_EXPOSURE  = 1.0;
const CHASE_EXPOSURE = 2.4;

// Where the pad stands on desktop. In XR it moves beside the main panel —
// see setPadPosition.
const DESKTOP_PAD = { x: 0, z: -2.5 };
const GROUND_Y = -1.5;

export class MainScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x08091a, FOG_DENSITY);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.6, 5);
        this.camera.lookAt(0, 1.6, 0);
        this._tmpSize = new THREE.Vector2();
        this._passthrough = false;

        // Resolves once the rocket is on the pad (or has failed to load), so XR
        // can show a Loading panel instead of an empty pad.
        this.ready = new Promise(resolve => { this._resolveReady = resolve; });

        // Do NOT delete window.XRWebGLBinding here. It reads as a harmless way
        // to push three.js onto the older XRWebGLLayer path — it is guarded by
        // a `typeof` check (WebXRManager.js) so it throws nothing — but it is
        // what made every immersive session on a Quest 3 render pure black.
        //
        // VRButton hardcodes 'layers' into the session's optionalFeatures, and
        // the headset grants it. Without XRWebGLBinding, three.js decides
        // layers are unsupported and calls updateRenderState({ baseLayer }),
        // which the spec forbids on a session that was granted 'layers':
        //
        //   Failed to execute 'updateRenderState' on 'XRSession':
        //   Can't use baseLayer with layers feature requested
        //
        // That rejects inside WebXRManager.setSession, so animation.start() is
        // never reached: the session presents, the frame loop never runs, and
        // the student sees nothing at all — no rocket, no panels, no hands.
        //
        // None of it is visible on a desktop, which never gets a session and
        // never has the feature granted. Verified on a Quest 3 on 2026-09-22.

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0); // fully transparent
        this.renderer.xr.enabled = true;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = BASE_EXPOSURE;


        document.body.appendChild(this.renderer.domElement);

        this._initLights();
        this._initEnvironment();
        this._initRocket();

        window.addEventListener('resize', () => this._onResize());
    }

    // ── Lights ─────────────────────────────────────────────────────────

    _initLights() {
        // Deep space ambient — cold, and low enough to keep the night-launch
        // look, but not so low that the rocket's near-black body (its darkest
        // material has a base colour of 0.03) sinks into the background.
        this.scene.add(new THREE.AmbientLight(0x161e2c, 0.6));

        // Image-based light. Most of the rocket's materials are metallic
        // (metalness 0.57-0.81), and a metal has no diffuse response — with no
        // environment to reflect it renders black no matter how bright the key
        // light is, so brightening the lights alone does not fix it.
        //
        // RoomEnvironment is generated procedurally on the GPU at startup: no
        // HDR file in the deploy zip and no network request, which is the same
        // constraint that puts the Draco decoder and hand profiles in public/.
        //
        // Nothing else in the scene is affected — the VR panels and the exhaust
        // are MeshBasicMaterial (unlit) and the stars are Points.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const room = new RoomEnvironment();
        this.scene.environment = pmrem.fromScene(room, 0.04).texture;
        this.scene.environmentIntensity = 0.18;
        room.dispose();
        pmrem.dispose();

        // Sun — angled, warm key light
        const sun = new THREE.DirectionalLight(0xffeedd, 1.35);
        sun.position.set(8, 14, 6);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 80;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        this.scene.add(sun);

        // Cool fill from the opposite side
        const fill = new THREE.DirectionalLight(0x2e508c, 0.4);
        fill.position.set(-6, 4, -8);
        this.scene.add(fill);

        // Pad glow — orange point light beneath the rocket
        this._padLight = new THREE.PointLight(0xff6622, 0, 6);
        this._padLight.position.set(0, 0.3, -2.5);
        this.scene.add(this._padLight);
    }

    // ── Environment ────────────────────────────────────────────────────

    _initEnvironment() {
        // // Sky sphere with vertical gradient via vertex colors
        // const skyGeo = new THREE.SphereGeometry(480, 20, 10);
        // const skyColors = [];
        // const pos = skyGeo.attributes.position;
        // for (let i = 0; i < pos.count; i++) {
        //     const t = Math.max(0, pos.getY(i) / 480); // 0..1
        //     // interpolate horizon (#0d1b3e) → zenith (#02040f)
        //     skyColors.push(
        //         THREE.MathUtils.lerp(0x0d / 255, 0x02 / 255, t),
        //         THREE.MathUtils.lerp(0x1b / 255, 0x04 / 255, t),
        //         THREE.MathUtils.lerp(0x3e / 255, 0x0f / 255, t),
        //     );
        // }
        // skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
        // const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
        // this.scene.add(new THREE.Mesh(skyGeo, skyMat));

        // Stars
        const starCount = 2500;
        const starPos = new Float32Array(starCount * 3);
        const starSizes = new Float32Array(starCount);
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);
            const r     = 450 + Math.random() * 20;
            starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)); // upper hemisphere only
            starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            starSizes[i] = 0.4 + Math.random() * 1.2;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        starGeo.setAttribute('size',     new THREE.Float32BufferAttribute(starSizes, 1));
        this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.7,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
        }));
        this.scene.add(this.stars);

        // Ground and pad, for desktop and full VR. Without them an immersive-vr
        // session is a rocket hanging in a black void (B24). Hidden in
        // passthrough, where the classroom floor is the ground.
        this.ground = new THREE.Group();
        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(60, 64),
            new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.95, metalness: 0.05 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = GROUND_Y;
        floor.receiveShadow = true;
        this.ground.add(floor);

        this._pad = new THREE.Mesh(
            new THREE.RingGeometry(0.75, 0.85, 48),
            new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide })
        );
        this._pad.rotation.x = -Math.PI / 2;
        this._pad.position.set(DESKTOP_PAD.x, GROUND_Y + 0.005, DESKTOP_PAD.z);
        this.ground.add(this._pad);
        this.scene.add(this.ground);

        // // Ground — dark concrete-like plane
        // const ground = new THREE.Mesh(
        //     new THREE.PlaneGeometry(300, 300, 30, 30),
        //     new THREE.MeshStandardMaterial({ color: 0x1a1e28, roughness: 0.95, metalness: 0.05 })
        // );
        // ground.rotation.x = -Math.PI / 2;
        // ground.receiveShadow = true;
        // ground.position.y = -2;
        // this.scene.add(ground);

        // // Launch platform
        // const padMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, roughness: 0.8, metalness: 0.2 });
        // const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.3, 32), padMat);
        // pad.position.y = 0.15;
        // pad.castShadow = true;
        // pad.receiveShadow = true;
        // pad.position.set(0, -1.7, -2.5);
        // this.scene.add(pad);
        //
        // // Pad ring glow strip
        // const ring = new THREE.Mesh(
        //     new THREE.TorusGeometry(3.4, 0.08, 8, 48),
        //     new THREE.MeshBasicMaterial({ color: 0xff5500 })
        // );
        // ring.rotation.x = -Math.PI / 2;
        // ring.position.set(0, -1.45, -2.5)
        // this.scene.add(ring);

        // // Distant silhouette hills
        // const hillMat = new THREE.MeshBasicMaterial({ color: 0x080c18 });
        // [
        //     { x:  90, z: -180, rx: 30, ry: 18, rz: 30 },
        //     { x: -70, z: -160, rx: 24, ry: 14, rz: 24 },
        //     { x: 140, z: -220, rx: 20, ry: 12, rz: 20 },
        //     { x: -130, z: -200, rx: 28, ry: 16, rz: 28 },
        // ].forEach(({ x, z, rx, ry, rz }) => {
        //     const h = new THREE.Mesh(
        //         new THREE.SphereGeometry(1, 10, 6),
        //         hillMat
        //     );
        //     h.scale.set(rx, ry, rz);
        //     h.position.set(x, ry - 2, z);
        //     this.scene.add(h);
        // });

        // // Support gantry — simple scaffold beside the pad
        // const girderMat = new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.6, roughness: 0.4 });
        // const gantryGroup = new THREE.Group();
        // gantryGroup.position.set(1.3, 0, -2.5);
        // // Vertical column
        // const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.5, 0.18), girderMat);
        // col.position.y = 2.25;
        // col.castShadow = true;
        // gantryGroup.add(col);
        // // Cross arms
        // [0.8, 1.6, 2.6, 3.6].forEach(y => {
        //     const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), girderMat);
        //     arm.position.set(-0.75, y, -2.5);
        //     gantryGroup.add(arm);
        // });
        // gantryGroup.scale.setScalar(0.5);
        // this.scene.add(gantryGroup);
    }

    // ── Rocket (GLTF model) ────────────────────────────────────────────

    _initRocket() {
        // Yaw applied to the rocket model inside rocketGroup. The chase camera
        // hangs off rocketGroup rather than off the model, so it does not
        // inherit this and has to be swung by the same angle to keep framing
        // the same face — one constant so the two cannot drift apart.
        const ROCKET_YAW = Math.PI * 3 / 2;

        this.rocketGroup = new THREE.Group();
        this.rocketGroup.position.set(DESKTOP_PAD.x, -1.45, DESKTOP_PAD.z);
        this.scene.add(this.rocketGroup);

        // Chase camera — a three-quarter view from behind and just below the
        // rocket's midpoint, far enough back that the whole 2 m model reads as
        // a rocket. Parented to rocketGroup so it tracks the rocket
        // automatically; the rocket only translates, so the framing stays fixed
        // for the whole flight (exhaust + star parallax convey motion).
        //
        // Mounted close underneath it instead, the perspective foreshortens the
        // body away to nothing and the monitor shows an unreadable cluster of
        // fins. The 55° vertical FOV at ~3 m puts about 3.1 m in frame, so the
        // model occupies roughly two thirds of the height with room for the
        // exhaust below it.
        this.chaseCamera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 1000);
        this.chaseCamera.position
            .set(1.5, 0.45, 2.6)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), ROCKET_YAW);
        this.rocketGroup.add(this.chaseCamera);
        this.rocketGroup.updateMatrixWorld(true);
        // The aim point is on the rocket's centre line, which is the axis of
        // that rotation, so it does not move and the framing is unchanged.
        this.chaseCamera.lookAt(
            this.rocketGroup.localToWorld(new THREE.Vector3(0, 1.0, 0))
        );

        // Fill light for the chase view only. The scene is lit for a night
        // launch — a dim ambient over a near-black rocket body — which reads
        // well at pad distance but leaves the monitor showing a silhouette.
        //
        // Parented to the chase camera so it lights whatever the monitor is
        // pointed at, and offset up and to one side of the lens rather than
        // sitting on it, so the body keeps some shading instead of going flat.
        // A PointLight, not a DirectionalLight: a directional's target would
        // stay at the world origin and swing as the rocket climbed.
        //
        // It is switched on only for the duration of a chase render (see
        // setChaseLight), so the main view — where the same rocket sits on a
        // deliberately dark pad — is unaffected.
        this._chaseLight = new THREE.PointLight(0xdce8ff, 22, 16, 2);
        this._chaseLight.position.set(0.5, 0.8, 0.5);
        this._chaseLight.visible = false;
        this.chaseCamera.add(this._chaseLight);

        // TEMPORARY DIAGNOSTIC — remove once the Quest 3 black screen is
        // settled. ?procrocket=1 builds the rocket from primitives instead of
        // loading Rocketv2.glb, leaving the model as the only difference
        // between two otherwise identical scenes. If VR renders with the flag
        // and not without it, the GLB — or a shader it needs compiled for the
        // XR render target — is the cause rather than the scene itself.
        // examLink strips only user_id and exam_id, so the flag survives load.
        if (new URLSearchParams(location.search).has('procrocket')) {
            this._initProceduralRocket();
            this._resolveReady();
            return;
        }

        // Rocketv2.glb is Draco-compressed (KHR_draco_mesh_compression is in
        // extensionsRequired), so GLTFLoader throws on it without a decoder.
        // The decoder is vendored in public/draco/ rather than pulled from
        // gstatic — same reason as the hand profiles: a classroom LAN has no
        // route out, and the failure is a silent empty pad on the headset.
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(asset('draco/'));

        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        loader.load(asset('models/rocket/Rocketv2.glb'), gltf => {
            const model = gltf.scene;

            // Three quarter-turns to the right (90 deg, then a further 180),
            // shared with the chase camera above.
            // Set before the measurements below, not after: Object3D composes
            // its matrix as T * R * S, so the centring offsets are applied
            // after this rotation — computing them in the unrotated frame
            // would swing the rocket off the pad. Box3.setFromObject reads
            // matrixWorld, so it picks this up, and an odd quarter-turn about
            // Y only swaps the X and Z extents, leaving the fitted scale and
            // the base height unchanged.
            model.rotation.y = ROCKET_YAW;

            // Normalise to a 2 m tall bounding box
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const scale = 2.0 / Math.max(size.x, size.y, size.z);
            model.scale.setScalar(scale);

            // Centre horizontally and seat base at y=0 of rocketGroup
            const fitted = new THREE.Box3().setFromObject(model);
            const centre = new THREE.Vector3();
            fitted.getCenter(centre);
            model.position.x -= centre.x;
            model.position.z -= centre.z;
            model.position.y -= fitted.min.y;

            model.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.rocketGroup.add(model);

            // One model, one decode — release the decoder worker.
            dracoLoader.dispose();
            this._resolveReady();
        }, undefined, err => {
            // Never fail silently: an unloaded rocket looks like an empty pad.
            console.error('[MainScene] rocket model failed to load', err);
            dracoLoader.dispose();
            this._resolveReady();
        });
    }

    /**
     * TEMPORARY DIAGNOSTIC — see the ?procrocket branch in _initRocket.
     *
     * A rocket built from primitives, to the same contract as the loaded one:
     * 2 m tall, base seated at y = 0 of rocketGroup, shadows on. Deliberately
     * MeshStandardMaterial rather than MeshBasicMaterial, so the experiment
     * changes the model and nothing else — an unlit stand-in would also be
     * testing the lighting.
     */
    _initProceduralRocket() {
        const hullMat = new THREE.MeshStandardMaterial({
            color: 0xb8c4d4, roughness: 0.45, metalness: 0.55,
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xd9452f, roughness: 0.5, metalness: 0.2,
        });

        const rocket = new THREE.Group();

        // skirt 0 → 0.22, hull 0.22 → 1.45, nose 1.45 → 2.00
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.22, 24), trimMat);
        skirt.position.y = 0.11;
        rocket.add(skirt);

        const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.23, 24), hullMat);
        hull.position.y = 0.835;
        rocket.add(hull);

        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 24), trimMat);
        nose.position.y = 1.725;
        rocket.add(nose);

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.3), trimMat);
            fin.position.set(Math.sin(angle) * 0.3, 0.445, Math.cos(angle) * 0.3);
            fin.rotation.y = -angle;
            rocket.add(fin);
        }

        rocket.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.rocketGroup.add(rocket);
        console.info('[MainScene] procrocket: using the procedural rocket, Rocketv2.glb not loaded');
    }

    // ── Runtime updates ────────────────────────────────────────────────

    updateRocket(altitude, isThrusting) {
        this.rocketGroup.position.y = -1.5 + altitude;

        // Pad glow when thrusting
        this._padLight.intensity = isThrusting ? 2.5 : 0;

        // Clear the sky as the rocket leaves the atmosphere. Runs in XR too:
        // it is the world changing, not the camera. Reset paths call
        // updateRocket(0, false), which puts t back to 0 and restores the pad.
        const t = THREE.MathUtils.clamp((altitude - SPACE_START) / SPACE_SPAN, 0, 1);
        // No fog over passthrough: it would tint the rocket against a real room.
        this.scene.fog.density = this._passthrough ? 0 : FOG_DENSITY * (1 - t);

        // Desktop camera follow (ignored in XR — headset controls the camera)
        if (!this.renderer.xr.isPresenting) {
            // Carry the star dome along, keeping the rocket a few hundred
            // metres inside its 450-unit radius so it never climbs out of the
            // stars. Only here: in XR the headset stays at the pad, and a sky
            // that flies away from a standing student is worse than a fixed one.
            this.stars.position.y = (altitude - SPACE_START) * t;
            if (altitude > 5) {
                // Trail at 0.8x down low so the pad visibly drops away, then
                // blend to keeping pace: at a flat 0.8x the coast is
                // unbounded and the rocket recedes into a speck, which wastes
                // the star field it is supposed to be flying through.
                this.camera.position.y = 1.6 + altitude * (0.8 + 0.2 * t);
                this.camera.lookAt(0, altitude, 0);
            } else {
                this.camera.position.set(0, 1.6, 5);
                this.camera.lookAt(0, 1.6, 0);
            }
        }
    }

    /**
     * Passthrough (an immersive-ar session): the room is the backdrop, so the
     * star field and the ground go, and so does the fog. The stars in
     * particular are fogged to near-black at their distance and would show as
     * dark dots painted over the ceiling.
     */
    setPassthrough(on) {
        this._passthrough = !!on;
        this.stars.visible = !on;
        this.ground.visible = !on;
        if (on) this.scene.fog.density = 0;
    }

    /**
     * Move the launch pad. XR puts it beside the main panel rather than behind
     * it; null puts it back where the desktop camera expects it.
     */
    setPadPosition(x, z) {
        if (x === null || x === undefined) ({ x, z } = DESKTOP_PAD);
        this.rocketGroup.position.x = x;
        this.rocketGroup.position.z = z;
        this._padLight.position.x = x;
        this._padLight.position.z = z;
        this._pad.position.x = x;
        this._pad.position.z = z;
    }

    /**
     * Light the rocket for a chase render, and put it back afterwards.
     *
     * Both chase paths must bracket their render with this: the desktop inset
     * below, and XRHandler.renderCameraView for the VR monitor. Left on, it
     * would brighten the rocket in the main view too and undo the night-launch
     * lighting; left off, the monitor shows a silhouette.
     *
     * Exposure as well as the fill light, because the fill light alone cannot
     * do it: the rocket's darkest material has a base colour of 0.03, so its
     * diffuse response to any amount of light is nearly nil, and raising the
     * lamp further only blows out the speculars. Exposure multiplies the whole
     * chase image before tone mapping, which lifts the body itself. ACES rolls
     * the highlights off, so the bright trim does not clip.
     */
    setChaseLight(on) {
        this._chaseLight.visible = on;
        this.renderer.toneMappingExposure = on ? CHASE_EXPOSURE : BASE_EXPOSURE;
    }

    /**
     * Render the chase-camera view into a screen-space rectangle of the main
     * canvas (desktop picture-in-picture). `rect` is a getBoundingClientRect()
     * result — CSS pixels, top-left origin. Must be called AFTER the main
     * scene render so it overlays.
     */
    renderChaseInset(rect) {
        const w = rect.width;
        const h = rect.height;
        if (w <= 0 || h <= 0) return;

        // WebGL viewport origin is bottom-left; flip Y from the CSS rect.
        const canvasCssH = this.renderer.domElement.clientHeight;
        const x = rect.left;
        const y = canvasCssH - rect.bottom;

        this.chaseCamera.aspect = w / h;
        this.chaseCamera.updateProjectionMatrix();

        const r = this.renderer;
        r.setScissorTest(true);
        r.setScissor(x, y, w, h);
        r.setViewport(x, y, w, h);
        this.setChaseLight(true);
        r.render(this.scene, this.chaseCamera);
        this.setChaseLight(false);

        // Restore the full-frame viewport/scissor for the next main render.
        r.setScissorTest(false);
        const size = r.getSize(this._tmpSize);
        r.setViewport(0, 0, size.x, size.y);
        r.setScissor(0, 0, size.x, size.y);
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render(callback) {
        this.renderer.setAnimationLoop(callback);
    }
}
