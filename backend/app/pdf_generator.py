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
        data = [["N", "Dimension (mm)", "Pieza", "Angulo"]]
        for p in board["placements"]:
            dimension = f"{p['w']:.1f} x {p['h']:.1f}"
            angle = "90" if p.get("rotado") else "0"
            data.append([str(cut_number), dimension, p["nombre"], angle])
            cut_number += 1
        table = Table(data, colWidths=[15 * mm, 40 * mm, 80 * mm, 20 * mm])
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
