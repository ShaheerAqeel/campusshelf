# R8 Security groups: one per tier, least privilege, ingress AND egress restricted.
#
#   Internet --80--> sg-alb --80--> sg-web --3000--> sg-app --5432--> sg-rds
#   sg-web / sg-app --443--> internet via sg-nat (ECR, SSM, CloudWatch, OS packages)
#
# No rule anywhere opens port 22. Admin access is AWS Systems Manager Session Manager.

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public load balancer: HTTP from the internet, forwards only to the web tier"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "sg-alb" }
}

resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "Web tier (Nginx): HTTP only from the ALB"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "sg-web" }
}

resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "Application tier (Express): port 3000 only from the web tier"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "sg-app" }
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "PostgreSQL: port 5432 only from the application tier"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "sg-rds" }
}

resource "aws_security_group" "nat" {
  name        = "${local.name}-nat"
  description = "NAT instance: HTTP/HTTPS from the private app subnets only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "sg-nat" }
}

# ---------- ALB ----------
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  description       = "HTTP from anywhere"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_web" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  description                  = "Forward to web tier only"
}

# ---------- Web tier ----------
resource "aws_vpc_security_group_ingress_rule" "web_from_alb" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  description                  = "HTTP only from the ALB"
}

resource "aws_vpc_security_group_egress_rule" "web_to_app" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "API calls to the app tier"
}

resource "aws_vpc_security_group_egress_rule" "web_https_out" {
  security_group_id = aws_security_group.web.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "AWS APIs (ECR, SSM, EC2, Logs) and OS packages via NAT"
}

# ---------- App tier ----------
resource "aws_vpc_security_group_ingress_rule" "app_from_web" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "API only from the web tier"
}

resource "aws_vpc_security_group_egress_rule" "app_to_rds" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.rds.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL (TLS)"
}

resource "aws_vpc_security_group_egress_rule" "app_https_out" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "AWS APIs (ECR, SSM, Logs, Auto Scaling) and OS packages via NAT"
}

# ---------- Database ----------
resource "aws_vpc_security_group_ingress_rule" "rds_from_app" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL only from the app tier"
}
# (no egress rules: the database never starts outbound connections)

# ---------- NAT instance ----------
resource "aws_vpc_security_group_ingress_rule" "nat_from_private" {
  for_each = {
    for pair in setproduct(local.private_app_cidr, [80, 443]) : "${pair[0]}-${pair[1]}" => { cidr = pair[0], port = pair[1] }
  }
  security_group_id = aws_security_group.nat.id
  cidr_ipv4         = each.value.cidr
  ip_protocol       = "tcp"
  from_port         = each.value.port
  to_port           = each.value.port
  description       = "Outbound traffic from private app subnets"
}

resource "aws_vpc_security_group_egress_rule" "nat_out" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.nat.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  description       = "Forward to the internet"
}
