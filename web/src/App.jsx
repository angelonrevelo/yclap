import { useState } from "react";
import {
  constellation_well,
  escort,
  host_office,
  lane,
  mentor_lens,
  seat_board,
} from "./data/cohort";
import {
  day_of,
  goal,
  legal_ground,
  output,
  program,
  session,
} from "./data/program";
import { project } from "./data/project";
import "./App.css";
import "./clean.css";

/* Reads as a state, not a grade. "open" is an invitation, not a failure. */
const STATUS_LABEL = {
  live_pilot: "Live pilot",
  live_research: "Live research",
  ready_to_build: "Ready to build",
  open: "Open slot",
};

function LogoMark({ size = 40 }) {
  return (
    <img
      className="logo_mark"
      src="/brand/logo-upright.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

const motif_src = {
  spark: "/brand/motif-spark.svg",
  petal: "/brand/motif-petal.svg",
  loop: "/brand/motif-loop.svg",
  chevron: "/brand/motif-chevron.svg",
  logo: "/brand/logo-upright.svg",
};

function SessionMotif({ motif, size = 20 }) {
  const src = motif_src[motif] ?? motif_src.spark;
  return (
    <img
      className={`session_motif_img session_motif_${motif}`}
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}

function LaneIcon({ lane_code, color = "currentColor", size = 22 }) {
  if (lane_code === "build") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M12 0 L14.4 9.6 L24 12 L14.4 14.4 L12 24 L9.6 14.4 L0 12 L9.6 9.6 Z" />
      </svg>
    );
  }
  if (lane_code === "science") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M0 24 C0 10.7 10.7 0 24 0 C24 13.3 13.3 24 0 24 Z" />
      </svg>
    );
  }
  if (lane_code === "mobilize") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="4"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M4 2 L14 12 L4 22 L10 22 L20 12 L10 2 Z" />
    </svg>
  );
}

function PortraitSlot({ label, accent, photo_src, photo_alt }) {
  if (photo_src) {
    return (
      <div
        className="portrait_slot portrait_slot_filled"
        style={{ "--portrait-accent": accent }}
      >
        <img
          className="portrait_slot_photo"
          src={photo_src}
          alt={photo_alt || label || ""}
          width={600}
          height={800}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }
  return (
    <div
      className="portrait_slot"
      style={{ "--portrait-accent": accent }}
      aria-hidden="true"
    >
      <svg
        className="portrait_slot_x"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="0" x2="100" y2="100" />
        <line x1="100" y1="0" x2="0" y2="100" />
      </svg>
      <div className="portrait_slot_label">
        <span>PORTRAIT SLOT</span>
        {label ? <strong>{label}</strong> : null}
      </div>
    </div>
  );
}

function isSessionPast(session_date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${session_date}T00:00:00`) < today;
}

function SessionTrack({ link_mode = false }) {
  return (
    <ol className="session_track">
      {session.map((item, index) => {
        const body = (
          <>
            <span className="session_node_tile" aria-hidden="true">
              <span className="session_node_face">
                <SessionMotif motif={item.session_motif} />
              </span>
              <span className="session_node_side" />
              <span className="session_node_base" />
            </span>
            <span className="session_node_copy">
              <strong>{item.session_code}</strong>
              <span className="session_node_date">{item.session_label}</span>
              <span className="session_node_cue">{item.session_motif_label}</span>
            </span>
          </>
        );
        return (
          <li
            key={item.session_date}
            className="session_track_item"
            style={{ "--session": item.session_color }}
          >
            {index > 0 ? (
              <span className="session_track_connector" aria-hidden="true" />
            ) : null}
            {link_mode ? (
              <a
                className="session_node"
                href={`#journey-${item.session_code}`}
                aria-label={`${item.session_code}, ${item.session_label}: ${item.session_name}`}
              >
                {body}
              </a>
            ) : (
              <span className="session_node">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ClimbingStack({ expanded_code, onToggle }) {
  return (
    <div className="climb_stack_wrap">
      <div className="climb_stack" role="list">
        {session.map((item) => {
          const is_done = isSessionPast(item.session_date);
          const is_open = expanded_code === item.session_code;
          const is_stage = item.is_stage;
          const Tag = is_stage ? "a" : "button";
          const tag_prop = is_stage
            ? { href: "#lanes" }
            : {
                type: "button",
                onClick: () => onToggle(item.session_code),
                "aria-expanded": is_open,
              };

          return (
            <Tag
              key={item.session_date}
              id={`journey-${item.session_code}`}
              className={`climb_riser${is_stage ? " is_stage" : ""}${is_done ? " is_done" : ""}${is_open ? " is_open" : ""}`}
              style={{
                "--riser-h": `${item.stack_height}px`,
                "--session": item.session_color,
              }}
              role="listitem"
              {...tag_prop}
            >
              <span className="climb_riser_shell">
                <span className="climb_riser_top" aria-hidden="true" />
                <span className="climb_riser_side" aria-hidden="true" />
                <span className="climb_riser_face">
                  <span className="climb_riser_meta">
                    <span className="climb_riser_index">
                      {is_stage
                        ? `${item.session_index} · STAGE`
                        : item.session_index}
                    </span>
                    <SessionMotif
                      motif={item.session_motif}
                      size={is_stage ? 22 : 18}
                    />
                  </span>
                  <span className="climb_riser_body">
                    <span className="climb_riser_date">
                      {item.session_stack_label}
                      {is_done ? (
                        <span className="climb_done_stamp">DONE</span>
                      ) : null}
                    </span>
                    <strong className="climb_riser_code">
                      {item.session_code}
                    </strong>
                    <span className="climb_riser_ends_label">ENDS WITH</span>
                    <span className="climb_riser_ends">{item.ends_with}</span>
                    <span className="climb_riser_who">
                      {item.session_who_short}
                    </span>
                    {is_open ? (
                      <span className="climb_riser_detail">
                        <span>{item.session_detail}</span>
                        <span>
                          {item.session_who} · {item.venue}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </span>
            </Tag>
          );
        })}
      </div>
      <div className="climb_ground">
        <span>GROUND · DAY ZERO</span>
        <span className="climb_ground_mid">
          EACH BLOCK = ONE SATURDAY
        </span>
        <span className="climb_ground_stage">STAGE</span>
      </div>
    </div>
  );
}

function ClimbingStair({ expanded_code, onToggle }) {
  return (
    <div className="climb_stair" role="list">
      {session.map((item) => {
        const is_done = isSessionPast(item.session_date);
        const is_open = expanded_code === item.session_code;
        const is_stage = item.is_stage;
        const Tag = is_stage ? "a" : "button";
        const tag_prop = is_stage
          ? { href: "#lanes" }
          : {
              type: "button",
              onClick: () => onToggle(item.session_code),
              "aria-expanded": is_open,
            };

        return (
          <Tag
            key={item.session_date}
            className={`climb_stair_step${is_stage ? " is_stage" : ""}${is_done ? " is_done" : ""}${is_open ? " is_open" : ""}`}
            style={{ "--session": item.session_color }}
            role="listitem"
            {...tag_prop}
          >
            <span className="climb_stair_meta">
              <span>
                {item.session_index} · {item.session_stack_label}
              </span>
              <SessionMotif motif={item.session_motif} size={16} />
            </span>
            <strong>{item.session_code}</strong>
            <span className="climb_stair_ends">{item.ends_with}</span>
            <span className="climb_stair_who">{item.session_who_short}</span>
            {is_open ? (
              <span className="climb_stair_detail">{item.session_detail}</span>
            ) : null}
          </Tag>
        );
      })}
      <p className="climb_stair_foot">
        ONE BLOCK PER SATURDAY · THE STACK ENDS ON THE STAGE
      </p>
    </div>
  );
}

function SeatPlate({ person, lane_item }) {
  return (
    <div
      className={`seat_plate${person.is_shared ? " is_shared" : ""}${person.is_assumed ? " is_assumed" : ""}`}
    >
      <div className="seat_plate_tags">
        <span
          className={`seat_short${person.is_lead ? " is_lead" : ""}${person.is_assumed ? " is_dotted" : ""}`}
        >
          {person.short_name}
        </span>
        {person.role_tag ? (
          <span className="seat_role">{person.role_tag}</span>
        ) : null}
        {person.also_lane_label ? (
          <span className="seat_also">{person.also_lane_label}</span>
        ) : null}
      </div>
      <strong className="seat_name">{person.person_name}</strong>
      <span className="seat_course" style={{ color: lane_item.lane_color }}>
        {person.course_tag}
      </span>
      <p className="seat_strength">{person.strength}</p>
    </div>
  );
}

function SeatBoard({ focus_lane, onFocus }) {
  return (
    <div className="seat_board">
      {lane.map((item) => {
        const dimmed =
          focus_lane && focus_lane !== item.lane_code ? " is_dim" : "";
        return (
          <div
            key={item.lane_code}
            className={`seat_row${dimmed}${focus_lane === item.lane_code ? " is_focus" : ""}`}
            style={{ "--lane": item.lane_color }}
            onMouseEnter={() => onFocus(item.lane_code)}
            onMouseLeave={() => onFocus(null)}
          >
            <div className="seat_lane_head">
              <div className="seat_lane_num_row">
                <span className="seat_lane_num">{item.lane_number}</span>
                <LaneIcon lane_code={item.lane_code} color={item.lane_color} />
              </div>
              <h3>{item.lane_name}</h3>
              <p className="seat_lane_fit">{item.course_fit_line}</p>
              <span className="seat_lane_out">{item.day_one_label}</span>
            </div>
            <div className="seat_lane_seats">
              {item.member.map((person) => (
                <SeatPlate
                  key={`${item.lane_code}-${person.person_name}`}
                  person={person}
                  lane_item={item}
                />
              ))}
              {item.open_seat ? (
                <div className="seat_plate seat_open">
                  <span className="seat_open_code">
                    SEAT {item.open_seat.seat_code}
                  </span>
                  <span className="seat_open_line" aria-hidden="true" />
                  <p>{item.open_seat.seat_note}</p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SeatBoardMobile() {
  return (
    <div className="seat_board_mobile">
      {lane.map((item) => (
        <div
          key={item.lane_code}
          className="seat_mobile_block"
          style={{ "--lane": item.lane_color }}
        >
          <div className="seat_mobile_head">
            <span className="seat_lane_num">{item.lane_number}</span>
            <strong>{item.lane_name}</strong>
          </div>
          <p className="seat_mobile_out">OUTPUT: {item.day_one_output}</p>
          <ul className="seat_mobile_list">
            {item.member.map((person) => (
              <li key={person.person_name}>
                <span className="seat_mobile_tag">
                  {person.short_name}
                  <br />
                  {person.course_tag}
                </span>
                <span>
                  <strong>{person.person_name}</strong>
                  {person.also_lane_label ? (
                    <em className="seat_also_inline">{person.also_lane_label}</em>
                  ) : null}
                  <br />
                  <span className="seat_mobile_strength">{person.strength}</span>
                </span>
              </li>
            ))}
            {item.open_seat ? (
              <li className="seat_mobile_open">
                <span className="seat_mobile_tag">
                  SEAT {item.open_seat.seat_code}
                </span>
                <span>{item.open_seat.seat_note}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

function memberByName(lane_item, person_name) {
  return lane_item.member.find((m) => m.person_name === person_name);
}

const WELL_SCALE = 1.28;

function LaneConstellation({ focus_lane, onFocus }) {
  return (
    <div className="constellation_stage">
      <div className="constellation" aria-label="Lane constellation">
        <svg
          className="constellation_tie"
          viewBox="0 0 1360 820"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1="1078"
            y1="322"
            x2="648"
            y2="612"
            stroke="#EFA92C"
            strokeWidth="1.5"
            strokeDasharray="6 7"
            opacity="0.85"
          />
        </svg>
        <span className="constellation_tie_label">CHARISSE HOLDS BOTH</span>

        {constellation_well.map((well) => {
          const item = lane.find((l) => l.lane_code === well.lane_code);
          if (!item) return null;
          const dimmed =
            focus_lane && focus_lane !== item.lane_code ? " is_dim" : "";
          const focused = focus_lane === item.lane_code ? " is_focus" : "";
          const well_px = item.well_size * WELL_SCALE;

          return (
            <div
              key={item.lane_code}
              className={`constellation_cluster${dimmed}${focused}`}
              style={{ "--lane": item.lane_color }}
              onMouseEnter={() => onFocus(item.lane_code)}
              onMouseLeave={() => onFocus(null)}
            >
              <div
                className={`constellation_orbit${well.reverse ? " is_reverse" : ""}`}
                style={{
                  left: `${well.x}%`,
                  top: `${well.y}%`,
                  width: well_px * 2,
                  height: well_px * 2,
                  animationDuration: `${well.orbit}s`,
                }}
              />
              <div
                className="constellation_orbit constellation_orbit_inner"
                style={{
                  left: `${well.x}%`,
                  top: `${well.y}%`,
                  width: well_px * 1.45,
                  height: well_px * 1.45,
                }}
              />
              <div
                className="constellation_well"
                style={{
                  left: `${well.x}%`,
                  top: `${well.y}%`,
                  width: well_px,
                  height: well_px,
                }}
              >
                <LaneIcon
                  lane_code={item.lane_code}
                  color={
                    item.lane_code === "mobilize" || item.lane_code === "story"
                      ? "#12211C"
                      : "#0E2B23"
                  }
                  size={22}
                />
                <span className="constellation_well_num">{item.lane_number}</span>
                <strong>{item.lane_name}</strong>
                <em>{item.day_one_output}</em>
              </div>
              {well.sat.map((sat) => {
                const person = memberByName(item, sat.person_key);
                if (!person) return null;
                return (
                  <div
                    key={`${item.lane_code}-${sat.person_key}`}
                    className={`constellation_sat${person.is_shared ? " is_shared" : ""}`}
                    style={{
                      left: `${sat.x}%`,
                      top: `${sat.y}%`,
                      transform:
                        sat.align === "end"
                          ? "translate(-100%, -50%)"
                          : "translate(0, -50%)",
                    }}
                  >
                    <span className="constellation_dot" />
                    <span>
                      <strong>
                        {person.person_name.length > 28
                          ? person.short_name === "NATHANIELLE"
                            ? "Nathanielle Araneta"
                            : person.person_name
                          : person.person_name}
                      </strong>
                      <em>
                        {person.is_shared
                          ? `${person.course_tag} · TWO WELLS`
                          : person.is_lead
                            ? `${person.short_name} · ${person.course_tag} · ${person.role_tag}`
                            : person.course_tag}
                      </em>
                    </span>
                  </div>
                );
              })}
              {well.open_x != null ? (
                <div
                  className="constellation_open"
                  style={{ left: `${well.open_x}%`, top: `${well.open_y}%` }}
                >
                  SEAT OPEN
                </div>
              ) : null}
              <div
                className="constellation_fit"
                style={{ left: `${well.fit_x}%`, top: `${well.fit_y}%` }}
              >
                {item.course_fit_line}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaneConstellationMobile() {
  return (
    <div className="constellation_mobile" aria-label="Lane constellation">
      {lane.map((item) => (
        <div
          key={item.lane_code}
          className="constellation_mobile_row"
          style={{ "--lane": item.lane_color }}
        >
          <div className="constellation_mobile_well_wrap">
            <div className="constellation_mobile_ring" aria-hidden="true" />
            <div className="constellation_mobile_well">
              <span>{item.lane_number}</span>
              <strong>{item.lane_name}</strong>
            </div>
          </div>
          <div className="constellation_mobile_list">
            <em>{item.day_one_output}</em>
            {item.member.map((person) => (
              <p key={person.person_name}>
                <strong>{person.person_name}</strong>{" "}
                <span>
                  {person.is_shared
                    ? "TWO WELLS"
                    : person.is_lead
                      ? `${person.short_name} · ${person.course_tag}`
                      : person.course_tag}
                </span>
              </p>
            ))}
            {item.open_seat ? (
              <p className="constellation_mobile_open">SEAT OPEN</p>
            ) : null}
          </div>
        </div>
      ))}
      <p className="constellation_mobile_foot">
        WELL SIZE = SEATS HELD · GOLD = SHARED PERSON
      </p>
    </div>
  );
}

export default function App() {
  const [expanded_session, setExpandedSession] = useState(null);
  const [focus_seat_lane, setFocusSeatLane] = useState(null);
  const [focus_const_lane, setFocusConstLane] = useState(null);

  function toggleSession(code) {
    setExpandedSession((prev) => (prev === code ? null : code));
  }

  return (
    <div className="page desk_friendly">
      <a className="skip_link" href="#main">
        Skip to content
      </a>

      <header className="clean_bar">
        <a className="clean_brand" href="#top">
          <LogoMark size={36} />
          <span>
            <strong>Youth CLAP</strong>
            <small>Ateneo desk · CCC 2026</small>
          </span>
        </a>
        <nav className="clean_nav" aria-label="Primary">
          <a href="#grounds">Grounds</a>
          <a href="#projects">Projects</a>
          <a href="#journey">Journey</a>
          <a href="#seats">Seats</a>
          <a href="#lanes">Lanes</a>
          <a href="#people">Mentors</a>
        </nav>
        <a className="clean_cta clean_cta_primary" href="#start">
          Bring an idea
        </a>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="hero_canvas" id="top" aria-labelledby="hero_title">
          <div className="hero_photo">
            <div className="hero_photo_veil" aria-hidden="true" />
            <div className="hero_photo_inner">
              <h1 id="hero_title">
                Knowledge into Action.
                <br />
                Youth into <em>Leaders.</em>
              </h1>
            </div>
          </div>

          <div className="hero_sheet">
            <div className="hero_sheet_grid">
              <div>
                <p className="hero_program_name">{program.full_name}</p>
                <p className="hero_description">{program.description}</p>
                <div className="hero_action">
                  <a className="btn btn_ink" href="#journey">
                    See the journey
                  </a>
                  <a className="btn btn_ghost" href="#seats">
                    Cohort seats
                  </a>
                </div>
              </div>
            </div>

            <nav className="hero_session_rail" aria-label="Program journey">
              <SessionTrack link_mode />
            </nav>
          </div>
        </section>

        {/* Grounds */}
        <section
          className="section section_grounds"
          id="grounds"
          aria-labelledby="grounds_title"
        >
          <div className="grounds_intro">
            <h2 id="grounds_title">The mandate already exists.</h2>
            <p className="section_lead">
              What&apos;s missing is proof at barangay scale. These instruments
              are live. Student pilots fill the evidence gap.
            </p>
          </div>

          <ol className="policy_stack" aria-label="Policy instruments">
            {legal_ground.map((item, index) => (
              <li
                key={item.ground_code}
                className="policy_layer"
                style={{ "--layer": item.accent_color }}
              >
                <span className="policy_index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="policy_copy">
                  <p className="policy_short">{item.short_label}</p>
                  <h3>{item.ground_name}</h3>
                  <p className="policy_note">{item.ground_note}</p>
                  <p className="policy_link">
                    <span>Student link</span>
                    {item.student_link}
                  </p>
                  <ul className="policy_source_list">
                    {(item.source ?? []).map((src) => (
                      <li key={src.source_url}>
                        <a
                          href={src.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="policy_source_kind">
                            {src.source_kind}
                          </span>
                          <span className="policy_source_name">
                            {src.source_name}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          <div className="ship_pipeline_block">
            <h3 className="block_title">What we ship</h3>
            <ol className="ship_pipeline" aria-label="Required outputs">
              {output.map((item, index) => (
                <li key={item.output_name}>
                  {index > 0 ? (
                    <span className="ship_pipeline_join" aria-hidden="true" />
                  ) : null}
                  <span className="ship_pipeline_node">
                    <span className="ship_step_num">{index + 1}</span>
                    <strong>{item.output_name}</strong>
                    <span>{item.output_note}</span>
                  </span>
                </li>
              ))}
            </ol>
            <h3 className="block_title block_title_space">What we practice</h3>
            <ul className="practice_badge_row">
              {goal.map((item) => (
                <li key={item.goal_name}>
                  <strong>{item.goal_name}</strong>
                  <span>{item.goal_note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Project rack — what the desk is actually building.
            `data/project.js` shipped unrendered for weeks while the README
            claimed a rack existed. This is the rack. */}
        <section
          className="section section_paper section_rack"
          id="projects"
          aria-labelledby="projects_title"
        >
          <div className="section_head_row">
            <div>
              <h2 id="projects_title">What the desk is building.</h2>
            </div>
            <p className="section_side_note">
              {project.filter((p) => p.can_demo).length} demoable now
              <br />
              {/* Not "ready to build" — three of these have been ready since
                  August. What they are short of is a person, and a status
                  board should say the true thing. */}
              <span className="text_alert">
                {project.filter((p) => p.project_status === "ready_to_build").length} waiting on an owner
              </span>
            </p>
          </div>

          <ul className="rack_grid">
            {project.map((row) => (
              <li key={row.project_code} className={`rack_card rack_${row.rack_span}`}>
                <div className="rack_card_head">
                  <h3>{row.project_name}</h3>
                  <span className={`rack_status rack_status_${row.project_status}`}>
                    {STATUS_LABEL[row.project_status] ?? row.project_status}
                  </span>
                </div>
                <p className="rack_tagline">{row.project_tagline}</p>
                <p className="rack_blurb">{row.project_blurb}</p>

                {row.metric_label?.length ? (
                  <ul className="rack_metric">
                    {row.metric_label.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="rack_foot">
                  <span className="rack_stack">{row.stack_label}</span>
                  <span className="rack_sdg">
                    {row.sdg_code.map((n) => (
                      <span key={n}>SDG {n}</span>
                    ))}
                  </span>
                </div>

                {/* The honest half. Every row says what it still needs, because
                    a rack of green ticks is a brochure, not a status board. */}
                {row.improvement?.length ? (
                  <ul className="rack_gap">
                    {row.improvement.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* Journey */}
        <section
          className="section section_paper section_climb"
          id="journey"
          aria-labelledby="journey_title"
        >
          <div className="section_head_row">
            <div>
              <h2 id="journey_title">
                You climb it. Every step ends with something you can put on a
                table.
              </h2>
            </div>
            <p className="section_side_note">
              Aug 15 → Sep 12
              <br />
              <span className="text_alert">Sep 12 is fixed</span>
            </p>
          </div>

          <ul className="day_of_row" aria-label="Day-of logistics">
            {day_of.map((item) => (
              <li key={item.day_of_label}>
                <strong>{item.day_of_label}</strong>
                <span>{item.day_of_note}</span>
              </li>
            ))}
          </ul>

          <div className="climb_desktop">
            <ClimbingStack
              expanded_code={expanded_session}
              onToggle={toggleSession}
            />
          </div>
          <div className="climb_mobile">
            <ClimbingStair
              expanded_code={expanded_session}
              onToggle={toggleSession}
            />
          </div>
        </section>

        {/* Seats */}
        <section
          className="section section_paper section_seats"
          id="seats"
          aria-labelledby="seats_title"
        >
          <div className="section_head_row">
            <div>
              <h2 id="seats_title">{seat_board.title}</h2>
            </div>
            <p className="section_side_note">
              4 lanes · 11 seats · 10 people
              <br />
              <span className="text_alert">1 shared seat</span>
            </p>
          </div>

          <div className="seat_desktop">
            <SeatBoard
              focus_lane={focus_seat_lane}
              onFocus={setFocusSeatLane}
            />
          </div>
          <div className="seat_mobile">
            <SeatBoardMobile />
          </div>

          <div className="seat_legend">
            {seat_board.note.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>

        {/* Constellation */}
        <section
          className="section section_paper section_constellation"
          id="lanes"
          aria-labelledby="lanes_title"
        >
          <div className="section_head_row">
            <div>
              <h2 id="lanes_title">Four lanes pull on the same Saturday.</h2>
            </div>
            <p className="section_side_note">
              Well size = seats held
              <br />
              <span className="text_gold_ink">Dashed tie = shared person</span>
            </p>
          </div>

          <div className="constellation_desktop">
            <LaneConstellation
              focus_lane={focus_const_lane}
              onFocus={setFocusConstLane}
            />
          </div>
          <div className="constellation_mobile_wrap">
            <LaneConstellationMobile />
          </div>
        </section>

        {/* Mentors */}
        <section
          className="section section_paper"
          id="people"
          aria-labelledby="people_title"
        >
          <div className="section_head_row">
            <div>
              <h2 id="people_title">
                Three people will read your work. Each one reads it differently.
              </h2>
            </div>
          </div>

          <div className="mentor_wall">
            {mentor_lens.map((person) => (
              <article
                key={person.person_name}
                className="mentor_nameplate"
                style={{ "--mentor": person.accent_color }}
              >
                <div className="mentor_portrait">
                  <PortraitSlot
                    label={person.person_name.toUpperCase()}
                    accent={person.accent_color}
                    photo_src={person.portrait_src}
                    photo_alt={person.person_name}
                  />
                </div>
                <div className="mentor_nameplate_body">
                  <p className="mentor_lens_name">{person.lens_name}</p>
                  <h3>{person.person_name}</h3>
                  <p className="mentor_focus_tag">{person.focus_tag}</p>
                  <hr />
                  <p className="mentor_question">“{person.frame_question}”</p>
                </div>
              </article>
            ))}
          </div>

          <div className="host_bar">
            <div className="host_office">
              {host_office.portrait_src ? (
                <div className="host_portrait host_portrait_filled">
                  <img
                    src={host_office.portrait_src}
                    alt={host_office.person_name}
                    width={600}
                    height={800}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <div className="host_portrait" aria-hidden="true">
                  <span>
                    PORTRAIT
                    <br />
                    3:4
                  </span>
                </div>
              )}
              <div>
                <p className="host_label">SEEDS</p>
                <h3>{host_office.person_name}</h3>
                <p className="host_role">{host_office.role_name}</p>
                <p className="host_note">{host_office.host_note}</p>
              </div>
            </div>
            <div className="host_escort">
              <p className="host_label host_label_muted">Day-of contacts</p>
              <div className="escort_row">
                {escort.map((person) => (
                  <div key={person.person_name} className="escort_card">
                    {person.portrait_src ? (
                      <div className="escort_avatar escort_avatar_filled">
                        <img
                          src={person.portrait_src}
                          alt={person.person_name}
                          width={80}
                          height={80}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className="escort_avatar" aria-hidden="true">
                        1:1
                      </div>
                    )}
                    <div>
                      <strong>
                        {person.short_name
                          ? `${person.short_name} · ${person.person_name}`
                          : person.person_name}
                      </strong>
                      <span>{person.role_name}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="escort_note">
                Jack runs day-of logistics (assembly, transport, safety). Shen
                is the backup if he is offline. Message him on Messenger for the
                cohort group chat.
              </p>
            </div>
          </div>

        </section>
      </main>

      <footer className="site_footer" id="start">
        <div className="site_footer_inner">
          <div className="site_footer_cta">
            <h2>Got a climate problem?</h2>
            <p>
              From your org, barangay, or lab, drop it into a lane. We shape a
              pilot that fits five weeks and still represents what Filipino
              youth can ship.
            </p>
            <a className="site_footer_mail" href="mailto:seeds@ateneo.edu">
              seeds@ateneo.edu
            </a>
          </div>

          <div className="site_footer_base">
            <div className="site_footer_brand">
              <LogoMark size={36} />
              <div>
                <strong>{program.short_name}, Ateneo desk</strong>
                <p>{program.description}</p>
              </div>
            </div>
            <nav className="site_footer_links" aria-label="Footer">
              <a href="#grounds">Policy sources</a>
              <a href="#journey">Journey</a>
              <a href="#seats">Seats</a>
              <a
                href="https://climate.gov.ph/"
                target="_blank"
                rel="noreferrer"
              >
                climate.gov.ph
              </a>
              <a href="mailto:seeds@ateneo.edu">seeds@ateneo.edu</a>
            </nav>
            <p className="site_footer_meta">
              {program.host}. Aug to Sep 2026.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
