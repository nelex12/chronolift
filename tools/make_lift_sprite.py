"""Рисует спрайт лифта: game/Assets/Art/Sprites/lift_platform.png.

Плита со срезанными под 45 градусов нижними углами, под ней по центру циферблат.
Стрелок на картинке нет — их рисует и крутит игра (Gameplay/LiftPlatform.js), чтобы они
останавливались вместе со временем. Размеры в пикселях мира должны совпадать с LiftPlatform.js.

Запуск: python tools/make_lift_sprite.py  (нужен Pillow)
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

# размеры в пикселях мира (как в LiftPlatform.js)
PLATE_W, PLATE_H, CHAMFER = 128, 16, 7      # плита и срез нижних углов
DIAL_Y, DIAL_R = 25, 15                     # центр циферблата от верха плиты и радиус
MARGIN = 2                                  # прозрачный край вокруг
TEX = 3                                     # пикселей текстуры на пиксель мира (чёткость при увеличении)
SS = 4                                      # сглаживание: рисуем крупнее и уменьшаем

W = PLATE_W + 2 * MARGIN
H = DIAL_Y + DIAL_R + 2 * MARGIN
K = TEX * SS


def P(x, y):
    """точка мира (0,0 — верх плиты по центру) -> пиксель большого холста"""
    return ((x + W / 2) * K, (y + MARGIN) * K)


img = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# плита: верх прямой, нижние углы срезаны
hw = PLATE_W / 2
plate = [P(-hw, 0), P(hw, 0), P(hw, PLATE_H - CHAMFER), P(hw - CHAMFER, PLATE_H),
         P(-hw + CHAMFER, PLATE_H), P(-hw, PLATE_H - CHAMFER)]
mask = Image.new('L', img.size, 0)
ImageDraw.Draw(mask).polygon(plate, fill=255)
grad = Image.new('RGBA', img.size)
gd = ImageDraw.Draw(grad)
top, bot = (88, 104, 128), (34, 42, 56)     # сталь: светлее сверху
y0, y1 = P(0, 0)[1], P(0, PLATE_H)[1]
for y in range(int(y0), int(y1) + 1):
    t = (y - y0) / max(1, y1 - y0)
    gd.line([(0, y), (img.width, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bot)) + (255,))
img.paste(grad, (0, 0), mask)
d.polygon(plate, outline=(20, 26, 36, 255), width=K)

# блик по верхней кромке
d.line([P(-hw + 1, 0.8), P(hw - 1, 0.8)], fill=(176, 196, 222, 255), width=K)
# голубые полосы хроно-энергии по бокам от циферблата
for sx in (-1, 1):
    a, b = sorted((sx * (DIAL_R + 6), sx * (hw - 10)))
    d.rounded_rectangle([P(a, 6.5), P(b, 9)], radius=K, fill=(87, 242, 255, 255))
# заклёпки
for x in (-hw + 5, hw - 5):
    d.ellipse([P(x - 1.4, 4.5), P(x + 1.4, 7.3)], fill=(150, 168, 192, 255))

# циферблат: свечение, обод, тёмное поле, деления
cx, cy = P(0, DIAL_Y)
glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([cx - (DIAL_R + 3) * K, cy - (DIAL_R + 3) * K,
                              cx + (DIAL_R + 3) * K, cy + (DIAL_R + 3) * K], fill=(87, 242, 255, 90))
img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(2.5 * K)))
d = ImageDraw.Draw(img)
r = DIAL_R * K
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(143, 163, 189, 255))              # стальной обод
r2 = (DIAL_R - 2.2) * K
d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(87, 242, 255, 255))           # голубое кольцо
r3 = (DIAL_R - 3.2) * K
d.ellipse([cx - r3, cy - r3, cx + r3, cy + r3], fill=(11, 20, 32, 255))             # поле
for i in range(12):
    a = i * math.pi / 6
    major = i % 3 == 0
    ro, ri = (DIAL_R - 4.2) * K, (DIAL_R - (7.2 if major else 5.8)) * K
    d.line([(cx + math.sin(a) * ri, cy - math.cos(a) * ri), (cx + math.sin(a) * ro, cy - math.cos(a) * ro)],
           fill=(87, 242, 255, 255) if major else (74, 106, 133, 255), width=int(K * (1.3 if major else 0.9)))

out = img.resize((W * TEX, H * TEX), Image.LANCZOS)
path = os.path.join(os.path.dirname(__file__), '..', 'game', 'Assets', 'Art', 'Sprites', 'lift_platform.png')
out.save(path)
print('saved', os.path.normpath(path), out.size)
