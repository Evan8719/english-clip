# Extractable components

## CurrentNavigation
- Source: src/App.tsx (nav.tabbar), styles src/index.css
- Category: layout
- Description: Fixed bottom navigation shared by all current views. Current labels are 首页 / 词库 / 设置; the new product direction replaces this with 本子 / 复习 / 开口练 / 设置.
- Extractable props: currentTab (string, default home); homeHref (#home), libraryHref (#library), settingsHref (#settings).
- Hardcoded: three labels, markup, CSS, no logo position and no icons.

## EntryCard
- Source: src/components/EntryCard.tsx
- Category: basic
- Description: Shared flip-card presentation for a collected word or phrase.
- Extractable props: isExpanded (boolean, default false).
- Hardcoded: action labels, colors and layout; example word content is synthetic in design.
- Basic card is better rendered inline, not extracted for this first draft.

## CaptureModal
- Source: src/components/CaptureModal.tsx
- Category: basic
- Description: Shared capture/edit form, sources and optional context.
- Extractable props: isExpanded (boolean, default true).
- Hardcoded: field and button labels, typography and styles.
- Keep inline for this round.
