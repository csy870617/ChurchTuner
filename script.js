// ===============================================
// CHURCH TUNER PRO v4.0 - Professional Grade
// ===============================================

// --- 악기 데이터 ---
const instruments = {
    guitar: { 
        name: "GUITAR", icon: "🎸", detail: "Standard E", 
        minFreq: 75, maxFreq: 400,
        strings: [ 
            { note: "E", octave: 2, freq: 82.41, name: "6th" },
            { note: "A", octave: 2, freq: 110.00, name: "5th" },
            { note: "D", octave: 3, freq: 146.83, name: "4th" },
            { note: "G", octave: 3, freq: 196.00, name: "3rd" },
            { note: "B", octave: 3, freq: 246.94, name: "2nd" },
            { note: "E", octave: 4, freq: 329.63, name: "1st" }
        ] 
    },
    bass: {
        name: "BASS", icon: "🪕", detail: "Standard",
        minFreq: 35, maxFreq: 150,
        strings: [ 
            { note: "E", octave: 1, freq: 41.20, name: "4th" },
            { note: "A", octave: 1, freq: 55.00, name: "3rd" },
            { note: "D", octave: 2, freq: 73.42, name: "2nd" },
            { note: "G", octave: 2, freq: 98.00, name: "1st" }
        ] 
    },
    ukulele: { 
        name: "UKULELE", icon: "🌴", detail: "High-G", 
        minFreq: 230, maxFreq: 500,
        strings: [ 
            { note: "G", octave: 4, freq: 392.00, name: "4th" },
            { note: "C", octave: 4, freq: 261.63, name: "3rd" },
            { note: "E", octave: 4, freq: 329.63, name: "2nd" },
            { note: "A", octave: 4, freq: 440.00, name: "1st" }
        ] 
    },
    violin: { 
        name: "VIOLIN", icon: "🎻", detail: "Orchestra", 
        minFreq: 180, maxFreq: 700,
        strings: [ 
            { note: "G", octave: 3, freq: 196.00, name: "4th" },
            { note: "D", octave: 4, freq: 293.66, name: "3rd" },
            { note: "A", octave: 4, freq: 440.00, name: "2nd" },
            { note: "E", octave: 5, freq: 659.25, name: "1st" }
        ] 
    },
    cello: { 
        name: "CELLO", icon: "🎻", detail: "Orchestra", 
        minFreq: 58, maxFreq: 260,
        strings: [ 
            { note: "C", octave: 2, freq: 65.41, name: "4th" },
            { note: "G", octave: 2, freq: 98.00, name: "3rd" },
            { note: "D", octave: 3, freq: 146.83, name: "2nd" },
            { note: "A", octave: 3, freq: 220.00, name: "1st" }
        ] 
    },
    chromatic: { 
        name: "CHROMATIC", icon: "🎹", detail: "All Notes", 
        minFreq: 60, maxFreq: 1000,
        isChromatic: true, 
        strings: [] 
    }
};

const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ===============================================
// 오디오 설정
// ===============================================
let currentInstrument = 'guitar';
let audioContext = null;
let analyser = null;
let mediaStream = null;
let sourceNode = null;
let highpassNode = null;
let lowpassNode = null;
let isRunning = false;
let isStarting = false; // startTuner 중복 진입 방지 (권한 팝업 중 재클릭 등)

// 버퍼 설정 - 저음 감지를 위해 큰 버퍼 사용
const BUFFER_SIZE = 8192;
let audioBuffer = new Float32Array(BUFFER_SIZE);

// YIN 알고리즘용 재사용 버퍼 (가장 낮은 주파수 기준 크기)
// 비표준 샘플레이트 대비: 최악 96kHz / 최저음 35Hz ≈ 2743 샘플까지 커버
// (48kHz만 가정하면 96kHz 장치에서 베이스/첼로 감지가 조용히 죽음)
const YIN_BUFFER_SIZE = 4096;
const yinBuffer = new Float32Array(YIN_BUFFER_SIZE);

// ===============================================
// 피치 감지 상태
// ===============================================
let detectedPitch = 0;
let detectedNote = null;
let cents = 0;
let isLocked = false;
let lockCounter = 0;
let silenceFrames = 0;

// 스무딩 버퍼
const pitchHistory = [];
const PITCH_HISTORY_SIZE = 5;

// UI 상태
let displayAngle = 0;
let targetAngle = 0;

// 상수
const LOCK_CENTS = 3;
const UNLOCK_CENTS = 10;
const LOCK_FRAMES_NEEDED = 5;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_RESET_FRAMES = 15;  // 이 프레임 이후 피치 히스토리 리셋
const SILENCE_IDLE_FRAMES = 40;   // 이 프레임 이후 UI 초기 상태로 복귀

// ===============================================
// DOM 요소
// ===============================================
const startBtn = document.getElementById('start-btn');
const btnText = startBtn.querySelector('.btn-text');
const noteNameEl = document.getElementById('note-name');
const octaveEl = document.getElementById('octave');
const freqEl = document.getElementById('frequency');
const targetNoteEl = document.getElementById('target-note');
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

// ===============================================
// 초기화
// ===============================================
function init() {
    instPills.forEach(pill => pill.addEventListener('click', () => handleInstClick(pill)));
    startBtn.addEventListener('click', toggleTuner);
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
    // 모바일에서 백그라운드 전환 시 AudioContext가 suspend된 뒤 복귀해도
    // 자동 resume되지 않아 튜너가 멈춘 것처럼 보이는 문제 복구
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isRunning && audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
    });
    generateModalList();
}

function handleInstClick(pill) {
    const type = pill.dataset.type;
    if (type === 'select' || (pill.id === 'dynamic-inst-card' && pill.classList.contains('active'))) {
        openModal();
        return;
    }
    // 이미 선택된 악기를 다시 누르면 튜닝 상태를 리셋하지 않음
    if (type === currentInstrument) return;
    activateInstrument(type, pill);
}

function activateInstrument(key, pill) {
    instPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
    });
    pill.classList.add('active');
    pill.setAttribute('aria-pressed', 'true');
    currentInstrument = key;
    if (key !== 'guitar' && key !== 'bass') {
        dynIcon.textContent = instruments[key].icon;
        dynName.textContent = instruments[key].name;
        dynamicCard.dataset.type = key;
    }
    resetState();
}

function generateModalList() {
    modalList.innerHTML = '';
    Object.keys(instruments).forEach(key => {
        if (key === 'guitar' || key === 'bass') return;
        const inst = instruments[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inst-option';
        btn.innerHTML = `<div class="opt-icon" aria-hidden="true">${inst.icon}</div><div class="opt-info"><span class="opt-name">${inst.name}</span><span class="opt-detail">${inst.detail}</span></div>`;
        btn.addEventListener('click', () => {
            activateInstrument(key, dynamicCard);
            closeModal();
        });
        modalList.appendChild(btn);
    });
}

function openModal() {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const firstBtn = modalList.querySelector('button');
    if (firstBtn) firstBtn.focus();
}

function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    dynamicCard.focus();
}

// ===============================================
// 튜너 시작/정지
// ===============================================
function toggleTuner() {
    isRunning ? stopTuner() : startTuner();
}

async function startTuner() {
    if (isStarting || isRunning) return;
    isStarting = true;

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError("HTTPS 환경에서만 마이크를 사용할 수 있습니다.");
            return;
        }

        if (!audioContext) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            try {
                audioContext = new Ctx({ sampleRate: 48000 });
            } catch (e) {
                // 생성자 옵션 미지원 브라우저(구형 Safari) 폴백
                audioContext = new Ctx();
            }
        }

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                channelCount: 1
            }
        });

        sourceNode = audioContext.createMediaStreamSource(mediaStream);

        // 간단한 필터 체인
        highpassNode = audioContext.createBiquadFilter();
        highpassNode.type = 'highpass';
        highpassNode.frequency.value = 30; // 매우 낮은 주파수(전원 hum 등)만 차단
        highpassNode.Q.value = 0.5;

        // 기본 주파수 추출을 위해 고차 배음 제거 (바이올린 E5=659Hz의 2배음 이상 컷)
        lowpassNode = audioContext.createBiquadFilter();
        lowpassNode.type = 'lowpass';
        lowpassNode.frequency.value = 1200;
        lowpassNode.Q.value = 0.5;

        analyser = audioContext.createAnalyser();
        // 읽기 버퍼와 동일한 크기여야 최신 샘플을 받음
        // (fftSize > 버퍼 크기면 가장 오래된 구간만 복사되어 분석이 지연됨)
        analyser.fftSize = BUFFER_SIZE;
        analyser.smoothingTimeConstant = 0;

        sourceNode.connect(highpassNode);
        highpassNode.connect(lowpassNode);
        lowpassNode.connect(analyser);

        isRunning = true;
        startBtn.classList.add('active');
        btnText.textContent = "DEACTIVATE";
        statusDot.classList.add('active');
        guideMsg.textContent = "PLAY A STRING";

        processAudio();
        requestAnimationFrame(animationLoop);

    } catch (e) {
        console.error('Microphone error:', e);
        // 부분적으로 생성된 스트림/노드 정리 및 UI 복구
        stopTuner();
        showError(getMicErrorMessage(e));
    } finally {
        isStarting = false;
    }
}

function getMicErrorMessage(e) {
    switch (e && e.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return "마이크 접근 권한이 필요합니다.";
        case 'NotFoundError':
        case 'OverconstrainedError':
            return "사용 가능한 마이크를 찾을 수 없습니다.";
        case 'NotReadableError':
        case 'AbortError':
            return "마이크를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인하세요.";
        default:
            return "마이크를 시작할 수 없습니다.";
    }
}

function showError(message) {
    guideMsg.textContent = message;
    guideMsg.style.color = "var(--neon-pink)";
}

function stopTuner() {
    isRunning = false;
    startBtn.classList.remove('active');
    btnText.textContent = "ACTIVATE";
    statusDot.classList.remove('active');

    // 오디오 그래프 정리
    try { sourceNode && sourceNode.disconnect(); } catch (e) {}
    try { highpassNode && highpassNode.disconnect(); } catch (e) {}
    try { lowpassNode && lowpassNode.disconnect(); } catch (e) {}
    try { analyser && analyser.disconnect(); } catch (e) {}
    sourceNode = null;
    highpassNode = null;
    lowpassNode = null;
    analyser = null;

    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    resetState();
}

function resetState() {
    detectedPitch = 0;
    detectedNote = null;
    cents = 0;
    isLocked = false;
    lockCounter = 0;
    silenceFrames = 0;
    pitchHistory.length = 0;
    targetAngle = 0;
    displayAngle = 0;
    // 애니메이션 루프가 멈춘 뒤에도 바늘이 중앙으로 돌아오도록 직접 갱신
    if (needleGroup) {
        needleGroup.setAttribute('transform', 'rotate(0, 100, 100)');
    }

    noteNameEl.textContent = "--";
    octaveEl.textContent = "";
    noteNameEl.classList.remove('active');
    freqEl.textContent = "0.0 Hz";
    if (targetNoteEl) targetNoteEl.textContent = "";
    centsEl.classList.remove('visible');
    document.body.className = "";
    guideMsg.textContent = "READY";
    guideMsg.style.color = "var(--text-muted)";
}

// ===============================================
// 메인 오디오 처리 루프
// ===============================================
function processAudio() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(audioBuffer);

    // RMS 계산
    let rms = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
        rms += audioBuffer[i] * audioBuffer[i];
    }
    rms = Math.sqrt(rms / audioBuffer.length);

    if (rms < SILENCE_THRESHOLD) {
        // 무한 증가 방지를 위해 상한 설정
        if (silenceFrames <= SILENCE_IDLE_FRAMES) silenceFrames++;

        if (silenceFrames === SILENCE_RESET_FRAMES + 1) {
            // 임계값 도달 시 한 번만 리셋
            pitchHistory.length = 0;
            isLocked = false;
            lockCounter = 0;
        }
        if (silenceFrames === SILENCE_IDLE_FRAMES + 1) {
            document.body.className = "";
            targetAngle = 0;
            // 직전 튜닝 안내문("PERFECT" 등)이 남지 않도록 복귀
            guideMsg.textContent = "PLAY A STRING";
            guideMsg.style.color = "var(--text-muted)";
        }
        requestAnimationFrame(processAudio);
        return;
    }

    silenceFrames = 0;

    // 피치 감지
    const inst = instruments[currentInstrument];
    const pitch = detectPitch(audioBuffer, audioContext.sampleRate, inst.minFreq, inst.maxFreq);

    if (pitch > 0) {
        // 피치 히스토리에 추가
        pitchHistory.push(pitch);
        if (pitchHistory.length > PITCH_HISTORY_SIZE) {
            pitchHistory.shift();
        }

        // 안정적인 피치 계산 (중앙값)
        if (pitchHistory.length >= 3) {
            const stablePitch = getMedian(pitchHistory);
            updateTuning(stablePitch);
        }
    }

    requestAnimationFrame(processAudio);
}

// ===============================================
// 향상된 피치 감지 (ACF + YIN 하이브리드)
// ===============================================
function detectPitch(buffer, sampleRate, minFreq, maxFreq) {
    const bufferSize = buffer.length;
    
    // 주파수를 tau(샘플 지연)로 변환
    const minTau = Math.floor(sampleRate / maxFreq);
    const maxTau = Math.floor(sampleRate / minFreq);
    
    // 재사용 버퍼 범위 체크 및 초기화
    if (maxTau + 1 > YIN_BUFFER_SIZE) return -1;
    for (let i = 0; i <= maxTau; i++) yinBuffer[i] = 0;

    // Step 1: 차이 함수
    // 분석 윈도 크기 제한: 최저음의 약 3주기(3*maxTau)면 충분.
    // 48kHz에서는 기존과 동일하게 최소 4096을 유지하고, 96kHz 등 고샘플레이트에서는
    // 버퍼가 허용하는 범위 내에서 주기 수를 더 확보(저음 감지 신뢰도 유지).
    // 전체 버퍼를 쓰면 프레임당 수백만 회 연산으로 모바일에서 프레임 드랍 발생.
    const windowSize = Math.min(bufferSize - maxTau, Math.max(4096, 3 * maxTau));
    for (let tau = 1; tau <= maxTau; tau++) {
        let sum = 0;
        for (let i = 0; i < windowSize; i++) {
            const diff = buffer[i] - buffer[i + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
    }
    
    // Step 2: 누적 평균 정규화 (CMNDF)
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
        runningSum += yinBuffer[tau];
        if (runningSum === 0) {
            yinBuffer[tau] = 1;
        } else {
            yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
        }
    }
    
    // Step 3: 절대 임계값으로 최소점 찾기
    let bestTau = -1;
    let bestVal = 1;
    const threshold = 0.2; // 더 관대한 임계값
    
    for (let tau = minTau; tau <= maxTau; tau++) {
        if (yinBuffer[tau] < threshold) {
            // 로컬 최소점 찾기
            while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            if (yinBuffer[tau] < bestVal) {
                bestVal = yinBuffer[tau];
                bestTau = tau;
            }
            break; // 첫 번째 좋은 최소점 사용
        }
    }
    
    // 최소점을 못 찾았으면 전체에서 가장 낮은 점 찾기
    if (bestTau === -1) {
        for (let tau = minTau; tau <= maxTau; tau++) {
            if (yinBuffer[tau] < bestVal) {
                bestVal = yinBuffer[tau];
                bestTau = tau;
            }
        }
    }
    
    // 신뢰도 체크
    if (bestTau === -1 || bestVal > 0.5) {
        return -1;
    }
    
    // Step 4: Parabolic interpolation으로 정밀도 향상
    let betterTau = bestTau;
    if (bestTau > 0 && bestTau < maxTau) {
        const s0 = yinBuffer[bestTau - 1];
        const s1 = yinBuffer[bestTau];
        const s2 = yinBuffer[bestTau + 1];
        const adjustment = (s0 - s2) / (2 * (s0 - 2 * s1 + s2));
        if (isFinite(adjustment)) {
            betterTau = bestTau + adjustment;
        }
    }
    
    const frequency = sampleRate / betterTau;
    
    // 범위 체크
    if (frequency < minFreq * 0.9 || frequency > maxFreq * 1.1) {
        return -1;
    }
    
    return frequency;
}

// ===============================================
// 튜닝 업데이트
// ===============================================
function updateTuning(pitch) {
    const inst = instruments[currentInstrument];
    let note = null;
    
    if (inst.isChromatic) {
        note = findChromaticNote(pitch);
    } else {
        note = findClosestString(pitch, inst.strings);
    }
    
    if (!note) return;

    // 배음/서브옥타브 감지 시 기본 주파수로 보정
    let actualPitch = pitch;
    const ratio = pitch / note.freq;
    if (ratio > 1.8 && ratio < 2.2) {
        actualPitch = pitch / 2;
    } else if (ratio > 0.45 && ratio < 0.55) {
        actualPitch = pitch * 2;
    }

    // 센트 계산
    const currentCents = 1200 * Math.log2(actualPitch / note.freq);

    // 50센트 이상 벗어나면 무시 (findClosestString이 이미 걸러내지만 이중 안전장치)
    if (Math.abs(currentCents) > 50) return;

    cents = currentCents;
    detectedNote = note;
    detectedPitch = actualPitch;
    
    // 잠금 로직
    updateLockState();
    
    // UI 업데이트
    renderUI();
}

function findClosestString(pitch, strings) {
    let best = null;
    let minCents = Infinity;

    // pitch와 str.freq를 같은 옥타브로 정규화하여 가장 가까운 줄 찾기
    for (const str of strings) {
        // 기본 주파수 / 1옥타브 위(배음) / 1옥타브 아래 모두 고려
        const candidates = [pitch, pitch / 2, pitch * 2];
        for (const p of candidates) {
            const diff = Math.abs(1200 * Math.log2(p / str.freq));
            if (diff < minCents) {
                minCents = diff;
                best = { ...str };
            }
        }
    }

    // 50센트 이내의 매칭만 반환
    return minCents < 50 ? best : null;
}

function findChromaticNote(pitch) {
    const noteNum = 12 * Math.log2(pitch / 440) + 69;
    const roundedNote = Math.round(noteNum);
    const targetFreq = 440 * Math.pow(2, (roundedNote - 69) / 12);
    
    return {
        note: NOTE_STRINGS[roundedNote % 12],
        octave: Math.floor(roundedNote / 12) - 1,
        freq: targetFreq
    };
}

function updateLockState() {
    const absCents = Math.abs(cents);
    
    if (isLocked) {
        // 잠금 해제 조건
        if (absCents > UNLOCK_CENTS) {
            isLocked = false;
            lockCounter = 0;
        }
    } else {
        // 잠금 조건
        if (absCents < LOCK_CENTS) {
            lockCounter++;
            if (lockCounter >= LOCK_FRAMES_NEEDED) {
                isLocked = true;
                playSuccessSound();
            }
        } else {
            lockCounter = Math.max(0, lockCounter - 1);
        }
    }
    
    // 바늘 각도 계산
    if (isLocked) {
        targetAngle = 0;
    } else {
        targetAngle = Math.max(-60, Math.min(60, cents * 1.5));
    }
}

function renderUI() {
    if (!detectedNote) return;
    
    // 노트 표시
    noteNameEl.textContent = detectedNote.note;
    octaveEl.textContent = detectedNote.octave;
    noteNameEl.classList.add('active');
    
    // 주파수 표시: 실제 감지 주파수 → 목표 주파수
    freqEl.textContent = detectedPitch.toFixed(1) + " Hz";
    targetNoteEl.textContent = "→ " + detectedNote.freq.toFixed(1) + " Hz";
    
    // 센트 표시
    if (isLocked) {
        centsEl.textContent = "✓ OK";
    } else {
        const sign = cents > 0 ? "+" : "";
        centsEl.textContent = sign + Math.round(cents) + "¢";
    }
    centsEl.classList.add('visible');
    
    // 상태 색상
    let statusClass, message;
    
    if (isLocked) {
        statusClass = 'perfect';
        message = "PERFECT";
    } else if (cents < -5) {
        statusClass = 'low';
        message = "▲ TUNE UP";
    } else if (cents > 5) {
        statusClass = 'high';
        message = "▼ TUNE DOWN";
    } else {
        statusClass = 'perfect';
        message = lockCounter > 0 ? "HOLD..." : "ALMOST...";
    }
    
    document.body.className = statusClass;
    guideMsg.textContent = message;
    guideMsg.style.color = "var(--current-neon)";
}

// ===============================================
// 애니메이션 루프
// ===============================================
function animationLoop() {
    // 부드러운 바늘 움직임
    const lerp = isLocked ? 0.1 : 0.2;
    displayAngle += (targetAngle - displayAngle) * lerp;

    // 아주 작은 움직임은 무시 (떨림 방지)
    if (Math.abs(targetAngle - displayAngle) < 0.3) {
        displayAngle = targetAngle;
    }

    if (needleGroup) {
        needleGroup.setAttribute('transform', `rotate(${displayAngle}, 100, 100)`);
    }

    if (isRunning) {
        requestAnimationFrame(animationLoop);
    }
}

// ===============================================
// 유틸리티
// ===============================================
function getMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function playSuccessSound() {
    if (!audioContext) return;
    
    try {
        const t = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(1100, t + 0.08);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start(t);
        osc.stop(t + 0.25);
    } catch (e) {
        // 사운드 재생 실패 무시
    }
}

// ===============================================
// 시작
// ===============================================
init();