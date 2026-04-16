/**
 * 表情分类器：将 MediaPipe 52 个 Face Blendshapes 映射为 8 种离散表情
 *
 * 使用滞后阈值（Hysteresis）+ 时间平滑避免表情震荡闪烁
 */
import type { ExpressionType, ExpressionResult } from '../types/types'

/** 分类规则：每种表情的检测条件 */
interface ExpressionRule {
    expression: ExpressionType
    /** 优先级（越高越优先，解决多表情同时触发的冲突） */
    priority: number
    /** 检测函数：传入 blendshapes map，返回置信度 0-1 */
    detect: (bs: Map<string, number>) => number
}

/** 从 blendshapes map 安全取值 */
function bs(map: Map<string, number>, key: string): number {
    return map.get(key) ?? 0
}

/** 8 种表情的检测规则（按优先级排列） */
const EXPRESSION_RULES: ExpressionRule[] = [
    {
        expression: 'wink',
        priority: 90,
        detect: m => {
            const blinkL = bs(m, 'eyeBlinkLeft')
            const blinkR = bs(m, 'eyeBlinkRight')
            // 单侧眨眼 > 0.6 且另一侧 < 0.3
            const leftWink = blinkL > 0.6 && blinkR < 0.3 ? blinkL : 0
            const rightWink = blinkR > 0.6 && blinkL < 0.3 ? blinkR : 0
            return Math.max(leftWink, rightWink)
        },
    },
    {
        expression: 'surprised',
        priority: 80,
        detect: m => {
            const eyeWide = (bs(m, 'eyeWideLeft') + bs(m, 'eyeWideRight')) / 2
            const jawOpen = bs(m, 'jawOpen')
            // 眼睛睁大 + 嘴巴张开
            return Math.min(1, (eyeWide * 0.6 + jawOpen * 0.4) * 1.3)
        },
    },
    {
        expression: 'laugh',
        priority: 70,
        detect: m => {
            const smile = (bs(m, 'mouthSmileLeft') + bs(m, 'mouthSmileRight')) / 2
            const jawOpen = bs(m, 'jawOpen')
            // 微笑 + 张嘴 = 大笑
            if (smile > 0.4 && jawOpen > 0.25) {
                return Math.min(1, (smile + jawOpen) / 1.4)
            }
            return 0
        },
    },
    {
        expression: 'smile',
        priority: 60,
        detect: m => {
            const smile = (bs(m, 'mouthSmileLeft') + bs(m, 'mouthSmileRight')) / 2
            const jawOpen = bs(m, 'jawOpen')
            // 微笑但不张嘴（区分大笑）
            if (smile > 0.35 && jawOpen < 0.3) {
                return smile
            }
            return 0
        },
    },
    {
        expression: 'pucker',
        priority: 65,
        detect: m => {
            return bs(m, 'mouthPucker')
        },
    },
    {
        expression: 'angry',
        priority: 50,
        detect: m => {
            const browDown = (bs(m, 'browDownLeft') + bs(m, 'browDownRight')) / 2
            const mouthPress = (bs(m, 'mouthPressLeft') + bs(m, 'mouthPressRight')) / 2
            const noseSneer = (bs(m, 'noseSneerLeft') + bs(m, 'noseSneerRight')) / 2
            // 皱眉 + 抿嘴/鼻子皱起
            return Math.min(1, (browDown * 0.5 + mouthPress * 0.25 + noseSneer * 0.25) * 1.5)
        },
    },
    {
        expression: 'sad',
        priority: 40,
        detect: m => {
            const browInnerUp = bs(m, 'browInnerUp')
            const mouthFrown = (bs(m, 'mouthFrownLeft') + bs(m, 'mouthFrownRight')) / 2
            // 内眉上挑 + 嘴角下撇
            return Math.min(1, (browInnerUp * 0.5 + mouthFrown * 0.5) * 1.4)
        },
    },
    {
        expression: 'neutral',
        priority: 0,
        detect: () => 0.3, // 默认兜底，低置信度
    },
]

/** 切换表情的激活阈值 */
const ACTIVATE_THRESHOLD = 0.45
/** 表情维持的退出阈值（低于此值才允许切换走） */
const DEACTIVATE_THRESHOLD = 0.3
/** 时间平滑：需要连续 N 帧相同判定才真正切换 */
const SMOOTH_FRAMES = 3

export class ExpressionClassifier {
    private currentExpression: ExpressionType = 'neutral'
    private currentConfidence = 0
    private candidateExpression: ExpressionType = 'neutral'
    private candidateCount = 0

    /**
     * 对一组 blendshapes 进行表情分类
     * @param blendshapes - MediaPipe 输出的 [{categoryName, score}] 数组
     */
    classify(blendshapes: Array<{ categoryName: string; score: number }>): ExpressionResult {
        // 转换为 Map 方便查找
        const bsMap = new Map<string, number>()
        for (const { categoryName, score } of blendshapes) {
            bsMap.set(categoryName, score)
        }

        // 计算所有规则的置信度
        const scores: Array<{ expression: ExpressionType; confidence: number; priority: number }> =
            []
        for (const rule of EXPRESSION_RULES) {
            const confidence = rule.detect(bsMap)
            scores.push({ expression: rule.expression, confidence, priority: rule.priority })
        }

        // 过滤掉低于激活阈值的，按置信度*优先级排序
        const candidates = scores
            .filter(s => s.expression !== 'neutral' && s.confidence >= ACTIVATE_THRESHOLD)
            .sort((a, b) => {
                // 先按置信度排序，置信度相同按优先级
                const confDiff = b.confidence - a.confidence
                if (Math.abs(confDiff) > 0.1) return confDiff
                return b.priority - a.priority
            })

        let bestExpression: ExpressionType = 'neutral'
        let bestConfidence = 0.3

        if (candidates.length > 0) {
            bestExpression = candidates[0].expression
            bestConfidence = candidates[0].confidence
        }

        // 滞后逻辑：当前表情不是 neutral 时，需要当前表情的置信度低于退出阈值才允许切换
        if (this.currentExpression !== 'neutral' && this.currentExpression !== bestExpression) {
            const currentScore = scores.find(s => s.expression === this.currentExpression)
            if (currentScore && currentScore.confidence > DEACTIVATE_THRESHOLD) {
                // 维持当前表情
                bestExpression = this.currentExpression
                bestConfidence = currentScore.confidence
            }
        }

        // 时间平滑：连续 SMOOTH_FRAMES 帧才切换
        if (bestExpression !== this.currentExpression) {
            if (bestExpression === this.candidateExpression) {
                this.candidateCount++
            } else {
                this.candidateExpression = bestExpression
                this.candidateCount = 1
            }

            if (this.candidateCount >= SMOOTH_FRAMES) {
                this.currentExpression = bestExpression
                this.currentConfidence = bestConfidence
                this.candidateCount = 0
            }
        } else {
            this.currentConfidence = bestConfidence
            this.candidateCount = 0
        }

        return {
            expression: this.currentExpression,
            confidence: this.currentConfidence,
            rawBlendshapes: bsMap,
        }
    }

    /** 重置分类器状态 */
    reset() {
        this.currentExpression = 'neutral'
        this.currentConfidence = 0
        this.candidateExpression = 'neutral'
        this.candidateCount = 0
    }
}
