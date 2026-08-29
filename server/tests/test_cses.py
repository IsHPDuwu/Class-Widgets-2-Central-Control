import uuid

import yaml


def import_cses(client, admin_headers, content, start_date="2026-08-31"):
    return client.post(
        "/api/v1/admin/schedules/import-cses",
        headers=admin_headers,
        json={"content": content, "start_date": start_date},
    )


def export_schedule(client, admin_headers, name, schedule):
    return client.post(
        "/api/v1/admin/schedules/export-cses",
        headers=admin_headers,
        json={"name": name, "schedule": schedule},
    )


def entry(entry_id, subject=None, start="08:00", end="08:40", entry_type="class", title=None):
    item = {"id": entry_id, "type": entry_type, "startTime": start, "endTime": end}
    if subject:
        item["subjectId"] = subject
    if title:
        item["title"] = title
    return item


STANDARD_CSES = """\
version: 2
configuration:
  name: 高三（12）班课表
  description: 2026年下学期
  cycle:
    work_count: 5
    rest_count: 2
    spans:
      - activity: work
        count: 5
      - activity: rest
        count: 2
subjects:
  - name: 数学
    simplified_name: 数
    teacher: 李梅
    location: "101"
  - name: 语文
    simplified_name: 语
schedules:
  - name: 周一课表
    enable_day: [1]
    classes:
      - subject: 数学
        start_time: "08:00:00"
        end_time: "08:45:00"
      - subject: 语文
        start_time: "09:00:00"
        end_time: "09:45:00"
  - name: 周二课表
    enable_day: [2]
    classes:
      - subject: 语文
        start_time: "08:00:00"
        end_time: "08:45:00"
"""

ODD_EVEN_CSES = """\
version: 2
configuration:
  name: 单双周课表
  description: 测试
  cycle:
    work_count: 10
    rest_count: 4
    spans:
      - activity: work
        count: 5
      - activity: rest
        count: 2
      - activity: work
        count: 5
      - activity: rest
        count: 2
subjects:
  - name: 数学
  - name: 物理
schedules:
  - name: 周二单周
    enable_day: [2]
    classes:
      - subject: 数学
        start_time: "08:00:00"
        end_time: "08:45:00"
  - name: 周二双周
    enable_day: [7]
    classes:
      - subject: 物理
        start_time: "08:00:00"
        end_time: "08:45:00"
"""

DRIFT_CSES = """\
version: 2
configuration:
  name: 漂移周期
  description: 测试
  cycle:
    work_count: 10
    rest_count: 3
    spans:
      - activity: work
        count: 5
      - activity: rest
        count: 3
      - activity: work
        count: 5
subjects:
  - name: 数学
schedules:
  - name: 第一个工作日
    enable_day: [1]
    classes:
      - subject: 数学
        start_time: "08:00:00"
        end_time: "08:45:00"
"""


UNREPRESENTABLE_CSES = """\
version: 2
configuration:
  name: 超长周期
  description: 测试
  cycle:
    work_count: 53
    rest_count: 2
    spans:
      - activity: work
        count: 53
      - activity: rest
        count: 2
subjects:
  - name: 数学
schedules:
  - name: 课表
    enable_day: [1]
    classes:
      - subject: 数学
        start_time: "08:00:00"
        end_time: "08:45:00"
"""


def local_schedule(days, subjects=None, overrides=None, max_week_cycle=2, start_date="2026-08-31"):
    return {
        "meta": {
            "id": uuid.uuid4().hex,
            "version": 1,
            "maxWeekCycle": max_week_cycle,
            "startDate": start_date,
        },
        "subjects": subjects
        if subjects is not None
        else [
            {
                "id": "math",
                "name": "数学",
                "simplifiedName": "数",
                "teacher": "李梅",
                "isLocalClassroom": True,
            },
            {"id": "chinese", "name": "语文", "isLocalClassroom": True},
            {"id": "physics", "name": "物理", "isLocalClassroom": True},
        ],
        "days": days,
        "overrides": overrides or [],
    }


def test_import_standard_week(client, admin_headers):
    response = import_cses(client, admin_headers, STANDARD_CSES)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "高三（12）班课表"
    assert body["warnings"] == []
    schedule = body["schedule"]
    assert schedule["meta"]["maxWeekCycle"] == 1
    assert schedule["meta"]["startDate"] == "2026-08-31"
    subjects = {subject["name"]: subject for subject in schedule["subjects"]}
    assert set(subjects) == {"数学", "语文"}
    assert subjects["数学"]["teacher"] == "李梅"
    assert subjects["数学"]["simplifiedName"] == "数"
    timelines = {day["dayOfWeek"][0]: day for day in schedule["days"]}
    assert set(timelines) == {1, 2}
    assert all(day["weeks"] == "all" for day in timelines.values())
    monday = timelines[1]["entries"]
    assert [(entry["startTime"], entry["endTime"]) for entry in monday] == [
        ("08:00", "08:45"),
        ("09:00", "09:45"),
    ]
    names = {subject["id"]: subject["name"] for subject in schedule["subjects"]}
    assert names[monday[0]["subjectId"]] == "数学"


def test_import_odd_even_weeks(client, admin_headers):
    response = import_cses(client, admin_headers, ODD_EVEN_CSES)
    assert response.status_code == 200, response.text
    schedule = response.json()["schedule"]
    assert schedule["meta"]["maxWeekCycle"] == 2
    assert len(schedule["days"]) == 2
    for day in schedule["days"]:
        assert day["dayOfWeek"] == [2]
    by_weeks = {tuple(day["weeks"]): day for day in schedule["days"]}
    assert set(by_weeks) == {(1,), (2,)}
    names = {subject["id"]: subject["name"] for subject in schedule["subjects"]}
    assert names[by_weeks[(1,)]["entries"][0]["subjectId"]] == "数学"
    assert names[by_weeks[(2,)]["entries"][0]["subjectId"]] == "物理"


def test_import_drift_cycle(client, admin_headers):
    response = import_cses(client, admin_headers, DRIFT_CSES)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["schedule"]["meta"]["maxWeekCycle"] == 13
    assert body["schedule"]["days"][0]["weeks"] == [1, 2, 4, 6, 8, 10, 12]
    assert any("不是 7 的倍数" in warning for warning in body["warnings"])


def test_import_truncates_seconds(client, admin_headers):
    content = STANDARD_CSES.replace('"08:00:00"', '"08:00:30"', 1)
    response = import_cses(client, admin_headers, content)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["schedule"]["days"][0]["entries"][0]["startTime"] == "08:00"
    assert any("秒" in warning for warning in body["warnings"])


def test_import_rejects_invalid_yaml(client, admin_headers):
    response = import_cses(client, admin_headers, "version: [unclosed\n")
    assert response.status_code == 400
    assert "YAML" in response.json()["detail"]


def test_import_accepts_float_version(client, admin_headers):
    content = STANDARD_CSES.replace("version: 2", "version: 2.0", 1)
    response = import_cses(client, admin_headers, content)
    assert response.status_code == 200, response.text


def test_import_rejects_wrong_version_with_clear_message(client, admin_headers):
    for broken in ('version: "2"', "version: 3"):
        content = STANDARD_CSES.replace("version: 2", broken, 1)
        response = import_cses(client, admin_headers, content)
        assert response.status_code == 400
        assert "version 必须为 2" in response.json()["detail"]


def test_import_rejects_missing_version_with_clear_message(client, admin_headers):
    response = import_cses(client, admin_headers, STANDARD_CSES.replace("version: 2\n", "", 1))
    assert response.status_code == 400
    assert "缺少 version" in response.json()["detail"]


def test_import_rejects_span_mismatch(client, admin_headers):
    content = STANDARD_CSES.replace("work_count: 5", "work_count: 6", 1)
    response = import_cses(client, admin_headers, content)
    assert response.status_code == 400
    assert "work_count" in response.json()["detail"]


def test_import_rejects_enable_day_out_of_range(client, admin_headers):
    content = STANDARD_CSES.replace("enable_day: [2]", "enable_day: [6]", 1)
    response = import_cses(client, admin_headers, content)
    assert response.status_code == 400
    assert "enable_day" in response.json()["detail"]


def test_import_rejects_unknown_subject(client, admin_headers):
    content = STANDARD_CSES.replace(
        'subject: 语文\n        start_time: "09:00:00"',
        'subject: 化学\n        start_time: "09:00:00"',
    )
    response = import_cses(client, admin_headers, content)
    assert response.status_code == 400
    assert "化学" in response.json()["detail"]


def test_import_rejects_unrepresentable_cycle(client, admin_headers):
    content = UNREPRESENTABLE_CSES
    response = import_cses(client, admin_headers, content)
    assert response.status_code == 400
    assert "无法映射" in response.json()["detail"]


V1_CSES = """\
version: 1
subjects:
  - name: 语文
    simplified_name: 语
    teacher: 王芳
    room: "301"
  - name: 数学
    simplified_name: 数
  - name: '-'
schedules:
  - name: 周一
    enable_day: 1
    weeks: all
    classes:
      - subject: 语文
        start_time: "08:00:00"
        end_time: "08:40:00"
  - name: 周二单周
    enable_day: 2
    weeks: odd
    classes:
      - subject: 数学
        start_time: "08:00:00"
        end_time: "08:40:00"
  - name: 周二双周
    enable_day: 2
    weeks: even
    classes:
      - subject: 语文
        start_time: "08:00:00"
        end_time: "08:40:00"
  - name: 周日空课表
    enable_day: 7
    weeks: even
    classes:
      - subject: "-"
        start_time: "08:00:00"
        end_time: "08:40:00"
  - name: 周三冲突A
    enable_day: 3
    weeks: all
    classes:
      - subject: 数学
        start_time: "09:00:00"
        end_time: "09:40:00"
  - name: 周三冲突B
    enable_day: 3
    weeks: all
    classes:
      - subject: 语文
        start_time: "09:00:00"
        end_time: "09:40:00"
"""


def test_import_v1_semantics(client, admin_headers):
    response = import_cses(client, admin_headers, V1_CSES)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["warnings"], "应包含 v1 语义提示"
    schedule = body["schedule"]
    assert schedule["meta"]["maxWeekCycle"] == 2
    subjects = {subject["name"]: subject for subject in schedule["subjects"]}
    assert set(subjects) == {"语文", "数学"}, "占位科目“-”不应出现"
    assert subjects["语文"]["teacher"] == "王芳"
    assert subjects["语文"]["location"] == "301"
    timelines = {}
    for day in schedule["days"]:
        key = (day["dayOfWeek"][0], day["weeks"] if day["weeks"] == "all" else tuple(day["weeks"]))
        timelines[key] = day
    assert set(timelines) == {(1, "all"), (2, (1,)), (2, (2,)), (3, "all")}, "空课表不应生成时间线"
    names = {subject["id"]: subject["name"] for subject in schedule["subjects"]}
    assert names[timelines[(2, (1,))]["entries"][0]["subjectId"]] == "数学"
    assert names[timelines[(2, (2,))]["entries"][0]["subjectId"]] == "语文"
    assert any("多张内容不同的课表" in warning for warning in body["warnings"])
    assert names[timelines[(3, "all")]["entries"][0]["subjectId"]] == "数学", "冲突时应保留第一张"


def test_export_skips_non_class_and_weekend(client, admin_headers):
    schedule = local_schedule(
        days=[
            {
                "id": "d1",
                "dayOfWeek": [1],
                "weeks": "all",
                "entries": [
                    entry("e1", subject="math"),
                    entry("e2", entry_type="break", start="08:40", end="09:00"),
                ],
            },
            {
                "id": "d2",
                "dayOfWeek": [2],
                "weeks": [1],
                "entries": [entry("e3", subject="chinese")],
            },
            {
                "id": "d3",
                "dayOfWeek": [6],
                "weeks": "all",
                "entries": [entry("e4", subject="math", start="10:00", end="10:40")],
            },
        ]
    )
    response = export_schedule(client, admin_headers, "测试课表", schedule)
    assert response.status_code == 200, response.text
    body = response.json()
    assert any("非课程条目" in warning for warning in body["warnings"])
    assert any("周六/周日" in warning for warning in body["warnings"])
    document = yaml.safe_load(body["content"])
    assert document["version"] == 2
    assert document["configuration"]["name"] == "测试课表"
    assert document["configuration"]["cycle"]["work_count"] == 4
    assert document["configuration"]["cycle"]["rest_count"] == 10
    subject_names = {subject["name"] for subject in document["subjects"]}
    assert subject_names == {"数学", "语文"}
    by_day = {item["enable_day"][0]: item for item in document["schedules"]}
    assert set(by_day) == {1, 2, 3}
    assert by_day[1]["classes"] == [
        {"subject": "数学", "start_time": "08:00:00", "end_time": "08:40:00"}
    ]
    assert by_day[2]["classes"][0]["subject"] == "语文"
    assert by_day[3]["classes"][0]["subject"] == "数学"


def test_export_synthesizes_subject_from_title(client, admin_headers):
    schedule = local_schedule(
        max_week_cycle=1,
        days=[
            {
                "id": "d1",
                "dayOfWeek": [1],
                "weeks": "all",
                "entries": [
                    entry("e1", subject="math"),
                    entry("e2", title="班会", start="09:00", end="09:40"),
                    entry("e3", title=uuid.uuid4().hex, start="10:00", end="10:40"),
                ],
            }
        ],
    )
    response = export_schedule(client, admin_headers, "班课", schedule)
    assert response.status_code == 200, response.text
    body = response.json()
    assert any("合成科目" in warning for warning in body["warnings"])
    assert any("未指定科目" in warning for warning in body["warnings"])
    assert any("空工作日" in warning for warning in body["warnings"])
    document = yaml.safe_load(body["content"])
    subject_names = {subject["name"] for subject in document["subjects"]}
    assert subject_names == {"数学", "班会"}
    classes = document["schedules"][0]["classes"]
    assert classes[1] == {"subject": "班会", "start_time": "09:00:00", "end_time": "09:40:00"}


def test_export_rejects_schedule_without_classes(client, admin_headers):
    schedule = local_schedule(
        days=[{"id": "d1", "dayOfWeek": [1], "weeks": "all", "entries": []}]
    )
    response = export_schedule(client, admin_headers, "空课表", schedule)
    assert response.status_code == 400


def test_round_trip_odd_even(client, admin_headers):
    schedule = local_schedule(
        days=[
            {
                "id": "d1",
                "dayOfWeek": [1],
                "weeks": "all",
                "entries": [entry("e1", subject="math")],
            },
            {
                "id": "d2",
                "dayOfWeek": [2],
                "weeks": 1,
                "entries": [entry("e2", subject="chinese")],
            },
            {
                "id": "d3",
                "dayOfWeek": [2],
                "weeks": 2,
                "entries": [entry("e3", subject="physics")],
            },
        ]
    )
    exported = export_schedule(client, admin_headers, "单双周", schedule)
    assert exported.status_code == 200, exported.text
    content = exported.json()["content"]
    reimported = import_cses(client, admin_headers, content, start_date="2026-08-31")
    assert reimported.status_code == 200, reimported.text
    result = reimported.json()["schedule"]
    assert result["meta"]["maxWeekCycle"] == 2
    names = {subject["id"]: subject["name"] for subject in result["subjects"]}
    found = set()
    for day in result["days"]:
        assert day["dayOfWeek"] in ([1], [2])
        for item in day["entries"]:
            name = names[item["subjectId"]]
            found.add((day["dayOfWeek"][0], tuple(day["weeks"]), name, item["startTime"]))
    assert found == {
        (1, (1,), "数学", "08:00"),
        (1, (2,), "数学", "08:00"),
        (2, (1,), "语文", "08:00"),
        (2, (2,), "物理", "08:00"),
    }
