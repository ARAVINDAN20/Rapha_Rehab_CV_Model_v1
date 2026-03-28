# 🏥 PhysioGuard - Real-Time Physiotherapy Exercise Posture Monitor

An AI-powered system that monitors physiotherapy patients' exercise posture in real-time using computer vision, provides instant feedback on form correctness, and shows reference images for correct posture.

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose-green.svg)
![OpenCV](https://img.shields.io/badge/OpenCV-4.8+-orange.svg)
![Flask](https://img.shields.io/badge/Flask-3.0+-red.svg)

---

## 🌟 Features

### Real-Time Posture Analysis
- **33 Body Landmarks** detected using MediaPipe Pose
- **Joint Angle Calculation** for key exercise movements
- **Temporal Smoothing** for stable angle readings
- **Both Left/Right Body Side** support with auto-detection

### 6 Physiotherapy Exercises Supported
| Exercise | Focus Area | Key Joints Monitored |
|----------|-----------|---------------------|
| 🏋️ Bicep Curl | Upper arm rehab | Elbow angle, Shoulder stability |
| 🦵 Squat | Lower body strength | Knee angle, Hip angle, Back alignment |
| 💪 Shoulder Press | Shoulder rehab | Elbow extension, Shoulder angle |
| 🚶 Lunge | Knee/hip rehab | Front knee, Torso alignment |
| 🦿 Knee Extension | Post-surgery recovery | Knee extension, Hip stability |
| 🤸 Lateral Arm Raise | Shoulder mobility | Shoulder angle, Elbow bend |

### Intelligent Feedback System
- **4-Level Severity Classification**: Correct → Minor Issue → Major Issue → Critical
- **Specific Correction Suggestions** for each joint
- **Voice Feedback** (browser TTS or pyttsx3)
- **Correct Posture Reference Images** shown alongside

### Performance Tracking
- **Repetition Counting** with stage detection (up/down phases)
- **Real-Time Scoring** (0-100 scale)
- **Session Summary** with average score, total reps, and best/worst performance

---

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Pose Estimation | **MediaPipe Pose** | 33 3D body landmarks from RGB video |
| Image Processing | **OpenCV** | Video capture, frame processing, overlay |
| Angle Computation | **NumPy** | Vector math for joint angle calculation |
| Web Interface | **Flask** | Real-time video streaming + REST API |
| Voice Feedback | **pyttsx3 / Browser TTS** | Audio posture corrections |
| Reference Images | **AI-Generated** | Correct posture visual guides |

---

## 📁 Project Structure

```
cv_gym/
├── app.py                     # Flask web application (main entry point)
├── standalone_monitor.py      # Standalone OpenCV version (no browser needed)
├── pose_engine.py             # Core pose estimation engine (MediaPipe)
├── exercise_analyzer.py       # Exercise rules, angle thresholds, feedback logic
├── requirements.txt           # Python dependencies
├── README.md                  # This file
├── templates/
│   └── index.html             # Web UI (glassmorphism design)
├── reference_images/          # Correct posture reference images
│   ├── correct_bicep_curl.png
│   ├── correct_squat.png
│   ├── correct_shoulder_press.png
│   ├── correct_lunge.png
│   ├── correct_knee_extension.png
│   └── correct_arm_raise.png
└── logs/                      # Session logs
```

---

## 🚀 Setup & Run

### Prerequisites
- Python 3.10+
- Webcam
- Conda (recommended)

### Quick Start

```bash
# 1. Activate the conda environment
conda activate physio_pose

# 2. Install dependencies (if not already done)
pip install -r requirements.txt

# 3. Run the web version
python app.py
# Open browser: http://localhost:5000

# OR run the standalone version (direct OpenCV window)
python standalone_monitor.py
```

### How It Works

```
┌──────────┐     ┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Webcam  │────▶│  MediaPipe   │────▶│  Angle Analysis  │────▶│  Feedback   │
│  Feed    │     │  Pose (33    │     │  & Rule Engine   │     │  System     │
│          │     │  landmarks)  │     │                  │     │             │
└──────────┘     └──────────────┘     └──────────────────┘     └─────────────┘
                       │                       │                       │
                  33 3D body             Joint angles           Visual overlay
                  landmarks              compared to           Voice feedback
                  detected               exercise rules        Score + reps
                                                               Reference image
```

---

## 🎮 Usage

### Web Version (app.py)
1. Select an exercise from the dropdown
2. Click **Start Monitoring**
3. Position yourself in front of the webcam
4. Follow the real-time feedback on screen
5. Reference image shows correct posture
6. Click **Stop** to see session summary

### Standalone Version (standalone_monitor.py)
| Key | Action |
|-----|--------|
| `1-6` | Switch between exercises |
| `v` | Toggle voice feedback |
| `r` | Reset rep counter |
| `s` | Show/hide reference image |
| `q` / `ESC` | Quit |

---

## 📊 How the Analysis Works

### Angle Calculation
For each exercise, specific joint angles are calculated:
```
Point A (shoulder)
       \
        \  ← Angle measured at Point B
         \
Point B (elbow) ─────── Point C (wrist)
```

The angle at point B is calculated using:
```python
angle = arccos(dot(BA, BC) / (|BA| × |BC|))
```

### Severity Classification
| Deviation from Target | Status | Color |
|----------------------|--------|-------|
| 0° (within range) | ✅ Correct | Green |
| 1°-10° off | ⚠️ Minor Issue | Orange |
| 10°-20° off | ❌ Major Issue | Red-Orange |
| 20°+ off | 🚫 Critical | Red |

### Example: Bicep Curl Analysis
- **Elbow Angle** at top: Target 30°-55° (arm curled)
- **Elbow Angle** at bottom: Target 150°-180° (arm extended)
- **Shoulder Stability**: Target 0°-25° (upper arm stays still)

---

## 🔧 Adding New Exercises

To add a new exercise, edit `exercise_analyzer.py`:

```python
NEW_EXERCISE = {
    'name': 'New Exercise Name',
    'reference_image': 'correct_new_exercise.png',
    'description': 'Description of the exercise',
    'joints': {
        'joint_name': {
            'landmarks': (Landmarks.POINT_A, Landmarks.POINT_B, Landmarks.POINT_C),
            'correct_range_up': (min_angle, max_angle),
            'correct_range_down': (min_angle, max_angle),
            'joint_name': 'Display Name',
            'corrections': {
                'issue_type': 'Correction message for the patient'
            }
        }
    },
    'stage_detection': {
        'angle_joint': 'joint_name',
        'up_threshold': angle_for_up_position,
        'down_threshold': angle_for_down_position,
    }
}
```

Then register it in `EXERCISE_REGISTRY`:
```python
EXERCISE_REGISTRY['new_exercise'] = ExerciseRules.NEW_EXERCISE
```

---

## 📋 API Endpoints (Web Version)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main web interface |
| `/video_feed` | GET | MJPEG video stream |
| `/api/start_monitoring` | POST | Start exercise monitoring |
| `/api/stop_monitoring` | POST | Stop and get session summary |
| `/api/get_analysis` | GET | Get latest posture analysis |
| `/api/exercises` | GET | List available exercises |
| `/api/session_summary` | GET | Get session statistics |
| `/reference_images/<file>` | GET | Serve reference images |

---

## 🏗️ Architecture

- **`pose_engine.py`** - Low-level MediaPipe wrapper, landmark detection, angle math
- **`exercise_analyzer.py`** - Rule-based posture analysis engine with feedback generation
- **`app.py`** - Flask web app with REST API and video streaming
- **`standalone_monitor.py`** - Direct OpenCV window version with keyboard controls

---

## ⚠️ Important Notes

1. **Lighting**: Ensure good lighting for accurate pose detection
2. **Distance**: Stand 1.5-3 meters from the camera for full body visibility
3. **Camera Angle**: Camera should be at chest/waist height, facing straight
4. **Clothing**: Wear fitted clothing for better landmark detection
5. **Background**: Plain backgrounds improve detection accuracy

---

## 📚 Research & References

- **MediaPipe Pose**: [Google MediaPipe](https://google.github.io/mediapipe/solutions/pose.html)
- **BlazePose**: Research paper behind MediaPipe's pose model
- Exercise rules based on physiotherapy guidelines and clinical studies

---

*Built with ❤️ for better physiotherapy outcomes*
