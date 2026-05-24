FROM python:3.10-slim

# 시스템 패키지 업데이트 및 필수 패키지 설치
RUN apt-get update && \
    apt-get install -y \
    wget \
    unzip \
    curl \
    gnupg2 \
    chromium \
    chromium-driver \
    xvfb \
    procps \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Chrome/Chromium 실행 권한 설정
RUN chmod +x /usr/bin/chromium && \
    chmod +x /usr/bin/chromedriver

# 환경변수 설정
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV PYTHONPATH=/app
ENV DISPLAY=:99
ENV PYTHONUNBUFFERED=1
ENV STREAMLIT_SERVER_HEADLESS=true
ENV STREAMLIT_SERVER_ENABLE_CORS=false
ENV STREAMLIT_SERVER_ENABLE_XSRF_PROTECTION=false
# 서브도메인 방식으로 전환: baseUrlPath 사용 안 함

# 작업 디렉토리 설정
WORKDIR /app

# Python 의존성 파일 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 파일 복사
COPY . .

# nginx 설정 복사
COPY nginx.conf /etc/nginx/sites-enabled/default
RUN rm -f /etc/nginx/sites-enabled/default.bak

# 포트 노출
EXPOSE $PORT

# 헬스체크 추가 (포트 변수 처리 개선)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/_stcore/health || exit 1

# 실행 스크립트 생성
RUN echo '#!/bin/bash\n\
# Xvfb 시작\n\
Xvfb :99 -screen 0 1024x768x24 &\n\
sleep 2\n\
# Streamlit을 내부 포트 8501로 실행\n\
streamlit run smio_app.py --server.port=8501 --server.address=0.0.0.0 --server.headless=true &\n\
# nginx 시작 (외부 포트 8080 → 내부 8501 프록시)\n\
nginx -g "daemon off;"\n\
' > /app/start.sh && chmod +x /app/start.sh

# 실행 명령어
CMD ["/app/start.sh"] 