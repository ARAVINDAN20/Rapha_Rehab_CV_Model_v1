#!/bin/bash
# ==========================================
# PhysioGuard - Setup & Run Script
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_NAME="physio_pose"
PYTHON="/home/steeve/anaconda3/envs/${ENV_NAME}/bin/python"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   🏥 PhysioGuard - Real-Time Physiotherapy Monitor          ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if conda env exists
if [ ! -f "$PYTHON" ]; then
    echo "[!] Conda environment '${ENV_NAME}' not found."
    echo "[*] Creating environment..."
    conda create -n ${ENV_NAME} python=3.10 -y
    echo "[*] Installing dependencies..."
    /home/steeve/anaconda3/envs/${ENV_NAME}/bin/pip install -r "${SCRIPT_DIR}/requirements.txt"
    # Uninstall sounddevice to avoid PortAudio issues
    /home/steeve/anaconda3/envs/${ENV_NAME}/bin/pip uninstall -y sounddevice 2>/dev/null || true
fi

echo ""
echo "Choose how to run PhysioGuard:"
echo ""
echo "  [1] Web Interface (Flask) - Opens in browser at http://localhost:5000"
echo "  [2] Standalone (OpenCV window) - Direct webcam view"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "[*] Starting PhysioGuard Web Interface..."
        echo "[*] Open your browser: http://localhost:5000"
        echo ""
        cd "$SCRIPT_DIR"
        $PYTHON app.py
        ;;
    2)
        echo ""
        echo "[*] Starting PhysioGuard Standalone Monitor..."
        echo ""
        cd "$SCRIPT_DIR"
        $PYTHON standalone_monitor.py
        ;;
    *)
        echo "[!] Invalid choice. Exiting."
        exit 1
        ;;
esac
