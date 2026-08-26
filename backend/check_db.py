import asyncio
from sqlalchemy import create_engine, inspect, text
from app.config import get_settings, normalized_database_url

settings = get_settings()
engine = create_engine(normalized_database_url(settings.database_url))

inspector = inspect(engine)
tables = inspector.get_table_names()
print("Tables:", tables)
if "users" in tables:
    columns = inspector.get_columns("users")
    for c in columns:
        if c["name"] == "id":
            print("users.id type:", c["type"])
