/**
 * 全局样式层（Fluent v9 / Griffel）
 *
 * 约定：
 * - 所有颜色、间距、圆角、字号一律取 `tokens.*`，禁止硬编码。
 * - 组件级样式用 `makeStyles`，本文件只保留真正全局的东西（主题宿主、滚动条、焦点环、打印）。
 * - 不再维护语义别名（--accent / --radius-* 等）；直接用 Fluent 令牌。
 */
import { makeStyles, tokens, shorthands } from '@fluentui/react-components'

export const useGlobalStyles = makeStyles({
  host: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    letterSpacing: '0',
  },

  focusRing: {
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: '1px',
    },
  },

  scrollArea: {
    ...shorthands.overflow('auto'),
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralForeground4} transparent`,
  },
})
