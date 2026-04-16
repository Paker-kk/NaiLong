import { useCallback, useEffect, useRef, useState } from 'react'
import AsciiView from './components/asciiView'
import TileView from './components/tileView'
import AvatarMirror from './components/avatarMirror'
import Header from './components/header'
import Settings from './components/settings'
import {
    AsciiRendererHandle,
    AsciiSettings,
    AvatarAssetLibrary,
    CameraFacingMode,
    EffectState,
    InputSource,
    ProcessingStats,
    RenderMode,
    TileAssetLibrary,
} from './types/types'
import CameraControls from './components/cameraControls'
import { MdCancel } from 'react-icons/md'
import { getSupportedMediaRecorderMimeType } from './utils/mediaRecorder'
import { generatePlaceholderLibrary } from './utils/placeholderAssets'
import { AnimationEngine } from './utils/animationEngine'
import { generatePlaceholderAvatarLibrary } from './utils/avatarAssets'

function App() {
    const DEFAULT_SETTIGNS: AsciiSettings = {
        resolution: 0.2,
        fontSize: 10,
        contrast: 1.2,
        brightness: 0,
        colorMode: false,
        invert: false,
        characterSet: 'standard',
    }

    // ========== 核心状态 ==========
    const [renderMode, setRenderMode] = useState<RenderMode>('naiwa-tile')
    const [inputSource, setInputSource] = useState<InputSource>({ type: 'camera' })
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [settings, setSettings] = useState<AsciiSettings>(DEFAULT_SETTIGNS)
    const [facingMode, setFacingMode] = useState<CameraFacingMode>('user')
    const [isRecording, setIsRecording] = useState<boolean>(false)
    const [stats, setStats] = useState<ProcessingStats>({ fps: 0, renderTime: 0 })
    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    })

    // ========== 奶娃 Tile 系统状态 ==========
    const [tileLibrary, setTileLibrary] = useState<TileAssetLibrary | null>(null)
    const [tileLoading, setTileLoading] = useState(false)
    const [effectState, setEffectState] = useState<EffectState>('idle')
    const [effectFrame, setEffectFrame] = useState(0)

    // ========== Avatar Mirror 系统状态 ==========
    const [avatarLibrary, setAvatarLibrary] = useState<AvatarAssetLibrary | null>(null)
    const [avatarLoading, setAvatarLoading] = useState(false)

    // ========== UI 状态 ==========
    const [flash, setFlash] = useState<boolean>(false)
    const [clipboardSuccess, setClipboardSuccess] = useState<boolean>(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const [error, setError] = useState<string | null>(null)

    // ========== Refs ==========
    const asciiRendererRef = useRef<AsciiRendererHandle>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const recordedChunksRef = useRef<Blob[]>([])
    const recordingTimerRef = useRef<number | null>(null)
    const animationEngineRef = useRef<AnimationEngine | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ========== 初始化 Tile 素材库 ==========
    useEffect(() => {
        if (renderMode !== 'naiwa-tile' || tileLibrary?.loaded) return

        setTileLoading(true)
        generatePlaceholderLibrary(128, 36)
            .then(library => {
                setTileLibrary(library)
                setTileLoading(false)
            })
            .catch(err => {
                console.error('Failed to load tile library:', err)
                setError('素材库加载失败，请刷新重试')
                setTileLoading(false)
            })
    }, [renderMode, tileLibrary?.loaded])

    // ========== 初始化 Avatar 素材库（懒加载：切到 avatar-mirror 模式时加载） ==========
    useEffect(() => {
        if (renderMode !== 'avatar-mirror' || avatarLibrary?.loaded) return

        setAvatarLoading(true)
        generatePlaceholderAvatarLibrary(512)
            .then(library => {
                setAvatarLibrary(library)
                setAvatarLoading(false)
            })
            .catch(err => {
                console.error('Failed to load avatar library:', err)
                setError('Avatar 素材库加载失败，请刷新重试')
                setAvatarLoading(false)
            })
    }, [renderMode, avatarLibrary?.loaded])

    // ========== 初始化动画引擎 ==========
    useEffect(() => {
        const engine = new AnimationEngine(
            36, // totalFrames
            12, // frameRate (12fps)
            frame => setEffectFrame(frame),
            state => setEffectState(state),
        )
        animationEngineRef.current = engine

        return () => engine.destroy()
    }, [])

    // ========== 摄像头初始化（camera 模式 或 avatar-mirror 模式） ==========
    // stream 故意不加入依赖：仅在 cleanup 中读取。加入会导致 setStream → useEffect 重跑的死循环。
    useEffect(() => {
        // avatar-mirror 模式始终需要摄像头
        const needsCamera = inputSource.type === 'camera' || renderMode === 'avatar-mirror'

        if (!needsCamera) {
            if (stream) {
                stream.getTracks().forEach(t => t.stop())
                setStream(null)
            }
            return
        }

        let active = true
        let currentStream: MediaStream | null = null

        const start = async () => {
            try {
                if (currentStream) {
                    currentStream.getTracks().forEach(t => t.stop())
                }

                const constraints: MediaStreamConstraints = {
                    video: {
                        height: { ideal: 1080 },
                        width: { ideal: 1920 },
                        facingMode,
                    },
                    audio: false,
                }

                const video = await navigator.mediaDevices.getUserMedia(constraints)
                if (!active) {
                    video.getTracks().forEach(t => t.stop())
                    return
                }

                currentStream = video
                setStream(video)
            } catch (err) {
                console.error(err)
                setError('无法访问摄像头，请确保已授予权限')
            }
        }

        start()

        return () => {
            active = false
            if (currentStream) {
                currentStream.getTracks().forEach(t => t.stop())
            }
            setStream(null)
        }
    }, [facingMode, inputSource.type, renderMode]) // eslint-disable-line react-hooks/exhaustive-deps

    // ========== 窗口尺寸监听 ==========
    useEffect(() => {
        const handleResize = () => {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight })
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // ========== 同步 stream 到 inputSource ==========
    useEffect(() => {
        if (inputSource.type === 'camera' && stream) {
            setInputSource(prev => ({ ...prev, stream }))
        }
    }, [stream, inputSource.type])

    const toggleCamera = useCallback(() => {
        setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))
    }, [])

    const takeSnapshot = useCallback(async () => {
        if (!asciiRendererRef.current) return
        setFlash(true)
        setTimeout(() => setFlash(false), 200)

        try {
            const imageUrl = await asciiRendererRef.current.captureImage()
            if (!imageUrl) {
                setFlash(false)
                return
            }
            const a = document.createElement('a')
            a.href = imageUrl
            a.download = `ascii-capture-${Date.now()}.png`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(imageUrl)
        } catch (error) {
            console.error('Capture failed', error)
        }
    }, [])

    const copyToClipboard = useCallback(() => {
        if (!asciiRendererRef.current) return

        try {
            const copyContent = asciiRendererRef.current.getAsciiText()

            if (!copyContent) throw new Error()

            navigator.clipboard.writeText(copyContent).then(() => {
                setClipboardSuccess(true)
                setTimeout(() => setClipboardSuccess(false), 2000)
            })
        } catch (error) {
            console.log('Copy Failed:', error)
            setError('复制失败，请重试')
        }
    }, [])

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            // stop recodring
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop()

                if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
            }
            setIsRecording(false)
        } else {
            // start recodring
            const canvas = asciiRendererRef.current?.getCanvas()
            if (!canvas || !canvas.height || !canvas.width)
                throw new Error('Error while start recording')

            const videoBitsPerSecond = 2500000 // Default 2.5 Mbps

            const stream = canvas.captureStream(30) // 30 fps

            try {
                const mimeType = getSupportedMediaRecorderMimeType()
                if (!mimeType) {
                    throw new Error('No supported video codec found')
                }

                const options: MediaRecorderOptions = {
                    mimeType,
                    videoBitsPerSecond,
                }

                const recorder = new MediaRecorder(stream, options)
                recordedChunksRef.current = []

                recorder.ondataavailable = e => {
                    if (e.data.size > 0) recordedChunksRef.current.push(e.data)
                }

                recorder.onstop = () => {
                    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `ascii-video-${Date.now()}.webm`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    setRecordingTime(0)
                }

                recorder.start()
                mediaRecorderRef.current = recorder
                setIsRecording(true)
                console.log('start')

                recordingTimerRef.current = window.setInterval(() => {
                    setRecordingTime(t => t + 1)
                }, 1000)
            } catch (error) {
                console.error('Recording failed to start', error)
                setError('录制启动失败，浏览器可能不支持此格式')
            }
        }
    }, [isRecording])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    // ========== 输入源切换 ==========
    const switchToCamera = useCallback(() => {
        setInputSource({ type: 'camera' })
    }, [])

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const url = URL.createObjectURL(file)

        if (file.type.startsWith('image/')) {
            setInputSource({ type: 'image', url })
        } else if (file.type.startsWith('video/')) {
            setInputSource({ type: 'video', url })
        }
        // 清空 input 以便再次选择相同文件
        e.target.value = ''
    }, [])

    // ========== 笑效动画触发 ==========
    const triggerLaughEffect = useCallback(() => {
        const engine = animationEngineRef.current
        if (!engine) return

        if (effectState === 'idle') {
            engine.play()
        } else if (effectState === 'playing') {
            engine.pause()
        } else if (effectState === 'paused') {
            engine.resume()
        }
    }, [effectState])

    const resetEffect = useCallback(() => {
        animationEngineRef.current?.reset()
    }, [])

    return (
        <div className="h-dvh w-screen overflow-hidden bg-black">
            <Header
                fps={stats.fps}
                renderTime={stats.renderTime}
                width={windowSize.width}
                height={windowSize.height}
            />

            <Settings settings={settings} onChange={setSettings} renderMode={renderMode} />

            {/* Flash Effect */}
            {flash && (
                <div className="fixed inset-0 bg-white z-50 animate-out fade-out duration-150 pointer-events-none" />
            )}

            {/* Clipboard Toast */}
            {clipboardSuccess && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-white/10 backdrop-blur-xl px-5 py-2.5 rounded-2xl text-white/90 text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300">
                    已复制到剪贴板
                </div>
            )}

            {/* Error Toast */}
            {error && (
                <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/90 backdrop-blur-xl border border-white/10 px-8 py-6 rounded-2xl text-white font-medium animate-in zoom-in duration-200">
                    <button
                        onClick={() => setError(null)}
                        className="absolute top-3 right-3 text-white/40 hover:text-white/70 text-xl leading-none transition-colors"
                        aria-label="关闭错误提示"
                    >
                        <MdCancel />
                    </button>

                    <div>
                        <h1 className="text-xl font-semibold mb-2">出错了</h1>
                        <p className="text-white/60 text-sm">{error}</p>
                    </div>
                </div>
            )}

            <div className="fixed inset-0 flex justify-center items-center">
                {/* Tile 素材库加载中 */}
                {renderMode === 'naiwa-tile' && tileLoading && (
                    <div className="text-white/50 text-sm animate-pulse">素材库加载中...</div>
                )}

                {/* Avatar 素材加载中 */}
                {renderMode === 'avatar-mirror' && avatarLoading && (
                    <div className="text-white/50 text-sm animate-pulse">表情素材加载中...</div>
                )}

                {/* 渲染器：根据 renderMode 切换 */}
                {renderMode === 'avatar-mirror' && avatarLibrary ? (
                    <AvatarMirror
                        ref={asciiRendererRef}
                        settings={settings}
                        stream={stream}
                        avatarLibrary={avatarLibrary}
                        onStatsUpdate={setStats}
                        canvasSize={windowSize}
                    />
                ) : renderMode === 'naiwa-tile' && tileLibrary ? (
                    <TileView
                        ref={asciiRendererRef}
                        settings={settings}
                        inputSource={inputSource}
                        tileLibrary={tileLibrary}
                        effectState={effectState}
                        effectFrame={effectFrame}
                        onStatsUpdate={setStats}
                        canvasSize={windowSize}
                    />
                ) : renderMode === 'ascii' ? (
                    <AsciiView
                        ref={asciiRendererRef}
                        settings={settings}
                        stream={stream}
                        onStatsUpdate={setStats}
                        canvasSize={windowSize}
                    />
                ) : null}
            </div>

            {/* 隐藏的文件上传 input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileUpload}
                aria-label="上传图片或视频"
            />

            <CameraControls
                onFlip={toggleCamera}
                onShot={takeSnapshot}
                onCopy={copyToClipboard}
                onToggleRecording={toggleRecording}
                isRecording={isRecording}
                formatTime={formatTime}
                recordingTime={recordingTime}
                renderMode={renderMode}
                onRenderModeChange={setRenderMode}
                inputSourceType={inputSource.type}
                onSwitchToCamera={switchToCamera}
                onUploadFile={() => fileInputRef.current?.click()}
                effectState={effectState}
                onTriggerEffect={triggerLaughEffect}
                onResetEffect={resetEffect}
            />
        </div>
    )
}

export default App
