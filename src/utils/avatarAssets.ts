/**
 * Avatar 占位素材生成器
 *
 * 为 8 种表情生成 emoji 风格的占位图，供 Pipeline 跑通测试。
 * 后续替换为豆包 AI 生成的奶娃真实素材。
 */
import type { ExpressionType, AvatarAsset, AvatarAssetLibrary } from '../types/types'

interface ExpressionDef {
    expression: ExpressionType
    label: string
    emoji: string
    bgColor: string
}

const EXPRESSION_DEFS: ExpressionDef[] = [
    { expression: 'neutral', label: '无表情', emoji: '😐', bgColor: '#4a5568' },
    { expression: 'smile', label: '微笑', emoji: '😊', bgColor: '#48bb78' },
    { expression: 'laugh', label: '大笑', emoji: '😂', bgColor: '#f6e05e' },
    { expression: 'surprised', label: '惊讶', emoji: '😲', bgColor: '#63b3ed' },
    { expression: 'angry', label: '生气', emoji: '😠', bgColor: '#fc8181' },
    { expression: 'sad', label: '悲伤', emoji: '😢', bgColor: '#a0aec0' },
    { expression: 'pucker', label: '嘟嘴', emoji: '😙', bgColor: '#f687b3' },
    { expression: 'wink', label: '眨眼', emoji: '😜', bgColor: '#9f7aea' },
]

/**
 * 生成单个表情的占位图
 */
function generateAvatarPlaceholder(def: ExpressionDef, size: number): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            reject(new Error('Canvas not supported'))
            return
        }

        // 背景：圆角矩形
        const radius = size * 0.15
        ctx.fillStyle = def.bgColor
        ctx.beginPath()
        ctx.moveTo(radius, 0)
        ctx.lineTo(size - radius, 0)
        ctx.quadraticCurveTo(size, 0, size, radius)
        ctx.lineTo(size, size - radius)
        ctx.quadraticCurveTo(size, size, size - radius, size)
        ctx.lineTo(radius, size)
        ctx.quadraticCurveTo(0, size, 0, size - radius)
        ctx.lineTo(0, radius)
        ctx.quadraticCurveTo(0, 0, radius, 0)
        ctx.closePath()
        ctx.fill()

        // 半透明覆盖层
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(0, 0, size, size * 0.4)

        // Emoji 表情（大号居中）
        ctx.font = `${size * 0.5}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(def.emoji, size / 2, size * 0.42)

        // 标签文字
        ctx.font = `bold ${size * 0.08}px "Microsoft YaHei", sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillText(def.label, size / 2, size * 0.78)

        // 小标注："占位素材"
        ctx.font = `${size * 0.05}px monospace`
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText('PLACEHOLDER', size / 2, size * 0.92)

        // 转为 Image
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = canvas.toDataURL('image/png')
    })
}

/**
 * 生成完整的 Avatar 占位素材库
 * @param size - 图片尺寸（像素），默认 512
 */
export async function generatePlaceholderAvatarLibrary(size = 512): Promise<AvatarAssetLibrary> {
    const assets = new Map<ExpressionType, AvatarAsset>()

    const promises = EXPRESSION_DEFS.map(async def => {
        const image = await generateAvatarPlaceholder(def, size)
        const asset: AvatarAsset = {
            expression: def.expression,
            image,
            label: def.label,
        }
        assets.set(def.expression, asset)
    })

    await Promise.all(promises)

    return { assets, loaded: true }
}

/** 获取表情的中文标签 */
export function getExpressionLabel(expression: ExpressionType): string {
    const def = EXPRESSION_DEFS.find(d => d.expression === expression)
    return def?.label ?? '未知'
}

/** 获取所有支持的表情列表 */
export function getAllExpressions(): ExpressionType[] {
    return EXPRESSION_DEFS.map(d => d.expression)
}
