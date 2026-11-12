/**
 * @fileoverview Kiro's specs, as Kiro keeps them in a Workspace: one folder
 * per spec in .kiro/specs/<name>/ with requirements.md (or bugfix.md),
 * design.md and tasks.md, and Kiro's hidden .config.kiro naming the spec type
 * and workflow. Sources: kiro.dev/docs/specs (feature, bugfix, quick spec,
 * plan mode, analyze requirements) and Kiro's spec agents.
 */
import { isObject, parseJson } from './json.js';

/**
 * The ways to plan with Kiro. The first four are specs (they write files);
 * plan mode is a chat that writes nothing. workflowType and specType are the
 * values Kiro writes to .config.kiro.
 */
export const SPEC_KINDS = [
  {
    id: 'requirements-first', label: 'Feature spec · Requirements first', specType: 'feature', workflowType: 'requirements-first',
    docs: ['requirements.md', 'design.md', 'tasks.md'],
    what: 'Start with how the feature should behave, as user stories and acceptance criteria. Kiro then writes the design and the task list, and you approve each step.',
    best: 'You know the behaviour you want; the architecture can adapt. Product features, greenfield work.',
  },
  {
    id: 'design-first', label: 'Feature spec · Design first', specType: 'feature', workflowType: 'design-first',
    docs: ['design.md', 'requirements.md', 'tasks.md'],
    what: 'Start with the technical design (architecture or pseudocode). Kiro then derives requirements that fit it, and the tasks.',
    best: 'You have an architecture in mind, strict non-functional needs (latency, compliance), or a design doc to bring in.',
  },
  {
    id: 'bugfix', label: 'Bugfix spec', specType: 'bugfix', workflowType: 'requirements-first',
    docs: ['bugfix.md', 'design.md', 'tasks.md'],
    what: 'Describe what is broken, what should happen, and what must keep working. Kiro finds the root cause, designs the fix and writes tasks with tests that prove it.',
    best: 'Complex bugs, critical code paths, fixes that must not cause regressions.',
  },
  {
    id: 'quick-spec', label: 'Quick spec', specType: 'quick-spec', workflowType: 'fast-task',
    docs: ['requirements.md', 'design.md', 'tasks.md'],
    what: 'Kiro asks its questions up front, then writes requirements, design and tasks in one pass, with no approval between them.',
    best: 'Well-understood features and prototypes, where speed matters more than review.',
  },
];

/** Plan mode: think before acting, read only, no files. */
export const PLAN_MODE = {
  label: 'Plan mode',
  what: 'Kiro asks questions, explores the code read only and proposes a step-by-step plan. When you approve it, Kiro starts building. It writes no spec files.',
  best: 'Multi-file changes where you want to agree the approach first, without formal documents.',
};

/** What each document is for, in the docs' words. */
export const SPEC_DOCS = {
  'requirements.md': 'User stories and acceptance criteria, in EARS notation: WHEN [condition] THE SYSTEM SHALL [behaviour].',
  'bugfix.md': 'The bug: current behaviour, expected behaviour, and unchanged behaviour that must keep working.',
  'design.md': 'Architecture, data flow, interfaces, data models, error handling and testing strategy.',
  'tasks.md': 'The implementation plan: tasks Kiro ticks off as it works. A task ending in * is optional (usually tests).',
};

/** kebab-case, like Kiro's spec folders. */
export const SPEC_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A spec name typed as words, made kebab-case. */
export const specSlug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** .config.kiro's fields, or {} when it's missing or not JSON. */
export function readSpecConfig(text) {
  const { value } = parseJson(text || '');
  return isObject(value) ? value : {};
}

/**
 * Which kind a spec is: from .config.kiro when Kiro wrote one, else from its files
 * (bugfix.md means a bugfix spec). Unknown when neither says.
 * @param {Object} config .config.kiro
 * @param {string[]} files the spec's file names.
 */
export function specKindOf(config, files) {
  const byConfig = SPEC_KINDS.find((k) => k.specType === config.specType && (k.specType !== 'feature' || k.workflowType === config.workflowType));
  if (byConfig) return byConfig;
  if (config.specType === 'feature') return SPEC_KINDS[0];
  if (files.includes('bugfix.md')) return SPEC_KINDS.find((k) => k.id === 'bugfix');
  return undefined;
}

/** .config.kiro for a kind, keeping any other keys and the spec's id (a new one when it has none). */
export function writeSpecConfig(text, kind, newId = () => globalThis.crypto.randomUUID()) {
  const c = readSpecConfig(text);
  return `${JSON.stringify({ ...c, specId: c.specId || newId(), workflowType: kind.workflowType, specType: kind.specType }, null, 2)}\n`;
}

const TEMPLATES = {
  'requirements.md': (n) => `# Requirements Document

## Introduction

What ${n} is for, and who it helps.

## Requirements

### Requirement 1

**User Story:** As a [role], I want [feature], so that [benefit].

#### Acceptance Criteria

1. WHEN [condition or event] THEN THE SYSTEM SHALL [expected behaviour]
2. IF [precondition] THEN THE SYSTEM SHALL [expected behaviour]
`,
  'bugfix.md': (n) => `# Bugfix: ${n}

## Current Behavior (Defect)

- WHEN [condition] THEN the system [incorrect behaviour]

## Expected Behavior (Correct)

- WHEN [condition] THEN the system SHALL [correct behaviour]

## Unchanged Behavior (Regression Prevention)

- WHEN [condition] THEN the system SHALL CONTINUE TO [existing behaviour]

## Reproduction

1. 
`,
  'design.md': (n) => `# Design Document: ${n}

## Overview

## Architecture

## Components and Interfaces

## Data Models

## Error Handling

## Testing Strategy
`,
  'tasks.md': () => `# Implementation Plan

- [ ] 1. First task
  - What to build, and which requirement it meets
  - [ ] 1.1 A smaller step
  - [ ]* 1.2 Write tests for it
- [ ] 2. Next task
`,
};

/** A starting document, or '' for a file without a template. */
export const specTemplate = (doc, name) => TEMPLATES[doc]?.(name) || '';

/**
 * The files of a new spec started in the app: .config.kiro and only the first
 * document, for you to write. Kiro checks which documents exist to know which
 * phase is done, so the later ones are left for Kiro to write.
 */
export function newSpecFiles(name, kind) {
  return { '.config.kiro': writeSpecConfig('', kind), [kind.docs[0]]: specTemplate(kind.docs[0], name) };
}

/**
 * What to type in a chat to have Kiro do one step of a spec: the lines in order
 * (a slash command, then a message in plain words). Kiro picks the phase from
 * which documents exist, so these say exactly which document to write or update.
 * @param {'write'|'redo'|'after'|'task'|'run'|'analyze'} action
 * @param {string} name the spec.
 * @param {{doc?: string, later?: string[], task?: string}} [o]
 * @returns {{title: string, lines: string[]}}
 */
export function specAction(action, name, o = {}) {
  const resume = `/spec ${name}`;
  switch (action) {
    case 'write': return { title: `Write ${o.doc} with Kiro`, lines: [resume, `Continue this spec: write ${o.doc} from the documents before it.`] };
    case 'redo': return { title: `Rewrite ${o.doc} with Kiro`, lines: [resume, `Rewrite ${o.doc} from scratch, using the documents before it. Ask me anything that is unclear.`] };
    case 'after': return { title: `Update ${o.later.join(' and ')} with Kiro`, lines: [resume, `I edited ${o.doc}. Update ${o.later.join(' and ')} to match it, and keep the tasks that are already done ticked.`] };
    case 'task': return { title: `Run task ${o.task} with Kiro`, lines: [resume, `Implement task ${o.task} only, then tick it in tasks.md and stop.`] };
    case 'analyze': return { title: 'Analyze the requirements with Kiro', lines: [`/spec analyze_requirements ${name}`] };
    default: return { title: 'Run the tasks with Kiro', lines: [`/spec run ${name}`] };
  }
}

/**
 * The tasks in tasks.md: Kiro's checkboxes "- [ ] 1. Title", "- [x] 1.2 Title",
 * "- [ ]* 2.1 optional" (an optional task, usually a test). In-progress "[-]" counts as not done.
 * @returns {{line: number, depth: number, num: string, title: string, done: boolean, optional: boolean}[]}
 */
export function parseTasks(text) {
  const out = [];
  (text || '').split(/\r?\n/).forEach((l, line) => {
    const m = /^(\s*)- \[([ xX~-])\](\*?)\s+(\d+(?:\.\d+)*)\.?\s*(.*?)(\*?)\s*$/.exec(l);
    if (!m) return;
    out.push({ line, depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2), num: m[4], title: m[5], done: /[xX]/.test(m[2]), optional: !!(m[3] || m[6]) });
  });
  return out;
}

/** How many tasks are done. */
export function taskProgress(text) {
  const t = parseTasks(text);
  return { done: t.filter((x) => x.done).length, total: t.length };
}

/** tasks.md with one task ticked or unticked; nothing else changes. */
export function setTaskDone(text, line, done) {
  const lines = text.split('\n');
  lines[line] = lines[line].replace(/- \[[ xX~-]\]/, done ? '- [x]' : '- [ ]');
  return lines.join('\n');
}

/**
 * The /spec commands for one spec, with what each does (Kiro CLI V3).
 * @param {string} name
 * @param {boolean} hasRequirements analyze_requirements needs a requirements.md.
 */
export function specCommands(name, hasRequirements) {
  return [
    { cmd: `/spec ${name}`, what: 'Resume the spec: continue writing it, or step through its tasks with Kiro.' },
    { cmd: `/spec run ${name}`, what: 'Run its tasks in the full-screen task view. Independent tasks run in parallel.' },
    { cmd: `/spec view ${name} tasks`, what: 'Read a document in the chat (requirements, design or tasks).' },
    ...(hasRequirements ? [{ cmd: `/spec analyze_requirements ${name}`, what: 'Find gaps, ambiguities and conflicts in its requirements before design. Takes minutes.' }] : []),
  ];
}
