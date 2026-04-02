/**
 * PhysioGuard App Controller (Client-Side)
 * =========================================
 * Main application logic: webcam access, render loop,
 * UI updates, voice feedback, session management.
 *
 * All inference runs locally in the browser.
 */

import { PoseEstimator } from './pose_engine.js';
import { PostureAnalyzer, PostureStatus, EXERCISE_REGISTRY } from './exercise_analyzer.js';

// ============================================
// Global State
// ============================================
let poseEstimator = null;
let postureAnalyzer = null;
let isMonitoring = false;
let voiceEnabled = true;
let animationFrameId = null;

// Voice
let lastSpokenTime = 0;
let lastSpokenMessage = '';
const VOICE_COOLDOWN = 4000;
let selectedVoice = null;
let voicesLoaded = false;

// DOM elements (cached after load)
let videoEl, canvasEl, canvasCtx;

// ============================================
// Initialize
// ============================================
export async function init() {
    // Cache DOM elements
    videoEl = document.getElementById('webcamVideo');
    canvasEl = document.getElementById('poseCanvas');
    canvasCtx = canvasEl.getContext('2d');

    // Populate exercise dropdown
    populateExercises();

    // Initialize voice
    initVoice();

    // Initialize MediaPipe PoseEstimator
    poseEstimator = new PoseEstimator();
    postureAnalyzer = new PostureAnalyzer(poseEstimator);

    try {
        await poseEstimator.initialize((msg) => {
            updateLoadingStatus(msg);
        });
        updateLoadingStatus(null); // Hide loading
        showToast('AI model loaded — ready to monitor!');
    } catch (error) {
        console.error('Failed to initialize pose engine:', error);
        updateLoadingStatus('Failed to load AI model. Please refresh the page.');
    }
}

// ============================================
// Exercise Dropdown
// ============================================
function populateExercises() {
    const select = document.getElementById('exerciseSelect');
    select.innerHTML = '';

    for (const [key, config] of Object.entries(EXERCISE_REGISTRY)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${config.name} - ${config.description}`;
        select.appendChild(option);
    }
}

// ============================================
// Start Monitoring
// ============================================
export async function startMonitoring() {
    if (!poseEstimator || !poseEstimator.isReady) {
        showToast('AI model is still loading. Please wait...');
        return;
    }

    const exerciseKey = document.getElementById('exerciseSelect').value;

    // Request webcam access
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        });

        videoEl.srcObject = stream;
        await videoEl.play();

        // Set canvas size to match video
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;

    } catch (error) {
        console.error('Camera access denied:', error);
        showToast('Camera access denied. Please allow camera permission and try again.');
        return;
    }

    // Set exercise
    postureAnalyzer.setExercise(exerciseKey);
    isMonitoring = true;

    // Update UI
    document.getElementById('videoPlaceholder').classList.add('hidden');
    videoEl.style.display = 'block';
    canvasEl.style.display = 'block';
    document.getElementById('videoContainer').classList.add('monitoring');
    document.getElementById('liveBadge').classList.add('show');
    document.getElementById('btnStart').classList.add('hidden');
    document.getElementById('btnStop').classList.remove('hidden');
    document.getElementById('statusDot').classList.add('active');
    document.getElementById('statusText').textContent =
        `Monitoring: ${EXERCISE_REGISTRY[exerciseKey].name}`;

    // Show reference image
    const refImg = document.getElementById('referenceImage');
    refImg.src = `/reference_images/${EXERCISE_REGISTRY[exerciseKey].reference_image}`;
    refImg.style.display = 'block';
    document.getElementById('refPlaceholder').style.display = 'none';
    document.getElementById('refCaption').style.display = 'block';

    showToast(`Started monitoring: ${EXERCISE_REGISTRY[exerciseKey].name}`);

    // Start the render loop
    detectPose();
}

// ============================================
// Stop Monitoring
// ============================================
export async function stopMonitoring() {
    isMonitoring = false;

    // Cancel animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Stop webcam
    if (videoEl.srcObject) {
        videoEl.srcObject.getTracks().forEach(track => track.stop());
        videoEl.srcObject = null;
    }

    // Get session summary
    const summary = postureAnalyzer.getSessionSummary();

    // AUTO-SYNC TO REHAB BACKEND
    // Pull the embedded credentials mapped from the patient dashboard URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const planId = urlParams.get('plan_id');
    const dbExerciseId = urlParams.get('exercise_id');

    if (token && planId && dbExerciseId) {
        try {
            const apiRes = await fetch("http://localhost:3002/api/patient/exercise-performance", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    exercise_id: parseInt(dbExerciseId),
                    treatment_plan_id: parseInt(planId),
                    performed_date: new Date().toISOString().split('T')[0],
                    sets: 1, // Defaulting AI trials to 1 continuous set
                    reps: summary.totalReps || 0,
                    duration: Math.round((summary.totalFrames || 0) / 30 / 60) || 1, // approx converting frames (30fps) to minutes
                    pain_level: 0,
                    notes: `AI Managed. Avg Form Accuracy: ${Math.round(summary.avgScore || 0)}%`
                })
            });

            if (apiRes.ok) {
                showToast("Exercise successfully synced to your profile!");
            } else {
                console.error("Failed to sync AI log:", await apiRes.text());
                showToast("Finished, but could not sync progress to profile.");
            }
        } catch (error) {
            console.error("Network error syncing AI log:", error);
        }
    } else {
        // Fallback to local server logging if launched autonomously
        fetch('/api/save_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exercise: document.getElementById('exerciseSelect').value,
                reps: summary.totalReps || 0,
                avg_score: summary.avgScore || 0,
                best_score: summary.bestScore || 0,
                duration_seconds: Math.round((summary.totalFrames || 0) / 30) // Assuming 30fps
            })
        }).catch(err => console.error("Error saving session locally:", err));
    }

    // Update UI
    videoEl.style.display = 'none';
    canvasEl.style.display = 'none';
    document.getElementById('videoPlaceholder').classList.remove('hidden');
    document.getElementById('videoContainer').classList.remove('monitoring');
    document.getElementById('liveBadge').classList.remove('show');
    document.getElementById('btnStart').classList.remove('hidden');
    document.getElementById('btnStop').classList.add('hidden');
    document.getElementById('statusDot').classList.remove('active');
    document.getElementById('statusText').textContent = 'Ready';

    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Show session summary
    showSessionSummary(summary);
    showToast('Monitoring stopped');
}

// ============================================
// Pose Detection Loop
// ============================================
function detectPose() {
    if (!isMonitoring) return;

    // Process frame
    const detected = poseEstimator.processFrame(videoEl);

    if (detected) {
        // Analyze posture
        const analysis = postureAnalyzer.analyzeFrame();

        if (analysis) {
            // Draw landmarks on canvas
            poseEstimator.drawLandmarks(
                canvasCtx,
                canvasEl.width,
                canvasEl.height,
                analysis.highlightJoints || {}
            );

            // Draw angle labels
            for (const feedback of analysis.feedbacks) {
                if (feedback.highlightJoints && feedback.highlightJoints.length === 3) {
                    const color = feedback.status === PostureStatus.CORRECT
                        ? '#00e396'
                        : feedback.status === PostureStatus.MINOR_ISSUE
                            ? '#ff9f43'
                            : '#ff4757';

                    poseEstimator.drawAngleLabel(
                        canvasCtx,
                        canvasEl.width,
                        canvasEl.height,
                        feedback.highlightJoints[1], // vertex joint
                        feedback.currentAngle,
                        feedback.jointName,
                        color
                    );
                }
            }

            // Update UI
            updateScoreDisplay(analysis);
            updateFeedbackDisplay(analysis);
            updateStatsDisplay(analysis);

            // Voice feedback
            if (voiceEnabled) {
                provideVoiceFeedback(analysis);
            }
        }
    } else {
        // No body detected
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        canvasCtx.font = '600 20px Inter, sans-serif';
        canvasCtx.fillStyle = '#ff4757';
        canvasCtx.textAlign = 'center';
        canvasCtx.fillText(
            'Please stand in full view of the camera',
            canvasEl.width / 2,
            50
        );
        canvasCtx.textAlign = 'left';
    }

    // Continue loop
    animationFrameId = requestAnimationFrame(detectPose);
}

// ============================================
// UI Update Functions
// ============================================
function updateScoreDisplay(analysis) {
    const score = Math.round(analysis.overallScore);
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreRing = document.getElementById('scoreRing');
    const scoreStatus = document.getElementById('scoreStatus');

    scoreNumber.textContent = score;

    // Ring animation
    const circumference = 2 * Math.PI * 60;
    const offset = circumference - (score / 100) * circumference;
    scoreRing.style.strokeDashoffset = offset;

    // Color
    let color;
    if (score >= 80) {
        color = getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim();
    } else if (score >= 50) {
        color = getComputedStyle(document.documentElement).getPropertyValue('--accent-orange').trim();
    } else {
        color = getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim();
    }
    scoreNumber.style.color = color;
    scoreRing.style.stroke = color;

    // Status badge
    const statusMap = {
        [PostureStatus.CORRECT]: { text: '✓ Perfect Form', cls: 'correct' },
        [PostureStatus.MINOR_ISSUE]: { text: '⚠ Minor Adjustments', cls: 'minor_issue' },
        [PostureStatus.MAJOR_ISSUE]: { text: '✗ Needs Correction', cls: 'major_issue' },
        [PostureStatus.CRITICAL]: { text: '✗✗ Incorrect Posture', cls: 'critical' }
    };

    const info = statusMap[analysis.overallStatus] || { text: 'Unknown', cls: '' };
    scoreStatus.textContent = info.text;
    scoreStatus.className = 'score-status ' + info.cls;
}

function updateFeedbackDisplay(analysis) {
    const feedbackList = document.getElementById('feedbackList');
    feedbackList.innerHTML = '';

    if (!analysis.feedbacks || analysis.feedbacks.length === 0) {
        feedbackList.innerHTML = '<div class="no-data"><p>No feedback data</p></div>';
        return;
    }

    for (const fb of analysis.feedbacks) {
        const item = document.createElement('div');
        item.className = `feedback-item ${fb.status}`;

        const icon = fb.status === PostureStatus.CORRECT ? '✅'
            : fb.status === PostureStatus.MINOR_ISSUE ? '⚠️'
                : fb.status === PostureStatus.MAJOR_ISSUE ? '❌' : '🚫';

        item.innerHTML = `
            <div class="joint-name">${icon} ${fb.jointName}</div>
            <div class="angle-info">
                Current: ${fb.currentAngle.toFixed(1)}° | Target: ${fb.targetRange[0]}°-${fb.targetRange[1]}°
            </div>
            <div class="suggestion">${fb.suggestion}</div>
        `;

        feedbackList.appendChild(item);
    }
}

function updateStatsDisplay(analysis) {
    document.getElementById('repCount').textContent = analysis.repCount;
    document.getElementById('stageDisplay').textContent = analysis.stage.toUpperCase();
}

// ============================================
// Loading Status
// ============================================
function updateLoadingStatus(message) {
    const loadingEl = document.getElementById('loadingStatus');
    if (!loadingEl) return;

    if (message) {
        loadingEl.style.display = 'flex';
        loadingEl.querySelector('.loading-text').textContent = message;
    } else {
        loadingEl.style.display = 'none';
    }
}

// ============================================
// Voice Feedback (Browser TTS)
// ============================================
const VOICE_PRIORITY = [
    'Google UK English Female', 'Google UK English Male', 'Google US English',
    'Microsoft Zira', 'Microsoft David', 'Samantha', 'Karen', 'Daniel',
    'Moira', 'Fiona', 'en-GB', 'en-US', 'en-AU', 'en'
];

function initVoice() {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    setTimeout(() => { if (!voicesLoaded) loadVoices(); }, 500);
    setTimeout(() => { if (!voicesLoaded) loadVoices(); }, 2000);

    // Set voice button initial state
    const btnVoice = document.getElementById('btnVoice');
    if (btnVoice) btnVoice.classList.add('active');
}

function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;
    voicesLoaded = true;

    let bestVoice = null;
    let bestScore = Infinity;

    for (const voice of voices) {
        if (!voice.lang.startsWith('en')) continue;
        for (let i = 0; i < VOICE_PRIORITY.length; i++) {
            if (voice.name.includes(VOICE_PRIORITY[i]) || voice.lang.startsWith(VOICE_PRIORITY[i])) {
                if (i < bestScore) {
                    bestScore = i;
                    bestVoice = voice;
                }
                break;
            }
        }
        if (!bestVoice) {
            bestVoice = voice;
            bestScore = VOICE_PRIORITY.length;
        }
    }

    if (bestVoice) {
        selectedVoice = bestVoice;
        console.log(`[PhysioGuard] Selected voice: "${bestVoice.name}" (${bestVoice.lang})`);
    }
}

function provideVoiceFeedback(analysis) {
    const now = Date.now();
    if (now - lastSpokenTime < VOICE_COOLDOWN) return;

    const criticalFbs = analysis.feedbacks.filter(f =>
        f.status === PostureStatus.MAJOR_ISSUE || f.status === PostureStatus.CRITICAL
    );

    let message = '';
    if (criticalFbs.length > 0) {
        const fb = criticalFbs[0];
        message = fb.suggestion;
        if (!message.toLowerCase().includes(fb.jointName.toLowerCase())) {
            message = `${fb.jointName}: ${message}`;
        }
    } else if (analysis.feedbacks.some(f => f.status === PostureStatus.MINOR_ISSUE)) {
        const minorFb = analysis.feedbacks.find(f => f.status === PostureStatus.MINOR_ISSUE);
        message = `Almost there. ${minorFb.suggestion}`;
    } else if (analysis.overallStatus === PostureStatus.CORRECT) {
        const phrases = [
            'Great form! Keep it up!', 'Perfect posture! Well done!',
            'Excellent technique!', 'Looking great! Maintain this form.',
            'Outstanding! Perfect alignment.'
        ];
        message = phrases[Math.floor(Math.random() * phrases.length)];
    }

    if (message && message !== lastSpokenMessage) {
        speak(message);
        lastSpokenTime = now;
        lastSpokenMessage = message;
    }
}

function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.85;
        utterance.pitch = 0.95;
        utterance.volume = 1.0;

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.onstart = () => {
            if (window._speechKeepAlive) clearInterval(window._speechKeepAlive);
            window._speechKeepAlive = setInterval(() => {
                if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.pause();
                    window.speechSynthesis.resume();
                }
            }, 10000);
        };

        utterance.onend = utterance.onerror = () => {
            if (window._speechKeepAlive) {
                clearInterval(window._speechKeepAlive);
                window._speechKeepAlive = null;
            }
        };

        window.speechSynthesis.speak(utterance);
    }, 50);
}

export function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    const btn = document.getElementById('btnVoice');
    btn.classList.toggle('active', voiceEnabled);
    btn.textContent = voiceEnabled ? '🔊' : '🔇';
    if (voiceEnabled) speak('Voice feedback enabled.');
    showToast(voiceEnabled ? 'Voice feedback enabled' : 'Voice feedback disabled');
}

// ============================================
// Session Summary Modal
// ============================================
function showSessionSummary(summary) {
    document.getElementById('summaryAvgScore').textContent = Math.round(summary.avgScore || 0);
    document.getElementById('summaryReps').textContent = summary.totalReps || 0;
    document.getElementById('summaryBest').textContent = Math.round(summary.bestScore || 0);
    document.getElementById('summaryFrames').textContent = summary.totalFrames || 0;
    document.getElementById('summaryModal').classList.add('show');
}

export function closeSummaryModal() {
    document.getElementById('summaryModal').classList.remove('show');
    document.getElementById('scoreNumber').textContent = '--';
    document.getElementById('scoreRing').style.strokeDashoffset = '377';
    document.getElementById('scoreStatus').textContent = 'Waiting...';
    document.getElementById('scoreStatus').className = 'score-status';
    document.getElementById('repCount').textContent = '0';
    document.getElementById('stageDisplay').textContent = '--';
    document.getElementById('feedbackList').innerHTML =
        '<div class="no-data"><div class="icon">🎯</div><p>Start monitoring to see real-time posture feedback</p></div>';
    document.getElementById('referenceImage').style.display = 'none';
    document.getElementById('refPlaceholder').style.display = 'block';
    document.getElementById('refCaption').style.display = 'none';
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

// ============================================
// Expose to global scope for HTML onclick
// ============================================
window.startMonitoring = startMonitoring;
window.stopMonitoring = stopMonitoring;
window.toggleVoice = toggleVoice;
window.closeSummaryModal = closeSummaryModal;

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
