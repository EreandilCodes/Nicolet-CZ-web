#!/usr/bin/env python3
"""
Brute-force same-domain crawler / mirror for nicoletcz.cz

What it does:
- crawls only URLs on nicoletcz.cz
- downloads HTML pages and same-domain assets
- extracts links from HTML and CSS
- stores files into a local mirror directory

Requirements:
    pip install requests beautifulsoup4

Usage:
    python scripts/mirror_nicolet.py

Optional:
    python scripts/mirror_nicolet.py https://nicoletcz.cz/ ./OldWebData
"""

from __future__ import annotations

import hashlib
import os
import queue
import re
import sys
import threading
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import (
    unquote,
    urljoin,
    urlparse,
    urlunparse,
)

import requests
from bs4 import BeautifulSoup

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------

START_URL     = "https://nicoletcz.cz/"
# Output relative to script location (project root/OldWebData)
_SCRIPT_DIR   = Path(__file__).resolve().parent.parent
OUTPUT_DIR    = _SCRIPT_DIR / "OldWebData"
ALLOWED_DOMAIN = "nicoletcz.cz"

USER_AGENT      = "Mozilla/5.0 (compatible; NicoletMirror/1.0; +local archival script)"
REQUEST_TIMEOUT = 30
REQUEST_DELAY   = 0.3          # seconds between requests per worker
MAX_WORKERS     = 4            # conservative to avoid throttling
MAX_URLS        = 200_000      # emergency ceiling

KEEP_QUERY = True

SKIP_SCHEMES = {"mailto", "tel", "javascript", "data"}

ASSET_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff",
    ".css", ".js", ".mjs", ".map",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".7z",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp4", ".webm", ".mp3", ".wav",
    ".xml", ".txt", ".json",
}

HTML_MIME_HINTS = {"text/html", "application/xhtml+xml"}

# -----------------------------------------------------------------------------
# STATE
# -----------------------------------------------------------------------------

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})

visited_lock = threading.Lock()
visited: set[str] = set()

saved_lock = threading.Lock()
saved: set[str] = set()

q: queue.Queue[str] = queue.Queue()

# -----------------------------------------------------------------------------
# URL HELPERS
# -----------------------------------------------------------------------------

def normalize_url(url: str, base: str | None = None) -> str | None:
    if not url:
        return None
    if base:
        url = urljoin(base, url)

    url = url.strip()
    parsed = urlparse(url)

    if parsed.scheme and parsed.scheme.lower() in SKIP_SCHEMES:
        return None

    if not parsed.scheme:
        parsed = urlparse("https://" + url)

    if parsed.scheme not in {"http", "https"}:
        return None

    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]

    if netloc != ALLOWED_DOMAIN:
        return None

    path = unquote(parsed.path or "/")
    path = re.sub(r"/{2,}", "/", path)

    query = parsed.query if KEEP_QUERY else ""

    return urlunparse(("https", netloc, path, "", query, ""))


def is_same_domain(url: str) -> bool:
    parsed = urlparse(url)
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc == ALLOWED_DOMAIN


def should_visit(url: str) -> bool:
    with visited_lock:
        if url in visited:
            return False
        visited.add(url)
        return True


# -----------------------------------------------------------------------------
# FILE PATH HELPERS
# -----------------------------------------------------------------------------

def safe_segment(seg: str) -> str:
    seg = seg.strip()
    if not seg:
        return "_"
    # Replace characters that are unsafe on Windows/Linux paths
    seg = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', seg)
    return seg[:180]


def local_path_for_url(url: str, content_type: str | None = None) -> Path:
    parsed = urlparse(url)
    path = unquote(parsed.path)

    if not path or path.endswith("/"):
        path = path + "index.html"

    suffix = Path(path).suffix.lower()

    # HTML route without extension → force .html
    if not suffix and content_type:
        mime = content_type.split(";")[0].strip().lower()
        if mime in HTML_MIME_HINTS:
            path = path.rstrip("/") + ".html"

    parts = [safe_segment(p) for p in path.split("/") if p]
    if not parts:
        parts = ["index.html"]

    out = OUTPUT_DIR.joinpath(*parts)

    if parsed.query:
        qhash = hashlib.sha1(parsed.query.encode("utf-8")).hexdigest()[:10]
        if out.suffix:
            out = out.with_name(f"{out.stem}__q_{qhash}{out.suffix}")
        else:
            out = out.with_name(out.name + f"__q_{qhash}")

    return out


# -----------------------------------------------------------------------------
# EXTRACTION
# -----------------------------------------------------------------------------

def extract_srcset_urls(srcset: str, base_url: str) -> Iterable[str]:
    for part in srcset.split(","):
        candidate = part.strip().split(" ")[0].strip()
        if candidate:
            norm = normalize_url(candidate, base=base_url)
            if norm:
                yield norm


def extract_urls_from_css(css_text: str, base_url: str) -> set[str]:
    found: set[str] = set()
    for m in re.finditer(r'url\((.*?)\)', css_text, flags=re.I | re.S):
        raw = m.group(1).strip().strip('"\'')
        norm = normalize_url(raw, base=base_url)
        if norm:
            found.add(norm)
    return found


def extract_urls_from_html(html: str, base_url: str) -> set[str]:
    found: set[str] = set()
    soup = BeautifulSoup(html, "html.parser")

    attr_map = {
        "a":      ["href"],
        "link":   ["href"],
        "script": ["src"],
        "img":    ["src", "data-src", "data-lazy-src"],
        "iframe": ["src"],
        "source": ["src"],
        "video":  ["src", "poster"],
        "audio":  ["src"],
        "form":   ["action"],
    }

    for tag, attrs in attr_map.items():
        for el in soup.find_all(tag):
            for attr in attrs:
                raw = el.get(attr)
                if raw:
                    norm = normalize_url(raw, base=base_url)
                    if norm:
                        found.add(norm)

            if tag in {"img", "source"}:
                srcset = el.get("srcset")
                if srcset:
                    found.update(extract_srcset_urls(srcset, base_url))

    # meta refresh
    for meta in soup.find_all("meta"):
        if meta.get("http-equiv", "").lower() == "refresh":
            content = meta.get("content", "")
            m = re.search(r'url=(.+)', content, flags=re.I)  # fixed: was missing closing quote
            if m:
                norm = normalize_url(m.group(1).strip(), base=base_url)
                if norm:
                    found.add(norm)

    # inline style attributes
    for el in soup.find_all(style=True):
        found.update(extract_urls_from_css(el["style"], base_url))

    # <style> blocks
    for style in soup.find_all("style"):
        if style.string:
            found.update(extract_urls_from_css(style.string, base_url))

    return found


# -----------------------------------------------------------------------------
# DOWNLOADING
# -----------------------------------------------------------------------------

def save_response_content(url: str, resp: requests.Response) -> tuple[Path, str]:
    content_type = resp.headers.get("Content-Type", "")
    out_path = local_path_for_url(url, content_type=content_type)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with saved_lock:
        if str(out_path) in saved:
            return out_path, content_type
        saved.add(str(out_path))

    with open(out_path, "wb") as f:
        f.write(resp.content)

    return out_path, content_type


def fetch_one(url: str) -> None:
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    except Exception as e:
        print(f"[ERR] GET {url} :: {e}")
        return

    final_url = normalize_url(resp.url)
    if not final_url or not is_same_domain(final_url):
        print(f"[SKIP] redirected off-domain: {url} -> {resp.url}")
        return

    should_visit(final_url)  # mark redirected URL as visited too

    content_type = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
    out_path, _ = save_response_content(final_url, resp)
    print(f"[OK] {resp.status_code} {final_url} -> {out_path.relative_to(OUTPUT_DIR)}")

    discovered: set[str] = set()

    if content_type in HTML_MIME_HINTS or final_url.endswith(".html"):
        try:
            discovered.update(extract_urls_from_html(resp.text, final_url))
        except Exception as e:
            print(f"[WARN] HTML parse failed {final_url}: {e}")

    elif content_type == "text/css" or final_url.lower().endswith(".css"):
        try:
            discovered.update(extract_urls_from_css(resp.text, final_url))
        except Exception as e:
            print(f"[WARN] CSS parse failed {final_url}: {e}")

    for link in discovered:
        if is_same_domain(link) and should_visit(link):
            q.put(link)


# -----------------------------------------------------------------------------
# WORKERS
# -----------------------------------------------------------------------------

def worker() -> None:
    while True:
        try:
            url = q.get(timeout=3)
        except queue.Empty:
            return
        try:
            fetch_one(url)
            time.sleep(REQUEST_DELAY)
        finally:
            q.task_done()


# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------

def seed_extra_urls() -> None:
    extras = [
        f"https://{ALLOWED_DOMAIN}/robots.txt",
        f"https://{ALLOWED_DOMAIN}/sitemap.xml",
        f"https://{ALLOWED_DOMAIN}/sitemap_index.xml",
        f"https://{ALLOWED_DOMAIN}/favicon.ico",
    ]
    for url in extras:
        norm = normalize_url(url)
        if norm and should_visit(norm):
            q.put(norm)


def main() -> None:
    global OUTPUT_DIR

    start_url = START_URL
    if len(sys.argv) >= 2:
        start_url = sys.argv[1]
    if len(sys.argv) >= 3:
        OUTPUT_DIR = Path(sys.argv[2])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    start_url = normalize_url(start_url)
    if not start_url:
        raise SystemExit("Bad start URL")

    print(f"Start URL : {start_url}")
    print(f"Output dir: {OUTPUT_DIR.resolve()}")
    print(f"Domain    : {ALLOWED_DOMAIN}")
    print(f"Workers   : {MAX_WORKERS}")
    print(f"Delay     : {REQUEST_DELAY}s/worker")
    print()

    if should_visit(start_url):
        q.put(start_url)
    seed_extra_urls()

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(MAX_WORKERS)]
    for t in threads:
        t.start()

    try:
        while True:
            alive = [t for t in threads if t.is_alive()]
            if not alive:
                break
            with visited_lock:
                n = len(visited)
            if n >= MAX_URLS:
                print(f"[STOP] Reached MAX_URLS={MAX_URLS}")
                break
            time.sleep(2)
    except KeyboardInterrupt:
        print("\n[INTERRUPTED] Waiting for in-flight requests to finish...")

    q.join()

    print()
    print("═══ Done ═══")
    print(f"Visited URLs : {len(visited)}")
    print(f"Saved files  : {len(saved)}")
    print(f"Mirror root  : {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
