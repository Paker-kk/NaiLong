/**
 * WebGL2 Instanced Tile Renderer
 *
 * 性能优化核心：将 ~15,000+ 次 ctx.drawImage() 替换为 1 次 WebGL2 instanced draw call。
 *
 * 架构：
 * 1. 纹理图集（Texture Atlas）：将所有 tile 图片合成一张 GPU 纹理
 * 2. 实例化渲染：单位四边形 + per-instance 属性（位置、UV 偏移、颜色）
 * 3. 亮度计算在 JS 侧完成（复用 brightnessMap），仅 tile 查找和绘制走 GPU
 */

import type { TileAssetLibrary } from '../types/types'

// ===== Shader 源码 =====

const VERT_SRC = `#version 300 es
precision highp float;

// 四边形顶点（2D 位置 + UV）
layout(location = 0) in vec2 a_pos;      // unit quad: [0,0],[1,0],[0,1],[1,1]
layout(location = 1) in vec2 a_uv;       // quad UV

// per-instance attributes
layout(location = 2) in vec2 a_offset;   // tile 在网格中的位置 (gridX, gridY)
layout(location = 3) in float a_tileIdx; // tile 在图集中的索引
layout(location = 4) in vec3 a_color;    // 原始像素颜色 (normalized 0-1)

uniform vec2 u_resolution;   // canvas 尺寸
uniform float u_tileScale;   // 每个 tile 在屏幕上的像素大小
uniform vec2 u_atlasGrid;    // 图集网格尺寸 (cols, rows)

out vec2 v_uv;
out vec3 v_color;
flat out int v_tileIdx;

void main() {
    // 将 quad 顶点定位到正确的网格位置
    vec2 tilePos = (a_offset + a_pos) * u_tileScale;

    // 归一化到 clip space [-1, 1]
    vec2 ndc = (tilePos / u_resolution) * 2.0 - 1.0;
    ndc.y = -ndc.y; // 翻转 Y 轴（屏幕坐标 → GL 坐标）

    gl_Position = vec4(ndc, 0.0, 1.0);

    // 计算图集 UV
    int idx = int(a_tileIdx);
    int cols = int(u_atlasGrid.x);
    float atlasCol = float(idx - (idx / cols) * cols);
    float atlasRow = float(idx / cols);
    vec2 cellSize = 1.0 / u_atlasGrid;
    v_uv = (vec2(atlasCol, atlasRow) + a_uv) * cellSize;

    v_color = a_color;
    v_tileIdx = idx;
}
`

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_color;
flat in int v_tileIdx;

uniform sampler2D u_atlas;
uniform bool u_colorMode;

out vec4 fragColor;

void main() {
    vec4 tile = texture(u_atlas, v_uv);

    if (u_colorMode) {
        // 彩色模式：multiply 混合
        fragColor = vec4(tile.rgb * v_color, tile.a);
    } else {
        fragColor = tile;
    }
}
`

// ===== 辅助函数 =====

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`Shader compile error: ${info}`)
    }
    return shader
}

function createProgram(
    gl: WebGL2RenderingContext,
    vert: WebGLShader,
    frag: WebGLShader,
): WebGLProgram {
    const program = gl.createProgram()!
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program)
        gl.deleteProgram(program)
        throw new Error(`Program link error: ${info}`)
    }
    return program
}

// ===== 渲染器类 =====

export class WebGLTileRenderer {
    private gl: WebGL2RenderingContext
    private program: WebGLProgram
    private vao: WebGLVertexArrayObject
    private instanceBuffer: WebGLBuffer
    private atlasTexture: WebGLTexture | null = null
    private atlasCols = 0
    private atlasRows = 0
    private tileCount = 0

    // uniform locations
    private uResolution: WebGLUniformLocation
    private uTileScale: WebGLUniformLocation
    private uAtlasGrid: WebGLUniformLocation
    private uColorMode: WebGLUniformLocation
    private uAtlas: WebGLUniformLocation

    // reusable instance data buffer
    private instanceData: Float32Array | null = null
    private maxInstances = 0

    constructor(canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true, // for captureImage
        })
        if (!gl) throw new Error('WebGL2 not supported')
        this.gl = gl

        // 编译 shader
        const vert = createShader(gl, gl.VERTEX_SHADER, VERT_SRC)
        const frag = createShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
        this.program = createProgram(gl, vert, frag)
        gl.deleteShader(vert)
        gl.deleteShader(frag)

        // uniform locations
        this.uResolution = gl.getUniformLocation(this.program, 'u_resolution')!
        this.uTileScale = gl.getUniformLocation(this.program, 'u_tileScale')!
        this.uAtlasGrid = gl.getUniformLocation(this.program, 'u_atlasGrid')!
        this.uColorMode = gl.getUniformLocation(this.program, 'u_colorMode')!
        this.uAtlas = gl.getUniformLocation(this.program, 'u_atlas')!

        // VAO
        this.vao = gl.createVertexArray()!
        gl.bindVertexArray(this.vao)

        // 单位四边形顶点 (pos + uv)
        const quadData = new Float32Array([
            // pos      // uv
            0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1,
        ])
        const quadBuf = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
        gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW)

        // a_pos (location 0)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0)
        // a_uv (location 1)
        gl.enableVertexAttribArray(1)
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8)

        // 实例属性 buffer
        this.instanceBuffer = gl.createBuffer()!
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)

        const STRIDE = 6 * 4 // 6 floats × 4 bytes

        // a_offset (location 2) — vec2
        gl.enableVertexAttribArray(2)
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 0)
        gl.vertexAttribDivisor(2, 1)

        // a_tileIdx (location 3) — float
        gl.enableVertexAttribArray(3)
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 8)
        gl.vertexAttribDivisor(3, 1)

        // a_color (location 4) — vec3
        gl.enableVertexAttribArray(4)
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, STRIDE, 12)
        gl.vertexAttribDivisor(4, 1)

        // 索引 buffer (两个三角形组成 quad)
        const indexBuf = gl.createBuffer()!
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 1, 3, 2]), gl.STATIC_DRAW)

        gl.bindVertexArray(null)
    }

    /**
     * 从 TileAssetLibrary 构建纹理图集
     */
    buildAtlas(library: TileAssetLibrary): void {
        const gl = this.gl
        const tiles = library.sortedTiles
        this.tileCount = tiles.length
        const tileSize = library.tileSize

        // 计算图集网格尺寸
        this.atlasCols = Math.ceil(Math.sqrt(this.tileCount))
        this.atlasRows = Math.ceil(this.tileCount / this.atlasCols)

        const atlasW = this.atlasCols * tileSize
        const atlasH = this.atlasRows * tileSize

        // 使用 2D Canvas 合成图集
        const atlasCanvas = document.createElement('canvas')
        atlasCanvas.width = atlasW
        atlasCanvas.height = atlasH
        const ctx = atlasCanvas.getContext('2d')!

        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, atlasW, atlasH)

        for (let i = 0; i < tiles.length; i++) {
            const col = i % this.atlasCols
            const row = Math.floor(i / this.atlasCols)
            ctx.drawImage(tiles[i].image, col * tileSize, row * tileSize, tileSize, tileSize)
        }

        // 上传为 WebGL 纹理
        if (this.atlasTexture) gl.deleteTexture(this.atlasTexture)
        this.atlasTexture = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }

    /**
     * 渲染一帧
     *
     * @param pixels - 低分辨率像素数据 (RGBA, tilesX × tilesY)
     * @param tilesX - 水平 tile 数
     * @param tilesY - 垂直 tile 数
     * @param tileScale - 每个 tile 的屏幕像素大小
     * @param brightnessMap - 256 级灰度 → tile 索引映射表
     * @param contrast - 对比度
     * @param brightness - 亮度偏移
     * @param invert - 是否反转
     * @param colorMode - 是否彩色模式
     * @param effectState - 动画状态 (未来使用，当前忽略)
     * @param effectFrame - 动画帧 (未来使用)
     */
    render(
        pixels: Uint8ClampedArray,
        tilesX: number,
        tilesY: number,
        tileScale: number,
        brightnessMap: number[],
        contrast: number,
        brightness: number,
        invert: boolean,
        colorMode: boolean,
    ): void {
        const gl = this.gl
        if (!this.atlasTexture) return

        const instanceCount = tilesX * tilesY
        if (instanceCount <= 0) return

        // 确保 instance data buffer 够大
        if (instanceCount > this.maxInstances || !this.instanceData) {
            this.maxInstances = instanceCount
            this.instanceData = new Float32Array(instanceCount * 6)
        }

        const data = this.instanceData

        // 填充 instance data (JS 侧，CPU 密集但比 drawImage 快得多)
        for (let i = 0; i < instanceCount; i++) {
            const base = i * 6
            const pBase = i * 4

            const r = pixels[pBase]
            const g = pixels[pBase + 1]
            const b = pixels[pBase + 2]

            // 灰度计算
            let l = 0.299 * r + 0.587 * g + 0.114 * b
            if (contrast !== 1.0 || brightness !== 0) {
                l = contrast * (l - 128) + 128 + brightness
            }
            let safeL = l < 0 ? 0 : l > 255 ? 255 : l | 0
            if (invert) safeL = 255 - safeL

            const tileIdx = brightnessMap[safeL]

            // offset (gridX, gridY)
            data[base] = i % tilesX
            data[base + 1] = (i / tilesX) | 0
            // tileIdx
            data[base + 2] = tileIdx
            // color (normalized)
            data[base + 3] = r / 255
            data[base + 4] = g / 255
            data[base + 5] = b / 255
        }

        // 更新 Canvas 尺寸
        const canvasW = tilesX * tileScale
        const canvasH = tilesY * tileScale
        const canvas = gl.canvas as HTMLCanvasElement
        if (canvas.width !== canvasW || canvas.height !== canvasH) {
            canvas.width = canvasW
            canvas.height = canvasH
        }
        gl.viewport(0, 0, canvasW, canvasH)

        // 清屏
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.useProgram(this.program)

        // 设置 uniforms
        gl.uniform2f(this.uResolution, canvasW, canvasH)
        gl.uniform1f(this.uTileScale, tileScale)
        gl.uniform2f(this.uAtlasGrid, this.atlasCols, this.atlasRows)
        gl.uniform1i(this.uColorMode, colorMode ? 1 : 0)

        // 绑定纹理图集
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
        gl.uniform1i(this.uAtlas, 0)

        // 上传 instance data
        gl.bindVertexArray(this.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, instanceCount * 6), gl.DYNAMIC_DRAW)

        // 一次 draw call 渲染所有 tiles
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, instanceCount)

        gl.bindVertexArray(null)
    }

    /**
     * 释放 GPU 资源
     */
    destroy(): void {
        const gl = this.gl
        if (this.atlasTexture) gl.deleteTexture(this.atlasTexture)
        gl.deleteProgram(this.program)
        gl.deleteVertexArray(this.vao)
        this.instanceData = null
    }
}
