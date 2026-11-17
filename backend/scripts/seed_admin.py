"""创建初始超级管理员（幂等）。

开发环境默认：admin / Admin@123456
生产环境请通过 ADMIN_INIT_PASSWORD 注入强密码，并在首次登录后修改。
"""
import asyncio
import os
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import async_session_factory, engine
from app.models.admin_user import AdminUser

USERNAME = os.getenv("ADMIN_INIT_USERNAME", "admin")
PASSWORD = os.getenv("ADMIN_INIT_PASSWORD", "Admin@123456")
NICKNAME = os.getenv("ADMIN_INIT_NICKNAME", "超级管理员")


async def main() -> None:
    if len(USERNAME) < 3 or len(PASSWORD) < 8:
        sys.exit("ADMIN_INIT_USERNAME 至少 3 位，ADMIN_INIT_PASSWORD 至少 8 位")

    async with async_session_factory() as db:
        exists = await db.scalar(select(AdminUser).where(AdminUser.username == USERNAME))
        if exists:
            print(f"admin '{USERNAME}' already exists, skip")
            return
        db.add(
            AdminUser(
                username=USERNAME,
                password_hash=hash_password(PASSWORD),
                nickname=NICKNAME,
                role="super",
                status=1,
            )
        )
        await db.commit()
        print(f"admin '{USERNAME}' created; password={PASSWORD} (dev only)")


async def _run() -> None:
    try:
        await main()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_run())
