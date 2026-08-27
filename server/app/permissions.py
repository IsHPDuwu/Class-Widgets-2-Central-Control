from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PermissionDefinition:
    key: str
    label: str
    module: str
    actions: tuple[str, ...]
    resource_types: tuple[str, ...] = ("organization",)


MODULES: tuple[PermissionDefinition, ...] = (
    PermissionDefinition("overview", "运行总览", "overview", ("view",)),
    PermissionDefinition("groups", "分组与配对", "groups", ("view", "create", "update", "delete", "pair"), ("organization", "group")),
    PermissionDefinition("devices", "设备", "devices", ("view", "update", "delete"), ("organization", "group", "device")),
    PermissionDefinition("schedules", "课表", "schedules", ("view", "create", "update", "delete", "publish", "assign")),
    PermissionDefinition("class_swaps", "临时换课", "class_swaps", ("view", "execute", "restore"), ("organization", "group", "device")),
    PermissionDefinition("policies", "策略", "policies", ("view", "create", "update", "delete", "publish", "assign")),
    PermissionDefinition("commands", "命令", "commands", ("view", "execute"), ("organization", "group", "device")),
    PermissionDefinition("automations", "自动化", "automations", ("view", "create", "update", "delete", "execute"), ("organization", "group", "device")),
    PermissionDefinition("diagnostics", "客户端日志", "diagnostics", ("view",), ("organization", "group", "device")),
)

PLATFORM_PERMISSIONS: tuple[dict[str, str], ...] = (
    {"key": "platform.settings.manage", "label": "系统设置"},
    {"key": "platform.organizations.manage", "label": "组织管理"},
    {"key": "platform.users.manage", "label": "用户与权限"},
    {"key": "platform.oauth_providers.manage", "label": "OIDC Provider"},
    {"key": "platform.audit.view", "label": "审计日志"},
)

PERMISSION_KEYS = {
    *(item["key"] for item in PLATFORM_PERMISSIONS),
    *(f"organization.{module.key}.{action}" for module in MODULES for action in module.actions),
}

ROLE_ACTIONS: dict[str, set[str]] = {
    "viewer": {"view"},
    "operator": {"view", "create", "update", "execute", "restore", "pair", "publish", "assign"},
    "admin": {"view", "create", "update", "delete", "execute", "restore", "pair", "publish", "assign", "manage"},
}


def permission_catalog() -> dict[str, Any]:
    return {
        "platform": list(PLATFORM_PERMISSIONS),
        "organization": [
            {
                "key": module.key,
                "label": module.label,
                "resource_types": list(module.resource_types),
                "actions": [
                    {
                        "key": f"organization.{module.key}.{action}",
                        "action": action,
                        "label": {
                            "view": "查看",
                            "create": "创建",
                            "update": "修改",
                            "delete": "删除",
                            "execute": "执行",
                            "restore": "恢复",
                            "pair": "配对",
                            "publish": "发布",
                            "assign": "分配",
                            "manage": "管理",
                        }.get(action, action),
                    }
                    for action in module.actions
                ],
            }
            for module in MODULES
        ],
    }


def legacy_role_allows(role: str, permission_key: str) -> bool:
    if permission_key.startswith("platform."):
        return False
    action = permission_key.rsplit(".", 1)[-1]
    return action in ROLE_ACTIONS.get(role, set())
