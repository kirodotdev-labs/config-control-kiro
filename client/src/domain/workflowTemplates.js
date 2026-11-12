/**
 * @fileoverview Starting points for a new workflow recipe: Kiro's two-step
 * example and the four patterns from kiro.dev/docs/workflows/patterns,
 * kept as the docs give them (YAML). Adapt the steps, agents and limits.
 */

/** The docs' first recipe: plan, then implement (kiro.dev/docs/workflows/authoring). */
const PLAN_AND_IMPLEMENT = `name: plan-and-implement
description: Plan a change, then implement it
inputs:
  task: prompt
steps:
  - type: step
    id: plan
    agent: wf-planner
    prompt: "Create an implementation plan for: {{task}}. Do not edit files."
  - type: step
    id: implement
    agent: wf-coder
    prompt: |
      Implement this plan, then run relevant tests:

      {{previous.output}}
`;

/** @type {{id: string, label: string, description: string, yaml: string}[]} */
export const RECIPE_TEMPLATES = [
  { id: 'plan', label: 'Plan, then implement', description: 'Two steps: a read-only plan, then the change and its tests.', yaml: PLAN_AND_IMPLEMENT },
  { id: 'investigate', label: "Investigate and explain", description: "Read the project without changing it and write one cited report.", yaml: `name: investigate-question
inputs:
  brief: prompt
  report_path: file
steps:
  - type: step
    id: investigate
    agent: wf-planner
    artifacts:
      report: "{{report_path}}"
    prompt: >
      READ-ONLY investigation; do not edit code or commit.
      Investigate {{brief}} and write findings to {{report_path}}.
      Lead with the answer, cite files and symbols, list risks and recommendations,
      then call send_message with severity success and the key finding.
` },
  { id: 'feature', label: "Deliver a feature", description: "Requirements, design review loop, plan, implementation with two independent reviews, final validation, in a separate worktree.", yaml: `name: deliver-feature
inputs:
  task: prompt
  worktree_path: string
  run_id: string
steps:
  - type: step
    id: setup
    agent: wf-coder
    prompt: >
      Verify that {{worktree_path}} is an absolute path to an isolated worktree.
      Create {{worktree_path}}/.kiro/workflow-runs/{{run_id}} for this run.
      Do not change the primary checkout. Report the selected path.

  - type: step
    id: requirements
    agent: wf-design
    artifacts:
      requirements: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/requirements.md"
    prompt: >
      In {{worktree_path}}, write testable requirements for {{task}} to
      {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/requirements.md.

  - type: repeat
    id: design-loop
    maxIterations: 3
    onMaxIterations: abort
    stopCondition:
      fileCheck:
        path: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/design-review.json"
        jsonPath: verdict
        value: APPROVED
    steps:
      - type: step
        id: design-draft
        agent: wf-design
        artifacts:
          design: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/design.md"
        prompt: >
          In {{worktree_path}}, read {{artifacts.requirements}}.
          Draft or revise the design and write it to {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/design.md.
      - type: step
        id: design-review
        agent: wf-design-reviewer
        artifacts:
          design_review: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/design-review.json"
        prompt: >
          In {{worktree_path}}, review {{artifacts.design}} against
          {{artifacts.requirements}}. Write {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/design-review.json
          with verdict APPROVED or REVISE and the findings.

  - type: step
    id: plan
    agent: wf-planner
    artifacts:
      plan: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/plan.md"
    prompt: >
      In {{worktree_path}}, write an ordered implementation and validation plan
      from {{artifacts.requirements}} and {{artifacts.design}} to
      {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/plan.md.

  - type: repeat
    id: code-loop
    maxIterations: 3
    onMaxIterations: abort
    stopCondition:
      fileCheck:
        path: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/code-review.json"
        jsonPath: verdict
        value: APPROVED
    steps:
      - type: step
        id: implement
        agent: wf-coder
        artifacts:
          code_summary: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/code-summary.md"
        prompt: >
          Implement {{artifacts.plan}} in {{worktree_path}} and run relevant checks.
          Write {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/code-summary.md with changed files, tests run,
          command output, and remaining risks.
      - type: parallel
        id: code-reviews
        joinPolicy: all
        branches:
          - type: step
            id: review-a
            agent: semantic_reviewer
            artifacts:
              review_a: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/review-a.md"
            prompt: >
              Independently review the implementation in {{worktree_path}} using
              {{artifacts.code_summary}}. Write findings to {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/review-a.md.
              Do not read other reviews.
          - type: step
            id: review-b
            agent: semantic_reviewer
            artifacts:
              review_b: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/review-b.md"
            prompt: >
              Independently review the implementation in {{worktree_path}} using
              {{artifacts.code_summary}}. Write findings to {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/review-b.md.
              Do not read other reviews.
      - type: step
        id: code-aggregate
        agent: wf-review-aggregator
        artifacts:
          code_review: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/code-review.json"
        prompt: >
          In {{worktree_path}}, read {{artifacts.review_a}} and
          {{artifacts.review_b}}. Write {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/code-review.json with
          verdict APPROVED or REVISE, deduplicated findings, and corroborated
          issues ranked first.

  - type: repeat
    id: validate-gate
    maxIterations: 1
    onMaxIterations: abort
    stopCondition:
      fileCheck:
        path: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/validation.json"
        jsonPath: verdict
        value: PASS
    steps:
      - type: step
        id: validate
        agent: wf-coder
        artifacts:
          validation_report: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/validation.md"
          validation: "{{worktree_path}}/.kiro/workflow-runs/{{run_id}}/validation.json"
        prompt: >
          In {{worktree_path}}, validate the implementation against
          {{artifacts.requirements}} and {{artifacts.code_summary}}.
          Run the required checks. Write {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/validation.md and
          {{worktree_path}}/.kiro/workflow-runs/{{run_id}}/validation.json with verdict PASS or FAIL and the evidence.
          Do not fix code in this step; report honestly.
` },
  { id: 'troubleshoot', label: "Troubleshoot until verified", description: "Reproduce, fix one cause at a time, rerun the check; pause after ten attempts.", yaml: `name: troubleshoot-until-verified
inputs:
  issue: prompt
  result_path: file
steps:
  - type: repeat
    id: fix-loop
    maxIterations: 10
    onMaxIterations: pause
    stopCondition:
      fileCheck:
        path: "{{result_path}}"
        jsonPath: verified
        value: true
    steps:
      - type: step
        id: diagnose-and-fix
        agent: wf-coder
        prompt: >
          Reproduce {{issue}}. Inspect the latest result at {{result_path}} if it exists.
          Test one hypothesis, apply the smallest justified change, rerun the reproduction,
          and write JSON with verified, evidence, and remaining_risk fields.
` },
  { id: 'publish', label: "Publish and respond", description: "Open a pull request, wait for review without using model turns, answer safe feedback.", yaml: `name: publish-and-respond
inputs:
  branch: string
  run_dir: string
steps:
  - type: step
    id: submit
    agent: wf-pr-submitter
    prompt: >
      Publish {{branch}} as a pull request, or reuse its open PR.
      Write its URL and metadata to {{run_dir}}/pr.json.
  - type: repeat
    id: pr-loop
    maxIterations: 200
    onMaxIterations: pause
    stopWhen: wait.terminal
    steps:
      - type: watch
        id: wait
        handler: github-pr
        config:
          prRef: "{{run_dir}}/pr.json"
      - type: step
        id: respond
        agent: wf-pr-responder
        prompt: >
          Respond to the new PR activity in {{wait.output}}.
          Address feedback that is safe and in scope. Ask before changing the design,
          expanding scope, or altering the user experience.
` },
  { id: 'blank', label: 'Blank', description: 'A name and one empty step to fill in.', yaml: 'name: new-recipe\nsteps:\n  - type: step\n    id: step-1\n    agent: wf-planner\n    prompt: ""\n' },
];
