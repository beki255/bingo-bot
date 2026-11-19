@echo off
title Tunnel Bingo - Live Database Studio (Render PostgreSQL)
echo ======================================================
echo    Connecting to Render PostgreSQL Database...
echo ======================================================
set DATABASE_URL=postgresql://bingo_bot_db_ke2x_user:FmXV3B7CEYu57x4dson3nroRT8eycbip@dpg-dbv29ujm8hqs738nqftg-a.frankfurt-postgres.render.com/bingo_bot_db_ke2x?sslmode=require
cd /d "%~dp0"
echo Opening Prisma Studio on http://localhost:5555 ...
pnpm --filter @bingo/server exec prisma studio --port 5555
pause
