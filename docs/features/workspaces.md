<a id="рабочие-пространства-и-представления"></a>

# Workspaces and views

Workspaces group selected collections for convenient navigation. The switcher lives in the sidebar header, and the selected workspace is saved per user. Collections can be organized into folders and virtual hierarchies.

The current workspace is also part of the URL: `/?workspace=<id>`. Copy the
address to open the same workspace in another tab or share it with a colleague.
`workspace=all` explicitly opens all permitted collections. The URL takes priority
over personal preferences, and browser Back/Forward restores the workspace.
Switching in the menu still saves the personal default. Navigation retains the
workspace alongside table queries and settings tabs. An unavailable workspace
link shows a message and falls back to all permitted collections.

Workspace table views follow the URL context independently between browser tabs.
The table-view list/default APIs accept optional `workspaceId=<id>` or
`workspaceId=all`; omitting it keeps the saved personal context. Reading a link
does not change the personal default or grant additional collection access.

A workspace filters navigation; it does not isolate tenants. Policies determine access. Users see only permitted collections, and hiding a collection from a menu does not prohibit API access or relationships.

<a id="сохраненные-виды"></a>

## Saved views

Table views have personal, collection, or workspace scope. Owners edit personal views; superusers edit shared ones. Definitions are validated against accessible schema and fields. After permission or schema changes, an incompatible view must not expose hidden data.

Default priority is personal → workspace → collection. Each scope/collection supports up to 30 views. Column settings and profile choices use user preferences; arbitrary UI state does not all share a persistence mechanism.

A view filter narrows a query; it does not define row-level security. Editing workspaces themselves requires a superuser.
