import streamlit as st
import pandas as pd
import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import time
import re
from selenium.webdriver.common.action_chains import ActionChains
import urllib.parse
import os
import sys
import json
import uuid
import hashlib
from pathlib import Path
import datetime

# --- 1. 방 ID 및 데이터 관리 함수 ---
def generate_room_id():
    """고유한 방 ID를 생성합니다."""
    return str(uuid.uuid4())[:8]

def get_room_data_path(room_id):
    """방 ID에 해당하는 데이터 파일 경로를 반환합니다."""
    rooms_dir = Path("rooms")
    rooms_dir.mkdir(exist_ok=True)
    return rooms_dir / f"{room_id}.json"

def save_room_data(room_id, data):
    """방 데이터를 파일에 저장합니다."""
    try:
        file_path = get_room_data_path(room_id)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"방 데이터 저장 오류: {e}")
        return False

def load_room_data(room_id):
    """방 데이터를 파일에서 불러옵니다."""
    try:
        file_path = get_room_data_path(room_id)
        if file_path.exists():
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"방 데이터 로드 오류: {e}")
        return None

def get_current_room_id():
    """현재 URL에서 방 ID를 가져옵니다."""
    query_params = st.query_params
    return query_params.get('room_id', None)

def _get_base_url():
    """배포 기본 URL을 환경변수에서 읽되, 잘못된 이전 값(railway 등)을 방어적으로 교정합니다."""
    env_base = os.environ.get("BASE_URL")
    if env_base is None or not str(env_base).strip():
        base = "https://smio.app.johnbae.co.kr"
    else:
        base = str(env_base).strip()
    # 예전 환경의 잔여(railway) 값이 들어오면 교정
    if "railway" in base.lower():
        base = "https://smio.app.johnbae.co.kr"
    return base

def create_room_url(room_id):
    """방 ID로 공유 가능한 URL을 생성합니다."""
    base_url = _get_base_url()
    return f"{base_url}?room_id={room_id}"

# --- 로그 관리 함수 ---
def get_log_file_path():
    """로그 파일 경로를 반환합니다."""
    logs_dir = Path("logs")
    logs_dir.mkdir(exist_ok=True)
    today = datetime.datetime.now().strftime("%Y-%m")
    return logs_dir / f"orders_{today}.json"

def save_order_log(room_id, restaurant_info, order_info):
    """주문 로그를 파일에 저장합니다."""
    try:
        now = datetime.datetime.now()
        restaurant_name = restaurant_info.get("name", "알 수 없는 음식점")
        
        log_entry = {
            "timestamp": now.isoformat(),
            "room_id": room_id,
            "restaurant": {
                "name": restaurant_name,
                "place_id": restaurant_info.get("place_id", ""),
                "address": restaurant_info.get("address", ""),
                "category": restaurant_info.get("category", "")
            },
            "order": {
                "user_name": order_info.get("name", ""),
                "menu": order_info.get("menu", ""),
                "quantity": order_info.get("quantity", 0),
                "price": order_info.get("price", 0),
                "beverage_option": order_info.get("beverage_option", ""),
                "special_request": order_info.get("special_request", "")
            },
            "session_info": {
                "user_agent": st.context.headers.get("User-Agent", "") if hasattr(st.context, 'headers') else "",
                "ip_hash": hashlib.md5(str(st.context.headers.get("X-Forwarded-For", "unknown")).encode()).hexdigest()[:8] if hasattr(st.context, 'headers') else ""
            }
        }
        
        log_file = get_log_file_path()
        
        # 기존 로그 읽기
        existing_logs = []
        if log_file.exists():
            with open(log_file, 'r', encoding='utf-8') as f:
                try:
                    existing_logs = json.load(f)
                except json.JSONDecodeError:
                    existing_logs = []
        
        # 새 로그 추가
        existing_logs.append(log_entry)
        
        # 로그 저장
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(existing_logs, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"로그 저장 오류: {e}")
        return False

def load_order_logs(year_month=None):
    """주문 로그를 불러옵니다."""
    try:
        if year_month:
            log_file = Path("logs") / f"orders_{year_month}.json"
        else:
            log_file = get_log_file_path()
        
        if log_file.exists():
            with open(log_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception as e:
        print(f"로그 로드 오류: {e}")
        return []

def get_available_log_months():
    """사용 가능한 로그 월 목록을 반환합니다."""
    try:
        logs_dir = Path("logs")
        if not logs_dir.exists():
            return []
        
        months = []
        for file in logs_dir.glob("orders_*.json"):
            month = file.stem.replace("orders_", "")
            months.append(month)
        
        return sorted(months, reverse=True)
    except Exception as e:
        print(f"로그 월 조회 오류: {e}")
        return []

def delete_log_entry(month, timestamp):
    """특정 로그 항목을 삭제합니다."""
    try:
        log_file = Path("logs") / f"orders_{month}.json"
        if not log_file.exists():
            return False
        
        with open(log_file, 'r', encoding='utf-8') as f:
            logs = json.load(f)
        
        # 해당 timestamp의 로그 제거
        logs = [log for log in logs if log['timestamp'] != timestamp]
        
        # 파일 다시 저장
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"로그 삭제 오류: {e}")
        return False

def delete_all_logs_for_month(month):
    """특정 월의 모든 로그를 삭제합니다."""
    try:
        log_file = Path("logs") / f"orders_{month}.json"
        if log_file.exists():
            log_file.unlink()
            return True
        return False
    except Exception as e:
        print(f"월별 로그 삭제 오류: {e}")
        return False

def delete_logs_by_room(month, room_id):
    """특정 방의 모든 로그를 삭제합니다."""
    try:
        log_file = Path("logs") / f"orders_{month}.json"
        if not log_file.exists():
            return False
        
        with open(log_file, 'r', encoding='utf-8') as f:
            logs = json.load(f)
        
        # 해당 room_id의 로그들 제거
        logs = [log for log in logs if log['room_id'] != room_id]
        
        # 파일 다시 저장
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"방별 로그 삭제 오류: {e}")
        return False

# --- 2. URL 추출 및 정규화 함수 ---
def extract_naver_url(text):
    """
    텍스트에서 네이버 플레이스 관련 URL을 추출합니다.
    """
    import re
    
    print(f"URL 추출 시도 - 입력 텍스트: {text}")
    
    # 다양한 URL 패턴으로 시도
    url_patterns = [
        r'https?://[^\s\n\r]+',  # 기본 URL 패턴
        r'https://naver\.me/[A-Za-z0-9]+',  # naver.me 특화
        r'https://map\.naver\.com/[^\s\n\r]+',  # map.naver.com
        r'https://m\.place\.naver\.com/[^\s\n\r]+',  # m.place.naver.com
        r'http://[^\s\n\r]+naver[^\s\n\r]+',  # 기타 naver 도메인
    ]
    
    found_urls = []
    
    # 모든 패턴으로 URL 찾기
    for pattern in url_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        found_urls.extend(matches)
    
    print(f"발견된 모든 URL: {found_urls}")
    
    # 네이버 관련 URL만 필터링
    naver_keywords = ['naver.me', 'map.naver.com', 'place.naver.com', 'm.place.naver.com', 'm.map.naver.com', 'pcmap.place.naver.com']
    
    for url in found_urls:
        for keyword in naver_keywords:
            if keyword in url.lower():
                # URL 정리 (끝의 불필요한 문자 제거)
                cleaned_url = re.sub(r'[^\w\-\./:=?&%#]+$', '', url)
                print(f"✅ 추출된 네이버 URL: {cleaned_url}")
                return cleaned_url
    
    # 마지막으로 텍스트에서 naver.me 패턴 직접 검색
    naver_me_pattern = r'naver\.me/[A-Za-z0-9]+'
    naver_me_match = re.search(naver_me_pattern, text, re.IGNORECASE)
    if naver_me_match:
        full_url = f"https://{naver_me_match.group(0)}"
        print(f"✅ naver.me 패턴으로 추출된 URL: {full_url}")
        return full_url
    
    print(f"❌ 텍스트에서 네이버 URL을 찾을 수 없음: {text}")
    return None

def normalize_naver_place_url(url_input):
    """
    네이버 플레이스 URL을 메뉴 페이지 URL로 정규화합니다.
    """
    import re
    import requests
    
    print(f"🔍 URL 정규화 시작 - 입력: {url_input}")
    
    # 먼저 텍스트에서 URL 추출
    extracted_url = extract_naver_url(url_input)
    if not extracted_url:
        print(f"❌ URL 추출 실패")
        return None
    
    url = extracted_url
    print(f"📝 추출된 URL: {url}")
    
    # 네이버 공유 링크인 경우 리다이렉트 처리
    if 'naver.me' in url:
        try:
            print(f"🔗 네이버 공유 링크 감지: {url}")
            response = requests.head(url, allow_redirects=True, timeout=15)
            final_url = response.url
            print(f"➡️ 리다이렉트된 URL: {final_url}")
            url = final_url
        except Exception as e:
            print(f"❌ 리다이렉트 처리 오류: {e}")
            # 리다이렉트 실패해도 원본 URL로 계속 시도
            pass
    
    # URL에서 place ID 추출 (다양한 패턴 시도)
    place_id_patterns = [
        r'place/(\d+)',           # 기본 패턴
        r'restaurant/(\d+)',      # restaurant 패턴  
        r'entry/place/(\d+)',     # entry/place 패턴
        r'/(\d+)/?(?:\?|$)',      # URL 끝의 숫자 패턴
    ]
    
    place_id = None
    for pattern in place_id_patterns:
        match = re.search(pattern, url)
        if match:
            place_id = match.group(1)
            print(f"✅ Place ID 추출 성공: {place_id} (패턴: {pattern})")
            break
    
    if not place_id:
        print(f"❌ Place ID 추출 실패 - URL: {url}")
        return None
    
    # 이미 모바일 메뉴 URL인 경우
    if 'm.place.naver.com' in url and '/menu/' in url:
        print(f"✅ 이미 모바일 메뉴 URL: {url}")
        return url
    
    # 네이버 맵 URL을 모바일 메뉴 URL로 변환
    mobile_menu_url = f"https://m.place.naver.com/restaurant/{place_id}/menu/list?entry=plt"
    print(f"🎯 최종 변환된 URL: {mobile_menu_url}")
    return mobile_menu_url

# --- 3. 음료 판단 함수 ---
def is_beverage(menu_name):
    """
    메뉴 이름이 음료인지 판단합니다.
    """
    beverage_keywords = [
        '커피', '아메리카노', '라떼', '카페', '에스프레소', '모카', '카푸치노', '마끼아또',
        '차', '녹차', '홍차', '우롱차', '보리차', '쌍화차', '감잎차', '모과차',
        '주스', '스무디', '에이드', '레몬에이드', '라임에이드', '오렌지에이드',
        '콜라', '사이다', '환타', '스프라이트', '펩시', '코카콜라',
        '우유', '딸기우유', '초코우유', '바나나우유',
        '쉐이크', '밀크쉐이크', '딸기쉐이크', '초코쉐이크',
        '에스프레소', '아이스', '핫', '따뜻한', '차가운',
        '음료', '드링크', '베버리지'
    ]
    
    menu_lower = menu_name.lower()
    return any(keyword in menu_lower for keyword in beverage_keywords)

# --- 4. Chrome WebDriver 설정 함수 ---
def setup_chrome_driver():
    """
    속도 최적화된 Chrome WebDriver를 설정합니다.
    """
    options = webdriver.ChromeOptions()

    # 봇 감지 우회 (네이버는 navigator.webdriver 노출 시 콘텐츠 차단)
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option('excludeSwitches', ['enable-automation'])
    options.add_experimental_option('useAutomationExtension', False)

    # 필수 옵션
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-plugins')
    options.add_argument('--disable-images')
    options.add_argument('--disable-logging')
    options.add_argument('--log-level=3')
    options.add_argument('--silent')
    options.add_argument('--window-size=1280,720')
    options.add_argument('user-agent=Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')

    # 속도 최적화
    options.add_argument('--disable-background-timer-throttling')
    options.add_argument('--disable-renderer-backgrounding')
    options.add_argument('--disable-backgrounding-occluded-windows')
    options.add_argument('--disable-features=TranslateUI')
    options.add_argument('--disable-background-networking')
    options.add_argument('--disable-sync')
    options.add_argument('--disable-default-apps')
    options.add_argument('--memory-pressure-off')
    
    # 단순화된 환경 감지 및 Chrome 설정
    is_cloud = (os.environ.get('STREAMLIT_SERVER_PORT') is not None or 
                os.environ.get('PORT') is not None)
    
    try:
        if is_cloud:
            # 클라우드 환경에서 Chrome 바이너리 경로 설정
            chrome_paths = [
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable'
            ]
            
            chrome_found = False
            for path in chrome_paths:
                if os.path.exists(path):
                    options.binary_location = path
                    chrome_found = True
                    break
            
            if not chrome_found:
                print("Chrome 바이너리를 찾을 수 없음")
                return None
            
            # ChromeDriver 경로 설정
            chromedriver_paths = [
                '/usr/bin/chromedriver',
                '/usr/bin/chromium-chromedriver',
                '/usr/local/bin/chromedriver'
            ]
            
            service = None
            for path in chromedriver_paths:
                if os.path.exists(path):
                    service = Service(path)
                    break
            
            if not service:
                try:
                    service = Service(ChromeDriverManager().install())
                except Exception as e:
                    print(f"webdriver-manager 실패: {e}")
                    return None
        else:
            # 로컬 환경에서는 기본 설정 사용
            service = Service(ChromeDriverManager().install())
        
        driver = webdriver.Chrome(service=service, options=options)
        
        # 짧은 타임아웃 설정으로 속도 향상
        driver.set_page_load_timeout(15)  # 30초에서 15초로 단축
        driver.implicitly_wait(5)  # 10초에서 5초로 단축
        
        return driver
        
    except Exception as e:
        print(f"Chrome WebDriver 설정 오류: {e}")
        return None

# --- 5. 웹 스크래핑 기능: 네이버 플레이스에서 정보 가져오기 ---
@st.cache_data(ttl=3600)  # 1시간 캐시
def scrape_restaurant_info(url):
    """
    주어진 네이버 플레이스 URL에서 가게 이름, 메뉴, 주차 정보를 스크래핑합니다.
    m.place.naver.com 모바�� URL 직접 접근 - iframe 불필요
    """
    driver = None
    try:
        driver = setup_chrome_driver()
        if not driver:
            return {"error": "WebDriver 설정에 실패했습니다."}

        # place_id 추출 (홈 탭 URL 직접 이동에 사용)
        place_id = None
        place_id_match = re.search(r'/(?:restaurant|place)/(\d+)', url)
        if place_id_match:
            place_id = place_id_match.group(1)

        # navigator.webdriver 숨기기 (봇 감지 우회)
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        })

        # 1단계: 메뉴 페이지 직접 로드
        print(f"메뉴 URL 접속: {url}")
        driver.get(url)

        # iframe 없음 - 메뉴 항목 또는 탭 등장까지 대기 (최대 10초)
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR,
                    "li.E2jtL, div.place_section_content, a[role='tab']"))
            )
        except:
            time.sleep(2)

        # 더보기 버튼 클릭
        print("더보기 버튼 클릭 시작...")
        click_count = 0
        max_clicks = 5

        while click_count < max_clicks:
            more_menu_btn = None
            try:
                more_buttons = driver.find_elements(By.CSS_SELECTOR, "span.TeItc")
                for btn in more_buttons:
                    if "더보기" in btn.text:
                        more_menu_btn = btn
                        break
            except:
                pass

            if not more_menu_btn:
                print("더보기 버튼 없음 - 메뉴 로드 완료")
                break

            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", more_menu_btn)
                time.sleep(0.2)
                more_menu_btn.click()
                time.sleep(0.4)
                click_count += 1
            except Exception as e:
                print(f"더보기 버튼 클릭 실패: {e}")
                break

        # 메뉴 정보 추출
        print("메뉴 정보 추출 시작...")
        current_page_source = driver.page_source
        menu_soup = BeautifulSoup(current_page_source, "html.parser")

        menu_items = menu_soup.select("div.place_section_content ul > li.E2jtL")
        print(f"발견된 메뉴 항목 수: {len(menu_items)}")

        menu_list = []
        processed_menus = set()

        for item in menu_items:
            menu_name = None
            name_selectors = [
                "span.lPzHi",
                "div.yQlqY span",
                "span[class*='name']",
                "div[class*='name'] span",
                "span[class*='title']",
                "div[class*='title'] span",
                "h3", "h4", "h5",
                "div.MXkFw span",
                "div.meDTN span"
            ]
            for selector in name_selectors:
                name_tag = item.select_one(selector)
                if name_tag and name_tag.text.strip():
                    menu_name = name_tag.text.strip()
                    break

            if not menu_name:
                continue

            price = None
            price_selectors = [
                "div.GXS1X em",
                "div.GXS1X",
                "em",
                "span[class*='price']",
                "div[class*='price']"
            ]
            for selector in price_selectors:
                price_tag = item.select_one(selector)
                if price_tag:
                    price_text = re.sub(r'[^0-9]', '', price_tag.text)
                    if price_text:
                        try:
                            price = int(price_text)
                            break
                        except ValueError:
                            continue

            menu_key = f"{menu_name}_{price}"
            if menu_key not in processed_menus:
                processed_menus.add(menu_key)
                menu_list.append({"name": menu_name, "price": price})

        # 2단계: 홈 페이지 ���접 URL 이동 (탭 클릭 + sleep(2) 대신)
        print("홈 페이지 직접 이동...")
        address = None
        phone = None
        restaurant_name = None
        restaurant_type = None
        rating = None
        review_visitor = None
        review_blog = None
        short_desc = None
        parking_info = "주차 정보 없음"

        home_url = None
        if place_id:
            home_url = f"https://m.place.naver.com/restaurant/{place_id}/home"

        if home_url:
            try:
                driver.get(home_url)
                # 가게 이름 또는 주소 등장까지 대기 (최대 8초)
                try:
                    WebDriverWait(driver, 8).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR,
                            "span.GHAhO, span.LDgIH, h1, h2"))
                    )
                except:
                    time.sleep(1)

                home_soup = BeautifulSoup(driver.page_source, "html.parser")

                address_tag = home_soup.select_one("span.LDgIH")
                if address_tag:
                    address = address_tag.get_text(strip=True)

                phone_tag = home_soup.select_one("span.xlx7Q")
                if phone_tag:
                    phone = phone_tag.get_text(strip=True)

                name_selectors = [
                    "div.zD5Nm div.LylZZ.v8v5j span.GHAhO",
                    "span.GHAhO",
                    "h1", "h2",
                    ".restaurant_title", ".place_name",
                    "[data-type='title']", ".title", ".name",
                    "div[class*='title'] span", "div[class*='name'] span",
                    "span[class*='title']", "span[class*='name']",
                    ".GHAhO"
                ]
                for selector in name_selectors:
                    try:
                        name_tag = home_soup.select_one(selector)
                        if name_tag and name_tag.text.strip():
                            restaurant_name = name_tag.text.strip()
                            print(f"✅ 가게이름 발견: {restaurant_name} (셀렉터: {selector})")
                            break
                    except:
                        continue

                type_tag = home_soup.select_one("div.zD5Nm div.LylZZ.v8v5j span.lnJFt")
                if type_tag:
                    restaurant_type = type_tag.text.strip()

            except Exception as e:
                print(f"홈 페이지 정보 추출 오류: {e}")

        return {
            "name": restaurant_name or "가게 이름 정보 없음",
            "type": restaurant_type,
            "rating": rating,
            "review_visitor": review_visitor,
            "review_blog": review_blog,
            "short_desc": short_desc,
            "address": address or "주소 정보 없음",
            "phone": phone or "전화번호 정보 없음",
            "menu": menu_list,
            "parking": parking_info
        }

    except Exception as e:
        print(f"스크래핑 오류 발생: {e}")
        import traceback
        print(f"상세 오류 정보: {traceback.format_exc()}")

        if "invalid session id" in str(e):
            return {"error": "브라우저 세션이 만료되었습니다. 다시 시도해주세요."}
        elif "ChromeDriver를 찾을 수 없습니다" in str(e):
            return {"error": "브라우저 드라이버를 찾을 수 없습니다. 잠시 후 다시 시도해주세요."}
        elif "timeout" in str(e).lower():
            return {"error": "페이지 로딩 시간이 초과되었습니다. 네트워크 상태를 확인하고 다시 시도해주세요."}
        else:
            return {"error": f"스크래핑 중 오류가 발생했습니다: {str(e)}"}

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

# --- 5. Streamlit UI 구성 ---

# 페이지 기본 설정 - 모바일 최적화
st.set_page_config(
    page_title="Smio | 스마트 팀 주문",
    page_icon="🍽️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- 모바일 최적화 CSS 스타일링 ---
st.markdown("""
<style>
    /* 모바일 우선 반응형 디자인 */
    .stApp {
        background: #f8fafc;
    }
    
    /* 모바일 뷰포트 설정 */
    @viewport {
        width: device-width;
        initial-scale: 1.0;
        maximum-scale: 1.0;
        user-scalable: no;
    }
    
    /* 메인 컨테이너 - 모바일 최적화 */
    .main-container {
        background: white;
        border-radius: 8px;
        padding: 1rem;
        margin: 0.5rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        border: 1px solid #e2e8f0;
    }
    
    /* 헤더 스타일 - 모바일 최적화 */
    .main-header {
        text-align: center;
        padding: 2rem 1rem;
        background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
        border-radius: 8px;
        color: white;
        margin-bottom: 1rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .main-title {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: #60a5fa;
    }
    
    .main-subtitle {
        font-size: 1rem;
        opacity: 0.9;
        font-weight: 400;
        color: #cbd5e1;
        line-height: 1.4;
    }
    
    /* 카드 스타일 - 모바일 터치 최적화 */
    .feature-card {
        background: white;
        border-radius: 8px;
        padding: 1.25rem;
        margin: 0.75rem 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        border: 1px solid #e2e8f0;
        border-left: 3px solid #3b82f6;
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: rgba(59, 130, 246, 0.1);
    }
    
    .feature-card:active {
        transform: scale(0.98);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
    
    /* 주문 카드 - 모바일 최적화 */
    .order-card {
        background: #1e293b;
        border-radius: 8px;
        padding: 1.25rem;
        margin: 0.75rem 0;
        color: white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .status-card {
        background: #0f172a;
        border-radius: 8px;
        padding: 1.25rem;
        margin: 0.75rem 0;
        color: white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    /* 레스토랑 정보 - 모바일 최적화 */
    .restaurant-info {
        background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
        border-radius: 8px;
        padding: 1.5rem;
        color: white;
        margin: 0.75rem 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .restaurant-name {
        font-size: 1.5rem;
        font-weight: bold;
        margin-bottom: 1rem;
        color: #e2e8f0;
        line-height: 1.3;
    }
    
    .restaurant-detail {
        display: flex;
        align-items: flex-start;
        margin: 0.75rem 0;
        font-size: 0.9rem;
        line-height: 1.4;
    }
    
    .restaurant-detail strong {
        display: block;
        margin-bottom: 0.25rem;
    }
    
    /* 주문 아이템 - 터치 최적화 */
    .order-item {
        background: white;
        border-radius: 6px;
        padding: 1rem;
        margin: 0.5rem 0;
        border: 1px solid #e2e8f0;
        border-left: 3px solid #3b82f6;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: rgba(59, 130, 246, 0.1);
        min-height: 44px; /* 최소 터치 영역 */
    }
    
    .order-item:active {
        transform: scale(0.98);
        background: #f8fafc;
    }
    
    .order-name {
        font-weight: 600;
        color: #1e293b;
        font-size: 1rem;
        margin-bottom: 0.25rem;
    }
    
    .order-details {
        color: #64748b;
        font-size: 0.85rem;
        line-height: 1.3;
    }
    
    /* 메트릭 카드 - 모바일 최적화 */
    .metric-card {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        border-radius: 8px;
        padding: 1.25rem;
        text-align: center;
        color: white;
        margin: 0.75rem 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .metric-value {
        font-size: 2rem;
        font-weight: bold;
        margin-bottom: 0.25rem;
        line-height: 1.2;
    }
    
    .metric-label {
        font-size: 0.9rem;
        opacity: 0.9;
    }
    
    /* 최종 주문서 */
    .final-order {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        border-radius: 8px;
        padding: 1.5rem;
        color: white;
        margin: 1rem 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .final-order h3 {
        margin-bottom: 1rem;
        font-size: 1.3rem;
        font-weight: 600;
    }
    
    /* 버튼 스타일 - 터치 최적화 */
    .stButton > button {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 1rem 1.5rem;
        font-weight: 600;
        font-size: 0.95rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
        min-height: 44px; /* 최소 터치 영역 */
        -webkit-tap-highlight-color: rgba(59, 130, 246, 0.3);
    }
    
    .stButton > button:hover {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
    }
    
    .stButton > button:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
    
    /* 입력 필드 - 모바일 키보드 최적화 */
    .stTextInput > div > div > input {
        border-radius: 6px;
        border: 2px solid #d1d5db;
        padding: 1rem;
        font-size: 16px; /* iOS 줌 방지 */
        transition: border-color 0.2s ease;
        background: white;
        min-height: 44px; /* 최소 터치 영역 */
        -webkit-appearance: none;
    }
    
    .stTextInput > div > div > input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        outline: none;
    }
    
    /* 선택 박스 - 터치 최적화 */
    .stSelectbox > div > div > select {
        border-radius: 6px;
        border: 2px solid #d1d5db;
        background: white;
        padding: 1rem;
        font-size: 16px; /* iOS 줌 방지 */
        min-height: 44px; /* 최소 터치 영역 */
        -webkit-appearance: none;
    }
    
    /* 숫자 입력 */
    .stNumberInput > div > div > input {
        border-radius: 6px;
        border: 2px solid #d1d5db;
        background: white;
        padding: 1rem;
        font-size: 16px; /* iOS 줌 방지 */
        min-height: 44px; /* 최소 터치 영역 */
    }
    
    /* 폼 스타일 */
    .stForm {
        border: none;
        background: transparent;
    }
    
    /* 확장 가능한 섹션 */
    .streamlit-expanderHeader {
        font-size: 1rem;
        font-weight: 600;
        color: #1e293b;
        padding: 1rem;
        background: #f8fafc;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
        min-height: 44px; /* 최소 터치 영역 */
    }
    
    /* 데이터프레임 모바일 최적화 */
    .stDataFrame {
        border-radius: 6px;
        overflow-x: auto;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        max-width: 100%;
    }
    
    .stDataFrame table {
        font-size: 0.85rem;
    }
    
    /* 스크롤바 스타일 */
    ::-webkit-scrollbar {
        width: 4px;
        height: 4px;
    }
    
    ::-webkit-scrollbar-track {
        background: #f1f5f9;
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb {
        background: #94a3b8;
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
        background: #64748b;
    }
    
    /* 모바일 전용 스타일 */
    @media (max-width: 768px) {
        .main-title {
            font-size: 2rem;
        }
        
        .main-container {
            margin: 0.25rem;
            padding: 0.75rem;
        }
        
        .restaurant-info {
            padding: 1rem;
        }
        
        .restaurant-name {
            font-size: 1.25rem;
        }
        
        .metric-value {
            font-size: 1.75rem;
        }
        
        /* 컬럼 간격 조정 */
        .block-container {
            padding-left: 1rem;
            padding-right: 1rem;
        }
        
        /* 그리드 레이아웃을 모바일에서 단일 컬럼으로 */
        .restaurant-info > div {
            display: block !important;
        }
        
        .restaurant-detail {
            margin: 1rem 0;
            padding: 0.75rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
        }
    }
    
    /* 초소형 화면 (320px 이하) */
    @media (max-width: 320px) {
        .main-title {
            font-size: 1.75rem;
        }
        
        .main-subtitle {
            font-size: 0.9rem;
        }
        
        .metric-value {
            font-size: 1.5rem;
        }
        
        .order-item, .feature-card {
            padding: 0.75rem;
        }
    }
    
    /* 터치 제스처 최적화 */
    * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }
    
    input, textarea, select {
        -webkit-user-select: text;
        -khtml-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
    }
    
    /* iOS Safari 스타일 초기화 */
    input[type="text"], 
    input[type="number"], 
    select, 
    textarea {
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        border-radius: 6px;
    }
    
    /* 모바일 키보드로 인한 뷰포트 변경 대응 */
    .stApp {
        min-height: 100vh;
        position: relative;
    }
    
    /* 안전 영역 고려 (iPhone X 이상) */
    @supports(padding: max(0px)) {
        .main-container {
            padding-left: max(1rem, env(safe-area-inset-left));
            padding-right: max(1rem, env(safe-area-inset-right));
        }
    }
</style>
""", unsafe_allow_html=True)

# --- 6. 세션 상태 및 방 관리 ---
def initialize_session_state():
    """세션 상태를 안전하게 초기화합니다."""
    # 현재 방 ID 확인
    current_room_id = get_current_room_id()
    
    if 'current_room_id' not in st.session_state:
        st.session_state.current_room_id = current_room_id
    
    # 즐겨찾기 자동 URL 처리
    auto_url = st.query_params.get('auto_url', None)
    if auto_url and not st.session_state.get('url_processed', False):
        try:
            normalized_url = normalize_naver_place_url(auto_url)
            if normalized_url:
                restaurant_data = scrape_restaurant_info(normalized_url)
                if restaurant_data and restaurant_data.get("menu"):
                    # 방 ID 생성 및 데이터 저장
                    room_id = generate_room_id()
                    st.session_state.current_room_id = room_id
                    st.session_state.restaurant_info = restaurant_data
                    st.session_state.url_processed = True
                    st.session_state.orders = []
                    
                    # 방 데이터 저장
                    sync_room_data()
                    
                    # URL 업데이트
                    st.query_params["room_id"] = room_id
                    if "auto_url" in st.query_params:
                        del st.query_params["auto_url"]
        except:
            pass  # 실패해도 계속 진행
    
    # 방 ID가 URL에 있는 경우 해당 방 데이터 로드
    if current_room_id:
        room_data = load_room_data(current_room_id)
        if room_data:
            st.session_state.url_processed = True
            st.session_state.restaurant_info = room_data.get('restaurant_info')
            st.session_state.orders = room_data.get('orders', [])
            st.session_state.current_room_id = current_room_id
        else:
            # 방 ID가 있지만 데이터가 없는 경우
            st.session_state.url_processed = False
            st.session_state.restaurant_info = None
            st.session_state.orders = []
    else:
        # 방 ID가 없는 경우 (새로운 방 생성)
        if 'url_processed' not in st.session_state:
            st.session_state.url_processed = False
        if 'restaurant_info' not in st.session_state:
            st.session_state.restaurant_info = None
        if 'orders' not in st.session_state:
            st.session_state.orders = []
    
    if 'error_message' not in st.session_state:
        st.session_state.error_message = None

def sync_room_data():
    """현재 세션 데이터를 방 파일에 동기화합니다."""
    if st.session_state.get('current_room_id') and st.session_state.get('url_processed'):
        room_data = {
            'restaurant_info': st.session_state.restaurant_info,
            'orders': st.session_state.orders,
            'created_at': time.time()
        }
        save_room_data(st.session_state.current_room_id, room_data)

# 세션 상태 초기화 실행
initialize_session_state()

# --- 페이지 1: 랜딩 페이지 (URL 입력 전) ---
if not st.session_state.url_processed:
    
    # 메인 헤더 (관리자 아이콘 포함)
    header_col1, header_col2 = st.columns([10, 1])
    
    with header_col1:
        st.markdown("""
        <div class="main-header">
            <div class="main-title" style="font-size: 4.5rem; font-weight: 700;">🍽️ SMIO</div>
            <div class="main-subtitle" style="font-size: 1.8rem; font-weight: 500; margin-top: 0.5rem;">가장 스마트한 팀 주문 경험!</div>
            <div style="margin-top: 1rem; font-size: 1rem; color: #cbd5e1; opacity: 0.9; line-height: 1.4;">스미오(Smio)는 '스마트 미리 오더'의 준말로, 복잡한 팀 주문을 미리 해결하는 가장 현명한 방법입니다.</div>
            <div style="margin-top: 1.5rem; font-size: 0.8rem; color: #cbd5e1; opacity: 0.8;">
                Made by John
                <span style="margin-left: 10px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.3);">v1.1.0 (2026.03.28 업데이트)</span>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    with header_col2:
        # 숨겨진 관리자 아이콘 (우측 상단)
        st.markdown("""
        <div style="text-align: right; padding-top: 1rem;">
            <div style="position: relative;">
        """, unsafe_allow_html=True)
        
        if st.button("⚙️ 관리자 모드", help="관리자", key="admin_icon", use_container_width=False):
            st.session_state.show_admin_login = True
        
        st.markdown("</div></div>", unsafe_allow_html=True)
    
    # 관리자 로그인 (간단한 방식)
    if st.session_state.get('show_admin_login'):
        st.markdown("---")
        
        # 간단한 로그인 박스
        with st.container():
            st.markdown("""
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 2rem; border-radius: 12px; margin: 1rem 0; text-align: center; color: white;">
                <h3 style="margin-bottom: 1rem; color: white;">🔐 관리자 로그인</h3>
                <p style="margin-bottom: 1.5rem; opacity: 0.9;">관리자 권한이 필요합니다</p>
            </div>
            """, unsafe_allow_html=True)
            
            with st.form("admin_login_form", clear_on_submit=True):
                password = st.text_input("🔑 비밀번호", type="password", placeholder="관리자 비밀번호를 입력하세요")
                
                col1, col2, col3 = st.columns([1, 1, 1])
                with col1:
                    pass
                with col2:
                    login_clicked = st.form_submit_button("🔓 로그인", use_container_width=True, type="primary")
                with col3:
                    cancel_clicked = st.form_submit_button("❌ 취소", use_container_width=True)
                
                if login_clicked:
                    if password == "1625":
                        st.session_state.admin_authenticated = True
                        st.session_state.show_admin_login = False
                        st.session_state.admin_mode = True
                        st.balloons()
                        st.success("✅ 관리자 로그인 성공! 잠시만 기다려주세요...")
                        st.rerun()
                    else:
                        st.error("❌ 비밀번호가 틀렸습니다.")
                
                if cancel_clicked:
                    st.session_state.show_admin_login = False
                    st.rerun()
        
        st.markdown("---")
    
    # 소개 섹션 - 모바일에서는 단일 컬럼
    if st.container():
        # 데스크톱에서는 2컬럼, 모바일에서는 1컬럼
        is_mobile = st.sidebar.checkbox("모바일 뷰", value=False) # 실제로는 화면 크기로 자동 감지
        
        if True:  # 항상 모바일 친화적으로 표시
            st.markdown("""
            <div class="feature-card">
                <div style="font-size: 2rem; margin-bottom: 1rem;">🚀</div>
                <h3 style="color: #1e293b; margin-bottom: 1rem;">혁신적인 팀 주문 경험</h3>
                <p style="color: #64748b; line-height: 1.6;">
                    점심시간마다 반복되는 복잡한 주문 과정을 혁신적으로 개선했습니다. 
                    더 이상 한 사람이 모든 주문을 받아 정리할 필요가 없어요.
                </p>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown("""
            <div class="feature-card">
                <div style="font-size: 2rem; margin-bottom: 1rem;">⚡</div>
                <h3 style="color: #1e293b; margin-bottom: 1rem;">실시간 투명한 주문 관리</h3>
                <p style="color: #64748b; line-height: 1.6;">
                    누가 무엇을 주문했는지 실시간으로 확인하고, 
                    자동으로 계산되는 총액과 개인별 금액으로 정산 걱정도 끝.
                </p>
            </div>
            """, unsafe_allow_html=True)
            
            st.markdown("""
            <div class="feature-card" style="background: #1e293b; color: white; border-left: 3px solid #3b82f6;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">✨</div>
                <h3 style="margin-bottom: 1rem; color: #e2e8f0;">핵심 기능</h3>
                <div style="margin: 1rem 0;">
                    <strong style="color: #e2e8f0;">🔗 원클릭 주문방 개설</strong><br>
                    <small style="color: #cbd5e1;">네이버 플레이스 URL만 붙여넣으면 끝</small>
                </div>
                <div style="margin: 1rem 0;">
                    <strong style="color: #e2e8f0;">📱 실시간 주문 현황</strong><br>
                    <small style="color: #cbd5e1;">팀원들의 주문을 실시간으로 확인</small>
                </div>
                <div style="margin: 1rem 0;">
                    <strong style="color: #e2e8f0;">💰 자동 정산 시스템</strong><br>
                    <small style="color: #cbd5e1;">복잡한 계산은 자동으로 처리</small>
                </div>
            </div>
            """, unsafe_allow_html=True)
    
    # 사용법 안내 섹션
    st.markdown("""
    <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 1.5rem; border-radius: 12px; margin: 2rem 0; border: 1px solid #e2e8f0;">
        <h3 style="color: #1e293b; margin-bottom: 1rem; font-size: 1.3rem; text-align: center;">📱 네이버 지도/앱에서 URL 복사하는 방법</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
            <div style="background: white; padding: 1rem; border-radius: 8px; border: 1px solid #cbd5e1;">
                <h4 style="color: #3b82f6; margin-bottom: 0.5rem; font-size: 1rem;">🗺️ 네이버 지도 앱</h4>
                <ol style="color: #64748b; font-size: 0.9rem; line-height: 1.5; margin: 0; padding-left: 1.2rem;">
                    <li>음식점 검색 후 선택</li>
                    <li>우측 상단 <strong>'공유'</strong> 버튼 클릭</li>
                    <li><strong>'링크 복사'</strong> 선택</li>
                    <li>아래에 붙여넣기</li>
                </ol>
            </div>
            <div style="background: white; padding: 1rem; border-radius: 8px; border: 1px solid #cbd5e1;">
                <h4 style="color: #10b981; margin-bottom: 0.5rem; font-size: 1rem;">📱 네이버 앱</h4>
                <ol style="color: #64748b; font-size: 0.9rem; line-height: 1.5; margin: 0; padding-left: 1.2rem;">
                    <li>음식점 검색 후 선택</li>
                    <li>가게명 옆 <strong>'공유'</strong> 아이콘 클릭</li>
                    <li><strong>'링크 복사'</strong> 선택</li>
                    <li>아래에 붙여넣기</li>
                </ol>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # URL 입력 섹션
    st.markdown("""
    <div style="text-align: center; margin: 2rem 0 1.5rem 0;">
        <h2 style="color: #1e293b; margin-bottom: 0.75rem; font-size: 1.5rem;">🎯 지금 바로 시작해보세요!</h2>
        <p style="color: #64748b; font-size: 1rem; line-height: 1.4;">네이버 플레이스 URL이나 음식점 정보를 입력하고 스마트한 팀 주문을 경험해보세요</p>
    </div>
    """, unsafe_allow_html=True)
    
    # URL 입력 폼 - 스타일 개선
    st.markdown("""
    <style>
    .stTextArea > div > div > textarea {
        background-color: #f8fafc !important;
        border: 2px solid #e2e8f0 !important;
        border-radius: 8px !important;
        color: #1e293b !important;
        font-size: 14px !important;
        padding: 12px !important;
    }
    .stTextArea > div > div > textarea:focus {
        border-color: #3b82f6 !important;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
    }
    .stTextArea > div > div > textarea::placeholder {
        color: #94a3b8 !important;
        font-style: italic !important;
    }
    </style>
    """, unsafe_allow_html=True)
    
    with st.container():
        url_input = st.text_area(
            "네이버 플레이스 URL 또는 음식점 정보를 입력하세요", 
            placeholder="여기에 붙여넣어주세요\n\n• https://naver.me/FMAxDFTM\n• 드링킹랩 경기 화성시 왕배산1길 8-12 101호 https://naver.me/Fhf8xhoB\n• @https://naver.me/xP84E4Lr",
            label_visibility="collapsed",
            key="url_input",
            help="네이버 지도나 플레이스 링크를 붙여넣으세요. 음식점 이름, 주소가 함께 있어도 됩니다.",
            height=100
        )
        
        # 모바일에서는 전체 너비로 버튼 표시
        if st.button("🚀 주문방 만들기", type="primary", use_container_width=True):
            if not url_input:
                st.warning("⚠️ URL을 입력해주세요.")
            else:
                with st.spinner("🔍 가게 정보를 불러오는 중입니다... (최대 1분 소요)"):
                    try:
                        normalized_url = normalize_naver_place_url(url_input)
                        if not normalized_url:
                            st.error("❌ 입력하신 내용에서 네이버 플레이스 URL을 찾을 수 없습니다.")
                            st.info("💡 **사용 가능한 URL 형식:**\n- naver.me 단축링크\n- map.naver.com 일반 링크\n- m.place.naver.com 모바일 링크\n\n텍스트 중에 URL이 포함되어 있으면 자동으로 찾아줍니다!")
                        else:
                            restaurant_data = scrape_restaurant_info(normalized_url)
                            
                            if restaurant_data and "error" in restaurant_data:
                                st.error(f"❌ {restaurant_data['error']}")
                            elif restaurant_data and restaurant_data.get("menu"):
                                # 방 ID 생성 및 데이터 저장
                                room_id = generate_room_id()
                                st.session_state.current_room_id = room_id
                                st.session_state.restaurant_info = restaurant_data
                                st.session_state.url_processed = True
                                st.session_state.orders = []
                                st.session_state.error_message = None
                                
                                # 방 데이터 저장
                                sync_room_data()
                                
                                st.success("✅ 주문방이 성공적으로 생성되었습니다!")
                                
                                # URL 업데이트
                                st.query_params["room_id"] = room_id
                                time.sleep(1)
                                st.rerun()
                            else:
                                st.error("❌ 메뉴 정보를 가져오는 데 실패했습니다. URL을 확인하시거나 다른 가게를 시도해주세요.")
                                
                    except Exception as e:
                        print(f"예상치 못한 오류: {e}")
                        st.error("❌ 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    
    # 즐겨찾기 섹션
    st.markdown("""
    <div style="margin-top: 2rem;">
        <h3 style="color: #1e293b; margin-bottom: 1rem; font-size: 1.3rem; text-align: center;">⭐ 근처 인기 맛집 바로가기</h3>
        <p style="color: #64748b; font-size: 0.9rem; text-align: center; margin-bottom: 1.5rem;">클릭하면 해당 가게로 바로 주문방이 생성됩니다</p>
    </div>
    """, unsafe_allow_html=True)
    
    # 즐겨찾기 버튼들을 2열로 배치
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("☕ 매머드커피", use_container_width=True, type="secondary"):
            st.session_state.url_input_value = "https://naver.me/FjbWj0iM"
            st.query_params["auto_url"] = "https://naver.me/FjbWj0iM"
            st.rerun()
        
        if st.button("🍲 다락골 소머리국밥", use_container_width=True, type="secondary"):
            st.session_state.url_input_value = "https://naver.me/5qDj8gcj"
            st.query_params["auto_url"] = "https://naver.me/5qDj8gcj"
            st.rerun()
    
    with col2:
        if st.button("🥘 중화요리 삼국지", use_container_width=True, type="secondary"):
            st.session_state.url_input_value = "https://naver.me/GFByqJEd"
            st.query_params["auto_url"] = "https://naver.me/GFByqJEd"
            st.rerun()
        
        if st.button("🍜 선비 칼국수", use_container_width=True, type="secondary"):
            st.session_state.url_input_value = "https://naver.me/GDamQwXw"
            st.query_params["auto_url"] = "https://naver.me/GDamQwXw"
            st.rerun()

# --- 페이지 2: 주문 및 현황 페이지 (URL 입력 후) ---
if st.session_state.url_processed:
    info = st.session_state.restaurant_info
    
    # 에러 체크
    if "error" in info:
        st.error(f"❌ {info['error']}")
        if st.button("🔄 새로운 주문방 만들기", use_container_width=True):
            st.session_state.url_processed = False
            st.session_state.restaurant_info = None
            st.session_state.orders = []
            st.rerun()
        st.stop()
    
    # 실시간 업데이트를 위한 자동 새로고침
    if st.session_state.get('current_room_id'):
        # 방 데이터 다시 로드하여 실시간 업데이트
        room_data = load_room_data(st.session_state.current_room_id)
        if room_data:
            st.session_state.orders = room_data.get('orders', [])
        
        # 10초마다 자동 새로고침
        time.sleep(0.1)  # 너무 빠른 새로고침 방지
        st.markdown("""
        <script>
        setTimeout(function() {
            window.parent.location.reload();
        }, 10000);
        </script>
        """, unsafe_allow_html=True)
    
    # 방 공유 링크 표시
    if st.session_state.get('current_room_id'):
        current_url = create_room_url(st.session_state.current_room_id)
        
        # 공유 링크 헤더
        st.markdown("""
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 1rem 1rem 0.5rem 1rem; border-radius: 8px 8px 0 0; margin-bottom: 0; text-align: center;">
            <div style="color: white; font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">🔗 주문방 공유 링크</div>
        </div>
        """, unsafe_allow_html=True)
        
        # URL 표시 및 복사 버튼을 같은 행에 배치
        col1, col2 = st.columns([4, 1])
        
        with col1:
            st.text_input(
                label="주문방 URL",
                value=current_url,
                key="share_url",
                label_visibility="collapsed",
                disabled=True,
                help="URL을 선택하고 Ctrl+C로 복사하세요"
            )
        
        with col2:
            # JavaScript 클립보드 복사 기능이 포함된 버튼
            copy_button_html = f"""
            <div style="margin-top: 0px;">
                <button onclick="copyToClipboard()" 
                        style="background: #10b981; color: white; border: none; 
                               padding: 8px 12px; border-radius: 6px; cursor: pointer; 
                               font-size: 14px; font-weight: 500; width: 100%; height: 40px;
                               transition: background-color 0.2s;"
                        onmouseover="this.style.backgroundColor='#059669'"
                        onmouseout="this.style.backgroundColor='#10b981'">
                    📋 복사
                </button>
            </div>
            
            <script>
                function copyToClipboard() {{
                    const url = "{current_url}";
                    
                    // 최신 Clipboard API 시도
                    if (navigator.clipboard && navigator.clipboard.writeText) {{
                        navigator.clipboard.writeText(url).then(function() {{
                            showCopySuccess();
                        }}).catch(function(err) {{
                            console.log('Clipboard API 실패:', err);
                            fallbackCopy(url);
                        }});
                    }} else {{
                        // Fallback 방법
                        fallbackCopy(url);
                    }}
                }}
                
                function fallbackCopy(text) {{
                    // 임시 텍스트 영역 생성
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-999999px";
                    textArea.style.top = "-999999px";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    try {{
                        const result = document.execCommand('copy');
                        if (result) {{
                            showCopySuccess();
                        }} else {{
                            showCopyError();
                        }}
                    }} catch (err) {{
                        console.log('복사 실패:', err);
                        showCopyError();
                    }} finally {{
                        document.body.removeChild(textArea);
                    }}
                }}
                
                function showCopySuccess() {{
                    // 성공 메시지 표시
                    const button = event.target;
                    const originalText = button.innerHTML;
                    button.innerHTML = "✅ 복사됨!";
                    button.style.backgroundColor = "#059669";
                    setTimeout(() => {{
                        button.innerHTML = originalText;
                        button.style.backgroundColor = "#10b981";
                    }}, 2000);
                }}
                
                function showCopyError() {{
                    // 실패 메시지 표시
                    const button = event.target;
                    const originalText = button.innerHTML;
                    button.innerHTML = "❌ 실패";
                    button.style.backgroundColor = "#dc2626";
                    setTimeout(() => {{
                        button.innerHTML = originalText;
                        button.style.backgroundColor = "#10b981";
                    }}, 2000);
                    
                    // 수동 복사 안내
                    alert("자동 복사가 실패했습니다.\\n위의 URL을 선택하고 Ctrl+C로 복사해주세요.");
                }}
            </script>
            """
            
            st.components.v1.html(copy_button_html, height=50)
        
        # 안내 메시지
        st.markdown("""
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 0.5rem 1rem 1rem 1rem; border-radius: 0 0 8px 8px; margin-top: 0; text-align: center;">
            <div style="color: rgba(255,255,255,0.9); font-size: 0.85rem; line-height: 1.4;">
                📋 <strong>복사 방법:</strong> '📋 복사' 버튼 클릭 또는 URL 박스 클릭 → Ctrl+A → Ctrl+C<br>
                💫 실시간 업데이트: 10초마다 자동으로 새로고침됩니다<br>
                👥 이 링크를 공유하면 다른 사람들이 같은 주문방에 접속할 수 있습니다
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    # 레스토랑 정보 헤더
    st.markdown(f"""
    <div class="restaurant-info">
        <div class="restaurant-name">🍽️ {info.get('name', '가게 이름 정보 없음')}</div>
        <div>
            <div class="restaurant-detail">
                <span style="margin-right: 0.75rem;">📍</span>
                <div>
                    <strong>주소</strong><br>
                    <span style="font-size: 0.85rem; line-height: 1.3;">{info.get('address', '정보 없음')}</span>
                </div>
            </div>
            <div class="restaurant-detail">
                <span style="margin-right: 0.75rem;">📞</span>
                <div>
                    <strong>전화번호</strong><br>
                    <span style="font-size: 0.85rem;">{info.get('phone', '정보 없음')}</span>
                </div>
            </div>
            <div class="restaurant-detail">
                <span style="margin-right: 0.75rem;">🚗</span>
                <div>
                    <strong>주차정보</strong><br>
                    <span style="font-size: 0.85rem;">{info.get('parking', '정보 없음')}</span>
                </div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # 메인 주문 섹션 - 모바일에서는 세로 배치
    col1, col2 = st.columns([1, 1], gap="medium")
    
    with col1:
        st.markdown("""
        <div class="order-card">
            <h3 style="margin-bottom: 1rem; font-size: 1.2rem;">✍️ 메뉴 담기</h3>
        </div>
        """, unsafe_allow_html=True)
        
        if not info.get("menu"):
            st.warning("⚠️ 메뉴 정보를 불러올 수 없습니다. 다른 식당을 시도해보세요.")
        else:
            with st.form("order_form", clear_on_submit=True):
                menu_names = []
                for item in info["menu"]:
                    price_str = f"{item['price']:,}원" if item.get('price') is not None else "가격 정보 없음"
                    menu_names.append(f"{item['name']} ({price_str})")
                
                participant_name = st.text_input(
                    "👤 주문자 이름", 
                    key="participant_name_input",
                    placeholder="이름을 입력하세요"
                )
                
                selected_menu_str = st.selectbox(
                    "🍽️ 메뉴 선택", 
                    menu_names,
                    help="메뉴를 선택해주세요"
                )
                
                quantity = st.number_input(
                    "📊 수량", 
                    min_value=1, 
                    value=1,
                    help="주문할 수량을 입력하세요"
                )
                
                if selected_menu_str in menu_names:
                    selected_index = menu_names.index(selected_menu_str)
                    selected_menu_info = info["menu"][selected_index]
                    selected_menu_name = selected_menu_info["name"]
                    
                    beverage_options = None
                    special_request = None
                    if is_beverage(selected_menu_name):
                        beverage_options = st.selectbox(
                            "🧊 음료 옵션", 
                            ["(선택)", "Hot", "Ice"], 
                            key="beverage_options",
                            help="음료 온도를 선택하세요"
                        )
                        special_request = st.text_input(
                            "📝 특별 요청사항", 
                            placeholder="예: 샷 추가, 시럽 1번만", 
                            key="special_request",
                            help="특별한 요청사항이 있으면 입력하세요"
                        )
                    
                    submitted = st.form_submit_button(
                        "🛒 주문 추가하기", 
                        type="primary", 
                        use_container_width=True
                    )

                    if submitted:
                        if not participant_name.strip():
                            st.warning("⚠️ 주문자 이름을 입력해주세요!")
                        else:
                            price = selected_menu_info.get("price", 0) or 0
                            order_info = {
                                "name": participant_name.strip(),
                                "menu": selected_menu_name,
                                "quantity": quantity,
                                "price": price * quantity,
                                "beverage_option": beverage_options if beverage_options and beverage_options != "(선택)" else None,
                                "special_request": special_request.strip() if special_request else None
                            }
                            st.session_state.orders.append(order_info)
                            
                            # 방 데이터 동기화
                            sync_room_data()
                            
                            # 주문 로그 저장
                            if st.session_state.get('current_room_id') and st.session_state.get('restaurant_info'):
                                save_order_log(
                                    st.session_state.current_room_id,
                                    st.session_state.restaurant_info,
                                    order_info
                                )
                            
                            st.success(f"✅ {participant_name.strip()}님의 주문이 추가되었습니다!")
                            time.sleep(1)
                            st.rerun()
    
    with col2:
        st.markdown("""
        <div class="status-card">
            <h3 style="margin-bottom: 1rem; font-size: 1.2rem;">📊 실시간 주문 현황</h3>
        </div>
        """, unsafe_allow_html=True)
        
        if not st.session_state.orders:
            st.markdown("""
            <div style="text-align: center; padding: 1.5rem; background: white; border-radius: 8px; margin: 0.75rem 0; border: 1px solid #e2e8f0;">
                <div style="font-size: 3rem; margin-bottom: 0.75rem;">🛒</div>
                <h4 style="color: #64748b; font-size: 1rem;">아직 주문이 없습니다</h4>
                <p style="color: #94a3b8; font-size: 0.9rem;">왼쪽에서 메뉴를 담아주세요!</p>
            </div>
            """, unsafe_allow_html=True)
        else:
            orders_df = pd.DataFrame(st.session_state.orders)
            total_price = orders_df['price'].sum()
            
            # 총액 표시
            st.markdown(f"""
            <div class="metric-card">
                <div class="metric-value">{total_price:,.0f}원</div>
                <div class="metric-label">현재 총 주문 금액</div>
            </div>
            """, unsafe_allow_html=True)
            
            # 주문 목록
            st.markdown("**📋 주문 목록**")
            for i, order in enumerate(st.session_state.orders):
                details = []
                if order.get('beverage_option'):
                    details.append(order['beverage_option'])
                if order.get('special_request'):
                    details.append(f"요청: {order['special_request']}")
                
                details_text = f"<br><small style='color: #94a3b8;'>{' / '.join(details)}</small>" if details else ""
                
                st.markdown(f"""
                <div class="order-item">
                    <div class="order-name">{order['name']}</div>
                    <div class="order-details">{order['menu']} × {order['quantity']}개 | {order['price']:,}원{details_text}</div>
                </div>
                """, unsafe_allow_html=True)
            
            # 주문 관리
            with st.expander("🔧 주문 수정/삭제"):
                if st.session_state.orders:
                    def format_order_for_deletion(i):
                        order = st.session_state.orders[i]
                        return f"{i+1}. {order['name']} - {order['menu']} ({order['quantity']}개)"
                    
                    order_to_delete_index = st.selectbox(
                        "삭제할 주문을 선택하세요", 
                        options=range(len(st.session_state.orders)),
                        format_func=format_order_for_deletion,
                        index=None,
                        placeholder="삭제할 주문 선택"
                    )
                    
                    if st.button("🗑️ 선택한 주문 삭제", use_container_width=True):
                        if order_to_delete_index is not None:
                            deleted_order = st.session_state.orders.pop(order_to_delete_index)
                            
                            # 방 데이터 동기화
                            sync_room_data()
                            
                            st.success(f"✅ {deleted_order['name']}님의 주문이 삭제되었습니다!")
                            time.sleep(1)
                            st.rerun()
                        else:
                            st.warning("⚠️ 삭제할 주문을 먼저 선택해주세요.")
    
    # 최종 주문서
    if st.session_state.orders:
        with st.expander("📋 최종 주문서 보기 (주문 총무용)", expanded=False):
            orders_df = pd.DataFrame(st.session_state.orders)
            
            st.markdown("""
            <div class="final-order">
                <h3>✅ 최종 주문서</h3>
            </div>
            """, unsafe_allow_html=True)
            
            # 메뉴별 요약
            st.markdown("### 🧮 메뉴별 주문 합계")
            
            # Hot/Ice 옵션을 메뉴명에 결합 (그룹화 용도)
            def get_display_menu(row):
                result = row['menu']
                if 'beverage_option' in row and pd.notna(row['beverage_option']) and str(row['beverage_option']).strip() not in ["", "(선택)", "None"]:
                    result += f" ({row['beverage_option']})"
                return result
                
            orders_df['display_menu'] = orders_df.apply(get_display_menu, axis=1)
            
            menu_summary = orders_df.groupby("display_menu").agg(
                총_수량=('quantity', 'sum'),
                주문자=('name', lambda x: ', '.join(x.unique()))
            ).reset_index()
            # 컬럼 이름을 화면 표출용으로 원복
            menu_summary.rename(columns={'display_menu': '메뉴'}, inplace=True)
            
            st.dataframe(
                menu_summary, 
                use_container_width=True,
                hide_index=True
            )
            
            # 개인별 상세 내역
            st.markdown("### 🧑‍💻 개인별 상세 내역")
            person_summary = orders_df.groupby("name").agg(총액=('price', 'sum')).reset_index()
            
            for _, row in person_summary.iterrows():
                with st.container():
                    st.markdown(f"""
                    <div class="order-item">
                        <div class="order-name">{row['name']}</div>
                        <div class="order-details">총 주문 금액: {row['총액']:,}원</div>
                    </div>
                    """, unsafe_allow_html=True)
                    
                    person_orders = orders_df[orders_df['name'] == row['name']]
                    for _, p_order in person_orders.iterrows():
                        details = []
                        if 'beverage_option' in p_order and pd.notna(p_order['beverage_option']):
                            details.append(p_order['beverage_option'])
                        if 'special_request' in p_order and pd.notna(p_order['special_request']):
                            details.append(f"요청: {p_order['special_request']}")
                        
                        details_text = f"<br><small style='color: #94a3b8;'>{' / '.join(details)}</small>" if details else ""
                        
                        st.markdown(f"""
                        <div style="margin-left: 1rem; color: #64748b; margin-bottom: 0.5rem; padding: 0.5rem; background: #f8fafc; border-radius: 4px; font-size: 0.9rem;">
                            • {p_order['menu']}: {p_order['quantity']}개 ({p_order['price']:,}원){details_text}
                        </div>
                        """, unsafe_allow_html=True)
            
            # 최종 합계 및 수량
            grand_total = orders_df['price'].sum()
            total_quantity = orders_df['quantity'].sum()
            
            st.markdown(f"""
            <div class="final-order" style="text-align: center; margin-top: 1.5rem; background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                <h2 style="margin: 0; color: white; font-size: 1.5rem;">
                    📊 총 수량: {total_quantity}개 &nbsp;|&nbsp; 💰 총 합계: {grand_total:,}원
                </h2>
            </div>
            """, unsafe_allow_html=True)
    
    # 새로운 주문방 만들기
    st.markdown("<br>", unsafe_allow_html=True)
    if st.button("🔄 새로운 주문방 만들기", use_container_width=True):
        st.session_state.url_processed = False
        st.session_state.restaurant_info = None
        st.session_state.orders = []
        st.session_state.current_room_id = None
        
        # URL에서 room_id 제거
        if "room_id" in st.query_params:
            del st.query_params["room_id"]
        
        st.rerun()

# --- 관리자 페이지 함수 ---
def show_admin_page():
    """관리자 페이지를 표시합니다."""
    st.title("🔐 SMIO 관리자 페이지")
    
    # 인증된 관리자 페이지 헤더
    col1, col2 = st.columns([3, 1])
    with col1:
        st.write("### 📊 주문 로그 조회 및 관리")
    with col2:
        if st.button("🚪 로그아웃"):
            st.session_state.admin_authenticated = False
            st.session_state.admin_mode = False
            st.session_state.show_admin_login = False
            st.success("✅ 로그아웃되었습니다.")
            st.rerun()
    
    # 월별 로그 선택
    available_months = get_available_log_months()
    if not available_months:
        st.info("📭 아직 기록된 로그가 없습니다.")
        return
    
    selected_month = st.selectbox(
        "📅 조회할 월 선택", 
        available_months,
        format_func=lambda x: f"{x[:4]}년 {x[5:]}월"
    )
    
    # 로그 불러오기
    logs = load_order_logs(selected_month)
    
    if not logs:
        st.info(f"📭 {selected_month}에 기록된 로그가 없습니다.")
        return
    
    # 필터링 옵션
    st.write("### 🔍 필터링 옵션")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        # 음식점별 필터
        restaurants = list(set([log['restaurant']['name'] for log in logs]))
        selected_restaurant = st.selectbox("🏪 음식점 선택", ["전체"] + restaurants)
    
    with col2:
        # 사용자별 필터
        users = list(set([log['order']['user_name'] for log in logs if log['order']['user_name']]))
        selected_user = st.selectbox("👤 사용자 선택", ["전체"] + users)
    
    with col3:
        # 방별 필터 (방 ID로 표시)
        rooms = list(set([log['room_id'] for log in logs]))
        selected_room = st.selectbox("🏠 방 ID 선택", ["전체"] + [f"{room[:8]}" for room in rooms])
    
    # 로그 필터링
    filtered_logs = logs
    if selected_restaurant != "전체":
        filtered_logs = [log for log in filtered_logs if log['restaurant']['name'] == selected_restaurant]
    if selected_user != "전체":
        filtered_logs = [log for log in filtered_logs if log['order']['user_name'] == selected_user]
    if selected_room != "전체":
        # room_id로 필터링 (앞 8자리로 비교)
        filtered_logs = [log for log in filtered_logs if log['room_id'][:8] == selected_room]
    
    # 통계 정보
    st.write("### 📈 통계 정보")
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("총 주문 수", len(filtered_logs))
    with col2:
        total_amount = sum([log['order']['price'] for log in filtered_logs])
        st.metric("총 주문 금액", f"{total_amount:,}원")
    with col3:
        unique_users = len(set([log['order']['user_name'] for log in filtered_logs if log['order']['user_name']]))
        st.metric("사용자 수", f"{unique_users}명")
    with col4:
        unique_rooms = len(set([log['room_id'] for log in filtered_logs]))
        st.metric("방 개수", f"{unique_rooms}개")
    
    # 로그 삭제 기능
    st.write("### 🗑️ 로그 관리")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        if st.button("⚠️ 선택한 월 전체 삭제", use_container_width=True):
            if st.session_state.get('confirm_delete_month') != selected_month:
                st.session_state.confirm_delete_month = selected_month
                st.warning(f"⚠️ {selected_month} 월의 모든 로그가 삭제됩니다. 다시 클릭하여 확인하세요.")
            else:
                if delete_all_logs_for_month(selected_month):
                    st.success(f"✅ {selected_month} 월 로그가 모두 삭제되었습니다.")
                    st.session_state.confirm_delete_month = None
                    st.rerun()
                else:
                    st.error("❌ 삭제 실패")
    
    with col2:
        if selected_room != "전체" and st.button("🏠 선택한 방 로그 삭제", use_container_width=True):
            # 실제 room_id 찾기
            actual_room_id = None
            for log in logs:
                if log['room_id'][:8] == selected_room:
                    actual_room_id = log['room_id']
                    break
            
            if actual_room_id and delete_logs_by_room(selected_month, actual_room_id):
                st.success(f"✅ 방 {selected_room}의 로그가 삭제되었습니다.")
                st.rerun()
            else:
                st.error("❌ 삭제 실패")
    
    with col3:
        if st.button("🔄 새로고침", use_container_width=True):
            st.rerun()

    # 로그 테이블 표시
    st.write("### 📋 주문 내역")
    
    if filtered_logs:
        # 개별 삭제 기능이 포함된 테이블
        for i, log in enumerate(filtered_logs):
            with st.container():
                col1, col2 = st.columns([4, 1])
                with col1:
                    timestamp = datetime.datetime.fromisoformat(log['timestamp']).strftime("%m-%d %H:%M")
                    st.markdown(f"""
                    <div style="background: white; padding: 1rem; margin: 0.5rem 0; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.5rem;">
                            {timestamp} | {log['restaurant']['name']} | 방ID: {log['room_id'][:8]}
                        </div>
                        <div style="color: #64748b;">
                            👤 {log['order']['user_name']} | 🍽️ {log['order']['menu']}{f" ({log['order']['beverage_option']})" if log['order'].get('beverage_option') else ""} | 
                            📊 {log['order']['quantity']}개 | 💰 {log['order']['price']:,}원
                        </div>
                        {f"<div style='color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem;'>💬 {log['order']['special_request']}</div>" if log['order']['special_request'] else ""}
                    </div>
                    """, unsafe_allow_html=True)
                
                with col2:
                    if st.button("🗑️", key=f"delete_{i}", help="이 주문 삭제"):
                        if delete_log_entry(selected_month, log['timestamp']):
                            st.success("✅ 삭제됨")
                            st.rerun()
                        else:
                            st.error("❌ 실패")
        
        # 데이터프레임으로도 표시 (다운로드용)
        st.write("### 📊 표 형태 보기")
        df_data = []
        for log in filtered_logs:
            df_data.append({
                "시간": datetime.datetime.fromisoformat(log['timestamp']).strftime("%m-%d %H:%M"),
                "음식점": log['restaurant']['name'],
                "방ID": log['room_id'][:8],
                "주문자": log['order']['user_name'],
                "메뉴": log['order']['menu'],
                "수량": log['order']['quantity'],
                "금액": f"{log['order']['price']:,}원",
                "옵션": log['order']['beverage_option'] or "",
                "요청사항": log['order']['special_request'] or ""
            })
        
        df = pd.DataFrame(df_data)
        st.dataframe(df, use_container_width=True, hide_index=True)
        
        # CSV 다운로드
        csv = df.to_csv(index=False, encoding='utf-8-sig')
        
        # 파일명 생성 (필터 조건 반영)
        filename_parts = [f"smio_orders_{selected_month}"]
        if selected_restaurant != "전체":
            filename_parts.append(selected_restaurant.replace("/", "_"))
        if selected_room != "전체":
            filename_parts.append(f"room_{selected_room}")
        
        filename = "_".join(filename_parts) + ".csv"
        
        st.download_button(
            label="📥 CSV 다운로드",
            data=csv,
            file_name=filename,
            mime="text/csv"
        )
    else:
        st.info("📭 선택한 조건에 맞는 로그가 없습니다.")

# 관리자 페이지 체크 (세션 기반)
if st.session_state.get('admin_mode') and st.session_state.get('admin_authenticated'):
    show_admin_page()
    st.stop()

# 세션 상태 초기화 및 방 데이터 동기화
initialize_session_state()
sync_room_data()