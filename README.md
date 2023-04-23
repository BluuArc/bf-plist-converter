# bf-plist-converter

Convert `.plist` files from the Brave Frontier Game to JSON and PNG/TIFF files.

Example command for single file conversion:

```bash
 node .\plist-converter.js -a "path\to\ffmpeg.exe" -p "path\to\somefile.plist"
```

Example command for batch conversion:

```bash
node .\plist-converter.js -a "path\to\ffmpeg.exe" -f "path\to\folder\containing\plist" -s
```