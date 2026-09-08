#!/usr/bin/env bash
# One-time AWS setup for CI/CD Lambda deploys. Run this yourself, once, from a shell with an
# AWS CLI profile that has IAM/Lambda admin rights — NOT from CI (a pipeline can't create the
# role it needs to assume). Safe to re-run: every step checks whether its resource already
# exists first.
#
# What this creates:
#   - A GitHub OIDC identity provider in IAM (skipped if one already exists in the account)
#   - An IAM role GitHub Actions assumes to deploy — trusted only for this repo's staging/main
#     branches, permitted only to update the two Lambda functions below (no static AWS keys
#     ever touch GitHub)
#   - Two Lambda functions (staging, prod) with a placeholder handler — deploy.yml overwrites
#     the code on its first real run
#   - A public Function URL per function, since this app does its own CORS handling
#
# After running this, see infra/README.md for the GitHub Environment variables/secrets to set
# before deploy.yml can actually deploy real code.
#
# Usage: AWS_PROFILE=your-admin-profile ./infra/bootstrap-aws.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
GITHUB_REPO="${GITHUB_REPO:-yuvabe-ai-labs/career-counseling-chatbot}"
ROLE_NAME="${ROLE_NAME:-github-actions-ccc-deploy}"
EXEC_ROLE_NAME="${EXEC_ROLE_NAME:-ccc-api-lambda-exec}"
FUNCTION_STAGING="${FUNCTION_STAGING:-ccc-staging}"
FUNCTION_PROD="${FUNCTION_PROD:-ccc-prod}"

echo "Region:            $AWS_REGION"
echo "GitHub repo:       $GITHUB_REPO"
echo "Deploy role:       $ROLE_NAME"
echo "Lambda exec role:  $EXEC_ROLE_NAME"
echo "Functions:         $FUNCTION_STAGING, $FUNCTION_PROD"
echo

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

# --- 1. GitHub OIDC identity provider (one per AWS account, shared by every repo that uses it) ---
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" >/dev/null 2>&1; then
  echo "OIDC provider already exists, skipping."
else
  echo "Creating GitHub OIDC provider..."
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" >/dev/null
fi

# --- 2. IAM role GitHub Actions assumes, trusted only for staging/main pushes on this repo ---
TRUST_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$OIDC_PROVIDER_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:${GITHUB_REPO}:environment:staging",
            "repo:${GITHUB_REPO}:environment:production"
          ]
        }
    }
  }]
}
JSON
)

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role $ROLE_NAME already exists, updating trust policy..."
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$TRUST_POLICY" >/dev/null
else
  echo "Creating role $ROLE_NAME..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "GitHub Actions OIDC role: deploys the yuvanext API to Lambda" >/dev/null
fi
DEPLOY_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

STAGING_FN_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:${FUNCTION_STAGING}"
PROD_FN_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:${FUNCTION_PROD}"
PERMISSIONS_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration"
    ],
    "Resource": ["$STAGING_FN_ARN", "$PROD_FN_ARN"]
  }]
}
JSON
)
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "deploy-yuvanext-lambda" \
  --policy-document "$PERMISSIONS_POLICY" >/dev/null
echo "Deploy role ready: $DEPLOY_ROLE_ARN"

# --- 3. Lambda execution role (what the functions themselves run as — CloudWatch Logs only) ---
LAMBDA_TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'
if aws iam get-role --role-name "$EXEC_ROLE_NAME" >/dev/null 2>&1; then
  echo "Role $EXEC_ROLE_NAME already exists, skipping."
else
  echo "Creating role $EXEC_ROLE_NAME..."
  aws iam create-role \
    --role-name "$EXEC_ROLE_NAME" \
    --assume-role-policy-document "$LAMBDA_TRUST_POLICY" \
    --description "Execution role for the yuvanext API Lambda functions" >/dev/null
  aws iam attach-role-policy \
    --role-name "$EXEC_ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" >/dev/null
  echo "Waiting for role propagation..."
  sleep 10
fi
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${EXEC_ROLE_NAME}"

# --- 4. The two Lambda functions themselves, with a placeholder handler ---
PLACEHOLDER_DIR="./.aws-bootstrap-tmp"
rm -rf "$PLACEHOLDER_DIR"
mkdir -p "$PLACEHOLDER_DIR"
cat > "$PLACEHOLDER_DIR/lambda.mjs" <<'JS'
export const handler = async () => ({
  statusCode: 503,
  body: JSON.stringify({ status: "not_deployed", message: "Waiting for the first deploy.yml run." }),
});
JS
if command -v zip >/dev/null 2>&1; then
  (cd "$PLACEHOLDER_DIR" && zip -q placeholder.zip lambda.mjs)
elif command -v powershell.exe >/dev/null 2>&1; then
  # Git Bash on Windows typically has no `zip` on PATH; fall back to PowerShell's equivalent.
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path '$(cygpath -w "$PLACEHOLDER_DIR/lambda.mjs" 2>/dev/null || echo "$PLACEHOLDER_DIR/lambda.mjs")' -DestinationPath '$(cygpath -w "$PLACEHOLDER_DIR/placeholder.zip" 2>/dev/null || echo "$PLACEHOLDER_DIR/placeholder.zip")' -Force"
else
  echo "Need either a 'zip' binary or powershell.exe on PATH to build the placeholder package." >&2
  exit 1
fi

create_function_if_missing() {
  local name="$1"
  if aws lambda get-function --function-name "$name" >/dev/null 2>&1; then
    echo "Function $name already exists, skipping."
    return
  fi
  echo "Creating function $name..."
  aws lambda create-function \
    --function-name "$name" \
    --runtime nodejs22.x \
    --role "$EXEC_ROLE_ARN" \
    --handler "lambda.handler" \
    --timeout 30 \
    --memory-size 512 \
    --zip-file "fileb://$PLACEHOLDER_DIR/placeholder.zip" \
    --environment "Variables={NODE_ENV=production,COUNSELOR_RUNTIME=unconfigured}" >/dev/null
  aws lambda wait function-active --function-name "$name"

  echo "Creating Function URL for $name..."
  local url
  url=$(aws lambda create-function-url-config \
    --function-name "$name" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"]}' \
    --query FunctionUrl --output text)

  aws lambda add-permission \
    --function-name "$name" \
    --statement-id "FunctionURLAllowPublicAccess" \
    --action "lambda:InvokeFunctionUrl" \
    --principal "*" \
    --function-url-auth-type NONE >/dev/null

  echo "  URL: $url"
}

create_function_if_missing "$FUNCTION_STAGING"
create_function_if_missing "$FUNCTION_PROD"
rm -rf "$PLACEHOLDER_DIR"

echo
echo "Done. GitHub Environment values (see infra/README.md for the full list):"
echo "  AWS_DEPLOY_ROLE_ARN = $DEPLOY_ROLE_ARN"
echo "  AWS_REGION          = $AWS_REGION"
echo "  staging LAMBDA_FUNCTION_NAME = $FUNCTION_STAGING"
echo "  staging LAMBDA_FUNCTION_URL  = $(aws lambda get-function-url-config --function-name "$FUNCTION_STAGING" --query FunctionUrl --output text)"
echo "  production LAMBDA_FUNCTION_NAME = $FUNCTION_PROD"
echo "  production LAMBDA_FUNCTION_URL  = $(aws lambda get-function-url-config --function-name "$FUNCTION_PROD" --query FunctionUrl --output text)"
