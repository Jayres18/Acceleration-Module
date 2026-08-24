/**
 * Run with: node --test
 *
 * `question_properties_values` is a free-form JSON column that nothing
 * validates on the way in, so these cover what actually turns up in it rather
 * than what the shape is supposed to be. The failure that matters is the quiet
 * one: a question that loads with no usable target looks fine and grades
 * everyone as correct.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ChallengeManager reads URL-param targets at construction.
globalThis.window = { location: { search: '' } };

const { ChallengeManager } = await import('./ChallengeManager.js');

/** Silence the deliberate console.error calls; return what was logged. */
function captureErrors(fn) {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.join(' '));
    try {
        fn();
    } finally {
        console.error = original;
    }
    return logged;
}

let cm;
beforeEach(() => { cm = new ChallengeManager(); });

test('numeric strings are coerced, not left as strings', () => {
    cm.loadFromExam([
        { question_id: 1, question_properties_values: { target_peak_altitude: '500' } },
    ]);

    assert.equal(cm.targets.length, 1);
    assert.equal(cm.targets[0].value, 500);
    assert.equal(typeof cm.targets[0].value, 'number');
});

test('properties arriving as a JSON string are parsed', () => {
    cm.loadFromExam([
        {
            question_id: 1,
            // The column is JSON; it comes back as a string often enough to matter.
            question_properties_values: '{"target_max_velocity":"42"}',
        },
    ]);

    assert.equal(cm.targets.length, 1);
    assert.equal(cm.targets[0].value, 42);
});

test('null properties do not throw', () => {
    captureErrors(() => {
        assert.doesNotThrow(() => {
            cm.loadFromExam([{ question_id: 1, question_properties_values: null }]);
        });
    });
    assert.equal(cm.targets.length, 0);
});

test('`id` is accepted where `question_id` is missing', () => {
    cm.loadFromExam([{ id: 7, question_properties_values: { target_flight_time: '3' } }]);

    // The score payload has to carry the id the exam knows, or the whole
    // submission is rejected as "not part of this exam".
    cm.recordResult(true);
    assert.deepEqual(cm.getScores(), [{ question_id: 7, is_correct: true }]);
});

test('a half-numeric value is rejected rather than silently truncated', () => {
    const logged = captureErrors(() => {
        cm.loadFromExam([
            { question_id: 1, question_properties_values: { target_peak_altitude: '12abc' } },
        ]);
    });

    // parseFloat would have read this as 12 and graded against a target nobody set.
    assert.equal(cm.targets.length, 0);
    assert.ok(logged.some(l => l.includes('Non-numeric target')));
});

test('a question with no usable target cannot be passed', () => {
    captureErrors(() => {
        // The shape the lever exam actually returns — none of these are targets
        // this module understands.
        cm.loadFromExam([
            {
                question_id: 1,
                question_properties_values: { mass: '10', side: 'left', distance: '5' },
            },
        ]);
        cm.evaluate({ maxVelocity: 999, peakAltitude: 999 });
    });

    // [].every() is true, so the naive version awarded a mark to everyone who
    // launched at all.
    assert.deepEqual(cm.getScores(), [{ question_id: 1, is_correct: false }]);
});

test('unreached questions are included in the payload, marked incorrect', () => {
    cm.loadFromExam([
        { question_id: 1, question_properties_values: { target_peak_altitude: '10' } },
        { question_id: 2, question_properties_values: { target_peak_altitude: '20' } },
        { question_id: 3, question_properties_values: { target_peak_altitude: '30' } },
    ]);

    cm.evaluate({ peakAltitude: 50 });   // question 1 passed; 2 and 3 never reached

    // One POST per sitting means an omitted question is absent from the record,
    // not "unanswered" — so all three go.
    assert.deepEqual(cm.getScores(), [
        { question_id: 1, is_correct: true },
        { question_id: 2, is_correct: false },
        { question_id: 3, is_correct: false },
    ]);
});

test('re-evaluating the same question does not score it twice', () => {
    cm.loadFromExam([
        { question_id: 1, question_properties_values: { target_peak_altitude: '10' } },
    ]);

    cm.evaluate({ peakAltitude: 50 });
    cm.evaluate({ peakAltitude: 50 });

    assert.equal(cm.getScores().length, 1);
});

test('live payload: exam 42, this module\'s exam', () => {
    // Fetched from the portal backend 2026-08-12. Every value is a string.
    cm.loadFromExam([{
        question_id: 57,
        question_properties_values: {
            target_avg_accel: '20',
            target_max_velocity: '10',
            target_peak_altitude: '12',
        },
    }]);

    assert.equal(cm.targets.length, 3);
    assert.deepEqual(
        cm.targets.map(t => [t.key, t.value]).sort(),
        [['avgAcceleration', 20], ['maxVelocity', 10], ['peakAltitude', 12]].sort(),
    );

    // A flight that clears all three, and one that misses a single target.
    cm.evaluate({ avgAcceleration: 25, maxVelocity: 15, peakAltitude: 30 });
    assert.deepEqual(cm.getScores(), [{ question_id: 57, is_correct: true }]);
});

test('live payload: exam 41, three questions with no properties at all', () => {
    // Also fetched 2026-08-12 — `question_properties_values` is `{}` on all
    // three. Nothing here is gradeable, and the old `[].every()` behaviour
    // handed every student a perfect score for launching once.
    const logged = captureErrors(() => {
        cm.loadFromExam([
            { question_id: 54, question_properties_values: {} },
            { question_id: 55, question_properties_values: {} },
            { question_id: 56, question_properties_values: {} },
        ]);
        cm.evaluate({ maxVelocity: 999, peakAltitude: 999, avgAcceleration: 999 });
    });

    assert.ok(logged.some(l => l.includes('no usable targets')));
    assert.deepEqual(cm.getScores(), [
        { question_id: 54, is_correct: false },
        { question_id: 55, is_correct: false },
        { question_id: 56, is_correct: false },
    ]);
});

test('a non-array payload leaves the module in free play', () => {
    cm.loadFromExam(undefined);
    assert.equal(cm.isExamMode, false);

    cm.loadFromExam({ question_id: 1 });
    assert.equal(cm.isExamMode, false);
});
