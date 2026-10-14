markdown
# HealthPulse — Secure Supply-Chain CI/CD & GitOps Platform

A production-grade, end-to-end DevSecOps platform demonstrating software supply-chain
security, GitOps delivery, and full-stack observability on Amazon EKS. The pipeline
builds, scans, signs, and deploys a containerized application with cryptographic
verification enforced at the cluster admission layer — guaranteeing that only images
produced and signed by this pipeline can ever run in production.

## Architecture Overview

This platform is built across three repositories, following the industry-standard
separation of concerns for GitOps:

| Repository | Responsibility |
|------------|----------------|
| `healthpulse-gha` | Application source + CI pipeline (build, scan, sign, push) |
| `healthpulse-gha-config` | Kubernetes manifests, ArgoCD Applications, Kyverno & ESO policies (GitOps source of truth) |
| `healthpulse-gha-infra` | Terraform IaC for the EKS platform, with PR-based plan review |

Developer → PR → CI (build/scan/sign) → ECR (signed image)
→ commit image tag to config repo
↓
ArgoCD (watches config repo) → EKS
↓
Kyverno (admission) → verifies cosign signature
↓ ↓
signed = ALLOWED unsigned = REJECTED


## Key Capabilities

### Software Supply-Chain Security
- **Immutable image tagging** by git commit SHA with digest-based deployment — no `:latest` in production.
- **Cosign image signing** in CI; signatures stored alongside images in Amazon ECR.
- **Kyverno admission policy** verifies cosign signatures against the public key before
  any pod is scheduled. Unsigned, tampered, or non-pipeline images are rejected at
  admission — closing the gap between "image passed CI" and "image running in cluster."
- Enforcement validated: the platform blocks unsigned deployments and permits only
  pipeline-signed artifacts.

### CI Pipeline (GitHub Actions)
A scan-before-publish gate ensures only verified images reach the registry:
- Unit tests
- **SonarCloud** static analysis + quality gate
- **Snyk** dependency scanning (fails on critical vulnerabilities)
- **Trivy** container image scanning (fails on critical CVEs)
- Container smoke test
- Build → sign (cosign) → push to ECR → GitOps handoff to the config repo

Defense-in-depth scanning: Snyk and Trivy run in tandem, catching vulnerabilities each
tool's database would miss independently.

### GitOps Delivery (ArgoCD)
- Pull-based GitOps: ArgoCD reconciles cluster state from the config repository.
- Path-based multi-environment promotion (dev / UAT / prod) via Kustomize overlays.
- Dev auto-syncs; UAT and production are gated behind pull-request promotion with
  manual sync for controlled, auditable releases.
- CI is fully decoupled from CD — the pipeline never touches the cluster directly.

### Infrastructure as Code (Terraform)
- Modular Terraform provisioning EKS, VPC, IAM, and IRSA roles.
- **Remote state** in S3 with DynamoDB state locking.
- **PR-based plan review**: pull requests trigger `terraform plan` with output posted
  to the PR for review; merge to main triggers `terraform apply`. Infrastructure
  changes are reviewed in context, with the full plan visible before approval.
- Dedicated, least-privilege IAM users per pipeline (build vs. infrastructure).

### Secrets Management
- **AWS Secrets Manager** as the central secret store.
- **External Secrets Operator (ESO)** syncs secrets into Kubernetes, authenticating
  via **IRSA** — no static credentials anywhere in the cluster.

### Observability (Three Pillars)
- **Metrics** — Prometheus + Grafana, with ServiceMonitors scraping application metrics
  and multi-window SLO burn-rate alerting.
- **Traces** — OpenTelemetry SDK instrumentation exporting distributed traces through
  the OpenTelemetry Collector to Splunk Observability Cloud.
- **Logs** — centralized log aggregation to Splunk via the OpenTelemetry Collector.

### Platform Engineering
- **Workload isolation** via taints, tolerations, and node selectors — monitoring
  workloads run on a dedicated, tainted node group, insulating the application tier.
- **Self-hosted runners** via Actions Runner Controller (ARC) — ephemeral runner pods
  for in-cluster CI execution.
- **AWS Load Balancer Controller** (IRSA-authenticated) for ingress.

## Technology Stack

**Cloud & Infra:** AWS (EKS, ECR, S3, DynamoDB, IAM, Secrets Manager, VPC), Terraform
**Containers & Orchestration:** Kubernetes, Docker, Helm, Kustomize
**CI/CD & GitOps:** GitHub Actions, Argo CD, Actions Runner Controller
**Supply-Chain Security:** Cosign, Kyverno, Trivy, Snyk, SonarCloud
**Secrets:** AWS Secrets Manager, External Secrets Operator, IRSA
**Observability:** Prometheus, Grafana, OpenTelemetry, Splunk Observability Cloud
**Languages:** Node.js, Bash, HCL, YAML

## Repository Structure (this repo)

healthpulse-gha/
├── app/backend/ # Application source, Dockerfile, OTel instrumentation
├── .github/workflows/ # CI pipeline (build, scan, sign, push, GitOps handoff)
└── README.md


## CI/CD Flow

1. Developer pushes to a feature branch.
2. CI runs tests, SonarCloud, Snyk, and Trivy; builds the image; runs a smoke test.
3. On passing all gates, the image is signed with cosign and pushed to ECR by digest.
4. CI commits the new image reference to the `healthpulse-gha-config` repository.
5. ArgoCD detects the change and reconciles the cluster.
6. Kyverno verifies the image signature at admission; only signed images are deployed.

## Security Model

- **No static credentials in-cluster** — all AWS access via IRSA/OIDC federation.
- **Least privilege** — scoped IAM roles per workload; dedicated CI users per concern.
- **Admission enforcement** — Kyverno guarantees runtime integrity independent of the
  supply path, defending against registry compromise, credential theft, and
  out-of-band deployments.
- **Encrypted state and secrets** — S3 state encryption, Secrets Manager at rest.

## Design Decisions

- **Three-repo separation (app / config / infra)** eliminates CI self-trigger loops,
  enforces least-privilege access boundaries, and makes the config repository's history
  a clean deployment audit trail.
- **Path-based GitOps** over branch-per-environment — avoids branch drift and keeps all
  environments auditable from a single branch.
- **Deploy-by-digest with signature verification** — tags are mutable; digests and
  signatures are not. Admission-time verification ensures the running image is exactly
  the one the pipeline produced and signed.

---

## Observability — Three Pillars

Full-stack observability across metrics, traces, and logs, unified through the
OpenTelemetry Collector as the vendor-neutral telemetry pipeline.

### Metrics — Prometheus & Grafana
- `kube-prometheus-stack` deployed via Helm, running on a dedicated, tainted
  monitoring node group (isolated from the application tier).
- Application metrics exposed via a `/metrics` endpoint and scraped through a
  **ServiceMonitor**.
- **Grafana** dashboards for cluster and application health.
- **SLO recording rules and multi-window burn-rate alerting** defined as
  PrometheusRules for reliability tracking against error budgets.

### Traces — OpenTelemetry → Splunk Observability
- Application instrumented with the **OpenTelemetry SDK** (auto-instrumentation of
  HTTP/Express), generating distributed traces with no manual per-route code.
- Traces exported via **OTLP** to the **OpenTelemetry Collector** running in-cluster.
- The Collector exports traces to **Splunk Observability Cloud** (signalfx exporter)
  for distributed tracing and APM.

### Logs — OpenTelemetry → Splunk
- Container and pod logs collected by the **OpenTelemetry Collector** (logs-collection
  preset with Kubernetes resource attribution).
- Logs shipped to **Splunk** for centralized aggregation, search, and analysis.
- The Collector authenticates to Splunk using an ingest token sourced from AWS Secrets
  Manager and synced into the cluster by the External Secrets Operator — no secret
  material in manifests or source control.

Application (OTel SDK) ──OTLP──► OpenTelemetry Collector ──► Splunk (traces + logs)
Application (/metrics) ──scrape─► Prometheus ──► Grafana (dashboards + SLO alerts)


## Self-Hosted CI Runners — Actions Runner Controller (ARC)

- **Actions Runner Controller (ARC)** deployed to the cluster, providing **ephemeral,
  in-cluster GitHub Actions runners** as pods — the Kubernetes-native equivalent of
  disposable build agents.
- A runner scale set (`healthpulse-runners`) registers to the repository and provisions
  runner pods on demand, tearing them down after each job for a clean, isolated build
  environment per run.
- ARC authenticates to GitHub using a fine-grained, repository-scoped token sourced from
  AWS Secrets Manager via the External Secrets Operator.
- Enables CI jobs that require in-cluster access (private resources, cluster operations)
  to run securely inside the VPC, while standard build/scan/sign stages run on
  GitHub-hosted runners — using each runner type where it fits.

*Built as a reference implementation of secure, GitOps-driven platform engineering on AWS.*
