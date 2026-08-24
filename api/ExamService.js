// api/ExamService.js
//
// Root-relative on purpose, and the one place in this module where a leading
// slash is correct. `/api` is proxied to the portal backend at the server root
// and is shared by every module regardless of the subpath it is mounted under,
// so the request inherits the page's own scheme and host: no CORS, no mixed
// content, and no hardcoded IP to chase when the DHCP lease moves.
//
// An absolute URL here breaks in a way that is invisible on a desktop. The page
// is HTTPS (WebXR requires a secure context), so a plain-HTTP fetch to a LAN IP
// is active mixed content and Chromium blocks it silently — the quiz simply
// never loads, with no error a student can see. Loopback is exempt from that
// rule, which is why `http://127.0.0.1:5000` appears to work right up until it
// runs on a headset, where 127.0.0.1 is the headset.
//
// Only set VITE_API_BASE_URL if the backend is ever reachable over HTTPS.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ExamService {
    /**
     * Fetch all questions for an exam.
     *
     * Nothing validates the shape of an exam's `questions` column on the way
     * into the database, so nothing can be assumed about it on the way out.
     * Two responses in particular are not errors as far as `fetch` is
     * concerned and have to be caught here:
     *
     *   - a missing exam answers `res.json(undefined)` — HTTP 200 with an
     *     **empty body**, not a 404, and `resp.json()` throws on that
     *   - the body may be any JSON at all, so it is only usable once it has
     *     been confirmed to be an array
     *
     * @param {number|string} examId
     * @returns {Promise<Array<{question_id: number, question_properties_values: object}>>}
     */
    async fetchQuestions(examId) {
        const resp = await fetch(`${BASE_URL}/questions/exam/${examId}`);
        if (!resp.ok) {
            throw new Error(`Failed to load exam questions (HTTP ${resp.status})`);
        }

        // An empty body is how a missing exam comes back. Read as text first so
        // that case is distinguishable from genuinely malformed JSON.
        const body = (await resp.text()).trim();
        if (body === '') {
            throw new Error(`Exam ${examId} not found (empty response)`);
        }

        let questions;
        try {
            questions = JSON.parse(body);
        } catch {
            throw new Error(`Exam ${examId} returned malformed JSON`);
        }

        if (!Array.isArray(questions)) {
            throw new Error(`Exam ${examId} did not return a list of questions`);
        }
        return questions;
    }

    /**
     * Submit per-question pass/fail scores for the whole sitting.
     *
     * One call per sitting, not per question: the endpoint records a sitting
     * once and rejects a second submission for the same (student, exam) with a
     * 400, so posting each answer as it lands fails on every question after the
     * first.
     *
     * The server's own message is carried into the thrown error — "already
     * submitted for this exam" and "question is not part of this exam" are the
     * two failures a teacher can actually act on, and an HTTP status alone
     * hides which one happened.
     *
     * @param {number} userId
     * @param {number} examId
     * @param {Array<{question_id: number, is_correct: boolean}>} scores
     */
    async submitScores(userId, examId, scores) {
        const resp = await fetch(`${BASE_URL}/scores/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: userId,
                exam_id: examId,
                scores,
            }),
        });

        if (!resp.ok) {
            let detail = '';
            try {
                const body = await resp.json();
                detail = body?.message ?? body?.error ?? '';
            } catch {
                // Non-JSON error body (an nginx page, say). The status still tells
                // the student something, so this must not mask it.
            }
            throw new Error(
                detail
                    ? `${detail} (HTTP ${resp.status})`
                    : `Score submission failed (HTTP ${resp.status})`,
            );
        }
    }
}
