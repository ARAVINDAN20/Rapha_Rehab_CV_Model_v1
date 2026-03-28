/**
 * Exercise Analyzer (Client-Side)
 * ================================
 * JavaScript port of exercise_analyzer.py.
 * Defines exercise rules, analyzes posture, generates feedback.
 *
 * Supports 6 Physiotherapy Exercises:
 * 1. Bicep Curl      2. Squat          3. Shoulder Press
 * 4. Lunge           5. Knee Extension  6. Lateral Arm Raise
 */

import { Landmarks } from './pose_engine.js';

// ============================================
// Posture Status Levels
// ============================================
export const PostureStatus = Object.freeze({
    CORRECT: 'correct',
    MINOR_ISSUE: 'minor_issue',
    MAJOR_ISSUE: 'major_issue',
    CRITICAL: 'critical'
});

// ============================================
// Exercise Rules (same thresholds as Python)
// ============================================
export const EXERCISE_REGISTRY = {
    bicep_curl: {
        name: 'Bicep Curl',
        reference_image: 'correct_bicep_curl.png',
        description: 'Stand with feet shoulder-width apart, curl the weight up by bending your elbow',
        joints: {
            elbow_angle: {
                landmarks: [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST],
                landmarks_right: [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST],
                correct_range_up: [30, 55],
                correct_range_down: [150, 180],
                joint_name: 'Elbow',
                corrections: {
                    too_wide_up: 'Curl higher! Bring the weight closer to your shoulder.',
                    too_tight_up: "Don't over-curl. Stop when forearm is close to upper arm.",
                    too_wide_down: 'Good starting position.',
                    too_tight_down: 'Fully extend your arm at the bottom of the movement.',
                }
            },
            shoulder_stability: {
                landmarks: [Landmarks.LEFT_HIP, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW],
                landmarks_right: [Landmarks.RIGHT_HIP, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW],
                correct_range: [0, 25],
                joint_name: 'Shoulder',
                corrections: {
                    swinging: "Keep your upper arm still! Don't swing your elbow forward.",
                }
            }
        },
        stage_detection: {
            angle_joint: 'elbow_angle',
            up_threshold: 60,
            down_threshold: 140,
        }
    },

    squat: {
        name: 'Squat',
        reference_image: 'correct_squat.png',
        description: 'Stand with feet shoulder-width apart, lower your body by bending knees and hips',
        joints: {
            knee_angle: {
                landmarks: [Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE],
                landmarks_right: [Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE],
                correct_range_down: [70, 110],
                correct_range_up: [160, 180],
                joint_name: 'Knee',
                corrections: {
                    too_shallow: 'Go deeper! Your thighs should be parallel to the ground.',
                    too_deep: "Don't go too deep. Stop when thighs are parallel to the ground.",
                    knees_caving: "Keep your knees aligned with your toes. Don't let them cave inward.",
                }
            },
            hip_angle: {
                landmarks: [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE],
                landmarks_right: [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE],
                correct_range_down: [60, 110],
                correct_range_up: [160, 180],
                joint_name: 'Hip',
                corrections: {
                    leaning_forward: "Keep your torso more upright. Don't lean too far forward.",
                    not_hinging: 'Hinge at your hips more. Push your hips back as you descend.',
                }
            },
            back_angle: {
                landmarks: [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP, Landmarks.LEFT_ANKLE],
                landmarks_right: [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP, Landmarks.RIGHT_ANKLE],
                correct_range: [40, 85],
                joint_name: 'Back/Torso',
                corrections: {
                    too_forward: "Straighten your back! You're leaning too far forward.",
                    too_upright: 'Slight forward lean is natural during squats.',
                }
            }
        },
        stage_detection: {
            angle_joint: 'knee_angle',
            up_threshold: 150,
            down_threshold: 110,
        }
    },

    shoulder_press: {
        name: 'Shoulder Press',
        reference_image: 'correct_shoulder_press.png',
        description: 'Press weights overhead from shoulder height to full arm extension',
        joints: {
            elbow_angle: {
                landmarks: [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST],
                landmarks_right: [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST],
                correct_range_up: [155, 180],
                correct_range_down: [70, 100],
                joint_name: 'Elbow',
                corrections: {
                    not_full_extension: 'Fully extend your arms overhead!',
                    too_low_start: 'Start with elbows at 90 degrees, hands at shoulder height.',
                }
            },
            shoulder_angle: {
                landmarks: [Landmarks.LEFT_HIP, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW],
                landmarks_right: [Landmarks.RIGHT_HIP, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW],
                correct_range_up: [160, 180],
                correct_range_down: [70, 100],
                joint_name: 'Shoulder',
                corrections: {
                    elbows_flared: 'Keep elbows slightly in front of your body, not flared out.',
                    asymmetric: 'Press both arms evenly. One side is higher than the other.',
                }
            }
        },
        stage_detection: {
            angle_joint: 'elbow_angle',
            up_threshold: 155,
            down_threshold: 100,
        }
    },

    lunge: {
        name: 'Lunge',
        reference_image: 'correct_lunge.png',
        description: 'Step forward and lower your body until both knees are at 90 degrees',
        joints: {
            front_knee_angle: {
                landmarks: [Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE],
                landmarks_right: [Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE],
                correct_range_down: [80, 100],
                correct_range_up: [160, 180],
                joint_name: 'Front Knee',
                corrections: {
                    knee_too_forward: "Don't let your knee go past your toes!",
                    not_deep_enough: 'Lower your body more. Front knee should be at 90 degrees.',
                    too_deep: "Don't go too deep. Keep front knee at 90 degrees.",
                }
            },
            torso_alignment: {
                landmarks: [Landmarks.LEFT_EAR, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP],
                landmarks_right: [Landmarks.RIGHT_EAR, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP],
                correct_range: [160, 180],
                joint_name: 'Torso',
                corrections: {
                    leaning: "Keep your torso upright! Don't lean forward.",
                }
            }
        },
        stage_detection: {
            angle_joint: 'front_knee_angle',
            up_threshold: 150,
            down_threshold: 110,
        }
    },

    knee_extension: {
        name: 'Knee Extension',
        reference_image: 'correct_knee_extension.png',
        description: 'Seated knee extension - extend your leg fully from a seated position',
        joints: {
            knee_angle: {
                landmarks: [Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE],
                landmarks_right: [Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE],
                correct_range_up: [155, 180],
                correct_range_down: [70, 100],
                joint_name: 'Knee',
                corrections: {
                    not_full_extension: 'Extend your leg fully! Try to straighten your knee completely.',
                    too_fast: 'Move slowly and with control. Hold at the top for 2-3 seconds.',
                    compensating: "Don't lift your hip. Keep your back against the chair.",
                }
            },
            hip_stability: {
                landmarks: [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE],
                landmarks_right: [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE],
                correct_range: [80, 110],
                joint_name: 'Hip',
                corrections: {
                    hip_lifting: "Keep your hip stable. Don't lift off the chair.",
                }
            }
        },
        stage_detection: {
            angle_joint: 'knee_angle',
            up_threshold: 150,
            down_threshold: 100,
        }
    },

    lateral_arm_raise: {
        name: 'Lateral Arm Raise',
        reference_image: 'correct_arm_raise.png',
        description: 'Raise arms laterally to shoulder height with a slight elbow bend',
        joints: {
            shoulder_angle: {
                landmarks: [Landmarks.LEFT_HIP, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW],
                landmarks_right: [Landmarks.RIGHT_HIP, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW],
                correct_range_up: [80, 100],
                correct_range_down: [0, 20],
                joint_name: 'Shoulder',
                corrections: {
                    too_high: "Don't raise arms above shoulder height!",
                    too_low: 'Raise your arms higher to shoulder level.',
                    shrugging: "Relax your shoulders. Don't shrug while lifting.",
                }
            },
            elbow_bend: {
                landmarks: [Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST],
                landmarks_right: [Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST],
                correct_range: [150, 175],
                joint_name: 'Elbow',
                corrections: {
                    too_bent: "Keep a slight bend in your elbow, don't bend too much.",
                    too_straight: 'Keep a slight bend in your elbow to protect the joint.',
                }
            }
        },
        stage_detection: {
            angle_joint: 'shoulder_angle',
            up_threshold: 70,
            down_threshold: 30,
        }
    }
};


// ============================================
// Posture Analyzer Class
// ============================================
export class PostureAnalyzer {
    /**
     * @param {import('./pose_engine.js').PoseEstimator} poseEstimator
     */
    constructor(poseEstimator) {
        this.pose = poseEstimator;
        this.currentExercise = null;
        this.currentExerciseKey = null;
        this.repCount = 0;
        this.stage = 'idle';
        this.prevStage = 'idle';

        // Temporal smoothing
        this.angleHistory = {};
        this.historySize = 5;

        // Score tracking
        this.frameScores = [];
    }

    /**
     * Set the current exercise to analyze.
     * @param {string} exerciseKey
     */
    setExercise(exerciseKey) {
        if (!EXERCISE_REGISTRY[exerciseKey]) {
            throw new Error(`Unknown exercise: ${exerciseKey}`);
        }
        this.currentExercise = EXERCISE_REGISTRY[exerciseKey];
        this.currentExerciseKey = exerciseKey;
        this.repCount = 0;
        this.stage = 'idle';
        this.prevStage = 'idle';
        this.angleHistory = {};
        this.frameScores = [];
    }

    /**
     * Apply temporal smoothing to an angle value.
     * @param {string} jointName
     * @param {number} angle
     * @returns {number}
     */
    _smoothAngle(jointName, angle) {
        if (!this.angleHistory[jointName]) {
            this.angleHistory[jointName] = [];
        }

        this.angleHistory[jointName].push(angle);
        if (this.angleHistory[jointName].length > this.historySize) {
            this.angleHistory[jointName].shift();
        }

        const sum = this.angleHistory[jointName].reduce((a, b) => a + b, 0);
        return sum / this.angleHistory[jointName].length;
    }

    /**
     * Get the angle using the most visible body side.
     * @param {Object} jointConfig
     * @returns {number|null}
     */
    _getBestSideAngle(jointConfig) {
        const side = this.pose.getBodySideVisibility();
        let lm;

        if (side === 'left' || side === 'both') {
            lm = jointConfig.landmarks;
        } else {
            lm = jointConfig.landmarks_right || jointConfig.landmarks;
        }

        return this.pose.calculateAngle(lm[0], lm[1], lm[2]);
    }

    /**
     * Check if an angle falls within the target range.
     * @param {number} angle
     * @param {number[]} targetRange - [min, max]
     * @param {number} tolerance
     * @returns {{status: string, severity: number}}
     */
    _checkAngleRange(angle, targetRange, tolerance = 10.0) {
        const [minAngle, maxAngle] = targetRange;

        if (angle >= minAngle && angle <= maxAngle) {
            return { status: PostureStatus.CORRECT, severity: 0.0 };
        }

        // How far off
        let deviation;
        if (angle < minAngle) {
            deviation = minAngle - angle;
        } else {
            deviation = angle - maxAngle;
        }

        if (deviation <= tolerance) {
            return {
                status: PostureStatus.MINOR_ISSUE,
                severity: Math.min(deviation / (tolerance * 3), 0.4)
            };
        } else if (deviation <= tolerance * 2) {
            return {
                status: PostureStatus.MAJOR_ISSUE,
                severity: Math.min(0.4 + (deviation - tolerance) / (tolerance * 3), 0.7)
            };
        } else {
            return {
                status: PostureStatus.CRITICAL,
                severity: Math.min(0.7 + (deviation - tolerance * 2) / (tolerance * 3), 1.0)
            };
        }
    }

    /**
     * Detect the current exercise stage (up/down/transition).
     * @param {Object} angles
     * @returns {string}
     */
    _detectStage(angles) {
        if (!this.currentExercise) return 'idle';

        const stageConfig = this.currentExercise.stage_detection;
        const jointName = stageConfig.angle_joint;

        if (!(jointName in angles)) return this.stage;

        const angle = angles[jointName];

        if (angle <= (stageConfig.up_threshold || 60)) {
            return 'up';
        } else if (angle >= (stageConfig.down_threshold || 140)) {
            return 'down';
        } else {
            return 'transition';
        }
    }

    /**
     * Count reps based on stage transitions.
     * @param {string} newStage
     */
    _countReps(newStage) {
        if (this.prevStage === 'up' && newStage === 'down') {
            this.repCount++;
        }
        this.prevStage = this.stage;
        this.stage = newStage;
    }

    /**
     * Analyze the current frame's pose against exercise rules.
     * @returns {Object|null} Analysis result
     */
    analyzeFrame() {
        if (!this.currentExercise) return null;

        if (!this.pose.landmarks) {
            return {
                exerciseName: this.currentExercise.name,
                overallStatus: PostureStatus.CRITICAL,
                feedbacks: [{
                    status: PostureStatus.CRITICAL,
                    message: 'Cannot detect your body. Please ensure full body is visible.',
                    suggestion: 'Stand further from the camera and ensure good lighting.',
                    jointName: 'Body',
                    currentAngle: 0,
                    targetRange: [0, 0],
                    severity: 1.0,
                    highlightJoints: []
                }],
                repCount: this.repCount,
                stage: this.stage,
                overallScore: 0,
                referenceImage: this.currentExercise.reference_image,
                timestamp: Date.now()
            };
        }

        const feedbacks = [];
        const angles = {};
        let totalSeverity = 0;
        let numChecks = 0;
        const highlightJoints = {};

        // Status colors for highlighting
        const statusColors = {
            [PostureStatus.MINOR_ISSUE]: 'rgba(255, 165, 0, 0.9)',
            [PostureStatus.MAJOR_ISSUE]: 'rgba(255, 60, 60, 0.9)',
            [PostureStatus.CRITICAL]: 'rgba(200, 0, 0, 0.9)',
        };

        for (const [jointKey, jointConfig] of Object.entries(this.currentExercise.joints)) {
            // Calculate angle
            let angle = this._getBestSideAngle(jointConfig);
            if (angle === null) continue;

            // Smooth
            angle = this._smoothAngle(jointKey, angle);
            angles[jointKey] = angle;

            // Determine target range based on stage
            let targetRange;
            if (jointConfig.correct_range_up && jointConfig.correct_range_down) {
                if (this.stage === 'up' || (this.stage === 'transition' && this.prevStage === 'up')) {
                    targetRange = jointConfig.correct_range_up;
                } else if (this.stage === 'down' || this.stage === 'idle') {
                    targetRange = jointConfig.correct_range_down;
                } else {
                    const upRange = jointConfig.correct_range_up;
                    const downRange = jointConfig.correct_range_down;
                    targetRange = [
                        Math.min(upRange[0], downRange[0]),
                        Math.max(upRange[1], downRange[1])
                    ];
                }
            } else if (jointConfig.correct_range) {
                targetRange = jointConfig.correct_range;
            } else {
                continue;
            }

            // Check angle
            const { status, severity } = this._checkAngleRange(angle, targetRange);
            totalSeverity += severity;
            numChecks++;

            // Generate feedback
            const corrections = jointConfig.corrections || {};
            let message, suggestion;

            if (status === PostureStatus.CORRECT) {
                message = `✓ ${jointConfig.joint_name} angle is perfect!`;
                suggestion = 'Keep it up! Great form.';
            } else {
                let correctionKeys;
                if (angle < targetRange[0]) {
                    correctionKeys = Object.keys(corrections).filter(k =>
                        /tight|deep|forward|low|not_full|not_deep|bent|compensating|hip_lifting/.test(k)
                    );
                } else {
                    correctionKeys = Object.keys(corrections).filter(k =>
                        /wide|shallow|leaning|high|swing|straight|flared|shrug/.test(k)
                    );
                }

                if (correctionKeys.length > 0) {
                    message = `✗ ${jointConfig.joint_name}: ${corrections[correctionKeys[0]]}`;
                    suggestion = corrections[correctionKeys[0]];
                } else {
                    message = `✗ ${jointConfig.joint_name} angle (${angle.toFixed(0)}°) is outside optimal range (${targetRange[0]}°-${targetRange[1]}°)`;
                    suggestion = `Adjust your ${jointConfig.joint_name.toLowerCase()} angle to be between ${targetRange[0]}° and ${targetRange[1]}°`;
                }

                // Set highlight colors
                const color = statusColors[status] || 'rgba(255, 165, 0, 0.9)';
                const side = this.pose.getBodySideVisibility();
                const lm = (side === 'left' || side === 'both')
                    ? jointConfig.landmarks
                    : (jointConfig.landmarks_right || jointConfig.landmarks);
                for (const lmId of lm) {
                    highlightJoints[lmId] = color;
                }
            }

            feedbacks.push({
                status,
                message,
                suggestion,
                jointName: jointConfig.joint_name,
                currentAngle: angle,
                targetRange,
                severity,
                highlightJoints: [...jointConfig.landmarks]
            });
        }

        // Stage detection and rep counting
        const newStage = this._detectStage(angles);
        this._countReps(newStage);

        // Overall score
        let overallScore = 0;
        if (numChecks > 0) {
            const avgSeverity = totalSeverity / numChecks;
            overallScore = Math.max(0, (1.0 - avgSeverity) * 100);
        }
        this.frameScores.push(overallScore);

        // Overall status
        let overallStatus;
        if (feedbacks.every(f => f.status === PostureStatus.CORRECT)) {
            overallStatus = PostureStatus.CORRECT;
        } else if (feedbacks.some(f => f.status === PostureStatus.CRITICAL)) {
            overallStatus = PostureStatus.CRITICAL;
        } else if (feedbacks.some(f => f.status === PostureStatus.MAJOR_ISSUE)) {
            overallStatus = PostureStatus.MAJOR_ISSUE;
        } else {
            overallStatus = PostureStatus.MINOR_ISSUE;
        }

        return {
            exerciseName: this.currentExercise.name,
            overallStatus,
            feedbacks,
            repCount: this.repCount,
            stage: this.stage,
            overallScore,
            referenceImage: this.currentExercise.reference_image,
            highlightJoints,
            timestamp: Date.now()
        };
    }

    /**
     * Get session summary statistics.
     * @returns {Object}
     */
    getSessionSummary() {
        if (this.frameScores.length === 0) {
            return { avgScore: 0, totalReps: 0, bestScore: 0, worstScore: 0, totalFrames: 0 };
        }

        return {
            avgScore: this.frameScores.reduce((a, b) => a + b, 0) / this.frameScores.length,
            totalReps: this.repCount,
            bestScore: Math.max(...this.frameScores),
            worstScore: Math.min(...this.frameScores),
            totalFrames: this.frameScores.length
        };
    }

    /**
     * Get list of available exercises.
     * @returns {Array}
     */
    static getAvailableExercises() {
        return Object.entries(EXERCISE_REGISTRY).map(([key, config]) => ({
            key,
            name: config.name,
            description: config.description,
            reference_image: config.reference_image,
        }));
    }
}
