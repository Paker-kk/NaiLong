import { memo, useEffect, useState } from 'react'

/**
 * VHS 摄像机取景器叠加层
 * 全局覆盖在画面上, 包含:
 * - ● REC 闪烁指示灯
 * - 实时时间戳 (VHS 格式)
 * - 取景框四角 L 型边框
 * - 电池图标 + SP 标识
 * - 扫描线 + 暗角
 */

interface VhsOverlayProps {
    isRecording: boolean
    renderMode: string
    fps: number
}

function VhsOverlay({ isRecording, renderMode, fps }: VhsOverlayProps) {
    const [time, setTime] = useState('')
    const [date, setDate] = useState('')
    const [recBlink, setRecBlink] = useState(true)

    // 实时时间 VHS 格式
    useEffect(() => {
        const tick = () => {
            const now = new Date()
            const h = now.getHours()
            const ampm = h >= 12 ? 'PM' : 'AM'
            const h12 = h % 12 || 12
            setTime(
                `${ampm} ${String(h12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
            )
            setDate(
                `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`,
            )
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    // REC 闪烁
    useEffect(() => {
        if (!isRecording) return
        const id = setInterval(() => setRecBlink(v => !v), 500)
        return () => clearInterval(id)
    }, [isRecording])

    const modeLabel =
        renderMode === 'naiwa-tile'
            ? '奶娃拼图'
            : renderMode === 'avatar-mirror'
              ? '表情镜像'
              : 'ASCII'

    return (
        <div className="vhs-overlay">
            {/* 扫描线 */}
            <div className="vhs-scanlines" />

            {/* 暗角 */}
            <div className="vhs-vignette" />

            {/* 取景框四角 */}
            <div className="vhs-corner vhs-corner-tl" />
            <div className="vhs-corner vhs-corner-tr" />
            <div className="vhs-corner vhs-corner-bl" />
            <div className="vhs-corner vhs-corner-br" />

            {/* 左上: REC + 模式 */}
            <div className="vhs-hud vhs-hud-tl">
                {isRecording && (
                    <span className={`vhs-rec ${recBlink ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="vhs-rec-dot">●</span> REC
                    </span>
                )}
                {!isRecording && <span className="vhs-standby">STBY</span>}
                <span className="vhs-mode">{modeLabel}</span>
            </div>

            {/* 右上: 电池 + SP + FPS */}
            <div className="vhs-hud vhs-hud-tr">
                <span className="vhs-battery">
                    <span className="vhs-battery-icon">🔋</span>
                    <span className="vhs-battery-bar">
                        <span className="vhs-battery-fill" />
                    </span>
                </span>
                <span className="vhs-sp">SP</span>
                <span className="vhs-fps">{fps}F</span>
            </div>

            {/* 左下: 日期 */}
            <div className="vhs-hud vhs-hud-bl">
                <span className="vhs-date">{date}</span>
            </div>

            {/* 右下: 时间 + 品牌 */}
            <div className="vhs-hud vhs-hud-br">
                <span className="vhs-time">{time}</span>
                <span className="vhs-brand">NAIWA CAM</span>
            </div>

            {/* 中间底部：噪点 grain 效果 */}
            <div className="vhs-noise" />
        </div>
    )
}

export default memo(VhsOverlay)
