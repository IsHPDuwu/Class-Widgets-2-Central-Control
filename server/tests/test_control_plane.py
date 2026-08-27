def bootstrap(client, admin_headers):
    organization = client.post(
        "/api/v1/admin/organizations", json={"name": "Test School"}, headers=admin_headers
    ).json()
    group = client.post(
        "/api/v1/admin/groups",
        json={"organization_id": organization["id"], "name": "Class 1"},
        headers=admin_headers,
    ).json()
    code = client.post(
        f"/api/v1/admin/groups/{group['id']}/pairing-codes",
        json={"expires_in_minutes": 15},
        headers=admin_headers,
    ).json()["code"]
    return organization, group, code


def pair(client, code):
    return client.post(
        "/api/v1/device/pair",
        json={
            "protocol_version": 1,
            "pairing_code": code,
            "installation_id": "installation-1234",
            "device_name": "Room 101",
            "app_version": "2.0.0",
            "plugin_version": "0.1.0",
            "platform": "Windows",
        },
    )


def test_pairing_code_is_single_use(client, admin_headers):
    _, _, code = bootstrap(client, admin_headers)
    first = pair(client, code)
    assert first.status_code == 200
    second = client.post(
        "/api/v1/device/pair",
        json={
            "protocol_version": 1,
            "pairing_code": code,
            "installation_id": "installation-5678",
            "device_name": "Room 102",
        },
    )
    assert second.status_code == 400


def test_admin_timestamps_are_explicit_utc(client, admin_headers):
    organization, _, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    devices = client.get(
        f"/api/v1/admin/devices?organization_id={organization['id']}", headers=admin_headers
    ).json()
    device = next(item for item in devices if item["id"] == paired["device_id"])
    assert device["last_seen"].endswith("Z")


def test_schedule_policy_and_command_sync(client, admin_headers):
    organization, group, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    device_headers = {"Authorization": f"Bearer {paired['device_token']}"}

    schedule_response = client.post(
        "/api/v1/admin/schedules",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Autumn",
            "group_ids": [group["id"]],
            "schedule": {
                "meta": {
                    "id": "meta-1",
                    "version": 1,
                    "maxWeekCycle": 2,
                    "startDate": "2026-09-01",
                },
                "subjects": [{"id": "math", "name": "Math", "isLocalClassroom": True}],
                "days": [
                    {
                        "id": "monday",
                        "dayOfWeek": [1],
                        "weeks": "all",
                        "entries": [
                            {
                                "id": "entry-1",
                                "type": "class",
                                "startTime": "08:00",
                                "endTime": "08:40",
                                "subjectId": "math",
                            }
                        ],
                    }
                ],
                "overrides": [],
            },
        },
    )
    assert schedule_response.status_code == 201

    policy_response = client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Classroom defaults",
            "group_ids": [group["id"]],
            "policy": {
                "overrides": {"schedule.time_offset": 0},
                "locked_keys": ["schedule.time_offset"],
                "schedule_readonly": True,
            },
        },
    )
    assert policy_response.status_code == 201

    command_response = client.post(
        "/api/v1/admin/commands",
        headers=admin_headers,
        json={"type": "refresh_status", "group_id": group["id"]},
    )
    assert command_response.status_code == 201

    sync = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={
            "protocol_version": 1,
            "cursor": 0,
            "schedule_revision": 0,
            "policy_revision": 0,
            "runtime": {"status": "class", "title": "Math"},
        },
    )
    assert sync.status_code == 200
    body = sync.json()
    assert body["poll_interval_seconds"] == 10
    assert body["schedule"]["revision"] == 1
    assert body["policy"]["revision"] == 1
    assert body["commands"][0]["type"] == "refresh_status"

    ack = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={
            "protocol_version": 1,
            "cursor": body["cursor"],
            "schedule_revision": 1,
            "policy_revision": 1,
            "acknowledgements": [
                {"command_id": body["commands"][0]["command_id"], "status": "succeeded"}
            ],
        },
    )
    assert ack.status_code == 200
    assert ack.json()["commands"] == []


def test_client_schedule_snapshot_and_class_swap_event(client, admin_headers):
    organization, group, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    device_headers = {"Authorization": f"Bearer {paired['device_token']}"}

    prepared = client.post(
        "/api/v1/admin/class-swaps/prepare",
        headers=admin_headers,
        json={"device_id": paired["device_id"]},
    )
    assert prepared.status_code == 201
    request_id = prepared.json()["request_id"]

    command_sync = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={"protocol_version": 1, "cursor": 0},
    ).json()
    request_command = next(
        command for command in command_sync["commands"]
        if command["type"] == "request_schedule_snapshot"
    )
    schedule = {
        "meta": {
            "id": "client-meta",
            "version": 1,
            "maxWeekCycle": 2,
            "startDate": "2026-08-24",
        },
        "subjects": [
            {"id": "math", "name": "数学", "isLocalClassroom": True},
            {"id": "english", "name": "英语", "isLocalClassroom": True},
        ],
        "days": [
            {
                "id": "monday-odd",
                "dayOfWeek": [1],
                "weeks": [1],
                "entries": [
                    {
                        "id": "entry-1",
                        "type": "class",
                        "startTime": "08:00",
                        "endTime": "08:40",
                        "subjectId": "math",
                    },
                    {
                        "id": "entry-2",
                        "type": "class",
                        "startTime": "08:50",
                        "endTime": "09:30",
                        "subjectId": "english",
                    },
                ],
            }
        ],
        "overrides": [],
    }
    uploaded = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={
            "protocol_version": 1,
            "cursor": command_sync["cursor"],
            "schedule_snapshot": {"request_id": request_id, "schedule": schedule},
            "acknowledgements": [
                {"command_id": request_command["command_id"], "status": "succeeded"}
            ],
        },
    )
    assert uploaded.status_code == 200

    preparation = client.get(
        f"/api/v1/admin/class-swaps/preparations/{request_id}?device_id={paired['device_id']}",
        headers=admin_headers,
    ).json()
    assert preparation["device_id"] == paired["device_id"]
    assert preparation["ready"] is True

    snapshot = client.get(
        f"/api/v1/admin/class-swaps/snapshots/{paired['device_id']}?request_id={request_id}",
        headers=admin_headers,
    ).json()
    assert snapshot["schedule"]["meta"]["maxWeekCycle"] == 2

    created = client.post(
        "/api/v1/admin/class-swaps",
        headers=admin_headers,
        json={
            "device_id": paired["device_id"],
            "request_id": request_id,
            "operation": "swap",
            "day_of_week": 1,
            "week_of_cycle": 1,
            "entry_id_a": "entry-1",
            "entry_id_b": "entry-2",
        },
    )
    assert created.status_code == 201
    session_id = created.json()["id"]
    sessions = client.get(
        f"/api/v1/admin/class-swaps?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert sessions[0]["device_id"] == paired["device_id"]
    assert "group_id" not in sessions[0]

    event_sync = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={"protocol_version": 1, "cursor": command_sync["cursor"]},
    ).json()
    event = next(
        command for command in event_sync["commands"]
        if command["type"] == "apply_class_swap"
    )
    assert event["payload"]["entry_id_a"] == "entry-1"
    assert event["payload"]["entry_id_b"] == "entry-2"

    restored = client.post(
        f"/api/v1/admin/class-swaps/{session_id}/restore",
        headers=admin_headers,
        json={},
    )
    assert restored.status_code == 200
    assert restored.json()["status"] == "restoring"


def test_stale_and_empty_schedule_snapshots_do_not_disconnect_device(client, admin_headers):
    _, _, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    device_id = paired["device_id"]
    device_headers = {"Authorization": f"Bearer {paired['device_token']}"}
    empty_schedule = {
        "meta": {
            "id": "empty-client-meta",
            "version": 1,
            "maxWeekCycle": 2,
            "startDate": "2026-08-24",
        },
        "subjects": [],
        "days": [],
        "overrides": [],
    }

    stale = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={
            "protocol_version": 1,
            "cursor": 0,
            "schedule_snapshot": {
                "request_id": "obsolete-request",
                "schedule": empty_schedule,
            },
        },
    )
    assert stale.status_code == 200

    prepared = client.post(
        "/api/v1/admin/class-swaps/prepare",
        headers=admin_headers,
        json={"device_id": device_id},
    )
    request_id = prepared.json()["request_id"]
    command_sync = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={"protocol_version": 1, "cursor": 0},
    ).json()
    request_command = next(
        command
        for command in command_sync["commands"]
        if command["type"] == "request_schedule_snapshot"
    )
    uploaded = client.post(
        "/api/v1/device/sync",
        headers=device_headers,
        json={
            "protocol_version": 1,
            "cursor": command_sync["cursor"],
            "schedule_snapshot": {
                "request_id": request_id,
                "schedule": empty_schedule,
            },
            "acknowledgements": [
                {"command_id": request_command["command_id"], "status": "succeeded"}
            ],
        },
    )
    assert uploaded.status_code == 200

    preparation = client.get(
        f"/api/v1/admin/class-swaps/preparations/{request_id}?device_id={device_id}",
        headers=admin_headers,
    ).json()
    assert preparation["ready"] is True

    rejected = client.post(
        "/api/v1/admin/class-swaps",
        headers=admin_headers,
        json={
            "device_id": device_id,
            "request_id": request_id,
            "operation": "apply_today",
            "day_of_week": 1,
            "week_of_cycle": 1,
        },
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"] == (
        "device has no classes for the selected day and cycle week"
    )


def test_policy_accepts_all_valid_config_paths(client, admin_headers):
    organization, group, _ = bootstrap(client, admin_headers)
    response = client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Full config",
            "group_ids": [group["id"]],
            "policy": {
                "overrides": {"app.debug_mode": True},
                "locked_keys": [],
                "schedule_readonly": False,
            },
        },
    )
    assert response.status_code == 201


def test_action_command_requires_action_id(client, admin_headers):
    _, group, _ = bootstrap(client, admin_headers)
    accepted = client.post(
        "/api/v1/admin/commands",
        headers=admin_headers,
        json={
            "type": "trigger_action",
            "group_id": group["id"],
            "payload": {"action_id": "com.hpdnya.ea2c.convert_today"},
        },
    )
    assert accepted.status_code == 201

    rejected = client.post(
        "/api/v1/admin/commands",
        headers=admin_headers,
        json={
            "type": "trigger_action",
            "group_id": group["id"],
            "payload": {"action_id": ""},
        },
    )
    assert rejected.status_code == 422


def test_device_cannot_acknowledge_another_devices_command(client, admin_headers):
    _, group, first_code = bootstrap(client, admin_headers)
    first = pair(client, first_code).json()
    second_code = client.post(
        f"/api/v1/admin/groups/{group['id']}/pairing-codes",
        json={"expires_in_minutes": 15},
        headers=admin_headers,
    ).json()["code"]
    second = client.post(
        "/api/v1/device/pair",
        json={
            "pairing_code": second_code,
            "installation_id": "installation-5678",
            "device_name": "Room 102",
        },
    ).json()
    command = client.post(
        "/api/v1/admin/commands",
        headers=admin_headers,
        json={"type": "refresh_status", "device_id": first["device_id"]},
    ).json()

    response = client.post(
        "/api/v1/device/sync",
        headers={"Authorization": f"Bearer {second['device_token']}"},
        json={
            "acknowledgements": [
                {"command_id": command["id"], "status": "succeeded"}
            ]
        },
    )
    assert response.status_code == 200

    from app.database import SessionLocal
    from app.models import CommandAcknowledgement

    with SessionLocal() as db:
        assert db.query(CommandAcknowledgement).count() == 0


def test_device_can_upload_diagnostics(client, admin_headers):
    organization, _, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    response = client.post(
        "/api/v1/device/diagnostics",
        headers={"Authorization": f"Bearer {paired['device_token']}"},
        json={
            "app_version": "2.0.0",
            "plugin_version": "0.1.0",
            "logs": [{"time": "12:00:00", "level": "ERROR", "message": "test"}],
        },
    )
    assert response.status_code == 201
    listed = client.get(
        f"/api/v1/admin/diagnostics?organization_id={organization['id']}",
        headers=admin_headers,
    )
    assert listed.status_code == 200
    assert listed.json()[0]["log_count"] == 1
    detail = client.get(
        f"/api/v1/admin/diagnostics/{listed.json()[0]['id']}", headers=admin_headers
    )
    assert detail.status_code == 200
    assert detail.json()["logs"][0]["message"] == "test"


def test_saved_configs_can_be_listed_and_assigned(client, admin_headers):
    organization, first_group, _ = bootstrap(client, admin_headers)
    second_group = client.post(
        "/api/v1/admin/groups",
        json={"organization_id": organization["id"], "name": "Class 2"},
        headers=admin_headers,
    ).json()
    first = client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Config A",
            "group_ids": [first_group["id"]],
            "policy": {
                "overrides": {"preferences.opacity": 0.8},
                "locked_keys": ["preferences.opacity"],
            },
        },
    ).json()
    client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Config B",
            "group_ids": [],
            "policy": {"overrides": {"locale.language": "zh_CN"}},
        },
    )
    listed = client.get(
        f"/api/v1/admin/policies?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert [item["name"] for item in listed] == ["Config B", "Config A"]
    assigned = client.put(
        f"/api/v1/admin/policies/{first['id']}/groups",
        headers=admin_headers,
        json={"group_ids": [second_group["id"]]},
    )
    assert assigned.status_code == 200
    groups = client.get(
        f"/api/v1/admin/groups?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert next(item for item in groups if item["id"] == second_group["id"])[
        "policy_revision"
    ] == 1


def test_device_can_move_groups_and_receive_new_group_name(client, admin_headers):
    organization, first_group, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    second_group = client.post(
        "/api/v1/admin/groups",
        json={"organization_id": organization["id"], "name": "Class 2"},
        headers=admin_headers,
    ).json()
    moved = client.patch(
        f"/api/v1/admin/devices/{paired['device_id']}/group",
        json={"group_id": second_group["id"]},
        headers=admin_headers,
    )
    assert moved.status_code == 200
    sync = client.post(
        "/api/v1/device/sync",
        headers={"Authorization": f"Bearer {paired['device_token']}"},
        json={},
    ).json()
    assert sync["group_name"] == "Class 2"
    assert sync["organization_name"] == "Test School"


def test_schedule_edit_creates_unpublished_revision(client, admin_headers):
    organization, group, _ = bootstrap(client, admin_headers)
    schedule = {
        "meta": {"id": "meta", "version": 1, "maxWeekCycle": 2, "startDate": "2026-09-01"},
        "subjects": [],
        "days": [],
        "overrides": [],
    }
    original = client.post(
        "/api/v1/admin/schedules",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Draft",
            "schedule": schedule,
            "group_ids": [group["id"]],
        },
    ).json()
    edited = client.put(
        f"/api/v1/admin/schedules/{original['id']}",
        headers=admin_headers,
        json={"name": "Edited", "schedule": schedule},
    )
    assert edited.status_code == 201
    assert edited.json()["revision"] == 2
    assert edited.json()["group_ids"] == []
    listed = client.get(
        f"/api/v1/admin/schedules?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert next(item for item in listed if item["id"] == original["id"])["group_ids"] == [
        group["id"]
    ]
    assert next(item for item in listed if item["id"] == edited.json()["id"])[
        "group_ids"
    ] == []


def test_resource_assignment_replaces_bound_group_set(client, admin_headers):
    organization, first_group, _ = bootstrap(client, admin_headers)
    second_group = client.post(
        "/api/v1/admin/groups",
        json={"organization_id": organization["id"], "name": "Class 2"},
        headers=admin_headers,
    ).json()
    policy = client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Managed",
            "group_ids": [first_group["id"], second_group["id"]],
            "policy": {"overrides": {"notifications.enabled": True}},
        },
    ).json()
    replaced = client.put(
        f"/api/v1/admin/policies/{policy['id']}/groups",
        headers=admin_headers,
        json={"group_ids": [second_group["id"]]},
    )
    assert replaced.status_code == 200
    listed = client.get(
        f"/api/v1/admin/policies?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert next(item for item in listed if item["id"] == policy["id"])["group_ids"] == [
        second_group["id"]
    ]

    cleared = client.put(
        f"/api/v1/admin/policies/{policy['id']}/groups",
        headers=admin_headers,
        json={"group_ids": []},
    )
    assert cleared.status_code == 200
    listed = client.get(
        f"/api/v1/admin/policies?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert next(item for item in listed if item["id"] == policy["id"])["group_ids"] == []


def test_config_clone_is_saved_without_publication(client, admin_headers):
    organization, group, _ = bootstrap(client, admin_headers)
    original = client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Original",
            "group_ids": [group["id"]],
            "policy": {"overrides": {"notifications.enabled": True}},
        },
    ).json()
    clone = client.post(
        f"/api/v1/admin/policies/{original['id']}/clone",
        headers=admin_headers,
        json={"name": "Clone"},
    )
    assert clone.status_code == 201
    listed = client.get(
        f"/api/v1/admin/policies?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert next(item for item in listed if item["id"] == clone.json()["id"])["group_ids"] == []


def test_config_edit_creates_unpublished_revision(client, admin_headers):
    organization, group, _ = bootstrap(client, admin_headers)
    original = client.post(
        "/api/v1/admin/policies",
        headers=admin_headers,
        json={
            "organization_id": organization["id"],
            "name": "Published",
            "group_ids": [group["id"]],
            "policy": {"overrides": {"notifications.enabled": True}},
        },
    ).json()
    edited = client.put(
        f"/api/v1/admin/policies/{original['id']}",
        headers=admin_headers,
        json={
            "name": "Draft edit",
            "policy": {"overrides": {"notifications.enabled": False}},
        },
    )
    assert edited.status_code == 201
    assert edited.json()["revision"] == 2
    assert edited.json()["group_ids"] == []
    listed = client.get(
        f"/api/v1/admin/policies?organization_id={organization['id']}",
        headers=admin_headers,
    ).json()
    assert next(item for item in listed if item["id"] == original["id"])["group_ids"] == [
        group["id"]
    ]
    assert next(item for item in listed if item["id"] == edited.json()["id"])[
        "group_ids"
    ] == []


def test_rollout_skip_still_advances_device_cursor(client, admin_headers):
    _, group, code = bootstrap(client, admin_headers)
    paired = pair(client, code).json()
    command = client.post(
        "/api/v1/admin/commands",
        headers=admin_headers,
        json={
            "type": "refresh_status",
            "group_id": group["id"],
            "rollout_percentage": 1,
        },
    ).json()
    response = client.post(
        "/api/v1/device/sync",
        headers={"Authorization": f"Bearer {paired['device_token']}"},
        json={"cursor": 0},
    )
    assert response.status_code == 200
    assert response.json()["cursor"] == command["cursor"]


def test_admin_sessions_enforce_roles(client, admin_headers):
    created = client.post(
        "/api/v1/auth/users",
        headers=admin_headers,
        json={"username": "viewer", "password": "secure-password-123", "role": "viewer"},
    )
    assert created.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "viewer", "password": "secure-password-123"},
    )
    assert login.status_code == 200
    token = login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/admin/organizations", headers=headers).status_code == 200
    denied = client.post(
        "/api/v1/admin/organizations",
        headers=headers,
        json={"name": "Denied School"},
    )
    assert denied.status_code == 403

    from app.database import SessionLocal
    from app.models import AdminSession

    with SessionLocal() as db:
        session = db.query(AdminSession).one()
        assert session.token_hash != token


def test_member_session_cannot_cross_tenant_boundaries(client, admin_headers):
    first_org, first_group, _ = bootstrap(client, admin_headers)
    second_org = client.post(
        "/api/v1/admin/organizations", json={"name": "Second School"}, headers=admin_headers
    ).json()
    second_group = client.post(
        "/api/v1/admin/groups",
        json={"organization_id": second_org["id"], "name": "Second Class"},
        headers=admin_headers,
    ).json()
    schedule = {
        "meta": {"id": "tenant-meta", "version": 1, "maxWeekCycle": 1, "startDate": "2026-09-01"},
        "subjects": [],
        "days": [],
        "overrides": [],
    }
    second_schedule = client.post(
        "/api/v1/admin/schedules",
        headers=admin_headers,
        json={
            "organization_id": second_org["id"],
            "name": "Second schedule",
            "schedule": schedule,
            "group_ids": [second_group["id"]],
        },
    ).json()
    created = client.post(
        "/api/v1/auth/users",
        headers=admin_headers,
        json={
            "username": "first-tenant-user",
            "password": "secure-password-123",
            "role": "operator",
            "organization_ids": [first_org["id"]],
        },
    )
    assert created.status_code == 201
    token = client.post(
        "/api/v1/auth/login",
        json={"username": "first-tenant-user", "password": "secure-password-123"},
    ).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/admin/organizations", headers=headers).json() == [first_org]
    assert client.get(
        f"/api/v1/admin/groups?organization_id={first_org['id']}", headers=headers
    ).status_code == 200
    assert client.get(
        f"/api/v1/admin/groups?organization_id={second_org['id']}", headers=headers
    ).status_code == 404
    assert client.get(
        f"/api/v1/admin/schedules?organization_id={second_org['id']}", headers=headers
    ).status_code == 404
    assert client.post(
        f"/api/v1/admin/groups/{second_group['id']}/pairing-codes",
        headers=headers,
        json={"expires_in_minutes": 15},
    ).status_code == 404
    assert client.post(
        f"/api/v1/admin/schedules/{second_schedule['id']}/clone",
        headers=headers,
        json={"name": "stolen"},
    ).status_code == 404
    assert client.post(
        "/api/v1/admin/commands",
        headers=headers,
        json={"type": "refresh_status", "group_id": second_group["id"]},
    ).status_code == 404
    assert client.patch(
        "/api/v1/admin/devices/nonexistent/group",
        headers=headers,
        json={"group_id": first_group["id"]},
    ).status_code == 404
    assert client.get("/api/v1/auth/audit", headers=headers).status_code == 403


def test_platform_admin_can_manage_memberships_and_current_identity(client, admin_headers):
    first_org, _, _ = bootstrap(client, admin_headers)
    second_org = client.post(
        "/api/v1/admin/organizations", json={"name": "Membership School"}, headers=admin_headers
    ).json()
    created = client.post(
        "/api/v1/auth/users",
        headers=admin_headers,
        json={
            "username": "membership-user",
            "password": "secure-password-123",
            "role": "viewer",
            "organization_ids": [first_org["id"]],
        },
    )
    assert created.status_code == 201
    assert created.json()["organization_ids"] == [first_org["id"]]
    user_id = created.json()["id"]
    reassigned = client.put(
        f"/api/v1/auth/users/{user_id}/organizations",
        headers=admin_headers,
        json={"organization_ids": [second_org["id"]]},
    )
    assert reassigned.status_code == 200
    assert reassigned.json()["organization_ids"] == [second_org["id"]]
    listed = client.get("/api/v1/auth/users", headers=admin_headers).json()
    assert next(item for item in listed if item["id"] == user_id)["organization_ids"] == [
        second_org["id"]
    ]
    identity = client.get("/api/v1/auth/me", headers=admin_headers)
    assert identity.status_code == 200
    assert identity.json()["platform_admin"] is True
