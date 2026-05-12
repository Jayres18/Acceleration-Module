import * as THREE from 'three';

export class MainScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 15);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.initLights();
        this.initEnvironment();
        this.initRocket();
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        this.scene.add(directionalLight);
    }

    initEnvironment() {
        // Ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);

        // Launch pad
        const padGeometry = new THREE.CylinderGeometry(5, 5, 0.5, 32);
        const padMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const pad = new THREE.Mesh(padGeometry, padMaterial);
        pad.position.y = 0.25;
        this.scene.add(pad);

        // Grid helper
        const grid = new THREE.GridHelper(100, 20);
        grid.position.y = 0.01;
        this.scene.add(grid);
    }

    initRocket() {
        this.rocketGroup = new THREE.Group();

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 32);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.5;
        this.rocketGroup.add(body);

        // Nose cone
        const noseGeo = new THREE.ConeGeometry(0.5, 1, 32);
        const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.y = 3.5;
        this.rocketGroup.add(nose);

        // Fins
        const finGeo = new THREE.BoxGeometry(0.1, 1, 1);
        const finMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.y = 0.5;
            fin.rotation.y = (i * Math.PI) / 2;
            fin.position.x = Math.cos((i * Math.PI) / 2) * 0.5;
            fin.position.z = Math.sin((i * Math.PI) / 2) * 0.5;
            this.rocketGroup.add(fin);
        }

        this.rocketGroup.position.y = 0.5;
        this.scene.add(this.rocketGroup);
    }

    updateRocket(altitude) {
        this.rocketGroup.position.y = 0.5 + altitude;
        
        // Follow camera
        if (altitude > 10) {
            this.camera.position.y = altitude + 5;
            this.camera.lookAt(0, altitude, 0);
        } else {
            this.camera.position.set(0, 5, 15);
            this.camera.lookAt(0, 2, 0);
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render(callback) {
        this.renderer.setAnimationLoop(callback);
    }
}
