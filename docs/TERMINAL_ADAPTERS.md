# Terminal applications

New Session detects installed terminal emulators before launch. One available app is selected automatically; several apps appear in a compact selector with identifying glyphs. Remember my choice saves a local SQLite preference. Turn it off for a session override. Discovery refreshes on window focus/every 30 seconds and has a manual Rescan button.

Herdr remains the persistence layer inside the selected emulator. Shells (Zsh/Bash/Fish/PowerShell) are not listed as terminal apps. Windows discovery does not remove the existing limitation: Herdr session launching is reviewed on macOS/Linux only. Windows native reviewed launch tickets can use the emulator adapters; the browser's Herdr path remains explicitly unsupported there.

| Platform | Discovery | Reviewed adapters |
|---|---|---|
| macOS | Spotlight bundle IDs, validated Info.plist identity/executable; standard directories as a fallback | Terminal, iTerm2, Ghostty, WezTerm, Kitty, Alacritty |
| Windows | PATH, Get-Command, HKCU/HKLM App Paths, Windows Terminal Appx package metadata | Windows Terminal, WezTerm, Alacritty |
| Linux | Desktop availability and PATH executables, including custom PATH installations | Ghostty, WezTerm, Kitty, Alacritty, GNOME Terminal, Konsole, XTerm |

Unknown interfaces, portable apps outside native registration/PATH, remote UNC executables and headless desktops are not guessed. Apps must have an accessible executable. No broad disk scan, executable download, shell configuration change or generic browser-to-shell endpoint is introduced. macOS iTerm2 uses its AppleScript create-window interface and may require native Automation permission.

An explicitly removed selection blocks before a launcher opens; rescan to choose another. A removed saved default falls back to a remaining detected app. Reopen prefers the original recorded emulator when available, otherwise the current detected default. An open error is not automatically retried in a different app, since that could duplicate a session. Existing one-time/idempotent approvals, private launcher hashes, process configuration and Herdr ownership checks still apply.

Add a reviewed entry to `TERMINAL_ADAPTERS` in `server/control/desktop-terminals.ts`: stable ID, display name/glyph, OS list, native bundle identity/executable names and fixed argument-array builder. No core session-manager changes or imported executable manifests are required. Extend discovery only with bounded native read-only queries. Keep script paths as single arguments and never interpolate browser commands. Add adapter argument, discovery, preference and failure tests.

Validation: native read-only discovery on the development Mac found Terminal, iTerm2 and Ghostty. Automated tests use synthetic executables and desktop-open boundaries; actual GUI windows and every native terminal version were not exercised. Cross-platform CI validates code/fixtures, not installation of every emulator. Upstream references: [Ghostty command configuration](https://ghostty.org/docs/config/reference), [WezTerm start](https://wezterm.org/cli/start.html), [Kitty CLI](https://sw.kovidgoyal.net/kitty/invocation/), [iTerm2 scripting](https://iterm2.com/documentation-scripting.html).
