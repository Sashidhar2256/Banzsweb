const beginner = [
  "Binary and Number Systems", "Logic Gates", "Boolean Simplification", "Combinational Paths", "Flip-Flop Basics",
  "Setup and Hold", "Mux and Decoder Design", "RTL Thinking", "Verilog Modules", "Testbench Basics",
  "FSM Design", "Counters and Registers", "Timing Arcs", "Clock Domains", "Reset Strategy",
  "ASIC Flow Map", "Standard Cells", "Liberty Basics", "LEF Basics", "DEF Basics",
  "Netlist Reading", "Synthesis Inputs", "SDC Basics", "Area and Power Basics", "Mini Digital Block"
];

const intermediate = [
  "Synthesis Optimization", "Clock Constraints", "Generated Clocks", "False Paths", "Multicycle Paths",
  "STA Setup Analysis", "STA Hold Analysis", "Timing Reports", "PVT Corners", "MMMC Views",
  "Floorplan Geometry", "Macro Placement", "Pin Planning", "Placement Density", "Congestion Analysis",
  "Power Ring Planning", "Power Strap Planning", "Tap and Endcap Cells", "Placement Optimization", "Scan Chain Awareness",
  "Clock Tree Concepts", "Clock Buffers", "Skew and Latency", "Global Routing", "Detailed Routing"
];

const advanced = [
  "CTS Debug", "Useful Skew", "Route Layer Strategy", "Via Optimization", "Antenna Effects",
  "DRC Debug", "LVS Debug", "Parasitic Extraction", "SPEF Analysis", "SI Fundamentals",
  "Crosstalk Delay", "Crosstalk Noise", "IR Drop Static", "IR Drop Dynamic", "EM Reliability",
  "ECO Timing Fixes", "ECO Routing Fixes", "Low Power UPF", "Power Domains", "Level Shifters",
  "Isolation Cells", "Retention Cells", "Signoff STA", "Physical Signoff", "Block Closure"
];

const expert = [
  "Chip Integration", "Hierarchical PD", "Top-Level Floorplan", "Clock Mesh Awareness", "Advanced MMMC",
  "AOCV and POCV", "CRPR", "Power Integrity Closure", "Noise Closure", "DFM Awareness",
  "Metal Fill", "Package-Aware Timing", "Low-Power Signoff", "Late-Stage ECO Risk", "Regression Dashboards",
  "Tapeout Checklist", "GDS Handoff", "Foundry Review", "Silicon Bring-Up Link", "Interview Deep Dive",
  "Portfolio Project", "SoC Closure Review", "Backend Lead Simulation", "Production Readiness", "Tapeout Capstone"
];

const groups = [
  { difficulty: "Beginner", start: 1, titles: beginner, baseXp: 100, badge: "Gold Seed" },
  { difficulty: "Intermediate", start: 26, titles: intermediate, baseXp: 160, badge: "Timing Solver" },
  { difficulty: "Advanced", start: 51, titles: advanced, baseXp: 240, badge: "Signoff Builder" },
  { difficulty: "Expert", start: 76, titles: expert, baseXp: 360, badge: "Tapeout Ready" }
];

const topicBank = {
  Beginner: {
    mcq: [
      ["Which element stores state on a clock edge?", ["NAND gate", "Flip-flop", "Inverter", "Tie cell"], 1],
      ["What does setup time protect?", ["Data stability before capture", "Power ring width", "Antenna rules", "Metal density"], 0],
      ["Which file commonly describes timing arcs?", ["Liberty .lib", "GDS", "DEF", "SPEF"], 0]
    ],
    blanks: [
      ["A synchronous path launches from one ______ and captures at another.", "flip-flop"],
      ["A mux selects one of many inputs using a ______ signal.", "select"],
      ["Positive slack means timing is currently ______.", "met"]
    ],
    content: "Foundational circuit behavior matters because physical design tools optimize real timing paths, not abstract diagrams. A beginner should connect Boolean logic to gate delay, flip-flop timing, and simple waveforms. When a signal launches from a source flop, it must pass through combinational logic and arrive at the capture flop early enough for setup and remain stable long enough for hold."
  },
  Intermediate: {
    mcq: [
      ["Which constraint defines a primary timing reference?", ["create_clock", "set_load", "set_dont_touch", "set_units"], 0],
      ["What does DEF primarily capture?", ["Physical placement/routing data", "Cell timing tables", "RTL behavior", "Package pinout only"], 0],
      ["What does MMMC combine?", ["Modes, corners, and analysis views", "Macros only", "Metal fill only", "Mux minterms"], 0]
    ],
    blanks: [
      ["A generated clock is derived from a ______ clock.", "master"],
      ["Placement congestion increases routing detours and timing ______.", "delay"],
      ["A false path is intentionally removed from timing ______.", "analysis"]
    ],
    content: "Intermediate backend work is about constraints and implementation quality. SDC must represent real clocking intent, generated clocks, IO timing, exceptions, and uncertainty. Floorplan and placement choices influence timing by changing wirelength, congestion, buffering needs, and parasitics. The engineer begins correlating reports with layout views."
  },
  Advanced: {
    mcq: [
      ["What is the most direct signoff impact of coupling capacitance?", ["Crosstalk delay/noise", "RTL syntax errors", "Core area only", "Scan chain count"], 0],
      ["Dynamic IR drop is most related to:", ["Simultaneous switching current", "Verilog comments", "LEF site names", "Spare cell labels"], 0],
      ["What is an ECO intended to do?", ["Change/fix late design behavior with minimal disruption", "Restart architecture", "Delete all constraints", "Disable signoff"], 0]
    ],
    blanks: [
      ["Extracted parasitics are often stored in a ______ file.", "SPEF"],
      ["Electromigration risk increases with high current ______.", "density"],
      ["UPF describes low-power intent such as power domains, isolation, and ______.", "retention"]
    ],
    content: "Advanced closure requires understanding silicon behavior behind reports. Coupling capacitance can speed up or slow down victims depending on aggressor switching direction, so SI analysis checks both delay and noise. IR drop reduces effective cell supply voltage, increasing delay and risking functional failure. EM is a long-term reliability problem caused by sustained current density in interconnect. ECO work must preserve timing, DRC, LVS, and low-power intent while changing as little layout as possible."
  },
  Expert: {
    mcq: [
      ["Why is CRPR used in STA?", ["To remove pessimism from shared clock path analysis", "To create metal fill", "To define Verilog states", "To place macros randomly"], 0],
      ["AOCV/POCV models primarily address:", ["Variation across cells, paths, and process conditions", "Logo rendering", "HTML routing", "CSV formatting"], 0],
      ["Tapeout readiness requires:", ["Clean timing, physical verification, power integrity, and approved waivers", "Only a nice floorplan image", "Only RTL simulation", "Only one passing corner"], 0]
    ],
    blanks: [
      ["Top-level integration must close timing across block ______.", "interfaces"],
      ["Metal fill can change capacitance and therefore extracted ______.", "timing"],
      ["A tapeout package commonly includes final GDS, reports, waivers, and signoff ______.", "checklists"]
    ],
    content: "Expert-level physical design is signoff leadership. Hierarchical closure needs clean block contracts, top-level timing budgets, feedthrough planning, clock interaction checks, package-aware constraints, and multi-scenario regressions. Variation-aware STA uses AOCV/POCV and CRPR to reduce false pessimism while preserving silicon safety. Final tapeout readiness is an evidence process: every waiver must be justified, every signoff view must be reproducible, and every late ECO must be traced through extraction, timing, DRC, LVS, IR, EM, and noise."
  }
};

function makeAssignment(group, title, number, index) {
  const bank = topicBank[group.difficulty];
  const mcq = bank.mcq[index % bank.mcq.length];
  const blank = bank.blanks[index % bank.blanks.length];
  const checkpoint = number % 10 === 0 || number === 25 || number === 50 || number === 75 || number === 100;

  return {
    title: `${title} applied lab`,
    instructions: `Study ${title}, interact with the waveform and circuit view, then submit the graded assessment. Passing requires at least 70%.`,
    checkpoint,
    mcq: {
      prompt: mcq[0],
      options: mcq[1],
      answerIndex: mcq[2],
      explanation: `${mcq[1][mcq[2]]} is the correct answer for this ${group.difficulty.toLowerCase()} concept because it directly affects implementation correctness.`
    },
    fillBlank: {
      prompt: blank[0],
      answer: blank[1],
      explanation: `The expected term is "${blank[1]}".`
    },
    assessment: checkpoint ? `Checkpoint assessment: combine this answer with a short review of all levels ${Math.max(group.start, number - 9)}-${number}.` : "Embedded level assessment."
  };
}

export const levels = groups.flatMap((group) =>
  group.titles.map((title, index) => {
    const number = group.start + index;
    const assignment = makeAssignment(group, title, number, index);
    return {
      number,
      title,
      difficulty: group.difficulty,
      concept: title,
      explanation: `${title} is practiced as part of a complete backend physical design flow, connecting concept, tool artifact, and signoff impact. ${topicBank[group.difficulty].content}`,
      practicalAssignment: `Complete a lab note for ${title}, including inputs, commands, checks, and review observations.`,
      expectedOutput: `A clean screenshot/report snippet, a one-page explanation, and a pass/fail checklist for ${title}.`,
      quiz: [
        `What problem does ${title} solve in ASIC implementation?`,
        `Which file, report, or layout view proves ${title} is correct?`,
        `What failure would appear if ${title} is ignored?`
      ],
      miniProject: `Add ${title} evidence into the workshop tapeout readiness workbook.`,
      diagramActivity: `Draw the ${title} data path or physical layout relationship.`,
      waveformActivity: `Sketch timing, clock, or signal behavior connected to ${title}.`,
      interviewQuestion: `Explain ${title} to a physical design interviewer with one practical example.`,
      assignment,
      xp: group.baseXp + index * 8,
      badge: group.badge,
      complete: number <= 4,
      locked: number > 8
    };
  })
);
