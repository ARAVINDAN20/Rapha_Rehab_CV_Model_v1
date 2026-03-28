# Secret Key for Flask
resource "aws_secretsmanager_secret" "secret_key" {
  name        = "${var.app_name}/${var.environment}/secret-key"
  description = "Flask SECRET_KEY for PhysioGuard"

  tags = {
    Name = "${var.app_name}-secret-key"
  }
}

resource "aws_secretsmanager_secret_version" "secret_key" {
  secret_id     = aws_secretsmanager_secret.secret_key.id
  secret_string = jsonencode({
    SECRET_KEY = random_password.secret_key.result
  })
}

resource "random_password" "secret_key" {
  length  = 64
  special = true
}
