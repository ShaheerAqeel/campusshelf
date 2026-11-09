variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "campusshelf"
}

variable "region" {
  description = "AWS region. New-style AWS projects may only use their home region (check settings.aws.com). ap-south-1 (Mumbai) is closest to Pakistan if allowed."
  type        = string
  default     = "ap-southeast-2"
}

variable "instance_type" {
  description = <<-EOT
    A Free Tier EC2 type for YOUR account. Check with:
      aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true --query "InstanceTypes[*].InstanceType"
    Legacy Free Tier: t2.micro (t3.micro where t2 is unavailable). Free account plan: t3.micro.
  EOT
  type        = string

  validation {
    condition     = contains(["t2.micro", "t3.micro", "t3.small"], var.instance_type)
    error_message = "Use a Free Tier x86 type (t2.micro or t3.micro; t3.small on the Free plan only)."
  }
}

variable "session_active" {
  description = "true = stack awake (NAT running, ASGs at min 1). false = asleep (NAT stopped, ASGs at 0, ALB removed). Saves Free Tier hours."
  type        = bool
  default     = true
}

variable "enable_alb" {
  description = "Create the internet-facing ALB. Its public IPv4 addresses are not covered by the legacy Free Tier, so keep it off until you need it."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email for CloudWatch alarm and budget notifications (confirm the subscription email)."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy, as owner/repo."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repo))
    error_message = "Use the form owner/repo."
  }
}

variable "use_github_oidc" {
  description = <<-EOT
    true  = GitHub Actions assumes an IAM role through OIDC (no stored keys; preferred).
    false = a dedicated least-privilege IAM user whose access key is stored in GitHub Secrets.
    New-style AWS "project" accounts block creating OIDC providers, so they need false.
  EOT
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "RDS automated backup retention. The Free plan allows at most 1 day."
  type        = number
  default     = 1
}

variable "create_github_oidc_provider" {
  description = "Set false if your account already has the token.actions.githubusercontent.com OIDC provider."
  type        = bool
  default     = true
}

variable "budget_limit_usd" {
  description = "Monthly cost budget. Any actual spend above 1% of this sends an email."
  type        = string
  default     = "1"
}

variable "initial_image_tag" {
  description = "Image tag the instances run until CI/CD writes a new one to Parameter Store."
  type        = string
  default     = "manual-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
