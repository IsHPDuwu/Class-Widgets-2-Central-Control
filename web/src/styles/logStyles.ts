import { makeStyles, tokens, shorthands } from '@fluentui/react-components'
import type { BadgeProps } from '@fluentui/react-components'

export function logLevelColor(level: string): BadgeProps['color'] {
  switch (level.toLowerCase()) {
    case 'error':
    case 'critical':
      return 'danger'
    case 'warning':
    case 'warn':
      return 'warning'
    case 'debug':
      return 'informative'
    default:
      return 'brand'
  }
}

export function logLevelClass(level: string) {
  switch (level.toLowerCase()) {
    case 'error':
    case 'critical':
      return 'levelError' as const
    case 'warning':
    case 'warn':
      return 'levelWarning' as const
    case 'debug':
      return 'levelDebug' as const
    default:
      return 'levelInfo' as const
  }
}

export const useLogStyles = makeStyles({
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.6fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 1100px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
    maxHeight: '70vh',
    ...shorthands.overflow('auto'),
  },
  reportRow: {
    justifyContent: 'flex-start',
    height: 'auto',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    columnGap: tokens.spacingHorizontalS,
    textAlign: 'left',
    width: '100%',
  },
  reportRowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ...shorthands.borderLeft('3px', 'solid', tokens.colorBrandStroke1),
  },
  reportCopy: {
    display: 'grid',
    rowGap: '2px',
    minWidth: '0',
  },
  logViewer: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    minHeight: '320px',
  },
  filter: {
    width: 'min(280px, 100%)',
  },
  errorBar: {
    marginBottom: tokens.spacingVerticalS,
  },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  lines: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
    maxHeight: '60vh',
    ...shorthands.overflow('auto'),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  line: {
    display: 'grid',
    gridTemplateColumns: 'auto auto minmax(0, 1fr)',
    alignItems: 'baseline',
    columnGap: tokens.spacingHorizontalS,
    paddingTop: '2px',
    paddingBottom: '2px',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    paddingLeft: tokens.spacingHorizontalXS,
  },
  lineTime: {
    color: tokens.colorNeutralForeground3,
  },
  lineMessage: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    minWidth: '0',
  },
  levelError: { borderLeftColor: tokens.colorPaletteRedBorderActive },
  levelWarning: { borderLeftColor: tokens.colorPaletteDarkOrangeBorderActive },
  levelInfo: { borderLeftColor: tokens.colorBrandStroke1 },
  levelDebug: { borderLeftColor: tokens.colorNeutralStroke2 },
})
