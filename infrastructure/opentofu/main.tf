# Infrastructure configuration for Auto Coach API server deployment
# Optimized for Bun compiled binary on Google Cloud Run using OpenTofu

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "auto-coach-terraform-state"
    prefix = "infrastructure/opentofu"
  }
}



# Local values for environment-specific settings
locals {
  max_instances = var.environment == "prod" ? 100 : 10
  allow_unauthenticated = var.environment == "dev"

  common_labels = {
    environment = var.environment
    project     = "auto-coach"
    managed-by  = "opentofu"
  }
}

# Enable required APIs
resource "google_project_service" "cloud_run_api" {
  service = "run.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "artifact_registry_api" {
  service = "artifactregistry.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_build_api" {
  service = "cloudbuild.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "secret_manager_api" {
  service = "secretmanager.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "firebase_api" {
  service = "firebase.googleapis.com"
  project = var.firebase_project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "firestore_api" {
  service = "firestore.googleapis.com"
  project = var.firebase_project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

# Create Artifact Registry repository for container images
resource "google_artifact_registry_repository" "auto_coach_repo" {
  repository_id = "auto-coach"
  format        = "DOCKER"
  location      = var.region
  description   = "Container registry for Auto Coach API"
  project       = var.project_id

  labels = local.common_labels

  depends_on = [google_project_service.artifact_registry_api]
}

# Service account for Cloud Run
resource "google_service_account" "cloud_run_sa" {
  account_id   = "auto-coach-api-${var.environment}"
  display_name = "Auto Coach API Service Account (${var.environment})"
  description  = "Service account for Auto Coach API Cloud Run service"
  project      = var.project_id
}

# Secret Manager secrets for sensitive configuration
resource "google_secret_manager_secret" "sendgrid_api_key" {
  secret_id = "sendgrid-api-key-${var.environment}"
  project   = var.project_id

  labels = local.common_labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.secret_manager_api]
}

resource "google_secret_manager_secret" "yahoo_client_secret" {
  secret_id = "yahoo-client-secret-${var.environment}"
  project   = var.project_id

  labels = local.common_labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.secret_manager_api]
}

# IAM binding for service account to access Firebase
resource "google_project_iam_member" "cloud_run_sa_firebase_viewer" {
  project = var.firebase_project_id
  role    = "roles/firebase.viewer"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# IAM binding for service account to access secrets
resource "google_project_iam_member" "cloud_run_sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Cloud Run service configuration optimized for Bun binary
resource "google_cloud_run_v2_service" "auto_coach_api" {
  name     = "auto-coach-api-${var.environment}"
  location = var.region
  project  = var.project_id

  labels = local.common_labels

  template {
    timeout                          = "60s"
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    service_account                  = google_service_account.cloud_run_sa.email
    max_instance_request_concurrency = 1000

    scaling {
      min_instance_count = 0
      max_instance_count = local.max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.auto_coach_repo.repository_id}/auto-coach-api:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = false
      }

      ports {
        container_port = 3000
        name          = "http1"
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }

      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.firebase_project_id
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "YAHOO_APP_ID"
        value = var.yahoo_app_id
      }

      env {
        name  = "YAHOO_CLIENT_ID"
        value = var.yahoo_client_id
      }

      env {
        name  = "YAHOO_REDIRECT_URI"
        value = var.yahoo_redirect_uri
      }

      env {
        name = "SENDGRID_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.sendgrid_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "YAHOO_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.yahoo_client_secret.secret_id
            version = "latest"
          }
        }
      }

      # Health probes optimized for compiled binary startup
      startup_probe {
        http_get {
          path = "/"
          port = 3000
          http_headers {
            name  = "User-Agent"
            value = "GoogleHC/1.0"
          }
        }
        initial_delay_seconds = 1
        timeout_seconds      = 3
        period_seconds       = 2
        failure_threshold    = 3
      }

      liveness_probe {
        http_get {
          path = "/"
          port = 3000
          http_headers {
            name  = "User-Agent"
            value = "GoogleHC/1.0"
          }
        }
        initial_delay_seconds = 10
        timeout_seconds      = 5
        period_seconds       = 30
        failure_threshold    = 3
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_project_service.cloud_run_api,
    google_artifact_registry_repository.auto_coach_repo,
    google_project_service.cloud_build_api,
    google_project_iam_member.cloud_run_sa_firebase_viewer,
    google_project_iam_member.cloud_run_sa_secret_accessor,
    google_secret_manager_secret.sendgrid_api_key,
    google_secret_manager_secret.yahoo_client_secret,
  ]
}

# IAM policy based on environment
resource "google_cloud_run_v2_service_iam_member" "access_policy" {
  name     = google_cloud_run_v2_service.auto_coach_api.name
  location = google_cloud_run_v2_service.auto_coach_api.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = local.allow_unauthenticated ? "allUsers" : "allAuthenticatedUsers"
}
