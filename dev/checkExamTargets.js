/**
 * Report whether each exam question's targets are still reachable.
 *
 *   node dev/checkExamTargets.js              # exam 42, this module's own
 *   node dev/checkExamTargets.js 42 43        # specific exam ids
 *   node dev/checkExamTargets.js --scan 1-60  # sweep a range of ids
 *
 * Run it from a machine that can reach the portal backend; it reads
 * LMS_ORIGIN the same way vite.config.js does. It only ever GETs.
 *
 * Why this exists: a target is a threshold on a flight result, and what those
 * results *mean* changed when the rocket stopped falling back. Results are now
 * captured at burnout, so peak altitude is burnout altitude, flight time is the
 * burn duration, and average acceleration is exactly (F - mg)/m instead of a
 * figure diluted by free-fall frames. A target tuned against the old numbers
 * can quietly become unreachable — and an unreachable target is invisible from
 * the portal, because the module records a fail and says nothing.
 *
 * So rather than re-deriving the arithmetic, this sweeps the actual slider
 * space through the actual PhysicsEngine and asks the actual ChallengeManager
 * whether it passed. If the module can't pass it here, no student can.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ChallengeManager reads URL-param targets at construction, exactly as the
// tests do. Must be set before the import, hence the dynamic import below.
globalThis.window = { location: { search: '' } };

const { ChallengeManager } = await import(`file://${join(ROOT, 'ChallengeManager.js')}`);
const { PhysicsEngine }    = await import(`file://${join(ROOT, 'physics', 'PhysicsEngine.js')}`);

// Slider bounds, from index.html and VRControlPanel. A target is only fair if
// some point in here reaches it.
const MASS   = { min: 1,  max: 50,  step: 1 };
const THRUST = { min: 0,  max: 200, step: 5 };

/**
 * Fuel burns half a percent per *frame*, so the burn lasts 200 frames however
 * long a frame happens to be: the whole flight scales with refresh rate, and
 * with the time-scale slider on top of it. These are the combinations a
 * classroom actually produces — a target that only passes in one of them is
 * really a target on the hardware.
 */
const SCENARIOS = [
    { label: '60 Hz  x1.0', dt: 1 / 60  * 1.0 },
    { label: '72 Hz  x1.0', dt: 1 / 72  * 1.0 },
    { label: '90 Hz  x1.0', dt: 1 / 90  * 1.0 },
    { label: '120 Hz x1.0', dt: 1 / 120 * 1.0 },
    // The time-scale slider is the student's to move, so these two are
    // reported but not counted against the question: at 0.1x the whole flight
    // is too short to clear any altitude worth setting, and the fix is to put
    // the slider back rather than to edit the exam.
    { label: '60 Hz  x2.0', dt: 1 / 60  * 2.0, informational: true },
    { label: '120 Hz x0.1', dt: 1 / 120 * 0.1, informational: true },
];

function resolveOrigin() {
    if (process.env.LMS_ORIGIN) return process.env.LMS_ORIGIN;
    try {
        const line = readFileSync(join(ROOT, '.env'), 'utf8')
            .split(/\r?\n/)
            .find(l => /^\s*LMS_ORIGIN\s*=/.test(l));
        const value = line?.split('=').slice(1).join('=').trim();
        if (value) return value;
    } catch { /* no .env — fall through to the default */ }
    return 'http://parallaxed.local:5000';
}

/**
 * Fetch one exam. A missing exam answers 200 with an empty body rather than a
 * 404 — the same case ExamService.fetchQuestions has to special-case.
 */
async function fetchExam(origin, id) {
    const resp = await fetch(`${origin}/api/questions/exam/${id}`);
    if (!resp.ok) return { error: `HTTP ${resp.status}` };

    const body = (await resp.text()).trim();
    if (body === '') return { missing: true };

    try {
        const questions = JSON.parse(body);
        return Array.isArray(questions) ? { questions } : { error: 'not a list' };
    } catch {
        return { error: 'malformed JSON' };
    }
}

/** Fly one configuration to burnout and return its results. */
function fly(mass, thrust, dt) {
    const p = new PhysicsEngine();
    p.setParameters(mass, thrust);
    p.launch();
    // Either the rocket cuts out (isCoasting) or it never lifts and the ground
    // clamp ends it (isLaunched false). Both terminate; the cap is a backstop.
    for (let i = 0; i < 10000 && p.isLaunched && !p.isCoasting; i++) p.update(dt);
    return p.getResults();
}

/**
 * Sweep the slider space for one question, in one scenario.
 * Returns how many configurations pass and the gentlest one that does —
 * "gentlest" meaning least thrust, since that is the setting a student who is
 * reasoning about F = ma rather than dragging sliders to the end will find.
 */
function sweep(targets, dt) {
    let passes = 0, total = 0, easiest = null;

    for (let thrust = THRUST.min; thrust <= THRUST.max; thrust += THRUST.step) {
        for (let mass = MASS.min; mass <= MASS.max; mass += MASS.step) {
            const results = fly(mass, thrust, dt);
            total++;
            if (targets.every(t => (results[t.key] ?? 0) >= t.value)) {
                passes++;
                if (!easiest) easiest = { thrust, mass, results };
            }
        }
    }
    return { passes, total, easiest };
}

/** The question's properties as stored, which may arrive as a JSON string. */
function rawProps(question) {
    let props = question?.question_properties_values;
    if (typeof props === 'string') {
        try { props = JSON.parse(props); } catch { props = null; }
    }
    return props && typeof props === 'object' ? props : {};
}

/** Read a question's targets through the module's own parsing. */
function targetsOf(question) {
    const cm = new ChallengeManager();
    cm.loadFromExam([question]);
    return cm.targets;
}

const args    = process.argv.slice(2);
const scanArg = args.indexOf('--scan');
let ids;

if (scanArg !== -1) {
    const [from, to] = (args[scanArg + 1] ?? '').split('-').map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
        console.error('--scan needs a range, e.g. --scan 1-60');
        process.exit(1);
    }
    ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
} else {
    ids = args.filter(a => /^\d+$/.test(a)).map(Number);
    if (ids.length === 0) ids = [42];   // this module's only exam
}

const origin = resolveOrigin();
console.log(`Backend: ${origin}`);
console.log(`Exams:   ${ids.join(', ')}\n`);

let problems = 0;

for (const id of ids) {
    let exam;
    try {
        exam = await fetchExam(origin, id);
    } catch (err) {
        console.log(`exam ${id}: unreachable — ${err.message}`);
        problems++;
        continue;
    }

    if (exam.missing) { if (scanArg === -1) console.log(`exam ${id}: no such exam`); continue; }
    if (exam.error)   { console.log(`exam ${id}: ${exam.error}`); problems++; continue; }

    console.log(`exam ${id}: ${exam.questions.length} question(s)`);

    for (const q of exam.questions) {
        const qid     = q?.question_id ?? q?.id ?? '?';
        const targets = targetsOf(q);

        // Read from the raw property, not the parsed targets, and reported
        // before the no-targets case below — flight time was removed from
        // ChallengeManager's TARGETS_MAP because the burn is always 200 frames,
        // and a question carrying nothing else is exactly the one that needs to
        // hear why it has no targets left.
        const staleFlightTime = rawProps(q).target_flight_time !== undefined;

        if (targets.length === 0) {
            console.log(`  q${qid}: NO USABLE TARGETS — every student is marked incorrect`);
            if (staleFlightTime) {
                console.log('        (it sets only target_flight_time, which is no longer read)');
            }
            problems++;
            continue;
        }

        console.log(`  q${qid}: ${targets.map(t => `${t.label} >= ${t.value}${t.unit}`).join(', ')}`);

        if (staleFlightTime) {
            console.log('        ! target_flight_time is set but no longer read — every flight');
            console.log('          lasts the same 200 frames. Remove it from this question.');
            problems++;
        }

        for (const { label, dt, informational } of SCENARIOS) {
            const { passes, total, easiest } = sweep(targets, dt);
            const how = easiest
                ? `easiest ${easiest.thrust} N / ${easiest.mass} kg`
                : 'UNREACHABLE — no setting passes';
            const flag = passes > 0 ? '' : informational ? '  (time-scale extreme)' : '  <<<';
            console.log(`        ${label}: ${String(passes).padStart(4)}/${total} pass — ${how}${flag}`);
            if (passes === 0 && !informational) problems++;
        }
    }
    console.log('');
}

console.log(problems === 0
    ? 'All targets reachable.'
    : `${problems} problem(s) above need attention in the portal.`);
