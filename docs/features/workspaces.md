<a id="рабочие-пространства-и-представления"></a>

# Workspaces and views

Workspaces group selected collections for convenient navigation. The switcher lives in the sidebar header, and the selected workspace is saved per user. Collections can be organized into folders and virtual hierarchies.

A workspace filters navigation; it does not isolate tenants. Policies determine access. Users see only permitted collections, and hiding a collection from a menu does not prohibit API access or relationships.

<a id="сохраненные-виды"></a>

## Saved views

Table views have personal, collection, or workspace scope. Owners edit personal views; superusers edit shared ones. Definitions are validated against accessible schema and fields. After permission or schema changes, an incompatible view must not expose hidden data.

Default priority is personal → workspace → collection. Each scope/collection supports up to 30 views. Column settings and profile choices use user preferences; arbitrary UI state does not all share a persistence mechanism.

A view filter narrows a query; it does not define row-level security. Editing workspaces themselves requires a superuser.
