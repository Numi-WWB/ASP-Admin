# ASP Admin

Browser-based admin tool for AzerothCore 3.3.5a private servers (ASP).
Made in / for https://github.com/kadeshar/ASP/releases

Join the ASP community discord https://discord.gg/wvdjmC3eab

## Quickstart

1. **Run `install.bat`** — installs the Python dependencies (Flask, pymysql) and creates a default `asp_config.json`.
2. **Edit `asp_config.json`** — set your DB credentials and paths (server DBC folder, WoW client Data folder, …). **All settings live in this one file** — there is no second config file.
   - **Important:** use either `\\` (double backslash) or `/` (forward slash) in paths.
   - Example: `"C:\\Users\\Max\\Desktop\\ASP\\Server\\data\\dbc"` or `"C:/Users/Max/Desktop/ASP/Server/data/dbc"`
3. **Run `start_WebsiteEditor.bat`** — the browser opens automatically at `http://localhost:5000`.
   (If `asp_config.json` is missing, it tells you to run `install.bat` first.)

## What's included

**View / Browse**
- World schema (item_template, spells, creatures, quests, loot, …)
- Live characters, accounts, guilds
- Auth realms, MoTD, autobroadcasts, IP-bans

**Editors** — Easy / Full / Pro modes for:
- Items
- Spells
- Talents
- Start Spells (Only same class spells can be added)
- Creatures
- Quests
- Loot

**Creators** — build new content from scratch with templates + dropdowns:
- **Item Creator** (writes to DB + Item.dbc + MPQ patch, includes built-in MPQ packer/editor)
- **Spell Creator** (DoT / HoT / AoE / Buff / Heal templates + build in MPQ patcher)
- **Creature Creator** (Vendor / Trainer / Boss / Beast templates)
- **Quest Creator** (Kill / Gather / Daily / Group templates)

**Player tools**
- Start-Items / Start-Spells editor per Race+Class
- XP curve, Class/Race stats

## What's broken

- WORLD tab graphics are not updated.
- Quest creator fails in you pick all classes / races

## Notes

- Some UI strings may be in german
- Item creator is the most advanced tool. Other tools will be updated.
- Worldserver reload (or restart) is required after most DB changes to take effect ingame.
- Client restart + deletion of "Cache" folder in WoW client folder is required after MPQ patches.
