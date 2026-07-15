use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::process::Stdio;

use git2::{Repository, Status};
use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::git_utils::resolve_git_root;
use crate::shared::git_core;
use crate::shared::process_core::tokio_command;
use crate::types::{GitSelectionApplyResult, GitSelectionLine, WorkspaceEntry};
use crate::utils::{git_env_path, resolve_git_binary};

use super::commands::action_paths_for_file;
use super::context::workspace_entry_for_id;

fn git_selection_debug_enabled() -> bool {
    std::env::var_os("CODEX_MONITOR_GIT_SELECTION_DEBUG").is_some()
}

fn git_selection_debug_log(event: &str, payload: Value) {
    if !git_selection_debug_enabled() {
        return;
    }
    eprintln!("[git-selection] {event} {}", payload);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum SelectionLineType {
    Add,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct SelectionLineKey {
    pub(super) line_type: SelectionLineType,
    pub(super) old_line: Option<usize>,
    pub(super) new_line: Option<usize>,
    pub(super) text: String,
}

impl TryFrom<&GitSelectionLine> for SelectionLineKey {
    type Error = String;

    fn try_from(value: &GitSelectionLine) -> Result<Self, Self::Error> {
        let line_type = match value.line_type.as_str() {
            "add" => SelectionLineType::Add,
            "del" => SelectionLineType::Del,
            _ => {
                return Err(format!(
                    "Unsupported selection line type `{}`. Expected `add` or `del`.",
                    value.line_type
                ));
            }
        };
        if line_type == SelectionLineType::Add && value.new_line.is_none() {
            return Err("Selected `add` line is missing `newLine`.".to_string());
        }
        if line_type == SelectionLineType::Del && value.old_line.is_none() {
            return Err("Selected `del` line is missing `oldLine`.".to_string());
        }
        Ok(Self {
            line_type,
            old_line: value.old_line,
            new_line: value.new_line,
            text: value.text.clone(),
        })
    }
}

#[derive(Debug, Clone)]
pub(super) struct ParsedPatchLine {
    pub(super) line_type: SelectionLineType,
    pub(super) old_line: Option<usize>,
    pub(super) new_line: Option<usize>,
    pub(super) old_anchor: usize,
    pub(super) new_anchor: usize,
    pub(super) text: String,
    pub(super) no_newline_after: bool,
}

#[derive(Debug, Clone)]
pub(super) struct ParsedPatchHunk {
    pub(super) old_start: usize,
    pub(super) old_count: usize,
    pub(super) new_start: usize,
    pub(super) new_count: usize,
    pub(super) lines: Vec<ParsedPatchLine>,
}

#[derive(Debug, Clone)]
pub(super) struct ParsedPatch {
    pub(super) headers: Vec<String>,
    pub(super) hunks: Vec<ParsedPatchHunk>,
}

#[derive(Debug, Clone)]
pub(super) struct SelectionSourceFileContext {
    pub(super) old_lines: Vec<String>,
    pub(super) new_lines: Vec<String>,
}

fn parse_hunk_range(raw: &str) -> Option<(usize, usize)> {
    if let Some((start, count)) = raw.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((raw.parse().ok()?, 1))
    }
}

pub(super) fn parse_hunk_header(line: &str) -> Option<(usize, usize, usize, usize)> {
    let suffix = line.strip_prefix("@@ -")?;
    let (old_range_raw, rest) = suffix.split_once(" +")?;
    let marker_index = rest.find(" @@")?;
    let new_range_raw = &rest[..marker_index];
    let (old_start, old_count) = parse_hunk_range(old_range_raw)?;
    let (new_start, new_count) = parse_hunk_range(new_range_raw)?;
    Some((old_start, old_count, new_start, new_count))
}

pub(super) fn parse_zero_context_patch(diff_patch: &str) -> Result<ParsedPatch, String> {
    let lines: Vec<&str> = diff_patch.lines().collect();
    if lines.is_empty() {
        return Err("No patch content to apply.".to_string());
    }

    let mut headers = Vec::new();
    let mut hunks = Vec::new();
    let mut index = 0usize;

    while index < lines.len() {
        let line = lines[index];
        if let Some((old_start, _old_count, new_start, _new_count)) = parse_hunk_header(line) {
            let mut old_cursor = old_start;
            let mut new_cursor = new_start;
            let mut parsed_lines = Vec::new();
            let mut inner_index = index + 1;
            while inner_index < lines.len() {
                let body_line = lines[inner_index];
                if parse_hunk_header(body_line).is_some() || body_line.starts_with("diff --git ") {
                    break;
                }

                if let Some(text) = body_line.strip_prefix('+') {
                    parsed_lines.push(ParsedPatchLine {
                        line_type: SelectionLineType::Add,
                        old_line: None,
                        new_line: Some(new_cursor),
                        old_anchor: old_cursor,
                        new_anchor: new_cursor,
                        text: text.to_string(),
                        no_newline_after: false,
                    });
                    new_cursor += 1;
                } else if let Some(text) = body_line.strip_prefix('-') {
                    parsed_lines.push(ParsedPatchLine {
                        line_type: SelectionLineType::Del,
                        old_line: Some(old_cursor),
                        new_line: None,
                        old_anchor: old_cursor,
                        new_anchor: new_cursor,
                        text: text.to_string(),
                        no_newline_after: false,
                    });
                    old_cursor += 1;
                } else if body_line.starts_with(' ') {
                    old_cursor += 1;
                    new_cursor += 1;
                } else if body_line == "\\ No newline at end of file" {
                    if let Some(last_line) = parsed_lines.last_mut() {
                        last_line.no_newline_after = true;
                    }
                }
                inner_index += 1;
            }
            if !parsed_lines.is_empty() {
                hunks.push(ParsedPatchHunk {
                    old_start,
                    old_count: _old_count,
                    new_start,
                    new_count: _new_count,
                    lines: parsed_lines,
                });
            }
            index = inner_index;
            continue;
        }

        if hunks.is_empty() {
            headers.push(line.to_string());
        }
        index += 1;
    }

    if headers.is_empty() || hunks.is_empty() {
        return Err("Could not parse diff hunks for line selection.".to_string());
    }

    Ok(ParsedPatch { headers, hunks })
}

pub(super) fn parsed_patch_hunk_id(source: &str, hunk: &ParsedPatchHunk) -> String {
    format!(
        "{source}:{}:{}:{}:{}",
        hunk.old_start, hunk.old_count, hunk.new_start, hunk.new_count
    )
}

fn split_text_lines(content: &str) -> Vec<String> {
    content.lines().map(ToString::to_string).collect()
}

fn blob_to_lines(blob: git2::Blob<'_>) -> Result<Vec<String>, String> {
    let content = String::from_utf8(blob.content().to_vec())
        .map_err(|_| "Selected file contents are not valid UTF-8.".to_string())?;
    Ok(split_text_lines(&content))
}

fn read_head_lines(repo: &Repository, path: &str) -> Result<Vec<String>, String> {
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return Ok(Vec::new()),
    };
    let tree = head.peel_to_tree().map_err(|e| e.to_string())?;
    let entry = match tree.get_path(Path::new(path)) {
        Ok(entry) => entry,
        Err(_) => return Ok(Vec::new()),
    };
    let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;
    blob_to_lines(blob)
}

fn read_index_lines(repo: &Repository, path: &str) -> Result<Vec<String>, String> {
    let index = repo.index().map_err(|e| e.to_string())?;
    let entry = match index.get_path(Path::new(path), 0) {
        Some(entry) => entry,
        None => return Ok(Vec::new()),
    };
    let blob = repo.find_blob(entry.id).map_err(|e| e.to_string())?;
    blob_to_lines(blob)
}

fn read_worktree_lines(repo_root: &Path, path: &str) -> Result<Vec<String>, String> {
    let full_path = repo_root.join(path);
    let data = match fs::read(&full_path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "Failed to read selected worktree file {}: {error}",
                full_path.display()
            ));
        }
    };
    let content = String::from_utf8(data)
        .map_err(|_| "Selected file contents are not valid UTF-8.".to_string())?;
    Ok(split_text_lines(&content))
}

fn load_selection_source_file_context(
    repo_root: &Path,
    path: &str,
    source: &str,
) -> Result<SelectionSourceFileContext, String> {
    let repo = Repository::open(repo_root).map_err(|e| e.to_string())?;
    match source {
        "unstaged" => Ok(SelectionSourceFileContext {
            old_lines: read_index_lines(&repo, path)?,
            new_lines: read_worktree_lines(repo_root, path)?,
        }),
        "staged" => Ok(SelectionSourceFileContext {
            old_lines: read_head_lines(&repo, path)?,
            new_lines: read_index_lines(&repo, path)?,
        }),
        _ => Err("Invalid selection source.".to_string()),
    }
}

fn context_before_old_end(line: &ParsedPatchLine) -> usize {
    match line.line_type {
        SelectionLineType::Add => line.old_anchor,
        SelectionLineType::Del => line.old_anchor.saturating_sub(1),
    }
}

fn context_before_new_end(line: &ParsedPatchLine) -> usize {
    match line.line_type {
        SelectionLineType::Add => line.new_anchor.saturating_sub(1),
        SelectionLineType::Del => line.new_anchor,
    }
}

fn context_after_old_start(line: &ParsedPatchLine) -> usize {
    line.old_anchor + 1
}

fn context_after_new_start(line: &ParsedPatchLine) -> usize {
    match line.line_type {
        SelectionLineType::Add => line.new_anchor + 1,
        SelectionLineType::Del => line.new_anchor,
    }
}

fn selected_old_start(line: &ParsedPatchLine) -> usize {
    match line.line_type {
        SelectionLineType::Add => line.old_anchor + 1,
        SelectionLineType::Del => line.old_anchor,
    }
}

fn selected_new_start(line: &ParsedPatchLine) -> usize {
    line.new_anchor
}

fn shared_suffix_context_len(
    old_lines: &[String],
    new_lines: &[String],
    old_start: usize,
    old_end: usize,
    new_start: usize,
    new_end: usize,
) -> usize {
    if old_start == 0 || new_start == 0 || old_end < old_start || new_end < new_start {
        return 0;
    }
    let old_count = old_end - old_start + 1;
    let new_count = new_end - new_start + 1;
    let max_count = old_count.min(new_count);
    let mut count = 0usize;
    while count < max_count {
        let old_index = old_end.saturating_sub(count);
        let new_index = new_end.saturating_sub(count);
        if old_index == 0 || new_index == 0 {
            break;
        }
        let Some(old_line) = old_lines.get(old_index - 1) else {
            break;
        };
        let Some(new_line) = new_lines.get(new_index - 1) else {
            break;
        };
        if old_line != new_line {
            break;
        }
        count += 1;
    }
    count
}

fn shared_prefix_context_len(
    old_lines: &[String],
    new_lines: &[String],
    old_start: usize,
    old_end: usize,
    new_start: usize,
    new_end: usize,
) -> usize {
    if old_start == 0 || new_start == 0 || old_end < old_start || new_end < new_start {
        return 0;
    }
    let old_count = old_end - old_start + 1;
    let new_count = new_end - new_start + 1;
    let max_count = old_count.min(new_count);
    let mut count = 0usize;
    while count < max_count {
        let old_index = old_start + count;
        let new_index = new_start + count;
        let Some(old_line) = old_lines.get(old_index - 1) else {
            break;
        };
        let Some(new_line) = new_lines.get(new_index - 1) else {
            break;
        };
        if old_line != new_line {
            break;
        }
        count += 1;
    }
    count
}

fn append_full_hunk_with_context(
    output: &mut Vec<String>,
    parsed: &ParsedPatch,
    hunk_index: usize,
    old_lines: &[String],
    new_lines: &[String],
) {
    let hunk = &parsed.hunks[hunk_index];
    let Some(first) = hunk.lines.first() else {
        return;
    };
    let Some(last) = hunk.lines.last() else {
        return;
    };

    let previous_last = hunk_index
        .checked_sub(1)
        .and_then(|index| parsed.hunks.get(index))
        .and_then(|previous| previous.lines.last());
    let next_first = parsed
        .hunks
        .get(hunk_index + 1)
        .and_then(|next| next.lines.first());

    let available_before_old_start = previous_last.map(context_after_old_start).unwrap_or(1);
    let available_before_new_start = previous_last.map(context_after_new_start).unwrap_or(1);
    let available_before_old_end = context_before_old_end(first);
    let available_before_new_end = context_before_new_end(first);
    let before_count = shared_suffix_context_len(
        old_lines,
        new_lines,
        available_before_old_start,
        available_before_old_end,
        available_before_new_start,
        available_before_new_end,
    );
    let before_old_start = if before_count > 0 {
        available_before_old_end - before_count + 1
    } else {
        0
    };
    let before_new_start = if before_count > 0 {
        available_before_new_end - before_count + 1
    } else {
        0
    };

    let available_after_old_start = context_after_old_start(last);
    let available_after_new_start = context_after_new_start(last);
    let available_after_old_end = next_first
        .map(context_before_old_end)
        .unwrap_or(old_lines.len());
    let available_after_new_end = next_first
        .map(context_before_new_end)
        .unwrap_or(new_lines.len());
    let after_count = shared_prefix_context_len(
        old_lines,
        new_lines,
        available_after_old_start,
        available_after_old_end,
        available_after_new_start,
        available_after_new_end,
    );

    let old_count = before_count
        + hunk
            .lines
            .iter()
            .filter(|line| line.line_type == SelectionLineType::Del)
            .count()
        + after_count;
    let new_count = before_count
        + hunk
            .lines
            .iter()
            .filter(|line| line.line_type == SelectionLineType::Add)
            .count()
        + after_count;

    let old_start = if before_count > 0 {
        before_old_start
    } else {
        selected_old_start(first)
    };
    let new_start = if before_count > 0 {
        before_new_start
    } else {
        selected_new_start(first)
    };

    output.push(format!(
        "@@ -{},{} +{},{} @@",
        old_start, old_count, new_start, new_count
    ));

    if before_count > 0 {
        for offset in 0..before_count {
            if let Some(line) = old_lines.get(before_old_start + offset - 1) {
                output.push(format!(" {}", line));
            }
        }
    }

    for line in &hunk.lines {
        let prefix = if line.line_type == SelectionLineType::Add {
            '+'
        } else {
            '-'
        };
        output.push(format!("{prefix}{}", line.text));
        if line.no_newline_after {
            output.push("\\ No newline at end of file".to_string());
        }
    }

    if after_count > 0 {
        for offset in 0..after_count {
            if let Some(line) = old_lines.get(available_after_old_start + offset - 1) {
                output.push(format!(" {}", line));
            }
        }
    }
}

pub(super) fn build_selected_patch(
    diff_patch: &str,
    selected_lines: &HashSet<SelectionLineKey>,
    file_context: &SelectionSourceFileContext,
) -> Result<(String, usize), String> {
    let parsed = parse_zero_context_patch(diff_patch)?;
    let mut output = parsed.headers.clone();
    let mut applied_line_count = 0usize;
    let debug_enabled = git_selection_debug_enabled();
    let mut debug_hunks: Vec<Value> = Vec::new();

    for (hunk_index, hunk) in parsed.hunks.iter().enumerate() {
        let mut group: Vec<&ParsedPatchLine> = Vec::new();
        let mut matched_lines: Vec<Value> = Vec::new();
        let flush_group = |group: &mut Vec<&ParsedPatchLine>, output: &mut Vec<String>| {
            if group.is_empty() {
                return;
            }
            let first = group[0];
            let old_count = group
                .iter()
                .filter(|line| line.line_type == SelectionLineType::Del)
                .count();
            let new_count = group
                .iter()
                .filter(|line| line.line_type == SelectionLineType::Add)
                .count();
            output.push(format!(
                "@@ -{},{} +{},{} @@",
                first.old_anchor, old_count, first.new_anchor, new_count
            ));
            for line in group.iter() {
                let prefix = if line.line_type == SelectionLineType::Add {
                    '+'
                } else {
                    '-'
                };
                output.push(format!("{prefix}{}", line.text));
                if line.no_newline_after {
                    output.push("\\ No newline at end of file".to_string());
                }
            }
            group.clear();
        };

        let selected_count = hunk
            .lines
            .iter()
            .filter(|line| {
                selected_lines.contains(&SelectionLineKey {
                    line_type: line.line_type,
                    old_line: line.old_line,
                    new_line: line.new_line,
                    text: line.text.clone(),
                })
            })
            .count();

        for line in &hunk.lines {
            let key = SelectionLineKey {
                line_type: line.line_type,
                old_line: line.old_line,
                new_line: line.new_line,
                text: line.text.clone(),
            };
            if selected_lines.contains(&key) {
                group.push(line);
                applied_line_count += 1;
                if debug_enabled {
                    matched_lines.push(json!({
                        "type": if line.line_type == SelectionLineType::Add { "add" } else { "del" },
                        "oldLine": line.old_line,
                        "newLine": line.new_line,
                        "oldAnchor": line.old_anchor,
                        "newAnchor": line.new_anchor,
                        "text": line.text,
                    }));
                }
            } else {
                flush_group(&mut group, &mut output);
            }
        }
        if selected_count == hunk.lines.len() && selected_count > 0 {
            group.clear();
            append_full_hunk_with_context(
                &mut output,
                &parsed,
                hunk_index,
                &file_context.old_lines,
                &file_context.new_lines,
            );
        } else {
            flush_group(&mut group, &mut output);
        }
        if debug_enabled {
            debug_hunks.push(json!({
                "hunkIndex": hunk_index,
                "hunkLineCount": hunk.lines.len(),
                "matchedLineCount": matched_lines.len(),
                "matchedLines": matched_lines,
            }));
        }
    }

    if applied_line_count == 0 {
        return Err(
            "Selected lines do not match the current diff. Refresh and try again.".to_string(),
        );
    }

    let mut patch = output.join("\n");
    if !patch.ends_with('\n') {
        patch.push('\n');
    }
    if debug_enabled {
        git_selection_debug_log(
            "build-selected-patch",
            json!({
                "selectedLineKeyCount": selected_lines.len(),
                "appliedLineCount": applied_line_count,
                "outputLineCount": patch.lines().count(),
                "hunks": debug_hunks,
                "patch": patch,
            }),
        );
    }
    Ok((patch, applied_line_count))
}

async fn apply_cached_patch(repo_root: &Path, patch: &str, reverse: bool) -> Result<(), String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let mut args = vec!["apply", "--cached", "--unidiff-zero", "--whitespace=nowarn"];
    if reverse {
        args.push("--reverse");
    }
    args.push("-");

    let mut child = tokio_command(git_bin)
        .args(args)
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .await
            .map_err(|e| format!("Failed to write git apply input: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        return Err("Git apply failed.".to_string());
    }
    Err(detail.to_string())
}

fn selection_source_from_display_hunk_id(display_hunk_id: &str) -> Result<&str, String> {
    let source = display_hunk_id
        .split(':')
        .next()
        .ok_or_else(|| "Invalid display hunk ID.".to_string())?;
    match source {
        "staged" | "unstaged" => Ok(source),
        _ => Err("Invalid display hunk ID source.".to_string()),
    }
}

fn build_display_hunk_patch(
    diff_patch: &str,
    source: &str,
    display_hunk_id: &str,
    file_context: &SelectionSourceFileContext,
) -> Result<(String, usize), String> {
    let parsed = parse_zero_context_patch(diff_patch)?;
    let Some((hunk_index, hunk)) = parsed
        .hunks
        .iter()
        .enumerate()
        .find(|(_, hunk)| parsed_patch_hunk_id(source, hunk) == display_hunk_id)
    else {
        return Err(
            "Display hunk no longer matches the current diff. Refresh and try again.".to_string(),
        );
    };

    let mut output = parsed.headers.clone();
    append_full_hunk_with_context(
        &mut output,
        &parsed,
        hunk_index,
        &file_context.old_lines,
        &file_context.new_lines,
    );

    let mut patch = output.join("\n");
    if !patch.ends_with('\n') {
        patch.push('\n');
    }

    Ok((patch, hunk.lines.len()))
}

async fn load_selection_source_patch(
    repo_root: &Path,
    action_path: &str,
    source: &str,
    ignore_whitespace_changes: bool,
) -> Result<String, String> {
    let repo = Repository::open(repo_root).map_err(|e| e.to_string())?;
    let status = repo
        .status_file(Path::new(action_path))
        .unwrap_or(Status::empty());
    let is_untracked_worktree_file =
        status.contains(Status::WT_NEW) && !status.contains(Status::INDEX_NEW);

    let mut args = vec!["diff"];
    if source == "unstaged" && is_untracked_worktree_file {
        args.push("--no-index");
        args.push("--no-color");
        args.push("-U0");
        if ignore_whitespace_changes {
            args.push("-w");
        }
        args.push("--");
        args.push(if cfg!(windows) { "NUL" } else { "/dev/null" });
        args.push(action_path);
    } else {
        if source == "staged" {
            args.push("--cached");
        }
        args.push("--no-color");
        args.push("-U0");
        if ignore_whitespace_changes {
            args.push("-w");
        }
        args.push("--");
        args.push(action_path);
    }

    Ok(
        String::from_utf8_lossy(&git_core::run_git_diff(&repo_root.to_path_buf(), &args).await?)
            .to_string(),
    )
}

pub(super) async fn stage_git_selection_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
    op: String,
    source: String,
    lines: Vec<GitSelectionLine>,
) -> Result<GitSelectionApplyResult, String> {
    if lines.is_empty() {
        return Err("No selected lines provided.".to_string());
    }

    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let action_paths = action_paths_for_file(&repo_root, &path);
    if action_paths.len() != 1 {
        return Err("Line-level stage/unstage for renamed paths is not supported yet.".to_string());
    }
    let action_path = action_paths[0].clone();

    let reverse_apply = match (op.as_str(), source.as_str()) {
        ("stage", "unstaged") => false,
        ("unstage", "staged") => true,
        ("stage", "staged") => {
            return Err("Staging selected lines requires source `unstaged`.".to_string());
        }
        ("unstage", "unstaged") => {
            return Err("Unstaging selected lines requires source `staged`.".to_string());
        }
        _ => {
            return Err("Invalid stage selection request. Expected op/source to be stage+unstaged or unstage+staged.".to_string());
        }
    };

    let source_patch =
        load_selection_source_patch(&repo_root, action_path.as_str(), &source, false).await?;
    if source_patch.trim().is_empty() {
        return Err("No changes available for the requested selection source.".to_string());
    }
    let debug_source_hunks = if git_selection_debug_enabled() {
        parse_zero_context_patch(&source_patch).ok().map(|parsed| {
            parsed
                .hunks
                .iter()
                .enumerate()
                .map(|(index, hunk)| {
                    let first = hunk.lines.first();
                    let last = hunk.lines.last();
                    json!({
                        "hunkIndex": index,
                        "lineCount": hunk.lines.len(),
                        "firstOldLine": first.and_then(|line| line.old_line),
                        "firstNewLine": first.and_then(|line| line.new_line),
                        "lastOldLine": last.and_then(|line| line.old_line),
                        "lastNewLine": last.and_then(|line| line.new_line),
                    })
                })
                .collect::<Vec<Value>>()
        })
    } else {
        None
    };

    let mut selected_lines = HashSet::new();
    for line in &lines {
        selected_lines.insert(SelectionLineKey::try_from(line)?);
    }
    if git_selection_debug_enabled() {
        git_selection_debug_log(
            "stage-selection-request",
            json!({
                "workspaceId": workspace_id,
                "path": path,
                "op": op,
                "source": source,
                "rawLineCount": lines.len(),
                "dedupedLineCount": selected_lines.len(),
                "selectedLines": lines,
                "sourceHunks": debug_source_hunks.unwrap_or_default(),
            }),
        );
    }

    let file_context =
        load_selection_source_file_context(&repo_root, action_path.as_str(), &source)?;
    let (selected_patch, applied_line_count) =
        build_selected_patch(&source_patch, &selected_lines, &file_context)?;
    if git_selection_debug_enabled() {
        git_selection_debug_log(
            "stage-selection-apply",
            json!({
                "path": path,
                "reverseApply": reverse_apply,
                "appliedLineCount": applied_line_count,
                "selectedPatchLineCount": selected_patch.lines().count(),
            }),
        );
    }
    apply_cached_patch(&repo_root, &selected_patch, reverse_apply).await?;
    if git_selection_debug_enabled() {
        let cached_after_apply = String::from_utf8_lossy(
            &git_core::run_git_diff(
                &repo_root.to_path_buf(),
                &[
                    "diff",
                    "--cached",
                    "--no-color",
                    "-U0",
                    "--",
                    action_path.as_str(),
                ],
            )
            .await?,
        )
        .to_string();
        let unstaged_after_apply = String::from_utf8_lossy(
            &git_core::run_git_diff(
                &repo_root.to_path_buf(),
                &["diff", "--no-color", "-U0", "--", action_path.as_str()],
            )
            .await?,
        )
        .to_string();
        git_selection_debug_log(
            "stage-selection-post-apply",
            json!({
                "path": path,
                "op": op,
                "source": source,
                "cachedDiff": cached_after_apply,
                "unstagedDiff": unstaged_after_apply,
            }),
        );
    }

    Ok(GitSelectionApplyResult {
        applied: true,
        applied_line_count,
        warning: None,
    })
}

pub(super) async fn apply_git_display_hunk_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    path: String,
    display_hunk_id: String,
    ignore_whitespace_changes: bool,
) -> Result<GitSelectionApplyResult, String> {
    let source = selection_source_from_display_hunk_id(&display_hunk_id)?;
    let op = match source {
        "unstaged" => "stage",
        "staged" => "unstage",
        _ => unreachable!(),
    };

    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let action_paths = action_paths_for_file(&repo_root, &path);
    if action_paths.len() != 1 {
        return Err("Line-level stage/unstage for renamed paths is not supported yet.".to_string());
    }
    let action_path = action_paths[0].clone();

    let reverse_apply = match source {
        "unstaged" => false,
        "staged" => true,
        _ => unreachable!(),
    };

    let source_patch = load_selection_source_patch(
        &repo_root,
        action_path.as_str(),
        source,
        ignore_whitespace_changes,
    )
    .await?;
    if source_patch.trim().is_empty() {
        return Err("No changes available for the requested display hunk.".to_string());
    }

    let file_context =
        load_selection_source_file_context(&repo_root, action_path.as_str(), source)?;
    let (selected_patch, applied_line_count) =
        build_display_hunk_patch(&source_patch, source, &display_hunk_id, &file_context)?;

    if git_selection_debug_enabled() {
        git_selection_debug_log(
            "display-hunk-apply",
            json!({
                "workspaceId": workspace_id,
                "path": path,
                "displayHunkId": display_hunk_id,
                "op": op,
                "source": source,
                "reverseApply": reverse_apply,
                "appliedLineCount": applied_line_count,
            }),
        );
    }

    apply_cached_patch(&repo_root, &selected_patch, reverse_apply).await?;

    Ok(GitSelectionApplyResult {
        applied: true,
        applied_line_count,
        warning: None,
    })
}
