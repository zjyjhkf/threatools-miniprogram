"""测试夹具：ASGITransport 直连应用，复用本机 miniprogram 库（需先执行种子脚本）。"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.db.session import engine
from app.main import app

PREFIX = settings.API_PREFIX


@pytest.fixture(autouse=True)
async def dispose_engine():
    yield
    # pytest-asyncio 为每个用例新建事件循环，必须释放上一个循环里的连接
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as instance:
        yield instance


@pytest_asyncio.fixture
async def headers(client):
    resp = await client.post(f"{PREFIX}/auth/wechat-login", json={"code": "pytest"})
    body = resp.json()
    assert body["code"] == 0, body
    return {"Authorization": f"Bearer {body['data']['token']}"}
