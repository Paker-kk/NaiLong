import { memo } from 'react'
import { ProcessingStats } from '../types/types'

interface HeaderProps extends ProcessingStats {
    width: number
    height: number
}

function Header({ fps }: HeaderProps) {
    return (
        <div className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 pointer-events-none safe-top">
            {/* 左侧：品牌 */}
            <div className="pointer-events-auto flex items-center gap-2">
                <img src="/assets/logo.webp" alt="奶娃相机" className="h-7 w-7 object-contain" />
                <h1 className="text-sm font-semibold text-white/80 tracking-wide">奶娃相机</h1>
            </div>

            {/* 右侧：性能指标（极简） */}
            <div className="text-[10px] text-white/30 font-mono tabular-nums">
                {Math.floor(fps)} FPS
            </div>
        </div>
    )
}

export default memo(Header)
