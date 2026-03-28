"""
Exercise Analyzer Module
========================
Defines physiotherapy exercise rules, analyzes posture correctness,
and provides detailed correction suggestions.

Supported Exercises:
1. Bicep Curl - Upper arm rehabilitation
2. Squat - Lower body strengthening
3. Shoulder Press - Shoulder rehabilitation
4. Lunge - Knee/hip rehabilitation
5. Knee Extension - Post-surgery knee recovery
6. Lateral Arm Raise - Shoulder mobility
"""

import os
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
from enum import Enum

from pose_engine import PoseEstimator, Landmarks


class PostureStatus(Enum):
    """Posture assessment levels."""
    CORRECT = "correct"
    MINOR_ISSUE = "minor_issue"
    MAJOR_ISSUE = "major_issue"
    CRITICAL = "critical"


@dataclass
class PostureFeedback:
    """Structured feedback for a single posture check."""
    status: PostureStatus
    message: str
    suggestion: str
    joint_name: str
    current_angle: float
    target_angle_range: Tuple[float, float]
    severity: float  # 0.0 (perfect) to 1.0 (completely wrong)
    highlight_joints: List[int] = field(default_factory=list)


@dataclass
class ExerciseAnalysis:
    """Complete analysis result for a frame."""
    exercise_name: str
    overall_status: PostureStatus
    feedbacks: List[PostureFeedback]
    rep_count: int
    stage: str  # e.g., "up", "down", "hold"
    overall_score: float  # 0-100
    reference_image_path: str
    timestamp: float = 0.0


class ExerciseRules:
    """
    Defines angle thresholds and rules for each exercise.
    
    Each exercise has:
    - Joint angles to monitor
    - Acceptable angle ranges
    - Stage detection logic (up/down phases)
    - Correction messages for common mistakes
    """
    
    # ==========================================
    # BICEP CURL Rules
    # ==========================================
    BICEP_CURL = {
        'name': 'Bicep Curl',
        'reference_image': 'correct_bicep_curl.png',
        'description': 'Stand with feet shoulder-width apart, curl the weight up by bending your elbow',
        'joints': {
            'elbow_angle': {
                'landmarks': (Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST),
                'landmarks_right': (Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST),
                'correct_range_up': (30, 55),      # Top of curl
                'correct_range_down': (150, 180),   # Bottom/starting position
                'joint_name': 'Elbow',
                'corrections': {
                    'too_wide_up': 'Curl higher! Bring the weight closer to your shoulder.',
                    'too_tight_up': 'Don\'t over-curl. Stop when forearm is close to upper arm.',
                    'too_wide_down': 'Good starting position.',
                    'too_tight_down': 'Fully extend your arm at the bottom of the movement.',
                }
            },
            'shoulder_stability': {
                'landmarks': (Landmarks.LEFT_HIP, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW),
                'landmarks_right': (Landmarks.RIGHT_HIP, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW),
                'correct_range': (0, 25),
                'joint_name': 'Shoulder',
                'corrections': {
                    'swinging': 'Keep your upper arm still! Don\'t swing your elbow forward.',
                }
            }
        },
        'stage_detection': {
            'angle_joint': 'elbow_angle',
            'up_threshold': 60,
            'down_threshold': 140,
        }
    }
    
    # ==========================================
    # SQUAT Rules
    # ==========================================
    SQUAT = {
        'name': 'Squat',
        'reference_image': 'correct_squat.png',
        'description': 'Stand with feet shoulder-width apart, lower your body by bending knees and hips',
        'joints': {
            'knee_angle': {
                'landmarks': (Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE),
                'landmarks_right': (Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE),
                'correct_range_down': (70, 110),     # Bottom of squat
                'correct_range_up': (160, 180),       # Standing position
                'joint_name': 'Knee',
                'corrections': {
                    'too_shallow': 'Go deeper! Your thighs should be parallel to the ground.',
                    'too_deep': 'Don\'t go too deep. Stop when thighs are parallel to the ground.',
                    'knees_caving': 'Keep your knees aligned with your toes. Don\'t let them cave inward.',
                }
            },
            'hip_angle': {
                'landmarks': (Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE),
                'landmarks_right': (Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE),
                'correct_range_down': (60, 110),
                'correct_range_up': (160, 180),
                'joint_name': 'Hip',
                'corrections': {
                    'leaning_forward': 'Keep your torso more upright. Don\'t lean too far forward.',
                    'not_hinging': 'Hinge at your hips more. Push your hips back as you descend.',
                }
            },
            'back_angle': {
                'landmarks': (Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP, Landmarks.LEFT_ANKLE),
                'landmarks_right': (Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP, Landmarks.RIGHT_ANKLE),
                'correct_range': (40, 85),
                'joint_name': 'Back/Torso',
                'corrections': {
                    'too_forward': 'Straighten your back! You\'re leaning too far forward.',
                    'too_upright': 'Slight forward lean is natural during squats.',
                }
            }
        },
        'stage_detection': {
            'angle_joint': 'knee_angle',
            'up_threshold': 150,
            'down_threshold': 110,
        }
    }
    
    # ==========================================
    # SHOULDER PRESS Rules
    # ==========================================
    SHOULDER_PRESS = {
        'name': 'Shoulder Press',
        'reference_image': 'correct_shoulder_press.png',
        'description': 'Press weights overhead from shoulder height to full arm extension',
        'joints': {
            'elbow_angle': {
                'landmarks': (Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST),
                'landmarks_right': (Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST),
                'correct_range_up': (155, 180),      # Arms extended overhead
                'correct_range_down': (70, 100),      # Starting position
                'joint_name': 'Elbow',
                'corrections': {
                    'not_full_extension': 'Fully extend your arms overhead!',
                    'too_low_start': 'Start with elbows at 90 degrees, hands at shoulder height.',
                }
            },
            'shoulder_angle': {
                'landmarks': (Landmarks.LEFT_HIP, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW),
                'landmarks_right': (Landmarks.RIGHT_HIP, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW),
                'correct_range_up': (160, 180),
                'correct_range_down': (70, 100),
                'joint_name': 'Shoulder',
                'corrections': {
                    'elbows_flared': 'Keep elbows slightly in front of your body, not flared out.',
                    'asymmetric': 'Press both arms evenly. One side is higher than the other.',
                }
            }
        },
        'stage_detection': {
            'angle_joint': 'elbow_angle',
            'up_threshold': 155,
            'down_threshold': 100,
        }
    }
    
    # ==========================================
    # LUNGE Rules
    # ==========================================
    LUNGE = {
        'name': 'Lunge',
        'reference_image': 'correct_lunge.png',
        'description': 'Step forward and lower your body until both knees are at 90 degrees',
        'joints': {
            'front_knee_angle': {
                'landmarks': (Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE),
                'landmarks_right': (Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE),
                'correct_range_down': (80, 100),
                'correct_range_up': (160, 180),
                'joint_name': 'Front Knee',
                'corrections': {
                    'knee_too_forward': 'Don\'t let your knee go past your toes!',
                    'not_deep_enough': 'Lower your body more. Front knee should be at 90 degrees.',
                    'too_deep': 'Don\'t go too deep. Keep front knee at 90 degrees.',
                }
            },
            'torso_alignment': {
                'landmarks': (Landmarks.LEFT_EAR, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP),
                'landmarks_right': (Landmarks.RIGHT_EAR, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP),
                'correct_range': (160, 180),
                'joint_name': 'Torso',
                'corrections': {
                    'leaning': 'Keep your torso upright! Don\'t lean forward.',
                }
            }
        },
        'stage_detection': {
            'angle_joint': 'front_knee_angle',
            'up_threshold': 150,
            'down_threshold': 110,
        }
    }
    
    # ==========================================
    # KNEE EXTENSION Rules (Physiotherapy specific)
    # ==========================================
    KNEE_EXTENSION = {
        'name': 'Knee Extension',
        'reference_image': 'correct_knee_extension.png',
        'description': 'Seated knee extension - extend your leg fully from a seated position',
        'joints': {
            'knee_angle': {
                'landmarks': (Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE, Landmarks.LEFT_ANKLE),
                'landmarks_right': (Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE, Landmarks.RIGHT_ANKLE),
                'correct_range_up': (155, 180),       # Full extension
                'correct_range_down': (70, 100),      # Seated bent
                'joint_name': 'Knee',
                'corrections': {
                    'not_full_extension': 'Extend your leg fully! Try to straighten your knee completely.',
                    'too_fast': 'Move slowly and with control. Hold at the top for 2-3 seconds.',
                    'compensating': 'Don\'t lift your hip. Keep your back against the chair.',
                }
            },
            'hip_stability': {
                'landmarks': (Landmarks.LEFT_SHOULDER, Landmarks.LEFT_HIP, Landmarks.LEFT_KNEE),
                'landmarks_right': (Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_HIP, Landmarks.RIGHT_KNEE),
                'correct_range': (80, 110),
                'joint_name': 'Hip',
                'corrections': {
                    'hip_lifting': 'Keep your hip stable. Don\'t lift off the chair.',
                }
            }
        },
        'stage_detection': {
            'angle_joint': 'knee_angle',
            'up_threshold': 150,
            'down_threshold': 100,
        }
    }
    
    # ==========================================
    # LATERAL ARM RAISE Rules
    # ==========================================
    LATERAL_ARM_RAISE = {
        'name': 'Lateral Arm Raise',
        'reference_image': 'correct_arm_raise.png',
        'description': 'Raise arms laterally to shoulder height with a slight elbow bend',
        'joints': {
            'shoulder_angle': {
                'landmarks': (Landmarks.LEFT_HIP, Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW),
                'landmarks_right': (Landmarks.RIGHT_HIP, Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW),
                'correct_range_up': (80, 100),        # Arms at shoulder height
                'correct_range_down': (0, 20),         # Arms at sides
                'joint_name': 'Shoulder',
                'corrections': {
                    'too_high': 'Don\'t raise arms above shoulder height!',
                    'too_low': 'Raise your arms higher to shoulder level.',
                    'shrugging': 'Relax your shoulders. Don\'t shrug while lifting.',
                }
            },
            'elbow_bend': {
                'landmarks': (Landmarks.LEFT_SHOULDER, Landmarks.LEFT_ELBOW, Landmarks.LEFT_WRIST),
                'landmarks_right': (Landmarks.RIGHT_SHOULDER, Landmarks.RIGHT_ELBOW, Landmarks.RIGHT_WRIST),
                'correct_range': (150, 175),
                'joint_name': 'Elbow',
                'corrections': {
                    'too_bent': 'Keep a slight bend in your elbow, don\'t bend too much.',
                    'too_straight': 'Keep a slight bend in your elbow to protect the joint.',
                }
            }
        },
        'stage_detection': {
            'angle_joint': 'shoulder_angle',
            'up_threshold': 70,
            'down_threshold': 30,
        }
    }


# Mapping exercise names to their rule configs
EXERCISE_REGISTRY = {
    'bicep_curl': ExerciseRules.BICEP_CURL,
    'squat': ExerciseRules.SQUAT,
    'shoulder_press': ExerciseRules.SHOULDER_PRESS,
    'lunge': ExerciseRules.LUNGE,
    'knee_extension': ExerciseRules.KNEE_EXTENSION,
    'lateral_arm_raise': ExerciseRules.LATERAL_ARM_RAISE,
}


class PostureAnalyzer:
    """
    Analyzes exercise posture in real-time and provides feedback.
    
    Uses joint angle calculations from PoseEstimator to compare
    against predefined exercise rules and generate corrections.
    """
    
    def __init__(self, pose_estimator: PoseEstimator, 
                 reference_images_dir: str = 'reference_images'):
        self.pose = pose_estimator
        self.ref_dir = reference_images_dir
        
        # State tracking
        self.current_exercise = None
        self.rep_count = 0
        self.stage = 'idle'
        self.prev_stage = 'idle'
        self.stage_time = time.time()
        
        # Smoothing for angle calculations
        self.angle_history: Dict[str, List[float]] = {}
        self.history_size = 5  # Number of frames to average
        
        # Feedback cooldown to avoid spamming
        self.last_feedback_time = 0
        self.feedback_cooldown = 1.0  # seconds
        
        # Score tracking
        self.frame_scores: List[float] = []
        self.session_scores: List[float] = []
    
    def set_exercise(self, exercise_key: str):
        """Set the current exercise to analyze."""
        if exercise_key not in EXERCISE_REGISTRY:
            raise ValueError(f"Unknown exercise: {exercise_key}. "
                           f"Available: {list(EXERCISE_REGISTRY.keys())}")
        self.current_exercise = EXERCISE_REGISTRY[exercise_key]
        self.rep_count = 0
        self.stage = 'idle'
        self.prev_stage = 'idle'
        self.angle_history.clear()
        self.frame_scores.clear()
        self.session_scores.clear()
    
    def _smooth_angle(self, joint_name: str, angle: float) -> float:
        """Apply temporal smoothing to angle calculations."""
        if joint_name not in self.angle_history:
            self.angle_history[joint_name] = []
        
        self.angle_history[joint_name].append(angle)
        if len(self.angle_history[joint_name]) > self.history_size:
            self.angle_history[joint_name].pop(0)
        
        return sum(self.angle_history[joint_name]) / len(self.angle_history[joint_name])
    
    def _get_best_side_angle(self, joint_config: dict) -> Optional[float]:
        """
        Calculate the angle using the most visible side of the body.
        """
        side = self.pose.get_body_side_visibility()
        
        if side == 'left' or side == 'both':
            landmarks = joint_config['landmarks']
        else:
            landmarks = joint_config.get('landmarks_right', joint_config['landmarks'])
        
        angle = self.pose.calculate_angle(*landmarks)
        return angle
    
    def _check_angle_range(self, angle: float, 
                            target_range: Tuple[float, float],
                            tolerance: float = 10.0) -> Tuple[PostureStatus, float]:
        """
        Check if an angle falls within the target range.
        
        Returns:
            Tuple of (PostureStatus, severity)
        """
        min_angle, max_angle = target_range
        
        if min_angle <= angle <= max_angle:
            return PostureStatus.CORRECT, 0.0
        
        # Calculate how far off the angle is
        if angle < min_angle:
            deviation = min_angle - angle
        else:
            deviation = angle - max_angle
        
        # Classify severity
        if deviation <= tolerance:
            severity = deviation / (tolerance * 3)
            return PostureStatus.MINOR_ISSUE, min(severity, 0.4)
        elif deviation <= tolerance * 2:
            severity = 0.4 + (deviation - tolerance) / (tolerance * 3)
            return PostureStatus.MAJOR_ISSUE, min(severity, 0.7)
        else:
            severity = 0.7 + (deviation - tolerance * 2) / (tolerance * 3)
            return PostureStatus.CRITICAL, min(severity, 1.0)
    
    def _detect_stage(self, angles: Dict[str, float]) -> str:
        """Detect the current stage of the exercise (up/down)."""
        if self.current_exercise is None:
            return 'idle'
        
        stage_config = self.current_exercise['stage_detection']
        joint_name = stage_config['angle_joint']
        
        if joint_name not in angles:
            return self.stage
        
        angle = angles[joint_name]
        
        if angle <= stage_config.get('up_threshold', 60):
            return 'up'
        elif angle >= stage_config.get('down_threshold', 140):
            return 'down'
        else:
            return 'transition'
    
    def _count_reps(self, new_stage: str):
        """Count repetitions based on stage transitions."""
        if self.prev_stage == 'down' and new_stage == 'up':
            # Going from down to up
            pass
        elif self.prev_stage == 'up' and new_stage == 'down':
            # Completed one rep (went up and came back down)
            self.rep_count += 1
        
        self.prev_stage = self.stage
        self.stage = new_stage
    
    def analyze_frame(self) -> Optional[ExerciseAnalysis]:
        """
        Analyze the current frame's pose against exercise rules.
        
        Returns:
            ExerciseAnalysis with detailed feedback, or None if no exercise set
        """
        if self.current_exercise is None:
            return None
        
        if self.pose.landmarks is None:
            return ExerciseAnalysis(
                exercise_name=self.current_exercise['name'],
                overall_status=PostureStatus.CRITICAL,
                feedbacks=[PostureFeedback(
                    status=PostureStatus.CRITICAL,
                    message="Cannot detect your body. Please ensure full body is visible.",
                    suggestion="Stand further from the camera and ensure good lighting.",
                    joint_name="Body",
                    current_angle=0,
                    target_angle_range=(0, 0),
                    severity=1.0
                )],
                rep_count=self.rep_count,
                stage=self.stage,
                overall_score=0,
                reference_image_path=os.path.join(self.ref_dir, self.current_exercise['reference_image']),
                timestamp=time.time()
            )
        
        feedbacks = []
        angles = {}
        total_severity = 0.0
        num_checks = 0
        highlight_joints = {}
        
        for joint_key, joint_config in self.current_exercise['joints'].items():
            # Calculate angle for this joint
            angle = self._get_best_side_angle(joint_config)
            if angle is None:
                continue
            
            # Smooth the angle
            angle = self._smooth_angle(joint_key, angle)
            angles[joint_key] = angle
            
            # Determine which range to check based on current stage
            if 'correct_range_up' in joint_config and 'correct_range_down' in joint_config:
                # This joint has different ranges for different stages
                if self.stage == 'up' or (self.stage == 'transition' and self.prev_stage == 'up'):
                    target_range = joint_config['correct_range_up']
                elif self.stage == 'down' or self.stage == 'idle':
                    target_range = joint_config['correct_range_down']
                else:
                    # During transition, use a wider combined range
                    up_range = joint_config['correct_range_up']
                    down_range = joint_config['correct_range_down']
                    target_range = (min(up_range[0], down_range[0]), 
                                  max(up_range[1], down_range[1]))
            elif 'correct_range' in joint_config:
                target_range = joint_config['correct_range']
            else:
                continue
            
            # Check angle against target range
            status, severity = self._check_angle_range(angle, target_range)
            total_severity += severity
            num_checks += 1
            
            # Generate feedback
            corrections = joint_config.get('corrections', {})
            
            if status == PostureStatus.CORRECT:
                message = f"✓ {joint_config['joint_name']} angle is perfect!"
                suggestion = "Keep it up! Great form."
            else:
                # Determine which correction to give
                if angle < target_range[0]:
                    # Angle is too small
                    correction_keys = [k for k in corrections.keys() 
                                      if 'tight' in k or 'deep' in k or 'forward' in k or 
                                      'low' in k or 'not_full' in k or 'not_deep' in k or
                                      'bent' in k or 'compensating' in k or 'hip_lifting' in k]
                else:
                    # Angle is too large
                    correction_keys = [k for k in corrections.keys() 
                                      if 'wide' in k or 'shallow' in k or 'leaning' in k or 
                                      'high' in k or 'swing' in k or 'straight' in k or
                                      'flared' in k or 'shrug' in k]
                
                if correction_keys:
                    correction_key = correction_keys[0]
                    message = f"✗ {joint_config['joint_name']}: {corrections[correction_key]}"
                    suggestion = corrections[correction_key]
                else:
                    message = f"✗ {joint_config['joint_name']} angle ({angle:.0f}°) is outside optimal range ({target_range[0]:.0f}°-{target_range[1]:.0f}°)"
                    suggestion = f"Adjust your {joint_config['joint_name'].lower()} angle to be between {target_range[0]:.0f}° and {target_range[1]:.0f}°"
                
                # Set highlight color based on severity
                color = (0, 165, 255) if status == PostureStatus.MINOR_ISSUE else \
                        (0, 0, 255) if status == PostureStatus.MAJOR_ISSUE else \
                        (0, 0, 200)
                
                # Add landmarks to highlight
                side = self.pose.get_body_side_visibility()
                if side == 'left' or side == 'both':
                    lm = joint_config['landmarks']
                else:
                    lm = joint_config.get('landmarks_right', joint_config['landmarks'])
                for lm_id in lm:
                    highlight_joints[lm_id] = color
            
            feedbacks.append(PostureFeedback(
                status=status,
                message=message,
                suggestion=suggestion,
                joint_name=joint_config['joint_name'],
                current_angle=angle,
                target_angle_range=target_range,
                severity=severity,
                highlight_joints=list(joint_config['landmarks'])
            ))
        
        # Detect exercise stage and count reps
        new_stage = self._detect_stage(angles)
        self._count_reps(new_stage)
        
        # Calculate overall score
        if num_checks > 0:
            avg_severity = total_severity / num_checks
            overall_score = max(0, (1.0 - avg_severity) * 100)
        else:
            overall_score = 0
        
        self.frame_scores.append(overall_score)
        
        # Determine overall status
        if all(f.status == PostureStatus.CORRECT for f in feedbacks):
            overall_status = PostureStatus.CORRECT
        elif any(f.status == PostureStatus.CRITICAL for f in feedbacks):
            overall_status = PostureStatus.CRITICAL
        elif any(f.status == PostureStatus.MAJOR_ISSUE for f in feedbacks):
            overall_status = PostureStatus.MAJOR_ISSUE
        else:
            overall_status = PostureStatus.MINOR_ISSUE
        
        return ExerciseAnalysis(
            exercise_name=self.current_exercise['name'],
            overall_status=overall_status,
            feedbacks=feedbacks,
            rep_count=self.rep_count,
            stage=self.stage,
            overall_score=overall_score,
            reference_image_path=os.path.join(self.ref_dir, self.current_exercise['reference_image']),
            timestamp=time.time()
        )
    
    def get_session_summary(self) -> Dict:
        """Get a summary of the session performance."""
        if not self.frame_scores:
            return {'avg_score': 0, 'total_reps': 0, 'best_score': 0}
        
        return {
            'avg_score': sum(self.frame_scores) / len(self.frame_scores),
            'total_reps': self.rep_count,
            'best_score': max(self.frame_scores),
            'worst_score': min(self.frame_scores),
            'total_frames': len(self.frame_scores),
        }
    
    def get_available_exercises(self) -> List[Dict]:
        """Get list of all available exercises."""
        exercises = []
        for key, config in EXERCISE_REGISTRY.items():
            exercises.append({
                'key': key,
                'name': config['name'],
                'description': config['description'],
                'reference_image': config['reference_image'],
            })
        return exercises
