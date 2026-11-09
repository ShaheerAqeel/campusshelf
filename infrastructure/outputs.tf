output "app_url" {
  description = "Public URL (only while session_active && enable_alb). Put it in the GitHub variable APP_URL."
  value       = local.alb_on ? "http://${aws_lb.web[0].dns_name}" : "ALB disabled: use SSM port forwarding (see README)"
}

output "ecr_registry" {
  value = local.ecr_registry
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.repo : k => r.repository_url }
}

output "github_deploy" {
  description = "How GitHub Actions authenticates. See README section 3."
  value       = var.use_github_oidc ? "OIDC role: set GitHub variable AWS_DEPLOY_ROLE_ARN = ${aws_iam_role.github_deploy[0].arn}" : "IAM user ${aws_iam_user.github_deploy[0].name}: run 'aws iam create-access-key --user-name ${aws_iam_user.github_deploy[0].name}' and store the key as GitHub secrets AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY"
}

output "rds_endpoint" {
  value = aws_db_instance.db.address
}

output "asg_names" {
  value = { web = aws_autoscaling_group.web.name, app = aws_autoscaling_group.app.name }
}

output "nat_instance_id" {
  value = aws_instance.nat.id
}

output "session" {
  value = {
    active      = var.session_active
    alb_enabled = local.alb_on
    asg_min_max = "${local.asg_min}/${local.asg_max}"
  }
}
