import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Add24Regular, ArrowSync24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, Field, Input, Switch, Textarea } from '@fluentui/react-components'
import { api, type OAuthProvider } from './api'

type Props = { onComplete: (message: string, tone?: 'success' | 'error') => void }
const empty = { key: '', name: '', issuer_url: '', client_id: '', client_secret: '', scopes: 'openid profile email', enabled: true, allow_signup: true }

export function OAuthProviderManagement({ onComplete }: Props) {
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(empty)
  const load = useCallback(() => api.oauthProviders().then(setProviders).catch((error) => onComplete(error instanceof Error ? error.message : '加载 Provider 失败', 'error')), [onComplete])
  useEffect(() => { void load() }, [load])
  function select(provider: OAuthProvider) { setSelectedId(provider.id); setDraft({ key: provider.key, name: provider.name, issuer_url: provider.issuer_url, client_id: provider.client_id, client_secret: '', scopes: provider.scopes, enabled: provider.enabled, allow_signup: provider.allow_signup }) }
  async function save(event: FormEvent) {
    event.preventDefault()
    try {
      if (selectedId) await api.updateOAuthProvider(selectedId, draft)
      else await api.createOAuthProvider(draft)
      onComplete(selectedId ? 'OIDC Provider 已更新' : 'OIDC Provider 已创建')
      setSelectedId(''); setDraft(empty); await load()
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存 Provider 失败', 'error') }
  }
  async function test(id: string) { try { await api.testOAuthProvider(id); onComplete('OIDC Discovery 连接正常') } catch (error) { onComplete(error instanceof Error ? error.message : 'Provider 测试失败', 'error') } }
  return <div className="oauth-provider-layout">
    <section className="data-section oauth-provider-list"><div className="section-heading"><h2>OIDC Providers</h2><Button appearance="subtle" icon={<Add24Regular />} onClick={() => { setSelectedId(''); setDraft(empty) }} /></div>{providers.length === 0 && <div className="empty-command">尚未配置 OIDC Provider</div>}{providers.map((provider) => <button key={provider.id} className={selectedId === provider.id ? 'oauth-provider-row selected' : 'oauth-provider-row'} onClick={() => select(provider)}><span><strong>{provider.name}</strong><small>{provider.issuer_url}</small></span><i className={provider.enabled ? 'online' : ''} /></button>)}</section>
    <Card className="oauth-provider-form"><form onSubmit={save}><Field label="Provider Key" hint="创建后作为回调地址的一部分"><Input disabled={Boolean(selectedId)} value={draft.key} onChange={(_, data) => setDraft({ ...draft, key: data.value })} /></Field><Field label="显示名称"><Input value={draft.name} onChange={(_, data) => setDraft({ ...draft, name: data.value })} /></Field><Field label="Issuer URL"><Input value={draft.issuer_url} onChange={(_, data) => setDraft({ ...draft, issuer_url: data.value })} placeholder="https://id.example.com/realms/main" /></Field><Field label="Client ID"><Input value={draft.client_id} onChange={(_, data) => setDraft({ ...draft, client_id: data.value })} /></Field><Field label="Client Secret" hint={selectedId ? '留空表示保持不变' : '使用环境主密钥加密存储'}><Input type="password" value={draft.client_secret} onChange={(_, data) => setDraft({ ...draft, client_secret: data.value })} /></Field><Field label="Scopes"><Textarea resize="vertical" value={draft.scopes} onChange={(_, data) => setDraft({ ...draft, scopes: data.value })} /></Field><div className="oauth-provider-switches"><Switch label="启用登录" checked={draft.enabled} onChange={(_, data) => setDraft({ ...draft, enabled: data.checked })} /><Switch label="允许首登创建待授权账号" checked={draft.allow_signup} onChange={(_, data) => setDraft({ ...draft, allow_signup: data.checked })} /></div><div className="oauth-provider-actions">{selectedId && <Button type="button" icon={<ArrowSync24Regular />} onClick={() => void test(selectedId)}>测试 Discovery</Button>}<Button appearance="primary" type="submit" icon={<Save24Regular />} disabled={!draft.key || !draft.name || !draft.issuer_url || !draft.client_id || (!selectedId && !draft.client_secret)}>保存 Provider</Button></div></form></Card>
  </div>
}
