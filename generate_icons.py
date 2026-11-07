"""
Generate Windows 11 Fluent application icons for RBI Prep OS 2027.
Generates:
- assets/icons/app.ico (16, 24, 32, 48, 64, 128, 256)
- assets/icons/app-256.png
- assets/icons/app-512.png
- public/pwa-512x512.png
- public/pwa-192x192.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Colors
SAGE_PRIMARY = (66, 121, 104, 255)       # #427968
SAGE_DARK = (42, 79, 67, 255)            # #2a4f43
SAGE_LIGHT = (220, 235, 229, 255)        # #dcebe5
GOLD_ACCENT = (212, 163, 89, 255)        # #d4a359
GOLD_LIGHT = (245, 225, 185, 255)
BG_LIGHT = (248, 251, 249, 255)          # Crisp neutral background
BORDER_COLOR = (180, 205, 195, 255)
WHITE = (255, 255, 255, 255)

# Outer squircle container (Windows 11 app icon standard)
pad = 64
radius = 210

# Soft drop shadow for squircle
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(shadow)
sdraw.rounded_rectangle(
    [pad + 8, pad + 18, SIZE - pad + 8, SIZE - pad + 18],
    radius=radius,
    fill=(30, 60, 50, 45)
)
shadow = shadow.filter(ImageFilter.GaussianBlur(24))
img.paste(shadow, (0, 0), shadow)

# Main background rounded squircle
draw.rounded_rectangle(
    [pad, pad, SIZE - pad, SIZE - pad],
    radius=radius,
    fill=BG_LIGHT,
    outline=BORDER_COLOR,
    width=6
)

# Subtle inner gradient / glow ring
inner_pad = pad + 16
inner_radius = radius - 16
draw.rounded_rectangle(
    [inner_pad, inner_pad, SIZE - inner_pad, SIZE - inner_pad],
    radius=inner_radius,
    fill=None,
    outline=(255, 255, 255, 180),
    width=4
)

# Circular Sage Badge inside squircle
badge_cx, badge_cy = SIZE // 2, SIZE // 2 + 10
badge_r = 340
draw.ellipse(
    [badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r],
    fill=SAGE_PRIMARY
)

# Badge subtle rim
draw.ellipse(
    [badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r],
    fill=None,
    outline=SAGE_LIGHT,
    width=8
)

# Open Book Foundation (representing learning, curriculum, syllabus)
book_bottom = badge_cy + 190
book_spine_y = badge_cy + 130
book_top_y = badge_cy - 10
cx = SIZE // 2

# Left page
left_page = [
    (cx - 16, book_spine_y),
    (cx - 240, book_bottom - 40),
    (cx - 230, book_top_y + 40),
    (cx - 16, book_top_y + 90),
]
draw.polygon(left_page, fill=WHITE)
draw.line(left_page + [left_page[0]], fill=SAGE_LIGHT, width=5)

# Right page
right_page = [
    (cx + 16, book_spine_y),
    (cx + 240, book_bottom - 40),
    (cx + 230, book_top_y + 40),
    (cx + 16, book_top_y + 90),
]
draw.polygon(right_page, fill=WHITE)
draw.line(right_page + [right_page[0]], fill=SAGE_LIGHT, width=5)

# Page lines on left (representing structured notes)
draw.line([(cx - 190, book_top_y + 90), (cx - 50, book_top_y + 120)], fill=(180, 205, 195, 255), width=8)
draw.line([(cx - 180, book_top_y + 125), (cx - 50, book_top_y + 155)], fill=(180, 205, 195, 255), width=8)

# Page lines on right
draw.line([(cx + 50, book_top_y + 120), (cx + 190, book_top_y + 90)], fill=(180, 205, 195, 255), width=8)
draw.line([(cx + 50, book_top_y + 155), (cx + 180, book_top_y + 125)], fill=(180, 205, 195, 255), width=8)

# Central Columns / Pillars of RBI (Monetary policy, banking, governance)
col_w = 34
col_gap = 18
col_bottom = book_spine_y - 20
col_heights = [120, 175, 120]  # Left pillar, center peak, right pillar
col_xs = [cx - col_w - col_gap, cx, cx + col_w + col_gap]

# Left pillar
draw.rounded_rectangle(
    [col_xs[0] - col_w//2, col_bottom - col_heights[0], col_xs[0] + col_w//2, col_bottom],
    radius=10,
    fill=GOLD_ACCENT
)

# Right pillar
draw.rounded_rectangle(
    [col_xs[2] - col_w//2, col_bottom - col_heights[2], col_xs[2] + col_w//2, col_bottom],
    radius=10,
    fill=GOLD_ACCENT
)

# Center pillar (taller, leading upward)
draw.rounded_rectangle(
    [col_xs[1] - col_w//2, col_bottom - col_heights[1], col_xs[1] + col_w//2, col_bottom],
    radius=10,
    fill=GOLD_LIGHT
)

# Star of Academic Excellence at pinnacle
star_cx = cx
star_cy = col_bottom - col_heights[1] - 46
star_r1 = 52
star_r2 = 20

star_pts = []
import math
for i in range(8):
    angle = i * (math.pi / 4) - math.pi / 2
    r = star_r1 if i % 2 == 0 else star_r2
    star_pts.append((star_cx + r * math.cos(angle), star_cy + r * math.sin(angle)))

draw.polygon(star_pts, fill=WHITE)
draw.polygon(star_pts, outline=GOLD_ACCENT, fill=None)

# Center gold spark in star
draw.ellipse([star_cx - 10, star_cy - 10, star_cx + 10, star_cy + 10], fill=GOLD_ACCENT)

# Ensure target directories exist
os.makedirs("assets/icons", exist_ok=True)
os.makedirs("public", exist_ok=True)

# 1. assets/icons/app-512.png
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save("assets/icons/app-512.png", "PNG", optimize=True)
img_512.save("public/pwa-512x512.png", "PNG", optimize=True)

# 2. assets/icons/app-256.png
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
img_256.save("assets/icons/app-256.png", "PNG", optimize=True)

# 3. public/pwa-192x192.png
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save("public/pwa-192x192.png", "PNG", optimize=True)

# 4. Multi-resolution assets/icons/app.ico
# Windows requires 16, 24, 32, 48, 64, 128, 256
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(
    "assets/icons/app.ico",
    format="ICO",
    sizes=ico_sizes
)
# Also copy to public/favicon.ico
img.save(
    "public/favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)]
)

print("Icons generated successfully:")
print(" - assets/icons/app.ico (sizes: 16, 24, 32, 48, 64, 128, 256)")
print(" - assets/icons/app-256.png")
print(" - assets/icons/app-512.png")
print(" - public/pwa-512x512.png")
print(" - public/pwa-192x192.png")
print(" - public/favicon.ico")
