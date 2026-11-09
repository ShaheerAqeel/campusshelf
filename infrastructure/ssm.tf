# R8 Secrets: SSM Parameter Store standard SecureString parameters (free),
# encrypted with the AWS managed key aws/ssm. Secrets Manager would cost USD 0.40/secret/month.
# Note: the generated values are also in the Terraform state, which is why the state is never committed.

resource "random_password" "db" {
  length  = 32
  special = false # avoids escaping problems in connection strings
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "db_password" {
  name        = "${local.param_prefix}/db_password"
  description = "RDS master password"
  type        = "SecureString"
  value       = random_password.db.result
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "${local.param_prefix}/jwt_secret"
  description = "JWT signing secret"
  type        = "SecureString"
  value       = random_password.jwt.result
}

# The image tag every instance runs. CI/CD updates it; Terraform only creates it.
resource "aws_ssm_parameter" "image_tag" {
  name        = "${local.param_prefix}/image_tag"
  description = "Container image tag deployed to the web and app tiers"
  type        = "String"
  value       = var.initial_image_tag

  lifecycle {
    ignore_changes = [value]
  }
}
