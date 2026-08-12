# Public Node Repo Integrations

NodeGraph is the relationship layer for the public Node repos. The same primitives used by NodeRoom should apply to these extracted packages without creating new backend contracts.

## NodeMem Memory Clusters

Model passive memory as a graph of:

- `entity` - company, person, topic, or artifact mentioned in activity.
- `mention` - chat message, note, spreadsheet row, trace event, or uploaded source.
- `suggestion` - noteworthy memory suggestion with policy context.
- `approval` / `dismissal` - explicit user decision state.
- `policy` - room/user setting that allows, suppresses, or quotas suggestions.
- `job` - downstream research or write action only after approval.

Required behavior:

- Highlight why a suggestion is relevant without implying that a job already ran.
- Keep dismissed entities visible as policy/history state, not as active recommendations.
- Let NodeAgent answer "why this suggestion?" from selected cluster context.

## NodeTrace Causality

Model trace inspection as a graph of:

- `surface` - tagged UI region.
- `trace` - selected trace/run/workpaper id.
- `runtime_event` - bounded tool/model/action row.
- `proof_card` - business evidence and confidence.
- `source_file` - file and line range that emitted or rendered the surface.
- `screenshot` - source/UI capture with DOMRect or bounding-box evidence.
- `receipt` - smoke, capture, installer, or trace-coach receipt.

Required behavior:

- Preserve the proof/runtime split; business proof and runtime trace are related but not collapsed.
- Make UI surface -> trace -> source/screenshot/receipt traversable.
- Support a selected surface neighborhood for Trace Lens and Trace Coach views.

## NodeRL Episodes

Model a proof-loop episode as a graph of:

- `goal` - task or benchmark target.
- `action` - agent/tool/browser operation.
- `observation` - UI state, test result, verifier response, or media judge output.
- `reward` - deterministic or externally judged score signal.
- `memory` - retained lesson or failure pattern.
- `repair` - proposed or executed change.
- `export` - dataset or training/eval record.

Required behavior:

- Keep certification-loop receipts separate from exploration-loop proposals.
- Show which reward fields came from tests, visual judges, verifiers, user decisions, cost, or latency.
- Make answer keys, official scores, and self-promotion boundaries explicit.

## NodeTasks Binding

NodeTasks now includes a `public-node-repo-proofs` saved view and bundle. Use it as the task index for these integrations:

- NodeAgent storyboard, frame, and chat UI adoption tasks.
- NodeMem passive-memory and storyboard proof tasks.
- NodeTrace storyboard, capture-plan, Trace Coach, and causality tasks.
- NodeRL episode, reward, memory, and export-boundary tasks.

NodeGraph demos should cite the relevant NodeTasks task ids when they are used as public proof scenarios.
