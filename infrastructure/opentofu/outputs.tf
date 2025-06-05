# Essential outputs for Auto Coach Infrastructure

output "service_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.auto_coach_api.uri
}

output "container_registry_url" {
  description = "The URL of the Artifact Registry repository"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.auto_coach_repo.repository_id}"
}

output "service_account_email" {
  description = "The email of the Cloud Run service account"
  value       = google_service_account.cloud_run_sa.email
}

output "sendgrid_secret_name" {
  description = "The name of the SendGrid API key secret in Secret Manager"
  value       = google_secret_manager_secret.sendgrid_api_key.secret_id
}

output "yahoo_secret_name" {
  description = "The name of the Yahoo client secret in Secret Manager"
  value       = google_secret_manager_secret.yahoo_client_secret.secret_id
}

output "state_bucket" {
  description = "The GCS bucket used for OpenTofu state storage"
  value       = "auto-coach-terraform-state"
}
