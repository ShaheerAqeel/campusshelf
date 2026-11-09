# R5 Registry: one private ECR repository per tier.

resource "aws_ecr_repository" "repo" {
  for_each             = toset(["web", "api"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE" # a commit SHA tag can never be overwritten
  force_delete         = true        # lets terraform destroy remove repos that still hold images

  image_scanning_configuration {
    scan_on_push = true # basic scanning is free
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Keep the last 5 images per repo: stays well under the 500 MB free storage
resource "aws_ecr_lifecycle_policy" "repo" {
  for_each   = aws_ecr_repository.repo
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the last 5 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}
