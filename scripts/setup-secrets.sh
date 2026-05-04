#!/bin/bash
# Setup Docker secrets from template
# Usage: ./scripts/setup-secrets.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$PROJECT_ROOT/docker/secrets"
TEMPLATE_FILE="$SECRETS_DIR/template.env"

echo "🔐 Setting up Docker secrets for AURA_LOCAL_SYNC"
echo "================================================"

# Check if running in PowerShell (Windows)
if [[ -n "$PSModulePath" ]] || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    echo "⚠️  Detected Windows environment. Please use Git Bash or WSL to run this script."
    echo "   Alternatively, manually create the secret files (see instructions below)."
    echo ""
fi

# List of secret files to create
SECRETS=(
    "GOOGLE_API_KEY"
    "GROQ_API_KEY"
    "OPENROUTER_API_KEY"
    "MISTRAL_API_KEY"
    "COHERE_API_KEY"
    "DEEPSEEK_API_KEY"
)

echo ""
echo "This script will create empty secret files in: $SECRETS_DIR"
echo "You will need to edit each file and add your actual API keys."
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Create each secret file if it doesn't exist
for secret in "${SECRETS[@]}"; do
    secret_file="$SECRETS_DIR/$secret"
    if [[ -f "$secret_file" ]]; then
        echo "⏭️  $secret already exists, skipping..."
    else
        echo "📝 Creating $secret..."
        echo "" > "$secret_file"
        echo "   Created: $secret_file"
        echo "   ⚠️  TODO: Add your $secret value to this file (just the key, no quotes)"
    fi
done

echo ""
echo "✅ Secret files created!"
echo ""
echo "Next steps:"
echo "1. Edit each file in $SECRETS_DIR/ and add your API keys"
echo "2. Each file should contain ONLY the API key value (no quotes, no variable name)"
echo "3. Example for GOOGLE_API_KEY file:"
echo "   Content: AIzaSyDXXXXXXXXXXXXXXXXXXXXXXX"
echo "4. At least one API key is required for the AI agents to work"
echo ""
echo "To verify setup, run: docker compose config"
