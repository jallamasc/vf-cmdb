"""FEAT-5: built-in catalogue of major worldwide airports (IATA codes).

Datacenter naming conventions across the industry use the IATA code of the
nearest major airport as the city component (``BOG``, ``FRA``, ``IAD`` …)
because it is short, globally unique and unambiguous. This module ships a
curated list of ~200 significant airports so the UI can offer a city
autocomplete without any external API call or extra database table.

Colombia is covered in depth (the primary deployment region) followed by the
main hubs of the Americas, Europe, the Middle East, Asia and Oceania.
"""
from __future__ import annotations

import unicodedata

# (iata, city, country, airport name)
_RAW: list[tuple[str, str, str, str]] = [
    # --- Colombia -----------------------------------------------------------
    ("BOG", "Bogota", "Colombia", "El Dorado International"),
    ("MDE", "Medellin", "Colombia", "Jose Maria Cordova International"),
    ("EOH", "Medellin", "Colombia", "Olaya Herrera"),
    ("CLO", "Cali", "Colombia", "Alfonso Bonilla Aragon International"),
    ("BAQ", "Barranquilla", "Colombia", "Ernesto Cortissoz International"),
    ("CTG", "Cartagena", "Colombia", "Rafael Nunez International"),
    ("BGA", "Bucaramanga", "Colombia", "Palonegro International"),
    ("PEI", "Pereira", "Colombia", "Matecana International"),
    ("ADZ", "San Andres", "Colombia", "Gustavo Rojas Pinilla International"),
    ("EYP", "Yopal", "Colombia", "El Alcaravan"),
    ("SMR", "Santa Marta", "Colombia", "Simon Bolivar International"),
    ("CUC", "Cucuta", "Colombia", "Camilo Daza International"),
    ("MZL", "Manizales", "Colombia", "La Nubia"),
    ("AXM", "Armenia", "Colombia", "El Eden International"),
    ("NVA", "Neiva", "Colombia", "Benito Salas"),
    ("IBE", "Ibague", "Colombia", "Perales"),
    ("VVC", "Villavicencio", "Colombia", "La Vanguardia"),
    ("PSO", "Pasto", "Colombia", "Antonio Narino"),
    ("PPN", "Popayan", "Colombia", "Guillermo Leon Valencia"),
    ("MTR", "Monteria", "Colombia", "Los Garzones"),
    ("VUP", "Valledupar", "Colombia", "Alfonso Lopez Pumarejo"),
    ("RCH", "Riohacha", "Colombia", "Almirante Padilla"),
    ("SJE", "San Jose del Guaviare", "Colombia", "Jorge Enrique Gonzalez"),
    ("LET", "Leticia", "Colombia", "Alfredo Vasquez Cobo International"),
    ("APO", "Apartado", "Colombia", "Antonio Roldan Betancourt"),
    ("TCO", "Tumaco", "Colombia", "La Florida"),
    ("BUN", "Buenaventura", "Colombia", "Gerardo Tobar Lopez"),
    ("FLA", "Florencia", "Colombia", "Gustavo Artunduaga Paredes"),
    ("UIB", "Quibdo", "Colombia", "El Carano"),
    ("TLU", "Tolu", "Colombia", "Golfo de Morrosquillo"),
    # --- United States ------------------------------------------------------
    ("ATL", "Atlanta", "United States", "Hartsfield-Jackson International"),
    ("DFW", "Dallas", "United States", "Dallas/Fort Worth International"),
    ("DEN", "Denver", "United States", "Denver International"),
    ("ORD", "Chicago", "United States", "O'Hare International"),
    ("LAX", "Los Angeles", "United States", "Los Angeles International"),
    ("JFK", "New York", "United States", "John F. Kennedy International"),
    ("EWR", "Newark", "United States", "Newark Liberty International"),
    ("LGA", "New York", "United States", "LaGuardia"),
    ("MIA", "Miami", "United States", "Miami International"),
    ("SEA", "Seattle", "United States", "Seattle-Tacoma International"),
    ("SFO", "San Francisco", "United States", "San Francisco International"),
    ("SJC", "San Jose", "United States", "Norman Y. Mineta International"),
    ("BOS", "Boston", "United States", "Logan International"),
    ("IAD", "Washington", "United States", "Washington Dulles International"),
    ("DCA", "Washington", "United States", "Ronald Reagan National"),
    ("BWI", "Baltimore", "United States", "Baltimore/Washington International"),
    ("PHX", "Phoenix", "United States", "Sky Harbor International"),
    ("IAH", "Houston", "United States", "George Bush Intercontinental"),
    ("MCO", "Orlando", "United States", "Orlando International"),
    ("LAS", "Las Vegas", "United States", "Harry Reid International"),
    ("CLT", "Charlotte", "United States", "Charlotte Douglas International"),
    ("MSP", "Minneapolis", "United States", "Minneapolis-Saint Paul International"),
    ("DTW", "Detroit", "United States", "Detroit Metropolitan"),
    ("PHL", "Philadelphia", "United States", "Philadelphia International"),
    ("SLC", "Salt Lake City", "United States", "Salt Lake City International"),
    ("SAN", "San Diego", "United States", "San Diego International"),
    ("TPA", "Tampa", "United States", "Tampa International"),
    ("PDX", "Portland", "United States", "Portland International"),
    ("STL", "Saint Louis", "United States", "Lambert International"),
    ("AUS", "Austin", "United States", "Austin-Bergstrom International"),
    ("BNA", "Nashville", "United States", "Nashville International"),
    ("MCI", "Kansas City", "United States", "Kansas City International"),
    ("RDU", "Raleigh", "United States", "Raleigh-Durham International"),
    ("CMH", "Columbus", "United States", "John Glenn International"),
    ("IND", "Indianapolis", "United States", "Indianapolis International"),
    ("CVG", "Cincinnati", "United States", "Cincinnati/Northern Kentucky"),
    ("PIT", "Pittsburgh", "United States", "Pittsburgh International"),
    ("MSY", "New Orleans", "United States", "Louis Armstrong International"),
    ("SAT", "San Antonio", "United States", "San Antonio International"),
    ("OMA", "Omaha", "United States", "Eppley Airfield"),
    ("BOI", "Boise", "United States", "Boise Airport"),
    ("ABQ", "Albuquerque", "United States", "Albuquerque International Sunport"),
    ("RNO", "Reno", "United States", "Reno-Tahoe International"),
    ("HNL", "Honolulu", "United States", "Daniel K. Inouye International"),
    ("ANC", "Anchorage", "United States", "Ted Stevens International"),
    ("SJU", "San Juan", "Puerto Rico", "Luis Munoz Marin International"),
    # --- Canada -------------------------------------------------------------
    ("YYZ", "Toronto", "Canada", "Toronto Pearson International"),
    ("YUL", "Montreal", "Canada", "Montreal-Trudeau International"),
    ("YVR", "Vancouver", "Canada", "Vancouver International"),
    ("YYC", "Calgary", "Canada", "Calgary International"),
    ("YEG", "Edmonton", "Canada", "Edmonton International"),
    ("YOW", "Ottawa", "Canada", "Ottawa Macdonald-Cartier International"),
    ("YWG", "Winnipeg", "Canada", "Winnipeg Richardson International"),
    ("YHZ", "Halifax", "Canada", "Halifax Stanfield International"),
    ("YQB", "Quebec City", "Canada", "Quebec City Jean Lesage International"),
    # --- Mexico, Central America & Caribbean --------------------------------
    ("MEX", "Mexico City", "Mexico", "Benito Juarez International"),
    ("NLU", "Mexico City", "Mexico", "Felipe Angeles International"),
    ("GDL", "Guadalajara", "Mexico", "Miguel Hidalgo International"),
    ("MTY", "Monterrey", "Mexico", "Monterrey International"),
    ("CUN", "Cancun", "Mexico", "Cancun International"),
    ("TIJ", "Tijuana", "Mexico", "Tijuana International"),
    ("QRO", "Queretaro", "Mexico", "Queretaro Intercontinental"),
    ("PTY", "Panama City", "Panama", "Tocumen International"),
    ("SJO", "San Jose", "Costa Rica", "Juan Santamaria International"),
    ("GUA", "Guatemala City", "Guatemala", "La Aurora International"),
    ("SAL", "San Salvador", "El Salvador", "El Salvador International"),
    ("TGU", "Tegucigalpa", "Honduras", "Toncontin International"),
    ("MGA", "Managua", "Nicaragua", "Augusto Cesar Sandino International"),
    ("BZE", "Belize City", "Belize", "Philip Goldson International"),
    ("HAV", "Havana", "Cuba", "Jose Marti International"),
    ("SDQ", "Santo Domingo", "Dominican Republic", "Las Americas International"),
    ("KIN", "Kingston", "Jamaica", "Norman Manley International"),
    ("POS", "Port of Spain", "Trinidad and Tobago", "Piarco International"),
    ("CUR", "Willemstad", "Curacao", "Curacao International"),
    ("AUA", "Oranjestad", "Aruba", "Queen Beatrix International"),
    # --- South America ------------------------------------------------------
    ("GRU", "Sao Paulo", "Brazil", "Guarulhos International"),
    ("CGH", "Sao Paulo", "Brazil", "Congonhas"),
    ("GIG", "Rio de Janeiro", "Brazil", "Galeao International"),
    ("BSB", "Brasilia", "Brazil", "Presidente Juscelino Kubitschek"),
    ("CNF", "Belo Horizonte", "Brazil", "Tancredo Neves International"),
    ("POA", "Porto Alegre", "Brazil", "Salgado Filho International"),
    ("REC", "Recife", "Brazil", "Guararapes International"),
    ("FOR", "Fortaleza", "Brazil", "Pinto Martins International"),
    ("CWB", "Curitiba", "Brazil", "Afonso Pena International"),
    ("MAO", "Manaus", "Brazil", "Eduardo Gomes International"),
    ("EZE", "Buenos Aires", "Argentina", "Ministro Pistarini International"),
    ("AEP", "Buenos Aires", "Argentina", "Jorge Newbery Airfield"),
    ("COR", "Cordoba", "Argentina", "Ingeniero Taravella International"),
    ("MDZ", "Mendoza", "Argentina", "El Plumerillo International"),
    ("SCL", "Santiago", "Chile", "Arturo Merino Benitez International"),
    ("LIM", "Lima", "Peru", "Jorge Chavez International"),
    ("CUZ", "Cusco", "Peru", "Alejandro Velasco Astete International"),
    ("UIO", "Quito", "Ecuador", "Mariscal Sucre International"),
    ("GYE", "Guayaquil", "Ecuador", "Jose Joaquin de Olmedo International"),
    ("CCS", "Caracas", "Venezuela", "Simon Bolivar International"),
    ("MVD", "Montevideo", "Uruguay", "Carrasco International"),
    ("ASU", "Asuncion", "Paraguay", "Silvio Pettirossi International"),
    ("VVI", "Santa Cruz", "Bolivia", "Viru Viru International"),
    ("LPB", "La Paz", "Bolivia", "El Alto International"),
    # --- Western Europe -----------------------------------------------------
    ("LHR", "London", "United Kingdom", "Heathrow"),
    ("LGW", "London", "United Kingdom", "Gatwick"),
    ("STN", "London", "United Kingdom", "Stansted"),
    ("MAN", "Manchester", "United Kingdom", "Manchester Airport"),
    ("EDI", "Edinburgh", "United Kingdom", "Edinburgh Airport"),
    ("GLA", "Glasgow", "United Kingdom", "Glasgow Airport"),
    ("BHX", "Birmingham", "United Kingdom", "Birmingham Airport"),
    ("DUB", "Dublin", "Ireland", "Dublin Airport"),
    ("ORK", "Cork", "Ireland", "Cork Airport"),
    ("CDG", "Paris", "France", "Charles de Gaulle"),
    ("ORY", "Paris", "France", "Orly"),
    ("MRS", "Marseille", "France", "Marseille Provence"),
    ("LYS", "Lyon", "France", "Lyon-Saint Exupery"),
    ("NCE", "Nice", "France", "Nice Cote d'Azur"),
    ("TLS", "Toulouse", "France", "Toulouse-Blagnac"),
    ("FRA", "Frankfurt", "Germany", "Frankfurt Airport"),
    ("MUC", "Munich", "Germany", "Munich Airport"),
    ("BER", "Berlin", "Germany", "Berlin Brandenburg"),
    ("DUS", "Dusseldorf", "Germany", "Dusseldorf Airport"),
    ("HAM", "Hamburg", "Germany", "Hamburg Airport"),
    ("STR", "Stuttgart", "Germany", "Stuttgart Airport"),
    ("CGN", "Cologne", "Germany", "Cologne Bonn"),
    ("AMS", "Amsterdam", "Netherlands", "Schiphol"),
    ("EIN", "Eindhoven", "Netherlands", "Eindhoven Airport"),
    ("BRU", "Brussels", "Belgium", "Brussels Airport"),
    ("LUX", "Luxembourg", "Luxembourg", "Luxembourg Findel"),
    ("MAD", "Madrid", "Spain", "Adolfo Suarez Madrid-Barajas"),
    ("BCN", "Barcelona", "Spain", "Josep Tarradellas El Prat"),
    ("VLC", "Valencia", "Spain", "Valencia Airport"),
    ("AGP", "Malaga", "Spain", "Malaga-Costa del Sol"),
    ("BIO", "Bilbao", "Spain", "Bilbao Airport"),
    ("LIS", "Lisbon", "Portugal", "Humberto Delgado"),
    ("OPO", "Porto", "Portugal", "Francisco Sa Carneiro"),
    ("FCO", "Rome", "Italy", "Leonardo da Vinci-Fiumicino"),
    ("MXP", "Milan", "Italy", "Malpensa"),
    ("LIN", "Milan", "Italy", "Linate"),
    ("VCE", "Venice", "Italy", "Marco Polo"),
    ("NAP", "Naples", "Italy", "Naples International"),
    ("BLQ", "Bologna", "Italy", "Guglielmo Marconi"),
    ("ZRH", "Zurich", "Switzerland", "Zurich Airport"),
    ("GVA", "Geneva", "Switzerland", "Geneva Airport"),
    ("VIE", "Vienna", "Austria", "Vienna International"),
    # --- Nordics & Eastern Europe -------------------------------------------
    ("ARN", "Stockholm", "Sweden", "Arlanda"),
    ("GOT", "Gothenburg", "Sweden", "Landvetter"),
    ("OSL", "Oslo", "Norway", "Gardermoen"),
    ("BGO", "Bergen", "Norway", "Bergen Flesland"),
    ("CPH", "Copenhagen", "Denmark", "Kastrup"),
    ("HEL", "Helsinki", "Finland", "Helsinki-Vantaa"),
    ("KEF", "Reykjavik", "Iceland", "Keflavik International"),
    ("WAW", "Warsaw", "Poland", "Chopin Airport"),
    ("KRK", "Krakow", "Poland", "John Paul II International"),
    ("PRG", "Prague", "Czechia", "Vaclav Havel"),
    ("BUD", "Budapest", "Hungary", "Ferenc Liszt International"),
    ("OTP", "Bucharest", "Romania", "Henri Coanda International"),
    ("SOF", "Sofia", "Bulgaria", "Sofia Airport"),
    ("BEG", "Belgrade", "Serbia", "Nikola Tesla"),
    ("ZAG", "Zagreb", "Croatia", "Franjo Tudman"),
    ("ATH", "Athens", "Greece", "Eleftherios Venizelos"),
    ("IST", "Istanbul", "Turkey", "Istanbul Airport"),
    ("SAW", "Istanbul", "Turkey", "Sabiha Gokcen"),
    ("KBP", "Kyiv", "Ukraine", "Boryspil International"),
    ("RIX", "Riga", "Latvia", "Riga International"),
    ("TLL", "Tallinn", "Estonia", "Lennart Meri"),
    ("VNO", "Vilnius", "Lithuania", "Vilnius Airport"),
    # --- Middle East & Africa -----------------------------------------------
    ("DXB", "Dubai", "United Arab Emirates", "Dubai International"),
    ("AUH", "Abu Dhabi", "United Arab Emirates", "Zayed International"),
    ("DOH", "Doha", "Qatar", "Hamad International"),
    ("RUH", "Riyadh", "Saudi Arabia", "King Khalid International"),
    ("JED", "Jeddah", "Saudi Arabia", "King Abdulaziz International"),
    ("KWI", "Kuwait City", "Kuwait", "Kuwait International"),
    ("BAH", "Manama", "Bahrain", "Bahrain International"),
    ("MCT", "Muscat", "Oman", "Muscat International"),
    ("TLV", "Tel Aviv", "Israel", "Ben Gurion"),
    ("AMM", "Amman", "Jordan", "Queen Alia International"),
    ("BEY", "Beirut", "Lebanon", "Rafic Hariri International"),
    ("CAI", "Cairo", "Egypt", "Cairo International"),
    ("CMN", "Casablanca", "Morocco", "Mohammed V International"),
    ("TUN", "Tunis", "Tunisia", "Carthage International"),
    ("ALG", "Algiers", "Algeria", "Houari Boumediene"),
    ("LOS", "Lagos", "Nigeria", "Murtala Muhammed International"),
    ("ABV", "Abuja", "Nigeria", "Nnamdi Azikiwe International"),
    ("ACC", "Accra", "Ghana", "Kotoka International"),
    ("NBO", "Nairobi", "Kenya", "Jomo Kenyatta International"),
    ("ADD", "Addis Ababa", "Ethiopia", "Bole International"),
    ("DAR", "Dar es Salaam", "Tanzania", "Julius Nyerere International"),
    ("JNB", "Johannesburg", "South Africa", "O.R. Tambo International"),
    ("CPT", "Cape Town", "South Africa", "Cape Town International"),
    ("DUR", "Durban", "South Africa", "King Shaka International"),
    ("MRU", "Port Louis", "Mauritius", "Sir Seewoosagur Ramgoolam"),
    # --- Asia ---------------------------------------------------------------
    ("SIN", "Singapore", "Singapore", "Changi"),
    ("HKG", "Hong Kong", "Hong Kong", "Hong Kong International"),
    ("NRT", "Tokyo", "Japan", "Narita International"),
    ("HND", "Tokyo", "Japan", "Haneda"),
    ("KIX", "Osaka", "Japan", "Kansai International"),
    ("NGO", "Nagoya", "Japan", "Chubu Centrair International"),
    ("ICN", "Seoul", "South Korea", "Incheon International"),
    ("GMP", "Seoul", "South Korea", "Gimpo International"),
    ("PEK", "Beijing", "China", "Beijing Capital International"),
    ("PKX", "Beijing", "China", "Daxing International"),
    ("PVG", "Shanghai", "China", "Pudong International"),
    ("SHA", "Shanghai", "China", "Hongqiao International"),
    ("CAN", "Guangzhou", "China", "Baiyun International"),
    ("SZX", "Shenzhen", "China", "Bao'an International"),
    ("CTU", "Chengdu", "China", "Tianfu International"),
    ("TPE", "Taipei", "Taiwan", "Taoyuan International"),
    ("BKK", "Bangkok", "Thailand", "Suvarnabhumi"),
    ("DMK", "Bangkok", "Thailand", "Don Mueang International"),
    ("KUL", "Kuala Lumpur", "Malaysia", "Kuala Lumpur International"),
    ("CGK", "Jakarta", "Indonesia", "Soekarno-Hatta International"),
    ("DPS", "Denpasar", "Indonesia", "Ngurah Rai International"),
    ("MNL", "Manila", "Philippines", "Ninoy Aquino International"),
    ("CEB", "Cebu", "Philippines", "Mactan-Cebu International"),
    ("SGN", "Ho Chi Minh City", "Vietnam", "Tan Son Nhat International"),
    ("HAN", "Hanoi", "Vietnam", "Noi Bai International"),
    ("DEL", "New Delhi", "India", "Indira Gandhi International"),
    ("BOM", "Mumbai", "India", "Chhatrapati Shivaji Maharaj International"),
    ("BLR", "Bangalore", "India", "Kempegowda International"),
    ("MAA", "Chennai", "India", "Chennai International"),
    ("HYD", "Hyderabad", "India", "Rajiv Gandhi International"),
    ("CCU", "Kolkata", "India", "Netaji Subhas Chandra Bose International"),
    ("KHI", "Karachi", "Pakistan", "Jinnah International"),
    ("CMB", "Colombo", "Sri Lanka", "Bandaranaike International"),
    ("DAC", "Dhaka", "Bangladesh", "Hazrat Shahjalal International"),
    ("KTM", "Kathmandu", "Nepal", "Tribhuvan International"),
    ("ALA", "Almaty", "Kazakhstan", "Almaty International"),
    ("TAS", "Tashkent", "Uzbekistan", "Islam Karimov International"),
    ("SVO", "Moscow", "Russia", "Sheremetyevo International"),
    ("DME", "Moscow", "Russia", "Domodedovo International"),
    ("LED", "Saint Petersburg", "Russia", "Pulkovo"),
    # --- Oceania ------------------------------------------------------------
    ("SYD", "Sydney", "Australia", "Kingsford Smith"),
    ("MEL", "Melbourne", "Australia", "Melbourne Airport"),
    ("BNE", "Brisbane", "Australia", "Brisbane Airport"),
    ("PER", "Perth", "Australia", "Perth Airport"),
    ("ADL", "Adelaide", "Australia", "Adelaide Airport"),
    ("CBR", "Canberra", "Australia", "Canberra Airport"),
    ("AKL", "Auckland", "New Zealand", "Auckland Airport"),
    ("WLG", "Wellington", "New Zealand", "Wellington International"),
    ("CHC", "Christchurch", "New Zealand", "Christchurch International"),
    ("NAN", "Nadi", "Fiji", "Nadi International"),
    ("PPT", "Papeete", "French Polynesia", "Faa'a International"),
    ("GUM", "Hagatna", "Guam", "Antonio B. Won Pat International"),
]

AIRPORTS: list[dict] = [
    {"iata": iata, "city": city, "country": country, "name": name}
    for iata, city, country, name in _RAW
]

# Fast exact lookup by IATA code.
BY_IATA: dict[str, dict] = {a["iata"]: a for a in AIRPORTS}


def _normalize(value: str) -> str:
    """Casefold + strip accents (so "Bogotá" matches "Bogota")."""
    decomposed = unicodedata.normalize("NFKD", value or "")
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.casefold().strip()


def countries() -> list[str]:
    """Sorted, de-duplicated list of every country in the catalogue.

    Phase 5 Task 30 (Req 25.1) — powers the "Country" selector that the City
    field now requires before it accepts any input.
    """
    return sorted({a["country"] for a in AIRPORTS})


def search(q: str = "", limit: int = 25, country: str = "") -> list[dict]:
    """Airports whose city, IATA code, country or name matches *q*.

    Ranking: exact IATA match first, then city prefix matches, then any other
    substring match. An empty query returns the head of the catalogue so the
    autocomplete can show suggestions before the user types.

    Phase 5 Task 30 (Req 25.2) — an optional *country* narrows the catalogue
    to that country (case/accent-insensitive exact match) before ranking, so
    the City field only ever offers cities that actually belong there.
    """
    needle = _normalize(q)
    capped = max(1, min(int(limit or 25), 200))
    pool = AIRPORTS
    if country:
        needle_country = _normalize(country)
        pool = [a for a in AIRPORTS if _normalize(a["country"]) == needle_country]
    if not needle:
        return pool[:capped]

    exact: list[dict] = []
    prefix: list[dict] = []
    other: list[dict] = []
    for airport in pool:
        city = _normalize(airport["city"])
        iata = airport["iata"].casefold()
        if iata == needle:
            exact.append(airport)
        elif city == needle or city.startswith(needle):
            prefix.append(airport)
        elif (
            needle in city
            or needle in iata
            or needle in _normalize(airport["country"])
            or needle in _normalize(airport["name"])
        ):
            other.append(airport)
    return (exact + prefix + other)[:capped]


def lookup_city(city: str, country: str = "") -> dict:
    """Resolve a city name to its primary IATA code.

    Returns ``{"city", "iata_code", "airport", "country", "alternatives"}``.
    ``iata_code`` is ``None`` when nothing matched. ``alternatives`` lists the
    other candidate airports (a city like Tokyo or London has several) so the
    caller can offer a choice instead of silently picking one.

    Phase 5 Task 30 (Req 25.2) — an optional *country* is forwarded to
    :func:`search` to scope the match.
    """
    matches = search(city, limit=200, country=country)
    if not matches:
        return {
            "city": city,
            "iata_code": None,
            "airport": None,
            "country": None,
            "alternatives": [],
        }
    best = matches[0]
    return {
        "city": best["city"],
        "iata_code": best["iata"],
        "airport": best["name"],
        "country": best["country"],
        "alternatives": matches[1:11],
    }
