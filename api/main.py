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
    owner_id: str


@app.get("/api/rooms")
def list_rooms(owner_id: str):
    return storage.list_rooms(owner_id)


@app.post("/api/rooms")
def create_room(req: CreateRoomRequest):
    room_id = storage.new_room_id()
    data = {
        "room_id": room_id,
        "owner_id": req.owner_id,
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


@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str, owner_id: str):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    if room.get("owner_id") != owner_id:
        raise HTTPException(status_code=403, detail="권한 없음")
    storage.delete_room(room_id)
    return {"ok": True}


# ── 주문 추가 ─────────────────────────────────────────────

class OrderRequest(BaseModel):
    user_name: str
    rank: Optional[str] = ""
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


# ── 메뉴 추가 ─────────────────────────────────────────────

class MenuItemRequest(BaseModel):
    name: str
    price: int
    category: Optional[str] = None
    is_beverage: Optional[bool] = False


@app.post("/api/rooms/{room_id}/menu")
def add_menu_item(room_id: str, req: MenuItemRequest):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    if room.get("is_closed"):
        raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="메뉴 이름을 입력해 주세요.")
    if req.price is None or req.price < 0:
        raise HTTPException(status_code=422, detail="가격이 올바르지 않습니다.")

    info = room.setdefault("restaurant_info", {})
    menu = info.setdefault("menu", [])
    if any((m.get("name") or "").strip() == name for m in menu):
        raise HTTPException(status_code=409, detail="이미 같은 이름의 메뉴가 있습니다.")

    item = {
        "name": name,
        "price": req.price,
        "category": req.category,
        "is_beverage": bool(req.is_beverage),
    }
    menu.append(item)
    storage.save_room(room_id, room)
    return item


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


# ── 주문 삭제 ─────────────────────────────────────────────

@app.delete("/api/rooms/{room_id}/orders/{user_name}")
def delete_order(room_id: str, user_name: str):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    if room.get("is_closed"):
        raise HTTPException(status_code=403, detail="마감된 주문방입니다.")
    orders = room.get("orders", [])
    new_orders = [o for o in orders if o["user_name"] != user_name]
    if len(new_orders) == len(orders):
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    room["orders"] = new_orders
    storage.save_room(room_id, room)
    return {"ok": True}


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


# ── 주문 재개 ─────────────────────────────────────────────

@app.post("/api/rooms/{room_id}/reopen")
def reopen_room(room_id: str):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방 없음")
    room["is_closed"] = False
    room.pop("closed_at", None)
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
