"""CSES v2（Course Schedule Exchange Schema）与集控课表格式的双向转换。

CSES 以「上 N 天休 M 天」的周期描述课表，enable_day 只数工作日；
集控格式以 startDate 为锚点按周循环（dayOfWeek + weeks）。本模块负责两者互转。
"""

from __future__ import annotations

import re
from datetime import date
from math import gcd
from typing import Annotated, Any, Literal
from uuid import uuid4

import yaml
from pydantic import BaseModel, Field, ValidationError, model_validator

from ..schemas import SchedulePayload

CSES_VERSION = 2
MAX_WEEK_CYCLE = 52
DAY_NAMES = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")

_CSES_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$")
_UUID_HEX = re.compile(r"^[0-9a-f]{32}$")


class CsesSpan(BaseModel):
    activity: Literal["work", "rest"]
    count: Annotated[int, Field(ge=1)]


class CsesCycle(BaseModel):
    work_count: Annotated[int, Field(ge=2)]
    rest_count: Annotated[int, Field(ge=2)]
    spans: Annotated[list[CsesSpan], Field(min_length=1)]

    @model_validator(mode="after")
    def validate_spans(self) -> CsesCycle:
        work = sum(span.count for span in self.spans if span.activity == "work")
        rest = sum(span.count for span in self.spans if span.activity == "rest")
        if work != self.work_count or rest != self.rest_count:
            raise ValueError("spans 中 work/rest 天数必须分别等于 work_count/rest_count")
        return self


class CsesSubject(BaseModel):
    name: str
    simplified_name: str | None = None
    teacher: str | None = None
    location: str | None = None


class CsesClass(BaseModel):
    subject: str
    start_time: Annotated[str, Field(pattern=_CSES_TIME)]
    end_time: Annotated[str, Field(pattern=_CSES_TIME)]


class CsesSchedule(BaseModel):
    name: str
    enable_day: Annotated[list[Annotated[int, Field(ge=1)]], Field(min_length=1)]
    classes: list[CsesClass] = Field(default_factory=list)


class CsesConfiguration(BaseModel):
    name: str
    description: str
    cycle: CsesCycle


class CsesDocument(BaseModel):
    version: Literal[2]
    configuration: CsesConfiguration
    subjects: list[CsesSubject] = Field(default_factory=list)
    schedules: list[CsesSchedule] = Field(default_factory=list)


class CsesV1Subject(BaseModel):
    name: str
    simplified_name: str | None = None
    teacher: str | None = None
    room: str | None = None


class CsesV1Class(BaseModel):
    subject: str
    start_time: Annotated[str, Field(pattern=_CSES_TIME)]
    end_time: Annotated[str, Field(pattern=_CSES_TIME)]


class CsesV1Schedule(BaseModel):
    name: str = ""
    classes: list[CsesV1Class] = Field(default_factory=list)
    enable_day: Annotated[int, Field(ge=1, le=7)] | list[Annotated[int, Field(ge=1, le=7)]]
    weeks: Literal["all", "odd", "even"] | None = None
    timetable_name: str | None = None


class CsesV1Timetable(BaseModel):
    name: str = ""
    times: list[dict[str, str]] = Field(default_factory=list)


class CsesV1Document(BaseModel):
    version: Literal[1]
    subjects: list[CsesV1Subject] = Field(default_factory=list)
    schedules: list[CsesV1Schedule] = Field(default_factory=list)
    timetables: list[CsesV1Timetable] = Field(default_factory=list)


def _cycle_weeks(total_days: int) -> int:
    """周期总长 L 对应的集控周循环数：lcm(L, 7) / 7。"""
    return total_days // gcd(total_days, 7)


def _parse_document(raw: dict[str, Any]) -> CsesDocument:
    if "version" not in raw:
        raise ValueError(
            "不是有效的 CSES 课表：缺少 version 字段，请确认导入的是 CSES 格式的课表文件"
        )
    version = raw["version"]
    if version != 2:
        raise ValueError(
            f"不是有效的 CSES 课表：version 必须为 2，当前为 {version!r}；"
            "请确认导入的是 CSES 格式的课表文件（注意不是 Class Widgets 课表 JSON）"
        )
    raw["version"] = 2
    try:
        return CsesDocument.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(part) for part in first.get("loc", ()))
        raise ValueError(f"不是有效的 CSES 课表：{loc or '文档'}：{first['msg']}") from exc


def _truncate_time(value: str) -> tuple[str, bool]:
    """HH:MM:SS -> HH:MM，返回 (结果, 是否发生了秒截断)。"""
    if value.endswith(":00"):
        return value[:-3], False
    return value[:-3], True


def _cses_v1_to_schedule(
    raw: dict[str, Any], start_date: date
) -> tuple[str, SchedulePayload, list[str]]:
    """CSES v1：enable_day 是星期几，weeks 用 all/odd/even 表达单双周，"-" 是空课占位科目。"""
    try:
        document = CsesV1Document.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(part) for part in first.get("loc", ()))
        raise ValueError(f"不是有效的 CSES v1 课表：{loc or '文档'}：{first['msg']}") from exc

    warnings: list[str] = [
        "检测到 CSES v1 文件，已按 v1 语义导入：enable_day 视为星期几，odd/even 视为单双周"
    ]
    max_week_cycle = 2 if any(item.weeks in {"odd", "even"} for item in document.schedules) else 1
    week_keys = {
        "all": "all",
        "odd": tuple(week for week in range(1, max_week_cycle + 1) if week % 2),
        "even": tuple(week for week in range(1, max_week_cycle + 1) if not week % 2),
    }
    week_labels = {"all": "每周", "odd": "单周", "even": "双周"}

    subject_ids: dict[str, str] = {}
    subjects: list[dict[str, Any]] = []

    def ensure_subject(name: str, source: CsesV1Subject | None = None) -> str:
        if name in subject_ids:
            return subject_ids[name]
        subject_id = f"cses-{len(subjects) + 1}"
        subject_ids[name] = subject_id
        subjects.append(
            {
                "id": subject_id,
                "name": name,
                "simplifiedName": source.simplified_name if source else None,
                "teacher": source.teacher if source else None,
                "icon": None,
                "color": None,
                "location": source.room if source else None,
                "isLocalClassroom": True,
            }
        )
        return subject_id

    for v1_subject in document.subjects:
        name = v1_subject.name.strip()
        if not name or name == "-":
            continue
        ensure_subject(name, v1_subject)

    timelines: dict[tuple[int, tuple[int, ...] | Literal["all"]], dict[str, Any]] = {}
    timeline_sources: dict[tuple[int, tuple[int, ...] | Literal["all"]], str] = {}
    conflict_keys: set[tuple[int, tuple[int, ...] | Literal["all"]]] = set()
    truncated = False
    for schedule in document.schedules:
        enable_day = schedule.enable_day
        weekdays = enable_day if isinstance(enable_day, list) else [enable_day]
        class_tuples: list[tuple[str, str, str]] = []
        for cses_class in schedule.classes:
            subject_name = cses_class.subject.strip()
            if not subject_name or subject_name == "-":
                continue
            if subject_name not in subject_ids:
                ensure_subject(subject_name)
                warnings.append(f"科目“{subject_name}”未在 subjects 中定义，已自动创建")
            start, start_cut = _truncate_time(cses_class.start_time)
            end, end_cut = _truncate_time(cses_class.end_time)
            truncated = truncated or start_cut or end_cut
            class_tuples.append((start, end, subject_ids[subject_name]))
        if not class_tuples:
            continue
        label = week_labels[schedule.weeks or "all"]
        for weekday in weekdays:
            key = (weekday, week_keys[schedule.weeks or "all"])
            existing = timelines.get(key)
            if existing is not None:
                existing_key = [
                    (entry["startTime"], entry["endTime"], entry["subjectId"])
                    for entry in existing["entries"]
                ]
                if existing_key != class_tuples and key not in conflict_keys:
                    conflict_keys.add(key)
                    source_name = schedule.name or f"{DAY_NAMES[weekday - 1]}课表"
                    warnings.append(
                        f"{DAY_NAMES[weekday - 1]}（{label}）存在多张内容不同的课表，"
                        f"已保留“{timeline_sources[key]}”，忽略“{source_name}”"
                    )
                continue
            timelines[key] = {
                "id": uuid4().hex,
                "dayOfWeek": [weekday],
                "weeks": week_keys[schedule.weeks or "all"],
                "entries": [
                    {
                        "id": uuid4().hex,
                        "type": "class",
                        "startTime": start,
                        "endTime": end,
                        "subjectId": subject_id,
                        "title": None,
                    }
                    for start, end, subject_id in class_tuples
                ],
            }
            timeline_sources[key] = schedule.name or f"{DAY_NAMES[weekday - 1]}课表"

    if truncated:
        warnings.append("部分课程时间带有非零秒数，已截断为整分钟")
    days = sorted(timelines.values(), key=lambda item: item["dayOfWeek"][0])
    for timeline in days:
        timeline["entries"].sort(key=lambda entry: entry["startTime"])

    payload = {
        "meta": {
            "id": uuid4().hex,
            "version": 1,
            "maxWeekCycle": max_week_cycle,
            "startDate": start_date.isoformat(),
        },
        "subjects": subjects,
        "days": days,
        "overrides": [],
    }
    try:
        validated = SchedulePayload.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"转换结果未通过课表校验：{exc.errors()[0]['msg']}") from exc
    return "导入的课表", validated, warnings


def cses_to_schedule(content: str, start_date: date) -> tuple[str, SchedulePayload, list[str]]:
    """把 CSES YAML 文本（v1 或 v2）转换为集控课表，返回 (课表名, SchedulePayload, warnings)。"""
    try:
        raw = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise ValueError(f"YAML 解析失败：{exc}") from exc
    if not isinstance(raw, dict):
        raise ValueError("CSES 文件必须是一个 YAML 映射")
    version = raw.get("version")
    if version == 1 and not isinstance(version, bool):
        return _cses_v1_to_schedule(raw, start_date)
    document = _parse_document(raw)
    return _cses_v2_to_schedule(document, start_date)


def _cses_v2_to_schedule(
    document: CsesDocument, start_date: date
) -> tuple[str, SchedulePayload, list[str]]:
    cycle = document.configuration.cycle
    layout: list[str] = []
    for span in cycle.spans:
        layout.extend([span.activity] * span.count)
    total_days = len(layout)
    max_week_cycle = _cycle_weeks(total_days)
    if max_week_cycle > MAX_WEEK_CYCLE:
        raise ValueError(f"周期共 {total_days} 天，无法映射到不超过 {MAX_WEEK_CYCLE} 周的循环模型")
    work_offsets = [offset for offset, activity in enumerate(layout) if activity == "work"]

    warnings: list[str] = []
    if total_days % 7:
        warnings.append(f"周期共 {total_days} 天，不是 7 的倍数，已映射为 {max_week_cycle} 周循环")

    anchor_weekday = start_date.isoweekday()
    repetitions = _cycle_weeks(total_days) * 7 // total_days
    work_limit = len(work_offsets)
    for schedule in document.schedules:
        for day in schedule.enable_day:
            if day > work_limit:
                raise ValueError(
                    f"课表“{schedule.name}”的 enable_day {day} 超出周期内工作日数 {work_limit}"
                )

    subject_ids: dict[str, str] = {}
    merged_names: set[str] = set()
    subjects: list[dict[str, Any]] = []
    for cses_subject in document.subjects:
        if cses_subject.name in subject_ids:
            if cses_subject.name not in merged_names:
                merged_names.add(cses_subject.name)
                warnings.append(f"科目“{cses_subject.name}”在 CSES 中重名，已合并为一个科目")
            continue
        subject_ids[cses_subject.name] = f"cses-{len(subjects) + 1}"
        subjects.append(
            {
                "id": subject_ids[cses_subject.name],
                "name": cses_subject.name,
                "simplifiedName": cses_subject.simplified_name,
                "teacher": cses_subject.teacher,
                "icon": None,
                "color": None,
                "location": cses_subject.location,
                "isLocalClassroom": True,
            }
        )

    timelines: dict[tuple[int, tuple[int, ...] | Literal["all"]], dict[str, Any]] = {}
    truncated = False
    for schedule in document.schedules:
        placements: dict[int, set[int]] = {}
        for day in sorted(set(schedule.enable_day)):
            offset = work_offsets[day - 1]
            weekday = (anchor_weekday - 1 + offset) % 7 + 1
            week_numbers = {
                (offset + index * total_days) // 7 + 1 for index in range(repetitions)
            }
            placements.setdefault(weekday, set()).update(week_numbers)
        schedule_entries: list[dict[str, Any]] = []
        for cses_class in schedule.classes:
            if cses_class.subject not in subject_ids:
                unknown = cses_class.subject
                raise ValueError(f"课表“{schedule.name}”引用了未定义的科目“{unknown}”")
            start, start_cut = _truncate_time(cses_class.start_time)
            end, end_cut = _truncate_time(cses_class.end_time)
            truncated = truncated or start_cut or end_cut
            schedule_entries.append(
                {
                    "id": uuid4().hex,
                    "type": "class",
                    "startTime": start,
                    "endTime": end,
                    "subjectId": subject_ids[cses_class.subject],
                    "title": None,
                }
            )
        for weekday, weeks_set in placements.items():
            if len(weeks_set) == max_week_cycle:
                weeks: tuple[int, ...] | Literal["all"] = "all"
            else:
                weeks = tuple(sorted(weeks_set))
            timeline = timelines.setdefault(
                (weekday, weeks),
                {"id": uuid4().hex, "dayOfWeek": [weekday], "weeks": weeks, "entries": []},
            )
            timeline["entries"].extend(schedule_entries)

    if truncated:
        warnings.append("部分课程时间带有非零秒数，已截断为整分钟")
    days = sorted(timelines.values(), key=lambda item: item["dayOfWeek"][0])
    for timeline in days:
        timeline["entries"].sort(key=lambda entry: entry["startTime"])

    payload = {
        "meta": {
            "id": uuid4().hex,
            "version": 1,
            "maxWeekCycle": max_week_cycle,
            "startDate": start_date.isoformat(),
        },
        "subjects": subjects,
        "days": days,
        "overrides": [],
    }
    try:
        validated = SchedulePayload.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"转换结果未通过课表校验：{exc.errors()[0]['msg']}") from exc
    name = document.configuration.name.strip() or "导入的课表"
    return name, validated, warnings


def _weeks_match(selector: Any, week: int) -> bool:
    if selector is None or selector == "all":
        return True
    if isinstance(selector, int):
        return selector == week
    if isinstance(selector, list):
        return week in selector
    return False


def _encode_spans(layout: list[str]) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for activity in layout:
        if spans and spans[-1]["activity"] == activity:
            spans[-1]["count"] += 1
        else:
            spans.append({"activity": activity, "count": 1})
    return spans


def schedule_to_cses(name: str, schedule: SchedulePayload) -> tuple[dict[str, Any], list[str]]:
    """把集控课表转换为 CSES v2 文档 dict，返回 (document, warnings)。"""
    warnings: list[str] = []
    weeks_total = schedule.meta.maxWeekCycle
    anchor_weekday = date.fromisoformat(schedule.meta.startDate).isoweekday()

    subjects_by_id = {subject.id: subject for subject in schedule.subjects}

    def resolve_override(entry_id: str, weekday: int, week: int):
        for override in schedule.overrides:
            if override.entryId != entry_id:
                continue
            if override.dayOfWeek and weekday not in override.dayOfWeek:
                continue
            if not _weeks_match(override.weeks, week):
                continue
            return override
        return None

    # classes_by_offset[offset] = [(start, end, subject_name)]
    classes_by_offset: dict[int, list[tuple[str, str, str]]] = {}
    fixed_date_days = 0
    non_class_entries = 0
    no_subject_entries = 0
    weekend_entries = 0
    synthesized_titles: dict[str, None] = {}
    used_subject_ids: dict[str, None] = {}

    for timeline in schedule.days:
        if timeline.date:
            fixed_date_days += len(timeline.entries)
            continue
        for week in range(1, weeks_total + 1):
            if not _weeks_match(timeline.weeks, week):
                continue
            for weekday in range(1, 8):
                if timeline.dayOfWeek and weekday not in timeline.dayOfWeek:
                    continue
                offset = (week - 1) * 7 + (weekday - anchor_weekday) % 7
                for entry in timeline.entries:
                    if entry.type != "class":
                        non_class_entries += 1
                        continue
                    if weekday >= 6:
                        weekend_entries += 1
                        continue
                    override = resolve_override(entry.id, weekday, week)
                    subject_id = (override.subjectId if override else None) or entry.subjectId
                    if subject_id:
                        subject_name = subjects_by_id[subject_id].name
                        used_subject_ids.setdefault(subject_id, None)
                    else:
                        title = (override.title if override else None) or entry.title
                        if not title or _UUID_HEX.fullmatch(title):
                            no_subject_entries += 1
                            continue
                        synthesized_titles.setdefault(title, None)
                        subject_name = title
                    start = (override.startTime if override else None) or entry.startTime
                    end = (override.endTime if override else None) or entry.endTime
                    classes_by_offset.setdefault(offset, []).append(
                        (f"{start}:00", f"{end}:00", subject_name)
                    )

    if fixed_date_days:
        warnings.append(f"已跳过 {fixed_date_days} 个固定日期条目（CSES 不支持单次日程）")
    if non_class_entries:
        warnings.append(f"已跳过 {non_class_entries} 个非课程条目（课间/活动等，CSES 不支持）")
    if no_subject_entries:
        warnings.append(f"已跳过 {no_subject_entries} 个未指定科目的课程条目")
    if weekend_entries:
        warnings.append(f"已跳过 {weekend_entries} 个周六/周日课程条目（周期内周末为休息日）")
    if synthesized_titles:
        warnings.append(f"已为 {len(synthesized_titles)} 个自定义标题课程合成科目")

    used_weekdays = {((offset % 7) + anchor_weekday - 1) % 7 + 1 for offset in classes_by_offset}
    if not used_weekdays:
        raise ValueError("课表中没有可导出的课程条目")
    layout = [
        "work" if weekday in used_weekdays else "rest"
        for _ in range(weeks_total)
        for weekday in range(1, 8)
    ]
    if layout.count("rest") < 2:
        layout.extend(["rest"] * 7)
        warnings.append("休息日不足 2 天，已在周期末尾追加一个整周休息日")
    if layout.count("work") < 2:
        layout.append("work")
        warnings.append("工作日不足 2 天，已在周期末尾追加一个空工作日")
    work_count = layout.count("work")

    work_offsets = [offset for offset, activity in enumerate(layout) if activity == "work"]
    work_number = {offset: index + 1 for index, offset in enumerate(work_offsets)}

    cses_subjects: list[dict[str, Any]] = []
    emitted_names: set[str] = set()
    for subject_id in used_subject_ids:
        subject = subjects_by_id[subject_id]
        if subject.name in emitted_names:
            warnings.append(f"科目“{subject.name}”重名，导出后已合并为同一科目")
            continue
        emitted_names.add(subject.name)
        entry = {"name": subject.name}
        if subject.simplifiedName:
            entry["simplified_name"] = subject.simplifiedName
        if subject.teacher:
            entry["teacher"] = subject.teacher
        if subject.location:
            entry["location"] = subject.location
        cses_subjects.append(entry)
    for title in synthesized_titles:
        if title in emitted_names:
            continue
        emitted_names.add(title)
        cses_subjects.append({"name": title})

    schedules: list[dict[str, Any]] = []
    for offset in sorted(classes_by_offset):
        week = offset // 7 + 1
        weekday = ((offset % 7) + anchor_weekday - 1) % 7 + 1
        classes = sorted(classes_by_offset[offset], key=lambda item: item[0])
        schedules.append(
            {
                "name": f"循环第 {week} 周·{DAY_NAMES[weekday - 1]}",
                "enable_day": [work_number[offset]],
                "classes": [
                    {"subject": subject_name, "start_time": start, "end_time": end}
                    for start, end, subject_name in classes
                ],
            }
        )

    document = {
        "version": CSES_VERSION,
        "configuration": {
            "name": name,
            "description": f"由 Class Widgets 集控导出，开学日期 {schedule.meta.startDate}",
            "cycle": {
                "work_count": work_count,
                "rest_count": layout.count("rest"),
                "spans": _encode_spans(layout),
            },
        },
        "subjects": cses_subjects,
        "schedules": schedules,
    }
    CsesDocument.model_validate(document)
    return document, warnings
