use super::*;
use std::ffi::OsString;
use std::fs::File;
use std::path::Path;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Eq)]
struct RuntimeAdapterCall {
    provider: String,
    workspace_root: String,
    provider_path: String,
    terminal_columns: Option<u16>,
    terminal_rows: Option<u16>,
}

struct FakeProviderFixture {
    dir: PathBuf,
    command_path: PathBuf,
    path_env: OsString,
}

impl FakeProviderFixture {
    fn workspace_root(&self) -> String {
        self.dir.to_str().expect("workspace path").to_string()
    }

    fn path_var(&self) -> &OsStr {
        self.path_env.as_os_str()
    }

    fn provider_path(&self) -> String {
        self.command_path.to_string_lossy().to_string()
    }

    fn cleanup(self) {
        let _ = fs::remove_dir_all(self.dir);
    }
}

#[derive(Default)]
struct RecordingRuntimeAdapter {
    start_calls: Mutex<Vec<RuntimeAdapterCall>>,
    stop_calls: Mutex<Vec<AgentRuntimeHandle>>,
    fail_start: bool,
    fail_stop: bool,
}

impl RecordingRuntimeAdapter {
    fn failing_start() -> Self {
        Self {
            start_calls: Mutex::new(Vec::new()),
            stop_calls: Mutex::new(Vec::new()),
            fail_start: true,
            fail_stop: false,
        }
    }

    fn failing_stop() -> Self {
        Self {
            start_calls: Mutex::new(Vec::new()),
            stop_calls: Mutex::new(Vec::new()),
            fail_start: false,
            fail_stop: true,
        }
    }

    fn start_calls(&self) -> Vec<RuntimeAdapterCall> {
        self.start_calls
            .lock()
            .expect("read runtime start calls")
            .clone()
    }

    fn stop_calls(&self) -> Vec<AgentRuntimeHandle> {
        self.stop_calls
            .lock()
            .expect("read runtime stop calls")
            .clone()
    }
}

impl AgentRuntimeAdapter for RecordingRuntimeAdapter {
    fn start(&self, request: AgentRuntimeLaunchRequest<'_>) -> Result<AgentRuntimeHandle, String> {
        self.start_calls
            .lock()
            .expect("record runtime call")
            .push(RuntimeAdapterCall {
                provider: request.provider.to_string(),
                workspace_root: request.workspace_root.to_string(),
                provider_path: request.provider_path.to_string(),
                terminal_columns: request.terminal_columns,
                terminal_rows: request.terminal_rows,
            });

        if self.fail_start {
            return Err("runtime adapter failed".to_string());
        }

        Ok(AgentRuntimeHandle {
            provider: request.provider.to_string(),
            workspace_root: request.workspace_root.to_string(),
            provider_path: request.provider_path.to_string(),
            status: AgentRuntimeStatus::Running,
        })
    }

    fn stop(&self, handle: &AgentRuntimeHandle) -> Result<AgentRuntimeHandle, String> {
        self.stop_calls
            .lock()
            .expect("record runtime stop call")
            .push(handle.clone());

        if self.fail_stop {
            return Err("runtime stop adapter failed".to_string());
        }

        Ok(AgentRuntimeHandle {
            provider: handle.provider.clone(),
            workspace_root: handle.workspace_root.clone(),
            provider_path: handle.provider_path.clone(),
            status: AgentRuntimeStatus::Stopped,
        })
    }
}

#[test]
fn binary_detection_finds_nul_byte() {
    let dir = unique_test_dir("binary_detection");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("sample.bin");
    fs::write(&path, b"abc\0def").expect("write binary fixture");

    assert!(looks_binary(&path).expect("inspect file"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn base64_decoder_rejects_invalid_padding() {
    assert_eq!(
        decode_base64("iVBORw0KGgo=").expect("decode png header"),
        b"\x89PNG\r\n\x1a\n"
    );
    assert!(decode_base64("AA=A").is_err());
    assert!(decode_base64("AAAA=AAA").is_err());
    assert!(decode_base64("A===").is_err());
}

#[test]
fn agent_workbench_launch_rejects_disabled_mode() {
    let error =
        validate_agent_workbench_launch(false, true, AGENT_PROVIDER_CODEX, "/tmp").unwrap_err();

    assert!(error.contains("disabled"));
}

#[test]
fn agent_workbench_launch_rejects_unacknowledged_consent() {
    let dir = unique_test_dir("agent_consent");
    fs::create_dir_all(&dir).expect("create test dir");
    let error =
        validate_agent_workbench_launch(true, false, AGENT_PROVIDER_CODEX, dir.to_str().unwrap())
            .unwrap_err();

    assert!(error.contains("consent"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_launch_rejects_non_allowlisted_provider() {
    let dir = unique_test_dir("agent_provider");
    fs::create_dir_all(&dir).expect("create test dir");
    let error =
        validate_agent_workbench_launch(true, true, "zsh", dir.to_str().unwrap()).unwrap_err();

    assert!(error.contains("allowlisted"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_launch_rejects_invalid_workspace_root() {
    let dir = unique_test_dir("agent_invalid_workspace");
    let error =
        validate_agent_workbench_launch(true, true, AGENT_PROVIDER_CODEX, dir.to_str().unwrap())
            .unwrap_err();

    assert!(error.contains("workspace"));
}

#[test]
fn agent_workbench_launch_validates_workspace_root_before_future_launch() {
    let dir = unique_test_dir("agent_workspace");
    fs::create_dir_all(&dir).expect("create test dir");

    let canonical_workspace =
        validate_agent_workbench_launch(true, true, AGENT_PROVIDER_PI, dir.to_str().unwrap())
            .expect("validate workspace root");

    assert_eq!(canonical_workspace, fs::canonicalize(&dir).unwrap());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_rejects_disabled_mode() {
    let store = AgentWorkbenchSessionStore::default();
    let dir = unique_test_dir("agent_command_disabled");
    fs::create_dir_all(&dir).expect("create test dir");
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let adapter = RecordingRuntimeAdapter::default();
    let error = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        false,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .unwrap_err();

    assert!(error.contains("disabled"));
    assert!(store.session.lock().unwrap().is_none());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_rejects_unacknowledged_consent() {
    let store = AgentWorkbenchSessionStore::default();
    let dir = unique_test_dir("agent_command_consent");
    fs::create_dir_all(&dir).expect("create test dir");
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let adapter = RecordingRuntimeAdapter::default();
    let error = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        false,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .unwrap_err();

    assert!(error.contains("consent"));
    assert!(store.session.lock().unwrap().is_none());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_rejects_non_allowlisted_provider() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command_provider");
    fs::create_dir_all(&dir).expect("create test dir");
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let error = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        "zsh".to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .unwrap_err();

    assert!(error.contains("allowlisted"));
    assert!(store.session.lock().unwrap().is_none());
    assert!(adapter.start_calls().is_empty());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_rejects_invalid_workspace_root() {
    let store = AgentWorkbenchSessionStore::default();
    let dir = unique_test_dir("agent_command_invalid_workspace");
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let adapter = RecordingRuntimeAdapter::default();
    let error = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .unwrap_err();

    assert!(error.contains("workspace"));
    assert!(store.session.lock().unwrap().is_none());
}

#[test]
fn agent_workbench_start_without_provider_does_not_create_session() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command_provider_missing");
    fs::create_dir_all(&dir).expect("create test dir");
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let result = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("preflight missing provider");

    assert!(!result.preflight.provider_available);
    assert!(result.preflight.provider_path.is_none());
    assert!(result.session.is_none());
    assert!(store.session.lock().unwrap().is_none());
    assert!(adapter.start_calls().is_empty());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_calls_runtime_adapter_with_resolved_launch_request() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_OPENCODE);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let result = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start session");
    let session = result.session.expect("session");

    assert_eq!(result.preflight.provider, AGENT_PROVIDER_OPENCODE);
    assert!(result.preflight.provider_available);
    assert!(result.preflight.launch_implemented);
    assert_eq!(session.provider, AGENT_PROVIDER_OPENCODE);
    assert_eq!(
        session.workspace_root,
        fs::canonicalize(&dir).unwrap().to_string_lossy()
    );
    assert_eq!(session.provider_path, command_path.to_string_lossy());
    assert_eq!(session.status, AgentWorkbenchSessionStatus::Active);
    assert!(session.created_at_ms > 0);
    assert_eq!(session.runtime.provider, AGENT_PROVIDER_OPENCODE);
    assert_eq!(session.runtime.workspace_root, session.workspace_root);
    assert_eq!(session.runtime.provider_path, session.provider_path);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Running);
    assert_eq!(
        adapter.start_calls(),
        vec![RuntimeAdapterCall {
            provider: AGENT_PROVIDER_OPENCODE.to_string(),
            workspace_root: fs::canonicalize(&dir)
                .unwrap()
                .to_string_lossy()
                .to_string(),
            provider_path: command_path.to_string_lossy().to_string(),
            terminal_columns: None,
            terminal_rows: None,
        }]
    );
    assert_eq!(
        store.session.lock().unwrap().as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Active
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_passes_initial_terminal_size_to_runtime_adapter() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command_terminal_size");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        Some(132),
        Some(38),
    )
    .expect("start session");

    let calls = adapter.start_calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].terminal_columns, Some(132));
    assert_eq!(calls[0].terminal_rows, Some(38));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_terminal_resize_rejects_invalid_dimensions() {
    let store = AgentWorkbenchSessionStore::default();

    let zero_columns = resize_agent_workbench_terminal_with_store(&store, 0, 24).unwrap_err();
    let zero_rows = resize_agent_workbench_terminal_with_store(&store, 80, 0).unwrap_err();

    assert!(zero_columns.contains("terminal size"));
    assert!(zero_rows.contains("terminal size"));
    assert!(store.session.lock().unwrap().is_none());
}

#[test]
fn agent_workbench_terminal_resize_without_session_is_noop_state() {
    let store = AgentWorkbenchSessionStore::default();

    let state =
        resize_agent_workbench_terminal_with_store(&store, 120, 36).expect("resize no session");

    assert!(state.session.is_none());
    assert!(state.output.is_empty());
    assert!(store.runtime.lock().unwrap().is_none());
}

#[test]
fn agent_workbench_terminal_resize_preserves_active_session_state() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_resize_active_session");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        Some(100),
        Some(30),
    )
    .expect("start session");

    let state =
        resize_agent_workbench_terminal_with_store(&store, 132, 42).expect("resize terminal");

    let session = state.session.expect("session");
    assert_eq!(session.status, AgentWorkbenchSessionStatus::Active);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Running);
    assert_eq!(
        store.session.lock().unwrap().as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Active
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_start_rejects_second_active_session() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command_duplicate");
    let other_dir = unique_test_dir("agent_command_duplicate_other");
    fs::create_dir_all(&dir).expect("create test dir");
    fs::create_dir_all(&other_dir).expect("create other test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    let other_command_path = other_dir.join(AGENT_PROVIDER_OPENCODE);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    fs::write(&other_command_path, b"#!/bin/sh\n").expect("write other fake provider");
    make_executable(&command_path);
    make_executable(&other_command_path);
    let path_env = env::join_paths([dir.clone(), other_dir.clone()]).expect("join PATH fixture");

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("first session");
    let error = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        other_dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .unwrap_err();

    assert!(error.contains("already active"));
    assert_eq!(adapter.start_calls().len(), 1);

    let _ = fs::remove_dir_all(dir);
    let _ = fs::remove_dir_all(other_dir);
}

#[test]
fn agent_workbench_start_allows_new_session_after_exit() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
        "agent_restart_after_exit",
        AGENT_PROVIDER_CODEX,
        b"#!/bin/sh\nprintf 'restart-marker\\n'\nexit 0\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start first fake provider");
    let first_exit_state = wait_for_agent_state(&store, |state| {
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });
    let first_exit_last_seq = first_exit_state
        .output
        .last()
        .expect("first session output")
        .seq;

    let second_start = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start second fake provider");

    assert_eq!(
        second_start.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Active
    );

    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.matches("restart-marker").count() >= 2
    });
    let combined_output = combined_agent_output(&final_state);

    assert_eq!(combined_output.matches("restart-marker").count(), 2);
    assert_agent_output_seq_strictly_increases(&final_state.output);
    assert!(
        final_state.output.last().unwrap().seq > first_exit_last_seq,
        "new session output should continue after the first session output sequence",
    );
    assert_eq!(
        final_state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );

    provider.cleanup();
}

#[test]
fn agent_workbench_start_allows_new_session_after_stop() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_restart_after_stop");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    let first_start = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start first session");
    let first_session = first_start.session.expect("first session");

    let stopped =
        stop_agent_workbench_session_with_store(&store, &adapter).expect("stop first session");
    assert_eq!(
        stopped.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Stopped
    );

    let second_start = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        Some(120),
        Some(40),
    )
    .expect("start second session");
    let second_session = second_start.session.expect("second session");

    assert_eq!(second_session.status, AgentWorkbenchSessionStatus::Active);
    assert!(second_session.created_at_ms >= first_session.created_at_ms);
    assert_eq!(adapter.start_calls().len(), 2);
    assert_eq!(adapter.stop_calls(), vec![first_session.runtime]);
    assert_eq!(adapter.start_calls()[1].terminal_columns, Some(120));
    assert_eq!(adapter.start_calls()[1].terminal_rows, Some(40));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_adapter_failure_does_not_create_session() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::failing_start();
    let dir = unique_test_dir("agent_command_adapter_failure");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let error = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .unwrap_err();

    assert!(error.contains("runtime adapter failed"));
    assert_eq!(adapter.start_calls().len(), 1);
    assert!(store.session.lock().unwrap().is_none());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn runtime_handle_exposes_no_process_resources() {
    let handle = AgentRuntimeHandle {
        provider: AGENT_PROVIDER_CODEX.to_string(),
        workspace_root: "/tmp/workspace".to_string(),
        provider_path: "/tmp/bin/codex".to_string(),
        status: AgentRuntimeStatus::Running,
    };
    let stopped_handle = AgentRuntimeHandle {
        status: AgentRuntimeStatus::Stopped,
        ..handle.clone()
    };
    let exited_handle = AgentRuntimeHandle {
        status: AgentRuntimeStatus::Exited,
        ..handle.clone()
    };
    let debug = format!("{handle:?}");
    let stopped_debug = format!("{stopped_handle:?}");
    let exited_debug = format!("{exited_handle:?}");

    assert_eq!(handle.status, AgentRuntimeStatus::Running);
    assert_eq!(stopped_handle.status, AgentRuntimeStatus::Stopped);
    assert_eq!(exited_handle.status, AgentRuntimeStatus::Exited);
    assert!(!debug.contains("pid"));
    assert!(!debug.contains("stdio"));
    assert!(!debug.contains("pty"));
    assert!(!debug.contains("process"));
    assert!(!stopped_debug.contains("pid"));
    assert!(!stopped_debug.contains("stdio"));
    assert!(!stopped_debug.contains("pty"));
    assert!(!stopped_debug.contains("process"));
    assert!(!exited_debug.contains("pid"));
    assert!(!exited_debug.contains("stdio"));
    assert!(!exited_debug.contains("pty"));
    assert!(!exited_debug.contains("process"));
}

#[test]
fn agent_workbench_stop_marks_session_stopped_through_runtime_adapter() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command_stop");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    let started = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start session");
    let started_session = started.session.expect("started session");
    let state = stop_agent_workbench_session_with_store(&store, &adapter).expect("stop session");
    let session = state.session.expect("stopped session");

    assert_eq!(adapter.stop_calls(), vec![started_session.runtime]);
    assert_eq!(session.status, AgentWorkbenchSessionStatus::Stopped);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Stopped);
    assert_eq!(session.runtime.provider, AGENT_PROVIDER_CODEX);
    assert_eq!(session.runtime.workspace_root, session.workspace_root);
    assert_eq!(session.runtime.provider_path, session.provider_path);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_second_stop_after_stopped_session_is_noop() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_command_second_stop");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    let started = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start session");
    let started_session = started.session.expect("started session");

    stop_agent_workbench_session_with_store(&store, &adapter).expect("first stop");
    let state = stop_agent_workbench_session_with_store(&store, &adapter).expect("second stop");
    let session = state.session.as_ref().expect("stopped session");

    assert_eq!(adapter.stop_calls(), vec![started_session.runtime]);
    assert_eq!(session.status, AgentWorkbenchSessionStatus::Stopped);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Stopped);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_stop_without_session_does_not_call_runtime_adapter() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();

    let state = stop_agent_workbench_session_with_store(&store, &adapter).expect("stop no session");

    assert!(state.session.is_none());
    assert!(adapter.stop_calls().is_empty());
}

#[test]
fn agent_workbench_stop_after_exit_does_not_call_runtime_adapter() {
    let store = AgentWorkbenchSessionStore::default();
    let start_adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let stop_adapter = RecordingRuntimeAdapter::default();
    let provider = fake_provider_fixture(
        "agent_stop_after_exit",
        AGENT_PROVIDER_CODEX,
        b"#!/bin/sh\nexit 0\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &start_adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start fake provider");
    let exited_state = wait_for_agent_state(&store, |state| {
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });
    let output_len_before = exited_state.output.len();

    let state = stop_agent_workbench_session_with_store(&store, &stop_adapter)
        .expect("stop exited session");
    let session = state.session.as_ref().expect("exited session");

    assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
    assert_eq!(state.output.len(), output_len_before);
    assert!(stop_adapter.stop_calls().is_empty());

    provider.cleanup();
}

#[test]
fn agent_workbench_stop_adapter_failure_keeps_session_active() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::failing_stop();
    let dir = unique_test_dir("agent_command_stop_failure");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    let started = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start session");
    let started_session = started.session.expect("started session");
    let error = stop_agent_workbench_session_with_store(&store, &adapter).unwrap_err();
    let stored = store
        .session
        .lock()
        .unwrap()
        .clone()
        .expect("stored session");

    assert!(error.contains("runtime stop adapter failed"));
    assert_eq!(adapter.stop_calls(), vec![started_session.runtime]);
    assert_eq!(stored.status, AgentWorkbenchSessionStatus::Active);
    assert_eq!(stored.runtime.status, AgentRuntimeStatus::Running);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_real_runtime_starts_provider_and_captures_output_and_input() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
            "agent_real_runtime_io",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nprintf 'ready\\n'\nprintf 'warn\\n' >&2\nwhile IFS= read line; do\n  printf 'echo:%s\\n' \"$line\"\n  [ \"$line\" = 'exit' ] && exit 0\ndone\n",
        );

    let started = start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start real provider");
    let session = started.session.expect("running session");

    assert_eq!(session.status, AgentWorkbenchSessionStatus::Active);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Running);
    assert_eq!(session.provider_path, provider.provider_path());

    write_agent_workbench_session_input_with_store(
        &store,
        "hello from hazakura\nexit\n".to_string(),
    )
    .expect("write provider input");
    let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

    assert!(state
        .output
        .iter()
        .all(|chunk| chunk.text != "hello from hazakura\nexit\n"));

    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        combined_output.contains("ready")
            && combined_output.contains("warn")
            && combined_output.contains("echo:hello")
            && state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });

    let combined_output = combined_agent_output(&final_state);
    assert!(combined_output.contains("ready"));
    assert!(combined_output.contains("warn"));
    assert!(combined_output.contains("echo:hello from hazakura"));
    assert_eq!(
        final_state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );
    assert_eq!(
        final_state.session.as_ref().unwrap().runtime.status,
        AgentRuntimeStatus::Exited
    );
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stdout));
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stderr));
    assert!(final_state
        .output
        .iter()
        .all(|chunk| chunk.text != "hello from hazakura\nexit\n"));
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System));

    provider.cleanup();
}

#[test]
fn agent_workbench_real_runtime_accepts_input_burst() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
            "agent_real_runtime_input_burst",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nwhile IFS= read line; do\n  printf 'burst:%s\\n' \"$line\"\n  [ \"$line\" = 'done' ] && exit 0\ndone\n",
        );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start burst fake provider");

    for index in 0..20 {
        write_agent_workbench_session_input_with_store(&store, format!("line-{index}\n"))
            .expect("write burst input");
    }
    write_agent_workbench_session_input_with_store(&store, "done\n".to_string())
        .expect("write burst terminator");

    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.contains("burst:line-0")
            && combined_output.contains("burst:line-19")
            && combined_output.contains("burst:done")
    });
    let combined_output = combined_agent_output(&final_state);

    assert_eq!(combined_output.matches("burst:line-").count(), 20);
    assert_eq!(
        final_state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );

    provider.cleanup();
}

#[test]
fn agent_workbench_real_runtime_stop_kills_running_provider() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
        "agent_real_runtime_stop",
        AGENT_PROVIDER_OPENCODE,
        b"#!/bin/sh\nprintf 'waiting\\n'\nwhile :; do read line || true; done\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start real provider");
    let state = stop_agent_workbench_session_with_store(&store, &adapter).expect("stop provider");
    let session = state.session.expect("stopped session");

    assert_eq!(session.status, AgentWorkbenchSessionStatus::Stopped);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Stopped);
    assert!(store.runtime.lock().unwrap().is_none());
    assert!(state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System
            && chunk.text.contains("stopped")));

    provider.cleanup();
}

#[test]
fn agent_workbench_fake_provider_large_stdout_prunes_oldest_output() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
            "agent_fake_provider_large_stdout",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\ndd if=/dev/zero bs=4096 count=650 2>/dev/null | tr '\\000' 'x'\nprintf '\\ntail-marker\\n'\n",
        );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start fake provider");
    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.contains("tail-marker")
    });
    let combined_output = combined_agent_output(&final_state);

    assert_eq!(final_state.output.len(), AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS);
    assert!(final_state.output.first().unwrap().seq > 1);
    assert_agent_output_seq_strictly_increases(&final_state.output);
    assert!(combined_output.contains("tail-marker\n"));
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stdout));

    provider.cleanup();
}

#[test]
fn agent_workbench_fake_provider_immediate_exit_sets_exited_state() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
        "agent_fake_provider_immediate_exit",
        AGENT_PROVIDER_CODEX,
        b"#!/bin/sh\nexit 0\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start fake provider");
    let final_state = wait_for_agent_state(&store, |state| {
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });
    let session = final_state.session.as_ref().expect("exited session");

    assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System
            && chunk.text.contains("Provider process exited")));

    provider.cleanup();
}

#[test]
fn agent_workbench_fake_provider_abnormal_exit_records_stderr_and_system_output() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
        "agent_fake_provider_abnormal_exit",
        AGENT_PROVIDER_OPENCODE,
        b"#!/bin/sh\nprintf 'boom\\n' >&2\nexit 7\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start fake provider");
    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.contains("boom")
    });
    let session = final_state.session.as_ref().expect("exited session");
    let combined_output = combined_agent_output(&final_state);

    assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stderr
            && chunk.text.contains("boom")));
    assert!(final_state
        .output
        .iter()
        .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System
            && chunk.text.contains("Provider process exited")));
    assert!(combined_output.contains("exit status: 7") || combined_output.contains("exit code"));

    provider.cleanup();
}

#[test]
fn agent_workbench_output_chunks_are_bounded_and_pruned_oldest_first() {
    let store = AgentWorkbenchSessionStore::default();

    for index in 0..(AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS + 3) {
        append_agent_output(
            &store.output,
            &store.next_output_seq,
            AgentWorkbenchOutputStream::Stdout,
            format!("chunk-{index}\n"),
        );
    }

    let output = snapshot_agent_output(&store).expect("snapshot output");

    assert_eq!(output.len(), AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS);
    assert_eq!(output.first().unwrap().text, "chunk-3\n");
    assert_eq!(output.first().unwrap().seq, 4);
    assert_agent_output_seq_strictly_increases(&output);
    assert_eq!(
        output.last().unwrap().text,
        format!("chunk-{}\n", AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS + 2)
    );
    assert_eq!(
        output.last().unwrap().seq as usize,
        AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS + 3
    );
}

#[test]
fn agent_workbench_stopped_session_rejects_input_without_changing_state() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RecordingRuntimeAdapter::default();
    let dir = unique_test_dir("agent_input_stopped");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start session");
    stop_agent_workbench_session_with_store(&store, &adapter).expect("stop session");
    let error =
        write_agent_workbench_session_input_with_store(&store, "hello\n".to_string()).unwrap_err();
    let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

    assert!(error.contains("not active"));
    assert_eq!(
        state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Stopped
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_exited_session_rejects_input_without_changing_state() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
        "agent_input_exited",
        AGENT_PROVIDER_CODEX,
        b"#!/bin/sh\nexit 0\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start fake provider");
    let exited_state = wait_for_agent_state(&store, |state| {
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });
    let output_len_before = exited_state.output.len();

    let error =
        write_agent_workbench_session_input_with_store(&store, "hello\n".to_string()).unwrap_err();
    let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

    assert!(error.contains("not active"));
    assert_eq!(
        state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );
    assert_eq!(state.output.len(), output_len_before);

    provider.cleanup();
}

#[test]
fn agent_workbench_terminal_resize_after_exit_is_noop_state() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
    let provider = fake_provider_fixture(
        "agent_resize_exited_session",
        AGENT_PROVIDER_OPENCODE,
        b"#!/bin/sh\nexit 0\n",
    );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        Some(100),
        Some(30),
    )
    .expect("start fake provider");
    let exited_state = wait_for_agent_state(&store, |state| {
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });
    let output_len_before = exited_state.output.len();

    let state =
        resize_agent_workbench_terminal_with_store(&store, 140, 44).expect("resize exited session");

    let session = state.session.as_ref().expect("exited session");
    assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
    assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
    assert_eq!(state.output.len(), output_len_before);

    provider.cleanup();
}

#[test]
fn agent_workbench_stdin_failure_keeps_session_state() {
    let store = AgentWorkbenchSessionStore::default();
    let dir = unique_test_dir("agent_input_failure");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(
        &command_path,
        b"#!/bin/sh\nwhile :; do read line || true; done\n",
    )
    .expect("write fake provider");
    make_executable(&command_path);
    let child = Command::new(&command_path)
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn fake provider");
    let provider_path = command_path.to_string_lossy().to_string();
    let workspace_root = fs::canonicalize(&dir)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let runtime_handle = AgentRuntimeHandle {
        provider: AGENT_PROVIDER_CODEX.to_string(),
        workspace_root: workspace_root.clone(),
        provider_path: provider_path.clone(),
        status: AgentRuntimeStatus::Running,
    };

    *store.session.lock().unwrap() = Some(AgentWorkbenchSession {
        provider: AGENT_PROVIDER_CODEX.to_string(),
        workspace_root,
        provider_path,
        created_at_ms: current_time_ms(),
        status: AgentWorkbenchSessionStatus::Active,
        runtime: runtime_handle,
    });
    *store.runtime.lock().unwrap() = Some(AgentRuntimeProcess {
        child,
        stdin: None,
        pty_control: None,
    });

    let error =
        write_agent_workbench_session_input_with_store(&store, "hello\n".to_string()).unwrap_err();
    let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

    assert!(error.contains("stdin"));
    assert_eq!(
        state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Active
    );
    assert!(state.output.is_empty());

    let _ = fs::remove_dir_all(dir);
}

#[cfg(unix)]
#[test]
fn agent_workbench_store_drop_stops_running_provider() {
    let dir = unique_test_dir("agent_drop_cleanup");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(
        &command_path,
        b"#!/bin/sh\nwhile :; do read line || true; done\n",
    )
    .expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let pid = {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start provider");
        let process_id = store.runtime.lock().unwrap().as_ref().unwrap().child.id();
        process_id
    };

    std::thread::sleep(Duration::from_millis(100));

    assert!(!process_exists(pid));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_session_state_is_in_memory_only() {
    let store = AgentWorkbenchSessionStore::default();
    let dir = unique_test_dir("agent_command_memory_only");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
    let adapter = RecordingRuntimeAdapter::default();

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(path_env.as_os_str()),
        None,
        None,
    )
    .expect("start session");
    let fresh_store = AgentWorkbenchSessionStore::default();
    let state = get_agent_workbench_session_state_with_store(&store).expect("read state");
    let fresh_state =
        get_agent_workbench_session_state_with_store(&fresh_store).expect("read fresh state");

    assert!(state.session.is_some());
    assert!(fresh_state.session.is_none());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_provider_lookup_finds_allowlisted_executable() {
    let dir = unique_test_dir("agent_provider_lookup");
    fs::create_dir_all(&dir).expect("create test dir");
    for provider in [
        AGENT_PROVIDER_CODEX,
        AGENT_PROVIDER_OPENCODE,
        AGENT_PROVIDER_PI,
    ] {
        let command_path = dir.join(provider);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
    }
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    for provider in [
        AGENT_PROVIDER_CODEX,
        AGENT_PROVIDER_OPENCODE,
        AGENT_PROVIDER_PI,
    ] {
        let found = find_allowlisted_agent_provider_in_path_env(provider, &path_env)
            .expect("find fake provider");

        assert_eq!(found, dir.join(provider));
    }

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_app_search_path_adds_home_provider_bins() {
    let dir = unique_test_dir("agent_provider_app_search_path");
    let path_dir = dir.join("path-bin");
    let home_dir = dir.join("home");
    let home_bin = home_dir.join(".local/bin");
    fs::create_dir_all(&path_dir).expect("create PATH dir");
    fs::create_dir_all(&home_bin).expect("create home provider dir");

    let path_env = env::join_paths([path_dir.clone()]).expect("join PATH fixture");
    let search_path =
        build_agent_provider_search_path(Some(path_env.as_os_str()), Some(home_dir.as_os_str()))
            .expect("build app search path");
    let paths = env::split_paths(&search_path).collect::<Vec<_>>();

    assert!(paths.contains(&path_dir));
    assert!(paths.contains(&home_bin));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_provider_lookup_uses_app_search_path_home_bins() {
    let dir = unique_test_dir("agent_provider_app_lookup");
    let path_dir = dir.join("path-bin");
    let home_dir = dir.join("home");
    let home_bin = home_dir.join(".local/bin");
    fs::create_dir_all(&path_dir).expect("create PATH dir");
    fs::create_dir_all(&home_bin).expect("create home provider dir");
    let command_path = home_bin.join(AGENT_PROVIDER_CODEX);
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
    make_executable(&command_path);

    let path_env = env::join_paths([path_dir]).expect("join PATH fixture");
    let search_path =
        build_agent_provider_search_path(Some(path_env.as_os_str()), Some(home_dir.as_os_str()))
            .expect("build app search path");
    let found = find_allowlisted_agent_provider_in_path_env(AGENT_PROVIDER_CODEX, &search_path)
        .expect("find home fake provider");

    assert_eq!(found, command_path);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn agent_workbench_real_runtime_passes_app_search_path_to_provider_process() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new(&store);
    let dir = unique_test_dir("agent_provider_runtime_path");
    let path_dir = dir.join("path-bin");
    let home_dir = dir.join("home");
    let home_bin = home_dir.join(".local/bin");
    fs::create_dir_all(&path_dir).expect("create PATH dir");
    fs::create_dir_all(&home_bin).expect("create home bin");

    let command_path = path_dir.join(AGENT_PROVIDER_CODEX);
    fs::write(
        &command_path,
        b"#!/usr/bin/env node\nconsole.log('provider script should run through node')\n",
    )
    .expect("write env-node fake provider");
    make_executable(&command_path);

    let node_path = home_bin.join("node");
    fs::write(&node_path, b"#!/bin/sh\nprintf 'node-shim:%s\\n' \"$1\"\n")
        .expect("write fake node");
    make_executable(&node_path);

    let path_env = env::join_paths([path_dir]).expect("join PATH fixture");
    let search_path =
        build_agent_provider_search_path(Some(path_env.as_os_str()), Some(home_dir.as_os_str()))
            .expect("build app search path");

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        dir.to_str().unwrap().to_string(),
        Some(search_path.as_os_str()),
        None,
        None,
    )
    .expect("start env-node fake provider");
    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.contains("node-shim:")
    });
    let combined_output = combined_agent_output(&final_state);

    assert!(combined_output.contains("node-shim:"));
    assert_eq!(
        final_state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );

    let _ = fs::remove_dir_all(dir);
}

#[cfg(unix)]
#[test]
fn agent_workbench_real_runtime_pty_gives_provider_terminal_stdin() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new(&store);
    let provider = fake_provider_fixture(
            "agent_provider_pty_stdin",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nif [ -t 0 ]; then printf 'stdin-is-tty\\n'; else printf 'stdin-is-not-tty\\n'; fi\nwhile IFS= read line; do\n  printf 'pty-echo:%s\\n' \"$line\"\n  [ \"$line\" = 'exit' ] && exit 0\ndone\n",
        );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        None,
        None,
    )
    .expect("start pty fake provider");
    write_agent_workbench_session_input_with_store(&store, "hello pty\nexit\n".to_string())
        .expect("write pty provider input");
    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.contains("stdin-is-tty")
            && combined_output.contains("pty-echo:hello pty")
    });
    let combined_output = combined_agent_output(&final_state);

    assert!(combined_output.contains("stdin-is-tty"));
    assert!(combined_output.contains("pty-echo:hello pty"));
    assert_eq!(
        final_state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );

    provider.cleanup();
}

#[cfg(unix)]
#[test]
fn agent_workbench_real_runtime_pty_applies_terminal_size() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new(&store);
    let provider = fake_provider_fixture(
            "agent_provider_pty_size",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nstty size\nwhile IFS= read line; do\n  [ \"$line\" = 'size' ] && stty size\n  [ \"$line\" = 'exit' ] && exit 0\ndone\n",
        );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_CODEX.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        Some(123),
        Some(37),
    )
    .expect("start pty fake provider");
    let initial_state = wait_for_agent_state(&store, |state| {
        combined_agent_output(state).contains("37 123")
    });
    assert!(combined_agent_output(&initial_state).contains("37 123"));

    resize_agent_workbench_terminal_with_store(&store, 132, 42).expect("resize pty");
    write_agent_workbench_session_input_with_store(&store, "size\nexit\n".to_string())
        .expect("write pty provider input");
    let final_state = wait_for_agent_state(&store, |state| {
        let combined_output = combined_agent_output(state);
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
            && combined_output.contains("42 132")
    });
    let combined_output = combined_agent_output(&final_state);

    assert!(combined_output.contains("37 123"));
    assert!(combined_output.contains("42 132"));
    assert_eq!(
        final_state.session.as_ref().unwrap().status,
        AgentWorkbenchSessionStatus::Exited
    );

    provider.cleanup();
}

#[cfg(unix)]
#[test]
fn agent_workbench_real_runtime_pty_resize_notifies_provider() {
    let store = AgentWorkbenchSessionStore::default();
    let adapter = RealAgentRuntimeAdapter::new(&store);
    let provider = fake_provider_fixture(
            "agent_provider_pty_resize_signal",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\ntrap 'printf winch:; stty size' WINCH\nprintf 'ready\\n'\nwhile :; do\n  if IFS= read line; then\n    [ \"$line\" = 'exit' ] && exit 0\n  fi\ndone\n",
        );

    start_agent_workbench_session_with_store(
        &store,
        &adapter,
        true,
        true,
        AGENT_PROVIDER_OPENCODE.to_string(),
        provider.workspace_root(),
        Some(provider.path_var()),
        Some(100),
        Some(30),
    )
    .expect("start pty fake provider");
    let ready_state = wait_for_agent_state(&store, |state| {
        combined_agent_output(state).contains("ready")
    });
    assert!(combined_agent_output(&ready_state).contains("ready"));

    resize_agent_workbench_terminal_with_store(&store, 120, 33).expect("resize pty");
    let resized_state = wait_for_agent_state(&store, |state| {
        combined_agent_output(state).contains("winch:33 120")
    });
    assert!(combined_agent_output(&resized_state).contains("winch:33 120"));

    write_agent_workbench_session_input_with_store(&store, "exit\n".to_string())
        .expect("write pty provider input");
    wait_for_agent_state(&store, |state| {
        state
            .session
            .as_ref()
            .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
    });

    provider.cleanup();
}

#[test]
fn agent_workbench_provider_lookup_ignores_non_allowlisted_commands() {
    let dir = unique_test_dir("agent_provider_lookup_reject");
    fs::create_dir_all(&dir).expect("create test dir");
    let command_path = dir.join("zsh");
    fs::write(&command_path, b"#!/bin/sh\n").expect("write fake command");
    make_executable(&command_path);
    let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

    assert!(find_allowlisted_agent_provider_in_path_env("zsh", &path_env).is_none());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn open_text_file_rejects_binary_looking_file() {
    let dir = unique_test_dir("open_binary");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("sample.md");
    fs::write(&path, b"# Title\n\0binary tail").expect("write binary fixture");

    let err = open_text_file(path.to_string_lossy().to_string())
        .expect_err("binary-looking markdown should fail");

    assert!(err.contains("Binary-looking"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn open_text_file_opens_utf8_json() {
    let dir = unique_test_dir("open_json_text_file");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("settings.json");
    fs::write(&path, "{\n  \"enabled\": true\n}\n").expect("write json fixture");

    let document = open_text_file(path.to_string_lossy().to_string()).expect("open json text file");

    assert_eq!(document.name, "settings.json");
    assert!(document.contents.contains("\"enabled\": true"));
    assert_eq!(document.line_ending, "lf");
}

#[test]
fn create_text_file_creates_empty_markdown_file() {
    let dir = unique_test_dir("create_text_file");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("fresh.md");

    let document =
        create_text_file(path.to_string_lossy().to_string()).expect("create markdown file");

    assert_eq!(document.name, "fresh.md");
    assert_eq!(document.contents, "");
    assert_eq!(document.line_ending, "lf");
    assert_eq!(document.size, 0);
    assert!(path.exists());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn create_text_file_rejects_existing_file() {
    let dir = unique_test_dir("create_existing_text_file");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("existing.md");
    fs::write(&path, "# Existing\n").expect("write fixture");

    let err = create_text_file(path.to_string_lossy().to_string())
        .expect_err("existing file should not be overwritten");

    assert!(err.contains("already exists"));
    assert_eq!(
        fs::read_to_string(&path).expect("read protected file"),
        "# Existing\n"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn atomic_write_replaces_text_file() {
    let dir = unique_test_dir("atomic_write");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    fs::write(&path, "# Old\n").expect("write fixture");

    atomic_write(&path, b"# New\n").expect("atomic write");

    assert_eq!(
        fs::read_to_string(&path).expect("read saved file"),
        "# New\n"
    );
    assert!(!dir.join(".note.md.hazakura-note.tmp").exists());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn atomic_write_removes_temp_file_after_replace_failure() {
    let dir = unique_test_dir("atomic_write_cleanup");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    fs::create_dir_all(&path).expect("create directory target");

    let err = atomic_write(&path, b"# New\n").expect_err("replace directory should fail");

    assert!(err.contains("Cannot replace saved file"));
    assert!(!dir.join(".note.md.hazakura-note.tmp").exists());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn atomic_write_does_not_clobber_existing_temp_file() {
    let dir = unique_test_dir("atomic_write_existing_temp");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    let temp_path = dir.join(".note.md.hazakura-note.tmp");
    fs::write(&path, "# Old\n").expect("write fixture");
    fs::write(&temp_path, "# Existing temp\n").expect("write existing temp fixture");

    let err = atomic_write(&path, b"# New\n").expect_err("existing temp should fail safely");

    assert!(err.contains("Cannot create temp file"));
    assert_eq!(
        fs::read_to_string(&path).expect("read protected file"),
        "# Old\n"
    );
    assert_eq!(
        fs::read_to_string(&temp_path).expect("read existing temp file"),
        "# Existing temp\n"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_rejects_external_change_before_write() {
    let dir = unique_test_dir("save_conflict");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    fs::write(&path, "# Original\n").expect("write fixture");
    let opened_metadata = fs::metadata(&path).expect("read opened metadata");
    let opened_fingerprint = metadata_fingerprint(&opened_metadata);

    fs::write(&path, "# External change\n\nDo not overwrite.\n").expect("simulate external change");

    let result = save_text_file(
        path.to_string_lossy().to_string(),
        "# Editor change\n".to_string(),
        opened_fingerprint,
        "lf".to_string(),
    );

    assert!(result
        .expect_err("save should reject conflict")
        .contains("Save conflict"));
    assert_eq!(
        fs::read_to_string(&path).expect("read protected file"),
        "# External change\n\nDo not overwrite.\n"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_preserves_crlf_line_endings() {
    let dir = unique_test_dir("save_crlf");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    fs::write(&path, b"# Title\r\n\r\nBody\r\n").expect("write crlf fixture");

    let document = open_text_file(path.to_string_lossy().to_string()).expect("open crlf fixture");

    assert_eq!(document.line_ending, "crlf");

    save_text_file(
        path.to_string_lossy().to_string(),
        "# Changed\n\nBody\n".to_string(),
        document.fingerprint,
        document.line_ending,
    )
    .expect("save crlf document");

    assert_eq!(
        fs::read(&path).expect("read saved file"),
        b"# Changed\r\n\r\nBody\r\n"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_preserves_lf_trailing_newline_presence() {
    let dir = unique_test_dir("save_lf_trailing_newline");
    fs::create_dir_all(&dir).expect("create test dir");
    let with_newline_path = dir.join("with-newline.md");
    let without_newline_path = dir.join("without-newline.md");
    fs::write(&with_newline_path, b"# Title\n\nBody\n").expect("write lf fixture");
    fs::write(&without_newline_path, b"# Title\n\nBody").expect("write lf fixture");

    let with_newline_document = open_text_file(with_newline_path.to_string_lossy().to_string())
        .expect("open lf fixture with final newline");
    let without_newline_document =
        open_text_file(without_newline_path.to_string_lossy().to_string())
            .expect("open lf fixture without final newline");

    save_text_file(
        with_newline_path.to_string_lossy().to_string(),
        "# Changed\n\nBody\n".to_string(),
        with_newline_document.fingerprint,
        with_newline_document.line_ending,
    )
    .expect("save lf document with final newline");
    save_text_file(
        without_newline_path.to_string_lossy().to_string(),
        "# Changed\n\nBody".to_string(),
        without_newline_document.fingerprint,
        without_newline_document.line_ending,
    )
    .expect("save lf document without final newline");

    assert_eq!(
        fs::read(&with_newline_path).expect("read saved file"),
        b"# Changed\n\nBody\n"
    );
    assert_eq!(
        fs::read(&without_newline_path).expect("read saved file"),
        b"# Changed\n\nBody"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_preserves_crlf_without_trailing_newline() {
    let dir = unique_test_dir("save_crlf_no_trailing_newline");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    fs::write(&path, b"# Title\r\n\r\nBody").expect("write crlf fixture");

    let document = open_text_file(path.to_string_lossy().to_string()).expect("open crlf fixture");

    assert_eq!(document.line_ending, "crlf");

    save_text_file(
        path.to_string_lossy().to_string(),
        "# Changed\n\nBody".to_string(),
        document.fingerprint,
        document.line_ending,
    )
    .expect("save crlf document without final newline");

    assert_eq!(
        fs::read(&path).expect("read saved file"),
        b"# Changed\r\n\r\nBody"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_text_file_as_creates_new_text_extension_with_requested_line_endings() {
    let dir = unique_test_dir("save_as_text_extension");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.log");

    let document = save_text_file_as(
        path.to_string_lossy().to_string(),
        "First\nSecond\n".to_string(),
        "crlf".to_string(),
    )
    .expect("save as text file");

    assert_eq!(document.name, "note.log");
    assert_eq!(document.line_ending, "crlf");
    assert_eq!(
        fs::read(&path).expect("read saved-as file"),
        b"First\r\nSecond\r\n"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_text_file_as_rejects_existing_file() {
    let dir = unique_test_dir("save_as_existing");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("existing.txt");
    fs::write(&path, "Keep me\n").expect("write fixture");

    let err = save_text_file_as(
        path.to_string_lossy().to_string(),
        "Overwrite attempt\n".to_string(),
        "lf".to_string(),
    )
    .expect_err("save as should not overwrite existing file");

    assert!(err.contains("already exists"));
    assert_eq!(
        fs::read_to_string(&path).expect("read protected file"),
        "Keep me\n"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn metadata_rejects_oversized_files() {
    let dir = unique_test_dir("oversized");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("huge.md");
    let file = File::create(&path).expect("create large file");
    file.set_len(MAX_EDITABLE_BYTES + 1)
        .expect("resize large file");

    let err = readable_text_metadata(&path).expect_err("large file should fail");

    assert!(err.contains("10 MB"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn workspace_tree_skips_heavy_and_hidden_directories() {
    let dir = unique_test_dir("workspace_tree");
    fs::create_dir_all(dir.join("notes")).expect("create notes dir");
    fs::create_dir_all(dir.join("node_modules/pkg")).expect("create node_modules dir");
    fs::create_dir_all(dir.join(".git/objects")).expect("create git dir");
    fs::create_dir_all(dir.join("target/debug")).expect("create target dir");
    fs::create_dir_all(dir.join("dist/assets")).expect("create dist dir");
    fs::write(dir.join("notes/today.md"), "# Today\n").expect("write note");
    fs::write(dir.join("README.md"), "# Readme\n").expect("write readme");

    let tree = list_workspace_tree(dir.to_string_lossy().to_string()).expect("list workspace");
    let names = tree
        .children
        .iter()
        .map(|entry| entry.name.as_str())
        .collect::<Vec<_>>();

    assert!(names.contains(&"notes"));
    assert!(names.contains(&"README.md"));
    assert!(!names.contains(&"node_modules"));
    assert!(!names.contains(&".git"));
    assert!(!names.contains(&"target"));
    assert!(!names.contains(&"dist"));
    assert!(tree.children_loaded);
    assert!(!tree.children_truncated);

    let notes = tree
        .children
        .iter()
        .find(|entry| entry.name == "notes")
        .expect("notes dir");
    assert!(!notes.children_loaded);
    assert!(notes.children.is_empty());

    let notes_tree =
        list_workspace_directory(dir.to_string_lossy().to_string(), notes.path.to_string())
            .expect("list notes dir");
    assert_eq!(notes_tree.children[0].name, "today.md");
    assert!(notes_tree.children_loaded);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn workspace_tree_uses_per_directory_cap_without_failing_root() {
    let dir = unique_test_dir("workspace_tree_cap");
    fs::create_dir_all(&dir).expect("create test dir");

    for index in 0..(MAX_WORKSPACE_ENTRIES + 5) {
        fs::write(dir.join(format!("{index:04}.md")), "# Note\n").expect("write note");
    }

    let tree = list_workspace_tree(dir.to_string_lossy().to_string()).expect("list workspace");

    assert_eq!(tree.children.len(), MAX_WORKSPACE_ENTRIES);
    assert!(tree.children_truncated);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn workspace_directory_rejects_paths_outside_root() {
    let root = unique_test_dir("workspace_root");
    let outside = unique_test_dir("workspace_outside");
    fs::create_dir_all(&root).expect("create root dir");
    fs::create_dir_all(&outside).expect("create outside dir");

    let err = list_workspace_directory(
        root.to_string_lossy().to_string(),
        outside.to_string_lossy().to_string(),
    )
    .expect_err("outside folder should fail");

    assert!(err.contains("outside the workspace root"));

    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn open_workspace_image_returns_data_url_for_supported_image() {
    let dir = unique_test_dir("workspace_image");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("tiny.png");
    fs::write(&path, b"\x89PNG\r\n\x1a\n").expect("write png fixture");

    let image = open_workspace_image(
        dir.to_string_lossy().to_string(),
        path.to_string_lossy().to_string(),
    )
    .expect("open workspace image");

    assert_eq!(image.name, "tiny.png");
    assert_eq!(image.data_url, "data:image/png;base64,iVBORw0KGgo=");

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn open_workspace_image_accepts_supported_signatures_by_extension() {
    let dir = unique_test_dir("workspace_image_signatures");
    fs::create_dir_all(&dir).expect("create test dir");

    let cases = [
        (
            "tiny.jpeg",
            b"\xff\xd8\xff\xe0".as_slice(),
            "data:image/jpeg;base64,",
        ),
        ("tiny.gif", b"GIF89a".as_slice(), "data:image/gif;base64,"),
        (
            "tiny.webp",
            b"RIFF\x04\x00\x00\x00WEBP".as_slice(),
            "data:image/webp;base64,",
        ),
    ];

    for (file_name, bytes, expected_prefix) in cases {
        let path = dir.join(file_name);
        fs::write(&path, bytes).expect("write image fixture");

        let image = open_workspace_image(
            dir.to_string_lossy().to_string(),
            path.to_string_lossy().to_string(),
        )
        .expect("open workspace image");

        assert_eq!(image.name, file_name);
        assert!(
            image.data_url.starts_with(expected_prefix),
            "{}",
            image.data_url
        );
    }

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn open_workspace_image_rejects_paths_outside_root() {
    let root = unique_test_dir("workspace_image_root");
    let outside = unique_test_dir("workspace_image_outside");
    fs::create_dir_all(&root).expect("create root dir");
    fs::create_dir_all(&outside).expect("create outside dir");
    let outside_image = outside.join("outside.jpg");
    fs::write(&outside_image, b"fake jpg").expect("write outside image");

    let err = open_workspace_image(
        root.to_string_lossy().to_string(),
        outside_image.to_string_lossy().to_string(),
    )
    .expect_err("outside image should be rejected");

    assert!(err.contains("outside the workspace root"), "{err}");

    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn open_workspace_image_rejects_supported_extension_with_non_image_bytes() {
    let dir = unique_test_dir("workspace_image_non_image");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("not-an-image.png");
    fs::write(&path, b"# Not an image\n").expect("write fake image");

    let err = open_workspace_image(
        dir.to_string_lossy().to_string(),
        path.to_string_lossy().to_string(),
    )
    .expect_err("non-image bytes should be rejected");

    assert!(
        err.contains("contents do not match a supported image type"),
        "{err}"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn open_workspace_image_rejects_extension_signature_mismatch() {
    let dir = unique_test_dir("workspace_image_mismatch");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("jpeg-bytes.png");
    fs::write(&path, b"\xff\xd8\xff\xe0").expect("write mismatched image");

    let err = open_workspace_image(
        dir.to_string_lossy().to_string(),
        path.to_string_lossy().to_string(),
    )
    .expect_err("mismatched extension and signature should be rejected");

    assert!(
        err.contains("contents do not match a supported image type"),
        "{err}"
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn open_workspace_image_rejects_oversized_image_before_preview() {
    let dir = unique_test_dir("workspace_image_oversized");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("oversized.png");
    let file = File::create(&path).expect("create oversized image fixture");
    file.set_len(MAX_IMAGE_PREVIEW_BYTES + 1)
        .expect("resize oversized image fixture");

    let err = open_workspace_image(
        dir.to_string_lossy().to_string(),
        path.to_string_lossy().to_string(),
    )
    .expect_err("oversized image should be rejected");

    assert!(err.contains("preview limit of 20 MB"), "{err}");

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_pasted_image_writes_supported_image_inside_assets() {
    let dir = unique_test_dir("pasted_image");
    fs::create_dir_all(&dir).expect("create test dir");

    let relative = save_pasted_image(
        dir.to_string_lossy().to_string(),
        "iVBORw0KGgo=".to_string(),
        "../pasted.png".to_string(),
    )
    .expect("save pasted image");

    assert!(
        relative.starts_with("assets/") && relative.ends_with(".png"),
        "Expected assets/<hash>.png, got: {relative}",
    );
    assert!(
        dir.join(&relative).is_file(),
        "File should exist at {relative}",
    );

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn save_pasted_image_rejects_non_image_bytes() {
    let dir = unique_test_dir("pasted_non_image");
    fs::create_dir_all(&dir).expect("create test dir");

    let error = save_pasted_image(
        dir.to_string_lossy().to_string(),
        "SGVsbG8=".to_string(),
        "pasted.png".to_string(),
    )
    .expect_err("non-image paste should be rejected");

    assert!(error.contains("supported image type"), "{error}");

    let _ = fs::remove_dir_all(dir);
}

#[cfg(unix)]
#[test]
fn save_pasted_image_rejects_assets_symlink_outside_workspace() {
    use std::os::unix::fs::symlink;

    let root = unique_test_dir("pasted_symlink_root");
    let outside = unique_test_dir("pasted_symlink_outside");
    fs::create_dir_all(&root).expect("create root");
    fs::create_dir_all(&outside).expect("create outside");
    symlink(&outside, root.join("assets")).expect("create assets symlink");

    let error = save_pasted_image(
        root.to_string_lossy().to_string(),
        "iVBORw0KGgo=".to_string(),
        "pasted.png".to_string(),
    )
    .expect_err("assets symlink should be rejected");

    assert!(error.contains("outside the workspace root"), "{error}");
    assert!(!outside.join("pasted.png").exists());

    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn import_image_from_path_writes_supported_image_inside_assets() {
    let root = unique_test_dir("import_image_root");
    let source_dir = unique_test_dir("import_image_source");
    fs::create_dir_all(&root).expect("create root");
    fs::create_dir_all(&source_dir).expect("create source dir");
    let source = source_dir.join("Dropped Image!.png");
    fs::write(
        &source,
        decode_base64("iVBORw0KGgo=").expect("decode png header"),
    )
    .expect("write source image");

    let relative = import_image_from_path(
        root.to_string_lossy().to_string(),
        source.to_string_lossy().to_string(),
    )
    .expect("import image");

    assert!(
        relative.starts_with("assets/") && relative.ends_with(".png"),
        "Expected assets/<hash>.png, got: {relative}",
    );
    assert!(
        root.join(&relative).is_file(),
        "File should exist at {relative}",
    );
    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(source_dir);
}

#[test]
fn import_image_from_path_rejects_non_image_bytes() {
    let root = unique_test_dir("import_non_image_root");
    let source_dir = unique_test_dir("import_non_image_source");
    fs::create_dir_all(&root).expect("create root");
    fs::create_dir_all(&source_dir).expect("create source dir");
    let source = source_dir.join("not-image.png");
    fs::write(&source, b"not an image").expect("write source file");

    let error = import_image_from_path(
        root.to_string_lossy().to_string(),
        source.to_string_lossy().to_string(),
    )
    .expect_err("non-image import should be rejected");

    assert!(error.contains("supported image type"), "{error}");

    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(source_dir);
}

#[cfg(unix)]
#[test]
fn import_image_from_path_rejects_assets_symlink_outside_workspace() {
    use std::os::unix::fs::symlink;

    let root = unique_test_dir("import_symlink_root");
    let outside = unique_test_dir("import_symlink_outside");
    let source_dir = unique_test_dir("import_symlink_source");
    fs::create_dir_all(&root).expect("create root");
    fs::create_dir_all(&outside).expect("create outside");
    fs::create_dir_all(&source_dir).expect("create source dir");
    symlink(&outside, root.join("assets")).expect("create assets symlink");
    let source = source_dir.join("pasted.png");
    fs::write(
        &source,
        decode_base64("iVBORw0KGgo=").expect("decode png header"),
    )
    .expect("write source image");

    let error = import_image_from_path(
        root.to_string_lossy().to_string(),
        source.to_string_lossy().to_string(),
    )
    .expect_err("assets symlink should be rejected");

    assert!(error.contains("outside the workspace root"), "{error}");
    assert!(!outside.join("pasted.png").exists());

    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
    let _ = fs::remove_dir_all(source_dir);
}

#[test]
fn workspace_tree_rejects_file_root() {
    let dir = unique_test_dir("workspace_file_root");
    fs::create_dir_all(&dir).expect("create test dir");
    let path = dir.join("note.md");
    fs::write(&path, "# Not a folder\n").expect("write file");

    let err =
        list_workspace_tree(path.to_string_lossy().to_string()).expect_err("file root should fail");

    assert!(err.contains("not a folder"));

    let _ = fs::remove_dir_all(dir);
}

fn unique_test_dir(name: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();

    std::env::temp_dir().join(format!("hazakura-note-{name}-{}-{now}", std::process::id()))
}

fn fake_provider_fixture(name: &str, provider: &str, script: &[u8]) -> FakeProviderFixture {
    let dir = unique_test_dir(name);
    fs::create_dir_all(&dir).expect("create fake provider workspace");
    let command_path = dir.join(provider);
    fs::write(&command_path, script).expect("write fake provider");
    make_executable(&command_path);
    let mut paths = vec![dir.clone()];
    if let Some(parent_path) = env::var_os("PATH") {
        paths.extend(env::split_paths(&parent_path));
    }
    let path_env = env::join_paths(paths).expect("join fake provider PATH");

    FakeProviderFixture {
        dir,
        command_path,
        path_env,
    }
}

fn wait_for_agent_state(
    store: &AgentWorkbenchSessionStore,
    predicate: impl Fn(&AgentWorkbenchSessionState) -> bool,
) -> AgentWorkbenchSessionState {
    let mut state =
        get_agent_workbench_session_state_with_store(store).expect("read agent session state");

    for _ in 0..80 {
        if predicate(&state) {
            return state;
        }

        std::thread::sleep(Duration::from_millis(50));
        state =
            get_agent_workbench_session_state_with_store(store).expect("read agent session state");
    }

    state
}

fn combined_agent_output(state: &AgentWorkbenchSessionState) -> String {
    state
        .output
        .iter()
        .map(|chunk| chunk.text.as_str())
        .collect::<String>()
}

fn assert_agent_output_seq_strictly_increases(output: &[AgentWorkbenchOutputChunk]) {
    assert!(
        output
            .windows(2)
            .all(|window| window[0].seq < window[1].seq),
        "agent output sequence numbers should strictly increase",
    );
}

#[cfg(unix)]
fn make_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .expect("read fake command metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).expect("mark fake command executable");
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) {}

#[cfg(unix)]
fn process_exists(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
