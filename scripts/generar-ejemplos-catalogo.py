import csv, os

OUT = '/workspace/cutternest-kit/frontend/public/assembly-planner/data'
OUT_DOCS = '/workspace/cutternest-kit/docs'

TH_BODY = 15
TH_TOP = 30
TH_DOOR = 18
TH_TIR = 5
C_BODY = '#C19A6B'
C_FRONT = '#D9C2A3'
C_FONDO = '#F2F2F2'
C_DRAW = '#8B5A2B'
C_DOOR = '#FFFFFF'
C_TIR = '#A0A0A0'
C_CRIS = '#E8F4F8'

def piece(id, nombre, ancho, alto, cantidad, rotate, color, espesor, cantos, modulo):
    return [id, nombre, ancho, alto, cantidad, rotate, color, espesor, cantos, modulo]

class M:
    def __init__(self, name, w, d, h):
        self.name = name
        self.w = w
        self.d = d
        self.h = h
        self.pieces = []
    def add(self, *args):
        self.pieces.append(piece(*args))
    def base_top(self, mod, suffix=''):
        n = self.name if not suffix else f'{self.name} {suffix}'
        self.add(f'{mod}-base', f'Base {n}', self.w, self.d, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', mod)
        self.add(f'{mod}-tapa', f'Tapa {n}', self.w, self.d, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', mod)
    def laterales(self, mod, suffix=''):
        n = self.name if not suffix else f'{self.name} {suffix}'
        self.add(f'{mod}-lateral-izq', f'Lateral izquierdo {n}', self.d, self.h, 1, 'no', C_BODY, TH_BODY, 'T,B,L', mod)
        self.add(f'{mod}-lateral-der', f'Lateral derecho {n}', self.d, self.h, 1, 'no', C_BODY, TH_BODY, 'T,B,R', mod)
    def fondo(self, mod, suffix=''):
        n = self.name if not suffix else f'{self.name} {suffix}'
        self.add(f'{mod}-fondo', f'Fondo {n}', self.w, self.h, 1, 'no', C_FONDO, TH_BODY, '', mod)
    def box(self, mod, suffix=''):
        self.base_top(mod, suffix)
        self.laterales(mod, suffix)
        self.fondo(mod, suffix)
    def cajon(self, mod, sub, n_por_fila=1, alto_vano=180, tipo='corredera', ancho=None, prof=None, color=C_DRAW):
        # Cajón de 6 piezas coherente con el vano del módulo (mismas reglas que
        # cajon() de scripts/generar-ejemplos-assembly.mjs y que valida js/csvParser.js):
        # W = ancho − 2E · D = profundidad − E − E
        # frente.ancho = N===1 ? W−2 : floor((W − (N−1)×3)/N) − 1 · frente.alto = altoVano − 3
        # profCajon = D − 25 (corredera telescópica) o D − 15 (volquete/abatible)
        # lateral = profCajon × (frente.alto − 2×espBase)
        # Caja telescópica: vanoCajon = N===1 ? W : frente.ancho + 2
        #   interior = round(vanoCajon − 25,4) − 2×espLat
        #   base/fondo/cara = interior (la cara es el frente interior entre laterales)
        # Volquete/abatible: sin corredera, conserva el modelo clásico derivado
        # del frente (interior = frente − 2×espLat) y no lleva pieza de cara.
        E = TH_BODY
        ESP_LAT = TH_BODY
        ESP_BASE = TH_BODY
        W = (ancho or self.w) - 2 * E
        D = (prof or self.d) - E - E
        if n_por_fila == 1:
            frente_w = W - 2
        else:
            frente_w = (W - (n_por_fila - 1) * 3) // n_por_fila - 1
        frente_h = alto_vano - 3
        volquete = tipo == 'volquete'
        prof_caj = D - (15 if volquete else 25)
        lat_h = frente_h - 2 * ESP_BASE
        vano_cajon = W if n_por_fila == 1 else frente_w + 2
        interior = frente_w - 2 * ESP_LAT if volquete else round(vano_cajon - 25.4) - 2 * ESP_LAT
        nombre_tipo = ' abatible' if volquete else ''
        self.add(f'{mod}{sub}-frente', f'Frente cajon{nombre_tipo} {sub}', frente_w, frente_h, 1, 'si', color, TH_BODY, 'T,B,L,R', f'{mod}{sub}')
        self.add(f'{mod}{sub}-lateral-izq', f'Lateral cajon {sub}', prof_caj, lat_h, 1, 'no', C_FRONT, TH_BODY, 'T,B,L', f'{mod}{sub}')
        self.add(f'{mod}{sub}-lateral-der', f'Lateral cajon {sub}', prof_caj, lat_h, 1, 'no', C_FRONT, TH_BODY, 'T,B,R', f'{mod}{sub}')
        self.add(f'{mod}{sub}-fondo', f'Fondo cajon {sub}', interior, lat_h, 1, 'no', C_FONDO, TH_BODY, '', f'{mod}{sub}')
        if not volquete:
            self.add(f'{mod}{sub}-cara', f'Cara cajon {sub}', interior, lat_h, 1, 'no', C_FRONT, TH_BODY, 'T,B,L,R', f'{mod}{sub}')
        self.add(f'{mod}{sub}-base', f'Base cajon {sub}', interior, prof_caj, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', f'{mod}{sub}')
        self.add(f'{mod}{sub}-tirador', f'Tirador cajon {sub}', 2, 20, 1, 'no', C_TIR, TH_TIR, '', f'{mod}{sub}')

def write(title, desc, pieces, filename):
    path = os.path.join(OUT, filename)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        f.write(f'# CutterNest Piezas v1\n# {desc}\n')
        w = csv.writer(f)
        w.writerow(['id', 'nombre', 'ancho', 'alto', 'cantidad', 'rotate', 'color', 'espesor', 'cantos', 'modulo'])
        w.writerows(pieces)
    name = filename.replace('ejemplo-', '').replace('.csv', '')
    doc_name = 'Ejemplo_CSV_' + '_'.join(p.capitalize() for p in name.split('-')) + '.csv'
    doc_path = os.path.join(OUT_DOCS, doc_name)
    with open(doc_path, 'w', newline='', encoding='utf-8') as f:
        f.write(f'# CutterNest Piezas v1\n# {desc}\n')
        w = csv.writer(f)
        w.writerow(['id', 'nombre', 'ancho', 'alto', 'cantidad', 'rotate', 'color', 'espesor', 'cantos', 'modulo'])
        w.writerows(pieces)
    print('written', path, '->', doc_path)

# === SALÓN ===

# Aparador (prof 450 para entrar en el rango alacena 300–450)
m = M('aparador', 1600, 450, 800)
m.add('glb-zocalo', 'Zocalo aparador', 4800, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
# Modulo 1: cajonera (2 cajones por fila)
m.box('m1', 'cajonera')
m.cajon('m1', '1', n_por_fila=2)
m.cajon('m1', '2', n_por_fila=2)
# Modulo 2: puertas
m.box('m2', 'puertas')
m.add('m2-puerta', 'Puerta aparador', 460, 760, 1, 'no', C_DOOR, TH_DOOR, 'T,B,L,R', 'm2')
m.add('m2-puerta-bisagra', 'Bisagra puerta aparador', 2, 20, 2, 'no', C_TIR, TH_TIR, '', 'm2')
# Modulo 3: repisa central abierta
m.box('m3', 'vitrina')
m.add('m3-repisa-superior', 'Repisa superior vitrina', 500, 200, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm3')
m.add('m3-repisa-inferior', 'Repisa inferior vitrina', 500, 200, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm3')
m.add('m3-vidrio', 'Vidrio vitrina', 500, 500, 1, 'no', C_CRIS, 4, '', 'm3')
write('Aparador', 'Aparador tipo buffet para salón o comedor: cajonera, puertas y vitrina central.', m.pieces, 'ejemplo-aparador.csv')

# Estantería (estantería/librería abierta)
m = M('estanteria', 900, 300, 1800)
m.add('glb-zocalo', 'Zocalo estanteria', 900, 80, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa estanteria', 900, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior estanteria', 900, 1800, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
for i in range(1, 5):
    m.add(f'm1-repisa-{i}', f'Repisa {i} estanteria', 840, 250, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
write('Estantería', 'Estantería alta abierta para salón o estudio con 4 repisas ajustables.', m.pieces, 'ejemplo-estanteria.csv')

# === COMEDOR ===

# Vitrina (alta)
m = M('vitrina', 800, 400, 2000)
m.add('glb-zocalo', 'Zocalo vitrina', 800, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa vitrina', 800, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior vitrina', 800, 2000, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.add('m1-puerta', 'Puerta superior vitrina', 360, 900, 1, 'no', C_DOOR, TH_DOOR, 'T,B,L,R', 'm1')
m.add('m1-vidrio', 'Cristal puerta vitrina', 300, 700, 1, 'no', C_CRIS, 4, '', 'm1')
m.add('m1-repisa-superior', 'Repisa superior vitrina', 740, 250, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
m.add('m1-repisa-inferior', 'Repisa inferior vitrina', 740, 250, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
write('Vitrina', 'Vitrina alta para salón o comedor con puerta de cristal.', m.pieces, 'ejemplo-vitrina.csv')

# Mesa extensible (solo estructura/soporte)
m = M('mesa', 1800, 900, 750)
m.add('glb-tablero', 'Tablero mesa extensible', 1800, 900, 1, 'si', C_FRONT, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-pata-izq', 'Pata izquierda mesa', 100, 720, 1, 'no', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-pata-der', 'Pata derecha mesa', 100, 720, 1, 'no', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-travesano', 'Travesano mesa', 1600, 80, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-extension', 'Travesano soporte extensión mesa', 400, 450, 2, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'estructura')
write('Mesa extensible', 'Estructura de mesa extensible para comedor (soporte sin mecanismo extensible).', m.pieces, 'ejemplo-mesa-extensible.csv')

# === DORMITORIO ===

# Cabecero con mesitas
m = M('cabecero', 2000, 300, 1200)
m.add('glb-panel', 'Respaldo cabecero', 2000, 1200, 1, 'si', C_FRONT, TH_TOP, 'T,B,L,R', 'estructura')
# Mesita de noche integrada (módulo 400×350×500 con cajón en submódulo)
for mod, cuerpo in (('m1', C_BODY), ('m2', C_FRONT)):
    m.add(f'{mod}-base', f'Base mesita noche', 400, 350, 1, 'si', cuerpo, TH_BODY, 'T,B,L,R', mod)
    m.add(f'{mod}-tapa', f'Tapa mesita noche', 400, 350, 1, 'si', cuerpo, TH_BODY, 'T,B,L,R', mod)
    m.add(f'{mod}-lateral-izq', f'Lateral izquierdo mesita noche', 350, 500, 1, 'no', cuerpo, TH_BODY, 'T,B,L', mod)
    m.add(f'{mod}-lateral-der', f'Lateral derecho mesita noche', 350, 500, 1, 'no', cuerpo, TH_BODY, 'T,B,R', mod)
    m.add(f'{mod}-fondo', f'Fondo mesita noche', 400, 500, 1, 'no', C_FONDO, TH_BODY, '', mod)
    m.cajon(mod, '1', alto_vano=150, ancho=400, prof=350)
write('Cabecero', 'Cabecero de cama con dos mesitas de noche integradas.', m.pieces, 'ejemplo-cabecero.csv')

# === RECIBIDOR ===

# Recibidor lineal
m = M('recibidor', 1200, 350, 900)
m.add('glb-zocalo', 'Zocalo recibidor', 2400, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
# Modulo 1: cajonera
m.box('m1')
m.cajon('m1', '1')
# Modulo 2: abierto con repisa
m.box('m2')
m.add('m2-repisa-superior', 'Repisa superior recibidor', 500, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm2')
m.add('m2-repisa-inferior', 'Repisa inferior recibidor', 500, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm2')
# Espejo
m.add('m2-espejo', 'Espejo recibidor', 500, 500, 1, 'no', C_CRIS, 4, '', 'm2')
write('Recibidor lineal', 'Recibidor lineal con cajonera y espejo.', m.pieces, 'ejemplo-recibidor-lineal.csv')

# Consola
m = M('consola', 1000, 300, 850)
m.add('glb-zocalo', 'Zocalo consola', 1000, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa consola', 1000, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior consola', 1000, 850, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.cajon('m1', '1', alto_vano=150)
write('Consola', 'Consola de recibidor con cajón amplio.', m.pieces, 'ejemplo-consola.csv')

# Separador de ambientes (prof 300 y alto 1800 para entrar en estanteria_librero 280–400 / 1800–2200)
m = M('separador', 1200, 300, 1800)
m.add('glb-zocalo', 'Zocalo separador', 1200, 80, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa separador', 1200, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior separador', 1200, 1800, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.add('m1-repisa-1', 'Repisa 1 separador', 1140, 170, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
m.add('m1-repisa-2', 'Repisa 2 separador', 1140, 170, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
m.add('m1-repisa-3', 'Repisa 3 separador', 1140, 170, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
m.add('m1-repisa-4', 'Repisa 4 separador', 1140, 170, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
write('Separador', 'Separador de ambientes tipo estantería abierta.', m.pieces, 'ejemplo-separador-ambientes.csv')

# === COCINA ===

# Botellero (1000×400×1100, dentro de bar_cantina 1000–2000 / 400–600 / 1000–1100)
m = M('botellero', 1000, 400, 1100)
m.add('glb-zocalo', 'Zocalo botellero', 1000, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa botellero', 1000, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior botellero', 1000, 1100, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
for i in range(1, 5):
    m.add(f'm1-entrepaño-{i}', f'Entrepaño botellero {i}', 940, 250, 1, 'si', C_FRONT, TH_DOOR, 'T,B,L,R', 'm1')
write('Botellero', 'Botellero de cocina con entrepaños para botellas.', m.pieces, 'ejemplo-botellero.csv')

# Isla
m = M('isla', 1200, 900, 900)
m.add('glb-zocalo', 'Zocalo isla', 1200, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa isla', 1200, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.box('m1')
m.cajon('m1', '1', n_por_fila=2)
m.cajon('m1', '2', n_por_fila=2)
# Contraste isla
m.add('m1-panel', 'Panel lateral isla', 900, 860, 1, 'no', C_DOOR, TH_DOOR, 'T,B,L,R', 'm1')
write('Isla cocina', 'Isla central de cocina con cajones y panel lateral.', m.pieces, 'ejemplo-isla-cocina.csv')

# Columna alta
m = M('columna', 600, 600, 2100)
m.add('glb-zocalo', 'Zocalo columna', 600, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa columna', 600, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior columna', 600, 2100, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.add('m1-repisa-superior', 'Repisa superior columna', 540, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-repisa-inferior', 'Repisa inferior columna', 540, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
write('Columna cocina', 'Columna alta de cocina para horno/microondas con repisas.', m.pieces, 'ejemplo-columna-cocina.csv')

# === BAÑO ===

# Columna auxiliar baño
m = M('columna auxiliar', 300, 300, 1600)
m.add('glb-zocalo', 'Zocalo columna auxiliar', 300, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa columna auxiliar', 300, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior columna auxiliar', 300, 1600, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.cajon('m1', '1', alto_vano=150)
write('Columna auxiliar baño', 'Columna auxiliar estrecha para baño con cajón.', m.pieces, 'ejemplo-columna-auxiliar-bano.csv')

# Espejo con módulo
m = M('espejo modulo', 800, 150, 700)
m.add('glb-zocalo', 'Zocalo modulo baño', 800, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa modulo baño', 800, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior modulo baño', 800, 700, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.add('m1-puerta', 'Puerta modulo baño', 360, 660, 1, 'no', C_DOOR, TH_DOOR, 'T,B,L,R', 'm1')
m.add('m1-espejo', 'Espejo modulo baño', 700, 500, 1, 'no', C_CRIS, 4, '', 'm1')
write('Espejo con módulo', 'Módulo de baño con puerta y espejo.', m.pieces, 'ejemplo-espejo-modulo.csv')

# === ESTUDIO ===

# Archivador (prof 500 para entrar en el rango archivador 400–500)
m = M('archivador', 500, 500, 1300)
m.add('glb-zocalo', 'Zocalo archivador', 500, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa archivador', 500, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior archivador', 500, 1300, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.cajon('m1', '1', alto_vano=280)
m.cajon('m1', '2', alto_vano=280)
m.cajon('m1', '3', alto_vano=280)
write('Archivador', 'Archivador de oficina con tres cajones grandes.', m.pieces, 'ejemplo-archivador.csv')

print('Hecho. Archivos generados en', OUT, 'y', OUT_DOCS)
