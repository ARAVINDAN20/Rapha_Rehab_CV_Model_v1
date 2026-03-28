/**
 * Pose Estimation Engine (Client-Side)
 * =====================================
 * JavaScript port of pose_engine.py using @mediapipe/tasks-vision.
 * Runs entirely in the browser via WebAssembly.
 *
 * Provides:
 * - PoseLandmarker initialization and frame processing
 * - Angle calculation between any 3 landmarks
 * - Body side visibility detection
 * - Canvas-based landmark drawing
 */

// MediaPipe CDN module imports
import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ============================================
// Landmark Constants (same indices as Python)
// ============================================
export const Landmarks = Object.freeze({
    NOSE: 0,
    LEFT_EYE_INNER: 1,
    LEFT_EYE: 2,
    LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4,
    RIGHT_EYE: 5,
    RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_PINKY: 17,
    RIGHT_PINKY: 18,
    LEFT_INDEX: 19,
    RIGHT_INDEX: 20,
    LEFT_THUMB: 21,
    RIGHT_THUMB: 22,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,
    RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31,
    RIGHT_FOOT_INDEX: 32
});

// Pose connections for drawing skeleton lines
const POSE_CONNECTIONS = [
    [Landmarks.LEFT_SHOULDER, Landmarks.RIGHT_SHOULDER],
    [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW],
    [Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST],
    [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW],
    [Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST],
    [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP],
    [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP],
    [Landmarks.LEFT_HIP, Landmarks.RIGHT_HIP],
    [Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE],
    [Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE],
    [Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE],
    [Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE],
    [Landmarks.LEFT_ANKLE, Landmarks.LEFT_HEEL],
    [Landmarks.LEFT_ANKLE, Landmarks.LEFT_FOOT_INDEX],
    [Landmarks.LEFT_HEEL, Landmarks.LEFT_FOOT_INDEX],
    [Landmarks.RIGHT_ANKLE, Landmarks.RIGHT_HEEL],
    [Landmarks.RIGHT_ANKLE, Landmarks.RIGHT_FOOT_INDEX],
    [Landmarks.RIGHT_HEEL, Landmarks.RIGHT_FOOT_INDEX],
    [Landmarks.LEFT_WRIST, Landmarks.LEFT_PINKY],
    [Landmarks.LEFT_WRIST, Landmarks.LEFT_INDEX],
    [Landmarks.LEFT_WRIST, Landmarks.LEFT_THUMB],
    [Landmarks.RIGHT_WRIST, Landmarks.RIGHT_PINKY],
    [Landmarks.RIGHT_WRIST, Landmarks.RIGHT_INDEX],
    [Landmarks.RIGHT_WRIST, Landmarks.RIGHT_THUMB],
    [Landmarks.LEFT_EAR, Landmarks.LEFT_EYE_OUTER],
    [Landmarks.LEFT_EYE_OUTER, Landmarks.LEFT_EYE],
    [Landmarks.LEFT_EYE, Landmarks.LEFT_EYE_INNER],
    [Landmarks.LEFT_EYE_INNER, Landmarks.NOSE],
    [Landmarks.NOSE, Landmarks.RIGHT_EYE_INNER],
    [Landmarks.RIGHT_EYE_INNER, Landmarks.RIGHT_EYE],
    [Landmarks.RIGHT_EYE, Landmarks.RIGHT_EYE_OUTER],
    [Landmarks.RIGHT_EYE_OUTER, Landmarks.RIGHT_EAR],
    [Landmarks.MOUTH_LEFT, Landmarks.MOUTH_RIGHT],
];


// ============================================
// PoseEstimator Class
// ============================================
export class PoseEstimator {
    constructor() {
        this.poseLandmarker = null;
        this.landmarks = null;       // Normalized landmarks (0-1)
        this.worldLandmarks = null;   // World landmarks (meters)
        this.isReady = false;
        this.lastVideoTime = -1;
    }

    /**
     * Initialize the MediaPipe PoseLandmarker.
     * Downloads WASM runtime and model file.
     *
     * @param {Function} onProgress - Optional progress callback(message)
     * @returns {Promise<void>}
     */
    async initialize(onProgress = null) {
        try {
            if (onProgress) onProgress("Loading AI runtime...");

            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
            );

            if (onProgress) onProgress("Loading pose estimation model...");

            this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
                    delegate: "GPU"   // Use WebGL acceleration if available
                },
                runningMode: "VIDEO",
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.isReady = true;
            if (onProgress) onProgress("Model loaded successfully!");
            console.log("[PoseEngine] MediaPipe PoseLandmarker initialized");

        } catch (error) {
            console.error("[PoseEngine] Initialization failed:", error);
            throw new Error(`Failed to load pose model: ${error.message}`);
        }
    }

    /**
     * Process a video frame and extract pose landmarks.
     *
     * @param {HTMLVideoElement} videoElement - The video element to process
     * @returns {boolean} True if pose landmarks were detected
     */
    processFrame(videoElement) {
        if (!this.isReady || !this.poseLandmarker) return false;

        // Skip if video hasn't advanced
        if (videoElement.currentTime === this.lastVideoTime) return this.landmarks !== null;
        this.lastVideoTime = videoElement.currentTime;

        try {
            const results = this.poseLandmarker.detectForVideo(
                videoElement,
                performance.now()
            );

            if (results.landmarks && results.landmarks.length > 0) {
                this.landmarks = results.landmarks[0];
                this.worldLandmarks = results.worldLandmarks?.[0] || null;
                return true;
            }
        } catch (error) {
            // Silently handle frame processing errors
        }

        this.landmarks = null;
        this.worldLandmarks = null;
        return false;
    }

    /**
     * Calculate the angle at point B formed by line segments BA and BC.
     * This is the core function for exercise analysis.
     *
     * @param {number} pointA - First landmark index
     * @param {number} pointB - Vertex landmark index (where angle is measured)
     * @param {number} pointC - Third landmark index
     * @returns {number|null} Angle in degrees (0-180) or null
     */
    calculateAngle(pointA, pointB, pointC) {
        if (!this.landmarks) return null;

        const a = this.landmarks[pointA];
        const b = this.landmarks[pointB];
        const c = this.landmarks[pointC];

        if (!a || !b || !c) return null;

        // Vectors from B to A and B to C (using x, y only for 2D angle)
        const ba = { x: a.x - b.x, y: a.y - b.y };
        const bc = { x: c.x - b.x, y: c.y - b.y };

        // Dot product
        const dot = ba.x * bc.x + ba.y * bc.y;

        // Magnitudes
        const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
        const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);

        // Cosine of angle, clamped to [-1, 1]
        const cosine = Math.max(-1, Math.min(1, dot / (magBA * magBC + 1e-8)));

        // Convert to degrees
        return Math.acos(cosine) * (180 / Math.PI);
    }

    /**
     * Get the visibility/confidence score for a landmark.
     *
     * @param {number} landmarkId - Landmark index
     * @returns {number} Visibility score 0.0 - 1.0
     */
    getVisibility(landmarkId) {
        if (!this.landmarks || !this.landmarks[landmarkId]) return 0.0;
        return this.landmarks[landmarkId].visibility || 0.0;
    }

    /**
     * Determine which side of the body is more visible.
     *
     * @returns {'left'|'right'|'both'}
     */
    getBodySideVisibility() {
        if (!this.landmarks) return 'both';

        const leftVis = (
            this.getVisibility(Landmarks.LEFT_SHOULDER) +
            this.getVisibility(Landmarks.LEFT_ELBOW) +
            this.getVisibility(Landmarks.LEFT_WRIST) +
            this.getVisibility(Landmarks.LEFT_HIP) +
            this.getVisibility(Landmarks.LEFT_KNEE) +
            this.getVisibility(Landmarks.LEFT_ANKLE)
        ) / 6;

        const rightVis = (
            this.getVisibility(Landmarks.RIGHT_SHOULDER) +
            this.getVisibility(Landmarks.RIGHT_ELBOW) +
            this.getVisibility(Landmarks.RIGHT_WRIST) +
            this.getVisibility(Landmarks.RIGHT_HIP) +
            this.getVisibility(Landmarks.RIGHT_KNEE) +
            this.getVisibility(Landmarks.RIGHT_ANKLE)
        ) / 6;

        if (leftVis > 0.6 && rightVis > 0.6) return 'both';
        return leftVis > rightVis ? 'left' : 'right';
    }

    /**
     * Draw pose landmarks and skeleton on a canvas.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {Object} [highlightJoints={}] - Map of landmark_id -> color string
     */
    drawLandmarks(ctx, width, height, highlightJoints = {}) {
        if (!this.landmarks) return;

        ctx.clearRect(0, 0, width, height);

        // Draw connections (skeleton lines)
        ctx.lineWidth = 2;
        for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
            const start = this.landmarks[startIdx];
            const end = this.landmarks[endIdx];
            if (!start || !end) continue;
            if ((start.visibility || 0) < 0.3 || (end.visibility || 0) < 0.3) continue;

            ctx.strokeStyle = 'rgba(0, 230, 180, 0.6)';
            ctx.beginPath();
            ctx.moveTo(start.x * width, start.y * height);
            ctx.lineTo(end.x * width, end.y * height);
            ctx.stroke();
        }

        // Draw landmark points
        for (let i = 0; i < this.landmarks.length; i++) {
            const lm = this.landmarks[i];
            if (!lm || (lm.visibility || 0) < 0.3) continue;

            const x = lm.x * width;
            const y = lm.y * height;

            // Check if this joint should be highlighted
            if (highlightJoints[i]) {
                ctx.fillStyle = highlightJoints[i];
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, 2 * Math.PI);
                ctx.fill();

                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, 10, 0, 2 * Math.PI);
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(0, 230, 180, 0.9)';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    /**
     * Draw an angle label at a joint position.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @param {number} jointId - Landmark index of the joint vertex
     * @param {number} angle - Angle value in degrees
     * @param {string} label - Label text
     * @param {string} color - CSS color string
     */
    drawAngleLabel(ctx, width, height, jointId, angle, label, color) {
        if (!this.landmarks || !this.landmarks[jointId]) return;

        const lm = this.landmarks[jointId];
        const x = lm.x * width + 15;
        const y = lm.y * height - 10;

        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(`${label}: ${angle.toFixed(0)}°`, x, y);
    }

    /**
     * Release resources.
     */
    release() {
        if (this.poseLandmarker) {
            this.poseLandmarker.close();
            this.poseLandmarker = null;
        }
        this.isReady = false;
    }
}
