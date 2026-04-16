#!/usr/bin/env bash
# 将 MediaPipe WASM 文件上传到 Cloudflare R2
# 前置条件：安装 wrangler 并登录（npx wrangler login）
#
# 使用方法：
#   1. 创建 R2 桶：npx wrangler r2 bucket create naiwa-assets
#   2. 开启公共访问：CF Dashboard → R2 → naiwa-assets → Settings → Public access
#   3. 运行此脚本：bash scripts/upload-wasm-to-r2.sh

set -euo pipefail

BUCKET="naiwa-assets"
WASM_DIR="node_modules/@mediapipe/tasks-vision/wasm"

echo "📦 Uploading MediaPipe WASM to R2 bucket: $BUCKET"

for file in "$WASM_DIR"/*; do
    filename=$(basename "$file")
    echo "  → mediapipe/wasm/$filename"
    npx wrangler r2 object put "$BUCKET/mediapipe/wasm/$filename" --file "$file"
done

echo "✅ Done. Update .env.production with your R2 public URL."
