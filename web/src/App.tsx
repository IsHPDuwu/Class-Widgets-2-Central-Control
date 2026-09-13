import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Add24Regular,
  AppsListDetail24Regular,
  ArrowRepeatAll24Regular,
  ArrowClockwise24Regular,
  CalendarLtr24Regular,
  CalendarSync24Regular,
  Code24Regular,
  Delete24Regular,
  Desktop24Regular,
  DocumentBulletList24Regular,
  Key24Regular,
  Navigation24Regular,
  Organization24Regular,
  PeopleTeam24Regular,
  Search24Regular,
  ShieldLock24Regular,
  Filter24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
  DesktopMac24Regular,
  SignOut24Regular,
} from '@fluentui/react-icons'
import { Badge, Button, Card, CardHeader, Checkbox, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Tab, TabList, TableCellLayout, Text, Textarea, Toolbar, ToolbarButton, ToolbarDivider, createTableColumn, mergeClasses } from '@fluentui/react-components'
import { useShellStyles } from './styles/shellStyles'
import { logLevelClass, logLevelColor, useLogStyles } from './styles/logStyles'
import { useAuthStyles } from './styles/authStyles'
import { useCardStyles, useGridStyles } from './styles/layoutStyles'
import { useFormStyles } from './styles/formStyles'
import { api, getAdminKey, getSessionToken, setAdminKey, setSessionToken, type AdminUser, type CommandRecord, type Device, type DiagnosticDetail, type Group, type OAuthProviderPublic, type Organization, type Principal } from './api'
import { ScheduleWorkspace } from './ScheduleWorkspace'
import { TimelineWorkspace } from './TimelineWorkspace'
import { CrossGroupScheduleWorkspace } from './CrossGroupScheduleWorkspace'
import { CourseWorkspace } from './CourseWorkspace'
import { ConfigWorkspace } from './ConfigWorkspace'
import { AutomationWorkspace } from './AutomationWorkspace'
import { ClassSwapWorkspace } from './ClassSwapWorkspace'
import { AccessManagement } from './AccessManagement'
import { ClassGroupWorkspace } from './ClassGroupWorkspace'
import { OAuthProviderManagement } from './OAuthProviderManagement'
import centralControlIcon from './assets/cw2-jikong.png'
type ThemeMode = 'system' | 'light' | 'dark'

const THEME_LABELS: Record<ThemeMode, string> = { system: '跟随系统', light: '浅色', dark: '深色' }

/** 点击图标后按此顺序循环：跟随系统 → 浅色 → 深色 → 跟随系统 */
const THEME_ORDER: ThemeMode[] = ['system', 'light', 'dark']

type View = 'overview' | 'devices' | 'groups' | 'class-groups' | 'schedule' | 'timelines' | 'courses' | 'cross-schedule' | 'class-swap' | 'policy' | 'commands' | 'automation' | 'logs' | 'tenants'
type Notice = { tone: 'success' | 'error'; message: string } | null

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Desktop24Regular }> = [
  { id: 'overview', label: '总览', icon: AppsListDetail24Regular },
  { id: 'devices', label: '设备', icon: Desktop24Regular },
  { id: 'groups', label: '班级与配对', icon: Organization24Regular },
  { id: 'class-groups', label: '分组管理', icon: PeopleTeam24Regular },
  { id: 'schedule', label: '课表发布', icon: CalendarLtr24Regular },
  { id: 'timelines', label: '时间线', icon: CalendarLtr24Regular },
  { id: 'courses', label: '课表课程', icon: DocumentBulletList24Regular },
  { id: 'cross-schedule', label: '按天排课', icon: CalendarSync24Regular },
  { id: 'class-swap', label: '临时换课', icon: CalendarSync24Regular },
  { id: 'policy', label: '策略', icon: ShieldLock24Regular },
  { id: 'commands', label: '命令', icon: Code24Regular },
  { id: 'automation', label: '自动化', icon: ArrowRepeatAll24Regular },
  { id: 'logs', label: '客户端日志', icon: DocumentBulletList24Regular },
]

const VIEW_TITLES: Record<View, [string, string]> = {
  overview: ['运行总览', '设备连接与配置下发状态'],
  devices: ['设备', '检查终端状态、版本和配置修订'],
  groups: ['班级与配对', '组织终端并生成一次性配对码'],
  'class-groups': ['分组管理', '将多个班级整理为可快捷选择的分组'],
  schedule: ['课表发布', '校验并向选定班级发布课表'],
  timelines: ['时间线', '维护可复用的上课时间结构'],
  courses: ['课表课程', '配置课表可使用的课程信息'],
  'cross-schedule': ['按天排课', '按公共时间线为多个班级逐天安排课程'],
  'class-swap': ['临时换课', '获取客户端单双周课表并下发换课事件'],
  policy: ['策略', '统一锁定终端的受管设置'],
  commands: ['命令', '向班级或单台设备下发受限操作'],
  automation: ['自动化', '按服务器时间和设备条件自动执行动作'],
  logs: ['客户端日志', '查看终端动态上报的诊断与日志'],
  tenants: ['租户管理', '创建租户账号并配置可访问的组织范围'],
}

function isOnline(device: Device) {
  if (!device.last_seen || device.revoked) return false
  return Date.now() - new Date(device.last_seen).getTime() < 45_000
}

function relativeTime(value: string | null) {
  if (!value) return '从未连接'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds} 秒前`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  return `${Math.floor(seconds / 3600)} 小时前`
}

function App({ themeMode, onThemeModeChange }: { themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const shellStyles = useShellStyles()
  const [view, setView] = useState<View>('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [adminKey, updateAdminKey] = useState(getAdminKey())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [classGroups, setClassGroups] = useState<import('./api').ClassGroup[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [oauthPending, setOauthPending] = useState(false)

  const refresh = useCallback(async () => {
    if (!getAdminKey() && !getSessionToken()) { setConnected(false); return }
    if (oauthPending) { setConnected(true); return }
    setLoading(true)
    try {
      const [nextPrincipal, nextOrganizations] = await Promise.all([api.me(), api.organizations()])
      setPrincipal(nextPrincipal)
      setOrganizations(nextOrganizations)
      const nextOrganizationId = nextOrganizations.some((organization) => organization.id === organizationId)
        ? organizationId
        : nextOrganizations[0]?.id ?? ''
      setOrganizationId(nextOrganizationId)
      if (!nextOrganizationId) {
        setGroups([])
        setDevices([])
        setConnected(true)
        setNotice(null)
        return
      }
      const [nextGroups, nextDevices, nextClassGroups] = await Promise.all([
        api.groups(nextOrganizationId), api.devices(nextOrganizationId), api.classGroups(nextOrganizationId),
      ])
      setGroups(nextGroups)
      setDevices(nextDevices)
      setClassGroups(nextClassGroups)
      setConnected(true)
      setNotice(null)
    } catch (error) {
      setAdminKey('')
      setSessionToken('')
      setConnected(false)
      setPrincipal(null)
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '无法连接服务' })
    } finally {
      setLoading(false)
    }
  }, [oauthPending, organizationId])

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search)
    const exchangeCode = window.location.pathname === '/oauth/callback' ? parameters.get('code') : null
    if (exchangeCode) {
      void api.exchangeOAuthCode(exchangeCode).then((result) => {
        setSessionToken(result.token)
        setAdminKey('')
        window.history.replaceState({}, '', parameters.get('return_path') || '/')
        void api.me().then((nextPrincipal) => {
          setPrincipal(nextPrincipal)
          if (nextPrincipal.authorization_status === 'pending') {
            setOauthPending(true)
            setConnected(true)
          } else void refresh()
        })
      }).catch((error) => setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'OIDC 登录失败' }))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  function connect(event: FormEvent) {
    event.preventDefault()
    setSessionToken('')
    setAdminKey(adminKey.trim())
    void refresh()
  }

  async function login(event: FormEvent) {
    event.preventDefault()
    try {
      const result = await api.login(username.trim(), password)
      setSessionToken(result.token)
      setAdminKey('')
      await refresh()
      setPassword('')
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '登录失败' })
    }
  }

  function complete(message: string, tone: 'success' | 'error' = 'success') {
    setNotice({ tone, message })
    if (tone === 'success') void refresh()
  }

  async function logout() {
    try { if (getSessionToken()) await api.logout() } catch { /* 本地凭据仍需清理 */ }
    setSessionToken('')
    setAdminKey('')
    updateAdminKey('')
    setPrincipal(null)
    setConnected(false)
  }

  const [title, subtitle] = VIEW_TITLES[view]
  const navItems = principal?.platform_admin || principal?.permissions.some((permission) => permission.startsWith('platform.'))
    ? [...NAV_ITEMS, { id: 'tenants' as const, label: '租户管理', icon: PeopleTeam24Regular }]
    : NAV_ITEMS

  if (!connected) return <LoginPage adminKey={adminKey} onAdminKeyChange={updateAdminKey} username={username} password={password} onUsernameChange={setUsername} onPasswordChange={setPassword} onAdminLogin={connect} onTenantLogin={login} loading={loading} onComplete={complete} />
  if (oauthPending) return <OAuthCompletionPage onComplete={() => { setOauthPending(false); void refresh() }} />
  return <div className={shellStyles.shell}>
    <aside className={mobileNav ? mergeClasses(shellStyles.nav, shellStyles.navOpen) : shellStyles.nav}>
      <div className={shellStyles.brand}>
        <div className={shellStyles.brandMark}><img className={shellStyles.brandImage} src={centralControlIcon} alt="" /></div>
        <div><Text className={shellStyles.brandTitle} weight="semibold" size={400} block>集控</Text><Text className={shellStyles.brandSub} size={200} block>Class Widgets</Text></div>
      </div>
      <TabList className={shellStyles.navList} vertical selectedValue={view} onTabSelect={(_, data) => { setView(data.value as View); setMobileNav(false) }} aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; return <Tab className={shellStyles.navTab} key={item.id} value={item.id} icon={<Icon />}>{item.label}</Tab> })}</TabList>
      <div className={shellStyles.footer}>
        <Badge size="tiny" appearance="filled" color={connected ? 'success' : 'informative'} aria-label={connected ? '服务已连接' : '服务未连接'} />
        <Text size={200}>{connected ? '服务已连接' : '服务未连接'}</Text>
      </div>
    </aside>
    <main className={shellStyles.main}>
      <Toolbar className={shellStyles.topbar} size="small">
        <ToolbarButton className={shellStyles.menuButton} appearance="subtle" icon={<Navigation24Regular />} aria-label="打开导航" onClick={() => setMobileNav(!mobileNav)} />
        <ToolbarDivider />
        <div className={shellStyles.selectField}><Organization24Regular /><Dropdown className={shellStyles.selectControl} appearance="filled-darker" aria-label="当前组织" selectedOptions={organizationId ? [organizationId] : []} value={organizations.find((item) => item.id === organizationId)?.name ?? '未选择组织'} onOptionSelect={(_, data) => setOrganizationId(data.optionValue ?? '')}>{organizations.map((organization) => <Option key={organization.id} value={organization.id}>{organization.name}</Option>)}</Dropdown></div>
        <ToolbarDivider />
        <div className={shellStyles.toolbarSpacer} />
        <ToolbarButton
          appearance="subtle"
          icon={themeMode === 'system' ? <DesktopMac24Regular /> : themeMode === 'light' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
          aria-label={`颜色模式：${THEME_LABELS[themeMode]}`}
          onClick={() => onThemeModeChange(THEME_ORDER[(THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length])}
        />
        <ToolbarButton appearance="subtle" icon={<ArrowClockwise24Regular />} aria-label="刷新" disabled={loading} onClick={() => void refresh()} />
        <ToolbarButton appearance="subtle" icon={<SignOut24Regular />} aria-label="退出登录" title="退出登录" onClick={() => void logout()} />
      </Toolbar>
      <div className={shellStyles.page}>
        <header className={shellStyles.pageHeading}><Text as="h1" className={shellStyles.pageTitle} block>{title}</Text><Text className={shellStyles.pageSubtitle} block>{subtitle}</Text></header>
        {notice && <MessageBar className={shellStyles.notice} intent={notice.tone === 'success' ? 'success' : 'error'}><MessageBarBody>{notice.message}</MessageBarBody></MessageBar>}
          {view === 'overview' && <Overview devices={devices} groups={groups} organizations={organizations} onComplete={complete} />}
        {view === 'devices' && <DevicesView devices={devices} groups={groups} onComplete={complete} />}
        {view === 'groups' && <GroupsView organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'class-groups' && <ClassGroupWorkspace organizationId={organizationId} groups={groups} onComplete={complete} />}
        {view === 'schedule' && <ScheduleWorkspace organizationId={organizationId} groups={groups} classGroups={classGroups} onComplete={complete} />}
        {view === 'timelines' && <TimelineWorkspace organizationId={organizationId} onComplete={complete} />}
        {view === 'courses' && <CourseWorkspace organizationId={organizationId} onComplete={complete} />}
        {view === 'cross-schedule' && <CrossGroupScheduleWorkspace organizationId={organizationId} groups={groups} classGroups={classGroups} onComplete={complete} />}
        {view === 'class-swap' && <ClassSwapWorkspace organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'policy' && <ConfigWorkspace organizationId={organizationId} groups={groups} classGroups={classGroups} onComplete={complete} />}
        {view === 'commands' && <CommandsView organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'automation' && <AutomationWorkspace organizationId={organizationId} groups={groups} devices={devices} onComplete={complete} />}
        {view === 'logs' && <LogsView organizationId={organizationId} />}
        {view === 'tenants' && (principal?.platform_admin || principal?.permissions.some((permission) => permission.startsWith('platform.'))) && <TenantManagement organizations={organizations} groups={groups} devices={devices} onComplete={complete} />}
      </div>
    </main>
  </div>
}

function LoginPage({ adminKey, onAdminKeyChange, username, password, onUsernameChange, onPasswordChange, onAdminLogin, onTenantLogin, loading, onComplete }: { adminKey: string; onAdminKeyChange: (value: string) => void; username: string; password: string; onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void; onAdminLogin: (event: FormEvent) => void; onTenantLogin: (event: FormEvent) => void; loading: boolean; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const authStyles = useAuthStyles()
  const [mode, setMode] = useState<'tenant' | 'admin'>('tenant')
  const [registering, setRegistering] = useState(false)
  const [registrationAllowed, setRegistrationAllowed] = useState(false)
  const [organizationName, setOrganizationName] = useState('')
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderPublic[]>([])
  useEffect(() => { api.registrationStatus().then((result) => setRegistrationAllowed(result.allow_registration)).catch(() => setRegistrationAllowed(false)) }, [])
  useEffect(() => { api.oauthProvidersPublic().then(setOauthProviders).catch(() => setOauthProviders([])) }, [])
  async function register(event: FormEvent) { event.preventDefault(); try { await api.register({ organization_name: organizationName.trim(), username: username.trim(), password }); setRegistering(false); onComplete('注册成功，请登录'); setOrganizationName('') } catch (error) { onComplete(error instanceof Error ? error.message : '注册失败', 'error') } }
  const usernameValid = /^[A-Za-z0-9_.-]+$/.test(username.trim())
  const passwordTooShort = password.length > 0 && password.length < 12
  const passwordTooLong = password.length > 200
  return (
    <div className={authStyles.page}>
      <Card className={authStyles.banner}>
        <div className={authStyles.bannerCopy}>
          <img className={authStyles.bannerLogo} src={centralControlIcon} alt="" />
          <Text className={authStyles.bannerTitle} weight="semibold" block>Class Widgets</Text>
          <Text className={authStyles.bannerTag} block>集中管理平台</Text>
          <Text className={authStyles.bannerText} block>统一管理设备、课表、策略与自动化任务。</Text>
        </div>
      </Card>
      <Card className={authStyles.card}>
        <div className={authStyles.heading}>
          <Text as="h1" size={700} weight="semibold" block>{registering ? '创建租户账号' : '登录集控'}</Text>
          <Text className={authStyles.headingText} block>{mode === 'admin' ? '平台管理员使用管理密钥进入后台。' : registering ? '注册后将创建一个新的租户及管理员账号。' : '租户成员使用账号、密码或组织身份源登录。'}</Text>
        </div>
        {!registering && (
          <TabList className={authStyles.segment} selectedValue={mode} onTabSelect={(_, data) => setMode(data.value as 'tenant' | 'admin')}>
            <Tab value="tenant">租户登录</Tab>
            <Tab value="admin">管理员登录</Tab>
          </TabList>
        )}
        {registering ? (
          <form className={authStyles.form} onSubmit={register}>
            <Field label="租户名称" required hint="1–120 个字符，例如：示范中学">
              <Input value={organizationName} maxLength={120} onChange={(_, data) => setOrganizationName(data.value)} placeholder="例如：示范中学" />
            </Field>
            <Field
              label="管理员用户名"
              required
              hint="1–80 个字符，仅支持字母、数字、下划线、点与连字符。"
              validationState={username.length > 0 && !usernameValid ? 'error' : undefined}
              validationMessage={username.length > 0 && !usernameValid ? '只能包含字母、数字、下划线、点或连字符。' : undefined}
            >
              <Input value={username} maxLength={80} onChange={(_, data) => onUsernameChange(data.value)} placeholder="例如：admin" />
            </Field>
            <Field
              label="密码"
              required
              hint="12–200 个字符，请使用足够复杂的密码。"
              validationState={passwordTooShort || passwordTooLong ? 'error' : password.length >= 12 ? 'success' : undefined}
              validationMessage={passwordTooShort ? `密码至少需要 12 个字符，当前 ${password.length} 个。` : passwordTooLong ? '密码不能超过 200 个字符。' : password.length >= 12 ? '密码长度符合要求。' : undefined}
            >
              <Input type="password" value={password} maxLength={200} onChange={(_, data) => onPasswordChange(data.value)} placeholder="至少 12 个字符" />
            </Field>
            <Button appearance="primary" type="submit" disabled={!organizationName.trim() || !username.trim() || !usernameValid || password.length < 12 || passwordTooLong || loading}>注册</Button>
            <Button appearance="subtle" type="button" onClick={() => setRegistering(false)}>返回登录</Button>
          </form>
        ) : mode === 'admin' ? (
          <form className={authStyles.form} onSubmit={onAdminLogin}>
            <Field label="管理员密钥" required hint="平台管理员密钥可在部署配置中查看或重置。">
              <Input type="password" value={adminKey} onChange={(_, data) => onAdminKeyChange(data.value)} placeholder="输入平台管理员密钥" />
            </Field>
            <Button appearance="primary" type="submit" disabled={!adminKey.trim() || loading}>管理员登录</Button>
          </form>
        ) : (
          <>
            <form className={authStyles.form} onSubmit={onTenantLogin}>
              <Field label="用户名" required hint="使用注册时创建的租户账号。">
                <Input value={username} maxLength={80} onChange={(_, data) => onUsernameChange(data.value)} placeholder="用户名" />
              </Field>
              <Field
                label="密码"
                required
                hint="至少 12 个字符。"
                validationState={passwordTooShort ? 'error' : undefined}
                validationMessage={passwordTooShort ? `密码至少需要 12 个字符，当前 ${password.length} 个。` : undefined}
              >
                <Input type="password" value={password} maxLength={200} onChange={(_, data) => onPasswordChange(data.value)} placeholder="至少 12 个字符" />
              </Field>
              <Button appearance="primary" type="submit" disabled={!username.trim() || password.length < 12 || passwordTooLong || loading}>登录</Button>
              {registrationAllowed && <Button appearance="subtle" type="button" onClick={() => setRegistering(true)}>注册新租户</Button>}
            </form>
            {oauthProviders.length > 0 && (
              <div className={authStyles.oauthOptions}>
                <Text className={authStyles.oauthHint} block>或使用组织身份源</Text>
                {oauthProviders.map((provider) => (
                  <Button key={provider.key} appearance="outline" icon={<ShieldLock24Regular />} onClick={() => { window.location.href = `/api/v1/auth/oauth/${encodeURIComponent(provider.key)}/start?return_path=${encodeURIComponent('/')}` }}>使用 {provider.name} 登录</Button>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
function OAuthCompletionPage({ onComplete }: { onComplete: () => void }) {
  const authStyles = useAuthStyles()
  const [mode, setMode] = useState<'register' | 'bind'>('register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const result = await api.completeOAuth({ mode, username: username.trim(), password, ...(mode === 'register' ? { organization_name: organizationName.trim() } : {}) })
      if (result.token) setSessionToken(result.token)
      onComplete()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败') } finally { setLoading(false) }
  }
  const usernameValid = /^[A-Za-z0-9_.-]+$/.test(username.trim())
  const passwordTooShort = password.length > 0 && password.length < 12
  const passwordTooLong = password.length > 200
  return (
    <div className={authStyles.page}>
      <Card className={authStyles.banner}>
        <div className={authStyles.bannerCopy}>
          <img className={authStyles.bannerLogo} src={centralControlIcon} alt="" />
          <Text className={authStyles.bannerTitle} weight="semibold" block>Class Widgets</Text>
          <Text className={authStyles.bannerTag} block>完成账号设置</Text>
          <Text className={authStyles.bannerText} block>这是该身份源首次登录，请选择账号处理方式。</Text>
        </div>
      </Card>
      <Card className={authStyles.card}>
        <div className={authStyles.heading}>
          <Text as="h1" size={700} weight="semibold" block>完成 OAuth 登录</Text>
          <Text className={authStyles.headingText} block>未找到对应的集控账号。</Text>
        </div>
        <TabList className={authStyles.segment} selectedValue={mode} onTabSelect={(_, data) => setMode(data.value as 'register' | 'bind')}>
          <Tab value="register">注册新账号</Tab>
          <Tab value="bind">绑定已有账号</Tab>
        </TabList>
        {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        <form className={authStyles.form} onSubmit={submit}>
          <Field
            label="集控用户名"
            required
            hint={mode === 'bind' ? '输入已有的集控用户名，用于与当前身份源绑定。' : '1–80 个字符，仅支持字母、数字、下划线、点与连字符。'}
            validationState={username.length > 0 && !usernameValid ? 'error' : undefined}
            validationMessage={username.length > 0 && !usernameValid ? '只能包含字母、数字、下划线、点或连字符。' : undefined}
          >
            <Input value={username} maxLength={80} onChange={(_, data) => setUsername(data.value)} placeholder={mode === 'bind' ? '输入已有用户名' : '设置用户名'} />
          </Field>
          <Field
            label="密码"
            required
            hint={mode === 'bind' ? '输入该集控账号的现有密码，用于验证身份。' : '12–200 个字符，请使用足够复杂的密码。'}
            validationState={passwordTooShort || passwordTooLong ? 'error' : undefined}
            validationMessage={passwordTooShort ? `密码至少需要 12 个字符，当前 ${password.length} 个。` : passwordTooLong ? '密码不能超过 200 个字符。' : undefined}
          >
            <Input type="password" value={password} maxLength={200} onChange={(_, data) => setPassword(data.value)} placeholder={mode === 'bind' ? '验证已有密码' : '至少 12 个字符'} />
          </Field>
          {mode === 'register' && (
            <Field label="新建组织名称" required hint="1–120 个字符，例如：示范中学">
              <Input value={organizationName} maxLength={120} onChange={(_, data) => setOrganizationName(data.value)} placeholder="例如：示范中学" />
            </Field>
          )}
          <Button appearance="primary" type="submit" disabled={loading || !username.trim() || !usernameValid || password.length < 12 || passwordTooLong || (mode === 'register' && !organizationName.trim())}>
            {mode === 'bind' ? '验证并绑定' : '创建账号并继续'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

function TenantManagement({ organizations, groups, devices, onComplete }: { organizations: Organization[]; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const cardStyles = useCardStyles()
  const formStyles = useFormStyles()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [tenantName, setTenantName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('operator')
  const [selected, setSelected] = useState<string[]>([])
  const [allowRegistration, setAllowRegistration] = useState(false)
  useEffect(() => { void api.registrationSetting().then((setting) => setAllowRegistration(setting.allow_registration)).catch(() => undefined) }, [])
  const load = useCallback(() => api.users().then(setUsers).catch((error) => onComplete(error instanceof Error ? error.message : '加载成员失败', 'error')), [onComplete])
  useEffect(() => { void load() }, [load])
  async function createTenant(event: FormEvent) { event.preventDefault(); try { await api.createOrganization(tenantName.trim()); setTenantName(''); onComplete('租户已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建租户失败', 'error') } }
  async function createMember(event: FormEvent) { event.preventDefault(); try { await api.createUser({ username: username.trim(), password, role, organization_ids: selected }); setUsername(''); setPassword(''); setSelected([]); onComplete('租户成员已创建'); load() } catch (error) { onComplete(error instanceof Error ? error.message : '创建成员失败', 'error') } }
  async function assign(user: AdminUser, ids: string[]) { try { await api.assignUserOrganizations(user.id, ids); onComplete(`“${user.username}”的租户范围已更新`); load() } catch (error) { onComplete(error instanceof Error ? error.message : '更新授权失败', 'error') } }
  function organizationChecks(ids: string[], change: (value: string[]) => void) { return <div className="checks">{organizations.map((organization) => <Checkbox key={organization.id} label={organization.name} checked={ids.includes(organization.id)} onChange={(_, data) => change(data.checked ? [...ids, organization.id] : ids.filter((id) => id !== organization.id))} />)}</div> }
  return <div className={formStyles.sectionBody}>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>总设置</Text>} description={<Text size={200}>控制是否允许未登录用户在登录页注册新租户。</Text>} />
      <Checkbox label="允许公开注册" checked={allowRegistration} onChange={(_, data) => { const enabled = Boolean(data.checked); setAllowRegistration(enabled); void api.updateRegistrationSetting(enabled).then(() => onComplete(enabled ? '已允许公开注册' : '已关闭公开注册')).catch((error) => onComplete(error instanceof Error ? error.message : '保存设置失败', 'error')) }} />
    </Card>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>新建租户</Text>} description={<Text size={200}>每个租户拥有独立的班级、设备、课表、策略、命令和日志。</Text>} />
      <form className={formStyles.form} onSubmit={createTenant}>
        <Field label="租户名称" required hint="1-120 个字符，例如：示范中学"><Input value={tenantName} maxLength={120} onChange={(_, data) => setTenantName(data.value)} placeholder="例如：示范中学" /></Field>
        <Button appearance="primary" type="submit" disabled={!tenantName.trim()} icon={<Add24Regular />}>创建租户</Button>
      </form>
    </Card>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>新建成员</Text>} description={<Text size={200}>创建后可在下方权限树中精细授权。</Text>} />
      <form className={formStyles.form} onSubmit={createMember}>
        <Field label="用户名" required hint="1-80 个字符，仅支持字母、数字、下划线、点与连字符。"><Input value={username} maxLength={80} onChange={(_, data) => setUsername(data.value)} /></Field>
        <Field label="密码" required hint="12-200 个字符。"><Input type="password" maxLength={200} value={password} onChange={(_, data) => setPassword(data.value)} placeholder="至少 12 个字符" /></Field>
        <Field label="初始模板" required hint="决定该成员创建时获得的默认权限范围。"><Dropdown selectedOptions={[role]} onOptionSelect={(_, data) => setRole(data.optionValue ?? 'viewer')}><Option value="viewer">只读</Option><Option value="operator">操作员</Option><Option value="admin">租户管理员</Option></Dropdown></Field>
        <Field label="初始组织范围" hint="留空表示稍后在权限树中授权。">{organizationChecks(selected, setSelected)}</Field>
        <Button appearance="primary" type="submit" disabled={!username.trim() || password.length < 12} icon={<PeopleTeam24Regular />}>创建成员</Button>
      </form>
    </Card>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>成员与租户授权</Text>} description={<Text size={200}>{users.length} 名成员</Text>} />
      {users.length === 0 && <div className={formStyles.empty}>暂无成员</div>}
      <div className={formStyles.list}>{users.map((user) => <TenantMemberRow key={user.id} user={user} organizations={organizations} onAssign={assign} />)}</div>
    </Card>
    <AccessManagement organizations={organizations} groups={groups} devices={devices} users={users} onUsersChanged={load} onComplete={onComplete} />
    <OAuthProviderManagement onComplete={onComplete} />
  </div>
}

function TenantMemberRow({ user, organizations, onAssign }: { user: AdminUser; organizations: Organization[]; onAssign: (user: AdminUser, ids: string[]) => void }) {
  const formStyles = useFormStyles()
  const [ids, setIds] = useState(user.organization_ids)
  useEffect(() => setIds(user.organization_ids), [user.organization_ids])
  return <div className={formStyles.member}>
    <div className={formStyles.memberCopy}><Text weight="semibold" block>{user.username}</Text><Text className={formStyles.metricLabel} size={200} block>{user.role} · {user.disabled ? '已停用' : '启用'}</Text></div>
    <div className={formStyles.checks}>{organizations.map((organization) => <Checkbox key={organization.id} label={organization.name} checked={ids.includes(organization.id)} onChange={(_, data) => setIds(data.checked ? [...ids, organization.id] : ids.filter((id) => id !== organization.id))} />)}</div>
    <Button appearance="primary" onClick={() => onAssign(user, ids)}>保存授权</Button>
  </div>
}

function Overview({ devices, groups, organizations, onComplete }: { devices: Device[]; groups: Group[]; organizations: Organization[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const formStyles = useFormStyles()
  const online = devices.filter(isOnline).length
  const drifted = devices.filter((device) => { const group = groups.find((item) => item.id === device.group_id); return group && (device.schedule_revision < group.schedule_revision || device.policy_revision < group.policy_revision) }).length
  return <>{organizations.length === 0 && <OrganizationSetup onComplete={onComplete} />}<div className={formStyles.metrics}><Metric label="设备总数" value={devices.length} detail={`${groups.length} 个班级`} /><Metric label="在线" value={online} detail={devices.length ? `${Math.round(online / devices.length * 100)}% 可用` : '等待设备配对'} tone="success" /><Metric label="配置漂移" value={drifted} detail={drifted ? '等待终端同步' : '修订状态一致'} tone={drifted ? 'warning' : undefined} /><Metric label="离线" value={devices.length - online} detail="超过 45 秒未上报" /></div><DeviceTable devices={devices.slice(0, 8)} groups={groups} title="最近设备" /></>
}

function OrganizationSetup({ onComplete }: { onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const formStyles = useFormStyles()
  const [name, setName] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); try { await api.createOrganization(name); onComplete('组织已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建失败', 'error') } }
  return <form className={formStyles.setup} onSubmit={submit}><Organization24Regular /><div className={formStyles.setupCopy}><Text weight="semibold" block>创建首个组织</Text><Text size={200} block>组织是班级、课表和策略的管理边界。</Text></div><div className={formStyles.setupActions}><Input value={name} onChange={(_, data) => setName(data.value)} placeholder="例如：示范中学" /><Button appearance="primary" disabled={!name.trim()} icon={<Add24Regular />}>创建</Button></div></form>
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: 'success' | 'warning' }) {
  const formStyles = useFormStyles()
  const valueClass = tone === 'success' ? formStyles.metricSuccess : tone === 'warning' ? formStyles.metricWarning : undefined
  return <Card className={formStyles.metric}><Text className={formStyles.metricLabel} size={200} block>{label}</Text><Text className={mergeClasses(formStyles.metricValue, valueClass)} block>{value}</Text><Text className={formStyles.metricDetail} size={200} block>{detail}</Text></Card>
}

function DevicesView({ devices, groups, onComplete }: { devices: Device[]; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const formStyles = useFormStyles()
  const [query, setQuery] = useState('')
  const filtered = devices.filter((device) => device.name.toLowerCase().includes(query.toLowerCase()))
  async function move(deviceId: string, groupId: string) { try { await api.moveDevice(deviceId, groupId); onComplete('设备班级已更新') } catch (error) { onComplete(error instanceof Error ? error.message : '换组失败', 'error') } }
  async function remove(deviceId: string, deviceName: string) {
    if (!window.confirm(`确定删除设备“${deviceName}”？删除后该设备需要重新配对。`)) return
    try { await api.deleteDevice(deviceId); onComplete('设备已删除') } catch (error) { onComplete(error instanceof Error ? error.message : '删除设备失败', 'error') }
  }
  return <><div className={formStyles.actions} style={{ justifyContent: 'flex-start' }}><Input className={formStyles.search} contentBefore={<Search24Regular />} placeholder="搜索设备名称" value={query} onChange={(_, data) => setQuery(data.value)} /><Text className={formStyles.metricLabel}>{filtered.length} 台设备</Text></div><DeviceTable devices={filtered} groups={groups} title="全部设备" onMove={move} onDelete={remove} /></>
}

function DeviceTable({ devices, groups, title, onMove, onDelete }: { devices: Device[]; groups: Group[]; title: string; onMove?: (deviceId: string, groupId: string) => void; onDelete?: (deviceId: string, deviceName: string) => void }) {
  const DeviceBody = DataGridBody<Device>
  const DeviceRow = DataGridRow<Device>
  const columns = [
    createTableColumn<Device>({
      columnId: 'name',
      renderHeaderCell: () => '设备',
      renderCell: (device) => <TableCellLayout media={<Desktop24Regular />} description={device.id.slice(0, 8)}>{device.name}</TableCellLayout>,
    }),
    createTableColumn<Device>({
      columnId: 'state',
      renderHeaderCell: () => '状态',
      renderCell: (device) => <Badge appearance="tint" color={device.revoked ? 'danger' : isOnline(device) ? 'success' : 'informative'}>{device.revoked ? '已撤销' : isOnline(device) ? '在线' : '离线'}</Badge>,
    }),
    createTableColumn<Device>({
      columnId: 'group',
      renderHeaderCell: () => '班级',
      renderCell: (device) => onMove
        ? <Dropdown aria-label={`调整 ${device.name} 的班级`} placeholder="选择班级" selectedOptions={device.group_id ? [device.group_id] : []} value={groups.find((group) => group.id === device.group_id)?.name ?? ''} onOptionSelect={(_, data) => data.optionValue && onMove(device.id, data.optionValue)} style={{ minWidth: 0, width: '100%' }}>{groups.map((group) => <Option key={group.id} value={group.id}>{group.name}</Option>)}</Dropdown>
        : groups.find((group) => group.id === device.group_id)?.name ?? '未知',
    }),
    createTableColumn<Device>({
      columnId: 'lesson',
      renderHeaderCell: () => '当前课程',
      renderCell: (device) => device.current_title || device.current_status || '-',
    }),
    createTableColumn<Device>({
      columnId: 'version',
      renderHeaderCell: () => '应用 / 插件',
      renderCell: (device) => `${device.app_version || '-'} / ${device.plugin_version || '-'}`,
    }),
    createTableColumn<Device>({
      columnId: 'revision',
      renderHeaderCell: () => '课表 / 策略',
      renderCell: (device) => `r${device.schedule_revision} / r${device.policy_revision}`,
    }),
    createTableColumn<Device>({
      columnId: 'lastSeen',
      renderHeaderCell: () => '最后连接',
      renderCell: (device) => relativeTime(device.last_seen),
    }),
    ...(onDelete ? [createTableColumn<Device>({
      columnId: 'actions',
      renderHeaderCell: () => '操作',
      renderCell: (device) => <Button appearance="subtle" icon={<Delete24Regular />} aria-label={`删除设备 ${device.name}`} title="删除设备" onClick={() => onDelete(device.id, device.name)} />,
    })] : []),
  ]
    const cardStyles = useCardStyles()
    return <Card className={cardStyles.card}><CardHeader header={<Text as="h2" weight="semibold" size={400}>{title}</Text>} description={<Text size={200}>{devices.length} 项</Text>} /><DataGrid items={devices} columns={columns} getRowId={(device) => device.id} focusMode="composite"><DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader><DeviceBody>{({ item }) => <DeviceRow key={item.id}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DeviceRow>}</DeviceBody></DataGrid>{devices.length === 0 && <div className={cardStyles.empty}>暂无设备</div>}</Card>
}

function GroupsView({ organizationId, groups, onComplete }: { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
    const cardStyles = useCardStyles()
    const formStyles = useFormStyles()
    const gridStyles = useGridStyles()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null)
  async function createGroup(event: FormEvent) { event.preventDefault(); try { await api.createGroup(organizationId, name); setName(''); onComplete('班级已创建') } catch (error) { onComplete(error instanceof Error ? error.message : '创建失败', 'error') } }
  async function createCode() { try { const result = await api.createPairingCode(groupId, 15); setPairing(result); onComplete('一次性配对码已生成') } catch (error) { onComplete(error instanceof Error ? error.message : '生成失败', 'error') } }
  return <div className={gridStyles.groupsLayout}>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>新建班级</Text>} description={<Text size={200}>设备配对后将继承该班级的课表和策略。</Text>} />
      <form className={formStyles.form} onSubmit={createGroup}>
        <Field label="班级名称" required hint="例如：高一教学楼。同一组织内建议保持唯一。"><Input value={name} onChange={(_, data) => setName(data.value)} placeholder="例如：高一教学楼" /></Field>
        <Button appearance="primary" type="submit" disabled={!organizationId || !name.trim()} icon={<Add24Regular />}>创建班级</Button>
      </form>
    </Card>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>设备配对</Text>} description={<Text size={200}>配对码有效 15 分钟，使用一次后立即失效。</Text>} />
      <div className={formStyles.form}>
        <Field label="目标班级" required hint="配对成功后设备将继承该班级的课表与策略。" style={{ width: '100%' }}><Dropdown selectedOptions={[groupId]} onOptionSelect={(_, data) => setGroupId(data.optionValue ?? '')} placeholder="选择班级" style={{ width: '100%' }}>{groups.map((group) => <Option key={group.id} value={group.id}>{group.name}</Option>)}</Dropdown></Field>
        <Button appearance="primary" disabled={!groupId} onClick={() => void createCode()} icon={<Key24Regular />}>生成配对码</Button>
        {pairing && <div className={formStyles.pairingCode}><Text className={formStyles.pairingCodeValue} weight="semibold" block>{pairing.code}</Text><Text size={200} block>有效至 {new Date(pairing.expires_at).toLocaleTimeString('zh-CN')}</Text></div>}
      </div>
    </Card>
    <Card className={mergeClasses(cardStyles.card, gridStyles.fullRow)}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>班级</Text>} description={<Text size={200}>{groups.length} 项</Text>} />
      <div className={formStyles.cardGrid}>{groups.map((group) => <div className={formStyles.cardRow} key={group.id}><Organization24Regular /><div className={formStyles.cardRowCopy}><Text weight="semibold" block>{group.name}</Text><Text className={formStyles.cardRowMeta} size={200} block>课表 r{group.schedule_revision} · 策略 r{group.policy_revision}</Text></div></div>)}</div>
    </Card>
  </div>
}

function CommandsView({ organizationId, groups, devices, onComplete }: { organizationId: string; groups: Group[]; devices: Device[]; onComplete: (message: string, tone?: 'success' | 'error') => void }) {
  const cardStyles = useCardStyles()
  const formStyles = useFormStyles()
  const gridStyles = useGridStyles()
  const [targetKind, setTargetKind] = useState<'group' | 'device'>('group')
  const [targetId, setTargetId] = useState('')
  const [type, setType] = useState('refresh_status')
  const [title, setTitle] = useState('来自集控的通知')
  const [message, setMessage] = useState('')
  const [actionId, setActionId] = useState('')
  const [commands, setCommands] = useState<CommandRecord[]>([])
  useEffect(() => {
    if (!organizationId) {
      setCommands([])
      return
    }
    let active = true
    const load = () => api.commands(organizationId).then((items) => {
      if (active) setCommands(items)
    }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [organizationId])
  async function submit(event: FormEvent) { event.preventDefault(); try { const payload = type === 'show_notification' ? { title, message } : type === 'trigger_action' ? { action_id: actionId.trim() } : {}; const result = await api.createCommand({ type, [`${targetKind}_id`]: targetId, payload, expires_in_seconds: 300 }); onComplete(`命令 #${result.cursor} 已进入下发队列`) } catch (error) { onComplete(error instanceof Error ? error.message : '下发失败', 'error') } }
  const targets = targetKind === 'group' ? groups : devices
  return <div className={gridStyles.two}>
    <Card className={cardStyles.card}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>下发命令</Text>} description={<Text size={200}>命令将在设备下次 10 秒轮询时获取。</Text>} />
      <form className={formStyles.form} onSubmit={submit}>
        <TabList className={formStyles.actions} style={{ justifyContent: 'flex-start' }} selectedValue={targetKind} onTabSelect={(_, data) => { setTargetKind(data.value as 'group' | 'device'); setTargetId('') }}>
          <Tab value="group">班级</Tab>
          <Tab value="device">单台设备</Tab>
        </TabList>
        <Field label="目标" required hint={targetKind === 'group' ? '命令将下发给该班级下的全部设备。' : '命令仅下发给选中的单台设备。'} style={{ width: '100%' }}>
          <Dropdown selectedOptions={[targetId]} onOptionSelect={(_, data) => setTargetId(data.optionValue ?? '')} placeholder="选择目标" style={{ width: '100%' }}>{targets.map((target) => <Option key={target.id} value={target.id}>{target.name}</Option>)}</Dropdown>
        </Field>
        <Field label="操作" required hint="选择要下发给客户端的命令类型。" style={{ width: '100%' }}>
          <Dropdown selectedOptions={[type]} onOptionSelect={(_, data) => setType(data.optionValue ?? 'refresh_status')} style={{ width: '100%' }}>
            <Option value="refresh_status">立即刷新状态</Option>
            <Option value="restart_app">重启 Class Widgets</Option>
            <Option value="upload_diagnostics">上传诊断信息</Option>
            <Option value="show_notification">显示通知</Option>
            <Option value="trigger_action">触发 Action</Option>
          </Dropdown>
        </Field>
        {type === 'show_notification' && <><Field label="通知标题" required hint="显示在客户端通知卡片顶部的标题。" style={{ width: '100%' }}><Input value={title} onChange={(_, data) => setTitle(data.value)} style={{ width: '100%' }} /></Field><Field label="通知内容" hint="支持多行文本。" style={{ width: '100%' }}><Textarea value={message} onChange={(_, data) => setMessage(data.value)} style={{ width: '100%' }} /></Field></>}
        {type === 'trigger_action' && <Field label="Action ID" required hint="由客户端插件注册的动作标识，例如 com.hpdnya.ea2c.convert_today。" style={{ width: '100%' }}><Input value={actionId} onChange={(_, data) => setActionId(data.value)} placeholder="例如：com.hpdnya.ea2c.convert_today" style={{ width: '100%' }} /></Field>}
        <div className={formStyles.actions}>
          <Text className={formStyles.actionsHint} size={200}>命令将在设备下次 10 秒轮询时获取。</Text>
          <Button appearance="primary" disabled={!targetId || (type === 'trigger_action' && !actionId.trim())} icon={<Code24Regular />}>下发命令</Button>
        </div>
      </form>
    </Card>
    <CommandHistory commands={commands} groups={groups} devices={devices} />
  </div>
}

function CommandHistory({ commands, groups, devices }: { commands: CommandRecord[]; groups: Group[]; devices: Device[] }) {
  const cardStyles = useCardStyles()
  const formStyles = useFormStyles()
  const labels: Record<string, string> = { refresh_status: '刷新状态', restart_app: '重启应用', upload_diagnostics: '上传诊断', show_notification: '显示通知', trigger_action: '触发 Action' }
  return <Card className={cardStyles.card}>
    <CardHeader header={<Text as="h2" weight="semibold" size={400}>最近命令</Text>} description={<Text size={200}>{commands.length} 项</Text>} />
    <div className={formStyles.list}>
      {commands.length === 0 && <div className={formStyles.empty}>暂无命令</div>}
      {commands.map((command) => {
        const target = command.group_id ? groups.find((item) => item.id === command.group_id)?.name : devices.find((item) => item.id === command.device_id)?.name
        const succeeded = command.acknowledgements.filter((item) => item.status === 'succeeded').length
        const failed = command.acknowledgements.filter((item) => item.status === 'failed').length
        return <div key={command.id} className={formStyles.row}>
          <Code24Regular />
          <div className={formStyles.rowCopy}><Text weight="semibold" block>{labels[command.type] ?? command.type}</Text><Text className={formStyles.metricLabel} size={200} block>{target ?? '未知目标'} · #{command.cursor}</Text></div>
          <div className={formStyles.ackSummary}><Text className={formStyles.ackSuccess} size={200}>{succeeded} 成功</Text><Text className={failed ? formStyles.ackFailed : undefined} size={200}>{failed} 失败</Text><Text className={formStyles.metricLabel} size={200}>{relativeTime(command.created_at)}</Text></div>
        </div>
      })}
    </div>
  </Card>
}

function LogsView({ organizationId }: { organizationId: string }) {
  const logsStyles = useLogStyles()
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.diagnostics>>>([])
  const [detail, setDetail] = useState<DiagnosticDetail | null>(null)
  const [filter, setFilter] = useState('')
  const load = useCallback(() => api.diagnostics(organizationId).then(setReports).catch(() => undefined), [organizationId])
  useEffect(() => {
    if (!organizationId) {
      setReports([])
      setDetail(null)
      return
    }
    setDetail(null)
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => window.clearInterval(timer)
  }, [load, organizationId])
  async function open(id: string) { setDetail(await api.diagnostic(id)) }
  const logs = detail?.logs.filter((log) => `${log.level} ${log.message}`.toLowerCase().includes(filter.toLowerCase())) ?? []
  return <div className={logsStyles.layout}>
    <Card className={logsStyles.reportList}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>诊断报告</Text>} description={<Text size={200}>{reports.length} 项</Text>} />
      {reports.length === 0 && <div className={logsStyles.empty}>暂无报告，可向设备下发“上传诊断”命令。</div>}
      {reports.map((report) => <Button appearance="transparent" className={detail?.id === report.id ? mergeClasses(logsStyles.reportRow, logsStyles.reportRowSelected) : logsStyles.reportRow} key={report.id} onClick={() => void open(report.id)}><DocumentBulletList24Regular /><span className={logsStyles.reportCopy}><Text weight="semibold" block>{report.device_name}</Text><Text size={200} block>{report.log_count} 条日志 · {relativeTime(report.created_at)}</Text></span></Button>)}
    </Card>
    <Card className={logsStyles.logViewer}>
      <CardHeader header={<Text as="h2" weight="semibold" size={400}>{detail ? `${detail.device_name} 的日志` : '日志详情'}</Text>} action={detail ? <Input className={logsStyles.filter} contentBefore={<Filter24Regular />} placeholder="过滤级别或内容" value={filter} onChange={(_, data) => setFilter(data.value)} /> : undefined} />
      {!detail && <div className={logsStyles.empty}>选择一份诊断报告查看客户端动态上报日志。</div>}
      {detail?.last_error && <MessageBar intent="error" className={logsStyles.errorBar}><MessageBarBody>{detail.last_error}</MessageBarBody></MessageBar>}
      <div className={logsStyles.lines}>{logs.map((log, index) => <div className={mergeClasses(logsStyles.line, logsStyles[logLevelClass(log.level)])} key={`${log.time}-${index}`}><Text className={logsStyles.lineTime} size={200}>{log.time}</Text><Badge appearance="tint" color={logLevelColor(log.level)}>{log.level}</Badge><Text className={logsStyles.lineMessage} font="monospace" size={200}>{log.message}</Text></div>)}</div>
    </Card>
  </div>
}

export default App
