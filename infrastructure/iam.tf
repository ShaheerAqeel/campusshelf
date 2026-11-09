# R8 IAM: least-privilege roles for each host type, plus the GitHub Actions deploy role.
# Containers cannot use these roles: IMDSv2 with hop limit 1 blocks them from the metadata service.

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

locals {
  account_id    = data.aws_caller_identity.current.account_id
  param_arn     = "arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.param_prefix}"
  log_group_arn = "arn:aws:logs:${var.region}:${local.account_id}:log-group:/${local.name}"
  asg_arn       = "arn:aws:autoscaling:${var.region}:${local.account_id}:autoScalingGroup:*:autoScalingGroupName"
}

# ---------------- NAT instance: Session Manager only ----------------
resource "aws_iam_role" "nat" {
  name               = "${local.name}-nat"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name = "${local.name}-nat"
  role = aws_iam_role.nat.name
}

# ---------------- Web tier ----------------
resource "aws_iam_role" "web" {
  name               = "${local.name}-web"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "web" {
  statement {
    sid       = "ReadImageTag"
    actions   = ["ssm:GetParameter"]
    resources = ["${local.param_arn}/image_tag"]
  }
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${local.log_group_arn}/web:*"]
  }
  statement {
    sid       = "DiscoverAppInstances" # read-only; DescribeInstances cannot be scoped to resources
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "web" {
  name   = "${local.name}-web"
  role   = aws_iam_role.web.id
  policy = data.aws_iam_policy_document.web.json
}

# ---------------- App tier ----------------
resource "aws_iam_role" "app" {
  name               = "${local.name}-app"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ReadOwnParameters"
    actions   = ["ssm:GetParameter"]
    resources = ["${local.param_arn}/*"]
  }
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${local.log_group_arn}/api:*"]
  }
  statement {
    sid       = "ReportOwnHealth" # readiness gate marks a broken instance Unhealthy
    actions   = ["autoscaling:SetInstanceHealth"]
    resources = ["${local.asg_arn}/${local.app_asg_name}"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "${local.name}-app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

# Shared managed policies for both tiers: Session Manager and pulling from ECR
resource "aws_iam_role_policy_attachment" "tier_managed" {
  for_each = {
    web-ssm = { role = aws_iam_role.web.name, arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore" }
    web-ecr = { role = aws_iam_role.web.name, arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly" }
    app-ssm = { role = aws_iam_role.app.name, arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore" }
    app-ecr = { role = aws_iam_role.app.name, arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly" }
  }
  role       = each.value.role
  policy_arn = each.value.arn
}

resource "aws_iam_instance_profile" "web" {
  name = "${local.name}-web"
  role = aws_iam_role.web.name
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name}-app"
  role = aws_iam_role.app.name
}

# ---------------- GitHub Actions deploy identity ----------------
# Preferred: OIDC role (short-lived credentials, nothing stored in GitHub).
# Fallback (use_github_oidc = false): a dedicated IAM user with the SAME least-privilege
# policy; its access key is created by you and stored as encrypted GitHub Secrets.

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.use_github_oidc && var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS no longer checks these for GitHub's provider, but older AWS provider versions require the field.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.use_github_oidc && !var.create_github_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_arn = !var.use_github_oidc ? "" : (
    var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

data "aws_iam_policy_document" "github_trust" {
  count = var.use_github_oidc ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # Jobs with "environment: production" present this subject (not the branch ref).
      values = ["repo:${var.github_repo}:environment:production"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count                = var.use_github_oidc ? 1 : 0
  name                 = "${local.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_trust[0].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "github_deploy" {
  count  = var.use_github_oidc ? 1 : 0
  name   = "${local.name}-github-deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy.json
}

resource "aws_iam_user" "github_deploy" {
  count = var.use_github_oidc ? 0 : 1
  name  = "${local.name}-github-deploy"
  tags  = { Purpose = "GitHub Actions deploy - CI-CD only" }
}

resource "aws_iam_user_policy" "github_deploy" {
  count  = var.use_github_oidc ? 0 : 1
  name   = "${local.name}-github-deploy"
  user   = aws_iam_user.github_deploy[0].name
  policy = data.aws_iam_policy_document.github_deploy.json
}
# The access key is NOT created here (it would sit in the Terraform state). Create it with:
#   aws iam create-access-key --user-name campusshelf-github-deploy

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPushToOwnRepos"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages",
    ]
    resources = [for r in aws_ecr_repository.repo : r.arn]
  }
  statement {
    sid       = "ReleaseImageTag"
    actions   = ["ssm:GetParameter", "ssm:PutParameter"]
    resources = ["${local.param_arn}/image_tag"]
  }
  statement {
    sid     = "RollOutOwnAsgs"
    actions = ["autoscaling:StartInstanceRefresh", "autoscaling:CancelInstanceRefresh"]
    resources = [
      "${local.asg_arn}/${local.web_asg_name}",
      "${local.asg_arn}/${local.app_asg_name}",
    ]
  }
  statement {
    sid       = "DescribeAsgs" # Describe* actions cannot be scoped to resources
    actions   = ["autoscaling:DescribeAutoScalingGroups", "autoscaling:DescribeInstanceRefreshes"]
    resources = ["*"]
  }
}

