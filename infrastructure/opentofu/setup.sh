#!/bin/bash

# Auto Coach Infrastructure Setup Script
# This script sets up the complete infrastructure for Auto Coach on Google Cloud

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
DEFAULT_REGION="us-central1"
DEFAULT_ENVIRONMENT="dev"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${CYAN} $1 ${NC}"
    echo -e "${CYAN}================================================================${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    local missing_tools=()

    if ! command_exists "tofu"; then
        missing_tools+=("OpenTofu (https://opentofu.org/docs/intro/install/)")
    fi

    if ! command_exists "gcloud"; then
        missing_tools+=("Google Cloud CLI (https://cloud.google.com/sdk/docs/install)")
    fi

    if ! command_exists "gsutil"; then
        missing_tools+=("gsutil (part of Google Cloud CLI)")
    fi

    if ! command_exists "jq"; then
        missing_tools+=("jq (https://stedolan.github.io/jq/download/)")
    fi

    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools:"
        for tool in "${missing_tools[@]}"; do
            echo "  - $tool"
        done
        exit 1
    fi

    print_success "All prerequisites are installed!"
}

# Function to get user input with validation
get_input() {
    local prompt="$1"
    local validate_func="$2"
    local input

    while true; do
        read -p "$prompt: " input
        if [ -z "$input" ]; then
            print_error "Input cannot be empty. Please try again."
        elif [ -n "$validate_func" ] && ! $validate_func "$input"; then
            print_error "Invalid input. Please try again."
        else
            echo "$input"
            return 0
        fi
    done
}

# Function to get secret input
get_secret() {
    local prompt="$1"
    local input

    while true; do
        read -s -p "$prompt: " input
        echo
        if [ -z "$input" ]; then
            print_error "Secret cannot be empty. Please try again."
        else
            echo "$input"
            return 0
        fi
    done
}

# Validation functions
validate_project_id() {
    [[ $1 =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]
}

validate_environment() {
    [[ $1 =~ ^(dev|prod)$ ]]
}

validate_region() {
    local valid_regions=("us-central1" "us-east1" "us-east4" "us-west1" "us-west2" "us-west3" "us-west4" "europe-west1" "europe-west2" "europe-west3" "europe-west4" "europe-west6" "asia-east1" "asia-northeast1" "asia-southeast1" "australia-southeast1")
    local region="$1"
    for valid in "${valid_regions[@]}"; do
        if [ "$region" = "$valid" ]; then
            return 0
        fi
    done
    return 1
}

# Function to authenticate with Google Cloud
setup_gcloud_auth() {
    print_header "Setting up Google Cloud Authentication"

    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q ".*"; then
        print_status "Authenticating with Google Cloud..."
        gcloud auth login
    else
        print_success "Already authenticated with Google Cloud"
    fi

    print_status "Setting up application default credentials..."
    gcloud auth application-default login

    print_success "Google Cloud authentication complete!"
}

# Function to gather configuration
gather_configuration() {
    print_header "Gathering Configuration"

    echo "Please provide the following information for your Auto Coach deployment:"
    echo

    PROJECT_ID=$(get_input "Google Cloud Project ID" "validate_project_id")
    FIREBASE_PROJECT_ID=$(get_input "Firebase Project ID (can be same as GCP project)" "validate_project_id")

    echo
    print_status "Environment selection:"
    echo "  dev  - Development environment (public access, lower limits)"
    echo "  prod - Production environment (authenticated access, higher limits)"
    ENVIRONMENT=$(get_input "Environment (dev/prod) [$DEFAULT_ENVIRONMENT]" "validate_environment")
    ENVIRONMENT=${ENVIRONMENT:-$DEFAULT_ENVIRONMENT}

    echo
    REGION=$(get_input "Google Cloud Region [$DEFAULT_REGION]" "validate_region")
    REGION=${REGION:-$DEFAULT_REGION}

    echo
    print_status "Configuring Google Cloud project..."
    gcloud config set project "$PROJECT_ID"

    print_success "Configuration gathered successfully!"
}

# Function to enable required APIs
enable_apis() {
    print_header "Enabling Required Google Cloud APIs"

    local apis=(
        "run.googleapis.com"
        "artifactregistry.googleapis.com"
        "cloudbuild.googleapis.com"
        "secretmanager.googleapis.com"
        "firebase.googleapis.com"
        "firestore.googleapis.com"
    )

    print_status "Enabling APIs for project: $PROJECT_ID"
    for api in "${apis[@]}"; do
        print_status "Enabling $api..."
        gcloud services enable "$api" --project="$PROJECT_ID"
    done

    if [ "$PROJECT_ID" != "$FIREBASE_PROJECT_ID" ]; then
        print_status "Enabling Firebase APIs for project: $FIREBASE_PROJECT_ID"
        gcloud services enable firebase.googleapis.com --project="$FIREBASE_PROJECT_ID"
        gcloud services enable firestore.googleapis.com --project="$FIREBASE_PROJECT_ID"
    fi

    print_success "All APIs enabled successfully!"
}

# Function to create state bucket
create_state_bucket() {
    print_header "Setting up OpenTofu State Storage"

    local bucket_name="auto-coach-terraform-state"

    if gsutil ls "gs://$bucket_name" >/dev/null 2>&1; then
        print_success "State bucket already exists: gs://$bucket_name"
    else
        print_status "Creating state bucket: gs://$bucket_name"
        gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://$bucket_name"
        gsutil versioning set on "gs://$bucket_name"
        print_success "State bucket created successfully!"
    fi
}

# Function to gather API credentials
gather_api_credentials() {
    print_header "Setting up API Credentials"

    echo "Please provide your API credentials for external services:"
    echo

    print_status "Yahoo Fantasy Sports API credentials"
    echo "You can get these from: https://developer.yahoo.com/apps/"
    YAHOO_APP_ID=$(get_input "Yahoo App ID")
    YAHOO_CLIENT_ID=$(get_input "Yahoo Client ID")
    YAHOO_CLIENT_SECRET=$(get_secret "Yahoo Client Secret")

    echo
    print_status "SendGrid API credentials"
    echo "You can get these from: https://app.sendgrid.com/settings/api_keys"
    SENDGRID_API_KEY=$(get_secret "SendGrid API Key")

    print_success "API credentials gathered!"
}

# Function to create secrets in Secret Manager
create_secrets() {
    print_header "Creating Secrets in Google Secret Manager"

    local sendgrid_secret="sendgrid-api-key-$ENVIRONMENT"
    local yahoo_secret="yahoo-client-secret-$ENVIRONMENT"

    print_status "Creating SendGrid API key secret..."
    if gcloud secrets describe "$sendgrid_secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
        print_status "Updating existing secret: $sendgrid_secret"
        echo "$SENDGRID_API_KEY" | gcloud secrets versions add "$sendgrid_secret" --project="$PROJECT_ID" --data-file=-
    else
        print_status "Creating new secret: $sendgrid_secret"
        echo "$SENDGRID_API_KEY" | gcloud secrets create "$sendgrid_secret" --project="$PROJECT_ID" --data-file=-
    fi

    print_status "Creating Yahoo client secret..."
    if gcloud secrets describe "$yahoo_secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
        print_status "Updating existing secret: $yahoo_secret"
        echo "$YAHOO_CLIENT_SECRET" | gcloud secrets versions add "$yahoo_secret" --project="$PROJECT_ID" --data-file=-
    else
        print_status "Creating new secret: $yahoo_secret"
        echo "$YAHOO_CLIENT_SECRET" | gcloud secrets create "$yahoo_secret" --project="$PROJECT_ID" --data-file=-
    fi

    print_success "Secrets created successfully!"
}

# Function to create terraform.tfvars
create_tfvars() {
    print_header "Creating Terraform Configuration"

    if [ -f "terraform.tfvars" ]; then
        print_warning "terraform.tfvars already exists. Creating backup..."
        mv terraform.tfvars "terraform.tfvars.backup.$(date +%s)"
    fi

    # Determine CORS origins and redirect URI based on environment
    if [ "$ENVIRONMENT" = "prod" ]; then
        ALLOWED_ORIGINS="https://auto-gm-372620.web.app,https://auto-gm-372620.firebaseapp.com"
        YAHOO_REDIRECT_URI="https://auto-gm-372620.web.app/auth/callback"
    else
        ALLOWED_ORIGINS="http://localhost:4200,http://localhost:3000,http://127.0.0.1:4200,http://127.0.0.1:3000"
        YAHOO_REDIRECT_URI="http://localhost:4200/auth/callback"
    fi

    cat > terraform.tfvars << EOF
# Auto Coach Infrastructure Configuration
# Generated by setup script on $(date)

# Required variables
project_id          = "$PROJECT_ID"
firebase_project_id = "$FIREBASE_PROJECT_ID"
yahoo_app_id        = "$YAHOO_APP_ID"
yahoo_client_id     = "$YAHOO_CLIENT_ID"

# Environment-specific variables
environment         = "$ENVIRONMENT"
region              = "$REGION"
allowed_origins     = "$ALLOWED_ORIGINS"
yahoo_redirect_uri  = "$YAHOO_REDIRECT_URI"

# Container configuration
container_image_tag = "latest"
EOF

    print_success "terraform.tfvars created successfully!"
}

# Function to initialize OpenTofu
initialize_tofu() {
    print_header "Initializing OpenTofu"

    print_status "Running tofu init..."
    tofu init

    print_status "Validating configuration..."
    tofu validate

    print_status "Formatting configuration files..."
    tofu fmt -recursive

    print_success "OpenTofu initialized successfully!"
}

# Function to plan infrastructure
plan_infrastructure() {
    print_header "Planning Infrastructure Changes"

    print_status "Running tofu plan..."
    tofu plan -out="$ENVIRONMENT.tfplan"

    echo
    print_status "Infrastructure plan saved to: $ENVIRONMENT.tfplan"
    print_warning "Review the plan above carefully before applying!"
    echo

    read -p "Do you want to apply these changes? (yes/no): " apply_confirm
    if [ "$apply_confirm" = "yes" ]; then
        return 0
    else
        print_status "Deployment cancelled. You can apply later with: make apply ENVIRONMENT=$ENVIRONMENT PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
        return 1
    fi
}

# Function to apply infrastructure
apply_infrastructure() {
    print_header "Applying Infrastructure Changes"

    if [ "$ENVIRONMENT" = "prod" ]; then
        print_warning "You are about to deploy to PRODUCTION!"
        read -p "Are you absolutely sure? (yes/no): " prod_confirm
        if [ "$prod_confirm" != "yes" ]; then
            print_status "Production deployment cancelled."
            return 1
        fi
    fi

    print_status "Applying infrastructure changes..."
    tofu apply "$ENVIRONMENT.tfplan"

    print_success "Infrastructure deployed successfully!"
}

# Function to show deployment summary
show_summary() {
    print_header "Deployment Summary"

    echo "Your Auto Coach infrastructure has been set up with the following configuration:"
    echo
    echo "  Project ID:          $PROJECT_ID"
    echo "  Firebase Project:    $FIREBASE_PROJECT_ID"
    echo "  Environment:         $ENVIRONMENT"
    echo "  Region:              $REGION"
    echo

    print_status "Getting deployment outputs..."
    if tofu output service_url >/dev/null 2>&1; then
        SERVICE_URL=$(tofu output -raw service_url)
        REGISTRY_URL=$(tofu output -raw container_registry_url)

        echo "  Service URL:         $SERVICE_URL"
        echo "  Container Registry:  $REGISTRY_URL"
        echo

        print_success "Infrastructure is ready!"
        echo
        print_status "Next steps:"
        echo "  1. Build and push your container image:"
        echo "     cd ../../"
        echo "     bun run container:build"
        echo "     docker tag auto-coach-api $REGISTRY_URL/auto-coach-api:latest"
        echo "     docker push $REGISTRY_URL/auto-coach-api:latest"
        echo
        echo "  2. Test your deployment:"
        echo "     curl $SERVICE_URL"
        echo
        echo "  3. Monitor your service:"
        echo "     make logs ENVIRONMENT=$ENVIRONMENT PROJECT_ID=$PROJECT_ID FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
    else
        print_warning "Could not retrieve deployment outputs. Check 'tofu output' manually."
    fi
}

# Main function
main() {
    print_header "Auto Coach Infrastructure Setup"
    echo "This script will set up your complete Auto Coach infrastructure on Google Cloud."
    echo

    # Check if user wants to continue
    read -p "Do you want to continue? (yes/no): " continue_setup
    if [ "$continue_setup" != "yes" ]; then
        print_status "Setup cancelled."
        exit 0
    fi

    # Run setup steps
    check_prerequisites
    setup_gcloud_auth
    gather_configuration
    enable_apis
    create_state_bucket
    gather_api_credentials
    create_secrets
    create_tfvars
    initialize_tofu

    if plan_infrastructure; then
        if apply_infrastructure; then
            show_summary
        fi
    fi

    print_success "Setup complete! Your Auto Coach infrastructure is ready."
}

# Run main function if script is executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
