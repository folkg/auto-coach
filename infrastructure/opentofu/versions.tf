terraform {
  required_version = "1.13.4"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "5.45.2"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = {
    managed-by  = "opentofu"
    project     = "auto-coach"
    environment = var.environment
  }
}
