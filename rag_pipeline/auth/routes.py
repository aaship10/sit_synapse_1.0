"""Auth endpoints: signup, login, me.

Exposed as an APIRouter so it can either run standalone (see main.py) or be
mounted into the main RAG FastAPI app later with:
    from auth.routes import router as auth_router
    app.include_router(auth_router)
"""
import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from .db import get_cursor
from .schemas import AuthResponse, LoginRequest, SignupRequest, UserOut
from .security import create_access_token, decode_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest):
    email = payload.email.strip().lower()
    password_hash = hash_password(payload.password)

    try:
        with get_cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO users (name, email, shop, password_hash)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, email, shop
                """,
                (payload.name.strip(), email, payload.shop.strip(), password_hash),
            )
            user = cur.fetchone()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    token = create_access_token(str(user["id"]), user["email"])
    return AuthResponse(token=token, user=UserOut(**user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    email = payload.email.strip().lower()

    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, email, shop, password_hash FROM users WHERE email = %s",
            (email,),
        )
        user = cur.fetchone()

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(str(user["id"]), user["email"])
    return AuthResponse(token=token, user=UserOut(name=user["name"], email=user["email"], shop=user["shop"]))


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> UserOut:
    """Dependency for routes (here or in the RAG API) that require a signed-in user."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    try:
        claims = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    with get_cursor() as cur:
        cur.execute("SELECT name, email, shop FROM users WHERE id = %s", (claims["sub"],))
        user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    return UserOut(**user)


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(current_user)):
    return user
