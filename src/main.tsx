import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(import.meta.env.BASE_URL + 'sw.js')
            .then(() => console.log('[SW] registered'))
            .catch(err => console.error('[SW] failed:', err))
    })
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
