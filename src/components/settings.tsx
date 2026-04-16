import { memo, useState } from 'react'
import { FaGithub, FaXTwitter } from 'react-icons/fa6'
import { IoClose, IoGlobe } from 'react-icons/io5'
import { LuSettings2 } from 'react-icons/lu'
import { AsciiSettings, RenderMode } from '../types/types'

interface SettingsCompProps {
    settings: AsciiSettings
    onChange: (newSettings: AsciiSettings) => void
    renderMode?: RenderMode
}

type SliderEvent = React.MouseEvent | React.TouchEvent

const SLIDER_CONFIGS = {
    fontSize: { min: 6, max: 30, step: 1, label: '分辨率', range: '低 (6) - 高 (30)' },
    contrast: { min: 0.5, max: 3.0, step: 0.1, label: '对比度', range: '低 (0.5) - 高 (3.0)' },
    brightness: {
        min: -100,
        max: 100,
        step: 1,
        label: '亮度',
        range: '暗 (-100) - 亮 (+100)',
    },
}

const CHARACTER_SETS = ['standard', 'simple', 'blocks', 'matrix', 'edges']

function Settings({ settings, onChange, renderMode = 'ascii' }: SettingsCompProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [activeSlider, setActiveSlider] = useState<string | null>(null)
    const [sliderValue, setSliderValue] = useState<number>(0)
    const [sliderPosition, setSliderPosition] = useState({ x: 0, y: 0 })
    const [sliderRect, setSliderRect] = useState<DOMRect | null>(null)

    const handleChange = (key: keyof AsciiSettings, value: number | string | boolean) => {
        onChange({ ...settings, [key]: value })
    }

    const getClientPos = (e: SliderEvent) => ({
        x: 'touches' in e ? e.touches[0].clientX : e.clientX,
        y: 'touches' in e ? e.touches[0].clientY : e.clientY,
    })

    const handleSliderStart = (key: string, value: number, e: SliderEvent) => {
        setSliderRect((e.currentTarget as HTMLInputElement).getBoundingClientRect())
        setActiveSlider(key)
        setSliderValue(value)
        setSliderPosition(getClientPos(e))
    }

    const handleSliderChange = (key: string, val: number, e: SliderEvent) => {
        handleChange(key as keyof AsciiSettings, val)
        if (activeSlider === key) {
            setSliderValue(val)
            setSliderPosition(getClientPos(e))
        }
    }

    const formatValue = (key: string, value: number) => {
        if (key === 'contrast') return value.toFixed(1)
        if (key === 'brightness') return `${value > 0 ? '+' : ''}${value}`
        return `${value}px`
    }

    const renderSlider = (key: keyof typeof SLIDER_CONFIGS) => {
        const config = SLIDER_CONFIGS[key]
        const [lowLabel, highLabel] = config.range.split(' - ')

        return (
            <section key={key}>
                <div className="flex justify-between text-white/80 text-xs font-medium mb-1">
                    <span>{config.label}</span>
                    <span className="text-white/50">{formatValue(key, settings[key])}</span>
                </div>
                <div className="flex justify-between text-[10px] text-white/30 mb-2">
                    <span>{lowLabel}</span>
                    <span>{highLabel}</span>
                </div>
                <input
                    type="range"
                    min={config.min}
                    max={config.max}
                    step={config.step}
                    value={settings[key]}
                    onMouseDown={e => handleSliderStart(key, settings[key], e)}
                    onTouchStart={e => handleSliderStart(key, settings[key], e)}
                    onChange={e =>
                        handleSliderChange(key, +e.target.value, e as unknown as SliderEvent)
                    }
                    onMouseUp={() => setActiveSlider(null)}
                    onTouchEnd={() => setActiveSlider(null)}
                    className="settings-slider"
                    aria-label={config.label}
                />
            </section>
        )
    }

    return (
        <>
            {!isOpen && (
                <button
                    className="p-3 text-white/50 fixed top-4 right-4 z-50 rounded-2xl backdrop-blur-xl shadow-lg bg-white/5 hover:bg-white/10 hover:text-white/80 transition-all"
                    onClick={() => setIsOpen(true)}
                    aria-label="打开设置"
                >
                    <LuSettings2 size={22} />
                </button>
            )}

            {isOpen && !activeSlider && (
                <div
                    className="fixed inset-0 bg-transparent z-30"
                    onClick={e => e.target === e.currentTarget && setIsOpen(false)}
                />
            )}

            {activeSlider && (
                <div
                    className="fixed z-50 pointer-events-none"
                    style={{
                        left: `${sliderPosition.x}px`,
                        top: `${sliderPosition.y - 50}px`,
                        transform: 'translateX(-50%)',
                    }}
                >
                    <div className="bg-white/10 text-white px-4 py-2 rounded-xl font-bold text-lg shadow-xl backdrop-blur-xl">
                        {formatValue(activeSlider, sliderValue)}
                    </div>
                </div>
            )}

            <aside
                className={`fixed top-0 right-0 h-full w-[60%] min-w-70 sm:w-96 bg-black/95 backdrop-blur-xl border-l border-white/5 flex flex-col
        transform transition-transform duration-300 z-40 shadow-2xl
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        ${activeSlider ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
                <header className="flex items-center justify-between py-6 px-5 border-b border-white/5">
                    <h2 className="font-semibold text-lg text-white/90">设置</h2>
                    <button
                        className="text-white/40 p-2 hover:bg-white/5 hover:text-white/70 rounded-xl transition-all"
                        onClick={() => setIsOpen(false)}
                        aria-label="关闭设置"
                    >
                        <IoClose size={22} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 text-white/70 text-sm">
                    {(Object.keys(SLIDER_CONFIGS) as Array<keyof typeof SLIDER_CONFIGS>).map(
                        renderSlider,
                    )}

                    {renderMode === 'ascii' && (
                        <section>
                            <p className="uppercase text-xs text-white/60 font-medium mb-3">
                                字符集
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {CHARACTER_SETS.map(c => (
                                    <button
                                        key={c}
                                        className={`py-2.5 rounded-xl border text-xs font-medium transition-all
                  ${settings.characterSet === c ? 'bg-white text-black border-white' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
                                        onClick={() => handleChange('characterSet', c)}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="space-y-4 pt-2">
                        {[
                            { key: 'colorMode', label: '彩色模式' },
                            { key: 'invert', label: '反转数值' },
                        ].map(({ key, label }) => (
                            <label
                                key={key}
                                className="flex justify-between items-center text-white/70 py-2 cursor-pointer"
                            >
                                <span className="text-sm font-medium">{label}</span>
                                <input
                                    type="checkbox"
                                    checked={settings[key as keyof AsciiSettings] as boolean}
                                    onChange={() =>
                                        handleChange(
                                            key as keyof AsciiSettings,
                                            !settings[key as keyof AsciiSettings],
                                        )
                                    }
                                    className="settings-toggle"
                                />
                            </label>
                        ))}
                    </section>
                </div>

                <footer className="py-4 px-5 border-t border-white/5">
                    <div className="flex items-center justify-center gap-6 mb-3">
                        {[
                            {
                                href: 'https://github.com/pshycodr/phosphor-cam',
                                Icon: FaGithub,
                                label: 'GitHub',
                            },
                            { href: 'https://x.com/the_Aroy', Icon: FaXTwitter, label: 'Twitter' },
                            { href: 'https://pshycodr.me', Icon: IoGlobe, label: '网站' },
                        ].map(({ href, Icon, label }) => (
                            <a
                                key={href}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-white/30 hover:text-white/60 hover:bg-white/5 rounded-xl transition-all"
                                aria-label={label}
                            >
                                <Icon size={18} />
                            </a>
                        ))}
                    </div>
                    <div className="text-center text-xs text-white/20">奶娃相机 v1.0</div>
                </footer>
            </aside>

            {activeSlider && sliderRect && (
                <div
                    className="fixed z-50"
                    style={{
                        left: `${sliderRect.left}px`,
                        top: `${sliderRect.top}px`,
                        width: `${sliderRect.width}px`,
                    }}
                >
                    <input
                        type="range"
                        min={SLIDER_CONFIGS[activeSlider as keyof typeof SLIDER_CONFIGS].min}
                        max={SLIDER_CONFIGS[activeSlider as keyof typeof SLIDER_CONFIGS].max}
                        step={SLIDER_CONFIGS[activeSlider as keyof typeof SLIDER_CONFIGS].step}
                        value={sliderValue}
                        onChange={e =>
                            handleSliderChange(
                                activeSlider,
                                +e.target.value,
                                e as unknown as SliderEvent,
                            )
                        }
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        className="settings-slider w-full"
                        aria-label={
                            SLIDER_CONFIGS[activeSlider as keyof typeof SLIDER_CONFIGS].label
                        }
                    />
                </div>
            )}
        </>
    )
}

export default memo(Settings)
