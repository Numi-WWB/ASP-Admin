# Tables.md — Table-Coverage-Roadmap

> Interne Entwickler-Doku (nicht kundenseitig). Stand: **2026-07-08**.
> Quelle: `acore_world` live gezählt + `partials/world.html` (`class="table-name"`) geparst.

## Stand

| | Wert |
|---|---|
| Tabellen in `acore_world` | **321** |
| Dokumentiert (in World-Cards) | **164** (51 %) |
| Offen | **157** |

Coverage je World-Subtab (siehe `partials/world.html`, `data-kern-*`):

| Subtab | dokumentiert / relevant | offen |
|---|---|---|
| 🎒 Items | 28 / 30 | 2 |
| ✨ Spells | 56 / 63 | 7 |
| 📜 Quests | 30 / 30 | 0 ✅ |
| 🐾 Creatures | 47 / 63 | 16 |
| 🔧 Misc | 11 / 42 | 31 |

Der große Rest (GameObjects, Achievements-System, Battlegrounds, Talente/Glyphen,
Game-Events, viele DBCs) hat **gar keine eigene Card** — das ist der eigentliche Hebel.

---

## Wie wir Tabellen einbinden — 3 Muster

Jede Tabelle fällt in genau einen dieser Integrationstypen:

**(A) DB-Editor** — Tabelle liegt in `acore_world` oder `acore_characters` und wird rein
server-seitig ausgewertet (kein Client-Rendering nötig).
→ Flask-Endpoint in `asp_server.py` (`query`/`execute` bzw. `qchar`/`exchar`) +
`js/editor/<name>.js` bzw. Subtab. Muster: **Quest-/Creature-/Loot-Editor**.

**(B) DBC → MPQ Client-Pipeline** — die Tabelle spiegelt eine `*.dbc`, die der **Client**
rendert (Icon, Name, Tooltip, Baum-Layout). Reicht nicht, nur die DB zu ändern:
Client-DBC muss neu gebaut und ins MPQ gepackt werden.
→ Muster: **Item Creator** (`_build_item_patch_mpq`, `_sync_custom_items_to_dbc`) und
**Spell Creator** (`_build_spell_dbc_bytes`, `_sync_custom_spells_to_dbc`,
`/api/spell-create/rebuild-mpq`). Neue DBC = neue `_build_<x>_dbc_bytes()` + in
`_build_item_patch_mpq()` mit-syncen.

**(C) Read-only Doku-Card** — Tabelle ist selten editiert, aber gehört ins Schema-Doku.
→ Nur ein `table-card`-Block in `partials/world.html` + `data-kern-*` hochzählen.

Faustregel: **Definitionen** (talent_dbc, achievement_dbc …) = Typ B, **Instanzen/Config**
(gameobject, conditions, game_event …) = Typ A, **Nachschlage-DBCs** (map_dbc, light_dbc …)
= Typ C oder bewusst weglassen.

---

## Fehlende Tabellen je bestehendem Subtab

### 🎒 Items — 2 offen (Editor: `js/editor/item-creator.js` + `item-editor.js`)
| Tabelle | DB | Typ | Nutzen |
|---|---|---|---|
| `item_set_names_locale` | world | A | Lokalisierte Set-Namen (dt. Item-Sets) |
| `itemdisplayinfo_dbc` | world (DBC) | B | DisplayID → Modell/Icon; wir nutzen bisher fremde DisplayIDs, könnten eigene Skins referenzieren |

Optional zur Vertiefung: `durabilitycosts_dbc`, `durabilityquality_dbc`, `randproppoints_dbc`,
`scalingstatvalues_dbc` (Heirloom-Scaling-Rohdaten — teils schon über CSV genutzt).

### ✨ Spells — 7 offen (Editor: `js/editor/spell-creator*.js`)
| Tabelle | DB | Typ | Nutzen |
|---|---|---|---|
| `glyphproperties_dbc` | world (DBC) | B | **Glyphen** — Spell + Typ (Major/Minor) |
| `glyphslot_dbc` | world (DBC) | B | Glyphen-Slots pro Level |
| `spell_jump_distance` | world | A | Spring-/Charge-Distanz für Custom-Spells |

Rest sind DBC-Nachschlagetabellen, die der Spell-Creator indirekt schon liest.
→ **Glyphen** am besten als kleiner Zusatz-Modus im Spell-Creator (Typ B), da der
Client Glyphen rendert.

### 🐾 Creatures — 16 offen (Editor: `js/editor/creature-creator.js` + `creature-editor.js`)
| Tabelle | DB | Typ | Nutzen |
|---|---|---|---|
| `creature_immunities` | world | A | School-/Mechanic-Immunitäten |
| `linked_respawn` | world | A | Gekoppelte Respawns (Boss ↔ Adds) |
| `pet_levelstats`, `pet_name_generation(_locale)` | world | A | Jäger-/Warlock-Pets |
| `vehicle_seat_addon`, `vehicleseat_dbc` | world | A/B | Fahrzeug-Sitze (Fahrzeuge sind teils da) |
| `waypoint_data_addon` | world | A | Zusatz-Waypoint-Daten (SmartAI) |
| `creaturedisplayinfo*_dbc`-Ergänzungen | world (DBC) | B | eigene Creature-Skins |

→ meist kleine A-Ergänzungen zum bestehenden Creature-Editor.

### 📜 Quests — ✅ vollständig (30/30)

### 🔧 Misc — 31 offen
Kern-Lücke sind **Player-Setup** und **Game-Events** (siehe eigene Features unten):
`player_class_stats`, `player_classlevelstats`, `player_race_stats`,
`player_factionchange_*` (achievement/items/reputations/titles),
`playercreateinfo_action`, `player_totem_model`, `graveyard_zone`, `game_graveyard`,
`areatrigger`, `areatrigger_scripts`, `areatrigger_tavern`, `points_of_interest(_locale)`.

---

## Vorgeschlagene NEUE Editoren / Tabs

Priorisiert nach Nutzen × Aufwand.

### 1. 🌟 Talents & Glyphs — *(dein Beispiel)*
**Tabellen:** `talent_dbc`, `talenttab_dbc` *(beide bereits dokumentiert, aber ohne Editor)*,
`glyphproperties_dbc`, `glyphslot_dbc`; charakter-seitig `character_talent`,
`character_glyphs` (in **`acore_characters`**).
**Typ:** B (Custom-Talente/-Bäume → Client rendert den Talentbaum) **+** A (Talente einer
konkreten Figur setzen/zurücksetzen).
**Umsetzung:**
- *Read/Set pro Figur* (schnell, Typ A): neuer Character-Subtab „Talents" analog zum
  neuen PvP-Tab — `GET/POST /api/character/<guid>/talents` über `qchar` auf
  `character_talent` (+ `character_talent`-Spec, `character_glyphs`). Reset-Button.
- *Custom-Talente/Bäume* (Typ B): `talent_dbc`/`talenttab_dbc` in die MPQ-Pipeline
  aufnehmen (`_build_talent_dbc_bytes()` nach Vorbild `_build_spell_dbc_bytes()`), im
  `_build_item_patch_mpq()` mit-syncen. Talente verweisen auf `spell_dbc`-Ranks →
  kann direkt auf dem Custom-Spell-System aufsetzen.
**Aufwand:** Set-pro-Figur = klein; Custom-Bäume = groß (DBC-Layout + Client-Test).

### 2. 🗿 GameObjects — Editor **und** Creator  ← größte echte Lücke
**Tabellen:** `gameobject_template`, `gameobject`, `gameobject_addon`,
`gameobject_template_addon`, `gameobject_template_locale`, `gameobject_summon_groups`,
`gameobjectdisplayinfo_dbc`, `gameobjectartkit_dbc`, `transports`, `transportanimation_dbc`,
`transportrotation_dbc`, `gameobject_loot_template` *(letzteres schon im Items-Tab)*.
**Typ:** A (DB) für Template/Spawns; B nur, wenn eigene GO-Modelle (`gameobjectdisplayinfo_dbc`).
**Umsetzung:** komplett analog zum **Creature Creator/Editor**:
`js/editor/gameobject-creator.js` + `-editor.js`, Endpoints `/api/gameobject-create/*`,
Custom-Range ≥ z. B. 5.000.000, `.spawn`-Hinweis. Type-Dropdown (Door, Chest,
Questgiver, Chair, Mailbox …) mit den `data0..23`-Feldern.
**Aufwand:** mittel-groß, aber sehr hoher Nutzen (ganze Objekt-Welt fehlt aktuell).

### 3. 🏆 Achievements-System (Definitionen)
**Tabellen:** `achievement_dbc`, `achievement_category_dbc`, `achievement_criteria_dbc`,
`achievement_criteria_data`, `achievement_reward`, `achievement_reward_locale`.
**Typ:** B für die drei `*_dbc` (Client zeigt Achievement-UI), A für `achievement_reward*`.
**Status:** Wir *vergeben* Achievements schon pro Figur
(`/api/character/<guid>/achievements`), können aber keine **eigenen** definieren.
**Umsetzung:** Custom-Achievement-Creator (Typ B) — `achievement_dbc` +
`achievement_criteria_dbc` in MPQ-Pipeline; Reward-Tabellen per DB.
**Aufwand:** groß (Kriterien-Logik komplex). Eher später.

### 4. 📅 Game Events Manager
**Tabellen (12):** `game_event`, `game_event_creature`/`_gameobject` *(teils da)*,
`game_event_creature_quest`, `game_event_gameobject_quest`, `game_event_model_equip`,
`game_event_pool`, `game_event_prerequisite`, `game_event_condition`,
`game_event_quest_condition`, `game_event_seasonal_questrelation`,
`game_event_arena_seasons`, `game_event_battleground_holiday`.
**Typ:** A (rein DB/Server). **Umsetzung:** Ein „Events"-Subtab im World- oder Player-Bereich:
Event-Liste (`game_event`: Start/Ende/Occurrence/Length) + verknüpfte Spawns/Quests
verwalten. Muster wie Loot-/SmartAI-Editor. **Aufwand:** mittel.

### 5. ⚔️ PvP / Battlegrounds / Arena (Config)
**Tabellen:** `battleground_template`, `battlemaster_entry`, `battlemasterlist_dbc`,
`pvpdifficulty_dbc`, `arena_season_reward`, `arena_season_reward_group`,
`outdoorpvp_template`.
**Typ:** A + etwas B (`battlemasterlist_dbc`, `pvpdifficulty_dbc`).
**Anknüpfung:** passt thematisch zum **neuen Character-PvP-Tab** — dort später eine
Server-weite „Season/BG-Config"-Sektion. **Aufwand:** mittel.

### 6. 🔀 Conditions Editor
**Tabellen:** `conditions` (zentrale Bedingungs-Engine), `disables`, `spawn_group`,
`spawn_group_template`.
**Typ:** A. **Nutzen:** `conditions` steuert Loot/Vendor/Gossip/Spell-Sichtbarkeit —
sehr mächtig, aber Sourcetype/ConditionType-Matrix ist komplex.
**Umsetzung:** generischer `conditions`-Editor mit Dropdowns je `SourceTypeOrReferenceId`.
**Aufwand:** groß (Enum-Lastig). Mittelfristig.

### 7. 👶 Player-Setup vervollständigen (Misc)
**Tabellen:** `player_classlevelstats`, `player_class_stats`, `player_race_stats`,
`playercreateinfo_action` (Start-Actionbar), `player_factionchange_*`, `player_totem_model`.
**Typ:** A. **Anknüpfung:** direkt in den bestehenden **Player-Tab** (`js/player/*`).
Start-Actionbar (`playercreateinfo_action`) ist ein naheliegender kleiner Gewinn.
**Aufwand:** klein-mittel, hebt die Misc-Coverage spürbar.

---

## Bewusst NICHT abdecken (System / Infra / reine Client-DBCs)

Diese Tabellen sollten **aus dem Coverage-Nenner raus**, damit die Prozente ehrlich bleiben
(sie sind kein sinnvolles Editor-Ziel):

- **Server-Infra:** `updates`, `updates_include`, `version`, `warden_checks`,
  `acore_string`, `antidos_opcode_policies`, `command`, `dungeon_access_*`,
  `instance_template`, `instance_encounters`, `event_scripts`, `exploration_basexp`,
  `spell_jump_distance`(?).
- **Fremd-Module:** `mod_auctionhousebot*`, `mod_auctionator*`, `module_string(_locale)`,
  `cata_haste_installed`, `cata_haste_aoe_installed` *(= Marker deines eigenen Addons)*.
- **Reine Nachschlage-DBCs ohne Editor-Nutzen:** `map_dbc`, `light_dbc`, `movie_dbc`,
  `soundentries_dbc`, `cinematic*_dbc`, `wmoareatable_dbc`, `worldmaparea/overlay_dbc`,
  `taxi*_dbc`, `gt*_dbc` (Rating-Kurven), `names(profanity|reserved)_dbc`,
  `barbershopstyle_dbc`, `bankbagslotprices_dbc`, `stableslotprices_dbc`.

**Empfehlung:** In `partials/world.html` eine kleine Legende „N Tabellen bewusst
ausgeschlossen (Server-Infra / Fremd-Module)" ergänzen und diese N aus `data-kern-total`
herausrechnen. Dann steigt die ehrliche Gesamt-Coverage deutlich, ohne zu schönen.

---

## Nächste sinnvolle Schritte (Vorschlag)

1. **GameObject Creator/Editor** (Muster = Creature) — größter Coverage- und Feature-Sprung.
2. **Talents-pro-Figur** (Character-Subtab, Typ A) — klein, hoher gefühlter Nutzen.
3. **Player-Setup-Rest** in den Player-Tab (Typ A) — hebt Misc.
4. **Game Events Manager** (Typ A).
5. Später: Custom-Talentbäume / Achievements / Glyphen (alles Typ B, MPQ-Pipeline).
