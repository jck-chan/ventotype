// typer — types text as synthetic key events, leaving the clipboard alone.
//
// A key event can carry an arbitrary unicode string instead of a keycode, so
// the transcript goes in directly: no copy, no paste, nothing of the user's
// clipboard disturbed. Needs Accessibility, the same grant the app already
// holds, and is loaded into the main process for the same reason the fn tap is.

import Cocoa

/// UTF-16 units per event. Long strings get truncated by the system, so the
/// text goes out in short runs.
private let chunkSize = 20

/// Between runs, so a receiving app that processes events lazily keeps up.
private let chunkPauseMicroseconds: UInt32 = 500

@_cdecl("type_text")
public func type_text(_ utf8: UnsafePointer<CChar>?) {
    guard let utf8 else { return }
    let units = Array(String(cString: utf8).utf16)
    guard !units.isEmpty else { return }

    let source = CGEventSource(stateID: .hidSystemState)

    for start in stride(from: 0, to: units.count, by: chunkSize) {
        let chunk = Array(units[start ..< min(start + chunkSize, units.count)])
        post(chunk, source)
        if start + chunkSize < units.count { usleep(chunkPauseMicroseconds) }
    }
}

private func post(_ units: [UniChar], _ source: CGEventSource?) {
    guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
          let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
    else { return }

    // Cleared, or a modifier the user is still holding — fn from the shortcut
    // they just pressed, say — would alter what lands in the app.
    down.flags = []
    up.flags = []

    var chars = units
    down.keyboardSetUnicodeString(stringLength: chars.count, unicodeString: &chars)
    up.keyboardSetUnicodeString(stringLength: chars.count, unicodeString: &chars)
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}
