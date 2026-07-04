#!/usr/bin/env bash
# S3(퍼블릭 차단) + CloudFront(OAC) 배포. 최초 실행 시 인프라 생성, 이후 sync만.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=$(aws configure get region || echo "us-east-1")
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="masterpieces-reborn-${ACCOUNT}"
STATE=".deploy-state.json"   # 배포 인프라 ID 저장 (gitignore)

if [ ! -f "$STATE" ]; then
  echo "== 최초 배포: 인프라 생성 =="
  # 멱등 가드: STATE가 없는데 버킷이 이미 있으면 자동 복구 대신 명시적 안내 (안전 우선)
  if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
    echo "오류: 버킷 ${BUCKET}이 이미 존재하지만 ${STATE}가 없습니다."
    echo "기존 배포의 .deploy-state.json을 복원하거나, CloudFront 콘솔에서 distId/domain을 확인해 수동 작성하세요."
    exit 1
  fi
  # 1) S3 버킷 (퍼블릭 차단 유지)
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  # 2) Origin Access Control
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=masterpieces-reborn-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' --output text)

  # 3) CloudFront 배포
  DIST_JSON=$(aws cloudfront create-distribution --distribution-config "{
    \"CallerReference\": \"masterpieces-reborn-$(date +%s)\",
    \"Comment\": \"Masterpieces Reborn art exhibition\",
    \"Enabled\": true,
    \"DefaultRootObject\": \"index.html\",
    \"Origins\": { \"Quantity\": 1, \"Items\": [{
      \"Id\": \"s3origin\",
      \"DomainName\": \"${BUCKET}.s3.${REGION}.amazonaws.com\",
      \"OriginAccessControlId\": \"${OAC_ID}\",
      \"S3OriginConfig\": { \"OriginAccessIdentity\": \"\" }
    }]},
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"s3origin\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"Compress\": true
    },
    \"HttpVersion\": \"http2and3\",
    \"PriceClass\": \"PriceClass_200\"
  }")
  DIST_ID=$(echo "$DIST_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['Id'])")
  DOMAIN=$(echo "$DIST_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['DomainName'])")

  # 4) 버킷 정책: 이 배포의 CloudFront만 읽기 허용
  aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"AllowCloudFrontOAC\",
      \"Effect\": \"Allow\",
      \"Principal\": { \"Service\": \"cloudfront.amazonaws.com\" },
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::${BUCKET}/*\",
      \"Condition\": { \"StringEquals\": {
        \"AWS:SourceArn\": \"arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST_ID}\"
      }}
    }]
  }"
  printf '{"bucket":"%s","distId":"%s","domain":"%s"}\n' "$BUCKET" "$DIST_ID" "$DOMAIN" > "$STATE"
fi

DIST_ID=$(python3 -c "import json;print(json.load(open('$STATE'))['distId'])")
DOMAIN=$(python3 -c "import json;print(json.load(open('$STATE'))['domain'])")

echo "== 업로드 =="
# allowlist: 배포 대상만 명시적으로 포함 — 내부 아티팩트(.superpowers/.playwright-mcp 등)가
# 실수로 퍼블릭 CDN에 올라가는 것을 원천 차단. --delete는 include된 원격 객체만 정리 대상.
aws s3 sync . "s3://${BUCKET}" \
  --exclude "*" \
  --include "index.html" --include "css/*" --include "js/*" --include "assets/*" \
  --delete

echo "== 캐시 무효화 =="
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" > /dev/null

echo "URL: https://${DOMAIN}/"
