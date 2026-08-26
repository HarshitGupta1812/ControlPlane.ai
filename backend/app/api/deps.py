from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db
from app.security.auth import get_current_user

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
