"""接口冒烟测试：按 A01–A32 顺序覆盖主要链路（需先启动后端）。

用法：python -m scripts.smoke [base_url]
"""
import json
import sys

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/") + "/api/v1"


def show(name, data):
    print(f"[OK] {name}: {json.dumps(data, ensure_ascii=False)[:220]}")


def main() -> None:
    client = httpx.Client(timeout=10)
    login = client.post(f"{BASE}/auth/wechat-login", json={"code": "dev-code"}).json()
    assert login["code"] == 0, login
    token = login["data"]["token"]
    headers = {"Authorization": f"Bearer {token}"}
    show("A01 登录", {"user": login["data"]["user"]["id"], "isNew": login["data"]["isNewUser"]})

    me = client.get(f"{BASE}/users/me", headers=headers).json()["data"]
    show("A02 我的资料", {"nickname": me["nickname"], "completeness": me["completeness"]})

    body = client.get(f"{BASE}/users/me/body-profile", headers=headers).json()["data"]
    show("A04 身体档案", body)

    saved = client.put(
        f"{BASE}/users/me/body-profile",
        headers=headers,
        json={"weight": 69.5, "goals": ["recovery"]},
    ).json()["data"]
    show("A05 保存身体档案", saved["completeness"])

    home = client.get(f"{BASE}/users/100002", headers=headers).json()["data"]
    show("A06 他人主页", {"nickname": home["nickname"], "postCount": home["postCount"]})

    uposts = client.get(f"{BASE}/users/100002/posts", headers=headers).json()["data"]
    show("A07 他人动态", {"total": uposts["total"], "hasMore": uposts["hasMore"]})

    feed = client.get(f"{BASE}/feed?type=recommend&size=3", headers=headers).json()["data"]
    show("A08 信息流", {"n": len(feed["list"]), "next": feed["nextCursor"]})

    detail = client.get(f"{BASE}/posts/1", headers=headers).json()["data"]
    show("A09 帖子详情", {"id": detail["id"], "liked": detail["liked"], "isAuthor": detail["isAuthor"]})

    created = client.post(
        f"{BASE}/posts",
        headers=headers,
        json={"content": "联调测试帖子", "images": [], "topicIds": [1]},
    ).json()["data"]
    post_id = created["post"]["id"]
    show("A10 发布帖子", created)

    liked = client.post(f"{BASE}/posts/{post_id}/like", headers=headers).json()["data"]
    show("A12 点赞", liked)
    collected = client.post(f"{BASE}/posts/{post_id}/collect", headers=headers).json()["data"]
    show("A13 收藏", collected)

    comments = client.get(f"{BASE}/posts/1/comments").json()["data"]
    show("A14 评论列表", {"n": len(comments["list"]), "hasMore": comments["hasMore"]})

    made = client.post(
        f"{BASE}/posts/1/comments",
        headers=headers,
        json={"content": "冒烟评论", "replyToId": 101},
    ).json()["data"]
    show("A15 发表评论", {"id": made["comment"]["id"], "count": made["commentCount"]})
    client.delete(f"{BASE}/comments/{made['comment']['id']}", headers=headers)

    hot = client.get(f"{BASE}/topics/hot").json()["data"]
    show("A17 热门话题", {"n": len(hot["list"]), "first": hot["list"][0]["name"]})

    topics = client.get(f"{BASE}/topics?page=1&size=12").json()["data"]
    show("A18 话题列表", {"n": len(topics["list"]), "total": topics["total"]})

    tposts = client.get(f"{BASE}/topics/1/posts?sort=new", headers=headers).json()["data"]
    show("A19 话题帖子", {"n": len(tposts["list"]), "total": tposts["total"]})

    created_topic = client.post(f"{BASE}/topics", headers=headers, json={"name": "冒烟话题"}).json()["data"]
    show("A21 创建话题", created_topic["topic"]["name"])

    courses = client.get(f"{BASE}/courses?category=all&page=1&size=3").json()["data"]
    show("A22 课程列表", {"main": bool(courses["main"]), "n": len(courses["list"])})

    course = client.get(f"{BASE}/courses/1", headers=headers).json()["data"]
    show("A23 课程详情", {"chapters": len(course["chapters"]), "related": len(course["related"])})

    products = client.get(f"{BASE}/products").json()["data"]
    show("A25 产品列表", {"n": len(products["list"]), "banner": products["banner"]["title"]})

    product = client.get(f"{BASE}/products/1", headers=headers).json()["data"]
    show("A26 产品详情", {"images": len(product["images"]), "specs": len(product["specs"])})

    search = client.get(f"{BASE}/search?q=跑&type=all").json()["data"]
    show("A29 搜索", search["counts"])

    avatar = client.post(
        f"{BASE}/upload/avatar",
        headers=headers,
        files={"file": ("a.png", _png_bytes(), "image/png")},
    ).json()
    assert avatar["code"] == 0, avatar
    show("A30 上传头像", {"url": avatar["data"]["url"]})

    images = client.post(
        f"{BASE}/upload/images",
        headers=headers,
        files=[("files", ("b.png", _png_bytes(), "image/png"))],
    ).json()["data"]
    show("A31 上传图片", images)

    follow = client.post(f"{BASE}/follows/100003", headers=headers).json()["data"]
    show("A32 关注", follow)
    client.delete(f"{BASE}/follows/100003", headers=headers)

    track = client.post(f"{BASE}/track", headers=headers, json={"event": "smoke", "page": "test"}).json()
    show("A33 埋点", {"code": track["code"], "data": track["data"]})

    removed = client.delete(f"{BASE}/posts/{post_id}", headers=headers).json()
    show("A11 删除帖子", removed["data"])
    assert removed["data"] == {"deleted": True}, removed
    hidden = client.get(f"{BASE}/posts/{post_id}").json()
    assert hidden["code"] != 0, hidden

    print("smoke done")


def _png_bytes() -> bytes:
    from PIL import Image
    import io

    buffer = io.BytesIO()
    Image.new("RGB", (600, 400), (90, 160, 220)).save(buffer, format="PNG")
    return buffer.getvalue()


if __name__ == "__main__":
    main()
