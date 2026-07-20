# CI/CD workflow templates

> **Why are these here and not in `.github/workflows/`?**
> These files were added via an automated GitHub App that does not hold the
> `workflows` permission, so it cannot write under `.github/workflows/`. Activate
> them yourself with one of the two steps below (a 30-second, one-time action).

## Activate the workflows

**Option A — from your workstation (recommended):**
```bash
git checkout feature/devops-automation      # or after merge: master
mkdir -p .github/workflows
cp deploy/ci-templates/github-workflows/*.yml .github/workflows/
git add .github/workflows
git commit -m "ci: activate CI, CodeQL and Trivy workflows"
git push
```

**Option B — GitHub web UI:** create each file under `.github/workflows/` and
paste the contents from `deploy/ci-templates/github-workflows/`.

> Alternatively, grant the Abacus.AI GitHub App the **workflows** permission
> (https://github.com/apps/abacusai/installations/select_target) and these can be
> committed directly into `.github/workflows/` in future.

## What each workflow does
| File | Purpose |
|------|---------|
| `ci.yml` | Backend lint/type/import, frontend build, container builds, shellcheck |
| `codeql.yml` | CodeQL static security analysis (Python + JS/TS) |
| `security-scan.yml` | Trivy dependency/IaC/image vulnerability scan |

`.github/dependabot.yml` and `.github/pull_request_template.md` are already in
place and need no activation.
