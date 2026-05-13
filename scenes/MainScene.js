import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class MainScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x08091a, 0.008);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.6, 5);
        this.camera.lookAt(0, 1.6, 0);

        delete window.XRWebGLBinding;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0); // fully transparent
        this.renderer.xr.enabled = true;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;


        document.body.appendChild(this.renderer.domElement);

        this._initLights();
        this._initEnvironment();
        this._initRocket();

        window.addEventListener('resize', () => this._onResize());
    }

    // ── Lights ─────────────────────────────────────────────────────────

    _initLights() {
        // Deep space ambient — very low, cold
        this.scene.add(new THREE.AmbientLight(0x101828, 0.6));

        // Sun — angled, warm key light
        const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
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
        const fill = new THREE.DirectionalLight(0x2244aa, 0.4);
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
        this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.7,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
        })));

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
        this.rocketGroup = new THREE.Group();
        this.rocketGroup.position.set(0, -1.45, -2.5);
        this.scene.add(this.rocketGroup);

        new GLTFLoader().load('./models/rocket/scene.gltf', gltf => {
            const model = gltf.scene;

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
        });
    }

    // ── Runtime updates ────────────────────────────────────────────────

    updateRocket(altitude, isThrusting) {
        this.rocketGroup.position.y = -1.5 + altitude;

        // Pad glow when thrusting
        this._padLight.intensity = isThrusting ? 2.5 : 0;

        // Desktop camera follow (ignored in XR — headset controls the camera)
        if (!this.renderer.xr.isPresenting) {
            if (altitude > 5) {
                this.camera.position.y = 1.6 + altitude * 0.8;
                this.camera.lookAt(0, altitude, 0);
            } else {
                this.camera.position.set(0, 1.6, 5);
                this.camera.lookAt(0, 1.6, 0);
            }
        }
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
