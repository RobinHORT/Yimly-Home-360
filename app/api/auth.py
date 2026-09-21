from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.config import settings
from app.core.logging import logger
from app.core.security import create_jwt_token
from app.db.database import get_db
from app.db.models import User
from app.schemas.auth import UserCreate, UserResponse
from app.services.auth_service import AuthService
from app.services.token_service import TokenService

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

class LoginRequest(BaseModel):
    username: str
    password: str

@router.get("/auth/authorize", response_class=HTMLResponse)
async def authorize_get(
    request: Request,
    client_id: str,
    redirect_uri: str,
    response_type: str,
    state: str,
    scope: Optional[str] = None
) -> HTMLResponse:
    # Validate parameters
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=400, detail="Missing required authorize parameters.")

    # Render login form preserving original state parameters
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": response_type,
            "state": state,
            "error": None
        }
    )

@router.post("/auth/login_submit")
async def authorize_post(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    response_type: str = Form(...),
    state: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    # Authenticate credentials
    user = await AuthService.authenticate_user(db, username, password)
    if not user:
        # Re-render with failure message
        return templates.TemplateResponse(
            request=request,
            name="login.html",
            context={
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": response_type,
                "state": state,
                "error": "Invalid username or password"
            }
        )

    # Handshake success: Generate temporary single-use Auth Code
    try:
        code = await TokenService.create_authorization_code(
            db=db,
            user_id=user.id,
            client_id=client_id,
            redirect_uri=redirect_uri
        )
    except Exception as e:
        logger.error(f"Failed to generate auth code: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    # Redirect client/webview to the provided Redirect URI with parameters
    separator = "&" if "?" in redirect_uri else "?"
    redirect_url = f"{redirect_uri}{separator}code={code}&state={state}"
    logger.info(f"User {user.username} authenticated successfully. Redirecting to mobile-app callback.")
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

@router.post("/auth/token")
async def exchange_token(
    grant_type: str = Form(...),
    client_id: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    refresh_token: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    if grant_type == "authorization_code":
        if not code or not redirect_uri:
            raise HTTPException(status_code=400, detail="Code and redirect_uri are required for authorization_code grant.")

        # Validate code atomically
        user_id = await TokenService.redeem_authorization_code(
            db=db,
            raw_code=code,
            client_id=client_id,
            redirect_uri=redirect_uri
        )
        if user_id is None:
            raise HTTPException(status_code=400, detail="Invalid, expired, or already used authorization code.")

        # Create JWT Access Token and Refresh Token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_jwt_token(
            data={"sub": str(user_id), "typ": "access"},
            expires_delta=access_token_expires
        )
        
        # Create persistent Refresh Token
        new_refresh_token = await TokenService.create_refresh_token(
            db=db,
            user_id=user_id,
            client_id=client_id
        )

        logger.info(f"Successfully issued access token and refresh token for user {user_id}")
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": int(access_token_expires.total_seconds()),
            "refresh_token": new_refresh_token
        }

    elif grant_type == "refresh_token":
        if not refresh_token:
            raise HTTPException(status_code=400, detail="refresh_token is required for refresh_token grant.")

        user_id = await TokenService.redeem_refresh_token(
            db=db,
            raw_token=refresh_token,
            client_id=client_id
        )
        if user_id is None:
            raise HTTPException(status_code=400, detail="Invalid, revoked, or expired refresh token.")

        # Issue new Access Token (keep old refresh token active or rotate - we'll keep the same refresh token active)
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_jwt_token(
            data={"sub": str(user_id), "typ": "access"},
            expires_delta=access_token_expires
        )

        logger.info(f"Successfully refreshed access token for user {user_id}")
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": int(access_token_expires.total_seconds()),
            "refresh_token": refresh_token  # Protocol accepts returning the same refresh token
        }

    else:
        raise HTTPException(status_code=400, detail="Unsupported grant_type.")


@router.get("/api/setup/status")
async def get_setup_status(db: AsyncSession = Depends(get_db)):
    # Check if any user exists in the database
    stmt = select(func.count()).select_from(User)
    result = await db.execute(stmt)
    count = result.scalar()
    return {"needs_setup": count == 0}


@router.post("/api/setup/register", response_model=UserResponse)
async def setup_register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Verify setup is actually needed (no users in db)
    stmt = select(func.count()).select_from(User)
    result = await db.execute(stmt)
    count = result.scalar()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup has already been completed."
        )

    # Check if username already exists
    existing = await AuthService.get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists."
        )

    user = await AuthService.create_user(db, user_in)
    return user


@router.post("/api/auth/register", response_model=UserResponse)
async def api_register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Verify setup is NOT needed (at least one user exists in the db)
    stmt = select(func.count()).select_from(User)
    result = await db.execute(stmt)
    count = result.scalar()
    if count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="First-run setup has not been completed yet."
        )

    # Check if username already exists
    existing = await AuthService.get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists."
        )

    user = await AuthService.create_user(db, user_in)
    return user


@router.post("/api/auth/login")
async def api_login(login_in: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await AuthService.authenticate_user(db, login_in.username, login_in.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    # Generate JWT Access Token and Refresh Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_jwt_token(
        data={"sub": str(user.id), "typ": "access"},
        expires_delta=access_token_expires
    )

    new_refresh_token = await TokenService.create_refresh_token(
        db=db,
        user_id=user.id,
        client_id="web_ui"
    )

    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": int(access_token_expires.total_seconds()),
        "refresh_token": new_refresh_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_color": user.avatar_color,
            "map_style": user.map_style or "osm"
        }
    }


from app.api.deps import require_authenticated_user

class ProfileUpdate(BaseModel):
    avatar_color: Optional[str] = None
    map_style: Optional[str] = None

@router.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(require_authenticated_user)):
    return current_user

@router.put("/api/auth/profile", response_model=UserResponse)
async def update_profile(
    profile_in: ProfileUpdate,
    current_user: User = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    if profile_in.avatar_color is not None:
        current_user.avatar_color = profile_in.avatar_color
    if profile_in.map_style is not None:
        allowed_styles = {"osm", "openfree_positron", "openfree_bright", "openfree_liberty", "openfree_dark", "openfree_fiord", "carto_voyager", "carto_positron", "carto_dark"}
        if profile_in.map_style in allowed_styles:
            current_user.map_style = profile_in.map_style
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid map_style value. Must be one of {allowed_styles}"
            )
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user

