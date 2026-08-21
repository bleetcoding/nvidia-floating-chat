from pathlib import Path

from PIL import Image


source = Path("assets/images/icon.png")
output = Path("assets/images/icon.optimized.png")

with Image.open(source) as image:
    resized = image.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    optimized = resized.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    optimized.save(output, format="PNG", optimize=True)

print(output)
