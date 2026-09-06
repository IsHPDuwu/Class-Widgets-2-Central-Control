import { Checkbox, Select } from '@fluentui/react-components'
import type { ClassGroup, Group } from './api'

type Props = {
  groups: Group[]
  classGroups: ClassGroup[]
  selected: string[]
  onChange: (ids: string[]) => void
  idPrefix: string
}

export function ClassSelector({ groups, classGroups, selected, onChange, idPrefix }: Props) {
  function addClassGroup(id: string) {
    const item = classGroups.find((value) => value.id === id)
    if (item) onChange([...new Set([...selected, ...item.group_ids])])
  }
  return <div className="class-selector">
    {classGroups.length > 0 && <Select aria-label="快捷选择分组" value="" onChange={(_, data) => addClassGroup(data.value)}><option value="">快捷选择分组</option>{classGroups.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.group_ids.length} 个班级）</option>)}</Select>}
    <div className="checks fluent-checks">{groups.map((group) => <Checkbox id={`${idPrefix}-${group.id}`} key={group.id} checked={selected.includes(group.id)} onChange={(_, data) => onChange(data.checked ? [...new Set([...selected, group.id])] : selected.filter((id) => id !== group.id))} label={group.name} />)}</div>
  </div>
}
