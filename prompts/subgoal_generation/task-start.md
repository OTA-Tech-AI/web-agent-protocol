I need your help with an analysis to an action in browser and its related changes.
We recorded a user's interactions with his browser for the current task. His ultimate goal is:

{{ ultimate_goal }}

The user just started this task, and when he clicked "task start" button, his current page is at:

{{ change_events }}

based on this information, provide a concise and formatted instruction in JSON to make another agent to know which website it needs to go to, e.g.:
{"next_goal": "Open allrecipes.com in a new tab to search for the recipe."}