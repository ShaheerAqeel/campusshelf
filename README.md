# CampusShelf

A campus library book-lending system, built as a **three-tier cloud application** for SE-490 Cloud Computing (CEA). It is designed to run entirely on the **AWS Free Tier**.

| Tier | Technology | Where it runs on AWS |
|---|---|---|
| Web | React 19 + Vite SPA, served by **Nginx** (Docker) | EC2 Auto Scaling Group, private subnets, behind an ALB |
| Application | **Node.js 22 + Express** REST API (Docker) | EC2 Auto Scaling Group, private subnets, reachable only from the web tier |
| Database | **PostgreSQL 16** | Amazon RDS, private DB subnets, no internet route |

Supporting services: Amazon ECR, SSM Parameter Store, CloudWatch Logs and alarms, SNS, AWS Budgets, GitHub Actions (OIDC), Terraform.

See `IMPLEMENTATION_PLAN.md` for the design and `CEA_STEP_BY_STEP_GUIDE.md` for the ordered checklist with evidence to capture.

---

## Features

- **Members:** register, search and filter the catalogue, borrow (14 days, max 5 at once), return, see overdue items.
- **Librarians:** add, edit and archive books; see all active, overdue and returned loans; dashboard with live statistics.
- **Admins:** everything above, plus granting librarian/admin roles.
- Borrowing locks the book row in a transaction, so two app instances can never hand out the same last copy (covered by a test).

## Repository layout

```text
api/              Express API: src/, migrations/ (node-pg-migrate), tests/ (Jest + Supertest)
web/              React SPA: src/, nginx/ (default.conf, app-upstream.inc), Vitest tests
e2e/              Playwright end-to-end tests (run against compose or the ALB)
infrastructure/   Terraform: VPC, NAT instance, SGs, IAM, ECR, SSM, RDS, ASGs, ALB, alarms, budget
scripts/          session-up/down, manual-push, wait-instance-refresh, port-forward, seed-cloud
.github/workflows/ci-cd.yml   Test, build, push, deploy, verify, roll back
docker-compose.yml            All three tiers locally
```

---

## 1. Run locally

### Option A: Docker Compose (production-like)

```bash
cp .env.example .env          # set DB_PASSWORD, JWT_SECRET (16+ chars), SEED_DEMO_PASSWORD
docker compose up --build     # http://localhost:8080
docker compose run --rm api node src/seed.js    # demo data
docker compose --profile dev up -d adminer      # optional DB browser on http://localhost:8081
```

The database and the API publish no ports. Only Nginx is reachable, just like on AWS.

Demo logins after seeding (password = `SEED_DEMO_PASSWORD`):
`member@campusshelf.test`, `librarian@campusshelf.test`, `admin@campusshelf.test`.

### Option B: Without Docker (for development)

```bash
# PostgreSQL 16 running locally, with a database and user you create
cd api && cp .env.example .env    # fill in DB_* and JWT_SECRET
npm ci && npm run migrate && SEED_DEMO_PASSWORD=demo12345 npm run seed && npm run dev   # :3000
cd ../web && npm ci && npm run dev                                                     # :5173 (proxies /api)
```

### Tests

```bash
# API: needs a PostgreSQL test database (defaults: localhost, db campusshelf_test, user/pass test/test)
cd api && npm run migrate && npm test -- --coverage
cd web && npm test -- --run && npm run lint && npm run build
cd e2e && npm ci && npx playwright install chromium
BASE_URL=http://localhost:8080 E2E_DEMO_PASSWORD=<seed password> npx playwright test
```

---

## 2. Deploy to AWS (Free Tier)

> **Read section 2 of `IMPLEMENTATION_PLAN.md` first.** It explains which Free Tier your account has and the rules that keep the bill at zero. In short: never create a NAT Gateway, Fargate, Secrets Manager secrets or Multi-AZ RDS; use only Free Tier instance types; sleep the stack when you stop working.

### Prerequisites

AWS CLI v2 (logged in as an admin identity, region = your project's home region, e.g. `ap-southeast-2`), the Session Manager plugin, Terraform 1.6+, Docker, a GitHub repository for this code.

### First deployment

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars   # set instance_type, alert_email, github_repo
terraform init
terraform apply -var session_active=false      # creates everything except running instances (~10 min, mostly RDS)
cd ..
./scripts/manual-push.sh                       # builds and pushes both images as tag manual-1
./scripts/session-up.sh                        # starts NAT + 1 web + 1 app instance
```

Confirm the two emails AWS sends you (SNS alarm subscription and budget).

Wait 3-4 minutes for the instances to boot, then open the app through Session Manager (no ALB, no public IP, free):

```bash
./scripts/port-forward.sh web                  # then open http://localhost:8080
SEED_DEMO_PASSWORD=<choose one> ./scripts/seed-cloud.sh
```

### Public URL (ALB)

```bash
./scripts/session-up.sh --alb                  # prints app_url = http://<alb-dns>
```

The ALB's public IPv4 addresses are not covered by the legacy Free Tier (about USD 0.01/hour together), so only enable it for CI/CD, scaling tests, evidence and the demo.

### End every work session

```bash
./scripts/session-down.sh                      # ASGs -> 0, NAT stopped, ALB removed
./scripts/session-down.sh --stop-db            # Free account plan: also stop RDS to save credits
```

On a legacy account the 750 free EC2 hours are shared by all instances. Awake, this stack uses 3 instance-hours per hour, so keep total session time under about 230 hours per month. `docs/session-log.md` records every up/down.

### Tear down at the end

```bash
cd infrastructure && terraform destroy
```

Then check the EC2, RDS and Billing consoles. Charges can show up a day or two later.

---

## 3. CI/CD (GitHub Actions)

How GitHub logs in to AWS depends on your account (`terraform output github_deploy` tells you which):

**A. New-style AWS "project" account (default, `use_github_oidc = false`).** These accounts cannot create the GitHub OIDC provider, so Terraform creates a dedicated IAM user, `campusshelf-github-deploy`, with only the deploy permissions (push to the two ECR repos, update the image tag, refresh the two ASGs).

```bash
MSYS_NO_PATHCONV=1 aws iam create-access-key --user-name campusshelf-github-deploy
```
Copy `AccessKeyId` and `SecretAccessKey` into GitHub, under Settings, then Secrets and variables, then Actions, then **Secrets**: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Never commit them. Delete the key at the end of the project (`aws iam delete-access-key`).

**B. Accounts that allow OIDC (`use_github_oidc = true`).** No keys at all: set the variable `AWS_DEPLOY_ROLE_ARN` to the role ARN from the output.

Then, for both:
1. GitHub, then Settings, then Environments: create `production`, add yourself as a required reviewer, and limit deployment branches to `main`.
2. Settings, then Secrets and variables, then Actions, then **Variables**:
   - `AWS_REGION` = your region (for example `ap-southeast-2`)
   - `APP_URL` = `http://<alb-dns>` while the ALB exists (leave empty otherwise)
3. Protect `main`: require a pull request and the checks `API tests`, `Web tests`, `Docker builds`.

What the pipeline does:

| Event | Jobs |
|---|---|
| Pull request | API lint, migrations and Jest tests on a real PostgreSQL; web lint, Vitest and build; Docker builds of both images |
| Push to `main` | Same tests, then (after approval) build and push `:<commit-sha>` images to ECR, write the tag to `/campusshelf/image_tag`, instance-refresh the app ASG then the web ASG, health check through the ALB |
| Failure | Writes the previous tag back and refreshes again (automatic rollback) |
| Manual run with `image_tag` | Redeploys an existing image without rebuilding (manual rollback) |

With OIDC, no AWS keys are stored in GitHub and the trust policy only accepts `repo:<owner>/<repo>:environment:production`. With the deploy user, the key is limited to the deploy actions above and kept in encrypted GitHub Secrets, and the `production` environment still needs your approval before it is used.

---

## 4. How the pieces connect on AWS

```text
Browser -> ALB (public subnets, sg-alb :80)
        -> web ASG: Nginx container (private subnets, sg-web :80 from sg-alb)
             /api/*  -> app ASG: Express container (sg-app :3000 from sg-web)
                          -> RDS PostgreSQL, TLS (private DB subnets, sg-rds :5432 from sg-app)
Private hosts -> NAT instance (public subnet) -> internet  (ECR, SSM, CloudWatch, OS packages)
```

- **Service discovery:** each web host lists the running app-tier instances (`aws ec2 describe-instances` filtered by the ASG tag) every 20 s and reloads Nginx when the list changes. It is free, where an internal ALB or Cloud Map would cost money.
- **Deployments:** instances read the image tag from Parameter Store at boot, so an ASG instance refresh is a deployment. The app tier's boot script waits for `/health/db` and marks the instance Unhealthy if it fails, which fails the refresh and triggers the rollback.
- **Secrets:** the DB password and JWT secret are SecureString parameters, read at boot into `/run` (tmpfs, root-only). They are never in git, images, user data or logs.
- **Hardening:** no SSH or port 22 anywhere (Session Manager only); IMDSv2 with hop limit 1 (containers cannot get instance credentials); encrypted EBS, RDS and parameters; restricted security-group egress; immutable ECR tags with scan on push.

## 5. Known limitations

Single region; one NAT instance (single AZ); Single-AZ RDS; HTTP only without a domain; burstable instances; per-instance rate limits; polling-based discovery (up to 20 s delay); basic 5-minute metrics; manual secret rotation; the stack is offline while asleep. Each one, with its improvement, is explained in `IMPLEMENTATION_PLAN.md`.
