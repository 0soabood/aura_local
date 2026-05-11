#!/bin/sh
# Entrypoint script to load Docker secrets as environment variables

# Function to read secret file if it exists
read_secret() {
  local secret_name=\"\"
  local secret_file=\"/run/secrets/\"
  if [ -f \"\" ]; then
    # Read the file and export as environment variable
    export \"\"=\"\"
    echo \"Loaded secret: \"
  fi
}

# Load all API key secrets
read_secret \"GOOGLE_API_KEY\"
read_secret \"GROQ_API_KEY\"
read_secret \"OPENROUTER_API_KEY\"
read_secret \"MISTRAL_API_KEY\"
read_secret \"COHERE_API_KEY\"
read_secret \"DEEPSEEK_API_KEY\"

# For Vertex AI - read multi-line secrets
if [ -f \"/run/secrets/GOOGLE_CLOUD_PROJECT\" ]; then
  export GOOGLE_CLOUD_PROJECT=
  echo \"Loaded: GOOGLE_CLOUD_PROJECT\"
fi

if [ -f \"/run/secrets/GOOGLE_CLOUD_LOCATION\" ]; then
  export GOOGLE_CLOUD_LOCATION=
  echo \"Loaded: GOOGLE_CLOUD_LOCATION\"
fi

# For Vertex AI credentials JSON - need to write to a temp file
if [ -f \"/run/secrets/GOOGLE_APPLICATION_CREDENTIALS_JSON\" ]; then
  export GOOGLE_APPLICATION_CREDENTIALS=\"/tmp/service-account.json\"
  cat /run/secrets/GOOGLE_APPLICATION_CREDENTIALS_JSON > \"\"
  echo \"Loaded: GOOGLE_APPLICATION_CREDENTIALS (written to )\"
fi

echo \"Environment loaded from Docker secrets\"

# Execute the command passed to the container
exec \"$@\"