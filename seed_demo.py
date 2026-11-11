"""Add an explicitly labelled sample catalog; never replace existing business records."""
from server import init, connect, stock

CATALOG = [
    ('Acrylic colour tube · Crimson Red', 'Paints & colours', 210, 120, 25, 5, '/images/acrylic-red.jpg', 'Heavy-body artist acrylic in intense Crimson Red (PR170). Rich buttery consistency with maximum pigment loading, satin finish, and permanent water-resistant film for canvas and board.'),
    ('Acrylic colour tube · Titanium White', 'Paints & colours', 210, 120, 30, 6, '/images/acrylic-white.jpg', 'High-opacity Titanium White (PW6) heavy-body acrylic tube. Superior tinting strength, non-yellowing pure white pigment, smooth impasto stroke retention on canvas and wood.'),
    ('Acrylic colour tube · Lamp Black', 'Paints & colours', 210, 120, 20, 5, '/images/acrylic-black.jpg', 'Intense matte Lamp Black (PBk7) artist acrylic. Deep velvety opacity, pure carbon pigment with zero chromatic bleed for underpainting and contrast.'),
    ('Watercolour cake · Cobalt Blue', 'Paints & colours', 160, 95, 24, 4, '/images/watercolor-blue.jpg', 'Finely milled transparent watercolour half-pan in luminous Cobalt Blue (PB28). Superb single-pigment purity, rich wash granulation, and maximum archival lightfastness for landscape and botanical painting.'),
    ('Watercolour cake · Lemon Yellow', 'Paints & colours', 160, 95, 20, 4, '/images/watercolor-yellow.jpg', 'Bright, transparent Lemon Yellow (PY3) watercolour half-pan. Clean luminous mixing tone with excellent water dispersion and permanence on cold-press and hot-press rag paper.'),
    ('Watercolour cake · Viridian Green', 'Paints & colours', 160, 95, 18, 4, '/images/watercolor-green.jpg', 'Deep emerald Viridian Green (PG18) artist watercolour half-pan. Velvety transparent glazing shade with exceptional atmospheric depth and non-staining wash handling.'),
    ('Round brush set · 6 pieces', 'Brushes', 220, 125, 28, 6, '/images/brushes-set.jpg', 'Handcrafted artist round brushes (sizes 0, 2, 4, 6, 8, 10) with fine tapered tips and seamless nickel ferrules. Excellent liquid retention, spring, and precision control for fine washes and line art.'),
    ('Flat brush set · 4 pieces', 'Brushes', 180, 100, 20, 5, '/images/flat-brushes.jpg', 'Golden synthetic taklon flat wash brushes (1/4 in, 1/2 in, 3/4 in, 1 in). Clean square edges for broad coverage, crisp ribbon strokes, and controlled glazes in watercolours and acrylics.'),
    ('Stretched canvas · 12 × 16 in', 'Canvas & paper', 320, 190, 12, 4, '/images/canvas-stretched.jpg', 'Medium-grain 100% natural cotton canvas stretched on kiln-dried pine stretcher bars. Triple-primed with acid-free acrylic gesso, ready for immediate work in oils, acrylics, and mixed media.'),
    ('Canvas board · A4', 'Canvas & paper', 120, 65, 40, 10, '/images/canvas-board.jpg', 'Heavy-duty warp-resistant composite board wrapped with archival cotton canvas. Triple gesso primed, rigid surface suitable for studio studies, plein air painting, and framing.'),
    ('Watercolour paper pad · A4', 'Canvas & paper', 280, 170, 18, 5, '/images/watercolor-pad.jpg', '300 GSM, 100% cellulose cold-pressed watercolour paper. Fine tooth surface with optimal water absorption, acid-free for age resistance. 20 glued sheets.'),
    ('Hardbound sketchbook · A5', 'Drawing supplies', 180, 100, 25, 6, '/images/sketchbook.jpg', '160 pages of 140 GSM cartridge paper bound in an elegant textured hard cover. Lies completely flat when opened, ribbon bookmark, elastic closure, suitable for ink, pencil, and light washes.'),
    ('Fine liner set · 6 sizes', 'Drawing supplies', 300, 185, 16, 4, '/images/fineliners.jpg', 'Archival micro-pigment black ink pens with calibrated needle tips (0.05, 0.1, 0.2, 0.3, 0.5, 0.8 mm). Waterproof, fade-proof, non-smudging, ideal for mandala art, drafting, and comic illustration.'),
    ('Wooden tabletop easel', 'Studio accessories', 650, 390, 8, 2, '/images/easel.jpg', 'Solid seasoned beechwood H-frame tabletop easel with adjustable angle and mast height. Non-slip rubber feet, holds canvases up to 20 inches, folds flat for compact storage.')
]

def seed():
    init()
    inserted=0
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        for i, (name, category, price, cost, quantity, reorder, image, desc) in enumerate(CATALOG, 1):
            sku = f'DEMO-ART-{i:03d}'
            existing = c.execute('SELECT id FROM products WHERE sku=?', (sku,)).fetchone()
            if existing:
                continue
            pid = c.execute('INSERT INTO products(name,sku,category,price,cost,tax,reorder,published,description,image) VALUES(?,?,?,?,?,0,?,1,?,?)',
                            (name, sku, category, price*100, cost*100, reorder, desc, image)).lastrowid
            stock(c, pid, quantity, 'Demo opening stock')
            inserted += 1
    print(f'Catalog updated ({inserted} newly added products).')

if __name__=='__main__': seed()
