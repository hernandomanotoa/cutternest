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
    def cajon(self, mod, sub, w, h, color=C_DRAW):
        d = self.d - 30
        self.add(f'{mod}{sub}-frente', f'Frente cajon {sub}', w, h, 1, 'si', color, TH_BODY, 'T,B,L,R', f'{mod}{sub}')
        self.add(f'{mod}{sub}-lateral-izq', f'Lateral cajon {sub}', h-30, d, 1, 'no', C_FRONT, TH_BODY, 'T,B,L', f'{mod}{sub}')
        self.add(f'{mod}{sub}-lateral-der', f'Lateral cajon {sub}', h-30, d, 1, 'no', C_FRONT, TH_BODY, 'T,B,R', f'{mod}{sub}')
        self.add(f'{mod}{sub}-fondo', f'Fondo cajon {sub}', w-40, d, 1, 'no', C_FONDO, TH_BODY, '', f'{mod}{sub}')
        self.add(f'{mod}{sub}-base', f'Base cajon {sub}', w-40, d, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', f'{mod}{sub}')
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

# Aparador
m = M('aparador', 1600, 500, 800)
m.add('glb-zocalo', 'Zocalo aparador', 1600, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa aparador', 1600, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior aparador', 1600, 800, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
# Modulo 1: cajonera
m.box('m1', 'cajonera')
m.cajon('m1', '1', 460, 180)
m.cajon('m1', '2', 460, 180)
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
    m.add(f'm1-repisa-{i}', f'Repisa {i} estanteria', 840, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
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
m.add('m1-repisa-superior', 'Repisa superior vitrina', 740, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-repisa-inferior', 'Repisa inferior vitrina', 740, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
write('Vitrina', 'Vitrina alta para salón o comedor con puerta de cristal.', m.pieces, 'ejemplo-vitrina.csv')

# Mesa extensible (solo estructura/soporte)
m = M('mesa', 1800, 900, 750)
m.add('glb-tablero', 'Tablero mesa extensible', 1800, 900, 1, 'si', C_FRONT, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-pata-izq', 'Pata izquierda mesa', 100, 720, 1, 'no', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-pata-der', 'Pata derecha mesa', 100, 720, 1, 'no', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-travesano', 'Travesano mesa', 1600, 80, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-extension', 'Soporte extensión mesa', 400, 450, 2, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'estructura')
write('Mesa extensible', 'Estructura de mesa extensible para comedor (soporte sin mecanismo extensible).', m.pieces, 'ejemplo-mesa-extensible.csv')

# === DORMITORIO ===

# Cabecero con mesitas
m = M('cabecero', 2000, 300, 1200)
m.add('glb-panel', 'Panel cabecero', 2000, 1200, 1, 'si', C_FRONT, TH_TOP, 'T,B,L,R', 'estructura')
# Mesita izquierda
m.box('m1', 'mesita noche')
m.add('m1-cajon-frente', 'Frente cajon mesita', 360, 150, 1, 'si', C_DRAW, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-cajon-lateral-izq', 'Lateral cajon mesita', 120, 350, 1, 'no', C_FRONT, TH_BODY, 'T,B,L', 'm1')
m.add('m1-cajon-lateral-der', 'Lateral cajon mesita', 120, 350, 1, 'no', C_FRONT, TH_BODY, 'T,B,R', 'm1')
m.add('m1-cajon-fondo', 'Fondo cajon mesita', 320, 350, 1, 'no', C_FONDO, TH_BODY, '', 'm1')
m.add('m1-cajon-base', 'Base cajon mesita', 320, 350, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-cajon-tirador', 'Tirador cajon mesita', 2, 20, 1, 'no', C_TIR, TH_TIR, '', 'm1')
# Mesita derecha
m.box('m2', 'mesita noche')
m.add('m2-cajon-frente', 'Frente cajon mesita', 360, 150, 1, 'si', C_DRAW, TH_BODY, 'T,B,L,R', 'm2')
m.add('m2-cajon-lateral-izq', 'Lateral cajon mesita', 120, 350, 1, 'no', C_FRONT, TH_BODY, 'T,B,L', 'm2')
m.add('m2-cajon-lateral-der', 'Lateral cajon mesita', 120, 350, 1, 'no', C_FRONT, TH_BODY, 'T,B,R', 'm2')
m.add('m2-cajon-fondo', 'Fondo cajon mesita', 320, 350, 1, 'no', C_FONDO, TH_BODY, '', 'm2')
m.add('m2-cajon-base', 'Base cajon mesita', 320, 350, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm2')
m.add('m2-cajon-tirador', 'Tirador cajon mesita', 2, 20, 1, 'no', C_TIR, TH_TIR, '', 'm2')
write('Cabecero', 'Cabecero de cama con dos mesitas de noche integradas.', m.pieces, 'ejemplo-cabecero.csv')

# === RECIBIDOR ===

# Recibidor lineal
m = M('recibidor', 1200, 350, 900)
m.add('glb-zocalo', 'Zocalo recibidor', 1200, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa recibidor', 1200, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior recibidor', 1200, 900, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
# Modulo 1: cajonera
m.box('m1')
m.cajon('m1', '1', 460, 180)
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
m.add('m1-cajon-frente', 'Frente cajon consola', 840, 150, 1, 'si', C_DRAW, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-cajon-lateral-izq', 'Lateral cajon consola', 120, 600, 1, 'no', C_FRONT, TH_BODY, 'T,B,L', 'm1')
m.add('m1-cajon-lateral-der', 'Lateral cajon consola', 120, 600, 1, 'no', C_FRONT, TH_BODY, 'T,B,R', 'm1')
m.add('m1-cajon-fondo', 'Fondo cajon consola', 800, 600, 1, 'no', C_FONDO, TH_BODY, '', 'm1')
m.add('m1-cajon-base', 'Base cajon consola', 800, 600, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-cajon-tirador', 'Tirador cajon consola', 2, 20, 1, 'no', C_TIR, TH_TIR, '', 'm1')
write('Consola', 'Consola de recibidor con cajón amplio.', m.pieces, 'ejemplo-consola.csv')

# Separador de ambientes
m = M('separador', 1200, 200, 1600)
m.add('glb-zocalo', 'Zocalo separador', 1200, 80, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa separador', 1200, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior separador', 1200, 1600, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.add('m1-repisa-1', 'Repisa 1 separador', 1140, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-repisa-2', 'Repisa 2 separador', 1140, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-repisa-3', 'Repisa 3 separador', 1140, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-repisa-4', 'Repisa 4 separador', 1140, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
write('Separador', 'Separador de ambientes tipo estantería abierta.', m.pieces, 'ejemplo-separador-ambientes.csv')

# === COCINA ===

# Botellero
m = M('botellero', 600, 300, 1200)
m.add('glb-zocalo', 'Zocalo botellero', 600, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa botellero', 600, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior botellero', 600, 1200, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
for i in range(1, 5):
    m.add(f'm1-entrepaño-{i}', f'Entrepaño botellero {i}', 540, 250, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
write('Botellero', 'Botellero de cocina con entrepaños para botellas.', m.pieces, 'ejemplo-botellero.csv')

# Isla
m = M('isla', 1200, 900, 900)
m.add('glb-zocalo', 'Zocalo isla', 1200, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa isla', 1200, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.box('m1')
m.cajon('m1', '1', 460, 180)
m.cajon('m1', '2', 460, 180)
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
m.add('m1-cajon-frente', 'Frente cajon columna auxiliar', 260, 150, 1, 'si', C_DRAW, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-cajon-lateral-izq', 'Lateral cajon columna auxiliar', 120, 450, 1, 'no', C_FRONT, TH_BODY, 'T,B,L', 'm1')
m.add('m1-cajon-lateral-der', 'Lateral cajon columna auxiliar', 120, 450, 1, 'no', C_FRONT, TH_BODY, 'T,B,R', 'm1')
m.add('m1-cajon-fondo', 'Fondo cajon columna auxiliar', 220, 450, 1, 'no', C_FONDO, TH_BODY, '', 'm1')
m.add('m1-cajon-base', 'Base cajon columna auxiliar', 220, 450, 1, 'si', C_FRONT, TH_BODY, 'T,B,L,R', 'm1')
m.add('m1-cajon-tirador', 'Tirador cajon columna auxiliar', 2, 20, 1, 'no', C_TIR, TH_TIR, '', 'm1')
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

# Archivador
m = M('archivador', 500, 600, 1300)
m.add('glb-zocalo', 'Zocalo archivador', 500, 100, 1, 'si', C_BODY, TH_BODY, 'T,B,L,R', 'estructura')
m.add('glb-tapa', 'Tapa archivador', 500, 40, 1, 'si', C_BODY, TH_TOP, 'T,B,L,R', 'estructura')
m.add('glb-trasera', 'Panel posterior archivador', 500, 1300, 1, 'no', C_FONDO, TH_BODY, '', 'estructura')
m.box('m1')
m.cajon('m1', '1', 420, 280)
m.cajon('m1', '2', 420, 280)
m.cajon('m1', '3', 420, 280)
write('Archivador', 'Archivador de oficina con tres cajones grandes.', m.pieces, 'ejemplo-archivador.csv')

print('Hecho. Archivos generados en', OUT, 'y', OUT_DOCS)
