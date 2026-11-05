import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent / "app" / "models"
for path in root.glob("*.py"):
    text = path.read_text(encoding="utf-8")
    if "func.now()" not in text:
        continue
    text = text.replace("server_default=func.now()", "server_default=now_default()")
    if "now_default" not in text.split("class ")[0]:
        text = re.sub(
            r"from app\.db\.base import ([^\n]+)",
            lambda m: "from app.db.base import " + ", ".join(
                sorted(set([x.strip() for x in m.group(1).split(",")] + ["now_default"]))
            ),
            text,
            count=1,
        )
    if "func" in text and "func." not in text:
        text = re.sub(r"from sqlalchemy import ([^\n]*?)func, ", r"from sqlalchemy import \1", text)
        text = re.sub(r"from sqlalchemy import ([^\n]*?), func\b", r"from sqlalchemy import \1", text)
    path.write_text(text, encoding="utf-8")
    print("patched", path.name)
