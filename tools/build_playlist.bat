@echo off
echo Installing metadata reader...
python -m pip install mutagen
echo Building music playlist...
python tools\build_playlist.py
echo.
echo Done. Check music\playlist.json
pause
