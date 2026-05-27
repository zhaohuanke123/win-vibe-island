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

# gh CLI 路径（Windows 下可能不在 PATH 中）
GH="gh"
if command -v gh >/dev/null 2>&1; then
  GH="gh"
elif [ -f "/c/Program Files/GitHub CLI/gh.exe" ]; then
  GH="/c/Program Files/GitHub CLI/gh.exe"
fi

REPO="zhaohuanke123/win-vibe-island"

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

# --- 3. 生成 changelog ---
echo ""
echo "--- CHANGELOG (自上次 tag 以来的 commits) ---"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  CHANGELOG=$(git log "$LAST_TAG..HEAD" --oneline --no-merges 2>/dev/null || echo "(无新 commits)")
else
  CHANGELOG=$(git log --oneline --no-merges -20)
fi
echo "$CHANGELOG"
echo "---"

# 生成 GitHub Release 用的 markdown body
generate_release_body() {
  local commits="$1"
  local version="$2"

  echo "## Vibe Island v$version"
  echo ""

  # 统计 commit 数和文件变更
  local commit_count=$(echo "$commits" | grep -c . 2>/dev/null || echo "0")
  local stat=$(git diff --stat "$LAST_TAG..HEAD" 2>/dev/null | tail -1 || echo "")
  echo "$commit_count commits${stat:+ | $stat}"
  echo ""

  echo "### Changes"
  echo ""
  echo "$commits" | while read -r line; do
    echo "- $line"
  done
}

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "[DRY RUN] 将执行以下操作:"
  echo "  1. 更新 Cargo.toml: $CURRENT_CARGO → $NEW_VERSION"
  echo "  2. 更新 Cargo.lock"
  echo "  3. 更新 frontend/package.json: $CURRENT_CARGO → $NEW_VERSION"
  echo "  4. npm --prefix frontend install (更新 package-lock.json)"
  echo "  5. 检查 git 状态"
  echo "  6. 生成 CHANGELOG 预览"
  echo "  7. 构建安装包 (cargo tauri build)"
  echo "  8. 创建 GitHub Release + 上传安装包"
  echo ""
  echo "--- GitHub Release 预览 ---"
  generate_release_body "$CHANGELOG" "$NEW_VERSION"
  echo "---"
  echo ""
  echo "[DRY RUN] 完成。使用 'bash release.sh $BUMP' 执行真实发版。"
  exit 0
fi

# --- 4. 检查工作区 ---
if ! git diff --quiet 2>/dev/null; then
  echo ""
  echo "警告: 工作区有未提交的更改，请先提交或暂存。" >&2
  exit 1
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

# --- 8. Push ---
echo ""
echo "--- Push ---"
git push origin master
git push origin "$TAG"
echo "已推送 master + $TAG"

# --- 9. 构建安装包 ---
echo ""
echo "--- 构建安装包 (cargo tauri build) ---"
cargo tauri build 2>&1
echo "构建完成"

# 查找 NSIS 安装包
INSTALLER=""
for dir in src-tauri/target/release/bundle/nsis src-tauri/target/release/bundle/msi; do
  if [ -d "$dir" ]; then
    INSTALLER=$(find "$dir" -name "*.exe" -o -name "*.msi" 2>/dev/null | head -1)
    [ -n "$INSTALLER" ] && break
  fi
done

if [ -z "$INSTALLER" ]; then
  echo "警告: 未找到安装包文件" >&2
else
  echo "安装包: $INSTALLER"
fi

# --- 10. 创建 GitHub Release ---
echo ""
echo "--- 创建 GitHub Release ---"
RELEASE_BODY=$(generate_release_body "$CHANGELOG" "$NEW_VERSION")

CREATE_ARGS=(
  "$TAG"
  --repo "$REPO"
  --title "Vibe Island v$NEW_VERSION"
  --notes "$RELEASE_BODY"
)

if [ -n "$INSTALLER" ]; then
  CREATE_ARGS+=("$INSTALLER")
fi

if $GH release create "${CREATE_ARGS[@]}" 2>&1; then
  echo "GitHub Release 创建成功: https://github.com/$REPO/releases/tag/$TAG"
else
  echo "警告: GitHub Release 创建失败，请手动创建" >&2
fi

echo ""
echo "============================================"
echo "  Release $NEW_VERSION 完成！"
echo "  Tag: $TAG"
echo "  https://github.com/$REPO/releases/tag/$TAG"
echo "============================================"
echo ""
