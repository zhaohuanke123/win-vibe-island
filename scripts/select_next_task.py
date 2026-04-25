#!/usr/bin/env python3
"""Select the next incomplete task from task.json."""

import json
import sys
import argparse


def select_next_task(task_file="task.json"):
    with open(task_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data.get("tasks", [])
    incomplete = [t for t in tasks if not t.get("passes", False)]

    if not incomplete:
        print("All tasks complete!")
        return None

    # Priority order
    priority_order = {"high": 0, "medium": 1, "low": 2}
    incomplete.sort(key=lambda t: priority_order.get(t.get("priority", "medium"), 1))

    task = incomplete[0]
    print(f"Next task: #{task['id']} - {task['title']}")
    print(f"Priority: {task.get('priority', 'medium')}")
    print(f"Steps:")
    for i, step in enumerate(task.get("steps", []), 1):
        print(f"  {i}. {step}")
    return task


def show_status(task_file="task.json"):
    with open(task_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data.get("tasks", [])
    completed = sum(1 for t in tasks if t.get("passes", False))
    total = len(tasks)

    print(f"Project: {data.get('project', 'Unknown')}")
    print(f"Progress: {completed}/{total} tasks complete")
    print()

    for t in tasks:
        status = "PASS" if t.get("passes", False) else "TODO"
        print(f"  [{status}] #{t['id']}: {t['title']} ({t.get('priority', 'medium')})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Task selector for coding workflow")
    parser.add_argument("--task-file", default="task.json", help="Path to task.json")
    parser.add_argument("--status", action="store_true", help="Show status overview")
    args = parser.parse_args()

    if args.status:
        show_status(args.task_file)
    else:
        select_next_task(args.task_file)
