# Production environment configuration for Auto Coach Infrastructure
# This file contains environment-specific values for the prod environment

environment = "prod"
region      = "us-central1"

# Production-specific CORS origins
allowed_origins = "https://auto-gm-372620.web.app,https://auto-gm-372620.firebaseapp.com"

# Container configuration for production
container_image_tag = "latest"

# Yahoo Fantasy API configuration for production
yahoo_redirect_uri = "https://auto-gm-372620.web.app/auth/callback"
