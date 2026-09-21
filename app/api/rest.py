from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_authenticated_user
from app.core.config import settings
from app.core.logging import logger
from app.db.database import get_db
from app.db.models import User
from app.schemas.api import ConfigResponse, EntityStateResponse, UnitSystem
from app.services.state_service import StateService

router = APIRouter()

@router.get("/api/")
async def api_root(user: User = Depends(require_authenticated_user)):
    return {"message": "API running."}

@router.get("/api/config", response_model=ConfigResponse)
async def api_config(user: User = Depends(require_authenticated_user)) -> ConfigResponse:
    # Build dynamically generated config responses
    return ConfigResponse(
        components=["api", "websocket", "mobile_app", "device_tracker", "sensor", "binary_sensor"],
        config_dir="/config",
        elevation=0,
        latitude=0.0,
        location_name="Home Assistant Compatible Server",
        longitude=0.0,
        time_zone="UTC",
        unit_system=UnitSystem(
            length="km",
            mass="g",
            pressure="Pa",
            temperature="°C",
            volume="L"
        ),
        version="2026.9.1",
        whitelist_external_dirs=[]
    )

@router.get("/api/states", response_model=List[EntityStateResponse])
async def api_get_states(
    user: User = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db)
) -> List[EntityStateResponse]:
    entities = await StateService.get_all_states(db, user.id)
    return [
        EntityStateResponse(
            entity_id=e.entity_id,
            state=e.state,
            attributes=e.attributes,
            last_changed=e.last_changed.isoformat(),
            last_updated=e.last_updated.isoformat(),
            context={"id": f"ctx_{e.entity_id}", "user_id": str(user.id)}
        )
        for e in entities
    ]

@router.get("/api/states/{entity_id}", response_model=EntityStateResponse)
async def api_get_state(
    entity_id: str,
    user: User = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db)
) -> EntityStateResponse:
    state_obj = await StateService.get_state(db, user.id, entity_id)
    if not state_obj:
        raise HTTPException(status_code=404, detail="Entity state not found.")
    return EntityStateResponse(
        entity_id=state_obj.entity_id,
        state=state_obj.state,
        attributes=state_obj.attributes,
        last_changed=state_obj.last_changed.isoformat(),
        last_updated=state_obj.last_updated.isoformat(),
        context={"id": f"ctx_{state_obj.entity_id}", "user_id": str(user.id)}
    )

@router.post("/api/states/{entity_id}", response_model=EntityStateResponse)
async def api_set_state(
    entity_id: str,
    payload: Dict[str, Any],
    user: User = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db)
) -> EntityStateResponse:
    state_val = payload.get("state")
    if state_val is None:
        raise HTTPException(status_code=400, detail="The 'state' field is required in the body payload.")
    
    attributes = payload.get("attributes", {})
    
    entity = await StateService.set_state(
        db=db,
        user_id=user.id,
        entity_id=entity_id,
        state=str(state_val),
        attributes=attributes
    )
    
    return EntityStateResponse(
        entity_id=entity.entity_id,
        state=entity.state,
        attributes=entity.attributes,
        last_changed=entity.last_changed.isoformat(),
        last_updated=entity.last_updated.isoformat(),
        context={"id": f"ctx_{entity.entity_id}", "user_id": str(user.id)}
    )

@router.get("/api/components")
async def api_components(user: User = Depends(require_authenticated_user)):
    return ["api", "websocket", "mobile_app", "device_tracker", "sensor", "binary_sensor"]

@router.get("/api/services")
async def api_services(user: User = Depends(require_authenticated_user)):
    # Returns empty or basic capabilities to fulfill queries
    return [
        {
            "domain": "device_tracker",
            "services": {
                "see": {
                    "description": "Direct state updates",
                    "fields": {}
                }
            }
        }
    ]

@router.get("/api/events")
async def api_events(user: User = Depends(require_authenticated_user)):
    return [
        {
            "event": "state_changed",
            "listener_count": 0
        }
    ]
