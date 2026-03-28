"""
Pose Estimation Engine
======================
Core module for real-time human pose estimation using MediaPipe.
Handles landmark detection, angle computation, and pose normalization.

Uses MediaPipe Pose which infers 33 3D body landmarks from RGB video frames.
"""

import cv2
import numpy as np
import mediapipe as mp
import math
from typing import Optional, Tuple, Dict, List


class PoseEstimator:
    """
    Real-time pose estimation using MediaPipe Pose.
    
    Detects 33 body landmarks and provides utility methods for:
    - Angle calculation between any 3 landmarks
    - Distance measurement between landmarks
    - Visibility checking for landmark confidence
    """
    
    # MediaPipe Pose Landmark indices (for reference)
    LANDMARK_NAMES = {
        0: 'NOSE', 1: 'LEFT_EYE_INNER', 2: 'LEFT_EYE', 3: 'LEFT_EYE_OUTER',
        4: 'RIGHT_EYE_INNER', 5: 'RIGHT_EYE', 6: 'RIGHT_EYE_OUTER',
        7: 'LEFT_EAR', 8: 'RIGHT_EAR', 9: 'MOUTH_LEFT', 10: 'MOUTH_RIGHT',
        11: 'LEFT_SHOULDER', 12: 'RIGHT_SHOULDER', 13: 'LEFT_ELBOW',
        14: 'RIGHT_ELBOW', 15: 'LEFT_WRIST', 16: 'RIGHT_WRIST',
        17: 'LEFT_PINKY', 18: 'RIGHT_PINKY', 19: 'LEFT_INDEX',
        20: 'RIGHT_INDEX', 21: 'LEFT_THUMB', 22: 'RIGHT_THUMB',
        23: 'LEFT_HIP', 24: 'RIGHT_HIP', 25: 'LEFT_KNEE',
        26: 'RIGHT_KNEE', 27: 'LEFT_ANKLE', 28: 'RIGHT_ANKLE',
        29: 'LEFT_HEEL', 30: 'RIGHT_HEEL', 31: 'LEFT_FOOT_INDEX',
        32: 'RIGHT_FOOT_INDEX'
    }
    
    def __init__(self, 
                 static_image_mode: bool = False,
                 model_complexity: int = 1,
                 smooth_landmarks: bool = True,
                 min_detection_confidence: float = 0.5,
                 min_tracking_confidence: float = 0.5):
        """
        Initialize the pose estimator.
        
        Args:
            static_image_mode: If True, treats each image independently (slower but more accurate)
            model_complexity: 0, 1, or 2. Higher = more accurate but slower
            smooth_landmarks: Smooth landmark coordinates across frames
            min_detection_confidence: Minimum confidence for person detection
            min_tracking_confidence: Minimum confidence for landmark tracking
        """
        self.mp_pose = mp.solutions.pose
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        self.pose = self.mp_pose.Pose(
            static_image_mode=static_image_mode,
            model_complexity=model_complexity,
            smooth_landmarks=smooth_landmarks,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )
        
        self.landmarks = None
        self.world_landmarks = None
        self.results = None
        self.image_shape = None
    
    def process_frame(self, frame: np.ndarray) -> bool:
        """
        Process a video frame and extract pose landmarks.
        
        Args:
            frame: BGR image from OpenCV
            
        Returns:
            True if pose landmarks were detected, False otherwise
        """
        self.image_shape = frame.shape
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb_frame.flags.writeable = False
        
        self.results = self.pose.process(rgb_frame)
        
        if self.results.pose_landmarks:
            self.landmarks = self.results.pose_landmarks.landmark
            self.world_landmarks = self.results.pose_world_landmarks.landmark if self.results.pose_world_landmarks else None
            return True
        
        self.landmarks = None
        self.world_landmarks = None
        return False
    
    def get_landmark_coords(self, landmark_id: int, 
                            use_world: bool = False) -> Optional[Tuple[float, float, float]]:
        """
        Get the coordinates of a specific landmark.
        
        Args:
            landmark_id: Index of the landmark (0-32)
            use_world: If True, return world coordinates (meters from hip center)
            
        Returns:
            Tuple of (x, y, z) or None if not available
        """
        landmarks = self.world_landmarks if use_world else self.landmarks
        if landmarks is None or landmark_id >= len(landmarks):
            return None
        
        lm = landmarks[landmark_id]
        return (lm.x, lm.y, lm.z)
    
    def get_pixel_coords(self, landmark_id: int) -> Optional[Tuple[int, int]]:
        """
        Get the pixel coordinates of a landmark in the frame.
        
        Args:
            landmark_id: Index of the landmark
            
        Returns:
            Tuple of (x_pixel, y_pixel) or None
        """
        if self.landmarks is None or self.image_shape is None:
            return None
        
        lm = self.landmarks[landmark_id]
        h, w, _ = self.image_shape
        return (int(lm.x * w), int(lm.y * h))
    
    def get_visibility(self, landmark_id: int) -> float:
        """Get the visibility/confidence score for a landmark (0.0 - 1.0)."""
        if self.landmarks is None:
            return 0.0
        return self.landmarks[landmark_id].visibility
    
    def calculate_angle(self, point_a: int, point_b: int, point_c: int,
                        use_world: bool = False) -> Optional[float]:
        """
        Calculate the angle at point_b formed by the line segments BA and BC.
        
        This is the key function for exercise analysis - it measures joint angles.
        
        Args:
            point_a: First landmark index (one end of the angle)
            point_b: Vertex landmark index (where the angle is measured)
            point_c: Third landmark index (other end of the angle)
            use_world: Use 3D world coordinates for more accuracy
            
        Returns:
            Angle in degrees (0-180) or None if landmarks not available
        """
        a = self.get_landmark_coords(point_a, use_world)
        b = self.get_landmark_coords(point_b, use_world)
        c = self.get_landmark_coords(point_c, use_world)
        
        if a is None or b is None or c is None:
            return None
        
        a = np.array(a[:2] if not use_world else a)
        b = np.array(b[:2] if not use_world else b)
        c = np.array(c[:2] if not use_world else c)
        
        # Vectors from b to a and b to c
        ba = a - b
        bc = c - b
        
        # Calculate angle using dot product
        cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
        cosine = np.clip(cosine, -1.0, 1.0)
        angle = np.degrees(np.arccos(cosine))
        
        return angle
    
    def calculate_distance(self, point_a: int, point_b: int,
                          use_world: bool = False) -> Optional[float]:
        """
        Calculate the distance between two landmarks.
        
        Args:
            point_a: First landmark index
            point_b: Second landmark index
            use_world: Use world coordinates
            
        Returns:
            Distance value or None
        """
        a = self.get_landmark_coords(point_a, use_world)
        b = self.get_landmark_coords(point_b, use_world)
        
        if a is None or b is None:
            return None
        
        a = np.array(a)
        b = np.array(b)
        return np.linalg.norm(a - b)
    
    def calculate_vertical_angle(self, point_a: int, point_b: int) -> Optional[float]:
        """
        Calculate the angle of a line segment relative to the vertical axis.
        Useful for checking torso/spine alignment.
        
        Args:
            point_a: Top landmark
            point_b: Bottom landmark
            
        Returns:
            Angle from vertical in degrees
        """
        a = self.get_landmark_coords(point_a)
        b = self.get_landmark_coords(point_b)
        
        if a is None or b is None:
            return None
        
        # Calculate angle from vertical
        dx = b[0] - a[0]
        dy = b[1] - a[1]
        
        angle = abs(math.degrees(math.atan2(dx, dy)))
        return angle
    
    def draw_landmarks(self, frame: np.ndarray, 
                       highlight_joints: Dict[int, Tuple[int, int, int]] = None) -> np.ndarray:
        """
        Draw pose landmarks on the frame with optional highlighting.
        
        Args:
            frame: Image to draw on
            highlight_joints: Dict mapping landmark_id to RGB color for highlighting
            
        Returns:
            Frame with landmarks drawn
        """
        if self.results is None or self.results.pose_landmarks is None:
            return frame
        
        annotated = frame.copy()
        
        # Draw the pose skeleton
        self.mp_drawing.draw_landmarks(
            annotated,
            self.results.pose_landmarks,
            self.mp_pose.POSE_CONNECTIONS,
            landmark_drawing_spec=self.mp_drawing_styles.get_default_pose_landmarks_style()
        )
        
        # Highlight specific joints if requested
        if highlight_joints and self.landmarks:
            h, w, _ = frame.shape
            for joint_id, color in highlight_joints.items():
                if joint_id < len(self.landmarks):
                    lm = self.landmarks[joint_id]
                    cx, cy = int(lm.x * w), int(lm.y * h)
                    cv2.circle(annotated, (cx, cy), 12, color, -1)
                    cv2.circle(annotated, (cx, cy), 14, (255, 255, 255), 2)
        
        return annotated
    
    def draw_angle_arc(self, frame: np.ndarray, 
                       point_a: int, point_b: int, point_c: int,
                       angle: float, color: Tuple[int, int, int] = (0, 255, 0),
                       label: str = None) -> np.ndarray:
        """
        Draw an angle arc visualization at a joint.
        
        Args:
            frame: Image to draw on
            point_a, point_b, point_c: Landmark indices forming the angle
            angle: Calculated angle value
            color: BGR color for the arc
            label: Optional text label
            
        Returns:
            Frame with angle visualization
        """
        b_coords = self.get_pixel_coords(point_b)
        if b_coords is None:
            return frame
        
        cx, cy = b_coords
        
        # Draw angle text near the joint
        text = f"{angle:.0f}°"
        if label:
            text = f"{label}: {text}"
        
        cv2.putText(frame, text, (cx + 15, cy - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        # Draw a small circle at the vertex
        cv2.circle(frame, (cx, cy), 8, color, 2)
        
        return frame
    
    def is_landmark_visible(self, landmark_id: int, threshold: float = 0.5) -> bool:
        """Check if a landmark is visible with sufficient confidence."""
        return self.get_visibility(landmark_id) >= threshold
    
    def get_body_side_visibility(self) -> str:
        """
        Determine which side of the body is more visible to the camera.
        
        Returns:
            'left', 'right', or 'both'
        """
        left_vis = sum([
            self.get_visibility(11),  # Left shoulder
            self.get_visibility(13),  # Left elbow
            self.get_visibility(15),  # Left wrist
            self.get_visibility(23),  # Left hip
            self.get_visibility(25),  # Left knee
            self.get_visibility(27),  # Left ankle
        ]) / 6
        
        right_vis = sum([
            self.get_visibility(12),  # Right shoulder
            self.get_visibility(14),  # Right elbow
            self.get_visibility(16),  # Right wrist
            self.get_visibility(24),  # Right hip
            self.get_visibility(26),  # Right knee
            self.get_visibility(28),  # Right ankle
        ]) / 6
        
        if left_vis > 0.6 and right_vis > 0.6:
            return 'both'
        elif left_vis > right_vis:
            return 'left'
        else:
            return 'right'
    
    def release(self):
        """Release MediaPipe resources."""
        self.pose.close()


# Convenience landmark index constants
class Landmarks:
    """Named constants for MediaPipe Pose landmark indices."""
    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32
