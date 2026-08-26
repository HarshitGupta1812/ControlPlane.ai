import asyncio
from sqlalchemy import create_engine, MetaData
from app.config import get_settings, normalized_database_url

settings = get_settings()
engine = create_engine(normalized_database_url(settings.database_url))

metadata = MetaData()
metadata.reflect(bind=engine)
metadata.drop_all(bind=engine)
print("All tables dropped successfully.")
