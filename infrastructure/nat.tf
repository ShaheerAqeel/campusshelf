# NAT instance: a Free Tier EC2 doing what a (paid) NAT Gateway would do.
# Private hosts use it for ECR pulls, OS packages, SSM and CloudWatch Logs.

resource "aws_instance" "nat" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat.id]
  associate_public_ip_address = true
  source_dest_check           = false # required so it can forward other hosts' traffic
  iam_instance_profile        = aws_iam_instance_profile.nat.name
  user_data                   = file("${path.module}/templates/nat-user-data.sh")
  user_data_replace_on_change = true

  credit_specification {
    cpu_credits = "standard" # T3 defaults to "unlimited", which can be billed
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  lifecycle {
    ignore_changes = [ami] # do not replace the NAT whenever a new AMI is published
  }

  tags = { Name = "${local.name}-nat", Tier = "nat" }
}

# Session switch: stop the NAT instance when the stack sleeps
resource "aws_ec2_instance_state" "nat" {
  instance_id = aws_instance.nat.id
  state       = var.session_active ? "running" : "stopped"
}

resource "aws_route" "private_app_default" {
  route_table_id         = aws_route_table.private_app.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat.primary_network_interface_id
}
