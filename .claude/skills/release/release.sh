#!/usr/bin/env bash
# release.sh — 版本发布脚本
# 用法: bash release.sh [--dry-run] <patch|minor|major>
#   --dry-run: 只预览，不实际修改文件

set -euo pipefail

DRY_RUN=false
BUMP=""

# --- Parse args ---
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    patch|minor|major) BUMP="$arg" ;;
  esac
done

if [ -z "$BUMP" ]; then
  echo "用法: bash release.sh [--dry-run] <patch|minor|major>" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$PROJECT_ROOT"

# --- 1. 读取当前版本 ---
CURRENT_CARGO=$(grep -m1 '^version' src-tauri/Cargo.toml | sed 's/.*"\(.*\)".*/\1/')
CURRENT_NPM=$(node -e "console.log(require('./frontend/package.json').version)")

if [ "$CURRENT_CARGO" != "$CURRENT_NPM" ]; then
  echo "错误: Cargo.toml ($CURRENT_CARGO) 和 package.json ($CURRENT_NPM) 版本不一致！请先手动同步。" >&2
  exit 1
fi

echo "当前版本: $CURRENT_CARGO"

# --- 2. 计算新版本 ---
IFS='.' read -r major minor patch <<< "$CURRENT_CARGO"

case "$BUMP" in
  major)
    major=$((major + 1))
    minor=0
    patch=0
    ;;
  minor)
    minor=$((minor + 1))
    patch=0
    ;;
  patch)
    patch=$((patch + 1))
    ;;
esac

NEW_VERSION="$major.$minor.$patch"
echo "新版本: $NEW_VERSION"
echo "类型: $BUMP"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "[DRY RUN] 将执行以下操作:"
  echo "  1. 更新 Cargo.toml: $CURRENT_CARGO → $NEW_VERSION"
  echo "  2. 更新 Cargo.lock"
  echo "  3. 更新 frontend/package.json: $CURRENT_CARGO → $NEW_VERSION"
  echo "  4. npm --prefix frontend install (更新 package-lock.json)"
  echo "  5. 检查 git 状态"
  echo "  6. 生成 CHANGELOG 预览"
fi

# --- 3. 生成 changelog ---
echo ""
echo "--- CHANGELOG (自上次 tag 以来的 commits) ---"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  git log "$LAST_TAG..HEAD" --oneline --no-merges 2>/dev/null || echo "(无新 commits)"
else
  git log --oneline --no-merges -20
fi
echo "---"

# --- 4. 检查工作区 ---
if ! git diff --quiet 2>/dev/null; then
  echo ""
  echo "警告: 工作区有未提交的更改，请先提交或暂存。" >&2
  if [ "$DRY_RUN" = false ]; then
    exit 1
  fi
fi

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "[DRY RUN] 完成。使用 'bash release.sh $BUMP' 执行真实发版。"
  exit 0
fi

# --- 5. 更新版本号 ---
echo ""

# Cargo.toml
sed -i "s/^version = \"$CURRENT_CARGO\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
echo "已更新: src-tauri/Cargo.toml"

# package.json
node -e "
const pkg = require('./frontend/package.json');
pkg.version = '$NEW_VERSION';
require('fs').writeFileSync('./frontend/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "已更新: frontend/package.json"

# Cargo.lock
if command -v cargo >/dev/null 2>&1; then
  cargo check --manifest-path src-tauri/Cargo.toml 2>/dev/null || true
  echo "已更新: Cargo.lock (via cargo check)"
fi

# package-lock.json
npm --prefix frontend install --ignore-scripts 2>/dev/null || true
echo "已更新: frontend/package-lock.json (via npm install)"

# --- 6. 构建验证 ---
echo ""
echo "运行构建验证..."
if cargo check --manifest-path src-tauri/Cargo.toml 2>&1; then
  echo "cargo check: PASS"
else
  echo "cargo check: FAIL — 请修复后再发布" >&2
  exit 1
fi

if npm --prefix frontend run build 2>&1; then
  echo "npm run build: PASS"
else
  echo "npm run build: FAIL — 请修复后再发布" >&2
  exit 1
fi

# --- 7. 提交与打 tag ---
echo ""
echo "--- 提交与打 tag ---"
TAG="v$NEW_VERSION"

git add src-tauri/Cargo.toml src-tauri/Cargo.lock frontend/package.json frontend/package-lock.json
git commit -m "release: $NEW_VERSION

版本升级: $BUMP ($CURRENT_CARGO → $NEW_VERSION)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

git tag -a "$TAG" -m "Release $TAG"

echo ""
echo "============================================"
echo "  Release $NEW_VERSION 完成！"
echo "  Tag: $TAG"
echo "============================================"
echo ""
echo "下一步:"
echo "  git push origin master"
echo "  git push origin $TAG"
echo ""
