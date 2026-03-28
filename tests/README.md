# PhysioGuard E2E Tests (Playwright)

Automated end-to-end tests for the PhysioGuard application.

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

```bash
cd tests
npm install
npm run install:browsers
```

## Running Tests

### Against Local Docker Setup
```bash
# Start the app first
docker-compose up -d

# Run tests
cd tests
BASE_URL=http://localhost:80 npm test
```

### Against AWS Deployment
```bash
# Replace with your ALB DNS name
BASE_URL=http://physioguard-alb-XXXX.ap-south-1.elb.amazonaws.com npm test
```

### With HTTPS
```bash
BASE_URL=http://your-domain.com HTTPS_URL=https://your-domain.com npm test
```

### Run specific test file
```bash
npm run test:api     # API tests only
npm run test:deployment  # Deployment/production tests only
```

### View test report
```bash
npm run test:report
```

## Test Categories

| File | Description |
|------|-------------|
| `e2e/api.spec.js` | API endpoint tests |
| `e2e/app.spec.js` | Application UI tests |
| `e2e/ui.spec.js` | User interface interaction tests |
| `e2e/deployment.spec.js` | Production deployment verification |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:80` | Application URL to test |
| `HTTPS_URL` | `` | HTTPS URL (optional, for HTTPS tests) |

## Expected Results

All tests should pass when:
- Docker Compose is running locally, OR
- ECS Fargate is deployed on AWS

Failed tests indicate issues with:
- Deployment configuration
- Security headers
- API endpoints
- Static file serving
