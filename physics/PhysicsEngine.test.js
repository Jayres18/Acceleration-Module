// physics/PhysicsEngine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsEngine } from './PhysicsEngine.js';

const DT = 0.1;

/** Launch at (mass, thrust) and run until the engine reports burnout. */
function flyToBurnout(mass = 10, thrust = 150, dt = DT) {
    const p = new PhysicsEngine();
    p.setParameters(mass, thrust);
    p.launch();

    let frames = 0;
    while (!p.isCoasting && frames < 1000) {
        p.update(dt);
        frames++;
    }
    assert.ok(p.isCoasting, 'engine never reached burnout');
    return { p, frames };
}

test('burnout starts a coast instead of a fall', () => {
    const { p } = flyToBurnout();

    assert.equal(p.acceleration, 0, 'gravity must not act after burnout');
    assert.ok(p.velocity > 0, 'rocket should still be moving upward');
    assert.equal(p.isLaunched, true, 'the flight does not end at burnout');

    const coastVelocity = p.velocity;
    let altitude = p.altitude;

    for (let i = 0; i < 500; i++) {
        p.update(DT);
        assert.equal(p.acceleration, 0);
        assert.equal(p.velocity, coastVelocity, 'coast velocity must stay constant');
        assert.ok(p.altitude > altitude, 'rocket must keep climbing');
        altitude = p.altitude;
    }

    assert.equal(p.isLaunched, true, 'a coasting rocket never lands');
});

test('results are frozen at burnout and stay stable through the coast', () => {
    const { p, frames } = flyToBurnout();

    const atBurnout = p.getResults();

    // The powered phase is every frame but the one that detected burnout.
    assert.equal(atBurnout.flightTime.toFixed(6), ((frames - 1) * DT).toFixed(6));
    assert.equal(atBurnout.peakAltitude, p.altitude - p.velocity * DT);
    assert.equal(atBurnout.maxVelocity, p.velocity);
    // Powered acceleration is exactly (F - mg) / m, undiluted by any fall.
    assert.ok(Math.abs(atBurnout.avgAcceleration - (150 - 10 * 9.81) / 10) < 1e-9);

    for (let i = 0; i < 100; i++) p.update(DT);

    assert.deepEqual(p.getResults(), atBurnout, 'coasting must not alter the results');
});

test('isCoasting is false before burnout and cleared by reset', () => {
    const p = new PhysicsEngine();
    p.setParameters(10, 150);
    assert.equal(p.isCoasting, false);

    p.launch();
    p.update(DT);
    assert.equal(p.isCoasting, false, 'still burning fuel');

    while (!p.isCoasting) p.update(DT);

    p.reset();
    assert.equal(p.isCoasting, false, 'reset returns the rocket to the pad');
    assert.equal(p.fuel, 100);
});

test('a launch that cannot lift still lands and ends the flight', () => {
    const p = new PhysicsEngine();
    p.setParameters(10, 50);   // weight is 98.1 N — the rocket never leaves
    assert.equal(p.willLiftOff(), false);

    p.launch();
    p.update(DT);

    assert.equal(p.isLaunched, false, 'the ground clamp still ends the flight');
    assert.equal(p.isCoasting, false, 'a failed launch never coasts');
    assert.equal(p.altitude, 0);
});
