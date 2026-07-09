"""
ITEM ENUMS - Item-spezifische Lookups und Dekodierungen
Enthält alle Item-related Bitmasken und Enumerationen
"""

# ==================== ITEM CLASS ====================

CLASS_MAP = {
    0: "Consumable",
    1: "Container",
    2: "Weapon",
    3: "Gem",
    4: "Armor",
    5: "Reagent",
    6: "Projectile",
    7: "Trade Goods",
    9: "Recipe",
    11: "Quiver",
    12: "Quest",
    13: "Key",
    15: "Miscellaneous",
    16: "Glyph"
}

# ==================== ITEM SUBCLASS ====================

SUBCLASS_MAP = {
    0: {  # Consumable
        0: "Consumable",
        1: "Potion",
        2: "Elixir",
        3: "Flask",
        4: "Scroll",
        5: "Food & Drink",
        6: "Item Enhancement",
        7: "Bandage",
        8: "Other"
    },
    1: {  # Container
        0: "Bag",
        1: "Soul Bag",
        2: "Herb Bag",
        3: "Enchanting Bag",
        4: "Engineering Bag",
        5: "Gem Bag",
        6: "Mining Bag",
        7: "Leatherworking Bag",
        8: "Inscription Bag"
    },
    2: {  # Weapon
        0: "Axe",
        1: "2H Axe",
        2: "Bow",
        3: "Gun",
        4: "Mace",
        5: "2H Mace",
        6: "Polearm",
        7: "Sword",
        8: "2H Sword",
        10: "Staff",
        11: "Exotic",
        12: "Exotic",
        13: "Fist Weapon",
        14: "Misc",
        15: "Dagger",
        16: "Thrown",
        17: "Spear",
        18: "Crossbow",
        19: "Wand",
        20: "Fishing Pole"
    },
    3: {  # Gem
        0: "Red",
        1: "Blue",
        2: "Yellow",
        3: "Purple",
        4: "Green",
        5: "Orange",
        6: "Meta",
        7: "Simple",
        8: "Prismatic"
    },
    4: {  # Armor
        0: "Misc",
        1: "Cloth",
        2: "Leather",
        3: "Mail",
        4: "Plate",
        6: "Shield",
        7: "Libram",
        8: "Idol",
        9: "Totem",
        10: "Sigil"
    },
    5: {  # Reagent
        0: "Reagent"
    },
    6: {  # Projectile
        2: "Arrow",
        3: "Bullet"
    },
    7: {  # Trade Goods
        0: "Trade Goods",
        1: "Parts",
        2: "Explosives",
        3: "Devices",
        4: "Jewelcrafting",
        5: "Cloth",
        6: "Leather",
        7: "Metal & Stone",
        8: "Meat",
        9: "Herb",
        10: "Elemental",
        11: "Other",
        12: "Enchanting",
        13: "Materials",
        14: "Armor Enchantment",
        15: "Weapon Enchantment"
    },
    9: {  # Recipe
        0: "Book",
        1: "Leatherworking",
        2: "Tailoring",
        3: "Engineering",
        4: "Blacksmithing",
        5: "Cooking",
        6: "Alchemy",
        7: "First Aid",
        8: "Enchanting",
        9: "Fishing",
        10: "Jewelcrafting"
    },
    11: {  # Quiver
        2: "Quiver",
        3: "Ammo Pouch"
    },
    12: {  # Quest
        0: "Quest"
    },
    13: {  # Key
        0: "Key",
        1: "Lockpick"
    },
    15: {  # Miscellaneous
        0: "Junk",
        1: "Reagent",
        2: "Pet",
        3: "Holiday",
        4: "Other",
        5: "Mount"
    },
    16: {  # Glyph
        1: "Warrior",
        2: "Paladin",
        3: "Hunter",
        4: "Rogue",
        5: "Priest",
        6: "Death Knight",
        7: "Shaman",
        8: "Mage",
        9: "Warlock",
        11: "Druid"
    }
}

# ==================== QUALITY ====================

QUALITY_MAP = {
    0: "Poor",
    1: "Common",
    2: "Uncommon",
    3: "Rare",
    4: "Epic",
    5: "Legendary",
    6: "Artifact",
    7: "Heirloom"
}

QUALITY_COLORS = {
    0: "⚪",  # Poor - Gray
    1: "⚪",  # Common - White
    2: "🟢",  # Uncommon - Green
    3: "🔵",  # Rare - Blue
    4: "🟣",  # Epic - Purple
    5: "🟠",  # Legendary - Orange
    6: "🔴",  # Artifact - Red
    7: "⭐"   # Heirloom - Gold
}

# ==================== INVENTORY TYPE ====================

INVENTORYTYPE_MAP = {
    1: "Head",
    2: "Neck",
    3: "Shoulder",
    4: "Shirt",
    5: "Chest",
    6: "Waist",
    7: "Legs",
    8: "Feet",
    9: "Wrist",
    10: "Hands",
    11: "Ring",
    12: "Trinket",
    13: "Weapon",
    14: "Shield",
    15: "Ranged",
    16: "Cloak",
    17: "2H Weapon",
    18: "Bag",
    19: "Tabard",
    20: "Robe",
    21: "Main Hand",
    22: "Off Hand",
    23: "Holdable",
    24: "Ammo",
    25: "Thrown",
    26: "Ranged",
    27: "Quiver",
    28: "Relic"
}

# ==================== FLAGS (BITMASK) ====================

ITEM_FLAG_MAP = {
    1: "No Pickup",
    2: "Conjured",
    4: "Has Loot",
    8: "Heroic Tooltip",
    16: "Deprecated",
    32: "No Destroy",
    64: "Player Cast",
    128: "No Equip Cooldown",
    256: "Multi Loot Quest",
    512: "Wrapper",
    1024: "Uses Resources",
    2048: "Multi Drop",
    4096: "Purchase Record",
    8192: "Petition",
    16384: "Has Text",
    32768: "No Disenchant",
    65536: "Real Duration",
    131072: "No Creator",
    262144: "Prospectable",
    524288: "Unique Equipped",
    1048576: "Ignore Auras",
    2097152: "Ignore Arena",
    4194304: "No Durability Loss",
    8388608: "Use When Shapeshifted",
    16777216: "Quest Glow",
    33554432: "Hide Recipe",
    67108864: "No Arena",
    134217728: "Bind To Account",
    268435456: "No Reagent Cost",
    536870912: "Millable",
    1073741824: "Guild Chat",
    2147483648: "No Progressive Loot"
}

# ==================== FLAGS EXTRA / FLAGS 2 (BITMASK) ====================

FLAGS_EXTRA_MAP = {
    1: "Horde Only",
    2: "Alliance Only",
    4: "Dont Ignore Buy Price",
    8: "Caster",
    16: "Physical",
    32: "Need Roll",
    64: "Bind On Acquire",
    128: "Can Trade",
    256: "Greed Only",
    512: "Caster Weapon",
    1024: "Delete On Login",
    2048: "Internal",
    4096: "No Vendor",
    8192: "Show Undiscovered",
    16384: "Override Gold Cost",
    32768: "Ignore BG Restriction",
    65536: "Not BG Usable",
    131072: "BNet Trade OK",
    262144: "Confirm Use",
    524288: "Reevaluate Bonding",
    1048576: "No Transform Charge",
    2097152: "No Visual Alter",
    4194304: "No Visual Source",
    8388608: "Ignore Quality Visual",
    16777216: "No Durability",
    33554432: "Role Tank",
    67108864: "Role Healer",
    134217728: "Role Damage",
    268435456: "Challenge Mode",
    536870912: "Never Stack",
    1073741824: "Disenchant To Loot",
    2147483648: "Tradeskill"
}

# ==================== BONDING ====================

BONDING_MAP = {
    0: "No Bind",
    1: "Bind on Pickup",
    2: "Bind on Equip",
    3: "Bind on Use",
    4: "Quest Item"
}

BONDING_ALIAS = {
    "bop": 1,
    "boe": 2,
    "bind on pickup": 1,
    "bind on equip": 2,
    "bind on use": 3,
    "quest item": 4,
    "unbound": 0
}

# ==================== DAMAGE TYPES ====================

DMG_TYPE_MAP = {
    0: "Physical",
    1: "Holy",
    2: "Fire",
    3: "Nature",
    4: "Frost",
    5: "Shadow",
    6: "Arcane"
}

# ==================== ITEM STATS ====================

ITEM_STAT_TYPE_MAP = {
    0: "ITEM_MOD_MANA",
    1: "ITEM_MOD_HEALTH",
    3: "ITEM_MOD_AGILITY",
    4: "ITEM_MOD_STRENGTH",
    5: "ITEM_MOD_INTELLECT",
    6: "ITEM_MOD_SPIRIT",
    7: "ITEM_MOD_STAMINA",
    12: "ITEM_MOD_DEFENSE_SKILL_RATING",
    13: "ITEM_MOD_DODGE_RATING",
    14: "ITEM_MOD_PARRY_RATING",
    15: "ITEM_MOD_BLOCK_RATING",
    16: "ITEM_MOD_HIT_MELEE_RATING",
    17: "ITEM_MOD_HIT_RANGED_RATING",
    18: "ITEM_MOD_HIT_SPELL_RATING",
    19: "ITEM_MOD_CRIT_MELEE_RATING",
    20: "ITEM_MOD_CRIT_RANGED_RATING",
    21: "ITEM_MOD_CRIT_SPELL_RATING",
    22: "ITEM_MOD_HIT_TAKEN_MELEE_RATING",
    23: "ITEM_MOD_HIT_TAKEN_RANGED_RATING",
    24: "ITEM_MOD_HIT_TAKEN_SPELL_RATING",
    25: "ITEM_MOD_CRIT_TAKEN_MELEE_RATING",
    26: "ITEM_MOD_CRIT_TAKEN_RANGED_RATING",
    27: "ITEM_MOD_CRIT_TAKEN_SPELL_RATING",
    28: "ITEM_MOD_HASTE_MELEE_RATING",
    29: "ITEM_MOD_HASTE_RANGED_RATING",
    30: "ITEM_MOD_HASTE_SPELL_RATING",
    31: "ITEM_MOD_HIT_RATING",
    32: "ITEM_MOD_CRIT_RATING",
    33: "ITEM_MOD_HIT_TAKEN_RATING",
    34: "ITEM_MOD_CRIT_TAKEN_RATING",
    35: "ITEM_MOD_RESILIENCE_RATING",
    36: "ITEM_MOD_HASTE_RATING",
    37: "ITEM_MOD_EXPERTISE_RATING",
    38: "ITEM_MOD_ATTACK_POWER",
    39: "ITEM_MOD_RANGED_ATTACK_POWER",
    40: "ITEM_MOD_FERAL_ATTACK_POWER",
    41: "ITEM_MOD_SPELL_HEALING_DONE",
    42: "ITEM_MOD_SPELL_DAMAGE_DONE",
    43: "ITEM_MOD_MANA_REGENERATION",
    44: "ITEM_MOD_ARMOR_PENETRATION_RATING",
    45: "ITEM_MOD_SPELL_POWER",
    46: "ITEM_MOD_HEALTH_REGEN",
    47: "ITEM_MOD_SPELL_PENETRATION",
    48: "ITEM_MOD_BLOCK_VALUE",
}

STAT_SHORTNAMES = {
    "ITEM_MOD_MANA": "MP",
    "ITEM_MOD_HEALTH": "HP",
    "ITEM_MOD_AGILITY": "Agi",
    "ITEM_MOD_STRENGTH": "Str",
    "ITEM_MOD_INTELLECT": "Int",
    "ITEM_MOD_SPIRIT": "Spi",
    "ITEM_MOD_STAMINA": "Sta",
    "ITEM_MOD_DEFENSE_SKILL_RATING": "Def",
    "ITEM_MOD_DODGE_RATING": "Dod",
    "ITEM_MOD_PARRY_RATING": "Par",
    "ITEM_MOD_BLOCK_RATING": "Blk",
    "ITEM_MOD_HIT_MELEE_RATING": "Hit",
    "ITEM_MOD_HIT_RANGED_RATING": "RangeHit",
    "ITEM_MOD_HIT_SPELL_RATING": "SpellHit",
    "ITEM_MOD_CRIT_MELEE_RATING": "Crit",
    "ITEM_MOD_CRIT_RANGED_RATING": "RangeCrit",
    "ITEM_MOD_CRIT_SPELL_RATING": "SpellCrit",
    "ITEM_MOD_HIT_TAKEN_MELEE_RATING": "Resil",
    "ITEM_MOD_HIT_TAKEN_RANGED_RATING": "ResRange",
    "ITEM_MOD_HIT_TAKEN_SPELL_RATING": "ResSpell",
    "ITEM_MOD_CRIT_TAKEN_MELEE_RATING": "CritResil",
    "ITEM_MOD_CRIT_TAKEN_RANGED_RATING": "CritResilRange",
    "ITEM_MOD_CRIT_TAKEN_SPELL_RATING": "CritResilSpell",
    "ITEM_MOD_HASTE_MELEE_RATING": "Haste",
    "ITEM_MOD_HASTE_RANGED_RATING": "RangeHaste",
    "ITEM_MOD_HASTE_SPELL_RATING": "SpellHaste",
    "ITEM_MOD_HIT_RATING": "Hit",
    "ITEM_MOD_CRIT_RATING": "Crit",
    "ITEM_MOD_HIT_TAKEN_RATING": "HitTaken",
    "ITEM_MOD_CRIT_TAKEN_RATING": "CritTaken",
    "ITEM_MOD_RESILIENCE_RATING": "Resil",
    "ITEM_MOD_HASTE_RATING": "Haste",
    "ITEM_MOD_EXPERTISE_RATING": "Exp",
    "ITEM_MOD_ATTACK_POWER": "AP",
    "ITEM_MOD_RANGED_ATTACK_POWER": "RAP",
    "ITEM_MOD_FERAL_ATTACK_POWER": "FeralAP",
    "ITEM_MOD_SPELL_HEALING_DONE": "Healing",
    "ITEM_MOD_SPELL_DAMAGE_DONE": "SpellDmg",
    "ITEM_MOD_MANA_REGENERATION": "MP5",
    "ITEM_MOD_ARMOR_PENETRATION_RATING": "ArPen",
    "ITEM_MOD_SPELL_POWER": "SP",
    "ITEM_MOD_HEALTH_REGEN": "HP5",
    "ITEM_MOD_SPELL_PENETRATION": "SpellPen",
    "ITEM_MOD_BLOCK_VALUE": "BlockVal",
}

# ==================== CLASSES & RACES ====================

ALLOWABLE_CLASS_MAP = {
    1: "Warrior",
    2: "Paladin",
    4: "Hunter",
    8: "Rogue",
    16: "Priest",
    32: "Death Knight",
    64: "Shaman",
    128: "Mage",
    256: "Warlock",
    1024: "Druid"
}

ALLOWABLE_RACE_MAP = {
    1: "Human",
    2: "Orc",
    4: "Dwarf",
    8: "Night Elf",
    16: "Undead",
    32: "Tauren",
    64: "Gnome",
    128: "Troll",
    512: "Blood Elf",
    1024: "Draenei"
}

ALLOWABLE_RACE_KEYWORDS = {
    "human": 1,
    "orc": 2,
    "dwarf": 4,
    "night elf": 8,
    "undead": 16,
    "tauren": 32,
    "gnome": 64,
    "troll": 128,
    "blood elf": 512,
    "draenei": 1024
}

# ==================== SOCKETS ====================

SOCKET_COLOR_MAP = {
    1: "Yellow",
    2: "Red",
    4: "Blue",
    8: "Meta"
}

SOCKET_COLOR_EMOJI = {
    1: "🟡",  # Yellow
    2: "🔴",  # Red
    4: "🔵",  # Blue
    8: "⭐"   # Meta
}

# ==================== MATERIALS ====================

MATERIAL_MAP = {
    -1: "Consumables",
    0:  "Not Defined",
    1:  "Metal",
    2:  "Wood",
    3:  "Liquid",
    4:  "Jewelry",
    5:  "Chain",
    6:  "Plate",
    7:  "Cloth",
    8:  "Leather",
}

# ==================== HELPER FUNCTIONS ====================

def get_item_class_name(class_id: int) -> str:
    """Hole den Namen einer Item-Klasse"""
    return CLASS_MAP.get(class_id, f"Unknown ({class_id})")


def get_item_subclass_name(class_id: int, subclass_id: int) -> str:
    """Hole den Namen einer Item-Unterklasse"""
    if class_id not in SUBCLASS_MAP:
        return f"Unknown ({subclass_id})"
    return SUBCLASS_MAP[class_id].get(subclass_id, f"Unknown ({subclass_id})")


def get_quality_name(quality: int) -> str:
    """Hole den Namen der Item-Qualität"""
    return QUALITY_MAP.get(quality, f"Unknown ({quality})")


def get_quality_emoji(quality: int) -> str:
    """Hole das Emoji für Item-Qualität"""
    return QUALITY_COLORS.get(quality, "❓")
