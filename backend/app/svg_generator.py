import base64
import os
from io import BytesIO
from typing import Any, Dict, List, Optional

import svgwrite
from PIL import Image, ImageDraw, ImageFont


def _ancho_texto_estimado(texto: str, font_size: float) -> float:
    """Ancho estimado del texto (mm) con factor medio de caracteres."""
    return max(1, len(texto)) * font_size * 0.6


def _truncar_a_medida(texto: str, medir, max_ancho: float, font_size: float) -> str | None:
    """Devuelve el texto truncado con '…' para que quepa en max_ancho, o None
    si ni siquiera un carácter cabe."""
    if medir(texto, font_size) <= max_ancho:
        return texto
    for n in range(len(texto) - 1, 0, -1):
        candidato = texto[:n] + "…"
        if medir(candidato, font_size) <= max_ancho:
            return candidato
    return None


def _etiqueta_adaptativa(
    nombre: str,
    pid: str,
    w: float,
    h: float,
    medir,
    font_size: float = 2.0,
) -> tuple[str | None, bool]:
    """Etiqueta que SÍ se lee: devuelve (texto, rotada). Niveles: 'nombre
    medidas' → nombre truncado → id truncado; primero horizontal (usa el
    ancho de la pieza) y, si no cabe, rotada 90° (usa el alto — piezas
    angostas y altas). (None, False) si la pieza es diminuta: su descripción
    va en la leyenda lateral."""
    if h < font_size * 1.1:
        return None, False
    medidas = f"{w:.0f}x{h:.0f}"
    # Las dimensiones son lo primero que necesita quien corta: van en el
    # primer candidato y también como etiqueta propia (segundo nivel), para
    # que las piezas pequeñas SIEMPRE muestren sus medidas si caben.
    candidatos = [f"{nombre} {medidas}", medidas, nombre, pid]
    ancho_h = max(0.0, w - 2.0)
    largo_v = max(0.0, h - 2.0)
    # 1) Texto COMPLETO horizontal.
    for candidato in candidatos:
        if medir(candidato, font_size) <= ancho_h:
            return candidato, False
    # 2) Texto completo rotado (piezas angostas y altas: un nombre entero
    #    rotado se lee mejor que tres letras horizontal).
    for candidato in candidatos:
        if medir(candidato, font_size) <= largo_v:
            return candidato, True
    # 3) Último recurso: fragmento horizontal truncado con '…'.
    for candidato in candidatos:
        cabe = _truncar_a_medida(candidato, medir, ancho_h, font_size)
        if cabe is not None:
            return cabe, False
    return None, False


def _leyenda_lineas(board: Dict[str, Any]) -> list[str]:
    """Líneas de la leyenda lateral (una por pieza, orden de lectura) con la
    descripción completa de las piezas pequeñas."""
    ordenadas = sorted(board["placements"], key=lambda p: (round(float(p["y"]), 1), round(float(p["x"]), 1)))
    lineas = []
    for p in ordenadas:
        pid = str(p.get("id", ""))
        nombre = str(p.get("nombre", ""))
        w, h = float(p["w"]), float(p["h"])
        lineas.append(f"{pid} · {nombre} · {w:.0f}x{h:.0f}")
    return lineas


def generate_svg(board: Dict[str, Any], board_index: int = 0) -> str:
    width = float(board["ancho"])
    height = float(board["alto"])
    lineas = _leyenda_lineas(board)
    # Panel de leyenda a la derecha del tablero: la descripción completa de
    # cada pieza (incluidas las diminutas, cuya etiqueta interna no cabe).
    ancho_leyenda = max(90.0, max((_ancho_texto_estimado(l, 2.2) for l in lineas), default=0.0) + 8.0)
    total_w = width + 8.0 + ancho_leyenda
    dwg = svgwrite.Drawing(size=(f"{total_w}mm", f"{height}mm"), viewBox=f"0 0 {total_w} {height}")
    dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill="#f3f4f6", stroke="#374151", stroke_width=0.5))

    def medir_estimado(texto: str, fs: float) -> float:
        return _ancho_texto_estimado(texto, fs)

    for p in board["placements"]:
        x, y, w, h = float(p["x"]), float(p["y"]), float(p["w"]), float(p["h"])
        color = p.get("color", "#3B82F6")
        dwg.add(dwg.rect(insert=(x, y), size=(w, h), fill=color, stroke="#1f2937", stroke_width=0.3, opacity=0.85))
        # Etiqueta interna adaptativa (horizontal, o rotada en piezas
        # angostas y altas); la descripción completa vive en la leyenda.
        etiqueta, rotada = _etiqueta_adaptativa(
            str(p.get("nombre", "")), str(p.get("id", "")), w, h, medir_estimado,
        )
        if etiqueta is not None:
            tx, ty = x + 1.0, y + h / 2
            if rotada:
                g = dwg.g(transform=f"rotate(90 {tx} {ty})")
                g.add(dwg.text(etiqueta, insert=(tx, ty), font_size=2.0, fill="#111827"))
                dwg.add(g)
            else:
                dwg.add(dwg.text(etiqueta, insert=(tx, ty), font_size=2.0, fill="#111827"))
        # Número/id corto siempre que quepa (referencia rápida a la leyenda).
        pid = str(p.get("id", ""))
        if pid and _ancho_texto_estimado(pid, 1.6) <= w - 2.0 and h >= 4.0:
            dwg.add(dwg.text(pid, insert=(x + 1.0, y + 3.0), font_size=1.6, fill="#1f2937"))

    # Leyenda lateral.
    lx = width + 6.0
    dwg.add(dwg.text("LEYENDA", insert=(lx, 8.0), font_size=3.0, fill="#111827", font_weight="bold"))
    ly = 14.0
    for linea in lineas:
        visible = _truncar_a_medida(linea, medir_estimado, ancho_leyenda - 4.0, 2.2) or ""
        dwg.add(dwg.text(visible, insert=(lx, ly), font_size=2.2, fill="#111827"))
        ly += 4.0

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

    # Leyenda lateral con la descripción completa de cada pieza (las
    # diminutas no llevan etiqueta interna; se identifican por la leyenda).
    lineas = _leyenda_lineas(board)
    ancho_px_leyenda = max(240, int(width * 0.30))
    img = Image.new("RGB", (width + ancho_px_leyenda, img_height), "#ffffff")
    draw = ImageDraw.Draw(img)

    outline_width = max(1, int(0.5 * scale))
    draw.rectangle([0, 0, width - 1, img_height - 1], outline="#374151", width=outline_width)
    # Fondo del tablero (rect base del SVG) para distinguirlo del panel.
    draw.rectangle([1, 1, width - 2, img_height - 2], fill="#f3f4f6")

    def medir_real(texto: str, fs_mm: float) -> float:
        fuente = _load_font(max(8, int(fs_mm * scale)))
        caja = draw.textbbox((0, 0), texto, font=fuente)
        return (caja[2] - caja[0]) / scale  # px → mm

    for p in board["placements"]:
        x, y, w, h = float(p["x"]), float(p["y"]), float(p["w"]), float(p["h"])
        px, py = int(x * scale), int(y * scale)
        pw, ph = int(w * scale), int(h * scale)
        color = p.get("color", "#3B82F6") or "#3B82F6"
        stroke_width = max(1, int(0.3 * scale))
        draw.rectangle([px, py, px + pw, py + ph], fill=color, outline="#1f2937", width=stroke_width)

        # Etiqueta interna adaptativa con medición REAL del texto.
        font_size = max(8, min(24, int(min(pw, ph) * 0.18)))
        etiqueta, rotada = _etiqueta_adaptativa(
            str(p.get("nombre", "")), str(p.get("id", "")), w, h, medir_real, font_size / scale,
        )
        if etiqueta is None:
            continue
        fuente = _load_font(max(8, font_size))
        caja = draw.textbbox((0, 0), etiqueta, font=fuente)
        tw, th = caja[2] - caja[0], caja[3] - caja[1]
        if rotada:
            # Renderizar en una capa y rotar 90° para piezas angostas/altas.
            if th < pw - 4 and tw < ph - 4:
                capa = Image.new("RGBA", (tw + 4, th + 4), (0, 0, 0, 0))
                ImageDraw.Draw(capa).text((2 - caja[0], 2 - caja[1]), etiqueta, fill="#111827", font=fuente)
                capa = capa.rotate(90, expand=True)
                img.paste(capa, (px + (pw - capa.width) // 2, py + (ph - capa.height) // 2), capa)
        elif tw < pw - 4 and th < ph - 4:
            draw.text((px + 2, py + (ph - th) // 2), etiqueta, fill="#111827", font=fuente)

        # Id corto arriba a la izquierda (referencia a la leyenda) si cabe.
        pid = str(p.get("id", ""))
        if pid:
            fuente_id = _load_font(9)
            caja_id = draw.textbbox((0, 0), pid, font=fuente_id)
            if (caja_id[2] - caja_id[0]) < pw - 4 and ph >= 22:
                draw.text((px + 2, py + 2), pid, fill="#1f2937", font=fuente_id)

    # Leyenda.
    lx = width + 12
    fuente_titulo = _load_font(16)
    fuente_linea = _load_font(13)
    draw.text((lx, 12), "LEYENDA", fill="#111827", font=fuente_titulo)
    ly = 40
    for linea in lineas:
        # Truncar con medición real al ancho del panel.
        visible = linea
        while visible and draw.textlength(visible, font=fuente_linea) > ancho_px_leyenda - 20:
            visible = visible[:-2] + "…" if not visible.endswith("…") else visible[:-2]
        if not visible:
            visible = linea[:10]
        draw.text((lx, ly), visible, fill="#111827", font=fuente_linea)
        ly += 17

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
    os.makedirs(exports_dir, exist_ok=True)
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
