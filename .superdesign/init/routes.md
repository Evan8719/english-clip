# Current routes

There is no client router. `/` mounts src/main.tsx → App.tsx; tab state selects one of these views.

| Tab | Page | Shell | Actual content |
|---|---|---|---|
| home (default) | src/App.tsx | App.tsx | Header, capture button, filters, 今日随手翻 (5), 许久未见 (8), collapsed 最近收录 (12) |
| library | src/components/LibraryView.tsx | App.tsx | Search built-in lexicon and collect a lemma, not personal collection search |
| settings | src/components/SettingsView.tsx | App.tsx | Install instructions, NAS login/sync, categories, export |

CaptureModal creates/edits entries and is mounted once under the shell. New personal-collection workspace, dedicated review and speaking/chat are proposed features, not existing rendered routes.
