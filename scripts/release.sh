#!/bin/bash
# LinkHive Release Script
# 用法: ./scripts/release.sh V2.6
# Tag 格式: V2.6 (20250621)

set -e

VERSION="${1:?请指定版本号，例如: V2.6}"
DATE=$(date +%Y%m%d)
TAG="${VERSION} (${DATE})"

echo "=== 构建前端 ==="
cd "$(dirname "$0")/../frontend"
pnpm install --frozen-lockfile
pnpm build

echo ""
echo "=== 打包发布文件 ==="
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_DIR=$(mktemp -d)
DIST_NAME="LinkHive-${TAG}"

mkdir -p "${TEMP_DIR}/${DIST_NAME}"
cp -r "${PROJECT_ROOT}/deploy" "${TEMP_DIR}/${DIST_NAME}/"
cp "${PROJECT_ROOT}/README.md" "${TEMP_DIR}/${DIST_NAME}/"
cp "${PROJECT_ROOT}/LICENSE" "${TEMP_DIR}/${DIST_NAME}/" 2>/dev/null || true

cd "${TEMP_DIR}"
zip -r "${DIST_NAME}.zip" "${DIST_NAME}"

echo ""
echo "=== 发布包已生成 ==="
echo "  ${TEMP_DIR}/${DIST_NAME}.zip"
echo ""
echo "=== 创建 GitHub Release ==="
echo "请手动执行:"
echo "  gh release create \"${TAG}\" \"${TEMP_DIR}/${DIST_NAME}.zip\" --title \"${TAG}\" --notes \"LinkHive ${TAG}\""
echo ""
echo "或使用以下命令自动创建:"
echo "  gh release create \"${TAG}\" \"${TEMP_DIR}/${DIST_NAME}.zip\" --title \"${TAG}\" --notes \"LinkHive ${TAG}\" --generate-notes"
