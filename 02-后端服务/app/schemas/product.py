from app.core.response import CamelModel


class ProductItem(CamelModel):
    id: int
    title: str
    subtitle: str = ""
    price: float = 0
    original_price: float | None = None
    cover: str = ""
    category: str = "equipment"
    tags: list[str] = []
    sales: int = 0
    is_new: bool = False


class ProductDetailData(CamelModel):
    product: ProductItem
    images: list[str] = []
    detail: str = ""
    suitable_for: str = ""
    specs: list[dict] = []
    collected: bool = False
    collect_count: int = 0


class ProductListData(CamelModel):
    list: list[ProductItem]
    total: int
    page: int
    size: int
    has_more: bool
    categories: list[dict] = []
