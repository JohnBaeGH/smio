import json
import uuid
import datetime
from pathlib import Path

ROOMS_DIR = Path("rooms")
LOGS_DIR = Path("logs")


def _ensure_dirs():
    ROOMS_DIR.mkdir(exist_ok=True)
    LOGS_DIR.mkdir(exist_ok=True)


# ── 주문방 ───────────────────────────────────────────────

def new_room_id() -> str:
    return str(uuid.uuid4())[:8]


def save_room(room_id: str, data: dict) -> bool:
    _ensure_dirs()
    try:
        path = ROOMS_DIR / f"{room_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except Exception:
        return False


def load_room(room_id: str) -> dict | None:
    path = ROOMS_DIR / f"{room_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def delete_room(room_id: str) -> bool:
    path = ROOMS_DIR / f"{room_id}.json"
    if not path.exists():
        return False
    try:
        path.unlink()
        return True
    except Exception:
        return False


def list_rooms(owner_id: str) -> list[dict]:
    _ensure_dirs()
    rooms = []
    for path in sorted(ROOMS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("owner_id") != owner_id:
                continue
            rooms.append({
                "room_id": data.get("room_id"),
                "restaurant_name": data.get("restaurant_info", {}).get("name", ""),
                "created_at": data.get("created_at", ""),
                "is_closed": data.get("is_closed", False),
                "closed_at": data.get("closed_at"),
                "order_count": len(data.get("orders", [])),
                "total_amount": sum(o.get("price", 0) * o.get("quantity", 1) for o in data.get("orders", [])),
            })
        except Exception:
            pass
    return rooms


# ── 로그 ─────────────────────────────────────────────────

def _log_path(year_month: str | None = None) -> Path:
    _ensure_dirs()
    ym = year_month or datetime.datetime.now().strftime("%Y-%m")
    return LOGS_DIR / f"orders_{ym}.json"


def append_log(room_id: str, restaurant_name: str, order: dict) -> bool:
    try:
        path = _log_path()
        logs: list = []
        if path.exists():
            try:
                logs = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                logs = []
        logs.append({
            "timestamp": datetime.datetime.now().isoformat(),
            "room_id": room_id,
            "restaurant_name": restaurant_name,
            "order": order,
        })
        path.write_text(json.dumps(logs, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except Exception:
        return False


def load_logs(year_month: str | None = None) -> list:
    path = _log_path(year_month)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def available_months() -> list[str]:
    if not LOGS_DIR.exists():
        return []
    return sorted(
        [f.stem.replace("orders_", "") for f in LOGS_DIR.glob("orders_*.json")],
        reverse=True,
    )
