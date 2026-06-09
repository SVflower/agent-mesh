use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::env;
use std::fs;
use std::io::Write;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
struct AppStatus {
  name: &'static str,
  ready: bool,
  message: &'static str,
}

#[derive(Clone, Copy)]
struct RuntimeDefinition {
  id: &'static str,
  name: &'static str,
  kind: &'static str,
  connection_type: &'static str,
  candidates: &'static [&'static str],
  version_args: &'static [&'static str],
  capabilities: &'static [&'static str],
  skills: &'static [&'static str],
  mcps: &'static [&'static str],
  best_for: &'static [&'static str],
}

#[derive(Serialize)]
struct RuntimeDetection {
  id: &'static str,
  name: &'static str,
  kind: &'static str,
  connection_type: &'static str,
  installed: bool,
  health: &'static str,
  status: &'static str,
  executable_path: Option<String>,
  version: Option<String>,
  detected_at: String,
  diagnostic: String,
  capabilities: Vec<&'static str>,
  skills: Vec<&'static str>,
  mcps: Vec<&'static str>,
  best_for: Vec<&'static str>,
}

#[derive(Serialize)]
struct RuntimeDetectionResponse {
  detected_at: String,
  runtimes: Vec<RuntimeDetection>,
}

#[derive(Serialize)]
struct RuntimeAdapterStatus {
  runtime_kind: &'static str,
  display_name: &'static str,
  detect: &'static str,
  list_personas: &'static str,
  dispatch: &'static str,
  cancel: &'static str,
  session_status: &'static str,
  notes: &'static str,
}

#[derive(Clone)]
struct RuntimeCandidate {
  value: String,
  source: &'static str,
}

#[derive(Clone)]
struct ResolvedRuntimeCommand {
  path: PathBuf,
  candidate: String,
  source: &'static str,
}

#[derive(Deserialize)]
struct SaveOfficePayload {
  office: Value,
  members: Vec<Value>,
  channel: Option<Value>,
}

#[derive(Serialize)]
struct TaskSummary {
  id: String,
  status: String,
  objective: String,
  agent: String,
  agent_type: String,
  workspace_path: Option<String>,
  created_at: Option<String>,
  updated_at: Option<String>,
  completed_at: Option<String>,
}

#[derive(Serialize)]
struct LogTail {
  path: String,
  lines: Vec<String>,
}

#[derive(Deserialize)]
struct CreateChatTaskPayload {
  office_id: String,
  task_type_id: String,
  routing_policy_id: String,
  assigned_member_id: String,
  objective: String,
  context: String,
  acceptance: Vec<String>,
  constraints: Vec<String>,
}

#[derive(Clone)]
struct CliRuntimeAdapter {
  runtime_kind: &'static str,
  display_name: &'static str,
  agent_type: &'static str,
  default_candidates: &'static [&'static str],
  invocation_args: &'static [&'static str],
  next_step: &'static str,
}

const RUNTIME_DEFINITIONS: &[RuntimeDefinition] = &[
  RuntimeDefinition {
    id: "hermes",
    name: "Hermes",
    kind: "hermes",
    connection_type: "cli",
    candidates: &["hermes.exe", "hermes.cmd", "hermes.ps1", "hermes"],
    version_args: &["--version"],
    capabilities: &["channel.feishu", "task.request", "mcp.client"],
    skills: &["task.dispatch", "channel.route", "status.query"],
    mcps: &["agent-mesh"],
    best_for: &["主 Agent", "渠道入口", "任务路由"],
  },
  RuntimeDefinition {
    id: "openclaw",
    name: "OpenClaw",
    kind: "openclaw",
    connection_type: "desktop",
    candidates: &["openclaw.exe", "openclaw.cmd", "openclaw.ps1", "openclaw"],
    version_args: &["--version"],
    capabilities: &["browser.operate", "ui.inspect", "workflow.automate"],
    skills: &["browser.operate", "ui.inspect", "workflow.automate"],
    mcps: &["browser", "filesystem"],
    best_for: &["浏览器任务", "UI 检查", "流程自动化"],
  },
  RuntimeDefinition {
    id: "codex",
    name: "Codex",
    kind: "codex",
    connection_type: "cli",
    candidates: &["codex.exe", "codex.cmd", "codex.ps1", "codex"],
    version_args: &["--version"],
    capabilities: &["code.edit", "code.review", "docs.write", "task.plan"],
    skills: &["code.edit", "test.run", "docs.write"],
    mcps: &["filesystem", "browser", "agent-mesh"],
    best_for: &["规划", "重构", "文档"],
  },
  RuntimeDefinition {
    id: "claude-code",
    name: "Claude Code",
    kind: "claude-code",
    connection_type: "cli",
    candidates: &["claude.exe", "claude.cmd", "claude.ps1", "claude"],
    version_args: &["--version"],
    capabilities: &["code.implement", "code.review", "repo.inspect"],
    skills: &["code.implement", "code.review", "repo.inspect"],
    mcps: &["filesystem", "git", "agent-mesh"],
    best_for: &["实现", "代码审查", "仓库分析"],
  },
];

const CLAUDE_CODE_ADAPTER: CliRuntimeAdapter = CliRuntimeAdapter {
  runtime_kind: "claude-code",
  display_name: "Claude Code",
  agent_type: "claude-cli",
  default_candidates: &["claude.exe", "claude.cmd", "claude.ps1", "claude"],
  invocation_args: &["--output-format", "json", "--dangerously-skip-permissions"],
  next_step: "Check Claude Code installation, configured executable path, and task logs.",
};

const CODEX_ADAPTER: CliRuntimeAdapter = CliRuntimeAdapter {
  runtime_kind: "codex",
  display_name: "Codex",
  agent_type: "codex-cli",
  default_candidates: &["codex.exe", "codex.cmd", "codex.ps1", "codex"],
  invocation_args: &["exec", "--json"],
  next_step: "Check Codex CLI permissions, configured executable path, and task logs.",
};

#[tauri::command]
fn app_status() -> AppStatus {
  AppStatus {
    name: "agent-mesh",
    ready: true,
    message: "Agent Mesh desktop shell is initialized",
  }
}

#[tauri::command]
fn detect_runtimes() -> RuntimeDetectionResponse {
  let detected_at = current_timestamp();
  let config = read_config().ok();
  let runtimes = RUNTIME_DEFINITIONS
    .iter()
    .map(|definition| {
      let configured_candidates = configured_runtime_candidates(config.as_ref(), definition.kind);
      detect_runtime(*definition, configured_candidates, detected_at.clone())
    })
    .collect();

  RuntimeDetectionResponse {
    detected_at,
    runtimes,
  }
}

#[tauri::command]
fn list_runtime_adapters() -> Vec<RuntimeAdapterStatus> {
  vec![
    RuntimeAdapterStatus {
      runtime_kind: "hermes",
      display_name: "Hermes",
      detect: "implemented",
      list_personas: "manual",
      dispatch: "planned",
      cancel: "planned",
      session_status: "planned",
      notes: "Profile and Channel relationships are modeled. Real profile switching and task entry still need adapter verification.",
    },
    RuntimeAdapterStatus {
      runtime_kind: "openclaw",
      display_name: "OpenClaw",
      detect: "implemented",
      list_personas: "manual",
      dispatch: "planned",
      cancel: "planned",
      session_status: "planned",
      notes: "CoCo and Huajuan are maintained as manual Persona/Profile records until OpenClaw automatic discovery is verified.",
    },
    RuntimeAdapterStatus {
      runtime_kind: "codex",
      display_name: "Codex",
      detect: "implemented",
      list_personas: "default",
      dispatch: "implemented",
      cancel: "implemented",
      session_status: "implemented",
      notes: "Dispatch uses codex exec --json with stdin prompt. Current machine still reports Access is denied when running Codex CLI.",
    },
    RuntimeAdapterStatus {
      runtime_kind: "claude-code",
      display_name: "Claude Code",
      detect: "implemented",
      list_personas: "default",
      dispatch: "verified",
      cancel: "implemented",
      session_status: "implemented",
      notes: "Claude Code dispatch, worker pid cancellation, logs, result raw diagnostics, and session capture have been verified.",
    },
  ]
}

#[tauri::command]
fn load_agent_mesh_config() -> Result<Value, String> {
  read_config()
}

#[tauri::command]
fn save_agent_mesh_config(config: Value) -> Result<Value, String> {
  write_config(&config)?;
  Ok(config)
}

#[tauri::command]
fn list_personas() -> Result<Vec<Value>, String> {
  let config = read_config()?;
  let runtimes = config.get("runtimes").and_then(Value::as_object).cloned().unwrap_or_default();
  let personas = config.get("personas").and_then(Value::as_object).cloned().unwrap_or_default();

  let mut rows = personas
    .values()
    .cloned()
    .map(|mut persona| {
      let runtime_id = persona
        .get("runtime_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
      if let Some(object) = persona.as_object_mut() {
        object.insert("runtime".to_string(), runtimes.get(&runtime_id).cloned().unwrap_or(Value::Null));
      }
      persona
    })
    .collect::<Vec<_>>();

  rows.sort_by_key(|persona| {
    persona
      .get("name")
      .and_then(Value::as_str)
      .unwrap_or_default()
      .to_string()
  });

  Ok(rows)
}

#[tauri::command]
fn list_offices() -> Result<Vec<Value>, String> {
  let config = read_config()?;
  Ok(build_office_rows(&config))
}

#[tauri::command]
fn save_office(payload: SaveOfficePayload) -> Result<Value, String> {
  let mut config = read_config()?;

  upsert_named_value(&mut config, "offices", &payload.office)?;
  for member in &payload.members {
    upsert_named_value(&mut config, "officeMembers", member)?;
  }
  if let Some(channel) = &payload.channel {
    upsert_named_value(&mut config, "channels", channel)?;
  }

  write_config(&config)?;
  Ok(config)
}

#[tauri::command]
fn list_tasks() -> Result<Vec<TaskSummary>, String> {
  let task_root = workspace_root()?.join(".agent-mesh").join("tasks");
  if !task_root.exists() {
    return Ok(Vec::new());
  }

  let mut tasks = Vec::new();
  for entry in fs::read_dir(task_root).map_err(|error| error.to_string())? {
    let path = entry.map_err(|error| error.to_string())?.path();
    if path.extension().and_then(|value| value.to_str()) != Some("json") {
      continue;
    }

    let value = read_json_file(&path)?;
    tasks.push(task_summary_from_value(&value, &path));
  }

  tasks.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
  Ok(tasks)
}

#[tauri::command]
fn get_task_detail(task_id: String) -> Result<Value, String> {
  let path = workspace_root()?.join(".agent-mesh").join("tasks").join(format!("{task_id}.json"));
  read_json_file(&path)
}

#[tauri::command]
fn get_task_log_tail(task_id: String) -> Result<Vec<LogTail>, String> {
  let task_dir = workspace_root()?.join(".agent-mesh").join("tasks").join(&task_id);
  let mut logs = Vec::new();

  for file_name in ["events.jsonl", "stdout.log", "stderr.log"] {
    let path = task_dir.join(file_name);
    if path.exists() {
      logs.push(LogTail {
        path: path.display().to_string(),
        lines: tail_lines(&path, 80)?,
      });
    }
  }

  Ok(logs)
}

#[tauri::command]
fn cancel_task(task_id: String) -> Result<Value, String> {
  let (task_path, task_dir) = task_paths(&task_id)?;
  let mut task = read_json_file(&task_path)?;
  let status = task.get("status").and_then(Value::as_str).unwrap_or("unknown");
  if matches!(status, "completed" | "failed" | "cancelled") {
    return Ok(task);
  }

  let now = iso_timestamp();
  let pid = task_worker_pid(&task);
  let kill_result = pid.map(kill_process_tree);
  let killed = kill_result.as_ref().is_some_and(|result| result.is_ok());
  let kill_error = kill_result
    .as_ref()
    .and_then(|result| result.as_ref().err())
    .cloned();
  update_task_status(&mut task, "cancelled", Some(now.clone()));
  if let Some(object) = task.as_object_mut() {
    object.insert("completedAt".to_string(), Value::String(now.clone()));
    object.insert(
      "result".to_string(),
      serde_json::json!({
        "status": "cancelled",
        "summary": "Task was cancelled from Agent Mesh desktop.",
        "changed_files": [],
        "tests": [],
        "risks": if killed { Vec::<String>::new() } else { vec!["Process tree termination was not confirmed.".to_string()] },
        "next_steps": ["Check runtime logs and retry if needed."],
        "raw": {
          "pid": pid,
          "killed": killed,
          "killError": kill_error
        }
      }),
    );
  }
  push_task_event(
    &mut task,
    "cancelled",
    if killed { "Task cancelled and worker process tree was terminated." } else { "Task cancelled; worker process tree termination was not confirmed." },
    Some(now.clone()),
  );
  write_task_file(&task_path, &task)?;
  append_jsonl_event(
    &task_dir,
    serde_json::json!({
      "at": now,
      "taskId": task_id,
      "type": "cancel_requested",
      "source": "agent-mesh-desktop",
      "pid": pid,
      "killed": killed,
      "killError": kill_error
    }),
  )?;

  Ok(task)
}

#[tauri::command]
fn retry_task(task_id: String) -> Result<Value, String> {
  let root = workspace_root()?;
  let state_dir = root.join(".agent-mesh");
  let task_root = state_dir.join("tasks");
  let source_path = task_root.join(format!("{task_id}.json"));
  let source = read_json_file(&source_path)?;

  let now = iso_timestamp();
  let retry_id = format!("retry_{}_{}", task_id, current_timestamp_millis());
  let retry_dir = task_root.join(&retry_id);
  fs::create_dir_all(&retry_dir).map_err(|error| error.to_string())?;

  let mut retry = source.clone();
  replace_task_id(&mut retry, &retry_id, &state_dir);
  if let Some(object) = retry.as_object_mut() {
    object.insert("id".to_string(), Value::String(retry_id.clone()));
    object.insert("status".to_string(), Value::String("queued".to_string()));
    object.insert("createdAt".to_string(), Value::String(now.clone()));
    object.insert("updatedAt".to_string(), Value::String(now.clone()));
    object.remove("completedAt");
    object.insert("result".to_string(), Value::Null);
    object.insert("retry_of".to_string(), Value::String(task_id.clone()));
    object.insert(
      "events".to_string(),
      Value::Array(vec![
        serde_json::json!({
          "at": now,
          "status": "created",
          "message": format!("Retry task created from {task_id}.")
        }),
        serde_json::json!({
          "at": now,
          "status": "queued",
          "message": "Retry task queued locally. Dispatch manually when ready."
        }),
      ]),
    );
  }

  write_task_file(&task_root.join(format!("{retry_id}.json")), &retry)?;
  append_jsonl_event(
    &retry_dir,
    serde_json::json!({
      "at": now,
      "taskId": retry_id,
      "type": "retry_created",
      "sourceTaskId": task_id
    }),
  )?;
  fs::write(retry_dir.join("stdout.log"), "").map_err(|error| error.to_string())?;
  fs::write(retry_dir.join("stderr.log"), "").map_err(|error| error.to_string())?;

  Ok(retry)
}

#[tauri::command]
fn get_task_session_status(task_id: String) -> Result<Value, String> {
  let (task_path, _) = task_paths(&task_id)?;
  let task = read_json_file(&task_path)?;
  Ok(task_session_status(&task, &task_id))
}

#[tauri::command]
fn reset_task_session(task_id: String) -> Result<Value, String> {
  let (task_path, task_dir) = task_paths(&task_id)?;
  let mut task = read_json_file(&task_path)?;
  let now = iso_timestamp();
  let mut session = task_session_status(&task, &task_id);
  let removed_session_file = task_workspace_repo(&task)
    .map(|repo| remove_runtime_session(&repo))
    .transpose()?
    .unwrap_or(false);

  if let Some(object) = session.as_object_mut() {
    object.insert("status".to_string(), Value::String("reset".to_string()));
    object.insert("updated_at".to_string(), Value::String(now.clone()));
    object.insert("reset_at".to_string(), Value::String(now.clone()));
    object.insert("removed_session_file".to_string(), Value::Bool(removed_session_file));
  }

  if let Some(object) = task.as_object_mut() {
    object.insert("session".to_string(), session.clone());
    object.insert("updatedAt".to_string(), Value::String(now.clone()));
  }
  push_task_event(&mut task, "session_reset", "Task session marked as reset from Agent Mesh desktop.", Some(now.clone()));
  write_task_file(&task_path, &task)?;
  append_jsonl_event(
    &task_dir,
    serde_json::json!({
      "at": now,
      "taskId": task_id,
      "type": "session_reset",
      "source": "agent-mesh-desktop",
      "removedSessionFile": removed_session_file
    }),
  )?;

  Ok(session)
}

#[tauri::command]
fn create_chat_task(payload: CreateChatTaskPayload) -> Result<Value, String> {
  let root = workspace_root()?;
  let state_dir = root.join(".agent-mesh");
  let task_root = state_dir.join("tasks");
  fs::create_dir_all(&task_root).map_err(|error| error.to_string())?;

  let now = iso_timestamp();
  let task_id = format!("chat_{}", current_timestamp_millis());
  let task_dir = task_root.join(&task_id);
  fs::create_dir_all(&task_dir).map_err(|error| error.to_string())?;

  let task = serde_json::json!({
    "id": task_id,
    "type": "task.assign",
    "status": "queued",
    "createdAt": now,
    "updatedAt": now,
    "agent": payload.assigned_member_id,
    "agentType": "office-member",
    "office_id": payload.office_id,
    "assigned_member_id": payload.assigned_member_id,
    "task_type_id": payload.task_type_id,
    "routing_policy_id": payload.routing_policy_id,
    "task": {
      "id": task_id,
      "type": "task.assign",
      "from": "agent-mesh-chat",
      "to": payload.assigned_member_id,
      "role": "office_member",
      "objective": payload.objective,
      "workspace": {
        "repo": root.display().to_string()
      },
      "context": {
        "text": payload.context
      },
      "constraints": payload.constraints,
      "acceptance": payload.acceptance,
      "expected_output": {
        "format": "patch_with_summary",
        "include_tests": true
      },
      "observer": {
        "stateDir": state_dir.display().to_string(),
        "taskId": task_id
      }
    },
    "events": [
      {
        "at": now,
        "status": "created",
        "message": "Task accepted by Agent Mesh Chat."
      },
      {
        "at": now,
        "status": "queued",
        "message": "Task queued locally. Runtime dispatch is pending adapter integration."
      }
    ],
    "result": null
  });

  fs::write(
    task_root.join(format!("{task_id}.json")),
    format!("{}\n", serde_json::to_string_pretty(&task).map_err(|error| error.to_string())?),
  )
  .map_err(|error| error.to_string())?;

  let mut events = fs::File::create(task_dir.join("events.jsonl")).map_err(|error| error.to_string())?;
  writeln!(
    events,
    "{}",
    serde_json::json!({
      "at": now,
      "taskId": task_id,
      "type": "created",
      "source": "agent-mesh-chat",
      "office_id": payload.office_id,
      "assigned_member_id": payload.assigned_member_id
    })
  )
  .map_err(|error| error.to_string())?;
  writeln!(
    events,
    "{}",
    serde_json::json!({
      "at": now,
      "taskId": task_id,
      "type": "queued",
      "message": "Runtime dispatch pending adapter integration."
    })
  )
  .map_err(|error| error.to_string())?;
  fs::write(task_dir.join("stdout.log"), "").map_err(|error| error.to_string())?;
  fs::write(task_dir.join("stderr.log"), "").map_err(|error| error.to_string())?;

  Ok(task)
}

#[tauri::command]
fn dispatch_chat_task(task_id: String) -> Result<Value, String> {
  let root = workspace_root()?;
  let state_dir = root.join(".agent-mesh");
  let task_root = state_dir.join("tasks");
  let task_path = task_root.join(format!("{task_id}.json"));
  let task_dir = task_root.join(&task_id);
  fs::create_dir_all(&task_dir).map_err(|error| error.to_string())?;

  let config = read_config()?;
  let mut task = read_json_file(&task_path)?;
  let runtime = runtime_for_task(&config, &task)?;
  let runtime_kind = runtime.get("kind").and_then(Value::as_str).unwrap_or_default().to_string();
  let adapter = cli_adapter_for_runtime(&runtime_kind)
    .ok_or_else(|| format!("Runtime adapter not implemented yet: {runtime_kind}"))?;

  let configured_candidates = configured_runtime_candidates(Some(&config), adapter.runtime_kind);
  let candidates = runtime_candidates(adapter.default_candidates, &configured_candidates);
  let resolved_command = resolve_runtime_command(&candidates)?
    .ok_or_else(|| {
      format!(
        "{} command not found. Tried: {}. Configure {} executable_path first.",
        adapter.display_name,
        format_candidate_list(&candidates),
        adapter.runtime_kind
      )
    })?;
  let executable_path = resolved_command.path;

  let now = iso_timestamp();
  append_jsonl_event(
    &task_dir,
    serde_json::json!({
      "at": now,
      "taskId": task_id,
      "type": "dispatch_requested",
      "runtime": adapter.runtime_kind,
      "resolvedCommand": executable_path.display().to_string(),
      "resolvedFrom": resolved_command.source,
      "candidate": resolved_command.candidate
    }),
  )?;
  push_task_event(&mut task, "assigned", &format!("Assigned to {} runtime.", adapter.display_name), Some(now.clone()));
  update_task_status(&mut task, "running", Some(now.clone()));
  if let Some(object) = task.as_object_mut() {
    object.insert("agent".to_string(), Value::String(adapter.runtime_kind.to_string()));
    object.insert("agentType".to_string(), Value::String(adapter.agent_type.to_string()));
  }
  write_task_file(&task_path, &task)?;

  let worker_task = task.clone();
  let worker_task_id = task_id.clone();
  thread::spawn(move || {
    run_cli_chat_worker(adapter, worker_task_id, task_path, task_dir, root, executable_path, worker_task);
  });

  Ok(task)
}

fn detect_runtime(definition: RuntimeDefinition, configured_candidates: Vec<String>, detected_at: String) -> RuntimeDetection {
  let candidates = runtime_candidates(definition.candidates, &configured_candidates);
  let resolved_command_result = resolve_runtime_command(&candidates);
  let resolution_error = resolved_command_result.as_ref().err().cloned();
  let resolved_command = resolved_command_result.ok().flatten();
  let version_result = resolved_command
    .as_ref()
    .map(|command| read_version(&command.path, definition.version_args))
    .transpose();
  let version_error = version_result.as_ref().err().cloned();
  let version = version_result.ok().flatten().flatten();
  let installed = resolved_command.is_some();
  let runnable = installed && version_error.is_none() && resolution_error.is_none();
  let executable_path = resolved_command.as_ref().map(|command| command.path.display().to_string());

  RuntimeDetection {
    id: definition.id,
    name: definition.name,
    kind: definition.kind,
    connection_type: definition.connection_type,
    installed,
    health: if runnable { "online" } else if installed { "degraded" } else { "offline" },
    status: if runnable { "available" } else if installed { "degraded" } else { "missing" },
    executable_path,
    version,
    detected_at,
    diagnostic: if let Some(error) = resolution_error {
      format!("Runtime command resolution failed: {error}. Tried: {}.", format_candidate_list(&candidates))
    } else if let Some(error) = version_error {
      format!("Command was found but failed to run: {error}")
    } else if let Some(command) = resolved_command {
      format!(
        "Command was found from {} candidate '{}' and responded to version probe.",
        command.source, command.candidate
      )
    } else {
      format!("Command not found. Tried: {}.", format_candidate_list(&candidates))
    },
    capabilities: definition.capabilities.to_vec(),
    skills: definition.skills.to_vec(),
    mcps: definition.mcps.to_vec(),
    best_for: definition.best_for.to_vec(),
  }
}

fn configured_runtime_candidates(config: Option<&Value>, runtime_kind: &str) -> Vec<String> {
  config
    .and_then(|value| value.get("runtimes"))
    .and_then(Value::as_object)
    .map(|runtimes| {
      runtimes
        .values()
        .filter(|runtime| runtime.get("kind").and_then(Value::as_str) == Some(runtime_kind))
        .flat_map(|runtime| {
          [
            runtime.get("executable_path").and_then(Value::as_str),
            runtime.get("command").and_then(Value::as_str),
          ]
          .into_iter()
          .flatten()
          .filter(|candidate| !candidate.trim().is_empty())
          .map(str::to_string)
          .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>()
    })
    .unwrap_or_default()
}

fn read_config() -> Result<Value, String> {
  read_json_file(&config_path()?)
}

fn write_config(config: &Value) -> Result<(), String> {
  let content = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
  fs::write(config_path()?, format!("{content}\n")).map_err(|error| error.to_string())
}

fn build_office_rows(config: &Value) -> Vec<Value> {
  let offices = config.get("offices").and_then(Value::as_object).cloned().unwrap_or_default();
  let members = config.get("officeMembers").and_then(Value::as_object).cloned().unwrap_or_default();
  let personas = config.get("personas").and_then(Value::as_object).cloned().unwrap_or_default();
  let runtimes = config.get("runtimes").and_then(Value::as_object).cloned().unwrap_or_default();
  let channels = config.get("channels").and_then(Value::as_object).cloned().unwrap_or_default();

  let mut rows = offices
    .values()
    .cloned()
    .map(|mut office| {
      let office_id = office.get("id").and_then(Value::as_str).unwrap_or_default();
      let office_members = members
        .values()
        .filter(|member| member.get("office_id").and_then(Value::as_str) == Some(office_id))
        .cloned()
        .map(|mut member| {
          let persona_id = member.get("persona_id").and_then(Value::as_str).unwrap_or_default();
          let persona = personas.get(persona_id).cloned().unwrap_or(Value::Null);
          let runtime_id = persona
            .get("runtime_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();

          if let Some(object) = member.as_object_mut() {
            object.insert("persona".to_string(), persona);
            object.insert("runtime".to_string(), runtimes.get(&runtime_id).cloned().unwrap_or(Value::Null));
          }
          member
        })
        .collect::<Vec<_>>();
      let office_channels = channels
        .values()
        .filter(|channel| channel.get("office_id").and_then(Value::as_str) == Some(office_id))
        .cloned()
        .collect::<Vec<_>>();

      if let Some(object) = office.as_object_mut() {
        object.insert("members".to_string(), Value::Array(office_members));
        object.insert("channels".to_string(), Value::Array(office_channels));
      }

      office
    })
    .collect::<Vec<_>>();

  rows.sort_by_key(|office| {
    office
      .get("name")
      .and_then(Value::as_str)
      .unwrap_or_default()
      .to_string()
  });

  rows
}

fn upsert_named_value(config: &mut Value, section: &str, value: &Value) -> Result<(), String> {
  let id = value
    .get("id")
    .and_then(Value::as_str)
    .ok_or_else(|| format!("{section} item missing id"))?
    .to_string();

  if !config.get(section).is_some_and(Value::is_object) {
    config[section] = Value::Object(Map::new());
  }

  let target = config
    .get_mut(section)
    .and_then(Value::as_object_mut)
    .ok_or_else(|| format!("{section} is not an object"))?;
  target.insert(id, value.clone());
  Ok(())
}

fn runtime_for_task(config: &Value, task: &Value) -> Result<Value, String> {
  let assigned_member_id = task
    .get("assigned_member_id")
    .and_then(Value::as_str)
    .or_else(|| task.get("agent").and_then(Value::as_str))
    .ok_or_else(|| "Task missing assigned_member_id".to_string())?;
  let member = config
    .get("officeMembers")
    .and_then(Value::as_object)
    .and_then(|members| members.get(assigned_member_id))
    .ok_or_else(|| format!("Office member not found: {assigned_member_id}"))?;
  let persona_id = member
    .get("persona_id")
    .and_then(Value::as_str)
    .ok_or_else(|| format!("Office member missing persona_id: {assigned_member_id}"))?;
  let persona = config
    .get("personas")
    .and_then(Value::as_object)
    .and_then(|personas| personas.get(persona_id))
    .ok_or_else(|| format!("Persona not found: {persona_id}"))?;
  let runtime_id = persona
    .get("runtime_id")
    .and_then(Value::as_str)
    .ok_or_else(|| format!("Persona missing runtime_id: {persona_id}"))?;
  config
    .get("runtimes")
    .and_then(Value::as_object)
    .and_then(|runtimes| runtimes.get(runtime_id))
    .cloned()
    .ok_or_else(|| format!("Runtime not found: {runtime_id}"))
}

fn cli_adapter_for_runtime(runtime_kind: &str) -> Option<CliRuntimeAdapter> {
  match runtime_kind {
    "claude-code" => Some(CLAUDE_CODE_ADAPTER.clone()),
    "codex" => Some(CODEX_ADAPTER.clone()),
    _ => None,
  }
}

fn run_cli_chat_worker(
  adapter: CliRuntimeAdapter,
  task_id: String,
  task_path: PathBuf,
  task_dir: PathBuf,
  root: PathBuf,
  executable_path: PathBuf,
  mut task: Value,
) {
  let started_at = iso_timestamp();
  let invocation_args = adapter.invocation_args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
  let prompt = build_agent_prompt(&task);

  let _ = append_jsonl_event(
    &task_dir,
    serde_json::json!({
      "at": started_at,
      "taskId": task_id,
      "type": "agent_run_started",
      "runtime": adapter.runtime_kind,
      "command": executable_path.display().to_string(),
      "args": invocation_args
    }),
  );
  let _ = push_and_write_task_event(&task_path, &mut task, "running", &format!("{} worker started.", adapter.display_name), Some(started_at));

  let output = run_agent_process(&executable_path, &invocation_args, &root, &prompt, |pid| {
    let at = iso_timestamp();
    record_worker_pid(&task_path, &task_dir, &task_id, pid, at).map_err(|error| {
      format!("Failed to record worker pid {pid}: {error}")
    })
  });
  let finished_at = iso_timestamp();

  match output {
    Ok(process_output) => {
      let _ = fs::write(task_dir.join("stdout.log"), &process_output.stdout);
      let _ = fs::write(task_dir.join("stderr.log"), &process_output.stderr);
      let result = normalize_process_result(&process_output);
      let persisted_session = persist_runtime_session_from_output(&process_output, &root, &finished_at).ok().flatten();
      let status = result.get("status").and_then(Value::as_str).unwrap_or("completed").to_string();
      let final_status = if process_output.exit_code == Some(0) && status == "completed" {
        "completed"
      } else {
        "failed"
      };
      let persisted_task_session = persisted_session
        .as_ref()
        .map(|session| task_session_from_runtime_session(&task, &task_id, session, final_status));

      if let Some(object) = task.as_object_mut() {
        object.insert("status".to_string(), Value::String(final_status.to_string()));
        object.insert("updatedAt".to_string(), Value::String(finished_at.clone()));
        object.insert("completedAt".to_string(), Value::String(finished_at.clone()));
        object.insert("result".to_string(), result);
        if let Some(session) = persisted_task_session {
          object.insert("session".to_string(), session);
        }
      }
      push_task_event(
        &mut task,
        final_status,
        &format!("{} returned {final_status}.", adapter.display_name),
        Some(finished_at.clone()),
      );
      let _ = write_task_file(&task_path, &task);
      let _ = append_jsonl_event(
        &task_dir,
        serde_json::json!({
          "at": finished_at,
          "taskId": task_id,
          "type": "agent_run_finished",
          "status": final_status,
          "exitCode": process_output.exit_code
        }),
      );
    }
    Err(error) => {
      let result = serde_json::json!({
        "status": "failed",
        "summary": error.clone(),
        "changed_files": [],
        "tests": [],
        "risks": [error.clone()],
        "next_steps": [adapter.next_step],
        "raw": {
          "command": executable_path.display().to_string(),
          "args": invocation_args,
          "cwd": root.display().to_string(),
          "exitCode": null,
          "stdout": "",
          "stderr": error.clone()
        }
      });

      if let Some(object) = task.as_object_mut() {
        object.insert("status".to_string(), Value::String("failed".to_string()));
        object.insert("updatedAt".to_string(), Value::String(finished_at.clone()));
        object.insert("completedAt".to_string(), Value::String(finished_at.clone()));
        object.insert("result".to_string(), result);
      }
      push_task_event(&mut task, "failed", &format!("{} worker failed before completion.", adapter.display_name), Some(finished_at.clone()));
      let _ = write_task_file(&task_path, &task);
      let _ = append_jsonl_event(
        &task_dir,
        serde_json::json!({
          "at": finished_at,
          "taskId": task_id,
          "type": "agent_run_failed",
          "error": error
        }),
      );
      let _ = fs::write(task_dir.join("stderr.log"), error);
    }
  }
}

struct AgentProcessOutput {
  exit_code: Option<i32>,
  stdout: String,
  stderr: String,
  command: String,
  args: Vec<String>,
  cwd: String,
  pid: u32,
}

fn run_agent_process<F>(executable_path: &Path, args: &[String], cwd: &Path, stdin_text: &str, on_started: F) -> Result<AgentProcessOutput, String>
where
  F: FnOnce(u32) -> Result<(), String>,
{
  let mut command = command_for_path(executable_path, args);
  command
    .current_dir(cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let mut child = command.spawn().map_err(|error| format!("Failed to spawn {}: {error}", executable_path.display()))?;
  let pid = child.id();
  on_started(pid)?;
  if let Some(mut stdin) = child.stdin.take() {
    stdin.write_all(stdin_text.as_bytes()).map_err(|error| format!("Failed to write prompt to stdin: {error}"))?;
  }
  let output = child.wait_with_output().map_err(|error| format!("Failed to wait for process: {error}"))?;

  Ok(AgentProcessOutput {
    exit_code: output.status.code(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    command: executable_path.display().to_string(),
    args: args.to_vec(),
    cwd: cwd.display().to_string(),
    pid,
  })
}

fn build_agent_prompt(task: &Value) -> String {
  let task_body = task.get("task").unwrap_or(task);
  let objective = task_body.get("objective").and_then(Value::as_str).unwrap_or("");
  let context = task_body
    .get("context")
    .and_then(|value| value.get("text"))
    .and_then(Value::as_str)
    .unwrap_or("");
  let acceptance = value_array_as_lines(task_body.get("acceptance"));
  let constraints = value_array_as_lines(task_body.get("constraints"));

  format!(
    "You are executing an Agent Mesh task.\n\nObjective:\n{objective}\n\nContext:\n{context}\n\nAcceptance criteria:\n{acceptance}\n\nConstraints:\n{constraints}\n\nReturn a single JSON object with: status, summary, changed_files, tests, risks, next_steps.\n"
  )
}

fn value_array_as_lines(value: Option<&Value>) -> String {
  value
    .and_then(Value::as_array)
    .map(|items| {
      items
        .iter()
        .filter_map(Value::as_str)
        .map(|item| format!("- {item}"))
        .collect::<Vec<_>>()
        .join("\n")
    })
    .unwrap_or_else(|| "-".to_string())
}

fn normalize_process_result(output: &AgentProcessOutput) -> Value {
  let parsed_stdout = serde_json::from_str::<Value>(&output.stdout).ok();
  let claude_text = parsed_stdout
    .as_ref()
    .and_then(|value| value.get("result"))
    .and_then(Value::as_str)
    .unwrap_or(output.stdout.trim());
  let parsed_result = serde_json::from_str::<Value>(claude_text)
    .ok()
    .or_else(|| extract_json_object(claude_text));

  let mut result = parsed_result.unwrap_or_else(|| {
    serde_json::json!({
      "status": if output.exit_code == Some(0) { "completed" } else { "failed" },
      "summary": if claude_text.trim().is_empty() { output.stderr.trim() } else { claude_text.trim() },
      "changed_files": [],
      "tests": [],
      "risks": if output.exit_code == Some(0) { Vec::<String>::new() } else { vec![output.stderr.trim().to_string()] },
      "next_steps": []
    })
  });

  if let Some(object) = result.as_object_mut() {
    if output.exit_code != Some(0) {
      object.insert("status".to_string(), Value::String("failed".to_string()));
    }
    object.insert(
      "raw".to_string(),
      serde_json::json!({
        "exitCode": output.exit_code,
        "stdout": output.stdout,
        "stderr": output.stderr,
        "command": output.command,
        "args": output.args,
        "cwd": output.cwd,
        "pid": output.pid
      }),
    );
  }

  result
}

fn record_worker_pid(task_path: &Path, task_dir: &Path, task_id: &str, pid: u32, at: String) -> Result<(), String> {
  let mut task = read_json_file(task_path)?;
  if let Some(object) = task.as_object_mut() {
    object.insert(
      "worker".to_string(),
      serde_json::json!({
        "pid": pid,
        "startedAt": at
      }),
    );
    object.insert("updatedAt".to_string(), Value::String(at.clone()));
  }
  push_task_event(&mut task, "running", &format!("Agent worker started with pid {pid}."), Some(at.clone()));
  write_task_file(task_path, &task)?;
  append_jsonl_event(
    task_dir,
    serde_json::json!({
      "at": at,
      "taskId": task_id,
      "type": "worker_started",
      "pid": pid
    }),
  )
}

fn task_worker_pid(task: &Value) -> Option<u32> {
  task
    .get("worker")
    .and_then(|worker| worker.get("pid"))
    .and_then(Value::as_u64)
    .and_then(|pid| u32::try_from(pid).ok())
    .or_else(|| {
      task
        .get("events")
        .and_then(Value::as_array)
        .and_then(|events| {
          events
            .iter()
            .rev()
            .find_map(|event| event.get("pid").and_then(Value::as_u64).and_then(|pid| u32::try_from(pid).ok()))
        })
    })
}

fn kill_process_tree(pid: u32) -> Result<(), String> {
  if cfg!(windows) {
    let output = Command::new("taskkill")
      .arg("/PID")
      .arg(pid.to_string())
      .arg("/T")
      .arg("/F")
      .output()
      .map_err(|error| format!("Failed to start taskkill: {error}"))?;
    if output.status.success() {
      return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    return Err(if stderr.is_empty() { stdout } else { stderr });
  }

  let output = Command::new("kill")
    .arg("-TERM")
    .arg(pid.to_string())
    .output()
    .map_err(|error| format!("Failed to start kill: {error}"))?;
  if output.status.success() {
    Ok(())
  } else {
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
  }
}

fn extract_json_object(text: &str) -> Option<Value> {
  let start = text.find('{')?;
  let end = text.rfind('}')?;
  if end <= start {
    return None;
  }
  serde_json::from_str(&text[start..=end]).ok()
}

fn append_jsonl_event(task_dir: &Path, event: Value) -> Result<(), String> {
  fs::create_dir_all(task_dir).map_err(|error| error.to_string())?;
  let mut file = fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(task_dir.join("events.jsonl"))
    .map_err(|error| error.to_string())?;
  writeln!(file, "{}", serde_json::to_string(&event).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

fn push_and_write_task_event(task_path: &Path, task: &mut Value, status: &str, message: &str, at: Option<String>) -> Result<(), String> {
  push_task_event(task, status, message, at);
  write_task_file(task_path, task)
}

fn push_task_event(task: &mut Value, status: &str, message: &str, at: Option<String>) {
  let event = serde_json::json!({
    "at": at.unwrap_or_else(iso_timestamp),
    "status": status,
    "message": message
  });

  if let Some(object) = task.as_object_mut() {
    if !object.get("events").is_some_and(Value::is_array) {
      object.insert("events".to_string(), Value::Array(Vec::new()));
    }
    if let Some(events) = object.get_mut("events").and_then(Value::as_array_mut) {
      events.push(event);
    }
  }
}

fn update_task_status(task: &mut Value, status: &str, at: Option<String>) {
  if let Some(object) = task.as_object_mut() {
    object.insert("status".to_string(), Value::String(status.to_string()));
    object.insert("updatedAt".to_string(), Value::String(at.unwrap_or_else(iso_timestamp)));
  }
}

fn write_task_file(task_path: &Path, task: &Value) -> Result<(), String> {
  fs::write(
    task_path,
    format!("{}\n", serde_json::to_string_pretty(task).map_err(|error| error.to_string())?),
  )
  .map_err(|error| error.to_string())
}

fn task_paths(task_id: &str) -> Result<(PathBuf, PathBuf), String> {
  let task_root = workspace_root()?.join(".agent-mesh").join("tasks");
  Ok((task_root.join(format!("{task_id}.json")), task_root.join(task_id)))
}

fn replace_task_id(task: &mut Value, task_id: &str, state_dir: &Path) {
  if let Some(object) = task.as_object_mut() {
    object.insert("id".to_string(), Value::String(task_id.to_string()));
  }

  if let Some(task_body) = task.get_mut("task").and_then(Value::as_object_mut) {
    task_body.insert("id".to_string(), Value::String(task_id.to_string()));
    if let Some(observer) = task_body.get_mut("observer").and_then(Value::as_object_mut) {
      observer.insert("taskId".to_string(), Value::String(task_id.to_string()));
      observer.insert("stateDir".to_string(), Value::String(state_dir.display().to_string()));
    }
  }
}

fn task_session_status(task: &Value, task_id: &str) -> Value {
  if let Some(session) = task.get("session").filter(|value| value.is_object()) {
    return session.clone();
  }

  if let Some(repo) = task_workspace_repo(task) {
    if let Ok(Some(session_file)) = load_runtime_session(&repo) {
      return serde_json::json!({
        "id": format!("session_{task_id}"),
        "task_id": task_id,
        "office_member_id": task.get("assigned_member_id").and_then(Value::as_str).unwrap_or("unknown"),
        "runtime_id": task.get("agent").and_then(Value::as_str).unwrap_or("unknown"),
        "runtime_session_id": session_file.get("sessionId").and_then(Value::as_str),
        "status": "active",
        "workspace_path": session_file.get("repo").and_then(Value::as_str).or(Some(repo.as_str())),
        "stdout_log_path": format!(".agent-mesh/tasks/{task_id}/stdout.log"),
        "stderr_log_path": format!(".agent-mesh/tasks/{task_id}/stderr.log"),
        "events_path": format!(".agent-mesh/tasks/{task_id}/events.jsonl"),
        "updated_at": session_file.get("updatedAt").and_then(Value::as_str)
      });
    }
  }

  let runtime_session_id = extract_runtime_session_id(task);
  let status = match task.get("status").and_then(Value::as_str).unwrap_or("unknown") {
    "running" => "active",
    "completed" => "completed",
    "cancelled" | "failed" => "expired",
    _ => "unknown",
  };

  serde_json::json!({
    "id": format!("session_{task_id}"),
    "task_id": task_id,
    "office_member_id": task.get("assigned_member_id").and_then(Value::as_str).unwrap_or("unknown"),
    "runtime_id": task.get("agent").and_then(Value::as_str).unwrap_or("unknown"),
    "runtime_session_id": runtime_session_id,
    "status": status,
    "workspace_path": task_workspace_repo(task),
    "stdout_log_path": format!(".agent-mesh/tasks/{task_id}/stdout.log"),
    "stderr_log_path": format!(".agent-mesh/tasks/{task_id}/stderr.log"),
    "events_path": format!(".agent-mesh/tasks/{task_id}/events.jsonl"),
    "updated_at": task.get("updatedAt").and_then(Value::as_str)
  })
}

fn task_session_from_runtime_session(task: &Value, task_id: &str, session: &Value, task_status: &str) -> Value {
  let workspace_path = session
    .get("repo")
    .and_then(Value::as_str)
    .map(str::to_string)
    .or_else(|| task_workspace_repo(task));
  let session_status = match task_status {
    "running" => "active",
    "completed" => "completed",
    "failed" | "cancelled" => "expired",
    "reset" => "reset",
    _ => "unknown",
  };

  serde_json::json!({
    "id": format!("session_{task_id}"),
    "task_id": task_id,
    "office_member_id": task.get("assigned_member_id").and_then(Value::as_str).unwrap_or("unknown"),
    "runtime_id": task.get("agent").and_then(Value::as_str).unwrap_or("unknown"),
    "runtime_session_id": session.get("sessionId").and_then(Value::as_str),
    "status": session_status,
    "workspace_path": workspace_path,
    "stdout_log_path": format!(".agent-mesh/tasks/{task_id}/stdout.log"),
    "stderr_log_path": format!(".agent-mesh/tasks/{task_id}/stderr.log"),
    "events_path": format!(".agent-mesh/tasks/{task_id}/events.jsonl"),
    "updated_at": session.get("updatedAt").and_then(Value::as_str)
  })
}

fn persist_runtime_session_from_output(output: &AgentProcessOutput, repo: &Path, updated_at: &str) -> Result<Option<Value>, String> {
  let Some(session_id) = extract_session_id_from_stdout(&output.stdout) else {
    return Ok(None);
  };

  let session = serde_json::json!({
    "sessionId": session_id,
    "repo": repo.display().to_string(),
    "updatedAt": updated_at
  });
  let path = runtime_session_path(repo)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  fs::write(
    path,
    format!("{}\n", serde_json::to_string_pretty(&session).map_err(|error| error.to_string())?),
  )
  .map_err(|error| error.to_string())?;
  Ok(Some(session))
}

fn load_runtime_session(repo: &str) -> Result<Option<Value>, String> {
  let path = runtime_session_path(Path::new(repo))?;
  if !path.exists() {
    return Ok(None);
  }
  read_json_file(&path).map(Some)
}

fn remove_runtime_session(repo: &str) -> Result<bool, String> {
  let path = runtime_session_path(Path::new(repo))?;
  if !path.exists() {
    return Ok(false);
  }
  fs::remove_file(path).map_err(|error| error.to_string())?;
  Ok(true)
}

fn runtime_session_path(repo: &Path) -> Result<PathBuf, String> {
  Ok(workspace_root()?.join(".agent-mesh").join("sessions").join(format!("{}.json", repo_session_key(repo))))
}

fn repo_session_key(repo: &Path) -> String {
  repo
    .display()
    .to_string()
    .chars()
    .map(|character| {
      if character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-') {
        character
      } else {
        '_'
      }
    })
    .collect()
}

fn task_workspace_repo(task: &Value) -> Option<String> {
  task
    .get("task")
    .and_then(|body| body.get("workspace"))
    .and_then(|workspace| workspace.get("repo"))
    .and_then(Value::as_str)
    .map(str::to_string)
}

fn extract_runtime_session_id(task: &Value) -> Option<String> {
  task
    .get("result")
    .and_then(|result| result.get("raw"))
    .and_then(|raw| {
      raw.get("session_id")
        .or_else(|| raw.get("sessionId"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
          raw.get("stdout")
            .and_then(Value::as_str)
            .and_then(extract_session_id_from_stdout)
        })
    })
}

fn extract_session_id_from_stdout(stdout: &str) -> Option<String> {
  let parsed = serde_json::from_str::<Value>(stdout).ok()?;
  parsed
    .get("session_id")
    .or_else(|| parsed.get("sessionId"))
    .and_then(Value::as_str)
    .map(str::to_string)
}

fn task_summary_from_value(value: &Value, path: &Path) -> TaskSummary {
  let id = value
    .get("id")
    .and_then(Value::as_str)
    .map(str::to_string)
    .unwrap_or_else(|| path.file_stem().and_then(|name| name.to_str()).unwrap_or("unknown").to_string());
  let task = value.get("task").unwrap_or(&Value::Null);
  let objective = task
    .get("objective")
    .and_then(Value::as_str)
    .or_else(|| value.get("objective").and_then(Value::as_str))
    .unwrap_or("未记录任务目标")
    .to_string();

  TaskSummary {
    id,
    status: value.get("status").and_then(Value::as_str).unwrap_or("unknown").to_string(),
    objective,
    agent: value.get("agent").and_then(Value::as_str).unwrap_or("unknown").to_string(),
    agent_type: value.get("agentType").and_then(Value::as_str).unwrap_or("unknown").to_string(),
    workspace_path: task
      .get("workspace")
      .and_then(|workspace| workspace.get("repo"))
      .and_then(Value::as_str)
      .map(str::to_string),
    created_at: value.get("createdAt").and_then(Value::as_str).map(str::to_string),
    updated_at: value.get("updatedAt").and_then(Value::as_str).map(str::to_string),
    completed_at: value.get("completedAt").and_then(Value::as_str).map(str::to_string),
  }
}

fn read_json_file(path: &Path) -> Result<Value, String> {
  let content = fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
  serde_json::from_str(&content).map_err(|error| format!("{}: {error}", path.display()))
}

fn tail_lines(path: &Path, limit: usize) -> Result<Vec<String>, String> {
  let file = fs::File::open(path).map_err(|error| format!("{}: {error}", path.display()))?;
  let mut reader = BufReader::new(file);
  let file_length = reader.seek(SeekFrom::End(0)).map_err(|error| error.to_string())?;
  let start = file_length.saturating_sub(64 * 1024);
  reader.seek(SeekFrom::Start(start)).map_err(|error| error.to_string())?;

  let mut lines = reader.lines().collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
  if start > 0 && !lines.is_empty() {
    lines.remove(0);
  }
  if lines.len() > limit {
    lines = lines.split_off(lines.len() - limit);
  }

  Ok(lines)
}

fn config_path() -> Result<PathBuf, String> {
  Ok(workspace_root()?.join("agent-mesh.config.json"))
}

fn workspace_root() -> Result<PathBuf, String> {
  let mut current = env::current_dir().map_err(|error| error.to_string())?;

  loop {
    if current.join("agent-mesh.config.json").is_file() {
      return Ok(current);
    }

    if !current.pop() {
      break;
    }
  }

  env::current_dir().map_err(|error| error.to_string())
}

fn runtime_candidates(default_candidates: &[&str], configured_candidates: &[String]) -> Vec<RuntimeCandidate> {
  configured_candidates
    .iter()
    .cloned()
    .map(|value| RuntimeCandidate {
      value,
      source: "configured",
    })
    .chain(default_candidates.iter().map(|candidate| RuntimeCandidate {
      value: candidate.to_string(),
      source: "default",
    }))
    .collect()
}

fn resolve_runtime_command(candidates: &[RuntimeCandidate]) -> Result<Option<ResolvedRuntimeCommand>, String> {
  let root = workspace_root()?;
  for candidate in candidates {
    if let Some(path) = resolve_single_command(&candidate.value, &root) {
      return Ok(Some(ResolvedRuntimeCommand {
        path,
        candidate: candidate.value.clone(),
        source: candidate.source,
      }));
    }
  }

  Ok(None)
}

fn resolve_single_command(candidate: &str, root: &Path) -> Option<PathBuf> {
  let candidate_path = Path::new(candidate);
  if candidate_path.is_absolute() && candidate_path.is_file() {
    return Some(candidate_path.to_path_buf());
  }

  if candidate_path.components().count() > 1 {
    let rooted_path = root.join(candidate_path);
    if rooted_path.is_file() {
      return Some(rooted_path);
    }
  }

  let path_value = env::var_os("PATH")?;
  env::split_paths(&path_value)
    .map(|directory| directory.join(candidate))
    .find(|path| path.is_file())
}

fn format_candidate_list(candidates: &[RuntimeCandidate]) -> String {
  candidates
    .iter()
    .map(|candidate| format!("{}:{}", candidate.source, candidate.value))
    .collect::<Vec<_>>()
    .join(", ")
}

fn read_version(executable_path: &Path, version_args: &[&str]) -> Result<Option<String>, String> {
  let output = run_command_with_timeout(executable_path, version_args, Duration::from_secs(3))?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if !stdout.is_empty() {
    return Ok(Some(first_line(stdout)));
  }

  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  if !stderr.is_empty() {
    return Ok(Some(first_line(stderr)));
  }

  Ok(None)
}

fn run_command_with_timeout(executable_path: &Path, args: &[&str], timeout: Duration) -> Result<Output, String> {
  let executable_path = executable_path.to_path_buf();
  let args = args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
  let (sender, receiver) = mpsc::channel();

  thread::spawn(move || {
    let output = command_for_path(&executable_path, &args).output();
    let _ = sender.send(output);
  });

  receiver
    .recv_timeout(timeout)
    .map_err(|_| format!("Command timed out after {}ms.", timeout.as_millis()))?
    .map_err(|error| error.to_string())
}

fn command_for_path(executable_path: &Path, args: &[String]) -> Command {
  let extension = executable_path
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();

  if cfg!(windows) && extension == "ps1" {
    let mut command = Command::new("powershell.exe");
    command
      .arg("-NoProfile")
      .arg("-ExecutionPolicy")
      .arg("Bypass")
      .arg("-File")
      .arg(executable_path)
      .args(args);
    return command;
  }

  if cfg!(windows) && extension == "cmd" {
    let mut command = Command::new("cmd.exe");
    command.arg("/d").arg("/c").arg("call").arg(executable_path).args(args);
    return command;
  }

  let mut command = Command::new(executable_path);
  command.args(args);
  command
}

fn first_line(value: String) -> String {
  value.lines().next().unwrap_or("").trim().to_string()
}

fn current_timestamp() -> String {
  let seconds = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or_default();
  seconds.to_string()
}

fn current_timestamp_millis() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or_default()
}

fn iso_timestamp() -> String {
  current_timestamp_millis().to_string()
}

pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      app_status,
      detect_runtimes,
      list_runtime_adapters,
      load_agent_mesh_config,
      save_agent_mesh_config,
      list_personas,
      list_offices,
      save_office,
      list_tasks,
      get_task_detail,
      get_task_log_tail,
      cancel_task,
      retry_task,
      get_task_session_status,
      reset_task_session,
      create_chat_task,
      dispatch_chat_task
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Agent Mesh desktop app");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn detects_only_four_mvp_runtimes() {
    let ids = RUNTIME_DEFINITIONS.iter().map(|runtime| runtime.id).collect::<Vec<_>>();

    assert_eq!(ids, vec!["hermes", "openclaw", "codex", "claude-code"]);
  }

  #[test]
  fn reports_adapter_status_for_four_mvp_runtimes() {
    let statuses = list_runtime_adapters();
    let kinds = statuses.iter().map(|status| status.runtime_kind).collect::<Vec<_>>();

    assert_eq!(kinds, vec!["hermes", "openclaw", "codex", "claude-code"]);
    assert_eq!(
      statuses
        .iter()
        .find(|status| status.runtime_kind == "openclaw")
        .map(|status| status.list_personas),
      Some("manual")
    );
    assert_eq!(
      statuses
        .iter()
        .find(|status| status.runtime_kind == "claude-code")
        .map(|status| status.dispatch),
      Some("verified")
    );
  }

  #[test]
  fn missing_command_returns_none() {
    let candidates = runtime_candidates(&["agent-mesh-command-that-should-not-exist"], &[]);

    assert!(resolve_runtime_command(&candidates).expect("resolution should not fail").is_none());
  }

  #[test]
  fn configured_candidates_are_checked_before_path_defaults() {
    let configured = vec!["C:\\Tools\\claude.cmd".to_string()];
    let candidates = runtime_candidates(&["claude.exe", "claude.cmd"], &configured);

    assert_eq!(candidates[0].value, "C:\\Tools\\claude.cmd");
    assert_eq!(candidates[1].value, "claude.exe");
  }

  #[test]
  fn runtime_candidates_keep_source_labels() {
    let configured = vec!["C:\\Tools\\codex.cmd".to_string()];
    let candidates = runtime_candidates(&["codex.exe"], &configured);

    assert_eq!(candidates[0].source, "configured");
    assert_eq!(candidates[0].value, "C:\\Tools\\codex.cmd");
    assert_eq!(candidates[1].source, "default");
    assert_eq!(candidates[1].value, "codex.exe");
  }

  #[test]
  fn resolves_configured_relative_path_from_workspace_root() {
    let root = workspace_root().expect("workspace root should resolve");
    let bin_dir = root.join(".agent-mesh-test-bin");
    fs::create_dir_all(&bin_dir).expect("test bin dir should be created");
    let file_name = if cfg!(windows) { "agent-mesh-test-runtime.cmd" } else { "agent-mesh-test-runtime" };
    let executable = bin_dir.join(file_name);
    fs::write(&executable, "").expect("test runtime file should be created");

    let configured = vec![format!(".agent-mesh-test-bin/{file_name}")];
    let candidates = runtime_candidates(&[], &configured);
    let resolved = resolve_runtime_command(&candidates)
      .expect("resolution should not fail")
      .expect("relative configured command should resolve");

    assert_eq!(resolved.source, "configured");
    assert_eq!(resolved.path, executable);

    let _ = fs::remove_file(executable);
    let _ = fs::remove_dir(bin_dir);
  }

  #[test]
  fn first_line_trims_multiline_output() {
    assert_eq!(first_line("codex 1.0.0\nextra".to_string()), "codex 1.0.0");
  }

  #[test]
  fn windows_candidate_order_prefers_executable_shims() {
    let claude = RUNTIME_DEFINITIONS
      .iter()
      .find(|runtime| runtime.id == "claude-code")
      .expect("claude-code runtime definition should exist");

    assert_eq!(claude.candidates[0], "claude.exe");
    assert_eq!(claude.candidates[1], "claude.cmd");
  }

  #[test]
  fn builds_task_summary_from_legacy_task_file() {
    let value = serde_json::json!({
      "id": "task_1",
      "status": "completed",
      "agent": "claude-code",
      "agentType": "claude-cli",
      "task": {
        "objective": "检查 README",
        "workspace": { "repo": "D:\\IDEA\\workspace\\agent-mesh" }
      },
      "createdAt": "2026-06-08T03:17:17.938Z",
      "updatedAt": "2026-06-08T03:17:58.907Z"
    });

    let summary = task_summary_from_value(&value, Path::new("task_1.json"));
    assert_eq!(summary.id, "task_1");
    assert_eq!(summary.objective, "检查 README");
    assert_eq!(summary.agent, "claude-code");
  }

  #[test]
  fn resolves_runtime_for_office_member_task() {
    let config = serde_json::json!({
      "runtimes": {
        "runtime_claude_code": {
          "id": "runtime_claude_code",
          "kind": "claude-code",
          "name": "Claude Code"
        }
      },
      "personas": {
        "persona_claude_code_default": {
          "id": "persona_claude_code_default",
          "runtime_id": "runtime_claude_code",
          "name": "default"
        }
      },
      "officeMembers": {
        "member_local_claude": {
          "id": "member_local_claude",
          "persona_id": "persona_claude_code_default"
        }
      }
    });
    let task = serde_json::json!({
      "assigned_member_id": "member_local_claude"
    });

    let runtime = runtime_for_task(&config, &task).expect("runtime should resolve");

    assert_eq!(runtime.get("kind").and_then(Value::as_str), Some("claude-code"));
  }

  #[test]
  fn resolves_codex_runtime_for_office_member_task() {
    let config = serde_json::json!({
      "runtimes": {
        "runtime_codex": {
          "id": "runtime_codex",
          "kind": "codex",
          "name": "Codex"
        }
      },
      "personas": {
        "persona_codex_default": {
          "id": "persona_codex_default",
          "runtime_id": "runtime_codex",
          "name": "default"
        }
      },
      "officeMembers": {
        "member_local_codex": {
          "id": "member_local_codex",
          "persona_id": "persona_codex_default"
        }
      }
    });
    let task = serde_json::json!({
      "assigned_member_id": "member_local_codex"
    });

    let runtime = runtime_for_task(&config, &task).expect("runtime should resolve");

    assert_eq!(runtime.get("kind").and_then(Value::as_str), Some("codex"));
  }

  #[test]
  fn codex_adapter_uses_non_interactive_json_exec() {
    let adapter = cli_adapter_for_runtime("codex").expect("codex adapter should exist");

    assert_eq!(adapter.runtime_kind, "codex");
    assert_eq!(adapter.agent_type, "codex-cli");
    assert_eq!(adapter.invocation_args, &["exec", "--json"]);
  }

  #[test]
  fn unsupported_runtime_has_no_cli_adapter() {
    assert!(cli_adapter_for_runtime("hermes").is_none());
    assert!(cli_adapter_for_runtime("openclaw").is_none());
  }

  #[test]
  fn builds_prompt_from_chat_task_fields() {
    let task = serde_json::json!({
      "task": {
        "objective": "Update README",
        "context": { "text": "Only inspect docs." },
        "acceptance": ["README is summarized"],
        "constraints": ["Do not edit files"]
      }
    });

    let prompt = build_agent_prompt(&task);

    assert!(prompt.contains("Update README"));
    assert!(prompt.contains("Only inspect docs."));
    assert!(prompt.contains("- README is summarized"));
    assert!(prompt.contains("- Do not edit files"));
  }

  #[test]
  fn normalizes_claude_json_result_and_keeps_raw_diagnostic() {
    let output = AgentProcessOutput {
      exit_code: Some(0),
      stdout: serde_json::json!({
        "type": "result",
        "result": "{\"status\":\"completed\",\"summary\":\"done\",\"changed_files\":[],\"tests\":[],\"risks\":[],\"next_steps\":[]}"
      })
      .to_string(),
      stderr: String::new(),
      command: "claude".to_string(),
      args: vec!["--output-format".to_string(), "json".to_string()],
      cwd: "D:\\IDEA\\workspace\\agent-mesh".to_string(),
      pid: 1234,
    };

    let result = normalize_process_result(&output);

    assert_eq!(result.get("status").and_then(Value::as_str), Some("completed"));
    assert_eq!(result.get("summary").and_then(Value::as_str), Some("done"));
    assert_eq!(
      result
        .get("raw")
        .and_then(|raw| raw.get("command"))
        .and_then(Value::as_str),
      Some("claude")
    );
  }

  #[test]
  fn normalizes_codex_failure_and_keeps_raw_diagnostic() {
    let output = AgentProcessOutput {
      exit_code: Some(1),
      stdout: String::new(),
      stderr: "Access is denied".to_string(),
      command: "codex".to_string(),
      args: vec!["exec".to_string(), "--json".to_string()],
      cwd: "D:\\IDEA\\workspace\\agent-mesh".to_string(),
      pid: 5678,
    };

    let result = normalize_process_result(&output);

    assert_eq!(result.get("status").and_then(Value::as_str), Some("failed"));
    assert_eq!(result.get("summary").and_then(Value::as_str), Some("Access is denied"));
    assert_eq!(
      result
        .get("raw")
        .and_then(|raw| raw.get("stderr"))
        .and_then(Value::as_str),
      Some("Access is denied")
    );
    assert_eq!(
      result
        .get("raw")
        .and_then(|raw| raw.get("args"))
        .and_then(Value::as_array)
        .map(Vec::len),
      Some(2)
    );
  }

  #[test]
  fn replace_task_id_updates_nested_task_and_observer() {
    let mut task = serde_json::json!({
      "id": "old",
      "task": {
        "id": "old",
        "observer": {
          "taskId": "old",
          "stateDir": "D:\\old"
        }
      }
    });

    replace_task_id(&mut task, "new", Path::new("D:\\IDEA\\workspace\\agent-mesh\\.agent-mesh"));

    assert_eq!(task.get("id").and_then(Value::as_str), Some("new"));
    assert_eq!(task.get("task").and_then(|value| value.get("id")).and_then(Value::as_str), Some("new"));
    assert_eq!(
      task
        .get("task")
        .and_then(|value| value.get("observer"))
        .and_then(|value| value.get("taskId"))
        .and_then(Value::as_str),
      Some("new")
    );
  }

  #[test]
  fn extracts_session_id_from_claude_stdout_raw() {
    let task = serde_json::json!({
      "id": "task_1",
      "status": "completed",
      "result": {
        "raw": {
          "stdout": "{\"type\":\"result\",\"session_id\":\"session-123\"}"
        }
      }
    });

    assert_eq!(extract_runtime_session_id(&task), Some("session-123".to_string()));
  }

  #[test]
  fn builds_task_session_status_from_task() {
    let task = serde_json::json!({
      "id": "task_1",
      "status": "completed",
      "updatedAt": "2026-06-09T00:00:00.000Z",
      "agent": "claude-code",
      "assigned_member_id": "member_claude",
      "task": {
        "workspace": {
          "repo": "D:\\agent-mesh-test-no-session"
        }
      },
      "result": {
        "raw": {
          "stdout": "{\"session_id\":\"session-123\"}"
        }
      }
    });

    let session = task_session_status(&task, "task_1");

    assert_eq!(session.get("status").and_then(Value::as_str), Some("completed"));
    assert_eq!(session.get("runtime_session_id").and_then(Value::as_str), Some("session-123"));
    assert_eq!(session.get("office_member_id").and_then(Value::as_str), Some("member_claude"));
  }

  #[test]
  fn reads_worker_pid_from_task_worker_or_events() {
    let task = serde_json::json!({
      "worker": {
        "pid": 4321
      }
    });
    assert_eq!(task_worker_pid(&task), Some(4321));

    let event_task = serde_json::json!({
      "events": [
        { "status": "running", "pid": 1111 },
        { "status": "running", "pid": 2222 }
      ]
    });
    assert_eq!(task_worker_pid(&event_task), Some(2222));
  }
}
