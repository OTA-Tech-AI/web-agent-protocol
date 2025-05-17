I need your help with an analysis to an action in browser and its related changes.
We recorded a user's interactions with his browser for the current task. His ultimate goal is:

{{ ultimate_goal }}

now the user has already finished the task, and the final page content that he submitted to complete task is: 

{{ page_content }}

based on this content, please tell me: do you think this task is really finished?
Provide a concise and formatted instruction in JSON to make another agent to know what to do, you have several options:

1. if the ultimate goal has been achieved by the current action and no more other actions need to be executed or no any information needs to be delivered to the user, only reply a 'done' message, e.g.: {"next_goal": "The ultimate task is done"}

2. if the ultimate goal has been achieved but we need to extract information from the current page content to respond user's demands, reply a content extraction message, e.g.: {"next_goal": "extract the cook time and prepare time from the page content"}

3. if the ultimate goal has NOT been ahieved, please reply a failure message, e,g.: {"next_goal": "GOAL-NOT-ACHIEVED", "reason": "the cook time is longer than expected ..."}