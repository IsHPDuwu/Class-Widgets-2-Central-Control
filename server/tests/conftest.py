import base64
import os
from pathlib import Path

os.environ["CC_DATABASE_URL"] = "sqlite:///./test-central-control.db"
os.environ["CC_ADMIN_KEY"] = "test-admin-key-123456"
os.environ["CC_SECRET_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"0" * 32).decode()

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": "test-admin-key-123456"}


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    Path("test-central-control.db").unlink(missing_ok=True)
