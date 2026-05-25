// api/ExamService.js
const BASE_URL = 'http://192.168.102.62:5000/api';

export class ExamService {
    /**
     * Fetch all questions for an exam.
     * @param {number|string} examId
     * @returns {Promise<Array<{question_id: number, question_properties_values: object}>>}
     */
    async fetchQuestions(examId) {
        const resp = await fetch(`${BASE_URL}/questions/exam/${examId}`);
        if (!resp.ok) {
            throw new Error(`Failed to load exam questions (HTTP ${resp.status})`);
        }
        return await resp.json();
    }

    /**
     * Submit per-question pass/fail scores.
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
            throw new Error(`Score submission failed (HTTP ${resp.status})`);
        }
    }
}
