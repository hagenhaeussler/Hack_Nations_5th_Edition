import { createHash } from "node:crypto";

import {
  calculateOverallScore,
  getBenchmarkRepo,
} from "./benchmarkRepo.js";
import {
  BENCHMARK_SCORE_KEYS,
  type BenchmarkScoreKey,
  type BenchmarkScores,
  type StructuredBenchmarkInsight,
} from "./benchmarkTypes.js";
import { getPool } from "./db.js";
import type {
  CalendarLayout,
  FinalExperimentPlan,
  FinalPlanCalendarPosition,
  FinalPlanEdge,
  FinalPlanNode,
  FinalPlanResource,
  Paper,
  ProjectStatsReport,
  ScheduledTask,
  WeekGroup,
  Workflow,
} from "./projectTypes.js";
import { getProjectsRepo } from "./projectsRepo.js";

const DEMO_BENCHMARK_SEED_ID = "medical-prompts-benchmark-v1";
const DEMO_MODEL_NAME = "creator-agent-demo-seed";
const BASE_DATE = new Date(Date.UTC(2026, 0, 5, 9, 0, 0));

interface MedicalPromptSpec {
  title: string;
  prompt: string;
}

interface DemoBenchmarkEntry {
  promptNumber: number;
  projectId: string;
  evaluationId: string;
  insightId: string;
  projectTitle: string;
  description: string;
  hypothesis: string;
  papers: Paper[];
  plan: FinalExperimentPlan;
  workflow: Workflow;
  scores: BenchmarkScores;
  overallScore: number;
  writtenFeedback: string;
  structuredInsight: StructuredBenchmarkInsight;
  createdAt: string;
}

const MEDICAL_PROMPTS: MedicalPromptSpec[] = [
  {
    title: "LVAD pressure-flow characterization in a mock circulatory loop",
    prompt: "I want to evaluate the hydraulic performance of a prototype continuous-flow LVAD in an adult left-heart mock circulatory loop. The goal is to generate pressure-flow curves across several pump speeds and determine whether the device can maintain physiologically relevant flow under simulated heart-failure and near-normal loading conditions. The experiment should measure flow rate, inlet pressure, outlet pressure, pressure head, pump speed, power consumption, and temperature. I also want to compare the new prototype against our previous-generation pump under matched loop conditions.",
  },
  {
    title: "Adaptive LVAD controller under changing afterload",
    prompt: "I want to test whether an adaptive-speed LVAD control algorithm maintains more stable flow than a fixed-speed controller during sudden increases in systemic resistance. The study should be run in a mock circulatory loop where afterload can be changed in a controlled way. The main outcome is flow stability after the afterload change, but I also want to monitor inlet pressure, outlet pressure, pump speed, power, and any suction-risk indicators. The comparator should be the same pump operated with a fixed-speed controller.",
  },
  {
    title: "Suction-event detection in a simulated left ventricle",
    prompt: "I want to evaluate whether our LVAD control software can detect early signs of ventricular suction in a mock left-ventricle setup. The experiment should simulate reduced preload conditions and test whether pressure and flow waveforms can identify suction-like events before severe flow collapse occurs. The plan should include a way to gradually reduce filling pressure or mock ventricular volume, define measurable suction-risk criteria, and compare the algorithm's detection performance against manually labeled events from sensor data.",
  },
  {
    title: "Hemolysis-readiness screen for a centrifugal blood pump",
    prompt: "I want to design a preclinical benchtop experiment to determine whether our centrifugal heart-assist pump is ready for formal hemolysis testing. The goal is not to make clinical claims, but to identify whether any operating conditions create unusually high blood-damage risk. The study should use a recirculating loop, include a worst-case pressure-flow operating point, and compare the prototype against a baseline pump geometry. The plan should specify what blood-damage readouts or proxy measurements would be needed before moving into a formal hemolysis protocol.",
  },
  {
    title: "Inlet cannula geometry comparison for LVAD flow stability",
    prompt: "I want to compare two inlet cannula geometries for a heart-assist pump in a mock left-ventricle model. The goal is to determine which geometry produces more stable inflow, lower pressure drop, and fewer low-flow or stagnation regions. The experiment should use the same pump, same loop conditions, and same target operating points for both cannula designs. I want the plan to include pressure, flow, and visualization or simulation-based evidence where appropriate.",
  },
  {
    title: "Effect of test-fluid viscosity on LVAD performance curves",
    prompt: "I want to study how test-fluid viscosity affects measured LVAD pressure-flow curves in a mock circulatory loop. The same pump should be tested with at least two fluid conditions that represent different viscosity ranges. The main outcome is whether the measured pump curve changes meaningfully with fluid properties. The plan should include fluid characterization, temperature control, sensor calibration, and a way to avoid confusing fluid-property effects with true pump-design differences.",
  },
  {
    title: "Pressure sensor validation inside an artificial-heart loop",
    prompt: "I want to validate miniature pressure sensors integrated into an artificial-heart test loop. The goal is to determine whether the embedded sensors accurately track pressure across relevant operating conditions compared with calibrated reference sensors. The experiment should cover low, normal, and high pressure ranges, include dynamic pressure changes, and quantify accuracy, drift, response time, and repeatability. I want the plan to include acceptance criteria suitable for engineering validation.",
  },
  {
    title: "Flow sensor validation for heart-assist pump monitoring",
    prompt: "I want to test a compact flow sensor intended for real-time monitoring in a heart-assist pump system. The sensor should be evaluated in a benchtop circulatory loop against a calibrated reference flow meter. The experiment should measure accuracy over a range of flow rates and pump speeds, including steady and transient flow conditions. The final plan should include calibration, uncertainty analysis, and possible failure modes such as sensor drift or signal noise.",
  },
  {
    title: "Pump performance during transient preload reduction",
    prompt: "I want to evaluate how a continuous-flow LVAD prototype responds to a sudden reduction in preload, simulating reduced venous return or underfilling of the left ventricle. The goal is to assess flow stability and identify unsafe operating regions. The mock circulatory loop should allow controlled reduction in inlet pressure or ventricular filling. The plan should measure flow, inlet pressure, outlet pressure, pump speed, and recovery behavior after the preload challenge.",
  },
  {
    title: "CFD-to-bench validation of a centrifugal pump design",
    prompt: "I want to validate CFD predictions for a new centrifugal blood pump design using benchtop pressure-flow measurements. The CFD model predicts pressure head and regions of high shear at several pump speeds. The experiment should compare simulated and measured pressure-flow curves under matched boundary conditions. The plan should include how to handle model uncertainty, sensor uncertainty, and what level of agreement would be considered acceptable.",
  },
  {
    title: "Early thrombogenicity-risk assessment for pump housing design",
    prompt: "I want to evaluate whether a new blood-contacting pump housing design creates regions of thrombogenicity risk before moving to animal testing. The focus should be on benchtop and computational evidence, not clinical validation. The study should identify possible low-flow regions, stagnation zones, recirculation areas, and high-shear regions. I want the plan to include what in-vitro markers or additional tests could support the engineering assessment.",
  },
  {
    title: "Surface coating comparison for blood-contacting pump components",
    prompt: "I want to compare two candidate surface coatings for a blood-contacting component inside a heart-assist pump. The goal is to determine which coating shows better hemocompatibility-related behavior in an in-vitro screening experiment. The plan should include a comparator material, exposure conditions, relevant blood-contact markers, and a way to separate surface effects from flow-condition effects. The study should be positioned as early-stage preclinical screening.",
  },
  {
    title: "Durability screening of a miniature cardiac assist pump",
    prompt: "I want to design an engineering-validation experiment to screen the short-term durability of a miniature cardiac assist pump under continuous operation. The goal is to identify mechanical or performance degradation before longer durability testing. The pump should run in a benchtop loop at representative pressure-flow conditions. The plan should track flow, pressure head, speed, power consumption, temperature, vibration or noise if relevant, and performance drift over time.",
  },
  {
    title: "Heat generation in an implantable pump motor",
    prompt: "I want to test whether the motor of an implantable heart-assist pump creates problematic heat buildup during continuous operation. The study should be done in a benchtop environment using a fluid loop or thermal phantom. The main outcomes are temperature rise near the motor housing, fluid temperature change, and relationship between pump speed, power consumption, and heat generation. The plan should include safety limits, sensor placement, and calibration.",
  },
  {
    title: "Power consumption mapping for LVAD operating modes",
    prompt: "I want to map the power consumption of a prototype LVAD across different operating modes in a mock circulatory loop. The goal is to understand how pump speed and pressure-flow conditions affect power demand. The study should produce a power-performance map that includes pump speed, flow, pressure head, and motor power. I want to compare normal operation, high-afterload operation, and low-preload operation.",
  },
  {
    title: "Pulsatility restoration with speed modulation",
    prompt: "I want to test whether speed modulation in a continuous-flow LVAD can increase arterial pressure pulsatility in a mock circulatory loop. The control strategy should be compared with constant-speed operation. The experiment should measure pressure pulsatility, mean flow, pressure head, pump speed, and power consumption. The plan should also check whether speed modulation introduces unsafe flow instability or suction-risk conditions.",
  },
  {
    title: "Mock circulatory loop repeatability study",
    prompt: "I want to evaluate the repeatability of our mock circulatory loop before using it for LVAD prototype testing. The goal is to determine whether the loop produces consistent pressure-flow conditions across repeated runs. The plan should include repeated measurements at predefined operating points, calibration before each run, and quantification of run-to-run variability in pressure, flow, and temperature. This is a validation of the test platform, not the pump itself.",
  },
  {
    title: "Comparator study between two pump impeller designs",
    prompt: "I want to compare two impeller designs for a centrifugal heart-assist pump. The goal is to determine which design achieves better pressure generation and efficiency at the same pump speed and loop conditions. The experiment should use a mock circulatory loop and compare pressure head, flow rate, power consumption, estimated hydraulic efficiency, and stability across multiple operating points. The plan should make sure the comparison is fair and controlled.",
  },
  {
    title: "Outflow graft resistance sensitivity study",
    prompt: "I want to study how increased outflow graft resistance affects LVAD performance in a benchtop circulatory loop. The goal is to simulate partial obstruction or higher downstream resistance and determine how pump flow and pressure head respond. The experiment should test several resistance levels and pump speeds. The plan should include pressure measurements upstream and downstream of the resistance element, flow measurement, and safety limits for excessive pressure.",
  },
  {
    title: "Inflow obstruction detection using pump signals",
    prompt: "I want to test whether pump electrical and hydraulic signals can detect partial inflow obstruction in a heart-assist pump system. The experiment should simulate different degrees of inflow restriction in a controlled benchtop loop. The main outcomes are changes in flow, inlet pressure, pump speed, power, and waveform features. I want the plan to include a comparator baseline with no obstruction and define how detection performance will be evaluated.",
  },
  {
    title: "Air-bubble sensitivity test for flow measurement",
    prompt: "I want to evaluate how small air bubbles in the loop affect flow-sensor readings in a heart-assist pump test setup. The goal is to understand whether sensor artifacts could be mistaken for pump-performance changes. The study should compare flow-sensor readings against a reference measurement under controlled bubble-introduction conditions. The plan should include safety precautions, bubble detection or removal strategy, and criteria for excluding invalid data.",
  },
  {
    title: "Controller response to simulated exercise demand",
    prompt: "I want to evaluate whether an LVAD controller can increase flow appropriately during simulated exercise demand in a mock circulatory loop. The loop should mimic increased venous return and reduced systemic resistance compared with resting conditions. The experiment should compare fixed-speed and adaptive control modes. The main outcomes are flow response, pressure stability, pump speed adjustment, power consumption, and avoidance of unsafe operating conditions.",
  },
  {
    title: "Pediatric VAD benchtop scaling study",
    prompt: "I want to adapt a mock circulatory loop experiment for a smaller pediatric VAD prototype. The goal is to test whether the pump can operate at lower flow ranges while maintaining appropriate pressure head and stable operation. The plan should clearly distinguish pediatric-scale assumptions from adult LVAD assumptions. It should include target flow ranges, pressure conditions, fluid properties, sensor selection, and comparator or baseline testing.",
  },
  {
    title: "Emergency shutoff behavior under sensor failure",
    prompt: "I want to test the safety behavior of a heart-assist pump controller when a pressure or flow sensor fails. The experiment should be done in a benchtop loop and should not involve animal or human testing. The plan should simulate sensor dropout, frozen sensor values, noisy readings, and impossible values. The main outcome is whether the controller enters a safe state without creating dangerous pressure or flow conditions.",
  },
  {
    title: "Long-duration drift of embedded pressure sensors",
    prompt: "I want to measure long-duration drift of embedded pressure sensors used in an artificial-heart test system. The sensors should be installed in a fluid loop and compared against reference sensors over an extended benchtop run. The plan should track zero drift, span drift, temperature dependence, and signal noise over time. The study should include pre-test and post-test calibration and define how much drift is acceptable for engineering use.",
  },
  {
    title: "Pump priming and de-airing procedure validation",
    prompt: "I want to validate a priming and de-airing procedure for a prototype heart-assist pump and mock circulatory loop. The goal is to reduce trapped air before performance or hemocompatibility experiments. The plan should define how air will be detected, what steps are used to remove it, and how successful priming will be confirmed. The study should include repeatability across multiple setup runs and document failure modes.",
  },
  {
    title: "High-shear operating condition identification",
    prompt: "I want to identify operating conditions in a prototype blood pump that may produce elevated shear exposure. The study should combine benchtop pressure-flow testing with CFD or another flow-analysis method. The goal is to flag speed and pressure-flow combinations that may require additional hemolysis or thrombogenicity evaluation. The plan should not claim clinical safety, but should identify engineering risk regions.",
  },
  {
    title: "Mock ventricular compliance sensitivity study",
    prompt: "I want to test how different mock-ventricle compliance settings affect LVAD performance measurements in a left-heart mock circulatory loop. The goal is to understand whether loop compliance changes the interpretation of pump behavior. The experiment should run the same pump at the same speed settings under multiple compliance conditions. The plan should measure pressure waveforms, flow, pressure head, and any changes in transient behavior.",
  },
  {
    title: "Data acquisition rate requirement for transient pump testing",
    prompt: "I want to determine the minimum data acquisition rate needed to capture transient events in a heart-assist pump test loop. The experiment should compare measurements collected at different sampling rates during afterload and preload perturbations. The main outcome is whether lower sampling rates miss important pressure, flow, or controller-response features. The plan should define the transient events, reference sampling condition, and metrics for information loss.",
  },
  {
    title: "Integrated benchtop verification of a heart-assist pump subsystem",
    prompt: "I want to design an integrated benchtop verification experiment for a heart-assist pump subsystem that includes the pump, motor controller, pressure sensors, flow sensor, and safety shutoff logic. The goal is to verify basic functionality before more specialized hemocompatibility or durability testing. The experiment should run the subsystem in a mock circulatory loop under normal, high-afterload, low-preload, and simulated sensor-failure conditions. The plan should include performance metrics, safety criteria, calibration steps, and clear boundaries about what this test can and cannot prove.",
  },
];

export async function seedDemoBenchmarkData(): Promise<void> {
  const pool = getPool();
  if (pool) {
    await seedPostgresDemoData(pool);
    return;
  }

  await seedMemoryDemoData();
}

async function seedPostgresDemoData(pool: NonNullable<ReturnType<typeof getPool>>): Promise<void> {
  const entries = MEDICAL_PROMPTS.map((prompt, index) =>
    buildDemoEntry(prompt, index, deterministicUuid(`project:${DEMO_BENCHMARK_SEED_ID}:${index + 1}`)),
  );

  await pool.query("BEGIN");
  try {
    for (const entry of entries) {
      await pool.query(
        `INSERT INTO projects (
           id, hypothesis, title, description, status, papers, final_plan,
           workflow, setup_warnings, generation_mode, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, 'ready', $5::jsonb, $6::jsonb,
                 $7::jsonb, '[]'::jsonb, 'openai', $8, $8)
         ON CONFLICT (id) DO UPDATE
            SET hypothesis = EXCLUDED.hypothesis,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                status = EXCLUDED.status,
                papers = EXCLUDED.papers,
                final_plan = EXCLUDED.final_plan,
                workflow = EXCLUDED.workflow,
                setup_warnings = EXCLUDED.setup_warnings,
                generation_mode = EXCLUDED.generation_mode,
                updated_at = EXCLUDED.updated_at`,
        [
          entry.projectId,
          entry.hypothesis,
          entry.projectTitle,
          entry.description,
          JSON.stringify(entry.papers),
          JSON.stringify(entry.plan),
          JSON.stringify(entry.workflow),
          entry.createdAt,
        ],
      );

      await pool.query(
        `INSERT INTO plan_versions (
           version_id, plan_id, version_number, version_type, created_at,
           created_by, graph_snapshot, stats_report_snapshot, parent_version_id,
           change_event_ids
         )
         VALUES ($1, $2, 1, 'creator_generated', $3, 'creator_agent',
                 $4::jsonb, $5::jsonb, NULL, '[]'::jsonb)
         ON CONFLICT (plan_id, version_number) DO UPDATE
            SET graph_snapshot = EXCLUDED.graph_snapshot,
                stats_report_snapshot = EXCLUDED.stats_report_snapshot`,
        [
          `ver_${entry.projectId}`,
          entry.projectId,
          entry.createdAt,
          JSON.stringify(entry.workflow),
          JSON.stringify(entry.plan.stats_report),
        ],
      );

      await pool.query(
        `INSERT INTO benchmark_evaluations (
           id, trial_id, project_id, plan_id, project_title, plan_title, hypothesis,
           domain, experiment_type, generation_mode, model_name, overall_score,
           timing_estimate_accuracy, sequential_scheduling_logic, procedure_correctness,
           budget_estimate_accuracy, equipment_personnel_accuracy, citation_quality,
           validation_criteria_quality, written_feedback, scores_json, metadata, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'openai', $10, $11,
                 $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb, $22)
         ON CONFLICT (id) DO UPDATE
            SET trial_id = EXCLUDED.trial_id,
                project_id = EXCLUDED.project_id,
                plan_id = EXCLUDED.plan_id,
                project_title = EXCLUDED.project_title,
                plan_title = EXCLUDED.plan_title,
                hypothesis = EXCLUDED.hypothesis,
                domain = EXCLUDED.domain,
                experiment_type = EXCLUDED.experiment_type,
                generation_mode = EXCLUDED.generation_mode,
                model_name = EXCLUDED.model_name,
                overall_score = EXCLUDED.overall_score,
                timing_estimate_accuracy = EXCLUDED.timing_estimate_accuracy,
                sequential_scheduling_logic = EXCLUDED.sequential_scheduling_logic,
                procedure_correctness = EXCLUDED.procedure_correctness,
                budget_estimate_accuracy = EXCLUDED.budget_estimate_accuracy,
                equipment_personnel_accuracy = EXCLUDED.equipment_personnel_accuracy,
                citation_quality = EXCLUDED.citation_quality,
                validation_criteria_quality = EXCLUDED.validation_criteria_quality,
                written_feedback = EXCLUDED.written_feedback,
                scores_json = EXCLUDED.scores_json,
                metadata = EXCLUDED.metadata,
                created_at = EXCLUDED.created_at`,
        [
          entry.evaluationId,
          `trial_${String(entry.promptNumber).padStart(3, "0")}`,
          entry.projectId,
          entry.plan.plan_id,
          entry.projectTitle,
          entry.plan.experiment_title,
          entry.hypothesis,
          entry.plan.domain,
          entry.plan.experiment_type,
          DEMO_MODEL_NAME,
          entry.overallScore,
          entry.scores.timing_estimate_accuracy,
          entry.scores.sequential_scheduling_logic,
          entry.scores.procedure_correctness,
          entry.scores.budget_estimate_accuracy,
          entry.scores.equipment_personnel_accuracy,
          entry.scores.citation_quality,
          entry.scores.validation_criteria_quality,
          entry.writtenFeedback,
          JSON.stringify(entry.scores),
          JSON.stringify(seedMetadata(entry)),
          entry.createdAt,
        ],
      );

      await pool.query("DELETE FROM benchmark_insights WHERE evaluation_id = $1", [
        entry.evaluationId,
      ]);
      await pool.query(
        `INSERT INTO benchmark_insights (
           id, evaluation_id, project_id, plan_id, domain, experiment_type,
           insight_text, structured_insight, category_tags, applies_to, confidence,
           created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)`,
        [
          entry.insightId,
          entry.evaluationId,
          entry.projectId,
          entry.plan.plan_id,
          entry.plan.domain,
          entry.plan.experiment_type,
          entry.writtenFeedback,
          JSON.stringify(entry.structuredInsight),
          JSON.stringify(entry.structuredInsight.category_tags),
          entry.structuredInsight.applies_to,
          entry.structuredInsight.confidence,
          entry.createdAt,
        ],
      );
    }
    await pool.query("COMMIT");
    console.log(`[labpilot] seeded ${entries.length} demo benchmark evaluations`);
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

async function seedMemoryDemoData(): Promise<void> {
  const benchmarkRepo = getBenchmarkRepo();
  const existing = await benchmarkRepo.listEvaluations();
  if (
    existing.some(
      (evaluation) => evaluation.metadata?.["seed_id"] === DEMO_BENCHMARK_SEED_ID,
    )
  ) {
    return;
  }

  const projectsRepo = getProjectsRepo();
  for (const [index, prompt] of MEDICAL_PROMPTS.entries()) {
    const created = await projectsRepo.create({
      hypothesis: prompt.prompt,
      title: prompt.title,
      description: descriptionForPrompt(prompt.prompt),
    });
    const entry = buildDemoEntry(prompt, index, created.id);
    await projectsRepo.attachPapers(created.id, entry.papers);
    await projectsRepo.attachFinalPlan(created.id, entry.plan, entry.workflow, [], "openai");
    await benchmarkRepo.saveEvaluation({
      context: {
        project_id: created.id,
        plan_id: entry.plan.plan_id,
        project_title: entry.projectTitle,
        plan_title: entry.plan.experiment_title,
        hypothesis: entry.hypothesis,
        domain: entry.plan.domain,
        experiment_type: entry.plan.experiment_type,
        generation_mode: "openai",
        model_name: DEMO_MODEL_NAME,
      },
      scores: entry.scores,
      written_feedback: entry.writtenFeedback,
      metadata: seedMetadata(entry),
    });
  }
  console.log(`[labpilot] seeded ${MEDICAL_PROMPTS.length} in-memory demo benchmark evaluations`);
}

function buildDemoEntry(
  prompt: MedicalPromptSpec,
  index: number,
  projectId: string,
): DemoBenchmarkEntry {
  const promptNumber = index + 1;
  const createdAt = addDays(BASE_DATE, index).toISOString();
  const startDate = isoDate(addDays(BASE_DATE, index));
  const planId = `plan_${deterministicUuid(`plan:${DEMO_BENCHMARK_SEED_ID}:${promptNumber}`)}`;
  const papers = papersForPrompt(prompt, promptNumber);
  const plan = buildFinalPlan({
    prompt,
    promptNumber,
    projectId,
    planId,
    createdAt,
    startDate,
    papers,
  });
  const workflow = workflowFromPlan(plan);
  const targetScore = roundOne(62 + (22 * index) / (MEDICAL_PROMPTS.length - 1));
  const scores = scoresForTarget(targetScore, index);
  const overallScore = calculateOverallScore(scores);
  const writtenFeedback = feedbackForScore(prompt.title, index);
  const structuredInsight = structuredInsightForFeedback(writtenFeedback, scores);

  return {
    promptNumber,
    projectId,
    evaluationId: deterministicUuid(`evaluation:${DEMO_BENCHMARK_SEED_ID}:${promptNumber}`),
    insightId: deterministicUuid(`insight:${DEMO_BENCHMARK_SEED_ID}:${promptNumber}`),
    projectTitle: prompt.title,
    description: descriptionForPrompt(prompt.prompt),
    hypothesis: prompt.prompt,
    papers,
    plan,
    workflow,
    scores,
    overallScore,
    writtenFeedback,
    structuredInsight,
    createdAt,
  };
}

function buildFinalPlan(input: {
  prompt: MedicalPromptSpec;
  promptNumber: number;
  projectId: string;
  planId: string;
  createdAt: string;
  startDate: string;
  papers: Paper[];
}): FinalExperimentPlan {
  const experimentType = classifyExperimentType(input.prompt.title, input.prompt.prompt);
  const outcome = primaryOutcome(input.prompt.title, input.prompt.prompt);
  const taskSpecs = [
    {
      key: "protocol",
      name: "Define protocol, operating matrix, and safety limits",
      purpose: `Translate the prompt into controlled benchtop conditions for ${outcome}.`,
      durationDays: 2,
      startDay: 0,
      cost: 450,
      roles: ["Principal investigator", "Biomedical engineer"],
      equipment: ["Protocol template", "risk review checklist"],
      materials: ["Experiment worksheet"],
      validation: [
        "Operating points, comparators, and exclusion criteria are approved before setup.",
        "Safety limits for pressure, flow, and temperature are recorded.",
      ],
    },
    {
      key: "setup",
      name: "Assemble mock circulatory loop and calibrate sensors",
      purpose: "Create a traceable bench setup before collecting experimental data.",
      durationDays: 3,
      startDay: 2,
      cost: 1850,
      roles: ["Biomedical engineer", "Lab technician"],
      equipment: ["Mock circulatory loop", "pressure transducers", "reference flow meter", "data acquisition system"],
      materials: ["blood-analog test fluid", "tubing set", "connector adapters"],
      validation: [
        "Reference sensors pass calibration checks across the planned pressure and flow ranges.",
        "Baseline leak, air, and temperature checks are complete.",
      ],
    },
    {
      key: "baseline",
      name: "Run baseline and comparator conditions",
      purpose: "Capture reference behavior before applying the prompt-specific perturbation.",
      durationDays: 2,
      startDay: 5,
      cost: 1250,
      roles: ["Biomedical engineer", "Data analyst"],
      equipment: ["LVAD prototype", "comparator pump or controller", "power analyzer"],
      materials: ["calibrated reservoir fluid"],
      validation: [
        "Baseline flow, pressure head, pump speed, and power data are stable for repeated runs.",
        "Comparator conditions match the prototype test matrix.",
      ],
    },
    {
      key: "matrix",
      name: `Execute ${experimentType} condition matrix`,
      purpose: `Collect prompt-specific measurements for ${outcome}.`,
      durationDays: 4,
      startDay: 7,
      cost: 2650,
      roles: ["Biomedical engineer", "Lab technician", "Data analyst"],
      equipment: promptSpecificEquipment(input.prompt.title),
      materials: promptSpecificMaterials(input.prompt.title),
      validation: [
        "Each condition is replicated and logged with synchronized sensor channels.",
        "Stop criteria are enforced when suction, excessive pressure, or unstable flow appears.",
      ],
    },
    {
      key: "analysis",
      name: "Analyze results and produce validation report",
      purpose: "Turn the run logs into an engineering decision with documented uncertainty.",
      durationDays: 3,
      startDay: 11,
      cost: 950,
      roles: ["Data analyst", "Principal investigator"],
      equipment: ["analysis workstation", "versioned data repository"],
      materials: ["report template"],
      validation: [
        "Plots include uncertainty bands, acceptance criteria, and comparator summaries.",
        "The report clearly separates engineering evidence from clinical claims.",
      ],
    },
  ] as const;

  const primaryPaper = input.papers[0]!;
  const nodes = taskSpecs.map((spec, taskIndex): FinalPlanNode => {
    const nodeId = `mp${String(input.promptNumber).padStart(2, "0")}_${spec.key}`;
    const startDate = isoDate(addDays(parseIsoDate(input.startDate), spec.startDay));
    const endDay = spec.startDay + spec.durationDays - 1;
    const endDate = isoDate(addDays(parseIsoDate(input.startDate), endDay));
    const parentIds = taskIndex === 0 ? [] : [`mp${String(input.promptNumber).padStart(2, "0")}_${taskSpecs[taskIndex - 1]!.key}`];
    const childIds = taskIndex === taskSpecs.length - 1 ? [] : [`mp${String(input.promptNumber).padStart(2, "0")}_${taskSpecs[taskIndex + 1]!.key}`];
    const equipment = spec.equipment.map((name) =>
      resource(name, "available", "Required for the benchtop workflow."),
    );
    const materials = spec.materials.map((name, materialIndex) =>
      resource(
        name,
        materialIndex === 0 && taskIndex >= 1 ? "missing" : "available",
        "Consumable or setup material for this task.",
        materialIndex === 0 && taskIndex >= 1 ? 175 + taskIndex * 80 : null,
      ),
    );
    const position = calendarPosition(spec.startDay, taskIndex);

    return {
      node_id: nodeId,
      step_name: spec.name,
      step_purpose: spec.purpose,
      detailed_procedure: `${spec.purpose} Record synchronized flow, pressure, speed, power, and temperature channels where applicable. Use predefined stop criteria and document any deviations in the run log.`,
      people_required: { count: spec.roles.length, roles: [...spec.roles] },
      assigned_people_if_known: [],
      equipment_required: equipment,
      equipment_available: equipment.map((item) => item.name),
      equipment_missing: [],
      materials_required: materials,
      materials_available: materials
        .filter((item) => item.availability === "available")
        .map((item) => item.name),
      materials_to_buy: materials.filter((item) => item.availability !== "available"),
      estimated_duration: {
        value: spec.durationDays,
        unit: "days",
        confidence: taskIndex < 3 ? "high" : "medium",
        basis: "Seeded from standard mock-loop validation task durations.",
      },
      estimated_price: {
        value: spec.cost,
        currency: "USD",
        confidence: taskIndex < 2 ? "medium" : "low",
        basis: "Demo estimate covering consumables, setup time, and calibration effort.",
      },
      domain_experts: [
        {
          name: "Cardiovascular device engineer",
          affiliation: "Internal engineering review",
          reason_relevant: "Reviews mock-loop assumptions, pump operating limits, and measurement strategy.",
          source: "demo benchmark seed",
        },
      ],
      source_citations: [
        {
          document_id: primaryPaper.id,
          location: "Seeded literature context",
          quote_or_evidence: `Supports benchtop planning assumptions for ${experimentType}.`,
        },
      ],
      source_preplan_node_ids: [],
      related_lesson_ids: [],
      validation_criteria: [...spec.validation],
      milestone: taskIndex === taskSpecs.length - 1 ? "Benchmark-ready validation report complete" : null,
      risks: [
        {
          risk_id: `${nodeId}_risk`,
          description: "Measurement drift, air entrainment, or uncontrolled loading can bias the benchmark result.",
          severity: taskIndex >= 3 ? "medium" : "low",
          mitigation: "Use pre/post calibration, visual air checks, repeated runs, and documented stop criteria.",
          source: "demo benchmark seed",
        },
      ],
      uncertainty_notes: [
        "Supplier pricing and exact loop hardware availability should be confirmed before execution.",
      ],
      start: { type: "absolute", relative_day: spec.startDay, date: startDate },
      end: { type: "absolute", relative_day: endDay, date: endDate },
      calendar_position: position,
      parent_ids: parentIds,
      child_ids: childIds,
      status: taskIndex === 0 ? "active" : "upcoming",
    };
  });

  const edges: FinalPlanEdge[] = nodes.slice(1).map((node, index) => ({
    edge_id: `edge_${nodes[index]!.node_id}_${node.node_id}`,
    from_node_id: nodes[index]!.node_id,
    to_node_id: node.node_id,
    dependency_type: "must_finish_before_start",
    reason: "The next task depends on completed setup, baseline, or analysis outputs from the prior task.",
    is_critical_path_dependency: true,
    confidence: "high",
  }));
  const tasks = nodes.map((node): ScheduledTask => ({
    task_id: node.node_id,
    task_key: node.node_id,
    title: node.step_name,
    description: node.step_purpose,
    step_type: node.node_id.split("_").at(-1) ?? "task",
    procedure: node.detailed_procedure,
    scheduled_date: node.start.date,
    day_offset: node.start.relative_day,
    week_index: node.calendar_position.week_index,
    day_index: node.calendar_position.day_index,
    duration_hours: (node.estimated_duration.value ?? 1) * 8,
    duration_days: node.estimated_duration.value,
    estimated_cost: node.estimated_price.value,
    people_required: node.people_required.roles,
    equipment_required: node.equipment_required,
    materials_required: node.materials_required,
    missing_resources: [
      ...node.equipment_missing,
      ...node.materials_to_buy.map((item) => item.name),
    ],
    items_to_buy: node.materials_to_buy,
    validation_criteria: node.validation_criteria,
    milestone: node.milestone,
    risks: node.risks,
    status: node.status,
    citations: node.source_citations,
    domain_experts: node.domain_experts,
    source_references: node.source_citations.map((citation) => citation.document_id),
    related_lesson_ids: [],
    uncertainty_notes: node.uncertainty_notes,
    metadata: { seed_id: DEMO_BENCHMARK_SEED_ID },
    created_at: input.createdAt,
    updated_at: input.createdAt,
  }));
  const totalDays = Math.max(...nodes.map((node) => node.end.relative_day)) + 1;
  const planEndDate = isoDate(addDays(parseIsoDate(input.startDate), totalDays - 1));
  const calendarLayout = buildCalendarLayout(nodes, input.startDate, planEndDate, totalDays);
  const statsReport = buildStatsReport({
    planId: input.planId,
    hypothesis: input.prompt.prompt,
    goal: `Evaluate ${outcome} using a controlled heart-assist pump benchtop workflow.`,
    nodes,
    papers: input.papers,
  });

  return {
    plan_id: input.planId,
    user_input_id: input.projectId,
    hypothesis: input.prompt.prompt,
    experiment_title: input.prompt.title,
    experiment_goal: statsReport.experiment_goal,
    domain: "Cardiovascular device engineering",
    experiment_type: experimentType,
    created_at: input.createdAt,
    updated_at: input.createdAt,
    source_preplan_ids: [],
    source_document_ids: input.papers.map((paper) => paper.id),
    source_lesson_ids: [],
    source_previous_experiment_ids: [],
    plan_type: "calendar",
    plan_start_date: input.startDate,
    plan_end_date: planEndDate,
    tasks,
    nodes,
    edges,
    calendar_layout: calendarLayout,
    stats_report: statsReport,
    confidence: "medium",
    open_questions: [
      "Confirm exact pump speed limits and any lab-specific pressure safety thresholds before execution.",
    ],
    agent_notes: [
      "Demo-seeded Creator Agent plan generated from MedicalPrompts.md for benchmark visualization.",
    ],
    creator_explanation:
      "The plan follows the normal Creator Agent structure: define acceptance criteria, calibrate the loop, collect baseline and perturbed conditions, then report uncertainty-bounded results.",
  };
}

function buildStatsReport(input: {
  planId: string;
  hypothesis: string;
  goal: string;
  nodes: FinalPlanNode[];
  papers: Paper[];
}): ProjectStatsReport {
  const requiredEquipment = unique(
    input.nodes.flatMap((node) => node.equipment_required.map((item) => item.name)),
  );
  const requiredMaterials = unique(
    input.nodes.flatMap((node) => node.materials_required.map((item) => item.name)),
  );
  const purchaseList = uniqueResources(input.nodes.flatMap((node) => node.materials_to_buy));
  const totalBudget = input.nodes.reduce(
    (sum, node) => sum + (node.estimated_price.value ?? 0),
    0,
  );
  const totalDuration = Math.max(...input.nodes.map((node) => node.end.relative_day)) + 1;

  return {
    report_id: `report_${input.planId}`,
    plan_id: input.planId,
    hypothesis: input.hypothesis,
    experiment_goal: input.goal,
    summary:
      "A seeded Creator Agent report for a cardiovascular-device benchtop validation plan, including calibration, comparator runs, condition-matrix execution, and uncertainty-aware reporting.",
    total_estimated_duration: {
      value: totalDuration,
      unit: "days",
      confidence: "medium",
      basis: "Sum of scheduled mock-loop validation tasks.",
    },
    total_estimated_budget: {
      value: totalBudget,
      currency: "USD",
      confidence: "low",
      basis: "Demo estimate intended for benchmark visualization.",
    },
    people_summary: unique(input.nodes.flatMap((node) => node.people_required.roles)),
    equipment_summary: {
      required: requiredEquipment,
      available: requiredEquipment,
      missing: [],
      unknown: [],
    },
    materials_summary: {
      required: requiredMaterials,
      available: unique(
        input.nodes.flatMap((node) =>
          node.materials_required
            .filter((item) => item.availability === "available")
            .map((item) => item.name),
        ),
      ),
      missing: purchaseList.map((item) => item.name),
      unknown: [],
    },
    purchase_list: purchaseList,
    task_summary: input.nodes.map((node) => ({
      node_id: node.node_id,
      step_name: node.step_name,
      start_day: node.start.relative_day,
      end_day: node.end.relative_day,
      status: node.status,
    })),
    validation_criteria_summary: unique(input.nodes.flatMap((node) => node.validation_criteria)),
    milestone_summary: input.nodes
      .filter((node) => node.milestone)
      .map((node) => ({ node_id: node.node_id, milestone: node.milestone ?? "" })),
    risk_summary: input.nodes.flatMap((node) => node.risks),
    domain_expert_summary: input.nodes[0]?.domain_experts ?? [],
    citation_summary: input.papers.map((paper) => ({
      document_id: paper.id,
      location: paper.venue,
      quote_or_evidence: paper.abstract,
    })),
    learning_memory_summary: [
      "Benchmark feedback should tighten budget, resource, citation, and validation assumptions over time.",
    ],
    open_questions: [
      "Which lab-specific equipment is already available and which consumables need procurement?",
    ],
    confidence_summary:
      "Medium confidence for scheduling and procedure order; budget and supplier details remain demo estimates.",
  };
}

function buildCalendarLayout(
  nodes: FinalPlanNode[],
  startDate: string,
  endDate: string,
  totalDays: number,
): CalendarLayout {
  const dayGroups = Array.from({ length: totalDays }, (_, day) => {
    const date = isoDate(addDays(parseIsoDate(startDate), day));
    const nodeIds = nodes
      .filter((node) => node.start.relative_day === day)
      .map((node) => node.node_id);
    return {
      date,
      day_index: day % 7,
      label: `Day ${day + 1}`,
      weekday: weekdayForDate(date),
      task_ids: nodeIds,
      node_ids: nodeIds,
    };
  });
  const weekGroups: WeekGroup[] = Array.from(
    { length: Math.ceil(totalDays / 7) },
    (_, weekIndex) => {
      const days = dayGroups.slice(weekIndex * 7, weekIndex * 7 + 7);
      return {
        week_index: weekIndex,
        start_date: days[0]?.date ?? null,
        end_date: days.at(-1)?.date ?? null,
        days,
      };
    },
  );
  const nodePositions: Record<string, FinalPlanCalendarPosition> = {};
  for (const node of nodes) nodePositions[node.node_id] = node.calendar_position;

  return {
    plan_start_date: startDate,
    plan_end_date: endDate,
    timeline_start_date: startDate,
    timeline_end_date: endDate,
    total_days: totalDays,
    total_weeks: weekGroups.length,
    weeks: weekGroups,
    week_groups: weekGroups,
    day_groups: dayGroups,
    task_positions: nodePositions,
    node_positions: nodePositions,
    critical_path_node_ids: nodes.map((node) => node.node_id),
  };
}

function workflowFromPlan(plan: FinalExperimentPlan): Workflow {
  return {
    nodes: plan.nodes.map((node) => ({
      id: node.node_id,
      position: {
        x: node.calendar_position.x,
        y: node.calendar_position.y,
      },
      data: {
        id: node.node_id,
        stepName: node.step_name,
        people: node.people_required.roles,
        equipment: node.equipment_required.map((item) => item.name),
        materials: node.materials_required.map((item) => item.name),
        timeEstimate: `${node.estimated_duration.value ?? 1} ${node.estimated_duration.unit}`,
        price:
          node.estimated_price.value === null
            ? "TBD"
            : `$${node.estimated_price.value.toLocaleString("en-US")}`,
        experts: node.domain_experts.map((expert) => expert.name),
        citationsToPaper: node.source_citations.map((citation) => citation.document_id),
        procedure: node.detailed_procedure,
        validationCriteria: node.validation_criteria,
        startDate: node.start.date ?? plan.plan_start_date ?? "",
        parentIds: node.parent_ids,
        childrenIds: node.child_ids,
        status: node.status,
        icon: "Wrench",
      },
    })),
    edges: plan.edges.map((edge) => ({
      id: edge.edge_id,
      source: edge.from_node_id,
      target: edge.to_node_id,
    })),
  };
}

function scoresForTarget(target: number, index: number): BenchmarkScores {
  const phaseOffset = index < 10 ? -1 : index < 20 ? 0 : 1;
  const offsets: Record<BenchmarkScoreKey, number> = {
    timing_estimate_accuracy: -3 + phaseOffset,
    sequential_scheduling_logic: -1,
    procedure_correctness: 2,
    budget_estimate_accuracy: -4,
    equipment_personnel_accuracy: 1,
    citation_quality: 3,
    validation_criteria_quality: 2 - phaseOffset,
  };
  return {
    timing_estimate_accuracy: clampScore(target + offsets.timing_estimate_accuracy),
    sequential_scheduling_logic: clampScore(target + offsets.sequential_scheduling_logic),
    procedure_correctness: clampScore(target + offsets.procedure_correctness),
    budget_estimate_accuracy: clampScore(target + offsets.budget_estimate_accuracy),
    equipment_personnel_accuracy: clampScore(target + offsets.equipment_personnel_accuracy),
    citation_quality: clampScore(target + offsets.citation_quality),
    validation_criteria_quality: clampScore(target + offsets.validation_criteria_quality),
  };
}

function feedbackForScore(title: string, index: number): string {
  if (index < 10) {
    return `The plan for "${title}" has a useful high-level sequence, but it still reads like an early Creator Agent draft. Improve next by adding tighter resource assumptions, explicit calibration acceptance criteria, conservative timing buffers, and clearer citations for the chosen comparator and safety thresholds.`;
  }
  if (index < 20) {
    return `The plan for "${title}" is more executable and the task order is mostly correct. Improve next by making budget ranges more explicit, naming the exact measurement channels for each run, and tying validation criteria directly to the primary outcome.`;
  }
  return `The plan for "${title}" is strong: setup, comparator logic, measurement channels, and validation checks are now easy to follow. Improve next by confirming supplier availability, documenting residual uncertainty, and preserving the clear distinction between engineering validation and clinical claims.`;
}

function structuredInsightForFeedback(
  feedback: string,
  scores: BenchmarkScores,
): StructuredBenchmarkInsight {
  const lowScoreTags = BENCHMARK_SCORE_KEYS.filter((key) => scores[key] < 75).map(tagForScoreKey);
  const categoryTags = unique([
    "benchmark-seed",
    "cardiovascular-device",
    ...lowScoreTags,
    "validation",
  ]);
  return {
    summary: feedback,
    positive_feedback: [
      "The plan preserves a realistic calibration, baseline, perturbation, and analysis sequence.",
    ],
    negative_feedback:
      lowScoreTags.length > 0
        ? ["The plan still needs stronger budget, resource, citation, or validation specificity."]
        : [],
    recommended_creator_agent_adjustments: [
      "Keep setup and sensor calibration before dependent experimental runs.",
      "Name the exact measurement channels and acceptance criteria for each condition.",
      "Call out budget and supplier uncertainty when using demo or approximate costs.",
    ],
    category_tags: categoryTags,
    applies_to: "future cardiovascular-device benchtop experiment plans",
    confidence: 0.82,
  };
}

function seedMetadata(entry: DemoBenchmarkEntry): Record<string, unknown> {
  return {
    source_view: "calendar_view",
    seed_id: DEMO_BENCHMARK_SEED_ID,
    demo_seed: true,
    prompt_number: entry.promptNumber,
    target_progression: "62_to_84",
    medical_prompt_title: entry.projectTitle,
  };
}

function papersForPrompt(prompt: MedicalPromptSpec, promptNumber: number): Paper[] {
  const slug = slugify(prompt.title);
  return [
    {
      id: `demo_paper_${String(promptNumber).padStart(2, "0")}_mock_loop`,
      title: `Benchtop mock circulatory loop methods for ${prompt.title.toLowerCase()}`,
      authors: ["A. Device", "M. Loop", "S. Validation"],
      year: 2023,
      venue: "Journal of Cardiovascular Engineering Methods",
      similarity: 0.91,
      abstract: `Seeded literature context describing pressure-flow, calibration, comparator, and uncertainty practices relevant to ${prompt.title}.`,
      url: `https://example.org/labpilot-demo/${slug}/mock-loop-methods`,
      provider: "demo",
      novelty_relation: "Provides a realistic methodological anchor for the seeded Creator Agent plan.",
    },
    {
      id: `demo_paper_${String(promptNumber).padStart(2, "0")}_risk`,
      title: `Engineering risk controls and validation criteria for ${prompt.title.toLowerCase()}`,
      authors: ["R. Safety", "D. Analyst"],
      year: 2024,
      venue: "Artificial Heart Test Systems Review",
      similarity: 0.84,
      abstract: "Seeded source covering calibration drift, flow instability, suction risk, and controlled benchtop safety limits.",
      url: `https://example.org/labpilot-demo/${slug}/risk-controls`,
      provider: "demo",
      novelty_relation: "Supports validation criteria and safety boundaries in the benchmark plan.",
    },
  ];
}

function classifyExperimentType(title: string, prompt: string): string {
  const text = `${title} ${prompt}`.toLowerCase();
  if (/sensor|data acquisition/.test(text)) return "sensor validation";
  if (/controller|control|shutoff|exercise/.test(text)) return "controller validation";
  if (/hemolysis|thrombogenicity|coating|shear/.test(text)) return "hemocompatibility risk screen";
  if (/durability|heat|power|drift/.test(text)) return "engineering durability study";
  if (/cfd|geometry|impeller|cannula/.test(text)) return "design comparator study";
  return "mock circulatory loop performance study";
}

function primaryOutcome(title: string, prompt: string): string {
  const text = `${title} ${prompt}`.toLowerCase();
  if (/sensor/.test(text)) return "sensor accuracy, drift, repeatability, and response time";
  if (/controller|control|shutoff/.test(text)) return "controller response stability and safe-state behavior";
  if (/hemolysis|thrombogenicity|coating|shear/.test(text)) return "blood-contact engineering risk indicators";
  if (/durability|heat|power/.test(text)) return "performance drift, power demand, and thermal behavior";
  if (/cfd|geometry|impeller|cannula/.test(text)) return "design-dependent pressure-flow and stability differences";
  return "pressure-flow performance under matched loading conditions";
}

function promptSpecificEquipment(title: string): string[] {
  const text = title.toLowerCase();
  if (/sensor|data acquisition/.test(text)) {
    return ["reference pressure/flow sensor", "signal generator", "data acquisition system"];
  }
  if (/controller|shutoff|exercise/.test(text)) {
    return ["programmable pump controller", "afterload resistance module", "fault-injection harness"];
  }
  if (/cfd|geometry|impeller|cannula|shear/.test(text)) {
    return ["prototype pump assembly", "visualization window", "CFD comparison workstation"];
  }
  if (/heat|power|durability/.test(text)) {
    return ["power analyzer", "thermal probes", "vibration logger"];
  }
  return ["LVAD prototype", "adjustable preload reservoir", "adjustable afterload element"];
}

function promptSpecificMaterials(title: string): string[] {
  const text = title.toLowerCase();
  if (/hemolysis|thrombogenicity|coating|shear/.test(text)) {
    return ["blood-analog working fluid", "surface sample coupons", "hemocompatibility assay consumables"];
  }
  if (/viscosity|pediatric/.test(text)) {
    return ["low-viscosity test fluid", "high-viscosity test fluid", "temperature-control consumables"];
  }
  if (/air|priming|de-airing/.test(text)) {
    return ["bubble trap", "de-airing tubing kit", "visual inspection checklist"];
  }
  return ["blood-analog working fluid", "calibration solution", "replacement tubing kit"];
}

function resource(
  name: string,
  availability: FinalPlanResource["availability"],
  reason: string,
  estimatedPrice: number | null = null,
): FinalPlanResource {
  return {
    name,
    quantity: "1",
    unit: "set",
    availability,
    reason,
    estimated_price: estimatedPrice,
  };
}

function calendarPosition(relativeDay: number, lane: number): FinalPlanCalendarPosition {
  return {
    week_index: Math.floor(relativeDay / 7),
    day_index: relativeDay % 7,
    x: 160 + relativeDay * 220,
    y: 90 + lane * 150,
    width: 200,
    lane,
  };
}

function deterministicUuid(label: string): string {
  const hex = createHash("sha256").update(label).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function descriptionForPrompt(prompt: string): string {
  return `${prompt.split(".")[0] ?? "Seeded cardiovascular-device benchmark prompt"}.`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekdayForDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    parseIsoDate(value),
  );
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number): number {
  return roundOne(Math.min(100, Math.max(0, value)));
}

function tagForScoreKey(key: BenchmarkScoreKey): string {
  switch (key) {
    case "timing_estimate_accuracy":
      return "timing";
    case "sequential_scheduling_logic":
      return "scheduling";
    case "procedure_correctness":
      return "procedure";
    case "budget_estimate_accuracy":
      return "budget";
    case "equipment_personnel_accuracy":
      return "resources";
    case "citation_quality":
      return "citations";
    case "validation_criteria_quality":
      return "validation";
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueResources(resources: FinalPlanResource[]): FinalPlanResource[] {
  const seen = new Set<string>();
  const output: FinalPlanResource[] = [];
  for (const resourceItem of resources) {
    const key = resourceItem.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(resourceItem);
  }
  return output;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
