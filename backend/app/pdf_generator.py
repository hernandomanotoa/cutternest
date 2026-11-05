import base64
import os
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage



def _quote_pdf_path(exports_dir: str, quote_id: str) -> str:
    return os.path.join(exports_dir, f"cotizacion_{quote_id}.pdf")


def _cutlist_pdf_path(exports_dir: str, project_id: str) -> str:
    return os.path.join(exports_dir, f"cutlist_{project_id}.pdf")


def _labels_pdf_path(exports_dir: str, project_id: str) -> str:
    return os.path.join(exports_dir, f"etiquetas_{project_id}.pdf")


def _layouts_pdf_path(exports_dir: str, project_id: str) -> str:
    return os.path.join(exports_dir, f"layouts_{project_id}.pdf")


def _web_path(abs_path: str) -> str:
    return abs_path.replace("/app/data/exports", "/exports")


def generate_quote_pdf(quote: Dict[str, Any], project_name: str, exports_dir: str) -> str:
    path = _quote_pdf_path(exports_dir, quote["quote_id"])
    doc = SimpleDocTemplate(path, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("<b>Cotizacion CutterNest</b>", styles["Title"]))
    story.append(Paragraph(f"Proyecto: {project_name}", styles["Heading2"]))
    story.append(Paragraph(f"Fecha: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}", styles["Normal"]))
    story.append(Spacer(1, 10 * mm))

    data = [
        ["Concepto", "Monto (USD)"],
        ["Material", f"{quote['breakdown']['material']:.2f}"],
        ["Hardware", f"{quote['breakdown']['hardware']:.2f}"],
        ["Mano de obra", f"{quote['breakdown']['mano_obra']:.2f}"],
        ["Subtotal", f"{quote['breakdown']['subtotal']:.2f}"],
        ["Total (con margen)", f"{quote['breakdown']['total']:.2f}"],
    ]
    table = Table(data, colWidths=[100 * mm, 50 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(table)

    if quote.get("hardware"):
        story.append(Spacer(1, 10 * mm))
        story.append(Paragraph("<b>Hardware incluido</b>", styles["Heading3"]))
        hw_data = [["Item", "Cantidad", "P/U", "Subtotal"]]
        for item in quote["hardware"]:
            subtotal = item["cantidad"] * item["precio_unit"]
            hw_data.append([item["item"], str(item["cantidad"]), f"{item['precio_unit']:.2f}", f"{subtotal:.2f}"])
        hw_table = Table(hw_data, colWidths=[80 * mm, 25 * mm, 25 * mm, 25 * mm])
        hw_table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey)]))
        story.append(hw_table)

    doc.build(story)
    return _web_path(path)


def generate_cutlist_pdf(project_name: str, boards: List[Dict[str, Any]], exports_dir: str) -> str:
    path = _cutlist_pdf_path(exports_dir, str(project_name))
    doc = SimpleDocTemplate(path, pagesize=A4, rightMargin=15 * mm, leftMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("<b>Cut List - CutterNest</b>", styles["Title"]))
    story.append(Paragraph(f"Proyecto: {project_name}", styles["Heading2"]))
    story.append(Spacer(1, 5 * mm))

    cut_number = 1
    for board in boards:
        story.append(Paragraph(f"Tablero {board['board_index'] + 1} - {board['ancho']:.1f}x{board['alto']:.1f} mm", styles["Heading3"]))
        data = [["N", "Dimension (mm)", "Pieza", "Cantos", "Angulo"]]
        for p in board["placements"]:
            dimension = f"{p['w']:.1f} x {p['h']:.1f}"
            angle = "90" if p.get("rotado") else "0"
            data.append([str(cut_number), dimension, p["nombre"], p.get("cantos", "") or "-", angle])
            cut_number += 1
        table = Table(data, colWidths=[15 * mm, 40 * mm, 70 * mm, 25 * mm, 20 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(table)
        story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("<b>Checklist de seguridad:</b> guantes, gafas, push stick", styles["Normal"]))
    doc.build(story)
    return _web_path(path)


def generate_labels_pdf(project_name: str, boards: List[Dict[str, Any]], exports_dir: str, label_size: str = "50x30") -> str:
    path = _labels_pdf_path(exports_dir, str(project_name))
    doc = SimpleDocTemplate(path, pagesize=A4, rightMargin=10 * mm, leftMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>Etiquetas - {project_name}</b>", styles["Title"]))
    story.append(Spacer(1, 5 * mm))

    # Generar una etiqueta por cada placement
    import json
    for board in boards:
        for p in board["placements"]:
            label_text = f"{p['nombre']} {p['w']:.0f}x{p['h']:.0f}"
            qr_payload = json.dumps({
                "p": project_name,
                "i": p["id"],
                "d": f"{p['w']:.0f}x{p['h']:.0f}",
            })
            qr_img = qrcode.make(qr_payload)
            buffer = BytesIO()
            qr_img.save(buffer, format="PNG")
            buffer.seek(0)
            img = RLImage(buffer, width=20 * mm, height=20 * mm)
            data = [[Paragraph(f"<b>{label_text}</b>", styles["Normal"]), img]]
            table = Table(data, colWidths=[60 * mm, 25 * mm])
            table.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, colors.grey)]))
            story.append(table)
            story.append(Spacer(1, 2 * mm))

    doc.build(story)
    return _web_path(path)


def _assembly_pdf_path(exports_dir: str, project_id: str) -> str:
    return os.path.join(exports_dir, f"manual_ensamblaje_{project_id}.pdf")


def generate_assembly_manual(
    project_name: str,
    steps: List[Dict[str, Any]],
    pieces: List[Dict[str, Any]],
    exports_dir: str,
    project_id: str = "",
) -> str:
    path = _assembly_pdf_path(exports_dir, project_id or project_name)
    doc = SimpleDocTemplate(path, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>Manual de ensamblaje - {project_name}</b>", styles["Title"]))
    story.append(Paragraph(f"Fecha: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}", styles["Normal"]))
    story.append(Spacer(1, 10 * mm))

    # Lista de piezas
    if pieces:
        story.append(Paragraph("<b>Lista de piezas</b>", styles["Heading3"]))
        piece_data = [["Codigo", "Nombre", "Dimensiones (mm)"]]
        for p in pieces:
            dims = f"{p.get('width_mm', 0):.1f} x {p.get('height_mm', 0):.1f}"
            piece_data.append([p.get("external_id", ""), p.get("name", ""), dims])
        piece_table = Table(piece_data, colWidths=[40 * mm, 80 * mm, 50 * mm])
        piece_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(piece_table)
        story.append(Spacer(1, 10 * mm))

    # Pasos
    story.append(Paragraph("<b>Pasos de ensamblaje</b>", styles["Heading3"]))
    for step in steps:
        story.append(Paragraph(f"<b>Paso {step.get('numero', step.get('step_number', ''))}: {step.get('titulo', step.get('title', ''))}</b>", styles["Heading4"]))
        story.append(Paragraph(f"{step.get('descripcion', step.get('description', ''))}", styles["Normal"]))

        piezas = step.get("piezas", step.get("piece_codes", []))
        if piezas:
            story.append(Paragraph(f"Piezas: {', '.join(str(p) for p in piezas)}", styles["Normal"]))

        conectores = step.get("conectores", [])
        if conectores:
            connector_types = {c.get("tipo", c.get("connector_type", "conector")) for c in conectores}
            story.append(Paragraph(f"Conectores: {', '.join(sorted(connector_types))}", styles["Normal"]))

        herramientas = step.get("herramientas", step.get("tool_ids", []))
        if herramientas:
            story.append(Paragraph(f"Herramientas: {', '.join(str(h) for h in herramientas)}", styles["Normal"]))

        tiempo = step.get("tiempo_estimado_min")
        if tiempo:
            story.append(Paragraph(f"Tiempo estimado: {tiempo} min", styles["Normal"]))

        story.append(Spacer(1, 5 * mm))

    doc.build(story)
    return _web_path(path)


def generate_layouts_pdf(
    project_name: str,
    project_id: str,
    boards: List[Dict[str, Any]],
    exports_dir: str,
) -> str:
    """PDF de layouts de corte: un tablero por página (A4 horizontal) con el
    dibujo del tablero a escala, etiquetas adaptativas (las angostas llevan
    el texto rotado) y una leyenda lateral con la descripción completa de
    cada pieza — imprimible para el taller."""
    from reportlab.lib.pagesizes import landscape
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.pdfbase.pdfmetrics import stringWidth

    os.makedirs(exports_dir, exist_ok=True)
    path = _layouts_pdf_path(exports_dir, str(project_id))
    page_w, page_h = landscape(A4)  # puntos: 842 x 595
    c = pdf_canvas.Canvas(path, pagesize=landscape(A4))

    margen = 28  # pt (~10 mm)
    textoOscuro = colors.HexColor("#111827")

    def truncar(texto: str, fuente: str, tam: float, max_ancho: float) -> str:
        if stringWidth(texto, fuente, tam) <= max_ancho:
            return texto
        for n in range(len(texto) - 1, 0, -1):
            candidato = texto[:n] + "…"
            if stringWidth(candidato, fuente, tam) <= max_ancho:
                return candidato
        return ""

    for board in boards:
        ancho, alto = float(board["ancho"]), float(board["alto"])
        disponible_w = page_w - 2 * margen
        disponible_h = page_h - 2 * margen - 24  # cabecera
        escala = min((disponible_w * 0.62) / ancho, disponible_h / alto)
        tab_w, tab_h = ancho * escala, alto * escala
        ox, oy = margen, margen + (disponible_h - tab_h) / 2

        # Cabecera.
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(textoOscuro)
        c.drawString(margen, page_h - margen, f"Layout de corte — Tablero {board['board_index'] + 1}")
        c.setFont("Helvetica", 9)
        c.drawString(margen, page_h - margen - 14,
                     f"Proyecto: {project_name} · Tablero {ancho:.0f}×{alto:.0f} mm · "
                     f"Utilización {board.get('utilizacion', 0):.2f}% · {datetime.now():%d/%m/%Y}")

        # Tablero.
        c.setStrokeColor(colors.HexColor("#374151"))
        c.setLineWidth(1)
        c.rect(ox, oy, tab_w, tab_h, stroke=1, fill=0)

        for p in board["placements"]:
            x = ox + float(p["x"]) * escala
            y = oy + (alto - float(p["y"]) - float(p["h"])) * escala  # PDF: Y hacia arriba
            w, h = float(p["w"]) * escala, float(p["h"]) * escala
            try:
                relleno = colors.HexColor(str(p.get("color", "#3B82F6")))
            except ValueError:
                relleno = colors.HexColor("#3B82F6")
            c.setFillColor(relleno)
            c.setStrokeColor(colors.HexColor("#1f2937"))
            c.setLineWidth(0.4)
            c.rect(x, y, w, h, stroke=1, fill=1)

            nombre = str(p.get("nombre", ""))
            pid = str(p.get("id", ""))
            medidas = f"{float(p['w']):.0f}x{float(p['h']):.0f}"
            # Las medidas siempre visibles cuando caben: van solas como
            # segundo nivel (las piezas pequeñas muestran sus dimensiones).
            candidatos = [f"{nombre} {medidas}", medidas, nombre, pid]

            def dibujar_texto(texto: str, rotado: bool) -> None:
                tam = max(4.0, min(7.0, (h if not rotado else w) * 0.16))
                fuente_w = (h - 4) if rotado else (w - 4)
                visible = truncar(texto, "Helvetica", tam, fuente_w)
                if not visible:
                    return
                c.setFont("Helvetica", tam)
                c.setFillColor(textoOscuro)
                cx, cy = x + w / 2, y + h / 2
                if rotado:
                    c.saveState()
                    c.translate(cx, cy)
                    c.rotate(90)
                    c.drawCentredString(0, -tam / 3, visible)
                    c.restoreState()
                else:
                    c.drawCentredString(cx, cy - tam / 3, visible)

            elegido = None
            for cand in candidatos:  # completo horizontal
                if stringWidth(cand, "Helvetica", 5.5) <= w - 4:
                    elegido = (cand, False)
                    break
            if elegido is None:
                for cand in candidatos:  # completo rotado (piezas angostas)
                    if stringWidth(cand, "Helvetica", 5.5) <= h - 4:
                        elegido = (cand, True)
                        break
            if elegido is None:
                for cand in candidatos:  # fragmento truncado horizontal
                    visible = truncar(cand, "Helvetica", 4.0, w - 4)
                    if visible:
                        elegido = (visible, False)
                        break
            if elegido is not None:
                dibujar_texto(*elegido)
            # Id corto arriba a la izquierda (referencia a la leyenda).
            if pid:
                id_visible = truncar(pid, "Helvetica", 4.0, w - 4)
                if id_visible and h >= 8:
                    c.setFont("Helvetica", 4.0)
                    c.setFillColor(colors.HexColor("#1f2937"))
                    c.drawString(x + 1.5, y + h - 5.5, id_visible)

        # Leyenda lateral: AGRUPADA POR MEDIDAS — una línea por WxH; los
        # datos que no coinciden en el grupo (ids/nombres/cantos) se
        # concatenan. El orden sigue la lectura del tablero (y, x del
        # primer ejemplar del grupo).
        lx = ox + tab_w + 16
        ancho_leyenda = page_w - lx - margen
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(textoOscuro)
        c.drawString(lx, oy + tab_h - 12, "LEYENDA")
        c.setFillColor(textoOscuro)
        ly = oy + tab_h - 24
        c.setFont("Helvetica", 6.5)
        for linea in _leyenda_agrupada(board["placements"]):
            visible = truncar(linea, "Helvetica", 6.5, ancho_leyenda)
            if ly < margen:
                c.drawString(lx, ly, "… (ver cut list para el resto)")
                break
            c.drawString(lx, ly, visible)
            ly -= 9

        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#6b7280"))
        c.drawString(margen, margen - 16,
                     "CutterNest — cortes completos (guillotina). Verifique medidas antes de cortar.")
        c.showPage()

    c.save()
    return _web_path(path)


def _leyenda_agrupada(placements):
    """Líneas de leyenda AGRUPADAS POR MEDIDAS (W×H redondeadas).

    Una línea por grupo; los datos que difieren entre ejemplares del grupo
    (ids, nombres, cantos) se concatenan con " / " en el orden de aparición.
    El orden de los grupos sigue la lectura del tablero (y, x del primer
    ejemplar). Pieza única: formato clásico con su id.
    """
    ordenadas = sorted(placements,
                       key=lambda p: (round(float(p["y"]), 1), round(float(p["x"]), 1)))
    grupos = {}
    for p in ordenadas:
        clave = (round(float(p["w"])), round(float(p["h"])))
        g = grupos.setdefault(clave, {
            "ids": [], "nombres": [], "cantos": [], "n": 0,
            "orden": (round(float(p["y"]), 1), round(float(p["x"]), 1)),
        })
        g["n"] += 1
        for campo, valor in (("ids", p.get("id", "")),
                             ("nombres", p.get("nombre", "")),
                             ("cantos", p.get("cantos", ""))):
            if valor and valor not in g[campo]:
                g[campo].append(valor)

    lineas = []
    for (w, h), g in sorted(grupos.items(), key=lambda kv: kv[1]["orden"]):
        linea = f"{w}x{h}"
        if g["n"] > 1:
            linea += f" ×{g['n']}"
        if g["ids"]:
            linea += f" · {' / '.join(g['ids'])}"
        if g["nombres"]:
            linea += f" · {' / '.join(g['nombres'])}"
        if g["cantos"]:
            # Si no todos los ejemplares del grupo tienen cantos, se marca
            # el vacío para no dar a entender que las ×N van canteadas.
            marcas = list(g["cantos"])
            if len(marcas) < g["n"]:
                marcas.insert(0, "—")
            linea += f" · cantos {' / '.join(marcas)}"
        lineas.append(linea)
    return lineas


# ── Clasificación de cantos (9 categorías, spec taller) ──────────────────
CATEGORIAS_CANTO = [
    "Sin laminar", "1 Corto", "2 Cortos", "1 Largo", "2 Largos",
    "1 Largo + 1 Corto", "2 Largos + 1 Corto", "1 Largo + 2 Cortos", "4 Lados",
]


def _lados_largo(ancho: float, alto: float) -> set:
    """Aristas largas referenciadas por letra: las que miden lo del lado más
    largo de la pieza. La decisión es 100% por las dimensiones (los opuestos
    son iguales: dos largos o dos cortos); las letras T,B,L,R solo
    identifican qué arista es cada una."""
    return {"T", "B"} if ancho >= alto else {"L", "R"}


def _letras_canto(cantos: str) -> list:
    vistos, out = set(), []
    for raw in str(cantos or "").split(","):
        letra = raw.strip().upper()
        if len(letra) == 1 and letra in "TBLR" and letra not in vistos:
            vistos.add(letra)
            out.append(letra)
    return out


def _categoria_canto(cantos: str, ancho: float, alto: float) -> int:
    largos = _lados_largo(ancho, alto)
    n_l = sum(1 for l in _letras_canto(cantos) if l in largos)
    n_c = sum(1 for l in _letras_canto(cantos) if l not in largos)
    if n_l + n_c == 0:
        return 0
    if n_l == 0:
        return 1 if n_c == 1 else 2
    if n_c == 0:
        return 3 if n_l == 1 else 4
    if n_l == 1 and n_c == 1:
        return 5
    if n_l == 2 and n_c == 1:
        return 6
    if n_l == 1 and n_c == 2:
        return 7
    return 8


def _cantos_canonicos(cantos: str) -> str:
    """Forma canónica con lado indistinto (T = B y L = R): la laminación va
    por pares de cortes lineales. Un lado del par → 'T/B'; ambos → 'T,B'.
    Igual con L/R. La identificación individual se conserva pieza a pieza."""
    letras = set(_letras_canto(cantos))
    partes = []
    tb = int("T" in letras) + int("B" in letras)
    if tb == 2:
        partes.append("T,B")
    elif tb == 1:
        partes.append("T/B")
    lr = int("L" in letras) + int("R" in letras)
    if lr == 2:
        partes.append("L,R")
    elif lr == 1:
        partes.append("L/R")
    return ",".join(partes)


def _clasificar_cantos(pieces: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Agrupa por categoría + medidas + cantos canónicos (lado indistinto:
    T=B, L=R); suma unidades y metros lineales de tapacanto (mm de arista
    canteadas × unidades, con las letras reales — la arista mide igual en
    ambos lados del par)."""
    grupos: Dict[str, Dict[str, Any]] = {}
    for p in pieces:
        ancho = float(p.get("ancho") or p.get("width_mm") or 0)
        alto = float(p.get("alto") or p.get("height_mm") or 0)
        if ancho <= 0 or alto <= 0:
            continue
        cantos = str(p.get("cantos") or p.get("edge_banding") or "").strip()
        und = max(1, int(p.get("cantidad") or p.get("quantity") or 1))
        cat = _categoria_canto(cantos, ancho, alto)
        canonico = _cantos_canonicos(cantos)
        key = f"{cat}|{ancho}|{alto}|{canonico}"
        # Longitud de arista: T/B corren a lo largo del ancho, L/R del alto.
        mm = sum((ancho if l in ("T", "B") else alto) for l in _letras_canto(cantos))
        metros = mm * und / 1000.0
        g = grupos.get(key)
        if g:
            g["unidades"] += und
            g["metros"] += metros
        else:
            grupos[key] = {
                "categoria": cat, "ancho": ancho, "alto": alto,
                "cantos": canonico, "unidades": und, "metros": metros,
            }
    filas = sorted(
        grupos.values(),
        key=lambda g: (g["categoria"], -(g["ancho"] * g["alto"])),
    )
    return {
        "filas": filas,
        "total_metros": sum(g["metros"] for g in filas),
        "total_unidades": sum(g["unidades"] for g in filas),
    }


def _cantos_pdf_path(exports_dir: str, project_id: str) -> str:
    return os.path.join(exports_dir, f"clasificacion_cantos_{project_id}.pdf")


def generate_cantos_pdf(
    project_name: str,
    project_id: str,
    pieces: List[Dict[str, Any]],
    exports_dir: str,
) -> str:
    """PDF con la clasificación de cantos en 9 categorías: unidades y
    metros lineales de tapacanto por grupo de medidas."""
    os.makedirs(exports_dir, exist_ok=True)
    path = _cantos_pdf_path(exports_dir, str(project_id))
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        rightMargin=15 * mm, leftMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("<b>Clasificación de cantos - CutterNest</b>", styles["Title"]),
        Paragraph(f"Proyecto: {project_name}", styles["Heading2"]),
        Paragraph(
            "Largo = arista paralela al lado más largo de la pieza. Metros lineales = "
            "longitud de las aristas canteadas × unidades. Lado indistinto: T = B y "
            "L = R (la laminación va por pares de cortes lineales); T/B = un lado del "
            "par, T,B = ambos.",
            styles["Normal"],
        ),
        Spacer(1, 5 * mm),
    ]
    data = [["Categoría", "Medidas (mm)", "Cantos", "Und.", "Metros lineales"]]
    clasificacion = _clasificar_cantos(pieces)
    filas_por_cat: Dict[int, list] = {i: [] for i in range(9)}
    for f in clasificacion["filas"]:
        filas_por_cat[f["categoria"]].append(f)
    for cat, nombre in enumerate(CATEGORIAS_CANTO):
        del_grupo = filas_por_cat[cat]
        if not del_grupo:
            data.append([nombre, "—", "—", "0", "0.00"])
            continue
        for i, f in enumerate(del_grupo):
            data.append([
                nombre if i == 0 else "",
                f"{f['ancho']:.0f} x {f['alto']:.0f}",
                f["cantos"] or "—",
                str(f["unidades"]),
                f"{f['metros']:.2f}",
            ])
    data.append(["Total", "", "", str(clasificacion["total_unidades"]),
                 f"{clasificacion['total_metros']:.2f} m"])
    table = Table(data, colWidths=[45 * mm, 35 * mm, 30 * mm, 20 * mm, 35 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f4f6")),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
    ]))
    story.append(table)
    doc.build(story)
    return _web_path(path)
