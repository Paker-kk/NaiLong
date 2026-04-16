/**
 * 动画引擎 + 音频管理器
 *
 * 负责：
 * 1. 控制全局大笑动画的帧推进
 * 2. 管理音频文件的加载和播放
 * 3. 确保动画帧和音频播放的时间轴同步
 * 4. 状态管理：idle → playing → idle
 */

import { EffectControl, EffectState } from '../types/types'

export class AnimationEngine {
    private state: EffectState = 'idle'
    private currentFrame = 0
    private totalFrames: number
    private frameRate: number
    private frameInterval: number // 每帧间隔（ms）
    private lastFrameTime = 0
    private animationId: number | null = null
    private audio: HTMLAudioElement | null = null

    private onFrameUpdate: (frame: number) => void
    private onStateChange: (state: EffectState) => void

    constructor(
        totalFrames: number = 36,
        frameRate: number = 12,
        onFrameUpdate: (frame: number) => void,
        onStateChange: (state: EffectState) => void,
    ) {
        this.totalFrames = totalFrames
        this.frameRate = frameRate
        this.frameInterval = 1000 / frameRate
        this.onFrameUpdate = onFrameUpdate
        this.onStateChange = onStateChange
    }

    /** 初始化音频（传入音频 URL 或使用默认占位） */
    initAudio(audioUrl?: string) {
        if (this.audio) {
            this.audio.pause()
            this.audio = null
        }

        if (audioUrl) {
            this.audio = new Audio(audioUrl)
            this.audio.preload = 'auto'
        }
    }

    /** 触发特效播放 */
    play() {
        if (this.state === 'playing') return

        this.state = 'playing'
        this.currentFrame = 0
        this.lastFrameTime = performance.now()

        this.onStateChange('playing')
        this.onFrameUpdate(0)

        // 同步播放音频
        if (this.audio) {
            this.audio.currentTime = 0
            this.audio.play().catch(() => {
                // 浏览器可能阻止自动播放，静默处理
                console.warn('Audio autoplay blocked by browser')
            })
        }

        // 启动帧推进循环
        this.tick(performance.now())
    }

    /** 暂停特效 */
    pause() {
        if (this.state !== 'playing') return

        this.state = 'paused'
        this.onStateChange('paused')

        if (this.audio) {
            this.audio.pause()
        }

        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
        }
    }

    /** 恢复播放 */
    resume() {
        if (this.state !== 'paused') return

        this.state = 'playing'
        this.lastFrameTime = performance.now()
        this.onStateChange('playing')

        if (this.audio) {
            this.audio.play().catch(() => {})
        }

        this.tick(performance.now())
    }

    /** 重置到初始状态 */
    reset() {
        this.state = 'idle'
        this.currentFrame = 0

        if (this.audio) {
            this.audio.pause()
            this.audio.currentTime = 0
        }

        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
        }

        this.onStateChange('idle')
        this.onFrameUpdate(0)
    }

    /** 帧推进循环 */
    private tick = (now: number) => {
        if (this.state !== 'playing') return

        const elapsed = now - this.lastFrameTime

        if (elapsed >= this.frameInterval) {
            this.lastFrameTime = now - (elapsed % this.frameInterval)
            this.currentFrame++

            if (this.currentFrame >= this.totalFrames) {
                // 动画播放完毕，自动恢复 idle
                this.reset()
                return
            }

            this.onFrameUpdate(this.currentFrame)
        }

        this.animationId = requestAnimationFrame(this.tick)
    }

    /** 获取当前状态快照 */
    getStatus(): EffectControl {
        return {
            state: this.state,
            currentFrame: this.currentFrame,
            totalFrames: this.totalFrames,
            frameRate: this.frameRate,
        }
    }

    /** 销毁清理 */
    destroy() {
        this.reset()
        if (this.audio) {
            this.audio.src = ''
            this.audio = null
        }
    }
}
