from typing import Optional
from pydantic import BaseModel, Field

class UserCreate(BaseModel):
    username: str = Field(..., description="Unique email or username")
    password: str = Field(..., min_length=6, description="Secure password")
    display_name: str = Field(..., description="User's display name")

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_color: Optional[str] = None
    map_style: Optional[str] = "osm"
    is_active: bool

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: Optional[str] = None
