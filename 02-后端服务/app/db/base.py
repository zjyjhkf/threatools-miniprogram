"""Declarative Base + 稳定的约束命名（Alembic 自动生成依赖）。"""
from sqlalchemy import MetaData
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "idx_%(column_0_label)s",
    "uq": "uk_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def now_default():
    """MySQL 要求 DATETIME 默认值为 CURRENT_TIMESTAMP，不能用 now()。"""
    from sqlalchemy import text

    return text("CURRENT_TIMESTAMP(3)")


def datetime_ms():
    """MySQL DATETIME(3)，其它方言退化为普通 DATETIME。"""
    from sqlalchemy import DateTime

    return DateTime().with_variant(mysql.DATETIME(fsp=3), "mysql")


def unsigned_int():
    from sqlalchemy import Integer

    return Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql")


def unsigned_bigint():
    from sqlalchemy import BigInteger

    return BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql")


def unsigned_smallint():
    from sqlalchemy import SmallInteger

    return SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql")


def unsigned_tinyint():
    from sqlalchemy import SmallInteger

    return SmallInteger().with_variant(mysql.TINYINT(unsigned=True), "mysql")


def tiny_bool():
    from sqlalchemy import SmallInteger

    return SmallInteger().with_variant(mysql.TINYINT(display_width=1), "mysql")
