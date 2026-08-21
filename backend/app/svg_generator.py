import base64
import os
from io import BytesIO
from typing import Any, Dict, List, Optional

import svgwrite
from PIL import Image, ImageDraw, ImageFont


def generate_svg(board: Dict[str, Any], board_index: int = 0) -> str:
    width = float(board["ancho"])
    height = float(board["alto"])
    dwg = svgwrite.Drawing(size=(f"{width}mm", f"{height}mm"), viewBox=f"0 0 {width} {height}")
    dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill="#f3f4f6", stroke="#374151", stroke_width=0.5))

    for p in board["placements"]:
        x, y, w, h = float(p["x"]), float(p["y"]), float(p["w"]), float(p["h"])
        color = p.get("color", "#3B82F6")
        dwg.add(dwg.rect(insert=(x, y), size=(w, h), fill=color, stroke="#1f2937", stroke_width=0.3, opacity=0.85))
        dwg.add(dwg.text(
            f"{p['nombre']} {w:.1f}x{h:.1f}",
            insert=(x + 1, y + h / 2),
            font_size=2,
            fill="#111827",
        ))

    return dwg.tostring()


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def generate_png_base64(board: Dict[str, Any], width: int = 1200) -> str:
    img = render_board_png(board, width=width)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def render_board_png(board: Dict[str, Any], width: int = 1200, height: Optional[int] = None) -> Image.Image:
    ancho = float(board["ancho"])
    alto = float(board["alto"])
    scale = width / ancho
    img_height = int(alto * scale) if height is None else height
    img = Image.new("RGB", (width, img_height), "#f3f4f6")
    draw = ImageDraw.Draw(img)

    outline_width = max(1, int(0.5 * scale))
    draw.rectangle([0, 0, width - 1, img_height - 1], outline="#374151", width=outline_width)

    base_font = _load_font(12)

    for p in board["placements"]:
        x, y, w, h = float(p["x"]), float(p["y"]), float(p["w"]), float(p["h"])
        px, py = int(x * scale), int(y * scale)
        pw, ph = int(w * scale), int(h * scale)
        color = p.get("color", "#3B82F6") or "#3B82F6"
        stroke_width = max(1, int(0.3 * scale))
        draw.rectangle([px, py, px + pw, py + ph], fill=color, outline="#1f2937", width=stroke_width)

        label = f"{p['nombre']} {w:.1f}x{h:.1f}"
        font_size = max(8, min(24, int(min(pw, ph) * 0.18)))
        font = _load_font(font_size)
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw < pw - 4 and th < ph - 4:
            tx = px + 2
            ty = py + (ph - th) // 2
            draw.text((tx, ty), label, fill="#111827", font=font)

    return img


def save_png(board: Dict[str, Any], output_path: str, width: int = 1200, height: Optional[int] = None) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img = render_board_png(board, width=width, height=height)
    img.save(output_path, "PNG")
    return output_path


def generate_png(svg_string: str, width: int = 1200, height: int = 800) -> str:
    """Mantiene firma antigua; ahora genera PNG desde el SVG parseado de forma simple."""
    try:
        import xml.etree.ElementTree as ET

        ns = {"svg": "http://www.w3.org/2000/svg"}
        root = ET.fromstring(svg_string)
        viewbox = root.get("viewBox", "0 0 100 100").split()
        ancho, alto = float(viewbox[2]), float(viewbox[3])
        board: Dict[str, Any] = {"ancho": ancho, "alto": alto, "placements": []}
        for rect in root.findall(".//svg:rect", ns):
            fill = rect.get("fill", "#3B82F6")
            x = float(rect.get("x", "0"))
            y = float(rect.get("y", "0"))
            w = float(rect.get("width", "0"))
            h = float(rect.get("height", "0"))
            if fill == "#f3f4f6":
                continue
            board["placements"].append({
                "x": x, "y": y, "w": w, "h": h,
                "color": fill,
                "nombre": "",
            })
        for text in root.findall(".//svg:text", ns):
            text_x = float(text.get("x", text.get("{http://www.w3.org/1999/xlink}x", "0")))
            text_y = float(text.get("y", "0"))
            content = "".join(t.text or "" for t in text.iter())
            for p in board["placements"]:
                if abs(p["x"] + 1 - text_x) < 0.5 and abs(p["y"] + p["h"] / 2 - text_y) < 0.5:
                    p["nombre"] = content.split()[0] if content else ""
                    break
        return generate_png_base64(board, width=width)
    except Exception:
        return ""


def save_png_from_svg(svg_string: str, output_path: str, width: int = 1200, height: int = 800) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    png_b64 = generate_png(svg_string, width=width, height=height)
    if not png_b64:
        raise RuntimeError("No se pudo generar el PNG")
    png_bytes = base64.b64decode(png_b64)
    with open(output_path, "wb") as f:
        f.write(png_bytes)
    return output_path


def save_layout_files(board: Dict[str, Any], board_index: int, exports_dir: str) -> Dict[str, str]:
    svg = generate_svg(board, board_index)
    svg_path = f"/exports/layout_{board_index}.svg"
    png_path = f"/exports/layout_{board_index}.png"
    abs_svg_path = os.path.join(exports_dir, f"layout_{board_index}.svg")
    abs_png_path = os.path.join(exports_dir, f"layout_{board_index}.png")
    with open(abs_svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    try:
        save_png(board, abs_png_path, width=1200)
    except Exception:
        png_path = None
    return {"svg_path": svg_path, "png_path": png_path}
