/**
 * Build the species-model pack: one cute animated .glb per species known from
 * the campus — every iNaturalist species observed inside the campus box, plus
 * the curated guide trees — into public/model/, with a manifest.
 *
 * Sources, kept honest:
 *  - species list: cached iNaturalist species_counts sweep (script/data/
 *    inat-species/, fetched 2026-09-03) + web-forest/src/data.ts curated list.
 *    The AIS inventory (due 09-09) supersedes all of it when it lands.
 *  - colors: hand-written overrides for species whose real colors we know;
 *    everything else picks deterministically from tuned palette pools, so the
 *    long tail stays on-style without pretending to be observed data.
 *
 * Usage: node script/build-species-model.mjs [--only <code-substring>]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Kit, APP, LEAVES, TRUNKS, FLOWERS, FUNGI_CAPS, SHELLS, INSECTS, BIRDS, FURS, shade, pick } from "./species-model/kit.mjs";
import { fauna } from "./species-model/fauna.mjs";
import { flora } from "./species-model/flora.mjs";
import { species as curated } from "../src/data.ts";
import { auditGlb, groundOffset, FLYER } from "./audit-model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wf = join(here, "..");
const OUT = join(wf, "public", "model");
const DATA = join(here, "data", "inat-species");

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// ---------- load the iNat sweep ----------

const files = existsSync(DATA)
  ? readFileSync(join(DATA, "species-counts-2026-09-03.json"), "utf8")
  : null;
if (!files) throw new Error("run script/fetch-inat-species.mjs first");
const sweep = JSON.parse(files);
const taxaFile = JSON.parse(readFileSync(join(DATA, "ancestor-taxa-2026-09-03.json"), "utf8"));
const taxaById = new Map(taxaFile.taxa.map((t) => [t.id, t]));

const EXCLUDED = new Set(["homo sapiens"]);
const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const genusOf = (sci) => norm(sci).split(" ")[0].replace("×", "").trim() || norm(sci);

function contextFor(row) {
  const fams = [];
  let order = null;
  let cls = row.taxon.iconic_taxon_name;
  for (const id of row.taxon.ancestor_ids) {
    const t = taxaById.get(id);
    if (!t) continue;
    if (t.rank === "family") fams.push(t.name);
    if (t.rank === "order") order = t.name;
    if (t.rank === "class") cls = t.name;
  }
  return { fams, order, cls, genus: genusOf(row.taxon.name) };
}

// ---------- genus sets ----------

const TREE_GENUS = new Set(
  ("Pterocarpus Samanea Albizia Falcataria Senegalia Vachellia Sindora Intsia Afzelia Peltophorum Cassia Senna " +
    "Bauhinia Delonix Parkia Archidendron Adenanthera Pongamia Millettia Gliricidia Leucaena Tamarindus Sesbania " +
    "Ficus Artocarpus Mangifera Spondias Syzygium Psidium Eucalyptus Melaleuca Callistemon Swietenia Toona " +
    "Chukrasia Azadirachta Aglaia Calophyllum Terminalia Diospyros Barringtonia Araucaria Pinus Casuarina Moringa " +
    "Michelia Magnolia Canarium Dimocarpus Nephelium Sapindus Dracontomelon Dillenia Neolamarckia Millingtonia " +
    "Spathodea Tabebuia Radermachera Plumeria Alstonia Cerbera Ochrosia Mimusops Manilkara Palaquium Madhuca " +
    "Lithocarpus Castanopsis Quercus Celtis Trema Macaranga Homalanthus Endospermum Glochidion Putranjiva " +
    "Elaeocarpus Sloanea Symplocos Schima Eurya Saurauia Fagraea Neonauclea Adina Morinda Gmelina Tectona Vitex " +
    "Premna Bischofia Antidesma Aporusa Bridelia Mallotus Khaya Grevillea Polyalthia Sandoricum Lansium " +
    "Chrysophyllum Thevetia Olea Salix Flacourtia Casearia Clusia Cratoxylum Hypericum Vernonia Pluchea " +
    "Persea Cinnamomum Cryptocarya Litsea Beilschmiedia Ebenopsis Lysiloma Piscidia Guapira Andira Ormosia " +
    "Erythrina Hura Rapanea Embelia Ardisia Ilex Mastixia Sorbus Pyrus Malus Prunus Photinia Eriobotrya").split(" "),
);
const VINE_GENUS = new Set(
  ("Epipremnum Syngonium Scindapsus Philodendron Hedera Ipomoea Merremia Argyreia Operculina Cuscuta Mikania " +
    "Dolichandra Mansoa Pyrostegia Thunbergia Passiflora Cissus Cayratia Tetrastigma Ampelocissus Dioscorea " +
    "Pueraria Centrosema Clitoria Canavalia Vigna Macroptilium Mucuna Alsomitra Trichosanthes Momordica Coccinia " +
    "Luffa Lagenaria Cucurbita Cucumis Citrullus Benincasa Antigonon Piper Tinospora Stephania Cyclea Jasminum " +
    "Hoya Dischidia Cynanchum Tylophora Gymnema Cardiospermum Connarus Rourea Quisqualis Combretum Gnetum " +
    "Bougainvillea Basella Anredera Capparis Allamanda Dalechampia Solandra Stictocardia Turbinaina Rivea").split(" "),
);
const SHRUB_GENUS = new Set(
  ("Ixora Hibiscus Thespesia Abutilon Malvaviscus Codiaeum Excoecaria Acalypha Breynia Flueggea Jatropha Ricinus " +
    "Nerium Tabernaemontana Carissa Calotropis Lantana Duranta Clerodendrum Rotheca Holmskioldia Murraya Citrus " +
    "Clausena Glycosmis Triphasia Melastoma Clidemia Miconia Tibouchina Myrsine Maesa Ochna Gardenia Randia " +
    "Psychotria Pavetta Mussaenda Hamelia Crotalaria Indigofera Tephrosia Flemingia Calliandra Barleria " +
    "Graptophyllum Pseuderanthemum Aphelandra Justicia Crossandra Eranthemum Acanthus Russelia Coleus " +
    "Plectranthus Solenostemon Ocimum Orthosiphon Buddleja Cestrum Brunfelsia Lycianthes Capsicum Physalis " +
    "Datura Brugmansia Plumbago Ligustrum Osmanthus Pittosporum Euonymus Maytenus Gymnosporia Ziziphus " +
    "Sageretia Grewia Guettarda Erithalis Chiococca Desmanthus Chamaecrista Aeschynes Hoya Pereskia Chromolaena " +
    "Plumeria Schefflera Polyscias Osmoxylon").split(" "),
);
const AROID_GENUS = new Set(
  ("Dieffenbachia Caladium Aglaonema Alocasia Spathiphyllum Xanthosoma Colocasia Anthurium Monstera Homalomena " +
    "Schismatoglottis Amorphophallus Arisaema Pinellia Syngoniumcaladium Pistia Lemna Wolffia Spirodela").split(" "),
);
const CANE_GENUS = new Set("Dracaena Cordyline Yucca Beaucarnea Nolina Sansevieria Agave Aloe Furcraea Manfreda Proophea".split(" "));
const BAMBOO_GENUS = new Set("Bambusa Dendrocalamus Gigantochloa Schizostachyum Guadua Chusquea Melocanna Phyllostachys Dinochloa".split(" "));

/*
 * Second routing sweep, 2026-09-05. A visual review of all 449 plant models
 * found that `herb` was still a catch-all: 123 of its 278 members were not
 * herbs at all, and every one of them had a correct archetype that already
 * existed. These are the genera that were falling through, classified by what
 * the plant actually is. Enumerated from the manifest (206 distinct genera in
 * `herb`), not from a sample, so the pass is exhaustive rather than anecdotal.
 */
for (const g of ("Ceiba Lagerstroemia Hevea Theobroma Fraxinus Ulmus Aleurites Sterculia Acacia Handroanthus " +
  "Broussonetia Sonneratia Pachira Muntingia Morus Annona Coccoloba Machilus Laurus Pipturus Meryta " +
  "Citharexylum Pterocymbium Picea Kleinhovia Triplaris Monoon Cynometra Cenostigma Pometia Schizolobium " +
  "Xanthostemon Wendlandia Lucuma Styphnolobium Anthocleista Garcinia Averrhoa Nauclea Zanthoxylum Bergera " +
  "Cespedesia Adinandra Drypetes Streblus Ehretia Cascabela Abroma Melanolepis Hoheria").split(" ")) {
  TREE_GENUS.add(g.toLowerCase());
}
for (const g of ("Vitis Entada Parthenocissus Paederia Malaisia Causonis Distimake Muehlenbeckia Tarlmounia " +
  "Sicyos Abrus Schisandra Parsonsia Rhaphidophora Decalobanthus Gynochthodes Marsdenia Phanera " +
  "Tristellateia Galactia").split(" ")) {
  VINE_GENUS.add(g.toLowerCase());
}
for (const g of "Malpighia Leea Viburnum Wikstroemia Cotoneaster Spiraea Tecoma Buxus Megaskepasma Sanchezia Odontonema Pachystachys Strobilanthes Rauvolfia".split(" ")) {
  SHRUB_GENUS.add(g.toLowerCase());
}
for (const g of "Thaumatophyllum Typhonium Zamioculcas Acorus".split(" ")) {
  AROID_GENUS.add(g.toLowerCase());
}
/* Strappy-bladed monocots and bromeliads — a rosette of blades, not broad
   dicot leaves. CANE_GENUS is what routes to `rosetteBlades`. */
for (const g of "Crinum Hymenocallis Chlorophytum Trimezia Guzmania Billbergia Curculigo Xiphidium".split(" ")) {
  CANE_GENUS.add(g.toLowerCase());
}

/** Free-floating and marsh plants — there is a `waterPlant` builder. */
const WATER_GENUS = new Set(
  "ludwigia callitriche neptunia limnophila hydrocotyle pistia lemna wolffia spirodela".split(" "),
);

/** Caudex and leaf-succulents — there is a `succulent` builder. */
const SUCCULENT_GENUS = new Set("adenium haworthiopsis kalanchoe sedum crassula portulaca talinum".split(" "));

/** Cycads and screw-pines each have their own builder, unexercised until now. */
const CYCAD_GENUS = new Set(["cycas", "zamia", "dioon"]);
const PANDAN_GENUS = new Set(["pandanus", "freycinetia"]);

/**
 * genusOf() lowercases (it runs the name through norm()), but every set above
 * is written in the capitalised form a botanist would write. `TREE_GENUS.has
 * ("ficus")` was therefore always false, which silently disabled EVERY
 * genus-based route since the pack was first generated: Ficus, Mangifera and
 * the rest fell through to `herb`, so Balete — a landmark strangler fig on the
 * curated walk list — shipped as a small stalked herb.
 *
 * Folded once here rather than at each call site, and the originals are kept
 * so a capitalised lookup still works.
 */
for (const set of [TREE_GENUS, VINE_GENUS, SHRUB_GENUS, AROID_GENUS, CANE_GENUS, BAMBOO_GENUS]) {
  for (const g of [...set]) set.add(g.toLowerCase());
}
const PALM_FAM = new Set(["Arecaceae"]);
const FERN_FAM = new Set(
  ("Polypodiaceae Thelypteridaceae Pteridaceae Aspleniaceae Nephrolepidaceae Davalliaceae Tectariaceae Lygodiaceae " +
    "Selaginellaceae Lycopodiaceae Psilotaceae Ophioglossaceae Marattiaceae Cyatheaceae Dennstaedtiaceae " +
    "Athyriaceae Woodsiaceae Blechnaceae Hymenophyllaceae Lindsaeaceae Saccolomataceae Cibotiaceae Dicksoniaceae " +
    "Oleandraceae Tectariaceae Dryopteridaceae Lomariopsidaceae Oleandraceae").split(" "),
);
const WATER_FAM = new Set(
  ("Hydrocharitaceae Alismataceae Nymphaeaceae Cabombaceae Potamogetonaceae Ceratophyllaceae Haloragaceae " +
    "Lentibulariaceae Marsileaceae Salviniaceae Aponogetonaceae Juncaginaceae Cymodoceaceae Zosteraceae " +
    "Ruppiaceae Pontederiaceae Menyanthaceae Callitrichaceae").split(" "),
);
const GRASS_FAM = new Set("Poaceae Cyperaceae Juncaceae Restionaceae Typhaceae Eriocaulaceae Xyridaceae Thurniaceae Flagellariaceae Centrolepidaceae Mayacaceae".split(" "));
const MOSS_FAM = new Set(
  ("Pottiaceae Brachytheciaceae Grimmiaceae Hypnaceae Polytrichaceae Fissidentaceae Leucobryaceae Neckeraceae " +
    "Leskeaceae Hedwigiaceae Amblystegiaceae Rhabdoweisiaceae Plagiotheciaceae Bryaceae Mniaceae Calymperaceae " +
    "Entodontaceae Sematophyllaceae Meteoriaceae Lejeuneaceae Ricciaceae Aneuraceae Targioniaceae Dumortieraceae " +
    "Lepidoziaceae Cephaloziaceae Lophocoleaceae Scapaniaceae Aytoniaceae Conocephalaceae Corsiniaceae Cleveaceae " +
    "Marchantiaceae Pallaviciniaceae Dendrocerotaceae Notothyladaceae Anthocerotaceae Cladoniaceae Parmeliaceae " +
    "Physciaceae Teloschistaceae Lecanoraceae Ramalinaceae Graphidaceae Stereocaulaceae Peltigeraceae " +
    "Caliciaceae Pertusariaceae Trypetheliaceae Arthoniaceae Roccellaceae").split(" "),
);
const BANANA_FAM = new Set(["Musaceae", "Heliconiaceae", "Zingiberaceae", "Costaceae", "Cannaceae", "Strelitziaceae", "Lowiaceae"]);
const CACTUS_FAM = new Set(["Cactaceae"]);
const SUCCULENT_FAM = new Set(["Crassulaceae", "Talinaceae", "Portulacaceae", "Didiereaceae", "Aizoaceae"]);
const ORCHID_FAM = new Set(["Orchidaceae"]);

// ---------- per-species known overrides (real colors / shapes) ----------

const KNOWN = {
  // mammals
  "felis catus": { opt: { ears: "point", snout: "cat", tail: "curl" }, colors: { base: "#e08a3c" }, scale: 0.45 },
  "canis familiaris": { opt: { ears: "floppy", snout: "dog", tail: "rod", tongue: true }, colors: { base: "#c89a5e" }, scale: 0.5 },
  "ptenochirus jagorii": { opt: { ears: "big", tail: "bat-wing" }, colors: { base: "#5d4a3a" }, scale: 0.15 },

  // birds (41 species)
  "passer montanus": { opt: {}, colors: { base: "#8a5a33", head: "#6b4423", belly: "#e8d5b5", beak: "#2b2b30" }, scale: 0.15 },
  "corvus philippinus": { opt: { beak: "cone" }, colors: { base: "#2b2b30", beak: "#4a4a50" }, scale: 0.4 },
  "ardea coromanda": { opt: { neck: 0.34, legH: 0.3, beak: "needle" }, colors: { base: "#e8d8a8", beak: "#e8862a" }, scale: 0.55 },
  "ardea intermedia": { opt: { neck: 0.34, legH: 0.3, beak: "needle" }, colors: { base: "#f4f4ee", beak: "#e8b62a" }, scale: 0.55 },
  "egretta garzetta": { opt: { neck: 0.34, legH: 0.3, beak: "needle" }, colors: { base: "#f9f9f2", beak: "#2b2b30" }, scale: 0.5 },
  "nycticorax nycticorax": { opt: { neck: 0.3, legH: 0.24, beak: "needle" }, colors: { base: "#3a3a44", belly: "#f0ece0", head: "#2b2b33", beak: "#2b2b30" }, scale: 0.5 },
  "gallus gallus": { opt: { tail: "arcs", crest: "comb", plump: true }, colors: { base: "#b5452a", accentTail: "#2e5230" }, scale: 0.45 },
  "acridotheres cristatellus": { opt: {}, colors: { base: "#2f2f36", beak: "#f6b22d" }, scale: 0.22 },
  "aplonis panayensis": { opt: {}, colors: { base: "#25382e", beak: "#e8862a" }, scale: 0.18 },
  "oriolus chinensis": { opt: {}, colors: { base: "#e8b62a", wing: "#2b2b30", beak: "#c85a5a" }, scale: 0.24 },
  /* Collared Kingfisher - the white collar is literally its name, and was
     hard-coded in the builder. The palette owns it now. */
  "todiramphus chloris": { opt: { headR: 0.3, beak: "cone" }, colors: { base: "#2f8fb5", belly: "#f4f4ee", collar: "#f4f4ee", beak: "#2b2b30" }, scale: 0.2 },
  "lanius cristatus": { opt: { tail: "long" }, colors: { base: "#9a6a45", wing: "#5d3a24", belly: "#e8dcc0" }, scale: 0.18 },
  "lanius schach": { opt: { tail: "long" }, colors: { base: "#8a8a90", wing: "#2b2b30", belly: "#f4f4ee", head: "#5a5a62" }, scale: 0.2 },
  "geopelia striata": { opt: { plump: true }, colors: { base: "#b5a58a", belly: "#e0d5c0", beak: "#7a8a9a" }, scale: 0.16 },
  /* Rock pigeon: two black wing bars over blue-grey. */
  "columba livia": { opt: { plump: true }, colors: { base: "#7a8a9a", head: "#5a6a7a", beak: "#d8c8a8", wing: "#5a6675" }, scale: 0.24 },
  "yungipicus maculatus": { opt: { crest: "crest", beak: "chisel" }, colors: { base: "#d8d0c0", wing: "#2b2b30", head: "#d8d0c0" }, scale: 0.15 },
  "psilopogon haemacephalus": { opt: { plump: true }, colors: { base: "#4a9e46", head: "#e04a35", belly: "#e8e0c0" }, scale: 0.16 },
  "hirundo javanica": { opt: { tail: "fork", wingShape: "sickle" }, colors: { base: "#2e4a7a", belly: "#f0e8d8", head: "#8a4530" }, scale: 0.13 },
  "collocalia marginata": { opt: { wingShape: "sickle", legH: 0.04 }, colors: { base: "#3a3a42" }, scale: 0.1 },
  "cinnycerthia?": null,
  "cinnyris jugularis": { opt: { beak: "needle", headR: 0.22 }, colors: { base: "#8a9a4a", belly: "#f6d028", head: "#5a6a3a" }, scale: 0.1 },
  "pycnonotus goiavier": { opt: {}, colors: { base: "#8a7a5a", head: "#2b2b30", belly: "#f0e8d0" }, scale: 0.17 },
  "gerygone sulphurea": { opt: { headR: 0.22 }, colors: { base: "#9a9a90", belly: "#e8d04a" }, scale: 0.09 },
  "dicaeum pygmaeum": { opt: { headR: 0.28, plump: true }, colors: { base: "#8a7a5a" }, scale: 0.08 },
  "dicaeum australe": { opt: { headR: 0.28, plump: true }, colors: { base: "#2e3a5a", belly: "#d8352a" }, scale: 0.09 },
  "zosterops meyeni": { opt: {}, colors: { base: "#c8c060", belly: "#e8e0a0" }, scale: 0.09 },
  "motacilla cinerea": { opt: { tail: "long", legH: 0.14 }, colors: { base: "#9a9aa0", belly: "#f6d028", head: "#5a5a62" }, scale: 0.14 },
  "hierococcyx pectoralis": { opt: { tail: "long" }, colors: { base: "#7a8a7a", belly: "#e8e0d0" }, scale: 0.24 },
  "tachyspiza soloensis": { opt: { beak: "hook", tail: "long" }, colors: { base: "#8a9aa5", belly: "#e8e0d0" }, scale: 0.24 },
  "falco peregrinus": { opt: { beak: "hook", tail: "long" }, colors: { base: "#5a6a7a", belly: "#e8e0d0", head: "#2b2b30" }, scale: 0.3 },
  "amaurornis phoenicurus": { opt: {}, colors: { base: "#4a4a50", head: "#f0ece0", belly: "#f0ece0", beak: "#b5c84a" }, scale: 0.2 },
  "lalage nigra": { opt: {}, colors: { base: "#2b2b30", belly: "#f4f4ee" }, scale: 0.17 },
  "lonchura punctulata": { opt: { plump: true }, colors: { base: "#8a6a45", belly: "#c8a878", head: "#5d4430" }, scale: 0.11 },
  "artamus leucorynchus": { opt: {}, colors: { base: "#7a8aa0", belly: "#f4f4ee" }, scale: 0.15 },
  "muscicapa griseisticta": { opt: {}, colors: { base: "#8a8a88", belly: "#e8e4dc" }, scale: 0.12 },
  "phylloscopus borealis": { opt: { headR: 0.24 }, colors: { base: "#8aa04a", belly: "#e8e0c0" }, scale: 0.1 },
  "phylloscopus examinandus": { opt: { headR: 0.24 }, colors: { base: "#8aa04a", belly: "#e8e0c0" }, scale: 0.1 },
  "geokichla cinerea": { opt: {}, colors: { base: "#9a8a7a", belly: "#f0ece0" }, scale: 0.16 },
  "loriculus philippensis": { opt: { beak: "hook", tail: "long" }, colors: { base: "#3fae4e", head: "#d8352a" }, scale: 0.12 },
  "psittacula krameri": { opt: { beak: "hook", tail: "long" }, colors: { base: "#4aae5e", beak: "#c84a5a" }, scale: 0.3 },
  "rhipidura nigritorquis": { opt: { tail: "long" }, colors: { base: "#2b2b30", belly: "#f4f4ee", head: "#2b2b30" }, scale: 0.14 },

  // reptiles & amphibians
  /* Common sun skink: bronze-brown with orange flanks, not olive. */
  "eutropis multifasciata": { opt: { kind: "skink" }, colors: { base: "#8a6a3e", accent: "#d8792a" }, scale: 0.25 },
  "hemidactylus frenatus": { opt: { kind: "gecko" }, colors: { base: "#c8b598" }, scale: 0.11 },
  "hemidactylus brookii": { opt: { kind: "gecko" }, colors: { base: "#b5a088" }, scale: 0.11 },
  "gehara mutilata": null,
  "gehyra mutilata": { opt: { kind: "gecko" }, colors: { base: "#d0c0a8" }, scale: 0.1 },
  "varanus marmoratus": { opt: { kind: "monitor" }, colors: { base: "#3a3a34" }, scale: 1.1 },
  "indotyphlops braminus": { opt: { kind: "blind" }, colors: { base: "#8a7a6a" }, scale: 0.15 },
  "cyclocorus lineatus": { opt: {}, colors: { base: "#5d4a3a" }, scale: 0.5 },
  "tropidonophis spilogaster": { opt: {}, colors: { base: "#5a7a4a" }, scale: 0.7 },
  "rhinella marina": { opt: { warty: true }, colors: { base: "#a08256" }, scale: 0.12 },
  "polypedates leucomystax": { opt: {}, colors: { base: "#c8a870" }, scale: 0.06 },
  "eleutherodactylus planirostris": { opt: {}, colors: { base: "#8a7a5a" }, scale: 0.03 },
  "kaloula pulchra": { opt: {}, colors: { base: "#6a4a3a" }, scale: 0.06 },
  "occidozyga laevis": { opt: {}, colors: { base: "#7a8a5a" }, scale: 0.035 },
  "hylarana erythraea": { opt: {}, colors: { base: "#58a942" }, scale: 0.06 },

  // fishes
  "poecilia reticulata": { opt: { kind: "fancy" }, colors: { base: "#3a8ad8" }, scale: 0.05 },
  "carassius auratus": { opt: { kind: "fancy" }, colors: { base: "#ff8c2a" }, scale: 0.12 },
  "poecilia sphenops": { opt: {}, colors: { base: "#2b2b30" }, scale: 0.06 },
  "gymnocorymbus ternetzi": { opt: {}, colors: { base: "#8a8a90" }, scale: 0.05 },
  "pterophyllum scalare": { opt: { kind: "angel" }, colors: { base: "#c8c4b8" }, scale: 0.1 },
  "labidochromis caeruleus": { opt: {}, colors: { base: "#f6d028" }, scale: 0.09 },
  /* Green swordtail: olive body, red lateral stripe and sword — not solid red. */
  "xiphophorus hellerii": { opt: {}, colors: { base: "#7a8a52", accent: "#d8442e" }, scale: 0.07 },
  "oreochromis niloticus": { opt: {}, colors: { base: "#8a9aa0" }, scale: 0.25 },
  "pseudanthias hypselosoma": { opt: {}, colors: { base: "#e87a8a" }, scale: 0.08 },
  "trachinotus anak": { opt: {}, colors: { base: "#9ab0b8" }, scale: 0.5 },

  // mollusks
  "lissachatina fulica": { opt: { kind: "cone" }, colors: { base: "#8a5a33" }, scale: 0.18 },
  "bradybaena similaris": { opt: { kind: "round" }, colors: { base: "#a0784a" }, scale: 0.015 },
  "pomacea canaliculata": { opt: { kind: "round" }, colors: { base: "#b58a3a" }, scale: 0.07 },
  "telescopium telescopium": { opt: { kind: "cone" }, colors: { base: "#5d4430" }, scale: 0.09 },
  "subulina octona": { opt: { kind: "cone" }, colors: { base: "#b59878" }, scale: 0.012 },
  "laevicaulis alte": { opt: { kind: "slug" }, colors: { base: "#3a3a36" }, scale: 0.08 },
  "sarasinula plebeia": { opt: { kind: "slug" }, colors: { base: "#7a6a55" }, scale: 0.05 },
  "parmarion martensi": { opt: { kind: "semislug" }, colors: { base: "#8a7a5a" }, scale: 0.045 },

  // arachnids
  "leucauge fastigata": { opt: { kind: "orb" }, colors: { base: "#c8d8e8" }, scale: 0.03 },
  "leucauge argentina": { opt: { kind: "orb" }, colors: { base: "#d8e4ee" }, scale: 0.025 },
  "leucauge tessellata": { opt: { kind: "orb" }, colors: { base: "#c8d8c8" }, scale: 0.035 },
  "nephila pilipes": { opt: { kind: "orb" }, colors: { base: "#c8932a" }, scale: 0.07 },
  "trichonephila antipodiana": { opt: { kind: "orb" }, colors: { base: "#8a6a2a" }, scale: 0.06 },
  /* Kuhl's spiny orbweaver: cream abdomen, black markings, dark spines. It
     was rendering entirely white. */
  "gasteracantha kuhli": { opt: { kind: "spiny" }, colors: { base: "#efeade", dark: "#2b2b30", accent: "#c8332a" }, scale: 0.015 },
  "gasteracantha hecata": { opt: { kind: "spiny" }, colors: { base: "#e04a35" }, scale: 0.015 },
  "gasteracantha mediofusca": { opt: { kind: "spiny" }, colors: { base: "#e8b62a" }, scale: 0.012 },
  "thelacantha brevispina": { opt: { kind: "spiny" }, colors: { base: "#8a7a5a" }, scale: 0.02 },
  "heteropoda venatoria": { opt: { kind: "orb" }, colors: { base: "#a08256" }, scale: 0.05 },
  "plexippus petersi": { opt: { kind: "jumping" }, colors: { base: "#6a5a44" }, scale: 0.014 },
  "plexippus paykulli": { opt: { kind: "jumping" }, colors: { base: "#5a4a3a" }, scale: 0.014 },
  "hasarius adansoni": { opt: { kind: "jumping" }, colors: { base: "#3a3a42" }, scale: 0.01 },
  "menemerus bivittatus": { opt: { kind: "jumping" }, colors: { base: "#8a8a88" }, scale: 0.01 },
  "pardosa pseudoannulata": { opt: { kind: "orb" }, colors: { base: "#8a8a70" }, scale: 0.02 },
  "argiope aemula": { opt: { kind: "orb" }, colors: { base: "#c8c4a8" }, scale: 0.035 },
  "argiope catenulata": { opt: { kind: "orb" }, colors: { base: "#b8cc8a" }, scale: 0.03 },
  "chaerilus celebensis": { archetype: "scorpion", colors: { base: "#3a3430" }, scale: 0.05 },

  // myriapods, flatworms, crustaceans (iconic "Animalia")
  "anoplodesmus saussurii": { opt: { kind: "millipede" }, colors: { base: "#5a3a2a" }, scale: 0.05 },
  "trigoniulus corallinus": { opt: { kind: "millipede", banded: true }, colors: { base: "#c05a2a" }, scale: 0.05 },
  "orthomorpha coarctata": { opt: { kind: "millipede", banded: true }, colors: { base: "#7a4a3a" }, scale: 0.04 },
  "luzonomorpha picea": { opt: { kind: "millipede" }, colors: { base: "#2b2b30" }, scale: 0.05 },
  "leptogoniulus sorornus": { opt: { kind: "millipede", banded: true }, colors: { base: "#a0522d" }, scale: 0.06 },
  "oxidus gracilis": { opt: { kind: "millipede", banded: true }, colors: { base: "#8a4a3a" }, scale: 0.025 },
  /* "Blueleg" centipede — the fauna lane added a `leg` key for exactly this. */
  "rhysida longipes": { opt: { kind: "centipede" }, colors: { base: "#8a4a3a", leg: "#3a6ab5" }, scale: 0.1 },
  "scutigera coleoptrata": { opt: { kind: "house-centipede" }, colors: { base: "#b5a878" }, scale: 0.05 },
  "platydemus manokwari": { opt: {}, archetype: "flatworm", colors: { base: "#2b2b30" }, scale: 0.05 },
  "bipalium kewense": { opt: {}, archetype: "flatworm", colors: { base: "#d8c8a0" }, scale: 0.2 },
  "dolichoplana striata": { opt: {}, archetype: "flatworm", colors: { base: "#8a8a6a" }, scale: 0.12 },
  "diversibipalium tripartitum": { opt: {}, archetype: "flatworm", colors: { base: "#3a3430" }, scale: 0.08 },
  "sundathelphusa celer": { archetype: "crab", colors: { base: "#6a5a3a" }, scale: 0.05 },
  "nagurus nanus": { archetype: "pillbug", colors: { base: "#7a6a5a" }, scale: 0.008 },
  "tubifex tubifex": { archetype: "worm", colors: { base: "#c84a5a" }, scale: 0.03 },

  // insects — the ones people see every day
  "oecophylla smaragdina": { opt: { kind: "ant" }, colors: { base: "#e8a03a" }, scale: 0.012 },
  "odontomachus simillimus": { opt: { kind: "ant", mandibles: true }, colors: { base: "#7a3a2a" }, scale: 0.012 },
  "odontomachus haematodus": { opt: { kind: "ant", mandibles: true }, colors: { base: "#7a3a2a" }, scale: 0.012 },
  "paratrechina longicornis": { opt: { kind: "ant" }, colors: { base: "#2b2b30" }, scale: 0.006 },
  "odontoponera denticulata": { opt: { kind: "ant" }, colors: { base: "#2b2b30" }, scale: 0.01 },
  "carebara diversa": { opt: { kind: "ant" }, colors: { base: "#8a5a2a" }, scale: 0.006 },
  "solenopsis geminata": { opt: { kind: "ant" }, colors: { base: "#c87a2a" }, scale: 0.006 },
  "technomyrmex albipes": { opt: { kind: "ant" }, colors: { base: "#3a3a3e" }, scale: 0.005 },
  "trichomyrmex destructor": { opt: { kind: "ant" }, colors: { base: "#4a4038" }, scale: 0.006 },
  "monomorium floricola": { opt: { kind: "ant" }, colors: { base: "#2b2b30" }, scale: 0.004 },
  /* Ghost Ant: pale translucent body, DARK head — the name is the pattern. */
  "tapinoma melanocephalum": { opt: { kind: "ant" }, colors: { base: "#d8cfc0", head: "#2b2b30" }, scale: 0.004 },
  "anoplolepis gracilipes": { opt: { kind: "ant" }, colors: { base: "#d8c878" }, scale: 0.01 },
  "apis dorsata": { opt: { kind: "bee" }, colors: { base: "#e8b62a" }, scale: 0.02 },
  "apis cerana": { opt: { kind: "bee" }, colors: { base: "#d8a02a" }, scale: 0.013 },
  /* Greater banded hornet: yellow-orange gaster bands. Without an authored
     accent the bands came out salmon from the derived pool. */
  "vespa tropica": { opt: { kind: "hornet" }, colors: { base: "#e8b62a", accent: "#e07c1a", dark: "#2b2b30" }, scale: 0.03 },
  /* Black hornet with an orange abdomen — was rendering pink. */
  "vespa luctuosa": { opt: { kind: "hornet" }, colors: { base: "#2b2b30", accent: "#e8862a", dark: "#1a1a1e" }, scale: 0.025 },
  "xylocopa latipes": { opt: { kind: "bee" }, colors: { base: "#2b2b30" }, scale: 0.025 },
  "hypolimnas bolina": { opt: { kind: "butterfly", spots: true }, colors: { base: "#2b2b52" }, scale: 0.08 },
  "hypolimnas misippus": { opt: { kind: "butterfly", spots: true }, colors: { base: "#2b2b30" }, scale: 0.07 },
  "junonia hedonia": { opt: { kind: "butterfly" }, colors: { base: "#a06a2a" }, scale: 0.07 },
  "junonia lemonias": { opt: { kind: "butterfly" }, colors: { base: "#a07a3a" }, scale: 0.06 },
  "junonia orithya": { opt: { kind: "butterfly" }, colors: { base: "#2a4ac8" }, scale: 0.06 },
  "ypthima stellera": { opt: { kind: "butterfly" }, colors: { base: "#b5a582" }, scale: 0.04 },
  "ypthima sempera": { opt: { kind: "butterfly" }, colors: { base: "#b5a582" }, scale: 0.035 },
  "ypthima baldus": { opt: { kind: "butterfly" }, colors: { base: "#b5a582" }, scale: 0.04 },
  "melanitis leda": { opt: { kind: "butterfly" }, colors: { base: "#6a5a3a" }, scale: 0.07 },
  "mycalesis mineus": { opt: { kind: "butterfly" }, colors: { base: "#7a6a4a" }, scale: 0.04 },
  "leptosia nina": { opt: { kind: "butterfly" }, colors: { base: "#f4f4ee" }, scale: 0.035 },
  "papilio alphenor": { opt: { kind: "butterfly" }, colors: { base: "#2b2b30" }, scale: 0.09 },
  "papilio demoleus": { opt: { kind: "butterfly" }, colors: { base: "#c8b848" }, scale: 0.08 },
  "papilio deiphobus": { opt: { kind: "butterfly" }, colors: { base: "#2b2b30" }, scale: 0.09 },
  "papilio clytia": { opt: { kind: "butterfly" }, colors: { base: "#4a4438" }, scale: 0.09 },
  /* Tailed Jay: black wings with green SPOTS, not solid green. */
  "graphium agamemnon": { opt: { kind: "butterfly" }, colors: { base: "#22242a", accent: "#5cc46a" }, scale: 0.08 },
  "graphium sarpedon": { opt: { kind: "butterfly" }, colors: { base: "#2b7ab5" }, scale: 0.08 },
  "troides aeacus": { opt: { kind: "butterfly" }, colors: { base: "#2b2b30", accent: "#e8b62a" }, scale: 0.13 },
  "troides rhadamantus": { opt: { kind: "butterfly" }, colors: { base: "#2b2b30", accent: "#e8c93a" }, scale: 0.12 },
  "troides magellanus": { opt: { kind: "butterfly" }, colors: { base: "#2b2b30", accent: "#e8a03a" }, scale: 0.13 },
  "eurema hecabe": { opt: { kind: "butterfly" }, colors: { base: "#f6d028" }, scale: 0.04 },
  "eurema blanda": { opt: { kind: "butterfly" }, colors: { base: "#f0c838" }, scale: 0.04 },
  "catopsilia pomona": { opt: { kind: "butterfly" }, colors: { base: "#e8e8d0" }, scale: 0.07 },
  "cepora aspasia": { opt: { kind: "butterfly" }, colors: { base: "#f6e04a" }, scale: 0.05 },
  "delias hyparete": { opt: { kind: "butterfly" }, colors: { base: "#f4f4ee" }, scale: 0.06 },
  "delias henningia": { opt: { kind: "butterfly" }, colors: { base: "#f0e8e0" }, scale: 0.07 },
  "pareronia boebera": { opt: { kind: "butterfly" }, colors: { base: "#d8e4e8" }, scale: 0.07 },
  "euploea mulciber": { opt: { kind: "butterfly" }, colors: { base: "#3a3a52" }, scale: 0.08 },
  "ideopsis juventa": { opt: { kind: "butterfly" }, colors: { base: "#e8e0d0" }, scale: 0.07 },
  "danaid?": null,
  "zizula hylax": { opt: { kind: "butterfly" }, colors: { base: "#8a9ad8" }, scale: 0.02 },
  "zizina otis": { opt: { kind: "butterfly" }, colors: { base: "#9aa8d8" }, scale: 0.022 },
  "prosotas dubiosa": { opt: { kind: "butterfly" }, colors: { base: "#8a9ac8" }, scale: 0.022 },
  "catochrysops strabo": { opt: { kind: "butterfly" }, colors: { base: "#98a8d0" }, scale: 0.025 },
  "catopyrops ancyra": { opt: { kind: "butterfly" }, colors: { base: "#90a0c8" }, scale: 0.025 },
  "rapala caerulescens": { opt: { kind: "butterfly" }, colors: { base: "#6a8ac8" }, scale: 0.03 },
  "appias libythea": { opt: { kind: "butterfly" }, colors: { base: "#f0ece0" }, scale: 0.05 },
  "gandaca harina": { opt: { kind: "butterfly" }, colors: { base: "#f6e88a" }, scale: 0.045 },
  "phalanta phalantha": { opt: { kind: "butterfly" }, colors: { base: "#e8a03a" }, scale: 0.055 },
  "cyrestis maenalis": { opt: { kind: "butterfly" }, colors: { base: "#e8e4dc" }, scale: 0.06 },
  "doleschallia bisaltide": { opt: { kind: "butterfly" }, colors: { base: "#a06a2a" }, scale: 0.07 },
  "phaedyma columella": { opt: { kind: "butterfly" }, colors: { base: "#4a4438" }, scale: 0.06 },
  "athyma kasa": { opt: { kind: "butterfly" }, colors: { base: "#3a3830" }, scale: 0.06 },
  "eriboia lampedo": { opt: { kind: "butterfly" }, colors: { base: "#8a8a7a" }, scale: 0.07 },
  "lasippa illigera": { opt: { kind: "butterfly" }, colors: { base: "#c87a3a" }, scale: 0.04 },
  "taractrocera luzonensis": { opt: { kind: "skipper" }, colors: { base: "#b5a578" }, scale: 0.03 },
  "borbo cinnara": { opt: { kind: "skipper" }, colors: { base: "#a89868" }, scale: 0.035 },
  "notocrypta curvifascia": { opt: { kind: "skipper" }, colors: { base: "#2b2b30" }, scale: 0.04 },
  "suastus gremius": { opt: { kind: "skipper" }, colors: { base: "#8a7a55" }, scale: 0.03 },
  "lyssa zampa": { opt: { kind: "moth" }, colors: { base: "#8a7a6a" }, scale: 0.12 },
  /* One of the largest moths on earth, ~25 cm across. It was shipping at
     micromoth size because this scale swamped the builder's own giant flag. */
  "attacus lorquinii": { opt: { kind: "moth" }, colors: { base: "#a06a3a", accent: "#e8d5b5" }, scale: 0.26 },
  "theretra oldenlandiae": { opt: { kind: "hawk" }, colors: { base: "#7a6a55" }, scale: 0.07 },
  "hippotion celerio": { opt: { kind: "hawk" }, colors: { base: "#8a6a5a" }, scale: 0.06 },
  "daphnis nerii": { opt: { kind: "hawk" }, colors: { base: "#5a8a5a" }, scale: 0.07 },
  "daphnis hypothous": { opt: { kind: "hawk" }, colors: { base: "#3a7a6a" }, scale: 0.07 },
  "agrius convolvuli": { opt: { kind: "hawk" }, colors: { base: "#6a6255" }, scale: 0.07 },
  /* Nudged one byte off FLOWERS[3]. The builder now rejects an accent that is
     byte-identical to a derived-pool colour, and these two were the one
     legitimate collision - surviving only via a hard-coded genus exemption. */
  "amata huebneri": { opt: { kind: "moth" }, colors: { base: "#2b2b30", accent: "#f6b12c" }, scale: 0.035 },
  "amata polymita": { opt: { kind: "moth" }, colors: { base: "#2b2b30", accent: "#f6b12c" }, scale: 0.035 },
  "creatobotis?": null,
  "creatogenos?": null,
  "asota heliconia": { opt: { kind: "moth" }, colors: { base: "#8a7a55" }, scale: 0.06 },
  "asota caricae": { opt: { kind: "moth" }, colors: { base: "#9a8a5a" }, scale: 0.06 },
  "asota plana": { opt: { kind: "moth" }, colors: { base: "#8a8a5a" }, scale: 0.055 },
  "eudocima phalonia": { opt: { kind: "moth" }, colors: { base: "#7a6a5a" }, scale: 0.07 },
  "eudocima cocalus": { opt: { kind: "moth" }, colors: { base: "#8a9a6a" }, scale: 0.07 },
  "ophthalmis lincea": { opt: { kind: "moth" }, colors: { base: "#2b2b30", accent: "#e8b62a" }, scale: 0.06 },
  "phauda flammans": { opt: { kind: "moth" }, colors: { base: "#e06030" }, scale: 0.03 },
  "orgyia postica": { opt: { kind: "moth" }, colors: { base: "#8a6a4a" }, scale: 0.025 },
  "olene mendosa": { opt: { kind: "moth" }, colors: { base: "#c8b598" }, scale: 0.03 },
  "dasychira chekiangensis": { opt: { kind: "moth" }, colors: { base: "#a89878" }, scale: 0.035 },
  "lymantria lunata": { opt: { kind: "moth" }, colors: { base: "#e8dcc8" }, scale: 0.04 },
  "spodoptera litura": { opt: { kind: "moth" }, colors: { base: "#7a6a4a" }, scale: 0.04 },
  "mocis frugalis": { opt: { kind: "moth" }, colors: { base: "#a89a6a" }, scale: 0.04 },
  /* The yellow underwing is the field mark and was absent. */
  "thyas coronata": { opt: { kind: "moth" }, colors: { base: "#5a5a6a", hindwing: "#e8b62a" }, scale: 0.06 },
  "hulodes caranea": { opt: { kind: "moth" }, colors: { base: "#6a5a4a" }, scale: 0.06 },
  "bocana manifestalis": { opt: { kind: "moth" }, colors: { base: "#8a7a6a" }, scale: 0.035 },
  "gesonia obeditalis": { opt: { kind: "moth" }, colors: { base: "#9a8a7a" }, scale: 0.025 },
  "rhesala imparata": { opt: { kind: "moth" }, colors: { base: "#8a8a7a" }, scale: 0.025 },
  "rhesala moestalis": { opt: { kind: "moth" }, colors: { base: "#8a8a7a" }, scale: 0.02 },
  "eublemma accedens": { opt: { kind: "moth" }, colors: { base: "#c88a5a" }, scale: 0.02 },
  "spoladea recurvalis": { opt: { kind: "moth" }, colors: { base: "#3a3430" }, scale: 0.025 },
  "maruca vitrata": { opt: { kind: "moth" }, colors: { base: "#c8b898" }, scale: 0.025 },
  "adoxophyes privatana": { opt: { kind: "moth" }, colors: { base: "#a89868" }, scale: 0.015 },
  "dudua aprobola": { opt: { kind: "moth" }, colors: { base: "#a89868" }, scale: 0.015 },
  "phasereoa?": null,
  "psilogramma discistriga": { opt: { kind: "hawk" }, colors: { base: "#7a7a6a" }, scale: 0.07 },
  "eumeta variegata": { opt: { kind: "moth" }, colors: { base: "#8a7a5a" }, scale: 0.04 },
  "thosea sinensis": { opt: { kind: "moth" }, colors: { base: "#8a9a5a" }, scale: 0.025 },
  "orvasca subnotata": { opt: { kind: "moth" }, colors: { base: "#c8b598" }, scale: 0.02 },
  "xanthetis luzonica": { opt: { kind: "moth" }, colors: { base: "#e8dcc0" }, scale: 0.03 },
  /* Red costa on a white moth. */
  "aloa lactinea": { opt: { kind: "moth" }, colors: { base: "#f4f4ee", accent: "#d8352a" }, scale: 0.045 },
  "spilosoma elmagna": { opt: { kind: "moth" }, colors: { base: "#f6f2e8" }, scale: 0.035 },
  "lebeda nobilis": { opt: { kind: "moth" }, colors: { base: "#8a7a5a" }, scale: 0.06 },
  "eupterote?": null,
  "neurothemis terminata": { opt: { kind: "dragonfly" }, colors: { base: "#d84a30" }, scale: 0.05 },
  "neurothemis ramburii": { opt: { kind: "dragonfly" }, colors: { base: "#d85a38" }, scale: 0.045 },
  "diplacodes trivialis": { opt: { kind: "dragonfly" }, colors: { base: "#3a9ad8" }, scale: 0.035 },
  "orthetrum serapia": { opt: { kind: "dragonfly" }, colors: { base: "#3a8ad8" }, scale: 0.045 },
  "pantala flavescens": { opt: { kind: "dragonfly" }, colors: { base: "#e8a03a" }, scale: 0.045 },
  "tholymis tillarga": { opt: { kind: "dragonfly" }, colors: { base: "#c87a3a" }, scale: 0.045 },
  "lathrecista asiatica": { opt: { kind: "dragonfly" }, colors: { base: "#d84a50" }, scale: 0.04 },
  "diplacina braueri": { opt: { kind: "dragonfly" }, colors: { base: "#3a8ad8" }, scale: 0.035 },
  "pseudagrion pilidorsum": { opt: { kind: "damselfly" }, colors: { base: "#d84a5a" }, scale: 0.035 },
  "agriocnemis femina": { opt: { kind: "damselfly" }, colors: { base: "#5aa858" }, scale: 0.02 },
  /* Oriental latrine fly is metallic blue-green, not tan. */
  "chrysomya megacephala": { opt: { kind: "fly" }, colors: { base: "#2f7a6a", dark: "#1d4f46" }, scale: 0.012 },
  "musca domestica": { opt: { kind: "fly" }, colors: { base: "#4a4a48" }, scale: 0.01 },
  "hermetia illucens": { opt: { kind: "fly" }, colors: { base: "#2b2b30" }, scale: 0.015 },
  "hermetia sexmaculata": { opt: { kind: "fly" }, colors: { base: "#2b2b30" }, scale: 0.014 },
  "lucilia sericata": { opt: { kind: "fly" }, colors: { base: "#4ab5a0" }, scale: 0.011 },
  "lucilia coeruleiviridis": { opt: { kind: "fly" }, colors: { base: "#3aa5a0" }, scale: 0.011 },
  "lucilia porphyrina": { opt: { kind: "fly" }, colors: { base: "#8a5aa0" }, scale: 0.011 },
  "chrysomya?": null,
  "aedes albopictus": { opt: { kind: "mosquito" }, colors: { base: "#2b2b30" }, scale: 0.008 },
  "aedes aegypti": { opt: { kind: "mosquito" }, colors: { base: "#2b2b30" }, scale: 0.008 },
  "culex pipiens": { opt: { kind: "mosquito" }, colors: { base: "#5a5a58" }, scale: 0.008 },
  "bactrocera dorsalis": { opt: { kind: "fly" }, colors: { base: "#c86a3a" }, scale: 0.01 },
  "bactrocera cucurbitae": { opt: { kind: "fly" }, colors: { base: "#c87a3a" }, scale: 0.01 },
  "drosophila melanogaster": { opt: { kind: "fly" }, colors: { base: "#c8a05a" }, scale: 0.004 },
  "drosophila repleta": { opt: { kind: "fly" }, colors: { base: "#b59868" }, scale: 0.005 },
  "mimegralla albimana": { opt: { kind: "fly" }, colors: { base: "#2b2b30" }, scale: 0.012 },
  "toxonevra superba": { opt: { kind: "fly" }, colors: { base: "#c8a03a" }, scale: 0.012 },
  "homoneura unguiculata": { opt: { kind: "fly" }, colors: { base: "#e8c85a" }, scale: 0.008 },
  "homoneura discoglauca": { opt: { kind: "fly" }, colors: { base: "#d8c85a" }, scale: 0.008 },
  "nephrotoma flavipalpis": { opt: { kind: "crane" }, colors: { base: "#c8b590" }, scale: 0.025 },
  "symplecta pilipes": { opt: { kind: "crane" }, colors: { base: "#b5a890" }, scale: 0.015 },
  "clogmia albipunctata": { opt: { kind: "mothfly" }, colors: { base: "#b5b0a5" }, scale: 0.005 },
  "ischiodon scutellaris": { opt: { kind: "hover" }, colors: { base: "#e8b62a" }, scale: 0.012 },
  "dideopsis aegrota": { opt: { kind: "hover" }, colors: { base: "#e8b62a" }, scale: 0.012 },
  "macrotermes gilvus": { opt: { kind: "termite" }, colors: { base: "#d8b578" }, scale: 0.012 },
  "pseudoxya diminuta": { opt: { kind: "grasshopper" }, colors: { base: "#5aa845" }, scale: 0.03 },
  "melicodes tenebrosus": { opt: { kind: "grasshopper" }, colors: { base: "#4a4a44" }, scale: 0.07 },
  "aiolopus thalassinus": { opt: { kind: "grasshopper" }, colors: { base: "#5a9a58" }, scale: 0.04 },
  "attractomorpha similis": { opt: { kind: "grasshopper" }, colors: { base: "#7aa85a" }, scale: 0.04 },
  "attractomorpha sinensis": { opt: { kind: "grasshopper" }, colors: { base: "#8ab06a" }, scale: 0.04 },
  "conoceplalus?": null,
  "conocephalus vestitus": { opt: { kind: "katydid" }, colors: { base: "#6ab04a" }, scale: 0.04 },
  "holochlora japonica": { opt: { kind: "katydid" }, colors: { base: "#58a845" }, scale: 0.06 },
  "ellipes minuta": { opt: { kind: "cricket" }, colors: { base: "#8a7a5a" }, scale: 0.015 },
  "polionemobius taprobanensis": { opt: { kind: "cricket" }, colors: { base: "#6a5a44" }, scale: 0.015 },
  "xya japonica": { opt: { kind: "cricket" }, colors: { base: "#7a6a4a" }, scale: 0.012 },
  "orientopsaltria fuliginosa": { opt: { kind: "cicada" }, colors: { base: "#4a5a44" }, scale: 0.05 },
  "dysdercus cingulatus": { opt: { kind: "bug" }, colors: { base: "#e04a35" }, scale: 0.015 },
  "physomerus grossipes": { opt: { kind: "bug" }, colors: { base: "#8a6a3a" }, scale: 0.02 },
  "plautia stali": { opt: { kind: "bug" }, colors: { base: "#5a8a44" }, scale: 0.015 },
  "eysarcoris guttigerus": { opt: { kind: "bug" }, colors: { base: "#3a4a3a" }, scale: 0.01 },
  "brachyplatys subaeneus": { opt: { kind: "bug" }, colors: { base: "#2b3a44" }, scale: 0.01 },
  "leptocorisa oratoria": { opt: { kind: "bug" }, colors: { base: "#a89848" }, scale: 0.02 },
  "charagochilus longicornis": { opt: { kind: "bug" }, colors: { base: "#2b3a44" }, scale: 0.008 },
  "corythucha juglandis": { opt: { kind: "bug" }, colors: { base: "#e8e4d8" }, scale: 0.006 },
  "ectrychotes haematogaster": { opt: { kind: "bug" }, colors: { base: "#2b2b30" }, scale: 0.018 },
  "euagoras plagiatus": { opt: { kind: "bug" }, colors: { base: "#2b2b30" }, scale: 0.018 },
  "ectomocoris elegans": { opt: { kind: "bug" }, colors: { base: "#2b2b30" }, scale: 0.02 },
  "hemisphaerius coccinelloides": { opt: { kind: "bug" }, colors: { base: "#d84a5a" }, scale: 0.01 },
  "macharota?": null,
  "machaerota ensifera": { opt: { kind: "bug" }, colors: { base: "#c84a2a" }, scale: 0.015 },
  "peregrinus maidis": { opt: { kind: "bug" }, colors: { base: "#c8b888" }, scale: 0.008 },
  "ceroplastes sinensis": { opt: { kind: "bug" }, colors: { base: "#8a5a3a" }, scale: 0.008 },
  "hierodula patellifera": { archetype: "mantis", colors: { base: "#58a845" }, scale: 0.08 },
  "tropidomantis tenera": { archetype: "mantis", colors: { base: "#6ab855" }, scale: 0.02 },
  "periplaneta americana": { opt: { kind: "roach" }, archetype: "blattodea", colors: { base: "#8a4a2a" }, scale: 0.04 },
  "pycnoscelus indicus": { opt: { kind: "roach" }, archetype: "blattodea", colors: { base: "#3a3a34" }, scale: 0.03 },
  "pycnoscelus surinamensis": { opt: { kind: "roach" }, archetype: "blattodea", colors: { base: "#4a4038" }, scale: 0.028 },
  "supella longipalpa": { opt: { kind: "roach" }, archetype: "blattodea", colors: { base: "#a87848" }, scale: 0.02 },
  "blattella?": null,
  "euborellia annulata": { archetype: "dermaptera", colors: { base: "#3a3430" }, scale: 0.025 },
  "euborellia philippinensis": { archetype: "dermaptera", colors: { base: "#4a4038" }, scale: 0.025 },
  "oryctes rhinoceros": { opt: { kind: "beetle", horn: true }, colors: { base: "#3a3430" }, scale: 0.045 },
  "xylotrupes philippinensis": { opt: { kind: "beetle", horn: true }, colors: { base: "#2b2b30" }, scale: 0.045 },
  "propalea?": null,
  "propylea japonica": { opt: { kind: "beetle", ladybird: true }, colors: { base: "#e8b62a" }, scale: 0.008 },
  "coccinella transversalis": { opt: { kind: "beetle", ladybird: true }, colors: { base: "#e04a35" }, scale: 0.008 },
  "henosepilachna vigintioctomaculata": { opt: { kind: "beetle", ladybird: true }, colors: { base: "#c86a2a" }, scale: 0.01 },
  "protaetia philippensis": { opt: { kind: "beetle" }, colors: { base: "#3a7a5a" }, scale: 0.035 },
  "protaetia ferruginea": { opt: { kind: "beetle" }, colors: { base: "#8a5a3a" }, scale: 0.035 },
  "chrysodema dalmanni": { opt: { kind: "beetle" }, colors: { base: "#3a9a6a" }, scale: 0.03 },
  "holotrichia bipunctata": { opt: { kind: "beetle" }, colors: { base: "#7a5a3a" }, scale: 0.02 },
  "anomala pallida": { opt: { kind: "beetle" }, colors: { base: "#c8a05a" }, scale: 0.02 },
  "aulacophora indica": { opt: { kind: "beetle" }, colors: { base: "#e8b62a" }, scale: 0.01 },
  "cassida circumdata": { opt: { kind: "beetle" }, colors: { base: "#5ab58a" }, scale: 0.01 },
  "aethina tumida": { opt: { kind: "beetle" }, colors: { base: "#3a3430" }, scale: 0.008 },
  "eucorynus crassicornis": { opt: { kind: "beetle" }, colors: { base: "#6a5a3a" }, scale: 0.02 },
  "rhytiphora bankii": { opt: { kind: "beetle", longhorn: true }, colors: { base: "#8a7a5a" }, scale: 0.025 },
  "epepeotes ambigenus": { opt: { kind: "beetle", longhorn: true }, colors: { base: "#4a4038" }, scale: 0.03 },
  "gonocephalum?": null,
  "sceliphron madraspatanum": { opt: { kind: "wasp" }, colors: { base: "#2b2b30" }, scale: 0.025 },
  "phimenes curvatus": { opt: { kind: "wasp" }, colors: { base: "#e8b62a", dark: "#2b2b30" }, scale: 0.025 },
  "ropalidia flavobrunnea": { opt: { kind: "wasp" }, colors: { base: "#c89a4a" }, scale: 0.018 },
  "ropalidia stigma": { opt: { kind: "wasp" }, colors: { base: "#c89a4a" }, scale: 0.018 },
  "scolia superciliaris": { opt: { kind: "wasp" }, colors: { base: "#2b2b30" }, scale: 0.03 },
  "scolia clypeata": { opt: { kind: "wasp" }, colors: { base: "#2b2b30" }, scale: 0.028 },
  "leptodialepis bipartitus": { opt: { kind: "wasp" }, colors: { base: "#2b2b30" }, scale: 0.028 },
  "rhynchium haemorrhoidale": { opt: { kind: "wasp" }, colors: { base: "#3a3430" }, scale: 0.02 },

  // plants — campus celebrities
  "pterocarpus indicus": { archetype: "tree", opt: { fruit: true }, colors: { accent: "#f6d028" }, scale: 6 },
  "samanea saman": { archetype: "tree", opt: { canopy: "umbrella", thick: true }, scale: 8 },
  "terminalia catappa": { archetype: "tree", opt: { canopy: "umbrella" }, colors: { base: "#2e9e44" }, scale: 6 },
  "swietenia macrophylla": { archetype: "tree", scale: 6 },
  "vitex parviflora": { archetype: "tree", scale: 5 },
  "vitex negundo": { archetype: "shrub", opt: { bloom: "spikes" }, scale: 1.5 },
  "dillenia philippinensis": { archetype: "tree", opt: { fruit: true }, colors: { accent: "#e8d04a" }, scale: 4 },
  "dracontomelon dao": { archetype: "tree", scale: 8 },
  "tectona grandis": { archetype: "tree", scale: 6 },
  "calophyllum inophyllum": { archetype: "tree", scale: 5 },
  "araucaria columnaris": { archetype: "tree", opt: { canopy: "conifer", layers: 6 }, scale: 10 },
  "pinus merkusii": { archetype: "tree", opt: { canopy: "conifer", layers: 4 }, scale: 10 },
  "casuarina equisetifolia": { archetype: "tree", opt: { canopy: "conifer", layers: 5 }, scale: 9 },
  "mangifera indica": { archetype: "tree", opt: { fruit: true, thick: true }, colors: { accent: "#e8a03a" }, scale: 6 },
  "psidium guajava": { archetype: "tree", opt: { fruit: true }, colors: { accent: "#8fce3f" }, scale: 3.5 },
  "cocos nucifera": { archetype: "palm", opt: { coconut: true, trunkH: 0.62 }, scale: 8 },
  "caryota mitis": { archetype: "palm", opt: { fishtail: true, clump: true }, scale: 4 },
  "ptychosperma propinquum": { archetype: "palm", opt: { clump: true }, scale: 4 },
  "rhapis excelsa": { archetype: "palm", opt: { clump: true, trunkH: 0.3 }, scale: 1.8 },
  /* Royal palm: the trunk is pale grey-white, not the default warm brown. */
  "roystonea regia": { archetype: "palm", opt: { trunkH: 0.62 }, colors: { trunk: "#b9bcb4" }, scale: 12 },
  "musa acuminata": { archetype: "bananaKind", opt: { bloom: true }, scale: 3 },
  "musa paradisiaca": { archetype: "bananaKind", opt: { bloom: true }, scale: 3.5 },
  "musa textilis": { archetype: "bananaKind", scale: 3 },
  "heliconia psittacorum": { archetype: "bananaKind", opt: { bloom: true, leaves: 4 }, colors: { accent: "#ff3920" }, scale: 1.2 },
  "carica papaya": { archetype: "papaya", colors: { accent: "#e8a03a" }, scale: 4 },
  "moringa oleifera": { archetype: "tree", scale: 6 },
  "epipremnum aureum": { archetype: "vine", opt: {}, colors: { variegated: true }, scale: 1 },
  "epipremnum pinnatum": { archetype: "vine", scale: 1.2 },
  /* Dumb cane: cream-mottled blade. Was shipping plain green. */
  "dieffenbachia seguine": { archetype: "aroid", colors: { base: "#2f7d3a", accent: "#eff3dc", variegated: true }, scale: 1.2 },
  /* Heart of Jesus: pink/white over green. Was shipping solid dark green. */
  "caladium bicolor": { archetype: "aroid", colors: { base: "#2e7d32", accent: "#e8698f", variegated: true }, scale: 0.4 },
  "aglaonema?": null,
  "dracaena fragrans": { archetype: "rosetteBlades", opt: { cane: true, tall: 0.22 }, scale: 1.5 },
  "cordyline fruticosa": { archetype: "rosetteBlades", opt: { tall: 0.25 }, colors: { base: "#a0305a" }, scale: 1.2 },
  /* Snake plant: pale cross-banding on stiff upright blades. */
  "sansevieria trifasciata": { archetype: "rosetteBlades", opt: { tall: 0.28, edge: true }, colors: { base: "#2e6b3c", accent: "#cdd68a", variegated: true }, scale: 0.6 },
  "agave attenuata": { archetype: "rosetteBlades", opt: { tall: 0.2, n: 12 }, scale: 1 },
  "aloe vera": { archetype: "rosetteBlades", opt: { tall: 0.18 }, scale: 0.5 },
  "codiaeum variegatum": { archetype: "shrub", opt: { colorful: true }, scale: 1.5 },
  "excoecaria cochinchinensis": { archetype: "shrub", opt: { colorful: true }, scale: 1.2 },
  "ixora coccinea": { archetype: "shrub", opt: { bloom: "balls" }, colors: { accent: "#ff3920" }, scale: 1.5 },
  "hibiscus rosa-sinensis": { archetype: "shrub", opt: { bloom: "hibiscus" }, colors: { accent: "#ff3920" }, scale: 2 },
  "caesalpinia pulcherrima": { archetype: "shrub", opt: { bloom: "balls", multicolor: true }, scale: 2.5 },
  "lantana camara": { archetype: "shrub", opt: { bloom: "balls", multicolor: true }, scale: 1.2 },
  "bougainvillea spectabilis": { archetype: "vine", colors: { accent: "#e84a8a" }, scale: 3 },
  "bougainvillea glabra": { archetype: "vine", colors: { accent: "#c84ab5" }, scale: 3 },
  "plumeria obtusa": { archetype: "tree", opt: { thick: true }, colors: { accent: "#f8f4ec" }, scale: 4 },
  "plumeria rubra": { archetype: "tree", opt: { thick: true }, colors: { accent: "#e84a8a" }, scale: 4 },
  "rivina humilis": { archetype: "herb", opt: { flower: "berry" }, colors: { accent: "#ff3920" }, scale: 0.6 },
  "asystasia intrusa": { archetype: "herb", opt: { flower: "trumpet" }, colors: { accent: "#f8f4ec" }, scale: 0.4 },
  "ruellia simplex": { archetype: "herb", opt: { flower: "trumpet", flowerR: 0.1 }, colors: { accent: "#9a5ad8" }, scale: 0.9 },
  "axonopus compressus": { archetype: "grass", scale: 0.3 },
  "cyperus mindorensis": { archetype: "grass", opt: { kind: "sedge" }, scale: 0.6 },
  "mimosa pudica": { archetype: "herb", opt: { flower: "ball" }, colors: { accent: "#e87a8a" }, scale: 0.4 },
  "clitoria ternatea": { archetype: "herb", opt: { flower: "pea" }, colors: { accent: "#6a7fd8" }, scale: 1.5 },
  "tridax procumbens": { archetype: "herb", opt: { flower: "daisy" }, colors: { accent: "#f8f4ec" }, scale: 0.3 },
  "cyanthillium cinereum": { archetype: "herb", opt: { flower: "spike" }, colors: { accent: "#c8a0d8" }, scale: 0.5 },
  "solanum diphyllum": { archetype: "herb", opt: { flower: "berry" }, scale: 0.8 },
  "tradescantia pallida": { archetype: "herb", opt: { flower: "none" }, colors: { base: "#8a4a9a", dark: "#5a2a6a" }, scale: 0.35 },
  "peperomia pellucida": { archetype: "herb", opt: { flower: "spike", flowerR: 0.03 }, scale: 0.25 },
  "emilia sonchifolia": { archetype: "herb", opt: { flower: "daisy" }, colors: { accent: "#e04a8a" }, scale: 0.4 },
  "sphagneticola trilobata": { archetype: "herb", opt: { flower: "daisy" }, colors: { accent: "#f6d028" }, scale: 0.3 },
  "cosmos caudatus": { archetype: "herb", opt: { flower: "daisy", flowerR: 0.11 }, colors: { accent: "#e84a8a" }, scale: 1.2 },
  "zinnia?": null,
  "spilanthes?": null,
  "acmella?": null,
  "ocimum?": null,
  "mikania?": null,
  "catharanthus roseus": { archetype: "herb", opt: { flower: "trumpet" }, colors: { accent: "#e84a8a" }, scale: 0.5 },
  "allamanda?": null,
  "thevetia?": null,
  "nerium?": null,
  "canna?": null,
  "rhipsalis?": null,
};

// ---------- palettes & colors ----------

function derivedColors(ctx, iconic, sci) {
  const seed = sci;
  if (iconic === "Aves") {
    const base = pick(BIRDS, seed);
    return { base, belly: shade(base, 0.35), dark: shade(base, -0.25), accent: APP.orange };
  }
  if (iconic === "Mammalia") {
    const base = pick(FURS, seed);
    return { base, belly: shade(base, 0.3), dark: shade(base, -0.2), accent: APP.red };
  }
  if (iconic === "Amphibia") {
    const base = pick(["#58a942", "#8a6a45", "#7a8a5a", "#6a8a4a"].map(hex), seed);
    return { base, belly: shade(base, 0.4), dark: shade(base, -0.2), accent: APP.orange };
  }
  if (iconic === "Reptilia") {
    const base = pick(["#8a9a5a", "#c8b598", "#5a7a4a", "#7a9a6a"].map(hex), seed);
    return { base, belly: shade(base, 0.3), dark: shade(base, -0.25), accent: APP.orange };
  }
  if (iconic === "Actinopterygii") {
    const base = pick(["#3a8ad8", "#ff8c2a", "#8a9aa0", "#e87a8a", "#4ab5a0"].map(hex), seed);
    return { base, belly: shade(base, 0.35), dark: shade(base, -0.3), accent: APP.orange };
  }
  if (iconic === "Arachnida") {
    const base = pick(["#7a5230", "#c8932a", "#3a3a42", "#8a8a70", "#5a4a3a"].map(hex), seed);
    return { base, belly: shade(base, 0.25), dark: shade(base, -0.3), accent: APP.red };
  }
  if (iconic === "Mollusca") {
    const base = pick(SHELLS, seed);
    return { base, belly: shade(base, 0.4), dark: shade(base, -0.25), accent: APP.orange };
  }
  if (iconic === "Plantae") {
    const leaf = pick(LEAVES, seed);
    const flower = pick(FLOWERS, seed + 7);
    return { base: leaf, dark: shade(leaf, -0.25), trunk: pick(TRUNKS, seed + 3), accent: flower };
  }
  if (iconic === "Fungi") {
    const cap = pick(FUNGI_CAPS, seed);
    return { base: cap, dark: shade(cap, -0.3), stalk: hex("#e8dcc0"), accent: APP.paper };
  }
  // insects + everything else
  const base = pick(INSECTS, seed);
  return { base, belly: shade(base, 0.3), dark: shade(base, -0.3), accent: pick(FLOWERS, seed + 11) };
}

// ---------- routing ----------

function route(row, ctx) {
  const sci = norm(row.taxon.name);
  const iconic = row.taxon.iconic_taxon_name;
  const known = KNOWN[sci];
  const genus = ctx.genus;
  const fams = ctx.fams;
  const hasFam = (set) => fams.some((f) => set.has(f));
  /*
   * genusOf() lowercases. Every literal below is written the way a botanist or
   * entomologist writes it, capitalised — and `isGenus("Oryctes")` is
   * therefore always false. That trap has now been found three separate times
   * in this file (the genus sets, the reptile list, and the beetle switch),
   * each time silently disabling a whole branch. Compare through this and it
   * cannot happen again.
   */
  const isGenus = (...name) => name.some((n) => n.toLowerCase() === genus);

  // explicit known override wins for archetype
  if (known?.archetype) return known.archetype;
  if (iconic === "Aves") return "bird";
  if (iconic === "Mammalia") return "mammal";
  if (iconic === "Amphibia") return "frog";
  if (iconic === "Reptilia") {
    /* Same capitalisation trap as the genus sets: `genus` is lowercased by
       genusOf(), so this list never matched and EVERY reptile was built by the
       snake builder — the skink, both house geckos, the four-clawed gecko and
       the marbled water monitor all shipped as snakes, and `lizard` was dead
       code that had never once run. The three actual snakes in the pack
       (Cyclocorus, Indotyphlops, Tropidonophis) are the fall-through. */
    return ["eutropis", "hemidactylus", "gehyra", "varanus"].includes(genus) ? "lizard" : "snake";
  }
  if (iconic === "Actinopterygii") return "fish";
  if (iconic === "Arachnida") {
    /* spider-jumping and spider-spiny existed in the archetype table but
       nothing ever returned them, so all 42 spiders got a hash-random body
       unrelated to their family. */
    if (fams.includes("Salticidae")) return "spider-jumping";
    if (isGenus("Gasteracantha", "Thelacantha", "Macracantha")) return "spider-spiny";
    if (fams.some((f) => ["Buthidae", "Chaerilidae", "Scorpionidae"].includes(f))) return "scorpion";
    return "spider";
  }
  if (iconic === "Mollusca") {
    /*
     * This was `fams.includes("Veronicellidae") ? "snail" : "snail"` — a
     * literal no-op. The slug branch was written and then returned the snail
     * either way, so three shell-less leatherleaf slugs shipped WITH shells.
     */
    if (fams.some((f) => ["Veronicellidae", "Ariophantidae"].includes(f))) return "slug";
    return "snail";
  }
  if (iconic === "Fungi") {
    const order = ctx.order ?? "";
    // lichen-forming orders read better as mossy crusts than as mushrooms
    if (["Lecanorales", "Teloschistales", "Peltigerales", "Caliciales", "Arthoniales", "Graphidales", "Ostropales", "Pertusariales", "Baeomycetales", "Rhizocarpales", "Gyalectales", "Lichinales"].includes(order)) return "moss";
    /*
     * Genera that are stalkless in life — crusts, brackets and pleurotoid
     * (side-attached) fungi. They were all shipping as classic stalked
     * toadstools because their ORDER is Agaricales or Russulales, which the
     * order test below reads as "gilled mushroom". A visual review of all 59
     * caught them; the bracket builder already exists, so this is a re-route,
     * not new work. Stereum and Xylobolus are Russulales crusts; Schizophyllum,
     * Crepidotus, Clitopilus, Resupinatus and Favolaschia are Agaricales but
     * grow as fans and shelves on wood with no central stipe.
     */
    /*
     * Fungi that are not agarics and were shipping as classic toadstools. The
     * full review found these; each goes to the closest HONEST form available
     * rather than to a shape that flatters it.
     *
     * The four microfungi are the uncomfortable ones: a leaf rust and three
     * moulds have no macroscopic fruiting body at all. They take the crust
     * form the lichens already use in `moss`, which renders as a flat patch on
     * a surface. That is not what they are, but it is far closer than a
     * stalked mushroom with a cap and gills, and the manifest still records
     * what they actually are.
     */
    const NON_AGARIC = {
      "trypethelium eluteriae": "moss",        // a crustose bark LICHEN
      "coleosporium plumeriae": "moss",        // frangipani rust
      "trichoderma viride": "moss",            // a mould
      "pestalotiopsis funerea": "moss",        // tip-blight anamorph
      "chromelosporiopsis carnea": "moss",     // anamorphic crust
      "dacrymyces spathularia": "mushroom-jelly", // a jelly fungus, not a cap
      /* Centrally-stalked polypores: little funnels on a stalk, not shelves. */
      "lentinus arcularius": "mushroom",
      "lentinus squarrosulus": "mushroom",
    };
    const nonAgaric = NON_AGARIC[sci.split(" ").slice(0, 2).join(" ")];
    if (nonAgaric) return nonAgaric;

    const STALKLESS_GENUS = new Set(
      "stereum xylobolus schizophyllum crepidotus clitopilus resupinatus favolaschia".split(" "),
    );
    if (STALKLESS_GENUS.has(genus)) return "mushroom-bracket";
    if (["Polyporales", "Hymenochaetales", "Gloeophyllales", "Corticiales", "Thelephorales", "Trechisporales"].includes(order)) return "mushroom-bracket";
    if (order === "Geastrales") return "mushroom-earthstar";
    if (order === "Nidulariales" || order === "Agaricales" && isGenus("Cyathus")) return "mushroom-birdsnest";
    if (order === "Auriculariales" || order === "Tremellales" || order === "Sebacinales") return "mushroom-jelly";
    if (["Clavariaceae"].some((f) => fams.includes(f)) || order === "Gomphales" || order === "Xylariales") return "mushroom-coral";
    if (isGenus("Lycoperdon") || order === "Hysterangiales" || order === "Phallales") return "mushroom-puffball";
    return "mushroom";
  }
  if (iconic === "Animalia") {
    /* Pachybolidae and the Spirobolida order were missing, so two millipedes
       fell through to insectGeneric — one of them shipped with wings. */
    if (fams.some((f) => ["Trigoniulidae", "Paradoxosomatidae", "Rhinocricidae", "Harpagophoridae", "Pachybolidae", "Spirostreptidae", "Julidae"].includes(f))) return "myriapod";
    if (["Spirobolida", "Spirostreptida", "Polydesmida", "Julida"].includes(ctx.order)) return "myriapod";
    if (fams.includes("Scutigeridae")) return "myriapod-house";
    if (fams.some((f) => ["Scolopendridae", "Cryptopidae", "Mecistocephalidae"].includes(f))) return "myriapod-centipede";
    if (fams.includes("Geoplanidae")) return "flatworm";
    if (fams.some((f) => ["Gecarcinucidae", "Sundathelphusidae", "Potamidae", "Varunidae"].includes(f))) return "crab";
    if (fams.includes("Armadillidae")) return "pillbug";
    if (fams.includes("Naididae")) return "worm";
    return "insectGeneric";
  }
  if (iconic === "Insecta") {
    const order = ctx.order;
    const fam = fams[0];
    switch (order) {
      case "Lepidoptera":
        if (["Hesperiidae"].includes(fam)) return "lepidoptera-skipper";
        if (["Papilionidae", "Nymphalidae", "Pieridae", "Lycaenidae", "Riodinidae"].includes(fam)) return "lepidoptera";
        if (fam === "Sphingidae") return "lepidoptera-hawk";
        return "lepidoptera-moth";
      case "Odonata":
        return ["Coenagrionidae", "Platycnemididae", "Isostictidae", "Lestidae"].includes(fam) ? "odonata-damsel" : "odonata";
      case "Hymenoptera":
        if (fam === "Formicidae") return "hymenoptera-ant";
        /* Only Vespidae counted as a wasp, so Scoliidae, Sphecidae,
           Pompilidae and Crabronidae all fell through to "bee" — including a
           species whose common name is literally "spider-hunting wasp". */
        if (["Vespidae", "Scoliidae", "Sphecidae", "Pompilidae", "Crabronidae", "Ichneumonidae", "Braconidae"].includes(fam)) return "hymenoptera-wasp";
        return "hymenoptera-bee";
      case "Coleoptera":
        if (fam === "Coccinellidae") return "coleoptera-ladybird";
        if (isGenus("Oryctes", "Xylotrupes")) return "coleoptera-rhino";
        if (fam === "Cerambycidae") return "coleoptera-longhorn";
        if (fam === "Curculionidae") return "coleoptera-weevil";
        return "coleoptera";
      case "Diptera":
        if (fam === "Culicidae") return "diptera-mosquito";
        if (fam === "Tipulidae" || fam === "Limoniidae" || fam === "Ptychopteridae") return "diptera-crane";
        if (fam === "Syrphidae") return "diptera-hover";
        if (fam === "Psychodidae") return "diptera-mothfly";
        return "diptera";
      case "Hemiptera":
        if (fam === "Cicadidae") return "hemiptera-cicada";
        return "hemiptera";
      case "Orthoptera":
        if (fam === "Tettigoniidae") return "orthoptera-katydid";
        if (["Gryllidae", "Trigonidiidae", "Gryllotalpidae", "Tetrigidae"].includes(fam)) return "orthoptera-cricket";
        return "orthoptera";
      case "Blattodea":
        if (["Termitidae", "Kalotermitidae", "Rhinotermitidae", "Hodotermitidae"].includes(fam)) return "blattodea-termite";
        return "blattodea";
      case "Mantodea": return "mantis";
      case "Dermaptera": return "dermaptera";
      case "Phasmatodea": return "phasmatodea";
      default: return "insectGeneric";
    }
  }
  if (iconic === "Plantae") {
    /*
     * Species-level corrections. A genus is usually a good proxy for growth
     * form, but not always: Thunbergia is mostly climbers yet T. erecta is a
     * bush, Capparis mostly climbs but C. micracantha does not, Gnetum gnemon
     * is a small tree among lianas, and Calamus is a CLIMBING rattan sitting
     * in a family of trunked palms. Lygodium and Flagellaria climb but sit in
     * fern and grass families. Checked before any genus rule.
     */
    const SPECIES_FORM = {
      /* Second round, from the full 1098-model visual verification. */
      "pisonia grandis": "tree",            // a large coastal tree, was knee-high
      "phyllanthus acidus": "tree",         // Otaheite gooseberry, a small tree
      "pisonia aculeata": "vine",           // a thorny scrambling liana
      "heptapleurum arboricola": "shrub",
      "heptapleurum ellipticum": "shrub",
      "thunbergia erecta": "shrub",
      "capparis micracantha": "shrub",
      "gnetum gnemon": "tree",
      "flagellaria indica": "vine",
      "lygodium japonicum": "vine",
      "lygodium flexuosum": "vine",
      "calamus rotang": "vine",
      "calamus formosanus": "vine",
    };
    const bySpecies = SPECIES_FORM[sci.split(" ").slice(0, 2).join(" ")];
    if (bySpecies) return bySpecies;

    if (ORCHID_FAM.has(fams[0]) || hasFam(ORCHID_FAM)) return "orchid";
    if (isGenus("Cycas")) return "cycad";
    if (isGenus("Pandanus", "Freycinetia")) return "pandanus";
    if (hasFam(PALM_FAM) || isGenus("Roystonea", "Cocos")) return "palm";

    /*
     * Cladophora columbiana is a marine green ALGA, not a plant — it was
     * shipping as a leafy flowering herb with a stem and broad dicot leaves.
     * There is no algal builder and inventing one for a single species is not
     * worth it, so it takes `moss`: a low tufted cushion is the closest honest
     * form available, and it is at least not pretending to be a flowering
     * plant. The manifest still records what it actually is.
     */
    if (genus === "cladophora") return "moss";

    /* Most specific first: these were all landing in `herb`. */
    if (CYCAD_GENUS.has(genus)) return "cycad";
    if (PANDAN_GENUS.has(genus)) return "pandanus";
    if (WATER_GENUS.has(genus)) return "waterPlant";
    if (SUCCULENT_GENUS.has(genus)) return "succulent";
    if (BAMBOO_GENUS.has(genus)) return "grass-bamboo";
    if (hasFam(BANANA_FAM)) return "bananaKind";
    if (isGenus("Carica")) return "papaya";
    if (isGenus("Ficus")) return "tree-balete";
    if (TREE_GENUS.has(genus)) return "tree";
    if (AROID_GENUS.has(genus)) return "aroid";
    if (CANE_GENUS.has(genus)) return "rosetteBlades";
    if (VINE_GENUS.has(genus)) return "vine";
    if (hasFam(CACTUS_FAM)) return "cactus";
    if (hasFam(SUCCULENT_FAM)) return "succulent";
    if (isGenus("Euphorbia") && /(tirucalli|trigona|milii|antiquorum|neriifolia|lactea|ingens)/.test(sci)) return "cactus";
    if (hasFam(WATER_FAM) || isGenus("Ludwigia", "Marsilea")) return "waterPlant";
    if (hasFam(FERN_FAM)) return "fern";
    if (hasFam(MOSS_FAM)) return "moss";
    if (hasFam(GRASS_FAM)) return "grass";
    if (SHRUB_GENUS.has(genus)) return "shrub";
    return "herb";
  }
  return "insectGeneric";
}

// archetype key → builder + option patches
const ARCH = {
  bird: { fn: fauna.bird, scale: 0.18 },
  mammal: { fn: fauna.mammal, scale: 0.4 },
  frog: { fn: fauna.frog, scale: 0.06 },
  lizard: { fn: fauna.lizard, scale: 0.25 },
  snake: { fn: fauna.snake, scale: 0.5 },
  fish: { fn: fauna.fish, scale: 0.08 },
  lepidoptera: { fn: fauna.lepidoptera, opt: { kind: "butterfly" }, scale: 0.07 },
  "lepidoptera-moth": { fn: fauna.lepidoptera, opt: { kind: "moth" }, scale: 0.05 },
  "lepidoptera-hawk": { fn: fauna.lepidoptera, opt: { kind: "hawk" }, scale: 0.07 },
  "lepidoptera-skipper": { fn: fauna.lepidoptera, opt: { kind: "skipper" }, scale: 0.035 },
  odonata: { fn: fauna.odonata, opt: { kind: "dragonfly" }, scale: 0.05 },
  "odonata-damsel": { fn: fauna.odonata, opt: { kind: "damselfly" }, scale: 0.03 },
  "hymenoptera-ant": { fn: fauna.hymenoptera, opt: { kind: "ant" }, scale: 0.01 },
  "hymenoptera-bee": { fn: fauna.hymenoptera, opt: { kind: "bee", stripes: true }, scale: 0.02 },
  "hymenoptera-wasp": { fn: fauna.hymenoptera, opt: { kind: "wasp", stripes: true }, scale: 0.025 },
  coleoptera: { fn: fauna.coleoptera, opt: { kind: "beetle" }, scale: 0.03 },
  "coleoptera-ladybird": { fn: fauna.coleoptera, opt: { ladybird: true }, scale: 0.008 },
  "coleoptera-rhino": { fn: fauna.coleoptera, opt: { horn: true }, scale: 0.045 },
  "coleoptera-longhorn": { fn: fauna.coleoptera, opt: { longhorn: true }, scale: 0.028 },
  "coleoptera-weevil": { fn: fauna.coleoptera, opt: { snout: true }, scale: 0.02 },
  orthoptera: { fn: fauna.orthoptera, opt: { kind: "grasshopper" }, scale: 0.045 },
  "orthoptera-katydid": { fn: fauna.orthoptera, opt: { kind: "katydid" }, scale: 0.05 },
  "orthoptera-cricket": { fn: fauna.orthoptera, opt: { kind: "cricket" }, scale: 0.025 },
  hemiptera: { fn: fauna.hemiptera, opt: { kind: "bug" }, scale: 0.015 },
  "hemiptera-cicada": { fn: fauna.hemiptera, opt: { kind: "cicada" }, scale: 0.045 },
  diptera: { fn: fauna.diptera, opt: { kind: "fly" }, scale: 0.012 },
  "diptera-mosquito": { fn: fauna.diptera, opt: { kind: "mosquito" }, scale: 0.008 },
  "diptera-crane": { fn: fauna.diptera, opt: { kind: "crane" }, scale: 0.02 },
  "diptera-hover": { fn: fauna.diptera, opt: { kind: "fly", stripes: true }, scale: 0.012 },
  "diptera-mothfly": { fn: fauna.diptera, opt: { kind: "fly" }, scale: 0.005 },
  mantis: { fn: fauna.mantis, scale: 0.06 },
  blattodea: { fn: fauna.blattodea, opt: { kind: "roach" }, scale: 0.03 },
  "blattodea-termite": { fn: fauna.blattodea, opt: { kind: "termite" }, scale: 0.012 },
  dermaptera: { fn: fauna.dermaptera, scale: 0.02 },
  phasmatodea: { fn: fauna.phasmatodea, scale: 0.09 },
  insectGeneric: { fn: fauna.insectGeneric, scale: 0.01 },
  spider: { fn: fauna.spider, opt: { kind: "orb" }, scale: 0.035 },
  "spider-jumping": { fn: fauna.spider, opt: { kind: "jumping" }, scale: 0.012 },
  "spider-spiny": { fn: fauna.spider, opt: { kind: "spiny" }, scale: 0.015 },
  scorpion: { fn: fauna.scorpion, scale: 0.06 },
  snail: { fn: fauna.snail, opt: { kind: "round" }, scale: 0.05 },
  /* Shell-less. The builder does not yet draw a slug — it ignores the unknown
     kind and renders a snail, which is exactly what shipped before — so this
     is wired and inert rather than wrong, and turns on the moment fauna.snail
     learns `kind: "slug"`. */
  slug: { fn: fauna.snail, opt: { kind: "slug" }, scale: 0.05 },
  myriapod: { fn: fauna.myriapod, opt: { kind: "millipede" }, scale: 0.045 },
  "myriapod-centipede": { fn: fauna.myriapod, opt: { kind: "centipede" }, scale: 0.09 },
  "myriapod-house": { fn: fauna.myriapod, opt: { kind: "house-centipede" }, scale: 0.05 },
  flatworm: { fn: fauna.flatworm, scale: 0.1 },
  crab: { fn: fauna.crab, scale: 0.06 },
  pillbug: { fn: fauna.pillbug, scale: 0.01 },
  worm: { fn: fauna.worm, scale: 0.03 },
  tree: { fn: flora.tree, opt: {}, scale: 5 },
  "tree-balete": { fn: flora.tree, opt: { canopy: "balete" }, scale: 6 },
  papaya: { fn: flora.papaya, scale: 4 },
  palm: { fn: flora.palm, scale: 5 },
  bananaKind: { fn: flora.bananaKind, scale: 2.8 },
  pandanus: { fn: flora.pandanus, scale: 3 },
  cycad: { fn: flora.cycad, scale: 1.5 },
  shrub: { fn: flora.shrub, scale: 1.5 },
  herb: { fn: flora.herb, scale: 0.35 },
  orchid: { fn: flora.orchid, scale: 0.35 },
  grass: { fn: flora.grass, scale: 0.45 },
  "grass-bamboo": { fn: flora.grass, opt: { kind: "bamboo" }, scale: 6 },
  fern: { fn: flora.fern, scale: 0.8 },
  moss: { fn: flora.moss, scale: 0.04 },
  cactus: { fn: flora.cactus, scale: 1 },
  succulent: { fn: flora.succulent, scale: 0.2 },
  rosetteBlades: { fn: flora.rosetteBlades, scale: 0.6 },
  aroid: { fn: flora.aroid, scale: 0.5 },
  vine: { fn: flora.vine, scale: 1 },
  waterPlant: { fn: flora.waterPlant, scale: 0.3 },
  mushroom: { fn: flora.mushroom, scale: 0.1 },
  "mushroom-bracket": { fn: flora.mushroom, opt: { kind: "bracket" }, scale: 0.15 },
  "mushroom-earthstar": { fn: flora.mushroom, opt: { kind: "earthstar" }, scale: 0.08 },
  "mushroom-birdsnest": { fn: flora.mushroom, opt: { kind: "birdsnest" }, scale: 0.02 },
  "mushroom-jelly": { fn: flora.mushroom, opt: { kind: "jelly" }, scale: 0.06 },
  "mushroom-coral": { fn: flora.mushroom, opt: { kind: "coral" }, scale: 0.08 },
  "mushroom-puffball": { fn: flora.mushroom, opt: { kind: "puffball" }, scale: 0.07 },
};

function speciesCode(sci, fallbackIdx) {
  const slug = norm(sci).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `taxon-${fallbackIdx}`;
}

// ---------- main ----------

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

// curated list first (their codes win)
const list = new Map();
for (const [code, s] of Object.entries(curated)) {
  list.set(norm(s.scientific_name), {
    species_code: code,
    scientific_name: s.scientific_name,
    common_name: s.common_name,
    origin: s.origin,
    source: "curated",
    count: null,
    iconic_taxon_name: "Plantae",
    rank: "species",
  });
}
let genusRows = 0;
for (const row of sweep.result) {
  const sci = norm(row.taxon.name);
  if (EXCLUDED.has(sci)) continue;
  if (!["species", "hybrid", "complex"].includes(row.taxon.rank)) { genusRows += 1; continue; }
  const existing = list.get(sci);
  if (existing) {
    existing.count = row.count;
    existing.source = "curated+inat";
  } else {
    list.set(sci, {
      species_code: speciesCode(sci, list.size),
      scientific_name: row.taxon.name,
      common_name: row.taxon.preferred_common_name ?? null,
      origin: null,
      source: "inat",
      count: row.count,
      iconic_taxon_name: row.taxon.iconic_taxon_name,
      rank: row.taxon.rank,
    });
  }
}

const outDir = join(OUT, "species");
mkdirSync(outDir, { recursive: true });
const manifest = [];
let skipped = 0;

for (const spec of list.values()) {
  if (only && !spec.species_code.includes(only)) continue;
  const ctxRow = sweep.result.find((r) => norm(r.taxon.name) === norm(spec.scientific_name));
  const ctx = ctxRow
    ? contextFor(ctxRow)
    : { fams: [], order: null, cls: spec.iconic_taxon_name, genus: genusOf(spec.scientific_name) };
  const known = KNOWN[norm(spec.scientific_name)];
  const archetypeKey = known?.archetype ?? route(ctxRow ?? { taxon: { name: spec.scientific_name, iconic_taxon_name: spec.iconic_taxon_name, ancestor_ids: [] } }, ctx);
  const arch = ARCH[archetypeKey] ?? ARCH.insectGeneric;
  const iconic = spec.iconic_taxon_name ?? ctx.cls ?? "Animalia";

  const derived = derivedColors(ctx, iconic, spec.scientific_name);
  const colors = {};
  for (const [k, v] of Object.entries(known?.colors ?? {})) {
    colors[k] = Array.isArray(v) ? v : (typeof v === "string" ? hex(v) : v);
  }
  const col = { ...derived, ...colors };
  if (colors.variegated) col.variegated = true;
  const opt = { ...(arch.opt ?? {}), ...(known?.opt ?? {}) };

  let bytes = 0;
  let archetype = archetypeKey;
  try {
    const k = new Kit(spec, { idleDur: iconic === "Plantae" ? 2.4 : 1.6 });
    if (col.variegated) { /* vine reads the flag off colors */ }
    arch.fn(k, col, opt);
    let glb = k.finish();
    /* Stand it on y=0. The archetypes are authored by eye and ~10% of them
       rest a few centimetres above the ground plane or through it; measured
       from the rest pose, fixed with one wrapping node, checked by the same
       rule in script/audit-model.mjs. */
    const { bound } = auditGlb(glb);
    const offset = bound ? groundOffset(bound, FLYER.has(archetypeKey)) : 0;
    if (offset) {
      k.cute.ground_offset = +offset.toFixed(5);
      glb = k.finish();
    }
    bytes = glb.byteLength;
    writeFileSync(join(outDir, `${spec.species_code}.glb`), glb);
  } catch (err) {
    skipped += 1;
    console.error(`FAIL ${spec.species_code}: ${err.message}`);
    archetype = `FAILED:${archetypeKey}`;
  }

  manifest.push({
    species_code: spec.species_code,
    scientific_name: spec.scientific_name,
    common_name: spec.common_name,
    count: spec.count,
    origin: spec.origin,
    source: spec.source,
    rank: spec.rank,
    iconic_taxon_name: iconic,
    archetype,
    palette_source: known ? "known" : "derived",
    file: `species/${spec.species_code}.glb`,
    bytes,
    display_scale_m: known?.scale ?? arch.scale,
  });
}

const body = {
  _comment:
    "One cute animated .glb per species known from the Ateneo Loyola Heights campus. " +
    "Species list: iNaturalist species_counts sweep of the campus box (fetched " + (sweep.fetched_at ?? "2026-09-03") + ") merged with the curated guide list in src/data.ts. " +
    "The AIS inventory (due 2026-09-09) supersedes this list when it lands. " +
    "palette_source 'known' = colors written from the species' real appearance; 'derived' = deterministic pick from tuned pools, not observed data. " +
    "display_scale_m is a suggested real-world height hint for AR, not a measurement.",
  generated_at: new Date().toISOString(),
  campus_box: sweep.campus_box,
  attribution: {
    species_list: "iNaturalist observations (c) iNaturalist users, CC-BY-NC; curated list (c) this project",
    models: "generated by script/build-species-model.mjs for this project — original work, flat-shaded low-poly, no textures",
  },
  counts: {
    inat_rows: sweep.result.length,
    genus_and_above_rows: genusRows,
    modeled_species: manifest.length,
    failed: skipped,
  },
  model: manifest,
};
writeFileSync(join(OUT, "species-model.json"), JSON.stringify(body, null, 1));

const totalMb = manifest.reduce((s, e) => s + e.bytes, 0) / 1048576;
const biggest = [...manifest].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
console.log(`models: ${manifest.length} (${skipped} failed) · ${totalMb.toFixed(1)} MB total`);
console.log(`biggest: ${biggest.map((e) => `${e.species_code} ${(e.bytes / 1024).toFixed(0)}kB`).join(", ")}`);
