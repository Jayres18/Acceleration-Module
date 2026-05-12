import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.geometry = new THREE.SphereGeometry(0.1, 8, 8);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true });
    }

    createParticle(position) {
        const particle = new THREE.Mesh(this.geometry, this.material.clone());
        particle.position.copy(position);
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                -Math.random() * 2,
                (Math.random() - 0.5) * 0.5
            ),
            life: 1.0
        };
        this.scene.add(particle);
        this.particles.push(particle);
    }

    update(deltaTime, isThrusting, position) {
        if (isThrusting) {
            for (let i = 0; i < 5; i++) {
                this.createParticle(position);
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.add(p.userData.velocity.clone().multiplyScalar(deltaTime));
            p.userData.life -= deltaTime * 2;
            p.material.opacity = p.userData.life;
            p.scale.setScalar(p.userData.life);

            if (p.userData.life <= 0) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
            }
        }
    }
    
    reset() {
        this.particles.forEach(p => this.scene.remove(p));
        this.particles = [];
    }
}
