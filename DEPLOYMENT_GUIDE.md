# PhysioGuard - Complete AWS Deployment Guide

> A step-by-step guide to deploy PhysioGuard to AWS with production-grade multi-user support.

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Testing First](#3-local-testing-first)
4. [AWS Account Setup](#4-aws-account-setup)
5. [Create S3 + DynamoDB for Terraform State](#5-create-s3--dynamodb-for-terraform-state)
6. [Build and Push Docker Image to ECR](#6-build-and-push-docker-image-to-ecr)
7. [Deploy Infrastructure with Terraform](#7-deploy-infrastructure-with-terraform)
8. [Configure HTTPS/SSL](#8-configure-httpsssl)
9. [Multi-User Support Explained](#9-multi-user-support-explained)
10. [Monitoring & Logs](#10-monitoring--logs)
11. [Cost Estimation](#11-cost-estimation)
12. [Updating the Application](#12-updating-the-application)
13. [Running Playwright Tests](#13-running-playwright-tests)
14. [Troubleshooting](#14-troubleshooting)
15. [Security Checklist](#15-security-checklist)

---

## 1. Architecture Overview

```
Internet Users
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│          AWS Region: ap-south-1 (Mumbai)                │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              VPC (10.0.0.0/16)                      │ │
│  │                                                      │ │
│  │  Public Subnets (10.0.0.0/24, 10.0.1.0/24)         │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │   Application Load Balancer (ALB)            │   │ │
│  │  │   - HTTP (80) → HTTPS redirect               │   │ │
│  │  │   - HTTPS (443) with ACM certificate         │   │ │
│  │  │   - Health checks every 30s                  │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                       │                              │ │
│  │  Private Subnets (10.0.10.0/24, 10.0.11.0/24)      │ │
│  │  ┌──────────────────┐  ┌──────────────────────┐    │ │
│  │  │  ECS Task #1      │  │  ECS Task #2          │   │ │
│  │  │  Flask + Gunicorn │  │  Flask + Gunicorn     │   │ │
│  │  │  256 CPU / 512 MB │  │  256 CPU / 512 MB     │   │ │
│  │  └──────────────────┘  └──────────────────────┘    │ │
│  │           Auto-scales up to 10 tasks                 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  Supporting Services:                                    │
│  • ECR: Docker image registry                           │
│  • ACM: Free SSL/TLS certificates                       │
│  • CloudWatch: Logs & metrics                           │
│  • Secrets Manager: SECRET_KEY storage                  │
│  • Auto Scaling: 2-10 tasks based on CPU/Memory         │
└─────────────────────────────────────────────────────────┘

NOTE: All pose estimation runs in USER'S BROWSER.
The server just serves HTML/JS files. No GPU needed!
```

**Why this is perfect for multi-user:** Each user's browser does their own MediaPipe pose estimation. The server only serves static files, making it infinitely scalable horizontally.

---

## 2. Prerequisites

### 2.1 Install Required Tools

#### AWS CLI
```bash
# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
# Expected: aws-cli/2.x.x Python/3.x.x Linux/...
```

#### Terraform
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y gnupg software-properties-common
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt-get install terraform

# Verify
terraform --version
# Expected: Terraform v1.x.x
```

#### Docker
```bash
# Ubuntu
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER  # Add yourself to docker group
newgrp docker  # Apply without logout

# Verify
docker --version
# Expected: Docker version 24.x.x
```

#### Node.js (for Playwright tests)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version && npm --version
```

### 2.2 Your Existing Conda Environment (physio_pose)

You already have the `physio_pose` conda environment. For deployment, you mainly need Docker, but to run locally:

```bash
# Activate your environment
conda activate physio_pose

# Install production requirements
pip install -r requirements.txt

# Test locally
python app.py
# Visit http://localhost:5000
```

---

## 3. Local Testing First

**Always test locally before deploying to AWS!**

### 3.1 Test with Conda Environment

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym

# Activate conda env
conda activate physio_pose

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
# Edit .env to set a proper SECRET_KEY

# Run with gunicorn (production-like)
gunicorn --config gunicorn.conf.py app:app

# Or run with Flask dev server
python app.py
```

Visit http://localhost:5000 - you should see PhysioGuard!

### 3.2 Test with Docker Compose

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym

# Copy env file
cp .env.example .env

# Build and run
docker-compose up --build

# Check if running
curl http://localhost/health
# Expected: {"status": "healthy", "service": "physioguard", ...}
```

Visit http://localhost - you should see PhysioGuard!

### 3.3 Run Playwright Tests Locally

```bash
cd tests/
npm install
npm run install:browsers

# Test against local Docker
BASE_URL=http://localhost npm test
```

---

## 4. AWS Account Setup

### 4.1 Create AWS Account

1. Go to https://aws.amazon.com
2. Click "Create an AWS Account"
3. Follow the signup process (requires credit card)
4. Choose "Free Tier" when possible

### 4.2 Create IAM User for Deployment

**Why:** Never use root account for deployments!

1. Log into AWS Console -> IAM -> Users -> "Create user"
2. User name: `physioguard-deployer`
3. Select: "Programmatic access"
4. Attach policies:
   - `AmazonECS_FullAccess`
   - `AmazonEC2ContainerRegistryFullAccess`
   - `AmazonVPCFullAccess`
   - `ElasticLoadBalancingFullAccess`
   - `CloudWatchFullAccess`
   - `IAMFullAccess`
   - `SecretsManagerReadWrite`
   - `AmazonS3FullAccess`
   - `AmazonDynamoDBFullAccess`
   - `AWSCertificateManagerFullAccess`

5. Save the **Access Key ID** and **Secret Access Key** safely!

### 4.3 Configure AWS CLI

```bash
aws configure
# Enter when prompted:
# AWS Access Key ID: YOUR_ACCESS_KEY_ID
# AWS Secret Access Key: YOUR_SECRET_ACCESS_KEY
# Default region name: ap-south-1
# Default output format: json

# Verify
aws sts get-caller-identity
# Should show your account ID
```

---

## 5. Create S3 + DynamoDB for Terraform State

**Why:** Terraform stores its state (what it has deployed) remotely so multiple people/machines can work safely.

### 5.1 Create S3 Bucket for State

```bash
# Replace ACCOUNT_ID with your actual AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-south-1"

# Create bucket
aws s3api create-bucket \
  --bucket "physioguard-terraform-state-${AWS_ACCOUNT_ID}" \
  --region ${REGION} \
  --create-bucket-configuration LocationConstraint=${REGION}

# Enable versioning (important for state files!)
aws s3api put-bucket-versioning \
  --bucket "physioguard-terraform-state-${AWS_ACCOUNT_ID}" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "physioguard-terraform-state-${AWS_ACCOUNT_ID}" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "physioguard-terraform-state-${AWS_ACCOUNT_ID}" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "S3 bucket created: physioguard-terraform-state-${AWS_ACCOUNT_ID}"
```

### 5.2 Create DynamoDB Table for State Locking

```bash
aws dynamodb create-table \
  --table-name "physioguard-terraform-locks" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ${REGION}

echo "DynamoDB table created: physioguard-terraform-locks"
```

### 5.3 Enable Remote Backend in Terraform

Edit `terraform/main.tf` and uncomment the backend block:
```hcl
backend "s3" {
  bucket         = "physioguard-terraform-state-YOUR_ACCOUNT_ID"  # Replace!
  key            = "production/terraform.tfstate"
  region         = "ap-south-1"
  dynamodb_table = "physioguard-terraform-locks"
  encrypt        = true
}
```

---

## 6. Build and Push Docker Image to ECR

### 6.1 First, Initialize Terraform to Create ECR

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym/terraform

# Create terraform.tfvars
cp terraform.tfvars.example terraform.tfvars
# Edit if needed

# Initialize Terraform
terraform init

# Preview what will be created
terraform plan

# Create ONLY ECR first (to push image before deploying ECS)
terraform apply -target=aws_ecr_repository.app
```

### 6.2 Build and Push Docker Image

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym

# Get values
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-south-1"
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/physioguard"

# Login to ECR
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Build image
docker build -t physioguard:latest .

# Tag for ECR
docker tag physioguard:latest ${ECR_URL}:latest

# Push to ECR
docker push ${ECR_URL}:latest

echo "Image pushed to ECR: ${ECR_URL}:latest"
```

---

## 7. Deploy Infrastructure with Terraform

### 7.1 Deploy Everything

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym/terraform

# Initialize (if not done)
terraform init

# Plan (preview changes)
terraform plan
# Review the plan - should show ~35 resources to create

# Apply (ACTUALLY deploys to AWS)
terraform apply
# Type 'yes' when prompted
# This takes 5-10 minutes
```

### 7.2 Get Your Application URL

After Terraform finishes:
```bash
terraform output alb_dns_name
# Example output: physioguard-alb-1234567890.ap-south-1.elb.amazonaws.com

terraform output app_url
# Example: http://physioguard-alb-1234567890.ap-south-1.elb.amazonaws.com
```

**Visit the URL - PhysioGuard should be live!**

### 7.3 Verify Deployment

```bash
ALB_DNS=$(terraform output -raw alb_dns_name)

# Test health check
curl http://${ALB_DNS}/health
# Expected: {"status": "healthy", ...}

# Test exercises API
curl http://${ALB_DNS}/api/exercises
# Expected: {"exercises": [...6 exercises...]}

# Test main page
curl -s http://${ALB_DNS}/ | grep -i "physioguard"
# Should show HTML content
```

---

## 8. Configure HTTPS/SSL

**IMPORTANT:** MediaPipe's getUserMedia() for camera access REQUIRES HTTPS in production browsers!

### Option A: Custom Domain with ACM (Recommended)

1. **Register a domain** in Route53 (~$10-15/year) or use existing domain

2. **Request ACM Certificate:**
```bash
# Request certificate (replace with your domain)
aws acm request-certificate \
  --domain-name "physioguard.yourdomain.com" \
  --validation-method DNS \
  --region ap-south-1

# Note the CertificateArn in the output!
```

3. **Validate the certificate:**
   - Go to AWS Console -> ACM
   - Click on your certificate
   - Click "Create records in Route53" (if domain is in Route53)
   - Wait 5-10 minutes for validation

4. **Update Terraform variables:**
```bash
# Edit terraform/terraform.tfvars
certificate_arn = "arn:aws:acm:ap-south-1:ACCOUNT_ID:certificate/CERT_ID"
domain_name = "physioguard.yourdomain.com"
```

5. **Re-apply Terraform:**
```bash
terraform apply
# This will add HTTPS listener to ALB
```

6. **Create Route53 DNS record:**
```bash
# Get ALB DNS and zone ID
ALB_DNS=$(terraform output -raw alb_dns_name)
ALB_ZONE_ID=$(terraform output -raw alb_zone_id)

# Create alias record in Route53 (replace HOSTED_ZONE_ID with yours)
aws route53 change-resource-record-sets \
  --hosted-zone-id YOUR_HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "physioguard.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'"${ALB_DNS}"'",
          "EvaluateTargetHealth": true,
          "HostedZoneId": "'"${ALB_ZONE_ID}"'"
        }
      }
    }]
  }'
```

### Option B: Without Custom Domain (Development/Testing)

AWS ALB only supports HTTPS with custom domains + ACM certificates.

For testing without a domain, you can:
1. Use the HTTP URL directly (camera access may work on some browsers)
2. Use a self-signed cert with nginx (add to docker-compose)
3. Use AWS CloudFront with a free *.cloudfront.net domain that has HTTPS

---

## 9. Multi-User Support Explained

### How PhysioGuard Handles Multiple Users

**The beauty of this architecture is that ALL AI inference happens in each user's browser!**

```
User 1's Browser                    User 2's Browser
├── MediaPipe WASM                  ├── MediaPipe WASM
├── Webcam access                   ├── Webcam access
├── Pose detection                  ├── Pose detection
└── Score calculation               └── Score calculation
         │                                    │
         │ HTTP (only for static files)       │
         ▼                                    ▼
    AWS Load Balancer ←────── routes ─────────┘
         │
    ┌────┴────┐
    │  ECS    │  ← Just serves HTML/JS/images
    │ Task 1  │  ← No video processing
    │         │  ← No MediaPipe on server!
    └─────────┘
    ┌─────────┐
    │  ECS    │  ← Multiple tasks = more
    │ Task 2  │    HTTP requests handled
    └─────────┘
```

**Each user's device:**
- Downloads the MediaPipe WASM model once (cached in browser)
- Processes their own webcam locally
- Server never sees any video data
- Server only sends HTML/JS/images

### Capacity Planning

| ECS Tasks | Expected Concurrent Users | Notes |
|-----------|--------------------------|-------|
| 2 tasks   | 500-1000 users           | Serving static files only |
| 4 tasks   | 2000+ users              | If save_session API is heavy |
| Auto-scale| Up to 5000+ users        | 2-10 tasks, scales automatically |

### Auto-Scaling Configuration

The infrastructure scales based on:
- **CPU > 70%** -> Add tasks (2 minute cooldown)
- **CPU < 30%** -> Remove tasks (5 minute cooldown)
- **Memory > 70%** -> Add tasks
- **Requests > 1000/min per target** -> Add tasks
- **Min tasks: 2** (always 2 for high availability)
- **Max tasks: 10**

---

## 10. Monitoring & Logs

### 10.1 View Application Logs

```bash
# Stream live logs from ECS tasks
aws logs tail /ecs/physioguard --follow --region ap-south-1

# Get logs from last hour
aws logs filter-log-events \
  --log-group-name /ecs/physioguard \
  --start-time $(date -d '1 hour ago' +%s000) \
  --region ap-south-1

# Get error logs only
aws logs filter-log-events \
  --log-group-name /ecs/physioguard \
  --filter-pattern '"ERROR"' \
  --region ap-south-1
```

### 10.2 View CloudWatch Metrics

```bash
# Go to AWS Console -> CloudWatch -> Metrics
# Namespace: AWS/ECS
# Service: physioguard-service
# Metrics: CPUUtilization, MemoryUtilization

# Or use CLI to get CPU stats
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=physioguard-service Name=ClusterName,Value=physioguard-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region ap-south-1
```

### 10.3 Set Up Email Alerts (Optional)

```bash
# Create SNS topic for alerts
aws sns create-topic --name physioguard-alerts --region ap-south-1

# Subscribe your email
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-south-1:ACCOUNT_ID:physioguard-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Update CloudWatch alarms to notify via SNS
# (Edit terraform/cloudwatch.tf to add alarm_actions = [aws_sns_topic.alerts.arn])
```

---

## 11. Cost Estimation

### Monthly AWS Costs (ap-south-1 / Mumbai)

| Service | Configuration | Est. Monthly Cost |
|---------|--------------|------------------|
| ECS Fargate | 2 tasks x 0.25 vCPU x 0.5 GB x 24/7 | ~$18-25 |
| Application Load Balancer | 1 ALB + 2 LCU | ~$20-25 |
| NAT Gateway | 1 NAT + data transfer | ~$35-40 |
| ECR | 1 GB storage | ~$0.10 |
| Secrets Manager | 1 secret | ~$0.40 |
| CloudWatch | Logs + metrics | ~$2-5 |
| S3 | ALB logs + state | ~$1 |
| **Total** | | **~$75-100/month** |

### Cost Saving Tips

1. **Use FARGATE_SPOT** for some tasks (70% cheaper, may be interrupted):
   ```hcl
   # In terraform/ecs.tf, add capacity provider strategy
   capacity_provider_strategy {
     capacity_provider = "FARGATE_SPOT"
     weight = 1
   }
   ```

2. **Remove NAT Gateway** if ECS tasks don't need internet access:
   - Move ECS to public subnets with `assign_public_ip = true`
   - Saves ~$35/month
   - Less secure but functional for this use case

3. **Use EC2 instead of Fargate** for long-running workloads:
   - t3.small: ~$15/month vs Fargate ~$25/month

### Free Tier (First 12 Months)

AWS Free Tier includes:
- 750 hours EC2 t2/t3.micro
- Some ALB hours
- Basic CloudWatch metrics
- ECR 500 MB storage

---

## 12. Updating the Application

### 12.1 Simple Code Update

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym

# Make your code changes, then:
chmod +x deploy.sh
./deploy.sh

# The script will:
# 1. Build new Docker image
# 2. Push to ECR
# 3. Update ECS service (rolling deployment)
# 4. Wait for deployment to complete
```

### 12.2 What Happens During Deployment

ECS performs a **rolling deployment**:
1. Starts new tasks with new image
2. Waits for new tasks to pass health checks
3. Stops old tasks
4. Zero downtime if you have 2+ tasks!

### 12.3 Rollback if Something Goes Wrong

```bash
# List recent task definitions
aws ecs list-task-definitions \
  --family-prefix physioguard \
  --sort DESC \
  --region ap-south-1

# Rollback to previous version
aws ecs update-service \
  --cluster physioguard-cluster \
  --service physioguard-service \
  --task-definition physioguard:PREVIOUS_REVISION_NUMBER \
  --region ap-south-1
```

---

## 13. Running Playwright Tests

### 13.1 Install Playwright

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym/tests
npm install
npm run install:browsers
```

### 13.2 Test Against Local Docker

```bash
# Start local environment
cd ..
docker-compose up -d

# Wait for health check
sleep 10
curl http://localhost/health

# Run all tests
cd tests
BASE_URL=http://localhost npm test

# View report
npm run test:report
```

### 13.3 Test Against AWS Deployment

```bash
cd /media/steeve/New_Volume15/karunya/project/aravind/cv_gym/terraform
ALB_DNS=$(terraform output -raw alb_dns_name)

cd ../tests
BASE_URL=http://${ALB_DNS} npm test
```

### 13.4 Expected Test Results

```
✓ API Endpoints (9 tests)
  ✓ GET /health returns healthy status
  ✓ GET /health responds within 500ms
  ✓ GET /api/exercises returns exercise list
  ✓ GET /api/exercises has correct structure
  ✓ GET /api/exercises contains all 6 exercises
  ✓ POST /api/save_session saves valid session
  ✓ POST /api/save_session rejects missing fields
  ✓ GET /reference_images returns image
  ✓ GET static JS files return 200

✓ Application UI (8 tests)
  ✓ page loads successfully
  ✓ video element exists
  ✓ canvas element exists
  ✓ start monitoring button visible
  ...

✓ Production Checks (8 tests)
  ✓ health check responds
  ✓ security headers present
  ✓ cache headers on static files
  ✓ 20 concurrent requests handled
  ...

Tests: 25 passed, 0 failed
```

---

## 14. Troubleshooting

### Issue: ECS Tasks Keep Failing

```bash
# Check task logs
aws ecs describe-tasks \
  --cluster physioguard-cluster \
  --tasks $(aws ecs list-tasks --cluster physioguard-cluster --query 'taskArns[0]' --output text) \
  --region ap-south-1

# Check detailed logs
aws logs filter-log-events \
  --log-group-name /ecs/physioguard \
  --filter-pattern '"ERROR"' \
  --region ap-south-1
```

**Common causes:**
- Image not found in ECR -> Push image first
- SECRET_KEY not in Secrets Manager -> Check secrets.tf was applied
- Health check failing -> Check `/health` endpoint works

### Issue: Health Check Fails

```bash
# Test health check directly
ALB_DNS=$(cd terraform && terraform output -raw alb_dns_name)
curl -v http://${ALB_DNS}/health

# Should return: {"status": "healthy", ...}
```

### Issue: Camera Not Working

**Cause:** getUserMedia requires HTTPS!

**Solution:**
- Set up HTTPS with ACM certificate (Section 8)
- Or test on localhost (HTTP works locally)

### Issue: Terraform State Lock

```bash
# If Terraform is stuck with a lock
cd terraform
terraform force-unlock LOCK_ID
# Get LOCK_ID from the error message
```

### Issue: Docker Build Fails

```bash
# Test build locally
docker build -t physioguard:test .
docker run -p 5000:5000 physioguard:test

# Check if app works
curl http://localhost:5000/health
```

### Issue: High Costs

1. Check AWS Cost Explorer
2. Look for idle Fargate tasks -> Reduce `desired_count` to 1
3. Delete unused ECR images -> ECR lifecycle policy handles this
4. Check NAT Gateway data transfer costs

### Issue: Slow Startup

MediaPipe WASM downloads ~80MB from CDN on first load. To improve:
1. Set up CloudFront to cache WASM files
2. Add HTTP caching headers for WASM
3. Consider self-hosting WASM files in S3

---

## 15. Security Checklist

Before going live, verify:

- [ ] **HTTPS enabled** - ACM certificate configured, HTTP redirects to HTTPS
- [ ] **SECRET_KEY** - Stored in AWS Secrets Manager, not hardcoded
- [ ] **Security headers** - X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- [ ] **Rate limiting** - /api/save_session limited to 10/minute per IP
- [ ] **Non-root Docker user** - Container runs as `physio` user
- [ ] **Private subnets** - ECS tasks in private subnets, not directly accessible
- [ ] **Security groups** - ECS only accepts traffic from ALB
- [ ] **ECR scanning** - Image vulnerability scanning enabled
- [ ] **.gitignore** - .env file, *.tfstate, *.tfvars not committed
- [ ] **IAM least privilege** - ECS task role only has needed permissions
- [ ] **Input validation** - /api/save_session validates and sanitizes data
- [ ] **Reference images** - File type validation prevents path traversal
- [ ] **Logs retention** - CloudWatch logs retained for 30 days
- [ ] **Backup** - Terraform state in versioned S3 bucket

---

## Quick Reference

```bash
# Start locally
conda activate physio_pose && python app.py

# Start with Docker
docker-compose up --build

# Deploy to AWS
./deploy.sh

# View logs
aws logs tail /ecs/physioguard --follow

# Scale up manually
aws ecs update-service --cluster physioguard-cluster --service physioguard-service --desired-count 4

# Scale down
aws ecs update-service --cluster physioguard-cluster --service physioguard-service --desired-count 2

# Run tests
cd tests && BASE_URL=http://YOUR_ALB_DNS npm test

# Destroy infrastructure (WARNING: Deletes everything!)
cd terraform && terraform destroy
```

---

*Guide written for PhysioGuard v1.0.0 - AWS ECS Fargate Deployment*
*Last updated: 2026*
