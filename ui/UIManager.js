export class UIManager {
    constructor(callbacks, challengeManager = null) {
        this.callbacks = callbacks;
        this.challengeManager = challengeManager;
        this.initElements();
        this.initEvents();
        this.initGraph();
        this._buildChallengeCard();
    }

    initElements() {
        this.velocityVal = document.getElementById('velocity-val');
        this.accelVal    = document.getElementById('accel-val');
        this.altitudeVal = document.getElementById('altitude-val');
        this.fuelVal     = document.getElementById('fuel-val');

        this.thrustSlider = document.getElementById('thrust-slider');
        this.thrustLabel  = document.getElementById('thrust-label');
        this.massSlider   = document.getElementById('mass-slider');
        this.massLabel    = document.getElementById('mass-label');
        this.timeSlider   = document.getElementById('time-slider');
        this.timeLabel    = document.getElementById('time-label');

        this.launchBtn = document.getElementById('launch-btn');
        this.resetBtn  = document.getElementById('reset-btn');

        this.quizContainer = document.getElementById('quiz-container');
        this.quizOpts      = document.querySelectorAll('.quiz-opt');

        this.graphCanvas = document.getElementById('physics-graph');
        this.graphCtx    = this.graphCanvas.getContext('2d');

        this.resultPanel      = document.getElementById('result-panel');
        this.resLaunchForce   = document.getElementById('res-launch-force');
        this.resRocketMass    = document.getElementById('res-rocket-mass');
        this.resMaxVelocity   = document.getElementById('res-max-velocity');
        this.resAvgAccel      = document.getElementById('res-avg-accel');
        this.resPeakAltitude  = document.getElementById('res-peak-altitude');
        this.resFlightTime    = document.getElementById('res-flight-time');
        this.resDistance      = document.getElementById('res-distance');
        this.resultCloseBtn   = document.getElementById('result-close-btn');
        this.challengeResults = document.getElementById('challenge-results');
    }

    initEvents() {
        this.thrustSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.thrustLabel.textContent = val;
            this.callbacks.onThrustChange(val);
        });

        this.massSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.massLabel.textContent = val;
            this.callbacks.onMassChange(val);
        });

        this.timeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.timeLabel.textContent = val.toFixed(1);
            this.callbacks.onTimeChange(val);
        });

        this.launchBtn.addEventListener('click', () => {
            this.callbacks.onLaunch();
            this.launchBtn.disabled = true;
        });

        this.resetBtn.addEventListener('click', () => {
            this.callbacks.onReset();
            this.launchBtn.disabled = false;
        });

        this.resultCloseBtn.addEventListener('click', () => {
            // In exam mode, navigation is handled only by the Next/Submit buttons
            if (this.challengeManager?.isExamMode) return;
            this.callbacks.onReset();
            this.launchBtn.disabled = false;
        });

        this.quizOpts.forEach(opt => {
            opt.addEventListener('click', () => {
                const isCorrect = opt.getAttribute('data-correct') === 'true';
                if (isCorrect) {
                    opt.style.background = 'green';
                    alert('Correct! Acceleration is inversely proportional to mass (a = F/m).');
                } else {
                    opt.style.background = 'red';
                    alert('Try again. Think about Newton\'s Second Law.');
                }
            });
        });
    }

    initGraph() {
        this.graphData = [];
        this.maxDataPoints = 100;
    }

    _buildChallengeCard() {
        if (!this.challengeManager?.isActive) return;

        const card = document.createElement('div');
        card.id = 'challenge-card';
        card.className = 'panel';

        const isExam = this.challengeManager.isExamMode;
        const progressHTML = isExam
            ? (() => {
                  const { current, total } = this.challengeManager.questionProgress;
                  return `<div id="question-progress">Question ${current} of ${total}</div>`;
              })()
            : '';

        const targets = this.challengeManager.targets
            .map(t => `<div class="challenge-target">≥ ${t.value.toFixed(t.decimals)} ${t.unit} — ${t.label}</div>`)
            .join('');

        card.innerHTML = `
            <h3>Challenge Targets</h3>
            ${progressHTML}
            <div id="challenge-targets-list">${targets}</div>
            <div id="attempt-count">Attempt: 0</div>
        `;

        const controls = document.getElementById('controls');
        controls.parentNode.insertBefore(card, controls);

        this.challengeCard        = card;
        this.attemptCountEl       = card.querySelector('#attempt-count');
        this._questionProgressEl  = card.querySelector('#question-progress');
        this._challengeTargetsEl  = card.querySelector('#challenge-targets-list');
    }

    updateHUD(state) {
        this.velocityVal.textContent = state.velocity.toFixed(2);
        this.accelVal.textContent    = state.acceleration.toFixed(2);
        this.altitudeVal.textContent = state.altitude.toFixed(2);
        this.fuelVal.textContent     = state.fuel.toFixed(1);

        if (state.isLaunched) {
            this.quizContainer.style.display = 'block';
            this.graphData.push(state.acceleration);
            if (this.graphData.length > this.maxDataPoints) this.graphData.shift();
            this.drawGraph();
        }
    }

    drawGraph() {
        const ctx    = this.graphCtx;
        const width  = this.graphCanvas.width;
        const height = this.graphCanvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#00f';
        ctx.lineWidth   = 2;
        ctx.beginPath();

        const step = width / this.maxDataPoints;
        for (let i = 0; i < this.graphData.length; i++) {
            const x = i * step;
            const y = height - ((this.graphData[i] + 10) / 30) * height;
            if (i === 0) ctx.moveTo(x, y);
            else         ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font      = '10px Arial';
        ctx.fillText('Accel vs Time', 5, 12);
    }

    showResults(results, challengeScore = null) {
        this.resLaunchForce.textContent  = `${results.launchForce.toFixed(1)} N`;
        this.resRocketMass.textContent   = `${results.rocketMass.toFixed(1)} kg`;
        this.resMaxVelocity.textContent  = `${results.maxVelocity.toFixed(2)} m/s`;
        this.resAvgAccel.textContent     = `${results.avgAcceleration.toFixed(2)} m/s²`;
        this.resPeakAltitude.textContent = `${results.peakAltitude.toFixed(2)} m`;
        this.resFlightTime.textContent   = `${results.flightTime.toFixed(2)} s`;
        this.resDistance.textContent     = `${results.distanceTraveled.toFixed(2)} m`;

        if (challengeScore) this._renderChallengeScore(challengeScore);

        // Exam mode: show Next or Submit button; hide the CLOSE button
        if (this.challengeManager?.isExamMode) {
            this.resultCloseBtn.style.display = 'none';
            const btn = this._getOrCreateExamActionBtn();
            btn.disabled    = false;
            btn.textContent = this.challengeManager.isLastQuestion ? 'Submit Exam' : 'Next Question →';
            btn.onclick = this.challengeManager.isLastQuestion
                ? () => { btn.disabled = true; this.callbacks.onSubmit(); }
                : () => this.callbacks.onNext();
        }

        this.resultPanel.classList.add('visible');
    }

    /** Returns the exam action button, creating it inside #result-panel if absent. */
    _getOrCreateExamActionBtn() {
        let btn = document.getElementById('exam-action-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id        = 'exam-action-btn';
            btn.className = 'btn';
            btn.style.cssText = 'margin-top:12px;width:100%;padding:10px;font-size:1rem;';
            this.resultPanel.appendChild(btn);
        }
        return btn;
    }

    /** Called after successful score submission. */
    showExamSubmitted() {
        const btn = document.getElementById('exam-action-btn');
        if (btn) {
            btn.textContent = 'Exam Submitted ✓';
            btn.disabled    = true;
            btn.style.color = '#44ff88';
        }
    }

    /** Called when score submission fails — re-enables retry. */
    showSubmitError() {
        const btn = document.getElementById('exam-action-btn');
        if (btn) {
            btn.textContent = 'Retry Submit';
            btn.disabled    = false;
            btn.style.color = '';
        }
    }

    /**
     * Rebuilds the challenge card heading and targets after nextQuestion().
     * Called by onNext in main.js.
     */
    refreshChallengeCard() {
        if (!this.challengeManager?.isActive || !this.challengeCard) return;

        // Update question progress heading
        if (this.challengeManager.isExamMode && this._questionProgressEl) {
            const { current, total } = this.challengeManager.questionProgress;
            this._questionProgressEl.textContent = `Question ${current} of ${total}`;
        }

        // Re-render target list
        if (this._challengeTargetsEl) {
            this._challengeTargetsEl.innerHTML = this.challengeManager.targets
                .map(t => `<div class="challenge-target">≥ ${t.value.toFixed(t.decimals)} ${t.unit} — ${t.label}</div>`)
                .join('');
        }
    }

    _renderChallengeScore(challengeScore) {
        const rows = challengeScore.map(r => {
            const icon  = r.passed ? '✓' : '✗';
            const sign  = r.delta >= 0 ? '+' : '';
            const delta = `(${sign}${r.delta.toFixed(r.decimals)})`;
            return `
                <div class="challenge-score-row ${r.passed ? 'passed' : 'failed'}">
                    <span class="challenge-icon">${icon}</span>
                    <span class="challenge-score-label">${r.label}</span>
                    <span class="challenge-score-values">
                        ${r.actual.toFixed(r.decimals)} / ${r.target.toFixed(r.decimals)} ${r.unit}
                        <span class="challenge-delta">${delta}</span>
                    </span>
                </div>`;
        }).join('');

        this.challengeResults.innerHTML = `
            <hr class="challenge-divider">
            <p class="challenge-score-title">Challenge Score</p>
            <div class="challenge-score-grid">${rows}</div>
            <div class="attempt-display">Attempt ${this.challengeManager.attemptCount}</div>
        `;
    }

    hideResults() {
        this.resultPanel.classList.remove('visible');
    }

    resetUI() {
        this.graphData = [];
        this.drawGraph();
        this.launchBtn.disabled = false;
        this.quizContainer.style.display = 'none';
        this.quizOpts.forEach(opt => opt.style.background = '#00f');
        this.hideResults();
        this.challengeResults.innerHTML = '';
        if (this.attemptCountEl && this.challengeManager) {
            this.attemptCountEl.textContent = `Attempt: ${this.challengeManager.attemptCount}`;
        }
    }
}
