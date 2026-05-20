// URL param names are stubs — replace values in TARGETS_MAP when provided by teacher
const TARGETS_MAP = [
    { param: 'target_max_velocity',  key: 'maxVelocity',     label: 'Max Velocity',     unit: 'm/s',  decimals: 2 },
    { param: 'target_peak_altitude', key: 'peakAltitude',    label: 'Peak Altitude',    unit: 'm',    decimals: 2 },
    { param: 'target_avg_accel',     key: 'avgAcceleration', label: 'Avg Acceleration', unit: 'm/s²', decimals: 2 },
    { param: 'target_flight_time',   key: 'flightTime',      label: 'Flight Time',      unit: 's',    decimals: 2 },
];

export class ChallengeManager {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        this.targets = [];

        for (const def of TARGETS_MAP) {
            const raw = params.get(def.param);
            if (raw !== null) {
                const value = parseFloat(raw);
                if (!isNaN(value)) {
                    this.targets.push({ ...def, value });
                }
            }
        }

        this.isActive = this.targets.length > 0;
        this.attemptCount = 0;
    }

    // Returns array of { label, unit, decimals, target, actual, passed, delta }
    evaluate(results) {
        this.attemptCount++;
        return this.targets.map(t => {
            const actual = results[t.key] ?? 0;
            const passed = actual >= t.value;
            const delta  = actual - t.value;
            return { label: t.label, unit: t.unit, decimals: t.decimals, target: t.value, actual, passed, delta };
        });
    }

    // Called on every reset — intentionally preserves attemptCount
    reset() {}
}
