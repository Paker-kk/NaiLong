export interface AsciiSettings {
    resolution: number
    fontSize: number
    contrast: number
    brightness: number
    colorMode: boolean
    invert: boolean
    characterSet: 'standard' | 'simple' | 'blocks' | 'matrix' | 'edges'
}

export interface AsciiCharacterMap {
    [key: string]: string
}

export const CHAR_SETS: AsciiCharacterMap = {
    standard: ' .:-=+*#%@MB',
    simple: ' .+#@',
    blocks: ' ░▒▓█',
    matrix: ' 01',
    edges: '  .,-_~:;=!*#$@',
}

export type CameraFacingMode = 'user' | 'environment'

export type ProcessingStats = {
    fps: number
    renderTime: number
}

export interface AsciiRendererHandle {
    captureImage: () => Promise<string>
    getAsciiText: () => string
    getCanvas: () => HTMLCanvasElement | null
}

// ========== 奶娃 IP Tile 渲染系统类型 ==========

/** 渲染模式：传统 ASCII 字符 / 奶娃 IP 图片 Tile / Avatar 表情镜像 */
export type RenderMode = 'ascii' | 'naiwa-tile' | 'avatar-mirror'

/** 输入源类型 */
export type InputSourceType = 'camera' | 'image' | 'video'

/** 输入源状态 */
export interface InputSource {
    type: InputSourceType
    /** 摄像头流 */
    stream?: MediaStream
    /** 上传的图片/视频 URL (Object URL) */
    url?: string
    /** 视频是否正在播放（区分首帧预览和实时播放） */
    videoPlaying?: boolean
}

/** 单个 Tile 素材（字母图片） */
export interface TileAsset {
    /** 字母标识 A-Z */
    letter: string
    /** 静态帧的图片元素 */
    image: HTMLImageElement
    /** 该素材的平均灰度值（0-255），用于亮度映射 */
    avgBrightness: number
    /** 大笑动画帧序列（可选，素材就绪后加载） */
    animationFrames?: HTMLImageElement[]
}

/** Tile 素材库（按灰度排序后的映射表） */
export interface TileAssetLibrary {
    /** 按灰度从暗到亮排序的 tile 列表 */
    sortedTiles: TileAsset[]
    /** 256 级灰度 → tile 索引的快速查找表 */
    brightnessMap: number[]
    /** 素材单元尺寸（px） */
    tileSize: number
    /** 是否加载完成 */
    loaded: boolean
}

/** 全局动画特效状态 */
export type EffectState = 'idle' | 'playing' | 'paused'

/** 动画特效控制 */
export interface EffectControl {
    state: EffectState
    /** 当前动画帧索引 */
    currentFrame: number
    /** 总帧数 */
    totalFrames: number
    /** 帧率（fps） */
    frameRate: number
}

// ========== Avatar Mirror 表情镜像系统类型 ==========

/** 渲染模式扩展：新增 avatar-mirror */
// 注意：RenderMode 已在上方定义为 'ascii' | 'naiwa-tile'，此处扩展
// 实际通过联合类型在使用处扩展

/** 支持的8种表情分类 */
export type ExpressionType =
    | 'neutral' // 无表情
    | 'smile' // 微笑
    | 'laugh' // 大笑
    | 'surprised' // 惊讶
    | 'angry' // 生气
    | 'sad' // 悲伤
    | 'pucker' // 嘟嘴
    | 'wink' // 眨眼

/** 表情分类结果 */
export interface ExpressionResult {
    /** 当前判定的表情 */
    expression: ExpressionType
    /** 置信度 0-1 */
    confidence: number
    /** 原始 blendshapes 数据（52项） */
    rawBlendshapes?: Map<string, number>
}

/** Avatar 素材项（每种表情对应一张图） */
export interface AvatarAsset {
    expression: ExpressionType
    /** 图片元素 */
    image: HTMLImageElement
    /** 表情中文标签（用于UI显示） */
    label: string
}

/** Avatar 素材库 */
export interface AvatarAssetLibrary {
    assets: Map<ExpressionType, AvatarAsset>
    loaded: boolean
}

/** MediaPipe 加载状态 */
export type MediaPipeStatus = 'idle' | 'loading' | 'ready' | 'error'
