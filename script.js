// --- 1. 악기 데이터 ---
const instruments = {
    guitar: { name: "GUITAR", icon: "🎸", detail: "Standard", hpf: 70, strings: [ 
        { note: "E", octave: 2, freq: 82.41 }, { note: "A", octave: 2, freq: 110.00 }, 
        { note: "D", octave: 3, freq: 146.83 }, { note: "G", octave: 3, freq: 196.00 }, 
        { note: "B", octave: 3, freq: 246.94 }, { note: "E", octave: 4, freq: 329.63 } 
    ] },
    bass: { name: "BASS", icon: "🎸", detail: "Standard", hpf: 25, strings: [ 
        { note: "E", octave: 1, freq: 41.20 }, { note: "A", octave: 1, freq: 55.00 }, 
        { note: "D", octave: 2, freq: 73.42 }, { note: "G", octave: 2, freq: 98.00 } 
    ] },
    ukulele: { name: "UKULELE", icon: "🌴", detail: "High-G", hpf: 200, strings: [ 
        { note: "G", octave: 4, freq: 392.00 }, { note: "C", octave: 4, freq: 261.63 }, 
        { note: "E", octave: 4, freq: 329.63 }, { note: "A", octave: 4, freq: 440.00 } 
    ] },
    violin: { name: "VIOLIN", icon: "🎻", detail: "Orchestra", hpf: 180, strings: [ 
        { note: "G", octave: 3, freq: 196.00 }, { note: "D", octave: 4, freq: 293.66 }, 
        { note: "A", octave: 4, freq: 440.00 }, { note: "E", octave: 5, freq: 659.25 } 
    ] },
    cello: { name: "CELLO", icon: "🎻", detail: "Orchestra", hpf: 50, strings: [ 
        { note: "C", octave: 2, freq: 65.41 }, { note: "G", octave: 2, freq: 98.00 }, 
        { note: "D", octave: 3, freq: 146.83 }, { note: "A", octave: 3, freq: 220.00 } 
    ] },
    chromatic: { name: "CHROMATIC", icon: "🎹", detail: "All Notes", hpf: 25, isChromatic: true, strings: [] }
};

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// --- 향상된 스무딩 클래스 ---
class EnhancedSmoother {
    constructor(size, outlierThreshold = 0.15) {
        this.size = size;
        this.buffer = [];
        this.outlierThreshold = outlierThreshold;
    }
    
    add(val) {
        // 이상치 제거: 기존 중앙값과 너무 차이나면 무시
        if (this.buffer.length >= 3) {
            const median = this.getMedian();
            const deviation = Math.abs(val - median) / median;
            if (deviation > this.outlierThreshold) {
                return; // 이상치는 버퍼에 추가하지 않음
            }
        }
        this.buffer.push(val);
        if (this.buffer.length > this.size) this.buffer.shift();
    }
    
    getMedian() {
        if (!this.buffer.length) return 0;
        const sorted = [...this.buffer].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    
    // 가중 평균 (최근 값에 더 높은 가중치)
    getWeightedAverage() {
        if (!this.buffer.length) return 0;
        let sum = 0, weightSum = 0;
        this.buffer.forEach((val, i) => {
            const weight = i + 1;
            sum += val * weight;
            weightSum += weight;
        });
        return sum / weightSum;
    }
    
    // 안정적인 값 반환 (중앙값과 가중평균의 혼합)
    getStableValue() {
        if (this.buffer.length < 3) return this.getMedian();
        const median = this.getMedian();
        const weighted = this.getWeightedAverage();
        return median * 0.7 + weighted * 0.3;
    }
    
    reset() { this.buffer = []; }
    getCount() { return this.buffer.length; }
}

// --- Cents 안정화 클래스 ---
class CentsSmoother {
    constructor() {
        this.buffer = [];
        this.size = 8;
    }
    
    add(cents) {
        this.buffer.push(cents);
        if (this.buffer.length > this.size) this.buffer.shift();
    }
    
    getStableCents() {
        if (this.buffer.length < 2) return this.buffer[0] || 0;
        
        // 표준편차 계산
        const avg = this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
        const variance = this.buffer.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / this.buffer.length;
        const stdDev = Math.sqrt(variance);
        
        // 표준편차가 작으면 (안정적이면) 평균 사용
        if (stdDev < 3) {
            return avg;
        }
        
        // 불안정하면 중앙값 사용
        const sorted = [...this.buffer].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }
    
    reset() { this.buffer = []; }
}

let currentInstrument = 'guitar';
let audioContext = null;
let analyser = null;
let mediaStream = null;
let isRunning = false;
let gainNode = null;
let lowPassFilter = null;
let highPassFilter = null;

const BUF_SIZE = 4096;
const buf = new Float32Array(BUF_SIZE);
const freqSmoother = new EnhancedSmoother(8, 0.12);
const centsSmoother = new CentsSmoother();

// --- 안정화 및 고정(Lock) 변수 ---
let stableStringIndex = -1;
let stringLockCounter = 0;
let consecutiveStringHits = 0;
let displayAngle = 0;
let targetAngle = 0;
let smoothedDisplayAngle = 0;
let isLocked = false;
let lockHoldCounter = 0;
let framesSinceLastPitch = 0;
let lastValidCents = 0;
let silenceCounter = 0;

// 고정 임계값 설정 (더 정교하게)
const LOCK_THRESHOLD = 2.5;      // 이 범위 안에서 일정 시간 유지되면 잠금
const UNLOCK_THRESHOLD = 8.0;    // 잠긴 후, 이 범위를 벗어나야 잠금 해제
const LOCK_HOLD_FRAMES = 8;      // 잠금까지 필요한 프레임 수
const NEEDLE_DEADZONE = 0.8;     // 바늘 미세 떨림 무시 범위
const STRING_CHANGE_THRESHOLD = 8; // 줄 변경에 필요한 연속 감지 수 (낮춤)
const SILENCE_RESET_FRAMES = 15;   // 이 프레임 동안 소리 없으면 줄 리셋
const ATTACK_THRESHOLD = 0.08;     // 새로운 줄 연주 감지용 볼륨 임계값

// DOM 요소
const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text');
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const centsEl = document.getElementById('cents');
const needleGroup = document.getElementById('needle-group');
const statusDot = document.getElementById('status-dot');
const guideMsg = document.getElementById('guide-msg');
const instPills = document.querySelectorAll('.inst-pill');
const dynamicCard = document.getElementById('dynamic-inst-card');
const modal = document.getElementById('inst-modal');
const modalList = document.getElementById('modal-list');
const closeModalBtn = document.getElementById('close-modal');
const dynIcon = document.getElementById('dyn-icon');
const dynName = document.getElementById('dyn-name');

function init() {
    instPills.forEach(pill => pill.addEventListener('click', () => handleInstClick(pill)));
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    generateModalList();
    requestAnimationFrame(updateVisualizer);
}

function handleInstClick(pill) {
    const type = pill.dataset.type;
    if (type === 'select' || (pill.id === 'dynamic-inst-card' && pill.classList.contains('active'))) {
        openModal();
        return;
    }
    activateInstrument(type, pill);
}

function activateInstrument(key, pill) {
    instPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentInstrument = key;
    if (key !== 'guitar' && key !== 'bass') {
        dynIcon.textContent = instruments[key].icon;
        dynName.textContent = instruments[key].name;
        dynamicCard.dataset.type = key;
    }
    resetUI();
    if (isRunning) applyFilters();
}

function generateModalList() {
    modalList.innerHTML = '';
    Object.keys(instruments).forEach(key => {
        if (key === 'guitar' || key === 'bass') return;
        const inst = instruments[key];
        const div = document.createElement('div');
        div.className = 'inst-option';
        div.innerHTML = `<div class="opt-icon">${inst.icon}</div><div class="opt-info"><span class="opt-name">${inst.name}</span><span class="opt-detail">${inst.detail}</span></div>`;
        div.addEventListener('click', () => {
            activateInstrument(key, dynamicCard);
            modal.classList.add('hidden');
        });
        modalList.appendChild(div);
    });
}

function openModal() {
    modal.classList.remove('hidden');
}

function toggleTuner() {
    isRunning ? stopTuner() : startTuner();
}

async function startTuner() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                channelCount: 1,
                sampleRate: { ideal: 48000 }
            }
        });
        
        const inputSource = audioContext.createMediaStreamSource(mediaStream);

        gainNode = audioContext.createGain();
        gainNode.gain.value = 3.0;

        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = "highpass";
        highPassFilter.Q.value = 0.7;

        lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = "lowpass";
        lowPassFilter.Q.value = 0.7;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUF_SIZE;
        analyser.smoothingTimeConstant = 0.1;

        inputSource.connect(gainNode).connect(highPassFilter).connect(lowPassFilter).connect(analyser);
        applyFilters();

        isRunning = true;
        startBtn.classList.add('active');
        btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING";
        
        processAudio();
    } catch (e) {
        console.error(e);
        alert("Microphone access required.");
    }
}

function applyFilters() {
    if (!highPassFilter) return;
    const data = instruments[currentInstrument];
    highPassFilter.frequency.value = data.hpf || 40;
    lowPassFilter.frequency.value = 1500;
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('active');
    btnText.textContent = "ACTIVATE";
    statusDot.classList.remove('active');
    resetUI();
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
}

function resetUI() {
    targetAngle = 0;
    displayAngle = 0;
    smoothedDisplayAngle = 0;
    isLocked = false;
    lockHoldCounter = 0;
    stableStringIndex = -1;
    stringLockCounter = 0;
    consecutiveStringHits = 0;
    freqSmoother.reset();
    centsSmoother.reset();
    noteNameEl.textContent = "--";
    octaveEl.textContent = "";
    noteNameEl.classList.remove('active');
    freqEl.textContent = "0.0 Hz";
    centsEl.classList.remove('visible');
    document.body.className = "";
    guideMsg.textContent = "READY";
    guideMsg.style.color = "var(--text-muted)";
    
    // 타겟 노트 표시 초기화
    const targetEl = document.getElementById('target-note');
    if (targetEl) targetEl.textContent = "";
}

function processAudio() {
    if (!isRunning) return;
    analyser.getFloatTimeDomainData(buf);

    // RMS 계산 (볼륨 레벨)
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);

    // 동적 임계값: 현재 신호 강도에 따라 조정
    const threshold = 0.012;
    
    if (rms < threshold) {
        silenceCounter++;
        framesSinceLastPitch++;
        
        // 소리가 끊기면 빠르게 줄 정보 리셋 (다음 줄 준비)
        if (silenceCounter > 10) {
            // 줄 정보 리셋 - 다음 줄 연주 준비
            stableStringIndex = -1;
            stringLockCounter = 0;
            consecutiveStringHits = 0;
            isLocked = false;
            lockHoldCounter = 0;
            freqSmoother.reset();
            centsSmoother.reset();
        }
        
        if (silenceCounter > 30) {
            // UI도 서서히 리셋
            document.body.className = "";
            targetAngle = 0;
        }
        
        requestAnimationFrame(processAudio);
        return;
    }

    // 새로운 강한 신호 감지 (새 줄 연주) - 조건 완화
    if (silenceCounter > 3 && rms > 0.04) {
        // 소리가 끊겼다가 다시 들어오면 = 새 줄 연주
        stableStringIndex = -1;
        stringLockCounter = 0;
        consecutiveStringHits = 0;
        isLocked = false;
        lockHoldCounter = 0;
        freqSmoother.reset();
        centsSmoother.reset();
    }

    silenceCounter = 0;
    
    const pitch = enhancedYin(buf, audioContext.sampleRate);
    
    if (pitch !== -1 && pitch > 30 && pitch < 1500) {
        framesSinceLastPitch = 0;
        freqSmoother.add(pitch);
        
        // 충분한 샘플이 모이면 업데이트
        if (freqSmoother.getCount() >= 3) {
            updateTuner(freqSmoother.getStableValue());
        }
    }
    
    requestAnimationFrame(processAudio);
}

// 향상된 YIN 알고리즘
function enhancedYin(buffer, sampleRate) {
    const threshold = 0.1;
    const bufferSize = buffer.length;
    const halfSize = Math.floor(bufferSize / 2);
    const yinBuffer = new Float32Array(halfSize);

    // 차이 함수 계산
    yinBuffer[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau < halfSize; tau++) {
        let delta = 0;
        for (let i = 0; i < halfSize; i++) {
            const diff = buffer[i] - buffer[i + tau];
            delta += diff * diff;
        }
        yinBuffer[tau] = delta;
        runningSum += delta;
        
        // 누적 평균 정규화
        yinBuffer[tau] *= tau / runningSum;
    }

    // 최소값 찾기 (threshold 이하인 첫 번째 딥)
    let tauEstimate = -1;
    for (let tau = 2; tau < halfSize; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            tauEstimate = tau;
            break;
        }
    }

    // 신뢰도 검사
    if (tauEstimate !== -1) {
        // parabolic interpolation으로 정확도 향상
        const s0 = yinBuffer[tauEstimate - 1] || yinBuffer[tauEstimate];
        const s1 = yinBuffer[tauEstimate];
        const s2 = yinBuffer[tauEstimate + 1] || yinBuffer[tauEstimate];

        let betterTau = tauEstimate;
        const denominator = 2 * (s1 - 2 * s0 + s2);
        if (denominator !== 0) {
            betterTau = tauEstimate + (s0 - s2) / denominator;
        }

        const confidence = 1 - yinBuffer[tauEstimate];
        
        // 신뢰도가 낮으면 무시
        if (confidence < 0.85) return -1;

        return sampleRate / betterTau;
    }

    return -1;
}

function findNote(frequency) {
    const data = instruments[currentInstrument];
    
    if (data.isChromatic) {
        const n = Math.round(12 * Math.log2(frequency / 440) + 69);
        const targetFreq = 440 * Math.pow(2, (n - 69) / 12);
        return {
            note: noteStrings[n % 12],
            octave: Math.floor(n / 12) - 1,
            target: targetFreq,
            index: -1
        };
    }

    let bestMatch = null;
    let minScore = Infinity;

    data.strings.forEach((str, idx) => {
        // 기본 주파수와 옥타브 위 주파수 모두 검사
        const candidates = [
            { freq: str.freq, isOctave: false },
            { freq: str.freq * 2, isOctave: true }
        ];

        candidates.forEach(candidate => {
            const ratio = frequency / candidate.freq;
            const cents = Math.abs(1200 * Math.log2(ratio));

            // 50센트 (반음의 절반) 이내만 고려
            if (cents < 50) {
                let score = cents;
                
                // 옥타브 위 감지는 약간의 페널티
                if (candidate.isOctave) {
                    score += 5;
                }

                if (score < minScore) {
                    minScore = score;
                    bestMatch = {
                        note: str.note,
                        octave: candidate.isOctave ? str.octave + 1 : str.octave,
                        target: str.freq,
                        index: idx,
                        isOctaveUp: candidate.isOctave
                    };
                }
            }
        });
    });

    return bestMatch;
}

function updateTuner(freq) {
    const match = findNote(freq);
    if (!match) return;

    // 줄 변경 감지
    if (stableStringIndex !== -1 && stableStringIndex !== match.index) {
        // 다른 줄 감지됨 - 바로 전환
        stableStringIndex = match.index;
        isLocked = false;
        lockHoldCounter = 0;
        centsSmoother.reset();
    } else if (stableStringIndex === -1) {
        // 첫 감지
        stableStringIndex = match.index;
        centsSmoother.reset();
    }

    // 옥타브 보정
    let calcFreq = freq;
    if (match.isOctaveUp) {
        calcFreq = freq / 2;
    }

    // 센트 계산
    let rawCents = 1200 * Math.log2(calcFreq / match.target);
    
    // 범위 초과 시 무시
    if (Math.abs(rawCents) > 50) return;

    // 센트 스무딩
    centsSmoother.add(rawCents);
    const cents = centsSmoother.getStableCents();

    // --- 바늘 고정 및 히스테리시스 로직 ---
    if (isLocked) {
        if (Math.abs(cents) > UNLOCK_THRESHOLD) {
            // 잠금 해제
            isLocked = false;
            lockHoldCounter = 0;
            targetAngle = cents * 1.5;
        } else {
            // 잠금 유지 - 바늘 고정
            targetAngle = 0;
        }
    } else {
        if (Math.abs(cents) < LOCK_THRESHOLD) {
            lockHoldCounter++;
            
            if (lockHoldCounter >= LOCK_HOLD_FRAMES) {
                // 잠금 활성화
                if (!isLocked) {
                    playSuccessSound();
                }
                isLocked = true;
                targetAngle = 0;
            } else {
                // 아직 잠금 전 - 작은 움직임
                targetAngle = cents * 0.8;
            }
        } else {
            lockHoldCounter = Math.max(0, lockHoldCounter - 1);
            targetAngle = cents * 1.5;
        }
    }

    lastValidCents = cents;
    renderUI(match.note, match.octave, cents, match.target, match.index);
}

function renderUI(note, oct, cents, freq, stringIndex) {
    noteNameEl.textContent = note;
    octaveEl.textContent = oct;
    noteNameEl.classList.add('active');
    freqEl.textContent = freq.toFixed(1) + " Hz";

    // 센트 표시
    if (isLocked) {
        centsEl.textContent = "✓ OK";
    } else {
        const sign = cents > 0 ? "+" : "";
        centsEl.textContent = sign + Math.round(cents) + "¢";
    }
    centsEl.classList.add('visible');

    // 상태 및 색상
    let statusClass = 'perfect';
    let msg = "PERFECT";

    if (!isLocked) {
        if (cents < -5) {
            statusClass = 'low';
            msg = "▲ TUNE UP";
        } else if (cents > 5) {
            statusClass = 'high';
            msg = "▼ TUNE DOWN";
        } else if (cents < -LOCK_THRESHOLD) {
            statusClass = 'low';
            msg = "ALMOST...";
        } else if (cents > LOCK_THRESHOLD) {
            statusClass = 'high';
            msg = "ALMOST...";
        } else {
            msg = "HOLD...";
        }
    }

    document.body.className = statusClass;
    guideMsg.textContent = msg;
    guideMsg.style.color = "var(--current-neon)";

    // 타겟 노트 표시 (선택사항)
    updateTargetDisplay(stringIndex);
}

function updateTargetDisplay(stringIndex) {
    const data = instruments[currentInstrument];
    if (data.isChromatic || stringIndex === -1) return;

    let targetEl = document.getElementById('target-note');
    if (!targetEl) {
        targetEl = document.createElement('div');
        targetEl.id = 'target-note';
        document.querySelector('.frequency-info').appendChild(targetEl);
    }

    const str = data.strings[stringIndex];
    targetEl.textContent = ` → ${str.note}${str.octave}`;
}

function playSuccessSound() {
    if (!audioContext) return;
    
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1108.73, t + 0.08); // A5 -> C#6
    
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    
    osc.connect(g).connect(audioContext.destination);
    osc.start(t);
    osc.stop(t + 0.3);
}

function updateVisualizer() {
    // 부드러운 바늘 움직임 (이중 스무딩)
    const baseLerp = isLocked ? 0.08 : 0.15;
    
    // 1차 스무딩
    displayAngle += (targetAngle - displayAngle) * baseLerp;
    
    // 데드존 적용: 아주 작은 변화는 무시
    if (Math.abs(displayAngle - smoothedDisplayAngle) < NEEDLE_DEADZONE) {
        // 변화가 너무 작으면 유지
    } else {
        // 2차 스무딩
        smoothedDisplayAngle += (displayAngle - smoothedDisplayAngle) * 0.3;
    }
    
    // 잠금 상태에서 중앙 근처면 정확히 0으로
    if (isLocked && Math.abs(smoothedDisplayAngle) < 0.5) {
        smoothedDisplayAngle = 0;
    }

    // 바늘 각도 제한 (-60 ~ +60도)
    const clampedAngle = Math.max(-60, Math.min(60, smoothedDisplayAngle));
    
    if (needleGroup) {
        needleGroup.setAttribute('transform', `rotate(${clampedAngle}, 100, 100)`);
    }
    
    requestAnimationFrame(updateVisualizer);
}

init();