"""
ASP SERVER — Flask Backend for den ASP Admin Editor
Runs auf localhost:5000, is being im Hintergrund gestartet.

Start:
    python asp_server.py

Routen:
    GET  /api/status                     → Server-Status
    GET  /api/spell/columns              → Debug: erkannte spell_dbc Spalten
    GET  /api/spell/search?q=            → Spells suchen
    GET  /api/spell/<id>                 → Spell + alle Override-Tabellen
    POST /api/spell/save                 → Overrides save
    DELETE /api/spell/<id>               → Alle Overrides delete
    GET  /api/quest/search?q=            → Quests suchen
    GET  /api/quest/<id>                 → Quest laden
    POST /api/quest/save                 → Quest save
    DELETE /api/quest/<id>               → Quest delete
    GET  /api/creature/search?q=         → Creatures suchen
    GET  /api/creature/<entry>           → Creature laden
    POST /api/creature/save              → Creature save
    DELETE /api/creature/<entry>         → Creature delete
    GET  /api/item/<entry>               → Item laden
    GET  /api/item/search?q=&limit=      → Items suchen
    POST /api/item/save                  → Item save (INSERT/UPDATE)
    DELETE /api/item/<entry>             → Item delete
"""

from flask import Flask, jsonify, request, send_from_directory
import pymysql
import pymysql.cursors
import os
import sys
import json
import webbrowser
import threading

# Static WoW 3.3.5a spell index (fallback when spell_dbc is empty/incomplete)
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from spell_static import search_static, get_static
    _STATIC_AVAILABLE = True
except ImportError:
    _STATIC_AVAILABLE = False
    def search_static(q, limit=50): return []
    def get_static(spell_id): return None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

# ── CONFIG: load from asp_config.json (auto-created on first run) ────────────
CONFIG_PATH = os.path.join(BASE_DIR, "asp_config.json")
CONFIG_DEFAULTS = {
    "db_host": "127.0.0.1",
    "db_port": 3306,
    "db_user": "acore",
    "db_password": "acore",
    "dbc_server_path": "",     # Path to AzerothCore server's data/dbc — empty = auto-detect siblings
    "dbc_client_path": "",     # Path to WoW client's Data/<locale>/dbc (optional)
    "mpq_output_dir":  os.path.join(BASE_DIR, "mpq"),
    "exports_dir":     BASE_DIR,   # Where ScalingStat CSVs live (defaults to script folder)
}

def _config_load():
    cfg = dict(CONFIG_DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception as e:
            print(f"  ⚠  Could not read asp_config.json: {e} — using defaults")
    else:
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2)
            print(f"  ℹ  Created default config: {CONFIG_PATH}")
        except Exception:
            pass
    return cfg

CONFIG = _config_load()

# ── DB CONFIG ────────────────────────────────────────────────────────────────

DB_CONFIG = {
    "host":        CONFIG["db_host"],
    "user":        CONFIG["db_user"],
    "password":    CONFIG["db_password"],
    "port":        int(CONFIG["db_port"]),
    "database":    "acore_world",
    "cursorclass": pymysql.cursors.DictCursor,
    "charset":     "utf8mb4",
}

# ── DB HELPERS ───────────────────────────────────────────────────────────────

def get_conn():
    return pymysql.connect(**DB_CONFIG)


def query(sql, params=None, one=False):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchone() if one else cur.fetchall()
    finally:
        conn.close()


def execute(sql, params=None):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            conn.commit()
            return cur.rowcount
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ok(data=None, **kwargs):
    payload = {"ok": True}
    if data is not None:
        payload["data"] = data
    payload.update(kwargs)
    return jsonify(payload)


def err(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code


def upsert(table, pk_col, pk_val, fields):
    """INSERT or UPDATE a row. Skips if fields is empty."""
    if not fields:
        return
    existing = query(
        f"SELECT `{pk_col}` FROM `{table}` WHERE `{pk_col}` = %s",
        [pk_val], one=True
    )
    if existing:
        set_clause = ", ".join(f"`{k}` = %s" for k in fields)
        execute(
            f"UPDATE `{table}` SET {set_clause} WHERE `{pk_col}` = %s",
            list(fields.values()) + [pk_val]
        )
    else:
        all_f = {pk_col: pk_val, **fields}
        cols  = ", ".join(f"`{k}`" for k in all_f)
        phs   = ", ".join(["%s"] * len(all_f))
        execute(
            f"INSERT INTO `{table}` ({cols}) VALUES ({phs})",
            list(all_f.values())
        )


# ── STATUS ───────────────────────────────────────────────────────────────────

@app.route("/api/status")
def status():
    try:
        row = query("SELECT COUNT(*) as cnt FROM item_template", one=True)
        return ok({"server": "online", "item_count": row["cnt"]})
    except Exception as e:
        return err(str(e), 500)


# ── SPELL: AUTO-DETECT COLUMNS ───────────────────────────────────────────────

# All known locale suffixes for Name/Description in spell_dbc
_NAME_LOCALES    = ["enUS", "deDE", "frFR", "ruRU", "esES", "esMX", "koKR",
                    "zhCN", "zhTW", "enGB", "enCN", "enTW", "itIT", "ptBR", "ptPT"]
_NAME_PREFIXES   = ["Name_Lang_", "SpellName_Lang_", "SpellName_"]
_DESC_PREFIXES   = ["Description_Lang_", "SpellDescription_Lang_", "ToolTip_Lang_", "AuraDescription_Lang_"]

_SPELL_SCHEMA    = {}
_TPL_NAME_COL    = None
_TPL_NAME_PROBED = False


def _spell_schema():
    """
    Detect spell_dbc columns. Builds a COALESCE expression covering all
    locale name columns so the search works regardless of which locale
    has data filled in.
    """
    global _SPELL_SCHEMA
    if _SPELL_SCHEMA:
        return _SPELL_SCHEMA

    try:
        col_rows = query("DESCRIBE spell_dbc")
    except Exception:
        _SPELL_SCHEMA = {"available": False}
        return _SPELL_SCHEMA

    cols = {r["Field"] for r in col_rows}

    # Collect ALL name locale columns that exist
    name_cols = []
    for prefix in _NAME_PREFIXES:
        for locale in _NAME_LOCALES:
            c = f"{prefix}{locale}"
            if c in cols:
                name_cols.append(c)
        # Also try bare prefix (e.g. "SpellName_0")
        for bare in ("SpellName_0", "Name", "name", "SpellName"):
            if bare in cols and bare not in name_cols:
                name_cols.append(bare)

    # Collect ALL description locale columns
    desc_cols = []
    for prefix in _DESC_PREFIXES:
        for locale in _NAME_LOCALES:
            c = f"{prefix}{locale}"
            if c in cols:
                desc_cols.append(c)

    if not name_cols:
        _SPELL_SCHEMA = {"available": False, "reason": "no name columns found", "cols": sorted(cols)[:20]}
        return _SPELL_SCHEMA

    # Build COALESCE expressions for name and description
    # NULLIF(col,'') treats empty strings as NULL so COALESCE skips them
    def coalesce_expr(col_list, alias):
        nullif_parts = ", ".join(f"NULLIF(`{c}`, '')" for c in col_list)
        return f"COALESCE({nullif_parts}) AS {alias}"

    name_expr = coalesce_expr(name_cols, "spell_name")
    desc_expr = coalesce_expr(desc_cols, "spell_desc") if desc_cols else None

    # WHERE clause: at least one name col is non-empty
    name_where = " OR ".join(
        f"(`{c}` IS NOT NULL AND `{c}` != '')" for c in name_cols
    )

    # Primary name col for exact-match WHERE (prefer enUS, fallback to first found)
    primary_name = next(
        (c for c in name_cols if "enUS" in c),
        name_cols[0]
    )

    _SPELL_SCHEMA = {
        "available":    True,
        "name_cols":    name_cols,
        "name_expr":    name_expr,
        "desc_expr":    desc_expr,
        "name_where":   name_where,
        "primary_name": primary_name,
        "has_school":   "SchoolMask" in cols,
        "has_mana":     "ManaCost"   in cols,
    }
    return _SPELL_SCHEMA


def _tpl_name_col():
    """Detect and cache spell_template name column."""
    global _TPL_NAME_COL, _TPL_NAME_PROBED
    if _TPL_NAME_PROBED:
        return _TPL_NAME_COL
    _TPL_NAME_PROBED = True
    for candidate in ("Name", "name", "SpellName"):
        try:
            query(f"SELECT `{candidate}` FROM spell_template LIMIT 0")
            _TPL_NAME_COL = candidate
            return _TPL_NAME_COL
        except Exception:
            pass
    return None


_TPL_COLS_CACHE = None

def _tpl_cols():
    """Return set of actual spell_template column names (cached). Empty set if table missing."""
    global _TPL_COLS_CACHE
    if _TPL_COLS_CACHE is not None:
        return _TPL_COLS_CACHE
    try:
        rows = query("DESCRIBE spell_template")
        _TPL_COLS_CACHE = {r["Field"] for r in rows}
    except Exception:
        _TPL_COLS_CACHE = set()
    return _TPL_COLS_CACHE


def _spell_select():
    """Build SELECT clause for spell_dbc using COALESCE over all locale columns."""
    sc = _spell_schema()
    if not sc.get("available"):
        return None
    parts = ["ID", sc["name_expr"]]
    if sc.get("desc_expr"):
        parts.append(sc["desc_expr"])
    if sc.get("has_school"):
        parts.append("SchoolMask")
    if sc.get("has_mana"):
        parts.append("ManaCost")
    return ", ".join(parts)


# ── SPELL ROUTES ─────────────────────────────────────────────────────────────

@app.route("/api/spell/icons")
def get_spell_icons():
    """Return {spellId: iconName} for given spell IDs. Uses DBC RAM cache."""
    ids_str = request.args.get("ids", "")
    if not ids_str:
        return ok({})
    try:
        spell_ids = [int(x) for x in ids_str.split(",") if x.strip().isdigit()]
    except Exception:
        return err("Invalid ids")
    if not spell_ids:
        return ok({})
    result = {}
    for sid in spell_ids:
        icon = _DBC_SPELL_ICON_MAP.get(sid) or (_DBC_SPELL_DATA.get(sid) or {}).get("icon", "")
        if icon and icon != "inv_misc_questionmark":
            result[sid] = icon
    return ok(result)


@app.route("/api/item/icons/bulk", methods=["POST"])
def get_item_icons_bulk():
    """POST {ids: [entry1, entry2, ...]} → {entry: wowhead_icon_name}.
    Looks up item_template.displayid → ItemDisplayInfo.dbc → icon name."""
    data = request.get_json() or {}
    entry_ids = [int(i) for i in data.get("ids", []) if str(i).isdigit()]
    if not entry_ids:
        return ok({})
    result = {}
    try:
        ph = ",".join(["%s"] * len(entry_ids))
        rows = query(
            f"SELECT entry, displayid FROM item_template WHERE entry IN ({ph})",
            entry_ids
        )
        for row in rows:
            did  = row.get("displayid") or 0
            icon = _DBC_ITEM_ICON_MAP.get(did, "")
            if icon:
                result[row["entry"]] = icon
    except Exception as e:
        return err(str(e), 500)
    return ok(result)


@app.route("/api/spell/search")
def search_spells():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 50)), 200)
    if not q:
        return err("Kein Suchbegriff")

    seen    = {}   # ID → {name, rank, source}
    q_lower = q.lower()
    is_id   = q.isdigit()

    # ── 1. DBC RAM cache (primary — full names + ranks for all spells) ────────
    if _DBC_SPELL_DATA:
        if is_id:
            sid = int(q)
            d = _DBC_SPELL_DATA.get(sid)
            if d:
                seen[sid] = {"name": d.get("name") or f"Spell #{sid}",
                             "rank": d.get("rank",""), "source": "dbc"}
        else:
            matches = []
            for sid, d in _DBC_SPELL_DATA.items():
                name = d.get("name","")
                if not name:
                    continue
                nl = name.lower()
                if q_lower in nl:
                    # Exact > startswith > contains
                    score = 0 if nl == q_lower else (1 if nl.startswith(q_lower) else 2)
                    matches.append((score, sid, name, d.get("rank","")))
            matches.sort(key=lambda x: (x[0], x[1]))
            for score, sid, name, rank in matches[:limit * 2]:
                seen[sid] = {"name": name, "rank": rank, "source": "dbc"}

    # ── 2. spell_template (custom server overrides — may have unique names) ──
    tnc = _tpl_name_col()
    if tnc and len(seen) < limit:
        try:
            if is_id:
                rows = query(f"SELECT ID, `{tnc}` AS n FROM spell_template WHERE ID=%s LIMIT 1", [int(q)])
            else:
                rows = query(f"SELECT ID, `{tnc}` AS n FROM spell_template WHERE `{tnc}` LIKE %s ORDER BY ID LIMIT %s",
                             [f"%{q}%", limit])
            for r in rows:
                rid, name = r["ID"], r.get("n","")
                if name:
                    if rid not in seen:
                        seen[rid] = {"name": name, "rank": "", "source": "template"}
                    else:
                        seen[rid]["name"] = name  # template overrides DBC name
        except Exception:
            pass

    # ── 3. ID-only: confirm existence in spell_dbc table ─────────────────────
    if is_id and not seen:
        sid = int(q)
        try:
            if query("SELECT ID FROM spell_dbc WHERE ID=%s LIMIT 1", [sid], one=True):
                seen[sid] = {"name": f"Spell #{sid}", "rank": "", "source": "db_id"}
        except Exception:
            pass

    # ── 4. Static fallback ────────────────────────────────────────────────────
    if _STATIC_AVAILABLE and len(seen) < limit:
        for hit in search_static(q, limit=(limit-len(seen))*2):
            rid = hit["ID"]
            if rid not in seen:
                seen[rid] = {"name": hit["name"], "rank": "", "source": "static"}
            if len(seen) >= limit:
                break

    if not seen:
        return ok([])

    def sort_key(item):
        sid, v = item
        nl = v["name"].lower()
        score = 0 if nl == q_lower else (1 if nl.startswith(q_lower) else 2)
        return (score, sid)

    result = [{"ID": k, "name": v["name"], "rank": v.get("rank",""), "source": v["source"]}
              for k, v in sorted(seen.items(), key=sort_key)]
    return ok(result[:limit])


@app.route("/api/spell/<int:spell_id>")
def get_spell(spell_id):
    def safe_query(sql, params, one=True):
        try:
            return query(sql, params, one=one)
        except Exception:
            return None

    # ── spell_template (primary — custom overrides) ────────────────────────
    tpl = safe_query("SELECT * FROM spell_template WHERE ID = %s", [spell_id])

    # ── spell_dbc (COALESCE name from all locales) ─────────────────────────
    dbc = None
    sel = _spell_select()
    if sel:
        try:
            dbc = query(f"SELECT {sel} FROM spell_dbc WHERE ID = %s", [spell_id], one=True)
        except Exception:
            pass

    # ── static fallback ────────────────────────────────────────────────────
    static_data = get_static(spell_id) if _STATIC_AVAILABLE else None

    # ── DBC RAM cache (primary — all ~60k spells with full data) ──────────
    dbc_cached = _DBC_SPELL_DATA.get(spell_id, {})

    if not tpl and not dbc and not static_data and not dbc_cached:
        return err(f"Spell {spell_id} not found", 404)

    src_label = "template" if tpl else ("dbc_ram" if dbc_cached else ("dbc" if dbc else "static"))
    data = {"ID": spell_id, "Name_Lang_enUS": "", "Description_Lang_enUS": "",
            "SchoolMask": 0, "ManaCost": 0, "_source": src_label}

    # Apply in order: static → dbc_ram → db_dbc → template (template wins)
    if static_data:
        data["Name_Lang_enUS"] = static_data.get("Name_Lang_enUS", "")
        data["SchoolMask"]     = static_data.get("SchoolMask", 0)

    if dbc_cached:
        data["Name_Lang_enUS"]        = dbc_cached.get("name") or data["Name_Lang_enUS"]
        data["Description_Lang_enUS"] = dbc_cached.get("desc") or ""
        data["NameSubtext_Lang_enUS"] = dbc_cached.get("rank") or ""
        data["SchoolMask"]            = dbc_cached.get("school_mask") or data["SchoolMask"]
        data["ManaCost"]              = dbc_cached.get("mana_cost") or 0
        data["CastingTimeIndex"]      = dbc_cached.get("cast_index") or 0
        data["DurationIndex"]         = dbc_cached.get("duration_idx") or 0
        data["RangeIndex"]            = dbc_cached.get("range_index") or 0
        data["PowerType"]             = dbc_cached.get("power_type") or 0
        data["RecoveryTime"]          = dbc_cached.get("recovery_ms") or 0
        data["SpellIconID"]           = dbc_cached.get("icon_id") or 0
        data["_icon"]                 = _DBC_SPELL_ICON_MAP.get(spell_id, "")

    if dbc:
        data["Name_Lang_enUS"]        = dbc.get("spell_name") or data["Name_Lang_enUS"]
        data["Description_Lang_enUS"] = dbc.get("spell_desc") or data["Description_Lang_enUS"]
        data["SchoolMask"]            = dbc.get("SchoolMask", 0) or data["SchoolMask"]
        data["ManaCost"]              = dbc.get("ManaCost", 0) or data["ManaCost"]

    if tpl:
        for k, v in tpl.items():
            if k == "ID": continue
            data["tpl_Comment" if k == "Comment" else k] = v
        tpl_name = tpl.get("Name") or tpl.get("name")
        if tpl_name:
            data["Name_Lang_enUS"] = tpl_name
        tpl_desc = tpl.get("Description") or tpl.get("description")
        if tpl_desc:
            data["Description_Lang_enUS"] = tpl_desc
        elif not data["Name_Lang_enUS"]:
            data["Name_Lang_enUS"] = f"Spell #{spell_id}"

    threat = safe_query("SELECT flatMod, pctMod FROM spell_threat WHERE entry = %s", [spell_id])
    if threat:
        data.update(threat)

    bonus = safe_query(
        "SELECT direct_bonus, dot_bonus, ap_bonus, ap_dot_bonus "
        "FROM spell_bonus_data WHERE entry = %s", [spell_id])
    if bonus:
        data.update(bonus)

    proc = safe_query("SELECT * FROM spell_proc WHERE SpellId = %s", [spell_id])
    if proc:
        data.update({k: v for k, v in proc.items() if k != "SpellId"})

    cd = safe_query(
        "SELECT RecoveryTime, CategoryRecoveryTime, StartRecoveryTime, "
        "Comment AS cd_Comment FROM spell_cooldown_overrides WHERE Id = %s", [spell_id])
    if cd:
        data.update(cd)

    return ok(data)


@app.route("/api/spell/save", methods=["POST"])
def save_spell():
    data = request.get_json()
    if not data:
        return err("Kein JSON-Body")
    spell_id = data.get("ID")
    if not spell_id:
        return err("'ID' missing")

    # Spell muss in spell_template, spell_dbc oder static index existieren
    in_template = query("SELECT ID FROM spell_template WHERE ID = %s", [spell_id], one=True)
    in_dbc = False
    if not in_template:
        try:
            in_dbc = bool(query("SELECT ID FROM spell_dbc WHERE ID = %s", [spell_id], one=True))
        except Exception:
            pass
    in_static = _STATIC_AVAILABLE and bool(get_static(spell_id))
    if not in_template and not in_dbc and not in_static:
        return err(f"Spell {spell_id} not found.", 404)

    upsert("spell_threat", "entry", spell_id,
           {k: data[k] for k in ("flatMod", "pctMod") if k in data})

    upsert("spell_bonus_data", "entry", spell_id,
           {k: data[k] for k in ("direct_bonus", "dot_bonus", "ap_bonus", "ap_dot_bonus")
            if k in data})

    proc_keys = ["SchoolMask", "SpellFamilyName", "SpellFamilyMask0",
                 "SpellFamilyMask1", "SpellFamilyMask2", "ProcFlags",
                 "SpellTypeMask", "SpellPhaseMask", "HitMask",
                 "ProcsPerMinute", "Chance", "Cooldown", "Charges"]
    upsert("spell_proc", "SpellId", spell_id,
           {k: data[k] for k in proc_keys if k in data})

    cd = {k: data[k] for k in ("RecoveryTime", "CategoryRecoveryTime", "StartRecoveryTime")
          if k in data}
    if "cd_Comment" in data:
        cd["Comment"] = data["cd_Comment"]
    upsert("spell_cooldown_overrides", "Id", spell_id, cd)

    # All editable spell_template fields (mirrors spell_dbc + custom overrides)
    TPL_FIELDS = [
        # Identity
        "Name", "Description",
        # Attributes (8 attribute words)
        "Attributes", "AttributesEx", "AttributesEx2", "AttributesEx3",
        "AttributesEx4", "AttributesEx5", "AttributesEx6", "AttributesEx7",
        # Category & School
        "Category", "Dispel", "Mechanic", "SchoolMask",
        # Stances
        "Stances", "StancesNot",
        # Targets
        "Targets", "TargetCreatureType", "RequiresSpellFocus", "FacingCasterFlags",
        # Aura conditions
        "CasterAuraState", "TargetAuraState", "CasterAuraStateNot", "TargetAuraStateNot",
        "CasterAuraSpell", "TargetAuraSpell", "ExcludeCasterAuraSpell", "ExcludeTargetAuraSpell",
        # Timing
        "CastingTimeIndex", "RecoveryTime", "CategoryRecoveryTime",
        "StartRecoveryCategory", "StartRecoveryTime",
        # Power
        "PowerType", "ManaCost", "ManaCostPerlevel", "ManaPerSecond",
        "ManaPerSecondPerLevel", "ManaCostPercentage", "RuneCostID",
        # Range & Speed
        "RangeIndex", "Speed",
        # Duration & Stack
        "DurationIndex", "StackAmount", "MaxAffectedTargets",
        # Level
        "SpellLevel", "BaseLevel", "MaxLevel", "MaxTargetLevel",
        # Proc
        "ProcChance", "ProcCharges",
        # Interrupt flags
        "InterruptFlags", "AuraInterruptFlags", "ChannelInterruptFlags",
        # Effects — 3 slots
        "Effect1", "Effect2", "Effect3",
        "EffectDieSides1", "EffectDieSides2", "EffectDieSides3",
        "EffectBasePoints1", "EffectBasePoints2", "EffectBasePoints3",
        "EffectRealPointsPerLevel1", "EffectRealPointsPerLevel2", "EffectRealPointsPerLevel3",
        "EffectMechanic1", "EffectMechanic2", "EffectMechanic3",
        "EffectImplicitTargetA1", "EffectImplicitTargetA2", "EffectImplicitTargetA3",
        "EffectImplicitTargetB1", "EffectImplicitTargetB2", "EffectImplicitTargetB3",
        "EffectRadiusIndex1", "EffectRadiusIndex2", "EffectRadiusIndex3",
        "EffectApplyAuraName1", "EffectApplyAuraName2", "EffectApplyAuraName3",
        "EffectAmplitude1", "EffectAmplitude2", "EffectAmplitude3",
        "EffectMultipleValue1", "EffectMultipleValue2", "EffectMultipleValue3",
        "EffectChainTarget1", "EffectChainTarget2", "EffectChainTarget3",
        "EffectMiscValue1", "EffectMiscValue2", "EffectMiscValue3",
        "EffectMiscValueB1", "EffectMiscValueB2", "EffectMiscValueB3",
        "EffectTriggerSpell1", "EffectTriggerSpell2", "EffectTriggerSpell3",
        "EffectPointsPerComboPoint1", "EffectPointsPerComboPoint2", "EffectPointsPerComboPoint3",
        "EffectItemType1", "EffectItemType2", "EffectItemType3",
        # SpellFamily
        "SpellFamilyName", "SpellFamilyFlags", "SpellFamilyFlags1", "SpellFamilyFlags2", "SpellFamilyFlags3",
        # Equipped item requirements
        "EquippedItemClass", "EquippedItemSubClassMask", "EquippedItemInventoryTypeMask",
        # Misc
        "DmgClass", "PreventionType", "LimitCategory", "AreaGroupId",
        "Totem1", "Totem2",
        "Reagent1", "Reagent2", "Reagent3", "Reagent4",
        "Reagent5", "Reagent6", "Reagent7", "Reagent8",
        "ReagentCount1", "ReagentCount2", "ReagentCount3", "ReagentCount4",
        "ReagentCount5", "ReagentCount6", "ReagentCount7", "ReagentCount8",
    ]
    # Remap _tpl-suffix aliases from frontend to canonical column names
    _ALIASES = {
        "ManaCostTpl":        "ManaCost",
        "CastingTimeIndex_tpl": "CastingTimeIndex",
        "DurationIndex_tpl":  "DurationIndex",
        "RangeIndex_tpl":     "RangeIndex",
    }
    for alias, canon in _ALIASES.items():
        if alias in data and canon not in data:
            data[canon] = data[alias]
    # Description from Name_Lang_enUS / Description_Lang_enUS
    if data.get("Description_Lang_enUS") is not None:
        data["Description"] = data["Description_Lang_enUS"]
    tpl_allowed = _tpl_cols()
    tpl = {k: data[k] for k in TPL_FIELDS if k in data and (not tpl_allowed or k in tpl_allowed)}
    tnc = _tpl_name_col() or "Name"
    if data.get("Name_Lang_enUS"):
        tpl[tnc] = data["Name_Lang_enUS"]
    if "tpl_Comment" in data:
        tpl["Comment"] = data["tpl_Comment"]
    upsert("spell_template", "ID", spell_id, tpl)

    return ok({"action": "saved", "ID": spell_id})


@app.route("/api/spell/<int:spell_id>", methods=["DELETE"])
def delete_spell(spell_id):
    count  = execute("DELETE FROM spell_threat WHERE entry = %s", [spell_id])
    count += execute("DELETE FROM spell_bonus_data WHERE entry = %s", [spell_id])
    count += execute("DELETE FROM spell_proc WHERE SpellId = %s", [spell_id])
    count += execute("DELETE FROM spell_cooldown_overrides WHERE Id = %s", [spell_id])
    count += execute("DELETE FROM spell_template WHERE ID = %s", [spell_id])
    return ok({"action": "deleted", "ID": spell_id, "rows_affected": count})


# ── ITEMS ────────────────────────────────────────────────────────────────────

@app.route("/api/item/<int:entry>")
def get_item(entry):
    row = query("SELECT * FROM item_template WHERE entry = %s", [entry], one=True)
    if not row:
        return err(f"Item {entry} not found", 404)
    return ok(row)


@app.route("/api/item/search")
def search_items():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 50)), 200)
    if not q:
        return err("Kein Suchbegriff angegeben")

    if q.isdigit():
        rows = query(
            "SELECT entry, name, Quality, class, subclass, InventoryType, ItemLevel "
            "FROM item_template WHERE entry = %s LIMIT 1",
            [int(q)]
        )
    else:
        rows = query(
            "SELECT entry, name, Quality, class, subclass, InventoryType, ItemLevel "
            "FROM item_template WHERE name LIKE %s ORDER BY Quality DESC, ItemLevel DESC LIMIT %s",
            [f"%{q}%", limit]
        )
    return ok(rows)


@app.route("/api/item/save", methods=["POST"])
def save_item():
    data = request.get_json()
    if not data:
        return err("Kein JSON-Body")
    entry = data.get("entry")
    if not entry:
        return err("'entry' missing")

    READONLY = {"entry", "VerifiedBuild"}
    fields = {k: v for k, v in data.items() if k not in READONLY}
    if not fields:
        return err("No fields zum Speichern")

    existing = query("SELECT entry FROM item_template WHERE entry = %s", [entry], one=True)
    if existing:
        set_clause = ", ".join(f"`{k}` = %s" for k in fields)
        execute(
            f"UPDATE item_template SET {set_clause} WHERE entry = %s",
            list(fields.values()) + [entry]
        )
        return ok({"action": "updated", "entry": entry})
    else:
        all_f = {"entry": entry, **fields}
        cols  = ", ".join(f"`{k}`" for k in all_f)
        phs   = ", ".join(["%s"] * len(all_f))
        execute(
            f"INSERT INTO item_template ({cols}) VALUES ({phs})",
            list(all_f.values())
        )
        return ok({"action": "inserted", "entry": entry})


@app.route("/api/item/<int:entry>", methods=["DELETE"])
def delete_item(entry):
    if entry < 100000:
        return err(
            f"Entry {entry} liegt unter 100000 — "
            "Delete verweigert. Setze entry >= 100000 for Custom-Items.", 403
        )
    rows = execute("DELETE FROM item_template WHERE entry = %s", [entry])
    if rows == 0:
        return err(f"Item {entry} not found", 404)
    return ok({"action": "deleted", "entry": entry})


# ── ITEMSETS ──────────────────────────────────────────────────────────────────

@app.route("/api/itemset/search")
def search_itemsets():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 20)), 50)
    if not q:
        return err("Kein Suchbegriff")
    try:
        if q.isdigit():
            rows = query(
                "SELECT ID, Name_Lang_enUS AS name, "
                "ItemID_1, ItemID_2, ItemID_3, ItemID_4, ItemID_5, ItemID_6, ItemID_7, ItemID_8, "
                "RequiredSkill, RequiredSkillRank "
                "FROM itemset_dbc WHERE ID = %s LIMIT 1",
                [int(q)]
            )
        else:
            rows = query(
                "SELECT ID, Name_Lang_enUS AS name, "
                "ItemID_1, ItemID_2, ItemID_3, ItemID_4, ItemID_5, ItemID_6, ItemID_7, ItemID_8, "
                "RequiredSkill, RequiredSkillRank "
                "FROM itemset_dbc WHERE Name_Lang_enUS LIKE %s ORDER BY Name_Lang_enUS LIMIT %s",
                [f"%{q}%", limit]
            )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/itemset/<int:set_id>")
def get_itemset(set_id):
    try:
        row = query("SELECT * FROM itemset_dbc WHERE ID = %s", [set_id], one=True)
        if not row:
            return err(f"ItemSet {set_id} not found", 404)
        data = dict(row)
        # Resolve all item IDs to names
        item_ids = [data.get(f"ItemID_{i}") for i in range(1, 18) if data.get(f"ItemID_{i}")]
        items = []
        if item_ids:
            placeholders = ",".join(["%s"] * len(item_ids))
            item_rows = query(
                f"SELECT entry, name, Quality, ItemLevel, RequiredLevel FROM item_template "
                f"WHERE entry IN ({placeholders})",
                item_ids
            )
            items = [dict(r) for r in item_rows]
        data["_items"] = items
        return ok(data)
    except Exception as e:
        return err(str(e), 500)


# ── QUESTS ───────────────────────────────────────────────────────────────────

@app.route("/api/quest/search")
def search_quests():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 50)), 200)
    if not q:
        return err("Kein Suchbegriff")

    if q.isdigit():
        rows = query(
            "SELECT ID, LogTitle, QuestLevel, QuestType "
            "FROM quest_template WHERE ID = %s LIMIT 1",
            [int(q)]
        )
    else:
        rows = query(
            "SELECT ID, LogTitle, QuestLevel, QuestType "
            "FROM quest_template WHERE LogTitle LIKE %s "
            "ORDER BY QuestLevel LIMIT %s",
            [f"%{q}%", limit]
        )
    return ok(rows)


@app.route("/api/quest/<int:quest_id>")
def get_quest(quest_id):
    row = query("SELECT * FROM quest_template WHERE ID = %s", [quest_id], one=True)
    if not row:
        return err(f"Quest {quest_id} not found", 404)
    data = dict(row)

    addon = query(
        "SELECT * FROM quest_template_addon WHERE ID = %s",
        [quest_id], one=True
    )
    if addon:
        data.update({k: v for k, v in addon.items() if k != "ID"})

    return ok(data)


@app.route("/api/quest/save", methods=["POST"])
def save_quest():
    data = request.get_json()
    if not data:
        return err("Kein JSON-Body")
    quest_id = data.get("ID")
    if not quest_id:
        return err("'ID' missing")

    TEMPLATE_FIELDS = [
        "QuestType", "QuestLevel", "MinLevel", "MaxLevel",
        "QuestSortID", "QuestInfoID", "Flags", "SpecialFlags",
        "LogTitle", "LogDescription", "QuestDescription",
        "AreaDescription", "QuestCompletionLog",
        "RequiredNpcOrGo1", "RequiredNpcOrGo2", "RequiredNpcOrGo3", "RequiredNpcOrGo4",
        "RequiredNpcOrGoCount1", "RequiredNpcOrGoCount2", "RequiredNpcOrGoCount3", "RequiredNpcOrGoCount4",
        "ObjectiveText1", "ObjectiveText2", "ObjectiveText3", "ObjectiveText4",
        "RequiredItemId1", "RequiredItemId2", "RequiredItemId3",
        "RequiredItemId4", "RequiredItemId5", "RequiredItemId6",
        "RequiredItemCount1", "RequiredItemCount2", "RequiredItemCount3",
        "RequiredItemCount4", "RequiredItemCount5", "RequiredItemCount6",
        "RewardChoiceItemId1", "RewardChoiceItemId2", "RewardChoiceItemId3",
        "RewardChoiceItemId4", "RewardChoiceItemId5", "RewardChoiceItemId6",
        "RewardChoiceItemCount1", "RewardChoiceItemCount2", "RewardChoiceItemCount3",
        "RewardChoiceItemCount4", "RewardChoiceItemCount5", "RewardChoiceItemCount6",
        "RewardItemId1", "RewardItemId2", "RewardItemId3", "RewardItemId4",
        "RewardItemCount1", "RewardItemCount2", "RewardItemCount3", "RewardItemCount4",
        "RewardXPDifficulty", "RewardMoney", "RewardBonusMoney",
        "RewardSpell", "RewardTitle", "RewardTalents",
        "RewardFactionId1", "RewardFactionId2", "RewardFactionId3",
        "RewardFactionId4", "RewardFactionId5",
        "RewardFactionValue1", "RewardFactionValue2", "RewardFactionValue3",
        "RewardFactionValue4", "RewardFactionValue5",
        "PortraitGiver", "PortraitTurnIn", "StartScript", "CompleteScript",
    ]
    ADDON_FIELDS = [
        "PrevQuestID", "NextQuestID", "ExclusiveGroup",
        "BreadcrumbForQuestId", "AllowableClasses", "SourceSpellID",
    ]

    tpl_data   = {k: data[k] for k in TEMPLATE_FIELDS if k in data}
    addon_data = {k: data[k] for k in ADDON_FIELDS if k in data}

    existing = query(
        "SELECT ID FROM quest_template WHERE ID = %s", [quest_id], one=True
    )
    if existing:
        if tpl_data:
            set_clause = ", ".join(f"`{k}` = %s" for k in tpl_data)
            execute(
                f"UPDATE quest_template SET {set_clause} WHERE ID = %s",
                list(tpl_data.values()) + [quest_id]
            )
        action = "updated"
    else:
        all_f = {"ID": quest_id, **tpl_data}
        cols  = ", ".join(f"`{k}`" for k in all_f)
        phs   = ", ".join(["%s"] * len(all_f))
        execute(
            f"INSERT INTO quest_template ({cols}) VALUES ({phs})",
            list(all_f.values())
        )
        action = "inserted"

    if addon_data:
        upsert("quest_template_addon", "ID", quest_id, addon_data)

    return ok({"action": action, "ID": quest_id})


@app.route("/api/quest/<int:quest_id>", methods=["DELETE"])
def delete_quest(quest_id):
    rows = execute("DELETE FROM quest_template WHERE ID = %s", [quest_id])
    if rows == 0:
        return err(f"Quest {quest_id} not found", 404)
    execute("DELETE FROM quest_template_addon WHERE ID = %s", [quest_id])
    return ok({"action": "deleted", "ID": quest_id})


# ── CREATURES ─────────────────────────────────────────────────────────────────

@app.route("/api/creature/search")
def search_creatures():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 50)), 200)
    if not q:
        return err("Kein Suchbegriff")

    if q.isdigit():
        rows = query(
            "SELECT entry, name, subname, minlevel, maxlevel, faction "
            "FROM creature_template WHERE entry = %s LIMIT 1",
            [int(q)]
        )
    else:
        rows = query(
            "SELECT entry, name, subname, minlevel, maxlevel, faction "
            "FROM creature_template WHERE name LIKE %s ORDER BY entry LIMIT %s",
            [f"%{q}%", limit]
        )
    return ok(rows)


@app.route("/api/creature/<int:entry>")
def get_creature(entry):
    row = query(
        "SELECT * FROM creature_template WHERE entry = %s", [entry], one=True
    )
    if not row:
        return err(f"Creature {entry} not found", 404)
    return ok(row)


@app.route("/api/creature/save", methods=["POST"])
def save_creature():
    data = request.get_json()
    if not data:
        return err("Kein JSON-Body")
    entry = data.get("entry")
    if not entry:
        return err("'entry' missing")

    READONLY = {"entry", "VerifiedBuild"}
    fields = {k: v for k, v in data.items() if k not in READONLY}

    existing = query(
        "SELECT entry FROM creature_template WHERE entry = %s", [entry], one=True
    )
    if existing:
        set_clause = ", ".join(f"`{k}` = %s" for k in fields)
        execute(
            f"UPDATE creature_template SET {set_clause} WHERE entry = %s",
            list(fields.values()) + [entry]
        )
        return ok({"action": "updated", "entry": entry})
    else:
        all_f = {"entry": entry, **fields}
        cols  = ", ".join(f"`{k}`" for k in all_f)
        phs   = ", ".join(["%s"] * len(all_f))
        execute(
            f"INSERT INTO creature_template ({cols}) VALUES ({phs})",
            list(all_f.values())
        )
        return ok({"action": "inserted", "entry": entry})


@app.route("/api/creature/<int:entry>", methods=["DELETE"])
def delete_creature(entry):
    if entry < 100000:
        return err(f"Entry {entry} < 100000 — Delete verweigert.", 403)
    rows = execute("DELETE FROM creature_template WHERE entry = %s", [entry])
    if rows == 0:
        return err(f"Creature {entry} not found", 404)
    return ok({"action": "deleted", "entry": entry})



# ── CHARACTERS ───────────────────────────────────────────────────────────────

CHARACTER_DB = "acore_characters"
AUTH_DB      = "acore_auth"

def qchar(sql, params=None, one=False):
    """Query acore_characters database."""
    import pymysql
    cfg = {**DB_CONFIG, "database": CHARACTER_DB}
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchone() if one else cur.fetchall()
    finally:
        conn.close()

def qauth(sql, params=None, one=False):
    """Query acore_auth database."""
    import pymysql
    cfg = {**DB_CONFIG, "database": AUTH_DB}
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchone() if one else cur.fetchall()
    finally:
        conn.close()

def exchar(sql, params=None):
    import pymysql
    cfg = {**DB_CONFIG, "database": CHARACTER_DB}
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            conn.commit()
            return cur.rowcount
    except:
        conn.rollback()
        raise
    finally:
        conn.close()

def exauth(sql, params=None):
    import pymysql
    cfg = {**DB_CONFIG, "database": AUTH_DB}
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            conn.commit()
            return cur.rowcount
    except:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.route("/api/character/search")
def search_characters():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 30)), 100)
    if not q:
        return err("Kein Suchbegriff")
    try:
        if q.isdigit():
            rows = qchar(
                "SELECT guid, name, race, class, level, zone, online, account "
                "FROM characters WHERE guid = %s LIMIT 1", [int(q)]
            )
        else:
            rows = qchar(
                "SELECT guid, name, race, class, level, zone, online, account "
                "FROM characters WHERE name LIKE %s AND deleteDate IS NULL "
                "ORDER BY level DESC LIMIT %s",
                [f"%{q}%", limit]
            )
        return ok(rows)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/character/<int:guid>")
def get_character(guid):
    try:
        char = qchar("SELECT * FROM characters WHERE guid = %s", [guid], one=True)
        if not char:
            return err(f"Character {guid} not found", 404)
        data = dict(char)

        # Account info from auth DB
        acc_id = data.get("account")
        if acc_id:
            try:
                acc = qauth(
                    "SELECT id, username, email, expansion, Flags, last_ip, last_login, "
                    "joindate, locked, totaltime FROM account WHERE id = %s",
                    [acc_id], one=True
                )
                if acc:
                    data["_account"] = {
                        k: str(v) if v is not None else None
                        for k, v in acc.items()
                        if k not in ("salt", "verifier", "session_key", "totp_secret")
                    }
                # GM level
                gm = qauth(
                    "SELECT gmlevel FROM account_access WHERE id = %s AND RealmID IN (-1, 1) "
                    "ORDER BY gmlevel DESC LIMIT 1",
                    [acc_id], one=True
                )
                data["_gmlevel"] = gm["gmlevel"] if gm else 0
                # Ban status
                ban = qauth(
                    "SELECT banreason, bannedby, unbandate, active FROM account_banned "
                    "WHERE id = %s AND active = 1 LIMIT 1",
                    [acc_id], one=True
                )
                data["_ban"] = dict(ban) if ban else None
            except Exception:
                pass

        # Character stats
        try:
            stats = qchar(
                "SELECT * FROM character_stats WHERE guid = %s", [guid], one=True
            )
            if stats:
                data["_stats"] = dict(stats)
        except Exception:
            pass

        # Equipped items (slots 0–18 are body equipment, bag 0)
        try:
            inv = qchar(
                "SELECT ci.bag, ci.slot, ci.item, ii.itemEntry, it.name, it.Quality, it.InventoryType "
                "FROM character_inventory ci "
                "JOIN item_instance ii ON ci.item = ii.guid "
                "LEFT JOIN acore_world.item_template it ON ii.itemEntry = it.entry "
                "WHERE ci.guid = %s AND ci.bag = 0 AND ci.slot BETWEEN 0 AND 18 "
                "ORDER BY ci.slot",
                [guid]
            )
            data["_equipped"] = [dict(r) for r in inv] if inv else []
        except Exception:
            data["_equipped"] = []

        return ok(data)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/character/<int:guid>/save", methods=["POST"])
def save_character(guid):
    data = request.get_json()
    if not data:
        return err("Kein JSON-Body")

    EDITABLE = {
        "name", "level", "xp", "money",
        "race", "class", "gender",
        "skin", "face", "hairStyle", "hairColor", "facialStyle",
        "playerFlags", "extra_flags", "at_login",
        "totalHonorPoints", "arenaPoints",
        "position_x", "position_y", "position_z", "map", "zone", "orientation",
        "health", "power1", "power2", "power3", "power4",
        "grantableLevels", "extraBonusTalentCount",
    }
    fields = {k: v for k, v in data.items() if k in EDITABLE}
    if not fields:
        return err("Keine editierbaren Felder")

    existing = qchar("SELECT guid FROM characters WHERE guid = %s", [guid], one=True)
    if not existing:
        return err(f"Character {guid} not found", 404)

    set_clause = ", ".join(f"`{k}` = %s" for k in fields)
    exchar(
        f"UPDATE characters SET {set_clause} WHERE guid = %s",
        list(fields.values()) + [guid]
    )
    return ok({"action": "updated", "guid": guid})


@app.route("/api/character/<int:guid>/inventory")
def get_character_inventory(guid):
    try:
        rows = qchar(
            "SELECT ci.bag, ci.slot, ci.item, ii.itemEntry, ii.count, "
            "it.name, it.Quality, it.InventoryType, it.ItemLevel, it.RequiredLevel "
            "FROM character_inventory ci "
            "JOIN item_instance ii ON ci.item = ii.guid "
            "LEFT JOIN acore_world.item_template it ON ii.itemEntry = it.entry "
            "WHERE ci.guid = %s ORDER BY ci.bag, ci.slot",
            [guid]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/character/<int:guid>/quests")
def get_character_quests(guid):
    try:
        rows = qchar(
            "SELECT qs.quest, qs.status, qs.explored, qs.timer, "
            "qt.LogTitle AS Title, qt.QuestType AS Type, qt.QuestLevel, qt.MinLevel "
            "FROM character_queststatus qs "
            "LEFT JOIN acore_world.quest_template qt ON qs.quest = qt.ID "
            "WHERE qs.guid = %s ORDER BY qs.status, qs.quest",
            [guid]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/character/<int:guid>/give_item", methods=["POST"])
def give_item_to_character(guid):
    """Add item to character's first available bag slot via item_instance + character_inventory."""
    data = request.get_json() or {}
    item_entry = data.get("item_entry")
    count = int(data.get("count", 1))
    if not item_entry:
        return err("'item_entry' missing")
    # Verify item exists
    item = query("SELECT entry, name FROM item_template WHERE entry = %s", [item_entry], one=True)
    if not item:
        return err(f"Item {item_entry} nicht in item_template")
    # Find free bag slot (bag=255 = backpack in char_inventory means direct bag=0)
    # Simplest: find max slot in bag=255 (inventory bag guid) + 1, cap at 15
    import random, time
    # Create item_instance
    item_guid = int(time.time() * 1000) % 2147483647
    try:
        exchar(
            "INSERT INTO item_instance (guid, itemEntry, owner_guid, creatorGuid, count) "
            "VALUES (%s, %s, %s, %s, %s)",
            [item_guid, item_entry, guid, guid, count]
        )
        # Find free backpack slot (bag=0, slots 23-38 are backpack)
        used = {r["slot"] for r in (qchar(
            "SELECT slot FROM character_inventory WHERE guid = %s AND bag = 0 "
            "AND slot BETWEEN 23 AND 38", [guid]) or [])}
        free_slot = next((s for s in range(23, 39) if s not in used), None)
        if free_slot is None:
            exchar("DELETE FROM item_instance WHERE guid = %s", [item_guid])
            return err("Kein freier Inventarplatz (Slots 23-38 voll)")
        exchar(
            "INSERT INTO character_inventory (guid, bag, slot, item) VALUES (%s, 0, %s, %s)",
            [guid, free_slot, item_guid]
        )
        return ok({"action": "item_given", "item_entry": item_entry,
                   "item_guid": item_guid, "slot": free_slot, "name": item.get("name","")})
    except Exception as e:
        return err(str(e), 500)


_LOCALES_ALL = ("enUS","enGB","deDE","frFR","esES","esMX","ruRU","itIT",
                "ptBR","ptPT","koKR","zhCN","zhTW","enCN","enTW")

def _coalesce_locales(alias, prefix):
    """Build COALESCE(NULLIF(prefix_<loc>,''), …) over all 15 locales."""
    parts = ", ".join(f"NULLIF({alias}.{prefix}_{loc},'')" for loc in _LOCALES_ALL)
    return f"COALESCE({parts})"

@app.route("/api/character/<int:guid>/spells")
def get_character_spells(guid):
    try:
        name_expr = _coalesce_locales("sd", "Name_Lang")
        rows = qchar(
            f"SELECT cs.spell, cs.specMask, {name_expr} AS spell_name "
            "FROM character_spell cs "
            "LEFT JOIN acore_world.spell_dbc sd ON cs.spell = sd.ID "
            "WHERE cs.guid = %s ORDER BY cs.spell",
            [guid]
        )
        result = []
        for r in rows:
            sid = r["spell"]
            d = _DBC_SPELL_DATA.get(sid) or {}
            name = r.get("spell_name") or d.get("name") or ""
            result.append({
                "spell":      sid,
                "specMask":   r["specMask"],
                "spell_name": name,
                "rank":       d.get("rank") or "",
                "icon":       _DBC_SPELL_ICON_MAP.get(sid, ""),
            })
        return ok(result)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/character/<int:guid>/spells/add", methods=["POST"])
def add_character_spell(guid):
    data = request.get_json()
    spell_id = data.get("spell_id") if data else None
    if not spell_id:
        return err("'spell_id' missing")
    existing = qchar(
        "SELECT spell FROM character_spell WHERE guid = %s AND spell = %s",
        [guid, spell_id], one=True
    )
    if existing:
        return ok({"action": "already_known", "spell": spell_id})
    exchar(
        "INSERT INTO character_spell (guid, spell, specMask) VALUES (%s, %s, 255)",
        [guid, spell_id]
    )
    return ok({"action": "added", "spell": spell_id})


@app.route("/api/character/<int:guid>/spells/<int:spell_id>", methods=["DELETE"])
def remove_character_spell(guid, spell_id):
    rows = exchar(
        "DELETE FROM character_spell WHERE guid = %s AND spell = %s",
        [guid, spell_id]
    )
    if rows == 0:
        return err(f"Spell {spell_id} not found", 404)
    return ok({"action": "removed", "spell": spell_id})


# ── ACCOUNTS ─────────────────────────────────────────────────────────────────

@app.route("/api/account/search")
def search_accounts():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 20)), 50)
    if not q:
        return err("Kein Suchbegriff")
    try:
        if q.isdigit():
            rows = qauth(
                "SELECT a.id, a.username, a.email, a.last_login, a.online, "
                "COALESCE(aa.gmlevel, 0) AS gmlevel "
                "FROM account a LEFT JOIN account_access aa ON a.id = aa.id "
                "AND aa.RealmID IN (-1,1) WHERE a.id = %s LIMIT 1",
                [int(q)]
            )
        else:
            rows = qauth(
                "SELECT a.id, a.username, a.email, a.last_login, a.online, "
                "COALESCE(aa.gmlevel, 0) AS gmlevel "
                "FROM account a LEFT JOIN account_access aa ON a.id = aa.id "
                "AND aa.RealmID IN (-1,1) WHERE a.username LIKE %s OR a.email LIKE %s "
                "ORDER BY a.id LIMIT %s",
                [f"%{q}%", f"%{q}%", limit]
            )
        return ok([{k: str(v) if v is not None else None for k, v in r.items()} for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/account/<int:account_id>")
def get_account(account_id):
    try:
        acc = qauth(
            "SELECT id, username, email, reg_mail, joindate, last_ip, last_login, "
            "expansion, Flags, locked, lock_country, totaltime, online "
            "FROM account WHERE id = %s",
            [account_id], one=True
        )
        if not acc:
            return err(f"Account {account_id} not found", 404)
        data = {k: str(v) if v is not None else None for k, v in acc.items()}

        # GM level
        gm = qauth(
            "SELECT gmlevel FROM account_access WHERE id = %s AND RealmID IN (-1,1) "
            "ORDER BY gmlevel DESC LIMIT 1",
            [account_id], one=True
        )
        data["gmlevel"] = gm["gmlevel"] if gm else 0

        # Ban info
        ban = qauth(
            "SELECT banreason, bannedby, unbandate, active FROM account_banned "
            "WHERE id = %s ORDER BY bandate DESC LIMIT 1",
            [account_id], one=True
        )
        data["_ban"] = dict(ban) if ban else None

        # Characters on this account
        try:
            chars = qchar(
                "SELECT guid, name, race, class, level, online FROM characters "
                "WHERE account = %s AND deleteDate IS NULL ORDER BY level DESC",
                [account_id]
            )
            data["_characters"] = [dict(c) for c in chars]
        except Exception:
            data["_characters"] = []

        return ok(data)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/account/<int:account_id>/gmlevel", methods=["POST"])
def set_gmlevel(account_id):
    data = request.get_json()
    level = data.get("level", 0) if data else 0
    try:
        if level == 0:
            exauth("DELETE FROM account_access WHERE id = %s AND RealmID = -1", [account_id])
        else:
            existing = qauth(
                "SELECT id FROM account_access WHERE id = %s AND RealmID = -1",
                [account_id], one=True
            )
            if existing:
                exauth("UPDATE account_access SET gmlevel = %s WHERE id = %s AND RealmID = -1",
                       [level, account_id])
            else:
                exauth("INSERT INTO account_access (id, gmlevel, RealmID) VALUES (%s, %s, -1)",
                       [account_id, level])
        return ok({"action": "updated", "id": account_id, "gmlevel": level})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/account/<int:account_id>/ban", methods=["POST"])
def ban_account(account_id):
    data = request.get_json() or {}
    reason = data.get("reason", "Banned by admin")
    duration = int(data.get("duration_days", 0))  # 0 = permanent
    import time
    now = int(time.time())
    unban = now + duration * 86400 if duration > 0 else 0
    try:
        exauth(
            "INSERT INTO account_banned (id, bandate, unbandate, bannedby, banreason, active) "
            "VALUES (%s, %s, %s, 'admin', %s, 1) "
            "ON DUPLICATE KEY UPDATE bandate=%s, unbandate=%s, banreason=%s, active=1",
            [account_id, now, unban, reason, now, unban, reason]
        )
        return ok({"action": "banned", "id": account_id})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/account/<int:account_id>/unban", methods=["POST"])
def unban_account(account_id):
    try:
        exauth(
            "UPDATE account_banned SET active = 0 WHERE id = %s AND active = 1",
            [account_id]
        )
        return ok({"action": "unbanned", "id": account_id})
    except Exception as e:
        return err(str(e), 500)

# ── PLAYER MODULE ────────────────────────────────────────────────────────────

@app.route("/api/player/createinfo/items/raw")
def debug_createinfo_items():
    """Debug: show first 50 rows of playercreateinfo_item with race/class values"""
    race = request.args.get("race")
    cls  = request.args.get("class")
    try:
        if race and cls:
            rows = query(
                "SELECT ci.race, ci.class, ci.itemid, ci.amount, it.name, it.InventoryType "
                "FROM playercreateinfo_item ci "
                "LEFT JOIN item_template it ON ci.itemid = it.entry "
                "ORDER BY ci.race, ci.class LIMIT 100"
            )
        else:
            rows = query(
                "SELECT ci.race, ci.class, ci.itemid, ci.amount, it.name, it.InventoryType "
                "FROM playercreateinfo_item ci "
                "LEFT JOIN item_template it ON ci.itemid = it.entry "
                "ORDER BY ci.race, ci.class LIMIT 100"
            )
        distinct = query(
            "SELECT DISTINCT race, class, COUNT(*) as cnt "
            "FROM playercreateinfo_item GROUP BY race, class ORDER BY race, class LIMIT 50"
        )
        return ok({
            "sample": [dict(r) for r in rows],
            "race_class_groups": [dict(r) for r in distinct],
            "total": len(rows)
        })
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/player/xp")
def get_player_xp():
    try:
        rows = query("SELECT Level, Experience FROM player_xp_for_level ORDER BY Level")
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/xp/save", methods=["POST"])
def save_player_xp():
    """Save one or many XP rows: [{Level, Experience}, ...]"""
    data = request.get_json()
    if not data or not isinstance(data, list):
        return err("Erwartet Liste von {Level, Experience}")
    try:
        for row in data:
            lvl = int(row["Level"])
            xp  = int(row["Experience"])
            execute(
                "INSERT INTO player_xp_for_level (Level, Experience) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE Experience = %s",
                [lvl, xp, xp]
            )
        return ok({"saved": len(data)})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/classstats")
def get_player_classstats():
    """Returns player_class_stats for all classes or a specific class."""
    cls = request.args.get("class")
    try:
        if cls:
            rows = query(
                "SELECT Class, Level, BaseHP, BaseMana, Strength, Agility, "
                "Stamina, Intellect, Spirit FROM player_class_stats "
                "WHERE Class = %s ORDER BY Level", [int(cls)]
            )
        else:
            rows = query(
                "SELECT Class, Level, BaseHP, BaseMana, Strength, Agility, "
                "Stamina, Intellect, Spirit FROM player_class_stats ORDER BY Class, Level"
            )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/classstats/save", methods=["POST"])
def save_player_classstats():
    """Save list of [{Class, Level, BaseHP, BaseMana, Strength, Agility, Stamina, Intellect, Spirit}]"""
    data = request.get_json()
    if not data or not isinstance(data, list):
        return err("Erwartet Liste von Stat-Rows")
    FIELDS = ["BaseHP", "BaseMana", "Strength", "Agility", "Stamina", "Intellect", "Spirit"]
    try:
        for row in data:
            cls = int(row["Class"]); lvl = int(row["Level"])
            updates = {f: int(row[f]) for f in FIELDS if f in row}
            if not updates:
                continue
            set_clause = ", ".join(f"`{k}` = %s" for k in updates)
            execute(
                f"UPDATE player_class_stats SET {set_clause} WHERE Class = %s AND Level = %s",
                list(updates.values()) + [cls, lvl]
            )
        return ok({"saved": len(data)})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/racestats")
def get_player_racestats():
    try:
        rows = query(
            "SELECT Race, Strength, Agility, Stamina, Intellect, Spirit "
            "FROM player_race_stats ORDER BY Race"
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/racestats/save", methods=["POST"])
def save_player_racestats():
    data = request.get_json()
    if not data or not isinstance(data, list):
        return err("Erwartet Liste von Rassen-Rows")
    FIELDS = ["Strength", "Agility", "Stamina", "Intellect", "Spirit"]
    try:
        for row in data:
            race = int(row["Race"])
            updates = {f: int(row[f]) for f in FIELDS if f in row}
            if not updates:
                continue
            set_clause = ", ".join(f"`{k}` = %s" for k in updates)
            execute(
                f"UPDATE player_race_stats SET {set_clause} WHERE Race = %s",
                list(updates.values()) + [race]
            )
        return ok({"saved": len(data)})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/createinfo")
def get_player_createinfo():
    try:
        rows = query(
            "SELECT race, class, map, zone, position_x, position_y, position_z, orientation "
            "FROM playercreateinfo ORDER BY race, class"
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/createinfo/save", methods=["POST"])
def save_player_createinfo():
    data = request.get_json()
    if not data:
        return err("Kein JSON-Body")
    race = int(data.get("race", 0)); cls = int(data.get("class", 0))
    if not race or not cls:
        return err("race und class required")
    FIELDS = ["map", "zone", "position_x", "position_y", "position_z", "orientation"]
    updates = {f: data[f] for f in FIELDS if f in data}
    if not updates:
        return err("No fields")
    try:
        existing = query(
            "SELECT race FROM playercreateinfo WHERE race = %s AND class = %s",
            [race, cls], one=True
        )
        if existing:
            set_clause = ", ".join(f"`{k}` = %s" for k in updates)
            execute(
                f"UPDATE playercreateinfo SET {set_clause} WHERE race = %s AND class = %s",
                list(updates.values()) + [race, cls]
            )
        else:
            all_fields = {"race": race, "class": cls, **updates}
            cols = ", ".join(f"`{k}`" for k in all_fields)
            vals = ", ".join(["%s"] * len(all_fields))
            execute(f"INSERT INTO playercreateinfo ({cols}) VALUES ({vals})", list(all_fields.values()))
        return ok({"action": "saved", "race": race, "class": cls})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/createinfo/items")
def get_createinfo_items():
    race = request.args.get("race")
    cls  = request.args.get("class")
    try:
        result = {"outfit": [], "custom": []}

        if race and cls:
            # ── 1) CharStartOutfit.dbc — start equipment (read-only) ────────
            # The DB table charstartoutfit_dbc is empty; read directly from the
            # DBC file (parsed into _CHAR_START_OUTFIT at startup).
            if not _CHAR_START_OUTFIT:
                _load_char_start_outfit()
            # Read directly from the first matching DBC record so duplicates
            # (multiple bag instances with the same itemid) are preserved per slot.
            seen_slots = []
            cso_indices = _CSO_INDEX.get((int(race), int(cls)), [])
            if cso_indices:
                rec = _CSO_RECORDS[cso_indices[0]]
                for slot_iid in rec["items"]:
                    if slot_iid != 0 and slot_iid < 0x80000000:
                        seen_slots.append(slot_iid)
            for iid in seen_slots:
                it = query(
                    "SELECT name, Quality, ItemLevel, RequiredLevel, displayid, InventoryType "
                    "FROM item_template WHERE entry = %s", [iid], one=True
                )
                displayid = it["displayid"] if it else 0
                result["outfit"].append({
                    "itemid": iid,
                    "amount": 1,
                    "InventoryType": it["InventoryType"] if it else 0,
                    "name":          it["name"]          if it else f"Item #{iid}",
                    "Quality":       it["Quality"]        if it else 1,
                    "ItemLevel":     it["ItemLevel"]      if it else 0,
                    "RequiredLevel": it["RequiredLevel"]  if it else 0,
                    "displayid":     displayid,
                    "icon":          _DBC_ITEM_ICON_MAP.get(displayid, ""),
                    "race": int(race),
                    "class": int(cls),
                    "_source": "dbc",
                })

            # ── 2) playercreateinfo_item — custom bag items (editable) ──────
            custom_rows = query(
                "SELECT ci.race, ci.class, ci.itemid, ci.amount, ci.Note, "
                "it.name, it.Quality, it.InventoryType, it.BagFamily, "
                "it.ItemLevel, it.RequiredLevel, it.displayid "
                "FROM playercreateinfo_item ci "
                "LEFT JOIN item_template it ON ci.itemid = it.entry "
                "WHERE (ci.race = 0 OR ci.race = %s) "
                "  AND (ci.class = 0 OR ci.class = %s) ORDER BY ci.itemid",
                [int(race), int(cls)]
            )
            for row in custom_rows:
                d = dict(row)
                displayid = d.get("displayid") or 0
                d["icon"] = _DBC_ITEM_ICON_MAP.get(displayid, "")
                d["_source"] = "custom"
                result["custom"].append(d)

        # ── combined flat list for legacy consumers ──────────────────────────
        combined = result["outfit"] + result["custom"]
        return ok({"outfit": result["outfit"], "custom": result["custom"], "data": combined})

    except Exception as e:
        return err(str(e), 500)


@app.route("/api/player/createinfo/items/add", methods=["POST"])
def add_createinfo_item():
    data = request.get_json() or {}
    race = int(data.get("race", 0)); cls = int(data.get("class", 0))
    itemid = int(data.get("itemid", 0)); amount = int(data.get("amount", 1))
    note = data.get("Note", "")
    if not race or not cls or not itemid:
        return err("race, class, itemid required")
    item = query("SELECT name FROM item_template WHERE entry = %s", [itemid], one=True)
    if not item:
        return err(f"Item {itemid} not found")
    try:
        execute(
            "INSERT INTO playercreateinfo_item (race, class, itemid, amount, Note) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE amount = %s, Note = %s",
            [race, cls, itemid, amount, note, amount, note]
        )
        return ok({"action": "added", "name": item["name"]})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/createinfo/items/delete", methods=["POST"])
def delete_createinfo_item():
    data = request.get_json() or {}
    race = int(data.get("race", 0)); cls = int(data.get("class", 0))
    itemid = int(data.get("itemid", 0))
    if not race or not cls or not itemid:
        return err("race, class, itemid required")
    try:
        rows = execute(
            "DELETE FROM playercreateinfo_item WHERE race = %s AND class = %s AND itemid = %s",
            [race, cls, itemid]
        )
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)

def _resolve_spell_names_bulk(spell_ids):
    """
    Resolve spell IDs to {id: {name, icon_id, desc, rank}}.
    Priority: DBC RAM cache → spell_template DB → spell_dbc DB.
    """
    if not spell_ids:
        return {}
    result = {}
    ids_list = list(spell_ids)

    # 1) DBC RAM cache (best source — full names, icons, descs)
    for sid in ids_list:
        d = _DBC_SPELL_DATA.get(sid)
        if d and d.get("name"):
            result[sid] = {
                "name":    d["name"],
                "icon_id": d.get("icon_id", 0),
                "desc":    d.get("desc", ""),
                "rank":    d.get("rank", ""),
            }

    # 2) spell_template for anything still missing
    missing = [s for s in ids_list if s not in result]
    if missing:
        tnc = _tpl_name_col()
        if tnc:
            try:
                ph = ",".join(["%s"] * len(missing))
                rows = query(f"SELECT ID, `{tnc}` AS n FROM spell_template WHERE ID IN ({ph})", missing)
                for r in rows:
                    if r["n"] and r["ID"] not in result:
                        result[r["ID"]] = {"name": r["n"], "icon_id": 0, "desc": "", "rank": ""}
            except Exception:
                pass

    # 3) Fallback: placeholder so the UI at least shows the ID
    for sid in ids_list:
        if sid not in result:
            result[sid] = {"name": f"Spell #{sid}", "icon_id": 0, "desc": "", "rank": ""}

    return result


def _racial_spells_from_dbc(race_id):
    if race_id <= 0:
        return []
    race_bit = 1 << (race_id - 1)
    result = []
    for row in _DBC.get("SkillLineAbility", {}).values():
        rm = row.get("race_mask", 0)
        cm = row.get("class_mask", 0)
        if (row.get("acquire_method", -1) == 0
                and rm != 0
                and (rm & race_bit)
                and cm == 0
                and row.get("spell", 0) > 0):
            result.append(row["spell"])
    return result


def _class_base_spells_from_dbc(class_id):
    if class_id <= 0:
        return []
    class_bit = 1 << (class_id - 1)
    result = []
    for row in _DBC.get("SkillLineAbility", {}).values():
        rm = row.get("race_mask", 0)
        cm = row.get("class_mask", 0)
        if (row.get("acquire_method", -1) == 0
                and cm != 0
                and (cm & class_bit)
                and rm == 0
                and row.get("spell", 0) > 0):
            result.append(row["spell"])
    return result


@app.route("/api/player/createinfo/spells/debug_names")
def debug_spell_names():
    """Debug: test name resolution for a few known spell IDs."""
    test_ids = [6603, 2973, 75, 20572, 585, 686, 403, 133]
    sc  = _spell_schema()
    tnc = _tpl_name_col()
    names = _resolve_spell_names_bulk(test_ids)
    return ok({
        "spell_schema_available": sc.get("available"),
        "spell_schema_reason": sc.get("reason"),
        "spell_schema_name_expr": sc.get("name_expr","")[:120] if sc.get("name_expr") else None,
        "spell_schema_name_cols": sc.get("name_cols", [])[:5],
        "tpl_name_col": tnc,
        "resolved": names,
        "test_ids": test_ids,
    })

@app.route("/api/player/createinfo/spells")
def get_createinfo_spells():
    race = request.args.get("race")
    cls  = request.args.get("class")
    raw_rows = []
    try:
        return _get_createinfo_spells_inner(race, cls)
    except Exception as e:
        import traceback
        return err(f"Spells Fehler: {str(e)} | {traceback.format_exc()[-300:]}", 500)

def _get_createinfo_spells_inner(race, cls):
    raw_rows = []  # collect all (spell_id, meta) first, then bulk-resolve names

    # Item-triggered spells that appear in action bar but are NOT class abilities
    _ITEM_SPELL_EXCLUDE = {6603, 8690}  # Hearthstone variants

    # ── Source 1: playercreateinfo_action (type=0 = spell buttons) ─────────
    try:
        if race and cls:
            action_rows = query(
                "SELECT race, class, action AS spell_id, button "
                "FROM playercreateinfo_action "
                "WHERE race = %s AND class = %s AND type = 0 ORDER BY button",
                [int(race), int(cls)]
            )
        else:
            action_rows = query(
                "SELECT race, class, action AS spell_id, button "
                "FROM playercreateinfo_action WHERE type = 0 ORDER BY race, class, button"
            )
        for row in action_rows:
            row = dict(row)
            if row["spell_id"] in _ITEM_SPELL_EXCLUDE:
                continue  # Skip item-triggered spells like Hearthstone
            raw_rows.append({
                "Spell": row["spell_id"],
                "racemask": 1 << (row["race"] - 1) if row["race"] > 0 else 0,
                "classmask": 1 << (row["class"] - 1) if row["class"] > 0 else 0,
                "_race": row["race"],
                "_class": row["class"],
                "_source": "action",
                "Note": None,
            })
    except Exception:
        pass

    # ── Source 2: playercreateinfo_cast_spell ───────────────────────────────
    try:
        if race and cls:
            race_bit  = 1 << (int(race) - 1)
            class_bit = 1 << (int(cls) - 1)
            cast_rows = query(
                "SELECT raceMask, classMask, spell, note "
                "FROM playercreateinfo_cast_spell "
                "WHERE (raceMask = 0 OR raceMask & %s) "
                "  AND (classMask = 0 OR classMask & %s)",
                [race_bit, class_bit]
            )
        else:
            cast_rows = query(
                "SELECT raceMask, classMask, spell, note FROM playercreateinfo_cast_spell"
            )
        for row in cast_rows:
            row = dict(row)
            raw_rows.append({
                "Spell": row["spell"],
                "racemask": row["raceMask"],
                "classmask": row["classMask"],
                "_race": 0,
                "_class": 0,
                "_source": "cast",
                "Note": row.get("note"),
            })
    except Exception:
        pass

    # ── Source 3: playercreateinfo_spell_custom ─────────────────────────────
    try:
        if race and cls:
            race_bit  = 1 << (int(race) - 1)
            class_bit = 1 << (int(cls) - 1)
            custom_rows = query(
                "SELECT cs.racemask, cs.classmask, cs.Spell, cs.Note, "
                "COALESCE(st.Name, sd.Name_Lang_enUS) AS spell_name "
                "FROM playercreateinfo_spell_custom cs "
                "LEFT JOIN spell_template st ON cs.Spell = st.ID "
                "LEFT JOIN spell_dbc sd ON cs.Spell = sd.ID "
                "WHERE (cs.racemask = 0 OR cs.racemask & %s) "
                "  AND (cs.classmask = 0 OR cs.classmask & %s) "
                "ORDER BY cs.Spell",
                [race_bit, class_bit]
            )
        else:
            custom_rows = query(
                "SELECT cs.racemask, cs.classmask, cs.Spell, cs.Note, "
                "COALESCE(st.Name, sd.Name_Lang_enUS) AS spell_name "
                "FROM playercreateinfo_spell_custom cs "
                "LEFT JOIN spell_template st ON cs.Spell = st.ID "
                "LEFT JOIN spell_dbc sd ON cs.Spell = sd.ID "
                "ORDER BY cs.racemask, cs.classmask, cs.Spell"
            )
        for row in custom_rows:
            row = dict(row)
            row["_source"] = "custom"
            row["_race"] = 0
            row["_class"] = 0
            raw_rows.append(row)
    except Exception as e:
        pass

    # ── Source 5: skilllineability_dbc (AcquireMethod=0 = auto-learned on login) ──
    # This covers: Auto Attack, weapon skills, racial passives (Hardiness, Axe Spec…)
    # that are NOT in playercreateinfo_action or _cast_spell
    try:
        existing_spells = {r["Spell"] for r in raw_rows}
        if race and cls:
            race_bit  = 1 << (int(race) - 1)
            class_bit = 1 << (int(cls) - 1)
            skill_rows = query(
                "SELECT sla.Spell, sla.RaceMask, sla.ClassMask "
                "FROM skilllineability_dbc sla "
                "WHERE sla.AcquireMethod = 0 "
                "  AND (sla.RaceMask = 0 OR sla.RaceMask & %s) "
                "  AND (sla.ClassMask = 0 OR sla.ClassMask & %s) "
                "  AND sla.Spell > 0",
                [race_bit, class_bit]
            )
        else:
            skill_rows = query(
                "SELECT sla.Spell, sla.RaceMask, sla.ClassMask "
                "FROM skilllineability_dbc sla "
                "WHERE sla.AcquireMethod = 0 AND sla.Spell > 0"
            )
        for row in skill_rows:
            sid = row["Spell"]
            if sid in existing_spells:
                continue  # already covered by action/cast/custom
            existing_spells.add(sid)
            raw_rows.append({
                "Spell":     sid,
                "racemask":  row["RaceMask"]  or 0,
                "classmask": row["ClassMask"] or 0,
                "_race":     0,
                "_class":    0,
                "_source":   "skill",
                "Note":      None,
            })
    except Exception:
        pass

    # ── Source 4: Racial spells from SkillLineAbility DBC ───────────────────
    if _DBC.get("SkillLineAbility"):
        if race:
            target_races = [int(race)]
        else:
            # All races present in ChrRaces DBC, fallback to 1-11
            target_races = [r for r in _DBC.get("ChrRaces", {}).keys() if r > 0] or list(range(1, 12))
        existing_spells_racial = {r["Spell"] for r in raw_rows}
        for r_id in target_races:
            for spell_id in _racial_spells_from_dbc(r_id):
                if spell_id in existing_spells_racial:
                    continue
                existing_spells_racial.add(spell_id)
                raw_rows.append({
                    "Spell":    spell_id,
                    "racemask": (1 << (r_id - 1)) if r_id > 0 else 0,
                    "classmask": 0,
                    "_race":    r_id,
                    "_class":   0,
                    "_source":  "racial",
                    "Note":     "Racial Passive",
                })

    # ── Source 6: playercreateinfo_skills (starting weapon/armor skills) ────
    # Returns skill entries — displayed separately from spells in the UI
    try:
        if race and cls:
            race_bit  = 1 << (int(race) - 1)
            class_bit = 1 << (int(cls) - 1)
            skill_rows = query(
                "SELECT pcs.raceMask, pcs.classMask, pcs.skill, pcs.rank, pcs.comment, "
                "COALESCE(sl.DisplayName_Lang_enUS, sl.DisplayName_Lang_enGB) AS skill_name "
                "FROM playercreateinfo_skills pcs "
                "LEFT JOIN skillline_dbc sl ON sl.ID = pcs.skill "
                "WHERE (pcs.raceMask = 0 OR pcs.raceMask & %s) "
                "  AND (pcs.classMask = 0 OR pcs.classMask & %s)",
                [race_bit, class_bit]
            )
        else:
            skill_rows = query(
                "SELECT pcs.raceMask, pcs.classMask, pcs.skill, pcs.rank, pcs.comment, "
                "COALESCE(sl.DisplayName_Lang_enUS, sl.DisplayName_Lang_enGB) AS skill_name "
                "FROM playercreateinfo_skills pcs "
                "LEFT JOIN skillline_dbc sl ON sl.ID = pcs.skill "
                "ORDER BY pcs.raceMask, pcs.classMask, pcs.skill"
            )
        for row in skill_rows:
            skill_id = row["skill"]
            name = (row.get("skill_name") or "").strip() or (
                _DBC.get("SkillLine", {}).get(skill_id, {}).get("name", "")
            ) or f"Skill #{skill_id}"
            raw_rows.append({
                "Spell":     skill_id,   # use skill ID as the display key
                "spell_name": name,
                "racemask":  row["raceMask"]  or 0,
                "classmask": row["classMask"] or 0,
                "_race":     0,
                "_class":    0,
                "_source":   "skill",
                "Note":      f"Rank {row['rank']}" if row.get("rank") else "Startwert",
                "_is_skill": True,
            })
    except Exception:
        pass

    # ── Source 7: Class-universal passives from SkillLineAbility DBC ───────────
    if cls and _DBC.get("SkillLineAbility"):
        cls_int = int(cls)
        existing_ids = {r["Spell"] for r in raw_rows}
        for sid in _class_base_spells_from_dbc(cls_int):
            if sid in existing_ids:
                continue
            raw_rows.append({
                "Spell":    sid,
                "racemask": 0,
                "classmask": (1 << (cls_int - 1)) if cls_int > 0 else 0,
                "_race":    0,
                "_class":   cls_int,
                "_source":  "action",
                "Note":     "Passiv",
            })

    # ── Deduplication: keep first-seen per Spell ID (priority by source order) ──
    # Source order ensures: action > cast > custom > skill(db) > racial > skill(line)
    seen_spell_ids = set()
    deduped = []
    for r in raw_rows:
        sid = r["Spell"]
        if sid not in seen_spell_ids:
            seen_spell_ids.add(sid)
            deduped.append(r)
    raw_rows = deduped

    # ── Bulk resolve all spell names in 1-2 queries ─────────────────────────
    # Only resolve actual spells — skill entries already have names
    all_spell_ids = list({r["Spell"] for r in raw_rows if not r.get("_is_skill")})
    name_map = _resolve_spell_names_bulk(all_spell_ids)

    result = []
    for r in raw_rows:
        sid = r["Spell"]
        if r.get("_is_skill"):
            sl = _DBC.get("SkillLine", {}).get(sid, {})
            icon_id = sl.get("icon_id", 0)
            r["icon_id"]   = icon_id
            r["icon"]      = _DBC_SPELL_ICON_MAP.get(icon_id, "")  # resolved from SpellIcon.dbc
            r["spell_desc"] = ""
            result.append(r)
            continue
        info = name_map.get(sid) or {}
        if not r.get("spell_name"):
            r["spell_name"] = info.get("name") if isinstance(info, dict) else (info or f"Spell #{sid}")
        icon_id         = info.get("icon_id", 0) if isinstance(info, dict) else 0
        r["icon_id"]    = icon_id
        r["icon"]       = _DBC_SPELL_ICON_MAP.get(sid, "")  # wowhead icon name
        r["spell_desc"] = info.get("desc",   "")  if isinstance(info, dict) else ""
        result.append(r)

    return ok(result)

@app.route("/api/player/createinfo/spells/add", methods=["POST"])
def add_createinfo_spell():
    data = request.get_json() or {}
    racemask  = int(data.get("racemask", 0))
    classmask = int(data.get("classmask", 0))
    spell     = int(data.get("spell", 0))
    note      = data.get("Note", "")
    if not spell:
        return err("spell required")
    try:
        execute(
            "INSERT INTO playercreateinfo_spell_custom (racemask, classmask, Spell, Note) "
            "VALUES (%s, %s, %s, %s) ON DUPLICATE KEY UPDATE Note = %s",
            [racemask, classmask, spell, note, note]
        )
        return ok({"action": "added", "spell": spell})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/player/createinfo/spells/delete", methods=["POST"])
def delete_createinfo_spell():
    data = request.get_json() or {}
    racemask  = int(data.get("racemask", 0))
    classmask = int(data.get("classmask", 0))
    spell     = int(data.get("spell", 0))
    if not spell:
        return err("spell required")
    try:
        rows = execute(
            "DELETE FROM playercreateinfo_spell_custom "
            "WHERE racemask = %s AND classmask = %s AND Spell = %s",
            [racemask, classmask, spell]
        )
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/player/spells/specmap")
def get_spec_spell_map():
    """Return spec names + first-rank talent spell IDs for client-side spec filtering."""
    class_id = request.args.get("class")
    if not class_id:
        return ok([])
    try:
        class_id = int(class_id)
        class_bit = 1 << (class_id - 1)
        tabs = query(
            "SELECT ID, Name_Lang_enUS FROM talenttab_dbc "
            "WHERE ClassMask & %s ORDER BY OrderIndex, ID",
            [class_bit]
        )
        result = []
        for tab in tabs:
            try:
                rows = query(
                    "SELECT RankID_0 FROM talent_dbc WHERE TalentTab = %s AND RankID_0 > 0",
                    [tab["ID"]]
                )
                spell_ids = [r["RankID_0"] for r in rows if r.get("RankID_0")]
            except Exception:
                spell_ids = []
            result.append({
                "name": (tab.get("Name_Lang_enUS") or "Spec").strip(),
                "spell_ids": spell_ids,
            })
        return ok(result)
    except Exception:
        return ok([])


# ── LOOT EDITOR ──────────────────────────────────────────────────────────────

LOOT_TABLES = [
    "creature_loot_template", "item_loot_template", "gameobject_loot_template",
    "skinning_loot_template", "pickpocketing_loot_template", "fishing_loot_template",
    "disenchant_loot_template", "spell_loot_template", "mail_loot_template",
    "reference_loot_template",
]

@app.route("/api/loot/<table>/<int:entry>")
def get_loot(table, entry):
    if table not in LOOT_TABLES:
        return err(f"Unknown loot table: {table}", 400)
    try:
        rows = query(
            f"SELECT lt.*, it.name AS item_name, it.Quality "
            f"FROM `{table}` lt "
            f"LEFT JOIN item_template it ON lt.Item = it.entry "
            f"WHERE lt.Entry = %s ORDER BY lt.GroupId, lt.Item",
            [entry]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/loot/<table>/add", methods=["POST"])
def add_loot_row(table):
    if table not in LOOT_TABLES:
        return err(f"Unknown loot table: {table}", 400)
    data = request.get_json() or {}
    entry   = int(data.get("Entry", 0))
    item    = int(data.get("Item", 0))
    if not entry or not item:
        return err("Entry und Item required")
    ref     = int(data.get("Reference", 0))
    chance  = float(data.get("Chance", 100.0))
    quest   = int(data.get("QuestRequired", 0))
    mode    = int(data.get("LootMode", 1))
    group   = int(data.get("GroupId", 0))
    minc    = int(data.get("MinCount", 1))
    maxc    = int(data.get("MaxCount", 1))
    comment = data.get("Comment", "")
    try:
        execute(
            f"INSERT INTO `{table}` (Entry, Item, Reference, Chance, QuestRequired, "
            f"LootMode, GroupId, MinCount, MaxCount, Comment) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            f"ON DUPLICATE KEY UPDATE Chance=%s, MinCount=%s, MaxCount=%s, Comment=%s",
            [entry, item, ref, chance, quest, mode, group, minc, maxc, comment,
             chance, minc, maxc, comment]
        )
        item_row = query("SELECT name FROM item_template WHERE entry = %s", [item], one=True)
        return ok({"action": "added", "item_name": item_row["name"] if item_row else f"#{item}"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/loot/<table>/delete", methods=["POST"])
def delete_loot_row(table):
    if table not in LOOT_TABLES:
        return err(f"Unknown loot table: {table}", 400)
    data = request.get_json() or {}
    entry = int(data.get("Entry", 0))
    item  = int(data.get("Item", 0))
    if not entry or not item:
        return err("Entry und Item required")
    try:
        rows = execute(f"DELETE FROM `{table}` WHERE Entry = %s AND Item = %s", [entry, item])
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)

LOOT_TEMPLATES = {
    "humanoid_mob": {
        "label":"👤 Humanoid Mob (Wolle, coins, kleine Chance Rare)",
        "rows":[
            {"Item":2589,"Chance":35.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Linen Cloth
            {"Item":2592,"Chance":15.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Wool Cloth
            {"Item":4306,"Chance":10.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Silk Cloth
            {"Item":14047,"Chance":5.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Runecloth
            {"Item":33470,"Chance":3.0,"MinCount":1,"MaxCount":1,"GroupId":1},  # Frostweave
        ],
    },
    "beast_basic": {
        "label":"🐺 Beast (Pelze, Fleisch, Knochen)",
        "rows":[
            {"Item":2934,"Chance":50.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Ruined Leather Scraps
            {"Item":2318,"Chance":30.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Light Leather
            {"Item":4234,"Chance":15.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Heavy Leather
            {"Item":33568,"Chance":5.0,"MinCount":1,"MaxCount":1,"GroupId":1},  # Borean Leather
        ],
    },
    "undead_basic": {
        "label":"💀 Undead (Stoff, Knochen, Quintessenzen)",
        "rows":[
            {"Item":2589,"Chance":20.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Linen
            {"Item":4306,"Chance":12.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Silk
            {"Item":14047,"Chance":5.0,"MinCount":1,"MaxCount":2,"GroupId":1},  # Runecloth
        ],
    },
    "boss_basic": {
        "label":"👑 Boss-Loot (3 Item-Gruppen + Gold)",
        "rows":[
            # Group 1: 1 item drops aus 3 (Equip)
            {"Item":0,"Reference":0,"Chance":-100.0,"GroupId":1,"MinCount":1,"MaxCount":1},
            # Group 2: 1 item drops aus 3 (Trade goods)
            {"Item":0,"Reference":0,"Chance":-100.0,"GroupId":2,"MinCount":1,"MaxCount":3},
        ],
        "note":"Stelle in Group 1 die Equip-Items rein; in Group 2 die Trade-Goods. Negative Chance = Gruppen-Wurf."
    },
    "empty_clear": {
        "label":"🧹 Leer (deletes alle Entries dieses Entries)",
        "rows":[],
        "clear": True,
    },
}

@app.route("/api/loot/templates")
def loot_templates_list():
    out = []
    for k, v in LOOT_TEMPLATES.items():
        out.append({"key": k, "label": v["label"], "rows": v["rows"],
                    "clear": v.get("clear", False), "note": v.get("note", "")})
    return ok(out)


@app.route("/api/loot/pick-source/<source_type>")
def loot_pick_source(source_type):
    """Find loot entry ID from a name. source_type: creature, item, gameobject."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return err("q required")
    try:
        if source_type == "creature":
            sql_id = "SELECT entry AS id, name, lootid FROM creature_template WHERE entry = %s"
            sql_nm = ("SELECT entry AS id, name, lootid FROM creature_template "
                      "WHERE name LIKE %s ORDER BY entry LIMIT 5")
            id_col = "lootid"
        elif source_type == "item":
            sql_id = "SELECT entry AS id, name FROM item_template WHERE entry = %s"
            sql_nm = ("SELECT entry AS id, name FROM item_template "
                      "WHERE name LIKE %s LIMIT 5")
            id_col = "id"
        elif source_type == "gameobject":
            sql_id = "SELECT entry AS id, name FROM gameobject_template WHERE entry = %s"
            sql_nm = ("SELECT entry AS id, name FROM gameobject_template "
                      "WHERE name LIKE %s LIMIT 5")
            id_col = "id"
        else:
            return err("Unknown source_type")
        if q.isdigit():
            row = query(sql_id, [int(q)], one=True)
            results = [row] if row else []
        else:
            results = query(sql_nm, [f"%{q}%"])
        out = []
        for r in (results or []):
            d = dict(r)
            d["lootEntry"] = d.get(id_col, d.get("id", 0))
            out.append(d)
        if not out:
            return err("Not found", 404)
        return ok(out)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/loot/<table>/copy", methods=["POST"])
def loot_copy_table(table):
    if table not in LOOT_TABLES:
        return err(f"Unknown loot table: {table}", 400)
    d = request.get_json() or {}
    src = int(d.get("source", 0)); dst = int(d.get("destination", 0))
    if not src or not dst:
        return err("source und destination required")
    if src == dst:
        return err("Source and destination are identical")
    try:
        rows = query(
            f"SELECT Item, Reference, Chance, QuestRequired, LootMode, GroupId, "
            f"MinCount, MaxCount, Comment FROM `{table}` WHERE Entry = %s",
            [src]
        )
        if not rows:
            return err(f"Source entry {src} has no entries", 404)
        count = 0
        for r in rows:
            execute(
                f"INSERT INTO `{table}` (Entry, Item, Reference, Chance, QuestRequired, "
                f"LootMode, GroupId, MinCount, MaxCount, Comment) "
                f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                f"ON DUPLICATE KEY UPDATE Chance=VALUES(Chance), MinCount=VALUES(MinCount), MaxCount=VALUES(MaxCount)",
                [dst, r["Item"], r["Reference"], r["Chance"], r["QuestRequired"],
                 r["LootMode"], r["GroupId"], r["MinCount"], r["MaxCount"], r["Comment"]]
            )
            count += 1
        return ok({"copied": count, "from": src, "to": dst})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/loot/<table>/clear", methods=["POST"])
def loot_clear_entry(table):
    if table not in LOOT_TABLES:
        return err(f"Unknown loot table: {table}", 400)
    d = request.get_json() or {}
    entry = int(d.get("Entry", 0))
    if not entry:
        return err("Entry required")
    try:
        rows = execute(f"DELETE FROM `{table}` WHERE Entry = %s", [entry])
        return ok({"deleted": rows})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/loot/<table>/save_row", methods=["POST"])
def save_loot_row(table):
    """Update a single loot row's fields."""
    if table not in LOOT_TABLES:
        return err(f"Unknown loot table: {table}", 400)
    data = request.get_json() or {}
    entry = int(data.get("Entry", 0)); item = int(data.get("Item", 0))
    if not entry or not item:
        return err("Entry und Item required")
    FIELDS = ["Reference", "Chance", "QuestRequired", "LootMode", "GroupId", "MinCount", "MaxCount", "Comment"]
    updates = {f: data[f] for f in FIELDS if f in data}
    if not updates:
        return err("No fields")
    try:
        set_clause = ", ".join(f"`{k}` = %s" for k in updates)
        execute(
            f"UPDATE `{table}` SET {set_clause} WHERE Entry = %s AND Item = %s",
            list(updates.values()) + [entry, item]
        )
        return ok({"action": "updated"})
    except Exception as e:
        return err(str(e), 500)


# ── NPC VENDOR ────────────────────────────────────────────────────────────────

@app.route("/api/npc/vendor/<int:entry>")
def get_npc_vendor(entry):
    try:
        rows = query(
            "SELECT nv.*, it.name, it.Quality, it.ItemLevel "
            "FROM npc_vendor nv "
            "LEFT JOIN item_template it ON nv.item = it.entry "
            "WHERE nv.entry = %s ORDER BY nv.slot, nv.item",
            [entry]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/npc/vendor/add", methods=["POST"])
def add_vendor_item():
    data = request.get_json() or {}
    entry  = int(data.get("entry", 0))
    item   = int(data.get("item", 0))
    if not entry or not item:
        return err("entry und item required")
    slot     = int(data.get("slot", 0))
    maxcount = int(data.get("maxcount", 0))
    incrtime = int(data.get("incrtime", 0))
    extcost  = int(data.get("ExtendedCost", 0))
    item_row = query("SELECT name FROM item_template WHERE entry = %s", [item], one=True)
    if not item_row:
        return err(f"Item {item} not found")
    try:
        execute(
            "INSERT INTO npc_vendor (entry, slot, item, maxcount, incrtime, ExtendedCost) "
            "VALUES (%s,%s,%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE slot=%s, maxcount=%s, incrtime=%s, ExtendedCost=%s",
            [entry, slot, item, maxcount, incrtime, extcost,
             slot, maxcount, incrtime, extcost]
        )
        return ok({"action": "added", "name": item_row["name"]})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/npc/vendor/delete", methods=["POST"])
def delete_vendor_item():
    data = request.get_json() or {}
    entry = int(data.get("entry", 0)); item = int(data.get("item", 0))
    if not entry or not item:
        return err("entry und item required")
    try:
        rows = execute("DELETE FROM npc_vendor WHERE entry = %s AND item = %s", [entry, item])
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)


# ── NPC TRAINER ───────────────────────────────────────────────────────────────

@app.route("/api/npc/trainer/<int:entry>")
def get_npc_trainer(entry):
    """Get trainer data - entry is creature entry, links via creature_default_trainer."""
    try:
        # Get trainer IDs linked to this creature
        links = query(
            "SELECT TrainerId FROM creature_default_trainer WHERE CreatureId = %s",
            [entry]
        )
        if not links:
            return ok({"trainers": [], "spells": []})
        trainer_ids = [r["TrainerId"] for r in links]
        id_placeholders = ",".join(["%s"] * len(trainer_ids))
        trainers = query(
            f"SELECT * FROM trainer WHERE Id IN ({id_placeholders})",
            trainer_ids
        )
        spells = query(
            f"SELECT ts.*, "
            f"COALESCE(sd.Name_Lang_enUS, ts.SpellId) AS spell_name "
            f"FROM trainer_spell ts "
            f"LEFT JOIN spell_dbc sd ON ts.SpellId = sd.ID "
            f"WHERE ts.TrainerId IN ({id_placeholders}) "
            f"ORDER BY ts.TrainerId, ts.SpellId",
            trainer_ids
        )
        return ok({"trainers": [dict(r) for r in trainers], "spells": [dict(r) for r in spells]})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/npc/trainer/spell/add", methods=["POST"])
def add_trainer_spell():
    data = request.get_json() or {}
    trainer_id = int(data.get("TrainerId", 0))
    spell_id   = int(data.get("SpellId", 0))
    if not trainer_id or not spell_id:
        return err("TrainerId und SpellId required")
    cost = int(data.get("MoneyCost", 0))
    req_skill = int(data.get("ReqSkillLine", 0))
    req_rank  = int(data.get("ReqSkillRank", 0))
    req_level = int(data.get("ReqLevel", 0))
    try:
        execute(
            "INSERT INTO trainer_spell (TrainerId, SpellId, MoneyCost, ReqSkillLine, "
            "ReqSkillRank, ReqAbility1, ReqAbility2, ReqAbility3, ReqLevel) "
            "VALUES (%s,%s,%s,%s,%s,0,0,0,%s) "
            "ON DUPLICATE KEY UPDATE MoneyCost=%s, ReqSkillLine=%s, ReqSkillRank=%s, ReqLevel=%s",
            [trainer_id, spell_id, cost, req_skill, req_rank, req_level,
             cost, req_skill, req_rank, req_level]
        )
        return ok({"action": "added"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/npc/trainer/spell/delete", methods=["POST"])
def delete_trainer_spell():
    data = request.get_json() or {}
    trainer_id = int(data.get("TrainerId", 0)); spell_id = int(data.get("SpellId", 0))
    if not trainer_id or not spell_id:
        return err("TrainerId und SpellId required")
    try:
        rows = execute(
            "DELETE FROM trainer_spell WHERE TrainerId = %s AND SpellId = %s",
            [trainer_id, spell_id]
        )
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)


# ── CREATURE TEXT ─────────────────────────────────────────────────────────────

@app.route("/api/creature/text/<int:entry>")
def get_creature_text(entry):
    try:
        rows = query(
            "SELECT * FROM creature_text WHERE CreatureID = %s ORDER BY GroupID, ID",
            [entry]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/creature/text/save", methods=["POST"])
def save_creature_text():
    data = request.get_json() or {}
    entry   = int(data.get("CreatureID", 0))
    group   = int(data.get("GroupID", 0))
    tid     = int(data.get("ID", 0))
    text    = data.get("Text", "")
    typ     = int(data.get("Type", 0))
    lang    = int(data.get("Language", 0))
    prob    = float(data.get("Probability", 100.0))
    emote   = int(data.get("Emote", 0))
    sound   = int(data.get("Sound", 0))
    comment = data.get("comment", "")
    if not entry:
        return err("CreatureID required")
    try:
        existing = query(
            "SELECT CreatureID FROM creature_text WHERE CreatureID=%s AND GroupID=%s AND ID=%s",
            [entry, group, tid], one=True
        )
        if existing:
            execute(
                "UPDATE creature_text SET Text=%s, Type=%s, Language=%s, Probability=%s, "
                "Emote=%s, Sound=%s, comment=%s "
                "WHERE CreatureID=%s AND GroupID=%s AND ID=%s",
                [text, typ, lang, prob, emote, sound, comment, entry, group, tid]
            )
        else:
            # Auto-assign ID within group
            max_id = query(
                "SELECT COALESCE(MAX(ID),0)+1 AS next FROM creature_text "
                "WHERE CreatureID=%s AND GroupID=%s", [entry, group], one=True
            )
            new_id = max_id["next"] if max_id else 0
            execute(
                "INSERT INTO creature_text (CreatureID,GroupID,ID,Text,Type,Language,"
                "Probability,Emote,Sound,comment) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [entry, group, new_id, text, typ, lang, prob, emote, sound, comment]
            )
        return ok({"action": "saved"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/creature/text/delete", methods=["POST"])
def delete_creature_text():
    data = request.get_json() or {}
    entry = int(data.get("CreatureID", 0))
    group = int(data.get("GroupID", 0))
    tid   = int(data.get("ID", 0))
    if not entry:
        return err("CreatureID required")
    try:
        rows = execute(
            "DELETE FROM creature_text WHERE CreatureID=%s AND GroupID=%s AND ID=%s",
            [entry, group, tid]
        )
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)


# ── CREATURE EQUIP ────────────────────────────────────────────────────────────

@app.route("/api/creature/equip/<int:entry>")
def get_creature_equip(entry):
    try:
        rows = query(
            "SELECT ce.*, "
            "i1.name AS item1_name, i2.name AS item2_name, i3.name AS item3_name "
            "FROM creature_equip_template ce "
            "LEFT JOIN item_template i1 ON ce.ItemID1 = i1.entry "
            "LEFT JOIN item_template i2 ON ce.ItemID2 = i2.entry "
            "LEFT JOIN item_template i3 ON ce.ItemID3 = i3.entry "
            "WHERE ce.CreatureID = %s ORDER BY ce.ID",
            [entry]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/creature/equip/save", methods=["POST"])
def save_creature_equip():
    data = request.get_json() or {}
    entry = int(data.get("CreatureID", 0)); eid = int(data.get("ID", 1))
    i1 = int(data.get("ItemID1", 0)); i2 = int(data.get("ItemID2", 0)); i3 = int(data.get("ItemID3", 0))
    if not entry:
        return err("CreatureID required")
    try:
        existing = query(
            "SELECT CreatureID FROM creature_equip_template WHERE CreatureID=%s AND ID=%s",
            [entry, eid], one=True
        )
        if existing:
            execute(
                "UPDATE creature_equip_template SET ItemID1=%s, ItemID2=%s, ItemID3=%s "
                "WHERE CreatureID=%s AND ID=%s",
                [i1, i2, i3, entry, eid]
            )
        else:
            execute(
                "INSERT INTO creature_equip_template (CreatureID,ID,ItemID1,ItemID2,ItemID3,VerifiedBuild) "
                "VALUES (%s,%s,%s,%s,%s,0)",
                [entry, eid, i1, i2, i3]
            )
        return ok({"action": "saved"})
    except Exception as e:
        return err(str(e), 500)


# ── SMART AI ──────────────────────────────────────────────────────────────────

@app.route("/api/smartai/<int:entry>")
def get_smartai(entry):
    source_type = int(request.args.get("source_type", 0))
    try:
        rows = query(
            "SELECT * FROM smart_scripts WHERE entryorguid = %s AND source_type = %s "
            "ORDER BY id",
            [entry, source_type]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/smartai/save", methods=["POST"])
def save_smartai():
    data = request.get_json() or {}
    entry       = int(data.get("entryorguid", 0))
    source_type = int(data.get("source_type", 0))
    sid         = int(data.get("id", 0))
    if entry == 0 and source_type == 0:
        return err("entryorguid required")
    FIELDS = ["link","event_type","event_phase_mask","event_chance","event_flags",
              "event_param1","event_param2","event_param3","event_param4","event_param5","event_param6",
              "action_type","action_param1","action_param2","action_param3",
              "action_param4","action_param5","action_param6",
              "target_type","target_param1","target_param2","target_param3","target_param4",
              "target_x","target_y","target_z","target_o","comment"]
    fields = {f: data[f] for f in FIELDS if f in data}
    try:
        existing = query(
            "SELECT id FROM smart_scripts WHERE entryorguid=%s AND source_type=%s AND id=%s",
            [entry, source_type, sid], one=True
        )
        if existing:
            if fields:
                set_clause = ", ".join(f"`{k}` = %s" for k in fields)
                execute(
                    f"UPDATE smart_scripts SET {set_clause} "
                    f"WHERE entryorguid=%s AND source_type=%s AND id=%s",
                    list(fields.values()) + [entry, source_type, sid]
                )
        else:
            all_fields = {"entryorguid": entry, "source_type": source_type, "id": sid, **fields}
            cols = ", ".join(f"`{k}`" for k in all_fields)
            vals = ", ".join(["%s"] * len(all_fields))
            execute(f"INSERT INTO smart_scripts ({cols}) VALUES ({vals})", list(all_fields.values()))
        return ok({"action": "saved", "id": sid})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/smartai/delete", methods=["POST"])
def delete_smartai():
    data = request.get_json() or {}
    entry       = int(data.get("entryorguid", 0))
    source_type = int(data.get("source_type", 0))
    sid         = data.get("id")
    try:
        if sid is not None:
            rows = execute(
                "DELETE FROM smart_scripts WHERE entryorguid=%s AND source_type=%s AND id=%s",
                [entry, source_type, int(sid)]
            )
        else:
            rows = execute(
                "DELETE FROM smart_scripts WHERE entryorguid=%s AND source_type=%s",
                [entry, source_type]
            )
        return ok({"action": "deleted", "rows": rows})
    except Exception as e:
        return err(str(e), 500)


# ── AUTH MODULE ───────────────────────────────────────────────────────────────

@app.route("/api/auth/status")
def get_auth_status():
    try:
        realm = qauth(
            "SELECT id, name, address, localAddress, localSubnetMask, port, icon, flag, "
            "timezone, allowedSecurityLevel, population, gamebuild "
            "FROM realmlist ORDER BY id"
        )
        uptime_rows = qauth(
            "SELECT realmid, starttime, uptime, maxplayers, revision "
            "FROM uptime ORDER BY starttime DESC LIMIT 10"
        )
        motd_rows = qauth("SELECT realmid, text FROM motd")
        motd_by_realm = {r["realmid"]: r["text"] for r in motd_rows}
        return ok({
            "realms": [dict(r) for r in realm],
            "uptime": [dict(r) for r in uptime_rows],
            "motd_by_realm": motd_by_realm,
        })
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/realm/save", methods=["POST"])
def save_realm():
    data = request.get_json() or {}
    rid = data.get("id")
    if rid is None:
        return err("id required")
    fields = {}
    for k in ("name","address","localAddress","localSubnetMask","port","icon","flag",
              "timezone","allowedSecurityLevel","gamebuild"):
        if k in data:
            fields[k] = data[k]
    if not fields:
        return err("keine Felder")
    sets = ", ".join(f"{k}=%s" for k in fields)
    vals = list(fields.values()) + [int(rid)]
    try:
        rows = exauth(f"UPDATE realmlist SET {sets} WHERE id=%s", vals)
        return ok({"action": "saved", "rows": rows})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/realm/add", methods=["POST"])
def add_realm():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return err("name required")
    try:
        exauth(
            "INSERT INTO realmlist (name, address, localAddress, localSubnetMask, port, icon, flag, "
            "timezone, allowedSecurityLevel, population, gamebuild) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            [name,
             data.get("address","127.0.0.1"),
             data.get("localAddress","127.0.0.1"),
             data.get("localSubnetMask","255.255.255.0"),
             int(data.get("port",8085)),
             int(data.get("icon",0)),
             int(data.get("flag",0)),
             int(data.get("timezone",1)),
             int(data.get("allowedSecurityLevel",0)),
             float(data.get("population",0)),
             int(data.get("gamebuild",12340))]
        )
        return ok({"action": "added"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/realm/delete", methods=["POST"])
def delete_realm():
    data = request.get_json() or {}
    rid = data.get("id")
    if rid is None:
        return err("id required")
    try:
        rows = exauth("DELETE FROM realmlist WHERE id=%s", [int(rid)])
        if rows == 0:
            return err("Realm not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/motd/save", methods=["POST"])
def save_motd():
    data = request.get_json() or {}
    text = data.get("text", "")
    realmid = int(data.get("realmid", -1))
    try:
        existing = qauth("SELECT realmid FROM motd WHERE realmid = %s", [realmid], one=True)
        if existing:
            exauth("UPDATE motd SET text = %s WHERE realmid = %s", [text, realmid])
        else:
            exauth("INSERT INTO motd (realmid, text) VALUES (%s, %s)", [realmid, text])
        return ok({"action": "saved"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/autobroadcast")
def get_autobroadcast():
    try:
        realmid = request.args.get("realmid")
        if realmid is not None and realmid != "":
            rows = qauth("SELECT * FROM autobroadcast WHERE realmid IN (%s, -1) ORDER BY id", [int(realmid)])
        else:
            rows = qauth("SELECT * FROM autobroadcast ORDER BY realmid, id")
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/autobroadcast/save", methods=["POST"])
def save_autobroadcast():
    data = request.get_json() or {}
    bid     = data.get("id")
    text    = data.get("text", "")
    weight  = int(data.get("weight", 1))
    realmid = int(data.get("realmid", -1))
    try:
        if bid is not None:
            existing = qauth("SELECT id FROM autobroadcast WHERE id = %s", [int(bid)], one=True)
            if existing:
                exauth("UPDATE autobroadcast SET text=%s, weight=%s, realmid=%s WHERE id=%s",
                       [text, weight, realmid, int(bid)])
            else:
                exauth("INSERT INTO autobroadcast (realmid,id,weight,text) VALUES (%s,%s,%s,%s)",
                       [realmid, int(bid), weight, text])
        else:
            exauth("INSERT INTO autobroadcast (realmid,weight,text) VALUES (%s,%s,%s)",
                   [realmid, weight, text])
        return ok({"action": "saved"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/autobroadcast/delete", methods=["POST"])
def delete_autobroadcast():
    data = request.get_json() or {}
    bid = data.get("id")
    if bid is None:
        return err("id required")
    try:
        rows = exauth("DELETE FROM autobroadcast WHERE id = %s", [int(bid)])
        if rows == 0:
            return err("Entry not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/ipban")
def get_ip_bans():
    try:
        rows = qauth("SELECT ip, bandate, unbandate, bannedby, banreason FROM ip_banned ORDER BY bandate DESC")
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/ipban/add", methods=["POST"])
def add_ip_ban():
    data = request.get_json() or {}
    ip      = data.get("ip", "").strip()
    reason  = data.get("banreason", "Banned by admin")
    by      = data.get("bannedby", "admin")
    days    = int(data.get("duration_days", 0))
    if not ip:
        return err("IP required")
    import time
    now   = int(time.time())
    unban = now + days * 86400 if days > 0 else 0
    try:
        exauth(
            "INSERT INTO ip_banned (ip, bandate, unbandate, bannedby, banreason) "
            "VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE bandate=%s, unbandate=%s, banreason=%s",
            [ip, now, unban, by, reason, now, unban, reason]
        )
        return ok({"action": "banned", "ip": ip})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/auth/ipban/delete", methods=["POST"])
def delete_ip_ban():
    data = request.get_json() or {}
    ip = data.get("ip", "").strip()
    if not ip:
        return err("IP required")
    try:
        rows = exauth("DELETE FROM ip_banned WHERE ip = %s", [ip])
        if rows == 0:
            return err("IP not found", 404)
        return ok({"action": "deleted"})
    except Exception as e:
        return err(str(e), 500)


# ── CHARACTER EXTENSIONS ──────────────────────────────────────────────────────

@app.route("/api/character/<int:guid>/reputation")
def get_char_reputation(guid):
    try:
        name_expr = _coalesce_locales("f", "Name_Lang")
        rows = qchar(
            f"SELECT cr.faction, cr.standing, cr.flags, {name_expr} AS faction_name "
            "FROM character_reputation cr "
            "LEFT JOIN acore_world.faction_dbc f ON cr.faction = f.ID "
            "WHERE cr.guid = %s ORDER BY cr.faction",
            [guid]
        )
        fac = _DBC.get("Faction", {})
        result = []
        for r in rows:
            fid = r["faction"]
            name = r.get("faction_name") or (fac.get(fid) or {}).get("name") or ""
            result.append({
                "faction":      fid,
                "standing":     r["standing"],
                "flags":        r["flags"],
                "faction_name": name,
            })
        return ok(result)
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/character/<int:guid>/reputation/save", methods=["POST"])
def save_char_reputation(guid):
    data = request.get_json() or {}
    faction  = int(data.get("faction", 0))
    standing = int(data.get("standing", 0))
    if not faction:
        return err("faction required")
    try:
        existing = qchar(
            "SELECT guid FROM character_reputation WHERE guid=%s AND faction=%s",
            [guid, faction], one=True
        )
        if existing:
            exchar("UPDATE character_reputation SET standing=%s WHERE guid=%s AND faction=%s",
                   [standing, guid, faction])
        else:
            exchar("INSERT INTO character_reputation (guid,faction,standing,flags) VALUES (%s,%s,%s,1)",
                   [guid, faction, standing])
        return ok({"action": "saved"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/character/<int:guid>/skills")
def get_char_skills(guid):
    try:
        name_expr = _coalesce_locales("sl", "DisplayName_Lang")
        rows = qchar(
            f"SELECT cs.skill, cs.value, cs.max, {name_expr} AS skill_name "
            "FROM character_skills cs "
            "LEFT JOIN acore_world.skillline_dbc sl ON cs.skill = sl.ID "
            "WHERE cs.guid = %s ORDER BY cs.skill",
            [guid]
        )
        skl = _DBC.get("SkillLine", {})
        result = []
        for r in rows:
            sid = r["skill"]
            name = r.get("skill_name") or (skl.get(sid) or {}).get("name") or ""
            result.append({
                "skill":      sid,
                "value":      r["value"],
                "max":        r["max"],
                "skill_name": name,
            })
        return ok(result)
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/character/<int:guid>/skills/save", methods=["POST"])
def save_char_skill(guid):
    data = request.get_json() or {}
    skill = int(data.get("skill", 0))
    value = int(data.get("value", 0))
    max_v = int(data.get("max", 0))
    if not skill:
        return err("skill required")
    try:
        existing = qchar(
            "SELECT guid FROM character_skills WHERE guid=%s AND skill=%s",
            [guid, skill], one=True
        )
        if existing:
            exchar("UPDATE character_skills SET value=%s, max=%s WHERE guid=%s AND skill=%s",
                   [value, max_v, guid, skill])
        else:
            exchar("INSERT INTO character_skills (guid,skill,value,max) VALUES (%s,%s,%s,%s)",
                   [guid, skill, value, max_v])
        return ok({"action": "saved"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/character/<int:guid>/auras")
def get_char_auras(guid):
    try:
        name_expr = _coalesce_locales("sd", "Name_Lang")
        rows = qchar(
            f"SELECT ca.spell, ca.stackCount, ca.remainTime, ca.remainCharges, ca.maxDuration, "
            f"{name_expr} AS spell_name "
            "FROM character_aura ca "
            "LEFT JOIN acore_world.spell_dbc sd ON ca.spell = sd.ID "
            "WHERE ca.guid = %s ORDER BY ca.spell",
            [guid]
        )
        result = []
        for r in rows:
            sid = r["spell"]
            name = r.get("spell_name") or (_DBC_SPELL_DATA.get(sid) or {}).get("name") or ""
            result.append({**dict(r), "spell_name": name,
                          "icon": _DBC_SPELL_ICON_MAP.get(sid, "")})
        return ok(result)
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/character/<int:guid>/achievements/add", methods=["POST"])
def add_char_achievement(guid):
    data = request.get_json() or {}
    aid  = int(data.get("achievement", 0))
    if not aid:
        return err("achievement required")
    import time
    date = int(data.get("date") or time.time())
    try:
        existing = qchar(
            "SELECT achievement FROM character_achievement WHERE guid=%s AND achievement=%s",
            [guid, aid], one=True
        )
        if existing:
            return ok({"action": "already_have", "achievement": aid})
        exchar(
            "INSERT INTO character_achievement (guid, achievement, date) VALUES (%s,%s,%s)",
            [guid, aid, date]
        )
        return ok({"action": "added", "achievement": aid})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/character/<int:guid>/achievements/<int:aid>", methods=["DELETE"])
def remove_char_achievement(guid, aid):
    try:
        rows = exchar(
            "DELETE FROM character_achievement WHERE guid=%s AND achievement=%s",
            [guid, aid]
        )
        if rows == 0:
            return err("Not found", 404)
        return ok({"action": "removed"})
    except Exception as e:
        return err(str(e), 500)


# Lookup helper: find achievement by ID or partial name match
@app.route("/api/achievement/search")
def search_achievements():
    q = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 20)), 50)
    if not q:
        return err("Kein Suchbegriff")
    try:
        title_expr = _coalesce_locales("ad", "Title_Lang")
        if q.isdigit():
            rows = query(
                f"SELECT ID, {title_expr} AS title FROM achievement_dbc ad "
                "WHERE ID = %s LIMIT 1", [int(q)]
            )
        else:
            rows = query(
                f"SELECT ID, {title_expr} AS title FROM achievement_dbc ad "
                f"WHERE {title_expr} LIKE %s ORDER BY ID LIMIT %s",
                [f"%{q}%", limit]
            )
        # RAM fallback enrichment
        ach_ram = _DBC.get("Achievement", {})
        result = []
        for r in rows:
            title = r.get("title") or (ach_ram.get(r["ID"]) or {}).get("name") or ""
            result.append({"ID": r["ID"], "title": title})
        return ok(result)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/character/<int:guid>/achievements")
def get_char_achievements(guid):
    try:
        title_expr = _coalesce_locales("ad", "Title_Lang")
        desc_expr  = _coalesce_locales("ad", "Description_Lang")
        rows = qchar(
            f"SELECT ca.achievement, ca.date, {title_expr} AS title, {desc_expr} AS description "
            "FROM character_achievement ca "
            "LEFT JOIN acore_world.achievement_dbc ad ON ca.achievement = ad.ID "
            "WHERE ca.guid = %s ORDER BY ca.date DESC",
            [guid]
        )
        ach = _DBC.get("Achievement", {})
        result = []
        for r in rows:
            aid = r["achievement"]
            ram = ach.get(aid) or {}
            title = r.get("title") or ram.get("name") or ""
            desc  = r.get("description") or ram.get("desc") or ""
            result.append({
                "achievement": aid,
                "date":        r["date"],
                "title":       title,
                "description": desc,
            })
        return ok(result)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/debug/character/names")
def debug_char_names():
    """Diagnostic: shows DBC RAM status + sample DB rows so we can see WHY names are missing."""
    out = {
        "dbc_ram_keys":    sorted(_DBC.keys()),
        "dbc_ram_counts":  {k: len(v) for k, v in _DBC.items() if k in ("Spell","Faction","SkillLine","Achievement")},
        "dbc_spell_data":  len(_DBC_SPELL_DATA),
    }
    # Sample RAM content for a few known spells — to verify name field actually populated
    sample_ids = [126, 132, 133, 172, 348, 1949, 686]
    out["dbc_spell_data_sample"] = {
        str(sid): _DBC_SPELL_DATA.get(sid) for sid in sample_ids
    }
    out["dbc_spell_raw_sample"] = {
        str(sid): _DBC.get("Spell", {}).get(sid) for sid in sample_ids
    }
    out["dbc_faction_raw_sample"] = {
        str(fid): _DBC.get("Faction", {}).get(fid) for fid in [21, 46, 47, 54, 67]
    }
    out["dbc_skill_raw_sample"] = {
        str(sid): _DBC.get("SkillLine", {}).get(sid) for sid in [95, 109, 136, 162, 173]
    }
    out["dbc_achievement_raw_sample"] = {
        str(aid): _DBC.get("Achievement", {}).get(aid) for aid in [6, 7, 8, 9, 891]
    }
    # Spell-var resolver diagnosis: raw desc + resolved desc + key fields
    # Default IDs + any added via ?ids=X,Y,Z query param
    diag_ids = [25311, 48441, 11688, 1098, 172, 348]
    extra = (request.args.get("ids", "") or "").strip()
    if extra:
        for tok in extra.split(","):
            tok = tok.strip()
            if tok.isdigit():
                diag_ids.append(int(tok))
    out["spell_resolver_check"] = {}
    for sid in diag_ids:
        row = _DBC.get("Spell", {}).get(sid) or {}
        raw_desc = row.get("desc", "")
        try:
            resolved = _resolve_spell_vars(raw_desc, sid)
        except Exception as e:
            resolved = f"!! RESOLVER ERROR: {e}"
        out["spell_resolver_check"][str(sid)] = {
            "raw_desc":     raw_desc,
            "resolved":     resolved,
            "name":         row.get("name", ""),
            "rank":         row.get("rank", ""),
            "duration_idx": row.get("duration_idx", 0),
            "base_pts_1":   row.get("base_pts_1", 0),
            "base_pts_2":   row.get("base_pts_2", 0),
            "base_pts_3":   row.get("base_pts_3", 0),
            "die_sides_1":  row.get("die_sides_1", 0),
            "aura_period_1":row.get("aura_period_1", 0),
        }
    # Sample: do DB locale columns actually have content for known IDs?
    try:
        out["sample_spell_133"] = query(
            f"SELECT ID, {_coalesce_locales('s','Name_Lang')} AS coalesced, "
            "Name_Lang_enUS, Name_Lang_deDE, Name_Lang_enGB FROM spell_dbc s WHERE ID = 133",
            one=True
        )
    except Exception as e:
        out["sample_spell_133_err"] = str(e)
    try:
        out["sample_faction_21"] = query(
            f"SELECT ID, {_coalesce_locales('f','Name_Lang')} AS coalesced, "
            "Name_Lang_enUS, Name_Lang_deDE FROM faction_dbc f WHERE ID = 21",
            one=True
        )
    except Exception as e:
        out["sample_faction_21_err"] = str(e)
    # Files on disk?
    files = ("Spell.dbc","Faction.dbc","SkillLine.dbc","Achievement.dbc")
    out["dbc_files_server"] = {f: os.path.isfile(os.path.join(_DBC_PATH_SERVER, f)) for f in files}
    out["dbc_path_server"]  = _DBC_PATH_SERVER
    return ok(out)


# ── GUILD ─────────────────────────────────────────────────────────────────────

@app.route("/api/guild/search")
def search_guilds():
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 20)), 50)
    if not q:
        return err("Kein Suchbegriff")
    try:
        if q.isdigit():
            rows = qchar(
                "SELECT g.guildid, g.name, g.createdate, g.BankMoney, "
                "c.name AS leader_name, COUNT(gm.guid) AS member_count "
                "FROM guild g "
                "LEFT JOIN characters c ON g.leaderguid = c.guid "
                "LEFT JOIN guild_member gm ON g.guildid = gm.guildid "
                "WHERE g.guildid = %s GROUP BY g.guildid LIMIT 1",
                [int(q)]
            )
        else:
            rows = qchar(
                "SELECT g.guildid, g.name, g.createdate, g.BankMoney, "
                "c.name AS leader_name, COUNT(gm.guid) AS member_count "
                "FROM guild g "
                "LEFT JOIN characters c ON g.leaderguid = c.guid "
                "LEFT JOIN guild_member gm ON g.guildid = gm.guildid "
                "WHERE g.name LIKE %s GROUP BY g.guildid ORDER BY g.name LIMIT %s",
                [f"%{q}%", limit]
            )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/guild/<int:guild_id>")
def get_guild(guild_id):
    try:
        guild = qchar("SELECT * FROM guild WHERE guildid = %s", [guild_id], one=True)
        if not guild:
            return err(f"Guild {guild_id} not found", 404)
        data = dict(guild)
        # Members with character info
        members = qchar(
            "SELECT gm.guid, gm.rank, gm.pnote, gm.offnote, "
            "c.name, c.race, c.class, c.level, c.online "
            "FROM guild_member gm "
            "JOIN characters c ON gm.guid = c.guid "
            "WHERE gm.guildid = %s ORDER BY gm.rank, c.name",
            [guild_id]
        )
        data["_members"] = [dict(m) for m in members]
        # Ranks
        ranks = qchar(
            "SELECT rid, rname, rights, BankMoneyPerDay FROM guild_rank "
            "WHERE guildid = %s ORDER BY rid",
            [guild_id]
        )
        data["_ranks"] = [dict(r) for r in ranks]
        # Leader name
        leader = qchar("SELECT name FROM characters WHERE guid = %s", [guild["leaderguid"]], one=True)
        data["_leader_name"] = leader["name"] if leader else "?"
        return ok(data)
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/guild/<int:guild_id>/save", methods=["POST"])
def save_guild(guild_id):
    data = request.get_json() or {}
    EDITABLE = {"name", "info", "motd"}
    fields = {k: v for k, v in data.items() if k in EDITABLE}
    if not fields:
        return err("Keine editierbaren Felder")
    try:
        set_clause = ", ".join(f"`{k}` = %s" for k in fields)
        exchar(f"UPDATE guild SET {set_clause} WHERE guildid = %s",
               list(fields.values()) + [guild_id])
        return ok({"action": "updated"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/guild/<int:guild_id>/member/rank", methods=["POST"])
def set_guild_member_rank(guild_id):
    data = request.get_json() or {}
    char_guid = int(data.get("guid", 0))
    rank      = int(data.get("rank", 0))
    if not char_guid:
        return err("guid required")
    try:
        exchar("UPDATE guild_member SET rank=%s WHERE guildid=%s AND guid=%s",
               [rank, guild_id, char_guid])
        return ok({"action": "updated"})
    except Exception as e:
        return err(str(e), 500)

@app.route("/api/guild/<int:guild_id>/member/kick", methods=["POST"])
def kick_guild_member(guild_id):
    data = request.get_json() or {}
    char_guid = int(data.get("guid", 0))
    if not char_guid:
        return err("guid required")
    try:
        rows = exchar("DELETE FROM guild_member WHERE guildid=%s AND guid=%s",
                      [guild_id, char_guid])
        if rows == 0:
            return err("Mitglied not found", 404)
        return ok({"action": "kicked"})
    except Exception as e:
        return err(str(e), 500)

# ── DBC ENGINE ───────────────────────────────────────────────────────────────

import struct, os, glob

import os as _os
# ── DBC Paths — Server DBCs preferred, client DBCs as fallback ───────────────
_DBC_PATH_SERVER = CONFIG.get("dbc_server_path") or ""
_DBC_PATH_CLIENT = CONFIG.get("dbc_client_path") or ""
# CSV exports: <dbc_dir>\Export\<Name>.csv  (first row = column headers)
_DBC_EXPORT_SERVER = _os.path.join(_DBC_PATH_SERVER, "Export")
_DBC_EXPORT_CLIENT = _os.path.join(_DBC_PATH_CLIENT, "Export")
DBC_PATH = _DBC_PATH_SERVER if _os.path.isdir(_DBC_PATH_SERVER) else _DBC_PATH_CLIENT


# ════════════════════════════════════════════════════════════════════════════
# GENERIC DBC READER
# ════════════════════════════════════════════════════════════════════════════

def _dbc_read(filepath):
    """
    Parse any WoW 3.3.5a DBC file (WDBC magic).
    Returns (records, strings, field_count)
      records : list of list[int]  — raw 4-byte uint values per row
      strings : dict[offset→str]  — string block lookup
    """
    with open(filepath, "rb") as f:
        data = f.read()
    if data[:4] != b"WDBC":
        raise ValueError(f"Not a valid DBC: {filepath}")
    record_count, field_count, record_size, string_block_size = struct.unpack_from("<4I", data, 4)
    header_size  = 20
    records_end  = header_size + record_count * record_size
    string_block = data[records_end: records_end + string_block_size]

    # Build string lookup
    strings = {0: ""}
    i = 0
    while i < len(string_block):
        end = string_block.find(b"\x00", i)
        if end == -1: break
        strings[i] = string_block[i:end].decode("utf-8", errors="replace")
        i = end + 1

    # Parse records as raw uint32
    fmt     = f"<{field_count}I"
    records = [list(struct.unpack_from(fmt, data, header_size + r * record_size))
               for r in range(record_count)]

    return records, strings, field_count


def _float(raw): return struct.unpack('f', struct.pack('I', raw))[0]


# ════════════════════════════════════════════════════════════════════════════
# DBC SCHEMA DEFINITIONS
# Each entry:  "FileName": (field_count, {field_index: ("name", type)})
#   types: "int" | "str" | "float" | "skip"
#   Only define what matters — everything else stays as raw int.
#   field_index is 0-based.
# ════════════════════════════════════════════════════════════════════════════

# WoW 3.3.5a (build 12340) confirmed field layouts
_DBC_SCHEMAS = {
    # ── SOURCES ─────────────────────────────────────────────────────────────
    # "server" = AzerothCore server's data/dbc folder (set dbc_server_path in asp_config.json)
    # "client" = WoW client's Data/<locale>/dbc folder (set dbc_client_path in asp_config.json, optional)
    # All indices verified from exported CSVs (March 2026)

    # ── Spell (234 cols) — Client preferred for strings ──────────────────────
    # Verified 21.06.2026 against user's binary: name at 136, rank at 153, desc at 170.
    # 4 extra fields (ShapeshiftMask hi/lo, ShapeshiftExclude hi/lo) between
    # AttributesEx7 (11) and Targets (16) shift everything from index 28 by +2.
    "Spell": {
        "_source": "client",
        "_total_fields": 234,
        0:   ("id",           "int"),
        1:   ("category",     "int"),
        2:   ("dispel_type",  "int"),
        3:   ("mechanic",     "int"),
        4:   ("attributes",   "int"),
        5:   ("attr_ex1",     "int"),
        6:   ("attr_ex2",     "int"),
        7:   ("attr_ex3",     "int"),
        8:   ("attr_ex4",     "int"),
        9:   ("attr_ex5",     "int"),
        10:  ("attr_ex6",     "int"),
        11:  ("attr_ex7",     "int"),
        28:  ("cast_index",   "int"),
        29:  ("recovery_ms",  "int"),
        30:  ("cat_rec_ms",   "int"),
        40:  ("duration_idx", "int"),
        41:  ("power_type",   "int"),
        42:  ("mana_cost",    "int"),
        43:  ("mana_per_lvl", "int"),
        44:  ("mana_per_sec", "int"),
        46:  ("range_index",  "int"),
        71:  ("effect_1",     "int"),
        72:  ("effect_2",     "int"),
        73:  ("effect_3",     "int"),
        74:  ("die_sides_1",  "int"),
        75:  ("die_sides_2",  "int"),
        76:  ("die_sides_3",  "int"),
        80:  ("base_pts_1",   "int"),
        81:  ("base_pts_2",   "int"),
        82:  ("base_pts_3",   "int"),
        92:  ("radius_idx_1", "int"),
        93:  ("radius_idx_2", "int"),
        94:  ("radius_idx_3", "int"),
        98:  ("aura_period_1","int"),
        99:  ("aura_period_2","int"),
        100: ("aura_period_3","int"),
        95:  ("aura_1",       "int"),
        96:  ("aura_2",       "int"),
        97:  ("aura_3",       "int"),
        110: ("misc_val_1",   "int"),
        111: ("misc_val_2",   "int"),
        112: ("misc_val_3",   "int"),
        116: ("trigger_1",    "int"),
        117: ("trigger_2",    "int"),
        118: ("trigger_3",    "int"),
        133: ("icon_id",      "int"),
        134: ("active_icon",  "int"),
        136: ("name",         "str"),
        153: ("rank",         "str"),
        170: ("desc",         "str"),
        187: ("aura_desc",    "str"),
        204: ("mana_cost_pct","int"),
        225: ("school_mask",  "int"),
        226: ("rune_cost_id", "int"),
        232: ("desc_var_id",  "int"),
    },
    "SpellIcon": {
        "_source": "client",
        "_total_fields": 2,
        0: ("id",   "int"),
        1: ("icon", "str"),
    },
    "SpellCastTimes": {
        "_source": "client",
        "_total_fields": 4,
        0: ("id",      "int"),
        1: ("base_ms", "int"),
        2: ("per_lvl", "int"),
        3: ("min_ms",  "int"),
    },
    "SpellRange": {
        "_source": "client",
        "_total_fields": 40,
        0: ("id",           "int"),
        1: ("range_min_1",  "float"),
        2: ("range_min_2",  "float"),
        3: ("range_max_1",  "float"),
        4: ("range_max_2",  "float"),
        5: ("flags",        "int"),
        6: ("display",      "str"),
        23:("display_short","str"),
    },
    "SpellDuration": {
        "_source": "server",
        "_total_fields": 4,
        0: ("id",      "int"),
        1: ("dur_ms",  "int"),
        2: ("per_lvl", "int"),
        3: ("max_ms",  "int"),
    },
    "SpellRadius": {
        "_source": "server",
        "_total_fields": 4,
        0: ("id",      "int"),
        1: ("radius",  "float"),
        2: ("per_lvl", "float"),
        3: ("max_rad", "float"),
    },
    "SpellRuneCost": {
        "_source": "server",
        "_total_fields": 5,
        0: ("id",       "int"),
        1: ("blood",    "int"),
        2: ("unholy",   "int"),
        3: ("frost",    "int"),
        4: ("runic_pw", "int"),
    },
    "SpellMechanic": {
        "_source": "client",
        "_total_fields": 18,
        0: ("id",   "int"),
        1: ("name", "str"),
    },
    "SpellDispelType": {
        "_source": "client",
        "_total_fields": 21,
        0:  ("id",            "int"),
        1:  ("name",          "str"),
        18: ("mask",          "int"),
        19: ("immunity",      "int"),
        20: ("internal_name", "str"),
    },
    "SkillLine": {
        "_source": "client",
        "_total_fields": 56,
        0:  ("id",       "int"),
        1:  ("category", "int"),
        2:  ("cost_id",  "int"),
        3:  ("name",     "str"),
        20: ("desc",     "str"),
        37: ("icon_id",  "int"),
        55: ("can_link", "int"),
    },
    "SkillLineAbility": {
        "_source": "server",
        "_total_fields": 13,
        0:  ("id",               "int"),
        1:  ("skill_line",       "int"),
        2:  ("spell",            "int"),
        3:  ("race_mask",        "int"),
        4:  ("class_mask",       "int"),
        5:  ("min_skill_rank",   "int"),
        6:  ("superceded_spell", "int"),
        7:  ("acquire_method",   "int"),
        8:  ("trivial_high",     "int"),
        9:  ("trivial_low",      "int"),
        10: ("char_pts_1",       "int"),
        11: ("char_pts_2",       "int"),
        12: ("trade_cat_id",     "int"),
    },
    "SkillRaceClassInfo": {
        "_source": "server",
        "_total_fields": 8,
        0: ("id",         "int"),
        1: ("skill_id",   "int"),
        2: ("race_mask",  "int"),
        3: ("class_mask", "int"),
        4: ("flags",      "int"),
        5: ("min_level",  "int"),
        6: ("skill_tier", "int"),
        7: ("skill_cost", "int"),
    },
    "ChrRaces": {
        "_source": "client",
        "_total_fields": 69,
        0:  ("id",          "int"),
        1:  ("flags",       "int"),
        2:  ("faction_id",  "int"),
        4:  ("model_m",     "int"),
        5:  ("model_f",     "int"),
        6:  ("prefix",      "str"),
        13: ("alliance",    "int"),
        14: ("name",        "str"),
        31: ("name_female", "str"),
        48: ("name_male",   "str"),
        68: ("expansion",   "int"),
    },
    "ChrClasses": {
        "_source": "client",
        "_total_fields": 60,
        0:  ("id",          "int"),
        2:  ("power_type",  "int"),
        3:  ("pet_token",   "str"),
        4:  ("name",        "str"),
        21: ("name_female", "str"),
        38: ("name_male",   "str"),
        55: ("filename",    "str"),
        56: ("spell_class", "int"),
        57: ("flags",       "int"),
        59: ("expansion",   "int"),
    },
    "Talent": {
        "_source": "server",
        "_total_fields": 23,
        0:  ("id",       "int"),
        1:  ("tab_id",   "int"),
        2:  ("tier",     "int"),
        3:  ("column",   "int"),
        4:  ("rank_1",   "int"),
        5:  ("rank_2",   "int"),
        6:  ("rank_3",   "int"),
        7:  ("rank_4",   "int"),
        8:  ("rank_5",   "int"),
        9:  ("rank_6",   "int"),
        10: ("rank_7",   "int"),
        11: ("rank_8",   "int"),
        12: ("rank_9",   "int"),
        13: ("prereq_1", "int"),
        14: ("prereq_2", "int"),
        15: ("prereq_3", "int"),
        19: ("flags",    "int"),
        20: ("req_spell","int"),
    },
    "TalentTab": {
        "_source": "client",
        "_total_fields": 24,
        0:  ("id",         "int"),
        1:  ("name",       "str"),
        18: ("icon_id",    "int"),
        19: ("race_mask",  "int"),
        20: ("class_mask", "int"),
        21: ("pet_mask",   "int"),
        22: ("order_idx",  "int"),
        23: ("bg_file",    "str"),
    },
    "AreaTable": {
        "_source": "client",
        "_total_fields": 36,
        0:  ("id",          "int"),
        1:  ("map_id",      "int"),
        2:  ("parent_id",   "int"),
        3:  ("area_bit",    "int"),
        4:  ("flags",       "int"),
        10: ("exp_level",   "int"),
        11: ("name",        "str"),
        28: ("faction_mask","int"),
    },
    "Map": {
        "_source": "client",
        "_total_fields": 66,
        0:  ("id",         "int"),
        1:  ("directory",  "str"),
        2:  ("type",       "int"),
        4:  ("pvp",        "int"),
        5:  ("name",       "str"),
        57: ("loading_scr","int"),
        63: ("expansion",  "int"),
        65: ("max_players","int"),
    },
    "Faction": {
        "_source": "client",
        "_total_fields": 57,
        0:  ("id",        "int"),
        1:  ("rep_index", "int"),
        18: ("parent_id", "int"),
        23: ("name",      "str"),
        40: ("desc",      "str"),
    },
    "Item": {
        "_source": "server",
        "_total_fields": 8,
        0: ("id",       "int"),
        1: ("class",    "int"),
        2: ("subclass", "int"),
        3: ("dep_item", "int"),
        4: ("material", "int"),
        5: ("display",  "int"),
        6: ("inv_type", "int"),
        7: ("sheath",   "int"),
    },
    "ItemClass": {
        "_source": "client",
        "_total_fields": 21,
        0: ("id",       "int"),
        1: ("class_id", "int"),
        2: ("submap",   "int"),
        3: ("flags",    "int"),
        4: ("name",     "str"),
    },
    "ItemSubClass": {
        "_source": "client",
        "_total_fields": 45,
        0:  ("id",         "int"),
        1:  ("class_id",   "int"),
        2:  ("subclass_id","int"),
        5:  ("flags",      "int"),
        11: ("name",       "str"),
        28: ("verbose",    "str"),
    },
    "CreatureFamily": {
        "_source": "client",
        "_total_fields": 28,
        0:  ("id",           "int"),
        1:  ("min_scale",    "float"),
        3:  ("max_scale",    "float"),
        5:  ("skill_line_1", "int"),
        6:  ("skill_line_2", "int"),
        7:  ("pet_food",     "int"),
        8:  ("pet_talent",   "int"),
        10: ("name",         "str"),
        27: ("icon_file",    "str"),
    },
    "CreatureType": {
        "_source": "client",
        "_total_fields": 19,
        0:  ("id",    "int"),
        1:  ("name",  "str"),
        18: ("flags", "int"),
    },
    "TotemCategory": {
        "_source": "client",
        "_total_fields": 20,
        0:  ("id",       "int"),
        1:  ("name",     "str"),
        18: ("cat_type", "int"),
        19: ("cat_mask", "int"),
    },
    "BattlemasterList": {
        "_source": "client",
        "_total_fields": 32,
        0:  ("id",      "int"),
        9:  ("type",    "int"),
        11: ("name",    "str"),
        28: ("max_grp", "int"),
        30: ("min_lvl", "int"),
        31: ("max_lvl", "int"),
    },
    "Achievement": {
        "_source": "client",
        "_total_fields": 62,
        0:  ("id",      "int"),
        1:  ("faction", "int"),
        2:  ("map_id",  "int"),
        4:  ("name",    "str"),
        21: ("desc",    "str"),
        38: ("category","int"),
        39: ("points",  "int"),
        41: ("flags",   "int"),
        42: ("icon_id", "int"),
        43: ("reward",  "str"),
    },
    "QuestInfo": {
        "_source": "client",
        "_total_fields": 18,
        0: ("id",   "int"),
        1: ("name", "str"),
    },
    "QuestSort": {
        "_source": "client",
        "_total_fields": 18,
        0: ("id",   "int"),
        1: ("name", "str"),
    },
    "EmotesText": {
        "_source": "client",
        "_total_fields": 19,
        0: ("id",   "int"),
        1: ("name", "str"),
    },
    "Languages": {
        "_source": "client",
        "_total_fields": 18,
        0: ("id",   "int"),
        1: ("name", "str"),
    },
    "Resistances": {
        "_source": "client",
        "_total_fields": 20,
        0: ("id",         "int"),
        1: ("flags",      "int"),
        2: ("fizzle_snd", "int"),
        3: ("name",       "str"),
    },
    "GemProperties": {
        "_source": "server",
        "_total_fields": 5,
        0: ("id",         "int"),
        1: ("enchant_id", "int"),
        2: ("max_inv",    "int"),
        3: ("max_item",   "int"),
        4: ("type",       "int"),
    },
    # ItemDisplayInfo: ID, ModelName_1, ModelName_2, ModelTexture_1, ModelTexture_2,
    # InventoryIcon_1 (idx 5), InventoryIcon_2, GeosetGroup_1-3, Flags, SpellVisualID,
    # GroupSoundIndex, HelmetGeosetVis_1-2, Texture_1-8, ItemVisual, ParticleColorID
    "ItemDisplayInfo": {
        "_source": "client",
        "_total_fields": 25,
        0: ("id",   "int"),
        5: ("icon", "str"),  # InventoryIcon_1
    },
}


# ════════════════════════════════════════════════════════════════════════════
# GLOBAL DBC CACHE
# _DBC[name] = {record_id: {field_name: value, ...}, "_strings": {}}
# ════════════════════════════════════════════════════════════════════════════

_DBC = {}  # {"Spell": {116: {...}, ...}, "SkillLine": {...}, ...}

def _load_dbc_from_csv(name, csv_path):
    """
    Load a DBC from its CSV export (first row = headers, first col = ID).
    Uses _DBC_SCHEMAS field-name mapping where available;
    otherwise stores all columns as-is.
    Returns count of records loaded.
    """
    import csv as _csv
    schema = _DBC_SCHEMAS.get(name, {})
    # Build index→(field_name, type) from schema
    schema_by_idx = {k: v for k, v in schema.items() if isinstance(k, int)}

    table = {}
    with open(csv_path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = _csv.reader(f)
        headers = [h.strip() for h in next(reader)]
        # Map column header → schema field name (by index)
        col_map = {}   # col_pos → (field_name, type)
        for i, h in enumerate(headers):
            if i in schema_by_idx:
                col_map[i] = schema_by_idx[i]  # (fname, ftype)
            elif not schema_by_idx:
                col_map[i] = (h, "str")         # no schema → store all as str

        for row in reader:
            if not row:
                continue
            try:
                row_id = int(row[0])
            except (ValueError, IndexError):
                continue

            record = {}
            for i, val in enumerate(row):
                if i not in col_map:
                    continue
                fname, ftype = col_map[i]
                val = val.strip()
                try:
                    if ftype == "int":
                        record[fname] = int(val) if val else 0
                    elif ftype == "float":
                        record[fname] = round(float(val), 4) if val else 0.0
                    else:
                        record[fname] = val
                except ValueError:
                    record[fname] = val if ftype == "str" else 0

            table[row_id] = record

    _DBC[name] = table
    return len(table)


def _load_dbc(name, dbc_dir=None):
    """
    Load a single DBC by name into _DBC[name].
    Priority: CSV export (exact strings) → binary .dbc (parsed).
    Respects _source hint: "client" → prefer client paths, else server.
    Returns count of records loaded.
    """
    schema = _DBC_SCHEMAS.get(name, {})
    source_hint = schema.get("_source", "server") if schema else "server"

    # Build candidate dirs in priority order
    if dbc_dir:
        # If explicit dir given, look for Export subdir first
        export_dirs = [os.path.join(dbc_dir, "Export"), dbc_dir]
        binary_dirs = [dbc_dir]
    elif source_hint == "client":
        export_dirs = [_DBC_EXPORT_CLIENT, _DBC_EXPORT_SERVER]
        binary_dirs = [_DBC_PATH_CLIENT, _DBC_PATH_SERVER]
    else:
        export_dirs = [_DBC_EXPORT_SERVER, _DBC_EXPORT_CLIENT]
        binary_dirs = [_DBC_PATH_SERVER, _DBC_PATH_CLIENT]

    # 1. Try CSV export first (clean strings, no encoding issues)
    for d in export_dirs:
        csv_path = os.path.join(d, f"{name}.csv")
        if os.path.isfile(csv_path):
            try:
                return _load_dbc_from_csv(name, csv_path)
            except Exception as e:
                print(f"  ⚠ CSV load failed for {name}: {e} — falling back to binary")
                break

    # 2. Fall back to binary .dbc
    path = None
    for d in binary_dirs:
        p = os.path.join(d, f"{name}.dbc")
        if os.path.isfile(p):
            path = p
            break
    if path is None:
        return 0

    records, strings, fc = _dbc_read(path)
    schema_by_idx = {k: v for k, v in schema.items() if isinstance(k, int)}

    def _resolve(rec, idx, typ):
        if idx >= len(rec): return None
        raw = rec[idx]
        if typ == "str":   return strings.get(raw, "").strip()
        if typ == "float": return round(_float(raw), 4)
        return raw

    table = {}
    for rec in records:
        if not rec: continue
        row_id = rec[0]
        if schema_by_idx:
            row = {}
            for idx, (fname, ftype) in schema_by_idx.items():
                val = _resolve(rec, idx, ftype)
                if val is not None:
                    row[fname] = val
        else:
            row = {f"f{i}": rec[i] for i in range(len(rec))}
        table[row_id] = row

    _DBC[name] = table
    return len(table)


def load_all_dbcs(dbc_dir=None):
    """
    Load all DBC files into _DBC cache.
    Schema-defined DBCs: loaded from client or server path per _source hint.
    Remaining DBCs: loaded generically from both dirs (server first).
    Returns summary dict.
    """
    summary = {}

    # 1. Schema-defined DBCs — each picks its preferred path automatically
    for name in _DBC_SCHEMAS:
        try:
            n = _load_dbc(name, dbc_dir)
            if n: summary[name] = n
        except Exception as e:
            summary[f"!{name}"] = str(e)

    # 2. Remaining DBCs generically from Export CSVs first, then binary
    scan_export_dirs = []
    scan_binary_dirs = []
    if dbc_dir:
        scan_export_dirs = [os.path.join(dbc_dir, "Export")]
        scan_binary_dirs = [dbc_dir]
    else:
        for export_d, bin_d in [(_DBC_EXPORT_SERVER, _DBC_PATH_SERVER),
                                  (_DBC_EXPORT_CLIENT, _DBC_PATH_CLIENT)]:
            if os.path.isdir(export_d) and export_d not in scan_export_dirs:
                scan_export_dirs.append(export_d)
            if os.path.isdir(bin_d) and bin_d not in scan_binary_dirs:
                scan_binary_dirs.append(bin_d)

    # CSVs first
    for d in scan_export_dirs:
        for filepath in sorted(glob.glob(os.path.join(d, "*.csv"))):
            name = os.path.splitext(os.path.basename(filepath))[0]
            if name in _DBC:
                continue
            try:
                n = _load_dbc(name, os.path.dirname(d))  # parent = dbc dir
                if n: summary[name] = n
            except Exception:
                pass

    # Binary fallback for anything not covered by CSVs
    for d in scan_binary_dirs:
        for filepath in sorted(glob.glob(os.path.join(d, "*.dbc"))):
            name = os.path.splitext(os.path.basename(filepath))[0]
            if name in _DBC:
                continue
            try:
                n = _load_dbc(name, d)
                if n: summary[name] = n
            except Exception:
                pass

    # 3. Build Spell-specific caches for backward compat
    _rebuild_spell_caches()

    return summary


def _rebuild_spell_caches():
    """Rebuild _DBC_SPELL_DATA, _DBC_SPELL_ICON_MAP, _DBC_CAST_TIMES, _DBC_RANGES from _DBC."""
    global _DBC_SPELL_DATA, _DBC_SPELL_ICON_MAP, _DBC_CAST_TIMES, _DBC_RANGES

    # Icon map: SpellIcon id → wowhead icon name
    # CSV gives e.g. "Spell\\Nature\\Lightning" or "Interface\\Icons\\Ability_..."
    # Wowhead expects lowercase with underscores: "spell_nature_lightning"
    icon_id_to_name = {}
    for iid, row in _DBC.get("SpellIcon", {}).items():
        raw = (row.get("icon") or "").strip()
        if not raw:
            continue
        raw_lower = raw.lower()
        for pfx in ("interface\\icons\\", "interface/icons/"):
            if raw_lower.startswith(pfx):
                raw = raw[len(pfx):]
                break
        fname = raw.replace("\\", "_").replace("/", "_").replace(" ", "_").lower()
        if fname and fname != "inv_misc_questionmark":
            icon_id_to_name[iid] = fname

    # Spell data
    _DBC_SPELL_DATA.clear()
    for sid, row in _DBC.get("Spell", {}).items():
        icon_name = icon_id_to_name.get(row.get("icon_id", 0), "")
        _DBC_SPELL_DATA[sid] = {
            "icon":        icon_name,
            "icon_id":     row.get("icon_id", 0),
            "name":        row.get("name", ""),
            "rank":        row.get("rank", ""),
            "desc":        row.get("desc", ""),
            "power_type":  row.get("power_type", 0),
            "mana_cost":   row.get("mana_cost", 0),
            "range_index": row.get("range_index", 0),
            "cast_index":  row.get("cast_index", 0),
            "recovery_ms": row.get("recovery_ms", 0),
            "cat_rec_ms":  row.get("cat_rec_ms", 0),
            "school_mask": row.get("school_mask", 0),
        }

    _DBC_SPELL_ICON_MAP.clear()
    for sid, d in _DBC_SPELL_DATA.items():
        if d["icon"]:
            _DBC_SPELL_ICON_MAP[sid] = d["icon"]

    # Cast times
    _DBC_CAST_TIMES.clear()
    for idx, row in _DBC.get("SpellCastTimes", {}).items():
        _DBC_CAST_TIMES[idx] = row.get("base_ms", 0)

    # Ranges — schema fields: range_min_1 (hostile), range_max_1 (hostile)
    _DBC_RANGES.clear()
    for idx, row in _DBC.get("SpellRange", {}).items():
        _DBC_RANGES[idx] = {
            "min":     row.get("range_min_1", 0),
            "max":     row.get("range_max_1", 0),
            "display": row.get("display", ""),
        }

    # Item icon map: ItemDisplayInfo id → wowhead icon name
    _DBC_ITEM_ICON_MAP.clear()
    for did, row in _DBC.get("ItemDisplayInfo", {}).items():
        raw = (row.get("icon") or "").strip()
        if not raw:
            continue
        lower = raw.lower()
        for pfx in ("interface\\icons\\", "interface/icons/"):
            if lower.startswith(pfx):
                raw = raw[len(pfx):]
                break
        fname = raw.replace("\\", "_").replace("/", "_").lower()
        if fname and fname != "inv_misc_questionmark":
            _DBC_ITEM_ICON_MAP[did] = fname


# ── Universal DBC search index ────────────────────────────────────────────────
# Built after load_all_dbcs() — maps lowercase name fragments to {dbc, id, name}
_DBC_SEARCH_INDEX = []  # list of (lower_name, dbc_name, record_id, display_name)

def _build_search_index():
    """Build a flat search index over all name-bearing DBC records."""
    global _DBC_SEARCH_INDEX
    idx = []
    for dbc_name, table in _DBC.items():
        schema = _DBC_SCHEMAS.get(dbc_name, {})
        # Only index DBCs that have a "name" field
        has_name = any(isinstance(v, tuple) and v[0] == "name" for v in schema.values()) if schema else False
        if not has_name:
            continue
        for rid, row in table.items():
            name = row.get("name", "")
            if name:
                idx.append((name.lower(), dbc_name, rid, name))
    _DBC_SEARCH_INDEX = idx
    return len(idx)


# ── In-memory DBC caches (backward compat, rebuilt from _DBC) ─────────────────
_DBC_SPELL_DATA      = {}
_DBC_SPELL_ICON_MAP  = {}
_DBC_CAST_TIMES      = {}
_DBC_RANGES          = {}
_DBC_ITEM_ICON_MAP   = {}  # {displayid: "icon_name"}


# ── DBC query helpers ─────────────────────────────────────────────────────────

def dbc_get(name, record_id):
    """Get a single record from a DBC table. Returns dict or None."""
    return _DBC.get(name, {}).get(record_id)

def dbc_search(name, query, field="name", limit=50):
    """Search a DBC table by field substring. Returns list of records."""
    q = query.lower()
    table = _DBC.get(name, {})
    results = []
    for rid, row in table.items():
        val = str(row.get(field, "")).lower()
        if q in val:
            results.append({"id": rid, **row})
        if len(results) >= limit:
            break
    return results

def dbc_where(name, **kwargs):
    """Filter DBC records by exact field values. E.g. dbc_where('SkillLineAbility', skill_line=54)"""
    table = _DBC.get(name, {})
    results = []
    for rid, row in table.items():
        if all(row.get(k) == v for k, v in kwargs.items()):
            results.append({"id": rid, **row})
    return results


# ── Special byte-packed DBCs: CharBaseInfo + CharStartOutfit ──────────────────
# Not 4-byte-field-aligned → the generic DBC reader can't parse them. Parse here.

_CHAR_BASE_INFO    = {}   # {race_id: [class_ids]}            — valid race/class combos
_CHAR_START_OUTFIT = {}   # {(race_id, class_id): [item_ids]} — flat list (legacy)
_CSO_RECORDS       = []   # list of full record dicts (for editing)
_CSO_INDEX         = {}   # {(race, cls): [record_index, ...]}
_CSO_HEADER        = None # (record_count, field_count, record_size, string_block_size)

def _find_dbc(name):
    for d in (_DBC_PATH_SERVER, _DBC_PATH_CLIENT):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            return p
    return None

def _load_char_base_info():
    """CharBaseInfo.dbc — byte-packed: each record = RaceID(u8) + ClassID(u8)."""
    _CHAR_BASE_INFO.clear()
    path = _find_dbc("CharBaseInfo.dbc")
    if not path:
        return 0
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"WDBC":
        return 0
    rc, fc, rs, sb = struct.unpack_from("<4I", data, 4)
    for i in range(rc):
        off = 20 + i * rs
        race = data[off]; cls = data[off + 1]
        _CHAR_BASE_INFO.setdefault(race, [])
        if cls not in _CHAR_BASE_INFO[race]:
            _CHAR_BASE_INFO[race].append(cls)
    for r in _CHAR_BASE_INFO:
        _CHAR_BASE_INFO[r].sort()
    return len(_CHAR_BASE_INFO)

def _load_char_start_outfit():
    """CharStartOutfit.dbc — ID, packed(race,class,sex,outfit), 24×ItemID, 24×Display, 24×InvType."""
    global _CSO_HEADER
    _CHAR_START_OUTFIT.clear()
    _CSO_RECORDS.clear()
    _CSO_INDEX.clear()
    path = _find_dbc("CharStartOutfit.dbc")
    if not path:
        return 0
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"WDBC":
        return 0
    rc, fc, rs, sb = struct.unpack_from("<4I", data, 4)
    _CSO_HEADER = (rc, fc, rs, sb)
    n_int = rs // 4   # 74 uint32 fields per record
    for i in range(rc):
        vals = list(struct.unpack_from(f"<{n_int}I", data, 20 + i * rs))
        packed = vals[1]
        race = packed & 0xFF
        cls  = (packed >> 8) & 0xFF
        sex  = (packed >> 16) & 0xFF
        out  = (packed >> 24) & 0xFF
        rec = {
            "rec_id": vals[0], "packed": packed,
            "race": race, "cls": cls, "sex": sex, "outfit": out,
            "items":     vals[2:26],
            "displays":  vals[26:50],
            "inv_types": vals[50:74],
            "_raw": vals,
        }
        _CSO_RECORDS.append(rec)
        _CSO_INDEX.setdefault((race, cls), []).append(i)
        lst = _CHAR_START_OUTFIT.setdefault((race, cls), [])
        for iid in rec["items"]:
            if iid == 0 or iid >= 0x80000000:
                continue
            if iid not in lst:
                lst.append(iid)
    return len(_CHAR_START_OUTFIT)


def _save_char_start_outfit():
    """Rewrite CharStartOutfit.dbc with current _CSO_RECORDS (one-time .bak backup)."""
    import shutil
    path = _find_dbc("CharStartOutfit.dbc")
    if not path or not _CSO_HEADER:
        raise RuntimeError("CharStartOutfit.dbc not loaded")
    if not os.path.exists(path + ".bak"):
        shutil.copy2(path, path + ".bak")
    rc, fc, rs, sb = _CSO_HEADER
    n_int = rs // 4
    with open(path, "rb") as f:
        original = f.read()
    string_block = original[20 + rc * rs:]
    header = original[:20]
    body = bytearray()
    for rec in _CSO_RECORDS:
        body.extend(struct.pack(f"<{n_int}I", *rec["_raw"]))
    with open(path, "wb") as f:
        f.write(header + bytes(body) + string_block)
    # Rebuild flat legacy index too
    _CHAR_START_OUTFIT.clear()
    for rec in _CSO_RECORDS:
        lst = _CHAR_START_OUTFIT.setdefault((rec["race"], rec["cls"]), [])
        for iid in rec["items"]:
            if iid == 0 or iid >= 0x80000000:
                continue
            if iid not in lst:
                lst.append(iid)


def _outfit_add_item(race, cls, item_id, inv_type=None, display_id=None):
    indices = _CSO_INDEX.get((int(race), int(cls)), [])
    if not indices:
        return False, f"No DBC outfit entry for Rasse {race}/Klasse {cls}"
    added = False
    is_bag = (inv_type == 18)
    for idx in indices:
        rec = _CSO_RECORDS[idx]
        items     = list(rec["items"])
        displays  = list(rec["displays"])
        inv_types = list(rec["inv_types"])
        # Allow duplicates for bags (multiple instances of same bag itemid are valid);
        # block dupes for everything else to avoid accidental double-equip.
        if not is_bag:
            valid_items = [(s, v) for s, v in enumerate(items) if v != 0 and v < 0x80000000]
            if item_id in [v for _, v in valid_items]:
                continue
        try:
            slot = next(s for s, v in enumerate(items) if v == 0xFFFFFFFF or v == 0)
        except StopIteration:
            return False, f"No free slots in DBC record (RaceID={rec['race']}, SexID={rec['sex']})"
        items[slot]     = int(item_id)
        displays[slot]  = int(display_id) if display_id is not None else 0xFFFFFFFF
        inv_types[slot] = int(inv_type)   if inv_type   is not None else 0xFFFFFFFF
        rec["items"], rec["displays"], rec["inv_types"] = items, displays, inv_types
        rec["_raw"] = [rec["rec_id"], rec["packed"]] + items + displays + inv_types
        added = True
    if added:
        _save_char_start_outfit()
        return True, ""
    return False, "Item is already present in all records"


def _outfit_swap_items(race, cls, item_id_a, item_id_b):
    """Swap the DBC slot positions of two items in CharStartOutfit.dbc.
    Affects both male+female records for this race/class."""
    indices = _CSO_INDEX.get((int(race), int(cls)), [])
    if not indices:
        return False, "No DBC outfit entry"
    swapped = False
    a, b = int(item_id_a), int(item_id_b)
    for idx in indices:
        rec       = _CSO_RECORDS[idx]
        items     = list(rec["items"])
        displays  = list(rec["displays"])
        inv_types = list(rec["inv_types"])
        slot_a = next((s for s, v in enumerate(items) if v == a), None)
        slot_b = next((s for s, v in enumerate(items) if v == b), None)
        if slot_a is None or slot_b is None or slot_a == slot_b:
            continue
        items[slot_a],     items[slot_b]     = items[slot_b],     items[slot_a]
        displays[slot_a],  displays[slot_b]  = displays[slot_b],  displays[slot_a]
        inv_types[slot_a], inv_types[slot_b] = inv_types[slot_b], inv_types[slot_a]
        rec["items"], rec["displays"], rec["inv_types"] = items, displays, inv_types
        rec["_raw"] = [rec["rec_id"], rec["packed"]] + items + displays + inv_types
        swapped = True
    if swapped:
        _save_char_start_outfit()
        return True, ""
    return False, "One of the items nicht im DBC-Record found"


def _outfit_remove_item(race, cls, item_id):
    indices = _CSO_INDEX.get((int(race), int(cls)), [])
    if not indices:
        return False, "No DBC outfit entry"
    removed = False
    for idx in indices:
        rec = _CSO_RECORDS[idx]
        items     = list(rec["items"])
        displays  = list(rec["displays"])
        inv_types = list(rec["inv_types"])
        for slot in range(24):
            if items[slot] == int(item_id):
                items[slot]     = 0xFFFFFFFF
                displays[slot]  = 0xFFFFFFFF
                inv_types[slot] = 0xFFFFFFFF
                removed = True
        rec["items"], rec["displays"], rec["inv_types"] = items, displays, inv_types
        rec["_raw"] = [rec["rec_id"], rec["packed"]] + items + displays + inv_types
    if removed:
        _save_char_start_outfit()
        return True, ""
    return False, "Item nicht in DBC-Records found"


# ══════════════════════════════════════════════════════════════════════════════
# Item.dbc — read/write + custom-item creation (Editor → Items → Create mode)
# ══════════════════════════════════════════════════════════════════════════════

_ITEM_DBC_RECORDS = []   # list of dicts: {ID, ClassID, SubclassID, SoundOverrideSubclass, Material, DisplayInfoID, InventoryType, SheatheType}
_ITEM_DBC_HEADER  = None # (record_count, field_count, record_size, string_block_size)
_ITEM_DBC_FIELDS  = ("ID","ClassID","SubclassID","SoundOverrideSubclass",
                     "Material","DisplayInfoID","InventoryType","SheatheType")
_CREATE_ITEM_MIN_ID = 60000

_DBA_SETTINGS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dba_settings.json")
_DBA_SETTINGS = None  # {"client_data_path": str, "auto_copy_patch": bool, "patch_name": str}

def _settings_load():
    global _DBA_SETTINGS
    try:
        with open(_DBA_SETTINGS_PATH, "r", encoding="utf-8") as f:
            _DBA_SETTINGS = json.load(f)
    except Exception:
        _DBA_SETTINGS = {}
    _DBA_SETTINGS.setdefault("client_data_path", "")
    _DBA_SETTINGS.setdefault("auto_copy_patch", False)
    _DBA_SETTINGS.setdefault("patch_name", "patch-Z.MPQ")
    _DBA_SETTINGS.setdefault("mpq_output_dir", CONFIG.get("mpq_output_dir") or os.path.join(BASE_DIR, "mpq"))
    return _DBA_SETTINGS

def _settings_save():
    try:
        with open(_DBA_SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(_DBA_SETTINGS, f, indent=2)
        return True
    except Exception:
        return False


def _load_item_dbc():
    """Item.dbc — uint32 records. WoW 3.3.5 has 8 fields per record (32 bytes)."""
    global _ITEM_DBC_HEADER
    _ITEM_DBC_RECORDS.clear()
    path = _find_dbc("Item.dbc")
    if not path:
        return 0
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"WDBC":
        return 0
    rc, fc, rs, sb = struct.unpack_from("<4I", data, 4)
    _ITEM_DBC_HEADER = (rc, fc, rs, sb)
    n_int = rs // 4
    for i in range(rc):
        off = 20 + i * rs
        vals = struct.unpack_from(f"<{n_int}I", data, off)
        rec = {"_raw": list(vals)}
        for j, name in enumerate(_ITEM_DBC_FIELDS):
            rec[name] = vals[j] if j < n_int else 0
        _ITEM_DBC_RECORDS.append(rec)
    return len(_ITEM_DBC_RECORDS)


def _save_item_dbc():
    """Rewrite Item.dbc with current _ITEM_DBC_RECORDS (one-time .bak backup)."""
    global _ITEM_DBC_HEADER
    import shutil
    path = _find_dbc("Item.dbc")
    if not path or not _ITEM_DBC_HEADER:
        raise RuntimeError("Item.dbc not loaded")
    if not os.path.exists(path + ".bak"):
        shutil.copy2(path, path + ".bak")
    rc, fc, rs, sb = _ITEM_DBC_HEADER
    n_int = rs // 4
    # Read original string block (we don't touch any strings — Item.dbc has none in 3.3.5)
    with open(path, "rb") as f:
        original = f.read()
    string_block = original[20 + rc * rs:]
    # New record count
    new_rc = len(_ITEM_DBC_RECORDS)
    new_header = struct.pack("<4sIIII", b"WDBC", new_rc, fc, rs, len(string_block))
    body = bytearray()
    for rec in _ITEM_DBC_RECORDS:
        raw = list(rec.get("_raw", [0] * n_int))
        while len(raw) < n_int:
            raw.append(0)
        for j, name in enumerate(_ITEM_DBC_FIELDS):
            if j < n_int:
                raw[j] = int(rec.get(name, 0)) & 0xFFFFFFFF
        body.extend(struct.pack(f"<{n_int}I", *raw[:n_int]))
    with open(path, "wb") as f:
        f.write(new_header + bytes(body) + string_block)
    _ITEM_DBC_HEADER = (new_rc, fc, rs, sb)


def _item_dbc_add_or_update(item_id, class_id, subclass_id, material,
                            display_id, inv_type, sheathe, sound_override=-1):
    """Insert or update record by ID. Returns True if changed."""
    if not _ITEM_DBC_HEADER:
        _load_item_dbc()
    if not _ITEM_DBC_HEADER:
        raise RuntimeError("Item.dbc not found")
    rec = None
    for r in _ITEM_DBC_RECORDS:
        if r["ID"] == item_id:
            rec = r; break
    if rec is None:
        rec = {"_raw": [0] * (_ITEM_DBC_HEADER[2] // 4)}
        _ITEM_DBC_RECORDS.append(rec)
    rec["ID"] = item_id
    rec["ClassID"] = class_id
    rec["SubclassID"] = subclass_id
    rec["SoundOverrideSubclass"] = sound_override & 0xFFFFFFFF
    rec["Material"] = material
    rec["DisplayInfoID"] = display_id
    rec["InventoryType"] = inv_type
    rec["SheatheType"] = sheathe
    return True


def _item_dbc_remove(item_id):
    global _ITEM_DBC_RECORDS
    before = len(_ITEM_DBC_RECORDS)
    _ITEM_DBC_RECORDS = [r for r in _ITEM_DBC_RECORDS if r["ID"] != item_id]
    return len(_ITEM_DBC_RECORDS) < before


# ── Pure-Python MPQ writer (uncompressed, single-unit files) ────────────────
_MPQ_CRYPT_TABLE = None

def _mpq_init_crypt_table():
    global _MPQ_CRYPT_TABLE
    if _MPQ_CRYPT_TABLE is not None:
        return _MPQ_CRYPT_TABLE
    table = [0] * 0x500
    seed = 0x00100001
    for i in range(0x100):
        idx = i
        for _ in range(5):
            seed = (seed * 125 + 3) % 0x2AAAAB
            tmp1 = (seed & 0xFFFF) << 0x10
            seed = (seed * 125 + 3) % 0x2AAAAB
            tmp2 = seed & 0xFFFF
            table[idx] = (tmp1 | tmp2) & 0xFFFFFFFF
            idx += 0x100
    _MPQ_CRYPT_TABLE = table
    return table

def _mpq_hash(text, hash_type):
    table = _mpq_init_crypt_table()
    seed1 = 0x7FED7FED
    seed2 = 0xEEEEEEEE
    text = text.upper().replace("/", "\\")
    for ch in text:
        c = ord(ch)
        seed1 = (table[(hash_type << 8) + c] ^ ((seed1 + seed2) & 0xFFFFFFFF)) & 0xFFFFFFFF
        seed2 = (c + seed1 + seed2 + (seed2 << 5) + 3) & 0xFFFFFFFF
    return seed1 & 0xFFFFFFFF

def _mpq_encrypt(data: bytes, key: int) -> bytes:
    table = _mpq_init_crypt_table()
    seed = 0xEEEEEEEE
    out = bytearray()
    n = len(data) // 4
    for i in range(n):
        chunk = struct.unpack_from("<I", data, i * 4)[0]
        seed = (seed + table[0x400 + (key & 0xFF)]) & 0xFFFFFFFF
        encrypted = (chunk ^ ((key + seed) & 0xFFFFFFFF)) & 0xFFFFFFFF
        out.extend(struct.pack("<I", encrypted))
        key = (((~key << 0x15) & 0xFFFFFFFF) + 0x11111111) & 0xFFFFFFFF | (key >> 0x0B)
        key = key & 0xFFFFFFFF
        seed = (chunk + seed + (seed << 5) + 3) & 0xFFFFFFFF
    return bytes(out)


def _mpq_decrypt(data: bytes, key: int) -> bytes:
    table = _mpq_init_crypt_table()
    seed = 0xEEEEEEEE
    out = bytearray()
    n = len(data) // 4
    for i in range(n):
        seed = (seed + table[0x400 + (key & 0xFF)]) & 0xFFFFFFFF
        encrypted = struct.unpack_from("<I", data, i * 4)[0]
        decrypted = (encrypted ^ ((key + seed) & 0xFFFFFFFF)) & 0xFFFFFFFF
        out.extend(struct.pack("<I", decrypted))
        key = (((~key << 0x15) & 0xFFFFFFFF) + 0x11111111) & 0xFFFFFFFF | (key >> 0x0B)
        key = key & 0xFFFFFFFF
        seed = (decrypted + seed + (seed << 5) + 3) & 0xFFFFFFFF
    return bytes(out)


def _mpq_read(path):
    """Read an MPQ file. Returns ({path: {'size':..., 'data':..., 'flags':...}}, error|None)."""
    if not os.path.exists(path):
        return {}, "MPQ-Datei not found"
    with open(path, "rb") as f:
        raw_all = f.read()
    if raw_all[:4] != b"MPQ\x1A":
        return {}, "No valid MPQ-Datei (Magic bytes wrong)"
    _, _, _, _, _, ht_off, bt_off, ht_n, bt_n = struct.unpack_from("<4sIIHHIIII", raw_all, 0)
    ht_dec = _mpq_decrypt(raw_all[ht_off:ht_off + ht_n * 16], _mpq_hash("(hash table)", 3))
    bt_dec = _mpq_decrypt(raw_all[bt_off:bt_off + bt_n * 16], _mpq_hash("(block table)", 3))

    blocks = []
    for i in range(bt_n):
        blocks.append(struct.unpack_from("<IIII", bt_dec, i * 16))  # off, csize, fsize, flags

    hashes = []
    for i in range(ht_n):
        n_a, n_b, locale, platform, bi = struct.unpack_from("<IIHHI", ht_dec, i * 16)
        if bi < 0xFFFFFFFE:
            hashes.append((n_a, n_b, bi))

    def _extract_block(bi):
        off, csize, fsize, flags = blocks[bi]
        raw = raw_all[off:off + csize]
        # We only write single-unit uncompressed → just return raw
        # If someone else wrote it compressed/multisector, we won't decode
        return raw, fsize, flags

    # First: try to find (listfile)
    list_a = _mpq_hash("(listfile)", 1)
    list_b = _mpq_hash("(listfile)", 2)
    names = []
    for n_a, n_b, bi in hashes:
        if n_a == list_a and n_b == list_b:
            raw, _, _ = _extract_block(bi)
            txt = raw.decode("utf-8", errors="ignore")
            names = [ln.strip() for ln in txt.replace("\r", "\n").split("\n") if ln.strip()]
            break

    # Fallback known names (if no listfile in MPQ)
    if not names:
        names = ["DBFilesClient\\Item.dbc", "DBFilesClient\\Spell.dbc",
                 "DBFilesClient\\CharStartOutfit.dbc", "DBFilesClient\\CharBaseInfo.dbc"]

    out_files = {}
    name_lookup = {}
    for n in names:
        norm = n.upper().replace("/", "\\")
        name_lookup[(_mpq_hash(norm, 1), _mpq_hash(norm, 2))] = n

    used_blocks = set()
    for n_a, n_b, bi in hashes:
        nm = name_lookup.get((n_a, n_b))
        if not nm or nm == "(listfile)":
            continue
        raw, fsize, flags = _extract_block(bi)
        out_files[nm] = {"size": fsize, "data": raw, "flags": flags}
        used_blocks.add(bi)

    # Show unknown entries as <unknown #N> so user sees they exist
    unknown = 0
    for n_a, n_b, bi in hashes:
        if bi in used_blocks: continue
        if name_lookup.get((n_a, n_b)) == "(listfile)": continue
        # Skip the (listfile) hash explicitly
        if n_a == list_a and n_b == list_b: continue
        raw, fsize, flags = _extract_block(bi)
        out_files[f"<unknown #{unknown}>"] = {"size": fsize, "data": raw, "flags": flags}
        unknown += 1

    return out_files, None


def _mpq_write(out_path, files):
    """files = list of (mpq_path, bytes). Single-unit uncompressed v1 MPQ.
    Automatically appends (listfile) so the MPQ is self-describing."""
    # Auto-include listfile
    listfile_text = "\r\n".join(p for p, _ in files) + "\r\n"
    files = list(files) + [("(listfile)", listfile_text.encode("utf-8"))]
    n = len(files)
    # Hash table size: power of 2, >= max(16, 2*n)
    htsize = 16
    while htsize < n * 2:
        htsize <<= 1
    HEADER_SIZE = 32

    # Lay out file data sequentially after header
    block_table = []
    file_data_blob = bytearray()
    cur_offset = HEADER_SIZE
    for path, content in files:
        block_table.append((cur_offset, len(content), len(content),
                            0x80000000 | 0x01000000))  # EXISTS | SINGLE_UNIT (no compression)
        file_data_blob.extend(content)
        cur_offset += len(content)

    hash_table_offset = cur_offset
    block_table_offset = hash_table_offset + htsize * 16

    # Build hash table (filled with 0xFFFFFFFF entries first)
    hash_entries = []  # list of [name1, name2, locale, platform, block_idx]
    for _ in range(htsize):
        hash_entries.append([0xFFFFFFFF, 0xFFFFFFFF, 0xFFFF, 0xFFFF, 0xFFFFFFFF])

    for idx, (path, _) in enumerate(files):
        bucket = _mpq_hash(path, 0) & (htsize - 1)
        name_a = _mpq_hash(path, 1)
        name_b = _mpq_hash(path, 2)
        # Linear probe to find a free slot
        for probe in range(htsize):
            slot = (bucket + probe) & (htsize - 1)
            if hash_entries[slot][4] == 0xFFFFFFFF:
                hash_entries[slot] = [name_a, name_b, 0, 0, idx]
                break

    # Serialize hash table (raw)
    ht_raw = bytearray()
    for e in hash_entries:
        ht_raw.extend(struct.pack("<IIHHI", e[0] & 0xFFFFFFFF, e[1] & 0xFFFFFFFF,
                                  e[2] & 0xFFFF, e[3] & 0xFFFF, e[4] & 0xFFFFFFFF))
    ht_enc = _mpq_encrypt(bytes(ht_raw), _mpq_hash("(hash table)", 3))

    # Serialize block table (raw)
    bt_raw = bytearray()
    for off, csize, fsize, flags in block_table:
        bt_raw.extend(struct.pack("<IIII", off, csize, fsize, flags))
    bt_enc = _mpq_encrypt(bytes(bt_raw), _mpq_hash("(block table)", 3))

    archive_size = block_table_offset + len(bt_enc)

    # Header (v1)
    header = struct.pack(
        "<4sIIHHIIII",
        b"MPQ\x1A",     # magic
        HEADER_SIZE,    # header size
        archive_size,
        0,              # format version
        3,              # sector size shift (4096-byte sectors)
        hash_table_offset,
        block_table_offset,
        htsize,
        n,              # block table entries
    )

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(header)
        f.write(file_data_blob)
        f.write(ht_enc)
        f.write(bt_enc)


def _mpq_extras_dir():
    s = _settings_load()
    out_dir = s.get("mpq_output_dir") or CONFIG.get("mpq_output_dir") or os.path.join(BASE_DIR, "mpq")
    return os.path.join(out_dir, "extras")


def _collect_mpq_files():
    """Build the file list for the patch MPQ: Item.dbc + everything from extras/.
    Returns list of (mpq_path_with_backslashes, bytes)."""
    files = []
    item_dbc_path = _find_dbc("Item.dbc")
    if item_dbc_path:
        with open(item_dbc_path, "rb") as f:
            files.append(("DBFilesClient\\Item.dbc", f.read()))
    extras = _mpq_extras_dir()
    if os.path.isdir(extras):
        for root, _, names in os.walk(extras):
            for name in names:
                full = os.path.join(root, name)
                rel = os.path.relpath(full, extras).replace("/", "\\")
                # Skip Item.dbc in extras (Item.dbc is sourced from server folder)
                if rel.lower() == "dbfilesclient\\item.dbc":
                    continue
                with open(full, "rb") as f:
                    files.append((rel, f.read()))
    return files


def _build_item_patch_mpq():
    """Rebuild patch MPQ containing the current Item.dbc + extras.
    Returns (mpq_path, copied_to_client: bool, error: str|None)."""
    s = _settings_load()
    out_dir = s.get("mpq_output_dir") or CONFIG.get("mpq_output_dir") or os.path.join(BASE_DIR, "mpq")
    patch_name = s.get("patch_name") or "patch-Z.MPQ"
    out_path = os.path.join(out_dir, patch_name)

    files = _collect_mpq_files()
    if not files:
        return None, False, "No files for MPQ available"
    _mpq_write(out_path, files)

    copied = False
    if s.get("auto_copy_patch") and s.get("client_data_path"):
        try:
            import shutil
            client_target = os.path.join(s["client_data_path"], patch_name)
            shutil.copy2(out_path, client_target)
            copied = True
        except Exception as e:
            return out_path, False, f"Patch written, Client copy failed: {e}"
    return out_path, copied, None


# ── Endpoints: settings + custom items CRUD ─────────────────────────────────

@app.route("/api/item-create/settings", methods=["GET", "POST"])
def item_create_settings():
    if request.method == "POST":
        d = request.get_json() or {}
        s = _settings_load()
        for k in ("client_data_path","auto_copy_patch","patch_name","mpq_output_dir"):
            if k in d:
                s[k] = d[k]
        if not _settings_save():
            return err("Settings save failed", 500)
        return ok(s)
    return ok(_settings_load())


# ── ScalingStat CSVs laden (for SSD-basierte Templates) ─────────────────────
_SSV_BY_LEVEL = {}   # level -> {col_name: value}
_SSD_TEMPLATES_RAW = []  # [{id, max_level, stats:[(stat_id, bonus), …]}]

def _load_scaling_csvs():
    import csv
    base = CONFIG.get("exports_dir") or BASE_DIR
    ssv_p = os.path.join(base, "ScalingStatValues.csv")
    ssd_p = os.path.join(base, "ScalingStatDistribution.csv")
    if os.path.exists(ssv_p):
        with open(ssv_p, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    lvl = int(row["Charlevel"])
                    _SSV_BY_LEVEL[lvl] = {k: int(v) for k, v in row.items()
                                          if k not in ("ID", "Charlevel")}
                except Exception:
                    pass
    if os.path.exists(ssd_p):
        with open(ssd_p, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    sid = int(row["ID"])
                    ml = int(row["Maxlevel"])
                    stats = []
                    for i in range(1, 11):
                        sti = int(row.get(f"StatID_{i}", -1))
                        bon = int(row.get(f"Bonus_{i}", 0))
                        if sti > 0 and bon > 0:
                            stats.append((sti, bon))
                    _SSD_TEMPLATES_RAW.append({"id": sid, "max_level": ml, "stats": stats})
                except Exception:
                    pass

# Canonical SSV mapping (SSD ID → bitmask of its "intended" item slot)
_CANONICAL_SSD_TO_SSV = {
    1: 1032, 2: 516, 3: 516, 4: 8208, 5: 36872, 6: 34820,
    7: 257, 8: 129, 9: 129, 10: 65, 11: 65, 16: 33,
    251: 2, 271: 2,
    292: 516, 293: 1032, 294: 8208, 295: 34820, 296: 36872, 297: 516,
    298: 2, 299: 2,
    300: 257, 301: 257, 302: 129, 303: 129, 304: 65, 305: 65, 306: 33,
    331: 4194312, 332: 4194312, 333: 8388616,
    334: 2097160, 335: 2097160, 336: 1048584,
    351: 516, 352: 1032, 371: 262144,
}

_HEIRLOOM_STAT_NAMES = {
    1:"HP", 3:"Agi", 4:"Str", 5:"Int", 6:"Spi", 7:"Sta",
    12:"Def", 13:"Dod", 14:"Par", 15:"BlkR",
    16:"MHit", 17:"RHit", 18:"SHit", 19:"MCrit", 20:"RCrit", 21:"SCrit",
    31:"Hit", 32:"Crit", 35:"Resil", 36:"Haste", 37:"Exp",
    38:"AP", 39:"RAP", 41:"Heal", 42:"SpDmg", 43:"MP5",
    44:"ArPen", 45:"SP", 46:"HP5", 47:"SPen", 48:"BlkV",
}

def _ssv_budget_col(bitmask):
    """Map SSV bitmask → budget column name in SSV CSV."""
    if bitmask & 0x01: return "ShoulderBudget"
    if bitmask & 0x02: return "TrinketBudget"
    if bitmask & 0x04: return "WeaponBudget1H"
    if bitmask & 0x08: return "PrimaryBudget"
    if bitmask & 0x10: return "RangedBudget"
    if bitmask & 0x40000: return "TertiaryBudget"  # bit 18 = rings
    return "PrimaryBudget"

def _primary_stat_group(stat_ids):
    s = set(stat_ids)
    if 4 in s: return "Strength"
    if 3 in s or 38 in s: return "Agility / AP"
    if 5 in s or 45 in s: return "Intellect / Spell"
    if 6 in s: return "Spirit / Healer"
    if 35 in s: return "PvP / Resilience"
    return "Other"


HEIRLOOM_TEMPLATES = [
    # ── Weapons (Strength) — spellid 57353 = +10% XP (gleicher Spell auf allen XP-Items) ──
    {"group":"Weapon · Strength", "label":"2H Axe (Bloodied Arcanite Reaper)",            "ssd":1,   "ssv":1032,  "spellid_1":0},
    {"group":"Weapon · Strength", "label":"2H Sword (Reforged Truesilver Champion)",      "ssd":293, "ssv":1032,  "spellid_1":0},
    {"group":"Weapon · Strength", "label":"2H Mace (Repurposed Lava Dredger)",            "ssd":352, "ssv":1032,  "spellid_1":0},
    {"group":"Weapon · Strength", "label":"1H Sword (Venerable Dal'Rend's Sacred Charge)","ssd":3,   "ssv":516,   "spellid_1":0},
    {"group":"Weapon · Strength", "label":"1H Sword (Battleworn Thrash Blade)",           "ssd":297, "ssv":516,   "spellid_1":59830},
    {"group":"Weapon · Strength", "label":"1H Mace (Venerable Mass of McGowan)",          "ssd":351, "ssv":516,   "spellid_1":0},

    # ── Weapons (Agility) ────────────────────────────────────────────────
    {"group":"Weapon · Agility",  "label":"Dagger (Balanced Heartseeker)",                "ssd":2,   "ssv":516,   "spellid_1":0},
    {"group":"Weapon · Agility",  "label":"Dagger (Sharpened Scarlet Kris)",              "ssd":292, "ssv":516,   "spellid_1":0},
    {"group":"Weapon · Agility",  "label":"Bow (Charmed Ancient Bone Bow)",               "ssd":4,   "ssv":8208,  "spellid_1":0},
    {"group":"Weapon · Agility",  "label":"Gun (Upgraded Dwarven Hand Cannon)",           "ssd":294, "ssv":8208,  "spellid_1":0},

    # ── Weapons (Caster / Intellect) ─────────────────────────────────────
    {"group":"Weapon · Caster",   "label":"Staff (Dignified Headmaster's Charge)",        "ssd":5,   "ssv":36872, "spellid_1":0},
    {"group":"Weapon · Caster",   "label":"Staff (Grand Staff of Jordan)",                "ssd":296, "ssv":36872, "spellid_1":0},
    {"group":"Weapon · Caster",   "label":"1H Mace (Devout Aurastone Hammer)",            "ssd":6,   "ssv":34820, "spellid_1":0},
    {"group":"Weapon · Caster",   "label":"1H Mace (The Blessed Hammer of Grace)",        "ssd":295, "ssv":34820, "spellid_1":0},

    # ── Cloth ────────────────────────────────────────────────────────────
    {"group":"Cloth",             "label":"Cloth Shoulders PvE (Tattered Dreadmist Mantle)",       "ssd":16,  "ssv":33,      "spellid_1":57353},
    {"group":"Cloth",             "label":"Cloth Shoulders PvP (Exquisite Sunderseer Mantle)",     "ssd":306, "ssv":33,      "spellid_1":57353},
    {"group":"Cloth",             "label":"Cloth Chest Caster (Tattered Dreadmist Robe)",          "ssd":336, "ssv":1048584, "spellid_1":57353},

    # ── Leather ──────────────────────────────────────────────────────────
    {"group":"Leather",           "label":"Leather Shoulders Rogue/Feral PvE (Stained Shadowcraft Spaulders)", "ssd":10,  "ssv":65,      "spellid_1":57353},
    {"group":"Leather",           "label":"Leather Shoulders Rogue/Feral PvP (Exceptional Stormshroud Shoulders)", "ssd":304, "ssv":65,      "spellid_1":57353},
    {"group":"Leather",           "label":"Leather Shoulders Druid Caster PvE (Preened Ironfeather Shoulders)", "ssd":11,  "ssv":65,      "spellid_1":57353},
    {"group":"Leather",           "label":"Leather Shoulders Druid Caster PvP (Lasting Feralheart Spaulders)",  "ssd":305, "ssv":65,      "spellid_1":57353},
    {"group":"Leather",           "label":"Leather Chest Rogue Agility (Stained Shadowcraft Tunic)", "ssd":335, "ssv":2097160, "spellid_1":57353},
    {"group":"Leather",           "label":"Leather Chest Druid Caster (Preened Ironfeather Breastplate)", "ssd":334, "ssv":2097160, "spellid_1":57353},

    # ── Mail ─────────────────────────────────────────────────────────────
    {"group":"Mail",              "label":"Mail Shoulders Hunter PvE (Champion Herod's Shoulder)",   "ssd":8,   "ssv":129,     "spellid_1":57353},
    {"group":"Mail",              "label":"Mail Shoulders Hunter PvP (Prized Beastmaster's Mantle)", "ssd":302, "ssv":129,     "spellid_1":57353},
    {"group":"Mail",              "label":"Mail Shoulders Caster PvE (Mystical Pauldrons of Elements)", "ssd":9, "ssv":129,     "spellid_1":57353},
    {"group":"Mail",              "label":"Mail Shoulders Caster PvP (Aged Pauldrons of The Five Thunders)", "ssd":303, "ssv":129,     "spellid_1":57353},
    {"group":"Mail",              "label":"Mail Chest Hunter Agility (Champion's Deathdealer Breastplate)", "ssd":331, "ssv":4194312, "spellid_1":57353},
    {"group":"Mail",              "label":"Mail Chest Shaman Caster (Mystical Vest of Elements)",    "ssd":332, "ssv":4194312, "spellid_1":57353},

    # ── Plate ────────────────────────────────────────────────────────────
    {"group":"Plate",             "label":"Plate Shoulders Strength PvE (Polished Spaulders of Valor)",        "ssd":7,   "ssv":257,     "spellid_1":57353},
    {"group":"Plate",             "label":"Plate Shoulders Strength PvP (Strengthened Stockade Pauldrons)",    "ssd":300, "ssv":257,     "spellid_1":57353},
    {"group":"Plate",             "label":"Plate Shoulders Paladin Holy (Pristine Lightforge Spaulders)",      "ssd":301, "ssv":257,     "spellid_1":57353},
    {"group":"Plate",             "label":"Plate Chest Strength (Polished Breastplate of Valor)",              "ssd":333, "ssv":8388616, "spellid_1":57353},

    # ── Trinkets (eigene Procs) ──────────────────────────────────────────
    {"group":"Trinket",           "label":"Trinket Melee (Swift Hand of Justice)",                   "ssd":251, "ssv":2,       "spellid_1":59906},
    {"group":"Trinket",           "label":"Trinket Caster (Discerning Eye of the Beast)",            "ssd":271, "ssv":2,       "spellid_1":59915},
    {"group":"Trinket",           "label":"Trinket PvP Horde (Inherited Insignia of the Horde)",     "ssd":298, "ssv":2,       "spellid_1":42292},
    {"group":"Trinket",           "label":"Trinket PvP Alliance (Inherited Insignia of the Alliance)","ssd":299, "ssv":2,       "spellid_1":42292},

    # ── Ring ─────────────────────────────────────────────────────────────
    {"group":"Ring",              "label":"Ring (Dread Pirate Ring)",                                "ssd":371, "ssv":262144,  "spellid_1":71354},
]

@app.route("/api/item-create/enums")
def item_create_enums():
    try:
        from item_enums import (CLASS_MAP, SUBCLASS_MAP, QUALITY_MAP, INVENTORYTYPE_MAP,
                                ITEM_FLAG_MAP, FLAGS_EXTRA_MAP, BONDING_MAP, DMG_TYPE_MAP,
                                ITEM_STAT_TYPE_MAP, STAT_SHORTNAMES,
                                ALLOWABLE_CLASS_MAP, ALLOWABLE_RACE_MAP,
                                SOCKET_COLOR_MAP, MATERIAL_MAP)
        # Shorten stat names for the dropdown
        stat_pretty = {}
        for k, v in ITEM_STAT_TYPE_MAP.items():
            short = STAT_SHORTNAMES.get(v, v.replace("ITEM_MOD_", "").replace("_", " ").title())
            stat_pretty[k] = short
        sheath_map = {0:"None",1:"2H Weapon",2:"Staff",3:"1H Weapon",
                      4:"Shield",5:"Enchanter Rod",7:"2H Weapon Right",8:"2H Weapon Left"}
        # Add "None" as 0 for socket dropdown (not in original SOCKET_COLOR_MAP)
        socket_color_with_none = {0: "None", **SOCKET_COLOR_MAP}
        # Add -1 = None to material dropdown
        material_with_none = {-1: "None", **MATERIAL_MAP}
        return ok({
            "class": CLASS_MAP,
            "subclass": SUBCLASS_MAP,
            "quality": QUALITY_MAP,
            "inventoryType": INVENTORYTYPE_MAP,
            "flags": ITEM_FLAG_MAP,
            "flagsExtra": FLAGS_EXTRA_MAP,
            "bonding": BONDING_MAP,
            "dmgType": DMG_TYPE_MAP,
            "statType": stat_pretty,
            "allowableClass": ALLOWABLE_CLASS_MAP,
            "allowableRace": ALLOWABLE_RACE_MAP,
            "socketColor": socket_color_with_none,
            "material": material_with_none,
            "sheath": sheath_map,
            "heirloomTemplates": HEIRLOOM_TEMPLATES,
            "ssvBitmasks": [
                {"value": 0,       "label": "0 — Kein Scaling"},
                {"value": 33,      "label": "33 — Cloth Shoulders"},
                {"value": 65,      "label": "65 — Leather Shoulders"},
                {"value": 129,     "label": "129 — Mail Shoulders"},
                {"value": 257,     "label": "257 — Plate Shoulders"},
                {"value": 1048584, "label": "1048584 — Cloth Chest"},
                {"value": 2097160, "label": "2097160 — Leather Chest"},
                {"value": 4194312, "label": "4194312 — Mail Chest"},
                {"value": 8388616, "label": "8388616 — Plate Chest"},
                {"value": 2,       "label": "2 — Trinket"},
                {"value": 262144,  "label": "262144 — Ring"},
                {"value": 516,     "label": "516 — 1H Weapon (Strength/Agility)"},
                {"value": 1032,    "label": "1032 — 2H Weapon (Strength)"},
                {"value": 8208,    "label": "8208 — Ranged Weapon (Bow/Gun)"},
                {"value": 34820,   "label": "34820 — Caster 1H Mace (Int/SP)"},
                {"value": 36872,   "label": "36872 — Caster Staff (Int/SP, 2H)"},
                {"value": 49168,   "label": "49168 — Wand (Int/SP)"},
            ],
        })
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/item-create/ssd-templates")
def item_create_ssd_templates():
    try:
        if not _SSD_TEMPLATES_RAW:
            _load_scaling_csvs()
        if not _SSV_BY_LEVEL:
            return err(f"ScalingStatValues.csv not loaded (looked in {CONFIG.get('exports_dir') or BASE_DIR})")
        if not _SSD_TEMPLATES_RAW:
            return err("ScalingStatDistribution.csv not loaded")
        level = int(request.args.get("level", 80))
        avail = sorted(_SSV_BY_LEVEL.keys())
        if level not in _SSV_BY_LEVEL:
            level = min(avail, key=lambda l: abs(l - level))
        row = _SSV_BY_LEVEL[level]

        templates = []
        for ssd in _SSD_TEMPLATES_RAW:
            if ssd["max_level"] <= 15: continue
            if not ssd["stats"]: continue
            canonical = _CANONICAL_SSD_TO_SSV.get(ssd["id"], 8)  # default PrimaryBudget bit
            budget = row.get(_ssv_budget_col(canonical), row.get("PrimaryBudget", 0))
            stat_parts = []
            for sid, bonus in ssd["stats"]:
                val = int(round(bonus * budget / 10000))
                stat_parts.append({"stat": _HEIRLOOM_STAT_NAMES.get(sid, f"Stat{sid}"),
                                   "stat_id": sid, "value": val})
            grp = _primary_stat_group([s for s, _ in ssd["stats"]])
            label_parts = ", ".join(f"{p['value']} {p['stat']}" for p in stat_parts)
            templates.append({
                "ssd": ssd["id"], "canonical_ssv": canonical, "group": grp,
                "label": f"#{ssd['id']} · {label_parts}",
            })

        # Available levels for the selector
        return ok({
            "level": level,
            "available_levels": avail,
            "templates": templates,
        })
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/item-create/next-id")
def item_create_next_id():
    try:
        row = query(
            "SELECT MAX(entry) AS m FROM item_template WHERE entry >= %s",
            [_CREATE_ITEM_MIN_ID], one=True
        )
        nxt = (row["m"] or _CREATE_ITEM_MIN_ID - 1) + 1
        if nxt < _CREATE_ITEM_MIN_ID:
            nxt = _CREATE_ITEM_MIN_ID
        return ok({"next_id": nxt})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/item-create/list")
def item_create_list():
    try:
        rows = query(
            "SELECT entry, name, Quality, class, subclass, displayid, InventoryType, ItemLevel "
            "FROM item_template WHERE entry >= %s ORDER BY entry DESC",
            [_CREATE_ITEM_MIN_ID]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/item-create/save", methods=["POST"])
def item_create_save():
    d = request.get_json() or {}
    entry = int(d.get("entry", 0))
    if entry < _CREATE_ITEM_MIN_ID:
        return err(f"Custom item ID must be >= {_CREATE_ITEM_MIN_ID} sein")

    # Build INSERT/UPDATE against item_template — use all provided keys
    fields = {k: v for k, v in d.items() if k != "entry" and v is not None}
    if not fields:
        return err("No fields gesetzt")
    # entry must be in INSERT
    cols = ["entry"] + list(fields.keys())
    vals = [entry] + list(fields.values())
    placeholders = ",".join(["%s"] * len(cols))
    update_clause = ",".join(f"{k}=VALUES({k})" for k in fields.keys())
    col_str = ",".join(f"`{c}`" for c in cols)
    try:
        execute(
            f"INSERT INTO item_template ({col_str}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {update_clause}",
            vals
        )
        # Update Item.dbc
        if not _ITEM_DBC_HEADER:
            _load_item_dbc()
        _item_dbc_add_or_update(
            item_id      = entry,
            class_id     = int(d.get("class", 0)),
            subclass_id  = int(d.get("subclass", 0)),
            material     = int(d.get("Material", 0)),
            display_id   = int(d.get("displayid", 0)),
            inv_type     = int(d.get("InventoryType", 0)),
            sheathe      = int(d.get("sheath", 0)),
            sound_override = int(d.get("SoundOverrideSubclass", -1)),
        )
        _save_item_dbc()
        mpq_path, copied, mpq_err = _build_item_patch_mpq()
        return ok({
            "entry": entry,
            "mpq_path": mpq_path,
            "copied_to_client": copied,
            "mpq_error": mpq_err,
        })
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/item-create/delete", methods=["POST"])
def item_create_delete():
    d = request.get_json() or {}
    entry = int(d.get("entry", 0))
    if entry < _CREATE_ITEM_MIN_ID:
        return err(f"Only custom items (>= {_CREATE_ITEM_MIN_ID}) deletable")
    try:
        execute("DELETE FROM item_template WHERE entry = %s", [entry])
        if not _ITEM_DBC_HEADER:
            _load_item_dbc()
        if _item_dbc_remove(entry):
            _save_item_dbc()
        mpq_path, copied, mpq_err = _build_item_patch_mpq()
        return ok({"entry": entry, "mpq_path": mpq_path, "copied_to_client": copied})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/item-create/rebuild-mpq", methods=["POST"])
def item_create_rebuild_mpq():
    try:
        mpq_path, copied, mpq_err = _build_item_patch_mpq()
        return ok({"mpq_path": mpq_path, "copied_to_client": copied, "mpq_error": mpq_err})
    except Exception as e:
        return err(str(e), 500)


# ══════════════════════════════════════════════════════════════════════════════
# Spell Creator — custom spells in spell_dbc (+ optional proc/bonus/threat/cd)
# ══════════════════════════════════════════════════════════════════════════════

_SPELL_CREATE_MIN_ID = 80000

# Common templates that pre-fill effect + aura fields.
# Each template sets a small dict of fields to override on the new spell.
SPELL_CREATE_TEMPLATES = {
    "direct_damage": {
        "label": "🔥 Direkter Schaden (Frostbolt-Style)",
        "fields": {
            "Effect_1": 2,            # SPELL_EFFECT_SCHOOL_DAMAGE
            "EffectBasePoints_1": 99, # default 100 dmg (BasePoints + 1)
            "EffectDieSides_1": 1,
            "ImplicitTargetA_1": 6,   # TARGET_UNIT_TARGET_ENEMY
            "Targets": 0,
            "SchoolMask": 16,         # Frost school
            "CastingTimeIndex": 4,    # 2.5 sec cast
        }
    },
    "instant_damage": {
        "label": "⚡ Instant Schaden (Smite-Style)",
        "fields": {
            "Effect_1": 2, "EffectBasePoints_1": 99, "EffectDieSides_1": 1,
            "ImplicitTargetA_1": 6,
            "SchoolMask": 2,          # Holy
            "CastingTimeIndex": 1,    # Instant
        }
    },
    "dot": {
        "label": "🐍 DoT — Periodischer Schaden (Corruption-Style)",
        "fields": {
            "Effect_1": 6,            # SPELL_EFFECT_APPLY_AURA
            "EffectAura_1": 3,        # SPELL_AURA_PERIODIC_DAMAGE
            "EffectBasePoints_1": 49, # 50 dmg per tick
            "EffectDieSides_1": 1,
            "EffectAuraPeriod_1": 3000,  # 3 sec tick
            "ImplicitTargetA_1": 6,
            "SchoolMask": 32,         # Shadow
            "DurationIndex": 21,      # 18 sec duration (index, check Duration.dbc)
            "CastingTimeIndex": 1,
        }
    },
    "hot": {
        "label": "🌿 HoT — Periodische Heilung (Renew-Style)",
        "fields": {
            "Effect_1": 6,
            "EffectAura_1": 8,        # SPELL_AURA_PERIODIC_HEAL
            "EffectBasePoints_1": 99,
            "EffectDieSides_1": 1,
            "EffectAuraPeriod_1": 3000,
            "ImplicitTargetA_1": 21,  # TARGET_UNIT_TARGET_ALLY
            "SchoolMask": 2,          # Holy
            "DurationIndex": 21,
            "CastingTimeIndex": 1,
        }
    },
    "aoe_damage": {
        "label": "💥 AoE Schaden (Blizzard-Style — Ground-Target)",
        "fields": {
            "Effect_1": 2,
            "EffectBasePoints_1": 99,
            "EffectDieSides_1": 1,
            "EffectRadiusIndex_1": 9, # 10 yard radius
            "ImplicitTargetA_1": 22,  # TARGET_DEST_DEST_RADIUS (Ground AoE)
            "ImplicitTargetB_1": 16,  # TARGET_UNIT_DEST_AREA_ENEMY
            "SchoolMask": 16,
            "CastingTimeIndex": 4,
        }
    },
    "direct_heal": {
        "label": "💖 Direkt-Heal (Heal-Style)",
        "fields": {
            "Effect_1": 10,           # SPELL_EFFECT_HEAL
            "EffectBasePoints_1": 999,
            "EffectDieSides_1": 1,
            "ImplicitTargetA_1": 21,
            "SchoolMask": 2,
            "CastingTimeIndex": 4,
        }
    },
    "stat_buff": {
        "label": "💪 Stat-Buff (Mark of the Wild-Style)",
        "fields": {
            "Effect_1": 6,
            "EffectAura_1": 29,       # SPELL_AURA_MOD_STAT
            "EffectMiscValue_1": -1,  # -1 = all stats; 0=Str,1=Agi,2=Sta,3=Int,4=Spi
            "EffectBasePoints_1": 9,  # +10 stat
            "EffectDieSides_1": 1,
            "ImplicitTargetA_1": 21,
            "SchoolMask": 8,          # Nature
            "DurationIndex": 21,
            "CastingTimeIndex": 1,
        }
    },
    "speed_slow": {
        "label": "🐌 Speed Slow (Slow-Style)",
        "fields": {
            "Effect_1": 6,
            "EffectAura_1": 33,       # SPELL_AURA_MOD_DECREASE_SPEED
            "EffectBasePoints_1": -50,
            "EffectDieSides_1": 1,
            "ImplicitTargetA_1": 6,
            "SchoolMask": 16,         # Frost
            "DurationIndex": 21,
            "CastingTimeIndex": 1,
        }
    },
    "proc_on_hit": {
        "label": "🎯 Proc on Hit (Triggert anderen Spell)",
        "fields": {
            "Effect_1": 6,
            "EffectAura_1": 42,       # SPELL_AURA_PROC_TRIGGER_SPELL
            "EffectTriggerSpell_1": 0,  # User fills with target spell ID
            "EffectBasePoints_1": 0,
            "EffectDieSides_1": 1,
            "ProcChance": 30,
            "ProcCharges": 0,
            "ImplicitTargetA_1": 1,   # SELF
            "SchoolMask": 1,
            "DurationIndex": 21,
            "CastingTimeIndex": 1,
        }
    },
    "summon_creature": {
        "label": "🐾 Summon Creature (BasePoints = creature_template.entry)",
        "fields": {
            "Effect_1": 28,           # SPELL_EFFECT_SUMMON
            "EffectBasePoints_1": 1,  # creature_template.entry
            "EffectDieSides_1": 1,
            "EffectMiscValue_1": 64,  # Wild/Possessed summon
            "ImplicitTargetA_1": 1,
            "SchoolMask": 1,
            "CastingTimeIndex": 1,
        }
    },
}


# Spell-Editor-relevante Felder (Subset — alles in spell_dbc, max 3 Effekte)
_SPELL_DBC_DEFAULTS = {
    "Category": 0, "DispelType": 0, "Mechanic": 0,
    "Attributes": 0, "AttributesEx": 0, "AttributesEx2": 0, "AttributesEx3": 0,
    "AttributesEx4": 0, "AttributesEx5": 0, "AttributesEx6": 0, "AttributesEx7": 0,
    "ShapeshiftMask": 0, "ShapeshiftExclude": 0,
    "Targets": 0, "TargetCreatureType": 0, "RequiresSpellFocus": 0, "FacingCasterFlags": 0,
    "CasterAuraState": 0, "TargetAuraState": 0,
    "ExcludeCasterAuraState": 0, "ExcludeTargetAuraState": 0,
    "CasterAuraSpell": 0, "TargetAuraSpell": 0,
    "ExcludeCasterAuraSpell": 0, "ExcludeTargetAuraSpell": 0,
    "CastingTimeIndex": 1, "RecoveryTime": 0, "CategoryRecoveryTime": 0,
    "InterruptFlags": 0, "AuraInterruptFlags": 0, "ChannelInterruptFlags": 0,
    "ProcTypeMask": 0, "ProcChance": 0, "ProcCharges": 0,
    "MaxLevel": 0, "BaseLevel": 1, "SpellLevel": 1,
    "DurationIndex": 0,
    "PowerType": 0, "ManaCost": 0, "ManaCostPerLevel": 0,
    "ManaPerSecond": 0, "ManaPerSecondPerLevel": 0,
    "RangeIndex": 6,  # 30 yards default
    "Speed": 0.0, "ModalNextSpell": 0, "CumulativeAura": 0,
    "Totem_1": 0, "Totem_2": 0,
    "EquippedItemClass": -1, "EquippedItemSubclass": 0, "EquippedItemInvTypes": 0,
    "Effect_1": 0, "Effect_2": 0, "Effect_3": 0,
    "EffectDieSides_1": 0, "EffectDieSides_2": 0, "EffectDieSides_3": 0,
    "EffectRealPointsPerLevel_1": 0.0, "EffectRealPointsPerLevel_2": 0.0, "EffectRealPointsPerLevel_3": 0.0,
    "EffectBasePoints_1": 0, "EffectBasePoints_2": 0, "EffectBasePoints_3": 0,
    "EffectMechanic_1": 0, "EffectMechanic_2": 0, "EffectMechanic_3": 0,
    "ImplicitTargetA_1": 0, "ImplicitTargetA_2": 0, "ImplicitTargetA_3": 0,
    "ImplicitTargetB_1": 0, "ImplicitTargetB_2": 0, "ImplicitTargetB_3": 0,
    "EffectRadiusIndex_1": 0, "EffectRadiusIndex_2": 0, "EffectRadiusIndex_3": 0,
    "EffectAura_1": 0, "EffectAura_2": 0, "EffectAura_3": 0,
    "EffectAuraPeriod_1": 0, "EffectAuraPeriod_2": 0, "EffectAuraPeriod_3": 0,
    "EffectMultipleValue_1": 0.0, "EffectMultipleValue_2": 0.0, "EffectMultipleValue_3": 0.0,
    "EffectChainTargets_1": 0, "EffectChainTargets_2": 0, "EffectChainTargets_3": 0,
    "EffectItemType_1": 0, "EffectItemType_2": 0, "EffectItemType_3": 0,
    "EffectMiscValue_1": 0, "EffectMiscValue_2": 0, "EffectMiscValue_3": 0,
    "EffectMiscValueB_1": 0, "EffectMiscValueB_2": 0, "EffectMiscValueB_3": 0,
    "EffectTriggerSpell_1": 0, "EffectTriggerSpell_2": 0, "EffectTriggerSpell_3": 0,
    "EffectPointsPerCombo_1": 0.0, "EffectPointsPerCombo_2": 0.0, "EffectPointsPerCombo_3": 0.0,
    "SpellVisualID_1": 0, "SpellVisualID_2": 0, "SpellIconID": 0, "ActiveIconID": 0,
    "SpellPriority": 0,
    "SchoolMask": 1,
    "RuneCostID": 0, "SpellMissileID": 0, "PowerDisplayId": 0,
    "EffectBonusMultiplier_1": 1.0, "EffectBonusMultiplier_2": 1.0, "EffectBonusMultiplier_3": 1.0,
    "SpellDescriptionVariableID": 0, "SpellDifficultyId": 0,
    # All Effect SpellClassMask defaults
    "EffectSpellClassMaskA_1": 0, "EffectSpellClassMaskA_2": 0, "EffectSpellClassMaskA_3": 0,
    "EffectSpellClassMaskB_1": 0, "EffectSpellClassMaskB_2": 0, "EffectSpellClassMaskB_3": 0,
    "EffectSpellClassMaskC_1": 0, "EffectSpellClassMaskC_2": 0, "EffectSpellClassMaskC_3": 0,
    "Name_Lang_Mask": 0,
    "NameSubtext_Lang_Mask": 0,
    "Description_Lang_Mask": 0,
    "AuraDescription_Lang_Mask": 0,
    "unk_320_2": 0, "unk_320_3": 0,
    "SpellFamilyName": 0,
    "SpellFamilyFlags": 0, "SpellFamilyFlags1": 0, "SpellFamilyFlags2": 0,
    "MaxAffectedTargets": 0,
    "DmgClass": 0, "PreventionType": 0,
    "DmgMultiplier_1": 1.0, "DmgMultiplier_2": 1.0, "DmgMultiplier_3": 1.0,
}


@app.route("/api/spell-create/templates")
def spell_create_templates():
    out = [{"key": k, **v} for k, v in SPELL_CREATE_TEMPLATES.items()]
    return ok(out)


@app.route("/api/spell-create/next-id")
def spell_create_next_id():
    try:
        row = query("SELECT MAX(ID) AS m FROM spell_dbc WHERE ID >= %s",
                    [_SPELL_CREATE_MIN_ID], one=True)
        nxt = (row["m"] or _SPELL_CREATE_MIN_ID - 1) + 1
        if nxt < _SPELL_CREATE_MIN_ID:
            nxt = _SPELL_CREATE_MIN_ID
        return ok({"next_id": nxt})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/spell-create/list")
def spell_create_list():
    try:
        rows = query(
            "SELECT ID, SpellIconID, "
            "COALESCE(NULLIF(Name_Lang_enUS,''), NULLIF(Name_Lang_deDE,'')) AS name, "
            "NameSubtext_Lang_enUS AS subtext, SchoolMask "
            "FROM spell_dbc WHERE ID >= %s ORDER BY ID DESC",
            [_SPELL_CREATE_MIN_ID]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/spell-create/load/<int:spell_id>")
def spell_create_load(spell_id):
    try:
        row = query("SELECT * FROM spell_dbc WHERE ID = %s", [spell_id], one=True)
        if not row:
            return err("Spell not found", 404)
        return ok(dict(row))
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/spell-create/save", methods=["POST"])
def spell_create_save():
    d = request.get_json() or {}
    sid = int(d.get("ID", 0))
    if sid < _SPELL_CREATE_MIN_ID:
        return err(f"Custom spell ID must be >= {_SPELL_CREATE_MIN_ID} sein")
    # Build column dict — only known spell_dbc columns
    cols = {"ID": sid}
    for k, v in d.items():
        if k == "ID": continue
        if k in _SPELL_DBC_DEFAULTS or k.startswith("Name_Lang_") or k.startswith("NameSubtext_Lang_") \
                or k.startswith("Description_Lang_") or k.startswith("AuraDescription_Lang_") \
                or k.startswith("ToolTip_"):
            cols[k] = v
    # Fill in defaults for any missing key columns
    for k, v in _SPELL_DBC_DEFAULTS.items():
        cols.setdefault(k, v)
    # Build INSERT...ON DUPLICATE KEY UPDATE
    keys = list(cols.keys())
    vals = list(cols.values())
    placeholders = ",".join(["%s"] * len(keys))
    col_str = ",".join(f"`{c}`" for c in keys)
    update_clause = ",".join(f"`{k}`=VALUES(`{k}`)" for k in keys if k != "ID")
    try:
        execute(
            f"INSERT INTO spell_dbc ({col_str}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {update_clause}",
            vals
        )
        return ok({"ID": sid})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/spell-create/delete", methods=["POST"])
def spell_create_delete():
    d = request.get_json() or {}
    sid = int(d.get("ID", 0))
    if sid < _SPELL_CREATE_MIN_ID:
        return err(f"Only custom spells (>= {_SPELL_CREATE_MIN_ID}) deletable")
    try:
        execute("DELETE FROM spell_dbc WHERE ID = %s", [sid])
        execute("DELETE FROM spell_proc WHERE SpellId = %s", [sid])
        execute("DELETE FROM spell_bonus_data WHERE entry = %s", [sid])
        execute("DELETE FROM spell_threat WHERE entry = %s", [sid])
        return ok({"ID": sid})
    except Exception as e:
        return err(str(e), 500)


# ══════════════════════════════════════════════════════════════════════════════
# Creature Creator — creature_template + creature_template_model
# ══════════════════════════════════════════════════════════════════════════════

_CREATURE_CREATE_MIN_ID = 90000

CREATURE_CREATE_TEMPLATES = {
    "quest_giver": {
        "label": "❓ Quest Giver (Humanoid Friendly)",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":35,"unit_class":1,
            "rank":0,"type":7,"npcflag":2,  # 2 = QuestGiver
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,
            "ExperienceModifier":1.0,"RegenHealth":1,
        }
    },
    "vendor_general": {
        "label": "🛒 Vendor (General Goods)",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":35,"unit_class":1,
            "rank":0,"type":7,"npcflag":129,  # 1=Gossip + 128=Vendor
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,"RegenHealth":1,
        }
    },
    "trainer_class": {
        "label": "🎓 Class Trainer",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":35,"unit_class":1,
            "rank":0,"type":7,"npcflag":17,  # 1=Gossip + 16=Trainer
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,"RegenHealth":1,
        }
    },
    "innkeeper": {
        "label": "🏠 Innkeeper",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":35,"unit_class":1,
            "rank":0,"type":7,"npcflag":65539,  # 1=Gossip + 2=QuestGiver + 65536=Innkeeper
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,"RegenHealth":1,
        }
    },
    "flightmaster": {
        "label": "🦅 Flight Master",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":35,"unit_class":1,
            "rank":0,"type":7,"npcflag":8193,  # 1=Gossip + 8192=FlightMaster
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,"RegenHealth":1,
        }
    },
    "guard_friendly": {
        "label": "🛡️ Guard (Friendly Humanoid)",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":35,"unit_class":1,
            "rank":1,"type":7,"npcflag":0,
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":5.0,"ManaModifier":1.0,"ArmorModifier":1.5,"RegenHealth":1,
            "BaseAttackTime":2000,"DamageModifier":2.0,"unit_flags":768,
        }
    },
    "mob_basic": {
        "label": "👹 Hostile Mob (Standard)",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":14,"unit_class":1,
            "rank":0,"type":7,"npcflag":0,
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,
            "ExperienceModifier":1.0,"RegenHealth":1,
            "BaseAttackTime":2000,"DamageModifier":1.0,"MovementType":1,
        }
    },
    "boss_elite": {
        "label": "👑 Elite Boss (Rank 3)",
        "fields": {
            "minlevel":83,"maxlevel":83,"faction":14,"unit_class":1,
            "rank":3,"type":7,"npcflag":0,
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":50.0,"ManaModifier":5.0,"ArmorModifier":2.0,
            "ExperienceModifier":1.0,"RegenHealth":1,
            "BaseAttackTime":2000,"DamageModifier":5.0,
            "flags_extra":1,  # NoXp
            "type_flags":4,   # BossMob
        }
    },
    "critter": {
        "label": "🐰 Critter (Friendly Tiny)",
        "fields": {
            "minlevel":1,"maxlevel":1,"faction":35,"unit_class":1,
            "rank":0,"type":6,"npcflag":0,  # type 6 = Critter
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":0.05,"ManaModifier":1.0,"ArmorModifier":0.5,
            "BaseAttackTime":2000,"DamageModifier":0.1,"MovementType":1,
        }
    },
    "beast_tameable": {
        "label": "🐺 Beast (Tameable by Hunters)",
        "fields": {
            "minlevel":80,"maxlevel":80,"faction":14,"unit_class":1,
            "rank":0,"type":1,"npcflag":0,  # type 1 = Beast
            "type_flags":1,  # Tameable
            "family":1,  # Wolf — pick anything from CreatureFamily.dbc
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,
            "BaseAttackTime":2000,"DamageModifier":1.0,"MovementType":1,
            "RegenHealth":1,
        }
    },
    "companion_pet": {
        "label": "🐾 Companion Pet (Mini Pet)",
        "fields": {
            "minlevel":1,"maxlevel":1,"faction":35,"unit_class":1,
            "rank":0,"type":9,"npcflag":0,  # type 9 = Non-Combat Pet
            "speed_walk":1.0,"speed_run":1.14286,
            "HealthModifier":0.05,"ManaModifier":1.0,"ArmorModifier":1.0,
            "BaseAttackTime":2000,"DamageModifier":0.1,
            "flags_extra":128,  # No XP / Loot
            "unit_flags":33554688,  # ImmuneToPC
        }
    },
}


_CREATURE_TEMPLATE_DEFAULTS = {
    "difficulty_entry_1":0,"difficulty_entry_2":0,"difficulty_entry_3":0,
    "KillCredit1":0,"KillCredit2":0,
    "subname":"","IconName":"","gossip_menu_id":0,
    "minlevel":1,"maxlevel":1,"exp":0,
    "faction":35,"npcflag":0,
    "speed_walk":1.0,"speed_run":1.14286,"speed_swim":1.0,"speed_flight":1.0,
    "detection_range":18.0,
    "rank":0,"dmgschool":0,
    "DamageModifier":1.0,"BaseAttackTime":2000,"RangeAttackTime":2000,
    "BaseVariance":1.0,"RangeVariance":1.0,
    "unit_class":1,"unit_flags":0,"unit_flags2":2048,"dynamicflags":0,
    "family":0,"type":7,"type_flags":0,
    "lootid":0,"pickpocketloot":0,"skinloot":0,
    "PetSpellDataId":0,"VehicleId":0,
    "mingold":0,"maxgold":0,
    "AIName":"","MovementType":0,
    "HoverHeight":1.0,
    "HealthModifier":1.0,"ManaModifier":1.0,"ArmorModifier":1.0,"ExperienceModifier":1.0,
    "RacialLeader":0,"movementId":0,"RegenHealth":1,
    "CreatureImmunitiesId":0,"flags_extra":0,
    "ScriptName":"","VerifiedBuild":0,
}


@app.route("/api/creature-create/templates")
def creature_create_templates():
    out = [{"key": k, **v} for k, v in CREATURE_CREATE_TEMPLATES.items()]
    return ok(out)


@app.route("/api/creature-create/next-id")
def creature_create_next_id():
    try:
        row = query("SELECT MAX(entry) AS m FROM creature_template WHERE entry >= %s",
                    [_CREATURE_CREATE_MIN_ID], one=True)
        nxt = (row["m"] or _CREATURE_CREATE_MIN_ID - 1) + 1
        if nxt < _CREATURE_CREATE_MIN_ID:
            nxt = _CREATURE_CREATE_MIN_ID
        return ok({"next_id": nxt})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/creature-create/list")
def creature_create_list():
    try:
        rows = query(
            "SELECT ct.entry, ct.name, ct.subname, ct.minlevel, ct.maxlevel, ct.type, "
            "  (SELECT CreatureDisplayID FROM creature_template_model WHERE CreatureID=ct.entry LIMIT 1) AS displayid "
            "FROM creature_template ct WHERE ct.entry >= %s ORDER BY ct.entry DESC",
            [_CREATURE_CREATE_MIN_ID]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/creature-create/load/<int:entry>")
def creature_create_load(entry):
    try:
        row = query("SELECT * FROM creature_template WHERE entry = %s", [entry], one=True)
        if not row:
            return err("Creature not found", 404)
        data = dict(row)
        # Attach first model entry
        model = query(
            "SELECT CreatureDisplayID, DisplayScale, Probability FROM creature_template_model "
            "WHERE CreatureID = %s ORDER BY Idx LIMIT 1", [entry], one=True
        )
        if model:
            data["_displayid"] = model["CreatureDisplayID"]
            data["_display_scale"] = model["DisplayScale"]
        else:
            data["_displayid"] = 0
            data["_display_scale"] = 1.0
        return ok(data)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/creature-create/save", methods=["POST"])
def creature_create_save():
    d = request.get_json() or {}
    entry = int(d.get("entry", 0))
    if entry < _CREATURE_CREATE_MIN_ID:
        return err(f"Custom creature ID must be >= {_CREATURE_CREATE_MIN_ID} sein")
    if not d.get("name"):
        return err("Name required")

    cols = {"entry": entry, "name": d["name"]}
    for k, v in d.items():
        if k in ("entry", "_displayid", "_display_scale"): continue
        if k in _CREATURE_TEMPLATE_DEFAULTS or k == "name":
            cols[k] = v
    for k, v in _CREATURE_TEMPLATE_DEFAULTS.items():
        cols.setdefault(k, v)

    keys = list(cols.keys())
    vals = list(cols.values())
    placeholders = ",".join(["%s"] * len(keys))
    col_str = ",".join(f"`{c}`" for c in keys)
    update_clause = ",".join(f"`{k}`=VALUES(`{k}`)" for k in keys if k != "entry")
    try:
        execute(
            f"INSERT INTO creature_template ({col_str}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {update_clause}",
            vals
        )
        # creature_template_model — replace first entry
        displayid = int(d.get("_displayid", 0) or 0)
        scale = float(d.get("_display_scale", 1.0) or 1.0)
        if displayid:
            execute("DELETE FROM creature_template_model WHERE CreatureID = %s AND Idx = 0", [entry])
            execute(
                "INSERT INTO creature_template_model (CreatureID, Idx, CreatureDisplayID, DisplayScale, Probability) "
                "VALUES (%s, 0, %s, %s, 1.0)",
                [entry, displayid, scale]
            )
        return ok({"entry": entry})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/creature-create/delete", methods=["POST"])
def creature_create_delete():
    d = request.get_json() or {}
    entry = int(d.get("entry", 0))
    if entry < _CREATURE_CREATE_MIN_ID:
        return err(f"Only custom creatures (>= {_CREATURE_CREATE_MIN_ID}) deletable")
    try:
        execute("DELETE FROM creature_template WHERE entry = %s", [entry])
        execute("DELETE FROM creature_template_model WHERE CreatureID = %s", [entry])
        execute("DELETE FROM creature_template_addon WHERE entry = %s", [entry])
        execute("DELETE FROM creature_equip_template WHERE CreatureID = %s", [entry])
        return ok({"entry": entry})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/creature-create/pick-display")
def creature_create_pick_display():
    """Search creatures by name and return first match's display_id (for cloning)."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return err("q required")
    try:
        if q.isdigit():
            row = query("SELECT entry, name FROM creature_template WHERE entry = %s",
                        [int(q)], one=True)
        else:
            row = query("SELECT entry, name FROM creature_template WHERE name LIKE %s LIMIT 1",
                        [f"%{q}%"], one=True)
        if not row:
            return err("Not found", 404)
        model = query(
            "SELECT CreatureDisplayID, DisplayScale FROM creature_template_model "
            "WHERE CreatureID = %s ORDER BY Idx LIMIT 1", [row["entry"]], one=True
        )
        if not model:
            return err(f"'{row['name']}' hat keinen Display-Entry", 404)
        return ok({"entry": row["entry"], "name": row["name"],
                   "displayid": model["CreatureDisplayID"], "scale": model["DisplayScale"]})
    except Exception as e:
        return err(str(e), 500)


# ══════════════════════════════════════════════════════════════════════════════
# Quest Creator — quest_template + quest_template_addon
# ══════════════════════════════════════════════════════════════════════════════

_QUEST_CREATE_MIN_ID = 70000

QUEST_CREATE_TEMPLATES = {
    "kill_quest": {
        "label": "⚔️ Kill Quest — kill X NPCs",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0, "QuestSortID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "RequiredNpcOrGo1": 0,           # creature_template.entry to kill (positive = creature)
            "RequiredNpcOrGoCount1": 10,
            "ObjectiveText1": "Kill 10 Gegner.",
            "RewardXPDifficulty": 5, "RewardMoney": 50000,  # 5 Gold
        }
    },
    "gather_items": {
        "label": "📦 Gather Items — sammle X items",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "RequiredItemId1": 0,           # item_template.entry to collect
            "RequiredItemCount1": 10,
            "ObjectiveText1": "Sammle 10 items.",
            "RewardXPDifficulty": 5, "RewardMoney": 50000,
        }
    },
    "talk_to_npc": {
        "label": "💬 Talk to NPC — sprich mit einer Person",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "RequiredNpcOrGo1": 0,           # creature_template.entry to talk to
            "RequiredNpcOrGoCount1": 1,
            "ObjectiveText1": "Sprich mit dem NPC.",
            "RewardXPDifficulty": 3, "RewardMoney": 10000,
        }
    },
    "use_gameobject": {
        "label": "🗝 GameObject Interaction — interagiere mit Objekt",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "RequiredNpcOrGo1": -1,          # negative = gameobject_template.entry
            "RequiredNpcOrGoCount1": 1,
            "ObjectiveText1": "Untersuche das Objekt.",
            "RewardXPDifficulty": 3, "RewardMoney": 10000,
        }
    },
    "escort": {
        "label": "🚶 Escort Quest — geleite NPC",
        "fields": {
            "QuestType": 2, "QuestInfoID": 81,  # 81 = Escort type
            "MinLevel": 80, "QuestLevel": 80,
            "RequiredNpcOrGo1": 0,
            "RequiredNpcOrGoCount1": 1,
            "ObjectiveText1": "Geleite den NPC zum Ziel.",
            "Flags": 1,    # Repeatable usually off for escorts
            "RewardXPDifficulty": 7, "RewardMoney": 100000,
        }
    },
    "daily": {
        "label": "📅 Daily Quest — daily wiederholbar",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "Flags": 4096,  # QUEST_FLAGS_DAILY
            "RewardXPDifficulty": 5, "RewardMoney": 100000,
        }
    },
    "weekly": {
        "label": "📆 Weekly Quest — weekly wiederholbar",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "Flags": 32768,  # QUEST_FLAGS_WEEKLY
            "RewardXPDifficulty": 7, "RewardMoney": 200000,
        }
    },
    "group_quest": {
        "label": "👥 Group Quest (Elite) — empfohlene group size 3",
        "fields": {
            "QuestType": 2, "QuestInfoID": 41,  # 41 = Group
            "MinLevel": 80, "QuestLevel": 80,
            "SuggestedGroupNum": 3,
            "RequiredNpcOrGo1": 0,
            "RequiredNpcOrGoCount1": 1,
            "ObjectiveText1": "Besiege den Elite-Gegner.",
            "RewardXPDifficulty": 7, "RewardMoney": 300000,
        }
    },
    "repeatable": {
        "label": "🔁 Repeatable Quest — beliebig oft",
        "fields": {
            "QuestType": 2, "QuestInfoID": 0,
            "MinLevel": 80, "QuestLevel": 80,
            "Flags": 1,  # QUEST_FLAGS_REPEATABLE
            "RewardXPDifficulty": 3, "RewardMoney": 50000,
        }
    },
}


_QUEST_TEMPLATE_DEFAULTS = {
    "QuestType": 2, "QuestLevel": 1, "MinLevel": 1, "QuestSortID": 0,
    "QuestInfoID": 0, "SuggestedGroupNum": 0,
    "RequiredFactionId1": 0, "RequiredFactionId2": 0,
    "RequiredFactionValue1": 0, "RequiredFactionValue2": 0,
    "RewardNextQuest": 0, "RewardXPDifficulty": 0,
    "RewardMoney": 0, "RewardMoneyDifficulty": 0,
    "RewardDisplaySpell": 0, "RewardSpell": 0,
    "RewardHonor": 0, "RewardKillHonor": 0.0,
    "StartItem": 0, "Flags": 0, "RequiredPlayerKills": 0,
    "RewardItem1": 0, "RewardAmount1": 0,
    "RewardItem2": 0, "RewardAmount2": 0,
    "RewardItem3": 0, "RewardAmount3": 0,
    "RewardItem4": 0, "RewardAmount4": 0,
    "ItemDrop1": 0, "ItemDropQuantity1": 0,
    "ItemDrop2": 0, "ItemDropQuantity2": 0,
    "ItemDrop3": 0, "ItemDropQuantity3": 0,
    "ItemDrop4": 0, "ItemDropQuantity4": 0,
    "RewardChoiceItemID1": 0, "RewardChoiceItemQuantity1": 0,
    "RewardChoiceItemID2": 0, "RewardChoiceItemQuantity2": 0,
    "RewardChoiceItemID3": 0, "RewardChoiceItemQuantity3": 0,
    "RewardChoiceItemID4": 0, "RewardChoiceItemQuantity4": 0,
    "RewardChoiceItemID5": 0, "RewardChoiceItemQuantity5": 0,
    "RewardChoiceItemID6": 0, "RewardChoiceItemQuantity6": 0,
    "POIContinent": 0, "POIx": 0.0, "POIy": 0.0, "POIPriority": 0,
    "RewardTitle": 0, "RewardTalents": 0, "RewardArenaPoints": 0,
    "RewardFactionID1": 0, "RewardFactionValue1": 0, "RewardFactionOverride1": 0,
    "RewardFactionID2": 0, "RewardFactionValue2": 0, "RewardFactionOverride2": 0,
    "RewardFactionID3": 0, "RewardFactionValue3": 0, "RewardFactionOverride3": 0,
    "RewardFactionID4": 0, "RewardFactionValue4": 0, "RewardFactionOverride4": 0,
    "RewardFactionID5": 0, "RewardFactionValue5": 0, "RewardFactionOverride5": 0,
    "TimeAllowed": 0, "AllowableRaces": 0,
    "LogTitle": "", "LogDescription": "", "QuestDescription": "",
    "AreaDescription": "", "QuestCompletionLog": "",
    "RequiredNpcOrGo1": 0, "RequiredNpcOrGo2": 0,
    "RequiredNpcOrGo3": 0, "RequiredNpcOrGo4": 0,
    "RequiredNpcOrGoCount1": 0, "RequiredNpcOrGoCount2": 0,
    "RequiredNpcOrGoCount3": 0, "RequiredNpcOrGoCount4": 0,
    "RequiredItemId1": 0, "RequiredItemId2": 0, "RequiredItemId3": 0,
    "RequiredItemId4": 0, "RequiredItemId5": 0, "RequiredItemId6": 0,
    "RequiredItemCount1": 0, "RequiredItemCount2": 0, "RequiredItemCount3": 0,
    "RequiredItemCount4": 0, "RequiredItemCount5": 0, "RequiredItemCount6": 0,
    "Unknown0": 0,
    "ObjectiveText1": "", "ObjectiveText2": "", "ObjectiveText3": "", "ObjectiveText4": "",
    "VerifiedBuild": 0,
}

_QUEST_TEMPLATE_ADDON_DEFAULTS = {
    "MaxLevel": 0, "AllowableClasses": 0, "SourceSpellID": 0,
    "PrevQuestID": 0, "NextQuestID": 0, "ExclusiveGroup": 0,
    "BreadcrumbForQuestId": 0, "RewardMailTemplateID": 0, "RewardMailDelay": 0,
    "RequiredSkillID": 0, "RequiredSkillPoints": 0,
    "RequiredMinRepFaction": 0, "RequiredMaxRepFaction": 0,
    "RequiredMinRepValue": 0, "RequiredMaxRepValue": 0,
    "ProvidedItemCount": 0, "SpecialFlags": 0,
}


@app.route("/api/quest-create/templates")
def quest_create_templates():
    out = [{"key": k, **v} for k, v in QUEST_CREATE_TEMPLATES.items()]
    return ok(out)


@app.route("/api/quest-create/next-id")
def quest_create_next_id():
    try:
        row = query("SELECT MAX(ID) AS m FROM quest_template WHERE ID >= %s",
                    [_QUEST_CREATE_MIN_ID], one=True)
        nxt = (row["m"] or _QUEST_CREATE_MIN_ID - 1) + 1
        if nxt < _QUEST_CREATE_MIN_ID:
            nxt = _QUEST_CREATE_MIN_ID
        return ok({"next_id": nxt})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/quest-create/list")
def quest_create_list():
    try:
        rows = query(
            "SELECT ID, LogTitle AS title, QuestLevel, MinLevel "
            "FROM quest_template WHERE ID >= %s ORDER BY ID DESC",
            [_QUEST_CREATE_MIN_ID]
        )
        return ok([dict(r) for r in rows])
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/quest-create/load/<int:qid>")
def quest_create_load(qid):
    try:
        row = query("SELECT * FROM quest_template WHERE ID = %s", [qid], one=True)
        if not row:
            return err("Quest not found", 404)
        data = dict(row)
        addon = query("SELECT * FROM quest_template_addon WHERE ID = %s", [qid], one=True)
        if addon:
            for k, v in dict(addon).items():
                if k != "ID":
                    data[k] = v
        return ok(data)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/quest-create/save", methods=["POST"])
def quest_create_save():
    d = request.get_json() or {}
    qid = int(d.get("ID", 0))
    if qid < _QUEST_CREATE_MIN_ID:
        return err(f"Custom quest ID must be >= {_QUEST_CREATE_MIN_ID} sein")
    if not d.get("LogTitle"):
        return err("LogTitle (Quest-Name) required")

    # Split fields between quest_template and quest_template_addon
    tmpl_cols = {"ID": qid}
    addon_cols = {"ID": qid}
    for k, v in d.items():
        if k == "ID": continue
        if k in _QUEST_TEMPLATE_DEFAULTS:
            tmpl_cols[k] = v
        elif k in _QUEST_TEMPLATE_ADDON_DEFAULTS:
            addon_cols[k] = v
    for k, v in _QUEST_TEMPLATE_DEFAULTS.items():
        tmpl_cols.setdefault(k, v)

    # Build quest_template INSERT
    keys = list(tmpl_cols.keys())
    vals = list(tmpl_cols.values())
    placeholders = ",".join(["%s"] * len(keys))
    col_str = ",".join(f"`{c}`" for c in keys)
    update_clause = ",".join(f"`{k}`=VALUES(`{k}`)" for k in keys if k != "ID")
    try:
        execute(
            f"INSERT INTO quest_template ({col_str}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {update_clause}",
            vals
        )
        # Addon (only if any addon field present besides ID)
        if len(addon_cols) > 1:
            for k, v in _QUEST_TEMPLATE_ADDON_DEFAULTS.items():
                addon_cols.setdefault(k, v)
            akeys = list(addon_cols.keys())
            avals = list(addon_cols.values())
            aplaceholders = ",".join(["%s"] * len(akeys))
            acol_str = ",".join(f"`{c}`" for c in akeys)
            aupdate = ",".join(f"`{k}`=VALUES(`{k}`)" for k in akeys if k != "ID")
            execute(
                f"INSERT INTO quest_template_addon ({acol_str}) VALUES ({aplaceholders}) "
                f"ON DUPLICATE KEY UPDATE {aupdate}",
                avals
            )
        return ok({"ID": qid})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/quest-create/delete", methods=["POST"])
def quest_create_delete():
    d = request.get_json() or {}
    qid = int(d.get("ID", 0))
    if qid < _QUEST_CREATE_MIN_ID:
        return err(f"Only custom quests (>= {_QUEST_CREATE_MIN_ID}) deletable")
    try:
        execute("DELETE FROM quest_template WHERE ID = %s", [qid])
        execute("DELETE FROM quest_template_addon WHERE ID = %s", [qid])
        for t in ("quest_offer_reward","quest_request_items","quest_details","quest_poi","quest_poi_points"):
            try: execute(f"DELETE FROM {t} WHERE ID = %s", [qid])
            except Exception: pass
        return ok({"ID": qid})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/quest-create/pick-npc")
def quest_create_pick_npc():
    q = (request.args.get("q") or "").strip()
    if not q:
        return err("q required")
    try:
        if q.isdigit():
            row = query("SELECT entry, name FROM creature_template WHERE entry = %s",
                        [int(q)], one=True)
        else:
            row = query("SELECT entry, name FROM creature_template WHERE name LIKE %s LIMIT 1",
                        [f"%{q}%"], one=True)
        if not row:
            return err("Not found", 404)
        return ok({"entry": row["entry"], "name": row["name"]})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/quest-create/enums")
def quest_create_enums():
    return ok({
        "questType": {2:"Standard",1:"Group",41:"Group (Elite)",81:"PvP/Escort"},
        "questInfoID": {0:"Standard",1:"Group",21:"Class",22:"PvP",
                        41:"Raid",81:"Dungeon",83:"World Event",62:"Raid (10)",75:"Raid (25)",
                        85:"Heroic Dungeon",88:"Raid (10 Heroic)",89:"Raid (25 Heroic)"},
        "questSortID": {-301:"Dungeon", -181:"Tradeskill", -141:"Holiday",
                        -101:"Hunter Pets", -22:"Reputation", -21:"Battlegrounds",
                        -1:"Epic", 0:"None"},
        "questFlags": {1:"Repeatable",2:"Hidden Rewards",4:"Auto Submit",8:"Party Accept",
                       16:"Exploration",32:"Sharable",128:"Epic Marker",
                       512:"Stay Alive",1024:"PvP Capture",
                       4096:"Daily",16384:"Hidden Until Discovered",
                       32768:"Weekly",65536:"Auto Complete"},
        "rewardXpDifficulty": {0:"None",1:"+10% xp",2:"+25%",3:"+50%",4:"+75%",
                               5:"+100%",6:"+150%",7:"+200%",8:"+250%",9:"+300%"},
        "allowableRaces": {1:"Human",2:"Orc",4:"Dwarf",8:"Night Elf",16:"Undead",
                           32:"Tauren",64:"Gnome",128:"Troll",512:"Blood Elf",1024:"Draenei"},
        "allowableClasses": {1:"Warrior",2:"Paladin",4:"Hunter",8:"Rogue",16:"Priest",
                             32:"Death Knight",64:"Shaman",128:"Mage",256:"Warlock",1024:"Druid"},
        "specialFlags": {1:"Repeatable",2:"Quest Done On Event",4:"Auto Accept",
                         8:"Cast Spell On Complete",16:"Daily Reset",32:"DB Only"},
        "continent": {0:"Eastern Kingdoms",1:"Kalimdor",530:"Outland",571:"Northrend"},
    })


@app.route("/api/creature-create/enums")
def creature_create_enums():
    return ok({
        "type": {0:"None",1:"Beast",2:"Dragonkin",3:"Demon",4:"Elemental",5:"Giant",
                 6:"Undead",7:"Humanoid",8:"Critter",9:"Mechanical",10:"Not specified",
                 11:"Totem",12:"Non-combat Pet",13:"Gas Cloud"},
        "rank": {0:"Normal",1:"Elite",2:"Rare Elite",3:"World Boss",4:"Rare"},
        "unit_class": {1:"Warrior",2:"Paladin",4:"Rogue",8:"Mage"},
        "faction": {35:"Friendly (35)",14:"Hostile (14)",16:"Hostile (16)",
                    188:"Stormwind",189:"Orgrimmar",190:"Ironforge",
                    1727:"Booty Bay Neutral",
                    1604:"Alliance Generic",1610:"Horde Generic",
                    7:"Friendly to All",84:"Stormwind Quest",
                    1735:"Neutral Beast",974:"Sporeggar",
                    1090:"Kirin Tor",1156:"Argent Crusade",
                    1158:"Knights of the Ebon Blade",1888:"Frenzyheart Tribe",
                    1894:"The Oracles",1899:"The Wyrmrest Accord",
                    1909:"The Scryers",1910:"The Aldor",
                    1119:"The Mag'har",1124:"The Sha'tar",
                    1126:"The Consortium",
                    1128:"The Violet Eye"},
        "family": {0:"None",1:"Wolf",2:"Cat",3:"Spider",4:"Bear",5:"Boar",
                   6:"Crocolisk",7:"Carrion Bird",8:"Crab",9:"Gorilla",
                   11:"Raptor",12:"Tallstrider",
                   20:"Felhunter",21:"Voidwalker",22:"Succubus",
                   24:"Doomguard",25:"Scorpid",26:"Turtle",
                   27:"Imp",28:"Bat",29:"Hyena",30:"Bird of Prey",
                   31:"Wind Serpent",32:"Remote Control",
                   33:"Felguard",34:"Dragonhawk",
                   35:"Ravager",36:"Warp Stalker",37:"Sporebat",
                   38:"Nether Ray",39:"Serpent",
                   41:"Moth",42:"Chimaera",43:"Devilsaur",
                   45:"Silithid",46:"Worm",47:"Rhino",
                   48:"Wasp",49:"Core Hound",50:"Spirit Beast"},
        "movementType": {0:"Idle",1:"Random",2:"Waypoint"},
        "npcflag": {1:"Gossip",2:"Quest Giver",16:"Trainer",32:"Class Trainer",
                    64:"Profession Trainer",128:"Vendor",256:"Vendor (Ammo)",
                    512:"Vendor (Food)",1024:"Vendor (Poison)",2048:"Vendor (Reagent)",
                    4096:"Repair",8192:"Flight Master",16384:"Spirit Healer",
                    32768:"Spirit Guide",65536:"Innkeeper",131072:"Banker",
                    262144:"Petitioner",524288:"Tabard Designer",
                    1048576:"Battlemaster",2097152:"Auctioneer",4194304:"Stable Master",
                    8388608:"Guild Banker",16777216:"Spellclick",
                    33554432:"Player Vehicle",67108864:"Mailbox"},
        "unitFlags": {1:"Server Controlled",2:"Non-Attackable",4:"Disable Move",
                      8:"PvP Attackable",16:"Rename",32:"Preparation",
                      64:"Unk6",128:"Not Attackable 1",256:"Immune To PC",
                      512:"Immune To NPC",1024:"Looting",2048:"Pet In Combat",
                      4096:"PvP",8192:"Silenced",16384:"Cannot Swim",
                      32768:"Unk15",65536:"Unk16",131072:"Pacified",
                      262144:"Stunned",524288:"In Combat",1048576:"Taxi Flight",
                      2097152:"Disarmed",4194304:"Confused",8388608:"Fleeing",
                      16777216:"Player Controlled",33554432:"Not Selectable",
                      67108864:"Skinnable",134217728:"Mount",268435456:"Unk28",
                      536870912:"Preventing emote",1073741824:"Sheathe",
                      2147483648:"Unk31"},
        "typeFlags": {1:"Tameable",2:"Visible to Ghost",4:"Boss Mob",
                      8:"Don't Play Wound Animation",16:"Hide Faction Tooltip",
                      32:"Special Loot",64:"More Audible",128:"Spawn Default Loot",
                      256:"No XP at Level",512:"Player Loot",
                      1024:"Sound Cue",2048:"Mounted Combat",4096:"Aid Players",
                      8192:"Civilian",16384:"No XP at Pickup",32768:"AI Sees Through Stealth"},
        "flagsExtra": {1:"Instance Bind",2:"Civilian",4:"No Parry",8:"No Parry Hasten",
                       16:"No Block",32:"No Crush",64:"No XP",128:"No Loot",
                       256:"Trigger",512:"No Talkto Credit",1024:"No Money Loot",
                       2048:"Worldevent",4096:"Guard",8192:"Ignore Feign Death",
                       16384:"No Player Damage Req",32768:"Active",
                       65536:"No Pet Bar",131072:"No Skill Gains",
                       262144:"OBSOLETE",524288:"No Crit",
                       1048576:"NoLootSkin",2097152:"NoFollow",
                       4194304:"NoTaunt"},
        "aiName": {"":"(default)","NullAI":"Null AI","AggressorAI":"Aggressor",
                   "ReactorAI":"Reactor","PassiveAI":"Passive","GuardAI":"Guard",
                   "PetAI":"Pet","SmartAI":"Smart AI","CombatAI":"Combat",
                   "ArcherAI":"Archer","TurretAI":"Turret","TotemAI":"Totem"},
    })


@app.route("/api/spell-create/enums")
def spell_create_enums():
    """Compact enums for the spell creator dropdowns."""
    return ok({
        "schoolMask": {1:"Physical", 2:"Holy", 4:"Fire", 8:"Nature", 16:"Frost", 32:"Shadow", 64:"Arcane",
                       126:"All Magic", 127:"All"},
        "powerType": {0:"Mana", 1:"Rage", 2:"Focus", 3:"Energy", 4:"Happiness",
                      6:"Runic Power", 9:"Holy Power"},
        "implicitTarget": {
            0:"None", 1:"Self", 5:"Pet", 6:"Enemy", 7:"Enemy 2", 15:"Caster Area Party",
            16:"Area Enemy Dest", 17:"Area Enemy Src",
            18:"Any Unit", 21:"Ally", 22:"Dest Radius (Ground AoE)",
            24:"Caster Area Friend", 25:"Caster Area Enemy",
            27:"Pet", 28:"Random Friend", 30:"Targeted Spell",
            52:"Self (AoE)", 53:"Targeted Area Enemy",
        },
        "effect": {
            0:"None", 2:"School Damage", 3:"Dummy", 6:"Apply Aura", 8:"Power Drain",
            10:"Heal", 13:"Script Effect", 24:"Create Item",
            28:"Summon", 35:"Mech Immune", 53:"Enchant Item",
            64:"Trigger Spell", 73:"Mana Restore", 77:"Disenchant", 80:"Dismiss Pet",
            83:"Script Effect (large)", 99:"Trigger Spell (W)",
        },
        "aura": {
            0:"None", 3:"Periodic Damage", 4:"Dummy", 8:"Periodic Heal",
            12:"Mod Stun", 15:"Damage Shield", 23:"Periodic Trigger Spell",
            24:"Periodic Energize", 26:"Mod Root", 27:"Mod Silence",
            29:"Mod Stat", 33:"Mod Decrease Speed", 36:"Mod Shapeshift",
            42:"Proc Trigger Spell", 53:"Periodic Leech", 64:"Periodic Mana Leech",
            65:"Mod Casting Speed (not Lose)", 80:"Mod Percent Stat",
            107:"Untrackable", 118:"Mod Stat Resistance",
            126:"Mod Haste", 130:"Mod Spell Power",
            142:"Mod Aura Duration", 226:"Periodic Dummy", 227:"Periodic Trigger Spell (V)",
        },
        "spellAttr": {1:"Ranged", 2:"On Next Swing", 4:"Replenishment", 8:"Ability",
                      16:"Trade Spell", 32:"Passive", 64:"Hidden Client Side",
                      128:"Hide in Combat Log", 256:"Target Mainhand",
                      512:"On Next Swing 2", 2048:"Day Only", 4096:"Night Only",
                      8192:"Only Indoors", 16384:"Only Outdoors",
                      65536:"Cannot Use in Combat", 1048576:"Cancels Auto Attack"},
        "castingTimeIndex": {1:"Instant", 2:"0.25s", 3:"0.5s", 4:"2.5s", 5:"3.0s",
                             6:"4.0s", 8:"1.5s", 9:"3.5s", 14:"6.0s", 15:"8.0s",
                             16:"10.0s", 17:"60.0s"},
        "rangeIndex": {1:"Self", 2:"5 yards", 3:"100 yards", 4:"20 yards",
                       5:"15 yards", 6:"30 yards", 7:"30 yards (Hostile/Friendly)",
                       9:"10 yards", 11:"40 yards", 13:"50 yards"},
        "durationIndex": {21:"30 sec", 22:"45 sec", 23:"1 min", 24:"2 min", 25:"5 min",
                          26:"10 min", 27:"15 min", 28:"30 min", 29:"1 hour",
                          30:"infinite", 31:"7 sec", 32:"5 sec", 33:"10 sec",
                          34:"15 sec", 35:"20 sec", 36:"3 sec",
                          37:"4 sec", 38:"6 sec", 39:"8 sec", 40:"12 sec",
                          41:"60 sec"},
        "radiusIndex": {7:"5 yards", 8:"8 yards", 9:"10 yards", 10:"15 yards",
                        11:"20 yards", 12:"25 yards", 13:"30 yards",
                        14:"40 yards", 15:"50 yards"},
        "miscStat": {-1:"All Stats", 0:"Strength", 1:"Agility", 2:"Stamina", 3:"Intellect", 4:"Spirit"},
    })


# ── MPQ Editor: list / upload / remove files ───────────────────────────────

@app.route("/api/mpq/inspect")
def mpq_inspect():
    """Read the actual patch MPQ binary and list its real contents."""
    try:
        s = _settings_load()
        out_dir = s.get("mpq_output_dir") or CONFIG.get("mpq_output_dir") or os.path.join(BASE_DIR, "mpq")
        patch_name = s.get("patch_name") or "patch-Z.MPQ"
        mpq_path = os.path.join(out_dir, patch_name)
        files, read_err = _mpq_read(mpq_path)
        if read_err:
            return err(read_err, 500)
        result = []
        for path, info in files.items():
            result.append({"path": path, "size": info["size"], "flags": info["flags"]})
        return ok({"mpq_path": mpq_path, "files": result})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/mpq/extract")
def mpq_extract():
    """Extract a file from the actual patch MPQ — returns binary content."""
    try:
        from flask import send_file
        import io
        path = (request.args.get("path") or "").strip()
        if not path:
            return err("path required")
        s = _settings_load()
        out_dir = s.get("mpq_output_dir") or CONFIG.get("mpq_output_dir") or os.path.join(BASE_DIR, "mpq")
        patch_name = s.get("patch_name") or "patch-Z.MPQ"
        mpq_path = os.path.join(out_dir, patch_name)
        files, e = _mpq_read(mpq_path)
        if e:
            return err(e, 500)
        info = files.get(path)
        if not info:
            return err(f"Datei '{path}' nicht in MPQ", 404)
        download_name = os.path.basename(path.replace("\\", "/")) or "extracted.bin"
        return send_file(io.BytesIO(info["data"]), download_name=download_name,
                         as_attachment=True, mimetype="application/octet-stream")
    except Exception as e:
        return err(str(e), 500)


# Known field names for common DBCs (uppercase path → list of names).
# Falls back to F0/F1/… if not in this map.
_DBC_FIELD_NAMES = {
    "DBFILESCLIENT\\ITEM.DBC": [
        "ID", "ClassID", "SubclassID", "SoundOverrideSubclass",
        "Material", "DisplayInfoID", "InventoryType", "SheatheType",
    ],
    "DBFILESCLIENT\\CHARSTARTOUTFIT.DBC": (
        ["ID", "Packed(Race|Class|Sex|Outfit)"]
        + [f"ItemID_{i}" for i in range(1, 25)]
        + [f"DisplayID_{i}" for i in range(1, 25)]
        + [f"InvType_{i}" for i in range(1, 25)]
    ),
    "DBFILESCLIENT\\CHARBASEINFO.DBC": ["RaceID(byte0)", "ClassID(byte1)"],
}


def _get_dbc_field_names(path, n_int):
    key = path.upper().replace("/", "\\")
    base = _DBC_FIELD_NAMES.get(key, [])
    out = list(base[:n_int])
    while len(out) < n_int:
        out.append(f"F{len(out)}")
    return out


def _parse_search_terms(search: str):
    """Parse '60001-60010, 35273, 26383' into a set of ints. None = no filter."""
    if not search or not search.strip():
        return None
    out = set()
    for part in search.replace(";", ",").split(","):
        part = part.strip()
        if not part: continue
        if "-" in part and not part.startswith("-"):
            try:
                a_str, b_str = part.split("-", 1)
                a, b = int(a_str.strip()), int(b_str.strip())
                if a > b: a, b = b, a
                if b - a > 1_000_000: continue
                out.update(range(a, b + 1))
            except Exception: pass
        else:
            try: out.add(int(part))
            except Exception: pass
    return out if out else None


def _parse_dbc_bytes(content: bytes):
    """Parse a WDBC blob into header + uint32 records + string_block."""
    if len(content) < 20 or content[:4] != b"WDBC":
        return None, "No valid WDBC-Datei"
    rc, fc, rs, sb = struct.unpack_from("<4I", content, 4)
    n_int = rs // 4
    records = []
    for i in range(rc):
        off = 20 + i * rs
        records.append(list(struct.unpack_from(f"<{n_int}I", content, off)))
    string_block = content[20 + rc * rs:20 + rc * rs + sb]
    return {
        "record_count": rc, "field_count": fc, "record_size": rs,
        "string_block_size": sb, "records": records,
        "string_block": string_block, "n_int": n_int
    }, None


def _serialize_dbc(parsed) -> bytes:
    n_int = parsed["n_int"]
    rc = len(parsed["records"])
    fc = parsed["field_count"]
    rs = parsed["record_size"]
    sb = len(parsed["string_block"])
    header = struct.pack("<4sIIII", b"WDBC", rc, fc, rs, sb)
    body = bytearray()
    for rec in parsed["records"]:
        r = [int(x) & 0xFFFFFFFF for x in rec]
        while len(r) < n_int: r.append(0)
        body.extend(struct.pack(f"<{n_int}I", *r[:n_int]))
    return header + bytes(body) + parsed["string_block"]


def _get_patch_mpq_path():
    s = _settings_load()
    return os.path.join(s.get("mpq_output_dir") or CONFIG.get("mpq_output_dir") or os.path.join(BASE_DIR, "mpq"),
                        s.get("patch_name") or "patch-Z.MPQ")


def _read_dbc_from_mpq_or_disk(mpq_internal_path):
    """Try MPQ first; if not present there, fall back to server DBC folder."""
    files, e = _mpq_read(_get_patch_mpq_path())
    if not e and mpq_internal_path in files:
        return files[mpq_internal_path]["data"], None
    # Fallback to server folder for paths like DBFilesClient\Item.dbc
    base = os.path.basename(mpq_internal_path.replace("\\", "/"))
    p = _find_dbc(base)
    if p and os.path.exists(p):
        with open(p, "rb") as f:
            return f.read(), None
    # Also try extras
    extras_p = os.path.join(_mpq_extras_dir(), mpq_internal_path)
    if os.path.exists(extras_p):
        with open(extras_p, "rb") as f:
            return f.read(), None
    return None, "DBC not found"


@app.route("/api/mpq/dbc/view")
def mpq_dbc_view():
    try:
        path = (request.args.get("path") or "").strip()
        page = int(request.args.get("page", 0))
        page_size = int(request.args.get("page_size", 100))
        search = (request.args.get("search") or "").strip()
        if not path:
            return err("path required")
        content, e = _read_dbc_from_mpq_or_disk(path)
        if e:
            return err(e, 404)
        parsed, e2 = _parse_dbc_bytes(content)
        if e2:
            return err(e2, 400)

        # Filter by search — supports "60001-60010, 35273, 26383"
        all_records = parsed["records"]
        only_custom = request.args.get("only_custom", "").lower() in ("1", "true", "yes")
        terms = _parse_search_terms(search)
        if terms:
            filtered = [(i, r) for i, r in enumerate(all_records) if any(v in terms for v in r)]
        else:
            filtered = [(i, r) for i, r in enumerate(all_records)]
        if only_custom:
            filtered = [(i, r) for i, r in filtered if r and r[0] >= _CREATE_ITEM_MIN_ID]

        total = len(filtered)
        start = page * page_size
        end = min(start + page_size, total)
        page_recs = filtered[start:end]

        # Resolve string-offsets that point inside the string block (heuristic)
        sb = parsed["string_block"]
        sb_size = len(sb)
        def get_str(off):
            if off == 0 or off >= sb_size: return None
            zend = sb.find(b"\x00", off)
            if zend < 0: zend = sb_size
            try:
                s = sb[off:zend].decode("utf-8", errors="replace")
                if len(s) == 0 or len(s) > 200: return None
                # Reject if non-printable bytes
                if any(ord(c) < 32 and c != '\n' for c in s): return None
                return s
            except Exception:
                return None

        # Per-field: is it likely a string column? Check if most non-zero values
        # in this column resolve to plausible strings.
        n_int = parsed["n_int"]
        is_str_col = [False] * n_int
        sample = all_records[:min(200, len(all_records))]
        for col in range(n_int):
            hits = 0; tries = 0
            for r in sample:
                v = r[col]
                if v == 0: continue
                tries += 1
                if get_str(v) is not None: hits += 1
                if tries >= 30: break
            if tries >= 5 and hits / tries >= 0.8:
                is_str_col[col] = True

        # Build response
        out = []
        for idx, rec in page_recs:
            row = {"_idx": idx, "values": list(rec)}
            row["strings"] = {col: get_str(rec[col]) for col in range(n_int) if is_str_col[col]}
            out.append(row)

        return ok({
            "path": path,
            "field_count": parsed["field_count"],
            "n_int": n_int,
            "record_count": parsed["record_count"],
            "filtered_count": total,
            "page": page,
            "page_size": page_size,
            "is_string_col": is_str_col,
            "field_names": _get_dbc_field_names(path, n_int),
            "records": out,
        })
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/mpq/dbc/save", methods=["POST"])
def mpq_dbc_save():
    """Save edits. Body: {path, changes: [{idx, field, value}]}.
    Item.dbc → writes to server folder (auth source); others → extras folder."""
    try:
        d = request.get_json() or {}
        path = (d.get("path") or "").strip().replace("/", "\\")
        changes = d.get("changes") or []
        if not path:
            return err("path required")
        if not changes:
            return err("no changes")

        content, e = _read_dbc_from_mpq_or_disk(path)
        if e:
            return err(e, 404)
        parsed, e2 = _parse_dbc_bytes(content)
        if e2:
            return err(e2, 400)

        n_int = parsed["n_int"]
        applied = 0
        for ch in changes:
            idx = int(ch.get("idx", -1))
            field = int(ch.get("field", -1))
            value = int(ch.get("value", 0)) & 0xFFFFFFFF
            if idx < 0 or idx >= len(parsed["records"]) or field < 0 or field >= n_int:
                continue
            parsed["records"][idx][field] = value
            applied += 1

        new_bytes = _serialize_dbc(parsed)

        # Decide target file
        is_item_dbc = path.lower() == "dbfilesclient\\item.dbc"
        if is_item_dbc:
            # Write back to server-folder Item.dbc (Item editor's source of truth)
            server_path = _find_dbc("Item.dbc")
            if not server_path:
                return err("Item.dbc not found on server", 500)
            import shutil
            if not os.path.exists(server_path + ".bak"):
                shutil.copy2(server_path, server_path + ".bak")
            with open(server_path, "wb") as f:
                f.write(new_bytes)
            # Reload into RAM so subsequent Item-Editor operations stay consistent
            _load_item_dbc()
        else:
            target = os.path.join(_mpq_extras_dir(), path)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as f:
                f.write(new_bytes)

        # Auto-rebuild MPQ so changes are immediately reflected
        mpq_path, copied, mpq_err = _build_item_patch_mpq()
        return ok({"applied": applied, "mpq_path": mpq_path,
                   "copied_to_client": copied, "mpq_error": mpq_err})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/mpq/list")
def mpq_list():
    try:
        files = []
        # Item.dbc (always present, not deletable)
        item_dbc_path = _find_dbc("Item.dbc")
        if item_dbc_path and os.path.exists(item_dbc_path):
            files.append({
                "path": "DBFilesClient\\Item.dbc",
                "size": os.path.getsize(item_dbc_path),
                "locked": True,
                "source": "server-dbc",
            })
        # Extras
        extras = _mpq_extras_dir()
        if os.path.isdir(extras):
            for root, _, names in os.walk(extras):
                for name in names:
                    full = os.path.join(root, name)
                    rel = os.path.relpath(full, extras).replace("/", "\\")
                    if rel.lower() == "dbfilesclient\\item.dbc":
                        continue
                    files.append({
                        "path": rel,
                        "size": os.path.getsize(full),
                        "locked": False,
                        "source": "extras",
                    })
        return ok(files)
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/mpq/upload", methods=["POST"])
def mpq_upload():
    try:
        mpq_path = request.form.get("path", "").strip().replace("/", "\\")
        if not mpq_path:
            return err("MPQ-Path missing (z.B. DBFilesClient\\Spell.dbc)")
        if mpq_path.lower() == "dbfilesclient\\item.dbc":
            return err("Item.dbc cannot be overwritten (is being vom Item-Editor verwaltet)")
        upload = request.files.get("file")
        if not upload:
            return err("File missing")
        extras = _mpq_extras_dir()
        target = os.path.join(extras, mpq_path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        upload.save(target)
        return ok({"path": mpq_path, "size": os.path.getsize(target)})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/mpq/remove", methods=["POST"])
def mpq_remove():
    d = request.get_json() or {}
    mpq_path = (d.get("path") or "").strip().replace("/", "\\")
    if not mpq_path:
        return err("path required")
    if mpq_path.lower() == "dbfilesclient\\item.dbc":
        return err("Item.dbc cannot be removed")
    try:
        target = os.path.join(_mpq_extras_dir(), mpq_path)
        if not os.path.exists(target):
            return err("Datei not found", 404)
        os.remove(target)
        # Tidy empty parent dirs
        parent = os.path.dirname(target)
        while parent and parent != _mpq_extras_dir() and os.path.isdir(parent) and not os.listdir(parent):
            os.rmdir(parent); parent = os.path.dirname(parent)
        return ok({"path": mpq_path})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/player/outfit/add", methods=["POST"])
def outfit_add():
    d = request.get_json() or {}
    race = int(d.get("race", 0)); cls = int(d.get("class", 0))
    itemid = int(d.get("itemid", 0))
    if not race or not cls or not itemid:
        return err("race, class, itemid required")
    it = query("SELECT name, InventoryType, displayid FROM item_template WHERE entry = %s",
               [itemid], one=True)
    if not it:
        return err(f"Item {itemid} nicht in item_template")
    ok_, msg = _outfit_add_item(race, cls, itemid,
                                inv_type=it.get("InventoryType"),
                                display_id=it.get("displayid"))
    if not ok_:
        return err(msg)
    return ok({"action": "outfit_added", "name": it["name"]})


@app.route("/api/player/outfit/remove", methods=["POST"])
def outfit_remove():
    d = request.get_json() or {}
    race = int(d.get("race", 0)); cls = int(d.get("class", 0))
    itemid = int(d.get("itemid", 0))
    if not race or not cls or not itemid:
        return err("race, class, itemid required")
    ok_, msg = _outfit_remove_item(race, cls, itemid)
    if not ok_:
        return err(msg)
    return ok({"action": "outfit_removed"})


@app.route("/api/player/outfit/swap", methods=["POST"])
def outfit_swap():
    d = request.get_json() or {}
    race = int(d.get("race", 0)); cls = int(d.get("class", 0))
    a = int(d.get("itemid_a", 0)); b = int(d.get("itemid_b", 0))
    if not race or not cls or not a or not b:
        return err("race, class, itemid_a, itemid_b required")
    if a == b:
        return err("identical items")
    ok_, msg = _outfit_swap_items(race, cls, a, b)
    if not ok_:
        return err(msg)
    return ok({"action": "outfit_swapped"})


@app.route("/api/player/raceclass")
def get_race_class_map():
    """Valid {race_id: [class_ids]} from CharBaseInfo.dbc for the editor dropdowns."""
    if not _CHAR_BASE_INFO:
        _load_char_base_info()
    return ok({str(r): cls for r, cls in _CHAR_BASE_INFO.items()})


@app.route("/api/admin/dbc/import", methods=["POST"])
def import_dbc():
    """Reload all DBCs from given path (or DBC_PATH) into RAM."""
    data    = request.get_json() or {}
    dbc_dir = data.get("path", DBC_PATH)
    try:
        summary = load_all_dbcs(dbc_dir)
        _build_search_index()
        _load_char_base_info()
        _load_char_start_outfit()
        return ok({"imported": summary, "errors": {}, "dbc_path": dbc_dir,
                   "spells": len(_DBC_SPELL_DATA), "search_index": len(_DBC_SEARCH_INDEX)})
    except Exception as e:
        return err(str(e), 500)


@app.route("/api/admin/dbc/status")
def dbc_status():
    """Return DBC load status: which tables are in RAM and file existence."""
    loaded = {name: len(tbl) for name, tbl in _DBC.items()}
    files_needed = ["Spell.dbc", "SpellIcon.dbc", "SkillLineAbility.dbc",
                    "SkillLine.dbc", "SpellCastTimes.dbc", "SpellRange.dbc"]
    file_status = {f: os.path.isfile(os.path.join(DBC_PATH, f)) for f in files_needed}
    return ok({
        "dbc_path":     DBC_PATH,
        "files":        file_status,
        "loaded":       loaded,
        "total_tables": len(_DBC),
        "search_index": len(_DBC_SEARCH_INDEX),
        "spells":       len(_DBC_SPELL_DATA),
    })


@app.route("/api/dbc/<string:dbc_name>/<int:record_id>")
def api_dbc_record(dbc_name, record_id):
    """GET a single DBC record by name and ID."""
    rec = dbc_get(dbc_name, record_id)
    if rec is None:
        return err(f"{dbc_name}#{record_id} not found", 404)
    return ok(rec)


@app.route("/api/dbc/<string:dbc_name>/search")
def api_dbc_search(dbc_name):
    """Search a DBC by name field. ?q=... &field=name &limit=50"""
    q     = request.args.get("q", "").strip()
    field = request.args.get("field", "name")
    limit = min(int(request.args.get("limit", 50)), 200)
    if not q:
        return err("Kein Suchbegriff")
    results = dbc_search(dbc_name, q, field=field, limit=limit)
    return ok(results)



import re as _re_spell

def _resolve_spell_vars(desc, sid):
    """Replace WoW $-variables ($m1/$s1/$M1/$d/$a1/$t1/$u/$i + ${expr$}) using RAM cache."""
    if not desc or '$' not in desc:
        return desc

    spells   = _DBC.get("Spell", {})
    durs     = _DBC.get("SpellDuration", {})
    radii    = _DBC.get("SpellRadius", {})

    def _row(ref_id): return spells.get(ref_id or sid) or {}

    def _custom_name_value(name):
        """Map $<name> to a numeric value via name keyword heuristics."""
        n = name.lower()
        r = _row(0)
        if 'percent' in n or 'pct' in n: return 100
        if 'max' in n:
            base = _i32(r.get("base_pts_1"))
            sides = r.get("die_sides_1", 0) or 0
            return base + sides + 1
        if any(k in n for k in ('min','damage','dmg','weapon','heal','cost','s1')):
            return _i32(r.get("base_pts_1")) + 1
        if any(k in n for k in ('bonus','extra','s2')):
            return _i32(r.get("base_pts_2")) + 1
        if 's3' in n: return _i32(r.get("base_pts_3")) + 1
        return None

    def _i32(v):
        """Sign-correct uint32 → int32 (DBC stores base_pts as uint32 but they're signed)."""
        v = v or 0
        return v if v < 0x80000000 else v - 0x100000000

    def _var_value(ref_id, letter, idx):
        r = _row(ref_id)
        i = idx or 1
        if letter in ('s', 'm'):
            return _i32(r.get(f"base_pts_{i}")) + 1
        if letter == 'M':
            base  = _i32(r.get(f"base_pts_{i}"))
            sides = r.get(f"die_sides_{i}", 0) or 0
            return base + sides + 1 if sides else base + 1
        if letter == 'd':
            di = r.get("duration_idx", 0)
            ms = (durs.get(di) or {}).get("dur_ms", 0) if di else 0
            return f"{ms // 1000} sec" if ms > 0 else ""
        if letter == 'a':
            ri = r.get(f"radius_idx_{i}", 0)
            rd = (radii.get(ri) or {}).get("radius", 0) if ri else 0
            return int(rd) if rd else ""
        if letter == 't':
            ms = r.get(f"aura_period_{i}", 0) or 0
            return f"{ms / 1000:.1f}".rstrip('0').rstrip('.') if ms > 0 else ""
        if letter == 'o':
            # Total damage/heal over duration: avg-per-tick × ticks
            base   = _i32(r.get(f"base_pts_{i}"))
            sides  = r.get(f"die_sides_{i}", 0) or 0
            per_ms = r.get(f"aura_period_{i}", 0) or 0
            di     = r.get("duration_idx", 0)
            dur_ms = (durs.get(di) or {}).get("dur_ms", 0) if di else 0
            if not (per_ms and dur_ms): return ""
            ticks    = max(1, dur_ms // per_ms)
            avg_tick = base + 1 + (sides - 1) // 2  # midpoint of die
            return abs(avg_tick * ticks)
        if letter == 'u': return r.get("cumulative_aura", "") or ""
        if letter == 'i': return r.get("max_targets",   "") or ""
        return None

    def _eval_math(m):
        expr = m.group(1)
        def sub(v):
            val = _var_value(int(v.group(1)) if v.group(1) else 0, v.group(2),
                             int(v.group(3)) if v.group(3) else 0)
            return str(val) if val not in (None, "") else "0"
        # Known variables first ($m1, $s1, $o1, $d, $a1, $t1, $u, $i)
        sub_expr = _re_spell.sub(r'\$(\d*)([smMoudaitu])(\d*)', sub, expr)
        # Custom variables $<name> → smart by keyword, else 1
        def _cmath(m):
            v = _custom_name_value(m.group(1))
            return str(abs(int(v))) if isinstance(v, (int, float)) else '1'
        sub_expr = _re_spell.sub(r'\$<([^>]+)>', _cmath, sub_expr)
        # $b<N> inside math = base damage ref → die_sides_<N>
        sub_expr = _re_spell.sub(
            r'\$b(\d*)',
            lambda v: str(_row(0).get(f"die_sides_{v.group(1) or '1'}", 0) or 0),
            sub_expr)
        # Multi-letter uppercase vars ($AP, $MWS, $MWB, $SPH, $RAP, …) → 0
        sub_expr = _re_spell.sub(r'\$[A-Z][A-Za-z]+', '0', sub_expr)
        # Spell-ID references like $12345 → 0 (can't insert spell name in math)
        sub_expr = _re_spell.sub(r'\$\d+', '0', sub_expr)
        sub_expr = sub_expr.replace('$', '').replace(' ', '')
        # Strip dangling leading/trailing operators
        sub_expr = sub_expr.strip('+-*/.')
        # Collapse stray double operators like "+*" or "**" → keep first
        sub_expr = _re_spell.sub(r'([+\-*/])[+\-*/]+', r'\1', sub_expr)
        if _re_spell.match(r'^[\d+\-*/().]+$', sub_expr) and sub_expr:
            try:
                v = eval(sub_expr)  # restricted charset above
                return str(int(round(abs(v)))) if isinstance(v, (int, float)) else m.group(0)
            except Exception:
                pass
        return m.group(0)

    desc = _re_spell.sub(r'\$\{(.+?)\$?\}', _eval_math, desc)

    def _simple(m):
        v = _var_value(int(m.group(1)) if m.group(1) else 0, m.group(2),
                       int(m.group(3)) if m.group(3) else 0)
        if v is None: return m.group(0)        # truly unknown → keep for catch-all
        if v == "":   return ""                # known var but no data → vanish silently
        if isinstance(v, int): return str(abs(v))
        return str(v)

    # Multiplier form $*<N>;<var> → N × var  (e.g. $*8;s2)
    def _mul_var(m):
        mult = int(m.group(1))
        letter = m.group(2)
        idx = int(m.group(3)) if m.group(3) else 1
        v = _var_value(0, letter, idx)
        if isinstance(v, (int, float)):
            return str(abs(int(v * mult)))
        return ""
    desc = _re_spell.sub(r'\$\*(\d+);([smMo])(\d*)', _mul_var, desc)

    # Conditional: $?<cond>[X][Y] → pick X (true branch). Cond can be complex; we just keep X.
    desc = _re_spell.sub(r'\$\?[^\[]*\[([^\]]*)\](?:\[[^\]]*\])?', r'\1', desc)

    # Multi-letter uppercase vars OUTSIDE math expressions ($AP/$MWS/$MWB/$SPH…) → drop.
    # Must run BEFORE simple-var regex so $MWS doesn't get partially matched as $M.
    desc = _re_spell.sub(r'\$[A-Z][A-Za-z]+', '', desc)

    # Basic vars after cross-spell math substitution
    desc = _re_spell.sub(r'\$(\d*)([smMoudaitu])(\d*)', _simple, desc)

    # Gender markers $g<m>:<f>; or $G... → keep masculine
    desc = _re_spell.sub(r'\$[gG]([^:;]+):([^;]+);', r'\1', desc)
    # Plural markers $l<sing>:<plur>; or $L<sing>:<plur>; → keep singular
    desc = _re_spell.sub(r'\$[lL]([^:;]*):([^;]*);', r'\1', desc)
    # Spell name reference $N<spellID>;  → resolve name
    def _spell_named_ref(m):
        nm = (spells.get(int(m.group(1))) or {}).get("name", "")
        return nm or ""
    desc = _re_spell.sub(r'\$N(\d+);?', _spell_named_ref, desc)

    # Custom variables $<name> outside ${...}: smart resolution by keyword
    def _csimp(m):
        v = _custom_name_value(m.group(1))
        if v is None: return ''
        return str(abs(int(v))) if isinstance(v, (int, float)) else str(v)
    desc = _re_spell.sub(r'\$<([^>]+)>', _csimp, desc)

    # Line break markers $b / $bN — replace with space (we render single line)
    desc = _re_spell.sub(r'\$b\d*', ' ', desc)
    # Combo point reference $cN — drop (player-specific)
    desc = _re_spell.sub(r'\$c\d+', '', desc)

    # Bare spell-ID name refs ($71905 → spell name)  — must come AFTER variable patterns
    def _spell_ref(m):
        rid = int(m.group(1))
        nm  = (spells.get(rid) or {}).get("name", "")
        return nm or ""
    desc = _re_spell.sub(r'\$(\d+)\b', _spell_ref, desc)

    # Final catch-all: only $ + identifier-like chars (no math operators, no dots).
    desc = _re_spell.sub(r'\$[A-Za-z<@?!][\w<>;:]*', '', desc)
    desc = _re_spell.sub(r'\$[{}]', '', desc)
    desc = _re_spell.sub(r'\$+', '', desc)
    # Clean up dangling closing brackets/parens that may have leaked from $?[X][Y] etc.
    desc = _re_spell.sub(r'\s+\]', ']', desc)
    # Preserve line breaks; only collapse spaces/tabs and trim per-line
    desc = _re_spell.sub(r'\r\n?', '\n', desc)
    desc = _re_spell.sub(r'[ \t]+', ' ', desc)
    desc = _re_spell.sub(r' *\n *', '\n', desc)
    desc = _re_spell.sub(r'\n{3,}', '\n\n', desc).strip()
    return desc


@app.route("/api/spell/tooltip/<int:spell_id>")
def get_spell_tooltip(spell_id):
    """
    Return all data needed to render a WoW-style tooltip.
    Merges DB spell_dbc + spell_template + DBC in-memory cache.
    """
    _POWER_LABEL = {
        0: "Mana", 1: "Rage", 2: "Focus", 3: "Energy",
        4: "Happiness", 5: "Runes", 6: "Runic Power",
        7: "Soul Shards", 8: "Eclipse", 9: "Holy Power",
    }
    _SCHOOL_COLOR = {
        1: "#FFFF80",  # Physical
        2: "#FFD700",  # Holy
        4: "#FF8C00",  # Fire
        8: "#4DC843",  # Nature
        16: "#00CFFF", # Frost
        32: "#9B30FF", # Shadow
        64: "#FF69B4", # Arcane
    }

    # ── 1. DBC in-memory cache (most complete) ──────────────────────────────
    dbc_cached = _DBC_SPELL_DATA.get(spell_id, {})

    # ── 2. DB spell_dbc (has CastingTimeIndex, RecoveryTime in its 33 cols) ─
    db_row = None
    try:
        db_row = query(
            "SELECT CastingTimeIndex, RecoveryTime, CategoryRecoveryTime "
            "FROM spell_dbc WHERE ID = %s", [spell_id], one=True
        )
    except Exception:
        pass

    # ── 3. spell_template (custom overrides — name, desc, school) ───────────
    tpl = None
    try:
        tnc = _tpl_name_col()
        if tnc:
            tpl = query(
                f"SELECT `{tnc}` AS tname, Description, SchoolMask, "
                f"ManaCost, PowerType "
                f"FROM spell_template WHERE ID = %s",
                [spell_id], one=True
            )
    except Exception:
        pass

    # ── 4. spell_cooldown_overrides ─────────────────────────────────────────
    cd_override = None
    try:
        cd_override = query(
            "SELECT RecoveryTime FROM spell_cooldown_overrides WHERE Id = %s",
            [spell_id], one=True
        )
    except Exception:
        pass

    # ── Assemble: DBC → DB → template (template wins) ───────────────────────
    name        = dbc_cached.get("name") or ""
    rank        = dbc_cached.get("rank") or ""
    desc        = dbc_cached.get("desc") or ""
    icon        = dbc_cached.get("icon") or _DBC_SPELL_ICON_MAP.get(spell_id, "")
    power_type  = dbc_cached.get("power_type", 0)
    mana_cost   = dbc_cached.get("mana_cost", 0)
    range_index = dbc_cached.get("range_index", 0)
    cast_index  = dbc_cached.get("cast_index") or (db_row["CastingTimeIndex"] if db_row else 0)
    recovery_ms = dbc_cached.get("recovery_ms") or (db_row["RecoveryTime"] if db_row else 0)
    school_mask = dbc_cached.get("school_mask", 0)

    if cd_override and cd_override.get("RecoveryTime"):
        recovery_ms = cd_override["RecoveryTime"]

    if tpl:
        if tpl.get("tname"):     name        = tpl["tname"]
        if tpl.get("Description"): desc      = tpl["Description"]
        if tpl.get("SchoolMask"):  school_mask = tpl["SchoolMask"]
        if tpl.get("ManaCost") is not None and tpl["ManaCost"] > 0:
            mana_cost = tpl["ManaCost"]
        if tpl.get("PowerType") is not None:
            power_type = tpl["PowerType"]

    if not name:
        name = f"Spell #{spell_id}"

    # Resolve $-variables in description ($m1, $d, ${$m1*5$}, etc.)
    desc = _resolve_spell_vars(desc, spell_id)

    # ── Resolve cast time text ───────────────────────────────────────────────
    cast_text = "Instant"
    if cast_index and _DBC_CAST_TIMES:
        base_ms = _DBC_CAST_TIMES.get(cast_index, 0)
        if base_ms > 0:
            cast_text = f"{base_ms / 1000:.1f} sec cast" if base_ms % 1000 else f"{base_ms // 1000} sec cast"
    elif cast_index:
        cast_text = ""  # Unknown until DBC loaded

    # ── Resolve range text ──────────────────────────────────────────────────
    range_text = ""
    if range_index and _DBC_RANGES:
        rng = _DBC_RANGES.get(range_index)
        if rng:
            if rng["display"]:
                range_text = rng["display"]
            elif rng["max"] <= 0:
                range_text = "Self"
            elif rng["max"] >= 999:
                range_text = "Unlimited range"
            else:
                range_text = f"{int(rng['max'])} yd range"

    # ── Cooldown text ────────────────────────────────────────────────────────
    cd_ms = recovery_ms or 0
    if cd_ms >= 1000:
        secs = cd_ms / 1000
        if secs >= 3600:
            cd_text = f"{secs/3600:.1f} hr cooldown"
        elif secs >= 60:
            cd_text = f"{secs/60:.1f} min cooldown"
        else:
            cd_text = f"{secs:.1f} sec cooldown" if secs % 1 else f"{int(secs)} sec cooldown"
    else:
        cd_text = ""

    # ── Resource cost text ──────────────────────────────────────────────────
    resource_text = ""
    if mana_cost > 0:
        label = _POWER_LABEL.get(power_type, "Mana")
        resource_text = f"{mana_cost} {label}"

    # ── School color ─────────────────────────────────────────────────────────
    color = "#FFD700"  # default gold
    if school_mask:
        for bit, col in _SCHOOL_COLOR.items():
            if school_mask & bit:
                color = col
                break

    return ok({
        "id":            spell_id,
        "name":          name,
        "rank":          rank,
        "desc":          desc,
        "icon":          icon,
        "color":         color,
        "resource":      resource_text,
        "cast_time":     cast_text,
        "range":         range_text,
        "cooldown":      cd_text,
        "school_mask":   school_mask,
        "dbc_loaded":    bool(_DBC_SPELL_DATA),
    })


@app.route("/api/spell/dbc-lookups")
def spell_dbc_lookups():
    """
    Return SpellCastTimes, SpellDuration, SpellRange as {id: label}
    for the spell editor dropdowns. Falls back to hardcoded values when empty.
    """
    def ms_to_cast(ms):
        if ms == 0: return "Instant"
        s = ms / 1000
        return f"{s:.1f}s cast" if s % 1 else f"{int(s)}s cast"

    def ms_to_dur(ms):
        if ms < 0: return "Permanent"
        if ms == 0: return "Instant"
        if ms >= 3600000: return f"{ms//3600000}h"
        if ms >= 60000:   return f"{ms//60000}min"
        if ms >= 1000:    return f"{ms//1000}s"
        return f"{ms}ms"

    # SpellCastTimes
    cast_times = {}
    try:
        for r in query("SELECT ID, Base FROM spellcasttimes_dbc ORDER BY ID"):
            cast_times[r["ID"]] = ms_to_cast(r["Base"])
    except Exception: pass
    for idx, ms in _DBC_CAST_TIMES.items():
        cast_times.setdefault(idx, ms_to_cast(ms))
    if not cast_times:
        cast_times = {0:"Instant",1:"Instant",2:"0.5s cast",3:"1s cast",
            4:"1.5s cast",5:"2s cast",6:"2.5s cast",7:"3s cast",
            8:"3.5s cast",9:"4s cast",10:"5s cast",11:"6s cast",
            12:"8s cast",13:"10s cast",14:"0.7s cast",15:"1.2s cast"}

    # SpellDuration
    durations = {}
    try:
        for r in query("SELECT ID, Duration FROM spellduration_dbc ORDER BY ID"):
            durations[r["ID"]] = ms_to_dur(r["Duration"])
    except Exception: pass
    if not durations:
        durations = {0:"Instant",1:"Permanent",2:"5s",3:"10s",4:"15s",
            5:"20s",6:"30s",7:"1min",8:"2min",9:"5min",10:"10min"}

    # SpellRange
    ranges = {}
    try:
        for r in query("SELECT ID, RangeMax_1, DisplayName_Lang_enUS FROM spellrange_dbc ORDER BY ID"):
            name = (r.get("DisplayName_Lang_enUS") or "").strip()
            rmax = r.get("RangeMax_1") or 0
            ranges[r["ID"]] = name or (f"{int(rmax)} yd" if rmax else "Self")
    except Exception: pass
    for idx, rd in _DBC_RANGES.items():
        ranges.setdefault(idx, rd.get("display") or (f"{int(rd['max'])} yd" if rd.get("max") else "Self"))
    if not ranges:
        ranges = {0:"Self",1:"Self",2:"Combat Range",3:"Melee (5 yd)",
            4:"8 yd",5:"10 yd",6:"15 yd",7:"20 yd",8:"25 yd",
            9:"30 yd",10:"40 yd",11:"45 yd",12:"100 yd",13:"Unlimited"}

    return ok({"cast_times": cast_times, "durations": durations, "ranges": ranges})


@app.route("/api/spell/icon/<int:spell_id>")
def get_spell_icon(spell_id):
    """Return icon filename for a spell ID — DBC RAM cache primary."""
    icon = _DBC_SPELL_ICON_MAP.get(spell_id) or (_DBC_SPELL_DATA.get(spell_id) or {}).get("icon")
    return ok({"spell_id": spell_id, "icon": icon})


@app.route("/api/spell/icons/bulk", methods=["POST"])
def get_spell_icons_bulk():
    """POST {ids: [1,2,3]} → {id: wowhead_icon_name}. Primary: DBC RAM cache."""
    data = request.get_json() or {}
    ids  = [int(i) for i in data.get("ids", []) if str(i).isdigit()]
    if not ids:
        return ok({})

    result = {}

    # 1. DBC RAM cache (primary — correct icon paths from SpellIcon.dbc)
    for sid in ids:
        icon = _DBC_SPELL_ICON_MAP.get(sid) or (_DBC_SPELL_DATA.get(sid) or {}).get("icon", "")
        if icon and icon != "inv_misc_questionmark":
            result[sid] = icon

    # 2. DB fallback for anything still missing (empty tables = no-op)
    missing = [sid for sid in ids if sid not in result]
    if missing:
        ph = ",".join(["%s"] * len(missing))
        try:
            rows = query(
                f"SELECT sd.ID, si.TextureFilename "
                f"FROM spell_dbc sd "
                f"JOIN spellicon_dbc si ON si.ID = sd.SpellIconID "
                f"WHERE sd.ID IN ({ph})",
                missing
            )
            for r in rows:
                raw = (r.get("TextureFilename") or "").strip()
                if not raw:
                    continue
                lower = raw.lower()
                for pfx in ("interface\\icons\\", "interface/icons/"):
                    if lower.startswith(pfx):
                        raw = raw[len(pfx):]
                        break
                fname = raw.replace("\\", "_").replace("/", "_").lower()
                if fname and fname != "inv_misc_questionmark":
                    result[r["ID"]] = fname
        except Exception:
            pass

    return ok(result)

# ── HTML SERVE ───────────────────────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory(BASE_DIR, "ASP_Admin.html")


# ── MAIN ─────────────────────────────────────────────────────────────────────

def open_browser():
    import time
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:5000")


def _startup_load_dbc():
    """Load all DBC files into RAM on server start."""
    if not os.path.isdir(DBC_PATH):
        print(f"  ⚠️  DBC-Path not found: {DBC_PATH}")
        return
    print(f"  📖 Lade alle DBCs aus {DBC_PATH} …")
    try:
        summary = load_all_dbcs(DBC_PATH)
        idx = _build_search_index()
        _load_char_base_info()
        _load_char_start_outfit()
        _load_item_dbc()
        _load_scaling_csvs()
        n_ok   = sum(1 for k in summary if not k.startswith("!"))
        n_err  = sum(1 for k in summary if k.startswith("!"))
        print(f"  ✅ {n_ok} DBCs loaded — {len(_DBC_SPELL_DATA):,} Spells, {idx:,} Such-Entries"
              + (f", {n_err} Fehler" if n_err else ""))
    except Exception as e:
        print(f"  ❌ DBC-Ladefehler: {e}")


if __name__ == "__main__":
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║          ASP Server — localhost:5000                 ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()
    _startup_load_dbc()
    print()
    print("  🌐 Open Browser: http://127.0.0.1:5000")
    print("  ⏹  Beenden: Ctrl+C")
    print()
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)