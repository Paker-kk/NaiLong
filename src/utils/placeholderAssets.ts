/**
 * 占位素材生成器
 * 在正式奶娃 IP 素材就绪前，使用 Canvas 程序化生成 26 个字母的占位 tile 图片。
 * 每个字母根据其笔画复杂度赋予不同灰度值，模拟真实素材的灰度分级效果。
 *
 * 核心思路：
 * 1. 预定义 A-Z 的笔画密度排序（从稀疏到密集）
 * 2. 为每个字母在 Canvas 上绘制奶娃风格的彩色字母图
 * 3. 计算并返回每张图的平均灰度值
 * 4. 生成大笑动画占位帧（旋转 + 缩放效果）
 */

import { TileAsset, TileAssetLibrary } from '../types/types'

// A-Z 按笔画视觉密度从低到高排序（类似 ASCII 字符集的灰度排列）
// 密度低的字母（如 I、l）对应暗区，密度高的字母（如 M、W）对应亮区
const LETTER_DENSITY_ORDER = [
    'I',
    'L',
    'T',
    'J',
    'Y',
    'V',
    'C',
    'U',
    'F',
    'S',
    'Z',
    'X',
    'P',
    'K',
    'A',
    'H',
    'N',
    'D',
    'O',
    'G',
    'R',
    'E',
    'Q',
    'B',
    'M',
    'W',
]

// 奶娃主题配色（占位用，可爱风格）
const NAIWA_COLORS = {
    bg: '#FFF5E6', // 奶白色背景
    outline: '#FF8C42', // 橙色描边
    fill: '#FFD166', // 金黄填充
    face: '#FF6B6B', // 腮红色
    shadow: '#E8A87C', // 阴影色
}

/**
 * 生成单个字母的占位 tile 图片
 * @param letter 字母 A-Z
 * @param size tile 尺寸（px）
 * @param densityIndex 在密度排序中的位置（0-25），用于计算灰度值
 * @returns 包含图片和灰度值的 TileAsset（不含动画帧）
 */
function generateLetterTile(letter: string, size: number, densityIndex: number): TileAsset {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // 灰度值：密度低的字母灰度低（暗），密度高的灰度高（亮）
    // 范围 10-245，避免纯黑/纯白
    const avgBrightness = Math.round(10 + (densityIndex / 25) * 235)

    // 绘制圆角背景
    const padding = size * 0.08
    const radius = size * 0.15
    ctx.fillStyle = NAIWA_COLORS.bg
    ctx.beginPath()
    ctx.roundRect(padding, padding, size - padding * 2, size - padding * 2, radius)
    ctx.fill()

    // 绘制描边
    ctx.strokeStyle = NAIWA_COLORS.outline
    ctx.lineWidth = size * 0.04
    ctx.beginPath()
    ctx.roundRect(padding, padding, size - padding * 2, size - padding * 2, radius)
    ctx.stroke()

    // 绘制字母（奶娃风格：圆润、加粗）
    const fontSize = size * 0.55
    ctx.font = `bold ${fontSize}px 'Comic Sans MS', 'Segoe UI', cursive, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 文字阴影
    ctx.fillStyle = NAIWA_COLORS.shadow
    ctx.fillText(letter, size / 2 + 2, size / 2 + 2)

    // 文字主体
    ctx.fillStyle = NAIWA_COLORS.outline
    ctx.fillText(letter, size / 2, size / 2)

    // 小腮红装饰（占位素材的可爱元素）
    ctx.fillStyle = NAIWA_COLORS.face
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.ellipse(size * 0.22, size * 0.72, size * 0.08, size * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size * 0.78, size * 0.72, size * 0.08, size * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1.0

    // 转换为 Image 对象
    const img = new Image()
    img.src = canvas.toDataURL('image/png')

    return {
        letter,
        image: img,
        avgBrightness,
    }
}

/**
 * 生成单个字母的大笑动画占位帧序列
 * 占位效果：字母做抖动 + 放大 + 旋转动画
 * @param letter 字母
 * @param size tile 尺寸
 * @param frameCount 总帧数
 * @returns HTMLImageElement 帧数组
 */
function generateLaughFrames(letter: string, size: number, frameCount: number): HTMLImageElement[] {
    const frames: HTMLImageElement[] = []

    for (let f = 0; f < frameCount; f++) {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!

        // 动画参数：正弦波驱动抖动和缩放
        const progress = f / frameCount
        const wobble = Math.sin(progress * Math.PI * 6) * 3 // 快速抖动
        const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.15 // 缩放脉冲
        const rotation = Math.sin(progress * Math.PI * 4) * 0.1 // 轻微旋转

        ctx.save()
        ctx.translate(size / 2, size / 2)
        ctx.rotate(rotation)
        ctx.scale(scale, scale)
        ctx.translate(-size / 2, -size / 2 + wobble)

        // 绘制背景（动画时变为亮色）
        const hue = (progress * 360) % 360
        ctx.fillStyle = `hsl(${hue}, 80%, 90%)`
        const padding = size * 0.08
        const radius = size * 0.15
        ctx.beginPath()
        ctx.roundRect(padding, padding, size - padding * 2, size - padding * 2, radius)
        ctx.fill()

        // 描边
        ctx.strokeStyle = `hsl(${hue}, 80%, 50%)`
        ctx.lineWidth = size * 0.04
        ctx.beginPath()
        ctx.roundRect(padding, padding, size - padding * 2, size - padding * 2, radius)
        ctx.stroke()

        // 字母
        const fontSize = size * 0.55
        ctx.font = `bold ${fontSize}px 'Comic Sans MS', 'Segoe UI', cursive, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = `hsl(${hue}, 80%, 40%)`
        ctx.fillText(letter, size / 2, size / 2)

        // 笑脸元素：两个弧形眼睛 + 大嘴
        const eyeY = size * 0.35
        const mouthY = size * 0.75
        ctx.strokeStyle = `hsl(${hue}, 80%, 30%)`
        ctx.lineWidth = size * 0.025

        // 左眼
        ctx.beginPath()
        ctx.arc(size * 0.35, eyeY, size * 0.06, Math.PI, 0)
        ctx.stroke()

        // 右眼
        ctx.beginPath()
        ctx.arc(size * 0.65, eyeY, size * 0.06, Math.PI, 0)
        ctx.stroke()

        // 嘴巴（大笑弧线）
        ctx.beginPath()
        ctx.arc(size / 2, mouthY - size * 0.05, size * 0.15, 0, Math.PI)
        ctx.stroke()

        ctx.restore()

        const img = new Image()
        img.src = canvas.toDataURL('image/png')
        frames.push(img)
    }

    return frames
}

/**
 * 生成完整的占位素材库
 * @param tileSize 每个 tile 的尺寸（px），默认 128
 * @param animFrameCount 每个字母的动画帧数，默认 36（12fps × 3秒）
 * @returns Promise<TileAssetLibrary> 完整的素材库
 */
export async function generatePlaceholderLibrary(
    tileSize: number = 128,
    animFrameCount: number = 36,
): Promise<TileAssetLibrary> {
    const tiles: TileAsset[] = []

    // 按密度排序生成每个字母
    for (let i = 0; i < LETTER_DENSITY_ORDER.length; i++) {
        const letter = LETTER_DENSITY_ORDER[i]
        const tile = generateLetterTile(letter, tileSize, i)

        // 生成动画帧
        tile.animationFrames = generateLaughFrames(letter, tileSize, animFrameCount)

        tiles.push(tile)
    }

    // 等待所有图片加载完成
    await Promise.all(
        tiles.flatMap(t => {
            const promises = [waitForImageLoad(t.image)]
            if (t.animationFrames) {
                promises.push(...t.animationFrames.map(waitForImageLoad))
            }
            return promises
        }),
    )

    // 构建 256 级灰度 → tile 索引的快速查找表
    const brightnessMap = buildBrightnessMap(tiles)

    return {
        sortedTiles: tiles,
        brightnessMap,
        tileSize,
        loaded: true,
    }
}

/** 等待单张图片加载 */
function waitForImageLoad(img: HTMLImageElement): Promise<void> {
    return new Promise((resolve, reject) => {
        if (img.complete) {
            resolve()
            return
        }
        img.onload = () => resolve()
        img.onerror = () =>
            reject(new Error(`Failed to load image: ${img.src.substring(0, 50)}...`))
    })
}

/**
 * 构建灰度到 tile 索引的映射表
 * 将 0-255 灰度值均匀映射到已排序的 tiles 数组索引
 */
function buildBrightnessMap(sortedTiles: TileAsset[]): number[] {
    const map: number[] = new Array(256)
    const tileCount = sortedTiles.length

    for (let brightness = 0; brightness < 256; brightness++) {
        // 找到灰度值最接近的 tile
        let bestIdx = 0
        let bestDiff = Infinity
        for (let i = 0; i < tileCount; i++) {
            const diff = Math.abs(sortedTiles[i].avgBrightness - brightness)
            if (diff < bestDiff) {
                bestDiff = diff
                bestIdx = i
            }
        }
        map[brightness] = bestIdx
    }

    return map
}
