#!/usr/bin/env python3
"""Plan batches of parallelizable tasks from task.json."""

import json
import sys
import argparse
from pathlib import Path


def load_tasks(task_file: str) -> dict:
    with open(task_file, "r", encoding="utf-8") as f:
        return json.load(f)


def get_completed_ids(tasks: list) -> set:
    return {t["id"] for t in tasks if t.get("passes", False)}


def dependencies_satisfied(task: dict, completed_ids: set) -> bool:
    deps = task.get("dependencies", [])
    return all(d in completed_ids for d in deps)


def check_file_overlap(task1: dict, task2: dict) -> bool:
    """Check if two tasks have overlapping file paths."""
    files1 = set(task1.get("files", []))
    files2 = set(task2.get("files", []))

    for f1 in files1:
        for f2 in files2:
            # Check if paths overlap (one is parent of other or same)
            p1 = Path(f1)
            p2 = Path(f2)
            try:
                p1.relative_to(p2)
                return True
            except ValueError:
                pass
            try:
                p2.relative_to(p1)
                return True
            except ValueError:
                pass
    return False


def check_conflict_groups(task1: dict, task2: dict) -> bool:
    """Check if two tasks share conflict_groups."""
    groups1 = set(task1.get("conflict_groups", []))
    groups2 = set(task2.get("conflict_groups", []))
    return bool(groups1 & groups2)


def can_run_parallel(task1: dict, task2: dict) -> bool:
    """Check if two tasks can run in parallel."""
    if check_conflict_groups(task1, task2):
        return False
    if check_file_overlap(task1, task2):
        return False
    return True


def plan_batches(task_file: str, format: str = "text") -> dict:
    data = load_tasks(task_file)
    tasks = data.get("tasks", [])
    completed_ids = get_completed_ids(tasks)

    # Get ready tasks (dependencies satisfied, not completed)
    ready_tasks = [
        t for t in tasks
        if not t.get("passes", False) and dependencies_satisfied(t, completed_ids)
    ]

    # Sort by priority
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    ready_tasks.sort(key=lambda t: priority_order.get(t.get("priority", "medium"), 2))

    # Group into batches
    batches = []
    remaining = ready_tasks.copy()

    while remaining:
        batch_tasks = []
        batch_indices = []

        for i, task in enumerate(remaining):
            # Check if this task can run with all tasks already in batch
            can_add = all(can_run_parallel(task, bt) for bt in batch_tasks)
            if can_add:
                batch_tasks.append(task)
                batch_indices.append(i)

        # Remove batched tasks from remaining
        for i in reversed(batch_indices):
            remaining.pop(i)

        if batch_tasks:
            batch = {
                "batch_id": len(batches) + 1,
                "parallel_count": len(batch_tasks),
                "tasks": [
                    {
                        "id": t["id"],
                        "title": t["title"],
                        "branch": f"feature/task-{t['id']}",
                        "worktree": f".worktrees/task-{t['id']}",
                        "files": t.get("files", []),
                        "steps": t.get("steps", []),
                    }
                    for t in batch_tasks
                ]
            }
            batches.append(batch)

    result = {
        "project": data.get("project", "Unknown"),
        "total_tasks": len(tasks),
        "completed": len(completed_ids),
        "batches": batches
    }

    if format == "json":
        print(json.dumps(result, indent=2))
    else:
        print(f"Project: {result['project']}")
        print(f"Progress: {result['completed']}/{result['total_tasks']} tasks complete")
        print()
        for batch in batches:
            print(f"Batch {batch['batch_id']}: {batch['parallel_count']} parallel tasks")
            for t in batch['tasks']:
                print(f"  - Task #{t['id']}: {t['title']}")
                print(f"    Branch: {t['branch']}, Worktree: {t['worktree']}")
            print()

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Plan parallelizable task batches")
    parser.add_argument("--task-file", default="task.json", help="Path to task.json")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format")
    args = parser.parse_args()

    plan_batches(args.task_file, args.format)