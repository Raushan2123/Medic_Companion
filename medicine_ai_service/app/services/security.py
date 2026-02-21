import os
from fastapi import Header, HTTPException, Depends
from app.core.env import load_env
load_env()

# INTERNAL_SERVICE_SECRET = os.getenv("INTERNAL_SERVICE_SECRET")

def verify_internal_service(x_internal_key: str = Header(...)):
    secret = os.getenv("INTERNAL_SERVICE_SECRET")

    if not secret:
        raise HTTPException(
            status_code=500,
            detail="Internal service secret not configured."
        )

    if x_internal_key != secret:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized service call."
        )