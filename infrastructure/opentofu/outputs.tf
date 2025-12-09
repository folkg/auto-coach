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

output "api_url" {
  description = "The URL of the deployed Cloud Run service (alias for service_url)"
  value       = google_cloud_run_v2_service.auto_coach_api.uri
}

output "mutation_api_url" {
  description = "The URL of the deployed Mutation API Cloud Run service"
  value       = google_cloud_run_v2_service.mutation_api.uri
}

output "mutation_api_service_account_email" {
  description = "The email of the Mutation API Cloud Run service account"
  value       = google_service_account.mutation_api_sa.email
}

output "mutation_queue_name" {
  description = "The name of the Cloud Tasks queue for mutations"
  value       = google_cloud_tasks_queue.mutation_queue.name
}

output "github_actions_service_account_email" {
  description = "The email of the GitHub Actions service account for CI/CD"
  value       = var.create_github_actions_sa ? google_service_account.github_actions_sa[0].email : null
}

output "github_actions_setup_instructions" {
  description = "Instructions for setting up GitHub Actions with this service account"
  value = var.create_github_actions_sa ? join("\n", [
    "GitHub Actions Service Account Created: ${google_service_account.github_actions_sa[0].email}",
    "",
    "To use this service account in GitHub Actions:",
    "1. Create a service account key:",
    "   gcloud iam service-accounts keys create github-actions-key.json \\",
    "     --iam-account=${google_service_account.github_actions_sa[0].email}",
    "",
    "2. Add all required secrets to GitHub:",
    "   - Go to your repo Settings > Secrets and variables > Actions",
    "   - Create these secrets (paste raw values WITHOUT quotes):",
    "",
    "   GOOGLE_CREDENTIALS",
    "     - Paste entire contents of github-actions-key.json (including braces)",
    "",
    "   FIREBASE_PROJECT_ID",
    "     - Value: ${var.firebase_project_id}",
    "",
    "   YAHOO_APP_ID",
    "     - Value: ${var.yahoo_app_id}",
    "",
    "   YAHOO_CLIENT_ID",
    "     - Value: ${var.yahoo_client_id}",
    "",
    "   YAHOO_CLIENT_SECRET",
    "     - Value: (your Yahoo client secret - do NOT include quotes)",
    "",
    "   SENDGRID_API_KEY",
    "     - Value: (your SendGrid API key - do NOT include quotes)",
    "",
    "3. Delete the local key file for security:",
    "   rm github-actions-key.json"
  ]) : "GitHub Actions service account creation is disabled"
}
