import { useState } from 'react'

export function AppearanceSettings() {
  const [theme, setTheme] = useState(() => localStorage.getItem('ec.appearance') || 'paper')
  return <section className="panel appearance-settings"><h2>外观</h2><div className="appearance-options">{[['paper','暖纸'],['clean','清爽'],['night','夜读']].map(([key,label]) => <button key={key} aria-pressed={theme === key} onClick={() => { localStorage.setItem('ec.appearance', key); document.documentElement.dataset.appearance = key; setTheme(key); window.dispatchEvent(new Event('ec-appearance')) }}><span className={`appearance-swatch swatch-${key}`} /><strong>{label}</strong></button>)}</div><p className="muted tiny">保存在当前设备，随时切换。阅读页若单独选择了背景，会保留阅读设置。</p></section>
}
