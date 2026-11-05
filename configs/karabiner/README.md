# Keyboard modifier map

Three layers can change what a key means here, and only one of them should:
**Karabiner** (`karabiner.json`, in this repo). macOS's per-keyboard Modifier Keys
stay at defaults — those live in `~/Library/Preferences/ByHost`, are not
reproducible from dotfiles, and do not reliably reach applications anyway while
Karabiner's virtual keyboard sits in the event path: Caps Lock → Control is set in
macOS for the NuPhy and the Apple keyboard, and Caps Lock still types capitals.

## Identity — one meaning per physical key, identical on every keyboard

| layout | physical key | emits | why |
| --- | --- | --- | --- |
| Apple | `control` | Command | Windows muscle memory: Control+C copies |
| `fn/globe`, | `option` | Option | Windows Alt is Option |
| `control`, | `command` | Control | the Unix modifier: terminal signals, Herdr's `ctrl-shift-o` |
| `option`, | `fn` / globe | Command | an extra `control`, nothing else |
| `command` | | | |
| others | `control` | Command | Windows muscle memory |
| `control`, | `option` | Option | |
| `option`, `alt` | `alt` | Control | same role as Apple's `command` |
| all | `caps lock` | unchanged | stays Caps Lock |
| all | right-side keys | mirror the left side | |

A chord must behave the same whichever keyboard is attached, so there are no
per-keyboard variants of any rule.

## Combos — only what identity cannot express

Rules are scoped to where they apply rather than to a keyboard:

- terminal-scoped (`dev.herdr.app`, Ghostty, Terminal, iTerm2, WezTerm, Alacritty,
  Hyper, Warp): Command+letter → Control+letter, so Command+C is SIGINT, Command+R
  reverse search, Command+A/E/D/L readline, Command+Tab cycles panes, and
  Command+←/→ plus Command+Backspace get their Option equivalents.
- global: Command+←/→ word navigation and Command+Backspace delete-word.

App switching needs no rule: Control+Tab already emits Command+Tab through identity.

## Known defects

- `Ctrl+Space → Cmd+Space` and `Cmd+Space → Ctrl+Space` are exact inverses, both
  unconditional, left over from two keyboards that disagree. At most one can be right.

## Work

- [x] declare identity once in Karabiner, per-device entries only where hardware differs
- [x] reset macOS Modifier Keys to defaults on every keyboard — they were inert; Karabiner decides
- [ ] reduce the complex rules to one variant per intent
- [ ] verify per keyboard: Control+C copies, Control+Tab switches apps, Control+←
      navigates words, the third key+C signals, `ctrl-shift-o` opens the review

The review chord is pressed with the third key: it is macOS Control that the app
matches, and physical `control` emits Command, so `control`+Shift+O cannot open it.
- [ ] reset macOS Modifier Keys to defaults on every keyboard
- [ ] reduce the complex rules to one variant per intent
- [ ] verify per keyboard: Control+C copies, Control+Tab switches apps, Control+←
      navigates words, the third key+C signals, `ctrl-shift-o` opens the review
