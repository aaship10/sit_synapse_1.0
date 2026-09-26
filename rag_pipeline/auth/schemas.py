"""Request/response models for the auth API."""
from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    shop: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    name: str
    email: str
    shop: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut
