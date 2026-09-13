/**
 * 工作区（左资源列表 + 右编辑区）通用样式。
 * 所有工作区共享同一套间距/描边/圆角，保证视觉一致。
 */
import { makeStyles, tokens, shorthands } from '@fluentui/react-components'

export const useWorkspaceStyles = makeStyles({
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 1100px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },

  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 56px)',
    '@media (max-width: 1100px)': {
      maxHeight: 'none',
    },
  },

  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalS,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalS,
    minHeight: '56px',
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
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
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },

  navButtonSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.borderLeft('3px', 'solid', tokens.colorBrandStroke1),
  },

  navButtonCopy: {
    display: 'grid',
    rowGap: '3px',
    width: '100%',
    minWidth: '0',
  },

  navButtonMeta: {
    color: tokens.colorNeutralForeground3,
  },

  main: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    minWidth: '0',
  },

  /** 顶部命令条：字段在左，操作按钮在右 */
  commandBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },

  commandBarField: {
    flexGrow: 1,
    flexBasis: '220px',
    minWidth: '0',
  },

  commandBarActions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
    marginLeft: 'auto',
  },

  /** CardHeader action 槽专用：槽位本身已右对齐，不能再加 marginLeft:auto。 */
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXS,
  },

  fields: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
  },

  checks: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: tokens.spacingVerticalXS,
    width: '100%',
    paddingLeft: tokens.spacingHorizontalXXXL,
  },

  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },

  /** 可滚动表格容器 */
  tableWrap: {
    width: '100%',
    ...shorthands.overflow('auto'),
  },

  /** 泛用条目行 */
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },

  grow: {
    flexGrow: 1,
    minWidth: '0',
  },

  /** 文本块（标题 + 副标题） */
  stack: {
    display: 'grid',
    rowGap: '2px',
    minWidth: '0',
  },

  muted: {
    color: tokens.colorNeutralForeground3,
  },

  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground3,
  },

  /** 隐藏原生 file input，保留按钮样式（Fluent 官方推荐做法） */
  fileButton: {
    position: 'relative',
    ...shorthands.overflow('hidden'),
    '& input[type="file"]': {
      position: 'absolute',
      inset: '0',
      opacity: '0',
      cursor: 'pointer',
    },
  },

  /** 配置项行：开关在左，控件在右 */
  fieldRow: {
    alignItems: 'flex-start',
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    borderBottomWidth: tokens.strokeWidthThin,
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke3,
  },

  danger: {
    color: tokens.colorPaletteRedForeground1,
  },

  /** 时间线 / 课表网格 */
  gridScroll: {
    ...shorthands.overflow('auto'),
    maxWidth: '100%',
  },

  weekGrid: {
    display: 'grid',
    gap: tokens.spacingHorizontalXS,
    alignItems: 'stretch',
    minWidth: 'min-content',
  },

  gridHead: {
    display: 'grid',
    placeItems: 'center',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },

  weekRow: {
    display: 'contents',
  },

  timeCell: {
    display: 'grid',
    alignContent: 'center',
    rowGap: '2px',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },

  emptyCell: {
    display: 'grid',
    placeItems: 'center',
    minHeight: '40px',
    ...shorthands.border('1px', 'dashed', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },

  slot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '40px',
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalXS),
  },

  /** 时间线标记 */
  marker: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXS,
  },

  stackLayout: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
  },

  cardHeading: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },

  picker: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },

  paneTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },

  entryList: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    maxHeight: '420px',
    ...shorthands.overflow('auto'),
  },

  /** 换课条目按钮：色块 + 文案 + 状态标签 */
  entry: {
    justifyContent: 'flex-start',
    height: 'auto',
    width: '100%',
    textAlign: 'left',
    columnGap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    ...shorthands.border('1px', 'solid', 'transparent'),
  },

  entrySelected: {
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
  },

  swatch: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    flexShrink: 0,
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },

  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: tokens.strokeWidthThin,
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },

  guide: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },

  guideReady: {
    color: tokens.colorBrandForeground1,
  },

  /** 权限树 */
  tree: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
  },

  treeRoot: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },

  treeBranch: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
  },

  /** 树节点按钮：Fluent Button 默认居中，权限树需要左对齐。 */
  treeNode: {
    justifyContent: 'flex-start',
    width: '100%',
    textAlign: 'left',
  },

  treeChildren: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalXXL,
  },

  treeSplit: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 1000px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },

  treeResources: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalXS),
    maxHeight: '440px',
    ...shorthands.overflow('auto'),
  },

  treeSubList: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
  },

  resource: {
    justifyContent: 'flex-start',
    width: '100%',
    height: 'auto',
    minHeight: '32px',
    textAlign: 'left',
    color: tokens.colorNeutralForeground1,
  },

  resourceChild: {
    paddingLeft: tokens.spacingHorizontalXXL,
    color: tokens.colorNeutralForeground2,
  },

  resourceSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },

  module: {
    ...shorthands.padding(tokens.spacingVerticalXS, '0'),
  },

  moduleUnsupported: {
    opacity: '0.5',
  },
})
