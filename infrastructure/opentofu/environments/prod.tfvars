# Production environment configuration for Auto Coach Infrastructure
# This file contains environment-specific values for prod environment

environment = "prod"
region      = "us-central1"

# Production-specific CORS origins
allowed_origins = "https://fantasyautocoach.com,https://auto-gm-372620.web.app,https://auto-gm-372620.firebaseapp.com"

# Container configuration for production
container_image_tag = "latest"

# Yahoo Fantasy API configuration for production
yahoo_redirect_uri = "https://auto-gm-372620.web.app/auth/callback"

# Project IDs
project_id         = "auto-gm-372620"
firebase_project_id = "auto-gm-372620"

# Yahoo Fantasy API configuration
yahoo_app_id   = "ctHtbdlZ"
yahoo_client_id = "dj0yJmk9VDRhUVFQSUUxUmo0JmQ9WVdrOVkzUklkR0prYkZvbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTlh"

# Secret values (set via CI/CD or -var flags)
# sendgrid_api_key     = "SG.xxx..."
# yahoo_client_secret  = "xxx..."
