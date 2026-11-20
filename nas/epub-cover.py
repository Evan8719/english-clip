"""Emit the cover declared by an EPUB, without extracting its archive."""
import posixpath
import sys
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree
from zipfile import ZipFile


def read_limited(book, path, limit):
    if book.getinfo(path).file_size > limit:
        raise ValueError("EPUB member exceeds limit")
    return book.read(path)


def package_path(base, value):
    href = urlsplit(value)
    path = posixpath.normpath(posixpath.join(base, unquote(href.path)))
    if href.scheme or href.netloc or path.startswith(("/", "../")) or path == "..":
        raise ValueError("Invalid EPUB cover path")
    return path


def extract_cover(filename):
    with ZipFile(filename) as book:
        container = ElementTree.fromstring(read_limited(book, "META-INF/container.xml", 32 * 1024))
        rootfile = container.find(".//{*}rootfile")
        opf = package_path("", rootfile.attrib["full-path"])
        package = ElementTree.fromstring(read_limited(book, opf, 1024 * 1024))
        legacy = next((meta.get("content") for meta in package.findall(".//{*}meta")
                       if meta.get("name") == "cover"), None)
        images = package.findall(".//{*}manifest/{*}item")
        cover = next((item for item in images if "cover-image" in item.get("properties", "").split()), None)
        if cover is None and legacy:
            cover = next((item for item in images if item.get("id") == legacy), None)
        if cover is None or cover.get("media-type") not in {
            "image/jpeg", "image/png", "image/webp", "image/gif",
        }:
            return
        cover_path = package_path(posixpath.dirname(opf), cover.attrib["href"])
        sys.stdout.buffer.write(read_limited(book, cover_path, 8 * 1024 * 1024))


if __name__ == "__main__":
    try:
        extract_cover(sys.argv[1])
    except (AttributeError, KeyError, OSError, ValueError, ElementTree.ParseError):
        sys.exit(1)
