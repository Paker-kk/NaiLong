/**
 * MediaPipe Face Landmarker 服务（懒加载）
 *
 * 仅在用户切换到 Avatar Mirror 模式时才下载和初始化模型。
 * 使用 @mediapipe/tasks-vision 的 FaceLandmarker，输出 52 个 blendshapes。
 */
import type { MediaPipeStatus } from '../types/types'

// 动态导入类型引用（运行时才加载）
type FaceLandmarkerType = import('@mediapipe/tasks-vision').FaceLandmarker
type FaceLandmarkerResultType = import('@mediapipe/tasks-vision').FaceLandmarkerResult

/** 回调：状态变更通知 */
type StatusCallback = (status: MediaPipeStatus) => void

/** 单例模型管理 */
let faceLandmarkerInstance: FaceLandmarkerType | null = null
let initPromise: Promise<FaceLandmarkerType> | null = null
let currentStatus: MediaPipeStatus = 'idle'
let statusCallbacks: StatusCallback[] = []

function notifyStatus(status: MediaPipeStatus) {
    currentStatus = status
    for (const cb of statusCallbacks) cb(status)
}

/**
 * 注册状态监听
 */
export function onMediaPipeStatusChange(cb: StatusCallback): () => void {
    statusCallbacks.push(cb)
    // 立即通知当前状态
    cb(currentStatus)
    return () => {
        statusCallbacks = statusCallbacks.filter(c => c !== cb)
    }
}

/**
 * 获取当前 MediaPipe 状态
 */
export function getMediaPipeStatus(): MediaPipeStatus {
    return currentStatus
}

/**
 * 懒加载并初始化 FaceLandmarker
 * 多次调用安全（单例+去重）
 */
export async function initFaceLandmarker(): Promise<FaceLandmarkerType> {
    if (faceLandmarkerInstance) return faceLandmarkerInstance
    if (initPromise) return initPromise

    notifyStatus('loading')

    initPromise = (async () => {
        try {
            // 动态导入 @mediapipe/tasks-vision（tree-shakable，仅在此刻拉取 WASM 和模型）
            const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

            // WASM 文件：生产环境从 R2 加载，开发环境从本地 public/ 加载
            const wasmBase = import.meta.env.VITE_MEDIAPIPE_WASM_BASE || '/mediapipe/wasm'
            const vision = await FilesetResolver.forVisionTasks(wasmBase)

            const landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: '/mediapipe/models/face_landmarker.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numFaces: 1,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: false,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            })

            faceLandmarkerInstance = landmarker
            notifyStatus('ready')
            return landmarker
        } catch (err) {
            console.error('MediaPipe FaceLandmarker init failed:', err)
            notifyStatus('error')
            initPromise = null
            throw err
        }
    })()

    return initPromise
}

/**
 * 对视频帧执行人脸特征检测
 * @param video - HTMLVideoElement（摄像头流）
 * @param timestampMs - 当前时间戳（performance.now()）
 */
export function detectFace(
    video: HTMLVideoElement,
    timestampMs: number,
): FaceLandmarkerResultType | null {
    if (!faceLandmarkerInstance) return null
    try {
        return faceLandmarkerInstance.detectForVideo(video, timestampMs)
    } catch {
        return null
    }
}

/**
 * 销毁 FaceLandmarker 实例，释放资源
 */
export function destroyFaceLandmarker() {
    if (faceLandmarkerInstance) {
        faceLandmarkerInstance.close()
        faceLandmarkerInstance = null
    }
    initPromise = null
    notifyStatus('idle')
}
