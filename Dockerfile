FROM python:3.10-slim

# Security: create non-root user
RUN groupadd -r physio && useradd -r -g physio physio

# Set working directory
WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY gunicorn.conf.py .
COPY templates/ templates/
COPY static/ static/
COPY reference_images/ reference_images/

# Create logs directory with proper permissions
RUN mkdir -p logs && chown -R physio:physio /app && chmod 777 logs

# Switch to non-root user
USER physio

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" || exit 1

# Run with gunicorn using config file
CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:app"]
