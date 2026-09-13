import { useEffect, useState } from 'react'
import { Add24Regular, Delete24Regular, Save24Regular } from '@fluentui/react-icons'
import { Button, Card, CardHeader, Checkbox, Field, Input, Text } from '@fluentui/react-components'
import { api, type ClassGroup, type Group } from './api'

type Props = { organizationId: string; groups: Group[]; onComplete: (message: string, tone?: 'success' | 'error') => void }

export function ClassGroupWorkspace({ organizationId, groups, onComplete }: Props) {
  const [items, setItems] = useState<ClassGroup[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('新分组')
  const [memberIds, setMemberIds] = useState<string[]>([])

  async function load() {
    if (!organizationId) return
    try { setItems(await api.classGroups(organizationId)) } catch (error) { onComplete(error instanceof Error ? error.message : '加载分组失败', 'error') }
  }
  useEffect(() => { void load() }, [organizationId])

  function reset() { setSelectedId(''); setName('新分组'); setMemberIds([]) }
  function open(item: ClassGroup) { setSelectedId(item.id); setName(item.name); setMemberIds(item.group_ids) }
  function toggle(id: string, checked: boolean) { setMemberIds((value) => checked ? [...new Set([...value, id])] : value.filter((item) => item !== id)) }
  async function save() {
    if (!name.trim()) return
    try {
      const result = selectedId ? await api.updateClassGroup(selectedId, name.trim(), memberIds) : await api.createClassGroup(organizationId, name.trim(), memberIds)
      open(result); await load(); onComplete('分组已保存')
    } catch (error) { onComplete(error instanceof Error ? error.message : '保存分组失败', 'error') }
  }
  async function remove() {
    if (!selectedId || !window.confirm(`确定删除分组“${name}”？`)) return
    try { await api.deleteClassGroup(selectedId); reset(); await load(); onComplete('分组已删除') } catch (error) { onComplete(error instanceof Error ? error.message : '删除分组失败', 'error') }
  }

  return <div className="course-resource-workspace">
    <Card className="resource-sidebar"><CardHeader header={<Text weight="semibold">分组</Text>} action={<Button appearance="subtle" icon={<Add24Regular />} onClick={reset}>新建</Button>} /><div className="resource-nav">{items.map((item) => <Button className={selectedId === item.id ? 'selected' : ''} appearance="subtle" key={item.id} onClick={() => open(item)}><span><Text weight="semibold">{item.name}</Text><Text size={200}>{item.group_ids.length} 个班级</Text></span></Button>)}</div></Card>
    <Card className="form-section"><div className="editor-commandbar"><Field label="分组名称"><Input value={name} onChange={(_, data) => setName(data.value)} /></Field><div className="form-actions"><Button appearance="secondary" icon={<Delete24Regular />} disabled={!selectedId} onClick={() => void remove()}>删除</Button><Button appearance="primary" icon={<Save24Regular />} onClick={() => void save()}>保存</Button></div></div><Field label="包含的班级"><div className="checks fluent-checks">{groups.map((group) => <Checkbox key={group.id} checked={memberIds.includes(group.id)} onChange={(_, data) => toggle(group.id, data.checked === true)} label={group.name} />)}</div></Field></Card>
  </div>
}
