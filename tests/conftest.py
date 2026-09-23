import pytest
from fastapi.testclient import TestClient

from src.app import app
from src.storage import device_storage
from src.service import fleet_service


@pytest.fixture(autouse=True)
def clean_storage():
    """Ensure in-memory storage is empty before and after each test."""
    device_storage.clear()
    yield
    device_storage.clear()


@pytest.fixture
def client():
    """Provides a TestClient instance for testing the FastAPI application."""
    with TestClient(app) as test_client:
        yield test_client
