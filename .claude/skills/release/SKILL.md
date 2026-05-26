---
name: release
description: |
  版本发布流程。同步更新 Cargo.toml + package.json 版本号、生成 changelog、构建验证、打 tag、创建 GitHub Release。
  触发条件：
  - 用户要发版、发布新版本
  - "/release"、"发版"、"release"、"版本升级"
  - "bump version"、"打 tag"
  不要触发：与版本发布无关的功能开发
---

# 版本发布

使用 `.claude/skills/release/release.sh` 脚本完成版本发布。

## 用法

先 dry-run 预览：

```bash
bash .claude/skills/release/release.sh --dry-run <patch|minor|major>
```

确认无误后执行真实发版：

```bash
bash .claude/skills/release/release.sh <patch|minor|major>
```

## 脚本会做什么

1. 读取 `Cargo.toml` 和 `package.json` 当前版本，检查一致性
2. 计算新版本号，同步更新两个文件
3. 运行 `cargo check` + `npm run build` 验证
4. 从 `git log` 生成 changelog 摘要
5. `git commit` + `git tag`
6. `git push` master + tag
7. 通过 `gh release create` 创建 GitHub Release（含 changelog）
