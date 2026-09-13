import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider, createDarkTheme, createLightTheme, type BrandVariants } from '@fluentui/react-components'
import './index.css'
import App from './App.tsx'

type ThemeMode = 'system' | 'light' | 'dark'

const classWidgetsBrand: BrandVariants = {
  10: '#001F2B',
  20: '#003544',
  30: '#004B5E',
  40: '#006278',
  50: '#007A93',
  60: '#1692AE',
  70: '#3EADCB',
  80: '#66CCFF',
  90: '#82D5FF',
  100: '#9CDEFF',
  110: '#B3E6FF',
  120: '#C8EDFF',
  130: '#D9F2FF',
  140: '#E8F7FF',
  150: '#F3FBFF',
  160: '#FAFDFF',
}

const lightTheme = {
  ...createLightTheme(classWidgetsBrand),
  colorBrandBackground: '#66CCFF',
  colorBrandBackgroundHover: '#3EADCB',
  colorBrandBackgroundPressed: '#1692AE',
  colorBrandForeground1: '#006278',
  colorBrandForeground2: '#007A93',
  colorNeutralBackground2: '#F7F9FA',
}

const darkTheme = {
  ...createDarkTheme(classWidgetsBrand),
  colorBrandBackground: '#004B5E',
  colorBrandBackgroundHover: '#006278',
  colorBrandBackgroundPressed: '#003544',
  colorBrandForeground1: '#82D5FF',
  colorBrandForeground2: '#66CCFF',
}

export function ThemeRoot() {
  const [mode, setMode] = useState<ThemeMode>(() => (localStorage.getItem('cw-cc-theme') as ThemeMode) || 'system')
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const listener = () => setSystemDark(media.matches); media.addEventListener('change', listener); return () => media.removeEventListener('change', listener) }, [])
  const dark = mode === 'dark' || mode === 'system' && systemDark
  function change(next: ThemeMode) { setMode(next); localStorage.setItem('cw-cc-theme', next) }
  return <FluentProvider theme={dark ? darkTheme : lightTheme} data-theme={dark ? 'dark' : 'light'}><App themeMode={mode} onThemeModeChange={change} /></FluentProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeRoot />
  </StrictMode>,
)
