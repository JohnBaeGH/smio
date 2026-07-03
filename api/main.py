import datetime
import os
import threading
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import scraper
import storage

app = FastAPI(title="Smio API", version="1.1.0")

# 주문방 파일 read-modify-write 경합 방지 (단일 워커 전제)
_room_lock = threading.Lock()


def _ensure_order_ids(room: dict) -> None:
    """구버전 방의 주문에 order_id가 없으면 부여한다."""
    for o in room.get("orders", []):
        if not o.get("order_id"):
            o["order_id"] = uuid.uuid4().hex[:12]


def _public_room(room: dict, device_id: Optional[str]) -> dict:
    """owner_id(방장 인증 토큰 역할)를 감추고 is_owner만 내려준다."""
    data = {k: v for k, v in room.items() if k != "owner_id"}
    data["is_owner"] = bool(device_id) and device_id == room.get("owner_id")
    return data

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
    owner_id: str = Field(min_length=1, max_length=64)


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
    return _public_room(data, req.owner_id)


@app.get("/api/rooms/{room_id}")
def get_room(room_id: str, device_id: Optional[str] = None):
    room = storage.load_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="주문방을 찾을 수 없습니다.")
    return _public_room(room, device_id)


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
    user_name: str = Field(min_length=1, max_length=40)
    rank: Optional[str] = Field(default="", max_length=40)
    menu: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=1, le=99)
    price: int = Field(ge=0, le=10_000_000)
    memo: Optional[str] = Field(default=None, max_length=200)


@app.post("/api/rooms/{room_id}/orders")
def add_order(room_id: str, req: OrderRequest):
    with _room_lock:
        room = storage.load_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="주문방 없음")
        if room.get("is_closed"):
            raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

        _ensure_order_ids(room)
        order = {
            "order_id": uuid.uuid4().hex[:12],
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
    name: str = Field(min_length=1, max_length=80)
    price: int = Field(ge=0, le=10_000_000)
    category: Optional[str] = Field(default=None, max_length=20)
    is_beverage: Optional[bool] = False


@app.post("/api/rooms/{room_id}/menu")
def add_menu_item(room_id: str, req: MenuItemRequest):
    with _room_lock:
        room = storage.load_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="주문방 없음")
        if room.get("is_closed"):
            raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

        name = (req.name or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="메뉴 이름을 입력해 주세요.")

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

# order_key는 order_id(신규) 또는 user_name(구버전 클라이언트 호환)을 받는다.

@app.put("/api/rooms/{room_id}/orders/{order_key}")
def update_order(room_id: str, order_key: str, req: OrderRequest):
    with _room_lock:
        room = storage.load_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="주문방 없음")
        if room.get("is_closed"):
            raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

        _ensure_order_ids(room)
        orders = room.get("orders", [])
        idx = next((i for i, o in enumerate(orders) if o.get("order_id") == order_key), None)
        if idx is None:  # 구버전 호환: user_name으로 첫 주문 매칭
            idx = next((i for i, o in enumerate(orders) if o["user_name"] == order_key), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

        orders[idx] = {
            "order_id": orders[idx].get("order_id"),
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

@app.delete("/api/rooms/{room_id}/orders/{order_key}")
def delete_order(room_id: str, order_key: str):
    with _room_lock:
        room = storage.load_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="주문방 없음")
        if room.get("is_closed"):
            raise HTTPException(status_code=403, detail="마감된 주문방입니다.")

        _ensure_order_ids(room)
        orders = room.get("orders", [])
        new_orders = [o for o in orders if o.get("order_id") != order_key]
        if len(new_orders) == len(orders):  # 구버전 호환: user_name 전체 삭제
            new_orders = [o for o in orders if o["user_name"] != order_key]
        if len(new_orders) == len(orders):
            raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
        room["orders"] = new_orders
        storage.save_room(room_id, room)
        return {"ok": True}


# ── 주문 마감 / 재개 (방장 전용) ──────────────────────────

def _check_owner(room: dict, owner_id: Optional[str]) -> None:
    if not owner_id or owner_id != room.get("owner_id"):
        raise HTTPException(status_code=403, detail="방장만 마감/재개할 수 있습니다.")


@app.post("/api/rooms/{room_id}/close")
def close_room(room_id: str, owner_id: Optional[str] = None):
    with _room_lock:
        room = storage.load_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="주문방 없음")
        _check_owner(room, owner_id)
        room["is_closed"] = True
        room["closed_at"] = datetime.datetime.now().isoformat()
        storage.save_room(room_id, room)
        return {"ok": True}


@app.post("/api/rooms/{room_id}/reopen")
def reopen_room(room_id: str, owner_id: Optional[str] = None):
    with _room_lock:
        room = storage.load_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="주문방 없음")
        _check_owner(room, owner_id)
        room["is_closed"] = False
        room.pop("closed_at", None)
        storage.save_room(room_id, room)
        return {"ok": True}


# ── 로그 ──────────────────────────────────────────────────

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")


@app.get("/api/logs")
def get_logs(month: Optional[str] = None, token: Optional[str] = None):
    # 이름·주문 이력이 담기므로 ADMIN_TOKEN이 설정된 경우 토큰을 요구한다.
    if ADMIN_TOKEN and token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="권한 없음")
    if month and not month.replace("-", "").isdigit():
        raise HTTPException(status_code=422, detail="월 형식이 올바르지 않습니다. (YYYY-MM)")
    logs = storage.load_logs(month)
    months = storage.available_months()
    return {"logs": logs, "months": months}


# ── 헬스체크 ──────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}
