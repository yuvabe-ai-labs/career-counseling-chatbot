# Deploying to AWS Lambda

`staging` branch → `yuvanext-api-staging` Lambda function.
`main` branch → `yuvanext-api-prod` Lambda function.

Every push to either branch runs [.github/workflows/deploy.yml](../.github/workflows/deploy.yml):
typecheck → lint → test → migration validation → `pnpm build:lambda` → package →
deploy → smoke-test `/api/v1/health`. Auth to AWS is via GitHub's OIDC provider assuming an
IAM role — no AWS access keys are stored in GitHub at any point.

## 0. Rotate the credentials that were in `.env`

Before doing anything else: the AWS access key that used to sit in `.env` (and any other real
secret that file held — Supabase service-role key, SMTP password, etc.) should be treated as
compromised and rotated, regardless of this pipeline. None of them were committed to git, but
that key pair specifically isn't used anywhere in this codebase, so there's no reason to keep
it — deactivate it in IAM Console → Users → (the user) → Security credentials, and delete it
once you've confirmed nothing depends on it.

None of the steps below need that key. `bootstrap-aws.sh` uses your own AWS CLI credentials
(whatever admin profile you already use to manage this account), and the deploy pipeline itself
never uses a static key at all.

## 1. One-time AWS setup

Requires the AWS CLI, logged in as a profile with IAM + Lambda admin rights.

```bash
AWS_REGION=us-east-1 ./infra/bootstrap-aws.sh
```

This creates (idempotently — safe to re-run):

- A GitHub OIDC provider in IAM (shared across repos in the account, created once)
- `github-actions-yuvanext-deploy` — the role GitHub Actions assumes. Trusted **only** for
  `repo:yuvabe-ai-labs/career-counseling-chatbot` on the `staging` and `main` branches, and
  permitted **only** to update the two Lambda functions below (nothing else in the account)
- `yuvanext-api-lambda-exec` — the role the functions themselves run as (CloudWatch Logs only)
- `yuvanext-api-staging` and `yuvanext-api-prod` Lambda functions, Node.js 22.x, each with a
  placeholder handler that returns 503 until the first real deploy runs
- A public Function URL per function (the app does its own CORS via `CORS_ORIGIN`/helmet, so
  the Function URL itself is left permissive)

It prints the values you need for step 2 at the end; you can also re-read them any time with
`aws lambda get-function-url-config --function-name yuvanext-api-staging`, etc.

## 2. Configure the two GitHub Environments

In the repo: **Settings → Environments** → create `staging` and `production`.

For **production**, also add yourself (or the right team) under **Required reviewers** —
that pauses the workflow on a push to `main` until someone approves it, with no workflow changes
needed to get that; `staging` can deploy straight through.

Set these on **both** environments (values differ per environment — e.g. `staging`'s
`SUPABASE_URL` should point at a staging Supabase project if you have one, not production's):

**Variables** (Settings → Environments → _env_ → Environment variables — not secret, just
environment-scoped config):

| Name | Staging | Production |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | same value both envs — from bootstrap output | |
| `AWS_REGION` | same value both envs | |
| `LAMBDA_FUNCTION_NAME` | `yuvanext-api-staging` | `yuvanext-api-prod` |
| `LAMBDA_FUNCTION_URL` | from bootstrap output | from bootstrap output |
| `CORS_ORIGIN` | your staging frontend origin | your production frontend origin |
| `AI_PROVIDER` | `gemini` (or `anthropic` / `auto` / `disabled`) | |
| `GEMINI_MODEL` | e.g. `gemini-3.5-flash-lite` | |
| `ANTHROPIC_MODEL` | leave unset unless using Claude | |
| `SAFETY_SERVICE_URL` | leave unset (safety runs in-process) | |
| `SMTP_PORT` | `587` | |
| `SMTP_FROM` | `YuvaNext <noreply@yourdomain.com>` | |

**Secrets** (Settings → Environments → _env_ → Environment secrets):

| Name | Notes |
|---|---|
| `SUPABASE_URL` | |
| `SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | bypasses RLS — server-only |
| `DATABASE_URL` | Supabase pooler connection string |
| `INTERNAL_API_KEY` | 32+ random chars, used for the catalog-import internal routes |
| `GEMINI_API_KEY` | |
| `ANTHROPIC_API_KEY` | only if `AI_PROVIDER` uses Claude |
| `SMTP_HOST` | |
| `SMTP_USER` | |
| `SMTP_PASSWORD` | |

`NODE_ENV=production` and `COUNSELOR_RUNTIME=integrated` are set by the workflow itself for
both environments — "staging" here means a separate deployment, not degraded/fixture behavior.

## 3. Deploy

```bash
git push origin staging   # -> yuvanext-api-staging
git push origin main      # -> yuvanext-api-prod (pauses for review if you set required reviewers)
```

Watch it under the repo's **Actions** tab. On success the job's last step prints the
`/api/v1/health` response it got back from the newly deployed function.

## Notes

- **No `/docs` (Swagger UI) on Lambda.** `swagger-ui-express` serves static HTML/CSS/JS off
  disk, which doesn't survive being bundled into a single file — see the comment on
  `CreateAppOptions.docs` in [create-app.ts](../apps/api/src/app/create-app.ts). `/openapi.json`
  (pure JSON) still works; point an API client or a locally-run `pnpm dev` at `/docs` instead.
- **Rollback:** re-run the workflow on a previous commit (`git revert` + push, or re-run an old
  successful job from the Actions tab — it rebuilds and redeploys that commit's code), or use
  `aws lambda update-function-code --function-name <fn> --s3-bucket ... --s3-key ...` /
  `aws lambda list-versions-by-function` if you start publishing versions later. This pipeline
  intentionally keeps to `$LATEST` (no aliases/versions yet) to stay simple — worth revisiting
  once this is carrying real traffic.
- **Cold starts / DB connections:** [lambda.ts](../apps/api/src/lambda.ts) builds the app once
  per execution environment and reuses it (including the Postgres pool) across warm
  invocations, same idea as `server.ts` keeping one pool for the process lifetime. Under bursty
  traffic this can open more concurrent DB connections than a single always-on server would —
  worth watching Supabase's connection count if traffic grows; the pooler connection string
  already in `DATABASE_URL` is exactly what mitigates that.
