/** Ateneo Youth CLAP cohort: seats, lanes, mentors */

export const seat_board = {
  board_label: "SEAT BOARD v0.2",
  frozen_on: "2026-08-08",
  seat_count: 11,
  person_count: 10,
  shared_seat_count: 1,
  eyebrow: "ROLE ARCHITECTURE · 4 LANES / 11 SEATS / 10 PEOPLE",
  title: "Everyone leaves the room carrying one thing.",
  note: [
    "courses refreshed from 2026-08-08 orientation intros",
    "gold outline = shared seat",
    "no photos on the board by design",
  ],
};

export const lane = [
  {
    lane_code: "build",
    lane_name: "Build",
    lane_color: "#1479C9",
    lane_number: "01",
    lane_verb: "Ship the demo slice",
    lane_promise: "Ship demos people can click.",
    day_one_output: "RUNNING PROTOTYPE",
    day_one_label: "DAY-ONE OUTPUT: RUNNING PROTOTYPE",
    artifact_label: "Clickable demo",
    artifact_kind: "phone",
    course_fit: ["ME", "Applied Math", "CTM", "BOx"],
    course_fit_line: "FITS ME · APPLIED MATH · CTM · BOx",
    skill: ["product", "frontend", "systems", "data models"],
    well_size: 172,
    motif: "spark",
    member: [
      {
        person_name: "Mar Angelo Revelo",
        short_name: "GELO",
        course_tag: "ME",
        course_name: "BS Management Engineering, year 2",
        role_tag: "LEAD BUILDER",
        strength:
          "Owns the running build; uses data to decide what to prioritize.",
        is_lead: true,
        is_assumed: false,
        task: [
          "Own the eComon build and this landing page",
          "Ship the Sep 12 showcase demo: live app, offline-capable",
          "Technical architecture for any idea the room chooses",
        ],
      },
      {
        person_name: "Alfonso Albano",
        short_name: "ALPHONSE",
        course_tag: "APPLIED MATH",
        course_name: "BS Applied Mathematics to Data Science, year 3",
        strength: "Turns the model into logic that runs.",
        is_assumed: false,
        task: [
          "Impact math (kg to methane / flood co-benefit narrative)",
          "Rate tables and pilot scoreboard",
          "Clean charts for the 3-min pitch",
        ],
      },
      {
        person_name: "Aleij Jill Mendoza",
        short_name: "ALEGE",
        course_tag: "CTM",
        course_name: "BS Communications Technology Management, year 3 · sustainability minor",
        strength: "Keeps the demo path unbroken end to end.",
        is_assumed: false,
        task: [
          "UX flows for collector path and diversion log",
          "Sustainability claims that stay honest",
          "Campus partner tech handoff notes",
        ],
      },
    ],
  },
  {
    lane_code: "science",
    lane_name: "Science & Evidence",
    lane_color: "#4CAF2E",
    lane_number: "02",
    lane_verb: "Measure it, defend it",
    lane_promise: "Make claims mentor-proof.",
    day_one_output: "ONE DEFENSIBLE FIGURE",
    day_one_label: "DAY-ONE OUTPUT: ONE DEFENSIBLE FIGURE",
    artifact_label: "Defensible figure",
    artifact_kind: "chart",
    course_fit: ["EnvSci", "Bio", "Physics", "MEc"],
    course_fit_line: "FITS ENVSCI · BIO · PHYSICS · MEc",
    skill: ["environmental science", "biology", "physics", "field methods"],
    well_size: 152,
    motif: "petal",
    member: [
      {
        person_name: "Clariz Pillos",
        short_name: "CLARICE",
        course_tag: "ENVSCI",
        course_name: "BS Environmental Science, year 3",
        strength: "Sets the method before anyone quotes a number.",
        is_assumed: false,
        task: [
          "Climate and waste science one-pager for LEARN day",
          "Source checklist for EcoWaste claims",
          "QA any carbon or methane numbers before pitch",
        ],
      },
      {
        person_name: "Katherine Leal",
        short_name: "KATHY",
        course_tag: "BIO",
        course_name: "BS Biology, year 2 · ecology track",
        strength:
          "Resilient field lens; plans ecology, climate research, and policy.",
        is_assumed: false,
        task: [
          "Nature co-benefit framing (diversion is not tree-planting theater)",
          "Local ecology note for Pasig / QC pilot area",
          "Field observation sheet for pilot days",
        ],
      },
      {
        person_name: "Charisse Macapagal",
        short_name: "CHARISSE",
        course_tag: "PHYSICS",
        course_name: "BS Applied Physics (MSV), year 3",
        strength: "Carries the figure into the cut without distorting it.",
        also_lane_code: "story",
        also_lane_label: "ALSO IN 04",
        is_shared: true,
        is_assumed: false,
        task: [
          "Climate justice angle (informal collectors, equity)",
          "Energy and waste systems talking points",
          "Showcase stage presence and 3-min delivery coach",
        ],
      },
    ],
  },
  {
    lane_code: "mobilize",
    lane_name: "Mobilize",
    lane_color: "#EFA92C",
    lane_number: "03",
    lane_verb: "Get it adopted",
    lane_promise: "People, partners, pesos.",
    day_one_output: "ONE NAMED PARTNER",
    day_one_label: "DAY-ONE OUTPUT: ONE NAMED PARTNER",
    artifact_label: "Named partner",
    artifact_kind: "handshake",
    course_fit: ["MEc", "BOx", "CTM"],
    course_fit_line: "FITS MEc · BOx · CTM",
    skill: ["org leadership", "finance", "partnerships", "MEc"],
    well_size: 136,
    motif: "loop",
    member: [
      {
        person_name: "Sophia Aliza Caverte",
        short_name: "SOPHIA",
        course_tag: "MEc",
        course_name: "AB Management Economics, year 3",
        strength: "Opens the door and gets the partner named out loud.",
        is_assumed: false,
        task: [
          "Campaign Canvas resource block",
          "Partner ask list (orgas, junkshop, SK)",
          "Zero-cost channel plan (group chats, booths)",
        ],
      },
      {
        person_name: "Nathanielle Sophia Alaethea Araneta",
        short_name: "NATHANIELLE",
        course_tag: "BOx",
        course_name: "Ateneo BOx President 26 to 27",
        strength: "Holds the follow-up until the yes is written down.",
        is_assumed: false,
        task: [
          "Recruit pilot users from BOx and allied orgs",
          "Campus logistics for collection day",
          "Ambassador scripts for org officers",
        ],
      },
    ],
    open_seat: {
      seat_code: "03-C",
      seat_note: "Open. Lane runs at two until filled.",
    },
  },
  {
    lane_code: "story",
    lane_name: "Story & Showcase",
    lane_color: "#EE3B24",
    lane_number: "04",
    lane_verb: "Make it land in 3 minutes",
    lane_promise: "Make the room feel it in three minutes.",
    day_one_output: "3-MIN CUT",
    day_one_label: "DAY-ONE OUTPUT: 3-MIN CUT",
    artifact_label: "3-min pitch cut",
    artifact_kind: "timer",
    course_fit: ["LEARN", "MEc", "Physics"],
    course_fit_line: "FITS LEARN · MEc · PHYSICS",
    skill: ["writing", "design learning", "video", "theatre"],
    well_size: 152,
    motif: "chevron",
    member: [
      {
        person_name: "Mark Laurence Marquez",
        short_name: "MARK",
        course_tag: "LEARN",
        course_name: "BS Learning Science and Design",
        strength: "Cuts to three minutes without overclaiming.",
        is_assumed: false,
        task: [
          "Campaign Canvas copy and pitch script",
          "Exhibit board design language",
          "Honest limits section (credibility)",
        ],
      },
      {
        person_name: "Ivan Nite",
        short_name: "IVAN",
        course_tag: "MEc",
        course_name: "AB Management Economics, year 3",
        strength:
          "Brings hope-forward framing when the climate story turns dark.",
        is_assumed: false,
        task: [
          "3-min demo video backup",
          "Pilot photo and video evidence kit",
          "Showcase AV checklist",
        ],
      },
      {
        person_name: "Charisse Macapagal",
        short_name: "CHARISSE",
        course_tag: "PHYSICS",
        course_name: "BS Applied Physics (MSV), year 3",
        strength:
          "One person is the bridge: the figure and the cut agree.",
        also_lane_code: "science",
        also_lane_label: "ALSO IN 02",
        is_shared: true,
        is_assumed: false,
        task: [
          "Co-lead pitch rehearsal",
          "Audience empathy beats",
        ],
      },
    ],
  },
];

/** Constellation layout: percent coords for desktop map */
export const constellation_well = [
  {
    lane_code: "build",
    x: 28.7,
    y: 36.6,
    orbit: 90,
    reverse: false,
    sat: [
      { person_key: "Mar Angelo Revelo", x: 32, y: 16.5, align: "start" },
      { person_key: "Alfonso Albano", x: 41.1, y: 38.4, align: "start" },
      { person_key: "Aleij Jill Mendoza", x: 30.9, y: 57, align: "start" },
    ],
    fit_x: 13.7,
    fit_y: 29.5,
  },
  {
    lane_code: "science",
    x: 70.6,
    y: 28,
    orbit: 110,
    reverse: true,
    sat: [
      { person_key: "Clariz Pillos", x: 60.2, y: 21.8, align: "end" },
      { person_key: "Katherine Leal", x: 76.1, y: 12.2, align: "start" },
      { person_key: "Charisse Macapagal", x: 80.1, y: 37.2, align: "start" },
    ],
    fit_x: 61.6,
    fit_y: 47.8,
  },
  {
    lane_code: "mobilize",
    x: 78,
    y: 66,
    orbit: 100,
    reverse: false,
    sat: [
      {
        person_key: "Sophia Aliza Caverte",
        x: 68,
        y: 60,
        align: "end",
      },
      {
        person_key: "Nathanielle Sophia Alaethea Araneta",
        x: 86,
        y: 78,
        align: "start",
      },
    ],
    open_x: 91,
    open_y: 56,
    fit_x: 70,
    fit_y: 84,
  },
  {
    lane_code: "story",
    x: 30,
    y: 70,
    orbit: 120,
    reverse: true,
    sat: [
      {
        person_key: "Mark Laurence Marquez",
        x: 18,
        y: 70,
        align: "end",
      },
      { person_key: "Ivan Nite", x: 26, y: 54, align: "end" },
      {
        person_key: "Charisse Macapagal",
        x: 42,
        y: 64,
        align: "start",
      },
    ],
    fit_x: 20,
    fit_y: 86,
  },
];

export const mentor_lens = [
  {
    lens_code: "01",
    person_name: "Dr Emma Porio",
    lens_name: "Justice & community agency",
    focus_tag: "VULNERABILITY · URBAN RISK · GENDER",
    frame_question:
      "Who carries the risk, and who was in the room when this was decided?",
    frame_question_short: "Who carries the risk, and who was in the room?",
    accent_color: "#1479C9",
    journey_link: ["LEARN", "DEEPEN"],
    portrait_src: "/portrait/emma-porio.jpg",
  },
  {
    lens_code: "02",
    person_name: "Dr Rodel Lasco",
    lens_name: "Science to action",
    focus_tag: "ECOSYSTEMS · NATURE-BASED SOLUTIONS",
    frame_question:
      "Where does that number come from, and what happens when it's wrong?",
    frame_question_short: "Where does that number come from?",
    accent_color: "#2F7D2A",
    journey_link: ["LEARN", "DEEPEN"],
    portrait_src: "/portrait/rodel-lasco.jpg",
  },
  {
    lens_code: "03",
    person_name: "Ms Vicky Tan",
    lens_name: "Feasibility",
    focus_tag: "PROJECT DEVELOPMENT · RESOURCES",
    frame_question: "Can this run on what you actually have by Sep 12?",
    frame_question_short: "Can this run on what you have by Sep 12?",
    accent_color: "#B87C13",
    journey_link: ["BUILD"],
    portrait_src: "/portrait/vicky-tan.jpg",
  },
];

/** @deprecated use mentor_lens; kept for any residual import */
export const session_expert = mentor_lens.map((item) => ({
  person_name: item.person_name,
  focus: item.focus_tag.toLowerCase().replace(/ · /g, ", "),
  mentor_frame: item.frame_question,
  accent_color: item.accent_color,
}));

export const host_office = {
  person_name: "Dr Leland Joseph R. Dela Cruz",
  role_name: "AVP, SEEDS, Ateneo de Manila",
  role_short: "AVP, SEEDS",
  host_note:
    "Opened the Ateneo opportunity after the CCC invitation and backs the selected cohort.",
  portrait_src: "/portrait/leland-dela-cruz.jpg",
};

export const escort = [
  {
    person_name: "Jack Laurence Cebadero Rivera",
    short_name: "J Love",
    role_name: "Binhi Para mentor, OSCI · day-of lead",
    /** Public professional headshot not found; request approved still from SEEDS */
    portrait_src: null,
  },
  {
    person_name: "Shenina Badua",
    short_name: "Shen",
    role_name: "SEEDS · backup contact when Jack is offline",
    /** Public professional headshot not found; request approved still from SEEDS */
    portrait_src: null,
  },
];

/** @deprecated use escort + host_office */
export const program_escort = [
  {
    person_name: host_office.person_name,
    role_name: "AVP-SEEDS, Ateneo lead",
  },
  ...escort.map((item) => ({
    person_name: item.person_name,
    role_name: item.role_name,
  })),
];
