# Config Control for Kiro (CCKiro v3): User Guide and Test Plan

This guide walks through every feature of CCKiro v3, from first start to the last screen. Each section says what the feature is for, then gives numbered tests: what to do and what you should see. Tick each box as you go, and note the platform (Windows, macOS, Linux, WSL) you tested on.

CCKiro is the place to **configure** Kiro CLI. You change settings here, then use Kiro in a terminal. Nothing in the app chats with Kiro for you.

---

## 0. Before you start

### 0.1 What you need

- **Kiro CLI**, up to date. Run `kiro-cli update`, then `kiro-cli --version`. Several features (Powers, Agent upgrade) need a recent version; 2.34.2 has everything this guide uses.
- **Signed in** to Kiro: `kiro-cli whoami` should show your account.
- A **scratch project folder** to use as a test Workspace, for example `~/cck-test` (or `C:\Users\<you>\cck-test`).

### 0.2 Back up your Kiro folder

Some tests change real files (agents, settings, Powers, chats). Back up first.

- **macOS / Linux / WSL:** `cp -r ~/.kiro ~/kiro-backup-$(date +%F)`
- **Windows (PowerShell):** `Copy-Item -Recurse $env:USERPROFILE\.kiro $env:USERPROFILE\kiro-backup`

To restore later, close the app and copy the backup back over `.kiro`.

### 0.3 Test data for the V3 upgrade tests

Section 6 needs an agent in the old CLI 2.x format. Save this as `~/.kiro/agents/legacy-test.json` (Windows: `%USERPROFILE%\.kiro\agents\legacy-test.json`):

```json
{"name":"legacy-test","allowedTools":["read"],"toolsSettings":{"shell":{"allowedCommands":["git status"]}},"hooks":{"agentSpawn":[{"command":"git status","timeout_ms":5000}]},"keyboardShortcut":"ctrl+l"}
```

### 0.4 Start the app

- **Windows:** unzip and run `cckiro.exe`.
- **macOS:** unzip and open `cckiro.app` (or run `./cckiro` from the archive).
- **Linux / WSL:** extract and run `./cckiro`.

| # | Test | Expected | Pass |
|---|---|---|---|
| 0.4.1 | Start the app | A browser tab opens at `http://127.0.0.1:3030` (or the next free port). The window that started it prints the address | ☐ |
| 0.4.2 | Start a second copy while the first runs | It picks another port instead of failing | ☐ |
| 0.4.3 | Run with `--no-browser` | No tab opens; open the printed address yourself | ☐ |
| 0.4.4 | Close the app's window/terminal | The page stops responding; restart works | ☐ |

---

## 1. The app frame

The top bar holds the name, the **Kiro CLI status** dot, the app version and the **Update** button (the app updates itself; see docs/AUTO_UPDATE.md). Everything else is in the navigator: each V3 feature sits under Global or a Workspace, where its files live.

| # | Test | Expected | Pass |
|---|---|---|---|
| 1.1 | Look at the top bar | "Config Control KIRO", the status dot, `v<version>` and an **Update** button; no tabs | ☐ |
| 1.2 | On the latest version, click **Update** | Grey button; the panel says "You're on the latest version", has **Update automatically** (on) and **Check now** | ☐ |
| 1.3 | A newer release is published (with its .sig files) | Within a few hours, or after **Check now**, the app downloads it, checks its signature, and installs it once the app has been idle for ten minutes (or **Install now and restart**). The page reconnects on the same address; a note says "Updated to v…" | ☐ |
| 1.4 | Turn **Update automatically** off, then a newer release | The button turns purple: **Update to v…**; the panel's **Download v… for this computer** gets the file for this system directly | ☐ |
| 1.5 | The app is in a folder it can't write to (or on macOS runs from Downloads) | Purple button; the panel says why and how (e.g. move it to Applications) | ☐ |

---

## 2. Kiro CLI status

The dot in the top bar shows whether the app can use your kiro-cli.

| Colour | Label | Meaning |
|---|---|---|
| Green | Connected | Everything works |
| Amber | Connected, with limits | Works, but a feature needs a newer kiro-cli |
| Red | Not connected | Not installed, signed out, or Kiro can't be reached |

| # | Test | Expected | Pass |
|---|---|---|---|
| 2.1 | Click the dot | A panel lists each check (installed, version, signed in, Kiro service, V3 chats, Agent upgrade, Powers), with a fix for anything failing, plus **Details** and **Refresh** | ☐ |
| 2.2 | With an up-to-date, signed-in kiro-cli | Green, every check passes | ☐ |
| 2.3 | Run `kiro-cli logout`, press **Refresh** | Red, "not signed in", with the fix `kiro-cli login`. Terminal, Upgrade and Powers buttons are disabled with that reason. Sign back in and Refresh: green again | ☐ |
| 2.4 | Disconnect from the network, Refresh | Red, Kiro can't be reached. Reconnect, Refresh: green | ☐ |
| 2.5 | (Optional) Rename kiro-cli so it can't be found, Refresh | Red, "isn't installed", with a link to kiro.dev/downloads. Undo the rename | ☐ |

---

## 3. The navigator (left side)

The navigator shows **Global** (your `~/.kiro`) and each **Workspace** (a project's `.kiro`). Click a scope to open it, click an item to edit it.

| # | Test | Expected | Pass |
|---|---|---|---|
| 3.1 | First open | Global is shown with Agents, MCP servers, Permissions, Hooks, Steering, Skills, Workflows, Powers, Settings, Sandbox, Memory, ACP, and Chats & usage last. Missing items are dimmed | ☐ |
| 3.2 | Click **Global** | It folds and unfolds | ☐ |
| 3.3 | Header **Collapse all** | Every open group folds | ☐ |
| 3.4 | Header **Hide navigator**, then **Show navigator** | The navigator hides and returns | ☐ |
| 3.4a | Drag the navigator's right edge | It widens or narrows (220 to 560 px); the relation lines follow. Arrow keys on the edge move it; double-click resets it | ☐ |
| 3.4b | Reload the app | The width is kept. **Home** puts it back to the default | ☐ |
| 3.4c | Point at any row, with nothing selected | Its full path pops up: the file, the folder for a group, `mcp.json → name` for an MCP server, the Kiro home for Global. With an item selected, connected rows also say how they're connected | ☐ |
| 3.5 | Make an unsaved edit, then press **Home** | You're asked whether to discard. Confirm: the app returns to its first-visit view | ☐ |
| 3.6 | Click an agent | Dotted lines connect it to what it uses (MCP, steering, skills, hook files, permissions). Things that apply to every agent are faint | ☐ |
| 3.6a | Click an agent whose Context points at files outside this scope (e.g. a package elsewhere on disk) | An **Other** section under the tree lists each file by name (a `skill://…/*/SKILL.md` glob expands to `name/SKILL.md` rows), with a line to each. A missing file says "file not found". Click a row: a `.md` opens with the steering form, a `SKILL.md` with the skill form, other text as text; an image or archive says it can't be edited here. The agent stays the anchor, so Other and its lines stay while you edit | ☐ |
| 3.7 | Agent that uses a file outside the scope | An **Other** section lists it, with a note such as "outside this scope" | ☐ |
| 3.8 | Steering files in a subfolder | They appear with their folder, e.g. `team/ops.md` | ☐ |
| 3.9 | Agent rows | An amber dot marks agents with CLI 2.x settings, or upgraded by Kiro and then edited (out of sync) | ☐ |
| 3.10 | Select an agent, then fold its group with the arrow | The lines stay, starting from the folded group's row (a ring instead of a dot). Selecting something else clears them | ☐ |
| 3.11 | Open **MCP servers** | Each server in `mcp.json` has its own row; a turned-off server is faint | ☐ |
| 3.12 | Select an agent with "Also use the servers in mcp.json" on | Lines go to every server in `mcp.json`, whatever its tools list says. A turned-off server is faint, with no dot | ☐ |
| 3.13 | Select an agent with that setting off that defines its own copy of a server (same name as a row) | The line goes to that row. Its tooltip says it's defined in the agent. Own servers with no row are under **Other** | ☐ |
| 3.14 | Select a server row | Its editor opens with that server expanded; lines go to the agents that use it | ☐ |
| 3.15 | Select an agent | The dot at the end of each line to something sent with every message (resource files, the prompt file, always-on steering, AGENTS.md, MCP servers it uses) is sized by tokens: the biggest item has the biggest dot. Lines to skills, auto or manual steering, hooks and permissions have no dot | ☐ |
| 3.16 | Point at a dot | The exact count, e.g. "3,214 tokens with every message". For a server: "Up to N tokens … the definitions of N tools" | ☐ |
| 3.17 | A server whose tools haven't been listed | Its dot is a ring. Select the server (its tools are listed), then select the agent again: the dot is filled and sized | ☐ |
| 3.18 | Give the agent only `@server/tool` (or a pattern such as `@server/get*`), add a tool to the server's `disabledTools`, or add `@server` to the agent's `excludedTools` | The count includes only the tools the agent gets; with the whole server excluded the line is faint, with no dot | ☐ |
| 3.19 | Open an agent | Its MCP servers that haven't been measured are measured in the background (once; a failed one waits 10 minutes; Workspace servers only in a Workspace Kiro trusts) | ☐ |
| 3.20 | Open its **Chats & usage** section | **Context**: the tokens sent with every prompt before you type, its share of the model's window, a bar and chips by kind, every item biggest first (servers labelled "from mcp.json" or "this agent's own copy"), suggestions to send less, and what is connected but not counted, with the reason | ☐ |
| 3.21 | Same section | **Usage in the last 30 days** with advice, and **Chats**: this agent's latest chats with Resume and Delete, and a link to the Chats & usage page | ☐ |
| 3.22 | Fold the section | Its summary shows "≈ NK tokens before you type · credits in 30 days" | ☐ |
| 3.23 | Agent **Sub-agents** section: add an agent under **May start** | Tools gets `subagent/<name>` (replacing `subagent` and `invoke_sub_agent`). **Start without asking** adds a `subagent` allow rule to Permissions. An agent with CLI 2.x `toolsSettings.subagent` shows a warning and needs Kiro's upgrade | ☐ |
| 3.24 | Agent **Model** section | **Reasoning effort** sets `effortLevel`, which V3 chats with this agent use | ☐ |
| 3.25 | Global **Settings** with `chat.agentEngine` unset | An info box says new chats start with the 2.x engine; **Use V3** sets `chat.agentEngine` to `v3` (save to keep it). Settings Kiro marks as V3-only show a **V3** chip; V2 TUI and legacy ones show **2.x only** | ☐ |
| 3.26 | Global **Memory** | What memory is, how to use it (`/memories` in a V3 chat), `memory.mode` and `memory.reflection` as set in Global, **Change in Settings**, **Terminal** and **Guide** | ☐ |
| 3.27 | A Workspace's **Memory** | Says repository memories are used only here; the settings are shown from Global with "set them in Global Settings" (a Workspace value has no effect) | ☐ |
| 3.28 | Select **Workflows** in Global and in a Workspace | The Workflows page: what a workflow is, **Turn it on**, **Start one**, **Runs** (Global: every project; a Workspace: only its own), the recipes here and **New recipe**, the `/workflow` commands with Copy, and the agents Kiro ships for steps (including wf-code-reviewer) | ☐ |
| 3.29 | Select **Specs** in a Workspace | The Specs page: what a spec is, the specs here (kind, documents, "N of M tasks done"), and **Ways to plan**: Feature spec requirements-first, Feature spec design-first, Bugfix spec, Quick spec and Plan mode, each with what it does, best for, and its documents in order. Not in Global (specs live in the project) | ☐ |
| 3.29a | **New spec** (or New … on a kind) | Kind and name (made kebab-case). "Let Kiro write it": Terminal with `/spec new <name>` and which choice to pick. **Write <first document> myself**: `.kiro/specs/<name>/` with `.config.kiro` (Kiro's specId, workflowType, specType) and only the first document from a template; Kiro writes the rest | ☐ |
| 3.29b | A spec's page | Cards: **What kind of spec** (writes .config.kiro); **Documents** in the order the kind writes them: the next missing one has **Write with Kiro**; each written one has **Rewrite with Kiro**, **Update <later documents> with Kiro**, and a bin to delete it so Kiro writes it again; after editing one, a note says to update what comes after. **Tasks** from tasks.md: tick or untick (unticked tasks run again), **Run** / **Run again** per task, **Run all tasks** or **Run the unticked tasks**; `*` tasks marked optional. Each Kiro button opens the launch dialog with exactly what to type, and waits until you Save. **Carry on with Kiro** lists the /spec commands. One **Save** writes all | ☐ |
| 3.29c | Expand a spec in the navigator, click a file | The spec's page with that file on the right | ☐ |
| 3.29d | Plan mode card → **Terminal** | The dialog says `/plan <what>` or Shift+Tab; plan mode writes no files | ☐ |
| 3.30 | Agent **Powers** section: turn on **Include installed Powers**, save, select the agent | The section lists the powers installed now; the summary says Included. A line goes to **Powers** (Global) or "Global powers" under Other (Workspace); selecting **Powers** links back. The switch is no longer in Context | ☐ |
| 3.30a | Global **Powers** | The line under the intro says "Kiro's published catalog: N powers, updated <date>": the latest from Kiro, including powers newer than Kiro's own saved copy. **Refresh catalog** checks again now | ☐ |
| 3.30b | Same, with the network off | "Kiro's saved copy of its catalog, from <date>", and a warning with the reason and **Try again**. Install from a folder still works | ☐ |
| 3.30c | Install a power that is only in the published catalog | Kiro installs it by name (`kiro-cli powers install <name>`) | ☐ |
| 3.31 | Global **Permissions** | A **Presets** card lists Kiro's presets (read-workspace, edit-workspace, read-all, read-only-shell, dev-shell, approve-for-me, allow-all) with a switch each. Presets already in the file are on; a name the app doesn't know is shown and kept | ☐ |
| 3.31a | Turn on **allow-all**, Save | A warning explains it allows every tool. The file gets `policies:` with `- allow-all` above `rules:`. Turning it off and saving removes `policies:` | ☐ |
| 3.31b | Same, on Kiro CLI older than 2.36 | **approve-for-me** shows "Needs Kiro CLI 2.36 or later (you have …)" | ☐ |
| 3.31c | A rule with effect **evaluate** (Kiro writes these for approve-for-me) | It shows and saves; the effect list offers evaluate | ☐ |
| 3.31d | **YAML** on a scope with no permissions.yaml yet | The YAML view opens empty ("new file"); Save creates it. Back on **Rules**, the form shows what you wrote | ☐ |
| 3.32 | Global **Memory** | "What Kiro remembers (N)" lists every memory, newest first, with its type (Preference, Fact) and scope (Global or owner/repo). Selecting one shows its content, why and how to apply | ☐ |
| 3.32a | Same, in a Workspace whose git origin is on GitHub, GitLab, Bitbucket or git.amazon.com | Only Global memories and this repository's; "N more … for other repositories" counts the rest | ☐ |
| 3.32b | Search memories | Filters by title and summary | ☐ |
| 3.32c | Delete a memory in a V3 chat (/memories → list → Ctrl+D), then come back | Refresh (or returning to the window) removes it from the list. CCKiro never changes the database | ☐ |
| 3.33 | Workspace **Code intelligence**, no lsp.json | The two layers (built in for 18 languages; language servers per Workspace), "off for this Workspace", the languages found in the project, each built-in server with installed / not installed and the install command for this computer (Windows: winget or a download link, never brew; WSL: the Linux commands); detected ones ticked; **Create lsp.json**. Not in Global | ☐ |
| 3.33a | **Create lsp.json** (or `/code init` in a chat) | `.kiro/settings/lsp.json` with Kiro's own defaults for the ticked languages; the page turns "on" and shows each server as a card beside the JSON (name, command, arguments, extensions, file / project / exclude patterns, timeout, multi workspace, initialization options), in sync both ways; **Add a language server** (built-in or your own); the `/code` commands; **Turn off** deletes lsp.json after a confirm | ☐ |
| 3.34 | Workspace **Settings**, search agentEngine | `chat.agentEngine` is marked **Global only** with no control; if the Workspace file sets it, a warning says Kiro ignores it there. The same applies to chat.uiMode, chat.terminalTitle and the memory settings | ☐ |
| 3.34a | Global **Settings** with chat.agentEngine unset | Kiro CLI before 3.0: the advice says plain chats start 2.x, with **Use V3**. Kiro CLI 3.0 or later: no advice, since V3 is the default | ☐ |
| 3.35 | A remote MCP server, expanded | A **Sign-in (OAuth)** box: client ID, client secret (only after a client ID), redirect URI, client metadata URL and scopes. Leaving all empty lets Kiro register itself | ☐ |
| 3.35a | Redirect URI `https://example.com/cb` | Explains the scheme must be http; `:7778`, `127.0.0.1:7778` and `http://localhost:7778/oauth/callback` are accepted | ☐ |
| 3.35b | Fill in a client secret | A warning says it's saved as plain text in the file | ☐ |
| 3.35c | **Run every tool without asking**, or a tool's **Without asking** box | Saves `autoApprove: ["*"]` or the tool's name | ☐ |
| 3.36 | A hook with trigger **Before/After Kiro compacts the chat** | On Kiro CLI older than 3.1: "needs Kiro CLI 3.1.0 or later". PreCompact says exit code 2 cancels the compaction | ☐ |
| 3.36a | A **Stop** hook that runs a command → **Ask before running** | Question, options (label, ID, runs the command) and an optional deciding command; saved as `confirm`. An empty question can't be saved | ☐ |
| 3.37 | Open a steering file | **When Kiro loads it** above the text, with Kiro's four inclusion modes and their names: Always included (`always`), Conditional inclusion (`fileMatch`, with File patterns that suggest the docs' common globs), Auto inclusion (`auto`, with Name and Description), Manual inclusion (`manual`, used as `#name` or `/name`). Each shows what the docs say it's best for. The front matter in the text follows every change | ☐ |
| 3.38 | Global **Memory** → **How Kiro may use memory** | Access (Read & write / Read only / Off / Kiro's default) and **Automatic updates**, saved straight to Global `cli.json` (`memory.mode`, `memory.reflection`); the switch is off unless access is read & write. In a Workspace Kiro doesn't trust, a note says Kiro can read but not change memories there | ☐ |
| 3.38a | Memory list **Show** | Filters by Preferences, Facts, Global or Repositories; the count reads "N of M" | ☐ |
| 3.38b | **Memory** → **New memory** (Kiro CLI 2.36 or later, signed in, Access Read & write or Kiro's default) | A form: Type (Preference or Fact), **Applies to** (Global, this Workspace's repository, or a repository already in use), Title (words become a dash-slug, at most 50), Description (one line, at most 200), Content. Missing fields are flagged before anything is sent. **Save** goes through Kiro (kiro-cli acp, no chat, no credits); the memory appears in the list and in `/memories` → list | ☐ |
| 3.38c | Open a memory → **Edit**, change the content, Save | Kiro saves it. **Applies to** is shown but can't change (Kiro can't move a memory; make a new one to use it elsewhere) | ☐ |
| 3.38d | Open a memory → **Delete** | Asks first (it goes from this computer and your account); Kiro deletes it | ☐ |
| 3.38e | Access **Read only** or **Off**; or signed out; or Kiro CLI older than 2.36 | New memory, Edit and Delete are greyed out, and the line under the list says why | ☐ |
| 3.38f | In a new V3 chat, ask something the new memory's description matches | Kiro recalls it: the chat shows `Memory command=get, title=<your title>` | ☐ |
| 3.39 | Workflows group | Lists only files named `*.workflow.json`, `.workflow.yaml` or `.workflow.yml` (other files there are not recipes) | ☐ |
| 3.39a | **New recipe**: name it, choose **Start from** (Plan then implement, Investigate and explain, Deliver a feature, Troubleshoot until verified, Publish and respond, Blank) and **Format** (JSON or YAML) | `<name>.workflow.json` or `.yaml` from that docs pattern, named after you, opens in the recipe editor | ☐ |
| 3.39b | Open a recipe | Three panes: the recipe as a **graph** (numbered steps joined by arrows; a repeat as a dashed frame with its cap and stop gate; a parallel as side-by-side lanes with its join; a wait as a dashed node; what it asks for at the top and the files it writes at the bottom), the **details** of the selected node (or, with none selected, **Run it** and the recipe's name, description, inputs, model and effort), and the file. All three stay in sync | ☐ |
| 3.39c | **Turn it on** on the Workflows page | The switch writes `chat.enableWorkflows` to Global Settings (the same setting the Settings page shows) and says to restart Kiro CLI. **When Kiro uses them** (`chat.workflowLaunch`) and **Continue interrupted runs** too. With workflows off, a recipe shows "Workflows are off" with **Turn on** | ☐ |
| 3.39d | **+** on an arrow (or **Add after**, **Add inside**, **Add a branch**) | A menu of the five node types; the new node appears there, selected, with its fields open. **Insert value** in a step's prompt offers only what that step can read | ☐ |
| 3.39i | Select a step that reads another (e.g. `{{previous.output}}` or `{{artifacts.plan}}`) | The node it reads is marked "feeds <selected>" and joined to it with a dashed line; a node that reads the selected one is marked "reads <selected>" | ☐ |
| 3.39j | Runs: after a workflow ran in Kiro CLI V3, open the Workflows page | The run is listed with its status (done, running, paused, failed, stopped), recipe, steps done and when. In a Workspace, only runs in that project | ☐ |
| 3.39k | Open a run | The plan it ran as the graph, each node marked with how far it got (done, running, needs you, not reached, ran N×). **Terminal** (resumes the chat the run belongs to); the `/workflow` commands that fit its status with its real id (status; pause; resume; cancel; retry); what was asked; its inputs; **Files it wrote**, each opening in the editor; **Save this plan as a recipe** | ☐ |
| 3.39l | Select a step in a run | Its agent, how long it took, how it finished, what it said last, the files it wrote, and its prompt. A step waiting for you says to reply in the chat's monitor | ☐ |
| 3.39m | A running run | Its status updates every few seconds without reloading | ☐ |
| 3.39e | Break a rule (a repeat with no cap, `{{later.output}}`, an undeclared `{{x}}`, `stopWhen` with `stopCondition`, a command watch with `args`) | The problem shows on that node's card in plain words; the steps header counts what to fix. Fixing it clears it | ☐ |
| 3.39f | Click inside a node in the JSON | Its card is outlined | ☐ |
| 3.39g | Edit a YAML recipe with comments in the form | Comments and untouched keys stay as they were | ☐ |
| 3.39h | In a V3 chat, `/workflow run <name>` after a restart | Kiro asks for the inputs, shows the plan, runs it in the background | ☐ |
| 3.40 | Workspace **Specs** | Each spec with its documents (requirements or bugfix, design, tasks) and "N of M tasks done" from `tasks.md` | ☐ |
| 3.41 | Chats & usage with a `/tangent` or `/rewind` chat | It's listed on its own with "Tangent of: …" or "Rewound from: …" (not "Subagent of"), with its own credits. **Tangents and rewinds** filters them | ☐ |
| 3.41a | Bookmark, rename or tag a V3 chat in Kiro's `/sessions`, then **Refresh** | A bookmark icon, Kiro's title, and its tags as dashed chips (searchable with `#tag`, listed in the Tag filter as "from Kiro"). **Bookmarked** filters them. They're changed in Kiro, not here | ☐ |
| 3.31 | Chats & usage → **Start cloud session** | The launch dialog with **Cloud session** chosen and a note on what applies in the cloud; Launch runs `kiro-cli chat --v3 --cloud` | ☐ |

---

## 4. Workspaces

A Workspace is a project folder. Its `.kiro` overrides Global for chats started there.

| # | Test | Expected | Pass |
|---|---|---|---|
| 4.1 | **Add workspace**, choose your scratch folder | It appears under Workspaces. A `.kiro` folder is created if there wasn't one; an existing one is adopted | ☐ |
| 4.2 | Click the Workspace | It opens with its own items. **Specs** appears; **Powers** doesn't (Powers are Global only) | ☐ |
| 4.3 | Create an agent in the Workspace with the same name as a Global one | It shows **overrides a Global agent** | ☐ |
| 4.4 | Rename or move the project folder on disk, reload the app | The Workspace is dimmed with a warning: "This folder was moved or deleted" | ☐ |
| 4.5 | Press **X** (Remove from Workspaces) | It leaves the list. The folder and its `.kiro` are **not** deleted | ☐ |
| 4.6 | Add a folder on another drive / a path with spaces | Works the same | ☐ |

---

## 5. Agents

### 5.1 Agents overview and creation

| # | Test | Expected | Pass |
|---|---|---|---|
| 5.1.1 | Click **Agents** | All agents of the scope, as a list | ☐ |
| 5.1.2 | **New agent**, enter `test-agent` | The editor opens. The agent starts with all built-in tools | ☐ |
| 5.1.3 | Try a name with spaces or `/` | Rejected with an explanation | ☐ |
| 5.1.4 | Try an existing name | Rejected; nothing is overwritten | ☐ |
| 5.1.5 | **Built into Kiro CLI** (click to open) | The built-in agents from `kiro-cli agent list` with descriptions, and which one new chats start with | ☐ |

### 5.2 The agent editor

The form is on the left and the agent's JSON on the right. Changes on either side update the other. **Save**, **Delete** and **Terminal** are at the top right.

| # | Test | Expected | Pass |
|---|---|---|---|
| 5.2.1 | **Identity**: change name, description, system prompt | JSON updates live; **Save** enables | ☐ |
| 5.2.2 | **Use a prompt file…** | Choose a `.md` file; the prompt becomes a `file://` reference with a note saying where it's read from | ☐ |
| 5.2.3 | **Model** | Lists your account's models with their credit rate, plus "Kiro default" | ☐ |
| 5.2.4 | **Tools**: switch built-in tools, add `@server/tool` entries, set **Never allow** | `tools` and `excludedTools` update | ☐ |
| 5.2.4a | Click **Other selectors** | A list of Kiro's built-in tool IDs, each with what it does (e.g. `read_file`: Read one file), and each MCP server's tools as `@server/tool` once they've been listed | ☐ |
| 5.2.4b | Type a name that isn't listed, press Enter | It's added. A warning says Kiro CLI V3 doesn't know it and that it's kept; a retired name such as `use_aws` says what to use instead | ☐ |
| 5.2.4c | **Never allow**: pick `delete_file` or one `@server/tool`, or type any name | Saved in `excludedTools` | ☐ |
| 5.2.5 | **MCP servers**: add one, or **Copy from mcp.json**; toggle use of mcp.json | `mcpServers` / `includeMcpJson` update | ☐ |
| 5.2.6 | **Permissions** | One line (deny beats ask, ask beats allow; Global and Workspace rules also apply), the rule cards, **Add rule**. **Capability**: a list in three groups, and you can type any name (one Kiro doesn't know is kept with a note): **Several at once** (`all`, `builtin`, `filesystem`), **This agent's tools and setup** (e.g. `fs_read`, `shell`, `mcp`), **Other capabilities**. Then **Effect** (`allow` proceed silently, `ask` prompt you, `deny` block always, `evaluate` Kiro judges), **Match** (empty = all), **Exclude**, bin | ☐ |
| 5.2.6a | Click **Match** or **Exclude** | Suggestions for that capability with what each means (shell: `git *`, `npm test`, `rm -rf *`…; files: `src/**`, `**/.env`…; MCP: `server/*` and each of the agent's server tools; sub-agents: agent names). Type any other pattern and press Enter. Empty Match means everything | ☐ |
| 5.2.6b | A rule for a capability the agent doesn't have (e.g. `web_search` without the web tool) | One line: "This agent has no web_search, so this rule has no effect." | ☐ |
| 5.2.6c | Save | The JSON has the rules as written (`capability`, `match`, `effect`, `exclude`); rules and fields the app doesn't know are kept | ☐ |
| 5.2.6d | Card order | Identity and prompt, MCP servers, Tools, Permissions, Sub-agents, Context, Knowledge, Powers, Hooks, Model, Welcome message, Chats & usage (the agent file's field order) | ☐ |
| 8.1a | Global or Workspace **Permissions** | A split view: the form (trust, presets, rule cards with Several at once / Capabilities groups) on the left, `permissions.yaml` on the right. Each form change rewrites the YAML at once; typing valid YAML updates the cards | ☐ |
| 5.2.7 | **Context**: add a file and a skill | `resources` gets `file://` and `skill://` entries. Knowledge bases don't appear here | ☐ |
| 5.2.7a | **Knowledge** section → **Knowledge base**, press **Add** empty | "Give it a name…" and "Choose the folder…" | ☐ |
| 5.2.7b | Name it, choose a folder | "About N files (size) would be indexed"; a folder that doesn't exist says so | ☐ |
| 5.2.7c | Add **Only these files** `**/*.md` and **Skip these** `node_modules/**` | The count drops to the matching files | ☐ |
| 5.2.7d | Choose **Best** or **Fast**, re-index on start, **Add** | A row "name / folder · best · only … · skips …"; the section summary counts it | ☐ |
| 5.2.7e | Agent whose tools don't include knowledge (e.g. only `read`) | Warning "can't search its knowledge bases"; **Add the tool** adds `knowledge` to tools | ☐ |
| 5.2.7f | **Save**, check the agent file | The entry sits in `resources` as `{"type":"knowledgeBase","source":"file://…",…}`; `kiro-cli agent validate --path <file>` passes | ☐ |
| 5.2.7g | Pencil on a knowledge base | Opens filled in; change and Save; fields the app doesn't know are kept | ☐ |
| 5.2.7h | Agent isn't the default | "New chats start with kiro_default…"; **Make this the default agent** sets `chat.defaultAgent` (Global, or the Workspace you're in) and the note goes | ☐ |
| 5.2.7i | `chat.enableKnowledge` Off in Settings | Warning that knowledge is switched off | ☐ |
| 5.2.7j | Real check: give an agent a docs folder, start `kiro-cli chat --v3 --agent <it>`, ask something only those docs answer | Kiro searches the knowledge base and answers from it | ☐ |
| 5.2.8 | **Context**: **Include installed Powers** | `includePowers` is set | ☐ |
| 5.2.9 | **Hooks**: **Add hook** (When, Run command or Ask the agent, Timeout) | A V3 `hooks` array is written | ☐ |
| 5.2.10 | **Sub-agents**: "Which agents can it start?" None / Only these agents / Any agent | None removes every sub-agent entry from tools; Only these writes `subagent/<name>` for the **May start** list (free text allowed); Any agent writes the `subagent` tag. **Start without asking** writes a `subagent` allow rule. Tools no longer has sub-agent checkboxes and points here | ☐ |
| 5.2.10a | Agent with `*` or `@builtin` in tools | Any agent is chosen and locked, with a note to turn it off in Tools | ☐ |
| 5.2.10b | Choose Only these agents with no name yet | The choice stays; a note says to add at least one agent | ☐ |
| 5.2.11 | **Welcome message** | `welcomeMessage` updates | ☐ |
| 5.2.12 | **Usage** section | Credits over 30 days and average context use, or "No recent chats" (see section 15.4) | ☐ |
| 5.2.13 | Type invalid JSON on the right | An error shows and **Save** is disabled. Fix it and the form follows | ☐ |
| 5.2.13a | Click a card on the left | Every key that card edits is highlighted in the JSON (Tools: `tools` and `excludedTools`) | ☐ |
| 5.2.13b | Click inside a key in the JSON (e.g. `hooks`, `excludedTools`) | The card that edits it is outlined, opens if closed and scrolls into view | ☐ |
| 5.2.13c | A file with keys no card edits (an upgraded agent's `allowedTools`, or an unknown key) | **Also in this file** under the cards lists each key and where it belongs. `allowedTools` → the Kiro CLI V3 card (V3 uses Permissions allow rules); an unknown key → "edit it in the JSON". Clicking a key highlights it | ☐ |
| 5.2.14 | **Save** | "<name> saved. New chats use it." The file on disk matches the JSON | ☐ |
| 5.2.15 | Edit, then click another item without saving | You're asked to save or discard | ☐ |
| 5.2.16 | **Delete** | Confirm first; the file is removed and the agent leaves the list | ☐ |
| 5.2.17 | Open a `.md` agent (if you have one) | It edits the same way and stays Markdown | ☐ |

### 5.3 Terminal button

| # | Test | Expected | Pass |
|---|---|---|---|
| 5.3.1 | **Terminal** on an agent | A dialog: choose the folder (Workspace, Home, or another), **Start new** or **Resume a previous one**, shows the exact command | ☐ |
| 5.3.2 | **Launch** | A new terminal opens in that folder and runs `kiro-cli chat --v3 --agent <id>`. Kiro starts with that agent | ☐ |
| 5.3.3 | **Resume a previous one**, Launch | Kiro's resume picker opens | ☐ |
| 5.3.4 | Copy the command, paste into your own terminal | It runs the same way | ☐ |
| 5.3.5 | With kiro-cli signed out (2.3) | Terminal is disabled with the reason | ☐ |

---

## 6. Upgrading agents to V3

Shown for agents with CLI 2.x settings and agents Kiro upgraded. The state comes from Kiro itself (`kiro-cli agent upgrade --dry-run`), and the conversion is done by Kiro, never by the app. Kiro CLI 2.37 or later also upgrades 2.x agents by itself when a V3 chat starts, unless Global `chat.enableAutoAgentUpgrade` is off. Use the `legacy-test` agent from 0.3.

| # | Test | Expected | Pass |
|---|---|---|---|
| 6.1 | Open Agents | A banner says how many agents use CLI 2.x settings, with **Preview** and **Upgrade all**. On Kiro CLI 2.37 or later with automatic upgrade on, it says Kiro upgrades them by itself the next time a V3 chat starts | ☐ |
| 6.2 | Open `legacy-test` | The **Kiro CLI V3** card, open: "A Kiro CLI 2.x agent", **What Kiro converts** (allowedTools, toolsSettings, hooks, tool names) and **What V3 doesn't carry over** (toolAliases, keyboardShortcut, per-sub-agent approvals, the AWS tool). V3 agents have no card | ☐ |
| 6.2b | **Terminal (2.x)** in the card (only for agents Kiro hasn't upgraded) | The launch dialog runs `kiro-cli chat --v2 --agent <name>`, has no Cloud session choice and says Kiro removes 2.x in January. Upgraded agents have no such button | ☐ |
| 6.2a | **Terminal** on that agent | A note: with automatic upgrade on, Kiro upgrades it when the chat starts; with it off, V3 starts the default agent instead. It gives the `--v2` command | ☐ |
| 6.3 | **Upgrade with Kiro** | Kiro converts a copy first. You see **What Kiro would change** (before and after) and Kiro's warnings. The file isn't touched yet | ☐ |
| 6.4 | Confirm the upgrade | The card, folded, says "Upgraded by Kiro · N settings only in 2.x"; open it: works in V3 and 2.x, what Kiro converted, what V3 doesn't carry over, **Restore original**. No "CLI 2.x format" badge on Hooks or Sub-agents, and no 2.x note in Sub-agents | ☐ |
| 6.4a | Start `kiro-cli chat --v3 --agent <a 2.x agent>` (Kiro 2.37+), then reload | Kiro upgraded it by itself (a `.bak` next to it): the card says "Upgraded by Kiro" | ☐ |
| 6.4b | On an upgraded agent, change only the description, Save | Saves without a question | ☐ |
| 6.4c | Add a permission rule (or change tools or hooks), Save | Asks first: saving stops Kiro updating the V3 settings. After saving, the card says **Out of sync** with how to rebuild (`/upgrade-agent` → Universal · Out of Sync) and the agent row gets an amber dot | ☐ |
| 6.5 | Edit the file outside the app between preview and confirm | The app refuses to apply a stale preview and asks you to preview again | ☐ |
| 6.6 | **Restore original** | The original returns and the backup is removed; with automatic upgrade on, the message says Kiro upgrades it again at the next V3 chat | ☐ |
| 6.7 | Banner **Preview** | Kiro's dry run for all agents, nothing changed | ☐ |
| 6.8 | Banner **Upgrade all** | Every agent that needs it is converted, each with a `.bak` | ☐ |
| 6.8a | An agent file Kiro can't read (broken JSON) | Its card says "Kiro can't read this agent" with Kiro's reason | ☐ |
| 6.9 | With an old kiro-cli without `agent upgrade` | Upgrade buttons disabled: "needs a newer Kiro CLI" | ☐ |

---

## 7. MCP servers

Edits `mcp.json` for the scope: servers on the left, the JSON on the right.

| # | Test | Expected | Pass |
|---|---|---|---|
| 7.1 | **Add MCP server**, **Local command**: name + command line | A server with `command` and `args` | ☐ |
| 7.2 | **Add MCP server**, **Remote URL**: name + URL (+ headers) | A server with `url` and headers | ☐ |
| 7.3 | **Paste JSON** copied from a server's README | Its servers are added | ☐ |
| 7.3a | Click inside a server in the JSON | Its row on the left is outlined and opens; clicking a row highlights it in the JSON | ☐ |
| 7.4 | Toggle a server off/on | `disabled` flips in the JSON | ☐ |
| 7.5 | Expand a working server | Its live tool list appears. Switch a tool off: it's written to `disabledTools` | ☐ |
| 7.6 | Expand a broken server (wrong command) | A clear message that its tools couldn't be listed | ☐ |
| 7.7 | Environment variable like `${GITHUB_TOKEN}` | Kept as written, not expanded | ☐ |
| 7.8 | Break `mcp.json` by hand, reopen | It opens as text so you can fix it (**Open as text to fix it**) | ☐ |
| 7.9 | **Windows only:** "start these servers inside WSL" option | Commands are wrapped to run in WSL | ☐ |
| 7.10 | **Terminal** button | As in 5.3 | ☐ |
| 7.11 | **Save** | `mcp.json` on disk matches | ☐ |

---

## 8. Permissions

Edits `permissions.yaml`: rules that apply to every agent in the scope.

| # | Test | Expected | Pass |
|---|---|---|---|
| 8.1 | **Add rule**: Capability, Effect (allow / ask / deny / evaluate), Match, Exclude | A rule card; the YAML on the right updates at once, **unsaved** shows | ☐ |
| 8.2 | **Remove rule** (bin) | It's gone from the YAML | ☐ |
| 8.3 | Type in the YAML pane (e.g. a new rule) | The card appears. Break the YAML (e.g. `bad: [`): "The YAML has a problem…" with the reason, Save disabled, the cards keep the last good version | ☐ |
| 8.4 | Save, reopen | Exactly the YAML shown is written. Comments and keys the form doesn't know are kept | ☐ |
| 8.5 | Workspace never opened in Kiro CLI V3 | "Kiro doesn't trust this Workspace yet", explaining what untrusted means | ☐ |
| 8.6 | Start `kiro-cli chat --v3` in that folder, choose **Trust, continue**, reopen Permissions | "Kiro trusts this Workspace". Saving rules keeps the trust | ☐ |
| 8.7 | Workspace permissions file location | Saved under `~/.kiro/workspace-roots/<id>/permissions.yaml`, the same folder Kiro CLI uses. Proven end to end in 13a.6 | ☐ |
| 8.8 | (If your organization deploys one) `managed-settings.json` | Permissions shows "Your organization applies N rules you can't change", with each rule; Global → **Admin policy** shows the file read-only | ☐ |

## 9. Sandbox

Edits `settings/sandbox.json`, the policy for shell commands agents run (kiro.dev/docs/sandbox). A form on the left, the JSON on the right.

| # | Test | Expected | Pass |
|---|---|---|---|
| 9.1 | Open Sandbox | The form and the JSON. If this computer can't run the sandbox, a warning says what's missing (Linux: `bwrap`; `socat` for some network modes; Windows: run `/sandbox setup` once) | ☐ |
| 9.2 | Turn on **Run agent shell commands in the sandbox**, choose **Network access** and **MCP servers** | JSON shows `enabled`, `networkAccess`, `mcpSandboxing` | ☐ |
| 9.3 | Save | Saved; unknown keys and key order are kept | ☐ |
| 9.4 | Type `"networkAccess": "open"` in the JSON | A warning: must be one of the three values (case-sensitive) | ☐ |
| 9.5 | Global on with Common services; open a Workspace's Sandbox | It says the Workspace can only tighten Global. **Open** is disabled ("looser than Global"); turning the sandbox off shows a warning | ☐ |
| 9.6 | The cards | **Sandbox** (sandbox.json), **Permission rules it follows** (from this scope's permissions.yaml: only `sandbox_network`, `fs_read`, `fs_write`, `filesystem` and `all` rules) and **How to use it**. Clicking a card shows its file on the right; the file path is above it | ☐ |
| 9.7 | **Add rule** in Permission rules it follows, Match `api.github.com` | A `sandbox_network` allow rule; the right side shows permissions.yaml with it, comments and other rules kept. Capability only offers the five the sandbox follows | ☐ |
| 9.8 | One **Save** | Writes sandbox.json and permissions.yaml. The Permissions page shows the same rule; editing it there shows here too | ☐ |
| 9.9 | **Terminal** | Greyed out until saved; the dialog says to type `/sandbox` (and `/sandbox setup` on Windows). In the chat `/sandbox` shows **Active** | ☐ |

---

## 10. Hooks, Steering, Skills, Prompts, Workflows, Specs

| # | Test | Expected | Pass |
|---|---|---|---|
| 10.1 | Click **Hooks** in the tree | The page says what hooks are and has a **New hook file** button (the same **+** also appears when you point at the group). Name it. A new hook file opens with a form and its JSON | ☐ |
| 10.2 | **Add hook**: When, Run command / Ask the agent, Timeout; Save | `{version:"v1", hooks:[…]}` written. Hooks here run for **every** agent | ☐ |
| 10.2a | **When** list | Includes **Session ends (CLI V3)** and **Manual**. Switching a file trigger to Session ends drops the file pattern | ☐ |
| 10.2b | Click inside a hook in the JSON | Its card on the left is outlined and scrolled to; clicking a card highlights that hook in the JSON | ☐ |
| 10.3 | **Steering +**, name it | A new `.md` starting with `inclusion: always` opens | ☐ |
| 10.4 | Edit steering, Save | Saved as text | ☐ |
| 10.5 | Click **Skills** | A short explanation (each folder with a `SKILL.md` is one skill; `SKILL.md` is what Kiro reads; other files are for it to use), every skill with its description and any problem, **New skill** and **Import a skill** | ☐ |
| 10.5a1 | **New skill**, name it | The folder with `SKILL.md` opens: **Name** and **Description** on one line (Description empty and marked required), **Optional fields** folded, **Used by** one line, the instructions as text. In the tree the skill shows as `name/` | ☐ |
| 10.5a2 | Type a short description, e.g. `Helps with code review` | Advice: short descriptions activate badly, with the docs' good example. The front matter in the text follows every change | ☐ |
| 10.5a3 | Change Name so it differs from the folder | "Name must match the folder name, …" | ☐ |
| 10.5a4 | **+** on the skill in the tree (or **Add file** in the editor) → scripts/, `check.sh` | `scripts/check.sh` is created, appears under the skill in the tree and opens. **Delete** removes it and returns to the skill | ☐ |
| 10.5a5 | **Used by** | "every agent" (inherited) unless `chat.disableInheritingDefaultResources` is on; **Add to an agent's Context** adds a `skill://` resource to that agent | ☐ |
| 10.5a6 | **Import a skill**: a GitHub folder URL (`…/tree/main/skills/x`) or a local folder | The folder is copied into this scope's skills folder and opens, its files under it in the tree. The repository root, a non-GitHub URL, a folder without SKILL.md, a bad folder name and an existing skill are refused with a reason | ☐ |
| 10.5a7 | A skill whose SKILL.md has a wrong name or no description | The Skills page marks it "Kiro may skip it" with the reason | ☐ |
| 10.5a | Click **Prompts**, then **New prompt**, name it `review` | The page says: create a prompt file and write the prompt in it, with $ARGUMENTS where your input goes; run review.md in Kiro as `/review production code`, or on its own. An empty `review.md` opens with **Run it in a chat: /review** and an **Arguments** bar | ☐ |
| 10.5a-2 | Type text, **Insert → $ARGUMENTS**, type more | `$ARGUMENTS` lands at the cursor; the run line becomes `/review <anything you type>`; Insert then offers `$1`. With `$1` the run line shows `<argument 1>`. In a V3 chat, `/review src/` fills the placeholders | ☐ |
| 10.5b | Prompt name longer than 50 characters | "Use at most 50 characters" | ☐ |
| 10.5c | In a Workspace with `AGENTS.md` at the root and in a subfolder | Both appear under Steering as "AGENTS.md (project root)" and "AGENTS.md (<folder>)"; clicking an agent shows them as inherited | ☐ |
| 10.6 | Create a name that already exists | Refused; nothing overwritten | ☐ |
| 10.7 | **Workflows**: select a recipe | It opens in the recipe editor (3.39b) | ☐ |
| 10.8 | **Specs** (Workspace only): select a document | It opens; with none, the hint says to type `/spec new <name>` in a V3 chat | ☐ |
| 10.9 | Any JSON file with invalid JSON | Save disabled until fixed | ☐ |
| 10.10 | **Delete** in a hook, steering, prompt, workflow, skill or spec editor | A confirm names what goes (a skill or a spec: "and everything in its folder"). After Delete, the file or folder is gone from disk and the tree, and the group's page shows | ☐ |
| 10.11 | Permissions, Settings, Sandbox, Kiroignore, Memory, Chats | No Delete button for the file: Kiro expects these files, and the app never deletes or writes Kiro's stores (single memories are deleted through Kiro, 3.38d). The API refuses to delete anything outside hooks, steering, skills, prompts, workflows and specs | ☐ |

---

## 10a. Kiroignore

Files Kiro must never read, in gitignore syntax (kiro.dev/docs/kiroignore). Global: `~/.kiro/settings/kiroignore`. Workspace: `.kiroignore` in the project root; subfolder `.kiroignore` files are listed under it.

| # | Test | Expected | Pass |
|---|---|---|---|
| 10a.1 | Global → **Kiroignore** (file absent) | Explains it, offers **Start with common secrets** | ☐ |
| 10a.2 | Start with common secrets, Save | `~/.kiro/settings/kiroignore` has `.env`, `*.pem`, `!.env.example`… | ☐ |
| 10a.3 | In a V3 chat, ask Kiro to read a `.env` file | It refuses or can't see it | ☐ |
| 10a.4 | Workspace with `secrets/.kiroignore` | Listed under Kiroignore; opens with "files in this folder and below" | ☐ |

## 11. Settings (Kiro CLI `cli.json`)

A form built from the settings your kiro-cli supports, with the file's JSON on the right. Only what you change is written.

| # | Test | Expected | Pass |
|---|---|---|---|
| 11.1 | Open Settings | Groups (Chat, Keybindings, MCP, Knowledge, …, Advanced), closed. A line says how many are set | ☐ |
| 11.2 | Chat → `chat.agentEngine` | Options are only **Kiro's default (v2)**, v1, v2, v3 | ☐ |
| 11.3 | On/off setting | On / Off / Kiro's default | ☐ |
| 11.3a | Click inside a key in the JSON | Its row on the left is outlined and scrolled to, even if a search had hidden it | ☐ |
| 11.4 | `chat.defaultModel` | Lists your models | ☐ |
| 11.5 | `chat.defaultAgent` | Lists the built-in agents (e.g. `kiro_planner (built-in)`) and your agents | ☐ |
| 11.5a | `chat.modelDefaults` | Each Claude/GPT model with an **Effort** picker (low … max). Choose one, Save: `cli.json` has `output_config.effort` (Claude) or `reasoning.effort` (GPT). **Edit as JSON** for thinking/max_tokens | ☐ |
| 11.6 | `compaction.excludeContextWindowPercent` = 150 | "Must be at most 100"; Save disabled | ☐ |
| 11.7 | `knowledge.defaultIncludePatterns`: type `*.md`, Enter, `src/**`, Enter | Chips; JSON shows a list | ☐ |
| 11.8 | Settings marked **after restart** | Shown on startup-only settings | ☐ |
| 11.9 | Search `engine` | Only matching settings | ☐ |
| 11.10 | **Only changed** | Only settings you've set | ☐ |
| 11.11 | Reset icon on a set setting | It leaves the JSON | ☐ |
| 11.12 | Click a setting | Its line is highlighted in the JSON | ☐ |
| 11.13 | Type `"chat.agentEngine": "v9"` in the JSON | The form shows "Must be one of: v1, v2, v3"; Save disabled | ☐ |
| 11.14 | Add an unknown key in the JSON | Listed under "Not known to this Kiro CLI" and kept on save | ☐ |
| 11.15 | Save | "Settings saved." `cli.json` has only your changes. `kiro-cli settings <key>` shows the value | ☐ |
| 11.16 | In a Workspace, open Settings | Empty choices read **Use Global (…)** where Global sets a value | ☐ |
| 11.17 | Break `cli.json` by hand | It opens as text with a warning | ☐ |

---

## 12. Powers (Global only)

| # | Test | Expected | Pass |
|---|---|---|---|
| 12.1 | Open **Powers** | What a power is (MCP tools plus guidance, loaded only when a request mentions its keywords); **Installed**, **Your powers**, **Catalog** with search by name, purpose or category. Catalog cards show Official/Community, category, author, what signing in needs, and a source link | ☐ |
| 12.2 | **Install** a catalog power | A confirm about what a power can run; Kiro installs it (`kiro-cli powers install`). It appears under Installed and as a folder under Powers in the tree | ☐ |
| 12.3 | Open an installed power (tree or card) | One page like an agent's: cards on the left (**What it is**, **When Kiro loads it**, **MCP servers** as the standard MCP cards, **Instructions and steering** (plus skills for plugin.json powers), **Other files** if any, **Used by**, **Use and test it**), a file on the right. It opens with the manifest (POWER.md or plugin.json). One line says it's Kiro's installed copy: changes apply to new chats, Reinstall latest replaces them | ☐ |
| 12.4 | Click each card | The right side switches to that card's file: manifest, mcp.json, the instructions; a steering or skill row shows its file (a skill also opens its form in the card). The card you're on is outlined | ☐ |
| 12.5 | Expand the power in the tree, click a file | The same page, with that file on the right and its card opened; moving between its files keeps unsaved edits without asking, and clicking the same file again shows it again | ☐ |
| 12.6 | Edit an installed power (e.g. add a keyword), **Save** | The form and file stay in sync; Save writes every changed file into Kiro's installed copy, keeping POWER.md's instructions and its list style. The name can't change while installed | ☐ |
| 12.7 | **Add steering** / **Add a skill** / a skill's **Add a file** | Steering goes where Kiro reads it: `steering/` for POWER.md powers, `dev.kiro/steering/` for plugin.json powers. Add a skill appears only on plugin.json powers. Clicking a skill opens its form and lists its own files (scripts/, references/, assets/); **Add a file** creates one there and shows it. The bin icon deletes a file | ☐ |
| 12.7b | A skill's **Add a file** → **Copy existing files**, choose one or more files anywhere | Each is listed with where it goes (scripts/, references/ or assets/) and where it comes from; Copy puts a copy in the skill folder, byte for byte (scripts stay runnable), and shows the last one. A name already there is marked and asks before replacing. Works the same on the Skills page | ☐ |
| 12.7a | A power with files outside those places (e.g. POWER.md next to plugin.json, `steering/` in a plugin.json power) | They stay listed under **Other files**, each with why Kiro doesn't read it, and still open, save and delete. Nothing is moved or hidden | ☐ |
| 12.8 | **Terminal** on an installed power | The launch dialog says how to trigger it (mention a keyword, e.g. "Using postman, …"; `/powers` lists what's installed). Greyed out while there are unsaved changes | ☐ |
| 12.9 | **Reinstall latest** on a catalog power | After a warning that your changes are replaced, Kiro removes and installs it again (Kiro CLI has no update command) | ☐ |
| 12.10 | **Install from GitHub**: one power's folder URL | Downloaded, checked for plugin.json or POWER.md, installed. The repository root or a folder without a manifest is refused with a reason | ☐ |
| 12.11 | **Install from a folder…** | A folder with plugin.json or POWER.md installs; one without is refused | ☐ |
| 12.12 | **New power**, name `team-api` | `~/.kiro/power-sources/team-api/` with plugin.json, mcp.json and skills/getting-started/SKILL.md; it opens on the same page, files under it in the tree. A name that isn't kebab-case is refused. Missing required fields are flagged and **Install** waits until they're fixed | ☐ |
| 12.13 | **Save**, then **Install** | Kiro installs the folder; it shows "installed" and appears once in the tree, as yours. **Reinstall** after further edits; **Terminal** to test it | ☐ |
| 12.14 | **Uninstall**; **Delete** on your own power | Kiro removes the installed copy (your folder stays); Delete removes your folder after a confirm | ☐ |
| 12.15 | In a V3 chat, mention one of the power's keywords | Kiro activates the power and its tools | ☐ |

## 13a. ACP (Global only)

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.1 | Global tree | **ACP** is the last item; it isn't in a Workspace | ☐ |
| 13a.2 | Open ACP | What ACP is (another program uses Kiro as its agent; your agents, steering, skills, hooks, permissions and MCP servers apply; ACP connects a program to Kiro, MCP connects Kiro to tools), the three ways (IDE, plugin, your own program), and whether you're signed in | ☐ |
| 13a.3 | **JetBrains IDE**, **Zed**, **Editor plugin**, **Your own program** | JetBrains and Zed: steps and the file to paste, with your real `kiro-cli` path (on WSL: `wsl.exe -e <path> acp`, Windows file locations). Editor plugin: **Command** and **Arguments** fields, each with Copy. Your own program: the start command, then three labelled, readable messages (initialize, session/new, session/prompt) with what Kiro sends back; session/new turns workflows on for that session, which ACP needs even when chat.enableWorkflows is on | ☐ |
| 13a.4 | Edit the sample, **Copy**, paste somewhere | The edited text is copied; **Reset** restores the sample. Nothing is written to any file | ☐ |
| 13a.5 | Paste the JetBrains sample into `acp.json`, open AI Chat | "Kiro Agent" is in the mode selector and answers | ☐ |


## 13. Chats & usage

Every Kiro CLI chat, V3 first. V3 chats are read from Kiro's V3 chat store (`~/.kiro/sessions/<folder key>/sess_<id>/`), because `kiro-cli chat --list-sessions` lists only 2.x and classic chats; those come from that command. Context use and credits come from the details Kiro saves with each chat. The app never reads or shows what was said, and never writes to Kiro's stores. In a Workspace it shows only that Workspace's chats.

### 13.1 Chats tab

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.1.1 | Open Chats & usage | "Asking Kiro CLI for your chats…", then the list, newest first. "Updated just now" next to the title | ☐ |
| 13.1.2 | Look at a row | Title, Workspace or folder name, agent, model and rate, time ago, engine chip, tags, context bar, credits, **Resume**, copy | ☐ |
| 13.1.3 | Chat with context ≥ 80% | Amber bar; counted in **Nearly full** | ☐ |
| 13.1.4 | V3 chat | Credits, context use, agent and model shown, like a 2.x chat. A classic chat shows "—" for credits (unknown, not zero) | ☐ |
| 13.1.4a | Make a V3 chat with a custom agent (`kiro-cli chat --v3 --agent <name>`), say hello, quit, **Refresh** | It's listed with that agent and its credits, although `kiro-cli chat --list-sessions` doesn't show it | ☐ |
| 13.1.4b | Rename the kiro-cli binary (or use one too old for `--all-cwds`), **Refresh** | A warning says Kiro CLI couldn't list its 2.x chats; the V3 chats are still listed | ☐ |
| 13.1.5 | **Running now** / **Nearly full** / **All chats** counters | Each filters; click again to clear | ☐ |
| 13.1.6 | Engine chips **V3 · 2.x · Classic** | Each filters, with counts | ☐ |
| 13.1.7 | Search a word from a title, folder, agent or model | Matches. Several words must all match | ☐ |
| 13.1.8 | **Agent** and **Workspace** filters | Narrow the list | ☐ |
| 13.1.9 | **Only subagent chats** switch | Only chats that used subagents remain, each with its subagent chats indented directly under it, labelled "Subagent of: …", and the list scrolls to the first one. Their credits are already in the parent's | ☐ |
| 13.1.9a | With the switch off, **Show N subagent chats** on a parent row | Only that chat's subagent chats appear under it; **Hide** folds them | ☐ |
| 13.1.10 | Click an agent name (dotted underline) | Opens that agent | ☐ |
| 13.1.11 | **Refresh** | Asks Kiro again now | ☐ |
| 13.1.12 | More than 150 chats | **Show more** | ☐ |

### 13.2 Running state

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.2.1 | Start a chat in a terminal (`kiro-cli chat --v2` in some folder), say hello | Within a few seconds the row has a pulsing green dot and Resume is disabled | ☐ |
| 13.2.2 | Close that terminal window | Within about 3 seconds the dot turns grey and Resume enables | ☐ |
| 13.2.3 | Switch away and back to the app | The list refreshes | ☐ |
| 13.2.4 | Same with a V3 chat (`kiro-cli chat --v3`) | Running while Kiro is working on a turn (Kiro marks the V3 chat in progress), grey within about 3 seconds after the turn ends | ☐ |

### 13.3 Resume

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.3.1 | **Resume** a 2.x chat | A new terminal opens **in the chat's folder** and runs `kiro-cli chat --v2 --resume-id <id>`. The conversation continues with its history | ☐ |
| 13.3.2 | Resume a V3 chat | Runs with `--v3` | ☐ |
| 13.3.3 | Resume a classic chat | Runs with `--legacy-ui` | ☐ |
| 13.3.4 | Copy button, paste in a terminal | `cd <folder> && kiro-cli chat …` (`;` instead of `&&` on Windows PowerShell) | ☐ |
| 13.3.5 | Resume a chat whose folder was deleted | "The folder this chat was started in no longer exists: …". No terminal opens | ☐ |
| 13.3.6 | Check the terminal's prompt | Shows the chat's folder (please confirm on Windows and macOS) | ☐ |

### 13.4 Tags

Tags are the app's own labels, saved in `~/.kiro/kiroui/chat-tags.json`. Kiro's chats aren't changed, so Kiro's own pickers won't show them.

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.4.1 | **Add tag** on a row, type `Client X`, Enter, `urgent`, Enter, **Save** | Chips `#client-x` and `#urgent` | ☐ |
| 13.4.2 | Add a tag to another chat, type `cli` | `client-x` is suggested | ☐ |
| 13.4.3 | Search `#client-x` | Only chats with that tag. `#client` alone matches nothing (whole tags only) | ☐ |
| 13.4.4 | Search `urgent` (no #) | Also matches tags | ☐ |
| 13.4.5 | Click a tag chip | "Showing chats tagged #…", **Show all** clears it | ☐ |
| 13.4.6 | **Tag** filter | Every tag with its count | ☐ |
| 13.4.7 | **Manage tags** → rename `client-x` to `acme` | Every chat changes | ☐ |
| 13.4.8 | Rename to an existing tag | The two merge | ☐ |
| 13.4.9 | Delete a tag | Confirm; removed from every chat; chats stay | ☐ |
| 13.4.10 | Restart the app | Tags are still there | ☐ |
| 13.4.11 | Open `chat-tags.json` | Chat IDs with their tags | ☐ |

### 13.5 Empty chats

Chats nobody typed in (Kiro lists them as "(no title)").

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.5.1 | Default view | Empty chats are hidden; the **Only empty chats (N)** switch shows the count | ☐ |
| 13.5.2 | Turn the switch on | Only empty chats are listed, as "Empty chat, nothing was said"; the counters count them. Turning on Only subagent chats switches this off | ☐ |
| 13.5.3 | Create one: run `kiro-cli chat --v2` and quit without typing, Refresh | The count goes up by one | ☐ |
| 13.5.4 | **Delete N empty 2.x chats…** | A confirmation explains it can't be undone, that chats with messages and open chats are never touched, and that Kiro cleans up empty V3 chats itself | ☐ |
| 13.5.4a | **Clean up N empty V3 chats in Kiro…** | A terminal opens Kiro's session dashboard (`kiro-cli chat --v3 --sessions`); the message says how to review and delete empty sessions there | ☐ |
| 13.5.5 | Confirm | "Deleted N empty chats." They're gone from the list and from `kiro-cli chat --list-sessions` | ☐ |
| 13.5.6 | Type in an empty chat after opening the dialog, then confirm | That chat is left alone ("they changed") | ☐ |

### 13.5a Deleting a chat

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.5a.1 | Bin icon on a 2.x or classic chat | A message box: "Delete "<title>"?", explaining Kiro deletes it with `kiro-cli chat --delete-session`, that it can't be undone, and that its tags go too | ☐ |
| 13.5a.2 | **Cancel** | The chat stays | ☐ |
| 13.5a.3 | **Delete chat** | "Deleted the chat." It's gone from the list and from `kiro-cli chat --list-sessions`; `--resume-id` no longer finds it | ☐ |
| 13.5a.4 | Delete a chat that started subagent chats | After the first box, a second asks "Also delete its N subagent chats?" **Delete them too** removes them as well; **Keep** deletes only the chat | ☐ |
| 13.5a.5 | Bin icon on a running chat | Disabled: "This chat is open in a terminal. Quit it first." | ☐ |
| 13.5a.6 | Bin icon on a V3 chat | Opens Kiro's session dashboard in a terminal in the chat's folder; the message says to highlight the chat, press Ctrl+D, then y, and Refresh here | ☐ |

### 13.6 Usage tab

The top card is **Your plan**: Kiro's own estimate for your whole account (`kiro-cli chat --no-interactive /usage`), covering V3, 2.x, the IDE, Web and other computers. Below it, **On this computer** is what the app reads from local chat files.

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.6.0a | Open **Usage** | "Asking Kiro for your plan usage…" (about 10 seconds), then the card: a ring with % used (as Kiro reports it), "X of Y credits", plan name, "Managed by your organization" if it is, reset date and days left | ☐ |
| 13.6.0b | Pace line | "About N a day since 1 <month>; at this pace about M by the reset". The faint arc on the ring is the forecast | ☐ |
| 13.6.0c | Compare with `kiro-cli chat --no-interactive /usage` in a terminal, and with app.kiro.dev/account/usage | Same used, limit, reset and plan. **Details** shows Kiro's own text | ☐ |
| 13.6.0d | Advice box: overages **on**, none used | Green "Overages are on": past the limit you keep working; extra credits cost $0.04 each (billed to your organization if managed) | ☐ |
| 13.6.0e | Overages **on**, some used | "N credits over your plan, about $X", and the projected total by the reset | ☐ |
| 13.6.0f | Overages **off** (organization) | "Overages are off": Kiro pauses at the limit until the reset; ask your Kiro administrator to turn on Overages (Kiro console → Settings → Kiro settings); $0.04 per extra credit. Amber when the pace runs out before the reset, red when the limit is reached | ☐ |
| 13.6.0g | Individual paid plan | Explains add-on credits: $0.04 each, packs from $5 for 125, at app.kiro.dev/account/usage | ☐ |
| 13.6.0h | Kiro Free | "Kiro Free has no extra credits": pauses at 50 until the reset | ☐ |
| 13.6.0i | 99.5% used | Shows 99.5%, never 100%, until the limit is actually reached | ☐ |
| 13.6.0j | Signed out (`kiro-cli logout`), **Refresh** on the card | "Plan usage isn't available right now. You aren't signed in…" with the fix. Everything under **On this computer** still works. Sign in again | ☐ |
| 13.6.0k | Offline, **Refresh** on the card | "Kiro can't be reached…" with the fix; the rest still works | ☐ |
| 13.6.0l | Card **Refresh** | Asks Kiro again (otherwise the card is kept for 5 minutes, as Kiro updates usage at least every 5 minutes) | ☐ |
| 13.6.1 | Open **Usage** | Tiles: Today, Last 7 days, Last 30 days (credits), Running now | ☐ |
| 13.6.2 | Note under the tiles | Says credits are known for X of Y chats, and why (V3 and classic) | ☐ |
| 13.6.3 | Daily chart | 30 bars; hover shows the date and credits; today is brightest | ☐ |
| 13.6.4 | **By agent** | Credits, chats, average context, main model. Amber advice for expensive models or chats that ran nearly full | ☐ |
| 13.6.5 | **By model**, **By folder** | Totals with bars (By folder only in Global) | ☐ |
| 13.6.6 | **Chats that used the most** | Top 10, each with Resume | ☐ |
| 13.6.7 | Compare today's total with your Kiro account page | Roughly matches for 2.x usage (the account page is the authority) | ☐ |

### 13.7 Connected to agents

| # | Test | Expected | Pass |
|---|---|---|---|
| 13.7.1 | Open an agent you've chatted with | **Usage** section: credits, turns, context, main model, advice | ☐ |
| 13.7.2 | With a chat using that agent open in a terminal | Usage header shows **in use**; the section says running chats keep the old version | ☐ |
| 13.7.3 | Save that agent while its chat runs | "…running chat still uses the old version until quit and resumed." | ☐ |

---

## 13a. Testing the newer V3 features end to end

Sections 8–11 check that each screen works. This section goes one step further: it checks that **Kiro itself** behaves the way the app configured it. You need a terminal, and these features need **Kiro CLI V3** chats (`kiro-cli chat --v3`).

### 13a.0 Setup

Create a scratch project and add it as a Workspace in the app (**Add workspace**, bottom left).

- **macOS / Linux / WSL:**

  ```bash
  mkdir -p ~/cck-test/api ~/cck-test/secrets ~/cck-test/src
  echo "API_KEY=do-not-read" > ~/cck-test/.env
  echo "Always answer in British English." > ~/cck-test/AGENTS.md
  echo "API code uses snake_case." > ~/cck-test/api/AGENTS.md
  echo "*" > ~/cck-test/secrets/.kiroignore
  echo "top secret" > ~/cck-test/secrets/notes.txt
  echo "def hello(): return 1" > ~/cck-test/src/app.py
  ```

- **Windows (PowerShell):**

  ```powershell
  $t = "$env:USERPROFILE\cck-test"
  New-Item -ItemType Directory -Force "$t\api","$t\secrets","$t\src" | Out-Null
  "API_KEY=do-not-read" | Set-Content "$t\.env"
  "Always answer in British English." | Set-Content "$t\AGENTS.md"
  "API code uses snake_case." | Set-Content "$t\api\AGENTS.md"
  "*" | Set-Content "$t\secrets\.kiroignore"
  "top secret" | Set-Content "$t\secrets\notes.txt"
  "def hello(): return 1" | Set-Content "$t\src\app.py"
  ```

### 13a.1 Hook triggers

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.1.1 | Global → **Hooks**, point at it, press **+**, name it `test`. Press **Add hook** and open **When** | **Session ends (CLI V3)** and **Manual** are at the bottom of the list | ☐ |
| 13a.1.2 | Pick **After Kiro saves a file**, type `\.ts$` in **Which files**, then switch **When** to **Session ends (CLI V3)** | The file box disappears; the JSON on the right has no `matcher` | ☐ |
| 13a.1.3 | Set the hook to **Run command** `echo bye > ~/cck-hook.txt` (Windows: `echo bye > %USERPROFILE%\cck-hook.txt`), Save. Start `kiro-cli chat --v3`, say hi, quit | `cck-hook.txt` exists: Kiro ran the hook when the session ended | ☐ |
| 13a.1.4 | Delete the `test` hook file afterwards | | ☐ |

### 13a.2 Kiroignore

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.2.1 | Global → **Kiroignore** (dimmed: no file yet). Press **Start with common secrets**, then **Save** | "Saved. New Kiro chats skip these files." `~/.kiro/settings/kiroignore` contains `.env`, `*.pem`, `!.env.example` | ☐ |
| 13a.2.2 | In `cck-test`, run `kiro-cli chat --v3` and ask "read the .env file" | Kiro refuses or can't find it | ☐ |
| 13a.2.3 | In the app, open the `cck-test` Workspace → **Kiroignore** | `secrets/.kiroignore` is listed under it; opening it says "files in this folder and below" | ☐ |
| 13a.2.4 | In the chat, ask "read secrets/notes.txt" | Kiro refuses or can't find it | ☐ |
| 13a.2.5 | Ask "read src/app.py" | Kiro reads it (not ignored) | ☐ |

### 13a.3 Prompts

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.3.1 | Global → **Prompts**, point at it, press **+**, type a 51-character name | "Use at most 50 characters" | ☐ |
| 13a.3.2 | Name it `review`, **Create** | `review.md` opens with "Review the changes in $ARGUMENTS…" | ☐ |
| 13a.3.3 | In `cck-test`, `kiro-cli chat --v3`, type `/` | `review` is in the list | ☐ |
| 13a.3.4 | Type `/review src/` | Kiro reviews `src/`: `$ARGUMENTS` was replaced by `src/` | ☐ |
| 13a.3.5 | Create a Workspace prompt with the same name `review` and different text, run `/review` again | The Workspace prompt wins | ☐ |

### 13a.4 AGENTS.md

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.4.1 | `cck-test` Workspace → **Steering** | "AGENTS.md (project root)" and "AGENTS.md (api)" | ☐ |
| 13a.4.2 | Create an agent in the Workspace and click it in the navigator | Faint dotted lines to both AGENTS.md files (inherited) | ☐ |
| 13a.4.3 | In `cck-test`, `kiro-cli chat --v3`, ask "what colour is the sky?" | The answer uses British spelling ("colour"): Kiro loaded the root AGENTS.md | ☐ |

### 13a.5 Built-in agents

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.5.1 | Global → **Agents** (click the word Agents) → click the **Built into Kiro CLI** bar | `kiro_default`, `kiro_help`, `kiro_planner`… with descriptions, and which agent new chats start with | ☐ |
| 13a.5.2 | Compare with `kiro-cli agent list` in a terminal | Same built-in agents | ☐ |
| 13a.5.3 | Global → **Settings** → search `defaultAgent` → open the list | Built-in agents marked "(built-in)", then your own | ☐ |
| 13a.5.4 | Choose `kiro_planner`, Save, start `kiro-cli chat --v3` | The chat starts with the planner agent. Set it back to Kiro's default afterwards | ☐ |

### 13a.6 Workspace trust and Workspace permissions

This also checks a fixed bug: Workspace rules must be saved in the exact folder Kiro CLI reads.

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.6.1 | `cck-test` Workspace → **Permissions** | Amber: "Kiro doesn't trust this Workspace yet", with an explanation | ☐ |
| 13a.6.2 | In a terminal: `cd ~/cck-test` then `kiro-cli chat --v3`. Choose **Trust, continue**, then quit | | ☐ |
| 13a.6.3 | In the app, click another item, then **Permissions** again | Green: "Kiro trusts this Workspace" | ☐ |
| 13a.6.4 | **Add rule**: capability `shell`, effect `ask`, match `git status*`. **Save** | "Permissions saved" | ☐ |
| 13a.6.5 | In `cck-test`, `kiro-cli chat --v3`, ask "run git status" | Kiro asks for approval first: it read the rule the app saved | ☐ |
| 13a.6.6 | Change the rule's effect to `deny`, Save, ask again | Kiro refuses to run it | ☐ |
| 13a.6.7 | Check the trust is kept: Permissions still shows "Kiro trusts this Workspace" after saving | | ☐ |
| 13a.6.8 | Remove the rule and Save | | ☐ |

### 13a.7 Admin policy (optional)

Normally you see nothing, because only organizations deploy a policy. To try it, create a harmless sample. **While the file exists, every Kiro chat on this computer asks before web searches, so delete it afterwards.**

- **Linux / WSL:**

  ```bash
  sudo mkdir -p /etc/kiro
  echo '{"rules":[{"capability":"web_search","effect":"ask"}]}' | sudo tee /etc/kiro/managed-settings.json
  ```
  Remove: `sudo rm /etc/kiro/managed-settings.json`

- **macOS:**

  ```bash
  sudo mkdir -p "/Library/Application Support/Kiro"
  echo '{"rules":[{"capability":"web_search","effect":"ask"}]}' | sudo tee "/Library/Application Support/Kiro/managed-settings.json"
  ```
  Remove: `sudo rm "/Library/Application Support/Kiro/managed-settings.json"`

- **Windows (PowerShell as Administrator):**

  ```powershell
  New-Item -ItemType Directory -Force "C:\ProgramData\Kiro" | Out-Null
  '{"rules":[{"capability":"web_search","effect":"ask"}]}' | Set-Content "C:\ProgramData\Kiro\managed-settings.json"
  ```
  Remove: `Remove-Item "C:\ProgramData\Kiro\managed-settings.json"`

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.7.1 | Reload the app (refresh the browser tab) | Global shows a new **Admin policy** item | ☐ |
| 13a.7.2 | Open **Admin policy** | Read-only; the rule is listed as `ask web_search` | ☐ |
| 13a.7.3 | Global → **Permissions** | "Your organization applies 1 rule you can't change", with the rule | ☐ |
| 13a.7.4 | Start `kiro-cli chat --v3` and ask it to search the web | Kiro asks first | ☐ |
| 13a.7.5 | Write `{broken` into the file, reload | Permissions says the policy file isn't valid JSON | ☐ |
| 13a.7.6 | Delete the file, reload | **Admin policy** is gone | ☐ |

### 13a.8 Sandbox

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.8.1 | Global → **Sandbox** on Linux/WSL without Bubblewrap | Warning "This computer can't run the sandbox yet", naming `bwrap` | ☐ |
| 13a.8.2 | Install it: `sudo apt install bubblewrap socat` (Fedora: `sudo dnf install bubblewrap socat`). Reopen Sandbox | The warning is gone | ☐ |
| 13a.8.3 | macOS | No warning (macOS has the sandbox built in) | ☐ |
| 13a.8.4 | Windows | A note to run `/sandbox setup` once in a Kiro CLI chat for the network modes that need it | ☐ |
| 13a.8.5 | Turn on **Run agent shell commands in the sandbox**, set **Network access** to **Common services**, Save | JSON: `"enabled": true, "networkAccess": "COMMON_DEPENDENCIES"` | ☐ |
| 13a.8.6 | In `kiro-cli chat --v3`, ask it to run `curl -sI https://example.com` | Blocked, or Kiro asks: example.com isn't a common service | ☐ |
| 13a.8.7 | Ask it to run `curl -sI https://registry.npmjs.org` | Allowed: package registries are common services | ☐ |
| 13a.8.8 | `cck-test` Workspace → **Sandbox** | "Global turns the sandbox on with COMMON_DEPENDENCIES… can make it stricter, but not looser" | ☐ |
| 13a.8.9 | Turn it on, open **Network access** | **Open (DEFAULT_ALLOWED)** is greyed out: "looser than Global" | ☐ |
| 13a.8.10 | Type `"enabled": false` in the Workspace JSON | Warning that a Workspace can't turn off the Global sandbox | ☐ |
| 13a.8.11 | **Undo:** turn the Global sandbox off and Save (unless you want sandboxed chats), and discard the Workspace change | | ☐ |

### 13a.9 Reasoning effort

| # | Test | Expected | Pass |
|---|---|---|---|
| 13a.9.1 | Global → **Settings** → search `modelDefaults` | Each Claude and GPT model with an **Effort** list (Model default, low, medium, high, xhigh, max) | ☐ |
| 13a.9.2 | Set one Claude model to **high**, Save | `cli.json` has `"chat.modelDefaults": {"<model>": {"output_config": {"effort": "high"}}}` | ☐ |
| 13a.9.3 | Set a GPT model to **low**, Save | That model uses `"reasoning": {"effort": "low"}` | ☐ |
| 13a.9.4 | `kiro-cli chat --v3 --model <that Claude model>`, then type `/model` | Effort shows **high** | ☐ |
| 13a.9.5 | **Edit as JSON**, add `"thinking": {"type": "adaptive"}` to that model, then change its effort in the list | The thinking setting is kept | ☐ |
| 13a.9.6 | Set the effort back to **Model default**, Save | The model's entry is removed (or keeps only your other fields) | ☐ |

### 13a.10 Clean up

- Delete `~/cck-test` (or `%USERPROFILE%\cck-test`) and remove it from Workspaces with **X**.
- Delete `~/.kiro/prompts/review.md`, the `test` hook file and `~/cck-hook.txt`.
- Keep or delete `~/.kiro/settings/kiroignore`, as you prefer.
- Remove any admin policy file you created (13a.7).
- Restore `chat.defaultAgent` and any effort you don't want, in Settings.

---

## 14. Safety checks

| # | Test | Expected | Pass |
|---|---|---|---|
| 14.1 | Open the app's address from another computer on your network | It doesn't load (the app only listens on this computer) | ☐ |
| 14.2 | Call `http://127.0.0.1:3030/api/system/info` from a terminal without the token | Refused (401) | ☐ |
| 14.3 | Any destructive button (Delete agent, Uninstall power, Delete tag, Delete empty chats, Upgrade) | Always asks first | ☐ |
| 14.4 | Edit a file in another editor while it's open in the app, then Save in the app | You're not silently overwriting a different file. Note what happens | ☐ |

---

## 15. Platform matrix

Run sections 0–13a on each platform you support. Mark each section.

| Section | Windows | macOS | Linux | WSL |
|---|---|---|---|---|
| 0 Start | ☐ | ☐ | ☐ | ☐ |
| 2 Status | ☐ | ☐ | ☐ | ☐ |
| 3–4 Navigator, Workspaces | ☐ | ☐ | ☐ | ☐ |
| 5 Agents + Terminal | ☐ | ☐ | ☐ | ☐ |
| 6 V3 upgrade | ☐ | ☐ | ☐ | ☐ |
| 7 MCP | ☐ | ☐ | ☐ | ☐ |
| 8–10 Permissions, Sandbox, Hooks, Steering, Skills | ☐ | ☐ | ☐ | ☐ |
| 11 Settings | ☐ | ☐ | ☐ | ☐ |
| 12 Powers | ☐ | ☐ | ☐ | ☐ |
| 13 Chats & usage (esp. Resume folder, running dot) | ☐ | ☐ | ☐ | ☐ |
| 13a Newer V3 features end to end | ☐ | ☐ | ☐ | ☐ |

Things most likely to differ by platform: terminals opening (5.3, 13.3), paths with spaces and drive letters (4.6), the running dot (13.2), and Windows' WSL option for MCP (7.9).

## 16. Reporting a problem

For each failure, note: the test number, platform, kiro-cli version (`kiro-cli --version`), what you did, what you expected, what happened, and a screenshot. The status panel's **Details** (section 2) is useful for anything involving kiro-cli.

## 17. Where the app writes

| What | Where |
|---|---|
| Agents, MCP, permissions, hooks, steering, skills, prompts, settings, sandbox | Kiro's own files in `~/.kiro` (Global) or `<project>/.kiro` (Workspace) |
| Kiroignore | `~/.kiro/settings/kiroignore` (Global) or `<project>/.kiroignore` |
| Workspace permissions | `~/.kiro/workspace-roots/<id>/permissions.yaml` (outside the project, as Kiro requires) |
| Admin policy | Never written (read-only) |
| Agent upgrade backups | `<agent>.json.bak` next to the agent (made by Kiro) |
| Workspace list | `~/.kiro/kiroui/workspaces.json` |
| Chat tags | `~/.kiro/kiroui/chat-tags.json` |
| Powers | Changed only through `kiro-cli powers` |
| Chats | Never written; deleted only through `kiro-cli chat --delete-session`, after you confirm |
| Logs | The system temp folder, `kiromanager` |
