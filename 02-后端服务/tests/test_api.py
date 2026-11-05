"""A01–A32 契约回归：只读用例，覆盖登录、信息流、详情、话题、课程、产品、搜索。"""
from app.core.config import settings

P = settings.API_PREFIX


def assert_ok(body: dict):
    assert body["code"] == 0, body
    assert "requestId" in body
    return body["data"]


async def test_health(client):
    resp = await client.get("/healthz")
    data = assert_ok(resp.json())
    assert data["status"] == "ok"
    assert data["db"] == "ok"
    assert len(data["time"]) == 19


async def test_feed_type_guard(client, headers):
    # A08：follow 需登录（401），非法 type 走参数错误
    assert (await client.get(f"{P}/feed?type=follow")).status_code == 401
    bad = (await client.get(f"{P}/feed?type=watch")).json()
    assert bad["code"] != 0
    ok_body = (await client.get(f"{P}/feed?type=follow", headers=headers)).json()
    assert ok_body["code"] == 0


async def test_track_returns_null(client):
    # A33：返回 data=null，且未登录也可上报
    resp = await client.post(f"{P}/track", json={"event": "smoke", "page": "test"})
    body = resp.json()
    assert body["code"] == 0
    assert body["data"] is None


async def test_login_returns_string_id(client):
    resp = await client.post(f"{P}/auth/wechat-login", json={"code": "pytest"})
    data = assert_ok(resp.json())
    assert data["token"]
    assert isinstance(data["user"]["id"], str)
    assert isinstance(data["isNewUser"], bool)


async def test_me_and_body_profile(client, headers):
    me = assert_ok((await client.get(f"{P}/users/me", headers=headers)).json())
    assert me["isSelf"] is True
    assert set(me["completeness"]) == {"filled", "total", "missing"}
    body = assert_ok((await client.get(f"{P}/users/me/body-profile", headers=headers)).json())
    assert "goals" in body


async def test_feed_shape(client):
    data = assert_ok((await client.get(f"{P}/feed?type=recommend&size=2")).json())
    assert set(data) == {"list", "nextCursor", "hasMore"}
    for item in data["list"]:
        assert isinstance(item["id"], str)
        assert isinstance(item["author"]["id"], str)
        assert "coverImage" in item and "liked" in item


async def test_post_detail_and_comments(client, headers):
    post = assert_ok((await client.get(f"{P}/posts/1", headers=headers)).json())
    assert isinstance(post["images"], list)
    comments = assert_ok((await client.get(f"{P}/posts/1/comments")).json())
    assert set(comments) == {"list", "nextCursor", "hasMore"}
    assert comments["list"][0]["parentId"] == "0"


async def test_topics(client):
    hot = assert_ok((await client.get(f"{P}/topics/hot")).json())
    assert isinstance(hot["list"], list)
    topics = assert_ok((await client.get(f"{P}/topics?page=1&size=5")).json())
    assert topics["total"] >= len(topics["list"])


async def test_courses(client):
    data = assert_ok((await client.get(f"{P}/courses?category=all&page=1&size=3")).json())
    assert set(data) == {"main", "list", "hasMore"}
    detail = assert_ok((await client.get(f"{P}/courses/1")).json())
    assert detail["coach"]["name"]
    assert isinstance(detail["chapters"], list)
    assert isinstance(detail["related"], list)


async def test_products(client):
    data = assert_ok((await client.get(f"{P}/products")).json())
    assert data["banner"]["title"]
    detail = assert_ok((await client.get(f"{P}/products/1")).json())
    assert isinstance(detail["features"], list)
    assert set(detail["video"]) == {"cover", "url", "duration"}


async def test_search(client):
    data = assert_ok((await client.get(f"{P}/search?q=跑&type=all")).json())
    assert set(data) == {"courses", "products", "posts", "counts"}
    assert set(data["counts"]) == {"post", "course", "product"}


async def test_unauthorized(client):
    resp = await client.get(f"{P}/users/me")
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] in (401, 40101)
