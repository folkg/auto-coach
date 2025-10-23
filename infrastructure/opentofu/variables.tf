# Variables for Auto Coach Infrastructure OpenTofu configuration

variable "project_id" {
  description = "The Google Cloud project ID"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "The Google Cloud region"
  type        = string
  default     = "us-central1"
  validation {
    condition = contains([
      "us-central1", "us-east1", "us-east4", "us-west1", "us-west2", "us-west3", "us-west4",
      "europe-west1", "europe-west2", "europe-west3", "europe-west4", "europe-west6",
      "asia-east1", "asia-northeast1", "asia-southeast1", "australia-southeast1"
    ], var.region)
    error_message = "Region must be a valid Google Cloud region."
  }
}

variable "environment" {
  description = "The deployment environment (dev, prod)"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be either 'dev' or 'prod'."
  }
}

variable "allowed_origins" {
  description = "Comma-separated list of allowed CORS origins"
  type        = string
  default     = "http://localhost:4200"
  validation {
    condition     = can(regex("^https?://", var.allowed_origins))
    error_message = "Allowed origins must start with http:// or https://."
  }
}

variable "firebase_project_id" {
  description = "Firebase project ID for authentication"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.firebase_project_id))
    error_message = "Firebase project ID must be a valid project ID."
  }
}

# Optional variables for advanced configuration

variable "container_image_tag" {
  description = "Container image tag to deploy"
  type        = string
  default     = "latest"
}

# Yahoo Fantasy API Configuration

variable "yahoo_app_id" {
  description = "Yahoo Fantasy API Application ID"
  type        = string
  validation {
    condition     = length(var.yahoo_app_id) > 0
    error_message = "Yahoo App ID cannot be empty."
  }
}

variable "yahoo_client_id" {
  description = "Yahoo Fantasy API Client ID"
  type        = string
  validation {
    condition     = length(var.yahoo_client_id) > 0
    error_message = "Yahoo Client ID cannot be empty."
  }
}

variable "yahoo_redirect_uri" {
  description = "Yahoo Fantasy API OAuth redirect URI"
  type        = string
  default     = "http://localhost:4200/auth/callback"
  validation {
    condition     = can(regex("^https?://", var.yahoo_redirect_uri))
    error_message = "Yahoo redirect URI must be a valid URL starting with http:// or https://."
  }
}

variable "sendgrid_api_key" {
  description = "SendGrid API key for email delivery"
  type        = string
  sensitive   = true
  default     = ""
  validation {
    condition     = length(var.sendgrid_api_key) > 0
    error_message = "SendGrid API key cannot be empty."
  }
}

variable "yahoo_client_secret" {
  description = "Yahoo Fantasy API client secret"
  type        = string
  sensitive   = true
  default     = ""
  validation {
    condition     = length(var.yahoo_client_secret) > 0
    error_message = "Yahoo client secret cannot be empty."
  }
}

variable "create_github_actions_sa" {
  description = "Whether to create GitHub Actions service account and IAM bindings"
  type        = bool
  default     = true
}
