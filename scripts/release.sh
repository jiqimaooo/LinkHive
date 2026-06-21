#!/bin/bash
# LinkHive Release Script
# 用法: ./scripts/release.sh V2.8
# 自动生成 tag: V2.8 (20250621) 并发布到 GitHub
set -e

VERSION="${1:?请指定版本号，例如: V2.8}"
DATE=$(date +%Y%m%d)
TAG="V${VERSION#V}-${DATE}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 构建前端 ==="
cd "${PROJECT_ROOT}/frontend"
pnpm install --frozen-lockfile
pnpm build

echo ""
echo "=== 打包 ==="
TEMP_DIR=$(mktemp -d)
ZIP_NAME="LinkHive-${TAG}.zip"
mkdir -p "${TEMP_DIR}/LinkHive-${TAG}"
cp -r "${PROJECT_ROOT}/deploy" "${TEMP_DIR}/LinkHive-${TAG}/"
cp "${PROJECT_ROOT}/README.md" "${TEMP_DIR}/LinkHive-${TAG}/" 2>/dev/null || true
cp "${PROJECT_ROOT}/LICENSE" "${TEMP_DIR}/LinkHive-${TAG}/" 2>/dev/null || true
cd "${TEMP_DIR}"
zip -rq "${ZIP_NAME}" "LinkHive-${TAG}"

echo ""
echo "=== 创建 Release: ${TAG} ==="
gh release create "${TAG}" \
  "${TEMP_DIR}/${ZIP_NAME}" \
  --title "${TAG}" \
  --notes "LinkHive ${TAG}"

echo ""
echo "=== 清理 ==="
rm -rf "${TEMP_DIR}"

echo ""
echo "✅ 发布完成: ${TAG}"
echo "   https://github.com/jiqimaooo/LinkHive/releases/tag/$(echo "${TAG}" | sed 's/ /%20/g;s/(/%28/g;s/)/%29/g')"
