/**
 * 表单区块 / 分段选择 / 指标卡 / 命令列表样式。
 */
import { makeStyles, tokens, shorthands } from '@fluentui/react-components'

export const useFormStyles = makeStyles({
  /** 独立的设置区块卡片 */
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
    alignItems: 'start',
  },
  /** 表单底部操作行：说明文字在左，按钮在右 */
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    width: '100%',
  },
  actionsHint: {
    marginRight: 'auto',
    color: tokens.colorNeutralForeground3,
  },
  checks: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: tokens.spacingVerticalXS,
    width: '100%',
  },
  /** 指标卡容器 */
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalL,
  },
  metric: {
    display: 'grid',
    rowGap: tokens.spacingVerticalXS,
  },
  metricValue: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  metricLabel: {
    color: tokens.colorNeutralForeground3,
  },
  metricDetail: {
    color: tokens.colorNeutralForeground3,
  },
  metricSuccess: { color: tokens.colorPaletteGreenForeground1 },
  metricWarning: { color: tokens.colorPaletteDarkOrangeForeground1 },
  /** 组织引导条 */
  setup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
    color: tokens.colorPaletteGreenForeground1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorPaletteGreenBorderActive),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  setupCopy: {
    display: 'grid',
    rowGap: '2px',
    marginRight: 'auto',
  },
  setupActions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
  },
  /** 命令 / 日志行列表 */
  list: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  rowCopy: {
    display: 'grid',
    rowGap: '2px',
    minWidth: '0',
  },
  ackSummary: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    color: tokens.colorNeutralForeground3,
  },
  ackSuccess: { color: tokens.colorPaletteGreenForeground1 },
  ackFailed: { color: tokens.colorPaletteRedForeground1 },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  /** 配对码展示 */
  pairingCode: {
    display: 'grid',
    rowGap: tokens.spacingVerticalXS,
    justifyItems: 'center',
    padding: tokens.spacingVerticalL,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorBrandBackground2,
  },
  pairingCodeValue: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    letterSpacing: '0.15em',
    color: tokens.colorBrandForeground1,
  },
  /** 班级 / 分组条目 */
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  cardRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  cardRowCopy: {
    display: 'grid',
    rowGap: '2px',
    minWidth: '0',
  },
  cardRowMeta: {
    color: tokens.colorNeutralForeground3,
  },
  /** 成员授权条目 */
  member: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 1fr) minmax(0, 2fr) auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  memberCopy: {
    display: 'grid',
    rowGap: '2px',
  },
  search: {
    width: 'min(320px, 100%)',
  },
})
