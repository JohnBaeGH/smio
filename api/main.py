import datetime
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import scraper
import storage

app = FastAPI(title="Smio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = os.environ.get("BASE_URL", "https://smio2.johnbae.co.kr")


# ── 스크래핑 ──────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    url: str


@app.post("/api/scrape")
def scrape_restaurant(req: ScrapeRequest):
    result = scraper.scrape(req.url)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    if not result.get("menu"):
        raise HTTPException(status_code=422, detail="메뉴 정보를 가져오지 못했습니다.")
    return result


# ── 주문방 ────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    restaurant: dict


@app.post("/api/rooms")
def create_room(req: CreateRoomRequest):
    room_id = storage.new_room_id()
    data = {
        "room_id": room_id,
        "restaurant_info": req.restaurant,
        "orders": [],
        "is_closed": False,
        "created_at": datetime.datetime.now().isoformat(),
        "share_url": f"{BASE_URL}?room_id={room_id}",
    }
    storage.save_room(room_id, data)
    return data


@app.get("/api/rooms/{room_id}")
def get_room(room_id: str):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방을 찾을 수 없습니다.")
    return room


# ── 주문 추가 ─────────────────────────────────────────────

class OrderRequest(BaseModel):
    user_name: str
    rank: str
    menu: str
    quantity: int
    price: int
    memo: Optional[str] = None


@app.post("/api/rooms/{room_id}/orders")
def add_order(room_id: str, req: OrderRequest):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    if room.get("is_closed"):
        raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

    order = {
        "user_name": req.user_name,
        "rank": req.rank,
        "menu": req.menu,
        "quantity": req.quantity,
        "price": req.price,
        "memo": req.memo,
        "timestamp": datetime.datetime.now().isoformat(),
    }
    room["orders"].append(order)
    storage.save_room(room_id, room)

    storage.append_log(
        room_id,
        room["restaurant_info"].get("name", ""),
        {"user_name": req.user_name, "menu": req.menu,
         "quantity": req.quantity, "price": req.price},
    )
    return order


# ── 주문 수정 ─────────────────────────────────────────────

@app.put("/api/rooms/{room_id}/orders/{user_name}")
def update_order(room_id: str, user_name: str, req: OrderRequest):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    if room.get("is_closed"):
        raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

    orders = room.get("orders", [])
    idx = next((i for i, o in enumerate(orders) if o["user_name"] == user_name), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    orders[idx] = {
        "user_name": req.user_name,
        "rank": req.rank,
        "menu": req.menu,
        "quantity": req.quantity,
        "price": req.price,
        "memo": req.memo,
        "timestamp": orders[idx]["timestamp"],
        "updated_at": datetime.datetime.now().isoformat(),
    }
    room["orders"] = orders
    storage.save_room(room_id, room)
    return orders[idx]


# ── 주문 마감 ─────────────────────────────────────────────

@app.post("/api/rooms/{room_id}/close")
def close_room(room_id: str):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    room["is_closed"] = True
    room["closed_at"] = datetime.datetime.now().isoformat()
    storage.save_room(room_id, room)
    return {"ok": True}


# ── 로그 ──────────────────────────────────────────────────

@app.get("/api/logs")
def get_logs(month: Optional[str] = None):
    logs = storage.load_logs(month)
    months = storage.available_months()
    return {"logs": logs, "months": months}


# ── 헬스체크 ──────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}
