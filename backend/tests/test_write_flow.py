"""写路径回归：发布 → 点赞 → 评论 → 评论点赞/删除 → 删帖，以及上传与管理端占位。

与 test_api.py（只读契约）互补：这里覆盖会写库的主链路，
用例内创建的数据通过接口自行清理，避免污染演示数据。
"""

import base64

import pytest

from app.core.config import settings
from scripts.cleanup_test_data import purge

PREFIX = settings.API_PREFIX

# 1x1 PNG（用于上传用例）
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def assert_ok(body: dict):
    assert body["code"] == 0, body
    assert "requestId" in body
    return body["data"]


@pytest.fixture(autouse=True)
async def cleanup_after_test():
    """每个用例结束后清理测试写入的数据，避免污染演示内容。"""
    yield
    await purge()


async def test_publish_like_comment_flow(client, headers):
    # 1) 发布
    resp = await client.post(
        f"{PREFIX}/posts",
        json={"content": "pytest 写路径回归：跑后放松 10 分钟", "images": [], "topicIds": [], "visibility": "public"},
        headers=headers,
    )
    created = assert_ok(resp.json())
    post_id = created["post"]["id"]
    assert isinstance(post_id, str)

    # 2) 详情可读（带 token 才能拿到 isAuthor）
    detail = assert_ok((await client.get(f"{PREFIX}/posts/{post_id}", headers=headers)).json())
    assert "pytest" in detail["content"]
    assert detail["isAuthor"] is True

    # 3) 点赞 / 取消（幂等）
    liked = assert_ok((await client.post(f"{PREFIX}/posts/{post_id}/like", headers=headers)).json())
    assert liked["liked"] is True and liked["likeCount"] >= 1
    again = assert_ok((await client.post(f"{PREFIX}/posts/{post_id}/like", headers=headers)).json())
    assert again["liked"] is True
    unliked = assert_ok((await client.delete(f"{PREFIX}/posts/{post_id}/like", headers=headers)).json())
    assert unliked["liked"] is False

    # 4) 评论
    made = assert_ok(
        (
            await client.post(
                f"{PREFIX}/posts/{post_id}/comments",
                json={"content": "自动化评论：泡沫轴用软的还是硬的？"},
                headers=headers,
            )
        ).json()
    )
    comment_id = made["comment"]["id"]
    assert made["commentCount"] >= 1

    # 5) 评论点赞 / 取消
    cliked = assert_ok((await client.post(f"{PREFIX}/comments/{comment_id}/like", headers=headers)).json())
    assert cliked["liked"] is True and cliked["likeCount"] >= 1
    cunliked = assert_ok((await client.delete(f"{PREFIX}/comments/{comment_id}/like", headers=headers)).json())
    assert cunliked["liked"] is False

    # 6) 删除自己的评论（软删，列表不再返回）
    assert_ok((await client.delete(f"{PREFIX}/comments/{comment_id}", headers=headers)).json())
    comments = assert_ok(
        (await client.get(f"{PREFIX}/posts/{post_id}/comments", headers=headers)).json()
    )
    assert all(str(item["id"]) != str(comment_id) for item in comments["list"])

    # 7) 删除自己的帖子：作者可见（带 status），他人视角 404
    assert_ok((await client.delete(f"{PREFIX}/posts/{post_id}", headers=headers)).json())
    mine = assert_ok((await client.get(f"{PREFIX}/posts/{post_id}", headers=headers)).json())
    assert mine["status"] == "deleted"
    gone = (await client.get(f"{PREFIX}/posts/{post_id}")).json()
    assert gone["code"] == 40401


async def test_comment_delete_permission(client, headers):
    """不能在未登录时删除评论。"""
    resp = await client.delete(f"{PREFIX}/comments/1")
    assert resp.status_code == 401
    assert resp.json()["code"] == 40101


async def test_upload_avatar(client, headers):
    resp = await client.post(
        f"{PREFIX}/upload/avatar",
        files={"file": ("avatar.png", PNG_1PX, "image/png")},
        headers=headers,
    )
    data = assert_ok(resp.json())
    assert data["url"].startswith("http")
    assert data["url"].endswith(".jpg")


async def test_admin_placeholder(client):
    resp = await client.get(f"{PREFIX}/admin/posts")
    assert resp.status_code == 501
    body = resp.json()
    assert body["code"] == 50100
    assert "1.1" in body["message"]
