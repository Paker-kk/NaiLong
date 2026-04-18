import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** MediaPipe WASM 处理插件：dev 拷到 public/，build 拷到 dist/ */
function mediapipeWasmPlugin() {
    const wasmSrc = resolve('node_modules/@mediapipe/tasks-vision/wasm')
    return {
        name: 'mediapipe-wasm',
        configureServer() {
            const dest = resolve('public/mediapipe/wasm')
            if (!existsSync(dest)) {
                mkdirSync(dest, { recursive: true })
                cpSync(wasmSrc, dest, { recursive: true })
            }
        },
        closeBundle() {
            const dest = resolve('dist/mediapipe/wasm')
            mkdirSync(dest, { recursive: true })
            cpSync(wasmSrc, dest, { recursive: true })
        },
    }
}

// https://vite.dev/config/
export default defineConfig({
    base: '/NaiLong/',
    plugins: [react(), tailwindcss(), mediapipeWasmPlugin()],
})
