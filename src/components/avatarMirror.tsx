/**
 * AvatarMirror 组件：上下分屏 — 上方摄像头画面 + 下方匹配的奶娃表情图
 *
 * 核心流程：
 * Camera → MediaPipe FaceLandmarker → 52 Blendshapes → ExpressionClassifier → Avatar Image
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type {
    AsciiRendererHandle,
    AsciiSettings,
    AvatarAssetLibrary,
    ExpressionType,
    MediaPipeStatus,
    ProcessingStats,
} from '../types/types'
import { ExpressionClassifier } from '../utils/expressionClassifier'
import { detectFace, initFaceLandmarker, onMediaPipeStatusChange } from '../utils/mediaPipeService'
import { getExpressionLabel } from '../utils/avatarAssets'

interface AvatarMirrorProps {
    settings: AsciiSettings
    stream: MediaStream | null
    avatarLibrary: AvatarAssetLibrary
    onStatsUpdate: (stats: ProcessingStats) => void
    canvasSize: { width: number; height: number }
}

const AvatarMirror = forwardRef<AsciiRendererHandle, AvatarMirrorProps>(
    ({ stream, avatarLibrary, onStatsUpdate, canvasSize }, ref) => {
        const videoRef = useRef<HTMLVideoElement>(null)
        const cameraCanvasRef = useRef<HTMLCanvasElement>(null)
        const avatarCanvasRef = useRef<HTMLCanvasElement>(null)
        const classifierRef = useRef(new ExpressionClassifier())
        const animFrameRef = useRef<number>(0)
        const fpsRef = useRef({ frames: 0, lastTime: 0 })

        const [currentExpression, setCurrentExpression] = useState<ExpressionType>('neutral')
        const [confidence, setConfidence] = useState(0)
        const [mpStatus, setMpStatus] = useState<MediaPipeStatus>('idle')

        // 用 ref 持有最新表情，避免渲染循环依赖 state 导致频繁重挂载
        const currentExpressionRef = useRef<ExpressionType>('neutral')

        // 上下分屏：各占一半高度
        const halfHeight = Math.floor(canvasSize.height / 2)

        // 监听 MediaPipe 状态
        useEffect(() => {
            return onMediaPipeStatusChange(setMpStatus)
        }, [])

        // 初始化 MediaPipe（懒加载）
        useEffect(() => {
            initFaceLandmarker().catch(() => {
                /* 错误已在 service 中处理 */
            })
        }, [])

        // 连接摄像头到 video 元素
        useEffect(() => {
            const video = videoRef.current
            if (!video || !stream) return

            video.srcObject = stream
            video.play().catch(() => {
                /* 用户可能未授权 */
            })

            return () => {
                video.srcObject = null
            }
        }, [stream])

        // 核心渲染循环
        useEffect(() => {
            if (mpStatus !== 'ready') return

            const video = videoRef.current
            const cameraCanvas = cameraCanvasRef.current
            const avatarCanvas = avatarCanvasRef.current
            if (!video || !cameraCanvas || !avatarCanvas) return

            const cameraCtx = cameraCanvas.getContext('2d')
            const avatarCtx = avatarCanvas.getContext('2d')
            if (!cameraCtx || !avatarCtx) return

            let running = true
            fpsRef.current.lastTime = performance.now()
            fpsRef.current.frames = 0

            const renderLoop = () => {
                if (!running) return

                const startTime = performance.now()

                if (video.readyState >= 2) {
                    // === 上半屏：绘制摄像头画面 ===
                    const vw = video.videoWidth
                    const vh = video.videoHeight
                    if (vw > 0 && vh > 0) {
                        // 水平镜像（前置摄像头）
                        cameraCtx.save()
                        cameraCtx.scale(-1, 1)
                        cameraCtx.drawImage(
                            video,
                            -cameraCanvas.width,
                            0,
                            cameraCanvas.width,
                            cameraCanvas.height,
                        )
                        cameraCtx.restore()

                        // === MediaPipe 检测 ===
                        const result = detectFace(video, performance.now())
                        if (result?.faceBlendshapes?.[0]?.categories) {
                            const blendshapes = result.faceBlendshapes[0].categories
                            const exprResult = classifierRef.current.classify(blendshapes)
                            currentExpressionRef.current = exprResult.expression
                            setCurrentExpression(exprResult.expression)
                            setConfidence(exprResult.confidence)
                        }
                    }

                    // === 下半屏：绘制匹配的 Avatar 图片 ===
                    const asset = avatarLibrary.assets.get(currentExpressionRef.current)
                    if (asset) {
                        avatarCtx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height)

                        // 居中绘制、保持比例
                        const img = asset.image
                        const scale =
                            Math.min(
                                avatarCanvas.width / img.width,
                                avatarCanvas.height / img.height,
                            ) * 0.85 // 留点边距
                        const dw = img.width * scale
                        const dh = img.height * scale
                        const dx = (avatarCanvas.width - dw) / 2
                        const dy = (avatarCanvas.height - dh) / 2

                        avatarCtx.drawImage(img, dx, dy, dw, dh)
                    }
                }

                // FPS 统计
                fpsRef.current.frames++
                const now = performance.now()
                const elapsed = now - fpsRef.current.lastTime
                if (elapsed >= 1000) {
                    const fps = Math.round((fpsRef.current.frames * 1000) / elapsed)
                    const renderTime = Math.round(now - startTime)
                    onStatsUpdate({ fps, renderTime })
                    fpsRef.current.frames = 0
                    fpsRef.current.lastTime = now
                }

                animFrameRef.current = requestAnimationFrame(renderLoop)
            }

            animFrameRef.current = requestAnimationFrame(renderLoop)

            return () => {
                running = false
                cancelAnimationFrame(animFrameRef.current)
            }
        }, [mpStatus, avatarLibrary, onStatsUpdate])

        // 导出接口（兼容现有的截图/录制逻辑）
        const captureImage = useCallback(async () => {
            // 合并上下两个 canvas 为一张图
            const cameraCanvas = cameraCanvasRef.current
            const avatarCanvas = avatarCanvasRef.current
            if (!cameraCanvas || !avatarCanvas) return ''

            const combined = document.createElement('canvas')
            combined.width = canvasSize.width
            combined.height = canvasSize.height
            const ctx = combined.getContext('2d')
            if (!ctx) return ''

            ctx.drawImage(cameraCanvas, 0, 0)
            ctx.drawImage(avatarCanvas, 0, halfHeight)

            return combined.toDataURL('image/png')
        }, [canvasSize, halfHeight])

        useImperativeHandle(ref, () => ({
            captureImage,
            getAsciiText: () =>
                `Expression: ${currentExpression} (${(confidence * 100).toFixed(0)}%)`,
            getCanvas: () => cameraCanvasRef.current,
        }))

        return (
            <div
                className="relative flex flex-col"
                style={{ width: canvasSize.width, height: canvasSize.height }}
            >
                {/* 隐藏 video 元素 */}
                <video ref={videoRef} playsInline muted className="hidden" />

                {/* 上半屏：摄像头画面 */}
                <div className="relative" style={{ height: halfHeight }}>
                    <canvas
                        ref={cameraCanvasRef}
                        width={canvasSize.width}
                        height={halfHeight}
                        className="w-full h-full object-cover"
                    />
                    {/* 表情标签覆盖层 */}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-lg px-3 py-1.5 flex items-center gap-2">
                        <span className="text-xs font-mono text-green-400">
                            {getExpressionLabel(currentExpression)}
                        </span>
                        <span className="text-[10px] font-mono text-white/60">
                            {(confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>

                {/* 分隔线 */}
                <div className="h-0.5 bg-linear-to-r from-transparent via-purple-500 to-transparent" />

                {/* 下半屏：Avatar 匹配图 */}
                <div className="relative bg-black/30" style={{ height: halfHeight - 2 }}>
                    <canvas
                        ref={avatarCanvasRef}
                        width={canvasSize.width}
                        height={halfHeight - 2}
                        className="w-full h-full"
                    />
                    {/* 表情名称标签 */}
                    <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md rounded-lg px-3 py-1.5">
                        <span className="text-xs font-mono text-purple-400">
                            🐲 奶娃 · {getExpressionLabel(currentExpression)}
                        </span>
                    </div>
                </div>

                {/* MediaPipe 加载中覆盖层 */}
                {mpStatus === 'loading' && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 z-10">
                        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-purple-400 text-sm font-mono">AI 模型加载中...</span>
                        <span className="text-white/40 text-xs">首次加载需下载 ~10MB 模型文件</span>
                    </div>
                )}

                {/* MediaPipe 加载失败 */}
                {mpStatus === 'error' && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 z-10">
                        <span className="text-red-400 text-lg">⚠️</span>
                        <span className="text-red-400 text-sm font-mono">AI 模型加载失败</span>
                        <button
                            onClick={() => initFaceLandmarker()}
                            className="text-xs text-purple-400 border border-purple-500/50 rounded-full px-4 py-1 hover:bg-purple-500/20"
                        >
                            重试
                        </button>
                    </div>
                )}
            </div>
        )
    },
)

AvatarMirror.displayName = 'AvatarMirror'
export default AvatarMirror
