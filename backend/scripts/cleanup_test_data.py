"""清理自动化测试写入的数据（保持演示数据干净）。

匹配规则：
- 帖子正文以 `pytest` 开头
- 评论正文以 `自动化评论` 或 `pytest` 开头

用法：
    python -m scripts.cleanup_test_data
或在测试 teardown 中 `await purge()`。
"""

import asyncio

from sqlalchemy import delete, select

from app.db.session import async_session_factory
from app.models.collection import Collection
from app.models.comment import Comment
from app.models.like import Like
from app.models.post import Post, PostImage
from app.models.topic import PostTopic


async def purge() -> dict:
    stats = {"posts": 0, "comments": 0, "likes": 0, "collections": 0}
    async with async_session_factory() as db:
        post_ids = [row for (row,) in (await db.execute(
            select(Post.id).where(Post.content.like("pytest%"))
        )).all()]

        comment_stmt = select(Comment.id).where(
            (Comment.content.like("自动化评论%")) | (Comment.content.like("pytest%"))
        )
        if post_ids:
            comment_stmt = select(Comment.id).where(
                (Comment.post_id.in_(post_ids))
                | (Comment.content.like("自动化评论%"))
                | (Comment.content.like("pytest%"))
            )
        comment_ids = [row for (row,) in (await db.execute(comment_stmt)).all()]

        if post_ids:
            result = await db.execute(
                delete(PostImage).where(PostImage.post_id.in_(post_ids))
            )
            stats["posts"] += result.rowcount or 0
            await db.execute(delete(PostTopic).where(PostTopic.post_id.in_(post_ids)))
            r = await db.execute(
                delete(Like).where(Like.target_type == "post", Like.target_id.in_(post_ids))
            )
            stats["likes"] += r.rowcount or 0
            r = await db.execute(
                delete(Collection).where(
                    Collection.target_type == "post", Collection.target_id.in_(post_ids)
                )
            )
            stats["collections"] += r.rowcount or 0

        if comment_ids:
            r = await db.execute(
                delete(Like).where(
                    Like.target_type == "comment", Like.target_id.in_(comment_ids)
                )
            )
            stats["likes"] += r.rowcount or 0
            r = await db.execute(delete(Comment).where(Comment.id.in_(comment_ids)))
            stats["comments"] += r.rowcount or 0

        if post_ids:
            r = await db.execute(delete(Post).where(Post.id.in_(post_ids)))
            stats["posts"] += r.rowcount or 0

        await db.commit()
    return stats


if __name__ == "__main__":
    async def _main():
        result = await purge()
        # 显式释放连接池，避免 aiomysql 在事件循环关闭后被 GC 时报错
        from app.db.session import engine

        await engine.dispose()
        print("cleanup done:", result)

    asyncio.run(_main())
