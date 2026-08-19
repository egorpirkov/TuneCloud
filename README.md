# TuneCloud - Cloud-Native Music Platform ☁️🎵

<div align="center">
    <a href="https://www.docker.com/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/docker/docker-original-wordmark.svg" alt="docker" width="40" height="40"/>
    </a>
    <a href="https://www.nginx.com/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nginx/nginx-original.svg" alt="nginx" width="40" height="40"/>
    </a>
    <a href="https://www.postgresql.org/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/postgresql/postgresql-original.svg" alt="postgresql" width="40" height="40"/>
    </a>
    <a href="https://kubernetes.io/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/kubernetes/kubernetes-plain.svg" alt="kubernetes" width="40" height="40"/>
    </a>
    <a href="https://helm.sh/" target="_blank" rel="noreferrer">
        <img src="https://cdn.simpleicons.org/helm/white" alt="helm" width="40" height="40"/>
    </a>
    <a href="https://argo-cd.readthedocs.io/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/argocd/argocd-original.svg" alt="argocd" width="40" height="40"/>
    </a>
    <a href="https://prometheus.io/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/prometheus/prometheus-original.svg" alt="prometheus" width="40" height="40"/>
    </a>
    <a href="https://grafana.com/" target="_blank" rel="noreferrer">
        <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/grafana/grafana-original.svg" alt="grafana" width="40" height="40"/>
    </a>
</div>

---

**TuneCloud** is a self-hosted music browser and player built with Node.js, PostgreSQL, and React, with a strong focus on DevOps and cloud-native deployment.

## 🎯 Project Goals

The project was built to demonstrate practical DevOps workflows around a real application:

* Automated container builds and image publishing
* GitOps-based continuous delivery with ArgoCD
* Kubernetes orchestration with Helm
* Automated application deployments to a k3s cluster
* Application and database observability with Prometheus and Grafana
* Separation of application code and deployment configuration

---

## 📸 Interface & Architecture Visualization

![Скриншот интерфейса](pictures/screenshot.png)

![CI Pipeline](pictures/1.png)

![CD Pipeline & GitOps](pictures/2.png)

![Monitoring Stack](pictures/3.png)

![CI/CD Pipeline & Architecture](pictures/full.png)

---

## 🏗️ Cloud-Native Architecture & Kubernetes

The application is deployed on a **Kubernetes (k3s)** cluster using a custom **Helm Chart** stored in a separate GitOps repository.

### Kubernetes Resources

* **Compute**

  * `tunecloud-server`: Node.js backend API (Fastify)
  * `tunecloud-client`: Nginx serving the React SPA
  * `tunecloud-db`: PostgreSQL 16 database
  * `postgres-exporter`: PostgreSQL metrics exporter

* **Networking & Ingress**

  * ClusterIP and NodePort Services for internal and external communication
  * `ingress.yaml`: routes `tunecloud.local` to the client and `tunecloud.local/api` to the server
  * `grafana-ingress.yaml`: routes `grafana.tunecloud.local` to Grafana

* **Storage**

  * `postgres-pvc`: persistent PostgreSQL data
  * `covers-pvc`: persistent storage for album covers

* **Configuration**

  * `postgres-configmap`: SQL initialization scripts for database schema creation
  * Kubernetes Secrets: `ghcr-secret`, `spotify-secret`, and `jwt-secret`

Secrets used by the application are created manually during deployment and referenced by the workloads.

---

## 🔄 CI/CD & GitOps Pipeline

The delivery pipeline is automated using **GitHub Actions**, **Helm**, and **ArgoCD**, following a GitOps workflow.

### 1. Continuous Integration

* A push to the `main` branch triggers GitHub Actions.
* Multi-stage Docker builds are executed for the client and server.
* Images are tagged with the short Git commit SHA.
* Images are pushed to **GitHub Container Registry (GHCR)**.

### 2. GitOps Update

* The CI pipeline uses `yq` to update image tags in `values.yaml` in the separate GitOps repository.
* The updated configuration is committed and pushed automatically.

### 3. ArgoCD Deployment

* **ArgoCD** detects changes in the GitOps repository.
* ArgoCD synchronizes the desired state with the k3s cluster.
* Kubernetes performs a rolling update of the workloads, allowing new Pods to replace old ones without application downtime.

---

## 📊 Monitoring & Observability

Monitoring is implemented using the **kube-prometheus-stack**.

* **ServiceMonitors**

  * `server-monitor.yaml`: scrapes custom application metrics from `/metrics`, exposed by `fastify-metrics`
  * `postgres-exporter-monitor.yaml`: scrapes PostgreSQL health and performance metrics

* **Prometheus**

  * Collects and stores metrics from the application and database.

* **Grafana**

  * Provides custom dashboards for visualizing application and infrastructure metrics.
  * Accessible through `grafana.tunecloud.local`.

---

## 💻 Tech Stack

| Domain                             | Technologies                           |
| ---------------------------------- | -------------------------------------- |
| **Infrastructure & Orchestration** | Kubernetes (k3s), Docker               |
| **CI/CD & GitOps**                 | GitHub Actions, ArgoCD, Helm, Git      |
| **Monitoring & Metrics**           | Prometheus, Grafana, Postgres Exporter |
| **Backend**                        | Node.js 22, Fastify, PostgreSQL 16     |
| **Frontend**                       | React 18, Vite, Tailwind CSS 3, Nginx  |

---

## 🚀 Quick Start

### Docker Compose

```bash
git clone https://github.com/egorpirkov/TuneCloud.git tunecloud
cd tunecloud

# Setup environment variables
cp server/.env.example server/.env

# Start the entire stack
docker compose up -d --build
```

### Helm

```bash
helm install tunecloud ./tunecloud -n tunecloud --create-namespace
kubectl get pods -n tunecloud
```

## 📜 License

GPL v3.0
