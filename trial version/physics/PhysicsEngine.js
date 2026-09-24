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
        // Raised at burnout and held for the rest of the flight. The rocket
        // coasts on instead of falling back, so `isLaunched` never clears and
        // this is the edge the app watches to end the flight.
        this.isCoasting = false;
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

    /**
     * True if current thrust beats the rocket's weight, i.e. the net force is
     * upward and the rocket will actually leave the ground. When false, the
     * rocket stays put (velocity, acceleration, altitude remain 0).
     */
    willLiftOff() {
        return this.thrust + this.mass * this.gravity > 0;
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
            // Out of fuel: the rocket coasts on at the speed it reached rather
            // than falling back. Gravity is deliberately dropped here — the
            // flight is over as far as the numbers go (RocketApp._animate
            // captures them on this edge) and what follows is the rocket
            // carrying on into space until RESET.
            this.acceleration = 0;
            this.thrust = 0;
            this.fuel = 0;
            this.isCoasting = true;
        }

        // Update velocity
        this.velocity += this.acceleration * deltaTime;

        // Update altitude
        this.altitude += this.velocity * deltaTime;

        // Accumulate flight stats before ground collision zeroes things out.
        // Powered frames only: the coast is unbounded, so feeding it in would
        // grow flightTime, distance and peak altitude forever and make
        // getResults() depend on how long the student left the rocket flying.
        if (!this.isCoasting) {
            this.flightTime += deltaTime;
            this.distanceTraveled += Math.abs(this.velocity) * deltaTime;
            if (this.velocity > this.maxVelocity) this.maxVelocity = this.velocity;
            if (this.altitude > this.peakAltitude) this.peakAltitude = this.altitude;
            this._accelSum += this.acceleration;
            this._accelCount++;
        }

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
            isLaunched: this.isLaunched,
            isCoasting: this.isCoasting
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
