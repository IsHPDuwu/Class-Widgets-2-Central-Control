/**
 * 应用外壳（左侧导航 + 主内容区）布局样式。
 * 全部取 Fluent 令牌，无硬编码色值/尺寸。
 */
import { makeStyles, tokens, shorthands } from '@fluentui/react-components'

export const NAV_WIDTH = '248px'

/**
 * 全局水平留白。侧栏、顶栏、页面容器统一使用，保证内容左边缘对齐。
 * Fluent 面板类布局惯例为 16/24px 两档，这里统一到 L(16px)。
 */
const GUTTER = tokens.spacingHorizontalL
const GUTTER_INLINE = tokens.spacingHorizontalSNudge

export const useShellStyles = makeStyles({
  shell: {
    display: 'grid',
    gridTemplateColumns: `${NAV_WIDTH} minmax(0, 1fr)`,
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
  },

  nav: {
    position: 'fixed',
    top: '0',
    bottom: '0',
    left: '0',
    width: NAV_WIDTH,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: GUTTER_INLINE,
    paddingRight: GUTTER_INLINE,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRightWidth: tokens.strokeWidthThin,
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2,
    boxShadow: tokens.shadow2,
  },

  brand: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalMNudge,
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingBottom: tokens.spacingVerticalL,
    marginBottom: tokens.spacingVerticalM,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },

  brandMark: {
    display: 'grid',
    placeItems: 'center',
    width: '36px',
    height: '36px',
    flexShrink: 0,
  },

  brandImage: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },

  brandTitle: {
    color: tokens.colorNeutralForeground1,
  },

  brandSub: {
    color: tokens.colorNeutralForeground3,
    marginTop: '2px',
  },

  navList: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
    ...shorthands.overflow('auto'),
    flexGrow: 1,
  },

  navTab: {
    justifyContent: 'flex-start',
    width: '100%',
    minHeight: '40px',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },

  navOpen: {
    '@media (max-width: 900px)': {
      transform: 'translateX(0)',
    },
  },

  footer: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    marginTop: 'auto',
    paddingTop: tokens.spacingVerticalMNudge,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalSNudge,
    paddingRight: tokens.spacingHorizontalSNudge,
    borderTopWidth: tokens.strokeWidthThin,
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    color: tokens.colorNeutralForeground3,
  },

  main: {
    gridColumn: '2',
    minWidth: '0',
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
  },

  topbar: {
    position: 'sticky',
    top: '0',
    zIndex: 10,
    columnGap: tokens.spacingHorizontalS,
    paddingLeft: GUTTER,
    paddingRight: GUTTER,
    minHeight: '48px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },

  menuButton: {
    display: 'none',
    '@media (max-width: 900px)': {
      display: 'inline-flex',
    },
  },

  selectField: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    minWidth: '0',
  },

  selectControl: {
    minWidth: '132px',
  },

  page: {
    width: '100%',
    maxWidth: '1420px',
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXXL,
    paddingLeft: GUTTER,
    paddingRight: GUTTER,
    boxSizing: 'border-box',
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  pageHeading: {
    marginBottom: tokens.spacingVerticalL,
  },

  pageTitle: {
    marginTop: '0',
    marginBottom: '0',
    fontSize: tokens.fontSizeHero800,
    lineHeight: tokens.lineHeightHero800,
    fontWeight: tokens.fontWeightSemibold,
  },

  pageSubtitle: {
    marginTop: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
  },

  notice: {
    marginBottom: tokens.spacingVerticalL,
  },

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalL,
  },

  toolbarSpacer: {
    marginLeft: 'auto',
    color: tokens.colorNeutralForeground3,
  },

  search: {
    width: 'min(320px, 100%)',
  },
})
