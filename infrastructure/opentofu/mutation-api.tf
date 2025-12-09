# Mutation API Infrastructure Configuration
# Separate file for mutation-api specific resources

# Service account for Mutation API Cloud Run service
resource "google_service_account" "mutation_api_sa" {
  account_id   = "mutation-api-${var.environment}"
  display_name = "Mutation API Service Account (${var.environment})"
  description  = "Service account for Mutation API Cloud Run service"
  project      = var.project_id
}

# IAM binding for mutation API service account to access Firebase
resource "google_project_iam_member" "mutation_api_sa_firebase_viewer" {
  project = var.firebase_project_id
  role    = "roles/firebase.viewer"
  member  = "serviceAccount:${google_service_account.mutation_api_sa.email}"
}

# IAM binding for mutation API service account to access secrets
resource "google_project_iam_member" "mutation_api_sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.mutation_api_sa.email}"
}

# IAM binding for mutation API service account to access Firestore
resource "google_project_iam_member" "mutation_api_sa_datastore_user" {
  project = var.firebase_project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.mutation_api_sa.email}"
}

# IAM binding for mutation API service account to invoke Cloud Tasks
resource "google_project_iam_member" "mutation_api_sa_cloud_tasks_invoker" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.mutation_api_sa.email}"
}

# Cloud Run service for Mutation API
resource "google_cloud_run_v2_service" "mutation_api" {
  name     = "mutation-api-${var.environment}"
  location = var.region
  project  = var.project_id

  labels = local.common_labels

  template {
    timeout                          = "60s"
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    service_account                  = google_service_account.mutation_api_sa.email
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = local.max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.auto_coach_repo.repository_id}/auto-coach-mutation-api:${var.container_image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = false
      }

      ports {
        container_port = 3001
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
        name  = "CLOUD_TASKS_QUEUE_PATH"
        value = google_cloud_tasks_queue.mutation_queue.name
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }

      env {
        name  = "MUTATION_API_URL"
        value = "https://mutation-api-${var.environment}-nw73xubluq-uc.a.run.app"
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
        name = "YAHOO_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.yahoo_client_secret.secret_id
            version = "latest"
          }
        }
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

      # Health probes optimized for compiled binary startup
      startup_probe {
        http_get {
          path = "/"
          port = 3001
          http_headers {
            name  = "User-Agent"
            value = "GoogleHC/1.0"
          }
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/"
          port = 3001
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
    google_project_iam_member.mutation_api_sa_firebase_viewer,
    google_project_iam_member.mutation_api_sa_secret_accessor,
    google_project_iam_member.mutation_api_sa_datastore_user,
    google_project_iam_member.mutation_api_sa_cloud_tasks_invoker,
  ]
}

# IAM policy for Mutation API based on environment
resource "google_cloud_run_v2_service_iam_member" "mutation_api_access_policy" {
  name     = google_cloud_run_v2_service.mutation_api.name
  location = google_cloud_run_v2_service.mutation_api.location
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = local.allow_unauthenticated ? "allUsers" : "allAuthenticatedUsers"
}

# Cloud Tasks queue for mutation processing
resource "google_cloud_tasks_queue" "mutation_queue" {
  name     = "mutation-queue-${var.environment}"
  project  = var.project_id
  location = var.region

  rate_limits {
    max_dispatches_per_second  = 5
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts       = 5
    min_backoff        = "1s"
    max_backoff        = "60s"
    max_doublings      = 3
    max_retry_duration = "300s"
  }

  depends_on = [google_project_service.cloud_tasks_api]
}

# Cloud Scheduler job for set-lineup dispatch (hourly at minute 55)
resource "google_cloud_scheduler_job" "set_lineup_schedule" {
  name      = "set-lineup-schedule-${var.environment}"
  project   = var.project_id
  region    = var.region
  schedule  = "55 * * * *" # Every hour at minute 55
  time_zone = "America/Los_Angeles"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.mutation_api.uri}/mutations/set-lineup"

    oidc_token {
      service_account_email = google_service_account.mutation_api_sa.email
      audience              = google_cloud_run_v2_service.mutation_api.uri
    }

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode(jsonencode({
      userId        = "scheduler"
      teamKey       = "all"
      lineupChanges = []
    }))
  }

  depends_on = [
    google_project_service.cloud_scheduler_api,
    google_cloud_run_v2_service.mutation_api,
  ]
}

# Cloud Scheduler job for weekly-transactions dispatch (daily at 3 AM)
resource "google_cloud_scheduler_job" "weekly_transactions_schedule" {
  name      = "weekly-transactions-schedule-${var.environment}"
  project   = var.project_id
  region    = var.region
  schedule  = "0 3 * * *" # Daily at 3 AM
  time_zone = "America/Los_Angeles"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.mutation_api.uri}/mutations/weekly-transactions"

    oidc_token {
      service_account_email = google_service_account.mutation_api_sa.email
      audience              = google_cloud_run_v2_service.mutation_api.uri
    }

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode(jsonencode({
      userId       = "scheduler"
      teamKey      = "all"
      transactions = []
    }))
  }

  depends_on = [
    google_project_service.cloud_scheduler_api,
    google_cloud_run_v2_service.mutation_api,
  ]
}

# Cloud Scheduler job for calc-positional-scarcity dispatch (weekly on Sunday at 12:30 AM)
resource "google_cloud_scheduler_job" "calc_scarcity_schedule" {
  name      = "calc-scarcity-schedule-${var.environment}"
  project   = var.project_id
  region    = var.region
  schedule  = "30 0 * * 0" # Weekly on Sunday at 12:30 AM
  time_zone = "America/Los_Angeles"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.mutation_api.uri}/mutations/calc-positional-scarcity"

    oidc_token {
      service_account_email = google_service_account.mutation_api_sa.email
      audience              = google_cloud_run_v2_service.mutation_api.uri
    }

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode(jsonencode({
      userId    = "scheduler"
      leagueKey = "all"
    }))
  }

  depends_on = [
    google_project_service.cloud_scheduler_api,
    google_cloud_run_v2_service.mutation_api,
  ]
}
