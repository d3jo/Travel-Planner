from __future__ import annotations

import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
import httpx

router = APIRouter(prefix="/api", tags=["photos"])

_PLACES_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
_cache: dict[str, str] = {}  # query -> resolved photo URL (after redirect)


@router.get("/place-photo")
async def place_photo(q: str = Query(..., min_length=1)):
    if not _PLACES_KEY:
        raise HTTPException(status_code=503, detail="GOOGLE_PLACES_API_KEY not configured in backend .env")

    if q not in _cache:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://maps.googleapis.com/maps/api/place/textsearch/json",
                    params={"query": q, "key": _PLACES_KEY},
                )
            data = resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="Places API request failed")

        results = data.get("results", [])
        if not results:
            raise HTTPException(status_code=404, detail="No results found for query")

        photos = results[0].get("photos", [])
        if not photos:
            raise HTTPException(status_code=404, detail="No photos for this place")

        ref = photos[0]["photo_reference"]
        _cache[q] = (
            f"https://maps.googleapis.com/maps/api/place/photo"
            f"?maxwidth=600&photo_reference={ref}&key={_PLACES_KEY}"
        )

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            img = await client.get(_cache[q])
        if img.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch photo from Google")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch photo")

    return Response(
        content=img.content,
        media_type=img.headers.get("content-type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
