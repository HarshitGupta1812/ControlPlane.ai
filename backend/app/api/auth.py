import hashlib
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import AuthSignIn, AuthSignUp, ForgotPassword, ResetPassword, TokenResponse
from app.config import get_settings
from app.db.models import PasswordResetToken, Tenant, User
from app.db.session import get_db
from app.observability.ratelimit import limiter
from app.security.auth import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_payload(user: User) -> dict:
    return {"id": user.id, "email": user.email, "display_name": user.display_name, "tenant_id": user.tenant_id}


@router.post("/signup", response_model=TokenResponse)
@limiter.limit("10/minute")
def signup(request: Request, body: AuthSignUp, db: Session = Depends(get_db)) -> TokenResponse:
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    tenant = Tenant(name=body.workspace_name, slug=f"{body.workspace_name.lower().replace(' ', '-')}-{token_urlsafe(3).lower()}")
    db.add(tenant)
    db.flush()
    user = User(tenant_id=tenant.id, email=body.email.lower(), password_hash=hash_password(body.password), display_name=body.display_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=_user_payload(user))


@router.post("/signin", response_model=TokenResponse)
@limiter.limit("10/minute")
def signin(request: Request, body: AuthSignIn, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(user.id), user=_user_payload(user))


@router.get("/me")
def me(user: Annotated[User, Depends(get_current_user)]) -> dict:
    return _user_payload(user)


@router.post("/signout")
def signout() -> dict:
    # JWTs are stateless; the client drops its token. A future deployment can add a deny-list here.
    return {"ok": True}


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, body: ForgotPassword, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    raw_token = token_urlsafe(32)
    if user:
        db.add(PasswordResetToken(user_id=user.id, token_hash=hashlib.sha256(raw_token.encode()).hexdigest(), expires_at=datetime.now(UTC) + timedelta(hours=1)))
        db.commit()
    response = {"message": "If that address exists, a reset link has been issued."}
    if get_settings().app_env == "development" and user:
        response["dev_reset_token"] = raw_token
    return response


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, body: ResetPassword, db: Session = Depends(get_db)) -> dict:
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    token = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash, PasswordResetToken.used_at.is_(None), PasswordResetToken.expires_at > datetime.now(UTC)).with_for_update())
    if token is None:
        raise HTTPException(status_code=400, detail="Reset token is invalid, expired, or already used")
    user = db.get(User, token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Reset token is invalid")
    token.used_at = datetime.now(UTC)
    user.password_hash = hash_password(body.password)
    db.commit()
    return {"message": "Password updated"}
