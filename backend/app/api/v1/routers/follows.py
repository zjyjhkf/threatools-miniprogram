from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.core.rate_limit import rate_limit
from app.core.response import ok
from app.db.session import get_db
from app.models.user import User
from app.services import user_service

router = APIRouter(prefix="/follows", tags=["关注"])


@router.post("/{user_id}", summary="关注", dependencies=[Depends(rate_limit("follow", 120, 3600))])
async def follow(user_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await user_service.toggle_follow(db, user, user_id, True))


@router.delete("/{user_id}", summary="取消关注")
async def unfollow(user_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return ok(await user_service.toggle_follow(db, user, user_id, False))
