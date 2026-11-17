"""应用配置：全部来自环境变量 / .env，不在代码里硬编码密钥。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "dev"
    APP_VERSION: str = "1.0.0"

    # 数据库
    DATABASE_URL: str = "mysql+asyncmy://root:root@127.0.0.1:3306/miniprogram?charset=utf8mb4"
    DB_ECHO: bool = False

    # JWT
    JWT_SECRET: str = "dev_only_secret_change_me_at_least_32_bytes_long"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7

    # 微信
    WX_APPID: str = "wx1d74ed07f229eba7"
    WX_SECRET: str = ""
    WX_MOCK_LOGIN: bool = True
    WX_MOCK_OPENID: str = "seed_openid_100001"

    # 上传
    UPLOAD_DIR: str = "./uploads"
    UPLOAD_URL_PREFIX: str = "http://127.0.0.1:8000"
    MAX_UPLOAD_MB: int = 5
    MAX_IMAGE_COUNT: int = 9

    # 其它
    CORS_ORIGINS: str = "*"
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "./logs"
    RATE_LIMIT_ENABLE: bool = True
    POST_MODERATION: str = "post"
    TZ: str = "Asia/Shanghai"
    API_PREFIX: str = "/api/v1"

    @property
    def cors_origin_list(self) -> list[str]:
        raw = (self.CORS_ORIGINS or "*").strip()
        if raw == "*":
            return ["*"]
        return [x.strip() for x in raw.split(",") if x.strip()]

    @property
    def is_prod(self) -> bool:
        return self.APP_ENV.lower() == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
