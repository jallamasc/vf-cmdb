"""FEAT-3: built-in catalogues of themed "fun" names.

Datacenter operators commonly name sites / floors / rooms after a theme so the
identifiers are memorable in conversation ("meet me in Tatooine") while the
strict ``vf_long_name`` stays machine-generated. These lists are intentionally
kept in-memory (plain Python data, no DB table) so they never need a migration,
never drift between environments and cost nothing to query.

Every category ships at least 100 entries. Use :func:`search` to filter.
"""
from __future__ import annotations

import unicodedata

# ---------------------------------------------------------------------------
# Star Wars — planets, moons, systems and starships
# ---------------------------------------------------------------------------
STAR_WARS = [
    "Tatooine", "Alderaan", "Yavin", "Hoth", "Dagobah", "Bespin", "Endor",
    "Naboo", "Coruscant", "Kamino", "Geonosis", "Utapau", "Mustafar",
    "Kashyyyk", "Polis Massa", "Mygeeto", "Felucia", "Cato Neimoidia",
    "Saleucami", "Stewjon", "Eriadu", "Corellia", "Rodia", "Nal Hutta",
    "Dantooine", "Bestine", "Ord Mantell", "Trandosha", "Socorro", "Mon Cala",
    "Chandrila", "Sullust", "Toydaria", "Malastare", "Dathomir", "Ryloth",
    "Aleen Minor", "Vulpter", "Troiken", "Tund", "Haruun Kal", "Cerea",
    "Glee Anselm", "Iridonia", "Tholoth", "Iktotch", "Quermia", "Dorin",
    "Champala", "Mirial", "Serenno", "Concord Dawn", "Zolan", "Ojom",
    "Skako", "Muunilinst", "Shili", "Kalee", "Umbara", "Jakku", "Takodana",
    "Starkiller", "Hosnian Prime", "Ahch-To", "Crait", "Cantonica", "Batuu",
    "Exegol", "Kijimi", "Pasaana", "Kef Bir", "Ilum", "Scarif", "Jedha",
    "Eadu", "Wobani", "Lah Mu", "Vardos", "Pillio", "Athulla", "Sissubo",
    "Lothal", "Atollon", "Garel", "Yarma", "Seelos", "Mandalore",
    "Concordia", "Kalevala", "Krownest", "Nevarro", "Sorgan", "Arvala",
    "Tython", "Corvus", "Morak", "Trask", "Peridea", "Seatos", "Denab",
    "Millennium Falcon", "Tantive", "Executor", "Devastator", "Ghost",
    "Razor Crest", "Rogue Shadow", "Nebulon", "Home One", "Profundity",
    "Radiant", "Invisible Hand", "Malevolence", "Chimaera", "Eravana",
    "Supremacy", "Finalizer", "Raddus", "Nightbrother", "Stinger Mantis",
    "Slave One", "Outrider", "Rebel Dream", "Sun Fac", "Bright Hope",
]

# ---------------------------------------------------------------------------
# Greek mythology — gods, titans, heroes, creatures and places
# ---------------------------------------------------------------------------
GREEK_MYTHOLOGY = [
    "Zeus", "Hera", "Poseidon", "Demeter", "Athena", "Apollo", "Artemis",
    "Ares", "Aphrodite", "Hephaestus", "Hermes", "Hestia", "Dionysus",
    "Hades", "Persephone", "Cronus", "Rhea", "Oceanus", "Tethys", "Hyperion",
    "Theia", "Coeus", "Phoebe", "Crius", "Iapetus", "Themis", "Mnemosyne",
    "Atlas", "Prometheus", "Epimetheus", "Menoetius", "Helios", "Selene",
    "Eos", "Astraeus", "Perses", "Pallas", "Leto", "Asteria", "Metis",
    "Dione", "Eurybia", "Nyx", "Erebus", "Aether", "Hemera", "Chaos",
    "Gaia", "Uranus", "Pontus", "Tartarus", "Eros", "Thanatos", "Hypnos",
    "Nemesis", "Nike", "Iris", "Hebe", "Eileithyia", "Tyche", "Ananke",
    "Moros", "Momus", "Charon", "Hecate", "Pan", "Priapus", "Triton",
    "Nereus", "Proteus", "Phorcys", "Ceto", "Thaumas", "Amphitrite",
    "Galatea", "Thetis", "Calypso", "Circe", "Medea", "Ariadne", "Andromeda",
    "Cassiopeia", "Perseus", "Heracles", "Theseus", "Jason", "Orpheus",
    "Achilles", "Odysseus", "Ajax", "Hector", "Aeneas", "Patroclus",
    "Agamemnon", "Menelaus", "Diomedes", "Bellerophon", "Atalanta",
    "Meleager", "Peleus", "Cadmus", "Daedalus", "Icarus", "Sisyphus",
    "Tantalus", "Midas", "Narcissus", "Pygmalion", "Endymion", "Orion",
    "Chiron", "Pegasus", "Cerberus", "Hydra", "Chimera", "Sphinx", "Medusa",
    "Minotaur", "Cyclops", "Typhon", "Echidna", "Scylla", "Charybdis",
    "Griffin", "Phoenix", "Argus", "Talos", "Olympus", "Delphi", "Ithaca",
    "Mycenae", "Thebes", "Sparta", "Corinth", "Argos", "Elysium", "Styx",
    "Lethe", "Acheron", "Cocytus", "Phlegethon", "Arcadia", "Crete",
]

# ---------------------------------------------------------------------------
# Mountain peaks — major summits worldwide
# ---------------------------------------------------------------------------
MOUNTAIN_PEAKS = [
    "Everest", "K2", "Kangchenjunga", "Lhotse", "Makalu", "Cho Oyu",
    "Dhaulagiri", "Manaslu", "Nanga Parbat", "Annapurna", "Gasherbrum",
    "Broad Peak", "Shishapangma", "Gyachung Kang", "Distaghil Sar",
    "Ngadi Chuli", "Nuptse", "Khunyang Chhish", "Masherbrum", "Nanda Devi",
    "Chomo Lonzo", "Batura Sar", "Rakaposhi", "Namcha Barwa", "Kamet",
    "Saltoro Kangri", "Jannu", "Tirich Mir", "Molamenqing", "Gurla Mandhata",
    "Ama Dablam", "Machapuchare", "Pumori", "Baruntse", "Cholatse",
    "Denali", "Logan", "Orizaba", "Saint Elias", "Popocatepetl",
    "Foraker", "Iztaccihuatl", "Lucania", "King Peak", "Steele",
    "Bona", "Blackburn", "Sanford", "Wood", "Vancouver", "Churchill",
    "Fairweather", "Hubbard", "Bear", "Hunter", "Whitney", "Elbert",
    "Massive", "Harvard", "Rainier", "Williamson", "Blanca Peak",
    "La Plata", "Uncompahgre", "Crestone", "Lincoln", "Grays Peak",
    "Antero", "Evans", "Longs Peak", "Wrangell", "Shasta", "Hood",
    "Aconcagua", "Ojos del Salado", "Monte Pissis", "Huascaran", "Bonete",
    "Tres Cruces", "Llullaillaco", "Mercedario", "Yerupaja", "Sajama",
    "Illimani", "Chimborazo", "Cotopaxi", "Cayambe", "Antisana",
    "Ritacuba Blanco", "Nevado del Huila", "Nevado del Ruiz", "Tolima",
    "Cristobal Colon", "Simon Bolivar", "Pico Bolivar", "Roraima",
    "Mont Blanc", "Monte Rosa", "Dom", "Weisshorn", "Matterhorn",
    "Dent Blanche", "Grand Combin", "Finsteraarhorn", "Jungfrau", "Eiger",
    "Monch", "Bernina", "Gran Paradiso", "Ortler", "Marmolada",
    "Grossglockner", "Zugspitze", "Triglav", "Olympus", "Etna",
    "Elbrus", "Dykh Tau", "Shkhara", "Kazbek", "Ushba", "Ararat",
    "Damavand", "Kilimanjaro", "Kenya", "Stanley", "Meru", "Ras Dashen",
    "Toubkal", "Cameroon", "Karisimbi", "Emi Koussi", "Thabana Ntlenyana",
    "Kosciuszko", "Aoraki", "Puncak Jaya", "Kinabalu", "Fuji", "Vinson",
    "Erebus", "Sidley", "Tyree", "Shinn", "Gardner", "Epperly",
]

# ---------------------------------------------------------------------------
# Space missions — crewed programmes, probes, landers, telescopes, rockets
# ---------------------------------------------------------------------------
SPACE_MISSIONS = [
    "Sputnik", "Vostok", "Voskhod", "Soyuz", "Salyut", "Mir", "Buran",
    "Luna", "Zond", "Venera", "Vega", "Mars 3", "Phobos", "Spektr",
    "Mercury", "Gemini", "Apollo", "Skylab", "Columbia", "Challenger",
    "Discovery", "Atlantis", "Endeavour", "Enterprise", "Artemis", "Orion",
    "Ranger", "Surveyor", "Pioneer", "Mariner", "Viking", "Voyager",
    "Galileo", "Magellan", "Ulysses", "Cassini", "Huygens", "Genesis",
    "Stardust", "Deep Impact", "Deep Space", "Dawn", "Juno", "Lucy",
    "Psyche", "Europa Clipper", "New Horizons", "Parker", "Ulysses Probe",
    "Messenger", "Maven", "Insight", "Phoenix", "Odyssey", "Pathfinder",
    "Sojourner", "Spirit", "Opportunity", "Curiosity", "Perseverance",
    "Ingenuity", "Zhurong", "Tianwen", "Chandrayaan", "Vikram", "Pragyan",
    "Mangalyaan", "Aditya", "Gaganyaan", "Chang'e", "Yutu", "Queqiao",
    "Shenzhou", "Tiangong", "Tianhe", "Long March", "Kuaizhou",
    "Hayabusa", "Akatsuki", "Kaguya", "Hakuto", "Ikaros", "Himawari",
    "Rosetta", "Philae", "Giotto", "Beagle", "Mars Express", "Venus Express",
    "ExoMars", "Bepicolombo", "Solar Orbiter", "Juice", "Cluster",
    "Herschel", "Planck", "Gaia", "Cheops", "Plato", "Ariel", "Euclid",
    "Hubble", "Chandra", "Spitzer", "Kepler", "Tess", "Webb", "Roman",
    "Swift", "Fermi", "Nustar", "Wise", "Galex", "Cobe", "Wmap", "Ixpe",
    "Landsat", "Sentinel", "Terra", "Aqua", "Aura", "Icesat", "Grace",
    "Osiris Rex", "Bennu", "Dart", "Hera", "Lunar Prospector", "Clementine",
    "Lro", "Grail", "Ladee", "Capstone", "Starship", "Falcon", "Dragon",
    "Crew Dragon", "Cargo Dragon", "Starliner", "Cygnus", "Progress",
    "Ariane", "Vega Rocket", "Atlas", "Delta", "Titan", "Saturn V",
    "Redstone", "Vulcan", "Electron", "Neutron", "New Shepard", "New Glenn",
]

# ---------------------------------------------------------------------------
# Phase 4 Req 10 — Networking: pioneers, landmark projects/networks, and
# early network hardware/standards bodies, so a network device can carry a
# name that is recognisably "networking-flavored" the way the other
# categories are recognisably Star Wars / Greek myth / etc.
# ---------------------------------------------------------------------------
NETWORKING = [
    # -- Pioneers --------------------------------------------------------
    "Vint Cerf", "Bob Kahn", "Paul Baran", "Donald Davies", "Leonard Kleinrock",
    "Tim Berners-Lee", "Jon Postel", "Radia Perlman", "Robert Metcalfe",
    "Van Jacobson", "David Clark", "Danny Cohen", "Steve Crocker",
    "Elizabeth Feinler", "Doug Engelbart", "Ray Tomlinson", "Larry Roberts",
    "Charley Kline", "Bill Joy", "Dennis Ritchie", "Ken Thompson",
    "Marc Andreessen", "Eric Bina", "Whitfield Diffie", "Martin Hellman",
    "Phil Zimmermann", "Jean Armour Polly", "Brewster Kahle",
    "Ward Cunningham", "Craig Newmark", "Linus Torvalds", "Richard Stevens",
    "Bob Metcalfe", "Sandy Lerner", "Leonard Bosack", "Werner Zorn",
    "Peter Kirstein", "Louis Pouzin", "Hubert Zimmermann", "Jake Feinler",
    "Kees Neggers", "Geoff Huston", "Scott Bradner", "Noel Chiappa",
    # -- Landmark networks & projects -------------------------------------
    "Arpanet", "NSFNET", "CSNET", "Bitnet", "Janet", "Minitel", "Usenet",
    "Ethernet", "Token Ring", "Fidonet", "CompuServe", "Prodigy", "GEnie",
    "Plan 9", "Multics", "Internet2", "6Bone", "Abilene", "vBNS", "Milnet",
    "Darpa", "Plato", "Alohanet", "Cyclades", "Merit", "Cerfnet", "Uunet",
    "Netnews", "Decnet", "Appletalk", "Novell", "Netware", "Xerox Parc",
    "Interop", "Renater", "Surfnet", "Dante", "Geant", "Internet Exchange",
    "Mae East", "Mae West", "Equinix", "Any2", "Linx", "Amsix",
    # -- Standards, protocols & early hardware (proper-noun style) --------
    "Tcp", "Ip", "Bgp", "Ospf", "Rip", "Dns", "Smtp", "Http", "Ftp", "Telnet",
    "Gopher", "Archie", "Veronica", "Finger", "Whois", "Ping", "Traceroute",
    "Imp", "Tip", "Csnet Relay", "X25", "Frame Relay", "Atm Forum",
    "Ansnet", "Nsi", "Es Net", "Hep Net", "Bearnet", "Sura Net", "Nysernet",
    "Jvnc Net", "Westnet", "Nor Dunet", "Sesqui Net", "Pacific Net",
    "Ricenet", "Cix", "Psi Net", "Netcom", "Delphi", "Well", "Echo Ny",
    "Freenet", "Bbn", "Sri International", "Ucla Nmc", "Xerox Alto",
]

# Public catalogue: category slug -> ordered list of names.
THEMES: dict[str, list[str]] = {
    "star_wars": STAR_WARS,
    "greek_mythology": GREEK_MYTHOLOGY,
    "mountain_peaks": MOUNTAIN_PEAKS,
    "space_missions": SPACE_MISSIONS,
    "networking": NETWORKING,
}

# Human-readable labels for the UI tabs.
CATEGORY_LABELS: dict[str, str] = {
    "star_wars": "Star Wars",
    "greek_mythology": "Greek Mythology",
    "mountain_peaks": "Mountain Peaks",
    "space_missions": "Space Missions",
    "networking": "Networking",
}


def _normalize(value: str) -> str:
    """Casefold + strip accents so searches are diacritic insensitive."""
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.casefold()


def categories() -> list[dict]:
    """All available categories with their label and item count."""
    return [
        {
            "category": slug,
            "label": CATEGORY_LABELS.get(slug, slug),
            "count": len(names),
        }
        for slug, names in THEMES.items()
    ]


def search(category: str | None = None, q: str = "", limit: int = 200) -> list[dict]:
    """Return themed names, optionally filtered by *category* and query *q*.

    Matching is case/accent insensitive; names that *start with* the query rank
    before names that merely contain it, so typing "tat" surfaces "Tatooine"
    first. An unknown category yields an empty list rather than an error so the
    UI degrades gracefully.
    """
    if category:
        slug = category.strip().lower()
        selected = {slug: THEMES[slug]} if slug in THEMES else {}
    else:
        selected = THEMES

    needle = _normalize(q or "").strip()
    starts: list[dict] = []
    contains: list[dict] = []
    for slug, names in selected.items():
        label = CATEGORY_LABELS.get(slug, slug)
        for name in names:
            if not needle:
                starts.append({"name": name, "category": slug, "label": label})
                continue
            hay = _normalize(name)
            if hay.startswith(needle):
                starts.append({"name": name, "category": slug, "label": label})
            elif needle in hay:
                contains.append({"name": name, "category": slug, "label": label})

    capped = max(1, min(int(limit or 200), 1000))
    return (starts + contains)[:capped]
