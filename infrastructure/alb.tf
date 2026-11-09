# R7 Load balancer. Created only while local.alb_on (session_active && enable_alb), because
# its two public IPv4 addresses are not covered by the legacy Free Tier.

resource "aws_lb" "web" {
  count                      = local.alb_on ? 1 : 0
  name                       = "${local.name}-alb"
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = aws_subnet.public[*].id
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
  idle_timeout               = 60
  tags                       = { Name = "${local.name}-alb" }
}

resource "aws_lb_target_group" "web" {
  count                = local.alb_on ? 1 : 0
  name                 = "${local.name}-web-tg"
  port                 = 80
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${local.name}-web-tg" }
}

resource "aws_lb_listener" "http" {
  count             = local.alb_on ? 1 : 0
  load_balancer_arn = aws_lb.web[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web[0].arn
  }
}

# HTTPS: add an aws_acm_certificate (free) and a 443 listener here if you own a domain.
# A Route 53 hosted zone is NOT free, so validate the certificate with your registrar's DNS.
