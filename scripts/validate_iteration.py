#!/usr/bin/env python3
"""Validate a task iteration before commit."""

import json
import sys
import argparse
import os
import subprocess


def run_command(cmd, cwd="."):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
        return result.returncode == 0, result.stdout + result.stderr
    except Exception as e:
        return False, str(e)


def validate(task_id, project_dir="."):
    task_file = os.path.join(project_dir, "task.json")
    progress_file = os.path.join(project_dir, "progress.txt")

    errors = []

    # Check task.json exists
    if not os.path.exists(task_file):
        errors.append("task.json not found")
        return errors

    # Load tasks
    with open(task_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data.get("tasks", [])
    task = next((t for t in tasks if t["id"] == task_id), None)

    if not task:
        errors.append(f"Task #{task_id} not found in task.json")
        return errors

    # Check progress.txt exists and has entry for this task
    if os.path.exists(progress_file):
        with open(progress_file, "r", encoding="utf-8") as f:
            content = f.read()
        if f"Task #{task_id}" not in content:
            errors.append(f"No progress entry found for Task #{task_id}")
    else:
        errors.append("progress.txt not found")

    # Run frontend lint and build
    frontend_dir = os.path.join(project_dir, "frontend")
    if os.path.exists(frontend_dir):
        ok, output = run_command("npm run lint", cwd=frontend_dir)
        if not ok:
            errors.append(f"Frontend lint failed: {output}")

        ok, output = run_command("npm run build", cwd=frontend_dir)
        if not ok:
            errors.append(f"Frontend build failed: {output}")

    # Summary
    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        return errors
    else:
        print(f"VALIDATION PASSED for Task #{task_id}: {task['title']}")
        return []


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate task iteration")
    parser.add_argument("--task-id", type=int, required=True, help="Task ID to validate")
    parser.add_argument("--project-dir", default=".", help="Project root directory")
    args = parser.parse_args()

    errors = validate(args.task_id, args.project_dir)
    sys.exit(1 if errors else 0)
