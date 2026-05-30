use crate::types::*;
use crate::util::*;
use std::ffi::CStr;
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

#[cfg(unix)]
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
#[cfg(unix)]
use std::os::raw::{c_char, c_int, c_ulong};

impl AgentRuntimeAdapter for RealAgentRuntimeAdapter<'_> {
    fn start(&self, request: AgentRuntimeLaunchRequest<'_>) -> Result<AgentRuntimeHandle, String> {
        let mut runtime = self
            .session_store
            .runtime
            .lock()
            .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;

        if runtime.is_some() {
            return Err("Agent Workbench runtime is already active.".to_string());
        }

        append_agent_output(
            &self.session_store.output,
            &self.session_store.next_output_seq,
            AgentWorkbenchOutputStream::System,
            format!(
                "Starting {} in {}\n",
                request.provider, request.workspace_root
            ),
        );

        let runtime_process = match self.terminal_mode {
            AgentRuntimeTerminalMode::Pipe => {
                start_agent_pipe_process(request, self.session_store)?
            }
            AgentRuntimeTerminalMode::Pty => start_agent_pty_process(request, self.session_store)?,
        };

        *runtime = Some(runtime_process);

        Ok(AgentRuntimeHandle {
            provider: request.provider.to_string(),
            workspace_root: request.workspace_root.to_string(),
            provider_path: request.provider_path.to_string(),
            status: AgentRuntimeStatus::Running,
        })
    }

    fn stop(&self, handle: &AgentRuntimeHandle) -> Result<AgentRuntimeHandle, String> {
        let mut runtime = self
            .session_store
            .runtime
            .lock()
            .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;

        if let Some(mut process) = runtime.take() {
            process.stdin.take();
            match process
                .child
                .try_wait()
                .map_err(|err| format!("Cannot inspect provider process: {err}"))?
            {
                Some(status) => {
                    append_agent_output(
                        &self.session_store.output,
                        &self.session_store.next_output_seq,
                        AgentWorkbenchOutputStream::System,
                        format!("Provider process already exited: {status}\n"),
                    );
                }
                None => {
                    process
                        .child
                        .kill()
                        .map_err(|err| format!("Cannot stop provider process: {err}"))?;
                    let _ = process.child.wait();
                    append_agent_output(
                        &self.session_store.output,
                        &self.session_store.next_output_seq,
                        AgentWorkbenchOutputStream::System,
                        "Provider process stopped by user.\n".to_string(),
                    );
                }
            }
        }

        Ok(AgentRuntimeHandle {
            provider: handle.provider.clone(),
            workspace_root: handle.workspace_root.clone(),
            provider_path: handle.provider_path.clone(),
            status: AgentRuntimeStatus::Stopped,
        })
    }
}

pub(crate) fn build_agent_runtime_command(request: AgentRuntimeLaunchRequest<'_>) -> Command {
    let mut command = Command::new(request.provider_path);
    command.current_dir(request.workspace_root);

    if let Some(path_env) = request.path_env {
        command.env("PATH", path_env);
    }

    command.env("TERM", "xterm-256color");
    command
}

pub(crate) fn start_agent_pipe_process(
    request: AgentRuntimeLaunchRequest<'_>,
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentRuntimeProcess, String> {
    let mut command = build_agent_runtime_command(request);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|err| format!("Cannot start allowlisted provider CLI: {err}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Cannot open provider stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot open provider stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cannot open provider stderr.".to_string())?;

    spawn_agent_output_reader(
        stdout,
        AgentWorkbenchOutputStream::Stdout,
        Arc::clone(&session_store.output),
        Arc::clone(&session_store.next_output_seq),
    );
    spawn_agent_output_reader(
        stderr,
        AgentWorkbenchOutputStream::Stderr,
        Arc::clone(&session_store.output),
        Arc::clone(&session_store.next_output_seq),
    );

    Ok(AgentRuntimeProcess {
        child,
        stdin: Some(Box::new(stdin)),
        pty_control: None,
    })
}

#[cfg(unix)]
pub(crate) fn start_agent_pty_process(
    request: AgentRuntimeLaunchRequest<'_>,
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentRuntimeProcess, String> {
    let pty = open_agent_pty()?;
    if let (Some(columns), Some(rows)) = (request.terminal_columns, request.terminal_rows) {
        resize_agent_pty(&pty.master, columns, rows)?;
    }
    let input = pty
        .master
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY input: {err}"))?;
    let output = pty
        .master
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY output: {err}"))?;
    let pty_control = pty
        .master
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY control: {err}"))?;
    let stdin = pty
        .slave
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY stdin: {err}"))?;
    let stdout = pty
        .slave
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY stdout: {err}"))?;
    let stderr = pty
        .slave
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY stderr: {err}"))?;

    let mut command = build_agent_runtime_command(request);
    command
        .stdin(Stdio::from(stdin))
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let child = command
        .spawn()
        .map_err(|err| format!("Cannot start allowlisted provider CLI with PTY: {err}"))?;

    drop(pty.slave);
    spawn_agent_output_reader(
        output,
        AgentWorkbenchOutputStream::Stdout,
        Arc::clone(&session_store.output),
        Arc::clone(&session_store.next_output_seq),
    );

    Ok(AgentRuntimeProcess {
        child,
        stdin: Some(Box::new(input)),
        pty_control: Some(pty_control),
    })
}

#[cfg(not(unix))]
pub(crate) fn start_agent_pty_process(
    request: AgentRuntimeLaunchRequest<'_>,
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentRuntimeProcess, String> {
    start_agent_pipe_process(request, session_store)
}

#[cfg(unix)]
pub(crate) struct AgentPty {
    master: File,
    slave: File,
}

#[cfg(unix)]
pub(crate) fn open_agent_pty() -> Result<AgentPty, String> {
    let master_fd = unsafe { posix_openpt(O_RDWR_FLAG | O_NOCTTY_FLAG) };
    if master_fd < 0 {
        return Err("Cannot open provider PTY master.".to_string());
    }

    if unsafe { grantpt(master_fd) } != 0 {
        close_fd(master_fd);
        return Err("Cannot grant provider PTY.".to_string());
    }

    if unsafe { unlockpt(master_fd) } != 0 {
        close_fd(master_fd);
        return Err("Cannot unlock provider PTY.".to_string());
    }

    let slave_name = unsafe {
        let raw_name = ptsname(master_fd);
        if raw_name.is_null() {
            close_fd(master_fd);
            return Err("Cannot resolve provider PTY slave.".to_string());
        }
        CStr::from_ptr(raw_name).to_string_lossy().to_string()
    };

    let slave = OpenOptions::new()
        .read(true)
        .write(true)
        .open(slave_name)
        .map_err(|err| {
            close_fd(master_fd);
            format!("Cannot open provider PTY slave: {err}")
        })?;
    let master = unsafe { File::from_raw_fd(master_fd) };

    Ok(AgentPty { master, slave })
}

#[cfg(unix)]
pub(crate) fn close_fd(fd: RawFd) {
    let _ = unsafe { close(fd) };
}

#[cfg(all(unix, target_os = "macos"))]
const TIOCSWINSZ_REQUEST: c_ulong = 0x8008_7467;

#[cfg(all(unix, target_os = "linux"))]
const TIOCSWINSZ_REQUEST: c_ulong = 0x5414;

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
const TIOCSWINSZ_REQUEST: c_ulong = 0x5414;

#[cfg(unix)]
#[repr(C)]
pub(crate) struct AgentPtyWindowSize {
    ws_row: u16,
    ws_col: u16,
    ws_xpixel: u16,
    ws_ypixel: u16,
}

#[cfg(unix)]
pub(crate) fn resize_agent_pty(pty: &File, columns: u16, rows: u16) -> Result<(), String> {
    let size = AgentPtyWindowSize {
        ws_row: rows,
        ws_col: columns,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let result = unsafe { ioctl(pty.as_raw_fd(), TIOCSWINSZ_REQUEST, &size) };
    if result != 0 {
        return Err(format!(
            "Cannot resize provider PTY: {}",
            std::io::Error::last_os_error()
        ));
    }

    Ok(())
}

#[cfg(unix)]
const SIGWINCH_SIGNAL: c_int = 28;

#[cfg(unix)]
pub(crate) fn notify_agent_pty_resized(child: &Child) {
    let _ = unsafe { kill(child.id() as c_int, SIGWINCH_SIGNAL) };
}

#[cfg(not(unix))]
pub(crate) fn resize_agent_pty(_pty: &File, _columns: u16, _rows: u16) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
extern "C" {
    pub(crate) fn posix_openpt(oflag: i32) -> RawFd;
    pub(crate) fn grantpt(fd: RawFd) -> i32;
    pub(crate) fn unlockpt(fd: RawFd) -> i32;
    pub(crate) fn ptsname(fd: RawFd) -> *mut c_char;
    pub(crate) fn close(fd: RawFd) -> i32;
    pub(crate) fn ioctl(fd: RawFd, request: c_ulong, ...) -> i32;
    pub(crate) fn kill(pid: c_int, sig: c_int) -> c_int;
}

pub(crate) fn spawn_agent_output_reader<R>(
    mut reader: R,
    stream: AgentWorkbenchOutputStream,
    output: Arc<Mutex<Vec<AgentWorkbenchOutputChunk>>>,
    next_output_seq: Arc<Mutex<u64>>,
) where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(bytes_read) => {
                    let text = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                    append_agent_output(&output, &next_output_seq, stream.clone(), text);
                }
                Err(err) => {
                    append_agent_output(
                        &output,
                        &next_output_seq,
                        AgentWorkbenchOutputStream::System,
                        format!("Provider output read failed: {err}\n"),
                    );
                    break;
                }
            }
        }
    });
}

pub(crate) fn append_agent_output(
    output: &Arc<Mutex<Vec<AgentWorkbenchOutputChunk>>>,
    next_output_seq: &Arc<Mutex<u64>>,
    stream: AgentWorkbenchOutputStream,
    text: String,
) {
    if text.is_empty() {
        return;
    }

    let Ok(mut seq) = next_output_seq.lock() else {
        return;
    };
    let chunk = AgentWorkbenchOutputChunk {
        seq: *seq,
        stream,
        text,
        received_at_ms: current_time_ms(),
    };
    *seq += 1;

    if let Ok(mut chunks) = output.lock() {
        chunks.push(chunk);
        if chunks.len() > AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS {
            let overflow = chunks.len() - AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS;
            chunks.drain(0..overflow);
        }
    }
}

pub(crate) fn snapshot_agent_output(
    session_store: &AgentWorkbenchSessionStore,
) -> Result<Vec<AgentWorkbenchOutputChunk>, String> {
    session_store
        .output
        .lock()
        .map(|chunks| chunks.clone())
        .map_err(|_| "Agent Workbench output state is unavailable.".to_string())
}

