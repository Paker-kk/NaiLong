// ===== 奶娃相机 Service Worker =====
const CACHE_SHELL = 'naiwa-shell-v2.0.0'
const CACHE_RUNTIME = 'naiwa-runtime-v2.0.0'
const CACHE_MEDIAPIPE = 'naiwa-mediapipe-v1'

// 壳资源：install 阶段预缓存
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/assets/logo.webp',
    '/assets/favicon.webp',
    '/icons/icon-192x192.webp',
    '/icons/icon-512x512.webp',
]

// ===== Install =====
self.addEventListener('install', e => {
    e.waitUntil(
        caches
            .open(CACHE_SHELL)
            .then(cache =>
                Promise.allSettled(SHELL_ASSETS.map(url => cache.add(url).catch(() => {}))),
            )
            .then(() => self.skipWaiting()),
    )
})

// ===== Activate — 清理旧版缓存 =====
self.addEventListener('activate', e => {
    const KEEP = [CACHE_SHELL, CACHE_RUNTIME, CACHE_MEDIAPIPE]
    e.waitUntil(
        caches
            .keys()
            .then(names =>
                Promise.all(names.filter(n => !KEEP.includes(n)).map(n => caches.delete(n))),
            )
            .then(() => self.clients.claim()),
    )
})

// ===== Fetch =====
self.addEventListener('fetch', e => {
    const { request } = e
    if (request.method !== 'GET') return

    const url = new URL(request.url)

    // 忽略扩展协议
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return

    // 策略 1：MediaPipe WASM / 模型文件 → cache-first（大文件，只下一次）
    if (
        url.pathname.includes('mediapipe') ||
        url.pathname.endsWith('.wasm') ||
        url.pathname.endsWith('.task') ||
        url.pathname.endsWith('.tflite')
    ) {
        e.respondWith(
            caches.match(request).then(
                cached =>
                    cached ||
                    fetch(request).then(res => {
                        if (res.ok) {
                            const clone = res.clone()
                            caches.open(CACHE_MEDIAPIPE).then(c => c.put(request, clone))
                        }
                        return res
                    }),
            ),
        )
        return
    }

    // 策略 2：导航请求（HTML）→ network-first（保证获取最新版本）
    if (request.mode === 'navigate') {
        e.respondWith(
            fetch(request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone()
                        caches.open(CACHE_SHELL).then(c => c.put(request, clone))
                    }
                    return res
                })
                .catch(() =>
                    caches.match('/index.html').then(
                        cached =>
                            cached ||
                            new Response('<h1>奶娃相机 — 离线</h1><p>请连接网络后刷新</p>', {
                                status: 503,
                                headers: { 'Content-Type': 'text/html; charset=utf-8' },
                            }),
                    ),
                ),
        )
        return
    }

    // 策略 3：带 hash 的静态资源（Vite 产物）→ cache-first（hash 变 = 新资源）
    if (/\.[0-9a-f]{8,}\.(js|css|woff2?)$/i.test(url.pathname)) {
        e.respondWith(
            caches.match(request).then(
                cached =>
                    cached ||
                    fetch(request).then(res => {
                        if (res.ok) {
                            const clone = res.clone()
                            caches.open(CACHE_RUNTIME).then(c => c.put(request, clone))
                        }
                        return res
                    }),
            ),
        )
        return
    }

    // 策略 4：其余资源 → stale-while-revalidate
    e.respondWith(
        caches.match(request).then(cached => {
            const fetchPromise = fetch(request)
                .then(res => {
                    if (res.ok) {
                        const clone = res.clone()
                        caches.open(CACHE_RUNTIME).then(c => c.put(request, clone))
                    }
                    return res
                })
                .catch(() => cached)

            return cached || fetchPromise
        }),
    )
})

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        return caches.delete(cacheName)
                    }),
                )
            }),
        )
    }

    if (event.data && event.data.type === 'GET_CACHE_STATUS') {
        event.waitUntil(
            caches.open(CACHE_NAME).then(async cache => {
                const keys = await cache.keys()
                event.ports[0].postMessage({
                    cached: keys.length,
                    cacheKeys: keys.map(req => req.url),
                })
            }),
        )
    }
})
