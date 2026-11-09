# CEA Step-by-Step Guide: CampusShelf on AWS Free Tier (SE-490, Cloud Computing)

This guide turns `IMPLEMENTATION_PLAN.md` into an ordered checklist. Each step says:
- **Do**: what to build or change
- **Where**: the file or console location
- **Done when**: the checkpoint that proves the step works
- **Evidence**: the screenshot or file to keep for the report

Requirement numbers (R1 to R10) refer to the "System Requirements" section of the CEA statement.

**The `campusshelf` repository already implements every step below.** The snippets in this guide explain what each file does and why; the file paths match the repository. Where the repository has a ready-made script (`scripts/`), the guide tells you to run it. Read **section 2 of the plan (Free Tier Cost Model)** before Step 1. Every choice in this guide follows from it.

---

## 0. What the marks are most likely tied to

I do not have your marking rubric. The CEA statement is organised around these items, so the guide follows them:

| Item | What the marker looks for | Steps |
|---|---|---|
| R1 Network | VPC, public/private subnets in 2 AZs, IGW, NAT (instance), route tables | 7 |
| R2 Web tier | Nginx container, Dockerfile, reachable in a browser through the ALB | 5, 6, 10 |
| R3 Application tier | Express container, private, reachable only from web | 4, 6, 8, 9 |
| R4 Database | Private managed PostgreSQL, TLS, not public | 8 |
| R5 Registry | Images in ECR with SHA tags | 8, 9, 11 |
| R6 CI/CD | GitHub Actions: test, build, push, deploy, verify, roll back | 11 |
| R7 Load balancing and scaling | ALB, target group, two Auto Scaling Groups, target tracking | 9, 10, 12 |
| R8 Security | SGs per tier, least privilege, Parameter Store, OIDC, no SSH | 1, 8, 11 |
| R9 Enhancements (choose 1+) | Terraform, CloudWatch logs and alarms, cost estimate with 2+ optimisations | 7, 10, 13 |
| R10 NFR justification | Written section mapping decisions to 8 NFRs, with honest limitations | 17 |
| Deliverables | Diagram, screenshots, source files, 4 to 6 page report | 14, 15, 16, 17 |

The biggest mark risks are **R10 (NFR section)**, **the screenshots**, and **a working CI/CD run you can show**. For this version there is a fourth risk: **an unexpected AWS bill**. Steps 1 and 13 deal with it.

### The five Free Tier rules for this whole project

1. **Never create** a NAT Gateway, Fargate task, Secrets Manager secret, Multi-AZ RDS, interface VPC endpoint or Route 53 hosted zone. (Full list: plan section 2.5.)
2. **Only use free instance types** for your account (`t2.micro` on a legacy account in Mumbai, `t3.micro` on the Free plan) and set **standard CPU credits**.
3. **Sleep the stack** (`session_active=false`) every time you stop working. Log your session hours.
4. **Keep the ALB off** (`enable_alb=false`) until Step 10. Use SSM port forwarding before that.
5. **Check Billing weekly** (Free Tier page or Credits page, plus Cost Explorer).

---

## Step 1: AWS account and cost guardrails (Phase 0, R8)

**Do**
1. **Find your account type.** Billing console, then Free Tier (legacy) or Credits (Free plan). Write the account creation date and plan in `docs/session-log.md`. If you can still create a brand-new account (no previous AWS account), create it on the **Free account plan**: it cannot be billed.
2. **Secure the root user:** turn on MFA, and do not use root for daily work. Create an admin identity (IAM Identity Center user, or an IAM user with MFA). If you use access keys, keep them only in `~/.aws/credentials`, never in the repo.
3. **Budget:** Billing, then Budgets, then Create budget, then "Zero spend budget" (legacy) or a USD 1 monthly cost budget, with your email. Terraform also creates one in Step 10 (keep both).
4. **Free Tier alerts:** Billing preferences, then turn on "Receive AWS Free Tier alerts".
5. **Region:** set the console and CLI to `ap-south-1` (Mumbai).
6. **Free instance types:**
   ```bash
   aws configure set region ap-south-1
   aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true \
     --query "InstanceTypes[*].InstanceType" --output text
   ```
   Use the smallest x86 type in the output (`t2.micro` or `t3.micro`) for `instance_type` in Terraform.
7. **vCPU quota:** Service Quotas, then Amazon EC2, then "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances". You need at least 10 vCPUs for `t3.micro` (3 instances x 2 vCPUs, plus room for instance refresh and scale-out), or 5 for `t2.micro`. Request an increase if it is lower. This can take a day, so do it now.
8. **Tools:** AWS CLI v2, the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html), Terraform 1.6 or later, Docker Desktop, Node.js 22, `hey` (load testing).
9. **Repository:** create `campusshelf` on GitHub. A **public** repository gives unlimited free Actions minutes; a private one gives 2,000 minutes a month, which is also enough. Add a `.gitignore`:
   ```
   .env
   *.env
   !.env.example
   node_modules/
   dist/
   coverage/
   playwright-report/
   .terraform/
   *.tfstate
   *.tfstate.*
   terraform.tfvars
   ```

**Done when:** the budget confirmation email arrives, `aws sts get-caller-identity` prints your admin identity, and you know your free instance type.

**Evidence:** Budget screenshot; Free Tier or Credits page on day 1 (compare it with the last day).

---

## Step 2: Build the CampusShelf application (Phase 1)

Folders: `api/`, `web/`

**Do**

**2a. Database schema** (`api/migrations/`, one migration per change, using node-pg-migrate)

| Table | Key columns |
|---|---|
| `users` | `id`, `name`, `email` (unique), `password_hash`, `role` (`member`/`librarian`/`admin`), `created_at` |
| `categories` | `id`, `name` (unique) |
| `books` | `id`, `isbn` (unique), `title`, `author`, `category_id` FK, `published_year`, `description`, `cover_url`, `copies_total`, `copies_available` (CHECK `>= 0`), `archived` |
| `loans` | `id`, `user_id` FK, `book_id` FK, `borrowed_at`, `due_at`, `returned_at` (null while active) |
| `reservations` (stretch) | `id`, `user_id`, `book_id`, `created_at`, `status` |

Indexes: `books(title)`, `books(author)`, `loans(user_id) WHERE returned_at IS NULL`.

**2b. API endpoints** (`api/src/routes/`)

| Method and path | Role | Purpose |
|---|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | public / any | Accounts and JWT |
| `GET /books?search=&category=&page=` | any | Catalogue search with pagination |
| `GET /books/:id` | any | Book detail |
| `POST /books`, `PUT /books/:id`, `DELETE /books/:id` (archive) | librarian, admin | Catalogue management |
| `GET /categories` | any | Filters |
| `POST /loans` (body `bookId`) | member | Borrow (14-day due date) |
| `GET /loans/mine` | member | My loans, with an overdue flag |
| `GET /loans?status=active\|overdue` | librarian | All loans |
| `POST /loans/:id/return` | member (own) / librarian | Return |
| `GET /stats` | librarian | Dashboard figures |
| `GET /health`, `GET /health/db` | public | Liveness and readiness |

**Borrowing must be safe when there are two app instances.** Use a transaction:
```js
// api/src/routes/loans.js (core of POST /loans)
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query(
    'SELECT copies_available FROM books WHERE id = $1 AND archived = false FOR UPDATE',
    [bookId]
  );
  if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Book not found' }); }
  if (rows[0].copies_available < 1) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'No copies available' }); }
  await client.query('UPDATE books SET copies_available = copies_available - 1 WHERE id = $1', [bookId]);
  const loan = await client.query(
    "INSERT INTO loans (user_id, book_id, due_at) VALUES ($1, $2, now() + interval '14 days') RETURNING *",
    [req.user.id, bookId]
  );
  await client.query('COMMIT');
  res.status(201).json(loan.rows[0]);
} catch (err) {
  await client.query('ROLLBACK');
  next(err);
} finally {
  client.release();
}
```
Mention this in the report: horizontal scaling is safe because consistency comes from the database row lock, not from app memory.

**2c. Other API essentials:** `zod` validation, `helmet`, `express-rate-limit` on `/auth/*`, bcrypt (cost 10), JWT (1 hour), one central error handler that never returns stack traces in production.

**2d. Frontend pages** (`web/src/pages/`): Login, Register, Catalogue (search and category filter), Book detail (Borrow button), My Loans, Librarian Books (table and form), Librarian Loans (active/overdue tabs), Dashboard. Use a `ProtectedRoute` component that checks the role.

`web/src/lib/api.js`:
```js
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';
export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
```
In development, set `server.proxy` in `vite.config.js` so `/api` goes to `http://localhost:3000` with the prefix removed. The browser code is the same in development and production.

**2e. Tests**
- `api/tests/`: Jest + Supertest. Cover register/login (valid and invalid), role guards (member gets 403 on `POST /books`), borrow decreases copies, borrowing the last copy twice gives one 201 and one 409, return increases copies, overdue flag, validation errors (400).
- `web/src/**/*.test.jsx`: Vitest + React Testing Library for the login form, the book card, and the protected route.
- `package.json` scripts: `test`, `lint`, `migrate`, `seed`, `start`, `dev`.

**2f. Seed data:** `npm run seed` creates `member@campusshelf.test`, `librarian@campusshelf.test`, `admin@campusshelf.test` (demo passwords set in `.env`, not in code), 8 categories, about 200 books and a few loans (some overdue).

**Done when:** `npm test` passes in `api/` against a local PostgreSQL, and the full borrow/return flow works in the browser with `npm run dev` in both folders.

**Evidence:** Jest output with coverage (keep it for the testing section).

---

## Step 3: Secure the repository (Phase 0, R8)

**Do**
1. Create `api/.env.example` (names only, no real values):
   ```
   NODE_ENV=development
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=campusshelf
   DB_USER=campusshelf
   DB_PASSWORD=
   DB_SSL=false
   JWT_SECRET=
   CORS_ORIGIN=http://localhost:5173
   SEED_DEMO_PASSWORD=
   ```
   and `web/.env.example` with `VITE_API_BASE_URL=/api`.
2. Check that nothing secret is tracked:
   ```bash
   git ls-files | grep -iE "\.env|tfstate|tfvars"
   ```
   Only `.env.example` and `terraform.tfvars.example` files may appear.
3. Optional but good for marks: add a `gitleaks` scan to CI (Step 11) and mention it in the security section.

**Done when:** a new developer can set up the project from the `.env.example` files alone.

**Evidence:** terminal output of the `git ls-files` check.

---

## Step 4: Backend production readiness (Phase 2, R3)

Files: `api/src/config.js`, `api/src/db.js`, `api/src/app.js`, `api/src/server.js`, `api/src/migrate.js`

**Do**
1. **Config validation** (`config.js`): parse `process.env` with `zod`. If a required value is missing, print the variable name (never its value) and exit with code 1.
2. **Database pool with TLS** (`db.js`). RDS PostgreSQL 15 and later forces SSL by default, so production connections must use TLS:
   ```js
   import fs from 'node:fs';
   import pg from 'pg';
   import { config } from './config.js';

   export const pgConfig = {
     host: config.DB_HOST, port: config.DB_PORT, database: config.DB_NAME,
     user: config.DB_USER, password: config.DB_PASSWORD, max: 10,
     ssl: config.DB_SSL
       ? { ca: fs.readFileSync(new URL('../certs/rds-global-bundle.pem', import.meta.url)), rejectUnauthorized: true }
       : false,
   };
   export const pool = new pg.Pool(pgConfig);
   ```
3. **Health endpoints** (`app.js`):
   ```js
   app.get('/health', (req, res) => res.json({ status: 'ok' }));
   app.get('/health/db', async (req, res) => {
     try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'up' }); }
     catch { res.status(503).json({ status: 'error', db: 'down' }); }
   });
   ```
4. **Structured logging:** `pino-http` writing JSON to stdout. Redact `req.headers.authorization` and any `password` field. CloudWatch collects stdout through the Docker `awslogs` driver, so no log files are needed.
5. **Proxy awareness:** `app.set('trust proxy', 2)` (ALB, then Nginx), so `req.ip` and rate limits use the real client address.
6. **Migrations** (`migrate.js`) with the programmatic runner, reusing the same TLS settings:
   ```js
   import { runner } from 'node-pg-migrate';
   import { pgConfig } from './db.js';

   await runner({
     databaseUrl: pgConfig,          // accepts a pg client config object
     dir: 'migrations',
     direction: 'up',
     migrationsTable: 'pgmigrations',
     // node-pg-migrate takes an advisory lock by default, so two instances
     // starting together cannot run the same migration twice.
   });
   console.log(JSON.stringify({ msg: 'migrations complete' }));
   process.exit(0);
   ```
7. **Graceful shutdown** (`server.js`): on `SIGTERM`, call `server.close()`, then `pool.end()`, and exit within 10 seconds. Docker sends `SIGTERM` when a container stops and an instance refresh terminates the host.
8. **CORS:** with the `/api` proxy design the browser makes same-origin calls, so CORS is only needed in development. Keep `CORS_ORIGIN` from config.

**Done when:** `npm start` works with only the `.env.example` variables filled in, `curl localhost:3000/health` returns 200, `curl localhost:3000/health/db` returns 503 when PostgreSQL is stopped, and `npm run migrate` works on an empty database.

**Evidence:** terminal output of `npm run migrate` on an empty database, and the two health responses.

---

## Step 5: Frontend production readiness (Phase 3, R2)

Files: `web/src/lib/api.js`, `web/nginx/default.conf`, `web/nginx/app-upstream.inc`

**Do**
1. **Routing design (decide now, it sets the Nginx config):**
   - The browser calls `/api/...` on the same domain as the page.
   - Nginx forwards `/api/` to the app tier. The trailing slash on `proxy_pass` removes the prefix, so `/api/books` reaches Express as `/books`.
   - The ALB only sends traffic to the web tier. The app tier is never a target of the ALB.
2. **Upstream file.** The list of app servers lives in a separate file, so the same image works in Compose and on AWS:
   - `web/nginx/app-upstream.inc` (baked into the image, used by Compose):
     ```nginx
     server api:3000 max_fails=1 fail_timeout=15s;
     ```
   - On EC2 the web host overwrites this file with the private IPs of the app instances (Step 9).
3. **`web/nginx/default.conf`:**
   ```nginx
   upstream app_backend {
     include /etc/nginx/upstream/app-upstream.inc;
     keepalive 16;
   }

   server {
     listen 80;
     server_tokens off;
     root /usr/share/nginx/html;
     index index.html;

     gzip on;
     gzip_types text/css application/javascript application/json image/svg+xml;

     # ALB health check: proves Nginx is up, without depending on the app tier
     location = /healthz {
       access_log off;
       default_type text/plain;
       return 200 "ok\n";
     }

     location /api/ {
       proxy_pass http://app_backend/;         # trailing slash strips /api
       proxy_http_version 1.1;
       proxy_set_header Connection "";
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_connect_timeout 3s;
       proxy_read_timeout 30s;
       proxy_next_upstream error timeout http_502 http_503;
     }

     location /assets/ {
       expires 30d;
       add_header Cache-Control "public, immutable";
       try_files $uri =404;
     }

     location / {
       try_files $uri /index.html;             # SPA fallback for React Router
     }
   }
   ```
4. Build and check the bundle:
   ```bash
   cd web && VITE_API_BASE_URL=/api npm run build
   grep -r "localhost:3000" dist && echo "DEV API URL FOUND" || echo "clean"
   ```
   Search for `localhost:3000` (the development API), not just `localhost`: React Router's bundle contains a harmless `http://localhost` placeholder.

**Done when:** `npm run build` passes and prints "clean".

---

## Step 6: Containerisation (Phase 4, R2 and R3)

**Do**

**6a. `api/Dockerfile`**
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Amazon RDS CA bundle, so the app can verify the database certificate
ADD --chown=node:node https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem ./certs/rds-global-bundle.pem
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.js"]
```
`node-pg-migrate`, `pg`, `express` and the other runtime packages must be in `dependencies`, not `devDependencies`. Jest, ESLint and Supertest stay in `devDependencies`.

**6b. `api/.dockerignore`**
```
.env
node_modules
coverage
tests
.git
```
Without it, your local `.env` would be copied into the image.

**6c. `web/Dockerfile`** (multi-stage)
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/app-upstream.inc /etc/nginx/upstream/app-upstream.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
```

**6d. `web/.dockerignore`:** `node_modules`, `dist`, `.env`, `coverage`, `.git`

**6e. Root `docker-compose.yml`**
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: campusshelf
      POSTGRES_USER: campusshelf
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U campusshelf -d campusshelf"]
      interval: 5s
      timeout: 5s
      retries: 10

  migrate:
    build: ./api
    command: ["node", "src/migrate.js"]
    env_file: ./api/.env
    environment:
      DB_HOST: db
      DB_SSL: "false"
    depends_on:
      db:
        condition: service_healthy

  api:
    build: ./api
    env_file: ./api/.env
    environment:
      DB_HOST: db
      DB_SSL: "false"
      NODE_ENV: production
    depends_on:
      migrate:
        condition: service_completed_successfully
    # no "ports": the API is reachable only from the web container

  web:
    build:
      context: ./web
      args:
        VITE_API_BASE_URL: /api
    ports:
      - "8080:80"
    depends_on:
      api:
        condition: service_healthy

  adminer:
    image: adminer
    profiles: ["dev"]
    ports:
      - "8081:8080"

volumes:
  pgdata:
```
Put `DB_PASSWORD` in a root `.env` (git-ignored) and use the same value in `api/.env`. Note that the `api` service publishes no port, which mirrors the private app tier in AWS. Seed the local database with `docker compose run --rm api node src/seed.js`.

**6f. Image size check** (ECR gives 500 MB of free storage):
```bash
docker compose build
docker images | grep campusshelf
```
Aim for under 80 MB compressed per image. Alpine bases and `--omit=dev` usually give about 60 MB for the API and about 25 MB for the web image.

**Done when:** `docker compose up --build` starts all services, `docker compose ps` shows them healthy, and you can log in, borrow and return a book at `http://localhost:8080`.

**Evidence:** screenshot of `docker compose ps` with healthy containers, and the app at `localhost:8080`.

---

## Step 7: Network and NAT instance with Terraform (Phase 5, R1 and R9 IaC)

Folder: `infrastructure/`

**Do**

**7a. Provider and shared variables** (`versions.tf`, `providers.tf`, `variables.tf`)
```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "campusshelf", ManagedBy = "terraform" }
  }
}

variable "region" {
  default = "ap-south-1"
}
variable "instance_type" {
  description = "Free Tier type from Step 1 (t2.micro or t3.micro)"
  type        = string
}
variable "session_active" {
  type    = bool
  default = true
}
variable "enable_alb" {
  type    = bool
  default = false
}
variable "alert_email" {
  type = string
}
variable "github_repo" {
  description = "owner/repo, for the OIDC trust"
  type        = string
}
variable "budget_limit_usd" {
  type    = string
  default = "1"
}

locals {
  azs        = ["${var.region}a", "${var.region}b"]
  alb_on     = var.session_active && var.enable_alb
  asg_min    = var.session_active ? 1 : 0
  asg_max    = var.session_active ? 2 : 0
}
```
`terraform.tfvars.example` lists these with dummy values. Your real `terraform.tfvars` is git-ignored.

**7b. Address plan**

| Subnet | CIDR | Holds | Route table |
|---|---|---|---|
| Public A / B | 10.0.1.0/24, 10.0.2.0/24 | ALB, NAT instance | `0.0.0.0/0` to the IGW |
| Private app A / B | 10.0.11.0/24, 10.0.12.0/24 | Web and app ASG instances | `0.0.0.0/0` to the NAT instance ENI |
| Private DB A / B | 10.0.21.0/24, 10.0.22.0/24 | RDS | Local only, **no internet route** |

VPC: `10.0.0.0/16`, DNS hostnames and DNS support enabled. Public subnets do **not** auto-assign public IPs (`map_public_ip_on_launch = false`). Only the NAT instance asks for one.

**7c. NAT instance** (`nat.tf`, `templates/nat-user-data.sh`)

A NAT Gateway is not in the Free Tier. A NAT instance does the same job on a free EC2 instance.
```hcl
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_instance" "nat" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat.id]
  associate_public_ip_address = true
  source_dest_check           = false          # required for NAT
  iam_instance_profile        = aws_iam_instance_profile.nat.name   # SSM access only
  user_data                   = file("${path.module}/templates/nat-user-data.sh")

  credit_specification { cpu_credits = "standard" }   # avoid T3 "unlimited" charges
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }
  lifecycle { ignore_changes = [ami] }   # do not replace the NAT on every new AMI
  tags = { Name = "campusshelf-nat" }
}

resource "aws_ec2_instance_state" "nat" {
  instance_id = aws_instance.nat.id
  state       = var.session_active ? "running" : "stopped"
}

resource "aws_route" "app_default" {
  route_table_id         = aws_route_table.private_app.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat.primary_network_interface_id
}
```
`templates/nat-user-data.sh` (this follows the AWS documentation for an Amazon Linux 2023 NAT instance):
```bash
#!/bin/bash
set -eux
dnf install -y iptables-services
systemctl enable --now iptables
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/90-nat.conf
sysctl -p /etc/sysctl.d/90-nat.conf
IFACE=$(ip route show default | awk '{print $5; exit}')
iptables -t nat -A POSTROUTING -o "$IFACE" -s 10.0.0.0/16 -j MASQUERADE
iptables -F FORWARD
service iptables save
```
State the trade-off in the report: one NAT instance in AZ-a, so private subnet B also routes through AZ-a. If that instance or AZ fails, private outbound traffic stops (see the limitations).

**Done when:** `terraform fmt -check`, `terraform validate` and `terraform plan` pass, and after `terraform apply` the VPC console shows 6 subnets, 3 route tables, the IGW and the NAT instance with "Source/destination check: false".

**Evidence:** VPC and CIDR; subnet list; the three route tables with their routes; the NAT instance details page.

---

## Step 8: Security, registry, secrets and database (R4, R5, R8)

**Do**

**8a. Security groups** (`security.tf`, one per tier, ingress **and** egress restricted)

| Security group | Inbound | Outbound |
|---|---|---|
| `sg-alb` | TCP 80 from `0.0.0.0/0` (443 too if you have a certificate) | TCP 80 to `sg-web` |
| `sg-web` | TCP 80 from `sg-alb` | TCP 3000 to `sg-app`; TCP 443 to `0.0.0.0/0` (ECR, SSM, logs, through NAT) |
| `sg-app` | TCP 3000 from `sg-web` | TCP 5432 to `sg-rds`; TCP 443 to `0.0.0.0/0` |
| `sg-rds` | TCP 5432 from `sg-app` | none |
| `sg-nat` | TCP 80 and 443 from 10.0.11.0/24 and 10.0.12.0/24 | TCP 80 and 443 to `0.0.0.0/0` |

No rule anywhere opens port 22, and no rule opens 3000 or 5432 to a CIDR. DNS to the VPC resolver is not filtered by security groups, so no extra rule is needed for it.

Use the separate rule resources so rules can reference each other without cycles:
```hcl
resource "aws_vpc_security_group_ingress_rule" "app_from_web" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "API only from the web tier"
}
```

**8b. ECR** (`ecr.tf`)
- Two repositories: `campusshelf-web`, `campusshelf-api`.
- `image_tag_mutability = "IMMUTABLE"`, `scan_on_push = true` (basic scanning is free), AES-256 encryption.
- Lifecycle policy to stay under the 500 MB free storage:
  ```json
  { "rules": [ { "rulePriority": 1, "description": "Keep last 5 images",
    "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 5 },
    "action": { "type": "expire" } } ] }
  ```
- `force_delete = true`, so `terraform destroy` can remove repositories that still contain images.

**8c. Parameter Store secrets** (`ssm.tf`). Secrets Manager costs money; standard SecureString parameters do not.
```hcl
resource "random_password" "db" {
  length  = 32
  special = false   # avoids URL-encoding problems in connection strings
}
resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/campusshelf/db_password"
  type  = "SecureString"         # encrypted with the AWS managed key aws/ssm (free)
  value = random_password.db.result
}
resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/campusshelf/jwt_secret"
  type  = "SecureString"
  value = random_password.jwt.result
}
resource "aws_ssm_parameter" "image_tag" {
  name  = "/campusshelf/image_tag"
  type  = "String"
  value = "manual-1"
  lifecycle { ignore_changes = [value] }   # CI/CD owns this value after creation
}
```
The values also end up in the Terraform state, which is why the state stays local and git-ignored. Say this in the report.

**8d. RDS PostgreSQL** (`rds.tf`)
```hcl
resource "aws_db_subnet_group" "db" {
  name       = "campusshelf-db"
  subnet_ids = aws_subnet.private_db[*].id
}

resource "aws_db_instance" "db" {
  identifier              = "campusshelf-db"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t4g.micro"     # Free Tier class
  allocated_storage       = 20                 # Free Tier limit; no max_allocated_storage
  storage_type            = "gp2"
  storage_encrypted       = true
  db_name                 = "campusshelf"
  username                = "campusshelf"
  password                = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.db.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  publicly_accessible     = false
  multi_az                = false              # Multi-AZ is not in the Free Tier
  backup_retention_period = 7
  performance_insights_enabled = false
  monitoring_interval     = 0                  # no Enhanced Monitoring
  deletion_protection     = false              # CEA only, so destroy works
  skip_final_snapshot     = true               # no snapshot left behind after destroy
  apply_immediately       = true
}
```
Do not use `manage_master_user_password = true`: it creates a Secrets Manager secret, which is charged.

**8e. IAM roles** (`iam.tf`, least privilege)

| Role | Permissions |
|---|---|
| `campusshelf-nat` | `AmazonSSMManagedInstanceCore` only |
| `campusshelf-web` | `AmazonSSMManagedInstanceCore`; `AmazonEC2ContainerRegistryReadOnly`; `logs:CreateLogStream`, `logs:PutLogEvents` on `/campusshelf/web`; `ssm:GetParameter` on `/campusshelf/image_tag`; `ec2:DescribeInstances` (read-only, for discovery) |
| `campusshelf-app` | `AmazonSSMManagedInstanceCore`; `AmazonEC2ContainerRegistryReadOnly`; logs on `/campusshelf/api`; `ssm:GetParameter` on `/campusshelf/*`; `autoscaling:SetInstanceHealth` on the app ASG only |
| `campusshelf-github-deploy` | Created in Step 11 |

The containers cannot use these roles: IMDSv2 with a hop limit of 1 (set in the launch templates) blocks the extra network hop that a container needs to reach the metadata service. The application itself needs no AWS permissions.

**Done when:** RDS shows "Publicly accessible: No" and "Multi-AZ: No", `sg-rds` allows 5432 only from `sg-app`, and the three parameters exist.

**Evidence:** all five security groups (inbound and outbound tabs); RDS configuration page (encryption, public access, subnet group, backups); ECR repositories with scan on push; Parameter Store list (values hidden).

---

## Step 9: Compute, first manual deployment and private access (R2, R3, R7)

Files: `compute.tf`, `templates/web-user-data.sh.tftpl`, `templates/app-user-data.sh.tftpl`, `monitoring.tf` (log groups)

**Do**

**9a. Log groups** (create them in Terraform so retention is set from the start):
```hcl
resource "aws_cloudwatch_log_group" "web" {
  name              = "/campusshelf/web"
  retention_in_days = 7
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/campusshelf/api"
  retention_in_days = 7
}
```

**9b. Launch templates** (one for web, one for app; same settings apart from role, SG and user data):
```hcl
resource "aws_launch_template" "app" {
  name_prefix   = "campusshelf-app-"
  image_id      = data.aws_ssm_parameter.al2023.value
  instance_type = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile { name = aws_iam_instance_profile.app.name }

  credit_specification { cpu_credits = "standard" }
  metadata_options {
    http_tokens                 = "required"   # IMDSv2 only
    http_put_response_hop_limit = 1            # containers cannot reach instance credentials
    instance_metadata_tags      = "enabled"
  }
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 8
      volume_type = "gp3"
      encrypted   = true
    }
  }
  user_data = base64encode(templatefile("${path.module}/templates/app-user-data.sh.tftpl", {
    region       = var.region
    ecr_registry = split("/", aws_ecr_repository.api.repository_url)[0]
    db_host      = aws_db_instance.db.address
    asg_name     = "campusshelf-app"
  }))
  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "campusshelf-app", Tier = "app" }
  }
}
```

**9c. App user data** (`templates/app-user-data.sh.tftpl`). In a `.tftpl` file, Terraform fills `${...}`. Plain shell variables are written without braces (`$TAG`), or as `$${VAR}` when braces are needed.
```bash
#!/bin/bash
# No "set -x" here: tracing would copy secret-handling commands into the instance console log
set -euo pipefail
REGION="${region}"
REGISTRY="${ecr_registry}"

dnf install -y docker
systemctl enable --now docker

param()  { aws ssm get-parameter --region "$REGION" --name "$1" --query Parameter.Value --output text; }
secret() { aws ssm get-parameter --region "$REGION" --name "$1" --with-decryption --query Parameter.Value --output text; }

TAG=$(param /campusshelf/image_tag)
IMAGE="$REGISTRY/campusshelf-api:$TAG"

# Secrets go to tmpfs (/run), readable by root only, never into user data or the image
install -d -m 700 /run/campusshelf
cat > /run/campusshelf/api.env <<EOF
NODE_ENV=production
PORT=3000
DB_HOST=${db_host}
DB_PORT=5432
DB_NAME=campusshelf
DB_USER=campusshelf
DB_PASSWORD=$(secret /campusshelf/db_password)
DB_SSL=true
JWT_SECRET=$(secret /campusshelf/jwt_secret)
EOF
chmod 600 /run/campusshelf/api.env

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker pull "$IMAGE"

LOGOPTS="--log-driver awslogs --log-opt awslogs-region=$REGION --log-opt awslogs-group=/campusshelf/api --log-opt mode=non-blocking"

# Migrations: safe to run on every boot (advisory lock, already-applied migrations are skipped)
docker run --rm --env-file /run/campusshelf/api.env $LOGOPTS "$IMAGE" node src/migrate.js

docker run -d --name api --restart unless-stopped -p 3000:3000 \
  --env-file /run/campusshelf/api.env $LOGOPTS "$IMAGE"

# Readiness gate: if the API cannot reach the database, tell the ASG to replace this instance
for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:3000/health/db; then exit 0; fi
  sleep 5
done
INSTANCE_ID=$(ec2-metadata --instance-id | cut -d' ' -f2)
aws autoscaling set-instance-health --region "$REGION" --instance-id "$INSTANCE_ID" --health-status Unhealthy
```

**9d. Web user data and service discovery** (`templates/web-user-data.sh.tftpl`)
```bash
#!/bin/bash
set -euxo pipefail
REGION="${region}"
REGISTRY="${ecr_registry}"

dnf install -y docker
systemctl enable --now docker

TAG=$(aws ssm get-parameter --region "$REGION" --name /campusshelf/image_tag --query Parameter.Value --output text)
IMAGE="$REGISTRY/campusshelf-web:$TAG"
install -d /opt/campusshelf/upstream

# Discovery script: list running app instances and rewrite the Nginx upstream file
cat > /usr/local/bin/discover-app.sh <<'EOS'
#!/bin/bash
set -euo pipefail
REGION="$1"; ASG="$2"
OUT=/opt/campusshelf/upstream/app-upstream.inc
IPS=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:aws:autoscaling:groupName,Values=$ASG" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].PrivateIpAddress' --output text)
TMP=$(mktemp)
if [ -z "$IPS" ]; then
  echo "server 127.0.0.1:65535;  # no app instances yet: Nginx returns 502" > "$TMP"
else
  for ip in $IPS; do echo "server $ip:3000 max_fails=1 fail_timeout=15s;"; done | sort > "$TMP"
fi
if ! cmp -s "$TMP" "$OUT"; then
  mv "$TMP" "$OUT"; chmod 644 "$OUT"
  docker exec web nginx -s reload 2>/dev/null || true
else
  rm -f "$TMP"
fi
EOS
chmod +x /usr/local/bin/discover-app.sh
/usr/local/bin/discover-app.sh "$REGION" "${app_asg_name}"

cat > /etc/systemd/system/discover-app.service <<EOF
[Service]
Type=oneshot
ExecStart=/usr/local/bin/discover-app.sh $REGION ${app_asg_name}
EOF
cat > /etc/systemd/system/discover-app.timer <<EOF
[Timer]
OnBootSec=30
OnUnitActiveSec=20
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now discover-app.timer

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker pull "$IMAGE"
docker run -d --name web --restart unless-stopped -p 80:80 \
  -v /opt/campusshelf/upstream:/etc/nginx/upstream:ro \
  --log-driver awslogs --log-opt awslogs-region="$REGION" \
  --log-opt awslogs-group=/campusshelf/web --log-opt mode=non-blocking \
  "$IMAGE"
```
Pass `app_asg_name = "campusshelf-app"` to this template. This is free service discovery: no Cloud Map, no Route 53, no internal load balancer.

**9e. Auto Scaling Groups** (`compute.tf`)
```hcl
resource "aws_autoscaling_group" "app" {
  name                = "campusshelf-app"
  vpc_zone_identifier = aws_subnet.private_app[*].id
  min_size            = local.asg_min
  max_size            = local.asg_max
  desired_capacity    = local.asg_min
  health_check_type         = "EC2"
  health_check_grace_period = 240
  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }
  instance_maintenance_policy {
    min_healthy_percentage = 100
    max_healthy_percentage = 200
  }
  lifecycle { ignore_changes = [desired_capacity] }   # scaling policies own it
  depends_on = [aws_route.app_default, aws_db_instance.db]
}

resource "aws_autoscaling_group" "web" {
  name                = "campusshelf-web"
  vpc_zone_identifier = aws_subnet.private_app[*].id
  min_size            = local.asg_min
  max_size            = local.asg_max
  desired_capacity    = local.asg_min
  health_check_type         = local.alb_on ? "ELB" : "EC2"
  health_check_grace_period = 180
  target_group_arns         = local.alb_on ? [aws_lb_target_group.web[0].arn] : []
  launch_template {
    id      = aws_launch_template.web.id
    version = "$Latest"
  }
  instance_maintenance_policy {
    min_healthy_percentage = 100
    max_healthy_percentage = 200
  }
  lifecycle { ignore_changes = [desired_capacity] }
  depends_on = [aws_route.app_default]
}
```
Both ASGs use both private app subnets, so scale-out places instances in two AZs.

**9f. Session scripts** (`scripts/session-up.sh`, `scripts/session-down.sh`)

```bash
./scripts/session-up.sh            # start RDS if stopped, NAT running, both ASGs min 1 / max 2 (no ALB)
./scripts/session-up.sh --alb      # same, plus the public ALB (from Step 10 onwards)
./scripts/session-down.sh          # ASGs to 0, NAT stopped, ALB removed
./scripts/session-down.sh --stop-db   # Free account plan: also stop RDS (it restarts by itself after 7 days)
```
Both scripts run `terraform apply` with the right `session_active` / `enable_alb` values and append a line to `docs/session-log.md`, which is your record of session hours.

**9g. First manual deployment**

Order matters on the very first deployment:
```bash
cd infrastructure && terraform init && terraform apply -var session_active=false && cd ..
./scripts/manual-push.sh        # builds both images (linux/amd64) and pushes them as tag manual-1
./scripts/session-up.sh         # now the instances boot and pull manual-1
```
Terraform writes `manual-1` to `/campusshelf/image_tag`, and the instances read that parameter at boot, so the images must exist before the ASGs start instances.

**9h. Reach the private app without an ALB** (free, no public IP, no SSH)
```bash
./scripts/port-forward.sh web     # open http://localhost:8080 (Session Manager to a web instance)
./scripts/port-forward.sh db      # psql on localhost:15432, through an app instance
SEED_DEMO_PASSWORD=<choose one> ./scripts/seed-cloud.sh   # demo data in RDS (SSM Run Command)
```
The database forward works because the connection to RDS starts from the app instance, which is in `sg-app`. Port forwarding needs the Session Manager plugin for the AWS CLI.

**Done when:** both ASGs show 1 healthy instance, the CloudWatch log groups have streams, the migration log line "migrations complete" appears in `/campusshelf/api`, and the app works through port forwarding.

**Evidence:** ASG list and instances (both tiers); launch template details (IMDSv2, standard credits); ECR image list with `manual-1`; the migration log line; the app in the browser through port forwarding.

---

## Step 10: Load balancer, scaling policies and alarms (R7, R9 monitoring)

Files: `alb.tf`, `compute.tf` (policies), `monitoring.tf`, `budget.tf`

From now on start sessions with `./scripts/session-up.sh --alb`.

**Do**

**10a. Application Load Balancer** (`alb.tf`, everything has `count = local.alb_on ? 1 : 0`)
- Internet-facing, both public subnets, `sg-alb`, `drop_invalid_header_fields = true`.
- Target group: type `instance`, port 80, HTTP, health check `/healthz`, matcher `200`, interval 15 s, healthy threshold 2, unhealthy threshold 3, deregistration delay 30 s.
- Listener on port 80 forwarding to the target group. HTTPS on 443 only if you own a domain (ACM certificates are free, but a Route 53 hosted zone is not, so use your registrar's DNS). Otherwise list it as a limitation.
- Output `alb_dns_name`.

**10b. Target tracking scaling** (one per ASG, only while a session is active):
```hcl
resource "aws_autoscaling_policy" "app_cpu" {
  count                  = var.session_active ? 1 : 0
  name                   = "campusshelf-app-cpu50"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  estimated_instance_warmup = 180
  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 50
  }
}
```
Repeat for the web ASG. Keep **basic monitoring** (5-minute metrics). Detailed monitoring is charged. Each target-tracking policy creates 2 alarms automatically, so 2 policies use 4 alarms.

**10c. Custom alarms** (`monitoring.tf`), sent to an SNS topic with an email subscription (confirm the email):
1. `UnHealthyHostCount > 0` on the target group for 2 periods (only when the ALB is on)
2. App ASG `CPUUtilization > 80%` for 2 periods of 5 minutes
3. RDS `CPUUtilization > 80%` for 2 periods
4. RDS `FreeStorageSpace < 2 GB`

Total: 4 + 4 = **8 alarms**, inside the 10 free alarms. Do not add more without removing one.

**10d. Budget in code** (`budget.tf`):
```hcl
resource "aws_budgets_budget" "monthly" {
  name         = "campusshelf-monthly"
  budget_type  = "COST"
  limit_amount = var.budget_limit_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 1
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
```

**Done when:** the target group shows the web instance as healthy, the ALB DNS name opens CampusShelf, a login works, and the SNS subscription is confirmed.

**Evidence:** ALB listener and target group with healthy targets; the app in the browser with the ALB DNS in the address bar; scaling policies on both ASGs; the alarm list; the budget.

---

## Step 11: CI/CD with GitHub Actions (Phase 6, R5, R6, R8)

**Do**

**11a. AWS trust for GitHub (no long-lived keys)** (`iam.tf`)
```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # Jobs that use "environment: production" present this subject, not the branch ref
      values   = ["repo:${var.github_repo}:environment:production"]
    }
  }
}
```
**Important:** when a job uses `environment: production`, GitHub's token subject is `repo:<owner>/<repo>:environment:production`. A trust policy for `ref:refs/heads/main` would reject it. Branch protection comes from the environment's deployment-branch rule (11b).

Permissions for `campusshelf-github-deploy`:
- `ecr:GetAuthorizationToken` on `*`
- `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`, `ecr:BatchGetImage`, `ecr:DescribeImages` on the two repository ARNs only
- `ssm:GetParameter`, `ssm:PutParameter` on `/campusshelf/image_tag` only
- `autoscaling:StartInstanceRefresh` on the two ASG ARNs only
- `autoscaling:DescribeAutoScalingGroups`, `autoscaling:DescribeInstanceRefreshes` on `*` (describe actions cannot be scoped)

**11b. GitHub settings**
- Settings, then Environments, then `production`: required reviewer (you or a group member), deployment branches limited to `main`.
- Settings, then Secrets and variables, then Actions, then **Variables**: `AWS_REGION=ap-south-1`, `AWS_DEPLOY_ROLE_ARN=<output>`, `APP_URL=http://<alb-dns>` (leave it empty while the ALB is off). These are not sensitive. **No AWS secret is stored in GitHub.**
- Branch protection on `main`: require a pull request and the `test-api`, `test-web` and `build-images` checks.

**11c. `scripts/wait-instance-refresh.sh`**
```bash
#!/bin/bash
# Usage: wait-instance-refresh.sh <asg-name>
set -euo pipefail
ASG="$1"
ID=$(aws autoscaling start-instance-refresh --auto-scaling-group-name "$ASG" \
  --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":180}' \
  --query InstanceRefreshId --output text)
echo "Instance refresh $ID started on $ASG"
for i in $(seq 1 60); do
  STATUS=$(aws autoscaling describe-instance-refreshes --auto-scaling-group-name "$ASG" \
    --instance-refresh-ids "$ID" --query 'InstanceRefreshes[0].Status' --output text)
  echo "$ASG: $STATUS"
  case "$STATUS" in
    Successful) exit 0 ;;
    Failed|Cancelled|RollbackSuccessful|RollbackFailed) exit 1 ;;
  esac
  sleep 20
done
echo "Timed out waiting for $ASG"; exit 1
```

**11d. `.github/workflows/ci-cd.yml`**
```yaml
name: CI/CD

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Existing image tag (commit SHA) to redeploy, for a manual rollback"
        required: false

permissions:
  contents: read

jobs:
  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: campusshelf_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 5s --health-timeout 5s --health-retries 10
    defaults:
      run:
        working-directory: api
    env:
      NODE_ENV: test
      DB_HOST: localhost
      DB_PORT: 5432
      DB_NAME: campusshelf_test
      DB_USER: test
      DB_PASSWORD: test
      DB_SSL: "false"
      JWT_SECRET: ci-only-value-not-a-real-secret
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: api/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run migrate          # proves the migration chain on an empty database
      - run: npm test -- --coverage

  test-web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run
      - run: npm run build
        env:
          VITE_API_BASE_URL: /api

  build-images:
    if: github.event_name == 'pull_request'
    needs: [test-api, test-web]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t campusshelf-api:pr api
      - run: docker build -t campusshelf-web:pr --build-arg VITE_API_BASE_URL=/api web

  deploy:
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    needs: [test-api, test-web]
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: production-deploy
      cancel-in-progress: false
    permissions:
      contents: read
      id-token: write
    env:
      AWS_REGION: ${{ vars.AWS_REGION }}
      INPUT_TAG: ${{ inputs.image_tag }}
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Choose the image tag
        id: tag
        run: |
          if [ -n "$INPUT_TAG" ]; then
            echo "tag=$INPUT_TAG" >> "$GITHUB_OUTPUT"; echo "build=false" >> "$GITHUB_OUTPUT"
          else
            echo "tag=$GITHUB_SHA" >> "$GITHUB_OUTPUT"; echo "build=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Build and push images (tagged with the commit SHA)
        if: steps.tag.outputs.build == 'true'
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
          TAG: ${{ steps.tag.outputs.tag }}
        run: |
          docker build -t $REGISTRY/campusshelf-api:$TAG api
          docker build -t $REGISTRY/campusshelf-web:$TAG --build-arg VITE_API_BASE_URL=/api web
          docker push $REGISTRY/campusshelf-api:$TAG
          docker push $REGISTRY/campusshelf-web:$TAG

      - name: Record the previous tag and publish the new one
        id: release
        env:
          TAG: ${{ steps.tag.outputs.tag }}
        run: |
          PREV=$(aws ssm get-parameter --name /campusshelf/image_tag --query Parameter.Value --output text)
          echo "prev=$PREV" >> "$GITHUB_OUTPUT"
          aws ssm put-parameter --name /campusshelf/image_tag --value "$TAG" --overwrite
          DESIRED=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names campusshelf-app \
            --query 'AutoScalingGroups[0].DesiredCapacity' --output text)
          echo "active=$([ "$DESIRED" -gt 0 ] && echo true || echo false)" >> "$GITHUB_OUTPUT"

      - name: Roll out (app tier first, then web tier)
        if: steps.release.outputs.active == 'true'
        run: |
          chmod +x scripts/wait-instance-refresh.sh
          scripts/wait-instance-refresh.sh campusshelf-app
          scripts/wait-instance-refresh.sh campusshelf-web

      - name: Post-deploy health check
        if: steps.release.outputs.active == 'true' && vars.APP_URL != ''
        run: |
          curl --fail --silent --show-error --retry 10 --retry-delay 10 --retry-all-errors \
            "${{ vars.APP_URL }}/api/health/db"

      - name: Roll back to the previous tag
        if: failure() && steps.release.outputs.prev != ''
        env:
          PREV: ${{ steps.release.outputs.prev }}
        run: |
          aws ssm put-parameter --name /campusshelf/image_tag --value "$PREV" --overwrite
          chmod +x scripts/wait-instance-refresh.sh
          scripts/wait-instance-refresh.sh campusshelf-app || true
          scripts/wait-instance-refresh.sh campusshelf-web || true
          echo "### Rolled back to $PREV" >> "$GITHUB_STEP_SUMMARY"

      - name: Deployment summary
        if: success()
        run: |
          {
            echo "### Deployed ${{ steps.tag.outputs.tag }}"
            echo "- Previous tag: ${{ steps.release.outputs.prev }}"
            echo "- Session active: ${{ steps.release.outputs.active }}"
          } >> "$GITHUB_STEP_SUMMARY"
```
Notes:
- `inputs.image_tag` goes through an environment variable, not straight into the shell script, to avoid script injection.
- If the stack is asleep, the job still pushes images and updates the tag, and the next `session-up.sh` boots the new version. Run real deployments during a session.
- A failed instance refresh, an unhealthy app instance (the readiness gate in 9c) or a failed health check all trigger the rollback step.

**11e. Test the pipeline with real changes**
1. Open a pull request with a small visible change (for example the footer text "CampusShelf v1.1"). Check that `test-api`, `test-web` and `build-images` run.
2. Merge it. Approve the `production` deployment. Watch the refresh and the health check.
3. **Rollback test:** push a commit that breaks the database connection (for example, change the health query in `/health/db` to `SELECT * FROM missing_table`). The readiness gate marks the new app instance unhealthy, the refresh fails, and the workflow rolls back. Revert the commit afterwards.

**Done when:** a PR runs the checks, a merge to `main` deploys SHA-tagged images, the change is visible on the ALB URL, and the broken commit is rolled back automatically.

**Evidence:** the green workflow run (all jobs); the rollback run with its summary; ECR tags showing SHAs; ASG "Instance refresh" history; before and after screenshots of the visible change; the IAM role trust policy.

**Rollback** (for the report): automatic rollback restores the previous tag when a deployment fails. Manual rollback is `workflow_dispatch` with `image_tag=<old SHA>`, which needs no rebuild because tags are immutable.

---

## Step 12: Reliability and scaling tests (R7)

**Do**
1. **Traffic distribution:** set both ASGs to desired 2 for a few minutes (`aws autoscaling set-desired-capacity --auto-scaling-group-name campusshelf-web --desired-capacity 2`). Show two healthy targets in two AZs. Refresh the app several times; the access logs in `/campusshelf/web` show both instances serving. Set it back to 1.
2. **Self-healing:** terminate the web instance from the EC2 console. The target becomes unhealthy, the ASG launches a replacement, and it becomes healthy. Do the same for the app instance and show that the web tier's upstream file picks up the new IP within about 20 seconds.
3. **Scaling:** run a load test against the API through the ALB:
   ```bash
   hey -z 10m -c 40 "http://<alb-dns>/api/books?search=the&page=1"
   ```
   With basic monitoring, the scale-out alarm needs about 2 periods of 5 minutes. Watch ASG "Activity" for the launch. After the test, wait about 15 minutes for the scale-in. If CPU does not reach 50%, lower the target to 25% for the demo and say so in the report.
4. **Latency:** keep the `hey` summary (requests/second, average, p50, p95, p99) for the Performance NFR. Also record one short run at `-c 5` as the "normal load" baseline.

**Cost cautions for this step**
- Keep load tests short (10 minutes). On a legacy account, standard-credit instances slow down instead of charging, which is fine.
- RDS T-class instances run in Unlimited mode. Long, heavy load could create small CPU credit charges, so do not run long tests against the database.
- Two extra instances for 30 minutes use 1 hour of your 750. Log it.

**Done when:** you have screenshots of two healthy targets, a replaced instance, a scale-out event and the following scale-in.

**Evidence:** those screenshots, the CloudWatch CPU graph during the test, and the `hey` output.

---

## Step 13: Cloud-native enhancements and cost (R9)

The plan chooses three enhancements. You need at least one, so three is safe.

**Do**
1. **Infrastructure as code:** the Terraform folder. Put the `terraform plan` output for a `session_active=false` change in the report: it shows the NAT instance stopping and both ASGs going to 0 from one variable.
2. **Centralised logging and monitoring:** log groups with retention, alarms, SNS email. Show a log stream with JSON request logs, and trigger one alarm on purpose (for example, terminate the web instance with the ALB on, so `UnHealthyHostCount` fires) and screenshot the email.
3. **Cost estimate:** in the AWS Pricing Calculator (region Asia Pacific (Mumbai)), add each service at **list price, running 24/7**: 3 EC2 instances of your type, 24 GB gp3, 2 public IPv4 for the ALB plus 1 for the NAT instance, the ALB (1 LCU), RDS `db.t4g.micro` Single-AZ with 20 GB gp2, ECR 0.5 GB, CloudWatch logs 1 GB, 1 GB data transfer out. Save the estimate and screenshot the summary. This is what the system would cost without the Free Tier.
4. **Cost comparison table** for the report. Fill in the numbers from your own calculator estimate:

| Choice | Paid alternative | Saving per month (from the calculator) |
|---|---|---|
| NAT instance (Free Tier EC2) | NAT Gateway (hourly charge + per-GB processing) | |
| EC2 Auto Scaling Groups | ECS Fargate (2 tasks per tier, 0.25 vCPU / 0.5 GB) | |
| Parameter Store SecureString | Secrets Manager (2 secrets) | |
| ALB only during sessions with `enable_alb` | ALB 24/7 | |
| Session switch (about 7 h/day) | All instances 24/7 | |
| Single-AZ RDS | Multi-AZ RDS | |
| 7-day log retention, ECR lifecycle (5 images) | Never-expiring logs and images | |

   Pick at least **two** as your formal "cost optimisation measures" (the NAT instance and the session switch give the largest savings), and mention the rest.
5. **Actual cost:** at the end of the project, screenshot Billing (Bills page and Free Tier or Credits page). Legacy: the total should be USD 0.00 apart from the ALB public IPv4 cents described in plan section 2.4. Free plan: credits only.
6. **Optional extra enhancement (S3 backups):** a nightly `pg_dump` from an app instance to a private, encrypted S3 bucket with a 7-day lifecycle rule, reached through an **S3 gateway VPC endpoint** (gateway endpoints are free; interface endpoints are not). Keep the dumps tiny so you stay inside the free S3 storage.

**Done when:** the estimate, the comparison table and the actual-cost screenshot are in the report.

**Evidence:** Pricing Calculator summary; Billing and Free Tier/Credits pages; the alarm email.

---

## Step 14: Architecture diagram (Deliverable 1)

**Do**

Draw it in draw.io or Excalidraw (use the official AWS icon set) and export it as PNG to `docs/architecture-diagram.png`. It must show:
- Internet, IGW, the ALB in the two public subnets, and the NAT instance in public subnet A
- Two AZs, each with a public subnet, a private app subnet and a private DB subnet, with CIDRs
- Web ASG (Nginx container) and app ASG (Express container) spanning both private app subnets
- RDS PostgreSQL in the DB subnets, with no internet path
- Security boundaries: dashed boxes for `sg-alb`, `sg-web`, `sg-app`, `sg-rds`, `sg-nat`, with ports on each arrow (80, 3000, 5432 TLS, 443 out)
- The outbound path: private subnets, then the NAT instance, then the IGW (labelled "ECR pulls, OS packages, SSM, CloudWatch")
- The discovery arrow: web hosts read app instance IPs from the EC2 API
- The CI/CD flow: GitHub Actions, then OIDC role, then ECR (push `:sha`), then Parameter Store (`image_tag`), then ASG instance refresh
- Parameter Store, CloudWatch Logs/alarms, SNS email, Budgets, and Session Manager for admin access
- A small legend: "Free Tier: no NAT Gateway, no Fargate, no Secrets Manager"

**Done when:** someone who has never seen the project can follow a request from the browser to the database, and a deployment from `git push` to new instances.

---

## Step 15: Deployment evidence checklist (Deliverable 2)

Collect these screenshots, each with a short caption. Put the account ID and any keys out of view first.

- [ ] Account plan, budget and Free Tier alerts
- [ ] VPC and CIDR
- [ ] Public, private app and private DB subnets (both AZs)
- [ ] Route tables (IGW route, NAT instance route, DB table with local route only) and the IGW
- [ ] NAT instance (source/destination check disabled)
- [ ] Auto Scaling Groups, instances, launch template (IMDSv2, standard credits)
- [ ] ECR repositories, SHA image tags, scan results
- [ ] Security groups (all five, inbound and outbound)
- [ ] ALB listener, target group, healthy targets
- [ ] RDS: subnet group, encryption, public access "No", Single-AZ, backups
- [ ] Parameter Store parameter list (values hidden)
- [ ] CloudWatch log stream, alarm list and one alarm email
- [ ] Successful GitHub Actions run, and the rollback run
- [ ] Browser screenshot of the app on the ALB URL
- [ ] Test output (Jest coverage, Playwright report, `hey` results)
- [ ] Billing page at the end (USD 0.00 or credits only)

**Tip:** take each screenshot at the moment you finish its step. Recreating an old state later costs session hours.

---

## Step 16: Testing evidence

**Do**
1. **API tests in CI:** the `test-api` job log and coverage summary. These are real backend tests against PostgreSQL, a clear improvement over a compile-only check.
2. **End-to-end tests** (`e2e/`, Playwright) against the ALB:
   ```bash
   cd e2e && npm ci && npx playwright install --with-deps chromium
   BASE_URL=http://<alb-dns> npx playwright test --reporter=html
   ```
   Cover: login for each role; invalid login shows an error; a member borrows and returns a book; a member is redirected away from librarian pages; a librarian creates a book and sees it in the catalogue; the SPA route `/loans` loads directly (proves the Nginx `try_files` fallback).
3. **Smoke checks:**
   ```bash
   curl -i http://<alb-dns>/api/health
   curl -i http://<alb-dns>/api/health/db
   curl -s "http://<alb-dns>/api/books?search=data" | head -c 300
   ```
4. **Negative security checks** (good evidence for R8):
   - `curl --max-time 5 http://<app-instance-private-ip>:3000` from your laptop times out (no public route).
   - `nc -vz <rds-endpoint> 5432` from your laptop fails.
   - `curl http://<alb-dns>/api/books -X POST` without a token returns 401.

**Done when:** the Playwright run against the ALB passes, and you have the report and the smoke outputs.

---

## Step 17: The report (Deliverable 4, 4 to 6 pages)

Use the 14 sections from plan Phase 10. Page budget (approximate):

| # | Section | Pages |
|---|---|---|
| 1 | Introduction and problem | 0.3 |
| 2 | Application overview | 0.3 |
| 3 | Cloud provider, region and Free Tier strategy | 0.5 |
| 4 | Three-tier architecture and network (include diagram) | 0.8 |
| 5 | Containerisation (Dockerfiles, Nginx, compose) | 0.4 |
| 6 | Database and migrations (TLS, node-pg-migrate, advisory lock) | 0.3 |
| 7 | Registry and CI/CD workflow (instance refresh, rollback) | 0.6 |
| 8 | Security controls (SGs, IAM, Parameter Store, OIDC, IMDSv2) | 0.5 |
| 9 | Load balancing, scaling, reliability | 0.5 |
| 10 | Enhancements and cost (comparison table) | 0.4 |
| 11 | Testing and deployment evidence (screenshots) | 0.5 |
| 12 | **NFR justification** (see below) | **1.0** |
| 13 | Limitations and future improvements | 0.4 |
| 14 | Conclusion | 0.2 |

Put most screenshots in an appendix if the page limit allows it. Otherwise pick the strongest ones.

### Section 12: NFR justification (the part most likely to lose marks)

For each NFR, write three things: **the decision**, **the mechanism**, and **the evidence**. Tie each one to a real choice in your build. Use this table as the skeleton:

| NFR | Decision in your build | Evidence to cite |
|---|---|---|
| Scalability | Stateless containers (JWT); separate web and app ASGs; ALB distribution; row-locked borrowing, safe with many app instances | Two healthy targets; ASG activity; borrow race test |
| Availability / Reliability | Two AZs; ALB and ASG health checks; readiness gate marks broken instances unhealthy; self-healing; RDS backups | Replacement screenshot; health check config; RDS backups |
| Elasticity | Target tracking on CPU 50% (scale out and in); session switch scales to zero | Scale-out and scale-in events; `terraform plan` for `session_active=false` |
| Security | Only the ALB is public; SG chain with restricted egress; no SSH; IMDSv2 hop limit 1; Parameter Store SecureString; TLS to RDS; OIDC role limited to one environment; immutable tags; required reviewer | SG screenshots; RDS public access "No"; trust policy; negative tests |
| Maintainability / Deployability | Docker; Terraform; CI on every PR; SHA-tagged immutable releases through instance refresh; automatic and manual rollback | Green run; rollback run; refresh history |
| Performance / Latency | Mumbai region; Nginx static serving with gzip and caching; keep-alive upstream; DB indexes; connection pool | `hey` p50/p95; browser timings |
| Cost-Efficiency | Free Tier design: NAT instance, EC2 instead of Fargate, Parameter Store, ALB only when needed, session switch, short log retention, ECR lifecycle | Calculator comparison; Billing USD 0.00 / credits only |
| Portability | Same images in Compose and AWS; standard PostgreSQL; config only through environment variables; Nginx upstream file is provider-neutral | `docker compose up` screenshot; repo structure |

**Known limitations** (state them honestly; the CEA asks for this and markers reward it):
- Single region: no cross-region disaster recovery.
- One NAT instance in one AZ: if it fails, private outbound traffic stops (deployments, logs). Improvement: NAT Gateways per AZ, or an ASG of 1 for the NAT instance.
- Single-AZ RDS: the database is a single point of failure. Improvement: Multi-AZ (not in the Free Tier).
- Burstable instances in standard credit mode slow down under sustained load; RDS T-class runs in Unlimited mode.
- The stack sleeps outside sessions, so it is not available 24/7 (deliberate cost trade-off).
- HTTP only without a domain.
- Polling-based service discovery has up to about 20 seconds of delay.
- Rate limits are per instance (in memory). Improvement: a shared store such as Redis or ElastiCache.
- Basic 5-minute metrics, no memory metrics.
- Instance-refresh deployments take 5 to 10 minutes.
- Secrets rotation is manual, and the Terraform state contains the DB password.

---

## Step 18: Final checklist before submission

**Source files (Deliverable 3)**
- [ ] `api/Dockerfile`, `api/.dockerignore`
- [ ] `web/Dockerfile`, `web/nginx/default.conf`, `web/nginx/app-upstream.inc`, `web/.dockerignore`
- [ ] Root `docker-compose.yml`
- [ ] `infrastructure/` Terraform folder with `terraform.tfvars.example` (no real values, no state files)
- [ ] `.github/workflows/ci-cd.yml` and `scripts/`
- [ ] Repository link (make sure the marker can open it)

**Definition of Done (from the plan)**
- [ ] App runs locally with `docker compose up --build`
- [ ] API tests pass in CI with coverage
- [ ] Images are in ECR with SHA tags
- [ ] VPC has public, private app and private DB layers in two AZs
- [ ] Web tier reachable only through the ALB
- [ ] App tier private, reachable only from the web tier
- [ ] PostgreSQL private, encrypted, TLS, migrations automatic
- [ ] No secrets in git, images, user data or logs (check `docker history`, the launch template user data, and the log streams)
- [ ] CI/CD tests, builds, pushes, deploys, verifies, rolls back
- [ ] Health checks, logs and at least one alarm email work
- [ ] Scaling and load balancing demonstrated
- [ ] Diagram and screenshots collected
- [ ] Report has the NFR section and the limitations

**Before you leave the project (do not skip this)**
- [ ] `cd infrastructure && terraform destroy` once evidence is captured (it also removes the ECR images and skips the final RDS snapshot)
- [ ] EC2 console, every region you touched: no instances, volumes, snapshots, Elastic IPs or load balancers left
- [ ] RDS console: no instances and no manual snapshots
- [ ] CloudWatch: no leftover log groups (destroy removes the Terraform-managed ones)
- [ ] Billing console: check again two days later, because charges appear with a delay
- [ ] Remove the GitHub variable `AWS_DEPLOY_ROLE_ARN` (the role no longer exists)

---

## Order of work (suggested timeline)

| Stage | Steps | Working time (estimate) |
|---|---|---|
| Account, guardrails, repo | 1, 3 | 0.5 day (plus up to a day waiting for a quota increase) |
| Build the application and tests | 2 | 3 to 5 days |
| Production readiness and containers | 4, 5, 6 | 1 to 2 days |
| Cloud foundation | 7, 8 | 2 days |
| Compute and first deployment | 9 | 1 to 2 days |
| ALB, scaling, alarms | 10 | 1 day |
| CI/CD | 11 | 1 to 2 days |
| Testing and scaling | 12, 16 | 1 day |
| Enhancements, cost, diagram | 13, 14 | 1 day |
| Evidence and report | 15, 17, 18 | 2 to 3 days |

Steps 1 to 6 cost nothing because they run on your laptop. Start the AWS session clock at Step 7, and sleep the stack every time you stop working.
