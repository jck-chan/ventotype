// fn-hook — watches the fn (Globe) key and reports the accelerators it sees.
//
// Built as a dylib and loaded into the app's main process, not spawned as a
// helper: an event tap needs Accessibility, and macOS grants that per program.
// A child process is a different program to TCC and would need its own grant,
// so the tap has to run inside the process the user actually granted.
//
// Electron's globalShortcut can't express fn — macOS hot-keys go through
// Carbon's RegisterEventHotKey, which has no fn modifier — so this fills the gap:
//   fn_hook_start("Fn\nFn+Space")  begin watching, swallowing those accelerators
//   fn_hook_poll()                 next accelerator seen, or null
//   fn_hook_stop()                 stop
//
// Events are queued rather than pushed: the tap runs on its own thread, and
// calling into Node from a foreign thread isn't safe, so the main process drains
// this on a timer instead.

import Cocoa

/// The Globe key's own key press. macOS sends it after a solo fn tap — never
/// when fn was held with something else — and it is what "Press 🌐 to:" acts on.
/// Taking it away is what stops the input source switching under a bound Fn.
private let globeKeyCode: Int64 = 179

private let lock = NSLock()
private var pending: [String] = []
private var bound: Set<String> = []

/// Held between fn's press and its release.
private var fnHeld = false
/// Another key went down while fn was held, so the release isn't a plain tap.
private var fnCombined = false
/// Modifier state as of the last change, to tell a press from a release.
private var lastFlags: CGEventFlags = []

private var eventTap: CFMachPort?
private var tapRunLoop: CFRunLoop?
private let started = DispatchSemaphore(value: 0)

/// Handed back by `fn_hook_poll`, valid until the next call.
private let pollStorage = UnsafeMutablePointer<CChar>.allocate(capacity: 64)

private func emit(_ accelerator: String) {
    lock.lock()
    pending.append(accelerator)
    lock.unlock()
}

/// Accelerator name for a key press, in Electron's vocabulary. Letters, digits
/// and Space only — fn already owns the arrows and the function row on a Mac.
private func keyName(_ event: CGEvent) -> String? {
    guard let scalar = NSEvent(cgEvent: event)?.charactersIgnoringModifiers?.unicodeScalars.first
    else { return nil }
    if scalar == " " { return "Space" }
    return CharacterSet.alphanumerics.contains(scalar) ? String(scalar).uppercased() : nil
}

/// The modifier just pressed, if this flag change was a press rather than a release.
private func pressedModifier(_ flags: CGEventFlags) -> String? {
    let added = flags.subtracting(lastFlags)
    if added.contains(.maskShift) { return "Shift" }
    if added.contains(.maskControl) { return "Control" }
    if added.contains(.maskAlternate) { return "Alt" }
    if added.contains(.maskCommand) { return "Command" }
    return nil
}

private let onEvent: CGEventTapCallBack = { _, type, event, _ in
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
            // Passed through even when bound: fn's flag is how every other fn
            // combination works, and the Globe key press above is the part macOS
            // actually acts on.
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
        // ever decides we were too slow. Without this the tap stays installed
        // but deaf.
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
        return pass

    default:
        return pass
    }
}

/// Starts watching. `swallow` is a newline-separated accelerator list; those are
/// taken from the system, everything else is reported and passed through.
/// Returns 0 when the tap couldn't be created, which means no Accessibility.
@_cdecl("fn_hook_start")
public func fn_hook_start(_ swallow: UnsafePointer<CChar>?) -> Int32 {
    if eventTap != nil { return 1 }

    let list = swallow.map { String(cString: $0) } ?? ""
    bound = Set(list.split(separator: "\n").map(String.init))

    let mask = (1 << CGEventType.flagsChanged.rawValue)
        | (1 << CGEventType.keyDown.rawValue)
        | (1 << CGEventType.keyUp.rawValue)

    // An active tap at the HID level: active so a bound key can be swallowed,
    // and HID so we see the Globe key press before anything acts on it.
    guard let tap = CGEvent.tapCreate(
        tap: .cghidEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: CGEventMask(mask),
        callback: onEvent,
        userInfo: nil
    ) else { return 0 }

    eventTap = tap
    let source = CFMachPortCreateRunLoopSource(nil, tap, 0)

    // Its own thread: the main one belongs to Electron, and a tap that answers
    // late gets switched off by macOS.
    let thread = Thread {
        tapRunLoop = CFRunLoopGetCurrent()
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        started.signal()
        CFRunLoopRun()
    }
    thread.name = "fn-hook"
    thread.start()
    started.wait()
    return 1
}

@_cdecl("fn_hook_stop")
public func fn_hook_stop() {
    guard let tap = eventTap else { return }
    CGEvent.tapEnable(tap: tap, enable: false)
    CFMachPortInvalidate(tap)
    if let runLoop = tapRunLoop { CFRunLoopStop(runLoop) }
    eventTap = nil
    tapRunLoop = nil

    lock.lock()
    pending.removeAll()
    lock.unlock()
}

/// The next accelerator seen, or null when nothing is waiting. The string stays
/// valid until the following call.
@_cdecl("fn_hook_poll")
public func fn_hook_poll() -> UnsafePointer<CChar>? {
    lock.lock()
    let next = pending.isEmpty ? nil : pending.removeFirst()
    lock.unlock()

    guard let next else { return nil }
    _ = next.withCString { strlcpy(pollStorage, $0, 64) }
    return UnsafePointer(pollStorage)
}
