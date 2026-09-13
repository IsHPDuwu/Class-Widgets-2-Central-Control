/**
 * 通用内容卡片 / 分节 / 空状态 / 表单栅格样式。
 * 所有页面共用，避免每个页面重复声明。
 */
import { makeStyles, tokens, shorthands } from '@fluentui/react-components'

export const useCardStyles = makeStyles({
  card: {
    marginBottom: tokens.spacingVerticalL,
  },
  header: {
    paddingBottom: tokens.spacingVerticalS,
  },
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXS,
    justifyContent: 'flex-end',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
  },
  empty: {
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
})

/** 两栏 / 三栏自适应栅格，用于表单与指标卡。 */
export const useGridStyles = makeStyles({
  two: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  twoEqual: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 760px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  fullRow: {
    gridColumn: '1 / -1',
  },
  groupsLayout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  three: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  four: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: tokens.spacingHorizontalM,
    alignItems: 'start',
  },
  /** 左侧资源列表 + 右侧详情 */
  sidebarLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 1100px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
})

/** 资源侧栏（各工作区左侧列表），统一为 Card + 列表按钮。 */
export const useResourceStyles = makeStyles({
  sidebar: {
    position: 'sticky',
    top: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 48px)',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '4px',
    padding: tokens.spacingHorizontalXS,
    ...shorthands.overflow('auto'),
  },
  navButton: {
    justifyContent: 'flex-start',
    height: 'auto',
    minHeight: '58px',
    width: '100%',
    textAlign: 'left',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  navButtonSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
  },
  navButtonCopy: {
    display: 'grid',
    rowGap: '3px',
    width: '100%',
    minWidth: '0',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    minWidth: '0',
  },
})

/** 指标卡（总览页） */
export const useMetricStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
  },
  value: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  label: {
    color: tokens.colorNeutralForeground3,
  },
})
