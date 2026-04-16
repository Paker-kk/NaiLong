import { RefreshCw, Copy, Check, Camera, ImagePlus, Laugh, RotateCcw } from 'lucide-react'
import { memo, useState } from 'react'
import { EffectState, InputSourceType, RenderMode } from '../types/types'

type CameraControlsProps = {
    onFlip: () => void
    onShot: () => void
    onCopy: () => void
    onToggleRecording: () => void
    isRecording: boolean
    formatTime: (seconds: number) => string
    recordingTime: number
    renderMode: RenderMode
    onRenderModeChange: (mode: RenderMode) => void
    inputSourceType: InputSourceType
    onSwitchToCamera: () => void
    onUploadFile: () => void
    effectState: EffectState
    onTriggerEffect: () => void
    onResetEffect: () => void
}

const MODES: { id: RenderMode; label: string }[] = [
    { id: 'naiwa-tile', label: '奶娃拼图' },
    { id: 'ascii', label: '字符画' },
    { id: 'avatar-mirror', label: '表情镜像' },
]

const CameraControls = ({
    onFlip,
    onShot,
    onCopy,
    onToggleRecording,
    isRecording,
    formatTime,
    recordingTime,
    renderMode,
    onRenderModeChange,
    inputSourceType,
    onSwitchToCamera,
    onUploadFile,
    effectState,
    onTriggerEffect,
    onResetEffect,
}: CameraControlsProps) => {
    const [mode, setMode] = useState<'photo' | 'video'>('photo')
    const [isFlipping, setIsFlipping] = useState(false)
    const [isCopied, setIsCopied] = useState(false)

    const handleFlip = () => {
        setIsFlipping(prev => !prev)
        onFlip()
        setTimeout(() => setIsFlipping(prev => !prev), 600)
    }

    const handleCopy = () => {
        setIsCopied(true)
        onCopy()
        setTimeout(() => setIsCopied(false), 1000)
    }

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center pb-8 md:pb-10 gap-5 safe-bottom">
            {/* 模式选择器 — Dazz 横滑胶片风 */}
            <div className="pointer-events-auto flex items-center gap-1">
                {MODES.map(m => (
                    <button
                        key={m.id}
                        onClick={() => onRenderModeChange(m.id)}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                            renderMode === m.id
                                ? 'bg-white text-black'
                                : 'text-white/50 hover:text-white/80'
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* 拍照/录像切换 + 输入源 */}
            <div className="pointer-events-auto flex items-center gap-4">
                <div className="flex items-center gap-0.5 bg-white/5 backdrop-blur-xl rounded-full p-0.5">
                    <button
                        onClick={() => setMode('photo')}
                        className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                            mode === 'photo'
                                ? 'bg-white/15 text-white'
                                : 'text-white/40 hover:text-white/60'
                        }`}
                    >
                        拍照
                    </button>
                    <button
                        onClick={() => setMode('video')}
                        className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                            mode === 'video'
                                ? 'bg-white/15 text-white'
                                : 'text-white/40 hover:text-white/60'
                        }`}
                    >
                        录像
                    </button>
                </div>

                {/* 输入源（Avatar Mirror 模式始终摄像头，不显示切换） */}
                {renderMode !== 'avatar-mirror' && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onSwitchToCamera}
                            className={`p-2 rounded-full transition-all ${
                                inputSourceType === 'camera'
                                    ? 'bg-white/15 text-white'
                                    : 'text-white/30 hover:text-white/60'
                            }`}
                            title="摄像头"
                        >
                            <Camera size={14} />
                        </button>
                        <button
                            onClick={onUploadFile}
                            className={`p-2 rounded-full transition-all ${
                                inputSourceType === 'image'
                                    ? 'bg-white/15 text-white'
                                    : 'text-white/30 hover:text-white/60'
                            }`}
                            title="上传图片/视频"
                        >
                            <ImagePlus size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* 底部：辅助 + 快门 + 辅助 */}
            <div className="pointer-events-auto flex items-center justify-center gap-8 md:gap-12 px-4">
                {/* 左侧辅助按钮 */}
                <div className="w-12 flex justify-center">
                    {inputSourceType === 'camera' && (
                        <button
                            onClick={handleFlip}
                            className="flex flex-col items-center gap-1 focus:outline-none group"
                        >
                            <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                                <RefreshCw
                                    size={18}
                                    strokeWidth={1.5}
                                    className={`text-white/80 transition-transform duration-500 ${isFlipping ? 'rotate-180' : ''}`}
                                />
                            </div>
                            <span className="text-[9px] text-white/40">翻转</span>
                        </button>
                    )}
                </div>

                {/* 中央快门 */}
                {mode === 'photo' ? (
                    <button onClick={onShot} className="group focus:outline-none" aria-label="拍照">
                        <div className="w-18 h-18 md:w-20 md:h-20 rounded-full border-[3px] border-white/60 flex items-center justify-center group-hover:border-white group-hover:scale-105 group-active:scale-95 transition-all">
                            <div className="w-15 h-15 md:w-17 md:h-17 rounded-full bg-white group-hover:bg-white/90 transition-colors" />
                        </div>
                    </button>
                ) : (
                    <button onClick={onToggleRecording} className="group focus:outline-none">
                        <div
                            className={`w-18 h-18 md:w-20 md:h-20 rounded-full border-[3px] flex items-center justify-center transition-all ${
                                isRecording
                                    ? 'border-red-500/80'
                                    : 'border-white/60 group-hover:border-white group-hover:scale-105 group-active:scale-95'
                            }`}
                        >
                            <div
                                className={`bg-red-500 transition-all ${
                                    isRecording
                                        ? 'w-6 h-6 rounded-md animate-pulse'
                                        : 'w-15 h-15 md:w-17 md:h-17 rounded-full'
                                }`}
                            />
                        </div>
                        {isRecording && (
                            <div className="mt-2 text-xs text-red-400 font-mono tabular-nums text-center">
                                {formatTime(recordingTime)}
                            </div>
                        )}
                    </button>
                )}

                {/* 右侧辅助按钮 */}
                <div className="w-12 flex justify-center">
                    {renderMode === 'naiwa-tile' && effectState !== 'idle' ? (
                        <button
                            onClick={onResetEffect}
                            className="flex flex-col items-center gap-1 focus:outline-none group"
                        >
                            <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur flex items-center justify-center group-hover:bg-white/20 transition-all">
                                <RotateCcw size={18} strokeWidth={1.5} className="text-white/80" />
                            </div>
                            <span className="text-[9px] text-white/40">重置</span>
                        </button>
                    ) : renderMode === 'naiwa-tile' ? (
                        <button
                            onClick={onTriggerEffect}
                            className="flex flex-col items-center gap-1 focus:outline-none group"
                        >
                            <div
                                className={`w-11 h-11 rounded-full backdrop-blur flex items-center justify-center transition-all ${
                                    effectState === 'playing'
                                        ? 'bg-white/25 animate-pulse'
                                        : 'bg-white/10 group-hover:bg-white/20'
                                }`}
                            >
                                <Laugh size={18} strokeWidth={1.5} className="text-white/80" />
                            </div>
                            <span className="text-[9px] text-white/40">
                                {effectState === 'idle'
                                    ? '大笑'
                                    : effectState === 'playing'
                                      ? '暂停'
                                      : '继续'}
                            </span>
                        </button>
                    ) : renderMode === 'ascii' ? (
                        <button
                            onClick={handleCopy}
                            className="flex flex-col items-center gap-1 focus:outline-none group"
                        >
                            <div
                                className={`w-11 h-11 rounded-full backdrop-blur flex items-center justify-center transition-all ${
                                    isCopied
                                        ? 'bg-white/25 scale-110'
                                        : 'bg-white/10 group-hover:bg-white/20'
                                }`}
                            >
                                {isCopied ? (
                                    <Check size={18} strokeWidth={2} className="text-white" />
                                ) : (
                                    <Copy size={18} strokeWidth={1.5} className="text-white/80" />
                                )}
                            </div>
                            <span className="text-[9px] text-white/40">
                                {isCopied ? '已复制' : '复制'}
                            </span>
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

export default memo(CameraControls)
