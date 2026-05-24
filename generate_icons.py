"""
Smio PWA 아이콘 생성 스크립트
실행: python3 generate_icons.py
"""
import struct
import zlib
import os

def make_png(size):
    """PIL 없이 단색 PNG 생성 (파란색 배경 + 흰색 S)"""
    w, h = size, size

    # 배경: #1e293b (다크 네이비), 포그라운드: #60a5fa (파란색)
    bg = (30, 41, 59)       # #1e293b
    accent = (96, 165, 250)  # #60a5fa
    white = (255, 255, 255)

    # 픽셀 그리드 생성
    pixels = []
    for y in range(h):
        row = []
        for x in range(w):
            nx = x / w  # 0.0 ~ 1.0
            ny = y / h

            # 둥근 배경 (원형 마스크)
            cx, cy = 0.5, 0.5
            r = 0.45
            dist = ((nx - cx)**2 + (ny - cy)**2) ** 0.5

            if dist > r:
                row.append((255, 255, 255, 0))  # 투명
                continue

            # "S" 글자 픽셀 계산 (간단한 도형으로 표현)
            s = 0.55  # S 크기 비율
            lx = (nx - (1 - s) / 2) / s  # 0~1 로컬 좌표
            ly = (ny - (1 - s) / 2) / s

            pixel_color = bg

            if 0.0 <= lx <= 1.0 and 0.0 <= ly <= 1.0:
                # S자 구성: 위 막대, 가운데 막대, 아래 막대 + 좌우 연결
                bar_h = 0.12  # 가로 막대 두께
                bar_w = 0.12  # 세로 연결 두께
                gap = 0.08

                top_bar    = (0.1 <= ly <= 0.1 + bar_h) and (gap <= lx <= 1.0 - gap)
                mid_bar    = (0.44 <= ly <= 0.44 + bar_h) and (gap <= lx <= 1.0 - gap)
                bot_bar    = (0.78 <= ly <= 0.78 + bar_h) and (gap <= lx <= 1.0 - gap)
                top_left   = (0.1 <= ly <= 0.44 + bar_h) and (gap <= lx <= gap + bar_w)
                bot_right  = (0.44 <= ly <= 0.78 + bar_h) and (1.0 - gap - bar_w <= lx <= 1.0 - gap)

                if top_bar or mid_bar or bot_bar or top_left or bot_right:
                    pixel_color = accent

            row.append((*pixel_color, 255))
        pixels.append(row)

    # PNG 인코딩
    def pack_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)  # 8bit RGB — RGBA로 변경
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)  # 8bit RGBA

    # IDAT (이미지 데이터)
    raw = b''
    for row in pixels:
        raw += b'\x00'  # filter type
        for r, g, b, a in row:
            raw += bytes([r, g, b, a])

    idat_data = zlib.compress(raw, 9)

    png = (
        b'\x89PNG\r\n\x1a\n' +
        pack_chunk(b'IHDR', ihdr_data) +
        pack_chunk(b'IDAT', idat_data) +
        pack_chunk(b'IEND', b'')
    )
    return png


SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
out_dir = os.path.join(os.path.dirname(__file__), 'static', 'icons')
os.makedirs(out_dir, exist_ok=True)

for size in SIZES:
    path = os.path.join(out_dir, f'icon-{size}.png')
    data = make_png(size)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'생성 완료: icon-{size}.png ({len(data):,} bytes)')

print(f'\n✅ 아이콘 {len(SIZES)}개 생성 완료 → {out_dir}')
