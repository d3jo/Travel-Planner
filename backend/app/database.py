from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "users.db")
DATABASE_URL = f"sqlite:///{os.path.abspath(DB_PATH)}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app import models  # noqa: F401 – registers models with Base
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE trips ADD COLUMN share_token VARCHAR(64)"))
            conn.commit()
        except Exception:
            pass  # Column already exists
