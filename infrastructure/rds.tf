# R4 Database: managed PostgreSQL, private, encrypted, Free Tier sized.

resource "aws_db_subnet_group" "db" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.private_db[*].id
  tags       = { Name = "${local.name}-db-subnets" }
}

resource "aws_db_instance" "db" {
  identifier     = "${local.name}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro" # Free Tier class

  allocated_storage = 20 # Free Tier limit. No max_allocated_storage, so it cannot grow and cost money.
  storage_type      = "gp2"
  storage_encrypted = true # AWS managed key aws/rds (free)

  db_name  = "campusshelf"
  username = "campusshelf"
  password = random_password.db.result
  # Do NOT use manage_master_user_password: it creates a (paid) Secrets Manager secret.

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false # Multi-AZ is not in the Free Tier (documented limitation)

  backup_retention_period      = var.db_backup_retention_days # Free plan max: 1
  backup_window                = "20:00-20:30"                # UTC = 01:00 PKT
  maintenance_window           = "sun:21:00-sun:22:00"
  auto_minor_version_upgrade   = true
  performance_insights_enabled = false
  monitoring_interval          = 0 # no Enhanced Monitoring (it writes paid CloudWatch logs)

  # CEA settings so that terraform destroy leaves nothing billable behind.
  deletion_protection = false
  skip_final_snapshot = true
  apply_immediately   = true

  tags = { Name = "${local.name}-db" }
}
