locals {
  name = var.project
  azs  = ["${var.region}a", "${var.region}b"]

  public_cidrs     = ["10.0.1.0/24", "10.0.2.0/24"]
  private_app_cidr = ["10.0.11.0/24", "10.0.12.0/24"]
  private_db_cidrs = ["10.0.21.0/24", "10.0.22.0/24"]

  # Session switch: see variables.tf
  alb_on  = var.session_active && var.enable_alb
  asg_min = var.session_active ? 1 : 0
  asg_max = var.session_active ? 2 : 0

  web_asg_name = "${local.name}-web"
  app_asg_name = "${local.name}-app"

  ecr_registry = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  param_prefix = "/${local.name}"
}

# Latest Amazon Linux 2023 AMI (x86_64), looked up directly from EC2.
# (The public SSM parameter is blocked for some new-style project accounts.)
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}
