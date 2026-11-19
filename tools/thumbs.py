#!/usr/bin/env python3
"""Card thumbnails for the places grid: public/places/<id>/thumb.jpg (480x360, cover crop)
from the first photo of every landmark in content/landmarks.json. Run from the project root."""
import json, os
from PIL import Image, ImageOps

data = json.load(open('content/landmarks.json', encoding='utf-8'))
items = data if isinstance(data, list) else data['landmarks']
for it in items:
    photos = it.get('photos') or []
    if not photos:
        continue
    src = 'public' + photos[0]['file']
    out = os.path.join(os.path.dirname(src), 'thumb.jpg')
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    # portrait photos: keep the upper part (towers, domes), not the pavement
    im = ImageOps.fit(im, (480, 360), Image.LANCZOS, centering=(0.5, 0.35 if im.height > im.width else 0.5))
    im.save(out, 'JPEG', quality=78, optimize=True, progressive=True)
    print(out, os.path.getsize(out))
