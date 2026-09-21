import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.db.database import Base, engine
from app.api import auth, rest, mobile_app, webhook, websocket, circles

# Initialize logging configuration
setup_logging()

app = FastAPI(
    title="Home Assistant Companion App Compatible Server",
    description="A fully featured production-ready compatible backend server.",
    version="1.0.0",
)

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup() -> None:
    logger.info("Starting up Home Assistant compatible server backend...")
    try:
        async with engine.begin() as conn:
            # Idempotently create tables
            await conn.run_sync(Base.metadata.create_all)
            
            # Dynamically migrate avatar_color if it doesn't exist
            from sqlalchemy import text
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN avatar_color VARCHAR(50);"))
                logger.info("Database migration: Added avatar_color column to users table.")
            except Exception:
                # Column likely already exists, ignore
                pass
                
        logger.info("Database schemas created/verified successfully.")
    except Exception as e:
        logger.critical(f"Database schema initialization failed: {e}")
        raise e

# Register endpoint routers
app.include_router(auth.router)
app.include_router(rest.router)
app.include_router(mobile_app.router)
app.include_router(webhook.router)
app.include_router(websocket.router)
app.include_router(circles.router)

# Serve the static compiled React app if built in dist/
dist_path = os.path.join(os.getcwd(), "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
else:
    @app.get("/")
    async def fallback_root():
        return JSONResponse(
            status_code=200,
            content={
                "status": "online",
                "message": "Home Assistant compatible server is running. No static frontend build found in dist/."
            }
        )
