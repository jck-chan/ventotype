// fn-hook — reports fn (Globe) key shortcuts on stdout, one accelerator per line.
//
// Electron's globalShortcut can't see fn at all: macOS hot-keys go through
// Carbon's RegisterEventHotKey, which has no fn modifier. A CGEventTap does see
// it, so VentoType spawns this helper and reads what it prints.
//
// Argv names the accelerators to swallow; it prints "Fn", "Fn+Space", "Fn+Shift"
// as they happen. Every fn press is reported — that is how Settings captures one — but only a
// bound accelerator is swallowed. Swallowing is what stops macOS from also
// switching the input source or opening the emoji picker on the same press;
// unbound keys are left alone so the Mac keeps behaving like a Mac.

import Cocoa

/// Accelerators to swallow, e.g. ["Fn", "Fn+Space"].
let bound = Set(CommandLine.arguments.dropFirst())

/// The Globe key's own key press. macOS sends it after a solo fn tap — never
/// when fn was held with something else — and it is what "Press 🌐 to:" acts on.
/// Taking it away is what stops the input source switching under a bound Fn.
let globeKeyCode: Int64 = 179

/// Held between fn's press and its release.
var fnHeld = false
/// Another key went down while fn was held, so the release isn't a plain tap.
var fnCombined = false
/// Modifier state as of the last change, to tell a press from a release.
var lastFlags: CGEventFlags = []
var eventTap: CFMachPort?

func emit(_ accelerator: String) {
    print(accelerator)
    fflush(stdout)
}

/// Accelerator name for a key press, in Electron's vocabulary. Letters, digits
/// and Space only — fn already owns the arrows and the function row on a Mac.
func keyName(_ event: CGEvent) -> String? {
    guard let scalar = NSEvent(cgEvent: event)?.charactersIgnoringModifiers?.unicodeScalars.first
    else { return nil }
    if scalar == " " { return "Space" }
    return CharacterSet.alphanumerics.contains(scalar) ? String(scalar).uppercased() : nil
}

/// The modifier just pressed, if this flag change was a press rather than a release.
func pressedModifier(_ flags: CGEventFlags) -> String? {
    let added = flags.subtracting(lastFlags)
    if added.contains(.maskShift) { return "Shift" }
    if added.contains(.maskControl) { return "Control" }
    if added.contains(.maskAlternate) { return "Alt" }
    if added.contains(.maskCommand) { return "Command" }
    return nil
}

let onEvent: CGEventTapCallBack = { _, type, event, _ in
    let pass = Unmanaged.passUnretained(event)

    if event.getIntegerValueField(.keyboardEventKeycode) == globeKeyCode {
        return bound.contains("Fn") ? nil : pass
    }

    switch type {
    case .flagsChanged:
        // Tracked by the fn flag itself rather than by keycode: a flags-changed
        // event carries no reliable keycode this early in the pipeline.
        let fnNow = event.flags.contains(.maskSecondaryFn)
        defer { lastFlags = event.flags }

        if fnNow != fnHeld {
            fnHeld = fnNow
            if fnNow { fnCombined = false } else if !fnCombined { emit("Fn") }
            // Passed through even when bound: fn's flag is how every other
            // fn combination works, and the Globe key press above is the part
            // macOS actually acts on.
            return pass
        }

        // A different modifier moved. Pressing one while fn is held is a
        // shortcut of its own, and stops the fn release being a plain tap.
        guard fnHeld, let name = pressedModifier(event.flags) else { return pass }
        fnCombined = true
        emit("Fn+\(name)")
        return bound.contains("Fn+\(name)") ? nil : pass

    case .keyDown where fnHeld:
        // Even a key we can't name cancels the plain-Fn tap: fn+Left is Home,
        // not a request to start dictating.
        fnCombined = true
        guard let name = keyName(event) else { return pass }
        emit("Fn+\(name)")
        return bound.contains("Fn+\(name)") ? nil : pass

    case .keyUp where fnHeld:
        // The matching release, so the app below never sees half a keystroke.
        guard let name = keyName(event), bound.contains("Fn+\(name)") else { return pass }
        return nil

    case .tapDisabledByTimeout:
        // An active tap sits in the input path, so macOS switches it off if it
        // ever decides we were too slow. Without this the helper stays alive
        // but deaf.
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return pass

    default:
        return pass
    }
}

let mask = (1 << CGEventType.flagsChanged.rawValue)
    | (1 << CGEventType.keyDown.rawValue)
    | (1 << CGEventType.keyUp.rawValue)

// An active tap, not a listening one: swallowing a bound key is the whole point.
// That needs Accessibility — which VentoType already holds in order to type — and
// creation simply fails without it, so no separate permission check is needed.
// At the HID level, ahead of everything else — the same place Typeless taps.
guard let tap = CGEvent.tapCreate(
    tap: .cghidEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(mask),
    callback: onEvent,
    userInfo: nil
) else {
    FileHandle.standardError.write(Data("could not create the event tap (accessibility?)\n".utf8))
    exit(1)
}

eventTap = tap
CFRunLoopAddSource(CFRunLoopGetCurrent(), CFMachPortCreateRunLoopSource(nil, tap, 0), .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
