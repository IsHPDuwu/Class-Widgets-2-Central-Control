/** 登录 / 注册 / OAuth 完成页样式。 */
import { makeStyles, tokens, shorthands } from '@fluentui/react-components'

export const useAuthStyles = makeStyles({
  page: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 1fr) minmax(430px, 560px)',
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
    '@media (max-width: 760px)': {
      display: 'flex',
      flexDirection: 'column',
    },
  },

  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
    borderRadius: '0',
    paddingTop: '12vw',
    paddingBottom: '12vw',
    paddingLeft: '12vw',
    paddingRight: '12vw',
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundImage: 'linear-gradient(135deg, var(--colorBrandBackground) 0%, var(--colorBrandBackgroundHover) 52%, var(--colorBrandBackgroundPressed) 100%)',
    '@media (max-width: 760px)': {
      minHeight: '220px',
      paddingTop: tokens.spacingVerticalXXL,
      paddingBottom: tokens.spacingVerticalXXL,
      paddingLeft: tokens.spacingHorizontalXXL,
      paddingRight: tokens.spacingHorizontalXXL,
    },
  },

  bannerCopy: {
    display: 'grid',
    rowGap: tokens.spacingVerticalS,
    maxWidth: '390px',
    justifyItems: 'center',
    textAlign: 'center',
  },

  bannerLogo: {
    width: '104px',
    height: '104px',
    objectFit: 'contain',
    marginBottom: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusLarge,
  },

  bannerTag: {
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: tokens.fontSizeBase400,
  },

  bannerTitle: {
    fontSize: tokens.fontSizeHero800,
    lineHeight: tokens.lineHeightHero800,
    fontWeight: tokens.fontWeightSemibold,
  },

  bannerText: {
    color: tokens.colorNeutralForegroundOnBrand,
    maxWidth: '390px',
    marginTop: tokens.spacingVerticalXXL,
    lineHeight: tokens.lineHeightBase400,
  },

  card: {
    alignSelf: 'center',
    width: 'min(calc(100% - 72px), 520px)',
    marginTop: tokens.spacingVerticalXXL,
    marginBottom: tokens.spacingVerticalXXL,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    ...shorthands.gap(tokens.spacingVerticalXL),
    '@media (max-width: 760px)': {
      width: 'calc(100% - 32px)',
      marginTop: tokens.spacingVerticalL,
      marginBottom: tokens.spacingVerticalL,
      paddingLeft: tokens.spacingHorizontalL,
      paddingRight: tokens.spacingHorizontalL,
    },
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
  },

  heading: {
    display: 'grid',
    rowGap: tokens.spacingVerticalXS,
  },

  headingText: {
    color: tokens.colorNeutralForeground3,
  },

  segment: {
    width: '100%',
  },

  oauthOptions: {
    display: 'grid',
    rowGap: tokens.spacingVerticalS,
    justifyItems: 'stretch',
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: tokens.strokeWidthThin,
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },

  oauthHint: {
    color: tokens.colorNeutralForeground3,
  },
})
