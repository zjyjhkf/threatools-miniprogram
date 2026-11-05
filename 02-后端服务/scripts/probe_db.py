import itertools

import pymysql

for user, password in itertools.product(["root"], ["", "root", "123456", "password", "mysql", "1234", "admin"]):
    try:
        conn = pymysql.connect(host="127.0.0.1", port=3306, user=user, password=password, connect_timeout=3)
    except Exception as exc:  # noqa: BLE001
        print(f"{user}/{password or '<empty>'}: {str(exc)[:80]}")
        continue
    with conn.cursor() as cur:
        cur.execute("SHOW DATABASES")
        dbs = [row[0] for row in cur.fetchall()]
    conn.close()
    print(f"OK {user}/{password or '<empty>'} dbs={dbs}")
    break
