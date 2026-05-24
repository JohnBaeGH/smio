import os
import re
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager


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
    naver_keywords = [
        "naver.me", "map.naver.com", "place.naver.com",
        "m.place.naver.com", "m.map.naver.com", "pcmap.place.naver.com",
    ]
    found = []
    for p in patterns:
        found.extend(re.findall(p, text, re.IGNORECASE))
    for url in found:
        if any(kw in url.lower() for kw in naver_keywords):
            return re.sub(r"[^\w\-\./:=?&%#]+$", "", url)

    m = re.search(r"naver\.me/[A-Za-z0-9]+", text, re.IGNORECASE)
    return f"https://{m.group(0)}" if m else None


def normalize_url(url_input: str) -> str | None:
    import requests as req_lib

    url = extract_naver_url(url_input)
    if not url:
        return None

    if "naver.me" in url:
        try:
            r = req_lib.head(url, allow_redirects=True, timeout=15)
            url = r.url
        except Exception:
            pass

    for pattern in [
        r"place/(\d+)", r"restaurant/(\d+)",
        r"entry/place/(\d+)", r"/(\d+)/?(?:\?|$)",
    ]:
        m = re.search(pattern, url)
        if m:
            place_id = m.group(1)
            if "m.place.naver.com" in url and "/menu/" in url:
                return url
            return f"https://m.place.naver.com/restaurant/{place_id}/menu/list?entry=plt"
    return None


def _build_driver() -> webdriver.Chrome | None:
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-images")
    options.add_argument("--window-size=1280,720")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Linux; Android 13; Pixel 7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    )

    chrome_paths = [
        "/usr/bin/chromium-browser", "/usr/bin/chromium",
        "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    ]
    driver_paths = [
        "/usr/bin/chromedriver", "/usr/bin/chromium-chromedriver",
        "/usr/local/bin/chromedriver",
    ]

    for p in chrome_paths:
        if os.path.exists(p):
            options.binary_location = p
            break

    service = None
    for p in driver_paths:
        if os.path.exists(p):
            service = Service(p)
            break
    if not service:
        try:
            service = Service(ChromeDriverManager().install())
        except Exception:
            return None

    try:
        driver = webdriver.Chrome(service=service, options=options)
        driver.set_page_load_timeout(20)
        driver.implicitly_wait(5)
        return driver
    except Exception:
        return None


# 캐시: {normalized_url: result}
_cache: dict = {}


def scrape(url_input: str) -> dict:
    menu_url = normalize_url(url_input)
    if not menu_url:
        return {"error": "유효한 네이버 플레이스 URL이 아닙니다."}

    if menu_url in _cache:
        return _cache[menu_url]

    driver = _build_driver()
    if not driver:
        return {"error": "브라우저 드라이버를 시작할 수 없습니다."}

    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"},
        )
        driver.get(menu_url)

        for _ in range(24):
            time.sleep(0.5)
            if '"Menu:' in driver.page_source:
                break
        src = driver.page_source

        # 메뉴 파싱
        menu_list = []
        seen = set()
        for name, price_str in re.findall(
            r'"Menu:\d+_\d+":\{[^}]*?"name":"([^"]+)"[^}]*?"price":"([^"]*)"', src
        ):
            if not name:
                continue
            price = None
            digits = re.sub(r"[^0-9]", "", price_str)
            if digits:
                try:
                    price = int(digits)
                except ValueError:
                    pass
            key = f"{name}_{price}"
            if key not in seen:
                seen.add(key)
                menu_list.append({
                    "name": name,
                    "price": price or 0,
                    "is_beverage": is_beverage(name),
                })

        # 식당 기본 정보
        name_m = re.search(r'"name":"([^"]+)","businessCategory"', src) or \
                 re.search(r'"placeName":"([^"]+)"', src)
        addr_m = re.search(r'"roadAddress":"([^"]+)"', src) or \
                 re.search(r'"address":"([^"]+)"', src)
        phone_m = re.search(r'"phone":"([^"]+)"', src) or \
                  re.search(r'"tel":"([^"]+)"', src)
        cat_m   = re.search(r'"businessCategory":"([^"]+)"', src) or \
                  re.search(r'"category":"([^"]+)"', src)

        result = {
            "name": (name_m.group(1).strip() if name_m else "이름 없음"),
            "address": (addr_m.group(1) if addr_m else ""),
            "phone": (phone_m.group(1) if phone_m else ""),
            "category": (cat_m.group(1) if cat_m else ""),
            "menu": menu_list,
        }
        _cache[menu_url] = result
        return result

    except Exception as e:
        return {"error": f"스크래핑 오류: {e}"}
    finally:
        try:
            driver.quit()
        except Exception:
            pass
