# ASP Admin

Browser-based admin tool for AzerothCore 3.3.5a private servers (ASP).

This is open source. Feel free to expand or change it to you likings!
Just credit me

## Quickstart

1. **Run `install.bat`** — installs Python dependencies (Flask, pymysql).
2. **Run `start_WebsiteEditor.bat`** — starts the server once so the default `asp_config.json` gets created.
3. **Edit `asp_config.json`** — set your paths and DB credentials.
   - **Important:** use either `\\` (double backslash) or `/` (forward slash) in paths.
   - Example: `"C:\\Users\\Max\\Desktop\\ASP\\Server\\data\\dbc"` or `"C:/Users/Max/Desktop/ASP/Server/data/dbc"`
4. **Run `start_WebsiteEditor.bat`** again — browser opens automatically at `http://localhost:5000`.

## What's included

**View / Browse**
- World schema (items, spells, creatures, quests, loot, …)
- Live characters, accounts, guilds
- Auth realms, MoTD, autobroadcasts, IP-bans

**Editors** — Easy / Full / Pro modes for:
- Items
- Spells
- Start Spells (Only same class spells can be added)
- Creatures
- Quests
- Loot

**Creators** — build new content from scratch with templates + dropdowns:
- **Item Creator** (writes to DB + Item.dbc + MPQ patch, includes built-in MPQ packer/editor)
- **Spell Creator** (DoT / HoT / AoE / Buff / Heal templates)
- **Creature Creator** (Vendor / Trainer / Boss / Beast templates)
- **Quest Creator** (Kill / Gather / Daily / Group templates)

**Player tools**
- Start-Items / Start-Spells editor per Race+Class
- XP curve, Class/Race stats

## What's missing

- Playerbots tab is empty.
- DBA_Tool.py ect mentioned in TOOLS tab are not included!

## What's broken

- WORLD tab graphics are not updated.
- Spells creator not working yet
- Quest creator fails in you pick all classes / races

## Notes

- Some UI strings may be in german
- Item creator is the most advanced tool. Other tools will be updated.
- Worldserver reload (or restart) is required after most DB changes to take effect ingame.
- Client restart is required after MPQ patches.
