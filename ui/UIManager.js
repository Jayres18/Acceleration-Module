export class UIManager {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.initElements();
        this.initEvents();
        this.initGraph();
    }

    initElements() {
        this.velocityVal = document.getElementById('velocity-val');
        this.accelVal = document.getElementById('accel-val');
        this.altitudeVal = document.getElementById('altitude-val');
        this.fuelVal = document.getElementById('fuel-val');
        
        this.thrustSlider = document.getElementById('thrust-slider');
        this.thrustLabel = document.getElementById('thrust-label');
        this.massSlider = document.getElementById('mass-slider');
        this.massLabel = document.getElementById('mass-label');
        this.timeSlider = document.getElementById('time-slider');
        this.timeLabel = document.getElementById('time-label');
        
        this.launchBtn = document.getElementById('launch-btn');
        this.resetBtn = document.getElementById('reset-btn');
        
        this.quizContainer = document.getElementById('quiz-container');
        this.quizOpts = document.querySelectorAll('.quiz-opt');
        
        this.graphCanvas = document.getElementById('physics-graph');
        this.graphCtx = this.graphCanvas.getContext('2d');

        this.resultPanel = document.getElementById('result-panel');
        this.resLaunchForce  = document.getElementById('res-launch-force');
        this.resRocketMass   = document.getElementById('res-rocket-mass');
        this.resMaxVelocity  = document.getElementById('res-max-velocity');
        this.resAvgAccel     = document.getElementById('res-avg-accel');
        this.resPeakAltitude = document.getElementById('res-peak-altitude');
        this.resFlightTime   = document.getElementById('res-flight-time');
        this.resDistance     = document.getElementById('res-distance');
        this.resultCloseBtn  = document.getElementById('result-close-btn');
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

    updateHUD(state) {
        this.velocityVal.textContent = state.velocity.toFixed(2);
        this.accelVal.textContent = state.acceleration.toFixed(2);
        this.altitudeVal.textContent = state.altitude.toFixed(2);
        this.fuelVal.textContent = state.fuel.toFixed(1);
        
        if (state.isLaunched) {
            this.quizContainer.style.display = 'block';
            this.graphData.push(state.acceleration);
            if (this.graphData.length > this.maxDataPoints) {
                this.graphData.shift();
            }
            this.drawGraph();
        }
    }

    drawGraph() {
        const ctx = this.graphCtx;
        const width = this.graphCanvas.width;
        const height = this.graphCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const step = width / this.maxDataPoints;
        for (let i = 0; i < this.graphData.length; i++) {
            const x = i * step;
            // Map acceleration range [-10, 20] to height [height, 0]
            const y = height - ((this.graphData[i] + 10) / 30) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.fillText('Accel vs Time', 5, 12);
    }
    
    showResults(results) {
        this.resLaunchForce.textContent  = `${results.launchForce.toFixed(1)} N`;
        this.resRocketMass.textContent   = `${results.rocketMass.toFixed(1)} kg`;
        this.resMaxVelocity.textContent  = `${results.maxVelocity.toFixed(2)} m/s`;
        this.resAvgAccel.textContent     = `${results.avgAcceleration.toFixed(2)} m/s²`;
        this.resPeakAltitude.textContent = `${results.peakAltitude.toFixed(2)} m`;
        this.resFlightTime.textContent   = `${results.flightTime.toFixed(2)} s`;
        this.resDistance.textContent     = `${results.distanceTraveled.toFixed(2)} m`;
        this.resultPanel.classList.add('visible');
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
    }
}
