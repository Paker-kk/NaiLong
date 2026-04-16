/**
 * 奶娃 Tile 渲染视图组件
 *
 * 核心渲染流水线（WebGL2 实例化渲染版）：
 * 1. 从输入源（摄像头/图片/视频）获取当前帧
 * 2. 缩放到低分辨率隐藏 Canvas，获取像素数据
 * 3. JS 侧计算灰度 → tile 索引 + 颜色打包到 Float32Array
 * 4. GPU 一次 instanced draw call 渲染所有 tiles
 * 5. 动画特效模式下回退到 Canvas 2D（动画帧序列尚未上传图集）
 *
 * 性能提升：~15,000+ ctx.drawImage → 1 gl.drawElementsInstanced
 */

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import {
    AsciiRendererHandle,
    AsciiSettings,
    EffectState,
    InputSource,
    ProcessingStats,
    TileAssetLibrary,
} from '../types/types'
import { adjustColor, getLuminance } from '../utils/asciiUtils'
import { WebGLTileRenderer } from '../utils/webglTileRenderer'

interface TileViewProps {
    settings: AsciiSettings
    inputSource: InputSource
    tileLibrary: TileAssetLibrary | null
    effectState: EffectState
    effectFrame: number
    onStatsUpdate: (stats: ProcessingStats) => void
    canvasSize: { width: number; height: number }
}

const TileView = forwardRef<AsciiRendererHandle, TileViewProps>(
    (
        { settings, inputSource, tileLibrary, effectState, effectFrame, onStatsUpdate, canvasSize },
        ref,
    ) => {
        const videoRef = useRef<HTMLVideoElement>(null)
        const canvasRef = useRef<HTMLCanvasElement>(null)
        const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)
        const imageRef = useRef<HTMLImageElement>(null)
        const lastTimeRef = useRef<number>(0)
        const animationIdRef = useRef<number | null>(null)
        const glRendererRef = useRef<WebGLTileRenderer | null>(null)
        const atlasBuiltRef = useRef(false)

        // 暴露给父组件的方法
        useImperativeHandle(ref, () => ({
            getCanvas: () => canvasRef.current,

            captureImage: async () => {
                if (!tileLibrary?.loaded) throw new Error('Tile library not loaded')

                const sourceElement = getSourceElement()
                if (!sourceElement) throw new Error('No input source available')

                const scaleFactor = 4
                const tileSize = tileLibrary.tileSize
                const tilesX = Math.floor(canvasSize.width / settings.fontSize)
                const tilesY = Math.floor(canvasSize.height / settings.fontSize)

                if (tilesX <= 0 || tilesY <= 0) throw new Error('Invalid tile grid dimensions')

                // 高清导出 Canvas
                const exportCanvas = document.createElement('canvas')
                exportCanvas.width = tilesX * tileSize * (scaleFactor / 2)
                exportCanvas.height = tilesY * tileSize * (scaleFactor / 2)
                const exportCtx = exportCanvas.getContext('2d', { alpha: false })!

                // 分析 Canvas
                const analysisCanvas = document.createElement('canvas')
                analysisCanvas.width = tilesX
                analysisCanvas.height = tilesY
                const analysisCtx = analysisCanvas.getContext('2d')!

                analysisCtx.drawImage(sourceElement, 0, 0, tilesX, tilesY)
                const imageData = analysisCtx.getImageData(0, 0, tilesX, tilesY)
                const pixels = imageData.data

                exportCtx.fillStyle = '#000000'
                exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)

                const exportTileSize = tileSize * (scaleFactor / 2)

                for (let i = 0; i < tilesX * tilesY; i++) {
                    const r = pixels[i * 4]
                    const g = pixels[i * 4 + 1]
                    const b = pixels[i * 4 + 2]

                    let l = getLuminance(r, g, b)
                    l = adjustColor(l, settings.contrast, settings.brightness)
                    const safeL = Math.max(
                        0,
                        Math.min(255, Math.floor(settings.invert ? 255 - l : l)),
                    )

                    const tileIdx = tileLibrary.brightnessMap[safeL]
                    const tile = tileLibrary.sortedTiles[tileIdx]

                    const x = (i % tilesX) * exportTileSize
                    const y = Math.floor(i / tilesX) * exportTileSize

                    if (settings.colorMode) {
                        // 彩色模式：绘制 tile 后叠加原色着色
                        exportCtx.drawImage(tile.image, x, y, exportTileSize, exportTileSize)
                        exportCtx.globalCompositeOperation = 'multiply'
                        exportCtx.fillStyle = `rgb(${r},${g},${b})`
                        exportCtx.fillRect(x, y, exportTileSize, exportTileSize)
                        exportCtx.globalCompositeOperation = 'source-over'
                    } else {
                        exportCtx.drawImage(tile.image, x, y, exportTileSize, exportTileSize)
                    }
                }

                return exportCanvas.toDataURL('image/png')
            },

            getAsciiText: () => {
                // 兼容保留：返回字母文本表示
                if (!tileLibrary?.loaded) return ''
                const sourceElement = getSourceElement()
                if (!sourceElement) return ''

                const standardWidth = 150
                const sourceW =
                    (sourceElement as HTMLVideoElement).videoWidth ||
                    (sourceElement as HTMLImageElement).naturalWidth ||
                    canvasSize.width
                const sourceH =
                    (sourceElement as HTMLVideoElement).videoHeight ||
                    (sourceElement as HTMLImageElement).naturalHeight ||
                    canvasSize.height
                const aspectRatio = sourceH / sourceW
                const standardHeight = Math.max(1, Math.floor(standardWidth * aspectRatio * 0.55))

                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = standardWidth
                tempCanvas.height = standardHeight
                const tempCtx = tempCanvas.getContext('2d')!

                tempCtx.drawImage(sourceElement, 0, 0, standardWidth, standardHeight)
                const imageData = tempCtx.getImageData(0, 0, standardWidth, standardHeight)
                const pixels = imageData.data

                let text = ''
                for (let y = 0; y < standardHeight; y++) {
                    for (let x = 0; x < standardWidth; x++) {
                        const idx = (y * standardWidth + x) * 4
                        let l = getLuminance(pixels[idx], pixels[idx + 1], pixels[idx + 2])
                        l = adjustColor(l, settings.contrast, settings.brightness)
                        const safeL = Math.max(
                            0,
                            Math.min(255, Math.floor(settings.invert ? 255 - l : l)),
                        )
                        const tileIdx = tileLibrary.brightnessMap[safeL]
                        text += tileLibrary.sortedTiles[tileIdx].letter
                    }
                    text += '\n'
                }
                return text
            },
        }))

        /** 获取当前活跃的输入源 DOM 元素 */
        const getSourceElement = useCallback((): HTMLVideoElement | HTMLImageElement | null => {
            if (inputSource.type === 'camera' || inputSource.type === 'video') {
                const video = videoRef.current
                if (video && video.readyState >= 2) return video
                return null
            }
            if (inputSource.type === 'image') {
                const img = imageRef.current
                if (img && img.complete && img.naturalWidth > 0) return img
                return null
            }
            return null
        }, [inputSource.type])

        /** 核心渲染循环 */
        const renderFrame = useCallback(
            (time: number) => {
                const startRender = performance.now()
                const delta = time - lastTimeRef.current
                lastTimeRef.current = time
                const fps = delta > 0 ? 1000 / delta : 0

                const canvas = canvasRef.current
                if (!canvas || !tileLibrary?.loaded) {
                    animationIdRef.current = requestAnimationFrame(renderFrame)
                    return
                }

                const sourceElement = getSourceElement()
                if (!sourceElement) {
                    animationIdRef.current = requestAnimationFrame(renderFrame)
                    return
                }

                const fontScale = settings.fontSize || 10
                const tilesX = Math.floor(canvasSize.width / fontScale)
                const tilesY = Math.floor(canvasSize.height / fontScale)

                if (tilesX <= 0 || tilesY <= 0) {
                    animationIdRef.current = requestAnimationFrame(renderFrame)
                    return
                }

                // 更新隐藏 Canvas 尺寸
                const hiddenCanvas = hiddenCanvasRef.current
                if (!hiddenCanvas) {
                    animationIdRef.current = requestAnimationFrame(renderFrame)
                    return
                }
                if (hiddenCanvas.width !== tilesX || hiddenCanvas.height !== tilesY) {
                    hiddenCanvas.width = tilesX
                    hiddenCanvas.height = tilesY
                }

                const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true })
                if (!hiddenCtx) {
                    animationIdRef.current = requestAnimationFrame(renderFrame)
                    return
                }

                // 将输入源绘制到低分辨率 Canvas 获取像素数据
                try {
                    hiddenCtx.drawImage(sourceElement, 0, 0, tilesX, tilesY)
                } catch {
                    animationIdRef.current = requestAnimationFrame(renderFrame)
                    return
                }

                const pixels = hiddenCtx.getImageData(0, 0, tilesX, tilesY).data

                const { contrast, brightness: brightnessOffset, colorMode, invert } = settings
                const isAnimating = effectState === 'playing'

                // ===== 路径选择：动画走 Canvas 2D 回退，其他走 WebGL2 =====
                if (isAnimating) {
                    // Canvas 2D 回退路径（动画帧序列不在图集中）
                    const renderWidth = tilesX * fontScale
                    const renderHeight = tilesY * fontScale
                    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
                        canvas.width = renderWidth
                        canvas.height = renderHeight
                    }
                    const ctx = canvas.getContext('2d', { alpha: false })
                    if (!ctx) {
                        animationIdRef.current = requestAnimationFrame(renderFrame)
                        return
                    }
                    ctx.fillStyle = '#000000'
                    ctx.fillRect(0, 0, canvas.width, canvas.height)

                    const pixelCount = tilesX * tilesY
                    for (let i = 0; i < pixelCount; i++) {
                        const r = pixels[i * 4]
                        const g = pixels[i * 4 + 1]
                        const b = pixels[i * 4 + 2]
                        let l = 0.299 * r + 0.587 * g + 0.114 * b
                        if (contrast !== 1.0 || brightnessOffset !== 0) {
                            l = adjustColor(l, contrast, brightnessOffset)
                        }
                        const safeL = Math.max(0, Math.min(255, Math.floor(invert ? 255 - l : l)))
                        const tileIdx = tileLibrary.brightnessMap[safeL]
                        const tile = tileLibrary.sortedTiles[tileIdx]
                        const x = ((i % tilesX) * fontScale) | 0
                        const y = (((i / tilesX) | 0) * fontScale) | 0

                        let tileImage: HTMLImageElement | HTMLCanvasElement = tile.image
                        if (tile.animationFrames && tile.animationFrames.length > 0) {
                            const frameIdx = Math.min(effectFrame, tile.animationFrames.length - 1)
                            tileImage = tile.animationFrames[frameIdx]
                        }
                        ctx.drawImage(tileImage, x, y, fontScale, fontScale)
                        if (colorMode) {
                            ctx.globalCompositeOperation = 'multiply'
                            ctx.fillStyle = `rgb(${r},${g},${b})`
                            ctx.fillRect(x, y, fontScale, fontScale)
                            ctx.globalCompositeOperation = 'source-over'
                        }
                    }
                } else {
                    // ===== WebGL2 快速路径 =====
                    // 懒初始化 WebGL 渲染器
                    if (!glRendererRef.current) {
                        try {
                            glRendererRef.current = new WebGLTileRenderer(canvas)
                        } catch {
                            // WebGL2 不可用，回退到 Canvas 2D
                            animationIdRef.current = requestAnimationFrame(renderFrame)
                            return
                        }
                    }
                    // 首次或素材变化时构建图集
                    if (!atlasBuiltRef.current) {
                        glRendererRef.current.buildAtlas(tileLibrary)
                        atlasBuiltRef.current = true
                    }

                    glRendererRef.current.render(
                        pixels,
                        tilesX,
                        tilesY,
                        fontScale,
                        tileLibrary.brightnessMap,
                        contrast,
                        brightnessOffset,
                        invert,
                        colorMode,
                    )
                }

                const endRender = performance.now()

                // 每 ~5% 帧更新一次性能统计
                if (Math.random() > 0.95) {
                    onStatsUpdate({ fps, renderTime: endRender - startRender })
                }

                // 对于静态图片输入，不需要持续渲染
                if (inputSource.type === 'image' && !isAnimating) {
                    return
                }

                animationIdRef.current = requestAnimationFrame(renderFrame)
            },
            [
                settings,
                canvasSize,
                tileLibrary,
                effectState,
                effectFrame,
                getSourceElement,
                inputSource.type,
                onStatsUpdate,
            ],
        )

        // 摄像头流处理
        useEffect(() => {
            if (inputSource.type !== 'camera' || !inputSource.stream) return

            const video = videoRef.current
            if (!video) return

            video.srcObject = inputSource.stream
            video.play()

            animationIdRef.current = requestAnimationFrame(renderFrame)

            return () => {
                if (animationIdRef.current !== null) {
                    cancelAnimationFrame(animationIdRef.current)
                }
            }
        }, [inputSource, renderFrame])

        // 视频文件处理
        useEffect(() => {
            if (inputSource.type !== 'video' || !inputSource.url) return

            const video = videoRef.current
            if (!video) return

            video.srcObject = null
            video.src = inputSource.url

            // 加载视频并停在首帧
            video.load()
            video.onloadeddata = () => {
                video.currentTime = 0
                // 首帧加载后渲染一次
                animationIdRef.current = requestAnimationFrame(renderFrame)

                if (inputSource.videoPlaying) {
                    video.play()
                }
            }

            if (inputSource.videoPlaying) {
                animationIdRef.current = requestAnimationFrame(renderFrame)
            }

            return () => {
                if (animationIdRef.current !== null) {
                    cancelAnimationFrame(animationIdRef.current)
                }
            }
        }, [inputSource, renderFrame])

        // 图片文件处理
        useEffect(() => {
            if (inputSource.type !== 'image' || !inputSource.url) return

            const img = imageRef.current
            if (!img) return

            img.src = inputSource.url
            img.onload = () => {
                // 图片加载后渲染一次
                animationIdRef.current = requestAnimationFrame(renderFrame)
            }

            return () => {
                if (animationIdRef.current !== null) {
                    cancelAnimationFrame(animationIdRef.current)
                }
            }
        }, [inputSource, renderFrame])

        // 动画播放时持续渲染
        useEffect(() => {
            if (effectState === 'playing') {
                animationIdRef.current = requestAnimationFrame(renderFrame)
            }
            return () => {
                if (animationIdRef.current !== null && effectState !== 'playing') {
                    cancelAnimationFrame(animationIdRef.current)
                }
            }
        }, [effectState, effectFrame, renderFrame])

        // 设置变化时重新渲染静态图片
        useEffect(() => {
            if (inputSource.type === 'image' && imageRef.current?.complete) {
                animationIdRef.current = requestAnimationFrame(renderFrame)
            }
        }, [settings, inputSource.type, renderFrame])

        // 素材库变化时重建图集
        useEffect(() => {
            if (tileLibrary?.loaded) {
                atlasBuiltRef.current = false // 下一帧自动重建
            }
        }, [tileLibrary])

        // 组件卸载时释放 WebGL 资源
        useEffect(() => {
            return () => {
                if (glRendererRef.current) {
                    glRendererRef.current.destroy()
                    glRendererRef.current = null
                }
            }
        }, [])

        return (
            <div className="h-screen w-screen -z-10 flex justify-center items-center">
                {/* 视频元素（摄像头和视频文件共用） */}
                <video ref={videoRef} className="hidden" playsInline muted />
                {/* 图片元素（图片上传） */}
                <img ref={imageRef} className="hidden" alt="input source" />
                {/* 隐藏的分析 Canvas */}
                <canvas ref={hiddenCanvasRef} className="hidden -z-10" />
                {/* 可见的渲染 Canvas */}
                <canvas
                    ref={canvasRef}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    className="bg-transparent -z-10"
                />
            </div>
        )
    },
)

TileView.displayName = 'TileView'

export default memo(TileView)
