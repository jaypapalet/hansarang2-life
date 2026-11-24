"""Refresh the three Deungchon Station signs in a web-served directory.

python -m pip install playwright
python -m playwright install chromium
python vms-capture.py --output vms-live --watch
"""
import argparse
import base64
import json
import logging
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

TOPIS = "https://topis.seoul.go.kr/map/openVmsMap.do"
READY = """() => {
  const frames = Array.from(document.querySelectorAll('#popup-content canvas'));
  if (frames.length !== 3) return false;
  const bitmaps = frames.map(canvas => {
    if (canvas.width !== 192 || canvas.height !== 272) return null;
    const rgb = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < rgb.length; i += 4)
      if (rgb[i+3] > 100 && Math.max(rgb[i],rgb[i+1],rgb[i+2]) - Math.min(rgb[i],rgb[i+1],rgb[i+2]) > 80) colored++;
    return colored > 100 ? canvas.toDataURL('image/png') : null;
  });
  return bitmaps.every(Boolean) && new Set(bitmaps).size === 3 ? bitmaps : false;
}"""


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        try:
            temp.write(data)
            temp.flush()
            os.fsync(temp.fileno())
        except BaseException:
            temp.close()
            Path(temp.name).unlink(missing_ok=True)
            raise
    try:
        os.replace(temp.name, path)
    finally:
        Path(temp.name).unlink(missing_ok=True)


def capture(output):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 1024})
            page.goto(TOPIS, wait_until="domcontentloaded", timeout=30000)
            page.locator("#vmsName").fill("등촌역 앞")
            page.get_by_role("button", name="전광판정보 검색").click()
            page.get_by_role("link", name=re.compile(r"^등촌역 앞")).click()
            data = page.wait_for_function(READY, timeout=20000).json_value()
        finally:
            browser.close()
    captured = datetime.now(timezone.utc)
    epoch = int(captured.timestamp() * 1000)
    output.mkdir(parents=True, exist_ok=True)
    names = []
    for index, url in enumerate(data, start=1):
        content = base64.b64decode(url.split(",", 1)[1], validate=True)
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("TOPIS returned a non-PNG frame")
        name = f"vms-{epoch}-{index}.png"
        atomic_write(output / name, content)
        names.append(name)
    record = {"capturedAt": captured.isoformat(), "frames": names}
    atomic_write(output / "latest.json", json.dumps(record).encode())
    for old in output.glob("vms-*.png"):
        if re.fullmatch(r"vms-\d{13}-[123]\.png", old.name) and old.stat().st_mtime < time.time() - 86400:
            old.unlink(missing_ok=True)
    logging.info("Captured %s", record["capturedAt"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("vms-live"))
    parser.add_argument("--watch", action="store_true", help="Repeat every five minutes")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            capture(args.output)
        except Exception:
            if not args.watch:
                raise
            logging.exception("Refresh failed; preserving the last complete capture")
        if not args.watch:
            return
        time.sleep(300)


if __name__ == "__main__":
    main()
