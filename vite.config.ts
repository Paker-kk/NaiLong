import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** 开发模式下将 node_modules 中的 MediaPipe WASM 拷贝到 public，供本地 dev server 使用 */
function mediapipeDevCopyPlugin() {
    return {
        name: 'copy-mediapipe-wasm-dev',
        configureServer() {
            const wasmSrc = resolve('node_modules/@mediapipe/tasks-vision/wasm')
            const wasmDest = resolve('public/mediapipe/wasm')
            if (!existsSync(wasmDest)) {
                mkdirSync(wasmDest, { recursive: true })
                cpSync(wasmSrc, wasmDest, { recursive: true })
            }
        },
    }
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss(), mediapipeDevCopyPlugin()],
})
