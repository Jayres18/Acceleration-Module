export class PhysicsEngine {
    constructor() {
        this.gravity = -9.81;
        this.reset();
    }

    reset() {
        this.mass = 10; // kg
        this.thrust = 0; // N
        this.velocity = 0; // m/s
        this.acceleration = 0; // m/s^2
        this.altitude = 0; // m
        this.isLaunched = false;
        this.fuel = 100; // %
        this.burnRate = 0.5; // % per update
    }

    setParameters(mass, thrust) {
        if (!this.isLaunched) {
            this.mass = mass;
            this.thrust = thrust;
        }
    }

    launch() {
        this.isLaunched = true;
    }

    update(deltaTime) {
        if (!this.isLaunched) return;

        if (this.fuel > 0) {
            // F_net = Thrust + Weight (Weight is negative because gravity is down)
            const weight = this.mass * this.gravity;
            const netForce = this.thrust + weight;
            
            this.acceleration = netForce / this.mass;
            this.fuel -= this.burnRate;
        } else {
            // Out of fuel, only gravity acts
            this.acceleration = this.gravity;
            this.thrust = 0;
            this.fuel = 0;
        }

        // Update velocity
        this.velocity += this.acceleration * deltaTime;

        // Update altitude
        this.altitude += this.velocity * deltaTime;

        // Ground collision
        if (this.altitude < 0) {
            this.altitude = 0;
            this.velocity = 0;
            this.acceleration = 0;
            this.isLaunched = false;
        }
    }

    getState() {
        return {
            velocity: this.velocity,
            acceleration: this.acceleration,
            altitude: this.altitude,
            fuel: this.fuel,
            isLaunched: this.isLaunched
        };
    }
}
