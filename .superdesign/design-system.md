# English Clip · Warm paper design system

## Product and scope

Chinese personal vocabulary notebook, local-first, React + Vite + IndexedDB, self-hosted sync. A quiet tool for recording expressions, finding them again, reviewing them, and practicing speaking with selected words. See docs/DESIGN-BRIEF.md for proposed flows. No streaks, paywalls, leaderboards, reminders, marketing hero or invented achievements.

This system preserves the current identity. User explicitly selected warm, quiet paper with improved density and refinement. First reproduce the existing UI from actual source. In the subsequent redesign, change information architecture and composition, preserving these fonts and colors.

## Fonts

- UI and Chinese: 'IBM Plex Sans', 'PingFang SC', 'Noto Sans SC', sans-serif. Chinese uses system fallback naturally.
- Display/English expression: Fraunces, 'Songti SC', Georgia, serif.
- Use no other font families. Chinese body 14–16px, compact metadata 12–13px, compact English 18–22px, detail expression 28–36px; avoid small tap targets.
- Source CSS controls reproduction sizes exactly; redesign sizes follow the scale above.

## Palette (hard constraints)

- Paper: #f3efe6; sage tint: #e7f0ec; card: rgba(255,252,246,.88).
- Ink: #1c241f; secondary: #5d6b63; rule: #c9d2cb.
- Deep green accent: #0f6a56; on-green: #f4fff9; selected pale green: #dff1ea.
- Warning: #8a4b2a. White/paper-opacity variations are allowed; no purple, blue branding, neon or invented gradient palettes.
- Existing source has subtle green/peach background glows. Reproduction retains them; redesign should use a flatter warm paper surface with restrained sage panels, avoiding large decorative gradients.

## Layout

- Current reproduction: max-width 720px centered single column, full-width capture button, filters, daily cards, stale cards, collapsed recent group, fixed bottom three-tab navigation. Do not insert new AI features into the reproduction.
- Proposed redesign: mobile-first one-column dense collection; desktop 220px left navigation, flexible compact collection, 340px selected-expression detail. No giant empty hero area.
- Desktop list uses calm horizontal rows separated by fine rules. Optional grid uses compact 2–3 columns for words; long sentences receive wider layout. The default is the complete personal collection with latest first.
- Mobile has four bottom tabs: 本子 / 复习 / 开口练 / 设置. Desktop sidebar uses the same labels and a green +记录 action.
- Keep save, playback and practice obvious; move secondary actions into detail/more controls.
- Within 本子 use secondary tabs 词句 / 素材. Preserve the four main navigation items. Materials are a compact library of audio/text with continuing position, not a separate media entertainment app.
- Material detail uses the same paper, fine rules and typography: audio controls, precise A–B loop range, transcript paragraphs and saved excerpts. A selected excerpt can be collected as a word/sentence or opened for shadowing and retelling. No fake audio waveform or real podcast branding.

## Components

- Paper cards with 12–16px corners; primary actions green with off-white text; secondary actions outlined, restrained pill labels.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40px. Detail panel internal 20–24px; compact rows 12–16px vertical.
- Shadow from existing source: 0 10px 30px rgba(28,36,31,.08), used sparingly; prefer rules and surface contrast.
- Visible keyboard focus, at least 44px primary touch targets, readable contrast. Motion 160–240ms and reduced-motion support; card flip only within review, not required for browsing.
- Preserve actual brand logo when a logo position is present. The selected existing public/pwa-192.png asset will be uploaded as the real logo; use its returned HTTPS URL exactly. Original header is text-only and should remain so in reproduction.
- Use simple thin line icons for new actions, never emoji decoration. No new photos, illustrative banners, fabricated audio waveforms claiming real input, or avatars that imply a real tutor.

## Speaking and AI states

- 跟读一句 and 带词对话 begin with selected expressions; never a blank generic chatbot as the main experience.
- Keep chosen expressions visible as compact chips, a clear recording/send control, optional text input, and expandable targeted feedback.
- Mockups use synthetic examples and visibly indicate 示例对话 / 录音演示. No real mic request or network calls in the design.
- Do not invent pronunciation percentages, fluency levels, streaks or completed-session history. Show concrete textual feedback, not fake measurement.
- One concise first-use explanation indicates that online AI receives the selected words, conversation or submitted audio. Local notebook remains usable without AI.
- No backend/API/provider configuration jargon inside normal learning flows; settings can contain model-service configuration later.

## Material demo rules

- Use only fictional sample material with visible 示例音频 / 示例文本 labels. Playback/progress/import/loop controls demonstrate states without uploading or playing a real file.
- Audio and transcript remain linked by a stable synthetic material ID and time ranges; a collected example carries its source back-link.
- On mobile keep the player and key excerpt action usable, wrap controls, and use a clear back action rather than squeezing a desktop split layout.
- Imported audio is eventually stored on NAS separately from code; online transcription is an explicit action for the selected range. No automatic upload of the full material library.
