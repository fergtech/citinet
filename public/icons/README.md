# App Icons

## Convert SVG to PNG

Use the `app-icon.svg` file to generate the required PNG icons:

### Online Tools (Easiest):
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `app-icon.svg`
3. Convert to the following sizes:
   - **icon-192x192.png** - 192x192px
   - **icon-512x512.png** - 512x512px
   - **apple-touch-icon.png** - 180x180px

### Using Command Line (if you have sharp-cli):
```bash
npx sharp-cli --input app-icon.svg --output icon-192x192.png resize 192 192
npx sharp-cli --input app-icon.svg --output icon-512x512.png resize 512 512
npx sharp-cli --input app-icon.svg --output apple-touch-icon.png resize 180 180
```

### For favicon.ico:
Use https://favicon.io/ or https://realfavicongenerator.net/ to generate from the 512x512 PNG.

## Required Files:
- [ ] icon-192x192.png (192x192)
- [ ] icon-512x512.png (512x512)
- [ ] apple-touch-icon.png (180x180)
- [ ] favicon.ico (16x16, 32x32)
