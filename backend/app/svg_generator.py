import base64
from io import BytesIO
from typing import Any, Dict, List

import svgwrite
from PIL import Image


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


def generate_png(svg_string: str, width: int = 1200, height: int = 800) -> str:
    try:
        import cairosvg
        png_bytes = cairosvg.svg2png(bytestring=svg_string.encode("utf-8"), output_width=width, output_height=height)
        return base64.b64encode(png_bytes).decode("utf-8")
    except Exception:
        return ""


def save_layout_files(board: Dict[str, Any], board_index: int, exports_dir: str) -> Dict[str, str]:
    import os
    svg = generate_svg(board, board_index)
    svg_path = f"/exports/layout_{board_index}.svg"
    png_path = f"/exports/layout_{board_index}.png"
    abs_svg_path = os.path.join(exports_dir, f"layout_{board_index}.svg")
    abs_png_path = os.path.join(exports_dir, f"layout_{board_index}.png")
    with open(abs_svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    try:
        import cairosvg
        cairosvg.svg2png(url=abs_svg_path, write_to=abs_png_path, output_width=1200, output_height=800)
    except Exception:
        png_path = None
    return {"svg_path": svg_path, "png_path": png_path}
