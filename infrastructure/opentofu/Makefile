# Makefile for Auto Coach OpenTofu Infrastructure
# Provides convenient commands for managing infrastructure

# Default values
PROJECT_ID ?=
FIREBASE_PROJECT_ID ?=
ENVIRONMENT ?= prod
REGION ?= us-central1

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
BLUE = \033[0;34m
NC = \033[0m # No Color

.PHONY: help init plan apply destroy validate fmt check clean status logs import

# Default target
help: ## Show this help message
	@echo "$(BLUE)Auto Coach Infrastructure - OpenTofu Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Usage:$(NC)"
	@echo "  make <target> [PROJECT_ID=your-project] [FIREBASE_PROJECT_ID=your-firebase-project]"
	@echo ""
	@echo "$(YELLOW)Targets:$(NC)"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(YELLOW)Examples:$(NC)"
	@echo "  make plan PROJECT_ID=my-project FIREBASE_PROJECT_ID=my-firebase"
	@echo "  make apply PROJECT_ID=my-prod-project FIREBASE_PROJECT_ID=my-firebase"
	@echo "  make destroy PROJECT_ID=my-project FIREBASE_PROJECT_ID=my-firebase"

init: ## Initialize OpenTofu configuration
	@echo "$(BLUE)Initializing OpenTofu...$(NC)"
	@tofu init

validate: ## Validate OpenTofu configuration
	@echo "$(BLUE)Validating configuration...$(NC)"
	@tofu validate
	@echo "$(GREEN)Configuration is valid!$(NC)"

fmt: ## Format OpenTofu configuration files
	@echo "$(BLUE)Formatting configuration files...$(NC)"
	@tofu fmt -recursive
	@echo "$(GREEN)Files formatted!$(NC)"

check: validate fmt ## Run validation and formatting checks
	@echo "$(GREEN)All checks passed!$(NC)"

plan: check-vars ## Plan infrastructure changes
	@echo "$(BLUE)Planning infrastructure changes for prod environment...$(NC)"
	@tofu plan \
		-var-file="environments/prod.tfvars" \
		-var="project_id=$(PROJECT_ID)" \
		-var="firebase_project_id=$(FIREBASE_PROJECT_ID)" \
		-out="prod.tfplan"
	@echo "$(GREEN)Plan saved to prod.tfplan$(NC)"

apply: check-vars ## Apply infrastructure changes
	@echo "$(YELLOW)Applying infrastructure changes for prod environment...$(NC)"
	@echo "$(RED)WARNING: You are about to apply changes to PRODUCTION!$(NC)"; \
	read -p "Are you sure? (yes/no): " confirm; \
	if [ "$$confirm" != "yes" ]; then \
		echo "$(YELLOW)Aborted.$(NC)"; \
		exit 1; \
	fi
	@tofu apply \
		-var-file="environments/prod.tfvars" \
		-var="project_id=$(PROJECT_ID)" \
		-var="firebase_project_id=$(FIREBASE_PROJECT_ID)"
	@echo "$(GREEN)Infrastructure applied successfully!$(NC)"

apply-auto: check-vars ## Apply infrastructure changes without confirmation
	@echo "$(YELLOW)Auto-applying infrastructure changes for prod environment...$(NC)"
	@tofu apply \
		-auto-approve \
		-var-file="environments/prod.tfvars" \
		-var="project_id=$(PROJECT_ID)" \
		-var="firebase_project_id=$(FIREBASE_PROJECT_ID)"
	@echo "$(GREEN)Infrastructure applied successfully!$(NC)"

destroy: check-vars ## Destroy infrastructure
	@echo "$(RED)WARNING: You are about to DESTROY infrastructure!$(NC)"
	@read -p "Type 'destroy' to confirm: " confirm; \
	if [ "$$confirm" != "destroy" ]; then \
		echo "$(YELLOW)Aborted.$(NC)"; \
		exit 1; \
	fi
	@tofu destroy \
		-var-file="environments/prod.tfvars" \
		-var="project_id=$(PROJECT_ID)" \
		-var="firebase_project_id=$(FIREBASE_PROJECT_ID)"
	@echo "$(GREEN)Infrastructure destroyed!$(NC)"

output: ## Show infrastructure outputs
	@echo "$(BLUE)Infrastructure outputs:$(NC)"
	@tofu output -json | jq '.'

output-url: ## Show service URL
	@tofu output -raw service_url 2>/dev/null || echo "Service URL not available"

status: check-vars ## Check Cloud Run service status
	@echo "$(BLUE)Checking service status...$(NC)"
	@gcloud run services describe auto-coach-api-prod \
		--region=$(REGION) \
		--project=$(PROJECT_ID) \
		--format="table(metadata.name,status.url,status.conditions[0].type,status.conditions[0].status)" \
		2>/dev/null || echo "$(RED)Service not found or not accessible$(NC)"

logs: check-vars ## View service logs
	@echo "$(BLUE)Viewing logs for auto-coach-api-prod...$(NC)"
	@gcloud run services logs read auto-coach-api-prod \
		--region=$(REGION) \
		--project=$(PROJECT_ID) \
		--limit=100

logs-follow: check-vars ## Follow service logs
	@echo "$(BLUE)Following logs for auto-coach-api-prod...$(NC)"
	@gcloud run services logs tail auto-coach-api-prod \
		--region=$(REGION) \
		--project=$(PROJECT_ID)

state-list: ## List resources in state
	@echo "$(BLUE)Resources in Terraform state:$(NC)"
	@tofu state list

state-show: ## Show detailed state for a specific resource
	@echo "$(BLUE)Available resources:$(NC)"
	@tofu state list
	@echo ""
	@read -p "Enter resource name to show details: " resource; \
	tofu state show "$$resource"

refresh: check-vars ## Refresh state from actual infrastructure
	@echo "$(BLUE)Refreshing state from actual infrastructure...$(NC)"
	@tofu refresh \
		-var-file="environments/prod.tfvars" \
		-var="project_id=$(PROJECT_ID)" \
		-var="firebase_project_id=$(FIREBASE_PROJECT_ID)"
	@echo "$(GREEN)State refreshed!$(NC)"

import: check-vars ## Import existing resource into state
	@echo "$(BLUE)Import existing resource into state$(NC)"
	@echo "$(YELLOW)Available resource types:$(NC)"
	@echo "  - google_cloud_run_v2_service.auto_coach_api"
	@echo "  - google_artifact_registry_repository.auto_coach_repo"
	@echo "  - google_service_account.cloud_run_sa"
	@echo ""
	@read -p "Enter resource address (e.g., google_cloud_run_v2_service.auto_coach_api): " address; \
	read -p "Enter resource ID: " id; \
	tofu import \
		-var-file="environments/prod.tfvars" \
		-var="project_id=$(PROJECT_ID)" \
		-var="firebase_project_id=$(FIREBASE_PROJECT_ID)" \
		"$$address" "$$id"

unlock: ## Force unlock state (use with caution)
	@echo "$(RED)WARNING: Force unlocking state$(NC)"
	@read -p "Enter lock ID: " lock_id; \
	tofu force-unlock "$$lock_id"

clean: ## Clean temporary files
	@echo "$(BLUE)Cleaning temporary files...$(NC)"
	@rm -f *.tfplan
	@rm -f terraform.tfstate.backup
	@rm -rf .terraform.lock.hcl.backup
	@echo "$(GREEN)Cleaned!$(NC)"

setup-gcloud: check-vars ## Setup gcloud and enable APIs
	@echo "$(BLUE)Setting up gcloud and enabling APIs...$(NC)"
	@gcloud config set project $(PROJECT_ID)
	@gcloud services enable \
		run.googleapis.com \
		artifactregistry.googleapis.com \
		cloudbuild.googleapis.com \
		secretmanager.googleapis.com
	@echo "$(GREEN)Setup complete!$(NC)"

setup-state-bucket: check-vars ## Create GCS bucket for Terraform state
	@echo "$(BLUE)Creating state bucket for OpenTofu...$(NC)"
	@if ! gsutil ls gs://auto-coach-terraform-state >/dev/null 2>&1; then \
		gsutil mb -p $(PROJECT_ID) -l $(REGION) gs://auto-coach-terraform-state; \
		gsutil versioning set on gs://auto-coach-terraform-state; \
		echo "$(GREEN)State bucket created successfully!$(NC)"; \
	else \
		echo "$(YELLOW)State bucket already exists$(NC)"; \
	fi

set-sendgrid-secret: check-vars ## Set SendGrid API key in Secret Manager
	@echo "$(BLUE)Setting SendGrid API key secret...$(NC)"
	@read -s -p "Enter SendGrid API key: " api_key; \
	echo "$$api_key" | gcloud secrets create sendgrid-api-key-prod \
		--project=$(PROJECT_ID) \
		--data-file=- 2>/dev/null || \
	echo "$$api_key" | gcloud secrets versions add sendgrid-api-key-prod \
		--project=$(PROJECT_ID) \
		--data-file=-
	@echo "$(GREEN)SendGrid secret set successfully!$(NC)"

set-yahoo-secret: check-vars ## Set Yahoo client secret in Secret Manager
	@echo "$(BLUE)Setting Yahoo client secret...$(NC)"
	@read -s -p "Enter Yahoo client secret: " client_secret; \
	echo "$$client_secret" | gcloud secrets create yahoo-client-secret-prod \
		--project=$(PROJECT_ID) \
		--data-file=- 2>/dev/null || \
	echo "$$client_secret" | gcloud secrets versions add yahoo-client-secret-prod \
		--project=$(PROJECT_ID) \
		--data-file=-
	@echo "$(GREEN)Yahoo secret set successfully!$(NC)"

setup-secrets: check-vars ## Set up all required secrets
	@echo "$(BLUE)Setting up all secrets...$(NC)"
	@$(MAKE) set-sendgrid-secret PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) set-yahoo-secret PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@echo "$(GREEN)All secrets configured!$(NC)"

create-tfvars: ## Create terraform.tfvars from example
	@if [ ! -f terraform.tfvars ]; then \
		echo "$(BLUE)Creating terraform.tfvars from example...$(NC)"; \
		cp terraform.tfvars.example terraform.tfvars; \
		echo "$(YELLOW)Please edit terraform.tfvars with your actual values$(NC)"; \
	else \
		echo "$(YELLOW)terraform.tfvars already exists$(NC)"; \
	fi

# Production shortcuts
prod: ## Run plan for prod
	@$(MAKE) plan

prod-apply: check-vars ## Apply prod environment
	@$(MAKE) apply PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)

prod-status: check-vars ## Check prod environment status
	@$(MAKE) status PROJECT_ID=$(PROJECT_ID)

# Internal targets
check-vars:
	@if [ -z "$(PROJECT_ID)" ]; then \
		echo "$(RED)ERROR: PROJECT_ID is required$(NC)"; \
		echo "$(YELLOW)Usage: make <target> PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project$(NC)"; \
		exit 1; \
	fi
	@if [ -z "$(FIREBASE_PROJECT_ID)" ]; then \
		echo "$(RED)ERROR: FIREBASE_PROJECT_ID is required$(NC)"; \
		echo "$(YELLOW)Usage: make <target> PROJECT_ID=your-project-id FIREBASE_PROJECT_ID=your-firebase-project$(NC)"; \
		exit 1; \
	fi

# Production workflow
prod-workflow: check-vars ## Complete production workflow: setup, init, plan, apply
	@echo "$(BLUE)Running complete production workflow...$(NC)"
	@$(MAKE) setup-gcloud PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) setup-state-bucket PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) init
	@$(MAKE) plan PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) apply PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) output
	@$(MAKE) status PROJECT_ID=$(PROJECT_ID)

# First-time setup workflow
first-time-setup: check-vars ## Complete first-time setup: gcloud, bucket, secrets, init
	@echo "$(BLUE)Running first-time setup workflow...$(NC)"
	@$(MAKE) setup-gcloud PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) setup-state-bucket PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) setup-secrets PROJECT_ID=$(PROJECT_ID) FIREBASE_PROJECT_ID=$(FIREBASE_PROJECT_ID)
	@$(MAKE) create-tfvars
	@$(MAKE) init
	@echo "$(GREEN)First-time setup complete! Edit terraform.tfvars and run 'make plan' next.$(NC)"
