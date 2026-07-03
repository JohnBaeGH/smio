import re
import json
import time
from urllib.parse import urlparse

# short URL → normalized URL 캐시 (프로세스 재시작 전까지 유지)
_url_cache: dict = {}

# 서버가 대신 fetch해도 되는 호스트 (SSRF 방지 — 반드시 hostname 기준으로 검사)
_ALLOWED_HOSTS = ("naver.me", "naver.com")


def _is_allowed_host(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in _ALLOWED_HOSTS)


def is_beverage(menu_name: str) -> bool:
    keywords = [
        "커피", "아메리카노", "라떼", "카페", "에스프레소", "모카", "카푸치노",
        "마끼아또", "차", "녹차", "홍차", "우롱차", "보리차", "주스", "스무디",
        "에이드", "레몬에이드", "콜라", "사이다", "환타", "우유", "쉐이크",
        "음료", "드링크", "베버리지", "아이스티", "밀크티",
    ]
    return any(kw in menu_name.lower() for kw in keywords)


def extract_naver_url(text: str) -> str | None:
    patterns = [
        r"https?://[^\s\n\r]+",
        r"https://naver\.me/[A-Za-z0-9]+",
        r"https://map\.naver\.com/[^\s\n\r]+",
        r"https://m\.place\.naver\.com/[^\s\n\r]+",
    ]
    found = []
    for p in patterns:
        found.extend(re.findall(p, text, re.IGNORECASE))
    for url in found:
        cleaned = re.sub(r"[^\w\-\./:=?&%#]+$", "", url)
        # 부분 문자열 매칭이 아니라 실제 hostname으로 검사 (evil.com/?x=place.naver.com 차단)
        if _is_allowed_host(cleaned):
            return cleaned

    m = re.search(r"naver\.me/[A-Za-z0-9]+", text, re.IGNORECASE)
    return f"https://{m.group(0)}" if m else None


def normalize_url(url_input: str) -> str | None:
    import requests as req_lib

    short_url = extract_naver_url(url_input)
    if not short_url:
        return None

    # short URL 캐시 확인
    if short_url in _url_cache:
        return _url_cache[short_url]

    url = short_url
    if (urlparse(url).hostname or "").lower() == "naver.me":
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
            r = req_lib.get(url, allow_redirects=True, timeout=15, headers=headers)
            # 리다이렉트 결과도 네이버 도메인일 때만 신뢰
            if _is_allowed_host(r.url):
                url = r.url
        except Exception:
            pass

    result = None
    for pattern in [
        r"place/(\d+)", r"restaurant/(\d+)",
        r"entry/place/(\d+)", r"/(\d+)/?(?:\?|$)",
    ]:
        m = re.search(pattern, url)
        if m:
            place_id = m.group(1)
            host = (urlparse(url).hostname or "").lower()
            if host == "m.place.naver.com" and "/menu/" in url:
                result = url
            else:
                result = f"https://m.place.naver.com/restaurant/{place_id}/menu/list?entry=plt"
            break

    if not result:
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        for key in ("id", "pinId"):
            if key in qs:
                place_id = qs[key][0]
                if place_id.isdigit():
                    result = f"https://m.place.naver.com/restaurant/{place_id}/menu/list?entry=plt"
                    break

    if result:
        _url_cache[short_url] = result
    return result


_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://m.place.naver.com/",
}


def _parse_apollo_state(src: str) -> tuple[list, dict]:
    """HTML 소스에서 __APOLLO_STATE__ 파싱 → (menu_list, place_info)"""
    idx = src.find("__APOLLO_STATE__ = ")
    if idx < 0:
        return [], {}

    end = src.find(";\n", idx)
    if end < 0:
        end = src.find("</script>", idx)
    if end < 0:
        return [], {}

    try:
        state = json.loads(src[idx + len("__APOLLO_STATE__ = "):end])
    except Exception:
        return [], {}

    # 메뉴 추출 (Menu:PLACEID_INDEX 형태)
    seen: set = set()
    menu_list: list = []
    for key in sorted(state.keys()):
        if not key.startswith("Menu:"):
            continue
        item = state[key]
        name = item.get("name", "")
        if not name:
            continue
        price_raw = str(item.get("price", "") or "")
        digits = re.sub(r"[^0-9]", "", price_raw)
        price = int(digits) if digits else 0
        k = f"{name}_{price}"
        if k not in seen:
            seen.add(k)
            menu_list.append({"name": name, "price": price, "is_beverage": is_beverage(name)})

    # 식당 기본 정보 (roadAddress 필드가 있는 첫 번째 객체)
    place_info: dict = {}
    for v in state.values():
        if isinstance(v, dict) and v.get("roadAddress") or v.get("address"):
            place_info = v
            break
    if not place_info:
        for v in state.values():
            if isinstance(v, dict) and v.get("name") and v.get("category"):
                place_info = v
                break

    return menu_list, place_info


def _fetch_page(menu_url: str) -> str | None:
    import requests as req_lib

    try:
        r = req_lib.get(menu_url, headers=_HEADERS, timeout=15, allow_redirects=True)
        if r.status_code != 200:
            return None
        src = r.content.decode("utf-8")
        # 차단 페이지 감지 (6KB 미만이면 정상 페이지 아님)
        if len(src) < 10_000 or "서비스 이용이 제한" in src:
            return None
        return src
    except Exception:
        return None


# 캐시: {normalized_url: (timestamp, result)} — 메뉴·가격 변동 반영을 위해 TTL 적용
_cache: dict = {}
_CACHE_TTL = 6 * 3600  # 6시간
_CACHE_MAX = 500


def scrape(url_input: str) -> dict:
    menu_url = normalize_url(url_input)
    if not menu_url or not _is_allowed_host(menu_url):
        return {"error": "유효한 네이버 플레이스 URL이 아닙니다."}

    cached = _cache.get(menu_url)
    if cached and time.time() - cached[0] < _CACHE_TTL:
        return cached[1]

    src = _fetch_page(menu_url)
    if not src:
        return {"error": "페이지를 불러올 수 없습니다. 잠시 후 다시 시도해주세요."}

    menu_list, place_info = _parse_apollo_state(src)

    if not menu_list:
        return {"error": "메뉴 정보를 찾을 수 없습니다."}

    # og:title fallback for restaurant name
    name = place_info.get("name", "")
    if not name:
        m = re.search(r'property="og:title" content="([^"]+) : 네이버"', src)
        name = m.group(1).strip() if m else "이름 없음"

    result = {
        "source_url": menu_url,
        "name": name,
        "address": place_info.get("roadAddress") or place_info.get("address") or "",
        "phone": place_info.get("phone") or place_info.get("tel") or "",
        "category": place_info.get("category") or "",
        "menu": menu_list,
    }
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[menu_url] = (time.time(), result)
    return result
