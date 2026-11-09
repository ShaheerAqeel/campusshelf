# Design, Deployment, and Cloud-Native Enhancement of a Three-Tier Web Application

# Cloud Computing - (SE-490) - Complex Engineering Activity (CEA)

**Department of Software Engineering**

## CEA Statement

As a Cloud/DevOps Engineer, you are required to design, containerize, and deploy a three-tier web application on a cloud platform of your choice, and to build a CI/CD pipeline that automates the build and deployment process.

## System Requirements

Students must design and deploy a solution satisfying all of the following requirements.

## 1. Network Layer

- A Virtual Network / VPC with an appropriate CIDR/address range
- Public subnet(s) for internet-facing components
- Private subnet(s) for internal/backend components
- Internet connectivity (Internet Gateway / equivalent) for public subnets
- Appropriate route tables / routing rules
- NAT gateway or equivalent, if private-subnet resources require outbound internet access

## 2. Web Tier

Deploy the Web Tier as a Docker container (e.g., Nginx, Apache, or a front-end application), built from a well-structured Dockerfile. The Web Tier must be publicly accessible via a web browser, typically placed in the public subnet or behind a load balancer.

## 3. Application Tier

Deploy the Application Tier as a Docker container performing application/business logic (e.g., PHP, Python/Flask or Django, Node.js, Java/Spring Boot). Use a Dockerfile and, if the Web and Application tiers run together on the same host, a docker-compose.yml for local multi-service orchestration. The Application Tier must communicate securely with the Database Tier and should generally reside in a private subnet, reachable only from the Web Tier.

## 4. Database Tier

Deploy a managed database service (e.g., Amazon RDS, Azure Database, Google Cloud SQL) or a properly secured self-managed database instance. Supported engines may include MySQL, PostgreSQL, or MariaDB. The database must be accessible only through controlled network access, never directly exposed to the public internet.

## 5. Container Registry

Push the built Docker image(s) for the Web and/or Application tier to a container registry, e.g., GitHub Container Registry (GHCR), Docker Hub, Amazon ECR, Azure Container Registry, or Google Artifact Registry.

## 6. CI/CD Pipeline

Build a CI/CD pipeline that automatically builds, tests, and deploys the application on every code change, e.g., using GitHub Actions, GitLab CI/CD, Azure DevOps Pipelines, Jenkins, or CircleCI. The pipeline must, at minimum: build the Docker image, push it to the registry, and deploy/update the running application (e.g., by pulling the new image onto the target compute instance or updating a Kubernetes deployment).

## 7. Load Balancing and Scalability

Students should implement, where appropriate to their chosen platform:

- A load balancer (e.g., Application Load Balancer, Azure Load Balancer, GCP Load Balancing, or an Nginx/HAProxy-based equivalent)
- Target groups / backend pools
- Auto Scaling Groups or equivalent horizontal scaling mechanism

## 8. Security

Implement and justify suitable security controls, including:

- Security groups / firewall rules per tier
- Network segmentation between public and private subnets
- Principle of least privilege for inter-tier communication
- Secrets/credentials management (avoid hardcoding database credentials, API keys, etc.), including secrets used within the CI/CD pipeline

## 9. Additional Cloud-Native Enhancements (Choose at least one)

- Configure object storage (e.g., Amazon S3, Azure Blob Storage, Google Cloud Storage) to store static assets, uploaded files, or application backups.
- Provision and attach persistent block/file storage (e.g., Amazon EBS/EFS, Azure Disk/Files, GCP Persistent Disk/Filestore) where appropriate.
- Deploy the containerized application using Kubernetes (a managed service such as EKS/AKS/GKE, or a local cluster such as Minikube/Kind), including Kubernetes manifests (Deployment, Service, Ingress, etc.).
- Implement centralized logging and/or monitoring (e.g., CloudWatch, Azure Monitor, Google Cloud Operations, Prometheus/Grafana).
- Implement infrastructure-as-code for the deployment (e.g., Terraform, CloudFormation, Bicep, Pulumi).
- Estimate the monthly infrastructure cost using the relevant provider's pricing calculator and propose at least two cost optimization measures.

## 10. Non-Functional Requirements (NFR) Justification

A cloud-native deployment is judged not only by whether it works, but by whether it satisfies the quality attributes that matter for production systems. Students must explicitly justify, with reference to their own architecture and implementation choices, how their solution addresses each of the following NFRs:

- **Scalability**: how the design accommodates growth in load (e.g., horizontal scaling via Auto Scaling Groups, statelessness of application containers, load balancer distribution).
- **Availability / Reliability**: how the system avoids single points of failure (e.g., multi-AZ/region placement, managed database failover, redundant compute instances).
- **Elasticity**: how resources scale up and down automatically in response to demand, rather than being statically provisioned.
- **Security**: how confidentiality, integrity, and controlled access are enforced across tiers, the network, and the CI/CD pipeline itself.
- **Maintainability / Deployability**: how containerization and the CI/CD pipeline reduce manual effort and risk when releasing new versions.
- **Performance / Latency**: how the architecture (e.g., load balancing, caching, resource sizing, subnet/region placement) supports acceptable response times under expected load.
- **Cost-Efficiency**: how the chosen services and scaling strategy balance performance against running cost.
- **Portability**: how containerization reduces coupling to a specific cloud provider and eases migration.

You are not required to implement every NFR to an advanced degree, but must clearly state which design decisions support which NFRs, and honestly identify any NFRs your current solution does not fully address, along with how they could be improved.

## Required Deliverables

Each student/group must submit:

### 1. Architecture Diagram

A clearly labeled diagram showing all cloud services used, network design, connectivity between components, the container/CI-CD flow, and security boundaries.

### 2. Deployment Evidence (Screenshots)

- Network/VPC configuration and subnets
- Compute instances / container hosts
- Security groups / firewall rules
- Load balancer configuration
- Database instance
- Docker image build and registry listing
- CI/CD pipeline run (successful build and deploy)
- The running application, accessed via a browser

### 3. Source Files

- Dockerfile (and docker-compose.yml if used)
- Kubernetes manifests (if applicable)
- CI/CD pipeline definition file (e.g., deploy.yml for GitHub Actions)
- Link to the source code repository

### 4. Technical Report (4-6 pages)

The report should explain:

- Chosen cloud provider and justification
- Overall architecture and design decisions
- Services used and their role in each tier
- Containerization and CI/CD pipeline design
- Security considerations
- Testing results demonstrating successful automated deployment
- **NFR justification**: a dedicated section mapping specific design/implementation decisions to the non-functional requirements listed in System Requirements item 10, including any known limitations

---

# CampusShelf Implementation Plan

> **CampusShelf** is a campus library book-lending system. The name is a placeholder. Rename it freely, but keep every resource prefix consistent (`campusshelf-*`).
>
> **Hard constraint for this project:** everything runs on the **AWS Free Tier with no extra charges**. This constraint drives most of the architecture choices below. It is also a strong theme for the report's Cost-Efficiency NFR.

## 1. Project Context and Current Position

CampusShelf is a new full-stack application built for this CEA. It is intentionally different from MediConnect in domain and technology stack:

| | MediConnect (reference) | CampusShelf (this project) |
|---|---|---|
| Domain | Hospital appointments | Library book lending |
| Web tier | React + Vite, Nginx | React + Vite, Nginx |
| Application tier | Python FastAPI | **Node.js 22 + Express** |
| Database | PostgreSQL (RDS) | PostgreSQL 16 (RDS, Free Tier class) |
| Migrations | Alembic | **node-pg-migrate** |
| Compute | ECS Fargate (paid) | **EC2 Auto Scaling Groups (Free Tier)** |
| Outbound internet | NAT Gateway (paid) | **NAT instance on a Free Tier EC2** |
| Secrets | Secrets Manager (paid) | **SSM Parameter Store SecureString (free)** |
| Backend tests | None | **Jest + Supertest against a real PostgreSQL in CI** |
| External services | Stripe, Cloudinary, Gemini, email | **None** (keeps the private tier self-contained) |

### Application scope (MVP)

- **Roles:** `member` (student), `librarian`, `admin`.
- **Authentication:** register, log in, JWT access token, bcrypt password hashing, role-based route guards.
- **Catalogue:** list, search (title, author, ISBN), filter by category, book detail page. Librarians create, edit and archive books and set the number of copies.
- **Loans:** a member borrows an available copy (14-day due date), returns it, sees the loan history and overdue items. Librarians see all active and overdue loans and can mark returns.
- **Reservations (stretch goal):** a member places a hold on a book with no free copies. The first person in the queue is notified in the app when a copy is returned.
- **Dashboard:** librarian statistics (total titles, copies on loan, overdue count, most borrowed books).
- **Seed data:** a script that loads around 200 books, 3 demo users (one per role) and some loans, so the demo looks real after every fresh database.

### Current implementation status

| Area | Current status | CEA action required |
|---|---|---|
| Application code | Not started | Build the MVP (Phase 1) |
| Frontend | Not started | React/Vite SPA, served by Nginx |
| Backend | Not started | Express REST API with health checks and structured logs |
| Database | Not started | PostgreSQL schema via node-pg-migrate; RDS in private subnets |
| Local orchestration | None | Root `docker-compose.yml` (db, migrate, api, web, adminer) |
| Tests | None | Jest/Supertest (API), Vitest (web), Playwright smoke (E2E) |
| Network | None | VPC, public/private subnets in 2 AZs, IGW, NAT instance |
| Registry | None | Amazon ECR with immutable tags and a lifecycle policy |
| CI/CD | None | GitHub Actions: test, build, push, deploy, verify, roll back |
| Load balancing | None | ALB and target group (switched on for demos and evidence) |
| Scaling | None | EC2 Auto Scaling Groups with target-tracking policies |
| Security | None | Tier security groups, IAM least privilege, Parameter Store, OIDC |
| Cost control | None | Budgets, Free Tier alerts, "session" on/off switch in Terraform |
| Documentation | None | Diagram, screenshots, report, runbook |

## 2. Free Tier Cost Model (read before building anything)

### 2.1 Which Free Tier does your account have?

AWS changed the Free Tier on 15 July 2025. Check the account creation date before you build anything, because the rules differ:

| | Legacy Free Tier (account created **before** 15 Jul 2025) | Free account plan (account created **on or after** 15 Jul 2025) |
|---|---|---|
| How it works | Monthly free allowances for 12 months from sign-up | USD 100 credits (up to 200 with onboarding tasks), for up to 6 months |
| Can you be billed? | **Yes**, for anything over the allowances | **No**, AWS cannot charge you until you upgrade to a paid plan. Usage is taken from credits |
| Free EC2 types | `t2.micro` (or `t3.micro` in regions without t2) | `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small`, `c7i-flex.large`, `m7i-flex.large` |
| Main risk | Unexpected charges | Credits run out early, and the account closes when the credits or the 6 months end |

**Recommendation:** a new account on the **Free account plan** is the safest way to guarantee "no additional charges", because the plan cannot produce a bill. You are only eligible for it if you have never had an AWS account before. With a legacy account, follow the hour budget in 2.3 exactly.

Confirm the free instance types for your account and region with:

```bash
aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true \
  --query "InstanceTypes[*].InstanceType" --output text --region ap-south-1
```

The Terraform variable `instance_type` is set from this output: usually `t2.micro` (legacy, Mumbai) or `t3.micro` (Free plan).

### 2.2 Service-by-service decisions

| Need | Paid option (avoided) | Free Tier choice | Why it is free |
|---|---|---|---|
| Container compute | ECS Fargate, EKS | **EC2 in Auto Scaling Groups**, Docker on Amazon Linux 2023 | EC2 free hours; ECS/ASG features have no charge |
| Private outbound | NAT Gateway (hourly + per-GB) | **NAT instance** (Free Tier EC2, iptables masquerade) | Counts against EC2 free hours |
| Secrets | Secrets Manager (USD 0.40/secret/month) | **SSM Parameter Store, standard SecureString** with the AWS managed key `aws/ssm` | Standard parameters have no storage charge |
| Database | Multi-AZ RDS, larger classes | **RDS PostgreSQL, Single-AZ, `db.t4g.micro`, 20 GB gp2** | Matches the RDS Free Tier allowance |
| Registry | ECR enhanced scanning | **ECR** with basic scan on push and a lifecycle policy (keep the last 5 images) | Stays under the 500 MB free storage |
| Load balancer | 24/7 ALB | **ALB switched on only for demo and evidence windows** (`enable_alb` variable) | ALB hours are in the Free Tier, but its public IPv4 addresses are **not** (see 2.4) |
| Service discovery | Cloud Map, Route 53 private zone | **EC2 tag lookup** on the web hosts (`describe-instances` every 20 s) | API calls are free |
| Admin access | Bastion host, SSH | **SSM Session Manager** and port forwarding | No extra instance, no port 22 |
| CI/CD | Paid runners | **GitHub Actions** (free for public repos; 2,000 min/month for private) | Free |
| Logs and alarms | Container Insights, detailed monitoring | **CloudWatch Logs (7-day retention) and at most 10 alarms** | Inside the always-free CloudWatch allowance |
| HTTPS | Route 53 domain and hosted zone | HTTP only (state as a limitation), or ACM if you already own a domain with external DNS | ACM public certificates are free |

### 2.3 Hour budget and the "session" switch

On a legacy account, all EC2 instances **share one** 750-hour monthly allowance. One instance running all month uses about 730 hours. CampusShelf normally runs **3 instances** (NAT, web, app), so it cannot run 24/7 for free.

The solution is a Terraform variable `session_active`:

- `terraform apply -var session_active=true` ("wake"): starts the NAT instance and sets both ASGs to min 1 / max 2.
- `terraform apply -var session_active=false` ("sleep"): stops the NAT instance and scales both ASGs to 0. The ALB is removed (it is only created when `session_active && enable_alb`).
- RDS keeps running (750 free hours cover one instance 24/7). On the Free plan you can also stop it with `aws rds stop-db-instance` to save credits. Stopped RDS restarts by itself after 7 days.

| Item | Legacy free allowance per month | CampusShelf usage | Rule |
|---|---|---|---|
| EC2 instance-hours | 750 (shared) | 3 per session hour | **At most about 230 session hours a month** (about 7.5 h/day). Keep a log |
| Public IPv4 on EC2 | 750 hours | 1 per session hour (NAT instance only) | Fine |
| RDS `db.t4g.micro` | 750 hours, 20 GB storage, backups up to DB size | 730 hours | Fine 24/7, one instance only |
| EBS | 30 GB | 3 x 8 GB gp3 = 24 GB | Do not enlarge root volumes |
| ALB | 750 hours and 15 LCUs | Only while `enable_alb=true` | Public IPv4 is extra (2.4) |
| CloudWatch | 10 alarms, 5 GB logs | 8 alarms, a few MB of logs | Count alarms before adding more |
| ECR | 500 MB storage | About 5 tags x 2 images x ~60 MB | Lifecycle policy |
| Data transfer out | 100 GB | Under 1 GB | Fine |

On the **Free plan**, the same design takes credits instead of free hours. The session switch makes the credits last for the whole project.

### 2.4 The only unavoidable cost on a legacy account

An internet-facing ALB in two AZs has **two public IPv4 addresses**, charged at USD 0.005 per address per hour. The legacy Free Tier covers public IPv4 only on EC2, not on load balancers. That is about USD 0.01 per hour while the ALB exists. The plan keeps this close to zero:

- During development, reach the app through **SSM port forwarding** to the web instance. No ALB is needed.
- Enable the ALB (`enable_alb=true`) only for the CI/CD, scaling, evidence and demo stages, then disable it. 30 hours of ALB time is about USD 0.30.
- On the Free plan this is taken from credits, so it is never billed.

State this honestly in the cost section of the report. It is a good example of a real cost trade-off.

### 2.5 Never create these (they are not free)

NAT Gateway, Fargate tasks, EKS clusters, Secrets Manager secrets, Multi-AZ RDS, RDS Proxy, interface VPC endpoints (PrivateLink), unattached Elastic IPs, Route 53 hosted zones, Cloud Map namespaces, customer-managed KMS keys, Container Insights, EC2 detailed monitoring, ECR enhanced scanning (Inspector), GuardDuty/Config/Security Hub (trial, then charged), WAF, instance types not in 2.1, EBS volumes over 30 GB in total, T3 "unlimited" CPU credits (set `cpu_credits = "standard"`), and RDS snapshots you forget to delete.

### 2.6 Guardrails

- **AWS Budgets:** a zero-spend budget, or a USD 1 monthly cost budget, with email alerts at 50% and 100% actual and 100% forecast.
- **Free Tier usage alerts:** Billing console, then Billing preferences, then turn on Free Tier usage alerts.
- **Weekly check:** Billing console, then Free Tier page (legacy) or Credits page (Free plan), plus Cost Explorer grouped by service.
- **Tags:** every resource has `Project=campusshelf`, so Cost Explorer can filter by it.

## 3. Recommended Cloud Platform and Architecture

### Recommended platform: Amazon Web Services, region `ap-south-1` (Mumbai)

AWS provides a free or Free Tier equivalent for every CEA requirement. Mumbai is the closest AWS region to Pakistan, which supports the latency NFR, and all Free Tier offers apply there.

- Amazon VPC with public and private subnets across two Availability Zones
- Internet Gateway, plus a NAT instance on Amazon Linux 2023
- Application Load Balancer and target group
- Amazon EC2 Auto Scaling Groups (web tier and application tier), Docker on Amazon Linux 2023
- Amazon ECR for images
- Amazon RDS for PostgreSQL in private DB subnets
- AWS Systems Manager: Parameter Store (secrets and config), Session Manager (admin access)
- Amazon CloudWatch Logs, alarms, Amazon SNS email notifications
- AWS Budgets
- GitHub Actions with OIDC federation for CI/CD
- Terraform for infrastructure as code

### Target architecture

```text
                                 Internet
                                     |
                       Internet Gateway (IGW)
                                     |
  +------------------------- VPC 10.0.0.0/16 (ap-south-1) -------------------------+
  |                                                                               |
  |   Public subnets 10.0.1.0/24 (AZ-a), 10.0.2.0/24 (AZ-b)                       |
  |     [ Application Load Balancer ]  sg-alb: 80 from 0.0.0.0/0                  |
  |     [ NAT instance (AZ-a) ]        sg-nat: 80/443 from private app subnets    |
  |                 |  80                                                        |
  |   Private app subnets 10.0.11.0/24 (AZ-a), 10.0.12.0/24 (AZ-b)                |
  |     [ Web ASG: EC2 + Nginx container ]   sg-web: 80 from sg-alb only          |
  |                 |  3000  (/api proxied, upstream found by EC2 tag lookup)     |
  |     [ App ASG: EC2 + Express container ] sg-app: 3000 from sg-web only        |
  |                 |  5432 (TLS)                                                 |
  |   Private DB subnets 10.0.21.0/24 (AZ-a), 10.0.22.0/24 (AZ-b), no internet route|
  |     [ RDS PostgreSQL 16, Single-AZ ]     sg-rds: 5432 from sg-app only        |
  +-------------------------------------------------------------------------------+

GitHub Actions --OIDC role--> ECR (push :sha) --> SSM /campusshelf/image_tag --> ASG instance refresh
EC2 hosts --> CloudWatch Logs (/campusshelf/web, /campusshelf/api) --> alarms --> SNS email
EC2 hosts --> SSM Parameter Store (DB password, JWT secret)   Admin --> SSM Session Manager
```

### Tier boundaries

| Tier | Service | Placement | Exposure |
|---|---|---|---|
| Web | Nginx container (React build) on EC2 in the web ASG | Private app subnets | Only through the ALB (`sg-web` accepts 80 from `sg-alb` only) |
| Application | Express container on EC2 in the app ASG | Private app subnets | Only from the web tier (`sg-app` accepts 3000 from `sg-web` only) |
| Database | RDS PostgreSQL | Private DB subnets, no internet route | Only from the app tier (`sg-rds` accepts 5432 from `sg-app` only) |

### Key design decisions

1. **EC2 ASGs instead of Fargate.** Fargate has no Free Tier. ASGs still give target groups, health checks, self-healing and target-tracking scaling, which is everything R7 asks for.
2. **Separate web and app ASGs.** Each tier has its own security group and scales on its own. This matches R3 and R8 more strongly than running both containers on one host.
3. **Service discovery through EC2 tags.** A systemd timer on each web host lists the running instances of the app ASG (tag `aws:autoscaling:groupName`) every 20 seconds, writes them into an Nginx `upstream` file and reloads Nginx. It is free, and an internal ALB or Cloud Map would cost money. Nginx passive health checks (`max_fails`) skip an app host that fails.
4. **Immutable deployments.** CI pushes images tagged with the commit SHA, writes the tag to Parameter Store, then starts an **ASG instance refresh** (min healthy 100%, max 200%). New instances read the tag at boot, so a deployment always means new instances. Rollback means writing the previous tag back and refreshing again.
5. **No external runtime dependencies.** The app does not call third-party APIs, so the private tier only needs outbound access for image pulls, OS packages, logs and SSM. Sleeping the NAT instance is harmless outside work sessions.
6. **Containers cannot reach instance credentials.** IMDSv2 is required with a hop limit of 1, so only the host (not the containers) can obtain the instance role. The app itself needs no AWS permissions.

## 4. Implementation Phases

### Phase 0: AWS account, guardrails, and repository baseline

**Objectives**

- Make it impossible to run up unexpected charges.
- Set up a clean repository with no secrets.

**Tasks**

- Confirm the account type (legacy or Free plan) and record it in the report.
- Turn on MFA for the root user. Create an admin identity for daily work (IAM Identity Center user, or an IAM user whose keys stay only on your laptop).
- Create the zero-spend (or USD 1) budget and turn on Free Tier usage alerts.
- Check the EC2 vCPU quota (Service Quotas, "Running On-Demand Standard instances"). You need at least 6 vCPUs for `t3.micro` (10 with refresh headroom) or 5 for `t2.micro`. Request an increase if it is lower.
- Install AWS CLI v2, the Session Manager plugin, Terraform 1.6+, Docker, Node.js 22.
- Create the GitHub repository with `.gitignore` covering `.env`, `*.tfstate*`, `.terraform/`, `terraform.tfvars`, `node_modules/`, `dist/`, `coverage/`.

**Exit criteria**

- The budget alert email is confirmed.
- `aws sts get-caller-identity` works locally with the admin identity.
- The repository contains only `.env.example` files.

### Phase 1: Build the CampusShelf application

**Objectives**

- A working three-tier app that runs locally without Docker first.

**Tasks**

- **Database schema** (node-pg-migrate migrations): `users`, `categories`, `books`, `loans`, `reservations` (stretch). Constraints: unique email, unique ISBN, `copies_available >= 0`, foreign keys, indexes on `books(title)`, `books(author)`, `loans(user_id, returned_at)`.
- **API** (Express): `/auth/register`, `/auth/login`, `/auth/me`, `/books` (GET list/search/paginate, POST), `/books/:id` (GET, PUT, DELETE = archive), `/categories`, `/loans` (POST borrow, GET mine/all), `/loans/:id/return`, `/stats` (librarian), `/health`, `/health/db`.
- Borrowing runs in a **database transaction** with `SELECT ... FOR UPDATE` on the book row, so two members cannot take the last copy at the same time. This is a strong talking point for correctness under horizontal scaling.
- Input validation with `zod`, central error handler, `helmet`, `express-rate-limit` on `/auth/*`.
- **Frontend** (React, Vite, React Router, Tailwind): Login, Register, Catalogue with search, Book detail with Borrow, My Loans, Librarian Books (CRUD), Librarian Loans, Dashboard. `src/lib/api.js` reads `import.meta.env.VITE_API_BASE_URL` (default `/api`).
- **Tests:** Jest + Supertest for auth, role guards, borrow/return (including the last-copy race and overdue logic), and validation errors. Vitest + React Testing Library for 3-4 key components. Target at least 70% line coverage on the API.
- **Seed script** `npm run seed` for demo data.

**Exit criteria**

- `npm test` passes in `api/` against a local PostgreSQL.
- A member can register, borrow and return a book; a librarian can add a book and see overdue loans.

### Phase 2: Backend production readiness

**Tasks**

- `/health` (liveness, no DB) and `/health/db` (`SELECT 1`, 503 on failure).
- Structured JSON logs to stdout with `pino-http` (request ID, method, path, status, latency). No log files.
- Config validation at start-up: the process exits with a clear message if `DB_HOST`, `DB_PASSWORD` or `JWT_SECRET` is missing.
- TLS to RDS: RDS PostgreSQL 15+ forces SSL by default. Bundle the RDS CA (`global-bundle.pem`) in the image and connect with `ssl: { ca }` when `DB_SSL=true`.
- Migrations run through `src/migrate.js` (node-pg-migrate programmatic runner, which takes an advisory lock so two instances cannot migrate at once).
- Graceful shutdown on `SIGTERM`: stop accepting connections, finish in-flight requests, close the pool.
- `trust proxy` set to 2 hops (ALB, then Nginx), so rate limiting and logs see the real client IP.

**Exit criteria**

- The API starts with only the variables in `api/.env.example`.
- `npm run migrate` builds the schema on an empty database.

### Phase 3: Frontend production readiness

**Tasks**

- Build with `VITE_API_BASE_URL=/api`. Vite inlines this at build time, so it is a Docker build argument.
- Nginx: `/api/` proxied to the app upstream (prefix stripped), SPA fallback with `try_files`, long cache for `/assets/`, gzip, `server_tokens off`, `/healthz` for the ALB.
- Check that `dist/` contains no `localhost`.

**Exit criteria**

- `npm run build` passes and the bundle is clean of `localhost`.

### Phase 4: Containerisation and local orchestration

**Tasks**

- `api/Dockerfile`: multi-stage, `node:22-alpine`, production dependencies only, non-root `node` user, `HEALTHCHECK`.
- `web/Dockerfile`: multi-stage, Node build stage, `nginx:1.27-alpine` runtime, default `upstream` include file pointing at `api:3000`.
- `.dockerignore` for both (`.env`, `node_modules`, `coverage`, `.git`).
- Root `docker-compose.yml`: `db` (postgres:16-alpine, named volume, `pg_isready` health check), `migrate` (one-shot, runs `node src/migrate.js`), `api` (waits for `migrate` to complete successfully), `web` (port 8080), `adminer` under `profiles: ["dev"]`.

**Exit criteria**

- `docker compose up --build` gives a working app at `http://localhost:8080`.
- Image sizes are recorded (the target is under 80 MB compressed each, for the ECR free allowance).

### Phase 5: Infrastructure as code (Terraform)

**Tasks**

- Files in `infrastructure/`: `versions.tf`, `providers.tf`, `variables.tf`, `networking.tf`, `nat.tf`, `security.tf`, `iam.tf`, `ecr.tf`, `ssm.tf`, `rds.tf`, `compute.tf`, `alb.tf`, `monitoring.tf`, `budget.tf`, `outputs.tf`, `templates/*.tftpl`, `terraform.tfvars.example`.
- Variables: `region`, `instance_type`, `session_active`, `enable_alb`, `alert_email`, `github_repo`, `budget_limit_usd`.
- VPC `10.0.0.0/16`, 6 subnets in 2 AZs, IGW, public route table (0.0.0.0/0 to IGW), app route table (0.0.0.0/0 to the NAT instance ENI), DB route table (local only).
- NAT instance: AL2023, `source_dest_check = false`, `cpu_credits = "standard"`, user data for iptables masquerade, `aws_ec2_instance_state` driven by `session_active`.
- Launch templates: AL2023 AMI from the SSM public parameter, IMDSv2 required (hop limit 1), 8 GB gp3 root, `cpu_credits = "standard"`, instance profile, user data templates.
- ASGs across both private app subnets. Min/max/desired come from `session_active`. `desired_capacity` is in `ignore_changes`, because scaling policies own it.
- Tags on every resource through `default_tags`.
- Local state, git-ignored, backed up. The state contains the DB password, so it must never be committed.

**Exit criteria**

- `terraform fmt -check`, `terraform validate` and `terraform plan` pass.
- After `apply`, the VPC console shows the subnets, routes and NAT instance, and RDS shows "Publicly accessible: No".

### Phase 6: Registry and CI/CD pipeline

**Pipeline stages**

1. Checkout.
2. API: install, lint, migrate a throwaway PostgreSQL service container, run Jest with coverage.
3. Web: install, lint, Vitest, production build.
4. On pull requests: build both Docker images without pushing (proves the Dockerfiles work).
5. On `main`: assume the AWS role through OIDC (no stored AWS keys).
6. Build and push both images tagged with the commit SHA (immutable tags; ECR scans on push).
7. Save the previous tag, write the new tag to `/campusshelf/image_tag`.
8. If a session is active: instance refresh on the app ASG, then the web ASG, waiting for success.
9. Post-deploy check: `curl --fail` on `<ALB>/api/health/db` when the ALB is enabled.
10. On failure: write the previous tag back and refresh again (automatic rollback).
11. Write a deployment summary to the job summary.

**Tasks**

- `.github/workflows/ci-cd.yml`.
- GitHub OIDC provider and `campusshelf-github-deploy` role, trusted only for `repo:<owner>/<repo>:environment:production`.
- Repository **variables** (not secrets): `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `APP_URL`. No AWS secrets are stored in GitHub at all.
- `production` environment with a required reviewer and a `main`-only deployment branch rule.
- `workflow_dispatch` input `image_tag` for manual redeploys and rollbacks.

**Exit criteria**

- A pull request runs tests and image builds.
- A merge to `main` pushes SHA-tagged images, refreshes both ASGs, and passes the health check.
- A deliberately broken deployment rolls back by itself.

### Phase 7: Load balancing, scaling, and reliability

**Tasks**

- ALB (internet-facing, both public subnets), HTTP listener on 80, target group type `instance`, port 80, health check `/healthz`.
- Web ASG attached to the target group, health check type `ELB` (when the ALB is on) with a 120 s grace period.
- App ASG health check type `EC2`. The user data marks the instance **Unhealthy** if `/health/db` does not pass within about 150 s, so the ASG replaces it.
- Target tracking on average CPU at 50% for both ASGs (min 1, max 2).
- Instance refresh settings: min healthy 100%, max healthy 200%, warm-up 180 s.
- RDS: automated backups (7 days), encryption, maintenance window, `deletion_protection = false` and `skip_final_snapshot = true` (CEA only, so tear-down leaves no paid snapshots).

**Exit criteria**

- The ALB shows healthy targets.
- A terminated instance is replaced automatically.
- A load test causes a scale-out event that is then reversed.

### Phase 8: Security, observability, and cloud-native enhancement

**Tasks**

- Security groups with **restricted egress** as well as ingress (see the guide, step 8a).
- No SSH key pairs and no port 22 anywhere. Admin access is Session Manager only.
- Instance roles: `AmazonSSMManagedInstanceCore`, ECR read-only, write to the two log groups, read `/campusshelf/*` parameters. The web role also gets `ec2:DescribeInstances` (read-only, used for discovery). The app role also gets `autoscaling:SetInstanceHealth` on its own ASG.
- Encryption at rest: RDS (`aws/rds`), EBS (default encryption), Parameter Store (`aws/ssm`), ECR (AES-256). All use AWS managed keys, which are free.
- Encryption in transit: TLS between the app and RDS. ALB to browser is HTTP unless you have a domain (limitation).
- CloudWatch: log groups with 7-day retention, Docker `awslogs` driver, 4 custom alarms (ALB unhealthy hosts, app ASG CPU, RDS CPU, RDS free storage) to an SNS email topic. The 2 target-tracking policies create 4 alarms of their own, so the total is 8 of the 10 free alarms.
- AWS Budgets created by Terraform.
- Chosen enhancements: **infrastructure as code (Terraform)**, **centralised logging and monitoring (CloudWatch)**, **cost estimate with optimisations**. Optional extra: S3 nightly `pg_dump` backups through a free S3 gateway endpoint.

**Exit criteria**

- No database or application host is reachable from the internet.
- No secrets are in source code, Terraform files, image layers, user data, or logs.
- At least one alarm has fired and sent an email.

### Phase 9: Testing and deployment evidence

**Testing tasks**

- API unit and integration tests (Jest/Supertest) in CI, with a coverage report.
- Web tests (Vitest) and lint in CI.
- Migration test against a clean PostgreSQL (CI service container).
- Container build checks on pull requests.
- API smoke tests against the deployed URL (`/api/health`, `/api/health/db`, `/api/books`).
- Playwright smoke suite against the ALB: login for each role, member borrows and returns, librarian adds a book, invalid login rejected, member blocked from librarian pages.
- ALB health checks and instance replacement.
- A controlled CI/CD deployment from a small visible change, plus one deliberate failed deployment showing the rollback.
- Load test with `hey` (scaling and latency figures).

**Evidence checklist**

- [ ] Account plan and budget alert configuration
- [ ] VPC and CIDR
- [ ] Public, private app and private DB subnets (both AZs)
- [ ] Route tables (IGW route, NAT instance route, DB table with no internet route) and IGW
- [ ] NAT instance with source/destination check disabled
- [ ] Auto Scaling Groups (web and app) and their instances
- [ ] Launch template details (IMDSv2 required, standard CPU credits)
- [ ] ECR repositories and SHA image tags, scan results
- [ ] Security groups (all five) with inbound and outbound rules
- [ ] ALB listener, target group, healthy targets
- [ ] RDS: subnet group, encryption, public access "No", Single-AZ, backups
- [ ] Parameter Store parameters (values hidden)
- [ ] CloudWatch log streams and at least one alarm (plus the email)
- [ ] Successful GitHub Actions run, and the rollback run
- [ ] Browser screenshot of the running app on the ALB URL
- [ ] Test output (Jest coverage, Playwright report, load test)
- [ ] Free Tier usage / credits page near the end of the project

### Phase 10: Technical report and presentation

**Report structure**

1. Introduction and problem statement
2. CampusShelf application overview
3. Cloud provider, region and Free Tier strategy
4. Three-tier architecture and network design
5. Containerisation design
6. Database and migration strategy
7. Container registry and CI/CD workflow
8. Security controls
9. Load balancing, scaling, and reliability
10. Cloud-native enhancements and cost estimate
11. Testing and deployment evidence
12. Dedicated NFR justification
13. Limitations and future improvements
14. Conclusion

## 5. NFR Justification Plan

| NFR | CampusShelf design decision | Evidence/measurement |
|---|---|---|
| Scalability | Stateless containers (JWT, no server sessions); separate web and app ASGs (1 to 2 instances each); ALB distribution; transactional borrowing safe across many app instances | Target group with 2 targets after scale-out; ASG activity history |
| Availability / Reliability | Two AZs for ASGs and the DB subnet group; ALB and ASG health checks; self-healing ASGs; failed-health instances marked unhealthy; RDS automated backups | Instance replacement screenshot; ALB health status; RDS backup settings |
| Elasticity | Target tracking on CPU 50%; scale-in after the load stops; the session switch scales to zero outside working hours | Scale-out and scale-in events from the load test; `session_active` plan output |
| Security | Only the ALB is public; tier-to-tier security groups with restricted egress; no SSH; IMDSv2 hop limit 1; Parameter Store SecureString; TLS to RDS; OIDC role scoped to one repo environment; immutable tags; required reviewer | SG screenshots; RDS public access "No"; IAM trust policy; workflow file |
| Maintainability / Deployability | Docker images; Terraform; CI on every PR; immutable SHA deployments through instance refresh; automatic rollback; health-gated releases | Green workflow run; rollback run; instance refresh history |
| Performance / Latency | Mumbai region; Nginx serves static assets with gzip and long caching; keep-alive to the app tier; DB indexes on search columns; connection pooling | Load test p50/p95 latency; browser Network tab timings |
| Cost-Efficiency | Free Tier only; NAT instance instead of NAT Gateway; EC2 instead of Fargate; Parameter Store instead of Secrets Manager; ALB only when needed; session switch; 7-day logs; ECR lifecycle policy | Pricing Calculator comparison; Free Tier usage page; budget |
| Portability | Standard Docker images that run the same in Compose and on EC2; PostgreSQL standard engine; Terraform variables; Nginx upstream file can point at any host | `docker compose up` screenshot; repo structure; same images locally and in AWS |

### Known limitations to state honestly

- **Single region**: no multi-region disaster recovery.
- **Single NAT instance** in one AZ: if it fails or that AZ fails, private outbound traffic stops (the running app keeps serving users, but deployments and logs stop). Improvement: a NAT Gateway per AZ, or a NAT instance in its own ASG of 1.
- **Single-AZ RDS**: the database is a single point of failure. Multi-AZ is not in the Free Tier.
- **Burstable instances**: `t2/t3.micro` in standard credit mode slow down to their baseline once CPU credits are used. RDS T-class instances run in Unlimited mode, so keep load tests short.
- **Not running 24/7**: the session switch saves cost but means the app is offline outside sessions. This is a deliberate academic trade-off.
- **No HTTPS** without a domain.
- **Service discovery by polling** has up to about 20 seconds of delay after app instances change. Nginx passive health checks cover the gap.
- **Rate limiting is per instance** (in memory), so limits are not shared across app instances.
- **Basic monitoring only**: 5-minute metrics, no memory metrics (the CloudWatch agent would add paid custom metrics).
- **Deployments are slower** (5-10 minutes) because instance refresh replaces whole instances.
- **Secrets rotation is manual**, and the Terraform state holds the DB password (local and git-ignored).

## 6. Repository Structure

```text
.
├── IMPLEMENTATION_PLAN.md
├── CEA_STEP_BY_STEP_GUIDE.md
├── README.md                      # runbook: local run, AWS deploy, CI/CD setup
├── docker-compose.yml             # db, migrate, api, web, adminer (dev profile)
├── .env.example                   # compose variables (DB_PASSWORD, JWT_SECRET, SEED_DEMO_PASSWORD)
├── api/
│   ├── Dockerfile, .dockerignore, .env.example, eslint.config.js, package.json
│   ├── migrations/                # node-pg-migrate: users, catalogue, loans
│   ├── src/
│   │   ├── server.js, app.js, config.js, db.js, logger.js, errors.js
│   │   ├── migrate.js, seed.js
│   │   ├── middleware/            # auth (JWT, roles), validate (zod), errors
│   │   └── routes/                # auth, books, categories, loans, stats, users
│   └── tests/                     # Jest + Supertest against real PostgreSQL (33 tests)
├── web/
│   ├── Dockerfile, .dockerignore, .env.example, vite.config.js, eslint.config.js
│   ├── nginx/
│   │   ├── default.conf           # /api proxy, SPA fallback, caching, security headers, /healthz
│   │   └── app-upstream.inc       # app-tier servers (compose default; rewritten on EC2)
│   └── src/                       # pages/, components/, lib/, test/ (Vitest, 14 tests)
├── e2e/                           # Playwright: smoke, member and librarian journeys (10 tests)
├── infrastructure/
│   ├── versions.tf, variables.tf, locals.tf, outputs.tf
│   ├── networking.tf, nat.tf, security.tf, iam.tf
│   ├── ecr.tf, ssm.tf, rds.tf, compute.tf, alb.tf, monitoring.tf
│   ├── terraform.tfvars.example
│   └── templates/
│       ├── nat-user-data.sh
│       ├── web-user-data.sh.tftpl   # Docker, Nginx container, app-tier discovery timer
│       └── app-user-data.sh.tftpl   # Docker, secrets to tmpfs, migrations, readiness gate
├── scripts/
│   ├── session-up.sh, session-down.sh
│   ├── manual-push.sh, wait-instance-refresh.sh
│   └── port-forward.sh, seed-cloud.sh
├── .github/
│   └── workflows/
│       └── ci-cd.yml
└── docs/
    ├── architecture-diagram.png   # you draw this (guide Step 14)
    ├── deployment-evidence/       # your screenshots
    ├── session-log.md             # written by the session scripts
    └── technical-report.md
```

## 7. Definition of Done

The implementation will be considered complete when:

- [ ] CampusShelf runs locally with `docker compose up --build`.
- [ ] API tests pass in CI with coverage reported.
- [ ] Frontend and backend images build reproducibly and are pushed to ECR with SHA tags.
- [ ] The VPC contains public, private app and private DB subnet layers in two AZs.
- [ ] The web tier is publicly reachable only through the ALB.
- [ ] The application tier is private and reachable only from the web tier.
- [ ] PostgreSQL is private, encrypted, reached over TLS, and migrations run automatically.
- [ ] No secrets are committed, baked into images, placed in user data, or printed in logs.
- [ ] CI/CD tests, builds, pushes, deploys, verifies, and rolls back automatically.
- [ ] Health checks, logs, and at least one alarm with email notification work.
- [ ] Scaling and load balancing are demonstrated with screenshots.
- [ ] The Free Tier usage page shows no charges (legacy) or credit-only usage (Free plan).
- [ ] The architecture diagram and screenshots are collected.
- [ ] The 4-6 page report includes the NFR section and the limitations.
- [ ] `terraform destroy` has been run after evidence capture, and the billing console shows no running resources.

## 8. Suggested Execution Order

1. Set up the account, guardrails and repository.
2. Build the application with tests.
3. Add health checks, logging, config validation and TLS support.
4. Add Dockerfiles and the root Compose file; test locally.
5. Create the Terraform network and NAT instance.
6. Create security groups, IAM, ECR, Parameter Store and RDS.
7. Push manual images and create the ASGs; test through SSM port forwarding.
8. Add GitHub Actions CI/CD.
9. Enable the ALB, scaling policies and alarms.
10. Run reliability, scaling and end-to-end tests against the ALB.
11. Capture evidence, build the cost estimate, draw the diagram.
12. Write the report.
13. Final security and requirements review; `terraform destroy`.

## 9. Completion Summary Template

At the end of the project, record:

- Cloud provider and region:
- AWS account plan (legacy Free Tier / Free account plan):
- Repository URL:
- Deployed application URL (ALB DNS):
- ECR repository URLs:
- Auto Scaling Group names:
- EC2 instance type:
- RDS engine, version and instance class:
- Terraform version:
- CI/CD workflow URL:
- Last successful deployment commit:
- Rollback test commit:
- Test suites executed and coverage:
- Load test results (requests/s, p50, p95):
- Total session hours used this month:
- Actual cost shown in Billing (should be USD 0.00 or credits only):
- Estimated monthly cost at list price (24/7, no Free Tier):
- Cost optimisation measures:
- Known limitations:
