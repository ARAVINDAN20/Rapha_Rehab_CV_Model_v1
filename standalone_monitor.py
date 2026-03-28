"""
PhysioGuard - Standalone Version (OpenCV Window)
================================================
This version runs directly with an OpenCV window for cases where
Flask video streaming might not work well with the webcam.

Features:
- Direct webcam access with OpenCV window
- Real-time pose overlay with angle visualization
- On-screen feedback panel
- Voice feedback using pyttsx3
- Rep counting
- Show correct posture reference image
- Keyboard controls for exercise switching

Controls:
    1-6 : Switch between exercises
    v   : Toggle voice feedback
    r   : Reset rep counter
    s   : Show/hide reference image
    q   : Quit
"""

import cv2
import numpy as np
import time
import os
import sys
import threading

from pose_engine import PoseEstimator, Landmarks
from exercise_analyzer import PostureAnalyzer, PostureStatus, EXERCISE_REGISTRY

# Try to import pyttsx3 for voice feedback
try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False
    print("[Warning] pyttsx3 not available. Voice feedback disabled.")


class VoiceFeedback:
    """Thread-safe text-to-speech feedback."""
    
    def __init__(self):
        self.enabled = True
        self.last_spoken = ""
        self.last_time = 0
        self.cooldown = 3.0  # Seconds between voice feedbacks
        self.engine = None
        self._lock = threading.Lock()
        
        if TTS_AVAILABLE:
            try:
                self.engine = pyttsx3.init()
                self.engine.setProperty('rate', 160)
                self.engine.setProperty('volume', 0.8)
                # Try to set a good voice
                voices = self.engine.getProperty('voices')
                for voice in voices:
                    if 'english' in voice.name.lower() or 'en' in voice.id.lower():
                        self.engine.setProperty('voice', voice.id)
                        break
            except Exception as e:
                print(f"[Warning] TTS init failed: {e}")
                self.engine = None
    
    def speak(self, text):
        """Speak text in a non-blocking manner."""
        if not self.enabled or self.engine is None:
            return
        
        now = time.time()
        if now - self.last_time < self.cooldown:
            return
        if text == self.last_spoken:
            return
        
        self.last_spoken = text
        self.last_time = now
        
        # Run TTS in a separate thread to avoid blocking
        thread = threading.Thread(target=self._speak_thread, args=(text,), daemon=True)
        thread.start()
    
    def _speak_thread(self, text):
        with self._lock:
            try:
                self.engine.say(text)
                self.engine.runAndWait()
            except Exception:
                pass
    
    def toggle(self):
        self.enabled = not self.enabled
        return self.enabled


def draw_hud(frame, analysis, show_ref_img, ref_img):
    """Draw comprehensive HUD overlay on the video frame."""
    if analysis is None:
        return frame
    
    h, w, _ = frame.shape
    overlay = frame.copy()
    
    # Color mapping
    status_colors = {
        PostureStatus.CORRECT: (0, 200, 0),
        PostureStatus.MINOR_ISSUE: (0, 200, 255),
        PostureStatus.MAJOR_ISSUE: (0, 100, 255),
        PostureStatus.CRITICAL: (0, 0, 255),
    }
    
    status_color = status_colors.get(analysis.overall_status, (200, 200, 200))
    
    # ---- Top Bar ----
    cv2.rectangle(overlay, (0, 0), (w, 80), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    overlay = frame.copy()
    
    # Exercise name
    cv2.putText(frame, analysis.exercise_name, (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
    
    # Status text
    status_texts = {
        PostureStatus.CORRECT: "PERFECT FORM!",
        PostureStatus.MINOR_ISSUE: "MINOR ADJUSTMENT NEEDED",
        PostureStatus.MAJOR_ISSUE: "NEEDS CORRECTION",
        PostureStatus.CRITICAL: "INCORRECT POSTURE",
    }
    cv2.putText(frame, status_texts.get(analysis.overall_status, ""),
                (15, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
    
    # Score circle (right side)
    score = analysis.overall_score
    score_color = (0, 200, 0) if score >= 80 else (0, 200, 255) if score >= 50 else (0, 0, 255)
    
    cx, cy, radius = w - 60, 45, 30
    # Score circle background
    cv2.circle(frame, (cx, cy), radius + 2, (50, 50, 50), -1)
    
    # Draw arc based on score
    start_angle = -90
    end_angle = start_angle + int(score * 3.6)
    cv2.ellipse(frame, (cx, cy), (radius, radius), 0, start_angle, end_angle, score_color, 3)
    
    # Score text
    score_text = f"{score:.0f}"
    ts = cv2.getTextSize(score_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
    cv2.putText(frame, score_text, (cx - ts[0]//2, cy + ts[1]//2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, score_color, 2)
    
    # ---- Rep Counter ----
    rep_x = w - 200
    cv2.putText(frame, f"Reps: {analysis.rep_count}", (rep_x, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, f"Stage: {analysis.stage.upper()}", (rep_x, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    
    # ---- Feedback Panel (left side) ----
    panel_y = 95
    panel_w = 470
    panel_h = len(analysis.feedbacks) * 55 + 20
    
    cv2.rectangle(overlay, (5, panel_y), (panel_w, panel_y + panel_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)
    
    for i, feedback in enumerate(analysis.feedbacks):
        y_pos = panel_y + 25 + (i * 55)
        fb_color = status_colors.get(feedback.status, (200, 200, 200))
        
        # Status icon
        if feedback.status == PostureStatus.CORRECT:
            icon = "[OK]"
        elif feedback.status == PostureStatus.MINOR_ISSUE:
            icon = "[!!]"
        else:
            icon = "[XX]"
        
        cv2.putText(frame, icon, (15, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, fb_color, 1)
        
        # Joint name and angle
        cv2.putText(frame, f"{feedback.joint_name}: {feedback.current_angle:.0f} deg",
                    (65, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.5, fb_color, 1)
        
        # Target range
        target_text = f"Target: {feedback.target_angle_range[0]:.0f}-{feedback.target_angle_range[1]:.0f} deg"
        cv2.putText(frame, target_text, (270, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)
        
        # Suggestion
        if feedback.status != PostureStatus.CORRECT:
            suggestion = feedback.suggestion[:60]
            cv2.putText(frame, suggestion, (65, y_pos + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (200, 200, 150), 1)
    
    # ---- Reference Image (bottom right) ----
    if show_ref_img and ref_img is not None:
        ref_h, ref_w = ref_img.shape[:2]
        # Scale to fit in corner
        scale = min(200 / ref_w, 200 / ref_h)
        new_w, new_h = int(ref_w * scale), int(ref_h * scale)
        resized_ref = cv2.resize(ref_img, (new_w, new_h))
        
        # Position in bottom-right
        x_offset = w - new_w - 10
        y_offset = h - new_h - 10
        
        # Semi-transparent background
        cv2.rectangle(overlay, (x_offset - 5, y_offset - 25),
                      (x_offset + new_w + 5, y_offset + new_h + 5),
                      (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        
        # Place reference image
        frame[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized_ref
        
        # Label
        cv2.putText(frame, "CORRECT POSTURE", (x_offset, y_offset - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 0), 1)
    
    # ---- Controls Help (bottom left) ----
    help_y = h - 90
    cv2.rectangle(overlay, (0, help_y), (350, h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
    
    controls = [
        "Controls: 1-6: Switch Exercise | V: Toggle Voice",
        "R: Reset Reps | S: Show/Hide Reference | Q: Quit"
    ]
    for i, text in enumerate(controls):
        cv2.putText(frame, text, (10, help_y + 25 + i * 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (150, 150, 150), 1)
    
    # ---- Draw angle arcs on body ----
    for feedback in analysis.feedbacks:
        if feedback.highlight_joints and len(feedback.highlight_joints) == 3:
            color = status_colors.get(feedback.status, (0, 255, 0))
            frame = pose_estimator.draw_angle_arc(
                frame,
                feedback.highlight_joints[0],
                feedback.highlight_joints[1],
                feedback.highlight_joints[2],
                feedback.current_angle,
                color=color,
                label=feedback.joint_name
            )
    
    return frame


def main():
    global pose_estimator
    
    print("""
    ╔══════════════════════════════════════════════════════════════════╗
    ║                                                                  ║
    ║   🏥 PhysioGuard - Standalone Posture Monitor                   ║
    ║                                                                  ║
    ║   Real-time physiotherapy exercise posture analysis              ║
    ║                                                                  ║
    ║   Controls:                                                      ║
    ║   1-6: Switch Exercise  |  V: Toggle Voice                      ║
    ║   R: Reset Reps  |  S: Show/Hide Reference  |  Q: Quit         ║
    ║                                                                  ║
    ╚══════════════════════════════════════════════════════════════════╝
    """)
    
    # Exercise mapping for keyboard shortcuts
    exercises = list(EXERCISE_REGISTRY.keys())
    print("Available exercises:")
    for i, key in enumerate(exercises):
        config = EXERCISE_REGISTRY[key]
        print(f"  [{i+1}] {config['name']} - {config['description']}")
    print()
    
    # Initialize
    print("[+] Initializing pose estimation engine...")
    pose_estimator = PoseEstimator(
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    
    analyzer = PostureAnalyzer(pose_estimator, 
                                os.path.join(os.path.dirname(__file__), 'reference_images'))
    
    voice = VoiceFeedback()
    
    # Default exercise
    current_exercise_idx = 0
    analyzer.set_exercise(exercises[current_exercise_idx])
    print(f"[+] Selected exercise: {EXERCISE_REGISTRY[exercises[current_exercise_idx]]['name']}")
    
    # Load reference image
    ref_img = None
    show_ref = True
    
    def load_reference_image(exercise_key):
        ref_path = os.path.join(os.path.dirname(__file__), 'reference_images',
                                EXERCISE_REGISTRY[exercise_key]['reference_image'])
        if os.path.exists(ref_path):
            return cv2.imread(ref_path)
        return None
    
    ref_img = load_reference_image(exercises[current_exercise_idx])
    
    # Open camera
    print("[+] Opening camera...")
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)
    
    if not cap.isOpened():
        print("[ERROR] Could not open camera!")
        sys.exit(1)
    
    print("[+] Camera opened successfully!")
    print("[+] Starting monitoring... Press 'q' to quit.")
    
    cv2.namedWindow('PhysioGuard - Exercise Monitor', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('PhysioGuard - Exercise Monitor', 1280, 720)
    
    fps_time = time.time()
    frame_count = 0
    fps = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Failed to read from camera!")
            break
        
        # Mirror for natural view
        frame = cv2.flip(frame, 1)
        
        # Process pose
        detected = pose_estimator.process_frame(frame)
        
        if detected:
            # Draw pose
            frame = pose_estimator.draw_landmarks(frame)
            
            # Analyze posture
            analysis = analyzer.analyze_frame()
            
            if analysis:
                # Draw HUD
                frame = draw_hud(frame, analysis, show_ref, ref_img)
                
                # Voice feedback for critical issues
                if analysis.overall_status in [PostureStatus.MAJOR_ISSUE, PostureStatus.CRITICAL]:
                    for fb in analysis.feedbacks:
                        if fb.status in [PostureStatus.MAJOR_ISSUE, PostureStatus.CRITICAL]:
                            voice.speak(fb.suggestion)
                            break
                elif analysis.overall_status == PostureStatus.CORRECT:
                    voice.speak("Great form! Keep going!")
        else:
            cv2.putText(frame, "No body detected - Please stand in view of camera",
                        (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        
        # FPS counter
        frame_count += 1
        if time.time() - fps_time >= 1.0:
            fps = frame_count
            frame_count = 0
            fps_time = time.time()
        
        cv2.putText(frame, f"FPS: {fps}", (frame.shape[1] - 120, frame.shape[0] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 0), 1)
        
        # Display
        cv2.imshow('PhysioGuard - Exercise Monitor', frame)
        
        # Handle keyboard input
        key = cv2.waitKey(1) & 0xFF
        
        if key == ord('q') or key == 27:  # q or ESC
            break
        elif key in [ord('1'), ord('2'), ord('3'), ord('4'), ord('5'), ord('6')]:
            idx = key - ord('1')
            if idx < len(exercises):
                current_exercise_idx = idx
                analyzer.set_exercise(exercises[idx])
                ref_img = load_reference_image(exercises[idx])
                exercise_name = EXERCISE_REGISTRY[exercises[idx]]['name']
                print(f"[+] Switched to: {exercise_name}")
                voice.speak(f"Switched to {exercise_name}")
        elif key == ord('v'):
            enabled = voice.toggle()
            print(f"[+] Voice feedback: {'ON' if enabled else 'OFF'}")
        elif key == ord('r'):
            analyzer.rep_count = 0
            print("[+] Rep counter reset")
        elif key == ord('s'):
            show_ref = not show_ref
            print(f"[+] Reference image: {'ON' if show_ref else 'OFF'}")
    
    # Cleanup
    print("\n[+] Session Summary:")
    summary = analyzer.get_session_summary()
    for key, value in summary.items():
        if isinstance(value, float):
            print(f"    {key}: {value:.1f}")
        else:
            print(f"    {key}: {value}")
    
    cap.release()
    cv2.destroyAllWindows()
    pose_estimator.release()
    print("[+] PhysioGuard stopped. Stay healthy!")


if __name__ == '__main__':
    main()
