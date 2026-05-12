import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

export class XRHandler {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;
        this.handModelFactory = new XRHandModelFactory();
        
        this.init();
    }

    init() {
        // Add VR Button with DOM Overlay support
        const overlay = document.getElementById('ui-container');
        document.body.appendChild(VRButton.createButton(this.renderer, {
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: overlay }
        }));

        // Setup Controllers/Hands
        this.controller1 = this.renderer.xr.getController(0);
        this.scene.add(this.controller1);

        this.controller2 = this.renderer.xr.getController(1);
        this.scene.add(this.controller2);

        // Hand tracking
        this.hand1 = this.renderer.xr.getHand(0);
        this.hand1.add(this.handModelFactory.createHandModel(this.hand1));
        this.scene.add(this.hand1);

        this.hand2 = this.renderer.xr.getHand(1);
        this.hand2.add(this.handModelFactory.createHandModel(this.hand2));
        this.scene.add(this.hand2);
    }
}
