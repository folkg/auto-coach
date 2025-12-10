# Infrastructure configuration for Auto Coach API server deployment
# Optimized for Bun compiled binary on Google Cloud Run using OpenTofu

terraform {
  backend "gcs" {
    bucket = "auto-coach-terraform-state"
    prefix = "infrastructure/opentofu"
  }
}

# Local values for environment-specific settings
locals {
  max_instances         = var.environment == "prod" ? 100 : 10
  allow_unauthenticated = var.environment == "dev" || var.environment == "prod"

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

resource "google_project_service" "cloud_functions_api" {
  service = "cloudfunctions.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_billing_api" {
  service = "cloudbilling.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_scheduler_api" {
  service = "cloudscheduler.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "cloud_tasks_api" {
  service = "cloudtasks.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "identity_toolkit_api" {
  service = "identitytoolkit.googleapis.com"
  project = var.firebase_project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "eventarc_api" {
  service = "eventarc.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "pubsub_api" {
  service = "pubsub.googleapis.com"
  project = var.project_id

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_project_service" "firebase_extensions_api" {
  service = "firebaseextensions.googleapis.com"
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

  # Cleanup policy: delete PR images older than 7 days
  cleanup_policies {
    id     = "delete-old-pr-images"
    action = "DELETE"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["pr-"]
      older_than   = "604800s" # 7 days in seconds
    }
  }

  # Cleanup policy: delete untagged images older than 1 day
  cleanup_policies {
    id     = "delete-untagged-images"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "86400s" # 1 day in seconds
    }
  }

  # Keep policy: always keep prod-latest and recent versioned images
  cleanup_policies {
    id     = "keep-prod-images"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["v", "prod-latest"]
    }
  }

  # Keep the 5 most recent versions of each package
  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  depends_on = [google_project_service.artifact_registry_api]
}

# Service account for Cloud Run
resource "google_service_account" "cloud_run_sa" {
  account_id   = "auto-coach-api-${var.environment}"
  display_name = "Auto Coach API Service Account (${var.environment})"
  description  = "Service account for Auto Coach API Cloud Run service"
  project      = var.project_id
}

# GitHub Actions service account for CI/CD
resource "google_service_account" "github_actions_sa" {
  count        = var.create_github_actions_sa ? 1 : 0
  account_id   = "github-actions-${var.environment}"
  display_name = "GitHub Actions CI/CD Service Account (${var.environment})"
  description  = "Service account for GitHub Actions CI/CD pipeline"
  project      = var.project_id
}

# IAM bindings for GitHub Actions service account
resource "google_project_iam_member" "github_actions_artifact_registry_writer" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

resource "google_project_iam_member" "github_actions_cloud_functions_developer" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/cloudfunctions.developer"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

resource "google_project_iam_member" "github_actions_cloud_build_editor" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

resource "google_project_iam_member" "github_actions_service_account_user" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

resource "google_project_iam_member" "github_actions_firebase_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.firebase_project_id
  role    = "roles/firebase.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

resource "google_project_iam_member" "github_actions_cloud_run_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

resource "google_project_iam_member" "github_actions_storage_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
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

# Secret versions with actual values
resource "google_secret_manager_secret_version" "sendgrid_api_key_version" {
  secret      = google_secret_manager_secret.sendgrid_api_key.id
  secret_data = var.sendgrid_api_key

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_version" "yahoo_client_secret_version" {
  secret      = google_secret_manager_secret.yahoo_client_secret.id
  secret_data = var.yahoo_client_secret

  lifecycle {
    ignore_changes = [secret_data]
  }
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

# IAM binding for service account to access Firestore
resource "google_project_iam_member" "cloud_run_sa_datastore_user" {
  project = var.firebase_project_id
  role    = "roles/datastore.user"
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
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.auto_coach_repo.repository_id}/auto-coach-api:${var.container_image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = false
      }

      ports {
        container_port = 3000
        name           = "http1"
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

      # Health probes
      startup_probe {
        http_get {
          path = "/"
          port = 3000
          http_headers {
            name  = "User-Agent"
            value = "GoogleHC/1.0"
          }
        }
        initial_delay_seconds = 5
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 10
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
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
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
    google_project_iam_member.cloud_run_sa_datastore_user,
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

# Additional IAM bindings for GitHub Actions service account for Mutation API
resource "google_project_iam_member" "github_actions_mutation_api_cloud_run_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

# IAM binding for GitHub Actions to manage secrets (needed for tofu plan to read secret metadata)
resource "google_project_iam_member" "github_actions_secret_manager_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

# IAM binding for GitHub Actions to manage Cloud Tasks (needed for tofu plan)
resource "google_project_iam_member" "github_actions_cloud_tasks_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/cloudtasks.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}

# IAM binding for GitHub Actions to manage Cloud Scheduler (needed for tofu plan)
resource "google_project_iam_member" "github_actions_cloud_scheduler_admin" {
  count   = var.create_github_actions_sa ? 1 : 0
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${google_service_account.github_actions_sa[0].email}"
}
