# R2/R3/R7 Compute: two Auto Scaling Groups (web tier, app tier) of Free Tier EC2 instances
# running Docker on Amazon Linux 2023, in the private app subnets of both AZs.

locals {
  launch_template_common = {
    image_id      = data.aws_ami.al2023.id
    instance_type = var.instance_type
  }
}

resource "aws_launch_template" "app" {
  name_prefix            = "${local.app_asg_name}-"
  image_id               = local.launch_template_common.image_id
  instance_type          = local.launch_template_common.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]
  update_default_version = true

  iam_instance_profile {
    arn = aws_iam_instance_profile.app.arn
  }

  credit_specification {
    cpu_credits = "standard" # avoid T3 "unlimited" surplus-credit charges
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 1          # containers cannot reach instance credentials
    instance_metadata_tags      = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 8
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/templates/app-user-data.sh.tftpl", {
    region       = var.region
    ecr_registry = local.ecr_registry
    repo         = aws_ecr_repository.repo["api"].name
    param_prefix = local.param_prefix
    db_host      = aws_db_instance.db.address
    db_name      = aws_db_instance.db.db_name
    db_user      = aws_db_instance.db.username
    log_group    = aws_cloudwatch_log_group.api.name
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = local.app_asg_name, Tier = "app" }
  }
  tag_specifications {
    resource_type = "volume"
    tags          = { Name = local.app_asg_name, Tier = "app" }
  }
}

resource "aws_launch_template" "web" {
  name_prefix            = "${local.web_asg_name}-"
  image_id               = local.launch_template_common.image_id
  instance_type          = local.launch_template_common.instance_type
  vpc_security_group_ids = [aws_security_group.web.id]
  update_default_version = true

  iam_instance_profile {
    arn = aws_iam_instance_profile.web.arn
  }

  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 8
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/templates/web-user-data.sh.tftpl", {
    region       = var.region
    ecr_registry = local.ecr_registry
    repo         = aws_ecr_repository.repo["web"].name
    param_prefix = local.param_prefix
    app_asg_name = local.app_asg_name
    log_group    = aws_cloudwatch_log_group.web.name
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = local.web_asg_name, Tier = "web" }
  }
  tag_specifications {
    resource_type = "volume"
    tags          = { Name = local.web_asg_name, Tier = "web" }
  }
}

resource "aws_autoscaling_group" "app" {
  name                      = local.app_asg_name
  vpc_zone_identifier       = aws_subnet.private_app[*].id
  min_size                  = local.asg_min
  max_size                  = local.asg_max
  desired_capacity          = local.asg_min
  health_check_type         = "EC2"
  health_check_grace_period = 300
  default_instance_warmup   = 180
  wait_for_capacity_timeout = "0" # user data reports health itself; do not block terraform

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # Launch the replacement before terminating the old instance
  instance_maintenance_policy {
    min_healthy_percentage = 100
    max_healthy_percentage = 200
  }

  enabled_metrics = ["GroupDesiredCapacity", "GroupInServiceInstances", "GroupTotalInstances"] # free

  tag {
    key                 = "Project"
    value               = var.project
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity] # scaling policies own it
  }

  # Instances need the NAT route (to pull images) and the database (to migrate) at boot
  depends_on = [aws_route.private_app_default, aws_ec2_instance_state.nat, aws_db_instance.db, aws_iam_role_policy.app]
}

resource "aws_autoscaling_group" "web" {
  name                      = local.web_asg_name
  vpc_zone_identifier       = aws_subnet.private_app[*].id
  min_size                  = local.asg_min
  max_size                  = local.asg_max
  desired_capacity          = local.asg_min
  health_check_type         = local.alb_on ? "ELB" : "EC2"
  health_check_grace_period = 240
  default_instance_warmup   = 120
  wait_for_capacity_timeout = "0"
  target_group_arns         = local.alb_on ? [aws_lb_target_group.web[0].arn] : []

  launch_template {
    id      = aws_launch_template.web.id
    version = "$Latest"
  }

  instance_maintenance_policy {
    min_healthy_percentage = 100
    max_healthy_percentage = 200
  }

  enabled_metrics = ["GroupDesiredCapacity", "GroupInServiceInstances", "GroupTotalInstances"]

  tag {
    key                 = "Project"
    value               = var.project
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }

  depends_on = [aws_route.private_app_default, aws_ec2_instance_state.nat, aws_iam_role_policy.web]
}

# R7 Elasticity: target tracking on average CPU (only while the stack is awake)
resource "aws_autoscaling_policy" "cpu" {
  for_each = var.session_active ? {
    web = aws_autoscaling_group.web.name
    app = aws_autoscaling_group.app.name
  } : {}

  name                      = "${local.name}-${each.key}-cpu50"
  autoscaling_group_name    = each.value
  policy_type               = "TargetTrackingScaling"
  estimated_instance_warmup = 180

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 50
  }
}
