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

        // Flight result accumulators (reset before each launch)
        this.flightTime = 0;
        this.distanceTraveled = 0;
        this.maxVelocity = 0;
        this.peakAltitude = 0;
        this._accelSum = 0;
        this._accelCount = 0;
        this.launchForce = 0;
        this.launchMass = 0;
    }

    setParameters(mass, thrust) {
        if (!this.isLaunched) {
            this.mass = mass;
            this.thrust = thrust;
        }
    }

    launch() {
        this.isLaunched = true;
        this.launchForce = this.thrust;
        this.launchMass = this.mass;
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

        // Accumulate flight stats before ground collision zeroes things out
        this.flightTime += deltaTime;
        this.distanceTraveled += Math.abs(this.velocity) * deltaTime;
        if (this.velocity > this.maxVelocity) this.maxVelocity = this.velocity;
        if (this.altitude > this.peakAltitude) this.peakAltitude = this.altitude;
        this._accelSum += this.acceleration;
        this._accelCount++;

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

    getResults() {
        return {
            launchForce: this.launchForce,
            rocketMass: this.launchMass,
            maxVelocity: this.maxVelocity,
            avgAcceleration: this._accelCount > 0 ? this._accelSum / this._accelCount : 0,
            peakAltitude: this.peakAltitude,
            flightTime: this.flightTime,
            distanceTraveled: this.distanceTraveled,
        };
    }
}
