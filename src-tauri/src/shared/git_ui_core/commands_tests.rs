use super::{
    build_selected_patch, gh_repo_create_args, parse_zero_context_patch, validate_branch_name,
    SelectionLineKey, SelectionSourceFileContext,
};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

fn run_git(repo_root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .output()
        .expect("failed to run git");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn run_git_with_stdin(repo_root: &Path, args: &[&str], stdin_text: &str) {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to spawn git");
    child
        .stdin
        .as_mut()
        .expect("missing git stdin")
        .write_all(stdin_text.as_bytes())
        .expect("failed to write git stdin");
    let output = child.wait_with_output().expect("failed to wait for git");
    assert!(
        output.status.success(),
        "git {:?} failed: {}\n{}",
        args,
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
}

fn create_temp_repo() -> PathBuf {
    let unique = format!(
        "codex_monitor_git_select_{}_{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock drift")
            .as_nanos()
    );
    let repo_root = std::env::temp_dir().join(unique);
    fs::create_dir_all(&repo_root).expect("failed to create temp repo");
    run_git(&repo_root, &["init"]);
    run_git(&repo_root, &["config", "user.name", "Codex Monitor Tests"]);
    run_git(
        &repo_root,
        &["config", "user.email", "codex-monitor-tests@example.com"],
    );
    repo_root
}

#[test]
fn validate_branch_name_rejects_repeated_slashes() {
    assert_eq!(
        validate_branch_name("feature//oops"),
        Err("Branch name cannot contain '//'.".to_string())
    );
}

#[test]
fn gh_repo_create_args_include_source_remote_when_origin_missing() {
    assert_eq!(
        gh_repo_create_args("owner/repo", "--private", false),
        vec![
            "repo",
            "create",
            "owner/repo",
            "--private",
            "--source=.",
            "--remote=origin"
        ]
    );
}

#[test]
fn gh_repo_create_args_omit_source_remote_when_origin_exists() {
    assert_eq!(
        gh_repo_create_args("owner/repo", "--public", true),
        vec!["repo", "create", "owner/repo", "--public"]
    );
}

#[test]
fn build_selected_patch_targets_first_identical_addition_hunk() {
    let repo_root = create_temp_repo();
    let file_path = repo_root.join("CardView.swift");

    let baseline = "pre\nanchor-one\nmid\nanchor-two\npost\n";
    fs::write(&file_path, baseline).expect("failed to write baseline");
    run_git(&repo_root, &["add", "--", "CardView.swift"]);
    run_git(&repo_root, &["commit", "-m", "Initial baseline", "--quiet"]);

    let changed = "pre\nanchor-one\n.padding(6)\n.background(Color.black.opacity(0.35), in:\nCircle())\n.shadow(color: .black.opacity(0.35), radius:\n4, x: 0, y: 2)\nmid\nanchor-two\n.padding(6)\n.background(Color.black.opacity(0.35), in:\nCircle())\n.shadow(color: .black.opacity(0.35), radius:\n4, x: 0, y: 2)\npost\n";
    fs::write(&file_path, changed).expect("failed to write changed file");

    let source_patch = run_git(
        &repo_root,
        &["diff", "--no-color", "-U0", "--", "CardView.swift"],
    );
    let parsed = parse_zero_context_patch(&source_patch).expect("failed to parse source patch");
    assert!(
        parsed.hunks.len() >= 2,
        "expected at least two hunks in source patch"
    );

    let first_hunk = &parsed.hunks[0];
    let second_hunk = &parsed.hunks[1];
    let selected_lines: HashSet<SelectionLineKey> = first_hunk
        .lines
        .iter()
        .map(|line| SelectionLineKey {
            line_type: line.line_type,
            old_line: line.old_line,
            new_line: line.new_line,
            text: line.text.clone(),
        })
        .collect();

    let file_context = SelectionSourceFileContext {
        old_lines: baseline.lines().map(ToString::to_string).collect(),
        new_lines: changed.lines().map(ToString::to_string).collect(),
    };
    let (selected_patch, _) = build_selected_patch(&source_patch, &selected_lines, &file_context)
        .expect("selection patch failed");

    let second_header = format!(
        "@@ -{},0 +{},{} @@",
        second_hunk.lines[0].old_anchor,
        second_hunk.lines[0].new_anchor,
        second_hunk.lines.len()
    );
    let first_header = format!(
        "@@ -{},0 +{},{} @@",
        first_hunk.lines[0].old_anchor,
        first_hunk.lines[0].new_anchor,
        first_hunk.lines.len()
    );
    assert!(
        selected_patch.contains(" anchor-one"),
        "selection patch did not include first-hunk context: {selected_patch}"
    );
    assert!(
        selected_patch.contains(" mid"),
        "selection patch did not include trailing context for first hunk: {selected_patch}"
    );
    assert!(
        selected_patch.matches("+.padding(6)").count() == 1,
        "selection patch included duplicate selected additions: {selected_patch}"
    );

    run_git_with_stdin(
        &repo_root,
        &[
            "apply",
            "--cached",
            "--unidiff-zero",
            "--whitespace=nowarn",
            "-",
        ],
        &selected_patch,
    );

    let cached_patch = run_git(
        &repo_root,
        &[
            "diff",
            "--cached",
            "--no-color",
            "-U0",
            "--",
            "CardView.swift",
        ],
    );
    assert!(
        cached_patch.contains(&first_header),
        "cached patch did not stage first hunk: {cached_patch}"
    );
    assert!(
        !cached_patch.contains(&second_header),
        "cached patch staged second hunk unexpectedly: {cached_patch}"
    );

    fs::remove_dir_all(&repo_root).expect("failed to cleanup temp repo");
}

#[test]
fn build_selected_patch_targets_first_identical_swiftui_overlay_hunk() {
    let repo_root = create_temp_repo();
    let file_path = repo_root.join("CardsMediaB25ContentView.swift");

    let baseline = r#"struct CardsMediaB25View: CardsSwiftUIContentViewInitializable {
    func mediaOverlay(for type: OverlayType) {
        if type.contains(.video) {
            Image("video_overlay")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: state.rowWidth * 0.1, height: state.rowWidth * 0.1)
        } else if type.contains(.audio) {
            Image("audio_overlay")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: state.rowWidth * 0.1, height: state.rowWidth * 0.1)
        }
    }
}
"#;
    fs::write(&file_path, baseline).expect("failed to write baseline");
    run_git(&repo_root, &["add", "--", "CardsMediaB25ContentView.swift"]);
    run_git(&repo_root, &["commit", "-m", "Initial baseline", "--quiet"]);

    let changed = r#"struct CardsMediaB25View: CardsSwiftUIContentViewInitializable {
    func mediaOverlay(for type: OverlayType) {
        if type.contains(.video) {
            Image("video_overlay")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: state.rowWidth * 0.1, height: state.rowWidth * 0.1)
                .padding(6)
                .background(Color.black.opacity(0.35), in: Circle())
                .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 2)
        } else if type.contains(.audio) {
            Image("audio_overlay")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: state.rowWidth * 0.1, height: state.rowWidth * 0.1)
                .padding(6)
                .background(Color.black.opacity(0.35), in: Circle())
                .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 2)
        }
    }
}
"#;
    fs::write(&file_path, changed).expect("failed to write changed file");

    let source_patch = run_git(
        &repo_root,
        &[
            "diff",
            "--no-color",
            "-U0",
            "--",
            "CardsMediaB25ContentView.swift",
        ],
    );
    let parsed = parse_zero_context_patch(&source_patch).expect("failed to parse source patch");
    assert_eq!(parsed.hunks.len(), 2, "expected two identical hunks");

    let first_hunk = &parsed.hunks[0];
    let second_hunk = &parsed.hunks[1];
    let selected_lines: HashSet<SelectionLineKey> = first_hunk
        .lines
        .iter()
        .map(|line| SelectionLineKey {
            line_type: line.line_type,
            old_line: line.old_line,
            new_line: line.new_line,
            text: line.text.clone(),
        })
        .collect();

    let file_context = SelectionSourceFileContext {
        old_lines: baseline.lines().map(ToString::to_string).collect(),
        new_lines: changed.lines().map(ToString::to_string).collect(),
    };
    let (selected_patch, _) = build_selected_patch(&source_patch, &selected_lines, &file_context)
        .expect("selection patch failed");
    assert!(
        selected_patch.contains(r#" Image("video_overlay")"#),
        "selection patch did not anchor to the video block: {selected_patch}"
    );
    assert!(
        selected_patch
            .matches("+                .padding(6)")
            .count()
            == 1,
        "selection patch included duplicate selected additions: {selected_patch}"
    );

    run_git_with_stdin(
        &repo_root,
        &[
            "apply",
            "--cached",
            "--unidiff-zero",
            "--whitespace=nowarn",
            "-",
        ],
        &selected_patch,
    );

    let first_header = format!(
        "@@ -{},0 +{},{} @@",
        first_hunk.lines[0].old_anchor,
        first_hunk.lines[0].new_anchor,
        first_hunk.lines.len()
    );
    let second_header = format!(
        "@@ -{},0 +{},{} @@",
        second_hunk.lines[0].old_anchor,
        second_hunk.lines[0].new_anchor,
        second_hunk.lines.len()
    );
    let cached_patch = run_git(
        &repo_root,
        &[
            "diff",
            "--cached",
            "--no-color",
            "-U0",
            "--",
            "CardsMediaB25ContentView.swift",
        ],
    );
    assert!(
        cached_patch.contains(&first_header),
        "cached patch did not stage first SwiftUI hunk: {cached_patch}"
    );
    assert!(
        !cached_patch.contains(&second_header),
        "cached patch staged second SwiftUI hunk unexpectedly: {cached_patch}"
    );

    fs::remove_dir_all(&repo_root).expect("failed to cleanup temp repo");
}

#[test]
fn parse_zero_context_patch_keeps_no_newline_markers() {
    let diff_patch = concat!(
        "diff --git a/example.txt b/example.txt\n",
        "index 1111111..2222222 100644\n",
        "--- a/example.txt\n",
        "+++ b/example.txt\n",
        "@@ -1 +1 @@\n",
        "-before\n",
        "\\ No newline at end of file\n",
        "+after\n",
        "\\ No newline at end of file\n"
    );

    let parsed = parse_zero_context_patch(diff_patch).expect("parse source patch");

    assert_eq!(parsed.hunks.len(), 1);
    assert_eq!(parsed.hunks[0].lines.len(), 2);
    assert!(parsed.hunks[0].lines[0].no_newline_after);
    assert!(parsed.hunks[0].lines[1].no_newline_after);
}

#[test]
fn parse_zero_context_patch_keeps_content_lines_starting_with_patch_header_prefixes() {
    let diff_patch = concat!(
        "diff --git a/example.txt b/example.txt\n",
        "index 1111111..2222222 100644\n",
        "--- a/example.txt\n",
        "+++ b/example.txt\n",
        "@@ -1,2 +1,2 @@\n",
        "----title\n",
        "-plain\n",
        "++++title\n",
        "+plain updated\n"
    );

    let parsed = parse_zero_context_patch(diff_patch).expect("parse source patch");
    let texts: Vec<&str> = parsed.hunks[0]
        .lines
        .iter()
        .map(|line| line.text.as_str())
        .collect();

    assert_eq!(
        texts,
        vec!["---title", "plain", "+++title", "plain updated"]
    );
}

#[test]
fn build_selected_patch_preserves_no_newline_markers_for_apply() {
    let repo_root = create_temp_repo();
    let file_path = repo_root.join("example.txt");

    fs::write(&file_path, "before").expect("write baseline");
    run_git(&repo_root, &["add", "--", "example.txt"]);
    run_git(&repo_root, &["commit", "-m", "Initial baseline", "--quiet"]);

    fs::write(&file_path, "after").expect("write changed file");

    let source_patch = run_git(
        &repo_root,
        &["diff", "--no-color", "-U0", "--", "example.txt"],
    );
    let parsed = parse_zero_context_patch(&source_patch).expect("failed to parse source patch");
    let selected_lines: HashSet<SelectionLineKey> = parsed.hunks[0]
        .lines
        .iter()
        .map(|line| SelectionLineKey {
            line_type: line.line_type,
            old_line: line.old_line,
            new_line: line.new_line,
            text: line.text.clone(),
        })
        .collect();

    let file_context = SelectionSourceFileContext {
        old_lines: vec!["before".to_string()],
        new_lines: vec!["after".to_string()],
    };
    let (selected_patch, _) = build_selected_patch(&source_patch, &selected_lines, &file_context)
        .expect("selection patch failed");

    assert!(
        selected_patch.contains("\\ No newline at end of file"),
        "selection patch should preserve no-newline marker: {selected_patch}"
    );

    run_git_with_stdin(
        &repo_root,
        &[
            "apply",
            "--cached",
            "--unidiff-zero",
            "--whitespace=nowarn",
            "-",
        ],
        &selected_patch,
    );

    let cached_patch = run_git(
        &repo_root,
        &["diff", "--cached", "--no-color", "-U0", "--", "example.txt"],
    );
    assert!(
        cached_patch.contains("+after"),
        "cached patch did not stage newline-less change: {cached_patch}"
    );

    fs::remove_dir_all(&repo_root).expect("failed to cleanup temp repo");
}
