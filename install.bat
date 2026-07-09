@echo off

echo Installing dependencies from requirements.txt...
py -m pip install -r requirements.txt

echo.
echo Creating default config (asp_config.json)...
py "%~dp0asp_server.py" --init-config

echo.
echo Installation completed successfully.
pause