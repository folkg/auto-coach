# Development environment configuration for Auto Coach Infrastructure
# This file contains environment-specific values for the dev environment

environment = "dev"
region      = "us-central1"

# Development-specific CORS origins
allowed_origins = "http://localhost:4200,http://localhost:3000,http://127.0.0.1:4200,http://127.0.0.1:3000"

# Container configuration for development
container_image_tag = "latest"

# Yahoo Fantasy API configuration for development
yahoo_redirect_uri = "http://localhost:4200/auth/callback"
