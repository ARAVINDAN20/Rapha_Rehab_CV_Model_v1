variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-south-1"  # Mumbai - closest to India
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "physioguard"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2  # HA: 2 tasks across 2 AZs
}

variable "min_count" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 2
}

variable "max_count" {
  description = "Maximum number of ECS tasks (for auto-scaling)"
  type        = number
  default     = 10
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 5000
}

variable "cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate task memory in MB"
  type        = number
  default     = 512
}

variable "domain_name" {
  description = "Custom domain name (optional, leave empty to use ALB DNS)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS (optional)"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}
