# Shiro UI fixes — 2026-09-30

## Changes

- Fixed mobile shell rows: navigation stays content-sized rather than stretching to fill a short page.
- Shared PageHeader for workspace, board list, members and board detail. Board settings collapse into Tuỳ chọn board.
- Sidebar uses the actual workspace name; desktop header distinguishes workspace / board; navigation stays active inside board routes.
- Removed decorative sidebar footer and reduced technical copy. Updated Guide and Account to explain cloud persistence and the legacy local board correctly.
- Task dialog focuses title, hides the raw URL unless clipboard copying fails, separates details from discussion and keeps save actions visible while scrolling.
- Unsaved task/comment drafts require explicit discard on closing or navigating; browser reload gets the standard unsaved-change protection.
- Conflicts show server and draft values, with explicit actions to use the current task or retain the draft. Incoming snapshots no longer reset an open task draft.
- Password fields support visibility toggle. Verification resend is behind an explicit help action.
- Member/Viewer permissions are explained before inviting. Migration 004 adds a read-only preview for the verified invitation recipient only; the UI displays workspace, role and expiry before accepting.
- Coarse-pointer controls have at least 44px touch height; editable fields use 16px text on touch devices.

## Validation

- 100 tests passed across 11 files, including real-router draft navigation guards, conflict comparisons and invitation SQL authorization.
- TypeScript and production build passed; formatting and diff checks passed. Existing Zod annotation / bundle size build warnings remain.
- Browser: 390px mobile, 820px iPad and 1440px desktop checked. Workspace header measured 61px instead of 434px; no horizontal overflow in checked layouts.
- Browser: edited task title without saving, verified cancel/discard prompt; entered then cleared an unsent comment and verified the same protection. No task or comment was submitted during these checks.
- Cloud: user applied migration 004. An invalid invitation displays the correct error and disables acceptance. Successful invitation preview and recipient restrictions were verified locally in SQL, not with a second live account.

## Re-review

Approximately 81/100 on the reviewed surfaces: clearer hierarchy, stable mobile layout, explicit draft protection and truthful product copy. Suitable for continued personal/internal MVP use. Full assistive-technology testing, multi-user cloud invitation acceptance and email delivery testing remain outside this UI verification.
