// xr/VRCameraPanel.js
import * as THREE from 'three';

// A non-interactive "monitor" panel that displays the rocket chase camera.
// Unlike VRPanel (canvas-backed), it is backed by a WebGLRenderTarget that the
// XRHandler renders the chase view into each frame. Not registered for
// raycasting — it has no interactive elements.
export class VRCameraPanel {
    constructor(worldW = 0.95, worldH = 0.534) {   // ~16:9
        // 768x432 rather than 512x288: the panel is large enough in the
        // headset that the lower resolution reads as soft.
        this.renderTarget = new THREE.WebGLRenderTarget(768, 432);
        this.renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
        this.renderTarget.texture.minFilter = THREE.LinearFilter;
        this.renderTarget.texture.magFilter = THREE.LinearFilter;

        // Border frame — a slightly larger dark plane behind the live view.
        const frame = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW + 0.03, worldH + 0.03),
            new THREE.MeshBasicMaterial({ color: 0x0a1030, side: THREE.DoubleSide })
        );

        // Live view — plane textured from the render target.
        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW, worldH),
            new THREE.MeshBasicMaterial({
                map: this.renderTarget.texture,
                side: THREE.DoubleSide,
            })
        );
        screen.position.z = 0.001;   // avoid z-fighting with the frame

        this.mesh = new THREE.Group();
        this.mesh.add(frame);
        this.mesh.add(screen);
        this.mesh.visible = false;
    }
}
