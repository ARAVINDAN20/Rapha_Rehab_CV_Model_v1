import os
import json
import logging
from datetime import datetime
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}',
    datefmt='%Y-%m-%dT%H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(24).hex())

# CORS configuration
CORS(app, resources={
    r"/api/*": {"origins": os.environ.get('ALLOWED_ORIGINS', '*').split(',')},
    r"/health": {"origins": "*"}
})

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri=os.environ.get('REDIS_URL', 'memory://'),
)

# Exercise registry
EXERCISES = [
    {
        'key': 'bicep_curl',
        'name': 'Bicep Curl',
        'description': 'Stand with feet shoulder-width apart, hold weights at sides. Curl arms up to shoulder height keeping elbows close to body.',
        'reference_image': 'correct_bicep_curl.png'
    },
    {
        'key': 'squat',
        'name': 'Squat',
        'description': 'Stand with feet shoulder-width apart, lower body until thighs are parallel to floor, keeping back straight.',
        'reference_image': 'correct_squat.png'
    },
    {
        'key': 'shoulder_press',
        'name': 'Shoulder Press',
        'description': 'Hold weights at shoulder height, press up until arms are fully extended overhead.',
        'reference_image': 'correct_shoulder_press.png'
    },
    {
        'key': 'lunge',
        'name': 'Lunge',
        'description': 'Step forward with one leg, lower hips until both knees are at 90 degrees.',
        'reference_image': 'correct_lunge.png'
    },
    {
        'key': 'knee_extension',
        'name': 'Knee Extension',
        'description': 'Sit on edge of chair, extend leg straight out, hold briefly, then lower.',
        'reference_image': 'correct_knee_extension.png'
    },
    {
        'key': 'lateral_arm_raise',
        'name': 'Lateral Arm Raise',
        'description': 'Stand with arms at sides, raise both arms out to shoulder height keeping slight elbow bend.',
        'reference_image': 'correct_arm_raise.png'
    },
]

@app.route('/')
def index():
    logger.info("Main page requested")
    return render_template('index.html')

@app.route('/reference_images/<filename>')
def reference_image(filename):
    # Security: only allow image files
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.webp'}
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed_extensions:
        return jsonify({'error': 'Invalid file type'}), 400
    return send_from_directory('reference_images', filename)

@app.route('/api/exercises')
@limiter.limit("100 per minute")
def get_exercises():
    return jsonify({'exercises': EXERCISES})

@app.route('/api/save_session', methods=['POST'])
@limiter.limit("10 per minute")
def save_session():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Validate required fields
        required_fields = ['exercise', 'reps', 'avg_score']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400

        # Sanitize data
        session_log = {
            'timestamp': datetime.utcnow().isoformat(),
            'exercise': str(data.get('exercise', ''))[:50],
            'reps': int(data.get('reps', 0)),
            'avg_score': float(data.get('avg_score', 0)),
            'best_score': float(data.get('best_score', 0)),
            'duration_seconds': int(data.get('duration_seconds', 0)),
        }

        # Log session data
        logger.info(f"Session saved: {json.dumps(session_log)}")

        # Save to file if logs directory exists
        logs_dir = os.path.join(os.path.dirname(__file__), 'logs')
        os.makedirs(logs_dir, exist_ok=True)
        log_file = os.path.join(logs_dir, f"sessions_{datetime.utcnow().strftime('%Y-%m-%d')}.jsonl")
        with open(log_file, 'a') as f:
            f.write(json.dumps(session_log) + '\n')

        return jsonify({'status': 'saved', 'timestamp': session_log['timestamp']})

    except (ValueError, TypeError) as e:
        logger.error(f"Invalid session data: {e}")
        return jsonify({'error': 'Invalid data format'}), 400
    except Exception as e:
        logger.error(f"Error saving session: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/health')
@app.route('/api/health')
@limiter.exempt
def health():
    return jsonify({
        'status': 'healthy',
        'service': 'physioguard',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    })

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(429)
def rate_limit_exceeded(e):
    return jsonify({'error': 'Rate limit exceeded', 'retry_after': str(e.retry_after)}), 429

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal error: {e}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'production') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)
